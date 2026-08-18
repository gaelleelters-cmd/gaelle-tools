(function attachCertTemplate(global) {
  'use strict';

  var CertGen = global.CertGen || {};
  var MAX_EDGE = 4960;
  var TARGET_PDF_DPI = 300;
  var PAPER_ASPECT_TOLERANCE = 0.02;
  var DPI_TARGETS = [72, 96, 150, 200, 300, 400, 600];
  var PAPERS = [
    { name: 'A4', w: 595.2756, h: 841.8898 },
    { name: 'Letter', w: 612, h: 792 },
    { name: 'Legal', w: 612, h: 1008 },
    { name: 'A3', w: 841.8898, h: 1190.5512 },
    { name: 'A5', w: 419.5276, h: 595.2756 },
    { name: 'Tabloid', w: 792, h: 1224 }
  ];

  function paperScore(paper, widthPx) {
    var dpi = widthPx / (paper.widthPt / 72);
    var best = 99;
    DPI_TARGETS.forEach(function (target) {
      best = Math.min(best, Math.abs(dpi - target) / target);
    });
    if (paper.name !== 'A4' && paper.name !== 'Letter') best += 0.03;
    return best;
  }

  function matchPaper(width, height, options) {
    var w = Number(width) || 0;
    var h = Number(height) || 0;
    if (!w || !h) return null;
    var ar = w / h;
    var pxW = options && options.widthPx != null ? Number(options.widthPx) : w;
    var candidates = [];
    PAPERS.forEach(function (paper) {
      var dPortrait = Math.abs(ar - paper.w / paper.h);
      var dLandscape = Math.abs(ar - paper.h / paper.w);
      if (dPortrait <= PAPER_ASPECT_TOLERANCE) {
        candidates.push({ name: paper.name, widthPt: paper.w, heightPt: paper.h, aspectDiff: dPortrait });
      }
      if (dLandscape <= PAPER_ASPECT_TOLERANCE) {
        candidates.push({ name: paper.name, widthPt: paper.h, heightPt: paper.w, aspectDiff: dLandscape });
      }
    });
    if (!candidates.length) return null;
    candidates.sort(function (a, b) {
      var sa = paperScore(a, pxW);
      var sb = paperScore(b, pxW);
      return sa - sb || a.aspectDiff - b.aspectDiff;
    });
    return candidates[0];
  }

  function inferPrintMetrics(widthPx, heightPx) {
    var w = Number(widthPx) || 0;
    var h = Number(heightPx) || 0;
    var paper = matchPaper(w, h, { widthPx: w });
    if (paper) {
      var dpi = w / (paper.widthPt / 72);
      return {
        widthPt: paper.widthPt,
        heightPt: paper.heightPt,
        dpi: dpi,
        printLabel: paper.name,
        paper: paper.name
      };
    }
    var assumedDpi = Math.max(w, h) >= 1200 ? 300 : 96;
    return {
      widthPt: w * 72 / assumedDpi,
      heightPt: h * 72 / assumedDpi,
      dpi: assumedDpi,
      printLabel: assumedDpi + ' DPI',
      paper: null
    };
  }

  function metricsFromPage(widthPt, heightPt, widthPx, heightPx) {
    var wPt = Number(widthPt) || 0;
    var hPt = Number(heightPt) || 0;
    var wPx = Number(widthPx) || 0;
    var paper = matchPaper(wPt, hPt, { widthPx: wPx }) || matchPaper(widthPx, heightPx, { widthPx: wPx });
    var dpi = wPt ? wPx / (wPt / 72) : 0;
    return {
      widthPt: wPt,
      heightPt: hPt,
      dpi: dpi,
      printLabel: paper ? paper.name : (Math.round(wPt) + ' × ' + Math.round(hPt) + ' pt'),
      paper: paper ? paper.name : null
    };
  }

  function applyPrintMetrics(template, metrics) {
    if (!template || !metrics) return template;
    template.widthPt = metrics.widthPt;
    template.heightPt = metrics.heightPt;
    template.dpi = metrics.dpi;
    template.printLabel = metrics.printLabel;
    template.paper = metrics.paper;
    return template;
  }

  function describePrint(template) {
    if (!template) return '';
    var parts = [template.name || 'Certificate'];
    if (template.printLabel) parts.push(template.printLabel);
    if (template.dpi) parts.push(Math.round(template.dpi) + ' DPI');
    if (template.widthPx && template.heightPx) {
      parts.push(template.widthPx + ' × ' + template.heightPx);
    }
    return parts.join(' · ');
  }

  function fileToArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('Unable to read that file. Please try again.')); };
      reader.readAsArrayBuffer(file);
    });
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(new Error('Unable to read that file. Please try again.')); };
      reader.readAsDataURL(file);
    });
  }

  function loadImageFromUrl(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Unable to open that image. Try a PNG or JPG file.')); };
      img.src = url;
    });
  }

  function extensionOf(name) {
    var parts = String(name || '').split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  function canvasToPngUrl(canvas) {
    return canvas.toDataURL('image/png');
  }

  function detectVisualItems(canvas) {
    try {
      return (CertGen.Reference && CertGen.Reference.itemsFromImageCanvas)
        ? CertGen.Reference.itemsFromImageCanvas(canvas)
        : [];
    } catch (err) {
      return [];
    }
  }

  function loadImageFile(file) {
    return fileToDataUrl(file).then(function (url) {
      return loadImageFromUrl(url).then(function (img) {
        var widthPx = img.naturalWidth || img.width;
        var heightPx = img.naturalHeight || img.height;
        if (!widthPx || !heightPx) {
          throw new Error('That image has no readable size. Please export it again and retry.');
        }
        var canvas = document.createElement('canvas');
        canvas.width = widthPx;
        canvas.height = heightPx;
        var ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, widthPx, heightPx);
        ctx.drawImage(img, 0, 0);
        return applyPrintMetrics({
          type: 'image',
          name: file.name,
          mime: file.type || 'image/png',
          previewUrl: url,
          widthPx: widthPx,
          heightPx: heightPx,
          textItems: detectVisualItems(canvas)
        }, inferPrintMetrics(widthPx, heightPx));
      });
    });
  }

  function choosePdfScale(widthPt, heightPt) {
    var longest = Math.max(widthPt, heightPt);
    if (!longest) return 2;
    var forDpi = TARGET_PDF_DPI / 72;
    var forMax = MAX_EDGE / longest;
    return Math.min(6, forDpi, forMax);
  }

  function loadPdfFile(file) {
    var pdfjsLib = global.pdfjsLib;
    if (!pdfjsLib) {
      return Promise.reject(new Error('PDF reader failed to load. Check your internet connection and try again.'));
    }
    if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    return fileToArrayBuffer(file).then(function (buffer) {
      return pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise.then(function (pdf) {
        return pdf.getPage(1).then(function (page) {
          var base = page.getViewport({ scale: 1 });
          var scale = choosePdfScale(base.width, base.height);
          var viewport = page.getViewport({ scale: scale });
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          var ctx = canvas.getContext('2d', { alpha: false });
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
            return page.getTextContent().then(function (content) {
              var textItems = [];
              try {
                textItems = (CertGen.Reference && CertGen.Reference.itemsFromTextContent)
                  ? CertGen.Reference.itemsFromTextContent(content, viewport, canvas)
                  : [];
              } catch (err) {
                textItems = [];
              }
              if (!textItems.length) textItems = detectVisualItems(canvas);
              return applyPrintMetrics({
                type: 'pdf',
                name: file.name,
                mime: 'application/pdf',
                previewUrl: canvasToPngUrl(canvas),
                widthPx: canvas.width,
                heightPx: canvas.height,
                textItems: textItems
              }, metricsFromPage(base.width, base.height, canvas.width, canvas.height));
            });
          });
        });
      });
    }).catch(function (err) {
      var message = err && err.message ? String(err.message) : '';
      if (/password/i.test(message)) {
        throw new Error('This PDF is password protected. Please save an unlocked copy and try again.');
      }
      throw new Error('Unable to read that PDF. Please try another file or export the first page as PNG.');
    });
  }

  function loadFile(file) {
    if (!file) return Promise.reject(new Error('Please choose a certificate template.'));
    var ext = extensionOf(file.name);
    if (['png', 'jpg', 'jpeg', 'webp'].indexOf(ext) >= 0) return loadImageFile(file);
    if (ext === 'pdf') return loadPdfFile(file);
    if (ext === 'docx' || ext === 'doc') {
      return Promise.reject(new Error(
        'Word files cannot keep the exact certificate layout in the browser. Export the certificate as PDF, PNG or JPG, then upload that file.'
      ));
    }
    return Promise.reject(new Error('Please upload a PDF, PNG or JPG certificate template.'));
  }

  CertGen.Template = {
    loadFile: loadFile,
    loadImageFromUrl: loadImageFromUrl,
    extensionOf: extensionOf,
    matchPaper: matchPaper,
    inferPrintMetrics: inferPrintMetrics,
    metricsFromPage: metricsFromPage,
    describePrint: describePrint
  };
  global.CertGen = CertGen;
})(typeof globalThis !== 'undefined' ? globalThis : window);
