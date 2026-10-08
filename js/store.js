/* Configurações (localStorage) */
(function (root) {
  var KEY = 'agenda.settings.v2';
  var DEF = {
    lang: null, mode: 'system', pri: '#2563EB', sec: '#6A50A3',
    defaultSound: 'tone:classic', wakelock: false, seenNotesHint: false,
    cal: { bg: '#FFFFFF', text: '#1F2937', header: '#1F2937', weekend: '#B91C1C', weeknum: '#6B7280',
      todayBg: '#2563EB', todayText: '#FFFFFF', dot: '#E53935', transparency: 0, font: 14, dotSize: 8,
      showWeeks: true, showDots: true, weekStart: 0 }
  };
  var CAL_PRESETS = {
    light: { bg: '#FFFFFF', text: '#1F2937', header: '#1F2937', weekend: '#B91C1C', weeknum: '#6B7280', todayBg: '#2563EB', todayText: '#FFFFFF', dot: '#E53935', transparency: 0 },
    dark: { bg: '#1F2937', text: '#F3F4F6', header: '#F9FAFB', weekend: '#FCA5A5', weeknum: '#9CA3AF', todayBg: '#60A5FA', todayText: '#111827', dot: '#FBBF24', transparency: 0 },
    glass: { bg: '#FFFFFF', text: '#FFFFFF', header: '#FFFFFF', weekend: '#FECACA', weeknum: '#E5E7EB', todayBg: '#FFFFFF', todayText: '#1F2937', dot: '#EF4444', transparency: 65 }
  };
  var APP_PRESETS = {
    blue: ['#2563EB', '#6A50A3'], green: ['#16A34A', '#0F766E'], purple: ['#7C3AED', '#DB2777'],
    orange: ['#EA580C', '#92400E'], pink: ['#DB2777', '#7C3AED'], graphite: ['#374151', '#6B7280']
  };
  var cur = null;
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
    cur = Object.assign(clone(DEF), s);
    cur.cal = Object.assign(clone(DEF.cal), s.cal || {});
    return cur;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {} }
  root.Settings = {
    DEF: DEF, CAL_PRESETS: CAL_PRESETS, APP_PRESETS: APP_PRESETS,
    get: function () { return cur || load(); },
    save: save,
    reset: function () { cur = clone(DEF); save(); },
    replace: function (o) { cur = Object.assign(clone(DEF), o || {}); cur.cal = Object.assign(clone(DEF.cal), (o && o.cal) || {}); save(); }
  };
})(typeof self !== 'undefined' ? self : this);
