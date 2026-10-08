/* Calendário (igual ao widget): grade mensal, semanas ISO, bolinhas, configuração */
(function (root) {
  var $ = UI.$, h = UI.h;
  var view = { y: 0, m: 0 };
  var cfgOpen = false;
  var onPickDay = null;

  function rgba(hex, a) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return hex;
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
  }
  function cfg() { return Settings.get().cal; }

  function resetView() { var n = new Date(); view.y = n.getFullYear(); view.m = n.getMonth(); }
  function shift(d) { var x = new Date(view.y, view.m + d, 1); view.y = x.getFullYear(); view.m = x.getMonth(); render(); }

  function render() {
    var c = cfg(), host = $('#cal-widget');
    if (!host) return;
    var acts = DB.all('activities');
    var grid = Logic.monthGrid(view.y, view.m, c.weekStart);
    var today = Logic.ymd(new Date());
    var alpha = Math.max(0, Math.min(1, 1 - c.transparency / 100));
    host.innerHTML = '';
    host.className = 'calw';
    host.style.background = rgba(c.bg, alpha);
    host.style.color = c.text;
    host.style.setProperty('--cf', c.font + 'px');

    var head = h('div', { class: 'calw-head' }, [
      h('div', { class: 'calw-nav' }, [
        h('button', { type: 'button', class: 'calw-arrow', 'aria-label': t('cal_prev'), text: '‹', style: 'color:' + c.header, onclick: function () { shift(-1); } }),
        h('div', { class: 'calw-title', text: UI.monthTitle(view.y, view.m), style: 'color:' + c.header + ';font-size:' + (c.font * 1.35) + 'px' }),
        h('button', { type: 'button', class: 'calw-arrow', 'aria-label': t('cal_next'), text: '›', style: 'color:' + c.header, onclick: function () { shift(1); } })
      ]),
      h('div', { class: 'calw-tools' }, [
        h('button', { type: 'button', class: 'calw-chip', text: t('w_today'), style: 'color:' + c.header + ';border-color:' + rgba(c.header, .4), onclick: function () { resetView(); render(); } }),
        h('button', { type: 'button', class: 'calw-chip', text: t('w_cfg'), style: 'color:' + c.header + ';border-color:' + rgba(c.header, .4), onclick: function () { toggleCfg(); } })
      ])
    ]);
    host.appendChild(head);

    var cols = (c.showWeeks ? '1.15fr ' : '') + 'repeat(7,1fr)';
    var g = h('div', { class: 'calw-grid', style: 'grid-template-columns:' + cols });
    if (c.showWeeks) g.appendChild(h('div', { class: 'calw-hd', text: t('w_week'), style: 'color:' + c.weeknum + ';font-size:' + (c.font * 0.8) + 'px' }));
    UI.weekdayLetters(c.weekStart).forEach(function (L, i) {
      var dow = (i + c.weekStart) % 7;
      g.appendChild(h('div', { class: 'calw-hd', text: L, style: 'font-size:' + c.font + 'px;color:' + ((dow === 0 || dow === 6) ? c.weekend : c.header) }));
    });
    grid.forEach(function (row) {
      if (c.showWeeks) g.appendChild(h('div', { class: 'calw-wn', text: row.week, style: 'color:' + c.weeknum + ';font-size:' + (c.font * 0.8) + 'px' }));
      row.days.forEach(function (d) {
        var ds = Logic.ymd(d.date), dow = d.date.getDay();
        var isToday = ds === today;
        var cell = h('button', { type: 'button', class: 'calw-day' + (d.inMonth ? '' : ' out'), 'data-date': ds,
          style: 'height:' + Math.round(c.font * 2.7) + 'px;font-size:' + c.font + 'px', onclick: function () { if (onPickDay) onPickDay(ds); } });
        var num = h('span', { class: 'calw-num', text: d.date.getDate() });
        var col = (dow === 0 || dow === 6) ? c.weekend : c.text;
        if (isToday) { num.style.background = c.todayBg; num.style.color = c.todayText; num.classList.add('today'); }
        else num.style.color = col;
        num.style.width = num.style.height = Math.round(c.font * 1.9) + 'px';
        cell.appendChild(num);
        if (c.showDots && d.inMonth && Logic.hasActivity(acts, d.date)) {
          cell.appendChild(h('span', { class: 'calw-dot', style: 'width:' + c.dotSize + 'px;height:' + c.dotSize + 'px;background:' + c.dot }));
        }
        g.appendChild(cell);
      });
    });
    host.appendChild(g);
    if (cfgOpen) renderCfg();
  }

  /* ---------- painel de configuração ---------- */
  function toggleCfg() {
    cfgOpen = !cfgOpen;
    $('#cal-cfg').hidden = !cfgOpen;
    if (cfgOpen) { renderCfg(); $('#cal-cfg').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  function upd(patch) { Object.assign(cfg(), patch); Settings.save(); render(); }

  function renderCfg() {
    var c = cfg(), box = $('#cal-cfg');
    box.innerHTML = '';
    box.appendChild(h('h3', { text: t('cal_config') }));

    box.appendChild(h('div', { class: 'lbl', text: t('wc_quick_themes') }));
    var pr = h('div', { class: 'chips' });
    [['light', 'theme_light'], ['dark', 'theme_dark'], ['glass', 'theme_glass']].forEach(function (p) {
      pr.appendChild(h('button', { type: 'button', class: 'btn btn-ghost sm', text: t(p[1]), onclick: function () { upd(Settings.CAL_PRESETS[p[0]]); renderCfg(); } }));
    });
    box.appendChild(pr);

    box.appendChild(h('div', { class: 'lbl', text: t('wc_colors') }));
    [['bg', 'wc_bg'], ['text', 'wc_text_days'], ['header', 'wc_header'], ['weekend', 'wc_weekend'], ['weeknum', 'wc_weeknum'],
     ['todayBg', 'wc_today_bg'], ['todayText', 'wc_today_text'], ['dot', 'wc_dot_color']].forEach(function (k) {
      var inp = h('input', { type: 'color', value: c[k[0]], oninput: function (e) { var p = {}; p[k[0]] = e.target.value; Object.assign(cfg(), p); Settings.save(); render0(); } });
      box.appendChild(h('label', { class: 'color-row' }, [h('span', { text: t(k[1]) }), inp]));
    });

    function range(key, labelKey, min, max) {
      var lab = h('div', { class: 'lbl', text: t(labelKey, c[key]) });
      var inp = h('input', { type: 'range', min: min, max: max, value: c[key], class: 'range', oninput: function (e) {
        var v = Number(e.target.value); cfg()[key] = v; Settings.save(); lab.textContent = t(labelKey, v); render0();
      } });
      box.appendChild(lab); box.appendChild(inp);
    }
    range('transparency', 'wc_transparency', 0, 100);
    range('font', 'wc_font_size', 10, 24);
    range('dotSize', 'wc_dot_size', 4, 18);

    function sw(key, labelKey) {
      var inp = h('input', { type: 'checkbox', onchange: function (e) { var p = {}; p[key] = e.target.checked; upd(p); } });
      inp.checked = !!c[key];
      box.appendChild(h('label', { class: 'chk-row' }, [inp, h('span', { text: t(labelKey) })]));
    }
    sw('showWeeks', 'wc_show_weeks');
    sw('showDots', 'wc_show_dots');

    box.appendChild(h('div', { class: 'lbl', text: t('wc_week_starts') }));
    var sel = h('select', { class: 'inp', onchange: function (e) { upd({ weekStart: Number(e.target.value) }); } }, [
      h('option', { value: 0, text: t('wc_sunday') }), h('option', { value: 1, text: t('wc_monday') })]);
    sel.value = String(c.weekStart);
    box.appendChild(sel);

    box.appendChild(h('button', { type: 'button', class: 'btn btn-ghost block', text: t('wc_reset'), onclick: function () {
      Settings.get().cal = JSON.parse(JSON.stringify(Settings.DEF.cal)); Settings.save(); render(); renderCfg();
    } }));
  }
  // atualiza o calendário sem reconstruir o painel (mantém o seletor aberto)
  function render0() { var keep = cfgOpen; cfgOpen = false; render(); cfgOpen = keep; }

  root.Cal = {
    init: function (pick) { onPickDay = pick; resetView(); },
    open: function () { resetView(); cfgOpen = false; $('#cal-cfg').hidden = true; render(); },
    render: render
  };
})(window);
