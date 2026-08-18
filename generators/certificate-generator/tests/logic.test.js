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
  ['format.js', 'fields.js', 'excel.js', 'validate.js', 'history.js', 'reference.js', 'template.js', 'generate.js'].forEach((file) => {
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

test('copies reference styling and capitalization onto generated values', () => {
  const G = loadModules();
  const hit = {
    id: 'hit_0',
    text: 'JOHN SMITH',
    x: 35,
    y: 40,
    width: 30,
    height: 4,
    fontSize: 34,
    fontFamily: 'Times New Roman',
    fontWeight: 'bold',
    fontStyle: 'normal',
    textColor: '#123456',
    alignment: 'center',
    capitalization: 'upper',
    rotation: 0,
  };
  const field = G.Reference.fieldFromHit(hit, {
    columns: ['Name', 'Date'],
    template: { heightPx: 1000 },
    reference: { heightPx: 1000 },
  });
  assert.equal(field.excelColumn, 'Name');
  assert.equal(field.styleSource, 'reference');
  assert.equal(field.fontFamily, 'Times New Roman');
  assert.equal(field.fontSize, 34);
  assert.equal(field.fontWeight, 'bold');
  assert.equal(field.textColor, '#123456');
  assert.equal(field.alignment, 'center');
  assert.equal(field.capitalization, 'upper');
  assert.equal(field.referenceText, 'JOHN SMITH');
  const center = field.x + field.width / 2;
  assert.ok(Math.abs(center - 50) < 0.2, 'expanded box should keep the reference center');
  assert.ok(field.width > hit.width, 'field area should be wider than the example name');

  assert.equal(
    G.Format.formatFieldValue('Sarah James', field),
    'SARAH JAMES',
  );
  assert.equal(G.Reference.applyCapitalization('Ahmad Hassan', 'upper'), 'AHMAD HASSAN');
  assert.equal(G.Reference.detectCapitalization('John Smith'), 'title');
  assert.equal(G.Reference.detectCapitalization('15 August 2026'), 'title');
});

test('merges split PDF words and maps only the selected date', () => {
  const G = loadModules();
  const merged = G.Reference.mergeLineItems([
    { id: 'a', text: 'John', x: 40, y: 42, width: 8, height: 3, fontSize: 28, fontFamily: 'Georgia', fontWeight: 'bold', fontStyle: 'normal', textColor: '#111' },
    { id: 'b', text: 'Smith', x: 49, y: 42, width: 10, height: 3, fontSize: 28, fontFamily: 'Georgia', fontWeight: 'bold', fontStyle: 'normal', textColor: '#111' },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, 'John Smith');

  const completion = G.Reference.fieldFromHit({
    id: 'hit_date',
    text: '15 August 2026',
    x: 40,
    y: 55,
    width: 20,
    height: 3,
    fontSize: 16,
    fontFamily: 'Georgia',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textColor: '#222',
    alignment: 'center',
    capitalization: 'title',
  }, { columns: ['Name', 'Date', 'Issue Date'] });
  assert.equal(completion.type, 'date');
  assert.equal(completion.excelColumn, 'Date');
  assert.equal(completion.dateFormat, 'DD MMMM YYYY');
  assert.notEqual(completion.excelColumn, 'Issue Date');
});

test('handles the Ambassador of Hope spreadsheet: lowercase columns, typos, month-year output', () => {
  const G = loadModules();
  const columns = ['name', 'date'];
  const rows = [
    { name: 'Gaelle el ters', date: '20 augusyt', __excelRow: 2 },
    { name: 'Joelle el feghaly', date: '21 augusyt', __excelRow: 3 },
  ];

  const nameField = G.Reference.fieldFromHit({
    id: 'hit_name',
    text: 'Rosemary Fernandes',
    x: 22,
    y: 36,
    width: 56,
    height: 7,
    fontSize: 64,
    fontFamily: 'Great Vibes',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textColor: '#ffffff',
    alignment: 'center',
    capitalization: 'title',
  }, { columns: columns, template: { heightPx: 1920 }, reference: { heightPx: 1920 } });
  const dateField = G.Reference.fieldFromHit({
    id: 'hit_date',
    text: 'August 2026',
    x: 40,
    y: 88,
    width: 20,
    height: 3,
    fontSize: 18,
    fontFamily: 'Arial',
    fontWeight: 'bold',
    fontStyle: 'normal',
    textColor: '#ffffff',
    alignment: 'center',
    capitalization: 'title',
  }, { columns: columns, template: { heightPx: 1920 }, reference: { heightPx: 1920 } });

  assert.equal(nameField.excelColumn, 'name');
  assert.equal(nameField.fontFamily, 'Great Vibes');
  assert.equal(nameField.textColor, '#ffffff');
  assert.equal(dateField.excelColumn, 'date');
  assert.equal(dateField.type, 'date');
  assert.equal(dateField.dateFormat, 'MMMM YYYY');

  assert.ok(G.Format.parseDate('20 augusyt'));
  assert.ok(G.Format.parseDate('August 2026'));
  assert.equal(G.Format.formatDate('20 augusyt', 'MMMM YYYY'), 'August 2026');
  assert.equal(G.Format.formatDate('21 augusyt', 'MMMM YYYY'), 'August 2026');
  assert.equal(G.Format.formatFieldValue('Gaelle el ters', nameField), 'Gaelle El Ters');
  assert.equal(G.Format.formatFieldValue('Joelle el feghaly', nameField), 'Joelle El Feghaly');
  assert.equal(G.Format.formatFieldValue('20 augusyt', dateField), 'August 2026');

  const report = G.Validate.validate(rows, columns, [nameField, dateField]);
  assert.equal(report.validCount, 2);
  assert.equal(report.invalidCount, 0);
  assert.equal(report.valid[0].row.name, 'Gaelle el ters');
  assert.equal(report.valid[1].row.name, 'Joelle el feghaly');

  const pixels = [];
  const width = 8;
  const height = 4;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const ink = y > 0 && y < height - 1 && x > 1 && x < width - 1;
      if (ink) pixels.push(252, 252, 255, 255);
      else pixels.push(18, 28, 58, 255);
    }
  }
  const hex = G.Reference.sampleTextColorFromData(Uint8ClampedArray.from(pixels), width);
  assert.match(hex, /^#[c-f][0-9a-f]{5}$/i);
});

test('pastes tab-separated Excel cells and can cover example text like Canva Bulk Create', () => {
  const G = loadModules();
  const workbook = G.Excel.parseTableText('name\tdate\nGaelle el ters\t20 augusyt\nJoelle el feghaly\t21 augusyt');
  const sheet = G.Excel.getSheet(workbook);
  assert.equal(sheet.columns.join('|'), 'name|date');
  assert.equal(sheet.total, 2);
  assert.equal(sheet.rows[0].name, 'Gaelle el ters');

  const field = G.Reference.fieldFromHit({
    id: 'hit_name',
    text: 'Rosemary Fernandes',
    x: 22,
    y: 36,
    width: 56,
    height: 7,
    fontSize: 64,
    fontFamily: 'Great Vibes',
    textColor: '#ffffff',
    backgroundColor: '#1a2744',
    alignment: 'center',
    capitalization: 'title',
  }, { columns: sheet.columns, replaceMode: true, template: { heightPx: 1000 }, reference: { heightPx: 1000 } });
  assert.equal(field.coverExistingText, true);
  assert.equal(field.coverColor, '#1a2744');
  assert.ok(field.coverX < 22, 'cover should pad beyond the original glyphs');
  assert.ok(field.coverWidth > 56);
  assert.equal(field.excelColumn, 'name');
});

test('pads cover boxes and snaps a loose drag to the actual text ink', () => {
  const G = loadModules();
  const padded = G.Reference.padCoverBox({ x: 22, y: 36, width: 56, height: 7 });
  assert.ok(padded.x < 22);
  assert.ok(padded.y < 36);
  assert.ok(padded.width > 56);
  assert.ok(padded.height > 7);

  const width = 200;
  const height = 400;
  const pixels = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const ink = y > 148 && y < 172 && x > 40 && x < 160;
      if (ink) pixels.push(252, 252, 255, 255);
      else pixels.push(18, 28, 58, 255);
    }
  }
  const data = Uint8ClampedArray.from(pixels);
  const canvas = {
    width,
    height,
    getContext: function () {
      return {
        getImageData: function (sx, sy, sw, sh) {
          if (sx === 0 && sy === 0 && sw === width && sh === height) {
            return { data: data };
          }
          const slice = [];
          for (let yy = sy; yy < sy + sh; yy += 1) {
            for (let xx = sx; xx < sx + sw; xx += 1) {
              const i = (yy * width + xx) * 4;
              slice.push(data[i], data[i + 1], data[i + 2], data[i + 3]);
            }
          }
          return { data: Uint8ClampedArray.from(slice) };
        }
      };
    }
  };
  const hit = G.Reference.refineMark(canvas, { x: 5, y: 20, width: 90, height: 50 });
  assert.ok(hit);
  assert.ok(hit.width < 90, 'drag should snap tighter than the whole mark');
  assert.ok(hit.height < 20, 'name hit should not cover the whole page');
  assert.ok(hit.y > 25 && hit.y < 45);

  function hexLum(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function paintCanvas(draw) {
    const width = 200;
    const height = 400;
    const pixels = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const color = draw(x, y) ? [252, 252, 255, 255] : [18, 28, 58, 255];
        pixels.push(color[0], color[1], color[2], color[3]);
      }
    }
    const data = Uint8ClampedArray.from(pixels);
    return {
      width,
      height,
      getContext: function () {
        return {
          getImageData: function (sx, sy, sw, sh) {
            if (sx === 0 && sy === 0 && sw === width && sh === height) return { data: data };
            const slice = [];
            for (let yy = sy; yy < sy + sh; yy += 1) {
              for (let xx = sx; xx < sx + sw; xx += 1) {
                const i = (yy * width + xx) * 4;
                slice.push(data[i], data[i + 1], data[i + 2], data[i + 3]);
              }
            }
            return { data: Uint8ClampedArray.from(slice) };
          }
        };
      }
    };
  }

  const certLike = paintCanvas((x, y) => {
    const hairline = y >= 132 && y <= 133 && x >= 20 && x <= 180;
    const word1 = y > 148 && y < 172 && x > 40 && x < 95;
    const word2 = y > 148 && y < 172 && x > 108 && x < 160;
    const body = y >= 190 && y <= 200 && x >= 30 && x <= 170;
    return hairline || word1 || word2 || body;
  });

  const onName = G.Reference.regionFromClick(certLike, 50, 40);
  assert.ok(onName, 'clicking the name should find a field');
  assert.ok(onName.width > 50, 'both words of the name should stay in one field, width=' + onName.width);
  assert.ok(onName.width < 80, 'name field must not cover the page, width=' + onName.width);
  assert.ok(onName.height < 14, 'name field must not swallow header or footer, height=' + onName.height);
  assert.ok(onName.y > 30 && onName.y < 45, 'name y=' + onName.y);
  assert.ok(onName.backgroundColor && hexLum(onName.backgroundColor) < 70, 'cover color should stay navy, got ' + onName.backgroundColor);
  assert.equal(onName.fontFamily, 'Great Vibes');

  const onHairline = G.Reference.regionFromClick(certLike, 50, 33);
  assert.ok(onHairline, 'a click on the rule above the name should snap to the name');
  assert.ok(onHairline.y > 30 && onHairline.height < 14, JSON.stringify({ y: onHairline.y, h: onHairline.height, w: onHairline.width }));
  assert.ok(onHairline.width < 80);

  const between = G.Reference.regionFromClick(certLike, 50, 45);
  assert.ok(between);
  assert.ok(between.y < 46, 'navy below the name should prefer the name over body text, y=' + between.y);
  assert.ok(between.height < 14);

  const field = G.Reference.fieldFromHit(onName, {
    columns: ['name', 'date'],
    replaceMode: true,
    template: { heightPx: 400 },
    reference: { heightPx: 400 }
  });
  assert.equal(field.coverExistingText, true);
  assert.ok(field.coverWidth < 92);
  assert.ok(field.coverHeight < 16);
  assert.ok(hexLum(field.coverColor) < 70, field.coverColor);

  const sparse = paintCanvas((x, y) => {
    const hairline = y >= 132 && y <= 133 && x >= 20 && x <= 180;
    const script = y > 148 && y < 200 && x > 40 && x < 160 && (x % 8 < 3);
    const body = y >= 220 && y <= 228 && x >= 30 && x <= 170;
    return hairline || script || body;
  });
  const sparseHit = G.Reference.regionFromClick(sparse, 50, 42);
  assert.ok(sparseHit);
  assert.ok(sparseHit.y + sparseHit.height > 48, 'cover must reach the descenders, box=' + JSON.stringify({ y: sparseHit.y, h: sparseHit.height }));
  assert.ok(sparseHit.height > 8, 'script name should be taller than a hairline, h=' + sparseHit.height);
  assert.ok(sparseHit.y + sparseHit.height < 58, 'must not swallow the body line below, bottom=' + (sparseHit.y + sparseHit.height));
});

