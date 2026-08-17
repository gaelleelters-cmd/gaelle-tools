(function attachCertHistory(global) {
  'use strict';

  var CertGen = global.CertGen || {};

  function create(limit) {
    var max = limit || 60;
    var past = [];
    var future = [];
    var current = '[]';

    function snapshot(state) {
      return JSON.stringify(state);
    }

    return {
      reset: function (state) {
        past = [];
        future = [];
        current = snapshot(state);
      },
      push: function (state) {
        var next = snapshot(state);
        if (next === current) return false;
        past.push(current);
        if (past.length > max) past.shift();
        current = next;
        future = [];
        return true;
      },
      undo: function () {
        if (!past.length) return null;
        future.push(current);
        current = past.pop();
        return JSON.parse(current);
      },
      redo: function () {
        if (!future.length) return null;
        past.push(current);
        current = future.pop();
        return JSON.parse(current);
      },
      canUndo: function () { return past.length > 0; },
      canRedo: function () { return future.length > 0; }
    };
  }

  CertGen.History = { create: create };
  global.CertGen = CertGen;
  if (typeof module !== 'undefined' && module.exports) module.exports = CertGen.History;
})(typeof globalThis !== 'undefined' ? globalThis : window);
