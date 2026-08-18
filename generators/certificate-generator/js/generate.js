(function attachCertGenerate(global) {
  'use strict';

  // One Excel row becomes one certificate. Later features such as email delivery,
  // QR codes or verification IDs should run after generateAll(), not inside the row loop.

  var CertGen = global.CertGen || {};
  var BATCH = 8;
  var IMAGE_QUALITY = 0.97;
  var SHARP_LONG_EDGE = 4800;

  function yieldToUi() {
    return new Promise(function (resolve) {
      setTimeout(resolve, 0);
    });
  }

  function fieldBox(field, width, height) {
    return {
      x: (Number(field.x) || 0) / 100 * width,
      y: (Number(field.y) || 0) / 100 * height,
      w: Math.max(4, (Number(field.width) || 10) / 100 * width),
      h: Math.max(4, (Number(field.height) || 6) / 100 * height)
    };
  }

  function fontString(field, size) {
    var style = field.fontStyle === 'italic' ? 'italic' : 'normal';
    var weight = field.fontWeight === 'bold' || field.fontWeight === '700' ? '700' : '400';
    var family = field.fontFamily || 'Georgia';
    return style + ' ' + weight + ' ' + size + 'px "' + family + '", Georgia, serif';
  }

  function wrapLines(ctx, text, maxWidth) {
    var words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    var lines = [];
    var current = '';
    words.forEach(function (word) {
      var test = current ? current + ' ' + word : word;
      if (ctx.measureText(test).width <= maxWidth || !current) {
        current = test;
      } else {
        lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  function fitText(ctx, text, field, box, scale) {
    var min = Math.max(6, (Number(field.minimumFontSize) || 12) * scale);
    var size = Math.max(min, (Number(field.fontSize) || 24) * scale);
    var autoFit = field.autoFit !== false;
    function apply(next) {
      ctx.font = fontString(field, next);
    }
    apply(size);
    if (!autoFit) {
      return { size: size, lines: wrapLines(ctx, text, box.w), shrunk: false };
    }
    var start = size;
    while (size > min) {
      apply(size);
      var lines = wrapLines(ctx, text, box.w);
      var lineHeight = size * (Number(field.lineHeight) || 1.2);
      var totalH = lines.length * lineHeight;
      var widest = 0;
      lines.forEach(function (line) {
        widest = Math.max(widest, ctx.measureText(line).width);
      });
      if (widest <= box.w + 0.75 && totalH <= box.h + 0.75) {
        return { size: size, lines: lines, shrunk: size < start - 0.4 };
      }
      size -= 0.5;
    }
    apply(min);
    return { size: min, lines: wrapLines(ctx, text, box.w), shrunk: true };
  }

  function drawAlignedText(ctx, lines, field, box, size) {
    var lineHeight = size * (Number(field.lineHeight) || 1.2);
    var totalH = lines.length * lineHeight;
    var startY = box.y + (box.h - totalH) / 2 + size * 0.85;
    if (startY < box.y + size * 0.85) startY = box.y + size * 0.85;
    ctx.fillStyle = field.textColor || '#1a1a1a';
    ctx.textBaseline = 'alphabetic';
    if (field.letterSpacing) ctx.letterSpacing = String(field.letterSpacing) + 'px';
    var angle = Number(field.rotation) || 0;
    if (angle) {
      ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
      ctx.rotate(angle * Math.PI / 180);
      ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));
    }
    lines.forEach(function (line, i) {
      var y = startY + i * lineHeight;
      var x;
      if (field.alignment === 'left') {
        ctx.textAlign = 'left';
        x = box.x + 2;
      } else if (field.alignment === 'right') {
        ctx.textAlign = 'right';
        x = box.x + box.w - 2;
      } else {
        ctx.textAlign = 'center';
        x = box.x + box.w / 2;
      }
      ctx.fillText(line, x, y);
    });
  }

  function parseHexColor(hex) {
    var h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    if (!Number.isFinite(n)) return { r: 255, g: 255, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function isGlyphInk(r, g, b, bgLum) {
    var lum = 0.299 * r + 0.587 * g + 0.114 * b;
    var blueBias = b - r;
    if (bgLum < 95) {
      if (blueBias > 48 && lum > 88) return false;
      if (r - b > 36 && r > 90) return false;
      return lum > bgLum + 24 && lum > 50;
    }
    return lum <= 92 && (Math.max(r, g, b) - Math.min(r, g, b)) < 90;
  }

  function dilateMask(mask, w, h, radius) {
    if (radius < 1) return mask;
    var out = new Uint8Array(mask);
    var y;
    var x;
    var ny;
    var nx;
    var r2 = radius * radius;
    for (y = 0; y < h; y += 1) {
      for (x = 0; x < w; x += 1) {
        if (!mask[y * w + x]) continue;
        for (ny = y - radius; ny <= y + radius; ny += 1) {
          if (ny < 0 || ny >= h) continue;
          for (nx = x - radius; nx <= x + radius; nx += 1) {
            if (nx < 0 || nx >= w) continue;
            if ((nx - x) * (nx - x) + (ny - y) * (ny - y) > r2) continue;
            out[ny * w + nx] = 1;
          }
        }
      }
    }
    return out;
  }

  function coverGlyphsWithTexture(imageData, fallbackHex) {
    var w = imageData.width;
    var h = imageData.height;
    var data = imageData.data;
    var fb = parseHexColor(fallbackHex);
    var bgLum = 0.299 * fb.r + 0.587 * fb.g + 0.114 * fb.b;
    var ink = new Uint8Array(w * h);
    var p;
    var inkCount = 0;
    for (p = 0; p < w * h; p += 1) {
      var i = p * 4;
      if (isGlyphInk(data[i], data[i + 1], data[i + 2], bgLum)) {
        ink[p] = 1;
        inkCount += 1;
      }
    }
    if (!inkCount) return { covered: 0 };
    var radius = Math.max(2, Math.round(Math.min(w, h) * 0.01));
    ink = dilateMask(ink, w, h, radius);
    inkCount = 0;
    for (p = 0; p < w * h; p += 1) {
      if (ink[p]) inkCount += 1;
    }

    var queued = new Uint8Array(w * h);
    var frontier = [];
    function tryQueue(idx) {
      if (!ink[idx] || queued[idx]) return;
      queued[idx] = 1;
      frontier.push(idx);
    }
    function eachNeighbor(idx, fn) {
      var x = idx % w;
      var y = (idx - x) / w;
      var dy;
      var dx;
      for (dy = -1; dy <= 1; dy += 1) {
        for (dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          var nx = x + dx;
          var ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          fn(ny * w + nx);
        }
      }
    }

    for (p = 0; p < w * h; p += 1) {
      if (!ink[p]) continue;
      var edge = false;
      eachNeighbor(p, function (np) {
        if (!ink[np]) edge = true;
      });
      if (edge) tryQueue(p);
    }

    var head = 0;
    while (head < frontier.length) {
      var cur = frontier[head];
      head += 1;
      if (!ink[cur]) continue;
      var rs = 0;
      var gs = 0;
      var bs = 0;
      var n = 0;
      eachNeighbor(cur, function (np) {
        if (ink[np]) return;
        var ni = np * 4;
        rs += data[ni];
        gs += data[ni + 1];
        bs += data[ni + 2];
        n += 1;
      });
      if (!n) continue;
      var ci = cur * 4;
      data[ci] = Math.round(rs / n);
      data[ci + 1] = Math.round(gs / n);
      data[ci + 2] = Math.round(bs / n);
      ink[cur] = 0;
      eachNeighbor(cur, function (np) {
        if (ink[np]) tryQueue(np);
      });
    }

    for (p = 0; p < w * h; p += 1) {
      if (!ink[p]) continue;
      var li = p * 4;
      data[li] = fb.r;
      data[li + 1] = fb.g;
      data[li + 2] = fb.b;
    }
    return { covered: inkCount };
  }

  function coverExisting(ctx, cover, field) {
    var x = Math.max(0, Math.floor(cover.x));
    var y = Math.max(0, Math.floor(cover.y));
    var canvasW = ctx.canvas ? ctx.canvas.width : 0;
    var canvasH = ctx.canvas ? ctx.canvas.height : 0;
    var w = Math.min(canvasW - x, Math.max(1, Math.ceil(cover.w)));
    var h = Math.min(canvasH - y, Math.max(1, Math.ceil(cover.h)));
    if (w < 2 || h < 2) return;
    try {
      var img = ctx.getImageData(x, y, w, h);
      var result = coverGlyphsWithTexture(img, field.coverColor || '#ffffff');
      if (result.covered > 4) {
        ctx.putImageData(img, x, y);
        return;
      }
    } catch (err) { /* node tests and tainted canvases fall back to a flat cover */ }
    ctx.fillStyle = field.coverColor || '#ffffff';
    ctx.fillRect(x, y, w, h);
  }

  function drawFields(ctx, fields, row, width, height, scale) {
    var Format = CertGen.Format;
    (fields || []).forEach(function (field) {
      var box = fieldBox(field, width, height);
      if (field.coverExistingText) {
        var cover = (field.coverX != null && field.coverWidth != null)
          ? {
            x: Number(field.coverX) / 100 * width,
            y: Number(field.coverY) / 100 * height,
            w: Math.max(2, Number(field.coverWidth) / 100 * width),
            h: Math.max(2, Number(field.coverHeight) / 100 * height)
          }
          : box;
        coverExisting(ctx, cover, field);
      }
      var raw = Format.lookupRow(row, field.excelColumn);
      var text = Format.formatFieldValue(raw, field);
      if (!text) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();
      var fitted = fitText(ctx, text, field, box, scale);
      drawAlignedText(ctx, fitted.lines, field, box, fitted.size);
      ctx.restore();
    });
  }

  function pageSizePts(template) {
    var t = template || {};
    if (t.widthPt > 0 && t.heightPt > 0) {
      return { w: t.widthPt, h: t.heightPt };
    }
    if (CertGen.Template && CertGen.Template.inferPrintMetrics) {
      var inferred = CertGen.Template.inferPrintMetrics(t.widthPx, t.heightPx);
      return { w: inferred.widthPt, h: inferred.heightPt };
    }
    var fallbackDpi = Math.max(t.widthPx || 0, t.heightPx || 0) >= 1200 ? 300 : 96;
    return {
      w: (t.widthPx || 0) * 72 / fallbackDpi,
      h: (t.heightPx || 0) * 72 / fallbackDpi
    };
  }

  function outputScale(template, quality) {
    var t = template || {};
    var long = Math.max(t.widthPx || 1, t.heightPx || 1);
    var dpi = Number(t.dpi) || 0;
    var printScale = 1;
    if (dpi > 0 && dpi < 280) printScale = Math.min(3, 300 / dpi);
    if (quality !== 'sharp') return printScale;
    return Math.max(printScale, Math.min(2, SHARP_LONG_EDGE / long));
  }

  function jpegQualityFor(quality) {
    return quality === 'sharp' ? 0.98 : IMAGE_QUALITY;
  }

  function renderCertificate(templateImage, template, fields, row, options) {
    var opts = options || {};
    var outScale = Number(opts.scale);
    if (!Number.isFinite(outScale) || outScale < 1) outScale = 1;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((template.widthPx || 1) * outScale));
    canvas.height = Math.max(1, Math.round((template.heightPx || 1) * outScale));
    var ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(templateImage, 0, 0, canvas.width, canvas.height);
    var scale = canvas.width / Math.max(1, template.widthPx);
    drawFields(ctx, fields, row, canvas.width, canvas.height, scale);
    return canvas;
  }

  function canvasToBlob(canvas, format, options) {
    return new Promise(function (resolve, reject) {
      var type = format === 'jpg' || format === 'jpeg' ? 'image/jpeg' : 'image/png';
      var quality = type === 'image/jpeg' ? jpegQualityFor(options && options.outputQuality) : undefined;
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) {
          if (!blob) reject(new Error('Unable to create the certificate image.'));
          else resolve(blob);
        }, type, quality);
        return;
      }
      try {
        var url = canvas.toDataURL(type, quality);
        var binary = atob(url.split(',')[1]);
        var bytes = new Uint8Array(binary.length);
        var i;
        for (i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        resolve(new Blob([bytes], { type: type }));
      } catch (err) {
        reject(new Error('Unable to create the certificate image.'));
      }
    });
  }

  function createPdfDoc(template) {
    var jspdfNs = global.jspdf;
    if (!jspdfNs || !jspdfNs.jsPDF) return null;
    var size = pageSizePts(template);
    var orientation = size.w >= size.h ? 'landscape' : 'portrait';
    return new jspdfNs.jsPDF({
      orientation: orientation,
      unit: 'pt',
      format: [size.w, size.h],
      compress: true
    });
  }

  function addCanvasToPdf(pdf, canvas, template, alias, quality) {
    var size = pageSizePts(template);
    var dataUrl = canvas.toDataURL('image/jpeg', jpegQualityFor(quality));
    pdf.addImage(dataUrl, 'JPEG', 0, 0, size.w, size.h, alias || undefined, 'NONE');
    return pdf;
  }

  function canvasToPdfBlob(canvas, template, quality) {
    var pdf = createPdfDoc(template);
    if (!pdf) {
      return Promise.reject(new Error('PDF export failed to load. Check your internet connection and try again.'));
    }
    addCanvasToPdf(pdf, canvas, template, 'cert', quality);
    return Promise.resolve(pdf.output('blob'));
  }

  function exportCanvas(canvas, template, format, quality) {
    if (format === 'png') return canvasToBlob(canvas, 'png', { outputQuality: quality });
    if (format === 'jpg' || format === 'jpeg') return canvasToBlob(canvas, 'jpg', { outputQuality: quality });
    return canvasToPdfBlob(canvas, template, quality);
  }

  function waitForFonts() {
    var fonts = global.document && document.fonts;
    if (!fonts) return Promise.resolve();
    var loads = [fonts.ready.catch(function () { return null; })];
    if (fonts.load) {
      ['120px "Great Vibes"', '64px "Great Vibes"', '48px Tangerine', '28px Arial', '32px Georgia', '28px Cinzel'].forEach(function (spec) {
        try { loads.push(fonts.load(spec).catch(function () { return null; })); } catch (err) { /* ignore */ }
      });
    }
    return Promise.all(loads).then(function () {
      return new Promise(function (resolve) { setTimeout(resolve, 80); });
    });
  }

  function measureRow(template, fields, row) {
    var canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    var ctx = canvas.getContext('2d');
    var width = template && template.widthPx ? template.widthPx : 1000;
    var height = template && template.heightPx ? template.heightPx : 1000;
    return (fields || []).map(function (field) {
      var box = fieldBox(field, width, height);
      var raw = CertGen.Format.lookupRow(row, field.excelColumn);
      var text = CertGen.Format.formatFieldValue(raw, field);
      var fitted = fitText(ctx, text, field, box, 1);
      return {
        id: field.id,
        label: field.label,
        text: text,
        shrunk: !!fitted.shrunk
      };
    });
  }

  function appendCombinedPage(pdf, canvas, template, quality, pageIndex) {
    var size = pageSizePts(template);
    var orientation = size.w >= size.h ? 'landscape' : 'portrait';
    if (!pdf) {
      pdf = createPdfDoc(template);
      if (!pdf) return null;
    } else {
      pdf.addPage([size.w, size.h], orientation);
    }
    addCanvasToPdf(pdf, canvas, template, 'p' + (pageIndex || 0), quality);
    return pdf;
  }

  function generateAll(options) {
    // Draw on the generation template. In completed-certificate mode that file
    // is the styled design and only mapped fields are covered and replaced.
    var template = options.template;
    var fields = options.fields || [];
    var items = options.items || [];
    var format = options.outputFormat || 'pdf';
    var quality = options.outputQuality || 'print';
    var scale = outputScale(template, quality);
    var pattern = options.filenamePattern || '{Name}_Certificate';
    var onProgress = options.onProgress || function () {};
    var usedNames = Object.create(null);
    var ext = format === 'png' ? 'png' : (format === 'jpg' || format === 'jpeg' ? 'jpg' : 'pdf');
    var combinedPdf = null;

    return waitForFonts().then(function () {
      return CertGen.Template.loadImageFromUrl(template.previewUrl);
    }).then(function (image) {
      var results = [];
      var index = 0;

      function next() {
        if (index >= items.length) {
          onProgress(items.length, items.length);
          var combinedBlob = null;
          if (combinedPdf) {
            try { combinedBlob = combinedPdf.output('blob'); } catch (err) { combinedBlob = null; }
          }
          results.combinedBlob = combinedBlob;
          return Promise.resolve(results);
        }
        var current = items[index];
        var row = current.row;
        var display = current.name || CertGen.Validate.displayName(row, fields);
        var base = CertGen.Format.applyFilenamePattern(pattern, row, fields);
        var filename = current.filename;
        if (filename) usedNames[filename] = true;
        else filename = CertGen.Format.uniqueFilename(base, ext, usedNames);
        var canvas;
        try {
          canvas = renderCertificate(image, template, fields, row, { scale: scale });
        } catch (err) {
          results.push({
            ok: false,
            index: current.index,
            excelRow: current.excelRow,
            name: display,
            filename: filename,
            row: row,
            message: 'Unable to generate a certificate for ' + CertGen.Validate.rowLabel(row, current.index) + '.'
          });
          index += 1;
          if (index % BATCH === 0) {
            onProgress(index, items.length);
            return yieldToUi().then(next);
          }
          return next();
        }

        return exportCanvas(canvas, template, format, quality).then(function (blob) {
          combinedPdf = appendCombinedPage(combinedPdf, canvas, template, quality, index);
          results.push({
            ok: true,
            index: current.index,
            excelRow: current.excelRow,
            name: display,
            filename: filename,
            blob: blob,
            row: row
          });
        }).catch(function () {
          results.push({
            ok: false,
            index: current.index,
            excelRow: current.excelRow,
            name: display,
            filename: filename,
            row: row,
            message: 'Unable to generate a certificate for ' + CertGen.Validate.rowLabel(row, current.index) + '.'
          });
        }).then(function () {
          index += 1;
          if (index % BATCH === 0 || index === items.length) {
            onProgress(index, items.length);
            return yieldToUi().then(next);
          }
          return next();
        });
      }

      return next();
    });
  }

  function zipResults(results, zipName) {
    var JSZip = global.JSZip;
    if (!JSZip) {
      return Promise.reject(new Error('ZIP download failed to load. Check your internet connection and try again.'));
    }
    var zip = new JSZip();
    var ok = (results || []).filter(function (item) { return item.ok && item.blob; });
    if (!ok.length) {
      return Promise.reject(new Error('There are no generated certificates to download yet.'));
    }
    ok.forEach(function (item) {
      zip.file(item.filename, item.blob);
    });
    return zip.generateAsync({ type: 'blob' }).then(function (blob) {
      return { blob: blob, name: zipName || zipFileName() };
    });
  }

  function zipFileName() {
    var now = new Date();
    return 'Certificates_' + now.getFullYear() + '-' +
      CertGen.Format.pad2(now.getMonth() + 1) + '-' +
      CertGen.Format.pad2(now.getDate()) + '.zip';
  }

  function saveBlob(blob, name) {
    if (global.saveAs) {
      global.saveAs(blob, name);
      return;
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  CertGen.Generate = {
    fieldBox: fieldBox,
    fitText: fitText,
    wrapLines: wrapLines,
    parseHexColor: parseHexColor,
    isGlyphInk: isGlyphInk,
    coverGlyphsWithTexture: coverGlyphsWithTexture,
    dilateMask: dilateMask,
    renderCertificate: renderCertificate,
    pageSizePts: pageSizePts,
    outputScale: outputScale,
    measureRow: measureRow,
    generateAll: generateAll,
    zipResults: zipResults,
    zipFileName: zipFileName,
    saveBlob: saveBlob,
    BATCH: BATCH
  };
  global.CertGen = CertGen;
})(typeof globalThis !== 'undefined' ? globalThis : window);
