(function attachCertTemplate(global) {
  'use strict';

  var CertGen = global.CertGen || {};
  var MAX_EDGE = 3600;

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

  function loadImageFile(file) {
    return fileToDataUrl(file).then(function (url) {
      return loadImageFromUrl(url).then(function (img) {
        var widthPx = img.naturalWidth || img.width;
        var heightPx = img.naturalHeight || img.height;
        if (!widthPx || !heightPx) {
          throw new Error('That image has no readable size. Please export it again and retry.');
        }
        return {
          type: 'image',
          name: file.name,
          mime: file.type || 'image/png',
          previewUrl: url,
          widthPx: widthPx,
          heightPx: heightPx,
          widthPt: widthPx * 72 / 96,
          heightPt: heightPx * 72 / 96
        };
      });
    });
  }

  function choosePdfScale(widthPt, heightPt) {
    var longest = Math.max(widthPt, heightPt);
    if (!longest) return 2;
    return Math.min(3, Math.max(1.5, MAX_EDGE / longest));
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
            return {
              type: 'pdf',
              name: file.name,
              mime: 'application/pdf',
              previewUrl: canvasToPngUrl(canvas),
              widthPx: canvas.width,
              heightPx: canvas.height,
              widthPt: base.width,
              heightPt: base.height
            };
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
    extensionOf: extensionOf
  };
  global.CertGen = CertGen;
})(typeof globalThis !== 'undefined' ? globalThis : window);
