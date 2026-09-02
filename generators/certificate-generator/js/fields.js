(function attachCertFields(global) {
  'use strict';

  var CertGen = global.CertGen || {};

  var FIELD_TYPES = [
    { id: 'text', label: 'Text' },
    { id: 'date', label: 'Date' },
    { id: 'number', label: 'Number' },
    { id: 'currency', label: 'Currency' },
    { id: 'id', label: 'ID' },
    { id: 'email', label: 'Email' }
  ];

  var FONT_FAMILIES = [
    'Georgia',
    'Times New Roman',
    'Garamond',
    'Palatino Linotype',
    'Playfair Display',
    'Cinzel',
    'EB Garamond',
    'Great Vibes',
    'Tangerine',
    'Outfit',
    'Arial',
    'Calibri',
    'Trebuchet MS',
    'Courier New'
  ];

  var CURRENCIES = [
    { id: 'USD', label: '$1,000' },
    { id: 'EUR', label: '€1,000' },
    { id: 'GBP', label: '£1,000' },
    { id: 'AED', label: '1,000 AED' },
    { id: 'none', label: '1,000 (no symbol)' }
  ];

  function uid() {
    return 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function isScriptFamily(name) {
    return /vibes|tangerine|script|allura|pinyon|snell|edwardian|cursive/i.test(String(name || ''));
  }

  function defaults() {
    return {
      id: uid(),
      label: 'Recipient Name',
      excelColumn: '',
      type: 'text',
      x: 20,
      y: 42,
      width: 60,
      height: 8,
      fontFamily: 'Georgia',
      fontSize: 28,
      fontWeight: 'normal',
      fontStyle: 'normal',
      alignment: 'center',
      textColor: '#1a1a1a',
      autoFit: true,
      minimumFontSize: 14,
      dateFormat: 'DD MMMM YYYY',
      numberDecimals: 0,
      currency: 'USD',
      coverExistingText: false,
      coverColor: '#ffffff',
      required: true,
      styleSource: 'custom',
      referenceText: '',
      referenceItemId: '',
      capitalization: 'as-is',
      rotation: 0,
      lineHeight: 1.2,
      letterSpacing: 0,
      referenceStyle: null,
      coverX: null,
      coverY: null,
      coverWidth: null,
      coverHeight: null
    };
  }

  function pickColumn(columns, kind) {
    var cols = columns || [];
    var re = kind === 'date' ? /date/i : /name/i;
    var i;
    for (i = 0; i < cols.length; i += 1) {
      if (re.test(cols[i])) return cols[i];
    }
    return '';
  }

  function looksLikeNameField(field) {
    if (!field || field.type === 'date') return false;
    return /name|recipient/i.test(field.label || '') || /name/i.test(field.excelColumn || '');
  }

  function looksLikeDateField(field) {
    if (!field) return false;
    return field.type === 'date' || /date/i.test(field.label || '') || /date/i.test(field.excelColumn || '');
  }

  function suggestAddedField(fields, columns) {
    var list = fields || [];
    if (!list.some(looksLikeNameField)) {
      return {
        label: 'Recipient Name',
        type: 'text',
        excelColumn: pickColumn(columns, 'name'),
        x: 12,
        y: 32,
        width: 76,
        height: 16,
        alignment: 'center',
        capitalization: 'title',
        lineHeight: 1.35
      };
    }
    if (!list.some(looksLikeDateField)) {
      return {
        label: 'Completion Date',
        type: 'date',
        dateFormat: 'MMMM YYYY',
        excelColumn: pickColumn(columns, 'date'),
        x: 32,
        y: 88,
        width: 36,
        height: 5,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fontSize: 22,
        alignment: 'center',
        capitalization: 'as-is'
      };
    }
    return {
      label: 'Field ' + (list.length + 1),
      type: 'text',
      x: 20,
      y: Math.min(70, 50 + list.length),
      width: 60,
      height: 8
    };
  }

  function applyTypeChange(field, nextType, columns) {
    var previous = field.type;
    if (previous === nextType) return field;
    field.type = nextType;
    if (nextType === 'date') {
      if (!field.label || field.label === 'Recipient Name' || /^Field \d+$/i.test(field.label)) {
        field.label = 'Completion Date';
      }
      if (!field.excelColumn || (/name/i.test(field.excelColumn) && !/date/i.test(field.excelColumn))) {
        var dateCol = pickColumn(columns, 'date');
        if (dateCol) field.excelColumn = dateCol;
      }
      if (!field.dateFormat || field.dateFormat === 'DD MMMM YYYY') {
        field.dateFormat = 'MMMM YYYY';
      }
      if ((Number(field.y) + Number(field.height) / 2) < 72) {
        field.x = 32;
        field.y = 88;
        field.width = 36;
        field.height = 5;
      }
    }
    return field;
  }

  function createField(partial, existingCount) {
    var field = defaults();
    if (!(partial && partial.y != null)) {
      field.y = Math.min(78, field.y + Math.min(existingCount || 0, 6) * 3);
    }
    if (partial) {
      Object.keys(partial).forEach(function (key) {
        if (partial[key] !== undefined) field[key] = partial[key];
      });
    }
    if (!field.id) field.id = uid();
    return field;
  }

  function cloneFields(fields) {
    return JSON.parse(JSON.stringify(fields || []));
  }

  function mappedFields(fields) {
    return (fields || []).filter(function (field) {
      return field && String(field.excelColumn || '').trim() !== '';
    });
  }

  CertGen.Fields = {
    FIELD_TYPES: FIELD_TYPES,
    FONT_FAMILIES: FONT_FAMILIES,
    CURRENCIES: CURRENCIES,
    createField: createField,
    cloneFields: cloneFields,
    mappedFields: mappedFields,
    defaults: defaults,
    isScriptFamily: isScriptFamily,
    suggestAddedField: suggestAddedField,
    applyTypeChange: applyTypeChange
  };
  global.CertGen = CertGen;
  if (typeof module !== 'undefined' && module.exports) module.exports = CertGen.Fields;
})(typeof globalThis !== 'undefined' ? globalThis : window);
