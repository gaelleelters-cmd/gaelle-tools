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
  var previewBody = $('preview-body');
  var previewWho = $('preview-who');
  var btnPrepare = $('btn-prepare');
  var btnSignOut = $('btn-signout');
  var authStatus = $('auth-status');
  var toastWrap = $('toast-wrap');

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

  function insertAtCursor(textarea, text) {
    var start = textarea.selectionStart || 0;
    var end = textarea.selectionEnd || 0;
    var val = textarea.value;
    textarea.value = val.slice(0, start) + text + val.slice(end);
    textarea.focus();
    var pos = start + text.length;
    textarea.setSelectionRange(pos, pos);
  }

  function applyMerge(template, row) {
    return String(template || '').replace(/\{([^}]+)\}/g, function (_, key) {
      var k = key.trim();
      if (Object.prototype.hasOwnProperty.call(row, k)) return String(row[k] == null ? '' : row[k]);
      var found = headers.find(function (h) { return h.toLowerCase() === k.toLowerCase(); });
      if (found) return String(row[found] == null ? '' : row[found]);
      return '{' + key + '}';
    });
  }

  function buildRow(row) {
    var first = String(row[colFirst.value] || '').trim();
    var email = String(row[colEmail.value] || '').trim();
    var cc = colCc.value ? String(row[colCc.value] || '').trim() : '';
    var bcc = colBcc.value ? String(row[colBcc.value] || '').trim() : '';
    var subject = colSubject.value ? String(row[colSubject.value] || '').trim() : '';
    if (!subject) subject = 'Document Attached';

    var message = msgMode() === 'custom'
      ? String(row[colMessage.value] || '').trim()
      : applyMerge(bodyEl.value, row).trim();

    var greet = String(greeting.value || '').trim();
    var bodyText = greet
      ? (greet + ' ' + (first || 'there') + ',\n\n' + message)
      : ((first || 'there') + ',\n\n' + message);

    return {
      first: first,
      email: email,
      cc: cc,
      bcc: bcc,
      subject: subject,
      bodyText: bodyText,
      message: message,
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

  function updatePreview() {
    updateGreetingPreview();
    if (!rows.length || !colFirst.value) {
      var greet = String(greeting.value || '').trim();
      previewBody.textContent = (greet ? (greet + ' FirstName,') : 'FirstName,') + '\n\n' + (bodyEl.value || '…');
      previewWho.textContent = 'Sample';
      return;
    }
    var mail = buildRow(rows[0]);
    previewWho.textContent = (mail.first || 'Row 1') + (mail.email ? ' · ' + mail.email : '');
    previewBody.textContent =
      'To: ' + (mail.email || '') + '\n' +
      (mail.cc ? 'CC: ' + mail.cc + '\n' : '') +
      (mail.bcc ? 'BCC: ' + mail.bcc + '\n' : '') +
      'Subject: ' + mail.subject + '\n' +
      (sharedAttachment ? 'Attachment: ' + sharedAttachment.name + '\n' : '') +
      '\n' + mail.bodyText;
  }

  var HELPER_URL = 'http://127.0.0.1:19527';
  var helperOnline = false;

  function setAuthUi() {
    btnSignOut.classList.add('hidden');
    if (helperOnline) {
      authStatus.textContent = 'Outlook on this PC is connected — Send goes straight through your Outlook.';
    } else {
      authStatus.textContent = 'Click Send — a small Outlook file downloads. Open it once to send from your mailbox (like Word mail merge).';
    }
  }

  function checkHelper() {
    return fetch(HELPER_URL + '/health', { method: 'GET', cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        helperOnline = !!(data && data.ok);
        return helperOnline;
      })
      .catch(function () {
        helperOnline = false;
        return false;
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
          throw new Error((data && data.error) || 'Outlook helper send failed');
        }
        return data;
      });
    });
  }

  function sendViaOneShot(prepared) {
    if (!window.MailMassOneShot) {
      throw new Error('Send helper script failed to load. Refresh the page and try again.');
    }
    return Promise.resolve(MailMassOneShot.download(prepared, sharedAttachment));
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

  [colEmail, colFirst, colSubject, colCc, colBcc, colMessage, greeting, bodyEl]
    .forEach(function (el) {
      el.addEventListener('input', function () { updatePreview(); refreshButtons(); });
      el.addEventListener('change', function () { updatePreview(); refreshButtons(); });
    });

  btnSignOut.addEventListener('click', function () {
    if (window.MailMassGraph) {
      MailMassGraph.signOut().then(function () {
        setAuthUi();
        toast('Signed out');
      }).catch(function () { setAuthUi(); });
    }
  });

  btnPrepare.addEventListener('click', function () {
    if (!validSetup()) return;
    var prepared = rows.map(buildRow).filter(function (m) { return m.email; });
    if (!prepared.length) {
      toast('No valid email addresses found', true);
      return;
    }

    btnPrepare.disabled = true;

    checkHelper().then(function (online) {
      if (online) {
        toast('Sending via your Outlook…');
        return sendViaHelper(prepared);
      }
      toast('Downloading Outlook sender… open the file to send.');
      return sendViaOneShot(prepared);
    }).then(function (data) {
      btnPrepare.disabled = false;
      refreshButtons();
      refreshAuth();
      if (!data) return;
      if (data.mode === 'oneshot') {
        toast('Open MailMass_Send_Now.vbs from your Downloads folder — it sends from your Outlook.');
        return;
      }
      toast('Done — sent ' + data.processed + (data.skipped ? ', skipped ' + data.skipped : ''));
    }).catch(function (err) {
      btnPrepare.disabled = false;
      refreshButtons();
      toast(err.message || 'Send failed', true);
    });
  });

  refreshAuth();
  setInterval(refreshAuth, 8000);
  updatePreview();
  refreshButtons();
})();
