/**
 * Failing-first tests for Mail Mass Excel rich-text preservation.
 * Run: node "Mail Mass/js/sheet-rich.test.js"
 */
'use strict';

var assert = require('assert');
var rich = require('./sheet-rich.js');
var pending = [];

function test(name, fn) {
  var result;
  try {
    result = fn();
  } catch (err) {
    console.error('FAIL - ' + name);
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
    pending.push(Promise.resolve());
    return;
  }
  if (result && typeof result.then === 'function') {
    pending.push(result.then(function () {
      console.log('ok - ' + name);
    }).catch(function (err) {
      console.error('FAIL - ' + name);
      console.error(err && err.stack ? err.stack : err);
      process.exitCode = 1;
    }));
    return;
  }
  console.log('ok - ' + name);
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
  assert.strictEqual(rows[0].__sheetRow, 1);
  assert.ok(Object.keys(rows[0]).indexOf('__sheetRow') === -1, '__sheetRow must not appear as a column');
});

function u16le(n) {
  var b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

function u32le(n) {
  var b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

function asciiZ(s) {
  return Buffer.concat([Buffer.from(s, 'ascii'), Buffer.from([0])]);
}

function ole10Native(filename, payload) {
  var data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  var body = Buffer.concat([
    u16le(2), asciiZ(filename), asciiZ(filename), u16le(0), u16le(3),
    u32le(filename.length + 1), asciiZ(filename),
    u32le(data.length), data
  ]);
  return Buffer.concat([u32le(body.length), body]);
}

test('parseOle10Native extracts filename and file bytes', function () {
  var raw = ole10Native('Ters_Certificate.pdf', '%PDF-1.1\nembedded-cert\n%%EOF\n');
  var parsed = rich.parseOle10Native(raw);
  assert.ok(parsed);
  assert.strictEqual(parsed.name, 'Ters_Certificate.pdf');
  assert.ok(Buffer.from(parsed.bytes).toString('utf8').indexOf('embedded-cert') !== -1);
});

test('parseOle10Native reads Excel packages that pad the OLE stream', function () {
  var raw = ole10Native('Gaelle_El_Ters_Certificate.pdf', '%PDF-1.3\ncert-bytes\n%%EOF\n');
  var padded = Buffer.concat([raw, Buffer.alloc(4096)]);
  var parsed = rich.parseOle10Native(padded);
  assert.ok(parsed);
  assert.strictEqual(parsed.name, 'Gaelle_El_Ters_Certificate.pdf');
  assert.strictEqual(Buffer.from(parsed.bytes).toString('utf8'), '%PDF-1.3\ncert-bytes\n%%EOF\n');
});

test('parseOleObjects uses r:id not shapeId', function () {
  var tags = rich.parseOleObjects(
    '<oleObjects><oleObject progId="Packager Shell Object" dvAspect="DVASPECT_ICON" shapeId="1025" r:id="rId2"/></oleObjects>'
  );
  assert.strictEqual(tags.length, 1);
  assert.strictEqual(tags[0].shapeId, '1025');
  assert.strictEqual(tags[0].rid, 'rId2');
});

test('parseVmlAnchors maps Packager icon to the Excel cell', function () {
  var vml = '<v:shape id="_x0000_s1025" type="#_x0000_t75">' +
    '<x:ClientData ObjectType="Pict"><x:Anchor>3, 0, 1, 0, 4, 0, 2, 0</x:Anchor></x:ClientData></v:shape>';
  var anchors = rich.parseVmlAnchors(vml);
  assert.strictEqual(anchors['1025'].c, 3);
  assert.strictEqual(anchors['1025'].r, 1);
  assert.strictEqual(rich.cellAddressForOle({ shapeId: '1025' }, 0, anchors, []), 'D2');
});

test('applyOleMapToRows attaches embedded files to the mapped column', function () {
  global.XLSX = {
    utils: {
      decode_range: function () {
        return { s: { r: 0, c: 0 }, e: { r: 1, c: 3 } };
      },
      encode_cell: function (addr) {
        return String.fromCharCode(65 + addr.c) + String(addr.r + 1);
      }
    }
  };
  var sheet = {
    '!ref': 'A1:D2',
    A1: { t: 's', v: 'First Name', w: 'First Name' },
    B1: { t: 's', v: 'Email', w: 'Email' },
    C1: { t: 's', v: 'Subject', w: 'Subject' },
    D1: { t: 's', v: 'Attachment Path', w: 'Attachment Path' },
    A2: { t: 's', v: 'Gaelle', w: 'Gaelle' },
    B2: { t: 's', v: 'a@b.com', w: 'a@b.com' },
    C2: { t: 's', v: 'Hi', w: 'Hi' },
    D2: { t: 's', v: '', w: '' }
  };
  var rows = rich.sheetToRichJson(sheet, { defval: '' });
  var ole = { name: 'sample.txt', bytes: Buffer.from('hello') };
  var n = rich.applyOleMapToRows(sheet, rows, { D2: ole });
  assert.strictEqual(n, 1);
  assert.strictEqual(rows[0].__oleByHeader['Attachment Path'].name, 'sample.txt');
  assert.ok(Object.keys(rows[0]).indexOf('__oleByHeader') === -1);
});

test('extractOleCellMap reads a Packager object from an xlsx zip', function () {
  function zipStored(files) {
    var chunks = [];
    Object.keys(files).forEach(function (name) {
      var data = files[name];
      if (!Buffer.isBuffer(data)) data = Buffer.from(String(data), 'utf8');
      var nameBuf = Buffer.from(name, 'utf8');
      var header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0, 6);
      header.writeUInt16LE(0, 8);
      header.writeUInt16LE(0, 10);
      header.writeUInt16LE(0, 12);
      header.writeUInt32LE(0, 14);
      header.writeUInt32LE(data.length, 18);
      header.writeUInt32LE(data.length, 22);
      header.writeUInt16LE(nameBuf.length, 26);
      header.writeUInt16LE(0, 28);
      chunks.push(header, nameBuf, data);
    });
    return Buffer.concat(chunks);
  }

  var sheetXml = '<?xml version="1.0"?><worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetData><c r="D2"><f>EMBED("Packager Shell Object","")</f></c></sheetData>' +
    '<legacyDrawing r:id="rId1"/><oleObjects>' +
    '<oleObject progId="Packager Shell Object" dvAspect="DVASPECT_ICON" shapeId="1025" r:id="rId2"/>' +
    '</oleObjects></worksheet>';
  var relsXml = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawing1.vml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="../embeddings/oleObject1.bin"/>' +
    '</Relationships>';
  var vml = '<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
    '<v:shape id="_x0000_s1025"><x:ClientData ObjectType="Pict"><x:Anchor>3, 0, 1, 0, 4, 0, 2, 0</x:Anchor></x:ClientData></v:shape></xml>';
  var zip = zipStored({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Sheet1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheetXml,
    'xl/worksheets/_rels/sheet1.xml.rels': relsXml,
    'xl/drawings/vmlDrawing1.vml': vml,
    'xl/embeddings/oleObject1.bin': ole10Native('sample.txt', 'hello from excel')
  });

  return rich.extractOleCellMap(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)).then(function (map) {
    assert.ok(map.D2, 'expected D2 embedding, got ' + Object.keys(map).join(','));
    assert.strictEqual(map.D2.name, 'sample.txt');
    assert.strictEqual(Buffer.from(map.D2.bytes).toString('utf8'), 'hello from excel');
  });
});

Promise.all(pending).then(function () {
  if (!process.exitCode) {
    console.log('All tests passed');
  }
});
