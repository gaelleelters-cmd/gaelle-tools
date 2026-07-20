(function () {
  'use strict';

  var rows = [];
  var headers = [];

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
  var colAttach = $('col-attach');
  var colCc = $('col-cc');
  var colBcc = $('col-bcc');
  var colMessage = $('col-message');
  var greeting = $('greeting');
  var greetingPreview = $('greeting-preview');
  var subjectEl = $('subject');
  var bodyEl = $('body');
  var sameWrap = $('same-msg-wrap');
  var customWrap = $('custom-msg-wrap');
  var paramRow = $('param-row');
  var previewBody = $('preview-body');
  var previewWho = $('preview-who');
  var btnPrepare = $('btn-prepare');
  var optDisplay = $('opt-display');
  var toastWrap = $('toast-wrap');
  var helperStatus = $('helper-status');

  var HELPER_URL = 'http://127.0.0.1:19527';
  var helperOnline = false;

  function setHelperStatus(online) {
    helperOnline = online;
    if (!helperStatus) return;
    helperStatus.textContent = online
      ? 'Status: connected — Send with Outlook will use your Outlook automatically.'
      : 'Status: not connected — download and open the helper above, then come back here.';
    var panel = document.getElementById('setup-panel');
    if (panel) panel.classList.toggle('setup-panel--ok', online);
  }

  function checkHelper() {
    return fetch(HELPER_URL + '/health', { method: 'GET', cache: 'no-store' })
      .then(function (res) { return res.ok; })
      .catch(function () { return false; })
      .then(function (ok) {
        setHelperStatus(ok);
        return ok;
      });
  }

  function sendViaHelper(prepared, displayOnly) {
    var payload = {
      displayOnly: displayOnly,
      mails: prepared.map(function (m) {
        return {
          first: m.first,
          email: m.email,
          attach: m.attach,
          cc: m.cc,
          bcc: m.bcc,
          subject: m.subject,
          message: m.message,
          greeting: greeting.value
        };
      })
    };
    return fetch(HELPER_URL + '/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data.ok) {
          throw new Error((data && data.error) || 'Helper send failed');
        }
        return data;
      });
    });
  }

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

  function setupMapping(parsed, name) {
    headers = parsed.headers;
    rows = parsed.rows;
    fileName.textContent = name + ' · ' + rows.length.toLocaleString() + ' rows';
    dropEmpty.classList.add('hidden');
    dropFile.classList.remove('hidden');
    mapSection.classList.remove('hidden');

    fillSelect(colEmail, headers, false);
    fillSelect(colFirst, headers, false);
    fillSelect(colAttach, headers, true);
    fillSelect(colCc, headers, true);
    fillSelect(colBcc, headers, true);
    fillSelect(colMessage, headers, false);

    colEmail.value = guessCol(headers, ['email', 'e-mail', 'mail']) || headers[1] || headers[0];
    colFirst.value = guessCol(headers, ['first name', 'firstname', 'first', 'prenom', 'prénom', 'name', 'recipient']) || headers[0];
    colAttach.value = guessCol(headers, ['attachment', 'attach', 'path', 'file', 'document']) || '';
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
    var attach = colAttach.value ? String(row[colAttach.value] || '').trim() : '';
    var cc = colCc.value ? String(row[colCc.value] || '').trim() : '';
    var bcc = colBcc.value ? String(row[colBcc.value] || '').trim() : '';
    var subject = applyMerge(subjectEl.value, row).trim();
    if (!subject) subject = 'Document Attached';

    var message = '';
    if (msgMode() === 'custom') {
      message = String(row[colMessage.value] || '').trim();
    } else {
      message = applyMerge(bodyEl.value, row).trim();
    }

    var greet = String(greeting.value || '').trim();
    var bodyText = greet
      ? (greet + ' ' + (first || 'there') + ',\n\n' + message)
      : ((first || 'there') + ',\n\n' + message);

    return {
      first: first,
      email: email,
      attach: attach,
      cc: cc,
      bcc: bcc,
      subject: subject,
      bodyText: bodyText,
      message: message
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
    if (greet) {
      greetingPreview.innerHTML = greet + ' <em>FirstName</em>,';
    } else {
      greetingPreview.innerHTML = '<em>FirstName</em>,';
    }
  }

  function updatePreview() {
    updateGreetingPreview();
    if (!rows.length || !colFirst.value) {
      var greet = String(greeting.value || '').trim();
      var openLine = greet ? (greet + ' FirstName,') : 'FirstName,';
      previewBody.textContent = openLine + '\n\n' + (bodyEl.value || '…') +
        '\n\n[Your Outlook signature from Signatures folder]';
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
      (mail.attach ? 'Attachment: ' + mail.attach + '\n' : '') +
      '\n' + mail.bodyText +
      '\n\n[Your Outlook signature is applied in Outlook compose format]';
  }

  function csvEscape(val) {
    var s = String(val == null ? '' : val);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function vbsBase64Chunks(b64) {
    var chunkSize = 80;
    var lines = ['b64 = ""'];
    for (var i = 0; i < b64.length; i += chunkSize) {
      lines.push('b64 = b64 & "' + b64.substr(i, chunkSize) + '"');
    }
    return lines.join('\r\n');
  }

  function buildSenderVbs(csvText) {
    var b64Block = vbsBase64Chunks(utf8ToBase64(csvText));
    return [
      "' Mail Mass - self-contained Outlook sender",
      "' Generated by the website. Double-click this file to send. Do NOT upload it back to the site.",
      "Option Explicit",
      "",
      "Dim OutlookApp, OutlookMail, inspector",
      "Dim fso, cols, b64, csvText",
      "Dim firstName, emailAddr, attachPath, ccEmail, bccEmail, subjectText, messageText, greetingText",
      "Dim displayOnly, emailBody, sentCount, skippedCount",
      "Dim allRows, ri",
      "",
      "Set fso = CreateObject(\"Scripting.FileSystemObject\")",
      "",
      b64Block,
      "csvText = DecodeBase64Utf8(b64)",
      "If Left(csvText, 1) = ChrW(&HFEFF) Then csvText = Mid(csvText, 2)",
      "",
      "On Error Resume Next",
      "Set OutlookApp = GetObject(, \"Outlook.Application\")",
      "If OutlookApp Is Nothing Then Set OutlookApp = CreateObject(\"Outlook.Application\")",
      "On Error GoTo 0",
      "",
      "If OutlookApp Is Nothing Then",
      "  MsgBox \"Could not start Outlook. Please open Outlook and try again.\", vbCritical, \"Mail Mass\"",
      "  WScript.Quit 1",
      "End If",
      "",
      "Set allRows = ParseCsvRecords(csvText)",
      "sentCount = 0",
      "skippedCount = 0",
      "",
      "For ri = 0 To allRows.Count - 1",
      "  If ri > 0 Then",
      "    cols = allRows(ri)",
      "    firstName = GetCol(cols, 0)",
      "    emailAddr = GetCol(cols, 1)",
      "    attachPath = GetCol(cols, 2)",
      "    If Len(attachPath) >= 2 Then",
      "      If Left(attachPath, 1) = \"\"\"\" And Right(attachPath, 1) = \"\"\"\" Then",
      "        attachPath = Mid(attachPath, 2, Len(attachPath) - 2)",
      "      End If",
      "    End If",
      "    ccEmail = GetCol(cols, 3)",
      "    bccEmail = GetCol(cols, 4)",
      "    subjectText = GetCol(cols, 5)",
      "    messageText = GetCol(cols, 6)",
      "    greetingText = GetCol(cols, 7)",
      "    displayOnly = GetCol(cols, 8)",
      "    If subjectText = \"\" Then subjectText = \"Document Attached\"",
      "",
      "    If emailAddr = \"\" Then",
      "      skippedCount = skippedCount + 1",
      "    ElseIf attachPath <> \"\" And Not fso.FileExists(attachPath) Then",
      "      skippedCount = skippedCount + 1",
      "    Else",
      "      Set OutlookMail = OutlookApp.CreateItem(0)",
      "      OutlookMail.BodyFormat = 2",
      "      Set inspector = OutlookMail.GetInspector",
      "      WScript.Sleep 200",
      "      emailBody = BuildMessageHtml(greetingText, firstName, messageText)",
      "      OutlookMail.HTMLBody = InsertIntoBody(OutlookMail.HTMLBody, emailBody)",
      "      OutlookMail.To = emailAddr",
      "      If ccEmail <> \"\" Then OutlookMail.CC = ccEmail",
      "      If bccEmail <> \"\" Then OutlookMail.BCC = bccEmail",
      "      OutlookMail.Subject = subjectText",
      "      If attachPath <> \"\" Then OutlookMail.Attachments.Add attachPath",
      "      On Error Resume Next",
      "      inspector.Close 0",
      "      On Error GoTo 0",
      "      Set inspector = Nothing",
      "      If displayOnly = \"0\" Then",
      "        OutlookMail.Send",
      "      Else",
      "        OutlookMail.Display",
      "      End If",
      "      Set OutlookMail = Nothing",
      "      sentCount = sentCount + 1",
      "      WScript.Sleep 400",
      "    End If",
      "  End If",
      "Next",
      "",
      "MsgBox \"Done.\" & vbCrLf & \"Processed: \" & sentCount & vbCrLf & \"Skipped: \" & skippedCount, vbInformation, \"Mail Mass\"",
      "",
      "Function DecodeBase64Utf8(b64Text)",
      "  Dim xml, node, stream",
      "  Set xml = CreateObject(\"MSXML2.DOMDocument.3.0\")",
      "  Set node = xml.createElement(\"b64\")",
      "  node.dataType = \"bin.base64\"",
      "  node.text = b64Text",
      "  Set stream = CreateObject(\"ADODB.Stream\")",
      "  stream.Type = 1",
      "  stream.Open",
      "  stream.Write node.nodeTypedValue",
      "  stream.Position = 0",
      "  stream.Type = 2",
      "  stream.Charset = \"utf-8\"",
      "  DecodeBase64Utf8 = stream.ReadText",
      "  stream.Close",
      "End Function",
      "",
      "Function BuildMessageHtml(greetingText, firstName, messageText)",
      "  Dim openLine, paras, i, html, p, t",
      "  If Trim(greetingText & \"\") <> \"\" Then",
      "    openLine = HtmlEsc(greetingText) & \" \" & HtmlEsc(firstName) & \",\"",
      "  Else",
      "    openLine = HtmlEsc(firstName) & \",\"",
      "  End If",
      "  html = \"<div style='font-family:Calibri,sans-serif;font-size:11.0pt;font-weight:normal;font-style:normal;'>\" & _",
      "         \"<p class=MsoNormal style='margin:0 0 8pt 0;font-weight:normal;'>\" & openLine & \"</p>\"",
      "  t = NormalizeNewlines(messageText)",
      "  paras = Split(t, vbLf & vbLf)",
      "  For i = 0 To UBound(paras)",
      "    p = Trim(paras(i))",
      "    If p <> \"\" Then",
      "      p = Replace(HtmlEsc(p), vbLf, \"<br>\")",
      "      html = html & \"<p class=MsoNormal style='margin:0 0 8pt 0;font-weight:normal;'>\" & p & \"</p>\"",
      "    End If",
      "  Next",
      "  html = html & \"</div>\"",
      "  BuildMessageHtml = html",
      "End Function",
      "",
      "Function InsertIntoBody(fullHtml, contentHtml)",
      "  Dim lower, pos, gt",
      "  If Trim(fullHtml & \"\") = \"\" Then",
      "    InsertIntoBody = contentHtml",
      "    Exit Function",
      "  End If",
      "  lower = LCase(fullHtml)",
      "  pos = InStr(1, lower, \"<body\")",
      "  If pos > 0 Then",
      "    gt = InStr(pos, fullHtml, \">\")",
      "    If gt > 0 Then",
      "      InsertIntoBody = Left(fullHtml, gt) & contentHtml & Mid(fullHtml, gt + 1)",
      "      Exit Function",
      "    End If",
      "  End If",
      "  InsertIntoBody = contentHtml & fullHtml",
      "End Function",
      "",
      "Function NormalizeNewlines(s)",
      "  Dim t",
      "  t = s & \"\"",
      "  t = Replace(t, vbCrLf, vbLf)",
      "  t = Replace(t, vbCr, vbLf)",
      "  NormalizeNewlines = t",
      "End Function",
      "",
      "Function ParseCsvRecords(text)",
      "  Dim rows, fields, i, ch, inQ, cur, allEmpty, fi",
      "  Set rows = CreateObject(\"Scripting.Dictionary\")",
      "  Set fields = CreateObject(\"Scripting.Dictionary\")",
      "  cur = \"\"",
      "  inQ = False",
      "  text = Replace(text, vbCrLf, vbLf)",
      "  text = Replace(text, vbCr, vbLf)",
      "  For i = 1 To Len(text)",
      "    ch = Mid(text, i, 1)",
      "    If ch = \"\"\"\" Then",
      "      If inQ And i < Len(text) And Mid(text, i + 1, 1) = \"\"\"\" Then",
      "        cur = cur & \"\"\"\"",
      "        i = i + 1",
      "      Else",
      "        inQ = Not inQ",
      "      End If",
      "    ElseIf ch = \",\" And Not inQ Then",
      "      fields.Add fields.Count, cur",
      "      cur = \"\"",
      "    ElseIf ch = vbLf And Not inQ Then",
      "      fields.Add fields.Count, cur",
      "      allEmpty = True",
      "      For fi = 0 To fields.Count - 1",
      "        If Trim(fields(fi) & \"\") <> \"\" Then allEmpty = False",
      "      Next",
      "      If Not allEmpty Then rows.Add rows.Count, DictToArray(fields)",
      "      Set fields = CreateObject(\"Scripting.Dictionary\")",
      "      cur = \"\"",
      "    Else",
      "      cur = cur & ch",
      "    End If",
      "  Next",
      "  If cur <> \"\" Or fields.Count > 0 Then",
      "    fields.Add fields.Count, cur",
      "    allEmpty = True",
      "    For fi = 0 To fields.Count - 1",
      "      If Trim(fields(fi) & \"\") <> \"\" Then allEmpty = False",
      "    Next",
      "    If Not allEmpty Then rows.Add rows.Count, DictToArray(fields)",
      "  End If",
      "  Set ParseCsvRecords = rows",
      "End Function",
      "",
      "Function DictToArray(dict)",
      "  Dim arr(), i",
      "  If dict.Count = 0 Then",
      "    ReDim arr(0)",
      "    arr(0) = \"\"",
      "    DictToArray = arr",
      "    Exit Function",
      "  End If",
      "  ReDim arr(dict.Count - 1)",
      "  For i = 0 To dict.Count - 1",
      "    arr(i) = dict(i)",
      "  Next",
      "  DictToArray = arr",
      "End Function",
      "",
      "Function GetCol(arr, idx)",
      "  If IsArray(arr) Then",
      "    If UBound(arr) >= idx Then",
      "      GetCol = Trim(arr(idx) & \"\")",
      "      Exit Function",
      "    End If",
      "  End If",
      "  GetCol = \"\"",
      "End Function",
      "",
      "Function HtmlEsc(s)",
      "  Dim t",
      "  t = s & \"\"",
      "  t = Replace(t, \"&\", \"&amp;\")",
      "  t = Replace(t, \"<\", \"&lt;\")",
      "  t = Replace(t, \">\", \"&gt;\")",
      "  t = Replace(t, \"\"\"\", \"&quot;\")",
      "  HtmlEsc = t",
      "End Function",
      ""
    ].join('\r\n');
  }

  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  // Events
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

  document.querySelectorAll('input[name="msg-mode"]').forEach(function (r) {
    r.addEventListener('change', function () {
      var custom = msgMode() === 'custom';
      sameWrap.classList.toggle('hidden', custom);
      customWrap.classList.toggle('hidden', !custom);
      updatePreview();
      refreshButtons();
    });
  });

  [colEmail, colFirst, colAttach, colCc, colBcc, colMessage, greeting, subjectEl, bodyEl]
    .forEach(function (el) {
      el.addEventListener('input', function () { updatePreview(); refreshButtons(); });
      el.addEventListener('change', function () { updatePreview(); refreshButtons(); });
    });

  btnPrepare.addEventListener('click', function () {
    if (!validSetup()) return;
    var prepared = rows.map(buildRow).filter(function (m) { return m.email; });
    if (!prepared.length) {
      toast('No valid email addresses found', true);
      return;
    }

    var displayOnly = optDisplay.checked ? '1' : '0';
    btnPrepare.disabled = true;

    checkHelper().then(function (online) {
      if (!online) {
        btnPrepare.disabled = false;
        toast('Start the Outlook helper first (link under the button), then click Send again', true);
        return null;
      }
      toast(displayOnly === '1' ? 'Sending to Outlook for review…' : 'Sending via Outlook…');
      return sendViaHelper(prepared, displayOnly);
    }).then(function (data) {
      btnPrepare.disabled = false;
      if (!data) return;
      toast('Done — processed ' + data.processed +
        (data.skipped ? ', skipped ' + data.skipped : ''));
    }).catch(function (err) {
      btnPrepare.disabled = false;
      setHelperStatus(false);
      toast(err.message || 'Could not reach Outlook helper', true);
    });
  });

  checkHelper();
  setInterval(checkHelper, 5000);

  updatePreview();
  refreshButtons();
})();
