/* Motor de avisos: verifica horários, toca som, vibra, mostra pop-up e notificação */
(function (root) {
  var $ = UI.$, h = UI.h;
  var MISS_MS = 3 * 60 * 1000;           // acima disso o aviso vai para "perdidos"
  var queue = [];                        // pop-ups aguardando
  var cur = null;                        // {a, at, snd, vib, el}
  var timer = null;
  var onChange = function () {};

  /* ---------- notificações ---------- */
  function perm() { return ('Notification' in root) ? Notification.permission : 'unsupported'; }
  function askNotif() {
    if (!('Notification' in root)) return Promise.resolve('unsupported');
    if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
    try { return Promise.resolve(Notification.requestPermission()).then(function (p) { onChange(); return p; }); } catch (e) { return Promise.resolve('default'); }
  }
  function notify(title, body, o) {
    if (perm() !== 'granted') return Promise.resolve(false);
    o = o || {};
    var opt = { body: body || '', icon: 'icons/icon-192.png', badge: 'icons/badge.png', tag: o.tag, renotify: !!o.tag,
      requireInteraction: !!o.sticky, vibrate: o.vibrate || [500, 200, 500], data: o.data || {}, actions: o.actions || [], silent: false, timestamp: Date.now() };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      return navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification(title, opt); }).then(function () { return true; }).catch(function () { return false; });
    }
    try { new Notification(title, opt); return Promise.resolve(true); } catch (e) { return Promise.resolve(false); }
  }
  function closeNotif(tag) {
    if (!navigator.serviceWorker || !navigator.serviceWorker.ready) return;
    navigator.serviceWorker.ready.then(function (reg) { return reg.getNotifications({ tag: tag }); })
      .then(function (l) { l.forEach(function (n) { n.close(); }); }).catch(function () {});
  }

  /* ---------- ações sobre atividades ---------- */
  function real(a) { return a && DB.get('activities', a.id); }
  function snooze(a, min) {
    var r = real(a); if (r) { r.snoozeUntil = Date.now() + min * 60000; DB.put('activities', r); }
    UI.toast(t('toast_snoozed', min)); closeNotif('act-' + a.id); onChange();
  }
  function keep(a) {
    var r = real(a); if (r) { r.snoozeUntil = null; DB.put('activities', r); }
    UI.toast(t('toast_kept')); closeNotif('act-' + a.id); onChange();
  }
  function complete(a) {
    var r = real(a); if (r) { r.done = true; r.doneAt = Date.now(); r.snoozeUntil = null; DB.put('activities', r); }
    UI.toast(t('toast_completed')); closeNotif('act-' + a.id); onChange();
  }

  /* ---------- pop-up de alarme ---------- */
  function soundIdFor(a) {
    return a.sound === false ? null : (a.soundId || Settings.get().defaultSound || 'tone:classic');
  }
  function startFeedback() {
    stopFeedback();
    var id = soundIdFor(cur.a);
    if (id) cur.snd = Sound.play(id, Settings.get().defaultSound);
    cur.vib = Sound.vibrateLoop();
  }
  function stopFeedback() {
    if (!cur) return;
    if (cur.snd) { cur.snd.stop(); cur.snd = null; }
    if (cur.vib) { cur.vib.stop(); cur.vib = null; }
  }

  function enqueue(a, at) {
    queue.push({ a: a, at: at });
    if (!cur) next();
    else renderRing();
  }
  function next() {
    cur = queue.shift() || null;
    if (!cur) { var e = $('#ring'); if (e) e.remove(); return; }
    renderRing(); startFeedback();
  }
  function finish() { stopFeedback(); var id = cur && cur.a.id; cur = null; next(); return id; }

  function renderRing() {
    var layer = $('#layer'), old = $('#ring');
    if (old) old.remove();
    if (!cur) return;
    var a = cur.a, d = new Date(cur.at);
    var box = h('div', { class: 'ring-card' }, [
      h('div', { class: 'ring-label', text: t('popup_label') }),
      queue.length ? h('div', { class: 'ring-n', text: t('ring_n', queue.length) }) : null,
      h('div', { class: 'ring-time', text: t('popup_scheduled_for', UI.hm(d)) }),
      h('div', { class: 'ring-title', text: a.title }),
      a.description ? h('div', { class: 'ring-desc', text: a.description }) : null,
      h('button', { type: 'button', class: 'btn btn-pri block lg', text: t('popup_snooze_5'), onclick: function () { var x = cur.a; finish(); snooze(x, 5); } }),
      h('button', { type: 'button', class: 'btn btn-ghost block', text: t('popup_more'), onclick: function () { snoozeChoice(); } }),
      h('button', { type: 'button', class: 'btn btn-sec block', text: t('action_done'), onclick: function () { var x = cur.a; finish(); complete(x); } }),
      h('button', { type: 'button', class: 'btn btn-ghost block', text: t('popup_keep'), onclick: function () { var x = cur.a; finish(); keep(x); } }),
      h('p', { class: 'muted small center', text: t('popup_keep_help') })
    ]);
    layer.appendChild(h('div', { id: 'ring', class: 'ring' }, [box]));
  }
  function snoozeChoice() {
    var a = cur.a, dlg;
    var body = h('div', { class: 'snooze-list' });
    [5, 10, 15, 20].forEach(function (m) {
      body.appendChild(h('button', { type: 'button', class: 'btn btn-ghost block', text: t('minutes_n', m), onclick: function () { dlg.close(); if (cur && cur.a === a) { finish(); snooze(a, m); } } }));
    });
    dlg = UI.dialog({ title: t('snooze_title'), body: body, cls: 'small' });
  }

  /* ---------- disparo ---------- */
  function fireActivity(a, at, silentNotif) {
    enqueue(a, at);
    if (!silentNotif || true) {
      notify(a.title, (a.description ? a.description + '\n' : '') + t('notif_time', UI.hm(new Date(at))), {
        tag: 'act-' + a.id, sticky: true, vibrate: [700, 300, 700, 300, 700], data: { id: a.id, kind: 'act' },
        actions: [{ action: 'done', title: t('action_done') }, { action: 'snooze5', title: t('notif_snooze5') }]
      });
    }
  }

  function showMissed(list) {
    var body = h('div', null, [h('p', { class: 'muted small', text: t('missed_banner') })]);
    list.sort(function (x, y) { return x.at - y.at; }).forEach(function (m) {
      body.appendChild(h('div', { class: 'missed-item' }, [h('b', { text: UI.hm(new Date(m.at)) + '  ' + UI.dm(new Date(m.at)) }), h('span', { text: ' ' + m.a.title })]));
    });
    UI.dialog({ title: t('missed_title'), body: body, buttons: [{ label: t('action_ok'), cls: 'btn-pri' }] });
  }

  function tick() {
    var now = Date.now(), ring = [], missed = [];
    DB.all('activities').forEach(function (a) {
      if (a.done) return;
      var at = 0;
      if (a.snoozeUntil && a.snoozeUntil <= now) { at = a.snoozeUntil; a.snoozeUntil = null; }
      var last = Logic.lastUpTo(a, a.ackAt || 0, now);
      if (last) { a.ackAt = last.getTime(); at = Math.max(at, last.getTime()); }
      if (at) { DB.put('activities', a); (now - at <= MISS_MS ? ring : missed).push({ a: a, at: at }); }
    });
    DB.all('notes').forEach(function (n) {
      if (n.reminder && !n.reminderFired && n.reminder <= now) {
        n.reminderFired = true; DB.put('notes', n);
        var body = n.title ? (n.text || '') : (n.text || '').slice(0, 140);
        notify(n.title || (n.text || t('note_untitled')).slice(0, 60), body.slice(0, 200), { tag: 'note-' + n.id, sticky: false, data: { kind: 'note', id: n.id } });
        if (now - n.reminder <= MISS_MS) { UI.toast('🔔 ' + (n.title || (n.text || '').slice(0, 60) || t('note_reminder_title')), 5000); Sound.buzz([300, 150, 300]); }
        if (UI.current() === 'notes' && root.Notes) Notes.render();
      }
    });
    ring.sort(function (x, y) { return x.at - y.at; }).forEach(function (m) { fireActivity(m.a, m.at); });
    if (missed.length) showMissed(missed);
    if (ring.length || missed.length) onChange();
  }

  function start(cb) {
    onChange = cb || onChange;
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { tick(); if (cur && !cur.snd && !cur.vib) startFeedback(); }
    });
    root.addEventListener('focus', tick);
    root.addEventListener('pageshow', tick);
    var unlock = function () { Sound.unlock(); };
    document.addEventListener('pointerdown', unlock, { once: true });
    tick();
  }

  /* ---------- testes ---------- */
  function fakeAct(title) {
    return { id: -Date.now(), title: title, description: t('test_body'), sound: true, soundId: null };
  }
  function testNow() { fireActivity(fakeAct(t('test_alarm_title')), Date.now()); }
  function testScheduled(silent) {
    UI.toast(t('toast_test_scheduled'), 3500);
    setTimeout(function () {
      var a = fakeAct(silent ? t('test_alert_title') : t('test_alarm_title'));
      if (silent) { a.sound = false; }
      fireActivity(a, Date.now());
    }, 10000);
  }

  /* ação vinda da notificação */
  function handleAction(action, id) {
    var a = DB.get('activities', Number(id)); if (!a) return;
    closeNotif('act-' + id);
    if (cur && cur.a.id === a.id) finish();
    queue = queue.filter(function (q) { return q.a.id !== a.id; });
    if (action === 'done') complete(a);
    else if (action === 'snooze5') snooze(a, 5);
    else if (action === 'keep') keep(a);
    else { enqueue(a, a.ackAt || Date.now()); }
    onChange();
  }

  root.Engine = { start: start, tick: tick, perm: perm, askNotif: askNotif, notify: notify, testNow: testNow, testScheduled: testScheduled,
    handleAction: handleAction, onChange: function (f) { onChange = f; } };
})(window);
