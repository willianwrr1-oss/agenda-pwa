/* Agenda de Atividades – PWA. Tela principal, listas, configurações, instalação, backup. */
(function (root) {
  var $ = UI.$, h = UI.h;
  var S, edit = null, formSound = null /* null = padrão do app */, dayFilter = null, deferredInstall = null, wakeLock = null;

  /* ================= tema ================= */
  function applyTheme() {
    var r = document.documentElement.style;
    r.setProperty('--pri', S.pri); r.setProperty('--sec', S.sec);
    if (S.mode === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', S.mode);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', S.pri);
  }

  /* ================= formulário ================= */
  function defaultTime() { var d = new Date(Date.now() + 3600000); return UI.pad(d.getHours()) + ':00'; }
  function initForm() {
    var now = new Date();
    $('#f-date').value = Logic.ymd(now); $('#f-time').value = defaultTime();
    updatePickLabels(); updateSoundLabel();
  }
  function updatePickLabels() {
    var d = $('#f-date').value, tm = $('#f-time').value;
    $('#lbl-date').textContent = d ? UI.dmy(Logic.parseYmd(d)) : t('btn_date');
    $('#lbl-time').textContent = tm || t('btn_time');
  }
  function soundName(id) {
    if (!id) return null;
    if (id.indexOf('tone:') === 0) return t('tone_' + id.slice(5));
    var r = DB.get('sounds', Number(id.slice(5))); return r ? r.name : null;
  }
  function updateSoundLabel() {
    var on = $('#f-sound').checked;
    $('#sound-row').hidden = !on;
    var def = soundName(S.defaultSound) || t('tone_classic');
    $('#lbl-sound').textContent = formSound ? t('sound_label_named', soundName(formSound) || '') : t('sound_label_app_default_named', def);
  }

  function resetForm() {
    edit = null; formSound = null;
    $('#f-title').value = ''; $('#f-desc').value = ''; $('#f-repeat').value = 'none'; $('#f-sound').checked = true;
    initForm();
    $('#btn-add').textContent = t('btn_add_activity'); $('#btn-cancel-edit').hidden = true;
  }
  function loadForEdit(a) {
    edit = a.id;
    $('#f-title').value = a.title; $('#f-desc').value = a.description || ''; $('#f-date').value = a.date; $('#f-time').value = a.time;
    $('#f-repeat').value = a.repeat || 'none'; $('#f-sound').checked = a.sound !== false; formSound = a.soundId || null;
    updatePickLabels(); updateSoundLabel();
    $('#btn-add').textContent = t('btn_save_changes'); $('#btn-cancel-edit').hidden = false;
    $('#scr-main .scroll').scrollTo({ top: 0, behavior: 'smooth' });
    $('#f-title').focus();
  }

  function saveActivity() {
    var title = $('#f-title').value.trim();
    if (!title) { UI.toast(t('err_enter_name')); $('#f-title').focus(); return; }
    var date = $('#f-date').value, tm = $('#f-time').value;
    if (!date) date = Logic.ymd(new Date());
    if (!tm) tm = defaultTime();
    var a = edit ? DB.get('activities', edit) : { id: DB.newId(), done: false, createdAt: Date.now() };
    a.title = title; a.description = $('#f-desc').value.trim(); a.date = date; a.time = tm;
    a.repeat = $('#f-repeat').value; a.sound = $('#f-sound').checked; a.soundId = formSound;
    a.soundName = formSound ? soundName(formSound) : null;
    a.snoozeUntil = null; a.ackAt = Date.now(); a.done = false; a.doneAt = null;
    DB.put('activities', a);
    var future = !!Logic.next(a, Date.now());
    UI.toast(future ? t('toast_saved_ok') : t('toast_saved_past'));
    if (future) Engine.askNotif().then(renderAll);
    resetForm(); renderAll();
  }

  /* ================= listas ================= */
  function repLabel(a) { return a.repeat && a.repeat !== 'none' ? t('rep_' + a.repeat) : ''; }

  function itemCard(a, done) {
    var now = Date.now();
    var d = Logic.atTime(a.date, a.time);
    var info = t('info_datetime', UI.dmy(d), a.time) + (repLabel(a) ? '  ·  ' + repLabel(a) : '');
    var lines = [h('div', { class: 'it-title', text: a.title })];
    if (a.description) lines.push(h('div', { class: 'it-desc', text: a.description }));
    lines.push(h('div', { class: 'it-info', text: info }));
    if (a.sound !== false) lines.push(h('div', { class: 'it-info', text: a.soundName ? t('info_alarm_named', a.soundName) : t('info_alarm') }));
    if (done) lines.push(h('div', { class: 'it-info ok', text: t('item_done_at', UI.fmtDone(a.doneAt || now)) }));
    else if (Logic.isOverdue(a, now)) lines.push(h('div', { class: 'it-info bad', text: t('item_overdue') }));
    else {
      var nx = a.snoozeUntil ? new Date(a.snoozeUntil) : Logic.next(a, now);
      if (nx) lines.push(h('div', { class: 'it-info next', text: t('item_next_alert', UI.fmtNext(nx)) }));
    }
    var trashSvg = '<svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
    var okSvg = '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
    var reopenSvg = '<svg viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.6-3.6A8 8 0 0 1 12.5 10c3.5 0 6.5 2.3 7.6 5.5l2.4-.8C21.2 10.8 17.2 8 12.5 8z"/></svg>';
    var btns = h('div', { class: 'it-btns' }, [
      h('button', { type: 'button', class: 'icon-btn ok', title: done ? t('cd_reopen') : t('cd_complete_activity'), 'aria-label': done ? t('cd_reopen') : t('cd_complete_activity'), html: done ? reopenSvg : okSvg,
        onclick: function (e) { e.stopPropagation(); done ? reopen(a) : completeAsk(a); } }),
      h('button', { type: 'button', class: 'icon-btn del', title: t('action_delete'), 'aria-label': t('action_delete'), html: trashSvg,
        onclick: function (e) { e.stopPropagation(); deleteAsk(a, done); } })
    ]);
    var card = h('div', { class: 'item' + (done ? ' done' : '') }, [h('div', { class: 'it-main' }, lines), btns]);
    if (!done) card.addEventListener('click', function () { loadForEdit(a); });
    return card;
  }

  function renderList() {
    var now = Date.now(), q = $('#f-search').value, host = $('#list');
    var list = DB.all('activities').filter(function (a) { return !a.done && Logic.matches(a, q) && (!dayFilter || Logic.occursOn(a, Logic.parseYmd(dayFilter))); });
    list.sort(function (x, y) { return Logic.sortKey(x, now) - Logic.sortKey(y, now); });
    host.innerHTML = '';
    if (!list.length) host.appendChild(h('p', { class: 'empty', text: q ? t('empty_not_found') : dayFilter ? t('empty_day') : t('empty_pending') }));
    list.forEach(function (a) { host.appendChild(itemCard(a, false)); });
    var chip = $('#day-chip'); chip.hidden = !dayFilter;
    if (dayFilter) $('#day-chip-txt').textContent = t('filter_showing_day', UI.dmy(Logic.parseYmd(dayFilter)));
  }
  function renderDone() {
    var q = $('#f-search-done').value, host = $('#list-done');
    var list = DB.all('activities').filter(function (a) { return a.done && Logic.matches(a, q); }).sort(function (x, y) { return (y.doneAt || 0) - (x.doneAt || 0); });
    host.innerHTML = '';
    if (!list.length) host.appendChild(h('p', { class: 'empty', text: q ? t('empty_not_found') : t('empty_completed') }));
    list.forEach(function (a) { host.appendChild(itemCard(a, true)); });
  }
  function renderBanner() {
    $('#notif-banner').hidden = !(Engine.perm() === 'default');
  }
  function renderAll() {
    renderList(); renderDone(); renderBanner();
    if (UI.current() === 'calendar') Cal.render();
    if (UI.current() === 'settings') renderSettings();
  }

  /* ================= ações ================= */
  function completeAsk(a) {
    if (a.repeat && a.repeat !== 'none') {
      UI.confirm(t('dlg_complete_repeating', a.title, repLabel(a)), t('dlg_complete_title'), t('action_done')).then(function (ok) { if (ok) doComplete(a); });
    } else doComplete(a);
  }
  function doComplete(a) { a.done = true; a.doneAt = Date.now(); a.snoozeUntil = null; DB.put('activities', a); UI.toast(t('toast_completed')); if (edit === a.id) resetForm(); renderAll(); }
  function reopen(a) { a.done = false; a.doneAt = null; a.ackAt = Date.now(); a.snoozeUntil = null; DB.put('activities', a); UI.toast(t('toast_reopened')); renderAll(); }
  function deleteAsk(a, done) {
    UI.confirm(a.title, done ? t('dlg_delete_perm') : t('dlg_delete_title'), t('action_delete')).then(function (ok) {
      if (!ok) return; DB.del('activities', a.id); if (edit === a.id) resetForm(); renderAll();
    });
  }

  /* ================= escolha de som ================= */
  function soundChooser(opt) {
    var dlg, body = h('div', { class: 'sound-list' });
    var cur = opt.current;
    function row(label, id, extra) {
      var sel = (cur || null) === id;
      var r = h('div', { class: 'srow' + (sel ? ' sel' : '') }, [
        h('button', { type: 'button', class: 'srow-main', text: label, onclick: function () { Sound.stopPreview(); dlg.close(); opt.onPick(id); } })
      ]);
      if (id) r.appendChild(h('button', { type: 'button', class: 'btn btn-ghost sm', text: t('sound_preview'), onclick: function () { Sound.preview(id, 6000); } }));
      if (extra) r.appendChild(extra);
      return r;
    }
    if (opt.allowDefault) body.appendChild(row(t('sound_use_default_app'), null));
    body.appendChild(h('div', { class: 'lbl', text: t('sc_tones') }));
    Sound.TONES.forEach(function (n) { body.appendChild(row(t('tone_' + n), 'tone:' + n)); });
    var files = DB.all('sounds');
    if (files.length) body.appendChild(h('div', { class: 'lbl', text: t('sc_file') }));
    files.forEach(function (f) {
      var del = h('button', { type: 'button', class: 'icon-btn del sm', title: t('action_delete'), 'aria-label': t('action_delete'),
        html: '<svg viewBox="0 0 24 24"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>',
        onclick: function () { DB.del('sounds', f.id); dlg.close(); soundChooser(opt); } });
      body.appendChild(row(f.name, 'file:' + f.id, del));
    });
    var inp = h('input', { type: 'file', accept: 'audio/*', hidden: true, onchange: function () {
      var f = this.files[0]; if (!f) return;
      if (f.size > 25 * 1024 * 1024) { UI.toast(t('sc_error')); return; }
      UI.toast(t('sc_copying'));
      f.arrayBuffer().then(function (buf) {
        var rec = { id: DB.newId(), name: f.name.replace(/\.[^.]+$/, ''), type: f.type || 'audio/mpeg', data: buf };
        return DB.put('sounds', rec).then(function () { Sound.stopPreview(); dlg.close(); opt.onPick('file:' + rec.id); });
      }).catch(function () { UI.toast(t('sc_error')); });
    } });
    body.appendChild(inp);
    body.appendChild(h('button', { type: 'button', class: 'btn btn-sec block', text: t('sc_file'), onclick: function () { inp.click(); } }));
    dlg = UI.dialog({ title: t('sc_pick_title'), body: body, cls: 'tall', onClose: function () { Sound.stopPreview(); }, buttons: [{ label: t('action_close') }] });
  }

  /* ================= configurações ================= */
  function section(title) { return h('div', { class: 'card' }, title ? [h('h3', { text: title })] : []); }
  function radio(name, label, checked, onchange) {
    var i = h('input', { type: 'radio', name: name, onchange: onchange }); i.checked = checked;
    return h('label', { class: 'chk-row' }, [i, h('span', { text: label })]);
  }
  function colorRow(label, val, on) {
    return h('label', { class: 'color-row' }, [h('span', { text: label }), h('input', { type: 'color', value: val, oninput: function (e) { on(e.target.value); } })]);
  }
  function isStandalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }

  function renderSettings() {
    var host = $('#settings-body'), keep = host.scrollTop;
    host.innerHTML = '';

    var c = section(t('set_language'));
    [['pt', 'lang_pt'], ['en', 'lang_en'], ['es', 'lang_es']].forEach(function (l) {
      c.appendChild(radio('lang', t(l[1]), I18N.lang === l[0], function () { S.lang = l[0]; Settings.save(); I18N.set(l[0]); I18N.apply(); applyTheme(); initFormLabels(); renderAll(); Notes.render(); }));
    });
    host.appendChild(c);

    c = section(t('set_display_mode'));
    [['system', t('mode_system')], ['light', t('theme_light')], ['dark', t('mode_dark')]].forEach(function (m) {
      c.appendChild(radio('mode', m[1], S.mode === m[0], function () { S.mode = m[0]; Settings.save(); applyTheme(); }));
    });
    host.appendChild(c);

    c = section(t('set_app_colors'));
    c.appendChild(h('div', { class: 'lbl', text: t('set_ready_themes') }));
    var chips = h('div', { class: 'chips' });
    Object.keys(Settings.APP_PRESETS).forEach(function (k) {
      var p = Settings.APP_PRESETS[k];
      chips.appendChild(h('button', { type: 'button', class: 'preset', onclick: function () { S.pri = p[0]; S.sec = p[1]; Settings.save(); applyTheme(); renderSettings(); } }, [
        h('span', { class: 'dotpair', style: 'background:linear-gradient(135deg,' + p[0] + ' 50%,' + p[1] + ' 50%)' }), h('span', { text: t('preset_' + k) })]));
    });
    c.appendChild(chips);
    c.appendChild(h('div', { class: 'lbl', text: t('set_customize') }));
    c.appendChild(colorRow(t('set_color_primary'), S.pri, function (v) { S.pri = v; Settings.save(); applyTheme(); }));
    c.appendChild(colorRow(t('set_color_secondary'), S.sec, function (v) { S.sec = v; Settings.save(); applyTheme(); }));
    c.appendChild(h('button', { type: 'button', class: 'btn btn-ghost block', text: t('set_reset_colors'), onclick: function () { S.pri = Settings.DEF.pri; S.sec = Settings.DEF.sec; Settings.save(); applyTheme(); renderSettings(); } }));
    host.appendChild(c);

    c = section(t('set_sound_title'));
    c.appendChild(h('p', { class: 'muted small', text: t('sound_current', soundName(S.defaultSound) || t('tone_classic')) }));
    c.appendChild(h('button', { type: 'button', class: 'btn btn-sec block', text: t('set_pick_sound'), onclick: function () {
      soundChooser({ current: S.defaultSound, allowDefault: false, onPick: function (id) { S.defaultSound = id || 'tone:classic'; Settings.save(); renderSettings(); updateSoundLabel(); } }); } }));
    c.appendChild(h('button', { type: 'button', class: 'btn btn-ghost block', text: t('set_preview_sound'), onclick: function () { Sound.preview(S.defaultSound, 6000); } }));
    c.appendChild(h('p', { class: 'muted small', text: t('set_sound_hint') }));
    host.appendChild(c);

    c = section(t('set_alarms_title'));
    var np = Engine.perm();
    c.appendChild(h('div', { class: 'lbl', text: t('set_notifications') }));
    c.appendChild(h('p', { class: 'status ' + np, text: np === 'granted' ? t('notif_granted') : np === 'denied' ? t('notif_denied') : np === 'unsupported' ? t('notif_unsupported') : t('notif_default') }));
    if (np === 'default') c.appendChild(h('button', { type: 'button', class: 'btn btn-pri block', text: t('notif_enable'), onclick: function () { Engine.askNotif().then(renderAll); } }));
    c.appendChild(h('button', { type: 'button', class: 'btn btn-ghost block', text: t('set_test_now'), onclick: function () { Sound.unlock(); Engine.askNotif().then(function () { Engine.testNow(); }); } }));
    c.appendChild(h('button', { type: 'button', class: 'btn btn-ghost block', text: t('set_test_sched'), onclick: function () { Sound.unlock(); Engine.askNotif().then(function () { Engine.testScheduled(false); }); } }));
    c.appendChild(h('button', { type: 'button', class: 'btn btn-ghost block', text: t('set_test_sched_silent'), onclick: function () { Sound.unlock(); Engine.askNotif().then(function () { Engine.testScheduled(true); }); } }));
    var wl = h('input', { type: 'checkbox', onchange: function () { S.wakelock = this.checked; Settings.save(); updateWakeLock(); } }); wl.checked = !!S.wakelock;
    c.appendChild(h('label', { class: 'chk-row' }, [wl, h('span', { text: t('set_wakelock') })]));
    c.appendChild(h('p', { class: 'warn', text: t('warn_bg') }));
    host.appendChild(c);

    c = section(t('set_install'));
    if (isStandalone()) c.appendChild(h('p', { class: 'status granted', text: t('inst_already') }));
    else {
      if (deferredInstall) c.appendChild(h('button', { type: 'button', class: 'btn btn-pri block', text: t('set_install'), onclick: function () {
        deferredInstall.prompt(); deferredInstall.userChoice.finally(function () { deferredInstall = null; renderSettings(); }); } }));
      c.appendChild(h('p', { class: 'muted small', text: t('set_install_help') }));
    }
    host.appendChild(c);

    c = section(t('set_backup'));
    c.appendChild(h('p', { class: 'muted small', text: t('set_backup_help') }));
    c.appendChild(h('button', { type: 'button', class: 'btn btn-sec block', text: t('set_export'), onclick: exportBackup }));
    var fi = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: function () { importBackup(this.files[0]); this.value = ''; } });
    c.appendChild(fi);
    c.appendChild(h('button', { type: 'button', class: 'btn btn-ghost block', text: t('set_import'), onclick: function () { fi.click(); } }));
    var stat = h('p', { class: 'muted small', text: t('set_storage', '…') });
    c.appendChild(stat);
    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(function (p) { stat.textContent = t('set_storage', p ? t('yes') : t('no')); });
    host.appendChild(c);

    c = h('div', { class: 'about' }, [
      h('div', { text: t('app_name'), class: 'about-name' }),
      h('div', { text: t('about_version', APP_VERSION) }),
      h('div', { text: t('about_dev') }),
      h('div', { text: t('about_date', UI.dmy(Logic.parseYmd(APP_DATE))) })
    ]);
    host.appendChild(c);
    host.appendChild(h('div', { class: 'foot-space' }));
    host.scrollTop = keep;
  }

  /* ================= backup ================= */
  function b64(buf) {
    var bytes = new Uint8Array(buf), s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function unb64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  function exportBackup() {
    var data = { app: 'agenda-atividades', version: 2, exportedAt: new Date().toISOString(), settings: S,
      activities: DB.all('activities'), notes: DB.all('notes'),
      sounds: DB.all('sounds').map(function (s) { return { id: s.id, name: s.name, type: s.type, data: b64(s.data) }; }) };
    var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    var a = h('a', { href: URL.createObjectURL(blob), download: 'agenda-backup-' + Logic.ymd(new Date()) + '.json' });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    UI.toast(t('export_done'));
  }
  function importBackup(file) {
    if (!file) return;
    file.text().then(function (txt) {
      var d; try { d = JSON.parse(txt); } catch (e) { d = null; }
      if (!d || d.app !== 'agenda-atividades' || !Array.isArray(d.activities)) { UI.toast(t('import_err')); return; }
      UI.confirm(t('import_confirm'), t('set_import'), t('action_ok')).then(function (ok) {
        if (!ok) return;
        var acts = d.activities.filter(function (a) { return a && a.id && typeof a.title === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.date) && /^\d{2}:\d{2}$/.test(a.time); });
        var notes = (d.notes || []).filter(function (n) { return n && n.id; }).map(function (n) { n.html = Notes.sanitize(n.html); n.text = Notes.plain(n.html); return n; });
        var sounds = (d.sounds || []).map(function (s) { try { return { id: s.id, name: String(s.name || ''), type: s.type || 'audio/mpeg', data: unb64(s.data) }; } catch (e) { return null; } }).filter(Boolean);
        Promise.all([DB.replaceAll('activities', acts), DB.replaceAll('notes', notes), DB.replaceAll('sounds', sounds)]).then(function () {
          if (d.settings) { Settings.replace(d.settings); S = Settings.get(); I18N.set(S.lang || I18N.detect()); I18N.apply(); applyTheme(); }
          initFormLabels(); resetForm(); renderAll(); Notes.render(); UI.toast(t('import_ok'));
        });
      });
    }).catch(function () { UI.toast(t('import_err')); });
  }

  /* ================= wake lock ================= */
  function updateWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (S.wakelock && !document.hidden) {
      if (!wakeLock) navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; l.addEventListener('release', function () { wakeLock = null; }); }).catch(function () {});
    } else if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
  }

  /* ================= menu / navegação ================= */
  function openMenu() {
    UI.popover($('#btn-menu'), [
      { label: t('menu_notes'), onClick: function () { UI.go('notes'); } },
      { label: t('menu_calendar'), onClick: function () { UI.go('calendar'); } },
      { label: t('btn_finished'), onClick: function () { UI.go('completed'); } },
      { sep: true },
      { label: t('set_title'), onClick: function () { UI.go('settings'); } }
    ]);
  }
  function initFormLabels() { updatePickLabels(); updateSoundLabel(); $('#btn-add').textContent = edit ? t('btn_save_changes') : t('btn_add_activity'); }

  /* ================= parâmetros de URL / notificações ================= */
  function handleUrl() {
    var p = new URLSearchParams(location.search);
    var act = p.get('act'), id = p.get('id'), go = p.get('go');
    if (act && id) Engine.handleAction(act, id);
    if (go === 'notes' || go === 'calendar') UI.go(go);
    if (go === 'newnote') { UI.go('notes'); setTimeout(function () { Notes.open(null); }, 50); }
    if (act || go) history.replaceState(history.state, '', location.pathname);
  }

  /* ================= início ================= */
  function init() {
    S = Settings.get();
    I18N.set(S.lang || I18N.detect());
    return DB.init().then(function () {
      applyTheme(); I18N.apply();
      history.replaceState({ s: 'main' }, '');
      UI.hooks.calendar = function () { Cal.open(); };
      UI.hooks.notes = function () { Notes.render(); if (!S.seenNotesHint) { S.seenNotesHint = true; Settings.save(); } };
      UI.hooks.settings = renderSettings;
      UI.hooks.completed = renderDone;
      UI.hooks.main = renderList;
      Cal.init(function (ds) { dayFilter = ds; history.back(); setTimeout(renderList, 0); });
      Notes.init();

      $('#btn-cal').addEventListener('click', function () { UI.go('calendar'); });
      $('#btn-menu').addEventListener('click', openMenu);
      Array.prototype.forEach.call(document.querySelectorAll('[data-back]'), function (b) { b.addEventListener('click', function () { UI.back(); }); });
      $('#btn-add').addEventListener('click', saveActivity);
      $('#btn-cancel-edit').addEventListener('click', resetForm);
      $('#f-title').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveActivity(); } });
      $('#f-date').addEventListener('change', updatePickLabels);
      $('#f-time').addEventListener('change', updatePickLabels);
      $('#f-sound').addEventListener('change', updateSoundLabel);
      $('#btn-sound').addEventListener('click', function () { soundChooser({ current: formSound, allowDefault: true, onPick: function (id) { formSound = id; updateSoundLabel(); } }); });
      $('#btn-finished').addEventListener('click', function () { UI.go('completed'); });
      $('#f-search').addEventListener('input', renderList);
      $('#f-search-done').addEventListener('input', renderDone);
      $('#btn-clear-day').addEventListener('click', function () { dayFilter = null; renderList(); });
      $('#notif-banner').addEventListener('click', function () { Engine.askNotif().then(renderAll); });

      initForm(); renderAll();
      Engine.start(function () { renderList(); renderBanner(); if (UI.current() === 'calendar') Cal.render(); });
      document.addEventListener('visibilitychange', updateWakeLock); updateWakeLock();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

      window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; if (UI.current() === 'settings') renderSettings(); });
      window.addEventListener('appinstalled', function () { deferredInstall = null; UI.toast(t('installed_ok')); if (UI.current() === 'settings') renderSettings(); });

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
        navigator.serviceWorker.addEventListener('message', function (e) {
          var d = e.data || {};
          if (d.type === 'act') Engine.handleAction(d.action, d.id);
          if (d.type === 'note') { UI.go('notes'); }
        });
      }
      handleUrl();
    });
  }

  root.App = { init: init, _saveActivity: saveActivity, _renderList: renderList, _getEdit: function () { return edit; } };
  if (!root.__NO_AUTO_INIT) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }
})(window);
