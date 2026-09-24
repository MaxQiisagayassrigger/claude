/*
 * AI Megacap Forecast: views and routing.
 *
 *   #/            every stock's 3-month forecast, sortable and filterable
 *   #/s/<ticker>  one stock: fan chart, drivers, inputs, scenarios, thesis
 *   #/method      how the model works, the universe rules, backtest, sources
 */
(function () {
  "use strict";

  var U = window.AI_UNIVERSE;
  var G = window.AI_GENERATED || null;
  var F = window.Forecast;
  var C = window.Charts;

  /* ------------------------------------------------------------------ */
  /* Utilities                                                           */
  /* ------------------------------------------------------------------ */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem("aif:" + key));
      localStorage.setItem("aif:" + key, JSON.stringify(val));
    } catch (e) { return null; }
    return null;
  }
  // Fractions → percent strings.
  function pct(v, d, signed) {
    if (v == null || !isFinite(v)) return "—";
    var x = v * 100, s = Math.abs(x).toFixed(d == null ? 1 : d);
    if (Number(s) === 0) return (0).toFixed(d == null ? 1 : d) + "%";
    return (x < 0 ? "−" : signed === false ? "" : "+") + s + "%";
  }
  function prob(v) { return v == null || !isFinite(v) ? "—" : v < 0.01 ? "<1%" : v > 0.99 ? ">99%" : Math.round(v * 100) + "%"; }
  function signClass(v) { return v > 0 ? "up" : v < 0 ? "down" : ""; }

  var CCY = { USD: "$", EUR: "€", JPY: "¥", KRW: "₩", TWD: "NT$", HKD: "HK$" };
  function money(v, ccy, compact) {
    if (v == null || !isFinite(v)) return "—";
    var sym = CCY[ccy] || "";
    var digits = v >= 10000 || ccy === "KRW" || ccy === "JPY" ? 0 : v >= 1000 ? 0 : 2;
    if (compact && v >= 1e6) return sym + (v / 1e6).toFixed(2) + "M";
    return sym + v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  function moneyFmt(ccy) {
    return function (v, axis) {
      if (axis) {
        var sym = CCY[ccy] || "";
        if (v >= 1e6) return sym + (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + "M";
        if (v >= 1e4) return sym + (v / 1e3).toFixed(v % 1e3 ? 1 : 0) + "k";
        return sym + v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 2 : 0 });
      }
      return money(v, ccy);
    };
  }
  function mcap(b) { return b >= 1000 ? "$" + (b / 1000).toFixed(2) + "T" : "$" + Math.round(b) + "B"; }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(iso, withYear) {
    if (!iso) return "—";
    var p = iso.split("-");
    return MONTHS[+p[1] - 1] + " " + (+p[2]) + (withYear === false ? "" : ", " + p[0]);
  }

  // Source citations, numbered in declaration order.
  var sourceIds = Object.keys(U.sources);
  function cite(ids) {
    if (!ids) return "";
    if (!Array.isArray(ids)) ids = [ids];
    return ids.map(function (id) {
      var s = U.sources[id];
      if (!s) return "";
      return '<sup class="src"><a href="' + esc(s.u) + '" target="_blank" rel="noopener" title="' + esc(s.t) + '">[' + (sourceIds.indexOf(id) + 1) + "]</a></sup>";
    }).join("");
  }

  // The most common price date in the snapshot.
  var PRICE_DATE = (function () {
    var n = {};
    U.stocks.forEach(function (s) { n[s.asOf] = (n[s.asOf] || 0) + 1; });
    return Object.keys(n).sort(function (a, b) { return n[b] - n[a]; })[0];
  })();

  var SEG = {};
  U.segments.forEach(function (s) { SEG[s.key] = s; });
  var AI_LABEL = { core: "Core AI", major: "Major AI exposure", adjacent: "AI-adjacent" };
  var REGION_LABEL = { US: "U.S. listing", ADR: "U.S.-listed ADR", Europe: "European listing", Asia: "Asian listing" };

  // Charts render after their HTML is in the page; re-render on resize.
  var chartJobs = [];
  function chart(fn) { chartJobs.push(fn); }
  function flushCharts() { chartJobs.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }

  /* ------------------------------------------------------------------ */
  /* Model state                                                         */
  /* ------------------------------------------------------------------ */
  var BASE_MARKET = (U.macro.rf + U.macro.erp) / 100 * U.horizonDays / 252;
  var settings = Object.assign({ market3m: null, icScale: 1 }, store("settings") || {});
  var list = Object.assign({ q: "", seg: "all", sort: "er", dir: -1 }, store("list") || {});
  var model;
  function rebuild() {
    model = F.build(U, G, {
      rf: U.macro.rf / 100, erp: U.macro.erp / 100, marketVol: U.macro.marketVol / 100,
      market3m: settings.market3m, icScale: settings.icScale
    });
  }
  function marketNow() { return model.market3m; }

  /* ------------------------------------------------------------------ */
  /* Shared pieces                                                       */
  /* ------------------------------------------------------------------ */
  function card(title, sub, body, cls) {
    return '<div class="card ' + (cls || "") + '">' + (title ? "<h3>" + title + "</h3>" : "") + (sub ? '<div class="sub">' + sub + "</div>" : "") + body + "</div>";
  }

  function settingsPanel() {
    var m = marketNow();
    var scen = settings.market3m == null ? "base" : Math.abs(settings.market3m + 0.10) < 1e-9 ? "bear" : Math.abs(settings.market3m - 0.10) < 1e-9 ? "bull" : "custom";
    return '<details class="settings" id="settings"' + (store("settingsOpen") ? " open" : "") + ">" +
      "<summary><b>Model settings</b> · S&amp;P 500 over the next 3 months: <span class=\"mono\">" + pct(m) + "</span>" +
      (scen === "base" ? " (base case)" : "") + " · Weight on stock-specific signals: <span class=\"mono\">" + Math.round(settings.icScale * 100) + "%</span></summary>" +
      '<div class="controls">' +
      '<div class="control" style="flex:0 0 auto"><span class="lbl">Market scenario</span><div class="seg" role="group" aria-label="Market scenario">' +
      [["bear", "Bear −10%"], ["base", "Base " + pct(BASE_MARKET)], ["bull", "Bull +10%"]].map(function (b) {
        return '<button type="button" data-scen="' + b[0] + '" aria-pressed="' + (scen === b[0]) + '">' + b[1] + "</button>";
      }).join("") + "</div></div>" +
      '<div class="control"><label for="set-mkt">S&amp;P 500 3-month return <output id="out-mkt">' + pct(m) + '</output></label>' +
      '<input id="set-mkt" type="range" min="-20" max="20" step="0.5" value="' + (m * 100).toFixed(1) + '">' +
      '<span class="hint">Base case = 3-month T-bill (' + U.macro.rf.toFixed(2) + "%) plus a " + U.macro.erp.toFixed(1) + "% equity risk premium, for 3 months. Each stock moves with its beta.</span></div>" +
      '<div class="control"><label for="set-ic">Weight on stock-specific signals <output id="out-ic">' + Math.round(settings.icScale * 100) + '%</output></label>' +
      '<input id="set-ic" type="range" min="0" max="200" step="10" value="' + Math.round(settings.icScale * 100) + '">' +
      '<span class="hint">100% uses the research-based signal strengths. 0% leaves only the market and beta.</span></div>' +
      '<div class="control" style="flex:0 0 auto"><button type="button" id="set-reset">Reset</button></div>' +
      "</div></details>";
  }
  function wireSettings(rerender) {
    var det = $("#settings");
    if (!det) return;
    det.addEventListener("toggle", function () { store("settingsOpen", det.open); });
    function apply() { store("settings", settings); rebuild(); rerender(); }
    $$("[data-scen]", det).forEach(function (b) {
      b.addEventListener("click", function () {
        settings.market3m = { bear: -0.10, base: null, bull: 0.10 }[b.dataset.scen];
        apply();
      });
    });
    var t;
    $("#set-mkt").addEventListener("input", function (e) {
      settings.market3m = Number(e.target.value) / 100;
      $("#out-mkt").textContent = pct(settings.market3m);
      clearTimeout(t); t = setTimeout(apply, 120);
    });
    $("#set-ic").addEventListener("input", function (e) {
      settings.icScale = Number(e.target.value) / 100;
      $("#out-ic").textContent = e.target.value + "%";
      clearTimeout(t); t = setTimeout(apply, 120);
    });
    $("#set-reset").addEventListener("click", function () { settings = { market3m: null, icScale: 1 }; apply(); });
  }
  // Re-render the current view while keeping the scroll position and the
  // focused control (so dragging a slider keeps working).
  function rerenderKeep() {
    var y = window.scrollY, active = document.activeElement && document.activeElement.id;
    render();
    window.scrollTo(0, y);
    if (active && $("#" + active)) $("#" + active).focus();
  }

  /* ------------------------------------------------------------------ */
  /* View: all forecasts                                                 */
  /* ------------------------------------------------------------------ */
  var SORTS = {
    er: { label: "Expected return", get: function (r) { return r.er; } },
    pGain: { label: "Chance of a gain", get: function (r) { return r.pGain; } },
    upside: { label: "Analyst upside", get: function (r) { return r.targetMultiple ? r.targetMultiple - 1 : -Infinity; } },
    mcap: { label: "Market cap", get: function (r) { return r.stock.mcap; } },
    sigma: { label: "Volatility", get: function (r) { return r.sigma; } },
    t: { label: "Name", get: function (r) { return r.stock.n.toLowerCase(); } }
  };

  function filtered() {
    var q = list.q.trim().toLowerCase();
    return model.stocks.filter(function (r) {
      if (list.seg !== "all" && r.stock.seg !== list.seg) return false;
      if (!q) return true;
      return (r.t + " " + r.stock.n + " " + SEG[r.stock.seg].name).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      var s = SORTS[list.sort] || SORTS.er, va = s.get(a), vb = s.get(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * list.dir || a.t.localeCompare(b.t);
    });
  }

  function viewList() {
    var all = model.stocks.slice().sort(function (a, b) { return b.er - a.er; });
    var ers = all.map(function (r) { return r.er; }).sort(function (a, b) { return a - b; });
    var median = ers[Math.floor(ers.length / 2)];
    var caps = U.stocks.map(function (s) { return s.mcap; });
    var top = all[0], bottom = all[all.length - 1];
    var beat = all.filter(function (r) { return r.er > model.market3m; }).length;

    var h = '<div class="section-head"><div><h2>3-month forecasts for every AI stock worth $' + U.threshold + "B+</h2>" +
      "<p>" + U.stocks.length + " companies across AI chips, chip manufacturing, memory, servers, clouds, software and power. " +
      (G ? "Measured prices through " + esc(fmtDate(G.priceEnd)) + "; research as of " + esc(fmtDate(U.asOf)) + "."
        : "Research as of " + esc(fmtDate(U.asOf)) + "; most prices are " + esc(fmtDate(PRICE_DATE)) + " closes.") +
      " Select any stock to see its full forecast.</p></div></div>";

    h += '<div class="kpis">' +
      kpi("Stocks covered", String(U.stocks.length), "From " + mcap(Math.min.apply(null, caps)) + " to " + mcap(Math.max.apply(null, caps)) + " in market value") +
      kpi("Median expected return", pct(median), "Next 3 months. S&amp;P 500 assumption: " + pct(model.market3m)) +
      kpi("Highest expected", '<a class="value" href="#/s/' + encodeURIComponent(top.t) + '">' + esc(top.t) + ' <span class="up">' + pct(top.er) + "</span></a>", esc(top.stock.n), true) +
      kpi("Lowest expected", '<a class="value" href="#/s/' + encodeURIComponent(bottom.t) + '">' + esc(bottom.t) + ' <span class="' + signClass(bottom.er) + '">' + pct(bottom.er) + "</span></a>", esc(bottom.stock.n), true) +
      kpi("Expected to beat the S&amp;P 500", beat + " of " + all.length, "Expected return above the market assumption") +
      "</div>";

    h += '<div class="mt">' + settingsPanel() + "</div>";

    h += '<div class="controls">' +
      '<div class="control grow" style="max-width:340px"><label for="f-q">Search</label><input id="f-q" type="search" placeholder="Ticker or company" value="' + esc(list.q) + '" autocomplete="off"></div>' +
      '<div class="control"><label for="f-seg">Segment</label><select id="f-seg"><option value="all">All segments</option>' +
      U.segments.map(function (s) { return '<option value="' + s.key + '"' + (list.seg === s.key ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select></div>" +
      '<div class="control"><label for="f-sort">Sort by</label><select id="f-sort">' +
      Object.keys(SORTS).map(function (k) { return '<option value="' + k + '"' + (list.sort === k ? " selected" : "") + ">" + SORTS[k].label + "</option>"; }).join("") + "</select></div>" +
      "</div>";

    h += '<div class="card"><h3>Forecast for the next 3 months <span class="small muted" id="f-count"></span></h3>' +
      '<div class="range-legend"><span><i class="key-dot"></i>Expected return</span><span><i class="key-bar"></i>Middle 50% of outcomes</span><span><i class="key-line"></i>80% of outcomes</span></div>' +
      '<div class="table-wrap"><table id="f-table"><thead><tr>' +
      '<th class="sortable" data-k="t">Stock</th><th class="hide-sm">Segment</th><th class="num hide-sm">Price</th><th class="num sortable hide-sm" data-k="mcap">Mkt cap</th>' +
      '<th class="num sortable" data-k="er">Expected</th><th class="range-h">Range of outcomes<div id="range-axis"></div></th>' +
      '<th class="num sortable" data-k="pGain">Chance of gain</th><th class="num sortable hide-sm" data-k="upside">Analyst upside</th>' +
      "</tr></thead><tbody></tbody></table></div>" +
      '<p class="small muted" style="margin:10px 0 0">Expected = mean 3-month return. The bar covers the 25th–75th percentile outcomes; the line covers the 10th–90th. Returns are in each stock\'s trading currency.</p></div>';

    h += '<div class="grid g2 mt">';
    h += card("Expected return by segment", "Average of the stocks in each segment. Select a bar to filter the table.", '<div id="seg-chart"></div>');
    h += card("How to read these forecasts", "", '<ul class="bullets small">' +
      "<li><b>Expected return</b> starts from the T-bill rate plus each stock's share of the market's expected move (its beta). It then adds a small stock-specific tilt from analyst targets, distance from the 52-week high and revenue growth" + (G ? ", plus 12-month momentum and last-month reversal measured from daily prices" : "") + ".</li>" +
      "<li><b>The range matters more than the point.</b> Over three months a typical AI megacap can move ±20% or more. The model's edge is a few percentage points, not a crystal ball.</li>" +
      "<li><b>Chance of gain</b> is below 50% for some high-volatility stocks with positive expected returns. A few big winners pull the average up while the typical (median) outcome is lower.</li>" +
      "<li>Change the market scenario in <b>Model settings</b> to stress-test every forecast at once.</li>" +
      '</ul><p class="small" style="margin:8px 0 0"><a href="#/method">Full methodology, backtest and sources →</a></p>');
    h += "</div>";

    h += '<div class="callout mt"><strong>Just below the $' + U.threshold + "B line</strong>" +
      U.nearMisses.map(function (x) { return esc(x.n) + " (" + esc(x.t) + ", ~$" + x.mcap + "B)" + cite(x.src); }).join(" · ") +
      ". These are left out; see the <a href=\"#/method\">method page</a> for the inclusion rules.</div>";

    chart(function () {
      var segRows = U.segments.map(function (s) {
        var rs = model.stocks.filter(function (r) { return r.stock.seg === s.key; });
        var avg = rs.reduce(function (a, r) { return a + r.er; }, 0) / rs.length;
        return {
          label: s.name, value: avg * 100, href: null, key: s.key,
          tip: "<b>" + esc(s.name) + "</b><br>Average expected: " + pct(avg) + "<br>" + rs.length + " stocks: " + esc(rs.map(function (r) { return r.t; }).join(", "))
        };
      }).sort(function (a, b) { return b.value - a.value; });
      C.bars($("#seg-chart"), segRows, { format: function (v) { return pct(v / 100); }, aria: "Average expected 3-month return by segment" });
      $$("#seg-chart .hit").forEach(function (node, i) {
        node.style.cursor = "pointer";
        var go = function () { list.seg = segRows[i].key; store("list", list); render(); };
        node.addEventListener("click", go);
        node.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
      });
    });
    return h;
  }

  function kpi(label, value, note, raw) {
    return '<div class="kpi"><div class="label">' + label + "</div>" + (raw ? value : '<div class="value">' + value + "</div>") + '<div class="note">' + note + "</div></div>";
  }

  function renderTable() {
    var rows = filtered();
    var lo = Math.min.apply(null, model.stocks.map(function (r) { return r.q[0.1]; }));
    var hi = Math.max.apply(null, model.stocks.map(function (r) { return r.q[0.9]; }));
    var dom = [Math.floor(lo * 10) / 10, Math.ceil(hi * 10) / 10];
    // Axis for the range column: the same scale as every glyph.
    var tk = C.ticks(dom[0], dom[1], 4);
    $("#range-axis").innerHTML = tk.map(function (v, i) {
      var x = (6 + (v - dom[0]) / (dom[1] - dom[0]) * 288) / 300 * 100;
      var mid = v !== 0 && i > 0 && i < tk.length - 1;
      return '<span class="' + (mid ? "mid" : "") + '" style="left:' + x.toFixed(2) + '%">' + (v === 0 ? "0" : pct(v, 0)) + "</span>";
    }).join("");
    $("#f-count").textContent = rows.length === model.stocks.length ? "" : rows.length + " of " + model.stocks.length;
    $("#f-table tbody").innerHTML = rows.length ? rows.map(function (r) {
      var s = r.stock, up = r.targetMultiple ? r.targetMultiple - 1 : null;
      var tipAttr = esc(s.t + " · expected " + pct(r.er) + " · 80% of outcomes between " + pct(r.q[0.1], 0) + " and " + pct(r.q[0.9], 0));
      return '<tr class="link" data-t="' + esc(s.t) + '">' +
        '<td><a class="stock-cell" href="#/s/' + encodeURIComponent(s.t) + '"><span class="tk">' + esc(s.t) + '</span><span class="nm">' + esc(s.n) + "</span></a></td>" +
        '<td class="hide-sm small secondary nowrap">' + esc(SEG[s.seg].name) + "</td>" +
        '<td class="num hide-sm">' + money(r.price, s.ccy) + "</td>" +
        '<td class="num hide-sm">' + mcap(s.mcap) + "</td>" +
        '<td class="num er ' + signClass(r.er) + '">' + pct(r.er) + "</td>" +
        '<td class="range" title="' + tipAttr + '">' + C.rangeGlyph({ q10: r.q[0.1], q25: r.q[0.25], q75: r.q[0.75], q90: r.q[0.9], mean: r.er }, dom) + "</td>" +
        '<td class="num">' + prob(r.pGain) + "</td>" +
        '<td class="num hide-sm ' + signClass(up) + '">' + pct(up, 0) + "</td>" +
        "</tr>";
    }).join("") : '<tr><td colspan="8" class="muted">No stocks match.</td></tr>';
    $$("#f-table th[data-k]").forEach(function (th) {
      th.classList.add("sortable");
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.k === list.sort) th.classList.add(list.dir > 0 ? "sorted-asc" : "sorted-desc");
    });
  }

  function wireList() {
    renderTable();
    wireSettings(rerenderKeep);
    $("#f-q").addEventListener("input", function (e) { list.q = e.target.value; store("list", list); renderTable(); });
    $("#f-seg").addEventListener("change", function (e) { list.seg = e.target.value; store("list", list); renderTable(); });
    $("#f-sort").addEventListener("change", function (e) { list.sort = e.target.value; list.dir = list.sort === "t" ? 1 : -1; store("list", list); renderTable(); });
    $$("#f-table th[data-k]").forEach(function (th) {
      th.tabIndex = 0;
      var go = function () {
        var k = th.dataset.k;
        if (list.sort === k) list.dir = -list.dir; else { list.sort = k; list.dir = k === "t" ? 1 : -1; }
        $("#f-sort").value = list.sort;
        store("list", list); renderTable();
      };
      th.addEventListener("click", go);
      th.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    });
    $("#f-table tbody").addEventListener("click", function (e) {
      if (e.target.closest("a")) return;
      var tr = e.target.closest("tr[data-t]");
      if (tr) location.hash = "#/s/" + encodeURIComponent(tr.dataset.t);
    });
  }

  /* ------------------------------------------------------------------ */
  /* View: one stock                                                     */
  /* ------------------------------------------------------------------ */
  function viewStock(t) {
    var r = model.byTicker[t];
    if (!r) return '<div class="card"><h3>Not found</h3><p>No stock with ticker ' + esc(t) + ' is in the universe. <a href="#/">Back to all forecasts</a>.</p></div>';
    var s = r.stock, g = r.gen, fmt = moneyFmt(s.ccy);
    var order = model.stocks.slice().sort(function (a, b) { return b.er - a.er; });
    var idx = order.indexOf(r), prev = order[idx - 1], next = order[idx + 1];
    var rank = idx + 1;

    var h = '<div class="crumbs"><a href="#/">← All forecasts</a><span class="muted">Ranked ' + rank + " of " + order.length + " by expected return</span></div>";

    h += '<div class="stock-head"><div><h2>' + esc(s.n) + '<span class="tk">' + esc(s.t) + "</span></h2>" +
      '<div style="margin-top:6px"><span class="chip">' + esc(SEG[s.seg].name) + '</span><span class="chip' + (s.ai === "core" ? " core" : "") + '">' + esc(AI_LABEL[s.ai]) + '</span><span class="chip">' + esc(REGION_LABEL[s.region] || s.region) + "</span></div>" +
      '<p class="why">' + esc(s.why) + "</p></div>" +
      '<div class="px"><div class="big">' + money(r.price, s.ccy) + '</div><div class="small secondary">' + (g ? "Close " : "Last price ") + esc(fmtDate(r.start)) + (s.priceNote && !g ? " · " + esc(s.priceNote) : "") + "</div>" +
      '<div class="small secondary">Market value ' + mcap(s.mcap) + ' <span class="muted">(' + esc(s.mcapAsOf) + ")</span></div></div></div>";

    // Hero: the headline forecast and the probabilities around it.
    var endDate = fmtDate(r.end);
    h += '<div class="card"><div class="hero"><div class="hero-fig">' +
      '<div class="label">Expected return, next 3 months</div>' +
      '<div class="value ' + signClass(r.er) + '">' + pct(r.er) + "</div>" +
      '<div class="price">≈ ' + money(r.expectedPrice, s.ccy) + " by " + esc(endDate) + "</div>" +
      '<div class="note">The average outcome of the forecast distribution. The typical (median) outcome is ' + pct(r.median) + " (" + money(r.medianPrice, s.ccy) + "). Half of outcomes land above it and half below.</div>" +
      "</div><div class=\"tiles\">" +
      tile("Chance of a gain", prob(r.pGain), "Price above " + money(r.price, s.ccy) + " on " + fmtDate(r.end, false)) +
      tile("80% range", pct(r.q[0.1], 0) + " to " + pct(r.q[0.9], 0), money(r.price * (1 + r.q[0.1]), s.ccy) + " – " + money(r.price * (1 + r.q[0.9]), s.ccy)) +
      tile("50% range", pct(r.q[0.25], 0) + " to " + pct(r.q[0.75], 0), money(r.price * (1 + r.q[0.25]), s.ccy) + " – " + money(r.price * (1 + r.q[0.75]), s.ccy)) +
      tile("Beat the S&amp;P 500", prob(r.pBeatMarket), "Chance of beating the " + pct(model.market3m) + " market assumption") +
      tile("Big moves", "↑ " + prob(r.pUp20) + " · ↓ " + prob(r.pDown20), "Chance of a 20%+ gain or a 20%+ loss") +
      tile("Hit analyst target", r.targetMultiple > 1 ? prob(r.pTouchTarget) : "Already there", r.targetMultiple > 1 ? "Chance of trading at " + money(s.target, s.ccy) + " at some point by " + fmtDate(r.end, false) : "Price is at or above the " + money(s.target, s.ccy) + " average target") +
      "</div></div></div>";

    // Fan chart.
    var refs = [{ label: "Analyst target", value: s.target }];
    var hi52 = g && g.hi52 ? g.hi52 : s.hi52;
    if (hi52 && Math.abs(hi52 / s.target - 1) > 0.03) refs.push({ label: "52-week high", value: hi52 });
    var events = r.earningsInWindow ? [{ date: s.earnings, label: "Earnings" + (s.earningsConfirmed ? "" : " (est.)") }] : [];
    h += '<div class="card mt"><h3>Forecast path<span class="small muted">' + (g && g.history ? "Last " + g.history.length + " trading days, then the next " + model.params.horizonDays : "Next " + model.params.horizonDays + " trading days") + "</span></h3>" +
      '<div class="legend">' + (g && g.history ? '<span><i class="sw-hist"></i>Price history</span>' : "") +
      '<span><i class="sw-median"></i>Median path</span><span><i class="sw-mean"></i>Expected (mean)</span><span><i class="sw-band50"></i>50% of outcomes</span><span><i class="sw-band80"></i>80% of outcomes</span><span><i class="sw-ref"></i>Reference / event</span></div>' +
      '<div id="fan"></div>' +
      (g && g.history ? "" : '<p class="small muted" style="margin:8px 0 0">Price history appears here once the data pipeline has run (see <a href="#/method">Method</a>).</p>') +
      '<details class="table-toggle"><summary>Show the forecast as a table</summary><div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">10th pct</th><th class="num">25th</th><th class="num">Median</th><th class="num">75th</th><th class="num">90th pct</th><th class="num">Expected</th></tr></thead><tbody>' +
      r.path.filter(function (p) { return p.days > 0; }).map(function (p) {
        return "<tr><td>" + esc(fmtDate(p.date)) + '</td><td class="num">' + money(p[0.1], s.ccy) + '</td><td class="num">' + money(p[0.25], s.ccy) + '</td><td class="num">' + money(p[0.5], s.ccy) + '</td><td class="num">' + money(p[0.75], s.ccy) + '</td><td class="num">' + money(p[0.9], s.ccy) + '</td><td class="num">' + money(p.mean, s.ccy) + "</td></tr>";
      }).join("") + "</tbody></table></div></details></div>";

    // Drivers and inputs.
    h += '<div class="grid g2 mt">';
    var drivers = [
      { label: "Risk-free (T-bill)", value: r.rf, tip: "<b>" + pct(r.rf, 2) + "</b><br>3-month T-bill at " + U.macro.rf.toFixed(2) + "% a year" },
      { label: "Market × beta " + r.beta.toFixed(2), value: r.market, tip: "<b>" + pct(r.market, 2) + "</b><br>Beta " + r.beta.toFixed(2) + " × the market's " + pct(model.market3m - model.rfT, 2) + " excess return<br>" + esc(r.betaSource) }
    ].concat(r.contribs.map(function (c) {
      var sig = model.signals.filter(function (x) { return x.key === c.key; })[0];
      return { label: c.short, value: c.value, tip: "<b>" + pct(c.value, 2) + "</b><br>" + esc(c.label) + "<br>This stock: " + rawText(c.key, c.raw) + " · z-score " + c.z.toFixed(2) + "<br>Weight " + sig.weight.toFixed(3) + " (IC " + sig.icUsed.toFixed(3) + ")" };
    })).concat([{ label: "Expected return", value: r.er, strong: true, tip: "<b>" + pct(r.er, 2) + "</b><br>Sum of the rows above" }]);
    h += card("What drives this forecast", "Percentage points of expected 3-month return. Stock-specific rows compare " + esc(s.t) + " with the other " + (model.stocks.length - 1) + " stocks.",
      '<div id="drivers"></div><div class="table-wrap"><table class="small" style="margin-top:8px"><thead><tr><th>Signal</th><th class="num">This stock</th><th class="num">z-score</th><th class="num">Adds</th></tr></thead><tbody>' +
      r.contribs.map(function (c) {
        return "<tr><td>" + esc(c.label) + '</td><td class="num">' + rawText(c.key, c.raw) + '</td><td class="num">' + c.z.toFixed(2) + '</td><td class="num ' + signClass(c.value) + '">' + pct(c.value, 2) + "</td></tr>";
      }).join("") + "</tbody></table></div>");

    var inputs = [
      ["Volatility (annual)", pct(r.sigma, 0, false) + '<div class="small muted">' + esc(r.volSource) + "</div>"],
      ["Beta to the S&amp;P 500", r.beta.toFixed(2) + '<div class="small muted">' + esc(r.betaSource) + "</div>"],
      ["Analyst target (12-month)", money(s.target, s.ccy) + ' <span class="' + signClass(r.targetMultiple - 1) + '">(' + pct(r.targetMultiple - 1, 0) + ")</span>" +
        '<div class="small muted">' + (s.analysts ? s.analysts + " analysts · " : "") + esc(s.rating) + "</div>"],
      ["52-week range", money(g && g.lo52 ? g.lo52 : s.lo52, s.ccy) + " – " + money(hi52, s.ccy) + (s.rangeNote && !g ? '<div class="small muted">' + esc(s.rangeNote) + "</div>" : "")],
      ["Latest revenue growth", s.growth != null ? pct(s.growth / 100, s.growth >= 100 ? 0 : 1) : "n/a", s.growthNote],
      ["Options implied volatility", s.iv != null ? s.iv + "%" + (s.ivAsOf ? ' <span class="muted">(' + esc(s.ivAsOf) + ")</span>" : "") : s.ivLo != null ? "n/a now" : "n/a",
        s.ivLo != null ? "52-week range " + s.ivLo + "–" + s.ivHi + "%" : null],
      ["Next results", fmtDate(s.earnings) + (s.earningsConfirmed ? "" : ' <span class="muted">(estimated)</span>'), r.earningsInWindow ? "Inside the forecast window" : null]
    ];
    if (s.ytd != null) inputs.push(["Year to date (reported)", '<span class="' + signClass(s.ytd) + '">' + pct(s.ytd / 100, 1) + "</span>"]);
    if (s.ret1y != null) inputs.push(["1-year return (reported)", '<span class="' + signClass(s.ret1y) + '">' + pct(s.ret1y / 100, 1) + "</span>"]);
    if (g) {
      if (g.ytd != null) inputs.push(["Year to date (measured)", '<span class="' + signClass(g.ytd) + '">' + pct(g.ytd) + "</span>"]);
      if (g.mom12_1 != null) inputs.push(["12-month momentum (ex. last month)", pct(g.mom12_1)]);
      if (g.ret1m != null) inputs.push(["Last month", pct(g.ret1m)]);
    }
    h += card("Inputs", "", '<table class="kv"><tbody>' + inputs.map(function (row) {
      return "<tr><td>" + row[0] + "</td><td>" + row[1] + (row[2] ? '<div class="small muted">' + esc(row[2]) + "</div>" : "") + "</td></tr>";
    }).join("") + "</tbody></table>" + '<p class="small muted" style="margin:8px 0 0">Sources for this stock are listed at the bottom of the page.' + cite(s.src) + "</p>");
    h += "</div>";

    // Scenarios.
    var sc = [
      ["Bear case", 0.1, "1-in-10 chance the price ends lower than this"],
      ["Base case", 0.5, "The median outcome; equally likely to finish above or below"],
      ["Bull case", 0.9, "1-in-10 chance the price ends higher than this"]
    ];
    h += card("Scenarios for " + esc(fmtDate(r.end)), "Where the price could stand at the end of the forecast window.",
      '<div class="scen">' + sc.map(function (x) {
        var v = r.q[x[1]];
        return tile(x[0], money(r.price * (1 + v), s.ccy) + ' <span class="small ' + signClass(v) + '">' + pct(v, 0) + "</span>", x[2]);
      }).join("") + "</div>", "mt");

    // Thesis.
    h += '<div class="grid g2 mt">';
    h += card("The case today", "", "<p>" + esc(s.thesis) + "</p>" +
      (r.earningsInWindow ? '<div class="callout small"><strong>Results inside the window</strong>' + esc(s.n) + " reports around " + esc(fmtDate(s.earnings)) + (s.earningsConfirmed ? " (confirmed)" : " (estimated)") +
        ", " + r.earningsDaysOut + " trading days in. Earnings days produce the largest single-day moves, and the volatility above includes them.</div>" : ""));
    h += card("Catalysts &amp; risks", "", '<div class="grid g2" style="gap:12px"><div><h4 class="small secondary">Catalysts</h4><ul class="bullets small">' +
      (s.catalysts || []).map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + '</ul></div><div><h4 class="small secondary">Risks</h4><ul class="bullets small">' +
      (s.risks || []).map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul></div></div>");
    h += "</div>";

    if (g && g.base) {
      var b = g.base;
      h += card("How " + esc(s.t) + " has moved over 3 months before", "Every 3-month window in the downloaded price history, sampled monthly (" + b.n + " windows). Survivorship bias: these are today's winners.",
        '<div class="scen">' + tile("Rose in", prob(b.pos), "of past 3-month windows") + tile("Typical 3 months", pct(b.p50), "Median past return") +
        tile("Bad / good quarter", pct(b.p10, 0) + " / " + pct(b.p90, 0), "10th and 90th percentile of past returns") + "</div>", "mt");
    }

    h += card("Sources", "As reported by each outlet on or before " + esc(fmtDate(U.asOf)) + "; not re-verified against exchange data.",
      '<ol class="sources-list">' + s.src.concat(U.macro.src || []).sort(function (a, b) { return sourceIds.indexOf(a) - sourceIds.indexOf(b); }).map(function (id) {
        var x = U.sources[id];
        return '<li value="' + (sourceIds.indexOf(id) + 1) + '"><a href="' + esc(x.u) + '" target="_blank" rel="noopener">' + esc(x.t) + "</a>" + (s.src.indexOf(id) < 0 ? " (risk-free rate)" : "") + "</li>";
      }).join("") + "</ol>", "mt");

    h += '<div class="pager">' + (prev ? '<a href="#/s/' + encodeURIComponent(prev.t) + '">← ' + esc(prev.t) + " " + pct(prev.er) + "</a>" : "<span></span>") +
      (next ? '<a href="#/s/' + encodeURIComponent(next.t) + '">' + esc(next.t) + " " + pct(next.er) + " →</a>" : "<span></span>") + "</div>";

    h += '<div class="mt">' + settingsPanel() + "</div>";

    chart(function () {
      C.fan($("#fan"), {
        history: g && g.history ? g.history : null, path: r.path, price: r.price, start: r.start,
        refs: refs, events: events, fmt: fmt,
        aria: esc(s.n) + " price history and 3-month forecast range"
      });
      C.bars($("#drivers"), drivers, { format: function (v) { return pct(v, 1); }, aria: "Contributions to the expected return" });
    });
    return h;
  }

  function tile(label, value, note) {
    return '<div class="tile"><div class="label">' + label + '</div><div class="value">' + value + "</div>" + (note ? '<div class="note">' + note + "</div>" : "") + "</div>";
  }

  // How a signal's raw value reads for people.
  function rawText(key, raw) {
    if (raw == null || !isFinite(raw)) return "n/a";
    if (key === "street") return pct(Math.exp(raw) - 1, 0) + " to target";
    if (key === "high52") return raw === 0 ? "at the high" : pct(Math.exp(raw) - 1, 0) + " from high";
    if (key === "growth") return pct(Math.exp(raw) - 1, 0) + " y/y";
    if (key === "mom") return pct(Math.exp(raw) - 1, 0);
    if (key === "rev") return pct(Math.exp(-raw) - 1, 1) + " last month";
    return raw.toFixed(3);
  }

  /* ------------------------------------------------------------------ */
  /* View: method                                                        */
  /* ------------------------------------------------------------------ */
  function viewMethod() {
    var P = model.params, T = model.T;
    var h = '<div class="section-head"><div><h2>How the forecast works</h2><p>A transparent, research-based model. Every input is shown on each stock\'s page, and you can change the market assumption and the signal weight in Model settings.</p></div></div>';

    h += '<div class="grid g2">';
    h += card("The forecast in one line", "",
      '<div class="formula">E[R] = r<sub>f</sub>·T + β·(M − r<sub>f</sub>·T) + α</div>' +
      '<ul class="bullets small">' +
      "<li><b>r<sub>f</sub>·T</b>: the 3-month T-bill yield (" + U.macro.rf.toFixed(2) + "% a year" + cite(U.macro.src) + ") over T = " + P.horizonDays + " trading days, which gives " + pct(model.rfT, 2) + ".</li>" +
      "<li><b>M</b>: the S&amp;P 500's 3-month return. The base case is the T-bill plus a " + U.macro.erp.toFixed(1) + "% equity risk premium, " + pct(BASE_MARKET, 2) + ". It is currently set to " + pct(model.market3m, 2) + ".</li>" +
      "<li><b>β</b>: how much the stock moves with the market. It comes from the segment's typical beta, adjusted for the stock's volatility and for listings outside U.S. hours. When price data is loaded, it is measured from two years of weekly returns and Blume-adjusted.</li>" +
      "<li><b>α</b>: the stock-specific tilt, α = σ<sub>resid</sub>·√T · Σ w<sub>k</sub>·z<sub>k</sub>. Here z<sub>k</sub> is the stock's z-score on signal k across the " + model.stocks.length + " stocks, and w = R⁻¹·IC combines the signals' information coefficients so correlated signals are not double-counted. |α| is capped at " + P.alphaCap + "·σ·√T.</li>" +
      "</ul>");
    h += card("From one number to a range of outcomes", "",
      '<p class="small">Log-returns over the horizon are centred so the average simple return equals E[R], and spread by σ·√T:</p>' +
      '<div class="formula">ln(1+R) = ln(1+E[R]) − ½σ²T + σ√T · ε</div>' +
      '<ul class="bullets small">' +
      "<li><b>σ</b>, best source first: option-implied volatility (current level blended with its 52-week norm), then volatility measured from daily prices. Failing both, the 52-week range blended with the segment's typical level. Market volatility is assumed at " + U.macro.marketVol + "% (VIX " + U.macro.vix + ").</li>" +
      "<li><b>ε</b> has fat tails: a Student-t with " + P.tailNu + " degrees of freedom scaled to unit variance, or the empirical shape measured by the backtest when price data is loaded. Real 3-month returns have more big moves than a normal curve allows.</li>" +
      "<li>The fan chart widens with √time. <b>Chance of a gain</b>, the percentiles and the scenario prices all come from this distribution. <b>Hit analyst target</b> uses the reflection principle for the running maximum.</li>" +
      "<li>Because of volatility drag the median outcome sits below the mean: ½σ²T is about 4.5 points for a 60%-volatility stock.</li></ul>");
    h += "</div>";

    // Signals.
    h += card("Stock-specific signals", "Each signal's prior IC comes from published research on U.S. stocks. When the pipeline has run, the price-based ICs are re-estimated on these stocks and averaged 50/50 with the priors.",
      '<div class="table-wrap"><table><thead><tr><th>Signal</th><th>What it measures</th><th class="num">Prior IC</th><th class="num">Measured IC</th><th class="num">Weight used</th><th>Research</th></tr></thead><tbody>' +
      model.signals.map(function (s) {
        return "<tr><td><b>" + esc(s.label) + "</b>" + (s.active ? "" : '<div class="small muted">' + (s.needs ? "Needs price history" : "Not enough data") + "</div>") + '</td><td class="small secondary">' + esc(s.desc) +
          '</td><td class="num">' + s.icPrior.toFixed(2) + '</td><td class="num">' + (s.icMeasured != null ? s.icMeasured.toFixed(3) : "—") + '</td><td class="num">' + (s.active ? s.weight.toFixed(3) : "off") +
          '</td><td class="small secondary">' + esc(s.ref) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<p class="small secondary" style="margin:10px 0 0">An IC of 0.03 means the signal\'s ranking explains about 0.1% of the variation in next-quarter risk-adjusted returns. It is small but real, and it compounds across many stocks. That is why stock-specific tilts here are a few percentage points while the ranges of outcomes are tens of points.</p>', "mt");

    // Backtest.
    if (G && G.backtest) {
      var bt = G.backtest, cal = bt.calibration, mm = bt.model;
      h += card("Backtest on these stocks", "Walk-forward, month-end samples " + esc(bt.start) + " to " + esc(bt.end) + ", " + bt.samples.toLocaleString() + " stock-months, next " + bt.horizonDays + " trading days. t-statistics adjust for the 3-fold overlap of quarterly windows.",
        '<div class="kpis">' +
        kpi("Combined score, out-of-sample IC", mm.ic != null ? mm.ic.toFixed(3) : "—", "t = " + (mm.icT != null ? mm.icT.toFixed(1) : "—") + " over " + mm.months + " months. Only uses ICs known at the time") +
        kpi("Hit rate", prob(mm.hit), "Share of stocks on the right side of the cross-sectional average") +
        kpi("Top minus bottom fifth", pct(mm.spread), "Average 3-month return gap between the best- and worst-scored fifths") +
        kpi("80% band coverage", prob(cal.cover80), "Share of realised 3-month returns inside the Student-t 80% band (target 80%)") +
        kpi("50% band coverage", prob(cal.cover50), "Target 50%. Realised spread vs forecast: " + cal.sd.toFixed(2) + "×") +
        "</div>" +
        '<div class="table-wrap mt"><table><thead><tr><th>Price signal</th><th class="num">Mean monthly IC</th><th class="num">t-stat</th><th class="num">Months</th></tr></thead><tbody>' +
        Object.keys(bt.ic).map(function (k) {
          var x = bt.ic[k], sig = F.SIGNALS.filter(function (s) { return s.key === k; })[0];
          return "<tr><td>" + esc(sig ? sig.label : k) + '</td><td class="num">' + (x.mean != null ? x.mean.toFixed(3) : "—") + '</td><td class="num">' + (x.t != null ? x.t.toFixed(1) : "—") + '</td><td class="num">' + x.n + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        '<p class="small muted" style="margin:10px 0 0">Analyst targets and revenue growth have no free point-in-time history, so they keep their research priors and are not in this backtest.</p>', "mt");
    } else {
      h += '<div class="callout warn mt"><strong>No price history loaded yet</strong>The site is running on the research snapshot. Implied volatility, the 52-week range and research priors stand in for measured volatility, beta and momentum. Run the pipeline below to add ten years of daily prices, the price-based signals and a walk-forward backtest of the model on these stocks.</div>';
    }

    // Universe.
    h += '<div class="grid g2 mt">';
    h += card("Which stocks are included", "",
      '<ul class="bullets small">' +
      "<li><b>Size:</b> market value of at least $" + U.threshold + "B as reported in September 2026 (listed shares; local listings converted to U.S. dollars by the source).</li>" +
      "<li><b>AI-related:</b> AI must be a primary, disclosed growth driver. That covers AI chips and custom silicon, chip manufacturing and test, memory and storage, AI servers, networking and optics, clouds and model owners, AI software and security, and the power equipment data centers are buying.</li>" +
      "<li><b>Excluded:</b> companies whose AI link is incidental, or that are mainly exposed to AI disruption rather than AI demand (for example Accenture and Intuit). Private labs (OpenAI, Anthropic) are not listed. SpaceX is included because it owns xAI.</li>" +
      "<li><b>AI exposure</b> tags: <i>Core</i> (AI is the main business driver), <i>Major</i> (a large and growing share), <i>Adjacent</i> (meaningful but secondary).</li></ul>" +
      '<div class="table-wrap"><table class="small"><thead><tr><th>Segment</th><th class="num">Stocks</th><th class="num">Typical σ</th><th class="num">Typical β</th></tr></thead><tbody>' +
      U.segments.map(function (s) {
        return "<tr><td>" + esc(s.name) + '<div class="muted">' + esc(s.desc) + '</div></td><td class="num">' + U.stocks.filter(function (x) { return x.seg === s.key; }).length + '</td><td class="num">' + Math.round(s.vol * 100) + '%</td><td class="num">' + s.beta.toFixed(1) + "</td></tr>";
      }).join("") + "</tbody></table></div>");
    h += card("Near misses", "Stocks within reach of the threshold, or AI names below it.",
      '<div class="table-wrap"><table class="small"><thead><tr><th>Company</th><th class="num">Value</th><th>Note</th></tr></thead><tbody>' +
      U.nearMisses.map(function (x) { return "<tr><td>" + esc(x.n) + ' <span class="muted mono">' + esc(x.t) + '</span></td><td class="num">$' + x.mcap + "B</td><td>" + esc(x.why) + cite(x.src) + "</td></tr>"; }).join("") +
      "</tbody></table></div>" +
      '<p class="small muted" style="margin:10px 0 0">Several members sit close to $100B (AppLovin, Constellation, Foxconn, Snowflake) and may drop out. Adobe fell below the line on Sep 22.</p>');
    h += "</div>";

    // Limitations + refresh.
    h += '<div class="grid g2 mt">';
    h += card("Limitations", "", '<ul class="bullets small">' +
      "<li><b>Not investment advice.</b> These are model outputs under stated assumptions. They are not recommendations or guarantees.</li>" +
      "<li>Snapshot figures are as reported by the cited outlets and were not re-verified against exchange data. Some prices are a day or two older than others, and a few fields are estimates (flagged on each page).</li>" +
      "<li>Research ICs come mostly from broad U.S. samples. A concentrated AI universe in a boom may behave differently, which the backtest can reveal but not fix.</li>" +
      "<li>Events like earnings, export rules or a single large contract can move a stock far outside its 80% band. Roughly 1 in 5 outcomes should land outside it.</li>" +
      "<li>Returns are in each stock's trading currency. Currency moves are not modelled for non-U.S. listings.</li>" +
      "<li>Price history covers only companies that are listed today, so it has survivorship bias.</li></ul>");
    h += card("Refreshing the data", "",
      '<p class="small">The research snapshot lives in <code>ai-forecast/data/universe.js</code> (strict JSON with sources). To add measured prices, volatility, beta, momentum and the backtest, run from the repository root:</p>' +
      '<pre class="code">python3 -m pipeline.ai_forecast\n# or a subset:\npython3 -m pipeline.ai_forecast --tickers NVDA,MU,0700.HK</pre>' +
      '<p class="small" style="margin-top:8px">It downloads daily prices from Yahoo Finance (Stooq fallback for U.S. symbols) and writes <code>ai-forecast/data/generated/forecast.js</code>. Reload the page and it switches to measured inputs.</p>' +
      (G ? '<p class="small muted">Loaded: generated ' + esc(G.generatedAt) + ", prices " + esc(G.priceStart) + " to " + esc(G.priceEnd) + ", " + G.universe + " stocks" + (G.failed && G.failed.length ? " (failed: " + esc(G.failed.join(", ")) + ")" : "") + ".</p>" : ""));
    h += "</div>";

    h += card("All sources", sourceIds.length + " sources, numbered as cited across the site.",
      '<ol class="sources-list sources-cols">' + sourceIds.map(function (id) {
        var x = U.sources[id];
        return '<li><a href="' + esc(x.u) + '" target="_blank" rel="noopener">' + esc(x.t) + "</a></li>";
      }).join("") + "</ol>", "mt");
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* Router                                                              */
  /* ------------------------------------------------------------------ */
  function parseRoute() {
    var hsh = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    if (hsh.indexOf("s/") === 0) return { view: "stock", t: hsh.slice(2) };
    if (hsh === "method") return { view: "method" };
    return { view: "list" };
  }
  var lastView = null;
  function render() {
    var rt = parseRoute();
    chartJobs = [];
    var html = rt.view === "stock" ? viewStock(rt.t) : rt.view === "method" ? viewMethod() : viewList();
    $("#view").innerHTML = html;
    $$("#nav a").forEach(function (a) {
      var on = a.dataset.view === rt.view || (rt.view === "stock" && a.dataset.view === "list");
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var r = rt.view === "stock" && model.byTicker[rt.t];
    document.title = r ? r.t + " 3-month forecast · AI Megacap Forecast" : rt.view === "method" ? "Method · AI Megacap Forecast" : "AI Megacap Forecast";
    if (rt.view === "list") wireList();
    if (rt.view === "stock") wireSettings(rerenderKeep);
    flushCharts();
    var key = rt.view + (rt.t || "");
    if (key !== lastView) { window.scrollTo(0, 0); lastView = key; }
  }

  function init() {
    rebuild();
    $("#asof").innerHTML = '<span class="dot"></span>' + (G ? "Prices to " + esc(fmtDate(G.priceEnd)) : "Prices " + esc(fmtDate(PRICE_DATE)));
    $("#live").innerHTML = G
      ? '<span class="dot"></span>Measured price data'
      : '<span class="dot"></span>Research snapshot';
    $("#live").classList.toggle("warn", !G);
    $("#live").title = G ? "Generated " + G.generatedAt : "Run python3 -m pipeline.ai_forecast to load ten years of prices";
    $("#nav").innerHTML = [["list", "#/", "All forecasts"], ["method", "#/method", "Method & data"]].map(function (v) {
      return '<a data-view="' + v[0] + '" href="' + v[1] + '">' + v[2] + "</a>";
    }).join("");

    var saved = store("theme");
    if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
    $("#theme").addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme") ||
        (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      var next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      store("theme", next);
    });
    window.addEventListener("hashchange", render);
    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(flushCharts, 150); });
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
