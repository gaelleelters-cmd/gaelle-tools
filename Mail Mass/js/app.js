(function () {
  'use strict';

  var rows = [];
  var headers = [];
  var sharedAttachment = null;

  var $ = function (id) { return document.getElementById(id); };

  var dropzone = $('dropzone');
  var fileInput = $('file-input');
  var browseBtn = $('browse-btn');
  var dropEmpty = $('drop-empty');
  var dropFile = $('drop-file');
  var fileName = $('file-name');
  var fileRemove = $('file-remove');
  var mapSection = $('map-section');
  var colEmail = $('col-email');
  var colFirst = $('col-firstname');
  var colSubject = $('col-subject');
  var colCc = $('col-cc');
  var colBcc = $('col-bcc');
  var colAttach = $('col-attach');
  var colMessage = $('col-message');
  var attachFile = $('attach-file');
  var greeting = $('greeting');
  var greetingPreview = $('greeting-preview');
  var bodyEl = $('body');
  var sameWrap = $('same-msg-wrap');
  var customWrap = $('custom-msg-wrap');
  var paramRow = $('param-row');
  var previewMeta = $('preview-meta');
  var previewMail = $('preview-mail');
  var previewWho = $('preview-who');
  var btnPrepare = $('btn-prepare');
  var btnSignOut = $('btn-signout');
  var btnConnectOutlook = $('btn-connect-outlook');
  var btnCopyHeaders = $('btn-copy-headers');
  var sheetExampleTable = $('sheet-example-table');
  var outlookConnect = $('outlook-connect');
  var authReady = $('auth-ready');
  var authStatus = $('auth-status');
  var toastWrap = $('toast-wrap');
  var rteFont = $('rte-font');
  var rteSize = $('rte-size');
  var rteColor = $('rte-color');
  var rteHighlight = $('rte-highlight');
  var rteColorSwatch = $('rte-color-swatch');
  var rteHlSwatch = $('rte-hl-swatch');

  function toast(msg, isError) {
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    toastWrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 7000);
  }

  function msgMode() {
    var checked = document.querySelector('input[name="msg-mode"]:checked');
    return checked ? checked.value : 'same';
  }

  function guessCol(names, keywords) {
    var lower = names.map(function (n) { return String(n).toLowerCase(); });
    for (var k = 0; k < keywords.length; k++) {
      for (var i = 0; i < lower.length; i++) {
        if (lower[i].indexOf(keywords[k]) !== -1) return names[i];
      }
    }
    return '';
  }

  function fillSelect(sel, opts, includeBlank, blankLabel) {
    sel.innerHTML = '';
    if (includeBlank) {
      var blank = document.createElement('option');
      blank.value = '';
      blank.textContent = blankLabel || '— none —';
      sel.appendChild(blank);
    }
    opts.forEach(function (h) {
      var opt = document.createElement('option');
      opt.value = h;
      opt.textContent = h;
      sel.appendChild(opt);
    });
  }

  function readSheet(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var data = new Uint8Array(e.target.result);
          var wb = XLSX.read(data, {
            type: 'array',
            cellHTML: true,
            cellStyles: true
          });
          var sheet = wb.Sheets[wb.SheetNames[0]];
          var theme = (window.MailMassSheetRich && MailMassSheetRich.themeFromWorkbook)
            ? MailMassSheetRich.themeFromWorkbook(wb)
            : null;

          function finish(finalTheme, oleMap) {
            var json = (window.MailMassSheetRich && MailMassSheetRich.sheetToRichJson)
              ? MailMassSheetRich.sheetToRichJson(sheet, { defval: '', theme: finalTheme })
              : XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
            if (!json.length) {
              reject(new Error('Sheet is empty'));
              return;
            }
            if (window.MailMassSheetRich && MailMassSheetRich.applyOleMapToRows) {
              MailMassSheetRich.applyOleMapToRows(sheet, json, oleMap || {});
            }
            resolve({ headers: Object.keys(json[0]), rows: json });
          }

          var zipBuf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
          var richPromise = (window.MailMassSheetRich && MailMassSheetRich.extractRichHtmlMap)
            ? MailMassSheetRich.extractRichHtmlMap(zipBuf, theme).catch(function () {
              return { map: null, theme: theme };
            })
            : Promise.resolve({ map: null, theme: theme });
          var olePromise = (window.MailMassSheetRich && MailMassSheetRich.extractOleCellMap)
            ? MailMassSheetRich.extractOleCellMap(zipBuf).catch(function () { return {}; })
            : Promise.resolve({});

          Promise.all([richPromise, olePromise]).then(function (parts) {
            var rich = parts[0] || {};
            if (rich.map && window.MailMassSheetRich && MailMassSheetRich.applyRichHtmlMap) {
              MailMassSheetRich.applyRichHtmlMap(sheet, rich.map);
            }
            finish(rich.theme || theme, parts[1] || {});
          }).catch(function () {
            finish(theme, {});
          });
          return;
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = function () { reject(new Error('Could not read file')); };
      reader.readAsArrayBuffer(file);
    });
  }

  function fileToAttachment(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        var comma = result.indexOf(',');
        resolve({
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          contentBytes: comma >= 0 ? result.slice(comma + 1) : result
        });
      };
      reader.onerror = function () { reject(new Error('Could not read attachment')); };
      reader.readAsDataURL(file);
    });
  }

  function setupMapping(parsed, name) {
    headers = parsed.headers;
    rows = parsed.rows;
    fileName.textContent = name + ' · ' + rows.length.toLocaleString() + ' rows';
    dropEmpty.classList.add('hidden');
    dropFile.classList.remove('hidden');
    mapSection.classList.remove('hidden');

    fillSelect(colEmail, headers, false);
    fillSelect(colFirst, headers, false);
    fillSelect(colSubject, headers, true);
    fillSelect(colCc, headers, true);
    fillSelect(colBcc, headers, true);
    if (colAttach) fillSelect(colAttach, headers, true);
    fillSelect(colMessage, headers, false);

    colEmail.value = guessCol(headers, ['email', 'e-mail', 'mail']) || headers[1] || headers[0];
    colFirst.value = guessCol(headers, ['first name', 'firstname', 'first', 'prenom', 'prénom', 'name', 'recipient']) || headers[0];
    colSubject.value = guessCol(headers, ['subject', 'subj', 'title']) || '';
    colCc.value = guessCol(headers, ['cc']) || '';
    colBcc.value = guessCol(headers, ['bcc']) || '';
    if (colAttach) {
      colAttach.value = guessCol(headers, ['attachment path', 'attach path', 'attachment', 'attach']) || '';
    }
    colMessage.value = guessCol(headers, ['message', 'body', 'text', 'content', 'custom']) || headers[0];

    renderParams();
    updatePreview();
    refreshButtons();
    var oleCount = 0;
    rows.forEach(function (row) {
      if (!row.__oleByHeader) return;
      oleCount += Object.keys(row.__oleByHeader).length;
    });
    if (oleCount) {
      toast(oleCount + ' embedded file' + (oleCount === 1 ? '' : 's') + ' ready from the sheet');
    }
  }

  function clearSheet() {
    rows = [];
    headers = [];
    fileInput.value = '';
    dropEmpty.classList.remove('hidden');
    dropFile.classList.add('hidden');
    mapSection.classList.add('hidden');
    paramRow.innerHTML = '';
    updatePreview();
    refreshButtons();
  }

  function renderParams() {
    paramRow.innerHTML = '';
    headers.forEach(function (h) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'param-chip';
      btn.textContent = '{' + h + '}';
      btn.addEventListener('click', function () {
        insertAtCursor(bodyEl, '{' + h + '}');
        updatePreview();
      });
      paramRow.appendChild(btn);
    });
  }

  function insertAtCursor(editor, text) {
    editor.focus();
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) {
      editor.appendChild(document.createTextNode(text));
      placeCaretAtEnd(editor);
      return;
    }
    var range = sel.getRangeAt(0);
    range.deleteContents();
    var node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function placeCaretAtEnd(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function getBodyHtml() {
    var html = (bodyEl.innerHTML || '').trim();
    if (!html || html === '<br>') return '';
    return cleanEmailHtml(html);
  }

  function getBodyPlain() {
    return (bodyEl.innerText || bodyEl.textContent || '').trim();
  }

  function looksLikeHtml(s) {
    return /<[a-z]|\&nbsp;/i.test(String(s || ''));
  }

  function unwrapSafeLink(href) {
    try {
      var u = new URL(href, window.location.href);
      if (/safelinks\.protection\.outlook\.com$/i.test(u.hostname) && u.searchParams.has('url')) {
        return decodeURIComponent(u.searchParams.get('url'));
      }
    } catch (e) {}
    return href;
  }

  function cleanEmailHtml(raw) {
    var src = String(raw || '');
    if (!src.trim()) return '';
    var tmp = document.createElement('div');
    tmp.innerHTML = src
      .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/?o:p[^>]*>/gi, '')
      .replace(/<\/?xml:[^>]*>/gi, '')
      .replace(/<\/?w:[^>]*>/gi, '');

    function keepStyle(styleText) {
      if (!styleText) return '';
      var keep = [];
      String(styleText).split(';').forEach(function (part) {
        var p = part.trim();
        if (!p) return;
        var low = p.toLowerCase();
        if (
          low.indexOf('font-family') === 0 ||
          low.indexOf('font-size') === 0 ||
          low.indexOf('font-weight') === 0 ||
          low.indexOf('font-style') === 0 ||
          low.indexOf('text-decoration') === 0 ||
          low.indexOf('color') === 0 ||
          low.indexOf('background') === 0 ||
          low.indexOf('text-align') === 0
        ) {
          keep.push(p);
        }
      });
      return keep.join('; ');
    }

    function walk(node, out) {
      if (node.nodeType === 3) {
        out.appendChild(document.createTextNode(node.nodeValue));
        return;
      }
      if (node.nodeType !== 1) return;
      var tag = node.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'meta' || tag === 'link') return;

      if (tag === 'br') {
        out.appendChild(document.createElement('br'));
        return;
      }

      var next = out;
      if (tag === 'p' || tag === 'div') {
        var p = document.createElement('p');
        p.setAttribute('style', 'margin:0 0 8pt 0;');
        out.appendChild(p);
        next = p;
      } else if (tag === 'b' || tag === 'strong') {
        next = document.createElement('b');
        out.appendChild(next);
      } else if (tag === 'i' || tag === 'em') {
        next = document.createElement('i');
        out.appendChild(next);
      } else if (tag === 'u') {
        next = document.createElement('u');
        out.appendChild(next);
      } else if (tag === 's' || tag === 'strike') {
        next = document.createElement('s');
        out.appendChild(next);
      } else if (tag === 'sup' || tag === 'sub') {
        next = document.createElement(tag);
        out.appendChild(next);
      } else if (tag === 'ul' || tag === 'ol' || tag === 'li') {
        next = document.createElement(tag);
        out.appendChild(next);
      } else if (tag === 'a') {
        var a = document.createElement('a');
        var href = unwrapSafeLink(node.getAttribute('href') || '');
        if (href) a.setAttribute('href', href);
        a.setAttribute('style', keepStyle(node.getAttribute('style')) || 'color:#0070C0;');
        out.appendChild(a);
        next = a;
      } else if (tag === 'span' || tag === 'font') {
        var style = keepStyle(node.getAttribute('style') || '');
        if (tag === 'font') {
          var face = node.getAttribute('face');
          var color = node.getAttribute('color');
          var size = node.getAttribute('size');
          if (face) style += (style ? '; ' : '') + 'font-family:' + face;
          if (color) style += (style ? '; ' : '') + 'color:' + color;
          if (size) {
            var map = { '1': '8pt', '2': '10pt', '3': '12pt', '4': '14pt', '5': '18pt', '6': '24pt', '7': '36pt' };
            style += (style ? '; ' : '') + 'font-size:' + (map[size] || '11pt');
          }
        }
        if (style) {
          next = document.createElement('span');
          next.setAttribute('style', style);
          out.appendChild(next);
        }
      }

      Array.prototype.forEach.call(node.childNodes, function (child) {
        walk(child, next);
      });
    }

    var cleaned = document.createElement('div');
    Array.prototype.forEach.call(tmp.childNodes, function (child) {
      walk(child, cleaned);
    });

    // Drop empty paragraphs that are only &nbsp;
    Array.prototype.slice.call(cleaned.querySelectorAll('p')).forEach(function (p) {
      var t = (p.textContent || '').replace(/\u00a0/g, ' ').trim();
      if (!t && !p.querySelector('img')) p.remove();
    });

    return cleaned.innerHTML.trim();
  }

  function insertHtmlAtCursor(html) {
    bodyEl.focus();
    try {
      document.execCommand('insertHTML', false, html);
    } catch (e) {
      bodyEl.innerHTML = (bodyEl.innerHTML || '') + html;
    }
  }

  function rteCommand(cmd, value) {
    bodyEl.focus();
    try {
      document.execCommand('styleWithCSS', false, true);
    } catch (e) {}
    document.execCommand(cmd, false, value || null);
    updatePreview();
  }

  function applyFontSize(pt) {
    bodyEl.focus();
    try {
      document.execCommand('styleWithCSS', false, true);
    } catch (e) {}
    document.execCommand('fontSize', false, '7');
    bodyEl.querySelectorAll('font[size="7"]').forEach(function (el) {
      var span = document.createElement('span');
      span.style.fontSize = pt + 'pt';
      while (el.firstChild) span.appendChild(el.firstChild);
      el.parentNode.replaceChild(span, el);
    });
    bodyEl.querySelectorAll('span').forEach(function (el) {
      if (el.style && /xxx-large|xx-large|x-large/i.test(el.style.fontSize || '')) {
        el.style.fontSize = pt + 'pt';
      }
    });
    updatePreview();
  }

  function htmlEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function guessContentType(name) {
    var n = String(name || '').toLowerCase();
    if (/\.pdf$/.test(n)) return 'application/pdf';
    if (/\.txt$/.test(n)) return 'text/plain';
    if (/\.docx$/.test(n)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (/\.xlsx$/.test(n)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (/\.doc$/.test(n)) return 'application/msword';
    if (/\.xls$/.test(n)) return 'application/vnd.ms-excel';
    if (/\.png$/.test(n)) return 'image/png';
    if (/\.jpe?g$/.test(n)) return 'image/jpeg';
    return 'application/octet-stream';
  }

  function u8ToBase64(u8) {
    var s = '';
    var chunk = 0x8000;
    var i;
    for (i = 0; i < u8.length; i += chunk) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(s);
  }

  function oleToMailAttachment(ole) {
    if (!ole || !ole.bytes || !ole.bytes.length) return null;
    return {
      name: ole.name || 'attachment.bin',
      contentType: guessContentType(ole.name),
      contentBytes: u8ToBase64(ole.bytes)
    };
  }

  function cellToAttachPath(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if (/EMBED\s*\(/i.test(s) || /Packager Shell Object/i.test(s)) return '';
    var href = s.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (href && href[1]) s = href[1];
    s = s.replace(/<[^>]+>/g, ' ');
    s = s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"');
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/^["']+|["']+$/g, '');
    if (/^file:/i.test(s)) {
      try { s = decodeURIComponent(s); } catch (e) {}
      s = s.replace(/^file:\/\//i, '');
      s = s.replace(/^\/+([A-Za-z]:)/, '$1');
      s = s.replace(/\//g, '\\');
    }
    return s.trim();
  }

  function applyMerge(template, row, asHtml) {
    return String(template || '').replace(/\{([^}]+)\}/g, function (_, key) {
      var k = key.trim();
      var val = '';
      if (Object.prototype.hasOwnProperty.call(row, k)) {
        val = String(row[k] == null ? '' : row[k]);
      } else {
        var found = headers.find(function (h) { return h.toLowerCase() === k.toLowerCase(); });
        if (found) val = String(row[found] == null ? '' : row[found]);
        else return '{' + key + '}';
      }
      return asHtml ? htmlEsc(val) : val;
    });
  }

  function buildRow(row) {
    var first = String(row[colFirst.value] || '').trim();
    var email = String(row[colEmail.value] || '').trim();
    var cc = colCc.value ? String(row[colCc.value] || '').trim() : '';
    var bcc = colBcc.value ? String(row[colBcc.value] || '').trim() : '';
    var subject = colSubject.value ? String(row[colSubject.value] || '').trim() : '';
    var attach = (colAttach && colAttach.value) ? cellToAttachPath(row[colAttach.value]) : '';
    var fileAttachment = null;
    if (colAttach && colAttach.value && row.__oleByHeader && row.__oleByHeader[colAttach.value]) {
      fileAttachment = oleToMailAttachment(row.__oleByHeader[colAttach.value]);
    }
    if (!subject) subject = 'Document Attached';

    var messageIsHtml = false;
    var message = '';
    if (msgMode() === 'custom') {
      message = String(row[colMessage.value] || '').trim();
      if (window.MailMassSheetRich && MailMassSheetRich.looksLikeHtml(message)) {
        message = cleanEmailHtml(message);
        messageIsHtml = true;
      } else {
        messageIsHtml = looksLikeHtml(message);
      }
    } else {
      message = applyMerge(getBodyHtml(), row, true).trim();
      messageIsHtml = true;
    }

    var custom = msgMode() === 'custom';
    var greet = custom ? String(greeting.value || '').trim() : '__SKIP__';
    var plainMsg = custom
      ? message
      : applyMerge(getBodyPlain(), row, false).trim();
    var bodyText = custom
      ? (greet
        ? (greet + ' ' + (first || 'there') + ',\n\n' + plainMsg)
        : ((first || 'there') + ',\n\n' + plainMsg))
      : plainMsg;

    return {
      first: first,
      email: email,
      cc: cc,
      bcc: bcc,
      subject: subject,
      attach: attach,
      fileAttachment: fileAttachment,
      bodyText: bodyText,
      message: message,
      messageIsHtml: messageIsHtml,
      greeting: greet
    };
  }

  function validSetup() {
    return rows.length > 0 && colEmail.value && colFirst.value &&
      (msgMode() === 'same' ? true : !!colMessage.value);
  }

  function refreshButtons() {
    btnPrepare.disabled = !validSetup();
  }

  function updateGreetingPreview() {
    var greet = String(greeting.value || '').trim();
    greetingPreview.innerHTML = greet
      ? (greet + ' <em>FirstName</em>,')
      : '<em>FirstName</em>,';
  }

  function detectMessageFontSize(html) {
    var m = String(html || '').match(/font-size:\s*([^;"'\s]+)/i);
    return m ? m[1] : '11pt';
  }

  function buildPreviewHtml(mail) {
    var size = detectMessageFontSize(mail.message);
    var wrapOpen = '<div style="font-family:Calibri,sans-serif;font-size:11pt;">';
    var greet = mail.greeting;
    if (greet !== '__SKIP__') {
      var open = greet
        ? (greet + ' ' + (mail.first || 'FirstName') + ',')
        : ((mail.first || 'FirstName') + ',');
      var greetStyle = 'margin:0;font-family:Calibri,sans-serif;font-size:' + size +
        ';font-weight:normal;font-style:normal;';
      wrapOpen +=
        '<p style="' + greetStyle + '"><span style="' + greetStyle + '">' +
        open.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
        '</span></p>' +
        '<p style="margin:0;line-height:12pt;font-size:11pt;">&nbsp;</p>';
    }
    if (mail.messageIsHtml) {
      return wrapOpen + mail.message + '</div>';
    }
    var norm = String(mail.message || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var parts = norm.split(/\n\n/).map(function (p) {
      var t = p.trim();
      if (!t) return '';
      return '<p style="margin:0 0 8pt 0;font-family:Calibri,sans-serif;font-size:11pt;">' +
        t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') +
        '</p>';
    }).join('');
    return wrapOpen + parts + '</div>';
  }

  function updatePreview() {
    updateGreetingPreview();
    if (!rows.length || !colFirst.value) {
      var custom = msgMode() === 'custom';
      var sample = {
        first: 'FirstName',
        email: '',
        cc: '',
        bcc: '',
        subject: 'Document Attached',
        greeting: custom ? String(greeting.value || '').trim() : '__SKIP__',
        message: custom ? '…' : (getBodyHtml() || '…'),
        messageIsHtml: true
      };
      previewWho.textContent = 'Sample';
      previewMeta.textContent = 'Subject: Document Attached';
      previewMail.innerHTML = buildPreviewHtml(sample);
      return;
    }
    var mail = buildRow(rows[0]);
    var attachLabel = (mail.fileAttachment && mail.fileAttachment.name) ||
      mail.attach ||
      (sharedAttachment ? sharedAttachment.name : '');
    previewWho.textContent = (mail.first || 'Row 1') + (mail.email ? ' · ' + mail.email : '');
    previewMeta.textContent =
      'To: ' + (mail.email || '') + '\n' +
      (mail.cc ? 'CC: ' + mail.cc + '\n' : '') +
      (mail.bcc ? 'BCC: ' + mail.bcc + '\n' : '') +
      'Subject: ' + mail.subject +
      (attachLabel ? '\nAttachment: ' + attachLabel : '');
    previewMail.innerHTML = buildPreviewHtml(mail);
  }

  var HELPER_URL = 'http://127.0.0.1:19527';
  var HELPER_MIN_VERSION = 7;
  var helperOnline = false;
  var helperVersion = 0;
  var graphUser = null;
  var outlookPill = $('outlook-pill');
  var connectHint = $('connect-hint');
  var waitingForHelper = false;

  function graphReady() {
    return !!(window.MailMassGraph && MailMassGraph.isConfigured());
  }

  function helperReady() {
    return helperOnline && helperVersion >= HELPER_MIN_VERSION;
  }

  /** Chrome Local Network Access: public HTTPS → loopback needs this hint + user Allow. */
  function helperFetch(path, init) {
    var opts = {};
    var key;
    if (init) {
      for (key in init) {
        if (Object.prototype.hasOwnProperty.call(init, key)) opts[key] = init[key];
      }
    }
    if (!opts.cache) opts.cache = 'no-store';
    if (!opts.mode) opts.mode = 'cors';
    opts.targetAddressSpace = 'loopback';
    return fetch(HELPER_URL + path, opts).catch(function (err) {
      // Older browsers may reject unknown fetch options — retry without the hint
      var retry = {};
      if (init) {
        for (key in init) {
          if (Object.prototype.hasOwnProperty.call(init, key)) retry[key] = init[key];
        }
      }
      if (!retry.cache) retry.cache = 'no-store';
      if (!retry.mode) retry.mode = 'cors';
      return fetch(HELPER_URL + path, retry);
    });
  }

  function setAuthUi() {
    if (btnConnectOutlook) {
      btnConnectOutlook.classList.remove('is-busy');
      btnConnectOutlook.disabled = false;
    }

    if (helperReady()) {
      waitingForHelper = false;
      if (outlookConnect) outlookConnect.classList.add('hidden');
      if (authReady) {
        authReady.classList.remove('hidden');
        authReady.textContent = 'Outlook on this PC is connected. Continue with step 2 below.';
      }
      btnSignOut.classList.add('hidden');
      if (outlookPill) {
        outlookPill.textContent = 'Connected';
        outlookPill.className = 'outlook-pill is-on';
      }
      if (authStatus) authStatus.textContent = 'Ready — emails will send from YOUR Outlook.';
      if (btnConnectOutlook) btnConnectOutlook.textContent = 'Connect Outlook';
      return;
    }

    if (graphReady() && graphUser && graphUser.username) {
      if (outlookConnect) outlookConnect.classList.add('hidden');
      if (authReady) {
        authReady.classList.remove('hidden');
        authReady.textContent = 'Signed in as ' + (graphUser.name || graphUser.username) + '. Continue with step 2 below.';
      }
      btnSignOut.classList.remove('hidden');
      if (outlookPill) {
        outlookPill.textContent = 'Signed in';
        outlookPill.className = 'outlook-pill is-on';
      }
      if (authStatus) authStatus.textContent = graphUser.username || 'Ready to send from your mailbox.';
      if (btnConnectOutlook) btnConnectOutlook.textContent = 'Sign in with Microsoft';
      return;
    }

    if (outlookConnect) outlookConnect.classList.remove('hidden');
    if (authReady) authReady.classList.add('hidden');
    btnSignOut.classList.add('hidden');

    if (waitingForHelper) {
      if (outlookPill) {
        outlookPill.textContent = 'Waiting…';
        outlookPill.className = 'outlook-pill is-wait';
      }
      if (authStatus) {
        authStatus.textContent = 'Helper should be running — if Chrome asks for local network access, click Allow, then Connect.';
      }
      if (btnConnectOutlook) btnConnectOutlook.textContent = 'Connect Outlook';
      if (connectHint) {
        connectHint.innerHTML =
          'A PowerShell helper window should be open. Keep it open. ' +
          'Chrome may ask to <strong>allow local network access</strong> for this site — click <strong>Allow</strong>, then click <strong>Connect Outlook</strong>.';
      }
      return;
    }

    if (outlookPill) {
      outlookPill.textContent = 'Not connected';
      outlookPill.className = 'outlook-pill is-off';
    }
    if (authStatus) {
      authStatus.textContent = 'One click on your computer — connects YOUR Outlook only.';
    }
    if (btnConnectOutlook) btnConnectOutlook.textContent = 'Connect Outlook';
    if (connectHint) {
      if (window.MailMassConnect && MailMassConnect.wasInstalled()) {
        connectHint.innerHTML =
          'Already set up on this PC. Click <strong>Connect Outlook</strong> to restart the helper — <strong>no download</strong>. ' +
          'If Chrome asks to allow local network access, click <strong>Allow</strong>.';
      } else {
        connectHint.innerHTML =
          'First time: downloads a small <strong>zip</strong>. Open it, run <strong>MailMass_Connect.bat</strong>, then return here. ' +
          'If Chrome blocks the zip, use <strong>Copy PowerShell command</strong>. ' +
          'When Chrome asks for local network access, click <strong>Allow</strong>.';
      }
    }
  }

  function setConnectingUi() {
    if (outlookPill) {
      outlookPill.textContent = 'Connecting…';
      outlookPill.className = 'outlook-pill is-wait';
    }
    if (authStatus) authStatus.textContent = 'Starting Outlook helper…';
    if (btnConnectOutlook) {
      btnConnectOutlook.classList.add('is-busy');
      btnConnectOutlook.textContent = 'Connecting…';
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function checkHelper() {
    return helperFetch('/health', { method: 'GET' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        helperOnline = !!(data && data.ok);
        helperVersion = data && data.version != null ? Number(data.version) : 0;
        if (!isFinite(helperVersion)) helperVersion = 0;
        return helperOnline;
      })
      .catch(function () {
        helperOnline = false;
        helperVersion = 0;
        return false;
      });
  }

  function ensureHelper(attemptsLeft) {
    var left = typeof attemptsLeft === 'number' ? attemptsLeft : 24;
    return checkHelper().then(function (online) {
      if (online && helperVersion >= HELPER_MIN_VERSION) return true;
      if (left <= 0) return false;
      return sleep(500).then(function () {
        return ensureHelper(left - 1);
      });
    });
  }

  function watchForHelper(attempts) {
    waitingForHelper = true;
    setAuthUi();
    return ensureHelper(attempts || 60).then(function (ready) {
      if (ready) {
        waitingForHelper = false;
        if (window.MailMassConnect) MailMassConnect.markInstalled();
        setAuthUi();
        toast('Outlook connected on this PC. You can continue.');
        return true;
      }
      waitingForHelper = true;
      setAuthUi();
      return false;
    });
  }

  function launchHelper(forceDownload) {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      if (window.MailMassConnect) {
        MailMassConnect.wakeLocal();
        if (forceDownload || !MailMassConnect.wasInstalled()) {
          MailMassConnect.download();
        }
        return;
      }
    }

    var candidates = [];
    try {
      if (location.protocol === 'file:') {
        var base = location.href.replace(/[^\/?#]*([?#].*)?$/, '');
        candidates.push(base + 'Start%20Mail%20Mass.bat');
        candidates.push(base + 'helper/Start-MailMassHelper.bat');
      }
    } catch (e) {}
    candidates.push('Start%20Mail%20Mass.bat');
    candidates.push('helper/Start-MailMassHelper.bat');
    candidates.push('helper/MailMass_Connect.bat');

    candidates.forEach(function (href, idx) {
      setTimeout(function () {
        try {
          var link = document.createElement('a');
          link.href = href;
          link.download = '';
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          setTimeout(function () { try { link.remove(); } catch (e2) {} }, 1500);
        } catch (e3) {}
      }, idx * 350);
    });
  }

  function sendViaHelper(prepared) {
    var hasOle = prepared.some(function (m) {
      return m.fileAttachment && m.fileAttachment.contentBytes;
    });
    if (hasOle && helperVersion < 12) {
      return Promise.reject(new Error('Reconnect Outlook in step 1 so files inserted in Excel can be sent.'));
    }
    var payload = {
      displayOnly: '0',
      mails: prepared.map(function (m) {
        return {
          first: m.first,
          email: m.email,
          attach: m.fileAttachment ? '' : (m.attach || ''),
          fileAttachment: m.fileAttachment || undefined,
          cc: m.cc,
          bcc: m.bcc,
          subject: m.subject,
          message: m.message,
          messageIsHtml: !!m.messageIsHtml,
          greeting: m.greeting
        };
      })
    };
    if (sharedAttachment && sharedAttachment.contentBytes) {
      payload.attachment = {
        name: sharedAttachment.name,
        contentType: sharedAttachment.contentType || 'application/octet-stream',
        contentBytes: sharedAttachment.contentBytes
      };
    }
    return helperFetch('/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data.ok) {
          throw new Error((data && data.error) || 'Outlook send failed');
        }
        return {
          processed: data.processed,
          skipped: data.skipped,
          mode: 'helper'
        };
      });
    });
  }

  function sendViaGraph(prepared) {
    var lastToast = 0;
    return MailMassGraph.sendAll(prepared, sharedAttachment, function (done, total) {
      var now = Date.now();
      if (done === total || now - lastToast > 1200) {
        lastToast = now;
        toast('Sending ' + done + ' / ' + total + '…');
      }
    }).then(function (data) {
      return {
        processed: data.processed,
        skipped: data.skipped,
        mode: 'graph'
      };
    });
  }

  function refreshAuth() {
    return checkHelper().then(function () {
      if (helperReady() && window.MailMassConnect) MailMassConnect.markInstalled();
      if (helperReady() || !graphReady()) {
        setAuthUi();
        return null;
      }
      return MailMassGraph.currentUser().then(function (user) {
        graphUser = user;
        setAuthUi();
        return user;
      }).catch(function () {
        graphUser = null;
        setAuthUi();
        return null;
      });
    });
  }

  function exampleHeaderTitles() {
    if (!sheetExampleTable) return [];
    return Array.prototype.map.call(
      sheetExampleTable.querySelectorAll('th'),
      function (th) { return (th.textContent || '').trim(); }
    ).filter(Boolean);
  }

  function copyExampleHeaders() {
    var titles = exampleHeaderTitles();
    if (!titles.length) return Promise.reject(new Error('No headers to copy'));
    var tsv = titles.join('\t');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(tsv);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = tsv;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        if (!document.execCommand('copy')) reject(new Error('Copy failed'));
        else resolve();
      } catch (err) {
        reject(err);
      } finally {
        ta.remove();
      }
    });
  }

  browseBtn.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('click', function (e) {
    if (e.target === browseBtn || e.target === fileRemove) return;
    if (!rows.length) fileInput.click();
  });

  if (btnCopyHeaders) {
    btnCopyHeaders.addEventListener('click', function () {
      copyExampleHeaders().then(function () {
        toast('Headers copied — paste into Excel row 1 (A1)');
      }).catch(function () {
        toast('Could not copy headers', true);
      });
    });
  }

  if (sheetExampleTable) {
    sheetExampleTable.addEventListener('copy', function (e) {
      var titles = exampleHeaderTitles();
      if (!titles.length || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', titles.join('\t'));
    });
  }
  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    readSheet(file).then(function (parsed) {
      setupMapping(parsed, file.name);
      toast('Sheet loaded');
    }).catch(function (err) {
      toast(err.message || 'Failed to read sheet', true);
    });
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropzone.classList.add('is-drag');
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropzone.classList.remove('is-drag');
    });
  });
  dropzone.addEventListener('drop', function (e) {
    var file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    readSheet(file).then(function (parsed) {
      setupMapping(parsed, file.name);
      toast('Sheet loaded');
    }).catch(function (err) {
      toast(err.message || 'Failed to read sheet', true);
    });
  });

  fileRemove.addEventListener('click', function (e) {
    e.stopPropagation();
    clearSheet();
  });

  attachFile.addEventListener('change', function () {
    var file = attachFile.files && attachFile.files[0];
    if (!file) {
      sharedAttachment = null;
      updatePreview();
      return;
    }
    fileToAttachment(file).then(function (att) {
      sharedAttachment = att;
      toast('Attachment ready: ' + att.name);
      updatePreview();
    }).catch(function (err) {
      sharedAttachment = null;
      toast(err.message || 'Attachment failed', true);
    });
  });

  document.querySelectorAll('input[name="msg-mode"]').forEach(function (r) {
    r.addEventListener('change', function () {
      var custom = msgMode() === 'custom';
      sameWrap.classList.toggle('hidden', custom);
      customWrap.classList.toggle('hidden', !custom);
      updatePreview();
      refreshButtons();
    });
  });

  [colEmail, colFirst, colSubject, colCc, colBcc, colAttach, colMessage, greeting]
    .forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', function () { updatePreview(); refreshButtons(); });
      el.addEventListener('change', function () { updatePreview(); refreshButtons(); });
    });

  bodyEl.addEventListener('input', function () { updatePreview(); refreshButtons(); });
  bodyEl.addEventListener('keyup', function () { updatePreview(); });
  bodyEl.addEventListener('paste', function (e) {
    var clip = e.clipboardData || window.clipboardData;
    if (!clip) {
      setTimeout(function () {
        bodyEl.innerHTML = cleanEmailHtml(bodyEl.innerHTML);
        updatePreview();
        refreshButtons();
      }, 0);
      return;
    }
    e.preventDefault();
    var html = clip.getData('text/html');
    var text = clip.getData('text/plain');
    if (html && /<[a-z]/i.test(html)) {
      insertHtmlAtCursor(cleanEmailHtml(html));
    } else if (text) {
      var paras = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n{2,}/);
      var built = paras.map(function (block) {
        var line = htmlEsc(block).replace(/\n/g, '<br>');
        return '<p style="margin:0 0 8pt 0;">' + line + '</p>';
      }).join('');
      insertHtmlAtCursor(built);
    }
    updatePreview();
    refreshButtons();
  });

  document.querySelectorAll('.rte-btn[data-cmd]').forEach(function (btn) {
    btn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      rteCommand(btn.getAttribute('data-cmd'));
    });
  });

  if (rteFont) {
    rteFont.addEventListener('change', function () {
      rteCommand('fontName', rteFont.value);
    });
  }

  if (rteSize) {
    rteSize.addEventListener('change', function () {
      applyFontSize(rteSize.value);
    });
  }

  if (rteColor) {
    rteColor.addEventListener('input', function () {
      if (rteColorSwatch) rteColorSwatch.style.background = rteColor.value;
      rteCommand('foreColor', rteColor.value);
    });
  }

  if (rteHighlight) {
    rteHighlight.addEventListener('input', function () {
      if (rteHlSwatch) rteHlSwatch.style.background = rteHighlight.value;
      bodyEl.focus();
      try {
        document.execCommand('styleWithCSS', false, true);
      } catch (e) {}
      // hiliteColor works in most browsers; backColor as fallback
      if (!document.execCommand('hiliteColor', false, rteHighlight.value)) {
        document.execCommand('backColor', false, rteHighlight.value);
      }
      updatePreview();
    });
  }

  btnSignOut.addEventListener('click', function () {
    if (!window.MailMassGraph) {
      graphUser = null;
      setAuthUi();
      return;
    }
    MailMassGraph.signOut().then(function () {
      graphUser = null;
      setAuthUi();
      toast('Signed out');
    }).catch(function () {
      graphUser = null;
      setAuthUi();
    });
  });

  if (btnConnectOutlook) {
    btnConnectOutlook.addEventListener('click', function (e) {
      e.preventDefault();
      setConnectingUi();
      waitingForHelper = false;

      // User gesture: ask Chrome for Local Network Access, then detect helper
      checkHelper().then(function () {
        if (helperReady()) {
          if (window.MailMassConnect) MailMassConnect.markInstalled();
          setAuthUi();
          toast('Outlook already connected on this PC.');
          return null;
        }

        var installed = window.MailMassConnect && MailMassConnect.wasInstalled();
        if (installed) {
          toast('Restarting your Outlook helper…');
          launchHelper(false);
          return ensureHelper(20).then(function (ready) {
            if (ready) {
              setAuthUi();
              toast('Outlook connected on this PC. You can continue.');
              return true;
            }
            toast('Helper did not start — try Copy PowerShell command…');
            waitingForHelper = true;
            setAuthUi();
            return false;
          });
        }

        toast('First-time setup: downloading MailMass_Connect.zip — or use Copy PowerShell if Chrome blocks it.');
        launchHelper(true);
        return ensureHelper(40);
      }).then(function (ready) {
        if (ready === null) return;
        if (ready) {
          waitingForHelper = false;
          if (window.MailMassConnect) MailMassConnect.markInstalled();
          setAuthUi();
          toast('Outlook connected on this PC. You can continue.');
          return;
        }
        waitingForHelper = true;
        setAuthUi();
        if (graphReady()) {
          toast('Helper not seen yet — if Chrome asked for local network access, click Allow, then Connect again.', true);
          return;
        }
        toast('Keep the helper PowerShell window open. If Chrome asks to allow local network access, click Allow, then Connect again.', true);
      }).catch(function (err) {
        waitingForHelper = true;
        setAuthUi();
        toast((err && err.message) || 'Connect failed', true);
      });
    });
  }

  var btnCopyPs = $('btn-copy-ps');
  if (btnCopyPs && window.MailMassConnect) {
    btnCopyPs.addEventListener('click', function () {
      MailMassConnect.copyPowerShell().then(function () {
        toast('Copied. Paste in PowerShell, press Enter. Then come back — Allow local network if Chrome asks, then click Connect.');
        watchForHelper(90);
      }).catch(function () {
        toast('Could not copy. Download MailMass_Connect.zip instead.', true);
      });
    });
  }

  btnPrepare.addEventListener('click', function () {
    if (!validSetup()) return;
    var prepared = rows.map(buildRow).filter(function (m) { return m.email; });
    if (!prepared.length) {
      toast('No valid email addresses found', true);
      return;
    }

    btnPrepare.disabled = true;
    toast('Sending from your Outlook…');

    ensureHelper(8).then(function (ready) {
      if (ready) return sendViaHelper(prepared);
      if (graphReady()) return sendViaGraph(prepared);
      throw new Error('Click «Connect Outlook» in step 1 first (opens the helper — no VBS).');
    }).then(function (data) {
      btnPrepare.disabled = false;
      refreshButtons();
      return refreshAuth().then(function () { return data; });
    }).then(function (data) {
      if (!data) return;
      toast('Sent ' + data.processed + ' email' + (data.processed === 1 ? '' : 's') +
        (data.skipped ? ' (skipped ' + data.skipped + ')' : '') + ' from your Outlook.');
    }).catch(function (err) {
      btnPrepare.disabled = false;
      refreshButtons();
      refreshAuth();
      toast((err && err.message) || 'Send failed', true);
    });
  });

  setConnectingUi();
  ensureHelper(10).then(function () { refreshAuth(); });
  setInterval(function () { refreshAuth(); }, 4000);
  updatePreview();
  refreshButtons();
})();