test('empty names are invalid instead of skipped, and {Name} filenames resolve lowercase columns', () => {
  const G = loadModules();
  const columns = ['name', 'date'];
  const nameField = G.Fields.createField({
    label: 'Recipient Name',
    excelColumn: 'name',
    type: 'text',
    required: true,
  });
  const dateField = G.Fields.createField({
    label: 'Date',
    excelColumn: 'date',
    type: 'date',
    required: true,
    dateFormat: 'MMMM YYYY',
  });
  const report = G.Validate.validate([
    { name: '', date: '20 augusyt', __excelRow: 2 },
    { name: '', date: '', __excelRow: 3 },
    { name: 'Gaelle el ters', date: '20 augusyt', __excelRow: 4 },
  ], columns, [nameField, dateField]);
  assert.equal(report.emptySkipped, 1);
  assert.equal(report.invalidCount, 1);
  assert.match(report.invalid[0].message, /missing "name"/);
  assert.equal(report.validCount, 1);

  assert.equal(
    G.Format.applyFilenamePattern('{Name}_Certificate', { name: 'Gaelle el ters' }),
    'Gaelle_el_ters_Certificate',
  );
});

test('covers white script with nearby navy texture and leaves light-blue header ink', () => {
  const G = loadModules();
  const width = 24;
  const height = 12;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const paper = [18 + (x % 3), 28 + (y % 2), 58, 255];
      const pixel = (y === 1 && x < 6)
        ? [150, 190, 230, 255]
        : (y > 3 && y < 9 && x > 6 && x < 18)
          ? [252, 252, 250, 255]
          : paper;
      data[i] = pixel[0];
      data[i + 1] = pixel[1];
      data[i + 2] = pixel[2];
      data[i + 3] = 255;
    }
  }
  const result = G.Generate.coverGlyphsWithTexture({ width, height, data }, '#012235');
  assert.ok(result.covered > 10, 'should find the white letters, covered=' + result.covered);

  function lumAt(x, y) {
    const i = (y * width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  assert.ok(lumAt(12, 6) < 80, 'white script should be inpainted to navy, lum=' + lumAt(12, 6));
  assert.ok(lumAt(2, 1) > 140, 'light-blue header ink must stay, lum=' + lumAt(2, 1));
  assert.ok(Math.abs(data[0] - 18) <= 3, 'paper grain at the corner should stay');
  assert.equal(G.Generate.isGlyphInk(150, 190, 230, 20), false);
  assert.equal(G.Generate.isGlyphInk(252, 252, 250, 20), true);
});

