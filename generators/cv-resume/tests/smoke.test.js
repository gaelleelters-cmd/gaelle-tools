const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../../..');
const APP_DIR = path.resolve(__dirname, '..');

function loadLogic() {
  const context = { module: { exports: {} }, exports: {} };
  context.module.exports = context.exports;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(APP_DIR, 'js/logic.js'), 'utf8'),
    context,
    { filename: 'logic.js' },
  );
  return context.module.exports.CvLogic || context.CvLogic;
}

test('projects page lists CV then Interview with launchable detail pages', () => {
  const projects = fs.readFileSync(path.join(ROOT, 'projects.html'), 'utf8');
  const cvCard = projects.indexOf('projects/cv-resume.html');
  const interviewCard = projects.indexOf('projects/interview-practice.html');
  assert.ok(cvCard > -1, 'CV project card missing on projects.html');
  assert.ok(interviewCard > cvCard, 'Interview card must follow CV card');
  assert.match(projects, /project-num[^>]*>03</);
  assert.match(projects, /project-num[^>]*>04</);
  assert.match(projects, /CV \/ Resume Generator/);
  assert.match(projects, /Interview Question Practice/);

  const cvDetail = fs.readFileSync(path.join(ROOT, 'projects/cv-resume.html'), 'utf8');
  const interviewDetail = fs.readFileSync(path.join(ROOT, 'projects/interview-practice.html'), 'utf8');
  assert.match(cvDetail, /href="\.\.\/generators\/cv-resume\/index\.html"/);
  assert.match(interviewDetail, /href="\.\.\/generators\/interview-practice\/index\.html"/);
  assert.match(cvDetail, /Launch tool/);
  assert.match(interviewDetail, /Launch tool/);
});

test('CV app shell exposes builder controls and cache-busted assets', () => {
  const html = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
  for (const id of [
    'step-tabs',
    'full-name',
    'job-title',
    'summary',
    'exp-list',
    'edu-list',
    'skills',
    'job-desc',
    'match-box',
    'cv-preview',
    'btn-print',
    'btn-print-preview',
    'btn-next',
    'btn-back',
    'ats-score',
    'match-score',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /name="template"/);
  assert.match(html, /value="classic"/);
  assert.match(html, /value="modern"/);
  assert.match(html, /css\/style\.css\?v=/);
  assert.match(html, /js\/logic\.js\?v=/);
  assert.match(html, /js\/app\.js\?v=/);
});

test('CV logic extracts vacancy keywords and scores ATS readiness', () => {
  const CvLogic = loadLogic();
  assert.equal(typeof CvLogic.extractKeywords, 'function');
  assert.equal(typeof CvLogic.scoreAts, 'function');
  assert.equal(typeof CvLogic.matchJob, 'function');

  const keywords = CvLogic.extractKeywords(
    'We seek a Communications Officer with media relations, stakeholder engagement, and donor reporting experience.',
  );
  assert.ok(keywords.includes('media relations'));
  assert.ok(keywords.includes('stakeholder engagement'));
  assert.ok(!keywords.includes('the'));

  const weak = CvLogic.scoreAts({
    fullName: '',
    jobTitle: '',
    email: '',
    phone: '',
    location: '',
    summary: '',
    skills: [],
    languages: '',
    exp: [],
    edu: [],
    template: 'classic',
  });
  assert.equal(weak.score, 0);

  const strong = CvLogic.scoreAts({
    fullName: 'Test User',
    jobTitle: 'Communications Officer',
    email: 'test@example.com',
    phone: '+961 00 000 000',
    location: 'Beirut',
    summary: 'Results-driven communications professional who delivers measurable outreach outcomes for partners and donors.',
    skills: ['Media relations', 'Content writing', 'Excel', 'Stakeholder engagement', 'Social media'],
    languages: 'English, Arabic',
    exp: [{
      title: 'Communications Officer',
      company: 'Org',
      bullets: [
        'Grew engagement by 35%',
        'Secured coverage in 8 outlets',
        'Published weekly updates to 5,000 stakeholders',
      ],
    }],
    edu: [{ degree: 'BA', school: 'Example U' }],
    template: 'classic',
  });
  assert.ok(strong.score >= 85, `expected strong ATS score, got ${strong.score}`);

  const match = CvLogic.matchJob(
    'Communications Officer media relations stakeholder engagement crisis communications',
    'test user communications officer media relations excel',
  );
  assert.ok(match.hits.includes('media relations'));
  assert.ok(match.miss.includes('stakeholder engagement') || match.miss.includes('crisis communications'));
  assert.ok(match.percent >= 0 && match.percent <= 100);
});

test('CV app coalesces preview updates instead of binding duplicate save handlers', () => {
  const app = fs.readFileSync(path.join(APP_DIR, 'js/app.js'), 'utf8');
  assert.match(app, /requestAnimationFrame/, 'preview updates should coalesce via rAF');
  assert.match(app, /CvLogic/, 'app should use shared logic module');

  const documentInputBinds = [...app.matchAll(/document\.addEventListener\(\s*['"]input['"]/g)];
  const documentChangeBinds = [...app.matchAll(/document\.addEventListener\(\s*['"]change['"]/g)];
  assert.equal(documentInputBinds.length, 1, 'expected one delegated input listener');
  assert.equal(documentChangeBinds.length, 1, 'expected one delegated change listener');

  // Entry cards and template radios should not also call scheduleSave directly.
  assert.doesNotMatch(
    app,
    /bindEntry[\s\S]*addEventListener\(\s*['"]input['"]\s*,\s*scheduleSave/,
    'entry fields should rely on delegated editor listeners',
  );
});

test('live server serves CV app and project detail launch pages', async (t) => {
  const pages = [
    'http://127.0.0.1:8765/projects.html',
    'http://127.0.0.1:8765/projects/cv-resume.html',
    'http://127.0.0.1:8765/generators/cv-resume/index.html',
    'http://127.0.0.1:8765/generators/cv-resume/js/logic.js',
    'http://127.0.0.1:8765/generators/cv-resume/js/app.js',
  ];
  let first;
  try {
    first = await fetch(pages[0]);
  } catch (err) {
    t.skip('local static server not running on :8765');
    return;
  }
  assert.equal(first.status, 200, pages[0]);
  for (const url of pages.slice(1)) {
    const response = await fetch(url);
    assert.equal(response.status, 200, url);
  }
  const detail = await (await fetch('http://127.0.0.1:8765/projects/cv-resume.html')).text();
  assert.match(detail, /generators\/cv-resume\/index\.html/);
});
