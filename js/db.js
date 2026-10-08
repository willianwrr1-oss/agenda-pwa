/* Armazenamento: IndexedDB (com cópia em memória). Se falhar, usa localStorage. */
(function (root) {
  var STORES = ['activities', 'notes', 'sounds'];
  var mem = { activities: new Map(), notes: new Map(), sounds: new Map() };
  var db = null, seq = 0, useLS = false;

  function newId() { seq = (seq + 1) % 1000; return Date.now() * 1000 + seq; }

  function openIDB() {
    return new Promise(function (res, rej) {
      if (!root.indexedDB) return rej(new Error('no idb'));
      var r = root.indexedDB.open('agenda-db', 1);
      r.onupgradeneeded = function () { STORES.forEach(function (s) { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(new Error('blocked')); };
    });
  }
  function readAll(store) {
    return new Promise(function (res, rej) {
      var q = db.transaction(store, 'readonly').objectStore(store).getAll();
      q.onsuccess = function () { res(q.result); };
      q.onerror = function () { rej(q.error); };
    });
  }
  function lsSave(store) {
    if (store === 'sounds') return;
    try { localStorage.setItem('agenda.ls.' + store, JSON.stringify(Array.from(mem[store].values()))); } catch (e) {}
  }

  function init() {
    return openIDB().then(function (d) {
      db = d;
      return Promise.all(STORES.map(function (s) { return readAll(s).then(function (rows) { rows.forEach(function (r) { mem[s].set(r.id, r); }); }); }));
    }).catch(function () {
      useLS = true;
      ['activities', 'notes'].forEach(function (s) {
        try { (JSON.parse(localStorage.getItem('agenda.ls.' + s) || '[]')).forEach(function (r) { mem[s].set(r.id, r); }); } catch (e) {}
      });
    });
  }

  function tx(store, fn) {
    if (useLS || !db) { lsSave(store); return Promise.resolve(); }
    return new Promise(function (res, rej) {
      var t = db.transaction(store, 'readwrite');
      fn(t.objectStore(store));
      t.oncomplete = function () { res(); };
      t.onerror = function () { rej(t.error); };
      t.onabort = function () { rej(t.error); };
    });
  }

  var DB = {
    init: init,
    newId: newId,
    all: function (store) { return Array.from(mem[store].values()); },
    get: function (store, id) { return mem[store].get(id) || null; },
    put: function (store, obj) {
      if (!obj.id) obj.id = newId();
      mem[store].set(obj.id, obj);
      return tx(store, function (os) { os.put(obj); }).then(function () { return obj; });
    },
    del: function (store, id) {
      mem[store].delete(id);
      return tx(store, function (os) { os.delete(id); });
    },
    replaceAll: function (store, rows) {
      mem[store].clear();
      rows.forEach(function (r) { mem[store].set(r.id, r); });
      return tx(store, function (os) { os.clear(); rows.forEach(function (r) { os.put(r); }); });
    },
    usingFallback: function () { return useLS; }
  };
  root.DB = DB;
})(typeof self !== 'undefined' ? self : this);
