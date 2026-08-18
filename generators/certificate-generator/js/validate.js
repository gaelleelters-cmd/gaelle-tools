(function attachCertValidate(global) {
  'use strict';

  var CertGen = global.CertGen || {};

  function rowLabel(row, index) {
    if (row && row.__excelRow) return 'Row ' + row.__excelRow;
    return 'Row ' + (index + 2);
  }

  function displayName(row, fields) {
    var Format = CertGen.Format;
    var preferred = ['Name', 'Full Name', 'Recipient', 'Participant Name'];
    var i;
    for (i = 0; i < preferred.length; i += 1) {
      var value = Format.lookupRow(row, preferred[i]);
      if (!Format.isBlank(value)) return Format.stringifyValue(value);
    }
    for (i = 0; i < (fields || []).length; i += 1) {
      var field = fields[i];
      if (!field.excelColumn) continue;
      var mapped = Format.lookupRow(row, field.excelColumn);
      if (!Format.isBlank(mapped)) return Format.formatFieldValue(mapped, field);
    }
    return rowLabel(row, 0);
  }

  function validate(rows, columns, fields, options) {
    var Format = CertGen.Format;
    var opts = options || {};
    var mapped = (fields || []).filter(function (field) {
      return field && String(field.excelColumn || '').trim() !== '';
    });
    var missingColumns = [];
    mapped.forEach(function (field) {
      if ((columns || []).indexOf(field.excelColumn) === -1 && missingColumns.indexOf(field.excelColumn) === -1) {
        missingColumns.push(field.excelColumn);
      }
    });

    var valid = [];
    var invalid = [];
    var emptySkipped = 0;

    (rows || []).forEach(function (row, index) {
      var mappedCols = mapped.map(function (field) { return field.excelColumn; });
      if (CertGen.Excel.isEmptyRow(row, columns)) {
        emptySkipped += 1;
        return;
      }

      var errors = [];
      mapped.forEach(function (field) {
        var raw = Format.lookupRow(row, field.excelColumn);
        var required = field.required !== false;
        if (Format.isBlank(raw) && required) {
          errors.push(rowLabel(row, index) + ' is missing "' + field.excelColumn + '".');
          return;
        }
        if (Format.isBlank(raw)) return;
        if (field.type === 'date' && !Format.parseDate(raw)) {
          errors.push(
            'Unable to generate a certificate for ' + rowLabel(row, index) +
            ' because the Date value is invalid.'
          );
        }
        if ((field.type === 'number' || field.type === 'currency') && Format.parseNumber(raw) == null) {
          errors.push(
            'Unable to generate a certificate for ' + rowLabel(row, index) +
            ' because the ' + field.label + ' value is not a valid number.'
          );
        }
        if (field.type === 'email') {
          var email = String(raw).trim();
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.push(rowLabel(row, index) + ' has an invalid email address.');
          }
        }
      });

      if (errors.length) {
        invalid.push({
          row: row,
          index: index,
          excelRow: row.__excelRow || index + 2,
          name: displayName(row, fields),
          errors: errors,
          message: errors[0]
        });
        return;
      }

      valid.push({
        row: row,
        index: index,
        excelRow: row.__excelRow || index + 2,
        name: displayName(row, fields)
      });
    });

    var detected = (rows || []).length;
    return {
      columns: columns || [],
      mappedCount: mapped.length,
      missingColumns: missingColumns,
      detected: detected,
      emptySkipped: emptySkipped,
      valid: valid,
      invalid: invalid,
      validCount: valid.length,
      invalidCount: invalid.length,
      canGenerate: missingColumns.length === 0 && mapped.length > 0 && (valid.length > 0 || (opts.allowInvalid && invalid.length > 0)),
      summaryLines: [
        detected + ' rows detected',
        valid.length + ' valid',
        invalid.length + ' invalid'
      ]
    };
  }

  CertGen.Validate = {
    validate: validate,
    displayName: displayName,
    rowLabel: rowLabel
  };
  global.CertGen = CertGen;
  if (typeof module !== 'undefined' && module.exports) module.exports = CertGen.Validate;
})(typeof globalThis !== 'undefined' ? globalThis : window);
