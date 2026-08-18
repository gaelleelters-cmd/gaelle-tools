(function () {
  'use strict';

  var G = window.CertGen;
  if (!G) return;

  var state = {
    step: 1,
    template: null,
    reference: null,
    pendingHit: null,
    workbook: null,
    sheetName: '',
    columns: [],
    rows: [],
    excelName: '',
    fields: [],
    selectedId: null,
    previewIndex: 0,
    outputFormat: 'pdf',
    outputQuality: 'print',
    filenamePattern: '{Name}_Certificate',
    patternTouched: false,
    invalidMode: 'skip',
    results: [],
    designMode: 'completed',
    combinedBlob: null,
    search: '',
    objectUrls: []
  };

  var history = G.History.create(80);
  var els = {};
  var previewToken = 0;
  var previewTimer = null;

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

  function ensureFontOption(family) {
    if (!family || !els.fieldFont) return;
    var exists = Array.prototype.some.call(els.fieldFont.options, function (opt) {
      return opt.value === family;
    });
    if (!exists) {
      var opt = document.createElement('option');
      opt.value = family;
      opt.textContent = family;
      els.fieldFont.appendChild(opt);
    }
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

  function referenceHits() {
    return (state.reference && state.reference.textItems) || [];
  }

  function canVisit(step) {
    if (step <= 1) return true;
    if (step === 2) return !!state.template;
    if (step === 3) return !!state.template && !!state.reference;
    if (step === 4) return !!state.template && !!state.reference && !!state.workbook;
    if (step >= 5) {
      return !!state.template && !!state.reference && !!state.workbook && G.Fields.mappedFields(state.fields).length > 0;
    }
    return false;
  }

  function setStep(step) {
    if (!canVisit(step)) {
      if (step >= 2 && !state.template) toast(state.designMode === 'completed' ? 'Upload the completed certificate first.' : 'Upload a blank certificate template first.', true);
      else if (step >= 3 && !state.reference) toast('Upload a completed reference certificate next.', true);
      else if (step >= 4 && !state.workbook) toast('Upload an Excel file first.', true);
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
      btn.classList.toggle('is-disabled', !canVisit(n));
      btn.setAttribute('aria-disabled', canVisit(n) ? 'false' : 'true');
    });
    G.Editor.setInteractive(step < 5);
    if (step >= 5) {
      refreshPreview();
      refreshSummary();
    } else {
      clearRasterPreview();
    }
    refreshDesignModeUi();
    refreshStepper();
  }

  function isReplaceMode() {
    return state.designMode === 'completed';
  }

  function sameDesign() {
    return !!(state.template && state.reference && (
      state.template === state.reference ||
      state.template.previewUrl === state.reference.previewUrl
    ));
  }

  function refreshStepper() {
    var completed = isReplaceMode();
    var labels = completed
      ? { 1: 'Design', 3: 'Excel', 4: 'Connect', 5: 'Preview', 6: 'Download' }
      : { 1: 'Template', 2: 'Reference', 3: 'Excel', 4: 'Fields', 5: 'Preview', 6: 'Generate' };
    var n = 0;
    document.querySelectorAll('#stepper .step').forEach(function (btn) {
      var step = Number(btn.getAttribute('data-step'));
      var hide = completed && step === 2;
      var li = btn.closest('li');
      if (li) li.hidden = hide;
      if (hide) return;
      n += 1;
      var label = labels[step] || '';
      btn.innerHTML = '<span>' + n + '</span> ' + label;
      btn.classList.toggle('is-active', step === state.step);
      btn.classList.toggle('is-done', step < state.step && canVisit(step));
      btn.classList.toggle('is-disabled', !canVisit(step));
      btn.setAttribute('aria-disabled', canVisit(step) ? 'false' : 'true');
    });
  }

  function refreshEditorLayout() {
    if (!G.Editor.setLayoutMode) return;
    G.Editor.setLayoutMode(isReplaceMode() && sameDesign() ? 'replace' : 'split');
    syncEditorHits();
  }

  function refreshDesignModeUi() {
    var completed = isReplaceMode();
    document.querySelectorAll('#design-mode .mode-card').forEach(function (card) {
      var input = card.querySelector('input');
      card.classList.toggle('is-active', !!(input && input.checked));
    });
    if (els.templateDropTitle) {
      els.templateDropTitle.textContent = completed ? 'Drop the completed certificate' : 'Drop the blank template';
    }
    if (els.templateDropHint) {
      els.templateDropHint.textContent = completed
        ? 'PDF, PNG or JPG. Click the example name or date after you add Excel data.'
        : 'PDF, PNG or JPG. Word files should be exported to PDF first.';
    }
    if (els.referenceHint) {
      els.referenceHint.textContent = completed
        ? 'This completed certificate is also the generation design. Mapped values are covered and replaced. Upload a different blank file here only if you have one.'
        : 'Upload a completed version of the certificate to use as a visual reference for dynamic field positioning and formatting.';
    }
    if (els.blankPaneLabel) {
      els.blankPaneLabel.textContent = completed ? 'Certificate' : 'Blank Template';
    }
    if (els.fieldsHint) {
      els.fieldsHint.textContent = completed
        ? 'Click the sample name or date on the certificate, then connect that box to an Excel column. Everything else stays unchanged.'
        : 'Click an example value on the reference certificate, such as a name or one specific date. Only the values you select will change.';
    }
    if (els.btnOpenBlank) {
      els.btnOpenBlank.hidden = !completed || !state.template;
    }
    refreshEditorLayout();
    refreshStepper();
  }

  function commitHistory() {
    history.push(state.fields);
    refreshHistoryButtons();
  }

  function refreshHistoryButtons() {
    els.btnUndo.disabled = !history.canUndo();
    els.btnRedo.disabled = !history.canRedo();
  }

  function syncEditorHits() {
    var field = selectedField();
    G.Editor.setHits(referenceHits(), field && field.referenceItemId ? field.referenceItemId : null);
  }

  function applyFields(fields, selectedId, commit, skipForm) {
    state.fields = fields;
    if (selectedId !== undefined) state.selectedId = selectedId;
    G.Editor.setFields(state.fields, state.selectedId);
    syncEditorHits();
    renderFieldList();
    renderMapping();
    if (!skipForm) refreshFieldForm();
    refreshPlaceholderChips();
    refreshPreviewCompare();
    if (state.step >= 5) refreshPreview();
    if (commit) commitHistory();
    else refreshHistoryButtons();
  }

  function renderFieldList() {
    els.fieldList.innerHTML = '';
    if (!state.fields.length) {
      els.fieldList.innerHTML = '<p class="hint">No dynamic fields yet. Click an example value on the reference certificate.</p>';
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
      return '<tr><td>' + escapeHtml(field.label) + '</td><td>' + escapeHtml(field.excelColumn) +
        '</td><td>' + escapeHtml(field.referenceText || '—') + '</td></tr>';
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

  function restoreReferenceStyle(field) {
    var style = field.referenceStyle;
    if (!style) return;
    field.fontFamily = style.fontFamily;
    field.fontSize = style.fontSize;
    field.fontWeight = style.fontWeight;
    field.fontStyle = style.fontStyle;
    field.alignment = style.alignment;
    field.textColor = style.textColor;
    field.capitalization = style.capitalization;
    field.rotation = style.rotation;
  }

  function syncStyleVisibility() {
    var field = selectedField();
    var canMatch = !!(field && field.referenceStyle);
    els.styleReference.disabled = !canMatch;
    els.customFormatWrap.hidden = els.styleReference.checked && canMatch;
  }

  function refreshFieldForm() {
    var field = selectedField();
    els.fieldForm.hidden = !field;
    if (!field) return;
    els.fieldLabel.value = field.label;
    els.fieldType.value = field.type;
    fillSelect(els.fieldColumn, columnOptions(true), function (item) { return item.id; }, function (item) { return item.label; });
    els.fieldColumn.value = field.excelColumn || '';
    ensureFontOption(field.fontFamily);
    els.fieldFont.value = field.fontFamily;
    els.fieldSize.value = field.fontSize;
    els.fieldBold.checked = field.fontWeight === 'bold' || field.fontWeight === '700';
    els.fieldItalic.checked = field.fontStyle === 'italic';
    els.fieldAlign.value = field.alignment || 'center';
    els.fieldColor.value = field.textColor || '#1a1a1a';
    els.fieldCaps.value = field.capitalization || 'as-is';
    els.fieldAutofit.checked = field.autoFit !== false;
    els.fieldMin.value = field.minimumFontSize || 14;
    els.fieldDateFormat.value = field.dateFormat || 'DD MMMM YYYY';
    els.fieldDecimals.value = field.numberDecimals || 0;
    els.fieldCurrency.value = field.currency || 'USD';
    els.fieldCover.checked = !!field.coverExistingText;
    els.fieldCoverColor.value = field.coverColor || '#ffffff';
    els.fieldRequired.checked = field.required !== false;
    els.styleReference.checked = field.styleSource !== 'custom' && !!field.referenceStyle;
    els.styleCustom.checked = !els.styleReference.checked;
    if (field.referenceText) {
      els.fieldRefChip.hidden = false;
      els.fieldRefChip.textContent = 'Reference: ' + field.referenceText;
    } else {
      els.fieldRefChip.hidden = true;
    }
    syncTypeVisibility();
    syncCoverVisibility();
    syncStyleVisibility();
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
    field.styleSource = els.styleCustom.checked || !field.referenceStyle ? 'custom' : 'reference';
    if (field.styleSource === 'reference') {
      restoreReferenceStyle(field);
    } else {
      field.fontFamily = els.fieldFont.value;
      field.fontSize = Number(els.fieldSize.value) || field.fontSize;
      field.fontWeight = els.fieldBold.checked ? 'bold' : 'normal';
      field.fontStyle = els.fieldItalic.checked ? 'italic' : 'normal';
      field.alignment = els.fieldAlign.value;
      field.textColor = els.fieldColor.value;
      field.capitalization = els.fieldCaps.value;
    }
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
    syncStyleVisibility();
  }

  function selectField(id) {
    state.selectedId = id;
    G.Editor.setFields(state.fields, id);
    syncEditorHits();
    renderFieldList();
    refreshFieldForm();
    if (state.step < 4 && canVisit(4)) setStep(4);
  }

  function addField() {
    if (!state.template) {
      toast('Upload a blank certificate template first.', true);
      return;
    }
    var field = G.Fields.createField({}, state.fields.length);
    state.fields.push(field);
    applyFields(state.fields, field.id, true);
    if (state.step < 4 && canVisit(4)) setStep(4);
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
    var j;
    for (i = 0; i < preferred.length; i += 1) {
      for (j = 0; j < columns.length; j += 1) {
        if (String(columns[j]).toLowerCase() === preferred[i].toLowerCase()) return columns[j];
      }
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
        var token = '{' + col + '}';
        var current = els.filenamePattern.value || '';
        if (current.indexOf(token) === -1) {
          els.filenamePattern.value = current + token;
        }
        state.filenamePattern = els.filenamePattern.value;
        state.patternTouched = true;
      });
      els.placeholderChips.appendChild(btn);
    });
  }

  function ensurePrintMetrics(template) {
    if (!template || !G.Template || !G.Template.inferPrintMetrics) return template;
    if (template.type === 'pdf' && template.widthPt > 0 && template.heightPt > 0) {
      if (!template.dpi && template.widthPx) {
        template.dpi = template.widthPx / (template.widthPt / 72);
      }
      if (!template.printLabel && G.Template.matchPaper) {
        var paper = G.Template.matchPaper(template.widthPt, template.heightPt, { widthPx: template.widthPx });
        template.printLabel = paper
          ? paper.name
          : (Math.round(template.widthPt) + ' × ' + Math.round(template.heightPt) + ' pt');
        if (paper) template.paper = paper.name;
      }
      return template;
    }
    var metrics = G.Template.inferPrintMetrics(template.widthPx, template.heightPx);
    template.widthPt = metrics.widthPt;
    template.heightPt = metrics.heightPt;
    template.dpi = metrics.dpi;
    template.printLabel = metrics.printLabel;
    template.paper = metrics.paper;
    return template;
  }

  function templateStatusLine(template) {
    return (G.Template && G.Template.describePrint)
      ? G.Template.describePrint(template)
      : (template.name + ' · ' + template.widthPx + ' × ' + template.heightPx + ' px');
  }

  function refreshPrintPill(template) {
    if (!els.printPill) return;
    if (!template || !template.printLabel) {
      els.printPill.hidden = true;
      els.printPill.textContent = '';
      return;
    }
    var dpi = template.dpi ? Math.round(template.dpi) : 0;
    els.printPill.hidden = false;
    els.printPill.textContent = dpi
      ? (template.printLabel + ' print · ' + dpi + ' DPI')
      : template.printLabel;
  }

  function printSummaryLine() {
    if (!state.template) return '—';
    var dpi = state.template.dpi ? Math.round(state.template.dpi) : 0;
    var label = state.template.printLabel || 'Custom';
    return dpi ? (label + ' · ' + dpi + ' DPI') : label;
  }

  function outputSummaryLine() {
    var format = state.outputFormat === 'pdf' ? 'PDF · print size' : String(state.outputFormat || 'pdf').toUpperCase();
    var quality = state.outputQuality === 'sharp' ? 'extra sharp names' : 'source pixels';
    return format + ' · ' + quality;
  }

  function clearRasterPreview() {
    previewToken += 1;
    if (previewTimer) {
      clearTimeout(previewTimer);
      previewTimer = null;
    }
    if (G.Editor.setPreviewMode) G.Editor.setPreviewMode(false);
    if (G.Editor.setDisplayUrl) G.Editor.setDisplayUrl(null);
  }

  function refreshCanvasPager() {
    if (!els.canvasPager) return;
    var show = state.rows.length > 0;
    els.canvasPager.hidden = !show;
    if (!show) return;
    if (els.canvasRowLabel) {
      els.canvasRowLabel.textContent = 'Row ' + (state.previewIndex + 1);
    }
    if (els.canvasPrevRow) els.canvasPrevRow.disabled = state.previewIndex <= 0;
    if (els.canvasNextRow) els.canvasNextRow.disabled = state.previewIndex >= state.rows.length - 1;
  }

  function scheduleRasterPreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(rasterLivePreview, 140);
  }

  function rasterLivePreview() {
    previewTimer = null;
    var mapped = G.Fields.mappedFields(state.fields);
    if (!state.template || !currentRow() || !mapped.length || state.step < 5) {
      if (G.Editor.setPreviewMode) G.Editor.setPreviewMode(false);
      if (G.Editor.setDisplayUrl) G.Editor.setDisplayUrl(null);
      return;
    }
    var token = (previewToken += 1);
    var row = currentRow();
    var template = state.template;
    G.Editor.setPreviewMode(true);
    var fontsReady = (document.fonts && document.fonts.ready)
      ? document.fonts.ready.catch(function () { return null; })
      : Promise.resolve();
    fontsReady.then(function () {
      return G.Template.loadImageFromUrl(template.previewUrl);
    }).then(function (img) {
      if (token !== previewToken) return;
      var canvas = G.Generate.renderCertificate(img, template, mapped, row, { scale: 1 });
      var url = canvas.toDataURL('image/jpeg', 0.88);
      if (token !== previewToken) return;
      G.Editor.setDisplayUrl(url);
    }).catch(function () {
      if (token !== previewToken) return;
      G.Editor.setPreviewMode(false);
      G.Editor.setDisplayUrl(null);
    });
  }

  function shiftPreviewRow(delta) {
    state.previewIndex += delta;
    refreshPreview();
  }

  function refreshPreviewCompare() {
    if (!els.previewCompare) return;
    var row = currentRow();
    var mapped = G.Fields.mappedFields(state.fields);
    if (!row || !mapped.length) {
      els.previewCompare.hidden = true;
      return;
    }
    els.previewCompare.hidden = false;
    els.previewCompare.innerHTML = '<p class="mini-title" style="margin-top:0">Reference vs generated row ' +
      (state.previewIndex + 1) + '</p><dl>' + mapped.map(function (field) {
      var raw = G.Format.lookupRow(row, field.excelColumn);
      var value = G.Format.isBlank(raw) ? '—' : G.Format.formatFieldValue(raw, field);
      return '<dt>' + escapeHtml(field.label) + '</dt><dd>' +
        escapeHtml(field.referenceText || '—') + ' → ' + escapeHtml(value) + '</dd>';
    }).join('') + '</dl>';
  }

  function refreshPreview() {
    refreshCanvasPager();
    if (!state.rows.length) {
      els.previewStatus.textContent = 'Upload Excel data to preview rows.';
      G.Editor.setRow(null);
      clearRasterPreview();
      refreshPreviewCompare();
      return;
    }
    if (state.previewIndex < 0) state.previewIndex = 0;
    if (state.previewIndex > state.rows.length - 1) state.previewIndex = state.rows.length - 1;
    refreshCanvasPager();
    var printBit = '';
    if (state.template && state.template.printLabel) {
      printBit = ' · ' + state.template.printLabel;
      if (state.template.dpi) printBit += ' · ' + Math.round(state.template.dpi) + ' DPI';
    }
    els.previewStatus.textContent = (state.step >= 5 ? 'Print preview · row ' : 'Row ') +
      (state.previewIndex + 1) + ' of ' + state.rows.length + printBit;
    G.Editor.setRow(currentRow());
    els.btnPrevRow.disabled = state.previewIndex <= 0;
    els.btnNextRow.disabled = state.previewIndex >= state.rows.length - 1;
    refreshPreviewCompare();
    refreshOverflowWarn();
    if (state.step >= 5) scheduleRasterPreview();
    else if (G.Editor.setPreviewMode) {
      G.Editor.setPreviewMode(false);
      if (G.Editor.setDisplayUrl) G.Editor.setDisplayUrl(null);
    }
  }

  function refreshOverflowWarn() {
    if (!els.overflowWarn) return;
    if (!state.template || !currentRow() || !G.Generate.measureRow) {
      els.overflowWarn.hidden = true;
      return;
    }
    var mapped = G.Fields.mappedFields(state.fields);
    var info = G.Generate.measureRow(state.template, mapped, currentRow());
    var long = info.filter(function (item) { return item.shrunk && item.text; });
    if (!long.length) {
      els.overflowWarn.hidden = true;
      return;
    }
    els.overflowWarn.hidden = false;
    els.overflowWarn.textContent = 'Long text was auto-fitted for ' + long.map(function (item) {
      return item.label;
    }).join(', ') + '. Short names keep the original size.';
  }

  function refreshSizeWarn() {
    if (!els.sizeWarn) return;
    if (!state.template || !state.reference) {
      els.sizeWarn.hidden = true;
      return;
    }
    var tw = state.template.widthPt || state.template.widthPx;
    var th = state.template.heightPt || state.template.heightPx;
    var rw = state.reference.widthPt || state.reference.widthPx;
    var rh = state.reference.heightPt || state.reference.heightPx;
    var dw = Math.abs(tw - rw) / Math.max(tw, rw, 1);
    var dh = Math.abs(th - rh) / Math.max(th, rh, 1);
    if (dw > 0.03 || dh > 0.03) {
      els.sizeWarn.hidden = false;
      els.sizeWarn.textContent = 'The blank template and reference certificate have different page sizes. Fields are placed using proportional coordinates so they still line up, but matching page size and orientation gives the closest result.';
    } else {
      els.sizeWarn.hidden = true;
    }
  }

  function refreshSummary() {
    var report = validation();
    if (!state.template || !state.reference || !state.workbook) {
      els.summaryBox.innerHTML = isReplaceMode()
        ? '<p>Upload the completed certificate, a spreadsheet and at least one mapped field to generate.</p>'
        : '<p>Upload a blank template, a reference certificate, a spreadsheet and at least one mapped field to generate.</p>';
      els.btnGenerate.disabled = true;
      if (els.btnPreviewGenerate) els.btnPreviewGenerate.disabled = true;
      return;
    }
    els.summaryBox.innerHTML =
      '<p><strong>Ready to generate</strong></p><dl>' +
      '<dt>' + (isReplaceMode() ? 'Certificate' : 'Blank template') + '</dt><dd>' + escapeHtml(state.template.name) + '</dd>' +
      (isReplaceMode() && sameDesign() ? '' : '<dt>Reference</dt><dd>' + escapeHtml(state.reference.name) + '</dd>') +
      '<dt>Excel</dt><dd>' + escapeHtml(state.excelName) + '</dd>' +
      '<dt>Selected sheet</dt><dd>' + escapeHtml(state.sheetName) + '</dd>' +
      '<dt>Rows detected</dt><dd>' + report.detected + '</dd>' +
      '<dt>Valid rows</dt><dd>' + report.validCount + '</dd>' +
      '<dt>Invalid rows</dt><dd>' + report.invalidCount + '</dd>' +
      '<dt>Dynamic fields</dt><dd>' + report.mappedCount + '</dd>' +
      '<dt>Print size</dt><dd>' + escapeHtml(printSummaryLine()) + '</dd>' +
      '<dt>Output</dt><dd>' + escapeHtml(outputSummaryLine()) + '</dd>' +
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
      if (els.btnPreviewGenerate) els.btnPreviewGenerate.disabled = true;
      return;
    }
    var count = state.invalidMode === 'include' ? report.validCount + report.invalidCount : report.validCount;
    els.btnGenerate.disabled = blocked || state.generating || count === 0;
    els.btnGenerate.textContent = count ? ('Generate ' + count + ' certificate' + (count === 1 ? '' : 's')) : 'Generate certificates';
    if (els.btnPreviewGenerate) {
      els.btnPreviewGenerate.disabled = blocked || state.generating || count === 0;
    }
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
    if (els.btnDownloadCombined) {
      els.btnDownloadCombined.hidden = !state.combinedBlob;
    }
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
    if (els.btnPreviewGenerate) els.btnPreviewGenerate.disabled = true;
    els.progressWrap.hidden = false;
    setProgress(0, items.length);
    G.Generate.generateAll({
      template: state.template,
      fields: state.fields,
      items: items,
      outputFormat: state.outputFormat,
      outputQuality: state.outputQuality,
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
        state.combinedBlob = results.combinedBlob || null;
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

  function fitZoom() {
    var zoom = G.Editor.fitToScreen();
    els.zoomLabel.textContent = Math.round(zoom * 100) + '%';
  }

  function onTemplateFile(file) {
    els.templateStatus.textContent = 'Reading certificate…';
    G.Template.loadFile(file).then(function (template) {
      state.template = ensurePrintMetrics(template);
      els.templateStatus.textContent = templateStatusLine(state.template);
      refreshPrintPill(state.template);
      G.Editor.setTemplate(template);
      if (isReplaceMode()) {
        state.reference = template;
        var hits = template.textItems || [];
        els.referenceStatus.textContent = template.name + (hits.length
          ? (' · ' + hits.length + ' selectable text values')
          : ' · click or drag to mark the example values');
        G.Editor.setReference(template);
        G.Editor.setHits(hits, null);
        refreshSizeWarn();
        refreshEditorLayout();
        fitZoom();
        if (canVisit(3)) setStep(3);
        else setStep(2);
        toast('Certificate uploaded. Add Excel data, then click the example name or date.');
        return;
      }
      refreshSizeWarn();
      fitZoom();
      if (canVisit(2)) setStep(2);
      toast('Blank template uploaded. Add a completed reference certificate next.');
    }).catch(function (err) {
      els.templateStatus.textContent = err.message || 'Unable to read that certificate.';
      toast(els.templateStatus.textContent, true);
    });
  }

  function onReferenceFile(file) {
    if (isReplaceMode() && state.template) {
      els.referenceStatus.textContent = 'Reading blank template…';
      G.Template.loadFile(file).then(function (template) {
        state.template = ensurePrintMetrics(template);
        els.templateStatus.textContent = templateStatusLine(state.template);
        refreshPrintPill(state.template);
        G.Editor.setTemplate(template);
        refreshSizeWarn();
        refreshEditorLayout();
        fitZoom();
        toast('Blank template set. Certificates will be generated on this file, using the example only for styling.');
      }).catch(function (err) {
        toast(err.message || 'Unable to read that template.', true);
      });
      return;
    }
    els.referenceStatus.textContent = 'Reading reference certificate…';
    G.Template.loadFile(file).then(function (reference) {
      state.reference = reference;
      var hits = reference.textItems || [];
      els.referenceStatus.textContent = reference.name + (hits.length
        ? (' · ' + hits.length + ' selectable text values')
        : ' · no selectable text (drag a box on the example)');
      G.Editor.setReference(reference);
      G.Editor.setHits(hits, null);
      refreshSizeWarn();
      refreshEditorLayout();
      fitZoom();
      if (canVisit(3)) setStep(3);
      toast(hits.length
        ? 'Reference uploaded. After Excel, click example values to map them.'
        : 'Reference uploaded. After Excel, drag a box over each example value.');
    }).catch(function (err) {
      els.referenceStatus.textContent = err.message || 'Unable to read that reference certificate.';
      toast(els.referenceStatus.textContent, true);
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

  function applyWorkbook(workbook, name) {
    state.workbook = workbook;
    state.excelName = name || workbook.fileName || 'Spreadsheet';
    fillSelect(els.sheetSelect, workbook.sheetNames, function (n) { return n; }, function (n) { return n; });
    els.sheetField.hidden = workbook.sheetNames.length < 2;
    els.sheetSelect.value = workbook.sheetNames[0];
    applySheet(workbook.sheetNames[0]);
    els.excelStatus.textContent = state.excelName;
    if (canVisit(4)) setStep(4);
    toast(currentSheet().total + ' rows detected. Click example values on the certificate.');
  }

  function onExcelFile(file) {
    els.excelStatus.textContent = 'Reading spreadsheet…';
    readBuffer(file).then(function (buffer) {
      applyWorkbook(G.Excel.parseWorkbook(buffer, file.name), file.name);
    }).catch(function (err) {
      els.excelStatus.textContent = err.message || 'Unable to read that spreadsheet.';
      toast(els.excelStatus.textContent, true);
    });
  }

  function onPastedExcel() {
    try {
      applyWorkbook(G.Excel.parseTableText(els.excelPaste.value, 'pasted-data.csv'), 'Pasted from Excel');
    } catch (err) {
      toast(err.message || 'Unable to read the pasted cells.', true);
    }
  }

  function openMapDialog(hit) {
    state.pendingHit = hit;
    var existing = state.fields.filter(function (field) { return field.referenceItemId === hit.id; })[0];
    if (existing) {
      selectField(existing.id);
      toast('That reference value is already mapped to “' + existing.label + '”.');
      return;
    }
    var fieldOpts = {
      columns: state.columns,
      template: state.template,
      reference: state.reference,
      replaceMode: isReplaceMode()
    };
    var draft = G.Reference.fieldFromHit(hit, fieldOpts);
    els.mapRefText.textContent = hit.text || 'Selected area on the certificate';
    els.mapLabel.value = draft.label;
    fillSelect(els.mapType, G.Fields.FIELD_TYPES, function (item) { return item.id; }, function (item) { return item.label; });
    els.mapType.value = draft.type;
    fillSelect(els.mapColumn, columnOptions(true), function (item) { return item.id; }, function (item) { return item.label; });
    els.mapColumn.value = draft.excelColumn || '';
    if (!els.mapColumn.value) {
      var fallbackCol = (state.columns || []).filter(function (col) {
        return /name/i.test(col);
      })[0] || (state.columns && state.columns[0]) || '';
      if (fallbackCol) els.mapColumn.value = fallbackCol;
    }
    state.suggestedColumn = els.mapColumn.value || draft.excelColumn || '';
    renderMapChips(els.mapColumn.value);
    refreshMapPreview();
    els.mapDialog.hidden = false;
    els.mapLabel.focus();
    els.mapLabel.select();
  }

  function columnSample(col) {
    if (!col || !state.rows.length) return '';
    return G.Format.stringifyValue(G.Format.lookupRow(state.rows[0], col));
  }

  function refreshMapPreview() {
    if (!els.mapPreview) return;
    var col = els.mapColumn && els.mapColumn.value;
    var from = (state.pendingHit && state.pendingHit.text) || 'this area';
    var sample = columnSample(col);
    if (!col) {
      els.mapPreview.textContent = 'Choose a spreadsheet column to connect.';
      return;
    }
    els.mapPreview.textContent = sample
      ? 'Replaces “' + from + '” with “' + sample + '” on the first row.'
      : 'Connected to “' + col + '”.';
  }

  function renderMapChips(selected) {
    if (!els.mapChips) return;
    els.mapChips.innerHTML = '';
    if (!state.columns.length) {
      els.mapChips.innerHTML = '<p class="input-hint">Add Excel data first, then connect this field to a column.</p>';
      return;
    }
    state.columns.forEach(function (col) {
      var sample = columnSample(col);
      var btn = document.createElement('button');
      btn.type = 'button';
      var classes = 'connect-chip';
      if (col === selected) classes += ' is-active';
      else if (col === state.suggestedColumn) classes += ' is-suggested';
      btn.className = classes;
      btn.innerHTML = '<strong>' + escapeHtml(col) + '</strong>' +
        (sample ? '<em>' + escapeHtml(sample) + '</em>' : '');
      btn.addEventListener('click', function () {
        els.mapColumn.value = col;
        renderMapChips(col);
        refreshMapPreview();
      });
      els.mapChips.appendChild(btn);
    });
  }

  function closeMapDialog() {
    state.pendingHit = null;
    els.mapDialog.hidden = true;
  }

  function confirmMapDialog() {
    var hit = state.pendingHit;
    if (!hit) {
      closeMapDialog();
      return;
    }
    var field = G.Reference.fieldFromHit(hit, {
      columns: state.columns,
      template: state.template,
      reference: state.reference,
      replaceMode: isReplaceMode()
    });
    var column = String(els.mapColumn.value || '').trim();
    if (!column) {
      toast('Choose a spreadsheet column first.', true);
      return;
    }
    field.label = els.mapLabel.value.trim() || field.label;
    field.type = els.mapType.value || field.type;
    field.excelColumn = column;
    if (field.type === 'date') {
      field.dateFormat = hit.text
        ? G.Reference.guessDateFormat(hit.text)
        : (field.dateFormat || 'MMMM YYYY');
    }
    state.fields.push(field);
    closeMapDialog();
    applyFields(state.fields, field.id, true);
    if (state.step < 4 && canVisit(4)) setStep(4);
    toast('Mapped “' + (hit.text || field.label) + '” to ' + (field.excelColumn || field.label) + '.');
  }

  function referenceCanvas() {
    var replaceOnStage = isReplaceMode() && sameDesign();
    var img = replaceOnStage ? $('template-image') : $('ref-image');
    if (!img || !img.naturalWidth) return null;
    var canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return canvas;
  }

  function onReferenceClick(point) {
    var canvas = referenceCanvas();
    if (!canvas || !G.Reference.regionFromClick) {
      toast('Drag a box around the example value on the reference certificate.', true);
      return;
    }
    var hit = G.Reference.regionFromClick(canvas, point.x, point.y);
    if (!hit) {
      toast('Could not find text there. Drag a box around the example name or date.', true);
      return;
    }
    if (state.step < 4 && canVisit(4)) setStep(4);
    openMapDialog(hit);
  }

  function onReferenceHit(hit) {
    var canvas = referenceCanvas();
    if (canvas && G.Reference.regionFromClick && (hit.width > 70 || hit.height > 12 || !String(hit.text || '').trim())) {
      var refined = G.Reference.regionFromClick(canvas, hit.x + hit.width / 2, hit.y + hit.height / 2);
      if (refined && refined.width * refined.height < hit.width * hit.height * 0.95) {
        hit = refined;
      }
    }
    if (state.step < 4 && canVisit(4)) setStep(4);
    openMapDialog(hit);
  }

  function onReferenceMark(box) {
    if (!state.template) return;
    var canvas = referenceCanvas();
    var hit = canvas && G.Reference.refineMark
      ? G.Reference.refineMark(canvas, box)
      : null;
    if (!hit) {
      var heightPx = (state.reference && state.reference.heightPx) || (canvas && canvas.height) || 1000;
      hit = {
        id: 'hit_mark_' + Date.now().toString(36),
        text: '',
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        fontSize: Math.max(14, box.height / 100 * heightPx * 0.72),
        rotation: 0
      };
    }
    if (state.step < 4 && canVisit(4)) setStep(4);
    openMapDialog(hit);
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
      reference: state.reference,
      fields: state.fields,
      filenamePattern: state.filenamePattern,
      outputFormat: state.outputFormat,
      outputQuality: state.outputQuality
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
      state.template = ensurePrintMetrics(record.template);
      state.reference = record.reference || null;
      state.fields = record.fields || [];
      state.filenamePattern = record.filenamePattern || state.filenamePattern;
      state.outputFormat = record.outputFormat || 'pdf';
      state.outputQuality = record.outputQuality || 'print';
      els.filenamePattern.value = state.filenamePattern;
      els.outputFormat.value = state.outputFormat;
      if (els.outputQuality) els.outputQuality.value = state.outputQuality;
      els.configName.value = record.name || '';
      G.Editor.setTemplate(state.template);
      G.Editor.setReference(state.reference);
      G.Editor.setHits(referenceHits(), null);
      history.reset(state.fields);
      applyFields(state.fields, state.fields[0] ? state.fields[0].id : null, false);
      refreshSizeWarn();
      refreshEditorLayout();
      fitZoom();
      els.templateStatus.textContent = templateStatusLine(state.template);
      refreshPrintPill(state.template);
      els.referenceStatus.textContent = state.reference ? state.reference.name : 'No reference certificate uploaded yet.';
      toast('Loaded “' + record.name + '”. Upload Excel data if needed.');
      if (state.workbook && state.reference) setStep(4);
      else if (state.reference) setStep(3);
      else setStep(2);
    }).catch(function () {
      toast('Unable to load that saved setup.', true);
    });
  }

  function bindFieldForm() {
    ['input', 'change'].forEach(function (type) {
      els.fieldForm.addEventListener(type, function (event) {
        if (event.target.id === 'field-type') syncTypeVisibility();
        if (event.target.id === 'field-cover') syncCoverVisibility();
        if (event.target.name === 'style-source') {
          var field = selectedField();
          if (field && event.target.value === 'reference') restoreReferenceStyle(field);
          syncStyleVisibility();
        }
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
      printPill: $('print-pill'),
      templateDropTitle: $('template-drop-title'),
      templateDropHint: $('template-drop-hint'),
      configName: $('config-name'),
      savedList: $('saved-list'),
      referenceDrop: $('reference-drop'),
      referenceInput: $('reference-input'),
      referenceStatus: $('reference-status'),
      referenceHint: $('reference-hint'),
      sizeWarn: $('size-warn'),
      excelDrop: $('excel-drop'),
      excelInput: $('excel-input'),
      excelPaste: $('excel-paste'),
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
      fieldRefChip: $('field-ref-chip'),
      fieldLabel: $('field-label'),
      fieldType: $('field-type'),
      fieldColumn: $('field-column'),
      fieldFont: $('field-font'),
      fieldSize: $('field-size'),
      fieldBold: $('field-bold'),
      fieldItalic: $('field-italic'),
      fieldAlign: $('field-align'),
      fieldColor: $('field-color'),
      fieldCaps: $('field-caps'),
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
      styleReference: $('style-reference'),
      styleCustom: $('style-custom'),
      customFormatWrap: $('custom-format-wrap'),
      previewStatus: $('preview-status'),
      previewCompare: $('preview-compare'),
      overflowWarn: $('overflow-warn'),
      btnPrevRow: $('btn-prev-row'),
      btnNextRow: $('btn-next-row'),
      btnPreviewGenerate: $('btn-preview-generate'),
      canvasPager: $('canvas-pager'),
      canvasRowLabel: $('canvas-row-label'),
      canvasPrevRow: $('canvas-prev-row'),
      canvasNextRow: $('canvas-next-row'),
      filenamePattern: $('filename-pattern'),
      placeholderChips: $('placeholder-chips'),
      outputFormat: $('output-format'),
      outputQuality: $('output-quality'),
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
      btnDownloadCombined: $('btn-download-combined'),
      zoomLabel: $('zoom-label'),
      blankPaneLabel: $('blank-pane-label'),
      mapDialog: $('map-dialog'),
      mapRefText: $('map-ref-text'),
      mapLabel: $('map-label'),
      mapType: $('map-type'),
      mapColumn: $('map-column'),
      mapChips: $('map-chips'),
      mapPreview: $('map-preview'),
      fieldsHint: $('fields-hint'),
      btnOpenBlank: $('btn-open-blank')
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
      split: $('canvas-split'),
      refPane: $('ref-pane'),
      refStage: $('ref-stage'),
      refScaler: $('ref-scaler'),
      refScroll: $('ref-scroll'),
      refImage: $('ref-image'),
      refHits: $('ref-hits'),
      refEmpty: $('ref-empty'),
      stageHits: $('stage-hits'),
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
      },
      onHit: onReferenceHit,
      onMark: onReferenceMark,
      onClick: onReferenceClick
    });
    history.reset(state.fields);
    refreshHistoryButtons();
    handleDrop(els.templateDrop, els.templateInput, onTemplateFile);
    handleDrop(els.referenceDrop, els.referenceInput, onReferenceFile);
    handleDrop(els.excelDrop, els.excelInput, onExcelFile);
    bindFieldForm();
    refreshSavedList();
    refreshDesignModeUi();
    setStep(1);

    document.querySelectorAll('input[name="design-mode"]').forEach(function (input) {
      input.addEventListener('change', function () {
        state.designMode = input.value;
        refreshDesignModeUi();
      });
    });
    if (els.excelPaste) {
      els.excelPaste.addEventListener('paste', function () {
        setTimeout(function () {
          if (els.excelPaste.value.trim()) onPastedExcel();
        }, 0);
      });
    }
    if ($('btn-paste-excel')) $('btn-paste-excel').addEventListener('click', onPastedExcel);
    if (els.mapColumn) {
      els.mapColumn.addEventListener('change', function () {
        renderMapChips(els.mapColumn.value);
        refreshMapPreview();
      });
    }
    document.querySelectorAll('.panel-continue').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = Number(btn.getAttribute('data-next'));
        if (isReplaceMode() && next === 2) next = 3;
        setStep(next);
      });
    });
    if (els.btnOpenBlank) {
      els.btnOpenBlank.addEventListener('click', function () {
        setStep(2);
      });
    }

    document.getElementById('stepper').addEventListener('click', function (event) {
      var btn = event.target.closest('.step');
      if (btn) setStep(Number(btn.getAttribute('data-step')));
    });
    $('btn-add-field').addEventListener('click', addField);
    $('btn-add-field-canvas').addEventListener('click', addField);
    $('btn-remove-field').addEventListener('click', removeSelectedField);
    $('map-cancel').addEventListener('click', closeMapDialog);
    $('map-confirm').addEventListener('click', confirmMapDialog);
    els.mapDialog.addEventListener('click', function (event) {
      if (event.target === els.mapDialog) closeMapDialog();
    });
    els.sheetSelect.addEventListener('change', function () { applySheet(els.sheetSelect.value); });
    els.btnPrevRow.addEventListener('click', function () { shiftPreviewRow(-1); });
    els.btnNextRow.addEventListener('click', function () { shiftPreviewRow(1); });
    if (els.canvasPrevRow) els.canvasPrevRow.addEventListener('click', function () { shiftPreviewRow(-1); });
    if (els.canvasNextRow) els.canvasNextRow.addEventListener('click', function () { shiftPreviewRow(1); });
    els.filenamePattern.addEventListener('input', function () {
      state.filenamePattern = els.filenamePattern.value;
      state.patternTouched = true;
    });
    els.outputFormat.addEventListener('change', function () {
      state.outputFormat = els.outputFormat.value;
      refreshSummary();
    });
    if (els.outputQuality) {
      els.outputQuality.addEventListener('change', function () {
        state.outputQuality = els.outputQuality.value;
        refreshSummary();
      });
    }
    if (els.btnPreviewGenerate) {
      els.btnPreviewGenerate.addEventListener('click', function () {
        if (!canVisit(6)) {
          toast('Add at least one mapped field first.', true);
          return;
        }
        setStep(6);
        if (state.invalidMode === 'cancel') return;
        generate(itemsToGenerate());
      });
    }
    document.querySelectorAll('input[name="invalid-mode"]').forEach(function (input) {
      input.addEventListener('change', function () {
        state.invalidMode = input.value;
        refreshSummary();
      });
    });
    els.btnGenerate.addEventListener('click', function () {
      if (state.invalidMode === 'cancel') {
        toast('Generation cancelled. Fix the Excel file and upload it again.');
        setStep(3);
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
    if ($('btn-download-combined')) {
      $('btn-download-combined').addEventListener('click', function () {
        if (!state.combinedBlob) {
          toast('Generate certificates first to download them as one PDF.', true);
          return;
        }
        G.Generate.saveBlob(state.combinedBlob, 'Certificates.pdf');
      });
    }
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
      if (event.key === 'Escape' && !els.mapDialog.hidden) {
        event.preventDefault();
        closeMapDialog();
        return;
      }
      if (event.key === 'Enter' && !els.mapDialog.hidden) {
        var tag = document.activeElement && document.activeElement.tagName;
        if (tag !== 'TEXTAREA') {
          event.preventDefault();
          confirmMapDialog();
          return;
        }
      }
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
      if (state.template && els.zoomLabel.textContent.indexOf('%') >= 0) {
        /* keep explicit zoom */
      } else if (state.template) {
        G.Editor.fitToScreen();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
