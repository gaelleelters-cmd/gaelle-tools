(function attachCertEditor(global) {
  'use strict';

  var CertGen = global.CertGen || {};
  var SNAP = 0.7;
  var MIN_SIZE = 3;

  var root = {
    stage: null,
    scaler: null,
    scroll: null,
    image: null,
    layer: null,
    guideX: null,
    guideY: null,
    empty: null,
    split: null,
    refPane: null,
    refStage: null,
    refScaler: null,
    refScroll: null,
    refImage: null,
    refHits: null,
    refEmpty: null,
    stageHits: null,
    layoutMode: 'split',
    onSelect: function () {},
    onChange: function () {},
    onCommit: function () {},
    onHit: function () {},
    onMark: function () {},
    onClick: function () {},
    fields: [],
    hits: [],
    selectedId: null,
    selectedHitId: null,
    row: null,
    zoom: 1,
    interactive: true,
    dragging: null,
    marking: null,
    sourceUrl: '',
    previewMode: false
  };

  function fieldEl(id) {
    if (!root.layer) return null;
    var safe = (global.CSS && CSS.escape) ? CSS.escape(id) : String(id);
    return root.layer.querySelector('[data-field-id="' + safe + '"]');
  }

  function displayText(field) {
    var Format = CertGen.Format;
    if (!root.row || !field.excelColumn) {
      return '{' + (field.excelColumn || field.label || 'Field') + '}';
    }
    var raw = Format.lookupRow(root.row, field.excelColumn);
    if (Format.isBlank(raw)) return '{' + (field.excelColumn || field.label || 'Field') + '}';
    return Format.formatFieldValue(raw, field);
  }

  function applyFieldBox(el, field) {
    el.style.left = field.x + '%';
    el.style.top = field.y + '%';
    el.style.width = field.width + '%';
    el.style.height = field.height + '%';
    el.style.color = field.textColor || '#1a1a1a';
    el.style.fontFamily = '"' + (field.fontFamily || 'Georgia') + '", Georgia, serif';
    el.style.fontSize = (field.fontSize || 24) + 'px';
    el.style.fontWeight = field.fontWeight === 'bold' || field.fontWeight === '700' ? '700' : '400';
    el.style.fontStyle = field.fontStyle === 'italic' ? 'italic' : 'normal';
    el.style.textAlign = field.alignment || 'center';
    el.style.background = 'transparent';
    el.style.transform = (Number(field.rotation) || 0) ? ('rotate(' + field.rotation + 'deg)') : '';
    el.style.letterSpacing = field.letterSpacing ? (field.letterSpacing + 'px') : '';
    el.classList.toggle('is-selected', field.id === root.selectedId);
    el.dataset.coverX = field.coverX != null ? String(field.coverX) : String(field.x);
    el.dataset.coverY = field.coverY != null ? String(field.coverY) : String(field.y);
    el.dataset.coverWidth = field.coverWidth != null ? String(field.coverWidth) : String(field.width);
    el.dataset.coverHeight = field.coverHeight != null ? String(field.coverHeight) : String(field.height);
    var cover = el.querySelector('.cert-field-cover');
    if (cover) {
      if (field.coverExistingText) {
        var cx = Number(el.dataset.coverX);
        var cy = Number(el.dataset.coverY);
        var cw = Number(el.dataset.coverWidth);
        var ch = Number(el.dataset.coverHeight);
        cover.hidden = false;
        cover.style.left = ((cx - field.x) / Math.max(0.1, field.width) * 100) + '%';
        cover.style.top = ((cy - field.y) / Math.max(0.1, field.height) * 100) + '%';
        cover.style.width = (cw / Math.max(0.1, field.width) * 100) + '%';
        cover.style.height = (ch / Math.max(0.1, field.height) * 100) + '%';
        cover.style.background = field.coverColor || '#ffffff';
      } else {
        cover.hidden = true;
      }
    }
    var label = el.querySelector('.cert-field-text');
    if (label) {
      label.textContent = displayText(field);
      autoFitOverlay(el, label, field);
    }
  }

  function autoFitOverlay(el, label, field) {
    var size = Number(field.fontSize) || 24;
    var min = Number(field.minimumFontSize) || 12;
    el.style.fontSize = size + 'px';
    if (field.autoFit === false) return;
    var guard = 80;
    while (guard-- && size > min && (label.scrollWidth > el.clientWidth + 1 || label.scrollHeight > el.clientHeight + 1)) {
      size -= 0.5;
      el.style.fontSize = size + 'px';
    }
  }

  function renderFields() {
    if (!root.layer) return;
    root.layer.innerHTML = '';
    root.fields.forEach(function (field) {
      var el = document.createElement('div');
      el.className = 'cert-field';
      el.dataset.fieldId = field.id;
      el.tabIndex = 0;
      el.innerHTML =
        '<span class="cert-field-cover" hidden></span>' +
        '<span class="cert-field-text"></span>' +
        (field.excelColumn ? '<span class="cert-field-tag">' + field.excelColumn + '</span>' : '') +
        '<span class="cert-handle" data-handle="nw"></span>' +
        '<span class="cert-handle" data-handle="n"></span>' +
        '<span class="cert-handle" data-handle="ne"></span>' +
        '<span class="cert-handle" data-handle="e"></span>' +
        '<span class="cert-handle" data-handle="se"></span>' +
        '<span class="cert-handle" data-handle="s"></span>' +
        '<span class="cert-handle" data-handle="sw"></span>' +
        '<span class="cert-handle" data-handle="w"></span>';
      applyFieldBox(el, field);
      root.layer.appendChild(el);
    });
    renderHits();
  }

  function hitHost() {
    if (root.layoutMode === 'replace' && root.stageHits) return root.stageHits;
    return root.refHits;
  }

  function markStage() {
    return root.layoutMode === 'replace' ? root.stage : root.refStage;
  }

  function renderHits() {
    if (root.refHits) root.refHits.innerHTML = '';
    if (root.stageHits) root.stageHits.innerHTML = '';
    var host = hitHost();
    if (!host) return;
    root.hits.forEach(function (hit) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'ref-hit';
      if (hit.id === root.selectedHitId) el.classList.add('is-selected');
      var used = root.fields.some(function (field) { return field.referenceItemId === hit.id; });
      if (used && root.layoutMode === 'replace') return;
      if (used) el.classList.add('is-mapped');
      el.style.left = hit.x + '%';
      el.style.top = hit.y + '%';
      el.style.width = hit.width + '%';
      el.style.height = hit.height + '%';
      el.dataset.hitId = hit.id;
      el.title = hit.text || 'Click to connect this area to a spreadsheet column';
      el.textContent = hit.text || '';
      el.addEventListener('pointerdown', function (event) {
        event.stopPropagation();
      });
      el.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var stage = markStage() || root.stage;
        if ((hit.width > 70 || hit.height > 12) && stage && root.onClick) {
          root.onClick(pointerToPct(event, stage));
          return;
        }
        root.selectedHitId = hit.id;
        renderHits();
        root.onHit(hit);
      });
      host.appendChild(el);
    });
  }

  function findField(id) {
    return root.fields.filter(function (field) { return field.id === id; })[0] || null;
  }

  function hideGuides() {
    if (root.guideX) root.guideX.hidden = true;
    if (root.guideY) root.guideY.hidden = true;
  }

  function showGuides(centerX, centerY) {
    if (root.guideX) root.guideX.hidden = Math.abs(centerX - 50) >= SNAP;
    if (root.guideY) root.guideY.hidden = Math.abs(centerY - 50) >= SNAP;
  }

  function clampField(field) {
    field.width = Math.max(MIN_SIZE, Math.min(100, field.width));
    field.height = Math.max(MIN_SIZE, Math.min(100, field.height));
    field.x = Math.max(0, Math.min(100 - field.width, field.x));
    field.y = Math.max(0, Math.min(100 - field.height, field.y));
  }

  function pointerToPct(event, stage) {
    var rect = stage.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * 100,
      y: (event.clientY - rect.top) / rect.height * 100
    };
  }

  function onPointerDown(event) {
    if (!root.interactive) return;
    if (event.target.closest('.ref-hit')) return;
    var handle = event.target.closest('.cert-handle');
    var fieldNode = event.target.closest('.cert-field');
    if (!fieldNode) {
      if (root.layoutMode === 'replace' && root.stage) {
        var markStart = pointerToPct(event, root.stage);
        root.marking = { startX: markStart.x, startY: markStart.y, endX: markStart.x, endY: markStart.y };
      }
      root.selectedId = null;
      renderFields();
      root.onSelect(null);
      return;
    }
    event.preventDefault();
    var field = findField(fieldNode.dataset.fieldId);
    if (!field) return;
    root.selectedId = field.id;
    root.selectedHitId = field.referenceItemId || null;
    renderFields();
    root.onSelect(field.id);
    var start = pointerToPct(event, root.stage);
    root.dragging = {
      id: field.id,
      handle: handle ? handle.dataset.handle : 'move',
      startX: start.x,
      startY: start.y,
      orig: { x: field.x, y: field.y, width: field.width, height: field.height }
    };
    fieldNode.setPointerCapture && fieldNode.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (root.marking && markStage()) {
      var now = pointerToPct(event, markStage());
      root.marking.endX = now.x;
      root.marking.endY = now.y;
      drawMark();
      return;
    }
    if (!root.dragging) return;
    var field = findField(root.dragging.id);
    if (!field) return;
    var pos = pointerToPct(event, root.stage);
    var dx = pos.x - root.dragging.startX;
    var dy = pos.y - root.dragging.startY;
    var o = root.dragging.orig;
    var handle = root.dragging.handle;
    if (handle === 'move') {
      field.x = o.x + dx;
      field.y = o.y + dy;
      if (Math.abs(field.x + field.width / 2 - 50) < SNAP) field.x = 50 - field.width / 2;
      if (Math.abs(field.y + field.height / 2 - 50) < SNAP) field.y = 50 - field.height / 2;
      showGuides(field.x + field.width / 2, field.y + field.height / 2);
    } else {
      if (handle.indexOf('e') >= 0) field.width = o.width + dx;
      if (handle.indexOf('s') >= 0) field.height = o.height + dy;
      if (handle.indexOf('w') >= 0) {
        field.x = o.x + dx;
        field.width = o.width - dx;
      }
      if (handle.indexOf('n') >= 0) {
        field.y = o.y + dy;
        field.height = o.height - dy;
      }
      hideGuides();
    }
    clampField(field);
    var el = fieldEl(field.id);
    if (el) applyFieldBox(el, field);
    root.onChange(root.fields, field.id, false);
  }

  function onPointerUp() {
    if (root.marking) {
      finishMark();
      return;
    }
    if (!root.dragging) return;
    hideGuides();
    var field = findField(root.dragging.id);
    root.dragging = null;
    if (field) {
      clampField(field);
      root.onChange(root.fields, field.id, true);
      root.onCommit(root.fields);
    }
  }

  function drawMark() {
    var host = hitHost();
    if (!host || !root.marking) return;
    var m = root.marking;
    var x = Math.min(m.startX, m.endX);
    var y = Math.min(m.startY, m.endY);
    var w = Math.abs(m.endX - m.startX);
    var h = Math.abs(m.endY - m.startY);
    var box = host.querySelector('.ref-mark');
    if (!box) {
      box = document.createElement('div');
      box.className = 'ref-mark';
      host.appendChild(box);
    }
    box.style.left = x + '%';
    box.style.top = y + '%';
    box.style.width = w + '%';
    box.style.height = h + '%';
  }

  function finishMark() {
    var m = root.marking;
    root.marking = null;
    var host = hitHost();
    var box = host && host.querySelector('.ref-mark');
    if (box) box.remove();
    if (!m) return;
    var x = Math.min(m.startX, m.endX);
    var y = Math.min(m.startY, m.endY);
    var w = Math.abs(m.endX - m.startX);
    var h = Math.abs(m.endY - m.startY);
    if (w < 1.5 || h < 1.2) {
      root.onClick({ x: m.startX, y: m.startY });
      return;
    }
    root.onMark({ x: x, y: y, width: w, height: h });
  }

  function onRefPointerDown(event) {
    if (root.layoutMode === 'replace' || !root.interactive || event.target.closest('.ref-hit')) return;
    var start = pointerToPct(event, root.refStage);
    root.marking = { startX: start.x, startY: start.y, endX: start.x, endY: start.y };
  }

  function applyZoom() {
    function size(stage, scaler) {
      if (!stage || !scaler) return;
      var w = Number(stage.dataset.naturalWidth || 0);
      var h = Number(stage.dataset.naturalHeight || 0);
      if (!w || !h) return;
      scaler.style.width = (w * root.zoom) + 'px';
      scaler.style.height = (h * root.zoom) + 'px';
      stage.style.transform = 'scale(' + root.zoom + ')';
    }
    size(root.stage, root.scaler);
    size(root.refStage, root.refScaler);
  }

  function setStageImage(stage, image, empty, template) {
    if (!stage || !image) return;
    if (!template) {
      image.removeAttribute('src');
      image.hidden = true;
      stage.dataset.naturalWidth = '';
      stage.dataset.naturalHeight = '';
      if (empty) empty.hidden = false;
      return;
    }
    image.hidden = false;
    image.src = template.previewUrl;
    stage.style.width = template.widthPx + 'px';
    stage.style.height = template.heightPx + 'px';
    stage.dataset.naturalWidth = String(template.widthPx);
    stage.dataset.naturalHeight = String(template.heightPx);
    if (empty) empty.hidden = true;
  }

  function fitToScreen() {
    var stages = [root.stage, root.refStage].filter(Boolean);
    var zooms = [];
    stages.forEach(function (stage) {
      if (stage === root.refStage && root.refPane && root.refPane.hidden) return;
      var scroll = stage === root.refStage ? root.refScroll : root.scroll;
      var w = Number(stage.dataset.naturalWidth || 0);
      var h = Number(stage.dataset.naturalHeight || 0);
      if (!w || !h || !scroll) return;
      var availW = Math.max(120, scroll.clientWidth - 36);
      var availH = Math.max(120, scroll.clientHeight - 36);
      zooms.push(Math.max(0.12, Math.min(availW / w, availH / h)));
    });
    if (zooms.length) root.zoom = Math.min.apply(null, zooms);
    applyZoom();
    return root.zoom;
  }

  function setZoom(next) {
    root.zoom = Math.max(0.12, Math.min(3, next));
    applyZoom();
    return root.zoom;
  }

  function setSplitVisible(show) {
    if (root.split) root.split.classList.toggle('has-reference', !!show);
    if (root.refPane) root.refPane.hidden = !show;
  }

  function setLayoutMode(mode) {
    root.layoutMode = mode === 'replace' ? 'replace' : 'split';
    if (root.layoutMode === 'replace') {
      setSplitVisible(false);
      if (root.refHits) root.refHits.innerHTML = '';
    } else {
      var hasRef = !!(root.refImage && !root.refImage.hidden);
      setSplitVisible(hasRef);
      if (root.stageHits) root.stageHits.innerHTML = '';
    }
    renderHits();
  }

  function init(options) {
    root.stage = options.stage;
    root.scaler = options.scaler;
    root.scroll = options.scroll;
    root.image = options.image;
    root.layer = options.layer;
    root.guideX = options.guideX;
    root.guideY = options.guideY;
    root.empty = options.empty;
    root.split = options.split;
    root.refPane = options.refPane;
    root.refStage = options.refStage;
    root.refScaler = options.refScaler;
    root.refScroll = options.refScroll;
    root.refImage = options.refImage;
    root.refHits = options.refHits;
    root.refEmpty = options.refEmpty;
    root.stageHits = options.stageHits || null;
    root.onSelect = options.onSelect || function () {};
    root.onChange = options.onChange || function () {};
    root.onCommit = options.onCommit || function () {};
    root.onHit = options.onHit || function () {};
    root.onMark = options.onMark || function () {};
    root.onClick = options.onClick || function () {};
    root.stage.addEventListener('pointerdown', onPointerDown);
    if (root.refStage) {
      root.refStage.addEventListener('pointerdown', onRefPointerDown);
    }
    global.addEventListener('pointermove', onPointerMove);
    global.addEventListener('pointerup', onPointerUp);
    global.addEventListener('pointercancel', onPointerUp);
  }

  function setDisplayUrl(url) {
    if (!root.image) return;
    root.image.src = url || root.sourceUrl || '';
  }

  function setPreviewMode(on) {
    root.previewMode = !!on;
    if (root.stage) root.stage.classList.toggle('is-preview', root.previewMode);
    if (root.layer) root.layer.style.visibility = on ? 'hidden' : '';
    if (root.stageHits) root.stageHits.style.visibility = on ? 'hidden' : '';
  }

  CertGen.Editor = {
    init: init,
    setTemplate: function (template) {
      setPreviewMode(false);
      root.sourceUrl = template && template.previewUrl ? template.previewUrl : '';
      setStageImage(root.stage, root.image, root.empty, template);
      applyZoom();
    },
    setDisplayUrl: setDisplayUrl,
    setPreviewMode: setPreviewMode,
    setReference: function (template) {
      setStageImage(root.refStage, root.refImage, root.refEmpty, template);
      if (root.layoutMode === 'replace') setSplitVisible(false);
      else setSplitVisible(!!template);
      applyZoom();
    },
    setLayoutMode: setLayoutMode,
    setHits: function (hits, selectedHitId) {
      root.hits = hits || [];
      if (selectedHitId !== undefined) root.selectedHitId = selectedHitId;
      renderHits();
    },
    setFields: function (fields, selectedId) {
      root.fields = fields || [];
      if (selectedId !== undefined) root.selectedId = selectedId;
      var field = findField(root.selectedId);
      root.selectedHitId = field && field.referenceItemId ? field.referenceItemId : root.selectedHitId;
      renderFields();
    },
    setRow: function (row) {
      root.row = row || null;
      renderFields();
    },
    setInteractive: function (value) {
      root.interactive = !!value;
      if (root.stage) root.stage.classList.toggle('is-locked', !root.interactive);
      if (root.refStage) root.refStage.classList.toggle('is-locked', !root.interactive);
    },
    setZoom: setZoom,
    getZoom: function () { return root.zoom; },
    fitToScreen: fitToScreen,
    selectedId: function () { return root.selectedId; }
  };
  global.CertGen = CertGen;
})(typeof globalThis !== 'undefined' ? globalThis : window);