test('Ambassador-size JPGs become A4 print PDFs at 300 DPI, not 96 DPI screen points', () => {
  const G = loadModules();
  const metrics = G.Template.inferPrintMetrics(2480, 3508);
  assert.equal(metrics.printLabel, 'A4');
  assert.ok(Math.abs(metrics.widthPt - 595.2756) < 0.5, 'A4 width pt=' + metrics.widthPt);
  assert.ok(Math.abs(metrics.heightPt - 841.8898) < 0.5, 'A4 height pt=' + metrics.heightPt);
  assert.ok(Math.abs(metrics.dpi - 300) < 1, 'dpi=' + metrics.dpi);

  const landscape = G.Template.inferPrintMetrics(3508, 2480);
  assert.equal(landscape.printLabel, 'A4');
  assert.ok(landscape.widthPt > landscape.heightPt);

  const letter = G.Template.inferPrintMetrics(2550, 3300);
  assert.equal(letter.printLabel, 'Letter');
  assert.ok(Math.abs(letter.dpi - 300) < 1);

  const small = G.Template.inferPrintMetrics(800, 600);
  assert.equal(small.dpi, 96);
  assert.equal(small.paper, null);

  const square = G.Template.inferPrintMetrics(2000, 2000);
  assert.equal(square.dpi, 300);
  assert.ok(Math.abs(square.widthPt - 480) < 0.01);

  const page = G.Generate.pageSizePts({
    widthPx: 2480,
    heightPx: 3508,
    widthPt: metrics.widthPt,
    heightPt: metrics.heightPt,
    dpi: metrics.dpi
  });
  assert.ok(Math.abs(page.w - 595.2756) < 0.5);
  assert.ok(Math.abs(page.h - 841.8898) < 0.5);
  assert.ok(page.w * page.h < 2480 * 72 / 96 * 3508 * 72 / 96, 'must not use 96 DPI screen points');

  const template = { widthPx: 2480, heightPx: 3508, dpi: 300 };
  assert.equal(G.Generate.outputScale(template, 'print'), 1);
  assert.ok(Math.abs(G.Generate.outputScale(template, 'sharp') - 4800 / 3508) < 0.01);

  const screenExport = { widthPx: 794, heightPx: 1123, dpi: 96 };
  assert.ok(Math.abs(G.Generate.outputScale(screenExport, 'print') - 3) < 0.01);
});

