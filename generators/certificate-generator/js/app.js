(function () {
  'use strict';

  var G = window.CertGen;
  if (!G) return;

  var state = {
    step: 1,
    template: null,
    workbook: null,
    sheetName: '',
    columns: [],
    rows: [],
    excelName: '',
    fields: [],
    selectedId: null,
    previewIndex: 0,
    outputFormat: 'pdf',
    filenamePattern: '{Name}_Certificate',
    patternTouched: false,
    invalidMode: 'skip',
    results: [],
    generating: false,
    search: '',
    objectUrls: []
  };

  var history = G.History.create(80);
  var els = {};

  function $(id) { return document.getElementById(id); }

  function toast(message, isError) {
    var el = els.toast;
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.hidden = true; }, 4200);
  }

  function fillSelect(select, items, getValue, getLabel) {
    select.innerHTML = '';
    items.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = getValue(item);
      opt.textContent = getLabel(item);
      select.appendChild(opt);
    });
  }

  function currentSheet() {
    return G.Excel.getSheet(state.workbook, state.sheetName);
  }

  function selectedField() {
    return state.fields.filter(function (field) { return field.id === state.selectedId; })[0] || null;
  }

  function currentRow() {
    return state.rows[state.previewIndex] || null;
  }

  function validation() {
    return G.Validate.validate(state.rows, state.columns, state.fields);
  }

  function canVisit(step) {
    if (step <= 1) return true;
    if (step === 2) return !!state.template;
    if (step === 3) return !!state.template && !!state.workbook;
    if (step >= 4) {
      return !!state.template && !!state.workbook && G.Fields.mappedFields(state.fields).length > 0;
    }
    return false;
  }

  function setStep(step) {
    if (!canVisit(step)) {
      if (step >= 2 && !state.template) toast('Upload a certificate template first.', true);
      else if (step >= 3 && !state.workbook) toast('Upload an Excel file first.', true);
      else toast('Add at least one field and map it to an Excel column.', true);
      return;
    }
    state.step = step;
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      var active = Number(panel.getAttribute('data-panel')) === step;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    document.querySelectorAll('.step').forEach(function (btn) {
      var n = Number(btn.getAttribute('data-step'));
      btn.classList.toggle('is-active', n === step);
      btn.classList.toggle('is-done', n < step && canVisit(n));
      btn.disabled = !canVisit(n);
    });
    G.Editor.setInteractive(step < 5);
    if (step >= 4) refreshPreview();
    if (step === 5) refreshSummary();
  }

  function commitHistory() {
    history.push(state.fields);
    refreshHistoryButtons();
  }

  function refreshHistoryButtons() {
    els.btnUndo.disabled = !history.canUndo();
    els.btnRedo.disabled = !history.canRedo();
  }

  function applyFields(fields, selectedId, commit, skipForm) {
    state.fields = fields;
    if (selectedId !== undefined) state.selectedId = selectedId;
    G.Editor.setFields(state.fields, state.selectedId);
    renderFieldList();
    renderMapping();
    if (!skipForm) refreshFieldForm();
    refreshPlaceholderChips();
    if (commit) commitHistory();
    else refreshHistoryButtons();
  }

  function renderFieldList() {
    els.fieldList.innerHTML = '';
    if (!state.fields.length) {
      els.fieldList.innerHTML = '<p class="hint">No dynamic fields yet. Add one and place it on the certificate.</p>';
      return;
    }
    state.fields.forEach(function (field) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'field-chip' + (field.id === state.selectedId ? ' is-active' : '');
      btn.innerHTML = '<span>' + escapeHtml(field.label) + '</span><span>' +
        escapeHtml(field.excelColumn || 'Not mapped') + '</span>';
      btn.addEventListener('click', function () { selectField(field.id); });
      els.fieldList.appendChild(btn);
    });
  }

  function renderMapping() {
    var mapped = G.Fields.mappedFields(state.fields);
    els.mappingWrap.hidden = mapped.length === 0;
    var body = els.mappingTable.querySelector('tbody');
    body.innerHTML = mapped.map(function (field) {
      return '<tr><td>' + escapeHtml(field.label) + '</td><td>' + escapeHtml(field.excelColumn) + '</td></tr>';
    }).join('');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function columnOptions(includeBlank) {
    var items = includeBlank ? [{ id: '', label: 'Choose a column…' }] : [];
    state.columns.forEach(function (col) {
      items.push({ id: col, label: col });
    });
    return items;
  }

  function refreshFieldForm() {
    var field = selectedField();
    els.fieldForm.hidden = !field;
    if (!field) return;
    els.fieldLabel.value = field.label;
    els.fieldType.value = field.type;
    fillSelect(els.fieldColumn, columnOptions(true), function (item) { return item.id; }, function (item) { return item.label; });
    els.fieldColumn.value = field.excelColumn || '';
    els.fieldFont.value = field.fontFamily;
    els.fieldSize.value = field.fontSize;
    els.fieldBold.checked = field.fontWeight === 'bold' || field.fontWeight === '700';
    els.fieldItalic.checked = field.fontStyle === 'italic';
    els.fieldAlign.value = field.alignment || 'center';
    els.fieldColor.value = field.textColor || '#1a1a1a';
    els.fieldAutofit.checked = field.autoFit !== false;
    els.fieldMin.value = field.minimumFontSize || 14;
    els.fieldDateFormat.value = field.dateFormat || 'DD MMMM YYYY';
    els.fieldDecimals.value = field.numberDecimals || 0;
    els.fieldCurrency.value = field.currency || 'USD';
    els.fieldCover.checked = !!field.coverExistingText;
    els.fieldCoverColor.value = field.coverColor || '#ffffff';
    els.fieldRequired.checked = field.required !== false;
    syncTypeVisibility();
    syncCoverVisibility();
    syncGeometryInputs();
  }

  function syncTypeVisibility() {
    var type = els.fieldType.value;
    els.dateFormatField.hidden = type !== 'date';
    els.numberFormatFields.hidden = type !== 'number' && type !== 'currency';
    els.currencyField.hidden = type !== 'currency';
  }

  function syncCoverVisibility() {
    els.coverColorField.hidden = !els.fieldCover.checked;
  }

  function syncGeometryInputs() {
    var field = selectedField();
    if (!field || !state.template) return;
    var w = state.template.widthPx;
    var h = state.template.heightPx;
    els.fieldX.value = Math.round(field.x / 100 * w);
    els.fieldY.value = Math.round(field.y / 100 * h);
    els.fieldW.value = Math.round(field.width / 100 * w);
    els.fieldH.value = Math.round(field.height / 100 * h);
  }

  function readFieldForm(commit) {
    var field = selectedField();
    if (!field) return;
    field.label = els.fieldLabel.value.trim() || field.label;
    field.type = els.fieldType.value;
    field.excelColumn = els.fieldColumn.value;
    field.fontFamily = els.fieldFont.value;
    field.fontSize = Number(els.fieldSize.value) || field.fontSize;
    field.fontWeight = els.fieldBold.checked ? 'bold' : 'normal';
    field.fontStyle = els.fieldItalic.checked ? 'italic' : 'normal';
    field.alignment = els.fieldAlign.value;
    field.textColor = els.fieldColor.value;
    field.autoFit = els.fieldAutofit.checked;
    field.minimumFontSize = Number(els.fieldMin.value) || 14;
    field.dateFormat = els.fieldDateFormat.value;
    field.numberDecimals = Number(els.fieldDecimals.value) || 0;
    field.currency = els.fieldCurrency.value;
    field.coverExistingText = els.fieldCover.checked;
    field.coverColor = els.fieldCoverColor.value;
    field.required = els.fieldRequired.checked;
    if (state.template) {
      var w = state.template.widthPx;
      var h = state.template.heightPx;
      if (els.fieldX.value !== '') field.x = Number(els.fieldX.value) / w * 100;
      if (els.fieldY.value !== '') field.y = Number(els.fieldY.value) / h * 100;
      if (els.fieldW.value !== '') field.width = Number(els.fieldW.value) / w * 100;
      if (els.fieldH.value !== '') field.height = Number(els.fieldH.value) / h * 100;
    }
    applyFields(state.fields, field.id, commit, true);
    G.Editor.setRow(currentRow());
  }

  function selectField(id) {
    state.selectedId = id;
    G.Editor.setFields(state.fields, id);
    renderFieldList();
    refreshFieldForm();
    if (state.step < 3 && canVisit(3)) setStep(3);
  }

  function addField() {
    if (!state.template) {
      toast('Upload a certificate template first.', true);
      return;
    }
    var field = G.Fields.createField({}, state.fields.length);
    state.fields.push(field);
    applyFields(state.fields, field.id, true);
    if (state.step < 3) setStep(3);
  }

  function removeSelectedField() {
    var field = selectedField();
    if (!field) return;
    state.fields = state.fields.filter(function (item) { return item.id !== field.id; });
    applyFields(state.fields, state.fields[0] ? state.fields[0].id : null, true);
  }

  function guessNameColumn(columns) {
    var preferred = ['Name', 'Full Name', 'Recipient', 'Participant Name', 'Employee', 'Donor Full Name'];
    var i;
    for (i = 0; i < preferred.length; i += 1) {
      if (columns.indexOf(preferred[i]) >= 0) return preferred[i];
    }
    return columns.filter(function (col) { return /name/i.test(col); })[0] || '';
  }

  function applySheet(name) {
    state.sheetName = name;
    var sheet = currentSheet();
    state.columns = sheet.columns;
    state.rows = sheet.rows;
    state.previewIndex = 0;
    els.rowCount.hidden = false;
    els.rowCount.textContent = sheet.total + ' rows detected';
    renderExcelPreview(sheet);
    if (!state.patternTouched) {
      var nameCol = guessNameColumn(state.columns);
      if (nameCol) {
        state.filenamePattern = '{' + nameCol + '}_Certificate';
        els.filenamePattern.value = state.filenamePattern;
      }
    }
    refreshPlaceholderChips();
    refreshFieldForm();
    refreshPreview();
  }

  function renderExcelPreview(sheet) {
    els.excelPreviewWrap.hidden = !sheet.rows.length;
    var preview = sheet.preview || [];
    var cols = sheet.columns;
    var head = '<thead><tr>' + cols.map(function (col) {
      return '<th>' + escapeHtml(col) + '</th>';
    }).join('') + '</tr></thead>';
    var body = '<tbody>' + preview.map(function (row) {
      return '<tr>' + cols.map(function (col) {
        return '<td>' + escapeHtml(G.Format.stringifyValue(row[col])) + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody>';
    els.excelPreview.innerHTML = head + body;
  }

  function refreshPlaceholderChips() {
    els.placeholderChips.innerHTML = '';
    state.columns.forEach(function (col) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '{' + col + '}';
      btn.addEventListener('click', function () {
        els.filenamePattern.value = (els.filenamePattern.value || '') + '{' + col + '}';
        state.filenamePattern = els.filenamePattern.value;
        state.patternTouched = true;
      });
      els.placeholderChips.appendChild(btn);
    });
  }

  function refreshPreview() {
    if (!state.rows.length) {
      els.previewStatus.textContent = 'Upload Excel data to preview rows.';
      G.Editor.setRow(null);
      return;
    }
    if (state.previewIndex < 0) state.previewIndex = 0;
    if (state.previewIndex > state.rows.length - 1) state.previewIndex = state.rows.length - 1;
    els.previewStatus.textContent = 'Previewing row ' + (state.previewIndex + 1) + ' of ' + state.rows.length;
    G.Editor.setRow(currentRow());
    els.btnPrevRow.disabled = state.previewIndex <= 0;
    els.btnNextRow.disabled = state.previewIndex >= state.rows.length - 1;
  }

  function refreshSummary() {
    var report = validation();
    if (!state.template || !state.workbook) {
      els.summaryBox.innerHTML = '<p>Upload a template, spreadsheet and at least one mapped field to generate.</p>';
      els.btnGenerate.disabled = true;
      return;
    }
    els.summaryBox.innerHTML =
      '<p><strong>Ready to generate</strong></p><dl>' +
      '<dt>Template</dt><dd>' + escapeHtml(state.template.name) + '</dd>' +
      '<dt>Excel</dt><dd>' + escapeHtml(state.excelName) + '</dd>' +
      '<dt>Selected sheet</dt><dd>' + escapeHtml(state.sheetName) + '</dd>' +
      '<dt>Rows detected</dt><dd>' + report.detected + '</dd>' +
      '<dt>Valid rows</dt><dd>' + report.validCount + '</dd>' +
      '<dt>Invalid rows</dt><dd>' + report.invalidCount + '</dd>' +
      '<dt>Dynamic fields</dt><dd>' + report.mappedCount + '</dd>' +
      '<dt>Output</dt><dd>' + state.outputFormat.toUpperCase() + '</dd>' +
      '</dl>';

    els.invalidBlock.hidden = report.invalidCount === 0;
    els.invalidList.innerHTML = report.invalid.slice(0, 12).map(function (item) {
      return '<li>' + escapeHtml(item.message) + '</li>';
    }).join('');

    var blocked = report.mappedCount === 0 || report.missingColumns.length > 0;
    if (report.missingColumns.length) {
      els.generateStatus.textContent = 'Mapped column not found: ' + report.missingColumns.join(', ') + '.';
    } else if (!state.results.length) {
      els.generateStatus.textContent = '';
    }
    if (state.invalidMode === 'cancel') {
      els.btnGenerate.disabled = state.generating;
      els.btnGenerate.textContent = 'Go back to Excel';
      return;
    }
    var count = state.invalidMode === 'include' ? report.validCount + report.invalidCount : report.validCount;
    els.btnGenerate.disabled = blocked || state.generating || count === 0;
    els.btnGenerate.textContent = count ? ('Generate ' + count + ' certificate' + (count === 1 ? '' : 's')) : 'Generate certificates';
  }

  function itemsToGenerate() {
    var report = validation();
    if (state.invalidMode === 'cancel') return [];
    if (state.invalidMode === 'include') {
      return report.valid.concat(report.invalid.map(function (item) {
        return { row: item.row, index: item.index, excelRow: item.excelRow, name: item.name };
      }));
    }
    return report.valid;
  }

  function revokeUrls() {
    state.objectUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    state.objectUrls = [];
  }

  function renderResults() {
    var q = String(state.search || '').trim().toLowerCase();
    var rows = state.results.filter(function (item) {
      if (!q) return true;
      return String(item.name || '').toLowerCase().indexOf(q) >= 0 ||
        String(item.filename || '').toLowerCase().indexOf(q) >= 0;
    });
    els.resultsBlock.hidden = state.results.length === 0;
    var body = els.resultsTable.querySelector('tbody');
    body.innerHTML = rows.map(function (item) {
      var number = state.results.indexOf(item) + 1;
      var status = item.ok ? 'Generated' : ('Failed: ' + (item.message || 'Unable to generate this certificate.'));
      var actions = '';
      if (item.ok) {
        actions += '<button type="button" class="linkish" data-download="' + item.index + '">Download</button>';
      }
      actions += (actions ? ' · ' : '') + '<button type="button" class="linkish" data-regen="' + item.index + '">Regenerate</button>';
      return '<tr><td>' + number + '</td><td>' + escapeHtml(item.name) + '</td><td>' +
        escapeHtml(status) + '</td><td>' + actions + '</td></tr>';
    }).join('');
  }

  function setProgress(done, total) {
    var pct = total ? Math.round(done / total * 100) : 0;
    els.progressWrap.hidden = false;
    els.progressBar.style.width = pct + '%';
    els.progressCount.textContent = done + ' / ' + total + ' completed · ' + pct + '%';
    els.progressLabel.textContent = done >= total ? 'Generation complete' : 'Generating certificates';
  }

  function generate(items, options) {
    var opts = options || {};
    if (!items || !items.length) {
      toast('There are no valid rows to generate.', true);
      return;
    }
    state.generating = true;
    els.btnGenerate.disabled = true;
    els.progressWrap.hidden = false;
    setProgress(0, items.length);
    G.Generate.generateAll({
      template: state.template,
      fields: state.fields,
      items: items,
      outputFormat: state.outputFormat,
      filenamePattern: state.filenamePattern,
      onProgress: setProgress
    }).then(function (results) {
      if (opts.merge) {
        results.forEach(function (item) {
          var idx = -1;
          state.results.forEach(function (row, i) {
            if (row.index === item.index) idx = i;
          });
          if (idx >= 0) state.results[idx] = item;
          else state.results.push(item);
        });
      } else {
        revokeUrls();
        state.results = results;
      }
      var all = state.results;
      var ok = all.filter(function (item) { return item.ok; }).length;
      var failed = all.length - ok;
      var message = ok + ' of ' + all.length + ' certificates generated successfully.';
      if (failed) message += ' ' + failed + ' failed.';
      els.generateStatus.textContent = message;
      renderResults();
      toast(message, failed > 0);
    }).catch(function (err) {
      els.generateStatus.textContent = err && err.message ? err.message : 'Unable to generate certificates.';
      toast(els.generateStatus.textContent, true);
    }).then(function () {
      state.generating = false;
      refreshSummary();
    });
  }

  function downloadOne(index) {
    var item = state.results.filter(function (row) { return row.index === index; })[0];
    if (!item || !item.ok || !item.blob) return;
    G.Generate.saveBlob(item.blob, item.filename);
  }

  function regenerateOne(index) {
    var item = state.results.filter(function (row) { return row.index === index; })[0];
    if (!item || !item.row) return;
    generate([{
      row: item.row,
      index: item.index,
      excelRow: item.excelRow,
      name: item.name,
      filename: item.filename
    }], { merge: true });
  }

  function handleDrop(zone, input, onFile) {
    zone.addEventListener('dragover', function (event) {
      event.preventDefault();
      zone.classList.add('is-over');
    });
    zone.addEventListener('dragleave', function () { zone.classList.remove('is-over'); });
    zone.addEventListener('drop', function (event) {
      event.preventDefault();
      zone.classList.remove('is-over');
      var file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) onFile(file);
    });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (file) onFile(file);
      input.value = '';
    });
  }

  function onTemplateFile(file) {
    els.templateStatus.textContent = 'Reading template…';
    G.Template.loadFile(file).then(function (template) {
      state.template = template;
      els.templateStatus.textContent = template.name + ' · ' + template.widthPx + ' × ' + template.heightPx + ' px';
      G.Editor.setTemplate(template);
      var zoom = G.Editor.fitToScreen();
      els.zoomLabel.textContent = Math.round(zoom * 100) + '%';
      if (canVisit(2)) setStep(2);
      toast('Template uploaded. Add Excel data next.');
    }).catch(function (err) {
      els.templateStatus.textContent = err.message || 'Unable to read that template.';
      toast(els.templateStatus.textContent, true);
    });
  }

  function readBuffer(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('Unable to read that spreadsheet. Please try again.')); };
      reader.readAsArrayBuffer(file);
    });
  }

  function onExcelFile(file) {
    els.excelStatus.textContent = 'Reading spreadsheet…';
    readBuffer(file).then(function (buffer) {
      var workbook = G.Excel.parseWorkbook(buffer, file.name);
      state.workbook = workbook;
      state.excelName = file.name;
      fillSelect(els.sheetSelect, workbook.sheetNames, function (name) { return name; }, function (name) { return name; });
      els.sheetField.hidden = workbook.sheetNames.length < 2;
      els.sheetSelect.value = workbook.sheetNames[0];
      applySheet(workbook.sheetNames[0]);
      els.excelStatus.textContent = file.name;
      if (canVisit(3)) setStep(3);
      toast(currentSheet().total + ' rows detected.');
    }).catch(function (err) {
      els.excelStatus.textContent = err.message || 'Unable to read that spreadsheet.';
      toast(els.excelStatus.textContent, true);
    });
  }

  function refreshSavedList() {
    G.Storage.listConfigs().then(function (rows) {
      els.savedList.hidden = !rows.length;
      els.savedList.innerHTML = rows.map(function (row) {
        return '<div class="saved-item"><span>' + escapeHtml(row.name) +
          '</span><span><button type="button" class="linkish" data-load="' + row.id +
          '">Load</button> · <button type="button" class="linkish" data-del="' + row.id +
          '">Delete</button></span></div>';
      }).join('');
    });
  }

  function saveSetup() {
    if (!state.template) {
      toast('Upload a template before saving a setup.', true);
      return;
    }
    var name = els.configName.value.trim() || 'Certificate setup';
    G.Storage.saveConfig({
      name: name,
      template: state.template,
      fields: state.fields,
      filenamePattern: state.filenamePattern,
      outputFormat: state.outputFormat
    }).then(function () {
      toast('Setup saved on this device.');
      refreshSavedList();
    }).catch(function (err) {
      toast(err.message || 'Unable to save this setup.', true);
    });
  }

  function loadSetup(id) {
    G.Storage.loadConfig(id).then(function (record) {
      if (!record) return;
      state.template = record.template;
      state.fields = record.fields || [];
      state.filenamePattern = record.filenamePattern || state.filenamePattern;
      state.outputFormat = record.outputFormat || 'pdf';
      els.filenamePattern.value = state.filenamePattern;
      els.outputFormat.value = state.outputFormat;
      els.configName.value = record.name || '';
      G.Editor.setTemplate(state.template);
      history.reset(state.fields);
      applyFields(state.fields, state.fields[0] ? state.fields[0].id : null, false);
      var zoom = G.Editor.fitToScreen();
      els.zoomLabel.textContent = Math.round(zoom * 100) + '%';
      els.templateStatus.textContent = state.template.name;
      toast('Loaded “' + record.name + '”. Upload Excel data if needed.');
      setStep(state.workbook ? 3 : 2);
    }).catch(function () {
      toast('Unable to load that saved setup.', true);
    });
  }

  function bindFieldForm() {
    ['input', 'change'].forEach(function (type) {
      els.fieldForm.addEventListener(type, function (event) {
        if (event.target.id === 'field-type') syncTypeVisibility();
        if (event.target.id === 'field-cover') syncCoverVisibility();
        readFieldForm(type === 'change');
      });
    });
  }

  function cacheEls() {
    els = {
      toast: $('toast'),
      btnUndo: $('btn-undo'),
      btnRedo: $('btn-redo'),
      templateDrop: $('template-drop'),
      templateInput: $('template-input'),
      templateStatus: $('template-status'),
      configName: $('config-name'),
      savedList: $('saved-list'),
      excelDrop: $('excel-drop'),
      excelInput: $('excel-input'),
      excelStatus: $('excel-status'),
      sheetField: $('sheet-field'),
      sheetSelect: $('sheet-select'),
      rowCount: $('row-count'),
      excelPreviewWrap: $('excel-preview-wrap'),
      excelPreview: $('excel-preview'),
      fieldList: $('field-list'),
      mappingWrap: $('mapping-wrap'),
      mappingTable: $('mapping-table'),
      fieldForm: $('field-form'),
      fieldLabel: $('field-label'),
      fieldType: $('field-type'),
      fieldColumn: $('field-column'),
      fieldFont: $('field-font'),
      fieldSize: $('field-size'),
      fieldBold: $('field-bold'),
      fieldItalic: $('field-italic'),
      fieldAlign: $('field-align'),
      fieldColor: $('field-color'),
      fieldAutofit: $('field-autofit'),
      fieldMin: $('field-min'),
      dateFormatField: $('date-format-field'),
      fieldDateFormat: $('field-date-format'),
      numberFormatFields: $('number-format-fields'),
      fieldDecimals: $('field-decimals'),
      currencyField: $('currency-field'),
      fieldCurrency: $('field-currency'),
      fieldCover: $('field-cover'),
      coverColorField: $('cover-color-field'),
      fieldCoverColor: $('field-cover-color'),
      fieldRequired: $('field-required'),
      fieldX: $('field-x'),
      fieldY: $('field-y'),
      fieldW: $('field-w'),
      fieldH: $('field-h'),
      previewStatus: $('preview-status'),
      btnPrevRow: $('btn-prev-row'),
      btnNextRow: $('btn-next-row'),
      filenamePattern: $('filename-pattern'),
      placeholderChips: $('placeholder-chips'),
      outputFormat: $('output-format'),
      summaryBox: $('summary-box'),
      invalidBlock: $('invalid-block'),
      invalidList: $('invalid-list'),
      btnGenerate: $('btn-generate'),
      progressWrap: $('progress-wrap'),
      progressBar: $('progress-bar'),
      progressLabel: $('progress-label'),
      progressCount: $('progress-count'),
      generateStatus: $('generate-status'),
      resultsBlock: $('results-block'),
      resultsSearch: $('results-search'),
      resultsTable: $('results-table'),
      zoomLabel: $('zoom-label')
    };
  }

  function initSelects() {
    fillSelect(els.fieldType, G.Fields.FIELD_TYPES, function (item) { return item.id; }, function (item) { return item.label; });
    fillSelect(els.fieldFont, G.Fields.FONT_FAMILIES, function (item) { return item; }, function (item) { return item; });
    fillSelect(els.fieldDateFormat, G.Format.DATE_FORMATS, function (item) { return item.id; }, function (item) { return item.label; });
    fillSelect(els.fieldCurrency, G.Fields.CURRENCIES, function (item) { return item.id; }, function (item) { return item.label; });
  }

  function init() {
    cacheEls();
    initSelects();
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    G.Editor.init({
      stage: $('stage'),
      scaler: $('stage-scaler'),
      scroll: $('stage-scroll'),
      image: $('template-image'),
      layer: $('fields-layer'),
      guideX: $('guide-x'),
      guideY: $('guide-y'),
      empty: $('stage-empty'),
      onSelect: selectField,
      onChange: function (fields, id) {
        state.fields = fields;
        state.selectedId = id;
        renderFieldList();
        renderMapping();
        refreshFieldForm();
      },
      onCommit: function (fields) {
        state.fields = fields;
        commitHistory();
      }
    });
    history.reset(state.fields);
    refreshHistoryButtons();
    handleDrop(els.templateDrop, els.templateInput, onTemplateFile);
    handleDrop(els.excelDrop, els.excelInput, onExcelFile);
    bindFieldForm();
    refreshSavedList();
    setStep(1);

    document.getElementById('stepper').addEventListener('click', function (event) {
      var btn = event.target.closest('.step');
      if (btn) setStep(Number(btn.getAttribute('data-step')));
    });
    $('btn-add-field').addEventListener('click', addField);
    $('btn-add-field-canvas').addEventListener('click', addField);
    $('btn-remove-field').addEventListener('click', removeSelectedField);
    els.sheetSelect.addEventListener('change', function () { applySheet(els.sheetSelect.value); });
    els.btnPrevRow.addEventListener('click', function () { state.previewIndex -= 1; refreshPreview(); });
    els.btnNextRow.addEventListener('click', function () { state.previewIndex += 1; refreshPreview(); });
    els.filenamePattern.addEventListener('input', function () {
      state.filenamePattern = els.filenamePattern.value;
      state.patternTouched = true;
    });
    els.outputFormat.addEventListener('change', function () {
      state.outputFormat = els.outputFormat.value;
      refreshSummary();
    });
    document.querySelectorAll('input[name="invalid-mode"]').forEach(function (input) {
      input.addEventListener('change', function () {
        state.invalidMode = input.value;
        refreshSummary();
      });
    });
    els.btnGenerate.addEventListener('click', function () {
      if (state.invalidMode === 'cancel') {
        toast('Generation cancelled. Fix the Excel file and upload it again.');
        setStep(2);
        return;
      }
      generate(itemsToGenerate());
    });
    $('btn-download-all').addEventListener('click', function () {
      G.Generate.zipResults(state.results).then(function (zip) {
        G.Generate.saveBlob(zip.blob, zip.name);
      }).catch(function (err) {
        toast(err.message || 'Unable to create the ZIP file.', true);
      });
    });
    els.resultsSearch.addEventListener('input', function () {
      state.search = els.resultsSearch.value;
      renderResults();
    });
    els.resultsTable.addEventListener('click', function (event) {
      var download = event.target.getAttribute('data-download');
      var regen = event.target.getAttribute('data-regen');
      if (download != null) downloadOne(Number(download));
      if (regen != null) regenerateOne(Number(regen));
    });
    $('btn-save-config').addEventListener('click', saveSetup);
    els.savedList.addEventListener('click', function (event) {
      var loadId = event.target.getAttribute('data-load');
      var delId = event.target.getAttribute('data-del');
      if (loadId) loadSetup(loadId);
      if (delId) {
        G.Storage.deleteConfig(delId).then(refreshSavedList);
      }
    });
    els.btnUndo.addEventListener('click', function () {
      var prev = history.undo();
      if (prev) applyFields(prev, state.selectedId, false);
    });
    els.btnRedo.addEventListener('click', function () {
      var next = history.redo();
      if (next) applyFields(next, state.selectedId, false);
    });
    $('zoom-in').addEventListener('click', function () {
      els.zoomLabel.textContent = Math.round(G.Editor.setZoom(G.Editor.getZoom() + 0.1) * 100) + '%';
    });
    $('zoom-out').addEventListener('click', function () {
      els.zoomLabel.textContent = Math.round(G.Editor.setZoom(G.Editor.getZoom() - 0.1) * 100) + '%';
    });
    $('zoom-fit').addEventListener('click', function () {
      els.zoomLabel.textContent = Math.round(G.Editor.fitToScreen() * 100) + '%';
    });
    $('zoom-100').addEventListener('click', function () {
      els.zoomLabel.textContent = Math.round(G.Editor.setZoom(1) * 100) + '%';
    });

    document.addEventListener('keydown', function (event) {
      var key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        els.btnUndo.click();
      } else if ((event.ctrlKey || event.metaKey) && (key === 'y' || (event.shiftKey && key === 'z'))) {
        event.preventDefault();
        els.btnRedo.click();
      } else if ((key === 'delete' || key === 'backspace') && selectedField() && document.activeElement && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT' && document.activeElement.tagName !== 'TEXTAREA') {
        event.preventDefault();
        removeSelectedField();
      } else if (selectedField() && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].indexOf(event.key.toLowerCase()) >= 0 && document.activeElement && document.activeElement.tagName !== 'INPUT') {
        event.preventDefault();
        var field = selectedField();
        var stepNudge = event.shiftKey ? 1 : 0.2;
        if (event.key === 'ArrowLeft') field.x -= stepNudge;
        if (event.key === 'ArrowRight') field.x += stepNudge;
        if (event.key === 'ArrowUp') field.y -= stepNudge;
        if (event.key === 'ArrowDown') field.y += stepNudge;
        applyFields(state.fields, field.id, true);
      }
    });

    window.addEventListener('resize', function () {
      if (state.template && els.zoomLabel.textContent === 'Fit') {
        G.Editor.fitToScreen();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
