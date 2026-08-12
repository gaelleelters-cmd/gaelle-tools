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

test('projects page lists Interview Question Practice as project 04 after CV', () => {
  const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(home, /href="projects\.html"/);
  assert.match(home, /about-brand/);
  assert.match(home, /Gaelle El Ters/);
  assert.doesNotMatch(home, /about-stats/);
  assert.doesNotMatch(home, />About</);

  const projects = fs.readFileSync(path.join(ROOT, 'projects.html'), 'utf8');
  const cvCard = projects.indexOf('projects/cv-resume.html');
  const interviewCard = projects.indexOf('projects/interview-practice.html');
  assert.ok(cvCard > -1, 'CV card missing on projects.html');
  assert.ok(interviewCard > cvCard, 'Interview card must follow CV card');
  assert.match(projects, /project-num[^>]*>04</);
  assert.match(projects, /project-media--interview/);
  assert.match(projects, /Interview Question Practice/);
  assert.doesNotMatch(projects, />About</);

  const detail = fs.readFileSync(path.join(ROOT, 'projects/interview-practice.html'), 'utf8');
  assert.match(detail, /href="\.\.\/generators\/interview-practice\/index\.html"/);
  assert.match(detail, /Launch tool/);
});

test('interview app shell exposes required controls and cache-busted script order', () => {
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

  assert.match(html, /css\/style\.css\?v=/);
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts.map((src) => src.split('?')[0]), [
    '../../js/embed.js',
    'data/core-questions.js',
    'data/role-packs.js',
    'data/answer-guides.js',
    'js/engine.js',
    'js/app.js',
  ]);
  for (const src of scripts) {
    assert.match(src, /\?v=/, `missing cache bust on ${src}`);
  }
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

test('live server serves projects page, detail launch, and interview app', async (t) => {
  let projects;
  try {
    projects = await fetch('http://127.0.0.1:8765/projects.html');
  } catch (err) {
    t.skip('local static server not running on :8765');
    return;
  }
  const detail = await fetch('http://127.0.0.1:8765/projects/interview-practice.html');
  const app = await fetch('http://127.0.0.1:8765/generators/interview-practice/index.html');
  const css = await fetch('http://127.0.0.1:8765/generators/interview-practice/css/style.css');
  const js = await fetch('http://127.0.0.1:8765/generators/interview-practice/js/app.js');
  assert.equal(projects.status, 200);
  assert.equal(detail.status, 200);
  assert.equal(app.status, 200);
  assert.equal(css.status, 200);
  assert.equal(js.status, 200);
  const projectsText = await projects.text();
  const detailText = await detail.text();
  assert.match(projectsText, /Interview Question Practice/);
  assert.match(detailText, /generators\/interview-practice\/index\.html/);
});
