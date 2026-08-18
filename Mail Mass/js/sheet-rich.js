/* Excel cell helpers — preserve rich-text HTML including colors (rgb/theme/tint). */
(function (global) {
  'use strict';

  // Excel theme=N index order (NOT raw clrScheme document order).
  // Excel stores default body text as theme="1" (= black / dk1).
  // Document order is dk1,lt1,... but theme indices use lt1,dk1,lt2,dk2,accents...
  var DEFAULT_THEME = [
    'FFFFFF', // 0 lt1 (background / light 1)
    '000000', // 1 dk1 (text / dark 1) — default font color in Excel
    'EEECE1', // 2 lt2
    '1F497D', // 3 dk2
    '4F81BD', // 4 accent1
    'C0504D', // 5 accent2
    '9BBB59', // 6 accent3
    '8064A2', // 7 accent4
    '4BACC6', // 8 accent5
    'F79646', // 9 accent6
    '0000FF', // 10 hlink
    '800080'  // 11 folHlink
  ];

  var THEME_DOC_ORDER = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
  // Map document-order positions → Excel theme index positions
  var DOC_TO_THEME_INDEX = [1, 0, 3, 2, 4, 5, 6, 7, 8, 9, 10, 11];

  var INDEXED = [
    '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
    '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
    '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
    '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
    '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
    '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
    '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
    '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'
  ];

  function looksLikeHtml(s) {
    return /<[a-z]|\&nbsp;/i.test(String(s || ''));
  }

  function htmlHasColor(s) {
    return /(?:^|[;\s])color\s*:/i.test(String(s || ''));
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function unescapeXml(s) {
    return String(s == null ? '' : s)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&amp;/g, '&');
  }

  function normHex(rgb) {
    var h = String(rgb || '').replace(/^#/, '').toUpperCase();
    if (h.length === 8) h = h.slice(2); // AARRGGBB → RRGGBB
    if (h.length !== 6 || /[^0-9A-F]/i.test(h)) return '';
    return h;
  }

  function hex2rgb(hex) {
    var h = normHex(hex);
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ];
  }

  function rgb2hex(rgb) {
    function ch(n) {
      var v = Math.max(0, Math.min(255, Math.round(n)));
      var s = v.toString(16).toUpperCase();
      return s.length === 1 ? '0' + s : s;
    }
    return ch(rgb[0]) + ch(rgb[1]) + ch(rgb[2]);
  }

  function rgb2hsl(rgb) {
    var r = rgb[0] / 255;
    var g = rgb[1] / 255;
    var b = rgb[2] / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h = 0;
    var s = 0;
    var l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  function hsl2rgb(hsl) {
    var h = hsl[0];
    var s = hsl[1];
    var l = hsl[2];
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var r;
    var g;
    var b;
    if (s === 0) {
      r = g = b = l;
    } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r * 255, g * 255, b * 255];
  }

  function applyTint(hex, tint) {
    var t = Number(tint);
    if (!t) return normHex(hex);
    var hsl = rgb2hsl(hex2rgb(hex));
    if (t < 0) hsl[2] = hsl[2] * (1 + t);
    else hsl[2] = 1 - (1 - hsl[2]) * (1 - t);
    return rgb2hex(hsl2rgb(hsl));
  }

  function parseThemeXml(xml) {
    if (!xml) return DEFAULT_THEME.slice();
    var docColors = [];
    THEME_DOC_ORDER.forEach(function (name, idx) {
      var re = new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>', 'i');
      var m = xml.match(re);
      var hex = DEFAULT_THEME[DOC_TO_THEME_INDEX[idx]];
      if (m) {
        var body = m[1];
        var srgb = body.match(/srgbClr[^>]*val="([0-9A-Fa-f]{6})"/i);
        if (srgb) hex = srgb[1].toUpperCase();
        else {
          var sys = body.match(/sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/i);
          if (sys) hex = sys[1].toUpperCase();
        }
      }
      docColors[idx] = hex;
    });
    var colors = DEFAULT_THEME.slice();
    docColors.forEach(function (hex, docIdx) {
      colors[DOC_TO_THEME_INDEX[docIdx]] = hex;
    });
    return colors;
  }

  function themeFromWorkbook(wb) {
    if (wb && wb.Themes && wb.Themes.raw) return parseThemeXml(String(wb.Themes.raw));
    return DEFAULT_THEME.slice();
  }

  function resolveColorAttrs(attrs, theme) {
    var scheme = theme && theme.length ? theme : DEFAULT_THEME;
    var rgb = attrs.rgb ? normHex(attrs.rgb) : '';
    if (!rgb && attrs.theme != null && attrs.theme !== '') {
      var idx = parseInt(attrs.theme, 10);
      if (!isNaN(idx) && scheme[idx]) rgb = scheme[idx];
    }
    if (!rgb && attrs.indexed != null && attrs.indexed !== '') {
      var ii = parseInt(attrs.indexed, 10);
      if (!isNaN(ii) && INDEXED[ii]) rgb = INDEXED[ii];
    }
    if (!rgb) return '';
    if (attrs.tint != null && attrs.tint !== '') rgb = applyTint(rgb, attrs.tint);
    return rgb ? ('#' + rgb) : '';
  }

  function parseAttrs(tag) {
    var attrs = {};
    var re = /([a-zA-Z:]+)\s*=\s*"([^"]*)"/g;
    var m;
    while ((m = re.exec(tag))) attrs[m[1]] = m[2];
    return attrs;
  }

  function parseRPr(rPrXml, theme) {
    var style = [];
    if (!rPrXml) return { style: '' };

    if (/<b[\s\/>]/i.test(rPrXml) || /<b\s+val="(1|true)"/i.test(rPrXml)) {
      style.push('font-weight:bold');
    }
    if (/<i[\s\/>]/i.test(rPrXml) || /<i\s+val="(1|true)"/i.test(rPrXml)) {
      style.push('font-style:italic');
    }
    if (/<u[\s\/>]/i.test(rPrXml)) {
      style.push('text-decoration:underline');
    }
    if (/<strike[\s\/>]/i.test(rPrXml)) {
      style.push('text-decoration:line-through');
    }

    var sz = rPrXml.match(/<sz[^>]*val="([^"]+)"/i);
    if (sz) style.push('font-size:' + sz[1] + 'pt');

    var font = rPrXml.match(/<rFont[^>]*val="([^"]+)"/i);
    if (font) style.push('font-family:' + font[1]);

    var colorTag = rPrXml.match(/<color\b[^>]*\/?>/i);
    if (colorTag) {
      var cattrs = parseAttrs(colorTag[0]);
      var color = resolveColorAttrs(cattrs, theme);
      if (color) style.push('color:' + color);
    }

    return { style: style.join(';') };
  }

  /**
   * Convert OOXML rich-text run XML (<r>…</r> or full <is>/<si> body) to HTML.
   */
  function richXmlToHtml(xml, theme) {
    var src = String(xml || '');
    if (!src.trim()) return '';

    // Plain <t> only
    if (!/<r[\s>]/i.test(src)) {
      var onlyT = src.match(/<t\b[^>]*>([\s\S]*?)<\/t>/i);
      if (onlyT) {
        return escHtml(unescapeXml(onlyT[1]).replace(/\r\n/g, '\n').replace(/\r/g, '\n')).replace(/\n/g, '<br>');
      }
      return escHtml(unescapeXml(src.replace(/<[^>]+>/g, '')).replace(/\r\n/g, '\n').replace(/\r/g, '\n')).replace(/\n/g, '<br>');
    }

    var parts = [];
    var runRe = /<r\b[^>]*>([\s\S]*?)<\/r>/gi;
    var run;
    while ((run = runRe.exec(src))) {
      var body = run[1];
      var rPr = '';
      var rPrMatch = body.match(/<rPr\b[^>]*>([\s\S]*?)<\/rPr>/i);
      if (rPrMatch) rPr = rPrMatch[1];
      else {
        var rPrSelf = body.match(/<rPr\b([^>]*)\/>/i);
        if (rPrSelf) rPr = rPrSelf[0];
      }
      var tMatch = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/i);
      var text = tMatch ? unescapeXml(tMatch[1]) : '';
      if (text == null) continue;
      text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      var fmt = parseRPr(rPr, theme);
      var lines = text.split('\n');
      var chunks = lines.map(function (line) {
        var safe = escHtml(line);
        if (fmt.style) return '<span style="' + fmt.style + '">' + safe + '</span>';
        return safe;
      });
      parts.push(chunks.join('<br>'));
    }
    return parts.join('');
  }

  function cellDisplayValue(cell, theme) {
    if (!cell || cell.t === 'z') return '';

    // Prefer ZIP-extracted HTML (correct theme colors) over SheetJS .r/.h
    if (cell.__richHtml) return String(cell.__richHtml);

    if (cell.r && /<r[\s>]|<color\b/i.test(String(cell.r))) {
      var fromR = richXmlToHtml(String(cell.r), theme);
      if (fromR) return fromR;
    }

    if (cell.h && looksLikeHtml(cell.h)) {
      if (htmlHasColor(cell.h) || !cell.r) return String(cell.h);
    }
    if (cell.w != null) return String(cell.w);
    if (cell.v != null) return String(cell.v);
    return '';
  }

  function sheetToRichJson(sheet, opts) {
    opts = opts || {};
    var defval = opts.defval != null ? opts.defval : '';
    var theme = opts.theme || DEFAULT_THEME;
    if (!sheet || !sheet['!ref']) return [];

    var XLSX = global.XLSX;
    if (!XLSX || !XLSX.utils) {
      throw new Error('SheetJS (XLSX) is required');
    }

    var range = XLSX.utils.decode_range(sheet['!ref']);
    var headerRow = range.s.r;
    var headers = [];
    var c;

    for (c = range.s.c; c <= range.e.c; c++) {
      var hAddr = XLSX.utils.encode_cell({ r: headerRow, c: c });
      var hCell = sheet[hAddr];
      var hVal = '';
      if (hCell) {
        if (hCell.w != null) hVal = String(hCell.w);
        else if (hCell.v != null) hVal = String(hCell.v);
      }
      headers.push(hVal !== '' ? hVal : 'Column' + (c + 1));
    }

    var rows = [];
    var r;
    for (r = headerRow + 1; r <= range.e.r; r++) {
      var row = {};
      var empty = true;
      for (c = range.s.c; c <= range.e.c; c++) {
        var addr = XLSX.utils.encode_cell({ r: r, c: c });
        var cell = sheet[addr];
        var val = cell ? cellDisplayValue(cell, theme) : defval;
        if (val === '' || val == null) val = defval;
        if (val !== '' && val != null) empty = false;
        row[headers[c - range.s.c]] = val;
      }
      if (!empty) {
        Object.defineProperty(row, '__sheetRow', { value: r, enumerable: false });
        rows.push(row);
      }
    }
    return rows;
  }

  function applyRichHtmlMap(sheet, map) {
    if (!sheet || !map) return;
    Object.keys(map).forEach(function (addr) {
      if (!sheet[addr]) return;
      sheet[addr].__richHtml = map[addr];
      sheet[addr].h = map[addr];
      sheet[addr].r = map[addr + '::__r'] || sheet[addr].r;
    });
  }

  function parseSiOrIs(fragment, theme) {
    if (!fragment) return '';
    if (/<r[\s>]/i.test(fragment)) return richXmlToHtml(fragment, theme);
    var t = fragment.match(/<t\b[^>]*>([\s\S]*?)<\/t>/i);
    if (t) return escHtml(unescapeXml(t[1])).replace(/\n/g, '<br>');
    return escHtml(unescapeXml(fragment.replace(/<[^>]+>/g, '')));
  }

  function parseSharedStrings(xml, theme) {
    var list = [];
    if (!xml) return list;
    var siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
    var m;
    while ((m = siRe.exec(xml))) {
      list.push(parseSiOrIs(m[1], theme));
    }
    return list;
  }

  function parseWorksheetRich(xml, sharedHtml, theme) {
    var map = {};
    if (!xml) return map;
    var cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    var m;
    while ((m = cellRe.exec(xml))) {
      var cattrs = parseAttrs(m[1]);
      var addr = cattrs.r;
      if (!addr) continue;
      var body = m[2];
      var type = (cattrs.t || '').toLowerCase();
      if (type === 'inlinestr') {
        var isMatch = body.match(/<is\b[^>]*>([\s\S]*?)<\/is>/i);
        if (isMatch) {
          var raw = isMatch[1];
          map[addr] = parseSiOrIs(raw, theme);
          map[addr + '::__r'] = raw;
        }
      } else if (type === 's') {
        var vMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
        if (vMatch) {
          var idx = parseInt(vMatch[1], 10);
          if (!isNaN(idx) && sharedHtml[idx] != null) map[addr] = sharedHtml[idx];
        }
      }
    }
    return map;
  }

  function u8ToString(u8) {
    var out = '';
    var chunk = 0x8000;
    for (var i = 0; i < u8.length; i += chunk) {
      out += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return out;
  }

  function findZipLocalFiles(arrayBuffer) {
    var bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var files = {};
    var offset = 0;
    while (offset + 30 <= bytes.length) {
      var sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break;
      var method = view.getUint16(offset + 8, true);
      var compSize = view.getUint32(offset + 18, true);
      var nameLen = view.getUint16(offset + 26, true);
      var extraLen = view.getUint16(offset + 28, true);
      var nameBytes = bytes.subarray(offset + 30, offset + 30 + nameLen);
      var name = u8ToString(nameBytes);
      var dataStart = offset + 30 + nameLen + extraLen;
      var data = bytes.subarray(dataStart, dataStart + compSize);
      files[name] = { method: method, data: data };
      offset = dataStart + compSize;
    }
    return files;
  }

  function inflate(uint8) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('DecompressionStream not available'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var blob = new Blob([uint8]);
    return new Response(blob.stream().pipeThrough(ds)).arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  function readZipText(entry) {
    if (!entry) return Promise.resolve('');
    if (entry.method === 0) return Promise.resolve(u8ToString(entry.data));
    if (entry.method === 8) {
      return inflate(entry.data).then(function (raw) { return u8ToString(raw); });
    }
    return Promise.resolve('');
  }

  function readZipBytes(entry) {
    if (!entry) return Promise.resolve(null);
    if (entry.method === 0) return Promise.resolve(entry.data);
    if (entry.method === 8) return inflate(entry.data);
    return Promise.resolve(null);
  }

  function toU8(content) {
    if (!content) return new Uint8Array(0);
    if (content instanceof Uint8Array) return content;
    if (ArrayBuffer.isView(content)) {
      return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
    }
    if (content instanceof ArrayBuffer) return new Uint8Array(content);
    return new Uint8Array(content);
  }

  function sanitizeFilename(name) {
    var s = String(name || '').replace(/\\/g, '/');
    var slash = s.lastIndexOf('/');
    if (slash >= 0) s = s.slice(slash + 1);
    s = s.replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim();
    if (!s || s === '.' || s === '..') return 'attachment.bin';
    return s.slice(0, 180);
  }

  function encodeCell(r, c) {
    if (global.XLSX && XLSX.utils && XLSX.utils.encode_cell) {
      return XLSX.utils.encode_cell({ r: r, c: c });
    }
    var s = '';
    var n = c + 1;
    while (n > 0) {
      var m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s + (r + 1);
  }

  function parseRels(xml) {
    var map = {};
    var re = /<Relationship\b([^>]*)\/?>/gi;
    var m;
    while ((m = re.exec(xml || ''))) {
      var id = /\bId="([^"]+)"/i.exec(m[1]);
      var target = /\bTarget="([^"]+)"/i.exec(m[1]);
      if (id && target) map[id[1]] = String(target[1]).replace(/\\/g, '/');
    }
    return map;
  }

  function resolveRel(fromPath, target) {
    if (!target) return '';
    var t = String(target).replace(/\\/g, '/').replace(/^\//, '');
    if (/^xl\//i.test(t)) return t;
    var from = String(fromPath || '').replace(/\/[^/]+$/, '');
    var parts = (from + '/' + t).split('/');
    var out = [];
    parts.forEach(function (p) {
      if (!p || p === '.') return;
      if (p === '..') out.pop();
      else out.push(p);
    });
    return out.join('/');
  }

  function parseOleObjects(sheetXml) {
    var list = [];
    var seen = {};
    var re = /<oleObject\b([^>]*)\/?>/gi;
    var m;
    while ((m = re.exec(sheetXml || ''))) {
      var attrs = m[1];
      var shape = /shapeId="([^"]+)"/i.exec(attrs);
      var rid = /\br:id="([^"]+)"/i.exec(attrs);
      if (!rid) continue;
      var item = { shapeId: shape ? String(shape[1]) : '', rid: rid[1] };
      if (seen[item.rid]) continue;
      seen[item.rid] = true;
      list.push(item);
    }
    return list;
  }

  function parseVmlAnchors(vml) {
    var map = {};
    var re = /<v:shape\b([^>]*)>([\s\S]*?)<\/v:shape>/gi;
    var m;
    while ((m = re.exec(vml || ''))) {
      var idAttr = /\bid="([^"]+)"/i.exec(m[1]);
      var anchor = /<x:Anchor>([\s\S]*?)<\/x:Anchor>/i.exec(m[2]);
      if (!idAttr || !anchor) continue;
      var parts = anchor[1].split(',').map(function (s) { return parseInt(String(s).trim(), 10); });
      if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[2])) continue;
      var pos = { c: parts[0], r: parts[2] };
      var id = idAttr[1];
      var shapeId = String(id).replace(/^.*s/i, '');
      map[shapeId] = pos;
      map[id] = pos;
    }
    return map;
  }

  function parseEmbedFormulaCells(sheetXml) {
    var cells = [];
    var re = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    var m;
    while ((m = re.exec(sheetXml || ''))) {
      var r = /(?:^|\s)r="([^"]+)"/.exec(m[1]);
      if (!r) continue;
      if (/EMBED\s*\(/i.test(m[2]) || /Packager Shell Object/i.test(m[2])) {
        cells.push(r[1]);
      }
    }
    return cells;
  }

  function cellAddressForOle(ole, index, anchors, embedCells) {
    if (ole && ole.shapeId && anchors) {
      var pos = anchors[String(ole.shapeId)] || anchors['_x0000_s' + ole.shapeId];
      if (pos) return encodeCell(pos.r, pos.c);
    }
    if (embedCells && embedCells[index]) return embedCells[index];
    return '';
  }

  function readAsciiZ(u8, offset) {
    var start = offset;
    while (offset < u8.length && u8[offset] !== 0) offset += 1;
    var chars = [];
    var i;
    for (i = start; i < offset; i += 1) chars.push(u8[i]);
    return {
      value: String.fromCharCode.apply(null, chars),
      offset: offset < u8.length ? offset + 1 : offset
    };
  }

  function parseOle10Native(bytes) {
    var u8 = toU8(bytes);
    if (u8.length < 6) return null;
    var view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var offset = 0;
    var declared = view.getUint32(0, true);
    var verAt0 = view.getUint16(0, true);
    var verAt4 = u8.length >= 6 ? view.getUint16(4, true) : 0;
    if (verAt0 !== 2 && verAt4 === 2 && declared > 0 && declared + 4 <= u8.length) {
      offset = 4;
    }
    if (offset + 2 > u8.length) return null;
    var version = view.getUint16(offset, true);
    offset += 2;
    if (version !== 2 && version !== 0) {
      return fallbackEmbeddedFile(u8, 'attachment.bin');
    }
    var label = readAsciiZ(u8, offset);
    offset = label.offset;
    var src = readAsciiZ(u8, offset);
    offset = src.offset;
    var name = sanitizeFilename(src.value || label.value || 'attachment.bin');
    if (offset + 8 > u8.length) return fallbackEmbeddedFile(u8, name);
    offset += 4;
    var pathLen = view.getUint32(offset, true);
    offset += 4;
    if (pathLen < 0 || offset + pathLen > u8.length) return fallbackEmbeddedFile(u8, name);
    offset += pathLen;
    if (offset + 4 > u8.length) return fallbackEmbeddedFile(u8, name);
    var dataLen = view.getUint32(offset, true);
    offset += 4;
    if (dataLen <= 0 || offset + dataLen > u8.length) return fallbackEmbeddedFile(u8, name);
    return {
      name: name,
      bytes: u8.slice(offset, offset + dataLen)
    };
  }

  function fallbackEmbeddedFile(u8, name) {
    var pdf = indexOfBytes(u8, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    if (pdf < 0) return null;
    var end = u8.length;
    var eof = indexOfBytes(u8, [0x25, 0x25, 0x45, 0x4f, 0x46]);
    if (eof >= pdf) {
      end = eof + 5;
      if (end < u8.length && u8[end] === 0x0d) end += 1;
      if (end < u8.length && u8[end] === 0x0a) end += 1;
    }
    return {
      name: /\.pdf$/i.test(name) ? name : 'attachment.pdf',
      bytes: u8.slice(pdf, end)
    };
  }

  function indexOfBytes(u8, seq) {
    var i;
    var j;
    outer: for (i = 0; i <= u8.length - seq.length; i += 1) {
      for (j = 0; j < seq.length; j += 1) {
        if (u8[i + j] !== seq[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function parseOlePackage(bin) {
    var u8 = toU8(bin);
    if (!u8.length) return null;
    var XLSX = global.XLSX;
    if (XLSX && XLSX.CFB && typeof XLSX.CFB.read === 'function') {
      try {
        var cfb = XLSX.CFB.read(u8, { type: 'array' });
        var files = (cfb && cfb.FileIndex) || [];
        var native = files.filter(function (entry) {
          return entry && /Ole10Native/i.test(entry.name || '') && entry.content;
        })[0];
        if (native) {
          var parsed = parseOle10Native(native.content);
          if (parsed) return parsed;
        }
        var pkg = files.filter(function (entry) {
          return entry && /Package/i.test(entry.name || '') && entry.content && entry.content.length > 20;
        })[0];
        if (pkg) {
          return { name: 'attachment.bin', bytes: toU8(pkg.content) };
        }
      } catch (err) {}
    }
    return parseOle10Native(u8);
  }

  function firstSheetPath(files, workbookXml, workbookRelsXml) {
    var rels = parseRels(workbookRelsXml || '');
    var m = /<sheet\b([^>]*)\/?>/i.exec(workbookXml || '');
    if (m) {
      var rid = /\br:id="([^"]+)"/i.exec(m[1]);
      if (rid && rels[rid[1]]) {
        var target = rels[rid[1]].replace(/^\//, '');
        if (!/^xl\//i.test(target)) target = 'xl/' + target;
        return target.replace(/\\/g, '/');
      }
    }
    var names = Object.keys(files || {}).filter(function (n) {
      return /^xl\/worksheets\/sheet\d+\.xml$/i.test(n);
    }).sort();
    return names[0] || '';
  }

  function extractOleCellMap(arrayBuffer) {
    var files = findZipLocalFiles(arrayBuffer);
    return Promise.all([
      readZipText(files['xl/workbook.xml']),
      readZipText(files['xl/_rels/workbook.xml.rels'])
    ]).then(function (wbParts) {
      var sheetPath = firstSheetPath(files, wbParts[0], wbParts[1]);
      if (!sheetPath || !files[sheetPath]) return {};
      var relsPath = sheetPath.replace(/^(.*)\/([^/]+)$/, '$1/_rels/$2.rels');
      return Promise.all([
        readZipText(files[sheetPath]),
        readZipText(files[relsPath])
      ]).then(function (sheetParts) {
        var sheetXml = sheetParts[0] || '';
        var rels = parseRels(sheetParts[1] || '');
        var oleTags = parseOleObjects(sheetXml);
        if (!oleTags.length) return {};
        var embedCells = parseEmbedFormulaCells(sheetXml);
        var vmlRid = '';
        var legacy = /<legacyDrawing\b([^>]*)\/?>/i.exec(sheetXml);
        if (legacy) {
          var vid = /\br:id="([^"]+)"/i.exec(legacy[1]);
          if (vid) vmlRid = vid[1];
        }
        var vmlPath = vmlRid && rels[vmlRid] ? resolveRel(sheetPath, rels[vmlRid]) : '';
        var vmlPromise = vmlPath && files[vmlPath] ? readZipText(files[vmlPath]) : Promise.resolve('');
        return vmlPromise.then(function (vml) {
          var anchors = parseVmlAnchors(vml);
          var map = {};
          var chain = Promise.resolve();
          oleTags.forEach(function (ole, i) {
            chain = chain.then(function () {
              var target = rels[ole.rid];
              if (!target) return;
              var binPath = resolveRel(sheetPath, target);
              if (!files[binPath]) return;
              return readZipBytes(files[binPath]).then(function (bin) {
                var parsed = parseOlePackage(bin);
                if (!parsed || !parsed.bytes || !parsed.bytes.length) return;
                var addr = cellAddressForOle(ole, i, anchors, embedCells);
                if (addr) map[addr] = parsed;
              });
            });
          });
          return chain.then(function () { return map; });
        });
      });
    }).catch(function () {
      return {};
    });
  }

  function applyOleMapToRows(sheet, rows, oleMap) {
    if (!sheet || !rows || !oleMap) return 0;
    var addrs = Object.keys(oleMap);
    if (!addrs.length) return 0;
    var XLSX = global.XLSX;
    if (!XLSX || !XLSX.utils || !sheet['!ref']) return 0;
    var range = XLSX.utils.decode_range(sheet['!ref']);
    var headerRow = range.s.r;
    var headers = [];
    var c;
    for (c = range.s.c; c <= range.e.c; c++) {
      var hAddr = XLSX.utils.encode_cell({ r: headerRow, c: c });
      var hCell = sheet[hAddr];
      var hVal = '';
      if (hCell) {
        if (hCell.w != null) hVal = String(hCell.w);
        else if (hCell.v != null) hVal = String(hCell.v);
      }
      headers.push(hVal !== '' ? hVal : 'Column' + (c + 1));
    }
    var count = 0;
    rows.forEach(function (row, i) {
      var r = row.__sheetRow != null ? row.__sheetRow : (headerRow + 1 + i);
      var byHeader = {};
      var any = false;
      for (c = range.s.c; c <= range.e.c; c++) {
        var addr = XLSX.utils.encode_cell({ r: r, c: c });
        if (oleMap[addr] && oleMap[addr].bytes && oleMap[addr].bytes.length) {
          byHeader[headers[c - range.s.c]] = oleMap[addr];
          any = true;
        }
      }
      if (any) {
        Object.defineProperty(row, '__oleByHeader', {
          value: byHeader,
          enumerable: false,
          configurable: true
        });
        count += 1;
      }
    });
    return count;
  }

  /**
   * Build addr → HTML map with real Excel colors from the xlsx ZIP.
   */
  function extractRichHtmlMap(arrayBuffer, theme) {
    var files = findZipLocalFiles(arrayBuffer);
    var themePromise = files['xl/theme/theme1.xml']
      ? readZipText(files['xl/theme/theme1.xml']).then(parseThemeXml)
      : Promise.resolve(theme && theme.length ? theme : DEFAULT_THEME.slice());

    return themePromise.then(function (scheme) {
      var sstEntry = files['xl/sharedStrings.xml'];
      var sstPromise = sstEntry
        ? readZipText(sstEntry).then(function (xml) { return parseSharedStrings(xml, scheme); })
        : Promise.resolve([]);

      return sstPromise.then(function (sharedHtml) {
        var sheetNames = Object.keys(files).filter(function (n) {
          return /^xl\/worksheets\/sheet\d+\.xml$/i.test(n);
        });
        // Prefer sheet1 first
        sheetNames.sort();
        var map = {};
        var chain = Promise.resolve();
        sheetNames.forEach(function (name) {
          chain = chain.then(function () {
            return readZipText(files[name]).then(function (xml) {
              var part = parseWorksheetRich(xml, sharedHtml, scheme);
              Object.keys(part).forEach(function (k) { map[k] = part[k]; });
            });
          });
        });
        return chain.then(function () {
          return { map: map, theme: scheme };
        });
      });
    });
  }

  var api = {
    DEFAULT_THEME: DEFAULT_THEME,
    looksLikeHtml: looksLikeHtml,
    richXmlToHtml: richXmlToHtml,
    cellDisplayValue: cellDisplayValue,
    sheetToRichJson: sheetToRichJson,
    themeFromWorkbook: themeFromWorkbook,
    parseThemeXml: parseThemeXml,
    applyRichHtmlMap: applyRichHtmlMap,
    extractRichHtmlMap: extractRichHtmlMap,
    parseOle10Native: parseOle10Native,
    parseOleObjects: parseOleObjects,
    parseVmlAnchors: parseVmlAnchors,
    parseEmbedFormulaCells: parseEmbedFormulaCells,
    cellAddressForOle: cellAddressForOle,
    extractOleCellMap: extractOleCellMap,
    applyOleMapToRows: applyOleMapToRows
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.MailMassSheetRich = api;
})(typeof window !== 'undefined' ? window : globalThis);
