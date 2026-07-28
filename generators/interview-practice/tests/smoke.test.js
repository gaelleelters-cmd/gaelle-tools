const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../../..');
const APP_DIR = path.resolve(__dirname, '..');

function loadScript(filePath, context) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, context, { filename: filePath });
}

function createBrowserLikeContext() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    CSS: { escape: (value) => String(value).replace(/"/g, '\\"') },
    window: {},
    document: {
      readyState: 'complete',
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getElementById() { return null; },
    },
    localStorage: {
      store: Object.create(null),
      getItem(key) { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null; },
      setItem(key, value) { this.store[key] = String(value); },
      removeItem(key) { delete this.store[key]; },
    },
    matchMedia() {
      return { matches: false, addEventListener() {}, removeEventListener() {} };
    },
  };
  context.globalThis = context;
  context.window = context;
  return vm.createContext(context);
}

test('homepage lists Interview Question Practice as project 04 after CV', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const cvIndex = html.indexOf('generators/cv-resume/index.html');
  const interviewIndex = html.indexOf('generators/interview-practice/index.html');
  assert.ok(cvIndex > -1, 'CV card missing');
  assert.ok(interviewIndex > cvIndex, 'Interview card must follow CV card');
  assert.match(html, /project-num[^>]*>04</);
  assert.match(html, /data-label="Interview Question Practice"/);
  assert.match(html, /project-media--interview/);
  assert.match(html, /data-count="4"/);
});

test('interview app shell exposes required controls and script order', () => {
  const html = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
  for (const id of [
    'setup-form',
    'target-role',
    'job-description',
    'experience-level',
    'interview-focus',
    'session-length',
    'library-list',
    'library-pagination',
    'guided-content',
    'mock-content',
    'progress-content',
    'coach-content',
    'reset-dialog',
    'confirm-reset',
    'toast',
    'live-region',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts, [
    '../../js/embed.js',
    'data/core-questions.js',
    'data/role-packs.js',
    'data/answer-guides.js',
    'js/engine.js',
    'js/app.js',
  ]);
});

test('data and engine load together and generate a tailored senior session', () => {
  const context = createBrowserLikeContext();
  loadScript(path.join(APP_DIR, 'data/core-questions.js'), context);
  loadScript(path.join(APP_DIR, 'data/role-packs.js'), context);
  loadScript(path.join(APP_DIR, 'data/answer-guides.js'), context);
  loadScript(path.join(APP_DIR, 'js/engine.js'), context);

  assert.ok(Array.isArray(context.INTERVIEW_CORE_QUESTIONS));
  assert.ok(Array.isArray(context.INTERVIEW_ROLE_PACKS));
  assert.ok(Array.isArray(context.INTERVIEW_ANSWER_GUIDES));
  assert.equal(typeof context.InterviewEngine.generateSession, 'function');

  const families = context.InterviewEngine.matchRoleFamilies(
    'Protection Officer',
    context.INTERVIEW_ROLE_PACKS
  );
  assert.ok(families.some((match) => match.id === 'ngo-un'));

  const questions = [
    ...context.INTERVIEW_CORE_QUESTIONS,
    ...context.INTERVIEW_ROLE_PACKS.flatMap((pack) => pack.questions || []),
  ];
  assert.ok(questions.length >= 180);

  const session = context.InterviewEngine.generateSession({
    questions,
    level: 'senior',
    length: 10,
    jobDescription: 'Conduct RSD interviews, assess credibility, draft protection recommendations, and coordinate with partners.',
    seed: 'smoke-rsd',
  });

  assert.equal(session.length, 10);
  assert.equal(new Set(session.map((item) => item.id)).size, 10);
  assert.ok(session.every((item) => item.question && item.modelAnswer));
});

test('live server serves homepage and interview app', async () => {
  const home = await fetch('http://127.0.0.1:8765/index.html');
  const app = await fetch('http://127.0.0.1:8765/generators/interview-practice/index.html');
  const css = await fetch('http://127.0.0.1:8765/generators/interview-practice/css/style.css');
  const js = await fetch('http://127.0.0.1:8765/generators/interview-practice/js/app.js');
  assert.equal(home.status, 200);
  assert.equal(app.status, 200);
  assert.equal(css.status, 200);
  assert.equal(js.status, 200);
  const homeText = await home.text();
  assert.match(homeText, /Interview Question Practice/);
});
