/*
 * Canvas charts, dependency-free. Colors come from CSS tokens at draw
 * time, so theme switches only need a redraw. Every chart has a crosshair
 * or hover tooltip.
 *
 *   price(canvas, o)   candles or line with volume, moving averages and a
 *                      reference (previous close) line
 *   lines(canvas, o)   one or more series on a shared axis
 *   columns(canvas, o) vertical bars (e.g. GDP prints)
 *   treemap(canvas, o) squarified heatmap grouped by sector
 *   payoff(canvas, o)  option strategy P&L at expiry and today
 */
(function (root) {
  "use strict";
  var U = root.BSX.UI.util;

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function palette() {
    return {
      text: css("--text-primary"), text2: css("--text-secondary"), muted: css("--text-muted"),
      grid: css("--grid"), border: css("--border"), bg: css("--surface-1"), surface2: css("--surface-2"), surface3: css("--surface-3"),
      pos: css("--pos"), neg: css("--neg"), posSoft: css("--pos-soft"), negSoft: css("--neg-soft"), accent: css("--accent"),
      s1: css("--series-1"), s2: css("--series-2"), s3: css("--series-3"), s4: css("--series-4"), mono: css("--mono"), sans: css("--sans")
    };
  }

  function setup(canvas, height) {
    var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    var w = canvas.clientWidth || canvas.parentNode.clientWidth || 600;
    var h = height || canvas.clientHeight || 260;
    canvas.style.height = h + "px";
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function niceStep(range, target) {
    var raw = range / Math.max(1, target);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var n = raw / mag;
    var step = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
    return step * mag;
  }
  function ticks(lo, hi, target) {
    if (!(hi > lo)) { hi = lo + 1; lo = lo - 1; }
    var step = niceStep(hi - lo, target || 5);
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(12));
    return out;
  }

  // Pointer handling is bound once per canvas; each draw swaps the handler.
  function bindHover(canvas) {
    if (canvas._bound) return;
    canvas._bound = true;
    function move(e) {
      var r = canvas.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      canvas._hover = { x: x, y: y, cx: e.clientX, cy: e.clientY };
      if (canvas._redraw) canvas._redraw();
    }
    function leave() { canvas._hover = null; U.hideTip(); if (canvas._redraw) canvas._redraw(); }
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", move);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("click", function (e) { if (canvas._click) { var r = canvas.getBoundingClientRect(); canvas._click(e.clientX - r.left, e.clientY - r.top); } });
  }

  function mix(hexA, hexB, t) {
    var a = parseHex(hexA), b = parseHex(hexB);
    if (!a || !b) return t < 0.5 ? hexA : hexB;
    return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * t) + "," + Math.round(a[1] + (b[1] - a[1]) * t) + "," + Math.round(a[2] + (b[2] - a[2]) * t) + ")";
  }
  function parseHex(h) {
    h = (h || "").trim();
    if (h[0] !== "#") return null;
    if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function lum(color) { var c = parseHex(color) || (color.match(/\d+/g) || [128, 128, 128]).map(Number); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }

  function xLabelIdx(n, maxLabels) {
    var out = [];
    if (n <= 0) return out;
    var k = Math.max(1, Math.ceil(n / maxLabels));
    for (var i = 0; i < n; i += k) out.push(i);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Price chart                                                          */
  /* ------------------------------------------------------------------ */
  function sma(vals, n) {
    var out = new Array(vals.length), s = 0;
    for (var i = 0; i < vals.length; i++) {
      s += vals[i];
      if (i >= n) s -= vals[i - n];
      out[i] = i >= n - 1 ? s / n : null;
    }
    return out;
  }

  function price(canvas, o) {
    bindHover(canvas);
    canvas._click = null;
    canvas._redraw = function () { drawPrice(canvas, o); };
    drawPrice(canvas, o);
  }

  function drawPrice(canvas, o) {
    var P = palette();
    var s = setup(canvas, o.height || 300);
    var ctx = s.ctx, W = s.w, H = s.h;
    var candle = o.mode === "candle" && o.o;
    var c = o.c, n = c.length;
    if (!n) { ctx.fillStyle = P.muted; ctx.font = "13px " + P.sans; ctx.fillText("No history yet", 12, 24); return; }
    var hasVol = !!(o.v && o.v.some(function (x) { return x > 0; }));
    var fmt0 = o.fmt || function (x) { return U.num(x); };
    ctx.font = "600 11px " + P.mono;
    var maxC = Math.max.apply(null, c.map(Math.abs));
    var padL = 8, padR = Math.max(56, Math.ceil(ctx.measureText(fmt0(maxC * 1.1)).width) + 14), padT = 10, padB = 22;
    var volH = hasVol ? Math.round((H - padT - padB) * 0.18) : 0;
    var plotH = H - padT - padB - volH - (hasVol ? 6 : 0);
    var plotW = W - padL - padR;
    var lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < n; i++) {
      var l = candle ? o.l[i] : c[i], h = candle ? o.h[i] : c[i];
      if (l < lo) lo = l; if (h > hi) hi = h;
    }
    if (o.base != null) { lo = Math.min(lo, o.base); hi = Math.max(hi, o.base); }
    var smas = [];
    if (o.sma) o.sma.forEach(function (k, j) { if (n > k) { var arr = sma(c, k); smas.push({ k: k, v: arr, color: j ? P.s3 : P.s2 }); arr.forEach(function (x) { if (x != null) { if (x < lo) lo = x; if (x > hi) hi = x; } }); } });
    var pad = (hi - lo) * 0.06 || hi * 0.01 || 1;
    lo -= pad; hi += pad;
    var X = function (idx) { return padL + (n === 1 ? plotW / 2 : (idx + 0.5) * plotW / n); };
    var Y = function (v) { return padT + (1 - (v - lo) / (hi - lo)) * plotH; };
    var fmt = o.fmt || function (x) { return U.num(x); };

    // Grid + y labels
    ctx.font = "11px " + P.mono;
    ctx.textBaseline = "middle";
    ticks(lo, hi, 5).forEach(function (t) {
      var y = Math.round(Y(t)) + 0.5;
      ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = P.muted; ctx.textAlign = "left";
      ctx.fillText(fmt(t), W - padR + 6, y);
    });
    // x labels
    ctx.textBaseline = "top"; ctx.textAlign = "center";
    xLabelIdx(n, Math.max(2, Math.floor(plotW / 90))).forEach(function (idx) {
      ctx.fillStyle = P.muted;
      ctx.fillText(o.label(idx), Math.min(W - padR - 20, Math.max(padL + 20, X(idx))), H - padB + 6);
    });
    // Reference line (previous close)
    if (o.base != null) {
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
      var yb = Math.round(Y(o.base)) + 0.5;
      ctx.beginPath(); ctx.moveTo(padL, yb); ctx.lineTo(W - padR, yb); ctx.stroke(); ctx.restore();
    }
    var up = c[n - 1] >= (o.base != null ? o.base : c[0]);
    var lineCol = up ? P.pos : P.neg;
    if (candle) {
      var bw = Math.max(1, Math.min(12, plotW / n * 0.7));
      for (i = 0; i < n; i++) {
        var x = X(i), isUp = c[i] >= o.o[i];
        ctx.strokeStyle = ctx.fillStyle = isUp ? P.pos : P.neg;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, Y(o.h[i])); ctx.lineTo(Math.round(x) + 0.5, Y(o.l[i])); ctx.stroke();
        var y1 = Y(Math.max(o.o[i], c[i])), y2 = Y(Math.min(o.o[i], c[i]));
        ctx.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1));
      }
    } else {
      ctx.beginPath();
      for (i = 0; i < n; i++) { if (i) ctx.lineTo(X(i), Y(c[i])); else ctx.moveTo(X(i), Y(c[i])); }
      ctx.strokeStyle = lineCol; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();
      ctx.lineTo(X(n - 1), padT + plotH); ctx.lineTo(X(0), padT + plotH); ctx.closePath();
      var g = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      g.addColorStop(0, up ? P.posSoft : P.negSoft); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1;
    }
    smas.forEach(function (m) {
      ctx.beginPath(); var started = false;
      for (var j = 0; j < n; j++) { if (m.v[j] == null) continue; if (!started) { ctx.moveTo(X(j), Y(m.v[j])); started = true; } else ctx.lineTo(X(j), Y(m.v[j])); }
      ctx.strokeStyle = m.color; ctx.lineWidth = 1.2; ctx.stroke();
    });
    // Volume
    if (hasVol) {
      var vmax = 0; for (i = 0; i < n; i++) if (o.v[i] > vmax) vmax = o.v[i];
      var vTop = padT + plotH + 6, vbw = Math.max(1, plotW / n * 0.7);
      for (i = 0; i < n; i++) {
        var vh = vmax ? o.v[i] / vmax * volH : 0;
        ctx.fillStyle = (candle ? c[i] >= o.o[i] : (i === 0 || c[i] >= c[i - 1])) ? P.posSoft : P.negSoft;
        ctx.fillRect(X(i) - vbw / 2, vTop + volH - vh, vbw, vh);
      }
    }
    // Last value marker
    var ly = Y(c[n - 1]);
    ctx.fillStyle = lineCol;
    ctx.beginPath(); ctx.arc(X(n - 1), ly, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(W - padR + 1, ly - 9, padR - 2, 18);
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "600 11px " + P.mono;
    ctx.fillText(fmt(c[n - 1]), W - padR + 5, ly);

    // Crosshair
    var hv = canvas._hover;
    if (hv && hv.x >= padL && hv.x <= W - padR) {
      var idx = Math.max(0, Math.min(n - 1, Math.floor((hv.x - padL) / plotW * n)));
      var cx = X(idx);
      ctx.strokeStyle = P.muted; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(Math.round(cx) + 0.5, padT); ctx.lineTo(Math.round(cx) + 0.5, H - padB); ctx.stroke();
      if (hv.y >= padT && hv.y <= padT + plotH) { ctx.beginPath(); ctx.moveTo(padL, Math.round(hv.y) + 0.5); ctx.lineTo(W - padR, Math.round(hv.y) + 0.5); ctx.stroke(); }
      ctx.setLineDash([]);
      var html = "<b>" + U.esc(o.label(idx, true)) + "</b><br>";
      if (candle) html += "O " + fmt(o.o[idx]) + " · H " + fmt(o.h[idx]) + "<br>L " + fmt(o.l[idx]) + " · C " + fmt(c[idx]);
      else html += fmt(c[idx]);
      if (idx > 0) html += ' <span class="' + U.cls(c[idx] - c[idx - 1]) + '">' + U.pct(c[idx] / c[idx - 1] - 1) + "</span>";
      if (hasVol) html += "<br>Vol " + U.compact(o.v[idx]);
      smas.forEach(function (m) { if (m.v[idx] != null) html += "<br>" + m.k + "-day avg " + fmt(m.v[idx]); });
      U.showTip(hv.cx, hv.cy, html);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Multi-series lines                                                   */
  /* ------------------------------------------------------------------ */
  function lines(canvas, o) {
    bindHover(canvas);
    canvas._click = null;
    canvas._redraw = function () { drawLines(canvas, o); };
    drawLines(canvas, o);
  }

  function drawLines(canvas, o) {
    var P = palette();
    var s = setup(canvas, o.height || 220);
    var ctx = s.ctx, W = s.w, H = s.h;
    var series = o.series.filter(function (x) { return x.values && x.values.length; });
    var n = Math.max.apply(null, series.map(function (x) { return x.values.length; }).concat([0]));
    if (n < 2) { ctx.fillStyle = P.muted; ctx.font = "13px " + P.sans; ctx.fillText("Not enough history yet", 12, 24); return; }
    var padL = o.padL != null ? o.padL : 48, padR = 12, padT = 10, padB = 22;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var lo = Infinity, hi = -Infinity;
    series.forEach(function (sr) { sr.values.forEach(function (v) { if (v == null || !isFinite(v)) return; if (v < lo) lo = v; if (v > hi) hi = v; }); });
    if (o.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (o.min != null) lo = Math.min(lo, o.min);
    if (o.minRange && hi - lo < o.minRange) { var mid = (hi + lo) / 2; lo = mid - o.minRange / 2; hi = mid + o.minRange / 2; }
    var pad = (hi - lo) * 0.06 || 1;
    lo -= pad; hi += pad;
    var X = function (i) { return padL + i / (n - 1) * plotW; };
    var Y = function (v) { return padT + (1 - (v - lo) / (hi - lo)) * plotH; };
    var fmt = o.fmt || function (x) { return U.num(x); };
    ctx.font = "11px " + P.mono; ctx.textBaseline = "middle"; ctx.textAlign = "right";
    ticks(lo, hi, 4).forEach(function (t) {
      var y = Math.round(Y(t)) + 0.5;
      ctx.strokeStyle = t === 0 && o.zero ? P.muted : P.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = P.muted; ctx.fillText(fmt(t), padL - 6, y);
    });
    ctx.textBaseline = "top"; ctx.textAlign = "center";
    xLabelIdx(n, Math.max(2, Math.floor(plotW / 90))).forEach(function (i) {
      ctx.fillStyle = P.muted; ctx.fillText(o.label(i), Math.min(W - padR - 18, Math.max(padL + 18, X(i))), H - padB + 6);
    });
    var colors = [P.s1, P.s2, P.s3, P.s4];
    series.forEach(function (sr, k) {
      var col = sr.color ? css(sr.color) || sr.color : colors[k % 4];
      var off = n - sr.values.length;
      ctx.beginPath();
      var started = false;
      sr.values.forEach(function (v, i) {
        if (v == null || !isFinite(v)) return;
        if (sr.step && started) ctx.lineTo(X(i + off), ctx._lastY);
        if (!started) { ctx.moveTo(X(i + off), Y(v)); started = true; } else ctx.lineTo(X(i + off), Y(v));
        ctx._lastY = Y(v);
      });
      ctx.setLineDash(sr.dash ? [5, 4] : []);
      ctx.strokeStyle = col; ctx.lineWidth = sr.width || 1.6; ctx.lineJoin = "round"; ctx.stroke();
      ctx.setLineDash([]);
      if (sr.area) {
        ctx.lineTo(X(n - 1), padT + plotH); ctx.lineTo(X(off), padT + plotH); ctx.closePath();
        ctx.globalAlpha = 0.1; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
      }
      var last = sr.values[sr.values.length - 1];
      if (last != null) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(n - 1), Y(last), 2.8, 0, Math.PI * 2); ctx.fill(); }
    });
    var hv = canvas._hover;
    if (hv && hv.x >= padL - 4 && hv.x <= W - padR + 4) {
      var idx = Math.max(0, Math.min(n - 1, Math.round((hv.x - padL) / plotW * (n - 1))));
      ctx.strokeStyle = P.muted; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(X(idx)) + 0.5, padT); ctx.lineTo(Math.round(X(idx)) + 0.5, padT + plotH); ctx.stroke(); ctx.setLineDash([]);
      var html = "<b>" + U.esc(o.label(idx, true)) + "</b>";
      series.forEach(function (sr, k) {
        var off = n - sr.values.length, v = sr.values[idx - off];
        if (v == null) return;
        var col = sr.color ? css(sr.color) || sr.color : colors[k % 4];
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(idx), Y(v), 3.5, 0, Math.PI * 2); ctx.fill();
        html += '<br><span style="color:' + col + '">●</span> ' + U.esc(sr.label || "") + " " + (sr.fmt || fmt)(v);
      });
      U.showTip(hv.cx, hv.cy, html);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Columns                                                              */
  /* ------------------------------------------------------------------ */
  function columns(canvas, o) {
    bindHover(canvas);
    canvas._click = null;
    canvas._redraw = function () { drawColumns(canvas, o); };
    drawColumns(canvas, o);
  }
  function drawColumns(canvas, o) {
    var P = palette();
    var s = setup(canvas, o.height || 200);
    var ctx = s.ctx, W = s.w, H = s.h;
    var v = o.values, n = v.length;
    if (!n) { ctx.fillStyle = P.muted; ctx.font = "13px " + P.sans; ctx.fillText("No data yet", 12, 24); return; }
    var padL = 40, padR = 10, padT = 10, padB = 22;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var lo = Math.min(0, Math.min.apply(null, v)), hi = Math.max(0, Math.max.apply(null, v));
    var pad = (hi - lo) * 0.1 || 1; hi += pad; if (lo < 0) lo -= pad;
    var Y = function (x) { return padT + (1 - (x - lo) / (hi - lo)) * plotH; };
    var fmt = o.fmt || function (x) { return U.num(x, 1); };
    ctx.font = "11px " + P.mono; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ticks(lo, hi, 4).forEach(function (t) {
      var y = Math.round(Y(t)) + 0.5;
      ctx.strokeStyle = t === 0 ? P.muted : P.grid; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = P.muted; ctx.fillText(fmt(t), padL - 6, y);
    });
    var bw = plotW / n;
    var hv = canvas._hover, hi_ = -1;
    if (hv && hv.x >= padL && hv.x <= W - padR) hi_ = Math.floor((hv.x - padL) / bw);
    for (var i = 0; i < n; i++) {
      var y0 = Y(0), y1 = Y(v[i]);
      ctx.fillStyle = v[i] >= 0 ? P.pos : P.neg;
      ctx.globalAlpha = hi_ < 0 || hi_ === i ? 1 : 0.5;
      ctx.fillRect(padL + i * bw + bw * 0.18, Math.min(y0, y1), bw * 0.64, Math.max(1, Math.abs(y1 - y0)));
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = P.muted;
    xLabelIdx(n, Math.max(2, Math.floor(plotW / 60))).forEach(function (i) { ctx.fillText(o.label(i), padL + (i + 0.5) * bw, H - padB + 6); });
    if (hi_ >= 0 && hi_ < n) U.showTip(hv.cx, hv.cy, "<b>" + U.esc(o.label(hi_, true)) + "</b><br>" + fmt(v[hi_]));
  }

  /* ------------------------------------------------------------------ */
  /* Treemap                                                              */
  /* ------------------------------------------------------------------ */
  function squarify(items, x, y, w, h) {
    // items: [{value}] sorted desc. Returns rects in order.
    var out = [];
    var total = items.reduce(function (a, b) { return a + b.value; }, 0);
    if (total <= 0) return out;
    var scale = w * h / total;
    var rest = items.slice();
    while (rest.length) {
      var short = Math.min(w, h);
      var row = [], best = Infinity;
      for (var i = 0; i < rest.length; i++) {
        var cand = row.concat([rest[i]]);
        var sum = cand.reduce(function (a, b) { return a + b.value * scale; }, 0);
        var mx = 0, mn = Infinity;
        cand.forEach(function (c) { var a = c.value * scale; if (a > mx) mx = a; if (a < mn) mn = a; });
        var worst = Math.max(short * short * mx / (sum * sum), (sum * sum) / (short * short * mn));
        if (worst <= best) { best = worst; row = cand; } else break;
      }
      var rowSum = row.reduce(function (a, b) { return a + b.value * scale; }, 0);
      var thick = rowSum / short;
      var off = 0;
      row.forEach(function (c) {
        var len = c.value * scale / thick;
        if (w >= h) out.push({ item: c, x: x, y: y + off, w: thick, h: len });
        else out.push({ item: c, x: x + off, y: y, w: len, h: thick });
        off += len;
      });
      if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
      rest = rest.slice(row.length);
    }
    return out;
  }

  function treemap(canvas, o) {
    bindHover(canvas);
    var state = { rects: [] };
    canvas._redraw = function () { drawTreemap(canvas, o, state); };
    canvas._click = function (x, y) {
      var r = hit(state.rects, x, y);
      if (r && o.onClick) o.onClick(r.item);
    };
    drawTreemap(canvas, o, state);
  }
  function hit(rects, x, y) {
    for (var i = 0; i < rects.length; i++) { var r = rects[i]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r; }
    return null;
  }
  function drawTreemap(canvas, o, state) {
    var P = palette();
    var s = setup(canvas, o.height || 420);
    var ctx = s.ctx, W = s.w, H = s.h;
    var groups = o.groups; // [{label, items:[{id, value, change}]}]
    groups.forEach(function (g) { g.value = g.items.reduce(function (a, b) { return a + b.value; }, 0); g.items.sort(function (a, b) { return b.value - a.value; }); });
    groups.sort(function (a, b) { return b.value - a.value; });
    var outer = squarify(groups, 0, 0, W, H);
    var rects = [];
    var range = o.range || 0.03;
    var mid = P.surface3;
    outer.forEach(function (gr) {
      var g = gr.item;
      var head = gr.h > 40 && gr.w > 60 ? 15 : 0;
      var inner = squarify(g.items, gr.x + 1, gr.y + head + 1, Math.max(0, gr.w - 2), Math.max(0, gr.h - head - 2));
      inner.forEach(function (r) {
        var t = Math.max(-1, Math.min(1, r.item.change / range));
        var col = t >= 0 ? mix(mid, P.pos, Math.pow(t, 0.75)) : mix(mid, P.neg, Math.pow(-t, 0.75));
        ctx.fillStyle = col;
        ctx.fillRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.w - 1), Math.max(0, r.h - 1));
        r.col = col;
        rects.push(r);
      });
      if (head) {
        ctx.fillStyle = P.text2; ctx.font = "600 10px " + P.sans; ctx.textBaseline = "top"; ctx.textAlign = "left";
        ctx.fillText(g.label.toUpperCase(), gr.x + 4, gr.y + 3, gr.w - 8);
      }
      ctx.strokeStyle = P.bg; ctx.lineWidth = 2; ctx.strokeRect(gr.x + 1, gr.y + 1, gr.w - 2, gr.h - 2);
    });
    // Labels
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    rects.forEach(function (r) {
      if (r.w < 30 || r.h < 18) return;
      var dark = lum(r.col) < 0.55;
      ctx.fillStyle = dark ? "#fff" : "#111";
      var big = Math.min(r.w / 4.2, r.h / 2.6, 16);
      ctx.font = "600 " + Math.max(9, big) + "px " + P.mono;
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      if (r.h > 30) {
        ctx.fillText(r.item.id, cx, cy - big * 0.45, r.w - 4);
        ctx.font = Math.max(8, big * 0.72) + "px " + P.mono;
        ctx.fillText(U.pct(r.item.change, 1), cx, cy + big * 0.6, r.w - 4);
      } else ctx.fillText(r.item.id, cx, cy, r.w - 4);
    });
    state.rects = rects;
    var hv = canvas._hover;
    if (hv) {
      var rr = hit(rects, hv.x, hv.y);
      if (rr) {
        ctx.strokeStyle = P.text; ctx.lineWidth = 2; ctx.strokeRect(rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2);
        U.showTip(hv.cx, hv.cy, o.tip ? o.tip(rr.item) : rr.item.id);
        canvas.style.cursor = "pointer";
      } else { U.hideTip(); canvas.style.cursor = "default"; }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Option payoff                                                        */
  /* ------------------------------------------------------------------ */
  function payoff(canvas, o) {
    bindHover(canvas);
    canvas._click = null;
    canvas._redraw = function () { drawPayoff(canvas, o); };
    drawPayoff(canvas, o);
  }
  function drawPayoff(canvas, o) {
    var P = palette();
    var s = setup(canvas, o.height || 260);
    var ctx = s.ctx, W = s.w, H = s.h;
    var xs = o.xs, ye = o.expiry, yt = o.today, n = xs.length;
    var padL = 58, padR = 12, padT = 12, padB = 24;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var lo = Math.min(0, Math.min.apply(null, ye), yt ? Math.min.apply(null, yt) : 0);
    var hi = Math.max(0, Math.max.apply(null, ye), yt ? Math.max.apply(null, yt) : 0);
    var pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    var X = function (x) { return padL + (x - xs[0]) / (xs[n - 1] - xs[0]) * plotW; };
    var Y = function (v) { return padT + (1 - (v - lo) / (hi - lo)) * plotH; };
    ctx.font = "11px " + P.mono; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ticks(lo, hi, 5).forEach(function (t) {
      var y = Math.round(Y(t)) + 0.5;
      ctx.strokeStyle = t === 0 ? P.muted : P.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = P.muted; ctx.fillText(U.compact(t, "$"), padL - 6, y);
    });
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ticks(xs[0], xs[n - 1], Math.max(3, Math.floor(plotW / 80))).forEach(function (t) {
      if (t < xs[0] || t > xs[n - 1]) return;
      ctx.fillStyle = P.muted; ctx.fillText(U.num(t, t >= 100 ? 0 : 2), X(t), H - padB + 6);
    });
    // Profit / loss fill under the expiry line.
    var y0 = Y(0);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(X(xs[0]), y0);
    for (var i = 0; i < n; i++) ctx.lineTo(X(xs[i]), Y(ye[i]));
    ctx.lineTo(X(xs[n - 1]), y0); ctx.closePath();
    ctx.clip();
    ctx.fillStyle = P.posSoft; ctx.fillRect(padL, padT, plotW, y0 - padT);
    ctx.fillStyle = P.negSoft; ctx.fillRect(padL, y0, plotW, padT + plotH - y0);
    ctx.restore();
    ctx.beginPath();
    for (i = 0; i < n; i++) { if (i) ctx.lineTo(X(xs[i]), Y(ye[i])); else ctx.moveTo(X(xs[i]), Y(ye[i])); }
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.8; ctx.stroke();
    if (yt) {
      ctx.beginPath();
      for (i = 0; i < n; i++) { if (i) ctx.lineTo(X(xs[i]), Y(yt[i])); else ctx.moveTo(X(xs[i]), Y(yt[i])); }
      ctx.setLineDash([5, 4]); ctx.strokeStyle = P.accent; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    }
    // Spot and breakevens.
    ctx.strokeStyle = P.text2; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    var sx = Math.round(X(o.S)) + 0.5;
    ctx.beginPath(); ctx.moveTo(sx, padT); ctx.lineTo(sx, padT + plotH); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = P.text2; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.font = "10px " + P.sans;
    ctx.fillText("Now " + U.num(o.S, o.S >= 100 ? 0 : 2), Math.min(sx + 4, W - padR - 60), padT + 2);
    (o.breakevens || []).forEach(function (b) {
      if (b < xs[0] || b > xs[n - 1]) return;
      ctx.fillStyle = P.series2 || P.s2; ctx.beginPath(); ctx.arc(X(b), y0, 3.5, 0, Math.PI * 2); ctx.fill();
    });
    var hv = canvas._hover;
    if (hv && hv.x >= padL && hv.x <= W - padR) {
      var px = xs[0] + (hv.x - padL) / plotW * (xs[n - 1] - xs[0]);
      var k = Math.max(0, Math.min(n - 1, Math.round((px - xs[0]) / (xs[n - 1] - xs[0]) * (n - 1))));
      ctx.strokeStyle = P.muted; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(Math.round(X(xs[k])) + 0.5, padT); ctx.lineTo(Math.round(X(xs[k])) + 0.5, padT + plotH); ctx.stroke(); ctx.setLineDash([]);
      var html = "<b>At " + U.num(xs[k], xs[k] >= 100 ? 2 : 3) + "</b> (" + U.pct(xs[k] / o.S - 1, 1) + ")<br>Expiry: <span class=\"" + U.cls(ye[k]) + "\">" + U.signedMoney(ye[k], 0) + "</span>";
      if (yt) html += "<br>Today: <span class=\"" + U.cls(yt[k]) + "\">" + U.signedMoney(yt[k], 0) + "</span>";
      U.showTip(hv.cx, hv.cy, html);
    }
  }

  root.BSX.UI.charts = { price: price, lines: lines, columns: columns, treemap: treemap, payoff: payoff, palette: palette, mix: mix };
})(typeof self !== "undefined" ? self : this);
