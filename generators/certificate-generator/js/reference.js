(function attachCertReference(global) {
  'use strict';

  var CertGen = global.CertGen || {};

  function mapFontFamily(pdfFamily, fontName) {
    var source = String(pdfFamily || '') + ' ' + String(fontName || '');
    var s = source.toLowerCase();
    if (/cinzel|trajan|copperplate/.test(s)) return 'Cinzel';
    if (/playfair/.test(s)) return 'Playfair Display';
    if (/garamond/.test(s)) return 'EB Garamond';
    if (/script|chancery|zapf|vibes|calligraphy|italic-hand|allura|snell|edwardian|pinyon|alex/.test(s)) return 'Great Vibes';
    if (/courier|mono|typewriter/.test(s)) return 'Courier New';
    if (/arial|helvetica|calibri|verdana|tahoma|sans/.test(s)) return 'Arial';
    if (/times|georgia|palatino|minion|serif/.test(s)) return 'Times New Roman';
    return 'Georgia';
  }

  function isBoldName(name) {
    return /bold|black|heavy|semibold|demi/i.test(String(name || ''));
  }

  function isItalicName(name) {
    return /italic|oblique/i.test(String(name || ''));
  }

  function detectCapitalization(text) {
    var t = String(text || '').trim();
    var letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (!letters) return 'as-is';
    if (letters === letters.toUpperCase() && /[A-Z]/.test(letters)) return 'upper';
    if (letters === letters.toLowerCase()) return 'lower';
    var words = t.split(/\s+/).filter(Boolean);
    var titled = words.every(function (word) {
      var ch = word.charAt(0);
      return !/[A-Za-zÀ-ÿ]/.test(ch) || ch === ch.toUpperCase();
    });
    return titled ? 'title' : 'as-is';
  }

  function applyCapitalization(text, style) {
    var value = String(text == null ? '' : text);
    if (style === 'upper') return value.toUpperCase();
    if (style === 'lower') return value.toLowerCase();
    if (style === 'title') {
      return value.replace(/\S+/g, function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      });
    }
    return value;
  }

  function guessAlignment(xPct, widthPct) {
    var center = xPct + widthPct / 2;
    if (widthPct >= 32 || Math.abs(center - 50) <= 14) return 'center';
    if (center < 40) return 'left';
    if (center > 60) return 'right';
    return 'center';
  }

  function expandFieldBox(item, alignment, replaceMode) {
    var cx = item.x + item.width / 2;
    var height = Math.max(item.height * (replaceMode ? 1.18 : 1.45), 3.2);
    var width;
    var x;
    if (alignment === 'left') {
      width = Math.min(80 - item.x, Math.max(item.width * (replaceMode ? 1.25 : 2.6), 38));
      x = item.x;
    } else if (alignment === 'right') {
      width = Math.min(item.x + item.width, Math.max(item.width * (replaceMode ? 1.25 : 2.6), 38));
      x = item.x + item.width - width;
    } else {
      width = Math.min(replaceMode ? 78 : 82, Math.max(item.width * (replaceMode ? 1.18 : 2.8), replaceMode ? 52 : 46));
      x = cx - width / 2;
    }
    if (x < 2) x = 2;
    if (x + width > 98) width = 98 - x;
    var y = item.y - (height - item.height) / 2;
    if (y < 1) y = 1;
    if (y + height > 98) height = 98 - y;
    return { x: x, y: y, width: width, height: height };
  }

  function guessDateFormat(text) {
    var t = String(text || '').trim();
    if (/^[A-Za-z]{3,}\s+\d{4}$/.test(t) && monthish(t.split(/\s+/)[0])) return 'MMMM YYYY';
    if (/^\d{1,2}\s+[A-Za-z]{3,}$/.test(t) && monthish(t.split(/\s+/)[1])) return 'DD MMMM';
    if (/^\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}$/.test(t) && t.length > 11) return 'DD MMMM YYYY';
    if (/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(t)) return 'DD MMM YYYY';
    if (/^[A-Za-z]+\s+\d{1,2},\s+\d{4}$/.test(t)) return 'MMMM DD, YYYY';
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return 'YYYY-MM-DD';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return 'DD/MM/YYYY';
    return 'DD MMMM YYYY';
  }

  function monthish(word) {
    var Format = CertGen.Format;
    if (!Format || !Format.parseDate) return /aug|jan|feb|mar|apr|may|jun|jul|sep|oct|nov|dec/i.test(word || '');
    return !!Format.parseDate('1 ' + word + ' 2026') || !!Format.parseDate(word + ' 2026');
  }

  function guessFieldMeta(text, hit) {
    var Format = CertGen.Format;
    if (text && Format && Format.parseDate(text)) {
      return { label: 'Completion Date', type: 'date', dateFormat: guessDateFormat(text) };
    }
    if (text && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(text).trim())) {
      return { label: 'Email', type: 'email' };
    }
    if (text && /^\d[\d\s\-A-Za-z]{1,18}$/.test(String(text).trim()) && String(text).replace(/\D/g, '').length >= 2) {
      return { label: 'Certificate ID', type: 'id' };
    }
    if ((!text || !String(text).trim()) && hit) {
      var midY = hit.y + hit.height / 2;
      if (midY > 78 || (midY > 70 && hit.height < 4.5)) {
        return { label: 'Completion Date', type: 'date', dateFormat: 'MMMM YYYY' };
      }
      if (hit.width < 14 && midY > 68 && hit.x > 55) {
        return { label: 'Certificate ID', type: 'id' };
      }
      if (hit.height >= 3 && midY < 58) {
        return { label: 'Recipient Name', type: 'text' };
      }
    }
    return { label: 'Recipient Name', type: 'text' };
  }

  function findColumn(columns, names) {
    var cols = columns || [];
    var i;
    var j;
    for (i = 0; i < names.length; i += 1) {
      for (j = 0; j < cols.length; j += 1) {
        if (String(cols[j]).toLowerCase() === String(names[i]).toLowerCase()) return cols[j];
      }
    }
    return '';
  }

  function guessExcelColumn(label, type, columns) {
    var cols = columns || [];
    var preferred = [];
    if (type === 'date') preferred = ['Date', 'Certificate Date', 'Completion Date', 'Training Completion Date'];
    else if (type === 'id') preferred = ['ID', 'Certificate ID', 'Certificate Number'];
    else if (type === 'email') preferred = ['Email', 'E-mail'];
    else preferred = ['Name', 'Full Name', 'Recipient', 'Participant Name', 'Employee'];
    var match = findColumn(cols, preferred);
    if (match) return match;
    var needle = type === 'date' ? /date/i : type === 'id' ? /id|number/i : /name/i;
    var i;
    for (i = 0; i < cols.length; i += 1) {
      if (needle.test(cols[i])) return cols[i];
    }
    return '';
  }

  function rgbToHex(r, g, b) {
    function h(n) {
      var s = Math.max(0, Math.min(255, Math.round(n))).toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + h(r) + h(g) + h(b);
  }

  function sampleTextColorFromData(data, width) {
    if (!data || !data.length) return '#1a1a1a';
    var count = data.length / 4;
    var height = width ? Math.round(count / width) : 0;
    var i;
    var bgR = 0;
    var bgG = 0;
    var bgB = 0;
    var bgN = 0;
    function addBg(idx) {
      if (data[idx + 3] < 80) return;
      bgR += data[idx];
      bgG += data[idx + 1];
      bgB += data[idx + 2];
      bgN += 1;
    }
    if (width && height >= 2) {
      var x;
      var y;
      for (x = 0; x < width; x += 1) {
        addBg((0 * width + x) * 4);
        addBg(((height - 1) * width + x) * 4);
      }
      for (y = 1; y < height - 1; y += 1) {
        addBg((y * width + 0) * 4);
        addBg((y * width + (width - 1)) * 4);
      }
    } else {
      for (i = 0; i < data.length; i += 4) addBg(i);
    }
    if (!bgN) return '#1a1a1a';
    bgR /= bgN;
    bgG /= bgN;
    bgB /= bgN;
    var tr = 0;
    var tg = 0;
    var tb = 0;
    var tn = 0;
    for (i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 80) continue;
      var dr = data[i] - bgR;
      var dg = data[i + 1] - bgG;
      var db = data[i + 2] - bgB;
      if ((dr * dr + dg * dg + db * db) < 48 * 48) continue;
      tr += data[i];
      tg += data[i + 1];
      tb += data[i + 2];
      tn += 1;
    }
    if (tn < 3) {
      var bgBright = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
      return bgBright > 140 ? '#1a1a1a' : '#ffffff';
    }
    var bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
    var inkBins = [];
    var inkSums = [];
    for (i = 0; i < 24; i += 1) {
      inkBins[i] = 0;
      inkSums[i] = [0, 0, 0];
    }
    for (i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 80) continue;
      var dr2 = data[i] - bgR;
      var dg2 = data[i + 1] - bgG;
      var db2 = data[i + 2] - bgB;
      if ((dr2 * dr2 + dg2 * dg2 + db2 * db2) < 48 * 48) continue;
      var inkLum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      var inkBin = Math.min(23, Math.floor(inkLum / 10.67));
      inkBins[inkBin] += 1;
      inkSums[inkBin][0] += data[i];
      inkSums[inkBin][1] += data[i + 1];
      inkSums[inkBin][2] += data[i + 2];
    }
    var pick = bgLum < 140 ? 23 : 0;
    var step = bgLum < 140 ? -1 : 1;
    var end = bgLum < 140 ? -1 : 24;
    for (i = pick; i !== end; i += step) {
      if (inkBins[i] >= 3) {
        return rgbToHex(inkSums[i][0] / inkBins[i], inkSums[i][1] / inkBins[i], inkSums[i][2] / inkBins[i]);
      }
    }
    return rgbToHex(tr / tn, tg / tn, tb / tn);
  }

  function sampleBackgroundColorFromData(data, targetLum) {
    if (!data || !data.length) return '#ffffff';
    var i;
    var bins = [];
    var sums = [];
    for (i = 0; i < 24; i += 1) {
      bins[i] = 0;
      sums[i] = [0, 0, 0];
    }
    var counted = 0;
    for (i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 80) continue;
      var lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      var bin = Math.min(23, Math.floor(lum / 10.67));
      bins[bin] += 1;
      sums[bin][0] += data[i];
      sums[bin][1] += data[i + 1];
      sums[bin][2] += data[i + 2];
      counted += 1;
    }
    if (!counted) return '#ffffff';
    var pageDark = targetLum != null && Number.isFinite(targetLum) ? targetLum < 110 : true;
    var majority = 0;
    for (i = 1; i < 24; i += 1) {
      if (bins[i] > bins[majority]) majority = i;
    }
    if (targetLum == null) pageDark = majority < 12;
    var best = majority;
    var minShare = Math.max(6, counted * 0.08);
    if (pageDark) {
      best = 23;
      for (i = 0; i < 24; i += 1) {
        if (bins[i] >= minShare) {
          best = i;
          break;
        }
      }
    } else {
      best = 0;
      for (i = 23; i >= 0; i -= 1) {
        if (bins[i] >= minShare) {
          best = i;
          break;
        }
      }
    }
    if (!bins[best]) best = majority;
    return rgbToHex(sums[best][0] / bins[best], sums[best][1] / bins[best], sums[best][2] / bins[best]);
  }

  function canvasCornerLum(canvas) {
    if (!canvas || !canvas.getContext) return null;
    try {
      var ctx = canvas.getContext('2d');
      var w = canvas.width;
      var h = canvas.height;
      function lum(x, y) {
        var px = ctx.getImageData(x, y, 1, 1).data;
        return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2];
      }
      var lums = [lum(2, 2), lum(w - 3, 2), lum(2, h - 3), lum(w - 3, h - 3)].sort(function (a, b) { return a - b; });
      return (lums[1] + lums[2]) / 2;
    } catch (err) {
      return null;
    }
  }

  function sampleTextColor(canvas, x, y, w, h) {
    if (!canvas || !canvas.getContext) return '#1a1a1a';
    var ctx = canvas.getContext('2d');
    var sx = Math.max(0, Math.floor(x));
    var sy = Math.max(0, Math.floor(y));
    var sw = Math.max(1, Math.min(canvas.width - sx, Math.ceil(w)));
    var sh = Math.max(1, Math.min(canvas.height - sy, Math.ceil(h)));
    try {
      return sampleTextColorFromData(ctx.getImageData(sx, sy, sw, sh).data, sw);
    } catch (err) {
      return '#1a1a1a';
    }
  }

  function mergeLineItems(items) {
    var sorted = (items || []).slice().sort(function (a, b) {
      if (Math.abs(a.y - b.y) > Math.max(a.height, b.height) * 0.5) return a.y - b.y;
      return a.x - b.x;
    });
    var groups = [];
    sorted.forEach(function (item) {
      var last = groups[groups.length - 1];
      var gap = last ? item.x - (last.x + last.width) : 99;
      var sameLine = last &&
        Math.abs(last.y - item.y) < Math.max(last.height, item.height) * 0.55 &&
        Math.abs(last.fontSize - item.fontSize) < 1.5 &&
        last.fontFamily === item.fontFamily;
      if (sameLine && gap > -0.6 && gap < 2.2) {
        last.text += (gap > 0.18 ? ' ' : '') + item.text;
        last.width = item.x + item.width - last.x;
        last.height = Math.max(last.height, item.height);
      } else {
        groups.push({
          id: item.id,
          text: item.text,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          fontSize: item.fontSize,
          fontFamily: item.fontFamily,
          fontWeight: item.fontWeight,
          fontStyle: item.fontStyle,
          textColor: item.textColor,
          rotation: item.rotation || 0
        });
      }
    });
    return groups;
  }

  function itemsFromTextContent(content, viewport, canvas) {
    var pdfjsLib = global.pdfjsLib;
    if (!pdfjsLib || !pdfjsLib.Util) return [];
    var styles = content.styles || {};
    var pageW = viewport.width;
    var pageH = viewport.height;
    var raw = [];
    (content.items || []).forEach(function (item, index) {
      var text = item && item.str != null ? String(item.str).replace(/\s+/g, ' ').trim() : '';
      if (!text) return;
      var tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      var fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]) || 12;
      var style = styles[item.fontName] || {};
      var ascent = style.ascent ? style.ascent * fontHeight : fontHeight * 0.8;
      var left = tx[4];
      var top = tx[5] - ascent;
      var width = (item.width || 0) * (viewport.scale || 1);
      if (width < 1) width = fontHeight * text.length * 0.5;
      var height = fontHeight * 1.15;
      var fontSource = (style.fontFamily || '') + ' ' + (item.fontName || '');
      raw.push({
        id: 't_' + index,
        text: text,
        x: left / pageW * 100,
        y: top / pageH * 100,
        width: width / pageW * 100,
        height: height / pageH * 100,
        fontSize: fontHeight,
        fontFamily: mapFontFamily(style.fontFamily, item.fontName),
        fontWeight: isBoldName(fontSource) ? 'bold' : 'normal',
        fontStyle: isItalicName(fontSource) ? 'italic' : 'normal',
        textColor: sampleTextColor(canvas, left, top, width, height),
        rotation: Math.atan2(tx[1], tx[0]) * 180 / Math.PI
      });
    });
    return mergeLineItems(raw).map(function (item, i) {
      item.id = 'hit_' + i;
      item.alignment = guessAlignment(item.x, item.width);
      item.capitalization = detectCapitalization(item.text);
      return item;
    });
  }

  function lumAt(data, width, x, y) {
    var i = (y * width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  function styleFromBox(hit) {
    var midY = hit.y + hit.height / 2;
    if (hit.height >= 3.2 && midY < 58) {
      return { fontFamily: 'Great Vibes', fontWeight: 'normal', fontStyle: 'normal', capitalization: 'title' };
    }
    if (midY > 70) {
      return { fontFamily: 'Arial', fontWeight: 'bold', fontStyle: 'normal', capitalization: 'title' };
    }
    return { fontFamily: 'Arial', fontWeight: 'normal', fontStyle: 'normal', capitalization: 'as-is' };
  }

  function itemsFromImageCanvas(canvas) {
    if (!canvas || !canvas.getContext) return [];
    var srcW = canvas.width;
    var srcH = canvas.height;
    if (!srcW || !srcH) return [];
    var maxEdge = 3600;
    var scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    var w = Math.max(1, Math.round(srcW * scale));
    var h = Math.max(1, Math.round(srcH * scale));
    var work = canvas;
    if (scale < 1) {
      work = document.createElement('canvas');
      work.width = w;
      work.height = h;
      work.getContext('2d').drawImage(canvas, 0, 0, w, h);
    }
    var ctx = work.getContext('2d');
    var data;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch (err) {
      return [];
    }
    var bg = (lumAt(data, w, 2, 2) + lumAt(data, w, w - 3, 2) + lumAt(data, w, 2, h - 3) + lumAt(data, w, w - 3, h - 3)) / 4;
    var contrast = 42;
    var active = [];
    var y;
    var x;
    for (y = 0; y < h; y += 1) {
      var count = 0;
      for (x = 0; x < w; x += 2) {
        if (Math.abs(lumAt(data, w, x, y) - bg) > contrast) count += 1;
      }
      active[y] = count * 2 > w * 0.055;
    }
    var groups = [];
    y = 0;
    while (y < h) {
      while (y < h && !active[y]) y += 1;
      if (y >= h) break;
      var start = y;
      while (y < h && active[y]) y += 1;
      var end = y - 1;
      var heightPct = (end - start + 1) / h * 100;
      if (heightPct < 0.7 || heightPct > 12) continue;
      var minX = w;
      var maxX = 0;
      var yy;
      var xx;
      for (yy = start; yy <= end; yy += 1) {
        for (xx = 0; xx < w; xx += 1) {
          if (Math.abs(lumAt(data, w, xx, yy) - bg) > contrast) {
            if (xx < minX) minX = xx;
            if (xx > maxX) maxX = xx;
          }
        }
      }
      if (maxX <= minX) continue;
      var widthPct = (maxX - minX + 1) / w * 100;
      if (widthPct < 6 || widthPct > 82) continue;
      if (widthPct * heightPct > 26) continue;
      groups.push({
        x: minX / w * 100,
        y: start / h * 100,
        width: widthPct,
        height: heightPct
      });
    }
    return groups.slice(0, 18).map(function (box, i) {
      var style = styleFromBox(box);
      var px = Math.max(0, Math.floor(box.x / 100 * srcW));
      var py = Math.max(0, Math.floor(box.y / 100 * srcH));
      var pw = Math.max(1, Math.ceil(box.width / 100 * srcW));
      var ph = Math.max(1, Math.ceil(box.height / 100 * srcH));
      return {
        id: 'hit_' + i,
        text: '',
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        fontSize: Math.max(12, ph * 0.72),
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        textColor: sampleTextColor(canvas, px, py, pw, ph),
        backgroundColor: (function () {
          try {
            var slice = canvas.getContext('2d').getImageData(px, py, Math.max(1, pw), Math.max(1, ph)).data;
            return sampleBackgroundColorFromData(slice, bg);
          } catch (err) {
            return '#1a2a4a';
          }
        })(),
        rotation: 0,
        alignment: guessAlignment(box.x, box.width),
        capitalization: style.capitalization
      };
    });
  }

  function detectionCanvas(canvas) {
    var srcW = canvas.width;
    var srcH = canvas.height;
    var maxEdge = 3600;
    var scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    if (scale >= 0.98 || typeof document === 'undefined' || !document.createElement) {
      return { canvas: canvas, w: srcW, h: srcH };
    }
    var w = Math.max(1, Math.round(srcW * scale));
    var h = Math.max(1, Math.round(srcH * scale));
    var work = document.createElement('canvas');
    work.width = w;
    work.height = h;
    work.getContext('2d').drawImage(canvas, 0, 0, w, h);
    return { canvas: work, w: w, h: h };
  }

  function regionFromClick(canvas, xPct, yPct) {
    if (!canvas || !canvas.getContext) return null;
    var work = detectionCanvas(canvas);
    var w = work.w;
    var h = work.h;
    var data;
    try {
      data = work.canvas.getContext('2d').getImageData(0, 0, w, h).data;
    } catch (err) {
      return null;
    }
    var cx = Math.max(0, Math.min(w - 1, Math.round(xPct / 100 * w)));
    var cy = Math.max(0, Math.min(h - 1, Math.round(yPct / 100 * h)));
    var bg = (lumAt(data, w, 2, 2) + lumAt(data, w, w - 3, 2) + lumAt(data, w, 2, h - 3) + lumAt(data, w, w - 3, h - 3)) / 4;
    var fg = lumAt(data, w, cx, cy);
    var maxW = Math.round(w * 0.72);
    var maxH = Math.round(h * 0.11);
    var wordGap = Math.max(18, Math.round(w * 0.028));
    var searchR = Math.max(36, Math.round(Math.min(w, h) * 0.1));
    var minStroke = Math.max(3, Math.round(h * 0.0035));
    var rowGap = Math.max(2, Math.round(h * 0.0028));

    function contrastEnough(value) {
      return Math.abs(value - bg) > 48;
    }
    function isText(ix, iy) {
      if (ix < 0 || iy < 0 || ix >= w || iy >= h) return false;
      var i = (iy * w + ix) * 4;
      var r = data[i];
      var g = data[i + 1];
      var b = data[i + 2];
      var value = 0.299 * r + 0.587 * g + 0.114 * b;
      if (!contrastEnough(value)) return false;
      if (bg < 95) {
        var blueBias = b - r;
        if (blueBias > 40 && value > 90) return false;
        if (r - b > 36 && r > 90) return false;
        return value > 118;
      }
      return Math.abs(value - fg) + 14 < Math.abs(value - bg);
    }
    function strokeHeight(ix, iy) {
      if (!isText(ix, iy)) return 0;
      var up = 0;
      var down = 0;
      var cap = maxH;
      while (up < cap && isText(ix, iy - up - 1)) up += 1;
      while (down < cap && isText(ix, iy + down + 1)) down += 1;
      return up + down + 1;
    }
    function rowOccupancy(y, l, r) {
      var hits = 0;
      var span = r - l + 1;
      var step = span > 400 ? 3 : 1;
      var x;
      for (x = l; x <= r; x += step) {
        if (isText(x, y)) hits += 1;
      }
      return (hits * step) / Math.max(1, span);
    }
    function isHairlineRow(y, l, r) {
      var occ = rowOccupancy(y, l, r);
      if (occ < 0.38) return false;
      var above = y > 0 ? rowOccupancy(y - 1, l, r) : 0;
      var below = y < h - 1 ? rowOccupancy(y + 1, l, r) : 0;
      return above < 0.05 && below < 0.05;
    }
    function rowMaxStroke(y, l, r) {
      var maxSh = 0;
      var span = r - l + 1;
      var step = Math.max(3, Math.floor(span / 16));
      var x;
      for (x = l; x <= r; x += step) {
        if (!isText(x, y)) continue;
        var sh = strokeHeight(x, y);
        if (sh > maxSh) maxSh = sh;
      }
      return maxSh;
    }
    function rowTextish(y, l, r, seedStroke) {
      if (y < 0 || y >= h) return false;
      if (isHairlineRow(y, l, r)) return false;
      var occ = rowOccupancy(y, l, r);
      if (occ < 0.008) return false;
      var maxSh = rowMaxStroke(y, l, r);
      if (seedStroke && maxSh > seedStroke * 1.5) return true;
      if (seedStroke && maxSh > 0 && maxSh < seedStroke * 0.34 && occ > 0.03) return false;
      return occ >= 0.008;
    }
    function jumpToText(from, dir, left, right, stroke) {
      var i;
      for (i = 1; i <= rowGap; i += 1) {
        var y = from + dir * i;
        if (y < 0 || y >= h) return 0;
        if (rowTextish(y, left, right, stroke)) return i;
      }
      return 0;
    }

    function pickSeed(startX, startY) {
      var best = null;
      var bestScore = -1;
      var clickStroke = strokeHeight(startX, startY);
      var clickOk = contrastEnough(lumAt(data, w, startX, startY)) && clickStroke >= minStroke;
      if (clickOk) {
        fg = lumAt(data, w, startX, startY);
        return { x: startX, y: startY, stroke: clickStroke };
      }
      var rad;
      var dx;
      var dy;
      for (rad = 1; rad <= searchR; rad += 1) {
        for (dx = -rad; dx <= rad; dx += 1) {
          for (dy = -rad; dy <= rad; dy += 1) {
            if (Math.abs(dx) !== rad && Math.abs(dy) !== rad) continue;
            var nx = startX + dx;
            var ny = startY + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            var value = lumAt(data, w, nx, ny);
            if (!contrastEnough(value)) continue;
            var prevFg = fg;
            fg = value;
            var sh = strokeHeight(nx, ny);
            fg = prevFg;
            if (sh < minStroke) continue;
            var score = sh * 8 - Math.sqrt(dx * dx + dy * dy);
            if (score > bestScore) {
              bestScore = score;
              best = { x: nx, y: ny, stroke: sh, fg: value };
            }
          }
        }
        if (best && best.stroke >= minStroke * 1.8 && rad > 12) break;
      }
      if (!best) {
        var y0 = Math.max(0, startY - Math.round(h * 0.09));
        var y1 = Math.min(h - 1, startY + Math.round(h * 0.09));
        var x0 = Math.max(0, startX - Math.round(w * 0.16));
        var x1 = Math.min(w - 1, startX + Math.round(w * 0.16));
        var yy;
        var xx;
        for (yy = y0; yy <= y1; yy += 3) {
          for (xx = x0; xx <= x1; xx += 4) {
            if (!isText(xx, yy)) continue;
            var sh2 = strokeHeight(xx, yy);
            if (sh2 < minStroke) continue;
            var score2 = sh2 * 6 - Math.abs(yy - startY) * 0.12 - Math.abs(xx - startX) * 0.04;
            if (score2 > bestScore) {
              bestScore = score2;
              best = { x: xx, y: yy, stroke: sh2, fg: lumAt(data, w, xx, yy) };
            }
          }
        }
      }
      if (!best) return null;
      fg = best.fg;
      return best;
    }

    function growFrom(seed) {
      cx = seed.x;
      cy = seed.y;
      fg = lumAt(data, w, cx, cy);
      var probe = Math.max(12, Math.round(w * 0.1));
      var left = Math.max(0, cx - probe);
      var right = Math.min(w - 1, cx + probe);
      var top = cy;
      var bottom = cy;
      while (top > 0 && (bottom - top + 1) < maxH) {
        var up = jumpToText(top, -1, left, right, seed.stroke);
        if (!up) break;
        top -= up;
        var taller = rowMaxStroke(top, left, right);
        if (taller > seed.stroke) seed.stroke = taller;
      }
      while (bottom < h - 1 && (bottom - top + 1) < maxH) {
        var down = jumpToText(bottom, 1, left, right, seed.stroke);
        if (!down) break;
        bottom += down;
        var tallerB = rowMaxStroke(bottom, left, right);
        if (tallerB > seed.stroke) seed.stroke = tallerB;
      }
      var grownBottom = bottom;
      var targetH = Math.max(Math.round(h * 0.06), Math.min(bottom - top + 1, Math.round(h * 0.13)));
      if ((bottom - top + 1) > targetH) {
        var bestTop = top;
        var bestScore = -1;
        var win;
        for (win = top; win + targetH - 1 <= bottom; win += 2) {
          var score = 0;
          var yy;
          for (yy = win; yy < win + targetH; yy += 3) {
            score += rowMaxStroke(yy, left, right) * 4 + rowOccupancy(yy, left, right);
          }
          if (score > bestScore) {
            bestScore = score;
            bestTop = win;
          }
        }
        top = bestTop;
        bottom = Math.min(grownBottom, bestTop + targetH - 1 + Math.round(h * 0.012));
      }
      var bestY = cy;
      var bestOcc = -1;
      var scanL = Math.max(0, Math.round(w * 0.08));
      var scanR = Math.min(w - 1, Math.round(w * 0.92));
      var ry;
      for (ry = top; ry <= bottom; ry += 1) {
        if (isHairlineRow(ry, scanL, scanR)) continue;
        var occ = rowOccupancy(ry, scanL, scanR);
        var sh = rowMaxStroke(ry, scanL, scanR);
        var score = occ * (1 + sh);
        if (score > bestOcc) {
          bestOcc = score;
          bestY = ry;
        }
      }
      var corePad = Math.max(2, Math.round((bottom - top + 1) * 0.18));
      var coreTop = Math.min(bottom, top + corePad);
      var coreBot = Math.max(coreTop, bottom - Math.round((bottom - top + 1) * 0.22));
      function colHasText(x) {
        var y;
        for (y = coreTop; y <= coreBot; y += 1) {
          if (isText(x, y)) return true;
        }
        return false;
      }
      var left = cx;
      var right = cx;
      if (!colHasText(cx)) {
        var foundX = -1;
        var d;
        for (d = 1; d <= probe && foundX < 0; d += 1) {
          if (colHasText(cx - d)) foundX = cx - d;
          else if (colHasText(cx + d)) foundX = cx + d;
        }
        if (foundX >= 0) {
          left = foundX;
          right = foundX;
        }
      }
      while (left > scanL && (right - left + 1) < maxW) {
        var see = false;
        var g;
        for (g = 1; g <= wordGap; g += 1) {
          if (colHasText(left - g)) { see = true; left -= g; break; }
        }
        if (!see) break;
      }
      while (right < scanR && (right - left + 1) < maxW) {
        var seeR = false;
        var gr;
        for (gr = 1; gr <= wordGap; gr += 1) {
          if (colHasText(right + gr)) { seeR = true; right += gr; break; }
        }
        if (!seeR) break;
      }
      var minX = right;
      var maxX = left;
      var minY = bottom;
      var maxY = top;
      var yy2;
      var xx;
      var stepX = (scanR - scanL) > 700 ? 2 : 1;
      for (yy2 = top; yy2 <= bottom; yy2 += 1) {
        for (xx = Math.max(0, left - Math.round(w * 0.1)); xx <= Math.min(w - 1, right + Math.round(w * 0.1)); xx += stepX) {
          if (!isText(xx, yy2)) continue;
          if (xx < minX) minX = xx;
          if (xx > maxX) maxX = xx;
          if (yy2 < minY) minY = yy2;
          if (yy2 > maxY) maxY = yy2;
        }
      }
      if (maxX <= minX || maxY <= minY) {
        minX = left;
        maxX = right;
        minY = top;
        maxY = bottom;
      }
      var boxH = maxY - minY + 1;
      var boxW = maxX - minX + 1;
      if (boxH < Math.max(6, Math.round(h * 0.01)) && boxW > w * 0.28) return null;
      var padX = Math.max(6, Math.min(boxW * 0.05, w * 0.03));
      var padY = Math.max(4, Math.min(boxH * 0.14, h * 0.02));
      return {
        left: Math.max(0, Math.floor(minX - padX)),
        right: Math.min(w - 1, Math.ceil(maxX + padX)),
        top: Math.max(0, Math.floor(minY - padY * 0.7)),
        bottom: Math.min(h - 1, Math.ceil(maxY + padY * 1.4))
      };
    }

    var seed = pickSeed(cx, cy);
    if (!seed) return null;
    var grown = growFrom(seed);
    if (!grown) {
      var retry = pickSeed(cx, Math.max(0, cy - Math.round(h * 0.03)));
      if (retry) grown = growFrom(retry);
    }
    if (!grown) return null;
    var box = {
      id: 'hit_click',
      text: '',
      x: grown.left / w * 100,
      y: grown.top / h * 100,
      width: (grown.right - grown.left) / w * 100,
      height: (grown.bottom - grown.top) / h * 100,
      fontSize: Math.max(12, (grown.bottom - grown.top) / h * canvas.height * 0.72),
      rotation: 0
    };
    if (box.width < 3 || box.height < 0.8) return null;
    if (box.width > 76) {
      box.x += (box.width - 76) / 2;
      box.width = 76;
    }
    if (box.x < 4) box.x = 4;
    if (box.x + box.width > 96) box.width = 96 - box.x;
    if (box.height > 14) {
      box.y += (box.height - 14) * 0.35;
      box.height = 14;
    }
    if (box.y + box.height > 96) box.height = 96 - box.y;
    var style = styleFromBox(box);
    box.fontFamily = style.fontFamily;
    box.fontWeight = style.fontWeight;
    box.fontStyle = style.fontStyle;
    box.capitalization = style.capitalization;
    box.alignment = guessAlignment(box.x, box.width);
    var srcLeft = Math.max(0, Math.round(box.x / 100 * canvas.width));
    var srcTop = Math.max(0, Math.round(box.y / 100 * canvas.height));
    var srcW = Math.max(1, Math.round(box.width / 100 * canvas.width));
    var srcH = Math.max(1, Math.round(box.height / 100 * canvas.height));
    box.textColor = sampleTextColor(canvas, srcLeft, srcTop, srcW, srcH);
    try {
      box.backgroundColor = sampleBackgroundColorFromData(
        canvas.getContext('2d').getImageData(srcLeft, srcTop, srcW, srcH).data,
        bg
      );
    } catch (err) {
      box.backgroundColor = '#1a2a4a';
    }
    return box;
  }

  function boxesOverlap(a, b) {
    var x1 = Math.max(a.x, b.x);
    var y1 = Math.max(a.y, b.y);
    var x2 = Math.min(a.x + a.width, b.x + b.width);
    var y2 = Math.min(a.y + a.height, b.y + b.height);
    var inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    var area = a.width * a.height;
    return area ? inter / area : 0;
  }

  function hitFromBox(canvas, box, id) {
    var w = canvas && canvas.width ? canvas.width : 1;
    var h = canvas && canvas.height ? canvas.height : 1;
    var left = Math.max(0, Math.round(box.x / 100 * w));
    var top = Math.max(0, Math.round(box.y / 100 * h));
    var widthPx = Math.max(1, Math.round(box.width / 100 * w));
    var heightPx = Math.max(1, Math.round(box.height / 100 * h));
    var style = styleFromBox(box);
    var hit = {
      id: id || 'hit_mark',
      text: '',
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      fontSize: Math.max(12, heightPx * 0.72),
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      capitalization: style.capitalization,
      alignment: guessAlignment(box.x, box.width),
      rotation: 0
    };
    if (canvas && canvas.getContext) {
      hit.textColor = sampleTextColor(canvas, left, top, widthPx, heightPx);
      try {
        hit.backgroundColor = sampleBackgroundColorFromData(
          canvas.getContext('2d').getImageData(left, top, widthPx, heightPx).data,
          canvasCornerLum(canvas)
        );
      } catch (err) {
        hit.backgroundColor = '#1a2a4a';
      }
    }
    return hit;
  }

  function refineMark(canvas, box) {
    if (!box || box.width < 1 || box.height < 0.6) return null;
    if (canvas && regionFromClick) {
      var clicked = regionFromClick(canvas, box.x + box.width / 2, box.y + box.height / 2);
      if (clicked && (boxesOverlap(clicked, box) > 0.2 || (
        clicked.x >= box.x - 3 &&
        clicked.y >= box.y - 3 &&
        clicked.x + clicked.width <= box.x + box.width + 3 &&
        clicked.y + clicked.height <= box.y + box.height + 3
      ))) {
        return clicked;
      }
    }
    return canvas ? hitFromBox(canvas, box, 'hit_mark') : null;
  }

  function padCoverBox(hit) {
    var padX = Math.max(1.6, Number(hit.width) * 0.07);
    var padY = Math.max(0.8, Number(hit.height) * 0.18);
    var x = Math.max(0, Number(hit.x) - padX);
    var y = Math.max(0, Number(hit.y) - padY * 0.35);
    var width = Math.min(100 - x, Number(hit.width) + padX * 2);
    var height = Math.min(100 - y, Number(hit.height) + padY * 2.15);
    if (width > 80) {
      var cx = x + width / 2;
      width = 80;
      x = Math.max(6, Math.min(14, cx - 40));
      if (x + width > 96) width = 96 - x;
    }
    if (height > 16) height = 16;
    if (y + height > 98) height = 98 - y;
    return { x: x, y: y, width: width, height: height };
  }

  function fieldFromHit(hit, options) {
    var opts = options || {};
    var alignment = hit.alignment || guessAlignment(hit.x, hit.width);
    var meta = guessFieldMeta(hit.text, hit);
    if (!hit.fontFamily) {
      var guessed = styleFromBox(hit);
      hit.fontFamily = guessed.fontFamily;
      hit.fontWeight = hit.fontWeight || guessed.fontWeight;
      hit.fontStyle = hit.fontStyle || guessed.fontStyle;
      hit.capitalization = hit.capitalization || guessed.capitalization;
    }
    var refH = (opts.reference && opts.reference.heightPx) || 1;
    var blankH = (opts.template && opts.template.heightPx) || refH;
    var scale = blankH / refH;
    var cover = padCoverBox(hit);
    var box = opts.replaceMode
      ? { x: cover.x, y: cover.y, width: cover.width, height: cover.height }
      : expandFieldBox(hit, alignment, false);
    return CertGen.Fields.createField({
      label: meta.label,
      type: meta.type,
      dateFormat: meta.dateFormat || 'DD MMMM YYYY',
      excelColumn: guessExcelColumn(meta.label, meta.type, opts.columns),
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      fontFamily: hit.fontFamily,
      fontSize: Math.round((hit.fontSize || 24) * scale),
      fontWeight: hit.fontWeight,
      fontStyle: hit.fontStyle,
      alignment: alignment,
      textColor: hit.textColor || '#1a1a1a',
      autoFit: true,
      minimumFontSize: Math.max(10, Math.round((hit.fontSize || 24) * scale * 0.55)),
      coverExistingText: !!opts.replaceMode,
      coverColor: hit.backgroundColor || (opts.replaceMode ? '#1a2a4a' : '#ffffff'),
      coverX: cover.x,
      coverY: cover.y,
      coverWidth: cover.width,
      coverHeight: cover.height,
      required: true,
      styleSource: 'reference',
      referenceText: hit.text,
      referenceItemId: hit.id,
      capitalization: hit.capitalization || 'as-is',
      rotation: Math.abs(hit.rotation || 0) < 1 ? 0 : hit.rotation,
      lineHeight: 1.2,
      letterSpacing: 0,
      referenceStyle: {
        fontFamily: hit.fontFamily,
        fontSize: Math.round((hit.fontSize || 24) * scale),
        fontWeight: hit.fontWeight,
        fontStyle: hit.fontStyle,
        alignment: alignment,
        textColor: hit.textColor || '#1a1a1a',
        capitalization: hit.capitalization || 'as-is',
        rotation: Math.abs(hit.rotation || 0) < 1 ? 0 : hit.rotation
      }
    }, 0);
  }

  CertGen.Reference = {
    mapFontFamily: mapFontFamily,
    detectCapitalization: detectCapitalization,
    applyCapitalization: applyCapitalization,
    guessAlignment: guessAlignment,
    expandFieldBox: expandFieldBox,
    guessDateFormat: guessDateFormat,
    guessFieldMeta: guessFieldMeta,
    guessExcelColumn: guessExcelColumn,
    mergeLineItems: mergeLineItems,
    itemsFromTextContent: itemsFromTextContent,
    itemsFromImageCanvas: itemsFromImageCanvas,
    regionFromClick: regionFromClick,
    refineMark: refineMark,
    padCoverBox: padCoverBox,
    fieldFromHit: fieldFromHit,
    sampleTextColor: sampleTextColor,
    sampleTextColorFromData: sampleTextColorFromData,
    sampleBackgroundColorFromData: sampleBackgroundColorFromData
  };
  global.CertGen = CertGen;
  if (typeof module !== 'undefined' && module.exports) module.exports = CertGen.Reference;
})(typeof globalThis !== 'undefined' ? globalThis : window);