test('attachment Excel keeps original rows and points at each PDF in the Certificates folder', () => {
  const G = loadModules();
  assert.equal(G.Generate.pdfFilenameFor('Gaelle_El_Ters_Certificate.png'), 'Gaelle_El_Ters_Certificate.pdf');
  assert.equal(G.Generate.pdfFilenameFor('Joelle_El_Feghaly_Certificate.pdf'), 'Joelle_El_Feghaly_Certificate.pdf');

  const columns = ['name', 'date'];
  const rows = [
    { name: 'Gaelle el ters', date: '20 augusyt', __excelRow: 2 },
    { name: 'Joelle el feghaly', date: '21 augusyt', __excelRow: 3 },
    { name: '', date: '22 augusyt', __excelRow: 4 },
  ];
  const results = [
    { ok: true, excelRow: 2, index: 0, pdfFilename: 'Gaelle_El_Ters_Certificate.pdf' },
    { ok: true, excelRow: 3, index: 1, pdfFilename: 'Joelle_El_Feghaly_Certificate.pdf' },
  ];
  const packed = G.Excel.rowsWithAttachments(columns, rows, results);
  assert.equal(packed.attachmentColumn, 'Attachment');
  assert.deepEqual(packed.columns, ['name', 'date', 'Attachment']);
  assert.equal(packed.rows.length, 3);
  assert.equal(packed.rows[0].Attachment, 'Certificates/Gaelle_El_Ters_Certificate.pdf');
  assert.equal(packed.rows[1].Attachment, 'Certificates/Joelle_El_Feghaly_Certificate.pdf');
  assert.equal(packed.rows[2].Attachment, '');
  assert.equal(packed.rows[0].name, 'Gaelle el ters');
});
