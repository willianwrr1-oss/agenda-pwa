/* Notas estilo Google Keep: grade, arrastar para reordenar/excluir, editor com formatação */
(function (root) {
  var $ = UI.$, h = UI.h;
  var COLORS = [
    ['default', '#FFFFFF', '#202124'], ['red', '#F28B82', '#5C2B29'], ['orange', '#FBBC04', '#614A19'], ['yellow', '#FFF475', '#635D19'],
    ['green', '#CCFF90', '#345920'], ['teal', '#A7FFEB', '#16504B'], ['blue', '#CBF0F8', '#2D555E'], ['darkblue', '#AECBFA', '#1E3A5F'],
    ['purple', '#D7AEFB', '#42275E'], ['pink', '#FDCFE8', '#5B2245'], ['brown', '#E6C9A8', '#442F19'], ['gray', '#E8EAED', '#3C3F43']
  ];
  var query = '';
  var cards = new Map();           // id -> elemento do cartão
  var layoutTimer = null;

  /* ================= sanitização ================= */
  var ALLOWED = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, DEL: 1, H2: 1, H3: 1, UL: 1, OL: 1, LI: 1, DIV: 1, P: 1, BR: 1, SPAN: 1, A: 1, IMG: 1 };
  var DROP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, TEMPLATE: 1, LINK: 1, META: 1, SVG: 1, MATH: 1, FORM: 1, INPUT: 1, BUTTON: 1, TEXTAREA: 1, SELECT: 1, VIDEO: 1, AUDIO: 1 };
  function safeUrl(u) {
    u = String(u || '').trim();
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    return '';
  }
  function walk(src, dst) {
    for (var n = src.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      var tag = n.tagName.toUpperCase();
      if (DROP[tag]) continue;
      if (!ALLOWED[tag]) { walk(n, dst); continue; }
      var e = document.createElement(tag.toLowerCase());
      if (tag === 'DIV' && /(^|\s)ck(\s|$)/.test(n.getAttribute('class') || '')) {
        e.setAttribute('class', 'ck'); e.setAttribute('data-c', n.getAttribute('data-c') === '1' ? '1' : '0');
      }
      if (tag === 'A') {
        var u = safeUrl(n.getAttribute('href'));
        if (u) { e.setAttribute('href', u); e.setAttribute('target', '_blank'); e.setAttribute('rel', 'noopener noreferrer'); }
      }
      if (tag === 'IMG') {
        var s = n.getAttribute('src') || '';
        if (!/^data:image\/(png|jpeg|jpg|gif|webp);/i.test(s)) continue;
        e.setAttribute('src', s); e.setAttribute('alt', '');
      }
      if (tag !== 'BR' && tag !== 'IMG') walk(n, e);
      dst.appendChild(e);
    }
  }
  function sanitize(html) {
    var doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
    var out = document.createElement('div');
    walk(doc.body, out);
    return out.innerHTML;
  }
  function plain(html) {
    var d = document.createElement('div');
    d.innerHTML = String(html || '').replace(/<(br|\/div|\/p|\/li|\/h[1-6])[^>]*>/gi, '$&\n');
    return (d.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  function hasImage(html) { return /<img\s/i.test(html || ''); }

  /* ================= dados ================= */
  function allSorted() {
    return DB.all('notes').sort(function (a, b) { return (a.order || 0) - (b.order || 0) || (b.createdAt || 0) - (a.createdAt || 0); });
  }
  function newNote() {
    var min = 0; DB.all('notes').forEach(function (n) { if ((n.order || 0) < min) min = n.order || 0; });
    return { id: DB.newId(), title: '', html: '', text: '', color: 'default', pinned: false, order: min - 1, reminder: null, reminderFired: false, createdAt: Date.now(), updatedAt: Date.now() };
  }
  function renumber(list) { list.forEach(function (n, i) { if (n.order !== i) { n.order = i; DB.put('notes', n); } }); }
  function colorOf(n) { return COLORS.filter(function (c) { return c[0] === n.color; })[0] || COLORS[0]; }

  /* ================= grade ================= */
  var dragging = null;
  function matches(n) {
    if (!query) return true;
    var q = Logic.norm(query);
    return Logic.norm(n.title).indexOf(q) >= 0 || Logic.norm(n.text).indexOf(q) >= 0;
  }

  function buildCard(n) {
    var c = h('div', { class: 'ncard', 'data-id': n.id, 'data-color': n.color, 'data-pinned': n.pinned ? '1' : '0' });
    if (n.title) c.appendChild(h('div', { class: 'ntitle', text: n.title }));
    var body = h('div', { class: 'nbody', html: sanitize(n.html) });
    c.appendChild(body);
    if (n.title === '' && !plain(n.html) && !hasImage(n.html)) body.appendChild(h('span', { class: 'muted', text: t('note_untitled') }));
    Array.prototype.forEach.call(body.querySelectorAll('img'), function (im) { im.draggable = false; im.addEventListener('load', scheduleLayout); });
    if (n.reminder) {
      c.appendChild(h('div', { class: 'nchip' + (n.reminderFired ? ' done' : ''), text: '🔔 ' + UI.dm(new Date(n.reminder)) + ' ' + UI.hm(new Date(n.reminder)) }));
    }
    c.appendChild(h('button', { type: 'button', class: 'ndel', 'data-i18n-title': 'note_delete', title: t('note_delete'), 'aria-label': t('note_delete'),
      html: '<svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
      onclick: function (e) { e.stopPropagation(); remove(n.id); } }));
    bindCard(c, n);
    return c;
  }

  function renderAll() {
    var list = allSorted().filter(matches);
    cards.clear();
    list.forEach(function (n) { cards.set(n.id, buildCard(n)); });
    $('#notes-empty').hidden = allSorted().length > 0;
    $('#notes-hint').hidden = allSorted().length === 0;
    if (allSorted().length > 0 && list.length === 0) { $('#notes-empty').hidden = false; $('#notes-empty').textContent = t('notes_none_found'); }
    else $('#notes-empty').textContent = t('notes_empty');
    layout();
  }

  function colCount() {
    var w = $('#notes-body').clientWidth || window.innerWidth;
    return Math.max(2, Math.min(6, Math.floor(w / 175)));
  }
  function scheduleLayout() { clearTimeout(layoutTimer); layoutTimer = setTimeout(layout, 60); }

  function layout() {
    var host = $('#notes-body');
    var list = allSorted().filter(matches).filter(function (n) { return cards.has(n.id); });
    var pinned = list.filter(function (n) { return n.pinned; }), others = list.filter(function (n) { return !n.pinned; });
    host.innerHTML = '';
    function section(label, items, pin) {
      if (!items.length) return;
      if (label) host.appendChild(h('div', { class: 'nsec', text: label }));
      var n = colCount(), cols = [];
      var grid = h('div', { class: 'mgrid', 'data-pinned': pin ? '1' : '0' });
      for (var i = 0; i < n; i++) { var col = h('div', { class: 'mcol' }); cols.push(col); grid.appendChild(col); }
      host.appendChild(grid);
      items.forEach(function (it) {
        var best = cols[0];
        cols.forEach(function (c) { if (c.offsetHeight < best.offsetHeight) best = c; });
        best.appendChild(cards.get(it.id));
      });
    }
    section(pinned.length ? t('notes_pinned') : '', pinned, true);
    section(pinned.length ? t('notes_others') : '', others, false);
  }

  /* ================= arrastar / reposicionar ================= */
  function bindCard(card, n) {
    var st = null;
    function begin(x, y, kind) {
      st = { x: x, y: y, kind: kind, t0: Date.now(), moved: false, timer: null };
      st.timer = setTimeout(function () { if (st) { dragging = startDrag(card, n.id, st.x, st.y); st.dragging = true; } }, 380);
    }
    function move(x, y) {
      if (!st) return false;
      if (st.dragging) { dragging.move(x, y); return true; }
      if (Math.abs(x - st.x) > 10 || Math.abs(y - st.y) > 10) { st.moved = true; clearTimeout(st.timer); }
      return false;
    }
    function end() {
      if (!st) return;
      clearTimeout(st.timer);
      if (st.dragging) { dragging.end(); dragging = null; card._suppress = Date.now(); }
      st = null;
    }
    card.addEventListener('touchstart', function (e) { if (e.touches.length === 1 && !e.target.closest('.ndel')) begin(e.touches[0].clientX, e.touches[0].clientY, 'touch'); else end(); }, { passive: true });
    card.addEventListener('touchmove', function (e) { if (move(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault(); }, { passive: false });
    card.addEventListener('touchend', end);
    card.addEventListener('touchcancel', end);
    card.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || e.target.closest('.ndel')) return;
      begin(e.clientX, e.clientY, 'mouse');
      var mv = function (ev) { move(ev.clientX, ev.clientY); };
      var up = function () { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); end(); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    card.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    card.addEventListener('click', function (e) {
      if (card._suppress && Date.now() - card._suppress < 400) return;
      var ck = e.target.closest('.ck');
      if (ck && card.contains(ck) && e.clientX - ck.getBoundingClientRect().left < 30) { toggleCheckInCard(n.id, card, ck); return; }
      if (e.target.closest('a')) return;
      open(n.id);
    });
  }

  function toggleCheckInCard(id, card, ck) {
    var n = DB.get('notes', id); if (!n) return;
    var all = Array.prototype.slice.call(card.querySelectorAll('.nbody .ck')), idx = all.indexOf(ck);
    var d = document.createElement('div'); d.innerHTML = sanitize(n.html);
    var tgt = d.querySelectorAll('.ck')[idx]; if (!tgt) return;
    tgt.setAttribute('data-c', tgt.getAttribute('data-c') === '1' ? '0' : '1');
    n.html = d.innerHTML; n.updatedAt = Date.now(); DB.put('notes', n);
    ck.setAttribute('data-c', tgt.getAttribute('data-c'));
  }

  function startDrag(card, id, x0, y0) {
    var rect = card.getBoundingClientRect();
    var ghost = card.cloneNode(true);
    ghost.classList.add('drag'); ghost.style.cssText = 'position:fixed;left:' + rect.left + 'px;top:' + rect.top + 'px;width:' + rect.width + 'px;pointer-events:none;z-index:70;';
    document.body.appendChild(ghost);
    card.classList.add('placeholder');
    var trash = $('#note-trash'); trash.hidden = false; trash.classList.remove('over');
    Sound.buzz(20);
    var px = x0, py = y0, last = null, raf = 0, over = false, order = allSorted().filter(matches).map(function (n) { return n.id; });
    var scroller = $('#notes-scroll');
    function pinnedOf(i) { var n = DB.get('notes', i); return n && n.pinned; }
    function tick() {
      raf = requestAnimationFrame(tick);
      var vh = window.innerHeight;
      if (py < 110) scroller.scrollTop -= 10; else if (py > vh - 130) scroller.scrollTop += 10;
    }
    tick();
    function move(x, y) {
      px = x; py = y;
      ghost.style.transform = 'translate(' + (x - x0) + 'px,' + (y - y0) + 'px) rotate(2deg)';
      var tr = trash.getBoundingClientRect();
      over = x > tr.left && x < tr.right && y > tr.top && y < tr.bottom;
      trash.classList.toggle('over', over);
      if (over) return;
      var els = document.elementsFromPoint(x, y), target = null;
      for (var i = 0; i < els.length; i++) { var c = els[i].closest && els[i].closest('.ncard'); if (c && !c.classList.contains('drag')) { target = c; break; } }
      if (!target) return;
      var tid = Number(target.getAttribute('data-id'));
      if (tid === id) { last = null; return; }
      if (tid === last || pinnedOf(tid) !== pinnedOf(id)) return;
      var from = order.indexOf(id), to = order.indexOf(tid);
      if (from < 0 || to < 0) return;
      order.splice(to, 0, order.splice(from, 1)[0]);
      last = tid;
      // aplica a nova ordem temporariamente (sem recriar os cartões)
      order.forEach(function (oid, i) { var n = DB.get('notes', oid); if (n && n.order !== i) { n.order = i; } });
      layout();
    }
    function end() {
      cancelAnimationFrame(raf);
      ghost.remove(); card.classList.remove('placeholder');
      trash.hidden = true;
      if (over) { remove(id); return; }
      var list = allSorted(); renumber(list); layout();
    }
    return { move: move, end: end };
  }

  /* ================= excluir (com desfazer) ================= */
  function remove(id) {
    var n = DB.get('notes', id); if (!n) return;
    var copy = JSON.parse(JSON.stringify(n));
    DB.del('notes', id); cards.delete(id); renderAll();
    UI.snack(t('note_deleted'), t('note_undo'), function () { DB.put('notes', copy); renderAll(); });
  }

  /* ================= editor ================= */
  var ed = null;           // {note, isNew, saveT}
  var savedRange = null;
  var overlay = null;

  function el(id) { return document.getElementById(id); }

  function applyEditorColor() {
    var c = colorOf(ed.note); el('note-editor').setAttribute('data-color', c[0]);
    var dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.getAttribute('data-theme') !== 'light' || document.documentElement.getAttribute('data-theme') === 'dark';
    var bg = dark ? c[2] : c[1];
    document.querySelector('meta[name="theme-color"]').setAttribute('content', bg);
  }
  function refreshPinBtn() {
    var b = el('ne-pin'); b.classList.toggle('on', !!ed.note.pinned);
    var k = ed.note.pinned ? 'note_unpin' : 'note_pin'; b.title = t(k); b.setAttribute('aria-label', t(k));
  }
  function refreshChips() {
    var box = el('ne-chips'); box.innerHTML = '';
    if (ed.note.reminder) {
      var d = new Date(ed.note.reminder);
      box.appendChild(h('button', { type: 'button', class: 'nchip big', text: '🔔 ' + UI.dm(d) + ' ' + UI.hm(d), onclick: function () { reminderDialog(); } }));
    }
  }

  function open(id) {
    var n;
    if (id) { var o = DB.get('notes', id); if (!o) return; n = JSON.parse(JSON.stringify(o)); ed = { note: n, isNew: false }; }
    else { n = newNote(); ed = { note: n, isNew: true }; }
    el('ne-title').value = n.title || '';
    el('ne-body').innerHTML = sanitize(n.html) || '';
    el('ne-fmt').hidden = true; el('ne-fmt-toggle').classList.remove('on');
    el('note-editor').hidden = false;
    applyEditorColor(); refreshPinBtn(); refreshChips(); fitViewport();
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (e) {}
    overlay = UI.pushOv(function () { close(true); });
    if (!id) setTimeout(function () { el('ne-body').focus(); }, 60);
  }

  function collect() {
    var n = ed.note;
    n.title = el('ne-title').value.trim();
    n.html = sanitize(el('ne-body').innerHTML);
    n.text = plain(n.html);
    return n;
  }
  function persist() {
    if (!ed) return;
    var n = collect();
    if (!n.title && !n.text && !hasImage(n.html)) return false;
    n.updatedAt = Date.now();
    DB.put('notes', n); ed.isNew = false;
    return true;
  }
  function scheduleSave() { clearTimeout(ed.saveT); ed.saveT = setTimeout(persist, 700); }

  function close(fromPop) {
    if (!ed) return;
    clearTimeout(ed.saveT);
    var saved = persist();
    if (!saved && !ed.isNew) { DB.del('notes', ed.note.id); UI.toast(t('note_discarded')); }
    else if (!saved && ed.isNew && (el('ne-title').value || el('ne-body').textContent)) { /* nada */ }
    ed = null;
    el('note-editor').hidden = true;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', Settings.get().pri);
    if (!fromPop && overlay) UI.popOv(overlay);
    overlay = null;
    renderAll();
  }

  /* --- seleção --- */
  document.addEventListener('selectionchange', function () {
    if (!ed) return;
    var s = getSelection(); if (!s.rangeCount) return;
    var r = s.getRangeAt(0);
    if (el('ne-body').contains(r.commonAncestorContainer)) { savedRange = r.cloneRange(); updateActive(); }
  });
  function restoreSel() {
    var b = el('ne-body');
    if (document.activeElement !== b) b.focus();
    if (savedRange) { var s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
  }
  function updateActive() {
    ['bold', 'italic', 'underline', 'strikeThrough'].forEach(function (c) {
      var b = document.querySelector('#ne-fmt [data-cmd="' + c + '"]'); if (!b) return;
      var on = false; try { on = document.queryCommandState(c); } catch (e) {}
      b.classList.toggle('on', on);
    });
  }
  function currentBlock() {
    var b = el('ne-body'), s = getSelection();
    if (!s.rangeCount) return null;
    var n = s.getRangeAt(0).startContainer;
    while (n && n.parentNode !== b) { if (!n.parentNode) return null; n = n.parentNode; }
    return n === b ? null : n;
  }

  function cmd(c) {
    restoreSel();
    var body = el('ne-body');
    switch (c) {
      case 'bold': case 'italic': case 'underline': case 'strikeThrough': document.execCommand(c); break;
      case 'heading': {
        var v = ''; try { v = document.queryCommandValue('formatBlock').toLowerCase(); } catch (e) {}
        document.execCommand('formatBlock', false, v === 'h2' ? 'div' : 'h2'); break;
      }
      case 'ul': document.execCommand('insertUnorderedList'); break;
      case 'ol': document.execCommand('insertOrderedList'); break;
      case 'check': {
        var blk = currentBlock();
        if (!blk) { document.execCommand('formatBlock', false, 'div'); blk = currentBlock(); }
        if (blk && blk.nodeType === 1) {
          if (blk.classList && blk.classList.contains('ck')) { blk.classList.remove('ck'); blk.removeAttribute('data-c'); }
          else if (blk.tagName === 'DIV') { blk.classList.add('ck'); blk.setAttribute('data-c', '0'); }
        }
        break;
      }
      case 'link': linkDialog(); return;
      case 'clear': {
        document.execCommand('removeFormat'); document.execCommand('unlink');
        var b2 = currentBlock();
        if (b2 && b2.nodeType === 1) { if (b2.tagName !== 'DIV') document.execCommand('formatBlock', false, 'div'); b2 = currentBlock(); if (b2 && b2.classList) { b2.classList.remove('ck'); b2.removeAttribute('data-c'); } }
        break;
      }
    }
    updateActive(); scheduleSave();
  }

  function linkDialog() {
    var s = getSelection(), collapsed = !s.rangeCount || s.getRangeAt(0).collapsed;
    var range = savedRange;
    var inp = h('input', { class: 'inp', type: 'url', placeholder: 'https://', autocapitalize: 'off' });
    UI.dialog({ title: t('fmt_link'), body: h('div', null, [h('p', { class: 'muted small', text: t('fmt_link_prompt') }), inp]),
      buttons: [{ label: t('action_cancel') }, { label: t('action_ok'), cls: 'btn-pri', onClick: function () {
        var u = inp.value.trim(); if (!u) return;
        if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
        u = safeUrl(u); if (!u) return;
        savedRange = range; restoreSel();
        if (collapsed) document.execCommand('insertHTML', false, '<a href="' + UI.esc(u) + '">' + UI.esc(u) + '</a>&nbsp;');
        else document.execCommand('createLink', false, u);
        scheduleSave();
      } }] });
    setTimeout(function () { inp.focus(); }, 80);
  }

  /* --- lembrete --- */
  function reminderDialog() {
    var def = ed.note.reminder || (Math.ceil(Date.now() / 3600000) + 1) * 3600000;
    var inp = h('input', { class: 'inp', type: 'datetime-local', value: UI.toLocalInput(def) });
    var btns = [{ label: t('action_cancel') }];
    if (ed.note.reminder) btns.push({ label: t('note_reminder_remove'), onClick: function () { ed.note.reminder = null; ed.note.reminderFired = false; refreshChips(); scheduleSave(); } });
    btns.push({ label: t('btn_save'), cls: 'btn-pri', onClick: function () {
      var v = new Date(inp.value).getTime(); if (!v) return false;
      ed.note.reminder = v; ed.note.reminderFired = v <= Date.now();
      refreshChips(); persistSoft();
      if (root.Engine && Engine.askNotif) Engine.askNotif();
    } });
    UI.dialog({ title: t('note_reminder_set'), body: inp, buttons: btns });
  }
  function persistSoft() { if (ed) { scheduleSave(); } }

  /* --- imagem --- */
  function insertImage(file) {
    if (!file) return;
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var max = 1280, w = img.naturalWidth, hh = img.naturalHeight, k = Math.min(1, max / Math.max(w, hh));
      var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(hh * k);
      var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
      var data = cv.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(url);
      restoreSel();
      document.execCommand('insertHTML', false, '<img src="' + data + '"><div><br></div>');
      scheduleSave();
    };
    img.onerror = function () { URL.revokeObjectURL(url); UI.toast(t('note_img_err')); };
    img.src = url;
  }

  /* --- cor --- */
  function colorPopover(anchor) {
    var wrap = h('div', { class: 'color-grid' });
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' || (document.documentElement.getAttribute('data-theme') !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    var dlg;
    COLORS.forEach(function (c) {
      var b = h('button', { type: 'button', class: 'swatch' + (ed.note.color === c[0] ? ' sel' : ''), title: t('nc_' + c[0]), 'aria-label': t('nc_' + c[0]),
        style: 'background:' + (dark ? c[2] : c[1]), onclick: function () { ed.note.color = c[0]; applyEditorColor(); scheduleSave(); dlg.close(); } });
      wrap.appendChild(b);
    });
    dlg = UI.dialog({ title: t('note_color'), body: wrap, cls: 'small' });
  }

  /* --- ajuste ao teclado --- */
  function fitViewport() {
    var e = el('note-editor'), vv = window.visualViewport;
    if (!vv || e.hidden) return;
    e.style.height = vv.height + 'px'; e.style.top = vv.offsetTop + 'px';
  }

  function bindEditor() {
    var body = el('ne-body');
    body.addEventListener('input', function () { if (ed) scheduleSave(); });
    el('ne-title').addEventListener('input', function () { if (ed) scheduleSave(); });
    el('ne-title').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); body.focus(); } });
    body.addEventListener('beforeinput', function (e) {
      if (e.inputType !== 'insertParagraph') return;
      var b = currentBlock();
      if (b && b.classList && b.classList.contains('ck') && !b.textContent.trim()) { e.preventDefault(); b.classList.remove('ck'); b.removeAttribute('data-c'); scheduleSave(); }
    });
    body.addEventListener('input', function (e) {
      if (e.inputType === 'insertParagraph') { var b = currentBlock(); if (b && b.classList && b.classList.contains('ck')) b.setAttribute('data-c', '0'); }
    });
    body.addEventListener('click', function (e) {
      var ck = e.target.closest && e.target.closest('.ck');
      if (ck && body.contains(ck) && e.clientX - ck.getBoundingClientRect().left < 30) {
        e.preventDefault(); ck.setAttribute('data-c', ck.getAttribute('data-c') === '1' ? '0' : '1'); scheduleSave();
      }
    });
    body.addEventListener('paste', function (e) {   // cola só texto simples
      e.preventDefault();
      var txt = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, txt);
    });
    // botões não roubam o foco do editor
    Array.prototype.forEach.call(document.querySelectorAll('#note-editor .ed-bar button, #ne-fmt button'), function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#ne-fmt [data-cmd]'), function (b) {
      b.addEventListener('click', function () { cmd(b.getAttribute('data-cmd')); });
    });
    el('ne-fmt-toggle').addEventListener('click', function () {
      var f = el('ne-fmt'); f.hidden = !f.hidden; this.classList.toggle('on', !f.hidden);
    });
    el('ne-color').addEventListener('click', function () { colorPopover(this); });
    el('ne-bell').addEventListener('click', reminderDialog);
    el('ne-img').addEventListener('click', function () { el('ne-file').click(); });
    el('ne-file').addEventListener('change', function () { insertImage(this.files[0]); this.value = ''; });
    el('ne-undo').addEventListener('click', function () { restoreSel(); document.execCommand('undo'); scheduleSave(); });
    el('ne-redo').addEventListener('click', function () { restoreSel(); document.execCommand('redo'); scheduleSave(); });
    el('ne-pin').addEventListener('click', function () { ed.note.pinned = !ed.note.pinned; refreshPinBtn(); scheduleSave(); });
    el('ne-close').addEventListener('click', function () { close(false); });
    el('ne-more').addEventListener('click', function () {
      UI.popover(this, [
        { label: t('note_copy'), onClick: function () {
          var n = collect(); if (!n.title && !n.text && !hasImage(n.html)) return;
          persist();
          var c = JSON.parse(JSON.stringify(n)); c.id = DB.newId(); c.reminder = null; c.reminderFired = false; c.createdAt = c.updatedAt = Date.now();
          var min = 0; DB.all('notes').forEach(function (x) { if (x.order < min) min = x.order; }); c.order = min - 1;
          DB.put('notes', c); UI.toast(t('note_copied'));
        } },
        { label: t('note_delete'), onClick: function () {
          var id = ed.note.id, wasNew = ed.isNew, copy = JSON.parse(JSON.stringify(collect()));
          clearTimeout(ed.saveT); ed.isNew = true;   // não regravar ao fechar
          el('ne-title').value = ''; el('ne-body').innerHTML = '';
          DB.del('notes', id); close(false);
          if (!wasNew) UI.snack(t('note_deleted'), t('note_undo'), function () { DB.put('notes', copy); renderAll(); });
        } }
      ]);
    });
    if (window.visualViewport) { visualViewport.addEventListener('resize', fitViewport); visualViewport.addEventListener('scroll', fitViewport); }
    document.addEventListener('visibilitychange', function () { if (document.hidden && ed) { clearTimeout(ed.saveT); persist(); } });
  }

  function init() {
    bindEditor();
    el('note-create').addEventListener('click', function () { open(null); });
    el('note-fab').addEventListener('click', function () { open(null); });
    el('notes-search').addEventListener('input', function () { query = this.value; renderAll(); });
    window.addEventListener('resize', scheduleLayout);
  }

  root.Notes = { init: init, render: renderAll, open: open, sanitize: sanitize, plain: plain, COLORS: COLORS, _layout: layout };
})(window);
