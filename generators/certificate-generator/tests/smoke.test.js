const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const APP_DIR = path.resolve(__dirname, '..');

test('projects page lists Bulk Certificate Generator as project 05 after Interview', () => {
  const projects = fs.readFileSync(path.join(ROOT, 'projects.html'), 'utf8');
  const interviewCard = projects.indexOf('projects/interview-practice.html');
  const certCard = projects.indexOf('projects/certificate-generator.html');
  assert.ok(interviewCard > -1, 'Interview card missing on projects.html');
  assert.ok(certCard > interviewCard, 'Certificate card must follow Interview card');
  assert.match(projects, /project-num[^>]*>05</);
  assert.match(projects, /project-media--cert/);
  assert.match(projects, /Bulk Certificate Generator/);

  const detail = fs.readFileSync(path.join(ROOT, 'projects/certificate-generator.html'), 'utf8');
  assert.match(detail, /href="\.\.\/generators\/certificate-generator\/index\.html"/);
  assert.match(detail, /Launch tool/);
});

test('certificate app shell exposes workflow controls and cache-busted scripts', () => {
  const html = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
  for (const id of [
    'stepper',
    'template-input',
    'excel-input',
    'sheet-select',
    'btn-add-field',
    'field-form',
    'field-column',
    'filename-pattern',
    'output-format',
    'btn-generate',
    'results-table',
    'stage',
    'fields-layer',
    'btn-undo',
    'btn-redo',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /css\/style\.css\?v=/);
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts.map((src) => src.split('?')[0]), [
    '../../js/embed.js',
    'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js',
    'js/format.js',
    'js/fields.js',
    'js/excel.js',
    'js/validate.js',
    'js/history.js',
    'js/template.js',
    'js/storage.js',
    'js/generate.js',
    'js/editor.js',
    'js/app.js',
  ]);
  scripts.filter((src) => src.startsWith('js/') || src.startsWith('../../js/') || src.startsWith('css/')).forEach((src) => {
    assert.match(src, /\?v=/, `missing cache bust on ${src}`);
  });
});

test('live server serves certificate project pages and app assets', async (t) => {
  const pages = [
    'http://127.0.0.1:8765/projects.html',
    'http://127.0.0.1:8765/projects/certificate-generator.html',
    'http://127.0.0.1:8765/generators/certificate-generator/index.html',
    'http://127.0.0.1:8765/generators/certificate-generator/js/app.js',
    'http://127.0.0.1:8765/generators/certificate-generator/css/style.css',
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
  const detail = await (await fetch(pages[1])).text();
  assert.match(detail, /generators\/certificate-generator\/index\.html/);
});
