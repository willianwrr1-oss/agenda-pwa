/* Lógica pura (datas, repetição, busca). Funciona no navegador e no Node (testes). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var pad = function (n) { return String(n).padStart(2, '0'); };

  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function atTime(dateStr, timeStr) {
    var p = dateStr.split('-').map(Number), q = (timeStr || '00:00').split(':').map(Number);
    return new Date(p[0], p[1] - 1, p[2], q[0], q[1], 0, 0);
  }
  function daysInMonth(y, m0) { return new Date(y, m0 + 1, 0).getDate(); }

  /** A atividade acontece neste dia (considerando a repetição)? day = Date */
  function occursOn(a, day) {
    var ds = ymd(day);
    if (ds < a.date) return false;
    var start = parseYmd(a.date);
    var dow = day.getDay();
    switch (a.repeat) {
      case 'daily': return true;
      case 'weekdays': return dow !== 0 && dow !== 6;
      case 'weekly': return dow === start.getDay();
      case 'monthly': return day.getDate() === Math.min(start.getDate(), daysInMonth(day.getFullYear(), day.getMonth()));
      case 'yearly': return day.getMonth() === start.getMonth() &&
        day.getDate() === Math.min(start.getDate(), daysInMonth(day.getFullYear(), day.getMonth()));
      default: return ds === a.date;
    }
  }

  /** Próxima ocorrência estritamente posterior a afterMs (Date) ou null. */
  function next(a, afterMs) {
    var after = afterMs instanceof Date ? afterMs.getTime() : afterMs;
    if (!a.repeat || a.repeat === 'none') {
      var dt = atTime(a.date, a.time);
      return dt.getTime() > after ? dt : null;
    }
    var aDay = parseYmd(a.date), afterDay = new Date(after);
    afterDay = new Date(afterDay.getFullYear(), afterDay.getMonth(), afterDay.getDate());
    var start = afterDay > aDay ? afterDay : aDay;
    var tm = (a.time || '00:00').split(':').map(Number);
    for (var i = 0; i < 800; i++) {
      var day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (occursOn(a, day)) {
        var c = new Date(day.getFullYear(), day.getMonth(), day.getDate(), tm[0], tm[1], 0, 0);
        if (c.getTime() > after) return c;
      }
    }
    return null;
  }

  /** Última ocorrência com after < ocorrência <= now (ou null). */
  function lastUpTo(a, afterMs, nowMs) {
    var last = null, cur = afterMs;
    for (var i = 0; i < 1000; i++) {
      var n = next(a, cur);
      if (!n || n.getTime() > nowMs) break;
      last = n; cur = n.getTime();
    }
    return last;
  }

  /** Chave de ordenação: próximo aviso (ou o horário original se já passou). */
  function sortKey(a, nowMs) {
    if (a.snoozeUntil) return a.snoozeUntil;
    var n = next(a, nowMs);
    if (n) return n.getTime();
    return atTime(a.date, a.time).getTime();
  }

  function isOverdue(a, nowMs) {
    if (a.done || (a.repeat && a.repeat !== 'none')) return false;
    return atTime(a.date, a.time).getTime() < nowMs && !a.snoozeUntil;
  }

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function matches(a, q) {
    q = norm((q || '').trim());
    if (!q) return true;
    return norm(a.title).indexOf(q) >= 0 || norm(a.description).indexOf(q) >= 0;
  }

  /** Semana ISO-8601 */
  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dn = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dn);
    var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 86400000 + 1) / 7);
  }

  /** Grade do mês: linhas de 7 dias (5 ou 6 linhas). weekStart: 0 = domingo, 1 = segunda */
  function monthGrid(year, month0, weekStart) {
    var first = new Date(year, month0, 1);
    var offset = (first.getDay() - weekStart + 7) % 7;
    var dim = daysInMonth(year, month0);
    var rows = Math.ceil((offset + dim) / 7);
    var out = [];
    for (var r = 0; r < rows; r++) {
      var days = [];
      for (var c = 0; c < 7; c++) {
        var d = new Date(year, month0, 1 - offset + r * 7 + c);
        days.push({ date: d, inMonth: d.getMonth() === month0 });
      }
      // semana ISO pela segunda-feira da linha
      out.push({ week: isoWeek(days[weekStart === 1 ? 0 : 1].date), days: days });
    }
    return out;
  }

  function hasActivity(list, day) {
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a.done && occursOn(a, day)) return true;
    }
    return false;
  }

  return { pad: pad, ymd: ymd, parseYmd: parseYmd, atTime: atTime, daysInMonth: daysInMonth, occursOn: occursOn,
    next: next, lastUpTo: lastUpTo, sortKey: sortKey, isOverdue: isOverdue, norm: norm, matches: matches,
    isoWeek: isoWeek, monthGrid: monthGrid, hasActivity: hasActivity };
});
