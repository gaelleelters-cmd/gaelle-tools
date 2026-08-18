(function attachCertExcel(global) {
  'use strict';

  var CertGen = global.CertGen || {};
  var Format = function () { return CertGen.Format; };

  function isBlank(value) {
    return Format().isBlank(value);
  }

  function uniqueHeaders(names) {
    var seen = Object.create(null);
    return names.map(function (raw, index) {
      var base = String(raw || '').trim() || ('Column ' + (index + 1));
      var name = base;
      var n = 2;
      while (seen[name]) {
        name = base + '_' + n;
        n += 1;
      }
      seen[name] = true;
      return name;
    });
  }

  function looksLikeDateFormat(numFmt) {
    if (!numFmt) return false;
    return /[ymd]/i.test(String(numFmt)) && !/[\[\]]/.test(String(numFmt));
  }

  function cellToValue(cell) {
    if (!cell || cell.v == null || cell.v === '') return '';
    if (cell.t === 'd') {
      if (cell.v instanceof Date) return cell.v;
      var parsed = Format().parseDate(cell.v);
      return parsed || cell.v;
    }
    if (cell.t === 'n') {
      if (looksLikeDateFormat(cell.z)) return Format().excelSerialToDate(cell.v) || cell.v;
      if (cell.w && /^0+\d/.test(String(cell.w).trim())) return String(cell.w).trim();
      return cell.v;
    }
    if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE';
    return cell.v;
  }

  function readSheet(sheet) {
    if (!sheet || !sheet['!ref']) {
      return { columns: [], rows: [], preview: [], total: 0 };
    }
    var XLSX = global.XLSX;
    var range = XLSX.utils.decode_range(sheet['!ref']);
    var headerRow = range.s.r;
    var rawHeaders = [];
    var c;
    for (c = range.s.c; c <= range.e.c; c += 1) {
      var headerCell = sheet[XLSX.utils.encode_cell({ r: headerRow, c: c })];
      rawHeaders.push(headerCell && headerCell.v != null ? String(headerCell.v) : '');
    }
    while (rawHeaders.length && String(rawHeaders[rawHeaders.length - 1]).trim() === '') {
      rawHeaders.pop();
    }
    var columns = uniqueHeaders(rawHeaders);
    var rows = [];
    var r;
    for (r = headerRow + 1; r <= range.e.r; r += 1) {
      var obj = { __excelRow: r + 1 };
      var empty = true;
      columns.forEach(function (col, i) {
        var cell = sheet[XLSX.utils.encode_cell({ r: r, c: range.s.c + i })];
        var value = cellToValue(cell);
        obj[col] = value;
        if (!isBlank(value)) empty = false;
      });
      if (!empty) rows.push(obj);
    }
    return {
      columns: columns,
      rows: rows,
      preview: rows.slice(0, 8),
      total: rows.length
    };
  }

  function workbookFromXlsx(wb, fileName) {
    if (!wb.SheetNames || !wb.SheetNames.length) {
      throw new Error('The spreadsheet has no sheets.');
    }
    var sheets = {};
    wb.SheetNames.forEach(function (name) {
      sheets[name] = readSheet(wb.Sheets[name]);
    });
    return {
      fileName: fileName || 'data.xlsx',
      sheetNames: wb.SheetNames.slice(),
      sheets: sheets
    };
  }

  function parseWorkbook(buffer, fileName) {
    var XLSX = global.XLSX;
    if (!XLSX) {
      throw new Error('Spreadsheet library failed to load. Check your internet connection and try again.');
    }
    return workbookFromXlsx(XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: true }), fileName);
  }

  function splitCsvLine(line, delimiter) {
    if (delimiter === '\t') return String(line).split('\t');
    var out = [];
    var current = '';
    var quoted = false;
    var i;
    for (i = 0; i < line.length; i += 1) {
      var ch = line.charAt(i);
      if (ch === '"') {
        if (quoted && line.charAt(i + 1) === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (ch === delimiter && !quoted) {
        out.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(current);
    return out;
  }

  function parsePlainTable(text, fileName) {
    var raw = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    var lines = raw.split(/\r\n|\n|\r/).filter(function (line) {
      return String(line).trim() !== '';
    });
    if (lines.length < 2) {
      throw new Error('Paste at least a header row and one data row.');
    }
    var delimiter = lines[0].indexOf('\t') >= 0 ? '\t' : ',';
    var columns = uniqueHeaders(splitCsvLine(lines[0], delimiter).map(function (cell) {
      return String(cell || '').trim();
    }));
    var rows = [];
    var r;
    for (r = 1; r < lines.length; r += 1) {
      var cells = splitCsvLine(lines[r], delimiter);
      var obj = { __excelRow: r + 1 };
      var empty = true;
      columns.forEach(function (col, i) {
        var value = cells[i] != null ? String(cells[i]).trim() : '';
        obj[col] = value;
        if (value) empty = false;
      });
      if (!empty) rows.push(obj);
    }
    if (!rows.length) throw new Error('No data rows were found in the pasted cells.');
    var sheet = { columns: columns, rows: rows, preview: rows.slice(0, 8), total: rows.length };
    return {
      fileName: fileName || 'pasted-data.csv',
      sheetNames: ['Sheet1'],
      sheets: { Sheet1: sheet }
    };
  }

  function parseTableText(text, fileName) {
    var raw = String(text == null ? '' : text).replace(/^\uFEFF/, '').trim();
    if (!raw) throw new Error('Paste the spreadsheet cells first.');
    var XLSX = global.XLSX;
    if (XLSX) {
      try {
        return workbookFromXlsx(XLSX.read(raw, { type: 'string' }), fileName || 'pasted-data.csv');
      } catch (err) {
        return parsePlainTable(raw, fileName);
      }
    }
    return parsePlainTable(raw, fileName);
  }

  function getSheet(workbook, sheetName) {
    if (!workbook) return { columns: [], rows: [], preview: [], total: 0 };
    var name = sheetName || workbook.sheetNames[0];
    return workbook.sheets[name] || { columns: [], rows: [], preview: [], total: 0 };
  }

  function isEmptyRow(row, columns) {
    var keys = columns && columns.length
      ? columns
      : Object.keys(row || {}).filter(function (key) { return key !== '__excelRow'; });
    return keys.every(function (key) {
      return isBlank(row[key]);
    });
  }

  function attachmentColumnName(columns) {
    var used = Object.create(null);
    (columns || []).forEach(function (col) { used[String(col)] = true; });
    var names = ['Attachment', 'PDF path', 'Certificate PDF'];
    var i;
    for (i = 0; i < names.length; i += 1) {
      if (!used[names[i]]) return names[i];
    }
    return 'Attachment_2';
  }

  function rowsWithAttachments(columns, sourceRows, results) {
    var attachmentCol = attachmentColumnName(columns);
    var byExcelRow = Object.create(null);
    var byIndex = Object.create(null);
    (results || []).forEach(function (item) {
      if (!item) return;
      if (item.excelRow != null) byExcelRow[item.excelRow] = item;
      if (item.index != null) byIndex[item.index] = item;
    });
    var outColumns = (columns || []).concat([attachmentCol]);
    var outRows = (sourceRows || []).map(function (row, i) {
      var copy = {};
      (columns || []).forEach(function (col) { copy[col] = row[col]; });
      var item = (row && row.__excelRow != null ? byExcelRow[row.__excelRow] : null) || byIndex[i];
      var path = '';
      if (item && item.ok) {
        var file = item.pdfFilename || (CertGen.Generate && CertGen.Generate.pdfFilenameFor
          ? CertGen.Generate.pdfFilenameFor(item.filename)
          : item.filename);
        path = file ? ('Certificates/' + file) : '';
      }
      copy[attachmentCol] = path;
      return copy;
    });
    return { columns: outColumns, rows: outRows, attachmentColumn: attachmentCol };
  }

  function attachmentLinkTarget(path) {
    return String(path || '').trim().replace(/\\/g, '/');
  }

  function workbookBlob(columns, rows, sheetName) {
    var XLSX = global.XLSX;
    if (!XLSX || !XLSX.utils) {
      throw new Error('Excel export failed to load. Check your internet connection and try again.');
    }
    var headers = columns || [];
    var data = [headers].concat((rows || []).map(function (row) {
      return headers.map(function (col) {
        return Format().stringifyValue(row[col]);
      });
    }));
    var sheet = XLSX.utils.aoa_to_sheet(data);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, sheetName || 'Certificates');
    var buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function pdfFileForResult(item) {
    if (!item) return '';
    if (item.pdfFilename) return item.pdfFilename;
    if (CertGen.Generate && CertGen.Generate.pdfFilenameFor) {
      return CertGen.Generate.pdfFilenameFor(item.filename);
    }
    return item.filename || '';
  }

  function asZipBytes(data) {
    if (!data) return Promise.resolve(null);
    if (data instanceof Uint8Array) return Promise.resolve(data);
    if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) {
      return Promise.resolve(new Uint8Array(data));
    }
    if (typeof data.arrayBuffer === 'function') {
      return data.arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
    }
    return Promise.resolve(data);
  }

  function concatBytes(parts) {
    var total = 0;
    parts.forEach(function (part) { total += part.length; });
    var out = new Uint8Array(total);
    var offset = 0;
    parts.forEach(function (part) {
      out.set(part, offset);
      offset += part.length;
    });
    return out;
  }

  function u16le(n) {
    return new Uint8Array([n & 255, (n >> 8) & 255]);
  }

  function u32le(n) {
    return new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]);
  }

  function asciiZ(text) {
    var s = String(text || '');
    var out = new Uint8Array(s.length + 1);
    var i;
    for (i = 0; i < s.length; i += 1) {
      var code = s.charCodeAt(i);
      out[i] = code < 128 ? code : 95;
    }
    return out;
  }

  function utf16Prefixed(text) {
    var s = String(text || '');
    var out = new Uint8Array(4 + s.length * 2);
    out[0] = s.length & 255;
    out[1] = (s.length >> 8) & 255;
    out[2] = (s.length >> 16) & 255;
    out[3] = (s.length >> 24) & 255;
    var i;
    for (i = 0; i < s.length; i += 1) {
      var code = s.charCodeAt(i);
      out[4 + i * 2] = code & 255;
      out[4 + i * 2 + 1] = (code >> 8) & 255;
    }
    return out;
  }

  var OLE_COMPOBJ = new Uint8Array([
    0x01, 0x00, 0xfe, 0xff, 0x03, 0x0a, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff,
    0x0c, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x46, 0x0c, 0x00, 0x00, 0x00, 0x4f, 0x4c, 0x45, 0x20,
    0x50, 0x61, 0x63, 0x6b, 0x61, 0x67, 0x65, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x08, 0x00, 0x00, 0x00, 0x50, 0x61, 0x63, 0x6b, 0x61, 0x67, 0x65, 0x00,
    0xf4, 0x39, 0xb2, 0x71, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
  ]);

  function ole10Native(filename, data) {
    var name = String(filename || 'certificate.pdf');
    var payload = data instanceof Uint8Array ? data : new Uint8Array(data);
    var body = concatBytes([
      u16le(2), asciiZ(name), asciiZ(name), u16le(0), u16le(3),
      u32le(name.length + 1), asciiZ(name),
      u32le(payload.length), payload,
      utf16Prefixed(name), utf16Prefixed(name), utf16Prefixed(name)
    ]);
    return concatBytes([u32le(body.length), body]);
  }

  function olePackageBin(filename, pdfBytes) {
    var XLSX = global.XLSX;
    if (!XLSX || !XLSX.CFB || !XLSX.CFB.utils) {
      throw new Error('Excel export failed to load. Check your internet connection and try again.');
    }
    var cfb = XLSX.CFB.utils.cfb_new();
    XLSX.CFB.utils.cfb_add(cfb, '\u0001CompObj', OLE_COMPOBJ);
    XLSX.CFB.utils.cfb_add(cfb, '\u0001Ole10Native', ole10Native(filename, pdfBytes));
    if (cfb.FileIndex && cfb.FileIndex[0]) {
      cfb.FileIndex[0].clsid = '0c00030000000000c000000000000046';
    }
    return XLSX.CFB.write(cfb, { type: 'array' });
  }

  function oleIconBytes() {
    if (CertGen._oleIconBytes) return Promise.resolve(CertGen._oleIconBytes);
    if (typeof fetch === 'function') {
      return fetch('assets/ole-icon.emf?v=20260818c11').then(function (res) {
        if (!res.ok) throw new Error('Unable to load the attachment icon.');
        return res.arrayBuffer();
      }).then(function (buf) {
        return new Uint8Array(buf);
      });
    }
    return Promise.reject(new Error('Unable to load the attachment icon.'));
  }

  function vmlDrawingXml(items, colIndex) {
    var shapes = items.map(function (item, i) {
      var shapeId = 1025 + i;
      var row = item.rowIndex + 1;
      var col = colIndex;
      return '<v:shape id="_x0000_s' + shapeId + '" type="#_x0000_t75" style="position:absolute;margin-left:0;margin-top:0;width:51pt;height:14.5pt;z-index:' + (i + 1) + '" filled="t" fillcolor="window [65]" stroked="t" strokecolor="windowText [64]" o:insetmode="auto" o:ole="">' +
        '<v:fill color2="window [65]"/><v:imagedata o:relid="rId1" o:title=""/>' +
        '<x:ClientData ObjectType="Pict"><x:SizeWithCells/><x:Anchor>' +
        col + ', 0, ' + row + ', 0, ' + (col + 1) + ', 0, ' + (row + 1) + ', 0' +
        '</x:Anchor><x:CF>Pict</x:CF><x:AutoPict/></x:ClientData></v:shape>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
      '<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout>' +
      '<v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" path="m@4@5l@4@11@9@11@9@5xe" filled="f" stroked="f">' +
      '<v:stroke joinstyle="miter"/>' +
      '<v:formulas>' +
      '<v:f eqn="if lineDrawn pixelLineWidth 0"/>' +
      '<v:f eqn="sum @0 1 0"/>' +
      '<v:f eqn="sum 0 0 @1"/>' +
      '<v:f eqn="prod @2 1 2"/>' +
      '<v:f eqn="prod @3 21600 pixelWidth"/>' +
      '<v:f eqn="prod @3 21600 pixelHeight"/>' +
      '<v:f eqn="sum @0 0 1"/>' +
      '<v:f eqn="prod @6 1 2"/>' +
      '<v:f eqn="prod @7 21600 pixelWidth"/>' +
      '<v:f eqn="sum @8 21600 0"/>' +
      '<v:f eqn="prod @7 21600 pixelHeight"/>' +
      '<v:f eqn="sum @10 21600 0"/>' +
      '</v:formulas>' +
      '<v:path o:extrusionok="f" gradientshapeok="t" o:connecttype="rect"/>' +
      '<o:lock v:ext="edit" aspectratio="t"/></v:shapetype>' +
      shapes + '</xml>';
  }

  function sheetRelsXml(items) {
    var rels = [
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawing1.vml"/>'
    ];
    items.forEach(function (item, i) {
      rels.push('<Relationship Id="rId' + (i + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="../embeddings/oleObject' + (i + 1) + '.bin"/>');
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      rels.join('') + '</Relationships>';
  }

  function oleObjectsXml(items) {
    return '<legacyDrawing r:id="rId1"/><oleObjects>' + items.map(function (item, i) {
      return '<oleObject progId="Packager Shell Object" dvAspect="DVASPECT_ICON" shapeId="' + (1025 + i) + '" r:id="rId' + (i + 2) + '"/>';
    }).join('') + '</oleObjects>';
  }

  function ensureWorksheetNs(sheetXml) {
    if (!/xmlns:r=/.test(sheetXml)) {
      sheetXml = sheetXml.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    }
    return sheetXml;
  }

  function collectEmbeddedFiles(columns, rows, results) {
    var packed = rowsWithAttachments(columns, rows, results);
    var byFile = Object.create(null);
    (results || []).forEach(function (item) {
      if (!item || !item.ok || !item.pdfBlob) return;
      var file = pdfFileForResult(item);
      if (file) byFile[file] = item.pdfBlob;
    });
    var files = [];
    packed.rows.forEach(function (row, i) {
      var target = attachmentLinkTarget(row[packed.attachmentColumn]);
      if (!target) return;
      var file = target.replace(/^Certificates\//, '');
      if (!byFile[file]) return;
      files.push({ rowIndex: i, filename: file, blob: byFile[file] });
    });
    return { packed: packed, files: files };
  }

  function injectEmbeddedPdfs(zip, files, attachmentColIndex, iconBytes) {
    files.forEach(function (item, i) {
      zip.file('xl/embeddings/oleObject' + (i + 1) + '.bin', olePackageBin(item.filename, item.bytes));
    });
    zip.file('xl/media/image1.emf', iconBytes);
    zip.file('xl/drawings/vmlDrawing1.vml', vmlDrawingXml(files, attachmentColIndex));
    zip.file('xl/drawings/_rels/vmlDrawing1.vml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.emf"/>' +
      '</Relationships>');
    zip.file('xl/worksheets/_rels/sheet1.xml.rels', sheetRelsXml(files));
    return zip.file('xl/worksheets/sheet1.xml').async('string').then(function (sheetXml) {
      sheetXml = ensureWorksheetNs(sheetXml).replace('</worksheet>', oleObjectsXml(files) + '</worksheet>');
      zip.file('xl/worksheets/sheet1.xml', sheetXml);
      return zip.file('[Content_Types].xml').async('string');
    }).then(function (types) {
      if (!/Extension="emf"/.test(types)) {
        types = types.replace('<Default Extension="xml"',
          '<Default Extension="emf" ContentType="image/x-emf"/><Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/><Default Extension="xml"');
      }
      var overrides = files.map(function (item, i) {
        return '<Override PartName="/xl/embeddings/oleObject' + (i + 1) + '.bin" ContentType="application/vnd.openxmlformats-officedocument.oleObject"/>';
      }).join('');
      types = types.replace('</Types>', overrides + '</Types>');
      zip.file('[Content_Types].xml', types);
      return zip;
    });
  }

  function workbookWithEmbeddedAttachments(columns, rows, attachmentColumn, results, sheetName) {
    var JSZip = global.JSZip;
    if (!JSZip) {
      return Promise.reject(new Error('ZIP download failed to load. Check your internet connection and try again.'));
    }
    var collected = collectEmbeddedFiles(columns, rows, results);
    if (!collected.files.length) {
      return Promise.reject(new Error('There are no PDF certificates to attach yet.'));
    }
    var colIndex = collected.packed.columns.indexOf(attachmentColumn || collected.packed.attachmentColumn);
    return Promise.all([
      asZipBytes(workbookBlob(collected.packed.columns, collected.packed.rows, sheetName)),
      oleIconBytes()
    ].concat(collected.files.map(function (item) {
      return asZipBytes(item.blob).then(function (bytes) {
        item.bytes = bytes;
        return item;
      });
    }))).then(function (parts) {
      var xlsxBytes = parts[0];
      var iconBytes = parts[1];
      return JSZip.loadAsync(xlsxBytes).then(function (zip) {
        return injectEmbeddedPdfs(zip, collected.files, colIndex < 0 ? 2 : colIndex, iconBytes);
      });
    }).then(function (zip) {
      return zip.generateAsync({ type: 'uint8array' });
    }).then(function (bytes) {
      return {
        blob: new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        name: 'Certificates.xlsx'
      };
    });
  }

  CertGen.Excel = {
    parseWorkbook: parseWorkbook,
    parseTableText: parseTableText,
    getSheet: getSheet,
    isEmptyRow: isEmptyRow,
    readSheet: readSheet,
    uniqueHeaders: uniqueHeaders,
    cellToValue: cellToValue,
    attachmentColumnName: attachmentColumnName,
    attachmentLinkTarget: attachmentLinkTarget,
    rowsWithAttachments: rowsWithAttachments,
    workbookBlob: workbookBlob,
    workbookWithEmbeddedAttachments: workbookWithEmbeddedAttachments
  };
  global.CertGen = CertGen;
  if (typeof module !== 'undefined' && module.exports) module.exports = CertGen.Excel;
})(typeof globalThis !== 'undefined' ? globalThis : window);
