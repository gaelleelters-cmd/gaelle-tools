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

  CertGen.Excel = {
    parseWorkbook: parseWorkbook,
    parseTableText: parseTableText,
    getSheet: getSheet,
    isEmptyRow: isEmptyRow,
    readSheet: readSheet,
    uniqueHeaders: uniqueHeaders,
    cellToValue: cellToValue,
    attachmentColumnName: attachmentColumnName,
    rowsWithAttachments: rowsWithAttachments,
    workbookBlob: workbookBlob
  };
  global.CertGen = CertGen;
  if (typeof module !== 'undefined' && module.exports) module.exports = CertGen.Excel;
})(typeof globalThis !== 'undefined' ? globalThis : window);
