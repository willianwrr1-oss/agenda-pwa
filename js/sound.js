/* Sons (WebAudio + arquivos do usuário) e vibração */
(function (root) {
  var ctx = null;
  var TONES = ['classic', 'soft', 'siren', 'beep'];

  function getCtx() {
    if (!ctx) { var C = root.AudioContext || root.webkitAudioContext; if (!C) return null; try { ctx = new C(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }
  function unlock() { getCtx(); }

  function osc(c, out, type, freq, t0, dur, vol, freqEnd) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.linearRampToValueAtTime(freqEnd, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // cada tom devolve o período (s) do padrão
  var PATTERNS = {
    classic: function (c, out, t) { osc(c, out, 'square', 880, t, 0.16, 0.35); osc(c, out, 'square', 880, t + 0.24, 0.16, 0.35); osc(c, out, 'square', 880, t + 0.48, 0.16, 0.35); return 1.6; },
    soft: function (c, out, t) { osc(c, out, 'sine', 523.25, t, 1.2, 0.5); osc(c, out, 'sine', 659.25, t + 0.25, 1.2, 0.45); osc(c, out, 'sine', 783.99, t + 0.5, 1.4, 0.4); return 2.4; },
    siren: function (c, out, t) { osc(c, out, 'sawtooth', 600, t, 0.5, 0.3, 950); osc(c, out, 'sawtooth', 950, t + 0.5, 0.5, 0.3, 600); return 1.0; },
    beep: function (c, out, t) { osc(c, out, 'sine', 1000, t, 0.25, 0.5); return 0.8; }
  };

  function toneName(id) { var n = (id || '').replace('tone:', ''); return PATTERNS[n] ? n : 'classic'; }

  function playTone(id) {
    var c = getCtx(); if (!c) return { stop: function () {} };
    var out = c.createGain(); out.gain.value = 1; out.connect(c.destination);
    var p = PATTERNS[toneName(id)], timer = null, stopped = false;
    function go() { if (stopped) return; var period = p(c, out, c.currentTime + 0.02); timer = setTimeout(go, period * 1000); }
    go();
    return { stop: function () { stopped = true; clearTimeout(timer); try { out.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(function () { out.disconnect(); }, 300); } catch (e) {} } };
  }

  function playFile(id, fallback) {
    var h = { stop: function () { h.stopped = true; if (h.audio) { try { h.audio.pause(); } catch (e) {} } if (h.url) URL.revokeObjectURL(h.url); if (h.fb) h.fb.stop(); } };
    var row = root.DB && DB.get('sounds', Number(id));
    if (!row) { h.fb = playTone(fallback || 'tone:classic'); return h; }
    try {
      h.url = URL.createObjectURL(new Blob([row.data], { type: row.type || 'audio/mpeg' }));
      var a = new Audio(h.url); a.loop = true; h.audio = a;
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function () { if (!h.stopped && !h.fb) h.fb = playTone(fallback || 'tone:classic'); });
    } catch (e) { h.fb = playTone(fallback || 'tone:classic'); }
    return h;
  }

  /** id: 'tone:classic' | 'file:<id>' */
  function play(id, fallback) {
    id = id || 'tone:classic';
    if (id.indexOf('file:') === 0) return playFile(id.slice(5), fallback);
    return playTone(id);
  }

  var prev = null;
  function preview(id, ms) {
    stopPreview(); prev = play(id); prev.timer = setTimeout(stopPreview, ms || 6000); return prev;
  }
  function stopPreview() { if (prev) { clearTimeout(prev.timer); prev.stop(); prev = null; } }

  // vibração repetida até parar
  function vibrateLoop() {
    var timer = null, stopped = false;
    function go() { if (stopped) return; try { navigator.vibrate && navigator.vibrate([700, 300, 700, 300, 700]); } catch (e) {} timer = setTimeout(go, 2900); }
    go();
    return { stop: function () { stopped = true; clearTimeout(timer); try { navigator.vibrate && navigator.vibrate(0); } catch (e) {} } };
  }
  function buzz(p) { try { navigator.vibrate && navigator.vibrate(p || [200, 100, 200]); } catch (e) {} }

  root.Sound = { TONES: TONES, unlock: unlock, play: play, preview: preview, stopPreview: stopPreview, vibrateLoop: vibrateLoop, buzz: buzz };
})(typeof self !== 'undefined' ? self : this);
