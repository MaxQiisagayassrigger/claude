/*
 * UI helpers: DOM shortcuts, number formatting, sparklines, storage and
 * the shared tooltip.
 */
(function (root) {
  "use strict";
  var BSX = root.BSX;
  var Cal = BSX.Cal;

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function decimalsFor(x) {
    var ax = Math.abs(x);
    if (ax === 0) return 2;
    if (ax >= 1) return 2;
    if (ax >= 0.01) return 4;
    if (ax >= 0.0001) return 6;
    return 8;
  }
  function num(x, d) {
    if (x == null || !isFinite(x)) return "—";
    if (d == null) d = decimalsFor(x);
    return x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function price(x, d) { return x == null || !isFinite(x) ? "—" : num(x, d); }
  function money(x, d) {
    if (x == null || !isFinite(x)) return "—";
    var neg = x < 0;
    return (neg ? "−$" : "$") + num(Math.abs(x), d == null ? 2 : d);
  }
  function money0(x) { return money(x, 0); }
  function signedMoney(x, d) {
    if (x == null || !isFinite(x)) return "—";
    return (x > 0 ? "+" : x < 0 ? "−" : "") + "$" + num(Math.abs(x), d == null ? 2 : d);
  }
  function compact(x, prefix) {
    if (x == null || !isFinite(x)) return "—";
    var ax = Math.abs(x), s;
    if (ax >= 1e12) s = (ax / 1e12).toFixed(2) + "T";
    else if (ax >= 1e9) s = (ax / 1e9).toFixed(ax >= 1e11 ? 0 : 1) + "B";
    else if (ax >= 1e6) s = (ax / 1e6).toFixed(ax >= 1e8 ? 0 : 1) + "M";
    else if (ax >= 1e3) s = (ax / 1e3).toFixed(ax >= 1e5 ? 0 : 1) + "K";
    else s = ax.toFixed(ax >= 100 ? 0 : 1);
    return (x < 0 ? "−" : "") + (prefix || "") + s;
  }
  function pct(x, d) {
    if (x == null || !isFinite(x)) return "—";
    return (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(d == null ? 2 : d) + "%";
  }
  function pctU(x, d) { return x == null || !isFinite(x) ? "—" : (x * 100).toFixed(d == null ? 1 : d) + "%"; }
  function bp(x) { return x == null || !isFinite(x) ? "—" : (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(Math.round(x)) + " bp"; }
  function cls(x) { return x > 1e-12 ? "up" : x < -1e-12 ? "down" : ""; }
  function qty(x) {
    if (x == null) return "—";
    return Math.abs(x - Math.round(x)) < 1e-9 ? Math.round(x).toLocaleString("en-US") : (+x.toFixed(6)).toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  function dateNice(d) { return Cal.nice(d); }
  function dateShort(d) { return Cal.short(d); }
  function when(day, tick) {
    var t = tick < 0 ? "Pre-mkt" : tick >= Cal.TICKS_PER_DAY ? "4:00 pm" : Cal.tickTime(tick);
    return Cal.short(day) + " " + t;
  }

  // Price formatted for the asset's conventions.
  function assetPx(a, x) {
    if (x == null) x = a.px;
    if (!isFinite(x)) return "—";
    if (a.type === "fx") return x.toFixed(a.quote === "JPY" ? 3 : 5);
    if (a.type === "bond") return x.toFixed(3);
    if (a.type === "index") return num(x, 2);
    if (a.type === "future") return num(x, a.tick < 0.01 ? 4 : a.tick < 0.1 ? 3 : 2);
    return num(x);
  }
  function change(a) { return a.prev ? a.px / a.prev - 1 : 0; }

  // Inline SVG sparkline.
  function spark(values, opts) {
    opts = opts || {};
    var n = values.length;
    if (n < 2) return '<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"></svg>';
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < n; i++) { var v = values[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (opts.base != null) { lo = Math.min(lo, opts.base); hi = Math.max(hi, opts.base); }
    var rng = hi - lo || 1;
    var W = 100, H = 30, pad = 2;
    var pts = [];
    for (var j = 0; j < n; j++) pts.push((j / (n - 1) * W).toFixed(2) + "," + (pad + (1 - (values[j] - lo) / rng) * (H - 2 * pad)).toFixed(2));
    var up = opts.up != null ? opts.up : values[n - 1] >= (opts.base != null ? opts.base : values[0]);
    var col = up ? "var(--pos)" : "var(--neg)";
    var base = opts.base != null ? '<line x1="0" x2="100" y1="' + (pad + (1 - (opts.base - lo) / rng) * (H - 2 * pad)).toFixed(2) + '" y2="' + (pad + (1 - (opts.base - lo) / rng) * (H - 2 * pad)).toFixed(2) + '" stroke="var(--border)" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="2 2"/>' : "";
    var area = '<path d="M0,' + H + " L" + pts.join(" L") + " L" + W + "," + H + ' Z" fill="' + col + '" fill-opacity=".08" stroke="none"/>';
    return '<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">' + base + area +
      '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + col + '" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
  }

  /* ---------------- Tooltip ---------------- */
  var tip;
  function tooltip() { return tip || (tip = document.getElementById("tooltip")); }
  function showTip(x, y, html) {
    var t = tooltip();
    t.innerHTML = html;
    t.classList.add("show");
    var pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    var left = x + pad, top = y + pad;
    if (left + w > window.innerWidth - 8) left = x - w - pad;
    if (top + h > window.innerHeight - 8) top = y - h - pad;
    t.style.left = Math.max(8, left) + "px";
    t.style.top = Math.max(8, top) + "px";
  }
  function hideTip() { tooltip().classList.remove("show"); }

  /* ---------------- Storage ---------------- */
  var prefs = {};
  function pref(k, v) {
    if (v === undefined) {
      if (k in prefs) return prefs[k];
      try { var raw = localStorage.getItem("bsx." + k); prefs[k] = raw == null ? undefined : JSON.parse(raw); } catch (e) { prefs[k] = undefined; }
      return prefs[k];
    }
    prefs[k] = v;
    try { localStorage.setItem("bsx." + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
  }

  // Saved games live in IndexedDB (price history is several MB).
  var DB_NAME = "broad-street", STORE = "saves";
  function db() {
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      } catch (e) { reject(e); }
    });
  }
  function idbPut(key, val) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(val, key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbGet(key) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction(STORE, "readonly");
        var r = tx.objectStore(STORE).get(key);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function idbDel(key) {
    return db().then(function (d) {
      return new Promise(function (resolve) {
        var tx = d.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    });
  }

  function debounce(fn, ms) {
    var t;
    return function () { var args = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, args); }, ms); };
  }

  BSX.UI = BSX.UI || {};
  BSX.UI.util = {
    $: $, $$: $$, esc: esc, num: num, price: price, money: money, money0: money0, signedMoney: signedMoney, compact: compact,
    pct: pct, pctU: pctU, bp: bp, cls: cls, qty: qty, dateNice: dateNice, dateShort: dateShort, when: when,
    assetPx: assetPx, change: change, spark: spark, showTip: showTip, hideTip: hideTip,
    pref: pref, idbPut: idbPut, idbGet: idbGet, idbDel: idbDel, debounce: debounce, decimalsFor: decimalsFor
  };
})(typeof self !== "undefined" ? self : this);
