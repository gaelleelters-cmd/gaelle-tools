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
          var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          var sheet = wb.Sheets[wb.SheetNames[0]];
          var json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
          if (!json.length) {
            reject(new Error('Sheet is empty'));
            return;
          }
          resolve({ headers: Object.keys(json[0]), rows: json });
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
    fillSelect(colMessage, headers, false);

    colEmail.value = guessCol(headers, ['email', 'e-mail', 'mail']) || headers[1] || headers[0];
    colFirst.value = guessCol(headers, ['first name', 'firstname', 'first', 'prenom', 'prénom', 'name', 'recipient']) || headers[0];
    colSubject.value = guessCol(headers, ['subject', 'subj', 'title']) || '';
    colCc.value = guessCol(headers, ['cc']) || '';
    colBcc.value = guessCol(headers, ['bcc']) || '';
    colMessage.value = guessCol(headers, ['message', 'body', 'text', 'content', 'custom']) || headers[0];

    renderParams();
    updatePreview();
    refreshButtons();
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
    if (!subject) subject = 'Document Attached';

    var messageIsHtml = false;
    var message = '';
    if (msgMode() === 'custom') {
      message = String(row[colMessage.value] || '').trim();
      messageIsHtml = looksLikeHtml(message);
    } else {
      message = applyMerge(getBodyHtml(), row, true).trim();
      messageIsHtml = true;
    }

    var greet = String(greeting.value || '').trim();
    var plainMsg = msgMode() === 'custom'
      ? message
      : applyMerge(getBodyPlain(), row, false).trim();
    var bodyText = greet
      ? (greet + ' ' + (first || 'there') + ',\n\n' + plainMsg)
      : ((first || 'there') + ',\n\n' + plainMsg);

    return {
      first: first,
      email: email,
      cc: cc,
      bcc: bcc,
      subject: subject,
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
    var open = mail.greeting
      ? (mail.greeting + ' ' + (mail.first || 'FirstName') + ',')
      : ((mail.first || 'FirstName') + ',');
    var size = detectMessageFontSize(mail.message);
    var greetStyle = 'margin:0;font-family:Calibri,sans-serif;font-size:' + size +
      ';font-weight:normal;font-style:normal;';
    var wrapOpen = '<div style="font-family:Calibri,sans-serif;font-size:11pt;">' +
      '<p style="' + greetStyle + '"><span style="' + greetStyle + '">' +
      open.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
      '</span></p>' +
      '<p style="margin:0;line-height:12pt;font-size:11pt;">&nbsp;</p>';
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
      var greet = String(greeting.value || '').trim();
      var sample = {
        first: 'FirstName',
        email: '',
        cc: '',
        bcc: '',
        subject: 'Document Attached',
        greeting: greet,
        message: getBodyHtml() || '…',
        messageIsHtml: true
      };
      previewWho.textContent = 'Sample';
      previewMeta.textContent = 'Subject: Document Attached';
      previewMail.innerHTML = buildPreviewHtml(sample);
      return;
    }
    var mail = buildRow(rows[0]);
    previewWho.textContent = (mail.first || 'Row 1') + (mail.email ? ' · ' + mail.email : '');
    previewMeta.textContent =
      'To: ' + (mail.email || '') + '\n' +
      (mail.cc ? 'CC: ' + mail.cc + '\n' : '') +
      (mail.bcc ? 'BCC: ' + mail.bcc + '\n' : '') +
      'Subject: ' + mail.subject +
      (sharedAttachment ? '\nAttachment: ' + sharedAttachment.name : '');
    previewMail.innerHTML = buildPreviewHtml(mail);
  }

  var HELPER_URL = 'http://127.0.0.1:19527';
  var HELPER_MIN_VERSION = 6;
  var helperOnline = false;
  var helperVersion = 0;
  var outlookPill = $('outlook-pill');
  var connectHint = $('connect-hint');

  function setAuthUi() {
    btnSignOut.classList.add('hidden');
    var needsUpdate = helperOnline && helperVersion < HELPER_MIN_VERSION;
    var ready = helperOnline && helperVersion >= HELPER_MIN_VERSION;

    if (ready) {
      if (outlookConnect) outlookConnect.classList.add('hidden');
      if (authReady) authReady.classList.remove('hidden');
      if (outlookPill) {
        outlookPill.textContent = 'Connected';
        outlookPill.className = 'outlook-pill is-on';
      }
      if (authStatus) authStatus.textContent = 'Outlook is ready on this PC.';
      return;
    }

    if (outlookConnect) outlookConnect.classList.remove('hidden');
    if (authReady) authReady.classList.add('hidden');

    if (needsUpdate) {
      if (outlookPill) {
        outlookPill.textContent = 'Update needed';
        outlookPill.className = 'outlook-pill is-off';
      }
      if (authStatus) {
        authStatus.textContent = 'Click the blue button below: Connect / Update Outlook';
      }
      if (btnConnectOutlook) btnConnectOutlook.textContent = 'Connect / Update Outlook';
      if (connectHint) {
        connectHint.innerHTML = 'Click the blue button. If Windows asks, choose <strong>Open</strong>.';
      }
      return;
    }

    if (outlookPill) {
      outlookPill.textContent = 'Not connected';
      outlookPill.className = 'outlook-pill is-off';
    }
    if (authStatus) {
      authStatus.textContent = 'Optional — you can still send: the Send button downloads a small file that mails from YOUR own Outlook on this computer.';
    }
    if (btnConnectOutlook) btnConnectOutlook.textContent = 'Connect / Update Outlook';
  }

  function setConnectingUi() {
    if (outlookPill) {
      outlookPill.textContent = 'Connecting…';
      outlookPill.className = 'outlook-pill is-wait';
    }
    if (authStatus) authStatus.textContent = 'Updating Outlook helper — wait a few seconds…';
    if (btnConnectOutlook) {
      btnConnectOutlook.classList.add('is-busy');
      btnConnectOutlook.textContent = 'Connecting…';
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function checkHelper() {
    return fetch(HELPER_URL + '/health', { method: 'GET', cache: 'no-store' })
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

  function wakeHelper() {
    try {
      var iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;border:0;pointer-events:none';
      iframe.src = 'mailmass://start';
      document.body.appendChild(iframe);
      setTimeout(function () {
        try { iframe.remove(); } catch (e) {}
      }, 4000);
    } catch (e) {}
    // Also try opening the protocol in a way Windows may prompt once
    try {
      var a = document.createElement('a');
      a.href = 'mailmass://start';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { try { a.remove(); } catch (e2) {} }, 500);
    } catch (e3) {}
  }

  function ensureHelper(attemptsLeft, requireCurrent) {
    var left = typeof attemptsLeft === 'number' ? attemptsLeft : 20;
    var needVersion = !!requireCurrent;
    return checkHelper().then(function (online) {
      if (online && (!needVersion || helperVersion >= HELPER_MIN_VERSION)) return true;
      if (left <= 0) return false;
      if (left === 20 || left === 15 || left === 10 || left === 5) wakeHelper();
      return sleep(500).then(function () {
        return ensureHelper(left - 1, needVersion);
      });
    });
  }

  function launchUpdaterFromApp() {
    wakeHelper();
    var candidates = [];
    try {
      if (location.protocol === 'file:') {
        var base = location.href.replace(/[^\/?#]*([?#].*)?$/, '');
        candidates.push(base + 'helper/Start-MailMassHelper.vbs');
        candidates.push(base + 'Start%20Mail%20Mass.bat');
      }
    } catch (e) {}
    // Served from the website: downloads the self-installing helper.
    // It works from any folder on the visitor's PC (Downloads, Desktop, USB).
    candidates.push('helper/Start-MailMassHelper.vbs');

    candidates.forEach(function (href, idx) {
      setTimeout(function () {
        try {
          var link = document.createElement('a');
          link.href = href;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          setTimeout(function () { try { link.remove(); } catch (e2) {} }, 1500);
        } catch (e3) {}
      }, idx * 400);
    });
  }

  function sendViaHelper(prepared) {
    var payload = {
      displayOnly: '0',
      mails: prepared.map(function (m) {
        return {
          first: m.first,
          email: m.email,
          attach: '',
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
    return fetch(HELPER_URL + '/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data.ok) {
          throw new Error((data && data.error) || 'Outlook send failed');
        }
        return data;
      });
    });
  }

  function refreshAuth() {
    return checkHelper().then(function () {
      setAuthUi();
    });
  }

  browseBtn.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('click', function (e) {
    if (e.target === browseBtn || e.target === fileRemove) return;
    if (!rows.length) fileInput.click();
  });

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

  [colEmail, colFirst, colSubject, colCc, colBcc, colMessage, greeting]
    .forEach(function (el) {
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
    if (window.MailMassGraph) {
      MailMassGraph.signOut().then(function () {
        setAuthUi();
        toast('Signed out');
      }).catch(function () { setAuthUi(); });
    }
  });

  if (btnConnectOutlook) {
    btnConnectOutlook.addEventListener('click', function (e) {
      e.preventDefault();
      setConnectingUi();
      toast('Connecting Outlook… If Windows asks, choose Open.');
      launchUpdaterFromApp();
      ensureHelper(30, true).then(function (ready) {
        if (btnConnectOutlook) {
          btnConnectOutlook.classList.remove('is-busy');
          btnConnectOutlook.textContent = 'Connect / Update Outlook';
        }
        setAuthUi();
        if (ready) {
          toast('Outlook connected. You can continue.');
        } else {
          toast('Still updating… Click Connect / Update Outlook again, and choose Open if Windows asks.', true);
        }
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

    ensureHelper(6, true).then(function (ready) {
      if (ready) return sendViaHelper(prepared);
      // No helper on this PC: download the self-contained sender instead.
      // It embeds everything and runs from any folder, using the Outlook
      // of whoever double-clicks it — always the visitor's own mailbox.
      var result = window.MailMassOneShot
        ? MailMassOneShot.download(prepared, sharedAttachment)
        : null;
      if (!result) {
        if (outlookConnect) outlookConnect.classList.remove('hidden');
        throw new Error('Click «Connect / Update Outlook» in step 1 first. If Windows asks, choose Open.');
      }
      toast('Downloaded MailMass_Send_Now.vbs — double-click it to send from YOUR Outlook. It works from any folder.');
      return result;
    }).then(function (data) {
      btnPrepare.disabled = false;
      refreshButtons();
      refreshAuth();
      if (!data) return;
      if (data.mode === 'oneshot') return;
      toast('Sent ' + data.processed + ' email' + (data.processed === 1 ? '' : 's') +
        (data.skipped ? ' (skipped ' + data.skipped + ')' : '') + ' from Outlook.');
    }).catch(function (err) {
      btnPrepare.disabled = false;
      refreshButtons();
      refreshAuth();
      toast(err.message || 'Send failed', true);
    });
  });

  // Wake Outlook bridge as soon as the page opens
  setConnectingUi();
  wakeHelper();
  ensureHelper(16, true).then(function () {
    if (btnConnectOutlook) {
      btnConnectOutlook.classList.remove('is-busy');
      btnConnectOutlook.textContent = 'Connect / Update Outlook';
    }
    refreshAuth();
  });
  setInterval(refreshAuth, 5000);
  updatePreview();
  refreshButtons();
})();
