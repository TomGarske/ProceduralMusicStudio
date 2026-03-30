/**
 * Full-width per-layer RMS strip. Time runs left → right (oldest left, newest right edge).
 * All columns are live/past — no future lead-in or output delay.
 */
(function () {
  'use strict';

  const ACCENT = '#ffab00';
  const BG = '#121212';
  const GRID = 'rgba(255,255,255,0.06)';
  const MARKER_COLOR = 'rgba(0, 212, 255, 0.9)';
  const MARKER_GLOW = 'rgba(0, 212, 255, 0.45)';
  const MARKER_TEXT = 'rgba(0, 212, 255, 0.98)';
  const PAD_TOP = 4;
  const ROW_H = 5;
  const EPS = 0.001;

  let canvas = null;
  let ctx = null;
  let layerIds = [];
  let focusLayerId = null;
  let history = null;
  let historyW = 0;
  let col = 0;
  let raf = null;
  let buf = null;
  let scrollMarkers = [];
  let lastFrameTime = 0;
  let frameMs = 1000 / 60;
  let timeSpanEl = null;

  function getVisibleIndices() {
    if (focusLayerId) {
      const ix = layerIds.indexOf(focusLayerId);
      return ix >= 0 ? [ix] : layerIds.map((_, i) => i);
    }
    const eng = window.__PROC_ENGINE;
    const st = eng && eng.getState ? eng.getState() : null;
    if (!st) return layerIds.map((_, i) => i);
    const lv = st.phaseLevels || {};
    const mult = st.layers || {};
    const out = [];
    for (let i = 0; i < layerIds.length; i++) {
      const id = layerIds[i];
      const base = lv[id] ?? 0;
      const m = mult[id] ?? 1;
      if (base * m > EPS) out.push(i);
    }
    return out;
  }

  function rmsFromAnalyser(analyser) {
    if (!analyser) return 0;
    if (!buf || buf.length !== analyser.fftSize) {
      buf = new Float32Array(analyser.fftSize);
    }
    analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }

  function getRowHeightsScaled(nRows) {
    if (nRows === 0) return [];
    const wrap = canvas && canvas.parentElement;
    let maxH = 179;
    if (wrap && wrap.clientHeight > 0) maxH = wrap.clientHeight;
    const maxContent = Math.max(1, maxH - PAD_TOP);

    if (nRows === 1) {
      return [maxContent];
    }
    const raw = Array.from({ length: nRows }, () => ROW_H);
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    const scale = maxContent / sum;
    return raw.map(h => Math.max(1, h * scale));
  }

  function allocHistory(fullW) {
    const L = layerIds.length;
    if (!L) {
      history = [];
      historyW = fullW;
      return;
    }
    if (history && history.length === L && history[0] && history[0].length === fullW) {
      historyW = fullW;
      return;
    }
    const oldW = historyW;
    const oldHist = history;
    historyW = fullW;
    history = Array.from({ length: L }, () => new Float32Array(historyW));
    if (oldHist && oldHist.length === L && oldW > 0) {
      const cw = Math.min(oldW, historyW);
      for (let li = 0; li < L; li++) {
        for (let c = 0; c < cw; c++) {
          history[li][c] = oldHist[li][c];
        }
      }
      col = col % historyW;
    } else {
      col = 0;
    }
  }

  function resize() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const wrap = canvas.parentElement;
    const w = Math.max(200, wrap.clientWidth);
    allocHistory(w);

    const vis = getVisibleIndices();
    const n = vis.length;
    const heights = getRowHeightsScaled(Math.max(1, n));
    const totalRowH = heights.reduce((a, h) => a + h, 0);
    const h = PAD_TOP + totalRowH;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawWaveColumn(x, y0, rowInner, v) {
    if (v < 0.002) return;
    ctx.fillStyle = ACCENT;
    ctx.globalAlpha = 0.2 + v * 0.8;
    ctx.fillRect(x, y0 + rowInner * (1 - v), 1, Math.max(0.5, rowInner * v));
    ctx.globalAlpha = 1;
  }

  function draw() {
    raf = requestAnimationFrame(draw);
    if (!ctx || !canvas) return;

    const now = performance.now();
    if (lastFrameTime > 0) {
      const dt = now - lastFrameTime;
      if (dt > 0 && dt < 200) frameMs = frameMs * 0.92 + dt * 0.08;
    }
    lastFrameTime = now;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    const eng = window.__PROC_ENGINE;
    const st = eng && eng.getState ? eng.getState() : null;

    if (timeSpanEl) {
      const raw = st && typeof st.elapsedSec === 'number' ? st.elapsedSec : 0;
      const s = Math.floor(Math.max(0, raw));
      const m = Math.floor(s / 60);
      const r = s % 60;
      timeSpanEl.textContent = `${m}:${String(r).padStart(2, '0')}`;
      timeSpanEl.title = 'Playback time';
    }

    const playing = !!(st && st.playing);

    if (!layerIds.length) return;

    const analysers = eng && eng.getLayerAnalysers ? eng.getLayerAnalysers() : {};

    const vis = getVisibleIndices();
    const n = vis.length;
    if (
      W !== historyW ||
      !history ||
      history.length !== layerIds.length ||
      (history[0] && history[0].length !== W)
    ) {
      resize();
      return;
    }

    const numLayers = layerIds.length;

    if (playing && numLayers > 0) {
      for (let li = 0; li < numLayers; li++) {
        const id = layerIds[li];
        const a = analysers[id];
        const v = a ? Math.min(1, rmsFromAnalyser(a) * 4.5) : 0;
        history[li][col] = v;
      }
      col = (col + 1) % historyW;
      for (let i = 0; i < scrollMarkers.length; i++) {
        scrollMarkers[i].x -= 1;
      }
      scrollMarkers = scrollMarkers.filter(m => m.x > -80);
    }

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    for (let x = 0; x < W; x += 40) {
      ctx.strokeStyle = GRID;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    const heights = getRowHeightsScaled(Math.max(1, n));
    if (n === 0) return;

    let y = PAD_TOP;
    for (let r = 0; r < n; r++) {
      const rowH = heights[r];
      const rowInner = Math.max(1, rowH - 1);
      const y0 = y;
      const li = vis[r];

      const newest = (col - 1 + W) % W;
      for (let x = 0; x < W; x++) {
        const distFromRight = W - 1 - x;
        const src = (newest - distFromRight + W * 2) % W;
        const v = history[li][src];
        drawWaveColumn(x, y0, rowInner, v);
      }

      y += rowH;
    }

    ctx.strokeStyle = 'rgba(255,171,0,0.15)';
    y = PAD_TOP;
    for (let r = 1; r < n; r++) {
      y += heights[r - 1];
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    ctx.font = '9px JetBrains Mono, ui-monospace, monospace';
    ctx.textAlign = 'left';
    scrollMarkers.forEach(m => {
      const x = m.x;
      const nearEdge = Math.abs(x - (W - 1)) < 3;
      ctx.strokeStyle = nearEdge ? MARKER_GLOW : MARKER_COLOR;
      ctx.lineWidth = nearEdge ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, PAD_TOP);
      ctx.lineTo(x + 0.5, H);
      ctx.stroke();
      ctx.lineWidth = 1;
      const short = m.label.length > 16 ? m.label.slice(0, 14) + '...' : m.label;
      const tx = Math.min(Math.max(2, x + 3), W - 78);
      ctx.fillStyle = MARKER_TEXT;
      ctx.fillText(short, tx, 11);
    });
  }

  function init(ids) {
    layerIds = ids.slice();
    canvas = document.getElementById('arrangement-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    timeSpanEl = document.getElementById('arrangement-time-span');

    resize();
    window.addEventListener('resize', resize);
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  }

  function setFocusLayer(id) {
    focusLayerId = id && layerIds.includes(id) ? id : null;
    resize();
  }

  function onPhaseMarker(label) {
    if (label == null || label === '') return;
    const wrap = canvas && canvas.parentElement;
    const w = Math.max(200, wrap ? wrap.clientWidth : 400);
    const stagger = Math.min(24, scrollMarkers.length * 3);
    scrollMarkers.push({ x: w - 1 - stagger, label: String(label) });
  }

  window.ArrangementLive = { init, resize, setFocusLayer, onPhaseMarker };
})();
