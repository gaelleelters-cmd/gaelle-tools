/**
 * Failing-first tests for Mail Mass Excel rich-text preservation.
 * Run: node "Mail Mass/js/sheet-rich.test.js"
 */
'use strict';

var assert = require('assert');
var rich = require('./sheet-rich.js');

function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (err) {
    console.error('FAIL - ' + name);
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

test('looksLikeHtml detects span markup', function () {
  assert.strictEqual(rich.looksLikeHtml('hello'), false);
  assert.strictEqual(rich.looksLikeHtml('<span style="font-weight: bold;">hi</span>'), true);
  assert.strictEqual(rich.looksLikeHtml('a &nbsp; b'), true);
});

test('cellDisplayValue prefers cell.h rich HTML over plain w/v', function () {
  var cell = {
    t: 's',
    v: 'this text is bold, sure enough',
    w: 'this text is bold, sure enough',
    h: 'this text is <span style="font-weight: bold;">bold</span><span style="">, sure enough</span>'
  };
  var val = rich.cellDisplayValue(cell);
  assert.ok(val.indexOf('<span') !== -1, 'expected HTML spans');
  assert.ok(val.indexOf('font-weight: bold') !== -1, 'expected bold style');
  assert.ok(val.indexOf('bold') !== -1);
});

test('cellDisplayValue falls back to plain text when no rich HTML', function () {
  var cell = { t: 's', v: 'plain only', w: 'plain only', h: 'plain only' };
  assert.strictEqual(rich.cellDisplayValue(cell), 'plain only');
});

test('cellDisplayValue returns empty for missing cell', function () {
  assert.strictEqual(rich.cellDisplayValue(null), '');
  assert.strictEqual(rich.cellDisplayValue(undefined), '');
});

test('sheetToRichJson keeps HTML in Message column (not sheet_to_json plain)', function () {
  // Minimal SheetJS-like sheet object
  global.XLSX = {
    utils: {
      decode_range: function () {
        return { s: { r: 0, c: 0 }, e: { r: 1, c: 1 } };
      },
      encode_cell: function (addr) {
        return String.fromCharCode(65 + addr.c) + String(addr.r + 1);
      }
    }
  };

  var sheet = {
    '!ref': 'A1:B2',
    A1: { t: 's', v: 'First Name', w: 'First Name', h: 'First Name' },
    B1: { t: 's', v: 'Message', w: 'Message', h: 'Message' },
    A2: { t: 's', v: 'Gaelle', w: 'Gaelle', h: 'Gaelle' },
    B2: {
      t: 's',
      v: 'Hello please review',
      w: 'Hello please review',
      h: 'Hello <span style="font-weight: bold;color:#FF0000;">please</span> <i>review</i>'
    }
  };

  var rows = rich.sheetToRichJson(sheet, { defval: '' });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]['First Name'], 'Gaelle');
  assert.ok(rows[0].Message.indexOf('font-weight: bold') !== -1, 'Message must keep bold');
  assert.ok(rows[0].Message.indexOf('<i>review</i>') !== -1, 'Message must keep italic');
});

if (!process.exitCode) {
  console.log('All tests passed');
}
