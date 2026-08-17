(function attachCertGenerate(global) {
  'use strict';

  // One Excel row becomes one certificate. Later features such as email delivery,
  // QR codes or verification IDs should run after generateAll(), not inside the row loop.

  var CertGen = global.CertGen || {};
  var BATCH = 8;
  var IMAGE_QUALITY = 0.92;

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
      return { size: size, lines: wrapLines(ctx, text, box.w) };
    }
    while (size > min) {
      apply(size);
      var lines = wrapLines(ctx, text, box.w);
      var lineHeight = size * 1.2;
      var totalH = lines.length * lineHeight;
      var widest = 0;
      lines.forEach(function (line) {
        widest = Math.max(widest, ctx.measureText(line).width);
      });
      if (widest <= box.w + 0.75 && totalH <= box.h + 0.75) {
        return { size: size, lines: lines };
      }
      size -= 0.5;
    }
    apply(min);
    return { size: min, lines: wrapLines(ctx, text, box.w) };
  }

  function drawAlignedText(ctx, lines, field, box, size) {
    var lineHeight = size * 1.2;
    var totalH = lines.length * lineHeight;
    var startY = box.y + (box.h - totalH) / 2 + size * 0.85;
    if (startY < box.y + size * 0.85) startY = box.y + size * 0.85;
    ctx.fillStyle = field.textColor || '#1a1a1a';
    ctx.textBaseline = 'alphabetic';
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

  function drawFields(ctx, fields, row, width, height, scale) {
    var Format = CertGen.Format;
    (fields || []).forEach(function (field) {
      var box = fieldBox(field, width, height);
      if (field.coverExistingText) {
        ctx.fillStyle = field.coverColor || '#ffffff';
        ctx.fillRect(box.x, box.y, box.w, box.h);
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

  function renderCertificate(templateImage, template, fields, row) {
    var canvas = document.createElement('canvas');
    canvas.width = template.widthPx;
    canvas.height = template.heightPx;
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

  function canvasToBlob(canvas, format) {
    return new Promise(function (resolve, reject) {
      var type = format === 'jpg' || format === 'jpeg' ? 'image/jpeg' : 'image/png';
      var quality = type === 'image/jpeg' ? IMAGE_QUALITY : undefined;
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

  function canvasToPdfBlob(canvas, template) {
    var jspdfNs = global.jspdf;
    if (!jspdfNs || !jspdfNs.jsPDF) {
      return Promise.reject(new Error('PDF export failed to load. Check your internet connection and try again.'));
    }
    var widthPt = template.widthPt || (template.widthPx * 72 / 96);
    var heightPt = template.heightPt || (template.heightPx * 72 / 96);
    var orientation = widthPt >= heightPt ? 'landscape' : 'portrait';
    var pdf = new jspdfNs.jsPDF({
      orientation: orientation,
      unit: 'pt',
      format: [widthPt, heightPt],
      compress: true
    });
    var dataUrl = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
    pdf.addImage(dataUrl, 'JPEG', 0, 0, widthPt, heightPt, undefined, 'FAST');
    return Promise.resolve(pdf.output('blob'));
  }

  function exportCanvas(canvas, template, format) {
    if (format === 'png') return canvasToBlob(canvas, 'png');
    if (format === 'jpg' || format === 'jpeg') return canvasToBlob(canvas, 'jpg');
    return canvasToPdfBlob(canvas, template);
  }

  function waitForFonts() {
    if (global.document && document.fonts && document.fonts.ready) {
      return document.fonts.ready.catch(function () { return null; });
    }
    return Promise.resolve();
  }

  function generateAll(options) {
    var template = options.template;
    var fields = options.fields || [];
    var items = options.items || [];
    var format = options.outputFormat || 'pdf';
    var pattern = options.filenamePattern || '{Name}_Certificate';
    var onProgress = options.onProgress || function () {};
    var usedNames = Object.create(null);
    var ext = format === 'png' ? 'png' : (format === 'jpg' || format === 'jpeg' ? 'jpg' : 'pdf');

    return waitForFonts().then(function () {
      return CertGen.Template.loadImageFromUrl(template.previewUrl);
    }).then(function (image) {
      var results = [];
      var index = 0;

      function next() {
        if (index >= items.length) {
          onProgress(items.length, items.length);
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
          canvas = renderCertificate(image, template, fields, row);
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

        return exportCanvas(canvas, template, format).then(function (blob) {
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
    renderCertificate: renderCertificate,
    generateAll: generateAll,
    zipResults: zipResults,
    zipFileName: zipFileName,
    saveBlob: saveBlob,
    BATCH: BATCH
  };
  global.CertGen = CertGen;
})(typeof globalThis !== 'undefined' ? globalThis : window);
