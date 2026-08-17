const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_DIR = path.resolve(__dirname, '..');

function loadModules() {
  const context = { console, module: { exports: {} }, exports: {} };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  ['format.js', 'fields.js', 'excel.js', 'validate.js', 'history.js'].forEach((file) => {
    vm.runInContext(
      fs.readFileSync(path.join(APP_DIR, 'js', file), 'utf8'),
      context,
      { filename: file },
    );
  });
  return context.CertGen;
}

test('formats dates, currency and filenames without mixing Excel serials into text IDs', () => {
  const G = loadModules();
  const date = G.Format.parseDate('17/08/2026');
  assert.ok(date);
  assert.equal(G.Format.formatDate(date, 'DD MMMM YYYY'), '17 August 2026');
  assert.equal(G.Format.formatDate('11/08/2026', 'YYYY-MM-DD'), '2026-08-11');
  assert.equal(G.Format.formatDate('2026-08-12', 'MMMM DD, YYYY'), 'August 12, 2026');

  const serial = G.Format.excelSerialToDate(43831);
  assert.equal(G.Format.formatDate(serial, 'YYYY-MM-DD'), '2020-01-01');
  assert.equal(G.Format.formatDate(43831, 'DD MMMM YYYY'), '1 January 2020');

  assert.equal(G.Format.formatCurrency(1000, { currency: 'USD', decimals: 0 }), '$1,000');
  assert.equal(G.Format.formatCurrency(1000, { currency: 'AED', decimals: 0 }), '1,000 AED');
  assert.equal(G.Format.stringifyValue(45521), '45521');

  const row = { Name: 'John Smith', ID: '001', Date: '10/08/2026' };
  assert.equal(
    G.Format.applyFilenamePattern('Certificate_{ID}_{Name}', row),
    'Certificate_001_John_Smith',
  );
  assert.equal(G.Format.sanitizeFilename('Sarah James / Certificate'), 'Sarah_James_Certificate');

  const used = Object.create(null);
  assert.equal(G.Format.uniqueFilename('John_Smith_Certificate', 'pdf', used), 'John_Smith_Certificate.pdf');
  assert.equal(G.Format.uniqueFilename('John_Smith_Certificate', 'pdf', used), 'John_Smith_Certificate_2.pdf');
});

test('maps each Excel row independently and never swaps values between rows', () => {
  const G = loadModules();
  const fields = [
    G.Fields.createField({ label: 'Recipient Name', excelColumn: 'Name', type: 'text' }),
    G.Fields.createField({ label: 'Completion Date', excelColumn: 'Date', type: 'date', dateFormat: 'DD MMMM YYYY' }),
    G.Fields.createField({ label: 'Course Name', excelColumn: 'Course', type: 'text' }),
    G.Fields.createField({ label: 'Certificate Number', excelColumn: 'ID', type: 'id' }),
  ];
  const rows = [
    { Name: 'John Smith', Date: '10/08/2026', Course: 'Leadership Training', ID: '001', __excelRow: 2 },
    { Name: 'Sarah James', Date: '11/08/2026', Course: 'Leadership Training', ID: '002', __excelRow: 3 },
    { Name: 'Michael Brown', Date: '12/08/2026', Course: 'Leadership Training', ID: '003', __excelRow: 4 },
  ];

  const rendered = rows.map((row) => fields.map((field) => (
    G.Format.formatFieldValue(G.Format.lookupRow(row, field.excelColumn), field)
  )));

  assert.deepEqual(rendered[0], ['John Smith', '10 August 2026', 'Leadership Training', '001']);
  assert.deepEqual(rendered[1], ['Sarah James', '11 August 2026', 'Leadership Training', '002']);
  assert.deepEqual(rendered[2], ['Michael Brown', '12 August 2026', 'Leadership Training', '003']);
  assert.equal(rendered.length, rows.length);
});

test('validates missing required values and invalid dates without assuming unmapped dates should change', () => {
  const G = loadModules();
  const fields = [
    G.Fields.createField({ label: 'Recipient Name', excelColumn: 'Name', type: 'text', required: true }),
    G.Fields.createField({ label: 'Completion Date', excelColumn: 'Certificate Date', type: 'date', required: true }),
  ];
  const columns = ['Name', 'Certificate Date', 'Issue Date'];
  const rows = [
    { Name: 'John Smith', 'Certificate Date': '10/08/2026', 'Issue Date': '01/01/2026', __excelRow: 2 },
    { Name: '', 'Certificate Date': '11/08/2026', 'Issue Date': '01/01/2026', __excelRow: 3 },
    { Name: 'Sarah James', 'Certificate Date': 'not-a-date', 'Issue Date': '01/01/2026', __excelRow: 4 },
    { Name: '', 'Certificate Date': '', 'Issue Date': '', __excelRow: 5 },
  ];

  const report = G.Validate.validate(rows, columns, fields);
  assert.equal(report.detected, 4);
  assert.equal(report.validCount, 1);
  assert.equal(report.invalidCount, 2);
  assert.equal(report.emptySkipped, 1);
  assert.match(report.invalid[0].message, /Row 3 is missing "Name"/);
  assert.match(report.invalid[1].message, /Date value is invalid/);
  assert.equal(report.valid[0].row.Name, 'John Smith');
});

test('undo and redo restore field positions', () => {
  const G = loadModules();
  const history = G.History.create(10);
  const a = [G.Fields.createField({ label: 'Name', x: 20, y: 40 })];
  const b = G.Fields.cloneFields(a);
  b[0].x = 35;
  history.reset(a);
  history.push(b);
  const undone = history.undo();
  assert.equal(undone[0].x, 20);
  const redone = history.redo();
  assert.equal(redone[0].x, 35);
});

test('duplicate Excel headers stay usable as distinct columns', () => {
  const G = loadModules();
  assert.deepEqual(
    G.Excel.uniqueHeaders(['Name', 'Name', 'Date']),
    ['Name', 'Name_2', 'Date'],
  );
});
