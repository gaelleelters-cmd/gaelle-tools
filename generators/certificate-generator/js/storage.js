(function attachCertStorage(global) {
  'use strict';

  var CertGen = global.CertGen || {};
  var DB_NAME = 'gaelle-certgen';
  var STORE = 'configs';
  var VERSION = 1;

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error('This browser cannot save templates locally.'));
        return;
      }
      var req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(new Error('Unable to open saved templates.')); };
    });
  }

  function idbReq(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () {
        reject(new Error('Unable to update saved templates.'));
      };
    });
  }

  function withStore(mode, fn) {
    return openDb().then(function (db) {
      var tx = db.transaction(STORE, mode);
      var store = tx.objectStore(STORE);
      return idbReq(fn(store)).then(function (value) {
        db.close();
        return value;
      }, function (err) {
        try { db.close(); } catch (e) {}
        throw err;
      });
    });
  }

  function listConfigs() {
    return withStore('readonly', function (store) {
      return store.getAll();
    }).then(function (rows) {
      return (rows || []).sort(function (a, b) {
        return (b.savedAt || 0) - (a.savedAt || 0);
      }).map(function (row) {
        return {
          id: row.id,
          name: row.name,
          savedAt: row.savedAt,
          templateName: row.template && row.template.name
        };
      });
    }).catch(function () {
      return [];
    });
  }

  function saveConfig(payload) {
    var record = {
      id: payload.id || ('cfg_' + Date.now().toString(36)),
      name: String(payload.name || 'Certificate setup').trim() || 'Certificate setup',
      savedAt: Date.now(),
      template: payload.template,
      fields: payload.fields || [],
      filenamePattern: payload.filenamePattern || '{Name}_Certificate',
      outputFormat: payload.outputFormat || 'pdf'
    };
    return withStore('readwrite', function (store) {
      return store.put(record);
    }).then(function () {
      return { id: record.id, name: record.name, savedAt: record.savedAt };
    });
  }

  function loadConfig(id) {
    return withStore('readonly', function (store) {
      return store.get(id);
    });
  }

  function deleteConfig(id) {
    return withStore('readwrite', function (store) {
      return store.delete(id);
    });
  }

  CertGen.Storage = {
    listConfigs: listConfigs,
    saveConfig: saveConfig,
    loadConfig: loadConfig,
    deleteConfig: deleteConfig
  };
  global.CertGen = CertGen;
})(typeof globalThis !== 'undefined' ? globalThis : window);
