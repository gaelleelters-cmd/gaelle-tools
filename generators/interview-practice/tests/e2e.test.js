const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../..");
const BASE_URL = "http://127.0.0.1:8765";
const APP_URL = `${BASE_URL}/generators/interview-practice/index.html`;
const HOME_URL = `${BASE_URL}/index.html`;
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const STORAGE_KEY = "gaelle-interview-practice-v1";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(check, description, timeout = 10000, interval = 100) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  const suffix = lastError ? `: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${description}${suffix}`);
}

async function serverAvailable() {
  try {
    const response = await fetch(APP_URL, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverAvailable()) return null;

  const child = spawn("python", ["-m", "http.server", "8765", "--bind", "127.0.0.1"], {
    cwd: ROOT,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => {});

  await waitFor(async () => {
    if (child.exitCode !== null) {
      throw new Error(`python http.server exited with code ${child.exitCode}`);
    }
    return serverAvailable();
  }, "local HTTP server", 12000, 200);

  return child;
}

async function reserveFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

class CdpConnection {
  constructor(webSocket) {
    this.webSocket = webSocket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();

    webSocket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(`${message.error.message} (${message.error.code})`));
        } else {
          pending.resolve(message.result || {});
        }
        return;
      }

      const callbacks = this.listeners.get(message.method);
      if (callbacks) callbacks.forEach((callback) => callback(message.params || {}, message.sessionId));
    });

    webSocket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("Chrome DevTools WebSocket closed"));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      this.webSocket.send(JSON.stringify(message));
    });
  }

  on(method, callback) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(callback);
    return () => this.listeners.get(method)?.delete(callback);
  }

  once(method, sessionId, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        remove();
        reject(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeout);
      const remove = this.on(method, (params, eventSessionId) => {
        if (sessionId && eventSessionId !== sessionId) return;
        clearTimeout(timer);
        remove();
        resolve(params);
      });
    });
  }
}

async function launchChrome() {
  const userDataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "interview-e2e-"));
  const port = await reserveFreePort();
  const child = spawn(CHROME_PATH, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-gpu",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let spawnError;
  let chromeStderr = "";
  child.on("error", (error) => {
    spawnError = error;
  });
  child.stderr.on("data", (chunk) => {
    chromeStderr = (chromeStderr + chunk.toString()).slice(-4000);
  });

  try {
    const version = await waitFor(async () => {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Chrome exited with code ${child.exitCode}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        return response.ok ? response.json() : false;
      } catch (error) {
        const detail = chromeStderr.trim() ? `; Chrome stderr: ${chromeStderr.trim()}` : "";
        throw new Error(`${error.message}${detail}`);
      }
    }, "Chrome /json/version", 10000, 100);

    assert.match(version.Browser, /Chrome/i);
    assert.ok(version.webSocketDebuggerUrl, "/json/version must expose a WebSocket URL");

    const webSocket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out opening DevTools WebSocket")), 10000);
      webSocket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      webSocket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Failed to open DevTools WebSocket"));
      }, { once: true });
    });

    const cdp = new CdpConnection(webSocket);
    const { targetInfos } = await cdp.send("Target.getTargets");
    const pageTarget = targetInfos.find((target) => target.type === "page");
    assert.ok(pageTarget, "Chrome must have a page target");
    const { sessionId } = await cdp.send("Target.attachToTarget", {
      targetId: pageTarget.targetId,
      flatten: true,
    });

    return { child, cdp, sessionId, userDataDir, webSocket };
  } catch (error) {
    await stopProcess(child);
    await fs.promises.rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
    throw error;
  }
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(3000),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

