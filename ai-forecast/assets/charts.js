/*
 * Dependency-free SVG charts for the forecast site: the forecast fan chart,
 * diverging bars for the forecast drivers, and the small range glyph used in
 * the forecast table. Colours come from CSS tokens so both themes work.
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
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
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
  function moveTip(evt) {
    var t = ensureTip();
    var pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    var x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
    t.style.left = Math.max(8, x) + "px";
    t.style.top = Math.max(8, y) + "px";
  }
  // `html` must already be escaped by the caller.
  function showTip(evt, html) {
    var t = ensureTip();
    t.innerHTML = html;
    t.classList.add("show");
    moveTip(evt);
  }
  function hideTip() { ensureTip().classList.remove("show"); }
  function bindTip(node, html) {
    node.addEventListener("pointerenter", function (e) { showTip(e, html); });
    node.addEventListener("pointermove", moveTip);
    node.addEventListener("pointerleave", hideTip);
    node.addEventListener("focus", function () {
      var r = node.getBoundingClientRect();
      showTip({ clientX: r.left + r.width / 2, clientY: r.top }, html);
    });
    node.addEventListener("blur", hideTip);
  }

  /* ---------------- scales & ticks ---------------- */
  function niceStep(range, target) {
    var raw = range / Math.max(1, target);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  }
  function ticks(lo, hi, target) {
    var step = niceStep(hi - lo || 1, target || 5), out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function widthOf(container) { return Math.max(280, container.clientWidth || 600); }
  function ms(iso) { var p = iso.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(t, withYear) {
    var d = new Date(t);
    return MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + (withYear ? ", " + d.getUTCFullYear() : "");
  }
  function pctChange(v, base) {
    var p = (v / base - 1) * 100;
    return (p > 0 ? "+" : p < 0 ? "−" : "") + Math.abs(p).toFixed(1) + "%";
  }

  /* ---------------- fan chart ---------------- */
  /*
   * d = {
   *   history: [[iso, close]] | null, path: [{date, days, 0.1, 0.25, 0.5, 0.75, 0.9, mean}],
   *   price, start, refs: [{label, value}], events: [{date, label}], fmt: price → string
   * }
   */
  function fan(container, d) {
    container.innerHTML = "";
    container.classList.add("chart");
    var fmt = d.fmt || function (v) { return v.toFixed(2); };
    var W = widthOf(container);
    var narrow = W < 520;
    var H = Math.round(Math.max(260, Math.min(400, W * 0.5)));
    var hist = (d.history || []).filter(function (r) { return r[0] <= d.start; });
    var path = d.path;
    // Right padding fits the longest end label (monospace, ~6.8px per character).
    var last = path[path.length - 1];
    var endChars = Math.max(fmt(last[0.9]).length, fmt(last[0.5]).length, fmt(last[0.1]).length) + (narrow ? 0 : 7);
    var padL = narrow ? 46 : 58, padR = Math.round(endChars * 6.8 + 16), padT = 18, padB = 28;
    var x1 = ms(path[path.length - 1].date);
    var x0 = hist.length ? ms(hist[0][0]) : ms(d.start) - (x1 - ms(d.start)) * 0.12;

    var vals = [];
    hist.forEach(function (r) { vals.push(r[1]); });
    path.forEach(function (p) { vals.push(p[0.1], p[0.9]); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var span = hi - lo;
    var refsIn = [], refsOut = [];
    (d.refs || []).forEach(function (r) {
      if (!(r.value > 0)) return;
      if (r.value >= lo - 0.3 * span && r.value <= hi + 0.3 * span) { refsIn.push(r); lo = Math.min(lo, r.value); hi = Math.max(hi, r.value); }
      else refsOut.push(r);
    });
    var yt = ticks(lo - 0.04 * (hi - lo), hi + 0.04 * (hi - lo), narrow ? 4 : 6);
    // Extend to whole ticks so nothing is drawn outside the axes.
    var ystep = yt.length > 1 ? yt[1] - yt[0] : (hi - lo || 1);
    while (yt[0] > lo) yt.unshift(+(yt[0] - ystep).toFixed(10));
    while (yt[yt.length - 1] < hi) yt.push(+(yt[yt.length - 1] + ystep).toFixed(10));
    var y0 = yt[0], y1 = yt[yt.length - 1];
    var sx = function (t) { return padL + (t - x0) / ((x1 - x0) || 1) * (W - padL - padR); };
    var sy = function (v) { return padT + (y1 - v) / ((y1 - y0) || 1) * (H - padT - padB); };

    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": d.aria || "Price history and 3-month forecast range" }, container);
    var g = el("g", { class: "grid" }, svg);
    yt.forEach(function (v) {
      el("line", { x1: padL, x2: W - padR, y1: sy(v), y2: sy(v) }, g);
      text(svg, padL - 6, sy(v) + 4, fmt(v, true), { "text-anchor": "end" });
    });
    // Month ticks.
    var dt = new Date(x0); dt = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1);
    var monthTicks = [];
    while (dt <= x1) { monthTicks.push(dt); var nd = new Date(dt); dt = Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth() + 1, 1); }
    var every = Math.ceil(monthTicks.length / Math.max(3, Math.floor((W - padL - padR) / 70)));
    monthTicks.forEach(function (t, i) {
      el("line", { x1: sx(t), x2: sx(t), y1: padT, y2: H - padB }, g);
      if (i % every === 0) {
        var md = new Date(t);
        text(svg, sx(t), H - 8, MONTHS[md.getUTCMonth()] + (md.getUTCMonth() === 0 || i === 0 ? " " + String(md.getUTCFullYear()).slice(2) : ""), { "text-anchor": "middle" });
      }
    });
    el("line", { class: "axis", x1: padL, x2: W - padR, y1: H - padB, y2: H - padB }, svg);

    function area(pLo, pHi) {
      var top = path.map(function (p) { return sx(ms(p.date)).toFixed(1) + "," + sy(p[pHi]).toFixed(1); });
      var bot = path.slice().reverse().map(function (p) { return sx(ms(p.date)).toFixed(1) + "," + sy(p[pLo]).toFixed(1); });
      return "M" + top.join("L") + "L" + bot.join("L") + "Z";
    }
    function line(key) { return "M" + path.map(function (p) { return sx(ms(p.date)).toFixed(1) + "," + sy(p[key]).toFixed(1); }).join("L"); }
    el("path", { d: area(0.1, 0.9), fill: "var(--band-80)" }, svg);
    el("path", { d: area(0.25, 0.75), fill: "var(--band-50)" }, svg);

    if (hist.length > 1) {
      el("path", {
        d: "M" + hist.map(function (r) { return sx(ms(r[0])).toFixed(1) + "," + sy(r[1]).toFixed(1); }).join("L"),
        fill: "none", stroke: "var(--history)", "stroke-width": 1.5, "stroke-linejoin": "round", "stroke-linecap": "round"
      }, svg);
    }

    // Today.
    var xt = sx(ms(d.start));
    el("line", { class: "today", x1: xt, x2: xt, y1: padT, y2: H - padB }, svg);
    // With history on the left, label "Today" on the history side.
    text(svg, hist.length ? xt - 4 : xt + 4, padT + 10, "Today", { "text-anchor": hist.length ? "end" : "start" });

    // Events (earnings) inside the window.
    (d.events || []).forEach(function (e) {
      var t = ms(e.date);
      if (t <= ms(d.start) || t > x1) return;
      var x = sx(t);
      el("line", { class: "ref", x1: x, x2: x, y1: padT, y2: H - padB }, svg);
      text(svg, x + 4, H - padB - 6, e.label, { "text-anchor": "start" });
    });

    // Reference prices (analyst target, 52-week high).
    refsIn.forEach(function (r) {
      el("line", { class: "ref", x1: padL, x2: W - padR, y1: sy(r.value), y2: sy(r.value) }, svg);
      text(svg, W - padR - 4, sy(r.value) - 4, r.label + " " + fmt(r.value), { "text-anchor": "end" });
    });
    refsOut.forEach(function (r, i) {
      var above = r.value > y1;
      var y = above ? padT + (narrow ? 24 : 10) + i * 13 : H - padB - 20 - i * 13;
      var label = narrow ? r.label.split(" ").pop() + " " + fmt(r.value) + (above ? " ↑" : " ↓") : r.label + " " + fmt(r.value) + (above ? " ↑ above chart" : " ↓ below chart");
      text(svg, W - padR - 4, y, label.charAt(0).toUpperCase() + label.slice(1), { "text-anchor": "end" });
    });

    el("path", { d: line("mean"), fill: "none", stroke: "var(--accent)", "stroke-width": 1.5, "stroke-dasharray": "5 4", "stroke-linecap": "round" }, svg);
    el("path", { d: line(0.5), fill: "none", stroke: "var(--accent)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);

    // End labels: median plus the 80% band edges, dropped if they would collide.
    var end = path[path.length - 1], xe = sx(ms(end.date));
    el("circle", { cx: xe, cy: sy(end[0.5]), r: 4.5, fill: "var(--accent)", stroke: "var(--surface-1)", "stroke-width": 2 }, svg);
    var labels = [
      { v: end[0.9], cls: "val", s: fmt(end[0.9]) + (narrow ? "" : " 90th") },
      { v: end[0.5], cls: "end", s: fmt(end[0.5]) + (narrow ? "" : " median") },
      { v: end[0.1], cls: "val", s: fmt(end[0.1]) + (narrow ? "" : " 10th") }
    ];
    var placed = [];
    labels.forEach(function (l) {
      var y = sy(l.v) + 4;
      if (placed.some(function (p) { return Math.abs(p - y) < 13; })) return;
      placed.push(y);
      text(svg, xe + 8, y, l.s, { class: l.cls, "text-anchor": "start" });
    });

    // Crosshair + tooltip over every history and forecast point.
    var pts = hist.map(function (r) { return { t: ms(r[0]), close: r[1] }; })
      .concat(path.map(function (p) { return { t: ms(p.date), f: p }; }));
    var cross = el("line", { class: "crosshair", x1: 0, x2: 0, y1: padT, y2: H - padB, visibility: "hidden" }, svg);
    var dot = el("circle", { r: 4, fill: "var(--accent)", stroke: "var(--surface-1)", "stroke-width": 2, visibility: "hidden" }, svg);
    var hit = el("rect", { class: "hit", x: padL, y: padT, width: W - padL - padR, height: H - padT - padB, tabindex: 0, "aria-label": "Move across the chart to read prices" }, svg);
    function nearest(clientX) {
      var box = svg.getBoundingClientRect();
      var x = (clientX - box.left) * (W / box.width);
      var best = pts[0], bd = Infinity;
      pts.forEach(function (p) { var dd = Math.abs(sx(p.t) - x); if (dd < bd) { bd = dd; best = p; } });
      return best;
    }
    function show(evt, p) {
      var x = sx(p.t);
      cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("visibility", "visible");
      var html;
      if (p.f) {
        var f = p.f;
        dot.setAttribute("cx", x); dot.setAttribute("cy", sy(f[0.5])); dot.setAttribute("visibility", "visible");
        html = '<div class="tt-head">' + esc(fmtDate(p.t, true)) + " · forecast, day " + f.days + "</div>" +
          [["90th pct", 0.9], ["75th pct", 0.75], ["Median", 0.5], ["25th pct", 0.25], ["10th pct", 0.1]].map(function (row) {
            return '<div class="tt-row"><span class="tt-key">' + esc(row[0]) + "</span><span><b>" + esc(fmt(f[row[1]])) + '</b> <span class="muted">' + pctChange(f[row[1]], d.price) + "</span></span></div>";
          }).join("") +
          '<div class="tt-row"><span class="tt-key"><i></i>Expected</span><span><b>' + esc(fmt(f.mean)) + '</b> <span class="muted">' + pctChange(f.mean, d.price) + "</span></span></div>";
      } else {
        dot.setAttribute("cx", x); dot.setAttribute("cy", sy(p.close)); dot.setAttribute("visibility", "visible");
        html = '<div class="tt-head">' + esc(fmtDate(p.t, true)) + '</div><div class="tt-row"><span class="tt-key">Close</span><b>' + esc(fmt(p.close)) + "</b></div>";
      }
      showTip(evt, html);
    }
    function clear() { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); hideTip(); }
    hit.addEventListener("pointermove", function (e) { show(e, nearest(e.clientX)); });
    hit.addEventListener("pointerleave", clear);
    var focusIdx = pts.length - 1;
    hit.addEventListener("focus", function () {
      var r = hit.getBoundingClientRect();
      show({ clientX: r.left + r.width * 0.8, clientY: r.top + 10 }, pts[focusIdx]);
    });
    hit.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      focusIdx = Math.max(0, Math.min(pts.length - 1, focusIdx + (e.key === "ArrowRight" ? 1 : -1)));
      var r = hit.getBoundingClientRect();
      show({ clientX: r.left + (sx(pts[focusIdx].t) - padL) * r.width / (W - padL - padR), clientY: r.top + 10 }, pts[focusIdx]);
    });
    hit.addEventListener("blur", clear);
    return svg;
  }

  /* ---------------- diverging horizontal bars ---------------- */
  // rows: [{label, value, tip, strong}]   opts: {format, labelWidth}
  function bars(container, rows, opts) {
    opts = opts || {};
    container.innerHTML = "";
    container.classList.add("chart");
    var fmt = opts.format || function (v) { return String(v); };
    var W = widthOf(container);
    var labelW = opts.labelWidth || Math.min(190, W * 0.38);
    var rowH = 28, barH = 14, valPad = 58;
    var H = rows.length * rowH + 6;
    var vals = rows.map(function (r) { return r.value; });
    var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
    var x0 = labelW + (lo < 0 ? valPad : 8), x1 = W - valPad;
    var sx = function (v) { return x0 + (v - lo) / ((hi - lo) || 1) * (x1 - x0); };
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": opts.aria || "bar chart" }, container);
    el("line", { class: "zero", x1: sx(0), x2: sx(0), y1: 0, y2: H }, svg);
    rows.forEach(function (r, i) {
      var y = i * rowH + (rowH - barH) / 2;
      var grp = el("g", { class: "mark" }, svg);
      if (r.strong && i > 0) el("line", { class: "axis", x1: 0, x2: W, y1: i * rowH, y2: i * rowH }, svg);
      text(grp, labelW - 8, y + barH / 2 + 4, r.label, { "text-anchor": "end", class: "lab", "font-weight": r.strong ? 600 : null });
      var a = sx(0), b = sx(r.value), w = Math.abs(b - a), rad = Math.min(4, w / 2, barH / 2);
      var left = Math.min(a, b);
      if (w > 0.5) {
        // Rounded on the data end only.
        var dPath = r.value >= 0
          ? "M" + a + "," + y + "H" + (b - rad) + "Q" + b + "," + y + " " + b + "," + (y + rad) + "V" + (y + barH - rad) + "Q" + b + "," + (y + barH) + " " + (b - rad) + "," + (y + barH) + "H" + a + "Z"
          : "M" + a + "," + y + "H" + (b + rad) + "Q" + b + "," + y + " " + b + "," + (y + rad) + "V" + (y + barH - rad) + "Q" + b + "," + (y + barH) + " " + (b + rad) + "," + (y + barH) + "H" + a + "Z";
        el("path", { d: dPath, fill: r.value >= 0 ? "var(--pos)" : "var(--neg)" }, grp);
      } else {
        el("rect", { x: left - 0.5, y: y, width: 1, height: barH, fill: "var(--axis)" }, grp);
      }
      var vx = r.value >= 0 ? b + 6 : b - 6;
      text(grp, vx, y + barH / 2 + 4, fmt(r.value), { "text-anchor": r.value >= 0 ? "start" : "end", class: "val", "font-weight": r.strong ? 600 : null });
      var hitR = el("rect", { class: "hit", x: 0, y: i * rowH, width: W, height: rowH, tabindex: 0 }, grp);
      if (r.tip) bindTip(hitR, r.tip);
      if (r.href) {
        hitR.style.cursor = "pointer";
        hitR.addEventListener("click", function () { location.hash = r.href; });
        hitR.addEventListener("keydown", function (e) { if (e.key === "Enter") location.hash = r.href; });
      }
    });
    return svg;
  }

  /* ---------------- range glyph for table rows (SVG string) ---------------- */
  // r: {q10, q25, q75, q90, mean}; dom: [lo, hi] shared by every row.
  function rangeGlyph(r, dom) {
    var W = 300, H = 24, pad = 6;
    var sx = function (v) { return pad + (v - dom[0]) / (dom[1] - dom[0]) * (W - 2 * pad); };
    var z = sx(0), cy = H / 2;
    var col = r.mean >= 0 ? "var(--pos)" : "var(--neg)";
    return '<svg viewBox="0 0 ' + W + " " + H + '" aria-hidden="true" focusable="false">' +
      '<line x1="' + z.toFixed(1) + '" x2="' + z.toFixed(1) + '" y1="2" y2="' + (H - 2) + '" stroke="var(--axis)" stroke-width="1"/>' +
      '<line x1="' + sx(r.q10).toFixed(1) + '" x2="' + sx(r.q90).toFixed(1) + '" y1="' + cy + '" y2="' + cy + '" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round"/>' +
      '<rect x="' + sx(r.q25).toFixed(1) + '" y="' + (cy - 4) + '" width="' + Math.max(1, sx(r.q75) - sx(r.q25)).toFixed(1) + '" height="8" rx="2" fill="var(--band-50)"/>' +
      '<circle cx="' + sx(r.mean).toFixed(1) + '" cy="' + cy + '" r="5" fill="' + col + '" stroke="var(--surface-1)" stroke-width="2"/>' +
      "</svg>";
  }

  root.Charts = { fan: fan, bars: bars, rangeGlyph: rangeGlyph, showTip: showTip, hideTip: hideTip, bindTip: bindTip, ticks: ticks };
})(window);
