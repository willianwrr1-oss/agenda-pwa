/* Utilitários de interface: toast, diálogos, menus, navegação, formatação de datas */
(function (root) {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function h(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  /* ---------- toast / snackbar ---------- */
  var toastTimer = null;
  function toast(msg, ms) {
    var el = $('#toast'); el.className = 'show'; el.textContent = msg;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.className = ''; }, ms || 2600);
  }
  function snack(msg, label, onAction, ms) {
    var el = $('#toast'); el.className = 'show'; el.textContent = '';
    el.appendChild(h('span', { text: msg }));
    el.appendChild(h('button', { type: 'button', class: 'snack-act', text: label, onclick: function () { el.className = ''; clearTimeout(toastTimer); onAction(); } }));
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.className = ''; }, ms || 6000);
  }

  /* ---------- pilha de sobreposições ligada ao botão Voltar ---------- */
  var ovStack = [], skip = 0, onScreenPop = null;
  function pushOv(close) {
    var o = { close: close };
    ovStack.push(o);
    history.pushState({ ov: ovStack.length }, '');
    return o;
  }
  function popOv(o) {
    var i = ovStack.indexOf(o); if (i < 0) return;
    ovStack.splice(i, 1); skip++; history.back();
  }
  window.addEventListener('popstate', function (e) {
    if (skip > 0) { skip--; return; }
    if (ovStack.length) { var o = ovStack.pop(); o.close(true); return; }
    if (onScreenPop) onScreenPop(e.state && e.state.s ? e.state.s : 'main');
  });

  /* ---------- diálogos ---------- */
  function dialog(opt) {
    var layer = $('#layer');
    var back = h('div', { class: 'backdrop' });
    var box = h('div', { class: 'dialog' + (opt.cls ? ' ' + opt.cls : ''), role: 'dialog', 'aria-modal': 'true' });
    if (opt.title) box.appendChild(h('h3', { text: opt.title }));
    var body = h('div', { class: 'dlg-body' });
    if (typeof opt.body === 'string') body.innerHTML = opt.body; else if (opt.body) body.appendChild(opt.body);
    box.appendChild(body);
    var api = { el: box, body: body, closed: false };
    var ov = null;
    api.close = function (fromPop) {
      if (api.closed) return; api.closed = true;
      back.remove();
      if (!fromPop && ov) popOv(ov);
      if (opt.onClose) opt.onClose();
    };
    if (opt.buttons && opt.buttons.length) {
      var bar = h('div', { class: 'dlg-btns' });
      opt.buttons.forEach(function (b) {
        bar.appendChild(h('button', { type: 'button', class: 'btn ' + (b.cls || 'btn-ghost'), text: b.label, onclick: function () {
          if (b.onClick) { var r = b.onClick(api); if (r === false) return; }
          if (!b.keepOpen) api.close();
        } }));
      });
      box.appendChild(bar);
    }
    back.appendChild(box);
    if (opt.cancelable !== false) {
      back.addEventListener('mousedown', function (e) { if (e.target === back) api.close(); });
      ov = pushOv(api.close);
    }
    layer.appendChild(back);
    return api;
  }
  function confirm(msg, title, okLabel) {
    return new Promise(function (res) {
      var done = false;
      dialog({ title: title, body: h('p', { text: msg }), onClose: function () { if (!done) res(false); },
        buttons: [{ label: t('action_cancel') }, { label: okLabel || t('action_ok'), cls: 'btn-pri', onClick: function () { done = true; res(true); } }] });
    });
  }

  /* ---------- menu suspenso ---------- */
  function popover(anchor, items, opt) {
    var layer = $('#layer');
    var back = h('div', { class: 'backdrop clear' });
    var m = h('div', { class: 'popover', role: 'menu' });
    var ov = null, closed = false;
    function close(fromPop) { if (closed) return; closed = true; back.remove(); if (!fromPop && ov) popOv(ov); }
    items.forEach(function (it) {
      if (it.sep) { m.appendChild(h('div', { class: 'sep' })); return; }
      m.appendChild(h('button', { type: 'button', class: 'pop-item', role: 'menuitem', text: it.label, onclick: function () { close(); setTimeout(it.onClick, 0); } }));
    });
    back.appendChild(m);
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    layer.appendChild(back);
    var r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    var left = Math.min(Math.max(8, (opt && opt.alignLeft) ? r.left : r.right - mw), window.innerWidth - mw - 8);
    var top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    ov = pushOv(close);
    return { close: close };
  }

  /* ---------- navegação entre telas ---------- */
  var current = 'main', screenHooks = {};
  function showScreen(name) {
    $$('.screen').forEach(function (s) { s.hidden = s.id !== 'scr-' + name; });
    current = name;
    if (screenHooks[name]) screenHooks[name]();
    var sc = $('#scr-' + name + ' .scroll'); if (sc && name !== 'main') sc.scrollTop = 0;
  }
  function go(name) {
    if (name === current) return;
    history.pushState({ s: name }, '');
    showScreen(name);
  }
  function back() { if (current !== 'main') history.back(); }
  onScreenPop = function (name) { showScreen(name); };

  /* ---------- datas ---------- */
  function loc() { return I18N.locale(); }
  function wdShort(d) { return new Intl.DateTimeFormat(loc(), { weekday: 'short' }).format(d).replace('.', ''); }
  function wdLong(d) { return new Intl.DateTimeFormat(loc(), { weekday: 'long' }).format(d); }
  function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dm(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
  function dmy(d) { return dm(d) + '/' + d.getFullYear(); }
  function fmtNext(d) { return wdShort(d) + ', ' + dm(d) + ' ' + t('at_word') + ' ' + hm(d); }
  function fmtDone(ms) { var d = new Date(ms); return dmy(d) + ' ' + t('at_word') + ' ' + hm(d); }
  function fmtWhen(d) { return wdLong(d) + ', ' + dmy(d) + ' ' + t('at_word') + ' ' + hm(d); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function monthTitle(y, m0) { return cap(new Intl.DateTimeFormat(loc(), { month: 'long', year: 'numeric' }).format(new Date(y, m0, 1))); }
  function weekdayLetters(weekStart) {
    var f = new Intl.DateTimeFormat(loc(), { weekday: 'narrow' }), out = [];
    for (var i = 0; i < 7; i++) out.push(cap(f.format(new Date(2023, 0, 1 + ((i + weekStart) % 7)))));   // 1/1/2023 = domingo
    return out;
  }
  function toLocalInput(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + hm(d); }

  root.UI = { $: $, $$: $$, h: h, esc: esc, pad: pad, toast: toast, snack: snack, dialog: dialog, confirm: confirm, popover: popover,
    pushOv: pushOv, popOv: popOv, go: go, back: back, showScreen: showScreen, hooks: screenHooks, current: function () { return current; },
    fmtNext: fmtNext, fmtDone: fmtDone, fmtWhen: fmtWhen, hm: hm, dmy: dmy, dm: dm, wdShort: wdShort, monthTitle: monthTitle, weekdayLetters: weekdayLetters,
    cap: cap, toLocalInput: toLocalInput };
})(window);
