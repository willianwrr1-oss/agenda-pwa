/* Service worker: funciona offline + ações das notificações */
var VERSION = 'agenda-v2.0.0';
var CORE = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/badge.png',
  'js/version.js', 'js/i18n.js', 'js/logic.js', 'js/db.js', 'js/store.js', 'js/sound.js', 'js/ui.js', 'js/calendar.js', 'js/notes.js', 'js/engine.js', 'js/app.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// rede primeiro (sempre a versão mais nova); cache quando offline
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
  }));
});

self.addEventListener('notificationclick', function (e) {
  var n = e.notification, d = n.data || {}, action = e.action;
  n.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    var msg = d.kind === 'note' ? { type: 'note', id: d.id } : { type: 'act', action: action || 'open', id: d.id };
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if ('focus' in c) { c.postMessage(msg); return c.focus(); }
    }
    var url = './' + (d.kind === 'note' ? '?go=notes' : '?act=' + encodeURIComponent(action || 'open') + '&id=' + encodeURIComponent(d.id));
    return self.clients.openWindow(url);
  }));
});
