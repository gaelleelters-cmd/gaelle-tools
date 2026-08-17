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
      required: true
    };
  }

  function createField(partial, existingCount) {
    var field = defaults();
    var offset = Math.min(existingCount || 0, 6) * 3;
    field.y = Math.min(78, field.y + offset);
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
    defaults: defaults
  };
  global.CertGen = CertGen;
  if (typeof module !== 'undefined' && module.exports) module.exports = CertGen.Fields;
})(typeof globalThis !== 'undefined' ? globalThis : window);
