/**
 * WhatsApp Tool — single bundled script (toolbar, send, formula, bulk)
 */
(function () {
  'use strict';

  /* ---------- Formatting → Unicode (pre-filled links don't parse *markdown*) ---------- */
  function buildCharMap(source, codePointStart) {
    const map = {};
    for (let i = 0; i < source.length; i++) {
      map[source[i]] = String.fromCodePoint(codePointStart + i);
    }
    return map;
  }

  const BOLD_MAP = {
    ...buildCharMap('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 0x1D5D4),
    ...buildCharMap('abcdefghijklmnopqrstuvwxyz', 0x1D5EE),
    ...buildCharMap('0123456789', 0x1D7EC),
  };
  const ITALIC_MAP = {
    ...buildCharMap('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 0x1D608),
    ...buildCharMap('abcdefghijklmnopqrstuvwxyz', 0x1D622),
  };
  const MONO_MAP = {
    ...buildCharMap('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 0x1D670),
    ...buildCharMap('abcdefghijklmnopqrstuvwxyz', 0x1D68A),
    ...buildCharMap('0123456789', 0x1D7F6),
  };

  function buildReverseStyleMap() {
    const rev = {};
    [BOLD_MAP, ITALIC_MAP, MONO_MAP].forEach((charMap) => {
      Object.entries(charMap).forEach(([ascii, styled]) => { rev[styled] = ascii; });
    });
    return rev;
  }
  const REVERSE_STYLE_MAP = buildReverseStyleMap();

  function denormalizeStyledText(str) {
    return [...str].map((ch) => REVERSE_STYLE_MAP[ch] || ch).join('');
  }

  function normalizeParamPlaceholders(text) {
    return String(text).replace(/\{([^}]+)\}/g, (_, inner) => {
      const plain = denormalizeStyledText(inner).trim();
      const m = /^Param\s*(\d+)$/i.exec(plain);
      return m ? `{Param ${m[1]}}` : `{${inner}}`;
    });
  }

  function detectMaxParam(text) {
    let max = 0;
    normalizeParamPlaceholders(text).replace(/\{Param\s*(\d+)\}/gi, (_, n) => {
      max = Math.max(max, parseInt(n, 10));
      return '';
    });
    return max;
  }

  function mapChars(str, charMap) {
    return [...str].map((ch) => charMap[ch] || ch).join('');
  }
  function toStrike(str) {
    return [...str].map((ch) => ch + '\u0336').join('');
  }
  function convertWhatsAppForSend(text) {
    if (!text) return '';
    let result = text.normalize('NFC');
    result = result.replace(/```([\s\S]+?)```/g, (_, inner) => mapChars(inner, MONO_MAP));
    result = result.replace(/\*([^*\n]+)\*/g, (_, inner) => mapChars(inner, BOLD_MAP));
    result = result.replace(/_([^_\n]+)_/g, (_, inner) => mapChars(inner, ITALIC_MAP));
    result = result.replace(/~([^~\n]+)~/g, (_, inner) => toStrike(inner));
    return result;
  }

  function cleanPhone(phone) {
    return String(phone).trim().replace(/[^\d+]/g, '').replace(/^\+/, '');
  }
  /** web.whatsapp.com for desktop; api.whatsapp.com for mobile (wa.me corrupts emojis) */
  function buildWaUrl(phone, message) {
    const digits = cleanPhone(phone);
    if (!digits) return null;
    const ready = convertWhatsAppForSend(message).normalize('NFC');
    const encoded = encodeURIComponent(ready);
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const base = isMobile
      ? 'https://api.whatsapp.com/send'
      : 'https://web.whatsapp.com/send';
    return `${base}?phone=${digits}&text=${encoded}`;
  }

  /* ---------- Formula builders (client-side) ---------- */
  function sheetsUnicharExpr(codePoint) {
    if (codePoint <= 0xFFFF) return `UNICHAR(${codePoint})`;
    const adjusted = codePoint - 0x10000;
    const high = 0xD800 + (adjusted >> 10);
    const low = 0xDC00 + (adjusted & 0x3FF);
    return `UNICHAR(${high})&UNICHAR(${low})`;
  }

  function sheetsTextLiteral(text) {
    if (!text) return '""';
    const parts = [];
    let asciiRun = '';
    const flush = () => {
      if (!asciiRun) return;
      parts.push(`"${asciiRun.replace(/"/g, '""')}"`);
      asciiRun = '';
    };
    for (const ch of text) {
      if (ch.codePointAt(0) < 128) asciiRun += ch;
      else {
        flush();
        parts.push(sheetsUnicharExpr(ch.codePointAt(0)));
      }
    }
    flush();
    return parts.length ? parts.join('&') : '""';
  }

  function excelTextLiteral(text) {
    return `"${String(text).replace(/"/g, '""')}"`;
  }

  function formatFormulaStringLiteral(part, forSheets) {
    if (!part) return '""';
    const literal = forSheets ? sheetsTextLiteral : excelTextLiteral;
    if (!/[\r\n]/.test(part)) return literal(part);
    const lines = part.split(/\r?\n/);
    const chunks = [];
    lines.forEach((line, i) => {
      if (i > 0) chunks.push('CHAR(10)');
      if (line) chunks.push(literal(line));
    });
    return chunks.length ? chunks.join('&') : '""';
  }

  function buildMessageFormula(messageTemplate, paramColumns, row, forSheets) {
    const sentinel = '\u0000';
    let result = normalizeParamPlaceholders(messageTemplate);
    paramColumns.forEach((col, i) => {
      const c = String(col || '').trim().toUpperCase();
      if (!c) return;
      result = result.split(`{Param ${i + 1}}`).join(`${sentinel}${c}${row}${sentinel}`);
    });
    const parts = result.split(sentinel);
    const formulaParts = [];
    parts.forEach((part) => {
      if (/^[A-Z]+\d+$/.test(part)) {
        formulaParts.push(forSheets ? `(${part}&"")` : part);
      } else if (part) {
        formulaParts.push(formatFormulaStringLiteral(part, forSheets));
      }
    });
    return formulaParts.length ? formulaParts.join('&') : '""';
  }

  function generateExcelFormula(phoneCol, messageTemplate, paramColumns, row) {
    const phoneCell = `${phoneCol.toUpperCase()}${row}`;
    const msgExpr = buildMessageFormula(messageTemplate, paramColumns, row, false);
    const url =
      `"https://web.whatsapp.com/send?phone="&SUBSTITUTE(SUBSTITUTE(${phoneCell}," ",""),"+","")` +
      `&"&text="&ENCODEURL(${msgExpr})`;
    return `=HYPERLINK(${url},"Send WhatsApp")`;
  }

  function generateExcelUrlFormula(phoneCol, messageTemplate, paramColumns, row) {
    const phoneCell = `${phoneCol.toUpperCase()}${row}`;
    const msgExpr = buildMessageFormula(messageTemplate, paramColumns, row, false);
    const url =
      `"https://web.whatsapp.com/send?phone="&SUBSTITUTE(SUBSTITUTE(${phoneCell}," ",""),"+","")` +
      `&"&text="&ENCODEURL(${msgExpr})`;
    return `=${url}`;
  }

  function generateSheetsFormulaWithSep(phoneCol, messageTemplate, paramColumns, row, argSep, baseUrl) {
    const sep = argSep || ',';
    const base = baseUrl || 'https://web.whatsapp.com/send';
    const phoneCell = `${phoneCol.toUpperCase()}${row}`;
    const msgExpr = buildMessageFormula(messageTemplate, paramColumns, row, true);
    const phoneExpr = `REGEXREPLACE(${phoneCell}&""${sep}"[^0-9]"${sep}"")`;
    const url = `"${base}?phone="&${phoneExpr}&"&text="&ENCODEURL(${msgExpr})`;
    return `=HYPERLINK(${url}${sep}"Send WhatsApp")`;
  }

  function generateAllFormulas(phoneCol, message, paramColumns, row) {
    return {
      excel: generateExcelFormula(phoneCol, message, paramColumns, row),
      excel_url: generateExcelUrlFormula(phoneCol, message, paramColumns, row),
      google_sheets: generateSheetsFormulaWithSep(
        phoneCol, message, paramColumns, row, ',', 'https://web.whatsapp.com/send'
      ),
      google_sheets_app: generateSheetsFormulaWithSep(
        phoneCol, message, paramColumns, row, ',', 'https://api.whatsapp.com/send'
      ),
    };
  }

  /* ---------- Spreadsheet parsing (client-side via SheetJS) ---------- */
  function cellToString(value) {
    if (value == null) return '';
    if (typeof value === 'number' && Number.isFinite(value) && Math.floor(value) === value) {
      return String(value);
    }
    const text = String(value).trim();
    return text.toLowerCase() === 'nan' ? '' : text;
  }

  function parseSpreadsheetBuffer(buffer, fileName) {
    if (typeof XLSX === 'undefined') {
      throw new Error('Spreadsheet library failed to load. Check your internet connection.');
    }
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error('The file has no sheets.');
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    if (!rows.length) throw new Error('The file is empty.');
    const columns = Object.keys(rows[0]);
    const normalized = rows.map((row) => {
      const out = {};
      columns.forEach((col) => { out[col] = cellToString(row[col]); });
      return out;
    });
    return {
      columns,
      rows: normalized,
      preview: normalized.slice(0, 10),
      total_rows: normalized.length,
      fileName: fileName || '',
    };
  }

  function applyMessageParams(messageTemplate, row, paramColumns) {
    let message = normalizeParamPlaceholders(messageTemplate);
    paramColumns.forEach((col, i) => {
      const key = String(col || '').trim();
      if (!key) return;
      const value = cellToString(row[key]);
      message = message.split(`{Param ${i + 1}}`).join(value);
    });
    return message;
  }

  function generateBulkContacts(rows, options) {
    const { phoneColumn, messageMode, sameMessage, messageColumn, paramColumns } = options;
    const contacts = [];
    let skipped = 0;
    rows.forEach((row) => {
      const phone = cleanPhone(row[phoneColumn] || '');
      if (!phone) { skipped += 1; return; }
      let message = '';
      if (messageMode === 'custom') {
        message = cellToString(row[messageColumn] || '');
      } else {
        message = applyMessageParams(sameMessage, row, paramColumns);
      }
      const name = paramColumns[0] ? cellToString(row[String(paramColumns[0]).trim()] || '') : '';
      contacts.push({
        phone,
        message,
        name,
        url: buildWaUrl(phone, message) || '',
      });
    });
    return { contacts, total: contacts.length, skipped };
  }

  /* Emoji code points — avoids file-encoding issues on Windows */
  const EMOJIS = [
    '\u{1F600}', '\u{1F603}', '\u{1F604}', '\u{1F601}', '\u{1F60A}', '\u{1F642}', '\u{1F609}', '\u{1F60D}', '\u{1F970}', '\u{1F618}',
    '\u{1F60E}', '\u{1F917}', '\u{1F91D}', '\u{1F44D}', '\u{1F44B}', '\u{1F64F}', '\u{2764}', '\u{1F49A}', '\u{1F499}', '\u{2728}',
    '\u{1F389}', '\u{1F525}', '\u{2B50}', '\u{2705}', '\u{274C}', '\u{26A0}', '\u{1F4E2}', '\u{1F4DE}', '\u{1F4F1}', '\u{1F4AC}',
    '\u{1F30D}', '\u{1F54C}', '\u{1F4CB}', '\u{1F4C5}', '\u{1F3E0}', '\u{1F697}', '\u{1F4BC}',
  ];

  const EMOJI_PICKER_IDS = {
    'single-message': 'emoji-picker-single',
    'formula-message': 'emoji-picker-formula',
    'bulk-same-message': 'emoji-picker-bulk',
  };

  function emojiPickerIdFor(targetId) {
    return EMOJI_PICKER_IDS[targetId] || `emoji-picker-${targetId}`;
  }

  function usesWysiwygFormat(textarea) {
    return textarea && textarea.classList.contains('message-input');
  }

  const FMT_APPLY = {
    bold: (s) => mapChars(s, BOLD_MAP),
    italic: (s) => mapChars(s, ITALIC_MAP),
    strike: (s) => toStrike(s),
    mono: (s) => mapChars(s, MONO_MAP),
  };

  /** Remember textarea selection (lost when clicking toolbar) */
  const savedSelection = { id: null, start: 0, end: 0 };

  function trackSelection(textarea) {
    if (!textarea || !textarea.id) return;
    savedSelection.id = textarea.id;
    savedSelection.start = textarea.selectionStart;
    savedSelection.end = textarea.selectionEnd;
  }

  function restoreSelection(textarea) {
    if (!textarea) return;
    if (savedSelection.id === textarea.id) {
      textarea.focus();
      try {
        textarea.setSelectionRange(savedSelection.start, savedSelection.end);
      } catch (_) { /* ignore */ }
    }
  }

  function toast(msg, isError) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function getWordBounds(text, pos) {
    let start = pos;
    let end = pos;
    while (start > 0 && !/\s/.test(text[start - 1])) start--;
    while (end < text.length && !/\s/.test(text[end])) end++;
    return { start, end };
  }

  function applyFormatSelection(textarea, fmt) {
    const apply = FMT_APPLY[fmt];
    if (!apply) return;
    restoreSelection(textarea);
    let start = textarea.selectionStart;
    let end = textarea.selectionEnd;
    const text = textarea.value;

    if (start === end) {
      const { start: ws, end: we } = getWordBounds(text, start);
      if (ws < we) {
        start = ws;
        end = we;
      } else {
        return;
      }
    }

    const selected = text.substring(start, end);
    if (/\{[^}]*\}/.test(selected) && /Param/i.test(denormalizeStyledText(selected))) {
      toast('Cannot format parameter placeholders — use the {Param N} chips above.', true);
      return;
    }
    const formatted = apply(selected);
    textarea.value = text.substring(0, start) + formatted + text.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start, start + formatted.length);
    trackSelection(textarea);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertAtCursor(textarea, text) {
    restoreSelection(textarea);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    const piece = String(text).normalize('NFC');
    textarea.value = val.substring(0, start) + piece + val.substring(end);
    textarea.focus();
    const pos = start + piece.length;
    textarea.setSelectionRange(pos, pos);
    trackSelection(textarea);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function buildEmojiPicker(containerId, targetId) {
    const container = document.getElementById(containerId);
    if (!container || container.childElementCount) return;
    EMOJIS.forEach((emoji) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-btn';
      btn.textContent = emoji;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ta = document.getElementById(targetId);
        if (ta) insertAtCursor(ta, emoji);
      });
      container.appendChild(btn);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- Toolbar (event delegation) ---------- */
  function initToolbar() {
    document.body.addEventListener('mousedown', (e) => {
      if (e.target.closest('.toolbar .tb-btn')) {
        e.preventDefault();
      }
    });

    document.body.addEventListener('click', (e) => {
      const fmtBtn = e.target.closest('.toolbar .tb-btn[data-fmt]');
      if (fmtBtn) {
        e.preventDefault();
        e.stopPropagation();
        const toolbar = fmtBtn.closest('.toolbar');
        const targetId = toolbar && toolbar.dataset.target;
        const ta = targetId ? document.getElementById(targetId) : null;
        if (!ta) return;
        if (usesWysiwygFormat(ta)) {
          applyFormatSelection(ta, fmtBtn.dataset.fmt);
        }
        return;
      }

      const emojiBtn = e.target.closest('.toolbar .tb-emoji');
      if (emojiBtn) {
        e.preventDefault();
        e.stopPropagation();
        const targetId = emojiBtn.dataset.emojiTarget;
        const pickerId = emojiPickerIdFor(targetId);
        buildEmojiPicker(pickerId, targetId);
        const picker = document.getElementById(pickerId);
        if (picker) picker.classList.toggle('hidden');
        return;
      }

      if (!e.target.closest('.emoji-picker') && !e.target.closest('.tb-emoji')) {
        document.querySelectorAll('.emoji-picker').forEach((p) => p.classList.add('hidden'));
      }
    });

    document.querySelectorAll('textarea.message-input').forEach((ta) => {
      ['select', 'keyup', 'mouseup', 'focus'].forEach((evt) => {
        ta.addEventListener(evt, () => trackSelection(ta));
      });
    });
  }

  function setupDirToggle(btnId, textareaId) {
    const btn = document.getElementById(btnId);
    const ta = document.getElementById(textareaId);
    if (!btn || !ta) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const isRtl = ta.getAttribute('dir') === 'rtl';
      ta.setAttribute('dir', isRtl ? 'ltr' : 'rtl');
      toast(isRtl ? 'Text direction: LTR' : 'Text direction: RTL (Arabic)', false);
    });
  }

  /* ---------- Tabs ---------- */
  function initTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach((t) => {
          t.classList.toggle('active', t === tab);
          t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        });
        document.querySelectorAll('.panel').forEach((p) => {
          const active = p.id === `panel-${id}`;
          p.classList.toggle('active', active);
          p.hidden = !active;
        });
      });
    });
  }

  /* ---------- Single sender ---------- */
  function initSingleSender() {
    const singleMessage = document.getElementById('single-message');
    if (!singleMessage) return;

    document.getElementById('single-send')?.addEventListener('click', () => {
      const phone = document.getElementById('single-phone')?.value.trim() || '';
      if (!phone) { toast('Please enter a phone number.', true); return; }
      const url = buildWaUrl(phone, singleMessage.value);
      if (!url) { toast('Invalid phone number.', true); return; }
      window.open(url, '_blank', 'noopener,noreferrer');
      toast('Opening WhatsApp…', false);
    });

    buildEmojiPicker('emoji-picker-single', 'single-message');
  }

  /* ---------- Formula ---------- */
  let paramCount = 3;

  function attachColInputBehavior(input) {
    if (!input || input.dataset.colUpper === 'true') return;
    input.dataset.colUpper = 'true';
    input.addEventListener('input', () => {
      const cleaned = input.value.toUpperCase().replace(/[^A-Z]/g, '');
      if (input.value !== cleaned) input.value = cleaned;
    });
  }

  function initColInputs(root) {
    const scope = root || document;
    scope.querySelectorAll('#formula-phone-col, .mapping-col').forEach(attachColInputBehavior);
  }

  function getParamMappingValues() {
    const saved = {};
    document.querySelectorAll('.mapping-col').forEach((input) => {
      const n = parseInt(input.dataset.param, 10);
      if (n) saved[n] = input.value.trim();
    });
    return saved;
  }

  function syncParamMapping(saved = getParamMappingValues()) {
    const mapping = document.getElementById('param-mapping');
    if (!mapping) return;
    mapping.innerHTML = '';
    for (let i = 1; i <= paramCount; i++) {
      const row = document.createElement('div');
      row.className = 'mapping-row';
      row.innerHTML =
        `<span class="mapping-label">{Param ${i}}</span>` +
        `<input type="text" class="mapping-col" data-param="${i}" maxlength="3"${i === 1 ? ' placeholder="ex. A"' : ''} dir="ltr" autocomplete="off">`;
      mapping.appendChild(row);
      const input = row.querySelector('.mapping-col');
      if (input) {
        if (saved[i]) input.value = saved[i];
        attachColInputBehavior(input);
      }
    }
  }

  function ensureParamCount(minCount) {
    const saved = getParamMappingValues();
    const chips = document.getElementById('formula-params');
    const addBtn = document.getElementById('add-param');
    while (paramCount < minCount) {
      if (paramCount >= 10) break;
      paramCount++;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'param-chip';
      chip.dataset.param = String(paramCount);
      chip.textContent = `{Param ${paramCount}}`;
      chip.addEventListener('click', () => insertParam(chip.dataset.param));
      if (chips && addBtn) chips.insertBefore(chip, addBtn);
    }
    syncParamMapping(saved);
  }

  function insertParam(n) {
    const ta = document.getElementById('formula-message');
    if (ta) insertAtCursor(ta, `{Param ${n}}`);
  }

  function initFormula() {
    buildEmojiPicker('emoji-picker-formula', 'formula-message');
    initColInputs(document.getElementById('panel-formula'));

    document.querySelectorAll('.num-step-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('formula-row');
        if (!input) return;
        const step = parseInt(btn.dataset.step, 10) || 0;
        const min = parseInt(input.min, 10) || 1;
        const next = Math.max(min, (parseInt(input.value, 10) || min) + step);
        input.value = String(next);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });

    document.getElementById('add-param')?.addEventListener('click', () => {
      if (paramCount >= 10) { toast('Maximum 10 parameters.', true); return; }
      paramCount++;
      const chips = document.getElementById('formula-params');
      const addBtn = document.getElementById('add-param');
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'param-chip';
      chip.dataset.param = String(paramCount);
      chip.textContent = `{Param ${paramCount}}`;
      chip.addEventListener('click', () => insertParam(chip.dataset.param));
      chips.insertBefore(chip, addBtn);
      syncParamMapping();
    });

    document.querySelectorAll('#formula-params .param-chip:not(.param-add)').forEach((chip) => {
      chip.addEventListener('click', () => insertParam(chip.dataset.param));
    });

    document.getElementById('formula-generate')?.addEventListener('click', () => {
      const message = document.getElementById('formula-message')?.value || '';
      const phoneCol = document.getElementById('formula-phone-col')?.value.trim().toUpperCase() || '';
      const row = parseInt(document.getElementById('formula-row')?.value, 10) || 2;

      if (!phoneCol || !/^[A-Z]+$/.test(phoneCol)) {
        toast('Please enter the phone column.', true);
        return;
      }
      if (row < 1) {
        toast('Row number must be at least 1.', true);
        return;
      }

      const maxParam = detectMaxParam(message);
      if (maxParam > paramCount) ensureParamCount(maxParam);

      const paramColumns = [];
      document.querySelectorAll('.mapping-col').forEach((input) => paramColumns.push(input.value.trim()));

      const normalized = normalizeParamPlaceholders(message);
      const missing = [];
      for (let i = 1; i <= maxParam; i++) {
        if (normalized.includes(`{Param ${i}}`) && !paramColumns[i - 1]) missing.push(i);
      }
      if (missing.length) {
        toast(`Map column for {Param ${missing.join('}, {Param ')}} before generating.`, true);
        return;
      }

      const data = generateAllFormulas(phoneCol, message, paramColumns, row);
      document.getElementById('sheets-formula').textContent = data.google_sheets;
      document.getElementById('sheets-formula-app').textContent = data.google_sheets_app;
      document.getElementById('excel-formula').textContent = data.excel;
      document.getElementById('excel-url-formula').textContent = data.excel_url;
      document.getElementById('formula-results').classList.remove('hidden');
      toast('Formulas generated!', false);
    });

    document.querySelectorAll('.btn-copy').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.copy;
        const text = document.getElementById(id)?.textContent;
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
          toast('Copied to clipboard', false);
        } catch {
          toast('Could not copy. Select and copy manually.', true);
        }
      });
    });
  }

  /* ---------- Bulk sender ---------- */
  let bulkFile = null;
  let bulkFileBlob = null;
  let bulkFileName = '';
  let bulkRows = [];
  let bulkContacts = [];
  let bulkParamCount = 3;
  let bulkFileColumns = [];

  function getBulkParamMappingValues() {
    const saved = {};
    document.querySelectorAll('#bulk-param-mapping .mapping-col-select').forEach((sel) => {
      const n = parseInt(sel.dataset.param, 10);
      if (n) saved[n] = sel.value;
    });
    return saved;
  }

  function fillColumnSelect(select, columns, selected) {
    if (!select) return;
    select.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '—';
    select.appendChild(empty);
    columns.forEach((col) => {
      const opt = document.createElement('option');
      opt.value = col;
      opt.textContent = col;
      if (col === selected) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function syncBulkParamMapping(columns, saved = getBulkParamMappingValues()) {
    bulkFileColumns = columns || bulkFileColumns;
    const mapping = document.getElementById('bulk-param-mapping');
    if (!mapping) return;
    mapping.innerHTML = '';
    for (let i = 1; i <= bulkParamCount; i++) {
      const row = document.createElement('div');
      row.className = 'mapping-row';
      row.dataset.param = String(i);
      row.innerHTML =
        `<span class="mapping-label">{Param ${i}}</span>` +
        `<select class="mapping-col-select" data-param="${i}"></select>`;
      mapping.appendChild(row);
      fillColumnSelect(row.querySelector('.mapping-col-select'), bulkFileColumns, saved[i] || '');
    }
  }

  function ensureBulkParamCount(minCount, columns) {
    const saved = getBulkParamMappingValues();
    const chips = document.getElementById('bulk-params');
    const addBtn = document.getElementById('bulk-add-param');
    while (bulkParamCount < minCount) {
      if (bulkParamCount >= 10) break;
      bulkParamCount++;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'param-chip';
      chip.dataset.param = String(bulkParamCount);
      chip.textContent = `{Param ${bulkParamCount}}`;
      chip.addEventListener('click', () => insertBulkParam(chip.dataset.param));
      if (chips && addBtn) chips.insertBefore(chip, addBtn);
    }
    syncBulkParamMapping(columns || bulkFileColumns, saved);
  }

  function insertBulkParam(n) {
    const ta = document.getElementById('bulk-same-message');
    if (ta) insertAtCursor(ta, `{Param ${n}}`);
  }

  function resetBulk() {
    bulkFile = null;
    bulkFileBlob = null;
    bulkFileName = '';
    bulkRows = [];
    bulkContacts = [];
    const fileInput = document.getElementById('bulk-file');
    if (fileInput) fileInput.value = '';
    document.querySelector('.dropzone-content')?.classList.remove('hidden');
    document.getElementById('bulk-file-info')?.classList.add('hidden');
    document.getElementById('bulk-config')?.classList.add('hidden');
    document.getElementById('bulk-results')?.classList.add('hidden');
    document.getElementById('bulk-preview-wrap')?.classList.add('hidden');
  }

  async function handleBulkFile(file) {
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      toast('Please upload a .csv, .xlsx, or .xls file.', true);
      return;
    }
    bulkFile = file;
    bulkFileName = file.name;
    try {
      bulkFileBlob = await file.arrayBuffer();
      const data = parseSpreadsheetBuffer(bulkFileBlob, file.name);
      bulkRows = data.rows;
      document.querySelector('.dropzone-content')?.classList.add('hidden');
      document.getElementById('bulk-file-info')?.classList.remove('hidden');
      document.getElementById('bulk-file-name').textContent = file.name;
      populateColumnSelects(data.columns);
      renderPreviewTable(data.columns, data.preview);
      document.getElementById('bulk-row-count').textContent = `${data.total_rows} rows`;
      document.getElementById('bulk-config')?.classList.remove('hidden');
      document.getElementById('bulk-preview-wrap')?.classList.remove('hidden');
      toast(`Loaded ${data.total_rows} rows`, false);
    } catch (err) {
      toast(err.message || 'Could not read file.', true);
      resetBulk();
    }
  }

  function populateColumnSelects(columns) {
    bulkFileColumns = columns;
    const phoneSel = document.getElementById('bulk-phone-col');
    const msgSel = document.getElementById('bulk-message-col');
    [phoneSel, msgSel].forEach((sel) => {
      if (!sel) return;
      sel.innerHTML = '';
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '—';
      sel.appendChild(empty);
      columns.forEach((col) => {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = col;
        sel.appendChild(opt);
      });
    });
    syncBulkParamMapping(columns);
  }

  function renderPreviewTable(columns, rows) {
    const thead = document.querySelector('#bulk-preview-table thead');
    const tbody = document.querySelector('#bulk-preview-table tbody');
    if (!thead || !tbody) return;
    thead.innerHTML = '<tr>' + columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('') + '</tr>';
    tbody.innerHTML = rows.map((row) =>
      '<tr>' + columns.map((c) => `<td>${escapeHtml(row[c] ?? '')}</td>`).join('') + '</tr>'
    ).join('');
  }

  function renderBulkResults(data) {
    const contacts = Array.isArray(data?.contacts) ? data.contacts : [];
    document.getElementById('bulk-total-badge').textContent = `${data.total ?? contacts.length} contacts`;
    const list = document.getElementById('bulk-contact-list');
    if (!list) return;
    list.innerHTML = contacts.map((c, i) => {
      const phone = String(c.phone ?? '');
      const msg = String(c.message ?? '');
      const preview = msg.length > 60 ? `${msg.substring(0, 60)}…` : msg;
      const urlRaw = buildWaUrl(phone, msg) || c.url || '';
      const url = String(urlRaw).replace(/"/g, '&quot;');
      const sendLink = url
        ? `<a href="${url}" target="_blank" rel="noopener" class="contact-send">Send</a>`
        : '<span class="contact-send contact-send-disabled">Send</span>';
      return `<div class="contact-item">
        <span class="contact-index">${i + 1}</span>
        <div class="contact-info">
          ${c.name ? `<div class="contact-name">${escapeHtml(String(c.name))}</div>` : ''}
          <div class="contact-phone">${escapeHtml(phone)}</div>
        </div>
        <div class="contact-msg">${escapeHtml(preview)}</div>
        ${sendLink}
      </div>`;
    }).join('');
    document.getElementById('bulk-results')?.classList.remove('hidden');
  }

  function initBulk() {
    const dropzone = document.getElementById('bulk-dropzone');
    const fileInput = document.getElementById('bulk-file');

    document.getElementById('bulk-browse')?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    });
    dropzone?.addEventListener('click', () => fileInput?.click());
    dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleBulkFile(e.dataTransfer.files[0]);
    });
    fileInput?.addEventListener('change', () => {
      if (fileInput.files.length) handleBulkFile(fileInput.files[0]);
    });
    document.getElementById('bulk-file-remove')?.addEventListener('click', (e) => {
      e.stopPropagation();
      resetBulk();
    });

    document.querySelectorAll('input[name="bulk-mode"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const isSame = radio.value === 'same' && radio.checked;
        document.getElementById('bulk-same-wrap')?.classList.toggle('hidden', !isSame);
        document.getElementById('bulk-custom-wrap')?.classList.toggle('hidden', isSame);
      });
    });

    document.getElementById('bulk-add-param')?.addEventListener('click', () => {
      if (bulkParamCount >= 10) { toast('Maximum 10 parameters.', true); return; }
      bulkParamCount++;
      const chips = document.getElementById('bulk-params');
      const addBtn = document.getElementById('bulk-add-param');
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'param-chip';
      chip.dataset.param = String(bulkParamCount);
      chip.textContent = `{Param ${bulkParamCount}}`;
      chip.addEventListener('click', () => insertBulkParam(chip.dataset.param));
      chips.insertBefore(chip, addBtn);
      syncBulkParamMapping(bulkFileColumns);
    });

    document.querySelectorAll('#bulk-params .param-chip:not(.param-add)').forEach((chip) => {
      chip.addEventListener('click', () => insertBulkParam(chip.dataset.param));
    });

    document.getElementById('bulk-generate')?.addEventListener('click', () => {
      if (!bulkRows.length) { toast('Please upload a file first.', true); return; }
      const phoneCol = document.getElementById('bulk-phone-col')?.value || '';
      if (!phoneCol) {
        toast('Please choose the phone column.', true);
        return;
      }
      const messageMode = document.querySelector('input[name="bulk-mode"]:checked')?.value || 'same';
      const sameMessage = document.getElementById('bulk-same-message')?.value || '';
      const messageColumn = document.getElementById('bulk-message-col')?.value || '';

      if (messageMode === 'same' && !sameMessage.trim()) {
        toast('Please enter a message.', true);
        return;
      }
      if (messageMode === 'custom' && !messageColumn) {
        toast('Please choose the message column.', true);
        return;
      }

      const paramColumns = [];
      document.querySelectorAll('#bulk-param-mapping .mapping-col-select').forEach((sel) => {
        paramColumns.push(sel.value.trim());
      });

      if (messageMode === 'same') {
        const maxParam = detectMaxParam(sameMessage);
        if (maxParam > bulkParamCount) ensureBulkParamCount(maxParam, bulkFileColumns);

        const normalized = normalizeParamPlaceholders(sameMessage);
        const missing = [];
        for (let i = 1; i <= maxParam; i++) {
          if (normalized.includes(`{Param ${i}}`) && !paramColumns[i - 1]) missing.push(i);
        }
        if (missing.length) {
          toast(`Choose a column for {Param ${missing.join('}, {Param ')}} before generating.`, true);
          return;
        }
      }

      try {
        const data = generateBulkContacts(bulkRows, {
          phoneColumn: phoneCol,
          messageMode,
          sameMessage,
          messageColumn,
          paramColumns,
        });
        bulkContacts = data.contacts || [];
        renderBulkResults(data);
        toast(`Generated ${data.total} links`, false);
      } catch (err) {
        toast(err.message || 'Could not generate links.', true);
      }
    });

    document.getElementById('bulk-open-all')?.addEventListener('click', () => {
      bulkContacts.forEach((c, i) => {
        const url = buildWaUrl(c.phone, c.message) || c.url;
        setTimeout(() => window.open(url, '_blank', 'noopener,noreferrer'), i * 1500);
      });
    });

    document.getElementById('bulk-export-csv')?.addEventListener('click', () => {
      const header = 'phone,name,message,url\n';
      const rows = bulkContacts.map((c) => {
        const url = buildWaUrl(c.phone, c.message) || c.url;
        return `"${c.phone}","${(c.name || '').replace(/"/g, '""')}","${c.message.replace(/"/g, '""')}","${url}"`;
      }).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([header + rows], { type: 'text/csv;charset=utf-8;' }));
      a.download = 'whatsapp_links.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    buildEmojiPicker('emoji-picker-bulk', 'bulk-same-message');
  }

  /* ---------- Meta App reference ---------- */
  const META_STORAGE_KEY = 'whatsapp-tool-meta-ref';
  const META_CHECKS_KEY = 'whatsapp-tool-meta-checks';
  const META_TOKEN_SESSION_KEY = 'whatsapp-tool-meta-token';
  const META_GRAPH_VERSION = 'v21.0';

  function buildMetaRequestEmail() {
    const existingApi = document.getElementById('meta-existing-api')?.value.trim() || '[existing API name]';
    const displayPhone = document.getElementById('meta-display-phone')?.value.trim() || '[verified number]';
    const contact = document.getElementById('meta-owner-contact')?.value.trim() || '[WhatsApp / Meta owner]';

    return `Subject: WhatsApp Cloud API access for internal tool

Hello ${contact},

We are building an internal WhatsApp tool and need access to the organization's verified WhatsApp Business number (${displayPhone}), which is already connected to ${existingApi}.

Please provide or arrange:

1. Access to Meta Business Manager and the Meta App on this number
2. WhatsApp Business Account ID, Phone Number ID, and App ID
3. A dedicated System User access token with whatsapp_business_messaging for our internal tool
4. Written confirmation that our internal API can use the same verified number without disrupting the current ${existingApi} integration or webhook
5. How webhooks should work for us — separate Meta App, shared endpoint, or forwarded events
6. Rules for message templates, test numbers, and outbound messaging approval
7. Who handles opt-in, consent, and data protection for WhatsApp messaging

This is for internal messaging automation and testing via the WhatsApp Cloud API.

Thank you.`;
  }

  function updateMetaRequestEmail() {
    const ta = document.getElementById('meta-request-email');
    if (ta) ta.value = buildMetaRequestEmail();
  }

  function saveMetaChecks() {
    const checks = {};
    document.querySelectorAll('[data-meta-check]').forEach((cb) => {
      checks[cb.dataset.metaCheck] = cb.checked;
    });
    localStorage.setItem(META_CHECKS_KEY, JSON.stringify(checks));
  }

  function loadMetaChecks() {
    try {
      const saved = JSON.parse(localStorage.getItem(META_CHECKS_KEY) || '{}');
      document.querySelectorAll('[data-meta-check]').forEach((cb) => {
        if (saved[cb.dataset.metaCheck]) cb.checked = true;
      });
    } catch (_) { /* ignore */ }
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = prev;
          btn.classList.remove('copied');
        }, 1500);
      }
      toast('Copied to clipboard.', false);
    } catch (_) {
      toast('Could not copy.', true);
    }
  }

  function syncMetaPhoneIdFields(source) {
    const phoneId = document.getElementById('meta-phone-id');
    const testPhoneId = document.getElementById('meta-test-phone-id');
    if (source === 'ref' && testPhoneId && phoneId) {
      testPhoneId.value = phoneId.value;
    } else if (source === 'test' && phoneId && testPhoneId) {
      phoneId.value = testPhoneId.value;
    }
  }

  function initMeta() {
    const appId = document.getElementById('meta-app-id');
    const wabaId = document.getElementById('meta-waba-id');
    const phoneId = document.getElementById('meta-phone-id');
    const displayPhone = document.getElementById('meta-display-phone');
    const existingApi = document.getElementById('meta-existing-api');
    const ownerContact = document.getElementById('meta-owner-contact');
    const saveBtn = document.getElementById('meta-save-ref');
    const copyRequestBtn = document.getElementById('meta-copy-request');
    const accessToken = document.getElementById('meta-access-token');
    const testPhoneId = document.getElementById('meta-test-phone-id');
    const sendBtn = document.getElementById('meta-send-test');
    if (!appId || !wabaId || !phoneId || !saveBtn) return;

    loadMetaChecks();
    updateMetaRequestEmail();

    try {
      const saved = JSON.parse(localStorage.getItem(META_STORAGE_KEY) || '{}');
      if (saved.appId) appId.value = saved.appId;
      if (saved.wabaId) wabaId.value = saved.wabaId;
      if (saved.phoneId) {
        phoneId.value = saved.phoneId;
        if (testPhoneId) testPhoneId.value = saved.phoneId;
      }
      if (saved.displayPhone && displayPhone) displayPhone.value = saved.displayPhone;
      if (saved.existingApi && existingApi) existingApi.value = saved.existingApi;
      if (saved.ownerContact && ownerContact) ownerContact.value = saved.ownerContact;
    } catch (_) { /* ignore corrupt storage */ }

    [displayPhone, existingApi, ownerContact].forEach((el) => {
      el?.addEventListener('input', updateMetaRequestEmail);
    });

    document.querySelectorAll('[data-meta-check]').forEach((cb) => {
      cb.addEventListener('change', saveMetaChecks);
    });

    copyRequestBtn?.addEventListener('click', () => {
      updateMetaRequestEmail();
      copyText(document.getElementById('meta-request-email')?.value || '', copyRequestBtn);
    });

    if (accessToken) {
      accessToken.value = sessionStorage.getItem(META_TOKEN_SESSION_KEY) || '';
      accessToken.addEventListener('change', () => {
        sessionStorage.setItem(META_TOKEN_SESSION_KEY, accessToken.value.trim());
      });
      accessToken.addEventListener('blur', () => {
        sessionStorage.setItem(META_TOKEN_SESSION_KEY, accessToken.value.trim());
      });
    }

    phoneId?.addEventListener('input', () => syncMetaPhoneIdFields('ref'));
    testPhoneId?.addEventListener('input', () => syncMetaPhoneIdFields('test'));

    saveBtn.addEventListener('click', () => {
      localStorage.setItem(META_STORAGE_KEY, JSON.stringify({
        appId: appId.value.trim(),
        wabaId: wabaId.value.trim(),
        phoneId: phoneId.value.trim(),
        displayPhone: displayPhone?.value.trim() || '',
        existingApi: existingApi?.value.trim() || '',
        ownerContact: ownerContact?.value.trim() || '',
      }));
      if (testPhoneId) testPhoneId.value = phoneId.value.trim();
      updateMetaRequestEmail();
      toast('Credentials saved in this browser.', false);
    });

    sendBtn?.addEventListener('click', async () => {
      const to = cleanPhone(document.getElementById('meta-test-to')?.value || '');
      const message = document.getElementById('meta-test-message')?.value || '';
      const token = accessToken?.value.trim() || '';
      const pnid = testPhoneId?.value.trim() || phoneId?.value.trim() || '';
      const resultBlock = document.getElementById('meta-send-result');
      const resultBody = document.getElementById('meta-send-result-body');
      const resultBadge = document.getElementById('meta-send-result-badge');

      if (!token) { toast('Access token is required.', true); return; }
      if (!pnid) { toast('Phone Number ID is required.', true); return; }
      if (!to) { toast('Recipient phone is required.', true); return; }
      if (!message.trim()) { toast('Message is required.', true); return; }

      sessionStorage.setItem(META_TOKEN_SESSION_KEY, token);
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';

      try {
        const res = await fetch(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(pnid)}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to,
              type: 'text',
              text: { body: message },
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        resultBlock?.classList.remove('hidden', 'error');
        if (res.ok) {
          resultBadge.textContent = 'Success';
          resultBody.textContent = JSON.stringify(data, null, 2);
          toast('Test message sent.', false);
        } else {
          resultBlock?.classList.add('error');
          resultBadge.textContent = 'Error';
          resultBody.textContent = JSON.stringify(data, null, 2);
          toast(data?.error?.message || 'Send failed.', true);
        }
      } catch (err) {
        resultBlock?.classList.remove('hidden');
        resultBlock?.classList.add('error');
        resultBadge.textContent = 'Error';
        resultBody.textContent = String(err.message || err);
        toast('Could not reach Meta API from the browser (often blocked by CORS). Use Meta API Setup or a backend proxy.', true);
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send test message';
      }
    });
  }

  /* ---------- Boot ---------- */
  function init() {
    initToolbar();
    initTabs();
    initSingleSender();
    initFormula();
    initBulk();
    initMeta();
    setupDirToggle('single-dir-toggle', 'single-message');
    setupDirToggle('formula-dir-toggle', 'formula-message');
    setupDirToggle('bulk-dir-toggle', 'bulk-same-message');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
