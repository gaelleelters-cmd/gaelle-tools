(function () {
  'use strict';

  const files = []; // { id, name, rows, headers, sheetName }

  const $ = (id) => document.getElementById(id);
  const dropzone = $('dropzone');
  const fileInput = $('file-input');
  const browseBtn = $('browse-btn');
  const fileListSection = $('file-list-section');
  const fileList = $('file-list');
  const fileCount = $('file-count');
  const clearFiles = $('clear-files');
  const optionsSection = $('options-section');
  const dedupeCol = $('dedupe-col');
  const optDedupe = $('opt-dedupe');
  const dedupeField = $('dedupe-field');
  const optSource = $('opt-source');
  const optAlign = $('opt-align');
  const outName = $('out-name');
  const combineBtn = $('combine-btn');
  const previewBtn = $('preview-btn');
  const previewSection = $('preview-section');
  const previewTable = $('preview-table');
  const rowCount = $('row-count');
  const toastWrap = $('toast-wrap');

  const PHONE_ALIASES = [
    'phone', 'donor: mobile', 'donor mobile', 'mobile', 'tel',
    'phone number', 'contact number', 'donor: phone'
  ];

  function toast(msg, isError) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    toastWrap.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function normalizeHeader(h) {
    return String(h == null ? '' : h).trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function canonicalHeader(h) {
    const n = normalizeHeader(h);
    if (!n) return '';
    if (PHONE_ALIASES.includes(n)) return 'Phone';
    // Keep original casing from first seen; return trimmed original via caller
    return String(h).trim();
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          const sheetName = wb.SheetNames[0];
          const sheet = wb.Sheets[sheetName];
          const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
          if (!aoa.length) {
            reject(new Error(file.name + ' is empty'));
            return;
          }
          const headers = aoa[0].map((h, i) => {
            const t = String(h == null ? '' : h).trim();
            return t || ('Column ' + (i + 1));
          });
          const rows = aoa.slice(1)
            .filter((row) => row.some((c) => String(c).trim() !== ''))
            .map((row) => {
              const obj = {};
              headers.forEach((h, i) => { obj[h] = row[i] != null ? row[i] : ''; });
              return obj;
            });
          resolve({ name: file.name, headers, rows, sheetName });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Could not read ' + file.name));
      reader.readAsArrayBuffer(file);
    });
  }

  async function addFiles(fileListLike) {
    const list = Array.from(fileListLike || []).filter((f) =>
      /\.(xlsx|xls|csv)$/i.test(f.name)
    );
    if (!list.length) {
      toast('Please choose .xlsx, .xls, or .csv files', true);
      return;
    }
    for (const file of list) {
      try {
        const parsed = await readFile(file);
        files.push({
          id: uid(),
          name: parsed.name,
          headers: parsed.headers,
          rows: parsed.rows,
          sheetName: parsed.sheetName
        });
      } catch (err) {
        toast(err.message || ('Failed: ' + file.name), true);
      }
    }
    renderFiles();
    refreshOptions();
  }

  function renderFiles() {
    const has = files.length > 0;
    fileListSection.classList.toggle('hidden', !has);
    optionsSection.classList.toggle('hidden', !has);
    fileCount.textContent = String(files.length);
    fileList.innerHTML = '';
    files.forEach((f) => {
      const li = document.createElement('li');
      li.className = 'file-row';
      li.innerHTML =
        '<div class="file-meta">' +
          '<span class="file-name"></span>' +
          '<span class="file-stats"></span>' +
        '</div>' +
        '<button type="button" class="btn-icon" title="Remove">✕</button>';
      li.querySelector('.file-name').textContent = f.name;
      li.querySelector('.file-stats').textContent =
        f.rows.length.toLocaleString() + ' rows · ' + f.headers.length + ' columns · sheet “' + f.sheetName + '”';
      li.querySelector('.btn-icon').addEventListener('click', () => {
        const idx = files.findIndex((x) => x.id === f.id);
        if (idx >= 0) files.splice(idx, 1);
        renderFiles();
        refreshOptions();
        previewSection.classList.add('hidden');
      });
      fileList.appendChild(li);
    });
  }

  function allRawHeaders() {
    const seen = new Map();
    files.forEach((f) => {
      f.headers.forEach((h) => {
        const key = normalizeHeader(h);
        if (!seen.has(key)) seen.set(key, h);
      });
    });
    return Array.from(seen.values());
  }

  function refreshOptions() {
    const headers = allRawHeaders();
    const prefer = headers.find((h) =>
      /donor\/organisation id|organisation id|donor id|^id$/i.test(normalizeHeader(h))
    ) || headers[0] || '';
    dedupeCol.innerHTML = '';
    headers.forEach((h) => {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = h;
      if (h === prefer) opt.selected = true;
      dedupeCol.appendChild(opt);
    });
    dedupeField.style.opacity = optDedupe.checked ? '1' : '0.45';
    dedupeCol.disabled = !optDedupe.checked;
  }

  function buildCombined() {
    const align = optAlign.checked;
    const addSource = optSource.checked;

    // Map raw header -> output header
    const outHeaders = [];
    const outKeyOf = new Map(); // normalize(raw) -> out header

    function registerHeader(raw) {
      const n = normalizeHeader(raw);
      if (!n) return;
      if (outKeyOf.has(n)) return;
      let out = String(raw).trim();
      if (align) {
        const canon = canonicalHeader(raw);
        if (canon === 'Phone') {
          // reuse existing Phone out-header if present
          const existingPhone = outHeaders.find((h) => normalizeHeader(h) === 'phone');
          out = existingPhone || 'Phone';
          // also map all phone aliases to this
          PHONE_ALIASES.forEach((a) => {
            if (!outKeyOf.has(a)) outKeyOf.set(a, out);
          });
        }
      }
      if (!outHeaders.includes(out)) outHeaders.push(out);
      outKeyOf.set(n, out);
    }

    files.forEach((f) => f.headers.forEach(registerHeader));
    if (addSource && !outHeaders.includes('Source File')) {
      outHeaders.push('Source File');
    }

    let combined = [];
    files.forEach((f) => {
      f.rows.forEach((row) => {
        const out = {};
        outHeaders.forEach((h) => { out[h] = ''; });
        f.headers.forEach((h) => {
          const target = outKeyOf.get(normalizeHeader(h));
          if (!target) return;
          const val = row[h];
          // Prefer non-empty when aligning into same column
          if (out[target] === '' || out[target] == null) {
            out[target] = val != null ? val : '';
          }
        });
        if (addSource) out['Source File'] = f.name;
        combined.push(out);
      });
    });

    if (optDedupe.checked && dedupeCol.value) {
      const keyRaw = dedupeCol.value;
      const keyOut = outKeyOf.get(normalizeHeader(keyRaw)) || keyRaw;
      const seen = new Set();
      const deduped = [];
      combined.forEach((row) => {
        const k = String(row[keyOut] != null ? row[keyOut] : '').trim();
        if (!k) {
          deduped.push(row);
          return;
        }
        const nk = k.toLowerCase();
        if (seen.has(nk)) return;
        seen.add(nk);
        deduped.push(row);
      });
      combined = deduped;
    }

    return { headers: outHeaders, rows: combined };
  }

  function renderPreview(result) {
    const thead = previewTable.querySelector('thead');
    const tbody = previewTable.querySelector('tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';
    const trh = document.createElement('tr');
    result.headers.forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);

    const max = Math.min(result.rows.length, 50);
    for (let i = 0; i < max; i++) {
      const tr = document.createElement('tr');
      result.headers.forEach((h) => {
        const td = document.createElement('td');
        td.textContent = result.rows[i][h] != null ? String(result.rows[i][h]) : '';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    rowCount.textContent =
      result.rows.length.toLocaleString() + ' rows' +
      (result.rows.length > 50 ? ' (showing 50)' : '');
    previewSection.classList.remove('hidden');
  }

  function downloadCombined(result) {
    const aoa = [result.headers].concat(
      result.rows.map((r) => result.headers.map((h) => r[h]))
    );
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Combined');
    let name = (outName.value || 'Combined_All_Donors').trim();
    if (!/\.xlsx$/i.test(name)) name += '.xlsx';
    XLSX.writeFile(wb, name);
    toast('Downloaded ' + name + ' (' + result.rows.length.toLocaleString() + ' rows)');
  }

  // Events
  browseBtn.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('click', (e) => {
    if (e.target === browseBtn) return;
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-drag');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-drag');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    addFiles(e.dataTransfer.files);
  });

  clearFiles.addEventListener('click', () => {
    files.length = 0;
    renderFiles();
    previewSection.classList.add('hidden');
  });

  optDedupe.addEventListener('change', refreshOptions);

  previewBtn.addEventListener('click', () => {
    if (!files.length) return;
    const result = buildCombined();
    renderPreview(result);
  });

  combineBtn.addEventListener('click', () => {
    if (!files.length) return;
    const result = buildCombined();
    if (!result.rows.length) {
      toast('No rows to combine', true);
      return;
    }
    renderPreview(result);
    downloadCombined(result);
  });
})();
