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
    onSelect: function () {},
    onChange: function () {},
    onCommit: function () {},
    fields: [],
    selectedId: null,
    row: null,
    zoom: 1,
    interactive: true,
    dragging: null
  };

  function $(id) {
    return document.getElementById(id);
  }

  function fieldEl(id) {
    var safe = (global.CSS && CSS.escape) ? CSS.escape(id) : String(id);
    return root.layer.querySelector('[data-field-id="' + safe + '"]');
  }

  function displayText(field) {
    var Format = CertGen.Format;
    if (!root.row || !field.excelColumn) return '{' + (field.label || 'Field') + '}';
    var raw = Format.lookupRow(root.row, field.excelColumn);
    if (Format.isBlank(raw)) return '{' + (field.label || 'Field') + '}';
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
    el.style.background = field.coverExistingText ? (field.coverColor || '#ffffff') : 'transparent';
    el.classList.toggle('is-selected', field.id === root.selectedId);
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
        '<span class="cert-field-text"></span>' +
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
  }

  function findField(id) {
    return root.fields.filter(function (field) { return field.id === id; })[0] || null;
  }

  function hideGuides() {
    if (root.guideX) root.guideX.hidden = true;
    if (root.guideY) root.guideY.hidden = true;
  }

  function showGuides(centerX, centerY) {
    if (root.guideX) {
      root.guideX.hidden = Math.abs(centerX - 50) >= SNAP;
    }
    if (root.guideY) {
      root.guideY.hidden = Math.abs(centerY - 50) >= SNAP;
    }
  }

  function clampField(field) {
    field.width = Math.max(MIN_SIZE, Math.min(100, field.width));
    field.height = Math.max(MIN_SIZE, Math.min(100, field.height));
    field.x = Math.max(0, Math.min(100 - field.width, field.x));
    field.y = Math.max(0, Math.min(100 - field.height, field.y));
  }

  function pointerToPct(event) {
    var rect = root.stage.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * 100,
      y: (event.clientY - rect.top) / rect.height * 100
    };
  }

  function onPointerDown(event) {
    if (!root.interactive) return;
    var handle = event.target.closest('.cert-handle');
    var fieldNode = event.target.closest('.cert-field');
    if (!fieldNode) {
      root.selectedId = null;
      renderFields();
      root.onSelect(null);
      return;
    }
    event.preventDefault();
    var field = findField(fieldNode.dataset.fieldId);
    if (!field) return;
    root.selectedId = field.id;
    renderFields();
    root.onSelect(field.id);
    var start = pointerToPct(event);
    root.dragging = {
      id: field.id,
      handle: handle ? handle.dataset.handle : 'move',
      startX: start.x,
      startY: start.y,
      orig: {
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height
      }
    };
    fieldNode.setPointerCapture && fieldNode.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!root.dragging) return;
    var field = findField(root.dragging.id);
    if (!field) return;
    var now = pointerToPct(event);
    var dx = now.x - root.dragging.startX;
    var dy = now.y - root.dragging.startY;
    var o = root.dragging.orig;
    var handle = root.dragging.handle;

    if (handle === 'move') {
      field.x = o.x + dx;
      field.y = o.y + dy;
      var cx = field.x + field.width / 2;
      var cy = field.y + field.height / 2;
      if (Math.abs(cx - 50) < SNAP) field.x = 50 - field.width / 2;
      if (Math.abs(cy - 50) < SNAP) field.y = 50 - field.height / 2;
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

  function applyZoom() {
    if (!root.stage || !root.scaler) return;
    var w = Number(root.stage.dataset.naturalWidth || 0);
    var h = Number(root.stage.dataset.naturalHeight || 0);
    if (!w || !h) return;
    root.scaler.style.width = (w * root.zoom) + 'px';
    root.scaler.style.height = (h * root.zoom) + 'px';
    root.stage.style.transform = 'scale(' + root.zoom + ')';
  }

  function setTemplate(template) {
    if (!root.image || !root.stage) return;
    if (!template) {
      root.image.removeAttribute('src');
      root.image.hidden = true;
      root.stage.dataset.naturalWidth = '';
      root.stage.dataset.naturalHeight = '';
      if (root.empty) root.empty.hidden = false;
      return;
    }
    root.image.hidden = false;
    root.image.src = template.previewUrl;
    root.stage.style.width = template.widthPx + 'px';
    root.stage.style.height = template.heightPx + 'px';
    root.stage.dataset.naturalWidth = String(template.widthPx);
    root.stage.dataset.naturalHeight = String(template.heightPx);
    if (root.empty) root.empty.hidden = true;
    applyZoom();
  }

  function fitToScreen() {
    if (!root.scroll || !root.stage) return root.zoom;
    var w = Number(root.stage.dataset.naturalWidth || 0);
    var h = Number(root.stage.dataset.naturalHeight || 0);
    if (!w || !h) return root.zoom;
    var availW = Math.max(120, root.scroll.clientWidth - 48);
    var availH = Math.max(120, root.scroll.clientHeight - 48);
    root.zoom = Math.max(0.15, Math.min(availW / w, availH / h));
    applyZoom();
    return root.zoom;
  }

  function setZoom(next) {
    root.zoom = Math.max(0.15, Math.min(3, next));
    applyZoom();
    return root.zoom;
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
    root.onSelect = options.onSelect || function () {};
    root.onChange = options.onChange || function () {};
    root.onCommit = options.onCommit || function () {};
    root.stage.addEventListener('pointerdown', onPointerDown);
    global.addEventListener('pointermove', onPointerMove);
    global.addEventListener('pointerup', onPointerUp);
    global.addEventListener('pointercancel', onPointerUp);
  }

  CertGen.Editor = {
    init: init,
    setTemplate: setTemplate,
    setFields: function (fields, selectedId) {
      root.fields = fields || [];
      if (selectedId !== undefined) root.selectedId = selectedId;
      renderFields();
    },
    setRow: function (row) {
      root.row = row || null;
      renderFields();
    },
    setInteractive: function (value) {
      root.interactive = !!value;
      if (root.stage) root.stage.classList.toggle('is-locked', !root.interactive);
    },
    setZoom: setZoom,
    getZoom: function () { return root.zoom; },
    fitToScreen: fitToScreen,
    selectedId: function () { return root.selectedId; }
  };
  global.CertGen = CertGen;
})(typeof globalThis !== 'undefined' ? globalThis : window);
