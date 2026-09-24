/*
 * Minimal dependency-free SVG charts: horizontal bars, columns, butterfly
 * (paired diverging bars) and a labelled scatter. Every mark has a hover
 * tooltip; colours come from CSS tokens so light/dark themes just work.
 */
(function (root) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function text(parent, x, y, str, attrs) {
    var t = el("text", Object.assign({ x: x, y: y }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }

  /* ---------------- tooltip ---------------- */
  var tip;
  function ensureTip() {
    if (!tip) {
      tip = document.getElementById("tooltip");
      if (!tip) { tip = document.createElement("div"); tip.id = "tooltip"; document.body.appendChild(tip); }
      tip.setAttribute("role", "tooltip");
    }
    return tip;
  }
  function showTip(evt, html) {
    var t = ensureTip();
    t.innerHTML = html;
    t.classList.add("show");
    moveTip(evt);
  }
  function moveTip(evt) {
    var t = ensureTip();
    var pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    var x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
    t.style.left = Math.max(8, x) + "px";
    t.style.top = Math.max(8, y) + "px";
  }
  function hideTip() { ensureTip().classList.remove("show"); }
  function bindTip(node, html, group) {
    node.addEventListener("mouseenter", function (e) { showTip(e, html); if (group) group.classList.add("hover"); });
    node.addEventListener("mousemove", moveTip);
    node.addEventListener("mouseleave", function () { hideTip(); if (group) group.classList.remove("hover"); });
    node.addEventListener("touchstart", function (e) { var t = e.touches[0]; showTip({ clientX: t.clientX, clientY: t.clientY }, html); }, { passive: true });
  }

  /* ---------------- helpers ---------------- */
  function niceStep(range, target) {
    var raw = range / Math.max(1, target);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
    return step * mag;
  }
  function ticks(lo, hi, target) {
    var step = niceStep(hi - lo || 1, target || 5);
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function widthOf(container) { return Math.max(280, container.clientWidth || 600); }
  function color(v, opts) {
    if (opts.color) return typeof opts.color === "function" ? opts.color(v) : opts.color;
    return v < 0 ? "var(--neg)" : "var(--pos)";
  }

  // Bar path with 4px rounded corners on the data end only.
  function hBarPath(x0, x1, y, h) {
    var r = Math.min(4, Math.abs(x1 - x0) / 2, h / 2);
    if (x1 >= x0) {
      return "M" + x0 + "," + y + "H" + (x1 - r) + "Q" + x1 + "," + y + " " + x1 + "," + (y + r) +
        "V" + (y + h - r) + "Q" + x1 + "," + (y + h) + " " + (x1 - r) + "," + (y + h) + "H" + x0 + "Z";
    }
    return "M" + x0 + "," + y + "H" + (x1 + r) + "Q" + x1 + "," + y + " " + x1 + "," + (y + r) +
      "V" + (y + h - r) + "Q" + x1 + "," + (y + h) + " " + (x1 + r) + "," + (y + h) + "H" + x0 + "Z";
  }
  function vBarPath(x, w, y0, y1) {
    var r = Math.min(4, w / 2, Math.abs(y1 - y0) / 2);
    if (y1 <= y0) {
      return "M" + x + "," + y0 + "V" + (y1 + r) + "Q" + x + "," + y1 + " " + (x + r) + "," + y1 +
        "H" + (x + w - r) + "Q" + (x + w) + "," + y1 + " " + (x + w) + "," + (y1 + r) + "V" + y0 + "Z";
    }
    return "M" + x + "," + y0 + "V" + (y1 - r) + "Q" + x + "," + y1 + " " + (x + r) + "," + y1 +
      "H" + (x + w - r) + "Q" + (x + w) + "," + y1 + " " + (x + w) + "," + (y1 - r) + "V" + y0 + "Z";
  }

  /* ---------------- horizontal bars ---------------- */
  // rows: [{label, value, tip?}]  opts: {format, labelWidth, rowHeight, min, max, color}
  function hbar(container, rows, opts) {
    opts = opts || {};
    container.innerHTML = "";
    container.classList.add("chart");
    var fmt = opts.format || function (v) { return String(v); };
    var W = widthOf(container);
    var labelW = opts.labelWidth || Math.min(150, W * 0.3);
    var rowH = opts.rowHeight || 26, barH = Math.round(rowH * 0.62);
    var valPad = 56;
    var H = rows.length * rowH + 22;
    var vals = rows.map(function (r) { return r.value; });
    var lo = Math.min(0, opts.min != null ? opts.min : Math.min.apply(null, vals));
    var hi = Math.max(0, opts.max != null ? opts.max : Math.max.apply(null, vals));
    var leftPad = lo < 0 ? valPad : 0;
    var x0 = labelW + leftPad, x1 = W - valPad;
    var sx = function (v) { return x0 + (v - lo) / ((hi - lo) || 1) * (x1 - x0); };
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": opts.aria || "bar chart" }, container);

    var g = el("g", { class: "grid" }, svg);
    ticks(lo, hi, W < 480 ? 3 : 5).forEach(function (t) {
      el("line", { x1: sx(t), x2: sx(t), y1: 0, y2: rows.length * rowH }, g);
      text(svg, sx(t), rows.length * rowH + 16, fmt(t, true), { "text-anchor": "middle" });
    });
    el("line", { class: "zero", x1: sx(0), x2: sx(0), y1: 0, y2: rows.length * rowH }, svg);

    rows.forEach(function (r, i) {
      var y = i * rowH + (rowH - barH) / 2;
      var grp = el("g", { class: "mark" }, svg);
      text(grp, labelW - 8, y + barH / 2 + 4, r.label, { "text-anchor": "end", class: "lab" });
      if (r.value == null) return;
      el("path", { d: hBarPath(sx(0), sx(r.value), y, barH), fill: r.color || color(r.value, opts) }, grp);
      var vx = r.value >= 0 ? sx(r.value) + 6 : sx(r.value) - 6;
      text(grp, vx, y + barH / 2 + 4, fmt(r.value), { "text-anchor": r.value >= 0 ? "start" : "end", class: "val" });
      var hit = el("rect", { class: "hit", x: 0, y: i * rowH, width: W, height: rowH }, grp);
      bindTip(hit, r.tip || ("<b>" + r.label + "</b><br>" + fmt(r.value)));
    });
    return svg;
  }

  /* ---------------- vertical columns ---------------- */
  // rows: [{label, value, tip?}]  opts: {format, height, labelEvery, highlight: Set of labels}
  function columns(container, rows, opts) {
    opts = opts || {};
    container.innerHTML = "";
    container.classList.add("chart");
    var fmt = opts.format || function (v) { return String(v); };
    var W = widthOf(container), H = opts.height || 260;
    var padL = 40, padR = 8, padT = 12, padB = 26;
    var vals = rows.map(function (r) { return r.value; });
    var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
    var tk = ticks(lo, hi, 5);
    lo = Math.min(lo, tk[0]); hi = Math.max(hi, tk[tk.length - 1]);
    var sy = function (v) { return padT + (hi - v) / ((hi - lo) || 1) * (H - padT - padB); };
    var band = (W - padL - padR) / rows.length;
    var gap = Math.min(2, band * 0.2), bw = Math.max(1, band - gap);
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": opts.aria || "column chart" }, container);
    var g = el("g", { class: "grid" }, svg);
    tk.forEach(function (t) {
      el("line", { x1: padL, x2: W - padR, y1: sy(t), y2: sy(t) }, g);
      text(svg, padL - 6, sy(t) + 4, fmt(t, true), { "text-anchor": "end" });
    });
    el("line", { class: "zero", x1: padL, x2: W - padR, y1: sy(0), y2: sy(0) }, svg);
    var every = opts.labelEvery || Math.ceil(rows.length / Math.max(4, Math.floor(W / 60)));
    rows.forEach(function (r, i) {
      var x = padL + i * band + gap / 2;
      var grp = el("g", { class: "mark" }, svg);
      var fill = r.color || color(r.value, opts);
      el("path", { d: vBarPath(x, bw, sy(0), sy(r.value)), fill: fill, opacity: opts.highlight && !opts.highlight.has(r.label) ? 0.45 : 1 }, grp);
      if (i % every === 0) text(svg, x + bw / 2, H - 8, r.label, { "text-anchor": "middle" });
      var hit = el("rect", { class: "hit", x: padL + i * band, y: padT, width: band, height: H - padT - padB }, grp);
      bindTip(hit, r.tip || ("<b>" + r.label + "</b><br>" + fmt(r.value)));
    });
    return svg;
  }

  /* ---------------- butterfly: two measures, shared 0–max scale ---------------- */
  // rows: [{label, left, right, tip}] — left drawn leftwards (red), right rightwards (blue)
  function butterfly(container, rows, opts) {
    opts = opts || {};
    container.innerHTML = "";
    container.classList.add("chart");
    var fmt = opts.format || function (v) { return (v * 100).toFixed(0) + "%"; };
    var W = widthOf(container);
    var labelW = 60, rowH = 24, barH = 14, head = 22;
    var H = rows.length * rowH + head + 6;
    var max = opts.max || Math.max.apply(null, rows.map(function (r) { return Math.max(r.left, r.right); }).concat([0.01]));
    var mid = labelW + (W - labelW) / 2, half = (W - labelW) / 2 - 40;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": opts.aria || "paired bar chart" }, container);
    text(svg, mid - 8, 13, opts.leftTitle || "", { "text-anchor": "end" });
    text(svg, mid + 8, 13, opts.rightTitle || "", { "text-anchor": "start" });
    el("line", { class: "zero", x1: mid, x2: mid, y1: head - 4, y2: H }, svg);
    rows.forEach(function (r, i) {
      var y = head + i * rowH + (rowH - barH) / 2;
      var grp = el("g", { class: "mark" }, svg);
      text(grp, labelW - 8, y + barH / 2 + 4, r.label, { "text-anchor": "end", class: "lab" });
      var lw = r.left / max * half, rw = r.right / max * half;
      el("path", { d: hBarPath(mid - 1, mid - 1 - lw, y, barH), fill: "var(--neg)" }, grp);
      el("path", { d: hBarPath(mid + 1, mid + 1 + rw, y, barH), fill: "var(--pos)" }, grp);
      text(grp, mid - lw - 6, y + barH / 2 + 4, fmt(r.left), { "text-anchor": "end", class: "val" });
      text(grp, mid + rw + 6, y + barH / 2 + 4, fmt(r.right), { "text-anchor": "start", class: "val" });
      var hit = el("rect", { class: "hit", x: 0, y: head + i * rowH, width: W, height: rowH }, grp);
      bindTip(hit, r.tip || r.label);
    });
    return svg;
  }

  /* ---------------- labelled scatter ---------------- */
  // points: [{x, y, r?, label, tip}] opts: {xLabel, yLabel, xFormat, yFormat, height}
  function scatter(container, points, opts) {
    opts = opts || {};
    container.innerHTML = "";
    container.classList.add("chart");
    var W = widthOf(container), H = opts.height || 340;
    var padL = 44, padR = 16, padT = 14, padB = 40;
    var xf = opts.xFormat || String, yf = opts.yFormat || String;
    var xs = points.map(function (p) { return p.x; }), ys = points.map(function (p) { return p.y; });
    var xt = ticks(opts.xMin != null ? opts.xMin : Math.min.apply(null, xs), opts.xMax != null ? opts.xMax : Math.max.apply(null, xs), 5);
    var yt = ticks(opts.yMin != null ? opts.yMin : Math.min.apply(null, ys), opts.yMax != null ? opts.yMax : Math.max.apply(null, ys), 5);
    var x0 = xt[0], x1 = xt[xt.length - 1], y0 = yt[0], y1 = yt[yt.length - 1];
    var sx = function (v) { return padL + (v - x0) / ((x1 - x0) || 1) * (W - padL - padR); };
    var sy = function (v) { return padT + (y1 - v) / ((y1 - y0) || 1) * (H - padT - padB); };
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": opts.aria || "scatter plot" }, container);
    var g = el("g", { class: "grid" }, svg);
    xt.forEach(function (t) { el("line", { x1: sx(t), x2: sx(t), y1: padT, y2: H - padB }, g); text(svg, sx(t), H - padB + 16, xf(t), { "text-anchor": "middle" }); });
    yt.forEach(function (t) { el("line", { x1: padL, x2: W - padR, y1: sy(t), y2: sy(t) }, g); text(svg, padL - 6, sy(t) + 4, yf(t), { "text-anchor": "end" }); });
    if (opts.xLabel) text(svg, (padL + W - padR) / 2, H - 4, opts.xLabel, { "text-anchor": "middle" });
    if (opts.yLabel) text(svg, 12, (padT + H - padB) / 2, opts.yLabel, { "text-anchor": "middle", transform: "rotate(-90 12 " + (padT + H - padB) / 2 + ")" });
    // Labels: try right, left, above, below; drop the label (tooltip remains) if all collide.
    var placed = [];
    points.forEach(function (p) { var r = p.r || 5; placed.push({ x: sx(p.x) - r, y: sy(p.y) - r, w: 2 * r, h: 2 * r }); });
    // draw larger first so small points stay on top
    points.slice().sort(function (a, b) { return (b.r || 5) - (a.r || 5); }).forEach(function (p) {
      var grp = el("g", { class: "mark" }, svg);
      var cx = sx(p.x), cy = sy(p.y), r = p.r || 5;
      el("circle", { cx: cx, cy: cy, r: r, fill: p.color || "var(--series-1)", "fill-opacity": 0.8, stroke: "var(--surface-1)", "stroke-width": 2 }, grp);
      var lw = String(p.label).length * 7 + 2, lh = 12;
      var cands = [[cx + r + 3, cy + 4, "start"], [cx - r - 3, cy + 4, "end"], [cx, cy - r - 4, "middle"], [cx, cy + r + 12, "middle"]];
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i];
        var bx = c[2] === "start" ? c[0] : c[2] === "end" ? c[0] - lw : c[0] - lw / 2;
        var box = { x: bx, y: c[1] - 10, w: lw, h: lh };
        var ownDot = { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
        var others = placed.filter(function (o) { return !(o.x === ownDot.x && o.y === ownDot.y); });
        var hit = others.some(function (o) { return box.x < o.x + o.w && box.x + box.w > o.x && box.y < o.y + o.h && box.y + box.h > o.y; });
        if (!hit && box.x >= padL && box.x + box.w <= W) {
          text(grp, c[0], c[1], p.label, { class: "val", "text-anchor": c[2] });
          placed.push(box);
          break;
        }
      }
      var hit = el("circle", { class: "hit", cx: cx, cy: cy, r: Math.max(r + 6, 12) }, grp);
      bindTip(hit, p.tip || p.label);
    });
    return svg;
  }

  root.Charts = { hbar: hbar, columns: columns, butterfly: butterfly, scatter: scatter, showTip: showTip, hideTip: hideTip };
})(window);