test("Interview Practice browser workflows", { timeout: 120000 }, async (t) => {
  let server;
  let browser;

  try {
    server = await ensureServer();
    browser = await launchChrome();
    const { cdp, sessionId } = browser;
    const javascriptErrors = [];

    cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }, eventSessionId) => {
      if (eventSessionId !== sessionId) return;
      javascriptErrors.push(
        exceptionDetails.exception?.description
          || exceptionDetails.text
          || "Unknown uncaught exception",
      );
    });
    cdp.on("Log.entryAdded", ({ entry }, eventSessionId) => {
      if (eventSessionId !== sessionId) return;
      if (entry.level === "error" && entry.source === "javascript") {
        javascriptErrors.push(entry.text);
      }
    });

    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Log.enable", {}, sessionId);

    const evaluate = async (expression) => {
      const result = await cdp.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      }, sessionId);
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description
            || result.exceptionDetails.text
            || "Runtime.evaluate failed",
        );
      }
      return result.result.value;
    };

    const condition = (expression, description, timeout = 10000) =>
      waitFor(() => evaluate(expression), description, timeout, 100);

    const navigate = async (url) => {
      const loaded = cdp.once("Page.loadEventFired", sessionId);
      await cdp.send("Page.navigate", { url }, sessionId);
      await loaded;
      await condition("document.readyState === 'complete'", `${url} document ready`);
    };

    const reload = async () => {
      const loaded = cdp.once("Page.loadEventFired", sessionId);
      await cdp.send("Page.reload", { ignoreCache: true }, sessionId);
      await loaded;
      await condition("document.readyState === 'complete'", "page reload");
    };

    const setValue = (selector, value, eventName = "input") => evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error("Missing element: " + ${JSON.stringify(selector)});
      element.value = ${JSON.stringify(value)};
      element.dispatchEvent(new Event(${JSON.stringify(eventName)}, { bubbles: true }));
      return element.value;
    })()`);

    await t.test("direct app loads without JavaScript errors", async () => {
      await navigate(APP_URL);
      await evaluate(`localStorage.removeItem(${JSON.stringify(STORAGE_KEY)})`);
      await reload();
      await condition(
        "document.querySelectorAll('#library-list .question-card').length > 0",
        "initial question library",
      );
      await sleep(500);
      assert.equal(await evaluate("document.title"), "Interview Practice Studio");
      assert.deepEqual(javascriptErrors, []);
    });

    let favoriteId;
    let modelQuestionId;
    const editedModelAnswer = "E2E customized model answer with measurable evidence.";

    await t.test("custom setup applies and library search/filter/favorite work", async () => {
      await setValue("#target-role", "Chief Telescope Alignment Specialist");
      await setValue(
        "#job-description",
        "Lead observatory incident response, stakeholder engagement, and technical risk analysis.",
      );
      await setValue("#experience-level", "senior", "change");
      await setValue("#interview-focus", "technical", "change");
      await setValue("#session-length", "5", "change");
      await evaluate("document.querySelector('#setup-form').requestSubmit()");

      await condition(
        `JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).setup.role === "Chief Telescope Alignment Specialist"`,
        "custom setup persistence",
      );
      const setup = await evaluate(
        `JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).setup`,
      );
      assert.deepEqual(setup, {
        role: "Chief Telescope Alignment Specialist",
        jobDescription: "Lead observatory incident response, stakeholder engagement, and technical risk analysis.",
        level: "senior",
        focus: "technical",
        length: 5,
      });
      assert.ok(
        await evaluate("document.querySelectorAll('#library-list .question-card').length > 0"),
        "library should render results after applying setup",
      );

      const first = await evaluate(`(() => {
        const card = document.querySelector("#library-list .question-card");
        return {
          question: card.querySelector("h3").textContent.trim(),
          category: card.querySelector(".tag").textContent.trim().toLowerCase(),
          difficulty: card.querySelector(".tag--gold").textContent.trim().toLowerCase(),
        };
      })()`);
      const searchTerm = first.question.split(/\s+/).find((word) => word.length >= 5)
        .replace(/[^\p{L}\p{N}-]/gu, "");
      await setValue("#library-search", searchTerm);
      await setValue("#category-filter", first.category, "input");
      await setValue("#difficulty-filter", first.difficulty, "input");
      const filtered = await condition(`(() => {
        const cards = [...document.querySelectorAll("#library-list .question-card")];
        return cards.length && cards.every((card) =>
          card.querySelector("h3").textContent.toLowerCase().includes(${JSON.stringify(searchTerm.toLowerCase())})
          && card.querySelector(".tag").textContent.trim().toLowerCase() === ${JSON.stringify(first.category)}
          && card.querySelector(".tag--gold").textContent.trim().toLowerCase() === ${JSON.stringify(first.difficulty)}
        ) && cards.length;
      })()`, "combined search and filters");
      assert.ok(filtered > 0);

      await setValue("#library-search", "");
      await setValue("#category-filter", "", "input");
      await setValue("#difficulty-filter", "", "input");
      favoriteId = await evaluate(`(() => {
        const button = document.querySelector("[data-favorite]");
        const id = button.dataset.favorite;
        button.click();
        return id;
      })()`);
      await condition(
        `JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).favorites.includes(${JSON.stringify(favoriteId)})`,
        "favorite persistence",
      );
      await evaluate(`(() => {
        const checkbox = document.querySelector("#favorites-filter");
        checkbox.click();
      })()`);
      await condition(
        `document.querySelectorAll("#library-list .question-card").length === 1
          && document.querySelector("[data-favorite]").dataset.favorite === ${JSON.stringify(favoriteId)}`,
        "favorites-only filter",
      );
      await evaluate("document.querySelector('#favorites-filter').click()");
    });

    await t.test("answer guidance reveals and model answer edits persist", async () => {
      modelQuestionId = await evaluate(`(() => {
        const card = document.querySelector("#library-list .question-card");
        card.querySelector("summary").click();
        return card.querySelector("[data-model-answer]").dataset.modelAnswer;
      })()`);
      await setValue(`[data-model-answer="${modelQuestionId}"]`, editedModelAnswer);
      await condition(
        `JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).modelAnswers[${JSON.stringify(modelQuestionId)}] === ${JSON.stringify(editedModelAnswer)}`,
        "edited model answer persistence",
      );
      assert.equal(
        await evaluate(`document.querySelector('[data-model-answer="${modelQuestionId}"]').value`),
        editedModelAnswer,
      );
    });

    await t.test("guided mode saves STAR draft, rating, and advances", async () => {
      await evaluate("document.querySelector('#guided-tab').click()");
      await condition(
        "document.querySelector('[data-guided-question]') !== null",
        "guided practice question",
      );
      const guidedId = await evaluate(
        "document.querySelector('[data-guided-question]').dataset.guidedQuestion",
      );
      await setValue("#guided-situation", "A production service failed during a critical delivery.");
      await setValue("#guided-task", "I owned diagnosis and stakeholder communication.");
      await setValue("#guided-action", "I isolated the fault, coordinated recovery, and documented controls.");
      await setValue("#guided-result", "Service recovered in 20 minutes with no data loss.");
      await setValue("#guided-draft", "A complete STAR answer captured by the E2E test.");
      await evaluate("document.querySelector('[name=\"guided-rating\"][value=\"4\"]').click()");
      await evaluate("document.querySelector('[data-guided-reveal=\"hints\"]').click()");
      assert.ok(await evaluate(
        "document.querySelector('#guided-content .reveal-panel')?.textContent.includes('Answer hints')",
      ));
      await evaluate("document.querySelector('[data-guided-action=\"next\"]').click()");
      await condition(
        "document.querySelector('.practice-progress span').textContent.startsWith('Question 2 of')",
        "guided next question",
      );
      const draft = await evaluate(
        `JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).drafts[${JSON.stringify(guidedId)}]`,
      );
      assert.equal(draft.rating, "4");
      assert.match(draft.draft, /complete STAR answer/);
      assert.match(draft.situation, /production service failed/);
    });

    await t.test("mock timer, controls, navigation, finish, and review work", async () => {
      await evaluate("document.querySelector('#mock-tab').click()");
      await condition(
        "document.querySelector('[data-mock-action=\"start\"]') !== null",
        "mock start control",
      );
      await evaluate("document.querySelector('[data-mock-action=\"start\"]').click()");
      await condition(
        "document.querySelector('#mock-content [data-mock-field=\"text\"]') !== null",
        "active mock interview",
      );
      await condition(
        "document.querySelector('#mock-timer').textContent !== '00:00'",
        "running mock timer",
        5000,
      );

      await evaluate("document.querySelector('[data-mock-action=\"pause\"]').click()");
      const pausedTimer = await evaluate("document.querySelector('#mock-timer').textContent");
      const pausedState = await evaluate(
        `JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).mock.status`,
      );
      assert.equal(pausedState, "paused");
      await sleep(1200);
      assert.equal(await evaluate("document.querySelector('#mock-timer').textContent"), pausedTimer);

      await evaluate("document.querySelector('[data-mock-action=\"pause\"]').click()");
      await condition(
        `document.querySelector("#mock-timer").textContent !== ${JSON.stringify(pausedTimer)}`,
        "resumed mock timer",
        5000,
      );
      assert.equal(
        await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).mock.status`),
        "active",
      );

      await setValue("#mock-answer", "Mock answer one captured by E2E.");
      await evaluate("document.querySelector('[data-mock-action=\"next\"]').click()");
      await condition(
        "document.querySelector('.practice-progress span').textContent.startsWith('Question 2 of')",
        "mock next question",
      );
      await evaluate("document.querySelector('[data-mock-index=\"0\"]').click()");
      await condition(
        "document.querySelector('#mock-answer').value.includes('Mock answer one')",
        "mock direct navigation preserving answer",
      );
      await evaluate("document.querySelector('[data-mock-action=\"finish\"]').click()");
      await condition(
        "document.querySelector('#mock-content')?.textContent.includes('Interview review')",
        "mock interview review",
      );
      assert.equal(
        await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).mock.status`),
        "completed",
      );
      assert.ok(
        await evaluate("document.querySelectorAll('[data-review-id]').length > 0"),
        "review should contain completed mock questions",
      );
    });

    await t.test("local state survives a page reload", async () => {
      await condition(
        `document.querySelector("#save-status").textContent === "Saved locally"`,
        "pending local save",
      );
      await reload();
      await condition(
        "document.querySelector('#mock-content')?.textContent.includes('Interview review')",
        "restored mock review",
      );
      const persisted = await evaluate(`(() => {
        const state = JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}));
        return {
          role: document.querySelector("#target-role").value,
          level: document.querySelector("#experience-level").value,
          focus: document.querySelector("#interview-focus").value,
          favorite: state.favorites.includes(${JSON.stringify(favoriteId)}),
          modelAnswer: state.modelAnswers[${JSON.stringify(modelQuestionId)}],
          hasDraft: Object.values(state.drafts).some((draft) => draft.draft?.includes("complete STAR answer")),
          mockStatus: state.mock?.status,
          historyTypes: state.history.map((entry) => entry.type),
        };
      })()`);
      assert.deepEqual(persisted, {
        role: "Chief Telescope Alignment Specialist",
        level: "senior",
        focus: "technical",
        favorite: true,
        modelAnswer: editedModelAnswer,
        hasDraft: true,
        mockStatus: "completed",
        historyTypes: ["mock"],
      });
      assert.deepEqual(javascriptErrors, []);
    });

    await t.test("reset dialog opens without deleting state", async () => {
      const before = await evaluate(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`);
      await evaluate("document.querySelector('#reset-button').click()");
      assert.equal(await evaluate("document.querySelector('#reset-dialog').open"), true);
      assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`), before);
      await evaluate("document.querySelector('#reset-dialog [value=\"cancel\"]').click()");
      await condition(
        "!document.querySelector('#reset-dialog').open",
        "reset dialog cancellation",
      );
      assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`), before);
    });

    await t.test("320px viewport has no overflow and mobile controls are accessible", async () => {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 320,
        height: 800,
        deviceScaleFactor: 1,
        mobile: true,
      }, sessionId);
      await reload();
      const mobile = await evaluate(`(() => {
        const controls = [...document.querySelectorAll(".mode-tabs .mode-button, #reset-button")];
        return {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          orientation: document.querySelector(".mode-tabs").getAttribute("aria-orientation"),
          controls: controls.map((control) => {
            const rect = control.getBoundingClientRect();
            const style = getComputedStyle(control);
            return {
              id: control.id,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
              visible: style.display !== "none" && style.visibility !== "hidden",
            };
          }),
        };
      })()`);
      assert.equal(mobile.clientWidth, 320);
      assert.ok(
        mobile.scrollWidth <= mobile.clientWidth,
        `horizontal overflow: scrollWidth ${mobile.scrollWidth}, clientWidth ${mobile.clientWidth}`,
      );
      assert.equal(mobile.orientation, "horizontal");
      assert.equal(mobile.controls.length, 5);
      mobile.controls.forEach((control) => {
        assert.ok(control.visible, `${control.id} should be rendered`);
        assert.ok(control.width > 0 && control.height >= 44, `${control.id} should have a usable target`);
        assert.ok(control.left >= 0 && control.right <= 320, `${control.id} should fit horizontally`);
        assert.ok(control.top >= 0 && control.bottom <= 800, `${control.id} should be in the viewport`);
      });
      await evaluate("document.querySelector('#library-tab').click()");
      assert.equal(
        await evaluate("document.querySelector('#library-tab').getAttribute('aria-selected')"),
        "true",
      );
      await evaluate("document.querySelector('#reset-button').click()");
      assert.equal(await evaluate("document.querySelector('#reset-dialog').open"), true);
      await evaluate("document.querySelector('#reset-dialog [value=\"cancel\"]').click()");
    });

    await t.test("homepage card 04 opens the Interview Practice workspace iframe", async () => {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      }, sessionId);
      await navigate(HOME_URL);
      const card = await evaluate(`(() => {
        const candidate = [...document.querySelectorAll(".project-card")]
          .find((item) => item.querySelector(".project-num")?.textContent.trim() === "04");
        return candidate && {
          src: candidate.getAttribute("data-src"),
          label: candidate.getAttribute("data-label"),
          number: candidate.querySelector(".project-num").textContent.trim(),
        };
      })()`);
      assert.deepEqual(card, {
        src: "generators/interview-practice/index.html",
        label: "Interview Question Practice",
        number: "04",
      });
      await evaluate(`(() => {
        const card = [...document.querySelectorAll(".project-card")]
          .find((item) => item.querySelector(".project-num")?.textContent.trim() === "04");
        card.click();
      })()`);
      await condition(
        `document.querySelector("#workspace").getAttribute("aria-hidden") === "false"
          && document.querySelector("#app-frame").getAttribute("src")
            === "generators/interview-practice/index.html?embed=1"`,
        "Interview Practice workspace iframe",
      );
      await condition(
        `document.querySelector("#app-frame").contentDocument?.title === "Interview Practice Studio"`,
        "Interview Practice iframe content",
      );
      assert.equal(
        await evaluate("document.querySelector('#open-new').getAttribute('href')"),
        "generators/interview-practice/index.html",
      );
    });
  } finally {
    if (browser) {
      try {
        await browser.cdp.send("Browser.close");
      } catch {
        // The browser may already be gone after a test failure.
      }
      await stopProcess(browser.child);
      try {
        browser.webSocket.close();
      } catch {
        // Ignore an already-closed socket.
      }
      await fs.promises.rm(browser.userDataDir, { recursive: true, force: true, maxRetries: 3 });
    }
    await stopProcess(server);
  }
});
