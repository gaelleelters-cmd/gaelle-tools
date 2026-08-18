(function attachCertFormat(global) {
  'use strict';

  var CertGen = global.CertGen || {};

  var MONTHS_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var DATE_FORMATS = [
    { id: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
    { id: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
    { id: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
    { id: 'DD MMM YYYY', label: 'DD MMM YYYY' },
    { id: 'DD MMMM YYYY', label: 'DD MMMM YYYY' },
    { id: 'MMMM DD, YYYY', label: 'MMMM DD, YYYY' },
    { id: 'MMMM YYYY', label: 'MMMM YYYY' },
    { id: 'DD MMMM', label: 'DD MMMM' }
  ];

  var INVALID_FILENAME = /[<>:"/\\|?*\u0000-\u001f]/g;

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function isBlank(value) {
    if (value == null) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    return false;
  }

  function excelSerialToDate(serial) {
    var n = Number(serial);
    if (!Number.isFinite(n)) return null;
    // Excel 1900 date system, including the fictitious 29 Feb 1900.
    var whole = Math.floor(n);
    var frac = n - whole;
    var utc = Date.UTC(1899, 11, 30) + whole * 86400000 + Math.round(frac * 86400000);
    var d = new Date(utc);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function looksLikeExcelSerial(n) {
    return Number.isFinite(n) && n >= 1 && n < 2958466 && (n > 20000 || (n % 1 !== 0));
  }

  function parseDate(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value > 1e12) {
        var fromMs = new Date(value);
        return Number.isNaN(fromMs.getTime()) ? null : fromMs;
      }
      if (value > 1e9 && value < 1e12) {
        var fromSec = new Date(value * 1000);
        return Number.isNaN(fromSec.getTime()) ? null : fromSec;
      }
      if (looksLikeExcelSerial(value)) return excelSerialToDate(value);
      return null;
    }

    var text = String(value).trim();
    if (!text) return null;

    var iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);
    if (iso) {
      var isoDate = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
      return Number.isNaN(isoDate.getTime()) ? null : isoDate;
    }

    var slash = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (slash) {
      var a = Number(slash[1]);
      var b = Number(slash[2]);
      var y = Number(slash[3]);
      if (y < 100) y += y >= 70 ? 1900 : 2000;
      var day;
      var month;
      if (a > 12 && b <= 12) {
        day = a;
        month = b;
      } else if (b > 12 && a <= 12) {
        month = a;
        day = b;
      } else {
        // Prefer day/month/year, matching the examples in this tool.
        day = a;
        month = b;
      }
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      var slashDate = new Date(Date.UTC(y, month - 1, day));
      if (slashDate.getUTCFullYear() !== y || slashDate.getUTCMonth() !== month - 1 || slashDate.getUTCDate() !== day) {
        return null;
      }
      return slashDate;
    }

    var named = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (named) {
      var monthIdx = monthIndex(named[2]);
      if (monthIdx < 0) return null;
      var namedDate = new Date(Date.UTC(Number(named[3]), monthIdx, Number(named[1])));
      return Number.isNaN(namedDate.getTime()) ? null : namedDate;
    }

    var namedUs = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (namedUs) {
      var monthIdxUs = monthIndex(namedUs[1]);
      if (monthIdxUs < 0) return null;
      var namedUsDate = new Date(Date.UTC(Number(namedUs[3]), monthIdxUs, Number(namedUs[2])));
      return Number.isNaN(namedUsDate.getTime()) ? null : namedUsDate;
    }

    var monthYear = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (monthYear) {
      var monthYearIdx = monthIndex(monthYear[1]);
      if (monthYearIdx >= 0) {
        return new Date(Date.UTC(Number(monthYear[2]), monthYearIdx, 1));
      }
    }

    var dayMonth = text.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
    if (dayMonth) {
      var dayMonthIdx = monthIndex(dayMonth[2]);
      if (dayMonthIdx >= 0) {
        var yearNow = new Date().getUTCFullYear();
        return new Date(Date.UTC(yearNow, dayMonthIdx, Number(dayMonth[1])));
      }
    }

    return null;
  }

  function editDistance(a, b) {
    var left = String(a || '');
    var right = String(b || '');
    var rows = [];
    var i;
    var j;
    for (i = 0; i <= left.length; i += 1) {
      rows[i] = [i];
    }
    for (j = 0; j <= right.length; j += 1) rows[0][j] = j;
    for (i = 1; i <= left.length; i += 1) {
      for (j = 1; j <= right.length; j += 1) {
        var cost = left.charAt(i - 1) === right.charAt(j - 1) ? 0 : 1;
        rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      }
    }
    return rows[left.length][right.length];
  }

  function monthIndex(name) {
    var lower = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!lower) return -1;
    var i;
    for (i = 0; i < MONTHS_FULL.length; i += 1) {
      if (MONTHS_FULL[i].toLowerCase() === lower || MONTHS_SHORT[i].toLowerCase() === lower) return i;
    }
    if (lower.length < 3) return -1;
    var best = -1;
    var bestDist = 99;
    for (i = 0; i < MONTHS_FULL.length; i += 1) {
      var full = MONTHS_FULL[i].toLowerCase();
      var short = MONTHS_SHORT[i].toLowerCase();
      var dist = Math.min(editDistance(lower, full), editDistance(lower, short));
      if (full.indexOf(lower) === 0 && lower.length >= 3) dist = Math.min(dist, 1);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    if (bestDist <= 1) return best;
    if (bestDist === 2 && lower.length >= 6) return best;
    return -1;
  }

  function formatDate(value, pattern) {
    var date = parseDate(value);
    if (!date) return null;
    var d = date.getUTCDate();
    var m = date.getUTCMonth();
    var y = date.getUTCFullYear();
    switch (pattern) {
      case 'MM/DD/YYYY':
        return pad2(m + 1) + '/' + pad2(d) + '/' + y;
      case 'YYYY-MM-DD':
        return y + '-' + pad2(m + 1) + '-' + pad2(d);
      case 'DD MMM YYYY':
        return pad2(d) + ' ' + MONTHS_SHORT[m] + ' ' + y;
      case 'DD MMMM YYYY':
        return d + ' ' + MONTHS_FULL[m] + ' ' + y;
      case 'MMMM DD, YYYY':
        return MONTHS_FULL[m] + ' ' + d + ', ' + y;
      case 'MMMM YYYY':
        return MONTHS_FULL[m] + ' ' + y;
      case 'DD MMMM':
        return d + ' ' + MONTHS_FULL[m];
      case 'DD/MM/YYYY':
      default:
        return pad2(d) + '/' + pad2(m + 1) + '/' + y;
    }
  }

  function parseNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value == null) return null;
    var text = String(value).trim();
    if (!text) return null;
    var cleaned = text.replace(/[^0-9,.\-]/g, '');
    if (cleaned.indexOf(',') >= 0 && cleaned.indexOf('.') >= 0) {
      if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if ((cleaned.match(/,/g) || []).length === 1 && (cleaned.match(/\./g) || []).length === 0) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
    var n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function formatNumber(value, decimals) {
    var n = parseNumber(value);
    if (n == null) return null;
    var places = decimals == null ? 0 : Number(decimals);
    if (!Number.isFinite(places) || places < 0) places = 0;
    return n.toLocaleString('en-US', {
      minimumFractionDigits: places,
      maximumFractionDigits: places
    });
  }

  function formatCurrency(value, options) {
    var n = parseNumber(value);
    if (n == null) return null;
    var opts = options || {};
    var places = opts.decimals == null ? 0 : Number(opts.decimals);
    var formatted = formatNumber(n, places);
    var code = opts.currency || 'USD';
    if (code === 'USD') return '$' + formatted;
    if (code === 'EUR') return '€' + formatted;
    if (code === 'GBP') return '£' + formatted;
    if (code === 'AED') return formatted + ' AED';
    if (code === 'none') return formatted;
    return formatted + ' ' + code;
  }

  function stringifyValue(value) {
    if (value == null) return '';
    if (value instanceof Date) return formatDate(value, 'DD/MM/YYYY') || '';
    return String(value).trim();
  }

  function lookupRow(row, key) {
    if (!row || key == null || key === '') return '';
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] != null && row[key] !== '') {
      return row[key];
    }
    var lower = String(key).toLowerCase();
    var k;
    for (k in row) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
      if (k === '__excelRow') continue;
      if (String(k).toLowerCase() === lower) return row[k];
    }
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    return '';
  }

  function formatFieldValue(value, field) {
    var type = (field && field.type) || 'text';
    if (isBlank(value)) return '';
    var out = '';
    if (type === 'date') {
      var formatted = formatDate(value, (field && field.dateFormat) || 'DD MMMM YYYY');
      out = formatted == null ? stringifyValue(value) : formatted;
    } else if (type === 'number') {
      var asNumber = formatNumber(value, field && field.numberDecimals);
      out = asNumber == null ? stringifyValue(value) : asNumber;
    } else if (type === 'currency') {
      var asMoney = formatCurrency(value, {
        currency: (field && field.currency) || 'USD',
        decimals: field && field.numberDecimals != null ? field.numberDecimals : 0
      });
      out = asMoney == null ? stringifyValue(value) : asMoney;
    } else {
      out = stringifyValue(value);
    }
    if (CertGen.Reference && CertGen.Reference.applyCapitalization) {
      return CertGen.Reference.applyCapitalization(out, field && field.capitalization);
    }
    return out;
  }

  function sanitizeFilename(name) {
    var cleaned = String(name == null ? '' : name)
      .replace(INVALID_FILENAME, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[. ]+|[. ]+$/g, '')
      .slice(0, 120);
    return cleaned || 'Certificate';
  }

  function applyFilenamePattern(pattern, row, fields) {
    var source = String(pattern || '{Name}_Certificate');
    var out = source.replace(/\{([^}]+)\}/g, function (_, col) {
      var key = String(col || '').trim();
      var raw = lookupRow(row, key);
      if (isBlank(raw) && fields && fields.length) {
        var match = fields.filter(function (field) {
          return field.label === key || field.excelColumn === key;
        })[0];
        if (match) raw = lookupRow(row, match.excelColumn);
      }
      if (isBlank(raw)) return '';
      var field = (fields || []).filter(function (item) {
        return item.excelColumn === key || item.label === key;
      })[0];
      return sanitizeFilename(formatFieldValue(raw, field || { type: 'text' }));
    });
    return sanitizeFilename(out);
  }

  function uniqueFilename(base, extension, used) {
    var ext = String(extension || 'pdf').replace(/^\./, '');
    var stem = sanitizeFilename(base);
    var name = stem + '.' + ext;
    var n = 2;
    while (used[name]) {
      name = stem + '_' + n + '.' + ext;
      n += 1;
    }
    used[name] = true;
    return name;
  }

  var Format = {
    DATE_FORMATS: DATE_FORMATS,
    isBlank: isBlank,
    pad2: pad2,
    excelSerialToDate: excelSerialToDate,
    parseDate: parseDate,
    formatDate: formatDate,
    parseNumber: parseNumber,
    formatNumber: formatNumber,
    formatCurrency: formatCurrency,
    stringifyValue: stringifyValue,
    lookupRow: lookupRow,
    formatFieldValue: formatFieldValue,
    sanitizeFilename: sanitizeFilename,
    applyFilenamePattern: applyFilenamePattern,
    uniqueFilename: uniqueFilename
  };

  CertGen.Format = Format;
  global.CertGen = CertGen;
  if (typeof module !== 'undefined' && module.exports) module.exports = Format;
})(typeof globalThis !== 'undefined' ? globalThis : window);
