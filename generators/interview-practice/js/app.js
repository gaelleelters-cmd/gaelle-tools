(function attachInterviewApp(globalScope) {
  "use strict";

  const STORAGE_KEY = "gaelle-interview-practice-v1";
  const PAGE_SIZE = 8;
  const Engine = globalScope.InterviewEngine;
  const coreQuestions = Array.isArray(globalScope.INTERVIEW_CORE_QUESTIONS)
    ? globalScope.INTERVIEW_CORE_QUESTIONS
    : [];
  const rolePacks = Array.isArray(globalScope.INTERVIEW_ROLE_PACKS)
    ? globalScope.INTERVIEW_ROLE_PACKS
    : [];
  const answerGuides = Array.isArray(globalScope.INTERVIEW_ANSWER_GUIDES)
    ? globalScope.INTERVIEW_ANSWER_GUIDES
    : [];
  const allQuestions = [
    ...coreQuestions,
    ...rolePacks.flatMap((pack) => Array.isArray(pack.questions) ? pack.questions : []),
  ];
  const questionById = new Map(allQuestions.map((question) => [question.id, question]));

  const defaultState = {
    setup: {
      role: "",
      jobDescription: "",
      level: "mid",
      focus: "mixed",
      length: 10,
    },
    mode: "library",
    favorites: [],
    drafts: {},
    modelAnswers: {},
    history: [],
    guided: null,
    mock: null,
  };

  let state = loadState();
  let libraryPage = 1;
  let matchedFamilies = [];
  let saveTimer = 0;
  let toastTimer = 0;
  let mockTimer = 0;
  let suppressPersistence = false;
  let lastTimerSaveSecond = -1;
  let revealedGuided = { hints: false, model: false };

  const elements = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function titleCase(value) {
    return String(value || "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function mergeState(saved) {
    if (!saved || typeof saved !== "object") return structuredCloneSafe(defaultState);
    const setup = { ...defaultState.setup, ...(saved.setup || {}) };
    return {
      ...structuredCloneSafe(defaultState),
      ...saved,
      setup,
      favorites: safeArray(saved.favorites).filter((id) => questionById.has(id)),
      drafts: saved.drafts && typeof saved.drafts === "object" ? saved.drafts : {},
      modelAnswers: saved.modelAnswers && typeof saved.modelAnswers === "object"
        ? saved.modelAnswers
        : {},
      history: safeArray(saved.history),
      guided: saved.guided && typeof saved.guided === "object" ? saved.guided : null,
      mock: saved.mock && typeof saved.mock === "object"
        ? restoreMock(saved.mock, setup)
        : null,
    };
  }

  function snapshotSetup(setup, families) {
    const source = setup || state.setup;
    const familyRecords = families || matchedFamilies;
    return {
      role: source.role || "",
      jobDescription: source.jobDescription || "",
      level: source.level || "mid",
      focus: source.focus || "mixed",
      length: Number(source.length) || 10,
      families: familyRecords.map((family) => family.id),
      familyNames: familyRecords.map((family) => family.name),
    };
  }

  function restoreMock(mock, setup) {
    const restored = { ...mock };
    restored.elapsedMs = Number(restored.elapsedMs) || (Number(restored.seconds) || 0) * 1000;
    if (restored.status === "active") {
      const runningSince = Number(restored.runningSince);
      if (Number.isFinite(runningSince)) {
        restored.elapsedMs += Math.max(0, Date.now() - runningSince);
      }
      restored.status = "paused";
      restored.runningSince = null;
    }
    restored.seconds = Math.floor(restored.elapsedMs / 1000);
    restored.setupSnapshot = restored.setupSnapshot || snapshotSetup(setup, []);
    return restored;
  }

  function structuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadState() {
    try {
      const raw = globalScope.localStorage && globalScope.localStorage.getItem(STORAGE_KEY);
      return mergeState(raw ? JSON.parse(raw) : null);
    } catch (error) {
      return structuredCloneSafe(defaultState);
    }
  }

  function saveState(options) {
    if (suppressPersistence) return;
    const immediate = options && options.immediate;
    globalScope.clearTimeout(saveTimer);
    const commit = () => {
      try {
        globalScope.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        elements.saveStatus.textContent = "Saved locally";
      } catch (error) {
        elements.saveStatus.textContent = "Could not save";
        announce("Local save is unavailable in this browser.");
      }
    };
    elements.saveStatus.textContent = "Saving…";
    if (immediate) commit();
    else saveTimer = globalScope.setTimeout(commit, 350);
  }

  function announce(message) {
    elements.liveRegion.textContent = "";
    globalScope.setTimeout(() => {
      elements.liveRegion.textContent = message;
    }, 20);
  }

  function showToast(message) {
    globalScope.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = globalScope.setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 2600);
  }

  function cacheElements() {
    elements.saveStatus = byId("save-status");
    elements.liveRegion = byId("live-region");
    elements.toast = byId("toast");
    elements.setupPanel = byId("setup-panel");
    elements.setupToggle = byId("setup-toggle");
    elements.setupForm = byId("setup-form");
    elements.targetRole = byId("target-role");
    elements.jobDescription = byId("job-description");
    elements.experienceLevel = byId("experience-level");
    elements.interviewFocus = byId("interview-focus");
    elements.sessionLength = byId("session-length");
    elements.librarySearch = byId("library-search");
    elements.categoryFilter = byId("category-filter");
    elements.difficultyFilter = byId("difficulty-filter");
    elements.favoritesFilter = byId("favorites-filter");
    elements.libraryList = byId("library-list");
    elements.libraryCount = byId("library-count");
    elements.libraryPagination = byId("library-pagination");
    elements.guidedContent = byId("guided-content");
    elements.mockContent = byId("mock-content");
    elements.mockTimer = byId("mock-timer");
    elements.timerWarning = byId("timer-warning");
    elements.progressContent = byId("progress-content");
    elements.coachContent = byId("coach-content");
    elements.resetDialog = byId("reset-dialog");
  }

  function populateSetup() {
    const suggestions = new Set();
    rolePacks.forEach((pack) => {
      suggestions.add(pack.name);
      safeArray(pack.aliases).forEach((alias) => suggestions.add(titleCase(alias)));
    });
    byId("role-suggestions").innerHTML = [...suggestions]
      .sort((left, right) => left.localeCompare(right))
      .map((suggestion) => `<option value="${escapeHtml(suggestion)}"></option>`)
      .join("");

    const categories = [...new Set(allQuestions.map((question) => question.category))].sort();
    elements.categoryFilter.insertAdjacentHTML(
      "beforeend",
      categories.map((category) =>
        `<option value="${escapeHtml(category)}">${escapeHtml(titleCase(category))}</option>`,
      ).join(""),
    );

    elements.targetRole.value = state.setup.role;
    elements.jobDescription.value = state.setup.jobDescription;
    elements.experienceLevel.value = state.setup.level;
    elements.interviewFocus.value = state.setup.focus;
    elements.sessionLength.value = String(state.setup.length);
    refreshPersonalization();
  }

  function refreshPersonalization() {
    matchedFamilies = Engine.matchRoleFamilies(state.setup.role, rolePacks);
  }

  function activeFamilyIds() {
    return matchedFamilies.map((pack) => pack.id);
  }

  function focusCategories() {
    return state.setup.focus === "mixed" ? [] : [state.setup.focus];
  }

  function createSession(seed) {
    return Engine.generateSession({
      questions: allQuestions,
      roleFamilies: activeFamilyIds(),
      jobDescription: state.setup.jobDescription,
      level: state.setup.level,
      categories: focusCategories(),
      length: state.setup.length,
      seed,
    });
  }

  function switchMode(mode, options) {
    const allowedModes = ["library", "guided", "mock", "progress"];
    if (!allowedModes.includes(mode)) mode = "library";
    state.mode = mode;
    document.querySelectorAll("[data-mode]").forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-view]").forEach((view) => {
      const active = view.dataset.view === mode;
      view.classList.toggle("is-active", active);
      view.hidden = !active;
    });
    renderMode();
    renderCoach();
    if (!options || options.persist !== false) saveState();
    if (options && options.focusPanel) {
      byId(`${mode}-heading`).focus({ preventScroll: true });
    }
    if (!options || options.announce !== false) {
      announce(`${titleCase(mode)} mode selected.`);
    }
  }

  function renderMode() {
    if (state.mode === "library") renderLibrary();
    if (state.mode === "guided") renderGuided();
    if (state.mode === "mock") renderMock();
    if (state.mode === "progress") renderProgress();
  }

  function questionAnswerHtml(question) {
    const modelAnswer = Object.prototype.hasOwnProperty.call(state.modelAnswers, question.id)
      ? state.modelAnswers[question.id]
      : question.modelAnswer;
    return `
      <div class="answer-content">
        <h4>Why interviewers ask this</h4>
        <p>${escapeHtml(question.whyAsked)}</p>
        <h4>Answer plan</h4>
        <ol>${safeArray(question.answerPlan).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
        <h4>Adaptable model answer</h4>
        <label>
          <span class="visually-hidden">Editable model answer for this question</span>
          <textarea class="model-answer-editor" data-model-answer="${escapeHtml(question.id)}">${escapeHtml(modelAnswer)}</textarea>
        </label>
        <div class="model-answer-actions">
          <button class="button button--quiet" type="button" data-reset-model="${escapeHtml(question.id)}">Reset to sample</button>
        </div>
        <p class="truth-note">Use the structure, but replace every detail with a truthful example from your own experience.</p>
        <h4>Likely follow-ups</h4>
        <ul>${safeArray(question.followUps).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>`;
  }

  function compactPageItems(currentPage, totalPages) {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    const sorted = [...pages]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((left, right) => left - right);
    const items = [];
    sorted.forEach((page, index) => {
      if (index > 0 && page - sorted[index - 1] > 1) items.push("ellipsis");
      items.push(page);
    });
    return items;
  }

  function renderLibrary() {
    const filters = {
      search: elements.librarySearch.value,
      category: elements.categoryFilter.value,
      difficulty: elements.difficultyFilter.value,
      level: state.setup.level,
    };
    let questions = Engine.filterQuestions(allQuestions, filters);
    if (elements.favoritesFilter.checked) {
      const favorites = new Set(state.favorites);
      questions = questions.filter((question) => favorites.has(question.id));
    }
    const totalPages = Math.max(1, Math.ceil(questions.length / PAGE_SIZE));
    libraryPage = Math.min(libraryPage, totalPages);
    const visible = questions.slice((libraryPage - 1) * PAGE_SIZE, libraryPage * PAGE_SIZE);
    elements.libraryCount.textContent = `${questions.length} question${questions.length === 1 ? "" : "s"}`;

    elements.libraryList.innerHTML = visible.length
      ? visible.map((question) => {
        const isFavorite = state.favorites.includes(question.id);
        const family = question.families.includes("universal")
          ? "All roles"
          : rolePacks.find((pack) => question.families.includes(pack.id))?.name || "Specialist";
        return `
          <article class="question-card">
            <div class="question-topline">
              <div>
                <div class="question-meta">
                  <span class="tag">${escapeHtml(titleCase(question.category))}</span>
                  <span class="tag tag--gold">${escapeHtml(titleCase(question.difficulty))}</span>
                  <span class="tag">${escapeHtml(family)}</span>
                </div>
                <h3>${escapeHtml(question.question)}</h3>
              </div>
              <button class="favorite-button${isFavorite ? " is-favorite" : ""}" type="button"
                data-favorite="${escapeHtml(question.id)}" aria-pressed="${String(isFavorite)}"
                aria-label="${isFavorite ? "Remove from" : "Add to"} favorites">
                <span aria-hidden="true">${isFavorite ? "★" : "☆"}</span>
              </button>
            </div>
            <p class="question-relevance">${escapeHtml(question.whyAsked)}</p>
            <details class="disclosure">
              <summary>Show answer guidance</summary>
              ${questionAnswerHtml(question)}
            </details>
          </article>`;
      }).join("")
      : `<div class="empty-state"><h3>No questions found</h3><p>Try a broader search or clear one of the filters.</p></div>`;

    const pageItems = compactPageItems(libraryPage, totalPages);
    elements.libraryPagination.innerHTML = totalPages > 1 ? `
      <div class="pagination-desktop">
        <button class="page-button" type="button" data-page="${libraryPage - 1}" aria-label="Previous page" ${libraryPage === 1 ? "disabled" : ""}>← <span class="visually-hidden">Previous</span></button>
        ${pageItems.map((item) => item === "ellipsis"
          ? '<span class="page-ellipsis" aria-hidden="true">…</span>'
          : `<button class="page-button" type="button" data-page="${item}" aria-label="Page ${item}" ${item === libraryPage ? 'aria-current="page"' : ""}>${item}</button>`,
        ).join("")}
        <button class="page-button" type="button" data-page="${libraryPage + 1}" aria-label="Next page" ${libraryPage === totalPages ? "disabled" : ""}><span class="visually-hidden">Next</span> →</button>
      </div>
      <div class="pagination-mobile">
        <button class="page-button page-button--text" type="button" data-page="${libraryPage - 1}" ${libraryPage === 1 ? "disabled" : ""}>← Prev</button>
        <span class="page-indicator" aria-current="page" aria-live="polite">Page ${libraryPage} / ${totalPages}</span>
        <button class="page-button page-button--text" type="button" data-page="${libraryPage + 1}" ${libraryPage === totalPages ? "disabled" : ""}>Next →</button>
      </div>
    ` : "";
  }

  function guideFor(question) {
    return answerGuides.find((guide) => guide.bestFor.includes(question.category)) || answerGuides[0];
  }

  function ensureGuidedSession(forceNew) {
    const validIds = state.guided && safeArray(state.guided.ids).filter((id) => questionById.has(id));
    if (!forceNew && validIds && validIds.length) {
      state.guided.ids = validIds;
      state.guided.index = Math.min(Number(state.guided.index) || 0, validIds.length - 1);
      state.guided.setupSnapshot = state.guided.setupSnapshot || snapshotSetup();
      return;
    }
    const questions = createSession(`guided-${Date.now()}`);
    state.guided = {
      id: `guided-${Date.now()}`,
      ids: questions.map((question) => question.id),
      tailoredPrompts: Object.fromEntries(
        questions.filter((question) => question.tailoredPrompt)
          .map((question) => [question.id, question.tailoredPrompt]),
      ),
      setupSnapshot: snapshotSetup(),
      index: 0,
      startedAt: new Date().toISOString(),
    };
    revealedGuided = { hints: false, model: false };
    saveState();
  }

  function blankDraft() {
    return {
      situation: "",
      task: "",
      action: "",
      result: "",
      draft: "",
      notes: "",
      rating: "",
    };
  }

  function currentGuidedQuestion() {
    if (!state.guided) return null;
    const question = questionById.get(state.guided.ids[state.guided.index]);
    if (!question) return null;
    return {
      ...question,
      tailoredPrompt: state.guided.tailoredPrompts?.[question.id] || "",
    };
  }

  function renderGuided() {
    ensureGuidedSession(false);
    const question = currentGuidedQuestion();
    if (!question) {
      elements.guidedContent.innerHTML = `<div class="empty-state"><h3>No questions available</h3><p>Choose a broader interview focus, then start a new session.</p></div>`;
      return;
    }
    const draft = { ...blankDraft(), ...(state.drafts[question.id] || {}) };
    const guide = guideFor(question);
    const editableModelAnswer = Object.prototype.hasOwnProperty.call(state.modelAnswers, question.id)
      ? state.modelAnswers[question.id]
      : question.modelAnswer;
    const index = state.guided.index;
    const total = state.guided.ids.length;

    elements.guidedContent.innerHTML = `
      <article class="practice-card" data-guided-question="${escapeHtml(question.id)}">
        <div class="practice-progress">
          <span>Question ${index + 1} of ${total}</span>
          <span>${escapeHtml(titleCase(question.category))} · ${escapeHtml(titleCase(question.difficulty))}</span>
        </div>
        <div class="progress-track" aria-label="${index + 1} of ${total} questions">
          <span style="width:${((index + 1) / total) * 100}%"></span>
        </div>
        <h3 class="practice-question">${escapeHtml(question.question)}</h3>
        ${question.tailoredPrompt ? `<p class="tailored-prompt">${escapeHtml(question.tailoredPrompt)}</p>` : ""}
        <div class="guide-strip" aria-label="${escapeHtml(guide.name)} steps">
          ${guide.steps.map((step) => `
            <div class="guide-step"><strong>${escapeHtml(step.label)}</strong><span>${escapeHtml(step.prompt)}</span></div>
          `).join("")}
        </div>
        <div class="star-grid">
          ${["situation", "task", "action", "result"].map((field) => `
            <div class="field star-field">
              <label for="guided-${field}">${escapeHtml(titleCase(field))}</label>
              <textarea id="guided-${field}" data-guided-field="${field}" placeholder="${escapeHtml(guide.steps[["situation", "task", "action", "result"].indexOf(field)]?.prompt || "")}">${escapeHtml(draft[field])}</textarea>
            </div>
          `).join("")}
          <div class="field wide-field">
            <label for="guided-draft">Complete answer draft</label>
            <textarea id="guided-draft" data-guided-field="draft" placeholder="Bring your answer together in your own words…">${escapeHtml(draft.draft)}</textarea>
          </div>
        </div>
        <div class="practice-tools">
          <button class="button button--secondary" type="button" data-guided-reveal="hints" aria-expanded="${revealedGuided.hints}">Show hints</button>
          <button class="button button--quiet" type="button" data-guided-reveal="model" aria-expanded="${revealedGuided.model}">Show model answer</button>
        </div>
        ${revealedGuided.hints ? `
          <div class="reveal-panel"><h4>Answer hints</h4>
            <ol>${question.answerPlan.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
          </div>` : ""}
        ${revealedGuided.model ? `
          <div class="reveal-panel"><h4>Adaptable model answer</h4>
            <label class="visually-hidden" for="guided-model-answer">Editable model answer</label>
            <textarea class="model-answer-editor" id="guided-model-answer" data-model-answer="${escapeHtml(question.id)}">${escapeHtml(editableModelAnswer)}</textarea>
            <div class="model-answer-actions">
              <button class="button button--quiet" type="button" data-reset-model="${escapeHtml(question.id)}">Reset to sample</button>
            </div>
            <p class="truth-note">Treat this as a structure example. Keep your own answer truthful and specific.</p>
          </div>` : ""}
        <fieldset class="rating-group">
          <legend>How strong does this answer feel?</legend>
          <div class="rating-options">
            ${[1, 2, 3, 4, 5].map((rating) => `
              <label><input type="radio" name="guided-rating" data-guided-field="rating" value="${rating}" ${String(draft.rating) === String(rating) ? "checked" : ""}>
                <span>${rating}</span><span class="visually-hidden">${rating} out of 5</span>
              </label>`).join("")}
          </div>
        </fieldset>
        <div class="field wide-field">
          <label for="guided-notes">Private notes</label>
          <textarea id="guided-notes" data-guided-field="notes" rows="3" placeholder="What will you improve next time?">${escapeHtml(draft.notes)}</textarea>
        </div>
        <div class="practice-actions">
          <button class="button button--quiet" type="button" data-guided-action="previous" ${index === 0 ? "disabled" : ""}>Previous</button>
          <button class="button button--primary" type="button" data-guided-action="next">${index === total - 1 ? "Complete session" : "Save & next"}</button>
        </div>
      </article>`;
  }

  function guidedAnswers() {
    return state.guided.ids.map((id) => {
      const question = questionById.get(id);
      const draft = { ...blankDraft(), ...(state.drafts[id] || {}) };
      const combined = draft.draft || [draft.situation, draft.task, draft.action, draft.result].filter(Boolean).join("\n");
      return {
        questionId: id,
        category: question ? question.category : "uncategorized",
        text: combined,
        rating: draft.rating ? Number(draft.rating) : null,
        notes: draft.notes,
      };
    });
  }

  function completeGuidedSession() {
    const sessionSetup = state.guided.setupSnapshot || snapshotSetup();
    state.history.unshift({
      id: state.guided.id,
      type: "guided",
      role: sessionSetup.role,
      families: safeArray(sessionSetup.families),
      familyNames: safeArray(sessionSetup.familyNames),
      level: sessionSetup.level,
      focus: sessionSetup.focus,
      status: "completed",
      startedAt: state.guided.startedAt,
      completedAt: new Date().toISOString(),
      answers: guidedAnswers(),
    });
    state.history = state.history.slice(0, 50);
    showToast("Guided session completed.");
    announce("Guided session completed and progress saved.");
    ensureGuidedSession(true);
  }

  function mockQuestionIds() {
    return state.mock ? safeArray(state.mock.ids).filter((id) => questionById.has(id)) : [];
  }

  function renderMock() {
    updateTimerDisplay();
    if (!state.mock || state.mock.status === "ready" || !mockQuestionIds().length) {
      elements.mockContent.innerHTML = `
        <div class="practice-card mock-intro">
          <div class="mock-intro-icon" aria-hidden="true">◷</div>
          <h3>Ready for a realistic practice run?</h3>
          <p>You will answer ${state.setup.length} tailored questions. Guidance stays hidden until you finish. The timer counts up and can be paused.</p>
          <button class="button button--primary" type="button" data-mock-action="start">Start mock interview</button>
        </div>`;
      return;
    }
    if (state.mock.status === "completed") {
      renderMockReview();
      return;
    }

    const ids = mockQuestionIds();
    state.mock.ids = ids;
    state.mock.index = Math.min(state.mock.index || 0, ids.length - 1);
    const baseQuestion = questionById.get(ids[state.mock.index]);
    const question = {
      ...baseQuestion,
      tailoredPrompt: state.mock.tailoredPrompts?.[baseQuestion.id] || "",
    };
    const answer = state.mock.answers[question.id] || { text: "", notes: "", rating: "" };
    elements.mockContent.innerHTML = `
      <article class="practice-card">
        <div class="practice-progress">
          <span>Question ${state.mock.index + 1} of ${ids.length}</span>
          <span>${escapeHtml(titleCase(question.category))}</span>
        </div>
        <div class="progress-track"><span style="width:${((state.mock.index + 1) / ids.length) * 100}%"></span></div>
        <h3 class="practice-question">${escapeHtml(question.question)}</h3>
        ${question.tailoredPrompt ? `<p class="tailored-prompt">${escapeHtml(question.tailoredPrompt)}</p>` : ""}
        <div class="field wide-field" style="margin-top:22px">
          <label for="mock-answer">Your answer notes</label>
          <textarea id="mock-answer" data-mock-field="text" rows="9" placeholder="Capture key points as you answer aloud…">${escapeHtml(answer.text)}</textarea>
        </div>
        <nav class="mock-nav" aria-label="Mock interview questions">
          ${ids.map((id, index) => {
            const hasAnswer = Boolean(state.mock.answers[id]?.text?.trim());
            return `<button type="button" data-mock-index="${index}" class="${index === state.mock.index ? "is-current " : ""}${hasAnswer ? "has-answer" : ""}" aria-label="Question ${index + 1}${hasAnswer ? ", answered" : ""}" ${index === state.mock.index ? 'aria-current="step"' : ""}>${index + 1}</button>`;
          }).join("")}
        </nav>
        <div class="practice-actions">
          <div class="mock-controls">
            <button class="button button--quiet" type="button" data-mock-action="pause">${state.mock.status === "active" ? "Pause timer" : "Resume timer"}</button>
            <button class="button button--danger" type="button" data-mock-action="finish">Finish & review</button>
          </div>
          <button class="button button--primary" type="button" data-mock-action="next">${state.mock.index === ids.length - 1 ? "Review answers" : "Next question"}</button>
        </div>
      </article>`;
  }

  function startMock() {
    const questions = createSession(`mock-${Date.now()}`);
    if (!questions.length) {
      showToast("No questions match this setup. Try Mixed focus.");
      return;
    }
    state.mock = {
      id: `mock-${Date.now()}`,
      ids: questions.map((question) => question.id),
      tailoredPrompts: Object.fromEntries(
        questions.filter((question) => question.tailoredPrompt)
          .map((question) => [question.id, question.tailoredPrompt]),
      ),
      index: 0,
      answers: {},
      status: "active",
      seconds: 0,
      elapsedMs: 0,
      runningSince: Date.now(),
      warningAnnounced: false,
      setupSnapshot: snapshotSetup(),
      startedAt: new Date().toISOString(),
      recorded: false,
    };
    startTimer();
    saveState();
    renderMock();
    announce("Mock interview started. Timer running.");
  }

  function startTimer() {
    globalScope.clearInterval(mockTimer);
    if (!state.mock || state.mock.status !== "active") return;
    mockTimer = globalScope.setInterval(() => {
      state.mock.seconds = Math.floor(currentMockElapsedMs() / 1000);
      updateTimerDisplay();
      if (state.mock.seconds > 0 && state.mock.seconds % 10 === 0 && state.mock.seconds !== lastTimerSaveSecond) {
        lastTimerSaveSecond = state.mock.seconds;
        saveState();
      }
    }, 1000);
  }

  function currentMockElapsedMs() {
    if (!state.mock) return 0;
    const elapsedMs = Number(state.mock.elapsedMs) || 0;
    if (state.mock.status !== "active") return elapsedMs;
    const runningSince = Number(state.mock.runningSince);
    return elapsedMs + (Number.isFinite(runningSince) ? Math.max(0, Date.now() - runningSince) : 0);
  }

  function pauseMockTimer() {
    if (!state.mock || state.mock.status !== "active") return;
    state.mock.elapsedMs = currentMockElapsedMs();
    state.mock.seconds = Math.floor(state.mock.elapsedMs / 1000);
    state.mock.runningSince = null;
    state.mock.status = "paused";
    globalScope.clearInterval(mockTimer);
  }

  function resumeMockTimer() {
    if (!state.mock || state.mock.status !== "paused") return;
    state.mock.runningSince = Date.now();
    state.mock.status = "active";
    startTimer();
  }

  function updateTimerDisplay() {
    const seconds = state.mock ? Math.floor(currentMockElapsedMs() / 1000) : 0;
    if (state.mock) state.mock.seconds = seconds;
    const minutesPart = String(Math.floor(seconds / 60)).padStart(2, "0");
    const secondsPart = String(seconds % 60).padStart(2, "0");
    elements.mockTimer.textContent = `${minutesPart}:${secondsPart}`;
    const warning = seconds >= 1200;
    elements.mockTimer.classList.toggle("is-warning", warning);
    elements.mockTimer.setAttribute("aria-label", `Mock interview timer, ${minutesPart} minutes ${secondsPart} seconds${warning ? ", time check" : ""}`);
    elements.timerWarning.hidden = !warning;
    if (warning && state.mock && !state.mock.warningAnnounced) {
      state.mock.warningAnnounced = true;
      announce("Time check: twenty minutes have elapsed in this mock interview.");
      saveState();
    }
  }

  function finishMock() {
    if (!state.mock) return;
    if (state.mock.status === "active") pauseMockTimer();
    else globalScope.clearInterval(mockTimer);
    state.mock.status = "completed";
    state.mock.completedAt = new Date().toISOString();
    if (!state.mock.recorded) {
      state.mock.recorded = true;
      state.history.unshift(mockHistoryRecord());
      state.history = state.history.slice(0, 50);
    }
    saveState({ immediate: true });
    renderMock();
    renderCoach();
    announce("Mock interview finished. Review your answers and rate each one.");
  }

  function mockHistoryRecord() {
    const sessionSetup = state.mock.setupSnapshot || snapshotSetup();
    return {
      id: state.mock.id,
      type: "mock",
      role: sessionSetup.role,
      families: safeArray(sessionSetup.families),
      familyNames: safeArray(sessionSetup.familyNames),
      level: sessionSetup.level,
      focus: sessionSetup.focus,
      status: "completed",
      startedAt: state.mock.startedAt,
      completedAt: state.mock.completedAt || new Date().toISOString(),
      durationSeconds: state.mock.seconds,
      answers: state.mock.ids.map((id) => {
        const question = questionById.get(id);
        const answer = state.mock.answers[id] || {};
        return {
          questionId: id,
          category: question ? question.category : "uncategorized",
          text: answer.text || "",
          notes: answer.notes || "",
          rating: answer.rating ? Number(answer.rating) : null,
        };
      }),
    };
  }

  function syncMockHistory() {
    if (!state.mock || !state.mock.recorded) return;
    const index = state.history.findIndex((session) => session.id === state.mock.id);
    if (index >= 0) state.history[index] = mockHistoryRecord();
  }

  function renderMockReview() {
    const ids = mockQuestionIds();
    const rated = ids
      .map((id) => state.mock.answers[id]?.rating)
      .filter((rating) => rating);
    const average = rated.length
      ? (rated.reduce((sum, rating) => sum + Number(rating), 0) / rated.length).toFixed(1)
      : "—";
    const weakCategories = categoryRecommendations(ids);
    elements.mockContent.innerHTML = `
      <div class="progress-section">
        <h3>Interview review</h3>
        <p>You completed ${ids.length} questions in ${formatDuration(state.mock.seconds)}. Average self-rating: <strong id="mock-average">${average}/5</strong>.</p>
        <p><strong>Recommended focus:</strong> <span id="mock-recommendation">${escapeHtml(weakCategories || "Rate your answers below to receive targeted recommendations.")}</span></p>
      </div>
      <div class="review-list" style="margin-top:14px">
        ${ids.map((id, index) => {
          const question = questionById.get(id);
          const answer = state.mock.answers[id] || { text: "", notes: "", rating: "" };
          return `
            <article class="review-card" data-review-id="${escapeHtml(id)}">
              <div class="question-meta"><span class="tag">Question ${index + 1}</span><span class="tag tag--gold">${escapeHtml(titleCase(question.category))}</span></div>
              <h4>${escapeHtml(question.question)}</h4>
              <p><strong>Your answer:</strong> ${escapeHtml(answer.text || "No answer captured.")}</p>
              <details class="disclosure"><summary>Compare with answer guidance</summary>${questionAnswerHtml(question)}</details>
              <fieldset class="rating-group">
                <legend>Self-rating</legend>
                <div class="rating-options">
                  ${[1, 2, 3, 4, 5].map((rating) => `
                    <label><input type="radio" name="mock-rating-${escapeHtml(id)}" data-review-field="rating" value="${rating}" ${String(answer.rating) === String(rating) ? "checked" : ""}>
                      <span>${rating}</span><span class="visually-hidden">${rating} out of 5</span>
                    </label>`).join("")}
                </div>
              </fieldset>
              <div class="field" style="margin-top:13px">
                <label for="review-notes-${escapeHtml(id)}">Improvement notes</label>
                <textarea id="review-notes-${escapeHtml(id)}" data-review-field="notes" rows="2">${escapeHtml(answer.notes || "")}</textarea>
              </div>
            </article>`;
        }).join("")}
      </div>
      <div class="practice-actions">
        <button class="button button--secondary" type="button" data-mock-action="new">Start another mock</button>
        <button class="button button--primary" type="button" data-mock-action="progress">View progress</button>
      </div>`;
  }

  function categoryRecommendations(ids) {
    const ratings = new Map();
    ids.forEach((id) => {
      const question = questionById.get(id);
      const rating = Number(state.mock.answers[id]?.rating);
      if (!question || !rating) return;
      if (!ratings.has(question.category)) ratings.set(question.category, []);
      ratings.get(question.category).push(rating);
    });
    return [...ratings.entries()]
      .map(([category, values]) => ({
        category,
        average: values.reduce((sum, value) => sum + value, 0) / values.length,
      }))
      .sort((left, right) => left.average - right.average)
      .slice(0, 2)
      .map(({ category }) => `${titleCase(category)} answers`)
      .join(" and ");
  }

  function updateMockReviewSummary() {
    const ids = mockQuestionIds();
    const ratings = ids
      .map((id) => Number(state.mock.answers[id]?.rating))
      .filter((rating) => rating >= 1 && rating <= 5);
    const averageElement = byId("mock-average");
    const recommendationElement = byId("mock-recommendation");
    if (averageElement) {
      averageElement.textContent = ratings.length
        ? `${(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)}/5`
        : "—/5";
    }
    if (recommendationElement) {
      recommendationElement.textContent = categoryRecommendations(ids)
        || "Rate your answers below to receive targeted recommendations.";
    }
  }

  function formatDuration(totalSeconds) {
    const minutes = Math.floor((Number(totalSeconds) || 0) / 60);
    const seconds = (Number(totalSeconds) || 0) % 60;
    return `${minutes}m ${seconds}s`;
  }

  function renderProgress() {
    const summary = Engine.summarizeProgress(state.history);
    elements.progressContent.innerHTML = `
      <div class="dashboard-grid">
        <div class="stat-card"><strong>${summary.sessionsCompleted}</strong><span>Sessions completed</span></div>
        <div class="stat-card"><strong>${summary.questionsAnswered}</strong><span>Questions answered</span></div>
        <div class="stat-card"><strong>${summary.questionsRated}</strong><span>Answers rated</span></div>
        <div class="stat-card"><strong>${summary.averageRating || "—"}</strong><span>Average rating / 5</span></div>
      </div>
      <section class="progress-section">
        <h3>Category confidence</h3>
        ${Object.keys(summary.categoryAverages).length
          ? Object.entries(summary.categoryAverages).map(([category, average]) => `
            <div class="category-row">
              <span>${escapeHtml(category)}</span>
              <div class="category-bar" aria-label="${escapeHtml(category)} ${average} out of 5"><span style="width:${average * 20}%"></span></div>
              <strong>${average}</strong>
            </div>`).join("")
          : `<p>No rated answers yet. Complete a guided or mock session, then rate your responses.</p>`}
      </section>
      <section class="progress-section">
        <h3>Recommended next focus</h3>
        ${summary.improvementAreas.length
          ? `<p>Practice <strong>${escapeHtml(titleCase(summary.improvementAreas[0].category))}</strong> questions next. This is currently your lowest-rated category at ${summary.improvementAreas[0].averageRating}/5.</p>`
          : "<p>Ratings will turn into tailored improvement recommendations here.</p>"}
      </section>
      <section class="progress-section">
        <h3>Recent sessions</h3>
        <div class="session-list">
          ${state.history.length ? state.history.slice(0, 8).map((session) => `
            <div class="session-row">
              <div><p><strong>${escapeHtml(titleCase(session.type))} practice</strong></p><small>${escapeHtml(session.role || "General interview")}</small></div>
              <div><p>${safeArray(session.answers).length} questions</p><small>${escapeHtml(formatDate(session.completedAt))}</small></div>
            </div>`).join("") : "<p>No completed sessions yet.</p>"}
        </div>
      </section>`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
    } catch (error) {
      return date.toLocaleDateString();
    }
  }

  function renderCoach() {
    const role = state.setup.role.trim();
    const keywords = Engine.extractKeywords(state.setup.jobDescription).slice(0, 5);
    let modeAdvice = "Search broadly, favorite useful questions, and reveal guidance only after planning your own response.";
    if (state.mode === "guided") {
      const question = currentGuidedQuestion();
      const guide = question ? guideFor(question) : null;
      modeAdvice = guide
        ? `${guide.name}: ${guide.description}`
        : "Choose one specific example and make your individual contribution clear.";
    }
    if (state.mode === "mock") {
      modeAdvice = state.mock?.status === "completed"
        ? "Review low-rated answers first. Write one concrete change you will make before the next session."
        : "Answer aloud before writing notes. Keep context concise and spend most of your time on actions and results.";
    }
    if (state.mode === "progress") {
      modeAdvice = "Treat self-ratings as a trend, not a verdict. Revisit the lowest-rated category with a fresh example.";
    }
    elements.coachContent.innerHTML = `
      <div class="coach-block">
        <h3>Current target</h3>
        <p>${role ? escapeHtml(role) : "Add any target role in setup to tailor your sessions."}</p>
        ${matchedFamilies.length ? `<div>${matchedFamilies.slice(0, 3).map((pack) => `<span class="coach-family">${escapeHtml(pack.name)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="coach-block">
        <h3>Coach note</h3>
        <p>${escapeHtml(modeAdvice)}</p>
      </div>
      ${keywords.length ? `
        <div class="coach-block"><h3>Vacancy signals</h3>
          <ul>${keywords.map((keyword) => `<li>${escapeHtml(titleCase(keyword))}</li>`).join("")}</ul>
        </div>` : ""}
      <div class="coach-block">
        <h3>Strong answer check</h3>
        <ul>
          <li>Is the example truthful and specific?</li>
          <li>Are your decisions and actions visible?</li>
          <li>Does the result show evidence?</li>
          <li>Did you connect it to this role?</li>
        </ul>
      </div>`;
  }

  function updateGuidedField(target) {
    const question = currentGuidedQuestion();
    if (!question) return;
    if (!state.drafts[question.id]) state.drafts[question.id] = blankDraft();
    const field = target.dataset.guidedField;
    state.drafts[question.id][field] = target.type === "radio" ? target.value : target.value;
    saveState();
  }

  function updateMockField(target) {
    if (!state.mock) return;
    const id = state.mock.ids[state.mock.index];
    if (!state.mock.answers[id]) state.mock.answers[id] = { text: "", notes: "", rating: "" };
    state.mock.answers[id][target.dataset.mockField] = target.value;
    saveState();
  }

  function updateReviewField(target) {
    const card = target.closest("[data-review-id]");
    if (!card || !state.mock) return;
    const id = card.dataset.reviewId;
    if (!state.mock.answers[id]) state.mock.answers[id] = { text: "", notes: "", rating: "" };
    state.mock.answers[id][target.dataset.reviewField] = target.value;
    syncMockHistory();
    saveState();
    if (target.dataset.reviewField === "rating") {
      updateMockReviewSummary();
      showToast("Rating saved.");
    }
  }

  function updateModelAnswer(target) {
    const id = target.dataset.modelAnswer;
    if (!questionById.has(id)) return;
    state.modelAnswers[id] = target.value;
    saveState();
  }

  function resetModelAnswer(button) {
    const id = button.dataset.resetModel;
    const question = questionById.get(id);
    if (!question) return;
    delete state.modelAnswers[id];
    const container = button.closest(".answer-content, .reveal-panel");
    const editor = container && container.querySelector(`[data-model-answer="${globalScope.CSS?.escape ? globalScope.CSS.escape(id) : id}"]`);
    if (editor) {
      editor.value = question.modelAnswer;
      editor.focus();
    }
    saveState();
    showToast("Model answer reset to the sample.");
  }

  function handleSetupSubmit(event) {
    event.preventDefault();
    if (state.mock && (state.mock.status === "active" || state.mock.status === "paused")) {
      showToast("Finish the current mock interview before applying a new setup.");
      announce("Setup was not changed. Finish the current mock interview before applying a new setup.");
      switchMode("mock");
      return;
    }
    const formData = new FormData(elements.setupForm);
    state.setup = {
      role: String(formData.get("role") || "").trim(),
      jobDescription: String(formData.get("jobDescription") || "").trim(),
      level: String(formData.get("level") || "mid"),
      focus: String(formData.get("focus") || "mixed"),
      length: Number.parseInt(formData.get("length"), 10) || 10,
    };
    refreshPersonalization();
    state.guided = null;
    state.mock = null;
    libraryPage = 1;
    renderMode();
    renderCoach();
    saveState({ immediate: true });
    showToast(matchedFamilies.length
      ? `Setup applied for ${matchedFamilies[0].name}.`
      : "Setup applied. Custom role accepted.");
  }

  function resetAll() {
    suppressPersistence = true;
    globalScope.clearTimeout(saveTimer);
    globalScope.clearInterval(mockTimer);
    try {
      globalScope.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Continue with a clean in-memory reload when storage is unavailable.
    }
    announce("All interview practice data has been reset.");
    globalScope.setTimeout(() => {
      globalScope.location.reload();
    }, 0);
  }

  function bindEvents() {
    elements.setupForm.addEventListener("submit", handleSetupSubmit);
    elements.setupToggle.addEventListener("click", () => {
      const collapsed = elements.setupPanel.classList.toggle("is-collapsed");
      elements.setupToggle.setAttribute("aria-expanded", String(!collapsed));
      elements.setupToggle.textContent = collapsed ? "Edit setup" : "Hide setup";
      if (!collapsed) elements.targetRole.focus();
    });

    const modeTabs = [...document.querySelectorAll('[role="tab"][data-mode]')];
    modeTabs.forEach((button, index) => {
      button.addEventListener("click", () => switchMode(button.dataset.mode));
      button.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          nextIndex = (index + 1) % modeTabs.length;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          nextIndex = (index - 1 + modeTabs.length) % modeTabs.length;
        }
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = modeTabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        modeTabs[nextIndex].focus();
        switchMode(modeTabs[nextIndex].dataset.mode);
      });
    });

    const tabMedia = typeof globalScope.matchMedia === "function"
      ? globalScope.matchMedia("(max-width: 800px)")
      : { matches: false };
    const updateTabOrientation = () => {
      document.querySelector(".mode-tabs").setAttribute(
        "aria-orientation",
        tabMedia.matches ? "horizontal" : "vertical",
      );
    };
    updateTabOrientation();
    if (typeof tabMedia.addEventListener === "function") {
      tabMedia.addEventListener("change", updateTabOrientation);
    } else if (typeof tabMedia.addListener === "function") {
      tabMedia.addListener(updateTabOrientation);
    }

    document.addEventListener("input", (event) => {
      if (event.target.matches("[data-model-answer]")) updateModelAnswer(event.target);
    });
    document.addEventListener("click", (event) => {
      const resetModelButton = event.target.closest("[data-reset-model]");
      if (resetModelButton) resetModelAnswer(resetModelButton);
    });

    byId("library-filters").addEventListener("input", () => {
      libraryPage = 1;
      renderLibrary();
    });
    elements.libraryList.addEventListener("click", (event) => {
      const favoriteButton = event.target.closest("[data-favorite]");
      if (!favoriteButton) return;
      const id = favoriteButton.dataset.favorite;
      if (state.favorites.includes(id)) {
        state.favorites = state.favorites.filter((favoriteId) => favoriteId !== id);
        showToast("Removed from favorites.");
      } else {
        state.favorites.push(id);
        showToast("Added to favorites.");
      }
      renderLibrary();
      saveState();
    });
    elements.libraryPagination.addEventListener("click", (event) => {
      const pageButton = event.target.closest("[data-page]");
      if (!pageButton || pageButton.disabled) return;
      libraryPage = Number(pageButton.dataset.page);
      renderLibrary();
      byId("library-heading").scrollIntoView({ block: "start" });
    });

    byId("new-guided-session").addEventListener("click", () => {
      ensureGuidedSession(true);
      renderGuided();
      renderCoach();
      announce("New guided practice session started.");
    });
    elements.guidedContent.addEventListener("input", (event) => {
      if (event.target.matches("[data-guided-field]")) updateGuidedField(event.target);
    });
    elements.guidedContent.addEventListener("change", (event) => {
      if (event.target.matches("[data-guided-field]")) updateGuidedField(event.target);
    });
    elements.guidedContent.addEventListener("click", (event) => {
      const reveal = event.target.closest("[data-guided-reveal]");
      if (reveal) {
        const key = reveal.dataset.guidedReveal;
        revealedGuided[key] = !revealedGuided[key];
        renderGuided();
        announce(`${titleCase(key)} ${revealedGuided[key] ? "shown" : "hidden"}.`);
        return;
      }
      const actionButton = event.target.closest("[data-guided-action]");
      if (!actionButton) return;
      if (actionButton.dataset.guidedAction === "previous") {
        state.guided.index = Math.max(0, state.guided.index - 1);
      } else if (state.guided.index < state.guided.ids.length - 1) {
        state.guided.index += 1;
      } else {
        completeGuidedSession();
      }
      revealedGuided = { hints: false, model: false };
      saveState();
      renderGuided();
      renderCoach();
      announce(`Guided question ${state.guided.index + 1} of ${state.guided.ids.length}.`);
    });

    elements.mockContent.addEventListener("input", (event) => {
      if (event.target.matches("[data-mock-field]")) updateMockField(event.target);
      if (event.target.matches("[data-review-field]")) updateReviewField(event.target);
    });
    elements.mockContent.addEventListener("click", (event) => {
      const indexButton = event.target.closest("[data-mock-index]");
      if (indexButton) {
        state.mock.index = Number(indexButton.dataset.mockIndex);
        saveState();
        renderMock();
        announce(`Mock question ${state.mock.index + 1}.`);
        return;
      }
      const actionButton = event.target.closest("[data-mock-action]");
      if (!actionButton) return;
      const action = actionButton.dataset.mockAction;
      if (action === "start") startMock();
      if (action === "pause") {
        if (state.mock.status === "active") pauseMockTimer();
        else resumeMockTimer();
        saveState({ immediate: true });
        renderMock();
        announce(state.mock.status === "active" ? "Timer resumed." : "Timer paused.");
      }
      if (action === "next") {
        if (state.mock.index < state.mock.ids.length - 1) {
          state.mock.index += 1;
          saveState();
          renderMock();
        } else {
          finishMock();
        }
      }
      if (action === "finish") finishMock();
      if (action === "new") {
        state.mock = null;
        saveState();
        renderMock();
      }
      if (action === "progress") switchMode("progress");
    });

    byId("reset-button").addEventListener("click", () => {
      if (typeof elements.resetDialog.showModal === "function") {
        elements.resetDialog.showModal();
      } else if (globalScope.confirm("Reset all interview practice progress?")) {
        resetAll();
      }
    });
    byId("confirm-reset").addEventListener("click", resetAll);

    globalScope.addEventListener("beforeunload", () => {
      if (state.mock && state.mock.status === "active") pauseMockTimer();
      saveState({ immediate: true });
    });
  }

  function init() {
    cacheElements();
    if (!Engine || !allQuestions.length || !answerGuides.length) {
      byId("main-content").innerHTML = `
        <div class="empty-state"><h2>Practice content could not load</h2><p>Refresh the page or check that all local scripts are available.</p></div>`;
      return;
    }
    populateSetup();
    bindEvents();
    switchMode(state.mode, { announce: false, persist: false });
    updateTimerDisplay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
