(function () {
  "use strict";

  var S = window.SNAPSHOT;
  var G = window.GENERATED || null;
  var M = window.Model;
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
  function pct(v, d) { return v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : "") + v.toFixed(d == null ? 1 : d) + "%"; }
  function pctU(v, d) { return v == null || !isFinite(v) ? "—" : (v * 100).toFixed(d == null ? 0 : d) + "%"; }
  function money(v) { return v == null ? "—" : "$" + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  function signClass(v) { return v > 0 ? "up" : v < 0 ? "down" : ""; }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  // Stable source numbering, in declaration order.
  var sourceIds = Object.keys(S.sources);
  function cite(ids) {
    if (!ids) return "";
    if (!Array.isArray(ids)) ids = [ids];
    return ids.map(function (id) {
      var s = S.sources[id];
      if (!s) return "";
      var n = sourceIds.indexOf(id) + 1;
      return '<sup class="src"><a href="' + esc(s.u) + '" target="_blank" rel="noopener" title="' + esc(s.t) + '">[' + n + "]</a></sup>";
    }).join("");
  }

  function card(title, sub, body, cls) {
    return '<div class="card ' + (cls || "") + '"><h3>' + title + "</h3>" + (sub ? '<div class="sub">' + sub + "</div>" : "") + body + "</div>";
  }

  // Charts are rendered after HTML is inserted; re-render on resize.
  var chartJobs = [];
  function chart(fn) { chartJobs.push(fn); }
  function flushCharts() { chartJobs.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }

  /* ------------------------------------------------------------------ */
  /* View: Overview                                                      */
  /* ------------------------------------------------------------------ */
  function viewOverview() {
    var h = '<div class="section-head"><div><h2>Market at a glance</h2><p>Snapshot as of ' + esc(S.asOf) +
      '. Each tile shows its own as-of date. Superscript numbers link to the source.</p></div></div>';
    h += '<div class="kpis">' + S.headline.map(function (k) {
      return '<div class="kpi"><div class="label">' + esc(k.label) + cite(k.src) + '</div><div class="value">' + esc(k.value) +
        '</div><div class="note">' + esc(k.note) + ' · <span class="muted">' + esc(k.asOf) + "</span></div></div>";
    }).join("") + "</div>";

    h += '<div class="grid g3" style="margin-top:16px">';
    h += '<div class="card regime span2"><h2>' + esc(S.regime.title) + '</h2><ul class="bullets">' +
      S.regime.bullets.map(function (b) { return "<li>" + esc(b.text) + cite(b.src) + "</li>"; }).join("") + "</ul></div>";
    h += card("What moved markets in 2026", "Key events", '<ul class="timeline">' + S.bigEvents.map(function (e) {
      return '<li><div class="when">' + esc(e.date) + "</div><strong>" + esc(e.title) + '</strong><div class="small secondary">' + esc(e.text) + cite(e.src) + "</div></li>";
    }).join("") + "</ul>");
    h += "</div>";

    h += '<div class="card" style="margin-top:16px"><h3>Key risks to the bull case</h3><div class="risk-grid">' +
      S.regime.risks.map(function (r) { return '<div class="risk"><strong>' + esc(r.title) + '</strong><div class="small">' + esc(r.text) + cite(r.src) + "</div></div>"; }).join("") +
      "</div></div>";

    h += '<div class="grid g2" style="margin-top:16px">';
    h += card("2026 leaders", "YTD return, " + esc(S.leaders2026.asOf) + cite(S.leaders2026.src), '<div id="ov-leaders"></div>');
    h += card("Top doubling-watchlist names (default model)", "Probability of touching 2× within 12 months · see the Doubling Lab tab", '<div id="ov-watch"></div>');
    h += "</div>";

    chart(function () {
      C.hbar($("#ov-leaders"), S.leaders2026.rows.map(function (r) {
        return { label: r.t, value: r.r, tip: "<b>" + r.t + "</b> " + esc(r.n) + "<br>" + pct(r.r, 0) + " YTD<br>" + esc(r.why) };
      }), { format: function (v) { return pct(v, 0); } });
      var ev = S.watchlist.map(function (s) { return { s: s, e: M.evaluate(withMeasuredVol(s), M.DEFAULT_WEIGHTS, M.DEFAULT_PARAMS) }; })
        .sort(function (a, b) { return b.e.pDoubleTouch - a.e.pDoubleTouch; }).slice(0, 8);
      C.hbar($("#ov-watch"), ev.map(function (x) {
        return { label: x.s.t, value: x.e.pDoubleTouch * 100, tip: "<b>" + x.s.t + "</b> " + esc(x.s.n) + "<br>P(touch 2×): " + pctU(x.e.pDoubleTouch) + "<br>P(touch ½×): " + pctU(x.e.pHalveTouch) + "<br>Score " + x.e.score.toFixed(0) + " · σ " + pctU(x.e.sigma) };
      }), { format: function (v, axis) { return v.toFixed(0) + "%"; }, max: 60 });
    });
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* View: Macro                                                         */
  /* ------------------------------------------------------------------ */
  function viewMacro() {
    var m = S.macro;
    var h = '<div class="section-head"><div><h2>Macro &amp; rates</h2><p>An oil supply shock and a re-accelerating economy have turned the Fed back toward hiking. For growth stocks, the 10-year yield is the variable to watch.</p></div></div>';
    h += '<div class="grid g3">';
    h += '<div class="card span2"><h3>Macro dashboard</h3><div class="table-wrap"><table><thead><tr><th>Indicator</th><th>Latest</th><th>Detail</th></tr></thead><tbody>' +
      m.table.map(function (r) { return "<tr><td>" + esc(r.k) + '</td><td class="mono">' + esc(r.v) + "</td><td class=\"secondary\">" + esc(r.d) + cite(r.src) + "</td></tr>"; }).join("") +
      "</tbody></table></div></div>";
    h += card("Oil shock timeline", "Brent / WTI during the 2026 Iran war", '<ul class="timeline">' + m.oilTimeline.map(function (e) {
      return '<li><div class="when">' + esc(e.date) + '</div><div class="small">' + esc(e.text) + cite(e.src) + "</div></li>";
    }).join("") + "</ul>");
    h += "</div>";
    h += '<div class="grid g3" style="margin-top:16px">';
    h += card("Nonfarm payrolls", "Monthly change, thousands (revised)" + cite(m.payrolls.src), '<div id="mc-pay"></div>');
    h += card("Real GDP growth", "Quarterly, % annualised" + cite(m.gdp.src), '<div id="mc-gdp"></div>');
    h += card("Fed funds (mid-point of range)", "Actual and FOMC median projection" + cite(m.fedPath.src), '<div id="mc-fed"></div>');
    h += "</div>";
    h += '<div class="callout warn" style="margin-top:16px"><strong>Why it matters for doublers</strong>Most stocks that can double are long-duration assets whose value sits in cash flows years away. A 10-yr at 5%+ lowers the present value of those cash flows, so the Doubling Lab defaults to a 4% risk-free rate. Raise it to stress-test.</div>';
    chart(function () {
      C.columns($("#mc-pay"), m.payrolls.rows.map(function (r) { return { label: r[0], value: r[1] }; }), { format: function (v) { return v + "k"; }, height: 200 });
      C.columns($("#mc-gdp"), m.gdp.rows.map(function (r) { return { label: r[0], value: r[1] }; }), { format: function (v) { return v.toFixed(1) + "%"; }, height: 200 });
      C.columns($("#mc-fed"), m.fedPath.rows.map(function (r, i) { return { label: r[0].replace(" 2026", ""), value: r[1], color: i === 2 ? "var(--pos-soft)" : null, tip: "<b>" + esc(r[0]) + "</b><br>" + r[1].toFixed(3) + "% mid-point" + (i === 2 ? "<br>(projection)" : "") }; }), { format: function (v) { return v.toFixed(2) + "%"; }, height: 200 });
    });
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* View: Equities                                                      */
  /* ------------------------------------------------------------------ */
  function viewEquities() {
    var h = '<div class="section-head"><div><h2>Equities: indices, sectors, leaders &amp; laggards</h2><p>2026 has rewarded the physical side of AI (memory, storage, servers, power) and energy. It has punished software and services that AI might replace.</p></div></div>';
    h += '<div class="kpis">' + S.indices.map(function (i) {
      return '<div class="kpi"><div class="label">' + esc(i.name) + cite(i.src) + '</div><div class="value">' + (i.ytd != null ? '<span class="' + signClass(i.ytd) + '">' + pct(i.ytd, 1) + "</span>" : esc(i.level)) +
        '</div><div class="note">' + esc(i.note) + "</div></div>";
    }).join("") + "</div>";
    h += '<div class="grid g2" style="margin-top:16px">';
    h += '<div class="card"><h3>Sector scoreboard</h3><div class="sub">' + esc(S.sectors.note) + cite(S.sectors.src) + '</div><div id="eq-sec"></div><div class="table-wrap"><table><thead><tr><th>Sector</th><th class="num">YTD</th><th>Read</th></tr></thead><tbody>' +
      S.sectors.rows.map(function (r) { return "<tr><td>" + esc(r.name) + '</td><td class="num ' + signClass(r.ytd) + '">' + (r.ytd == null ? "n/r" : pct(r.ytd, 1)) + '</td><td class="small secondary">' + esc(r.read) + "</td></tr>"; }).join("") +
      "</tbody></table></div></div>";
    h += '<div class="stack">';
    h += card("Magnificent 7: dispersion", "YTD return · dates vary by name" + cite(S.mag7.src), '<div id="eq-mag7"></div>');
    h += card("Worst S&amp;P 500 performers 2026", "YTD" + cite(S.laggards2026.src), '<div id="eq-lag"></div>');
    h += "</div></div>";
    h += '<div class="card" style="margin-top:16px"><h3>Best S&amp;P 500 performers 2026</h3><div class="sub">YTD as of ' + esc(S.leaders2026.asOf) + cite(S.leaders2026.src) + '</div><div id="eq-lead"></div></div>';

    chart(function () {
      var known = S.sectors.rows.filter(function (r) { return r.ytd != null; });
      C.hbar($("#eq-sec"), known.map(function (r) { return { label: r.name, value: r.ytd }; }), { format: function (v) { return pct(v, 0); }, rowHeight: 30 });
      C.hbar($("#eq-mag7"), S.mag7.rows.map(function (r) { return { label: r.t, value: r.r, tip: "<b>" + r.t + "</b><br>" + pct(r.r) + " YTD (as of " + r.asOf + ")<br>" + esc(r.note) }; }), { format: function (v) { return pct(v, 0); } });
      C.hbar($("#eq-lag"), S.laggards2026.rows.map(function (r) { return { label: r.t, value: r.r, tip: "<b>" + r.t + "</b> " + esc(r.n) + "<br>" + pct(r.r) }; }), { format: function (v) { return pct(v, 0); }, labelWidth: 60 });
      C.hbar($("#eq-lead"), S.leaders2026.rows.map(function (r) { return { label: r.t + " · " + r.n, value: r.r, tip: "<b>" + r.t + "</b><br>" + pct(r.r, 0) + "<br>" + esc(r.why) }; }), { format: function (v) { return pct(v, 0); }, labelWidth: 170 });
    });
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* View: Smart money (13F)                                             */
  /* ------------------------------------------------------------------ */
  function viewSmartMoney() {
    var I = S.institutions;
    var h = '<div class="section-head"><div><h2>Smart money: what the big banks &amp; funds hold</h2><p>From Q2 2026 13F filings (positions as of June 30, filed by Aug 14).</p></div></div>';
    h += '<div class="callout">' + esc(I.note) + "</div>";

    h += '<div class="grid g2" style="margin-top:16px">';
    h += card("13F equity value: banks &amp; asset managers", "$ billions, Q2 2026 (prior quarter where reported)", '<div class="legend"><span><i style="background:var(--series-1)"></i>Q2 2026</span><span><i style="background:var(--pos-soft)"></i>Q1 2026</span></div><div id="sm-aum"></div><div class="table-wrap"><table><thead><tr><th>Institution</th><th class="num">Q/Q</th><th>Top holdings</th><th class="num">Positions</th></tr></thead><tbody>' +
      I.banks.map(function (b) {
        var g = b.prior ? (b.aum / b.prior - 1) * 100 : null;
        return "<tr><td>" + esc(b.name) + cite(b.src) + '<div class="small muted">' + esc(b.type) + '</div></td><td class="num ' + signClass(g) + '">' + pct(g) + "</td><td>" +
          (b.top.length ? b.top.map(function (t) { return '<span class="chip t">' + esc(t) + "</span>"; }).join("") : '<span class="small muted">Not stated in source</span>') +
          (b.flow ? '<div class="small muted">' + b.flow.new + " new · " + b.flow.inc.toLocaleString() + " added · " + b.flow.red.toLocaleString() + " cut · " + b.flow.exit + " exited</div>" : "") +
          '</td><td class="num">' + (b.holdings ? b.holdings.toLocaleString() : "—") + "</td></tr>";
      }).join("") + "</tbody></table></div>");
    h += card("Hedge-fund consensus buys, Q2 2026", esc(I.consensus.note) + cite(I.consensus.src), '<div id="sm-cons"></div><p class="small secondary" style="margin-top:10px">' + esc(I.consensus.crowded) + cite(I.consensus.src) + "</p>");
    h += "</div>";

    h += '<h3 style="margin:24px 0 12px">Manager-by-manager moves</h3><div class="grid g3">';
    I.funds.forEach(function (f) {
      var top = f.top.length ? '<div style="margin-top:8px">' + f.top.map(function (t) { return '<span class="chip t">' + esc(t.t) + (t.w ? " " + t.w.toFixed(1) + "%" : "") + (t.note ? " " + esc(t.note) : "") + "</span>"; }).join("") + "</div>" : "";
      var li = function (arr, cls) { return arr.length ? '<ul class="' + cls + '">' + arr.map(function (x) { return '<li><span class="tick">' + esc(x.t) + '</span><span class="secondary">' + esc(x.note) + "</span></li>"; }).join("") + "</ul>" : '<div class="small muted">None disclosed in sources</div>'; };
      h += '<div class="card"><div class="inst-head"><h3 style="margin:0">' + esc(f.name) + cite(f.src) + '</h3><span class="aum">' + (f.aum ? "$" + f.aum + "B" : "") + '</span></div><div class="small muted">' + esc(f.manager) + '</div><p class="small" style="margin-top:8px">' + esc(f.summary) + "</p>" + top +
        '<div class="moves"><div><h4>Bought / added</h4>' + li(f.buys, "buy") + "</div><div><h4>Sold / cut</h4>" + li(f.sells, "sell") + "</div></div></div>";
    });
    h += "</div>";

    // Overlap matrix: tickers mentioned by >= 2 managers (top holdings or buys).
    var map = {};
    I.funds.forEach(function (f) {
      var seen = {};
      f.top.concat(f.buys).forEach(function (x) { if (!seen[x.t]) { seen[x.t] = 1; (map[x.t] = map[x.t] || []).push(f.name); } });
    });
    I.consensus.rows.forEach(function (r) { (map[r.t] = map[r.t] || []).push("HF consensus"); });
    var cols = I.funds.map(function (f) { return f.name; }).concat(["HF consensus"]);
    var rows = Object.keys(map).filter(function (t) { return map[t].length >= 2; }).sort(function (a, b) { return map[b].length - map[a].length || a.localeCompare(b); });
    h += '<div class="card" style="margin-top:16px"><h3>Where smart money overlaps</h3><div class="sub">Tickers that appear as a top holding or a Q2 buy for two or more managers, or in the hedge-fund consensus list. Computed from the cards above.</div><div class="table-wrap"><table class="matrix"><thead><tr><th>Ticker</th>' +
      cols.map(function (c) { return '<th class="small">' + esc(c.split(" ")[0]) + "</th>"; }).join("") + '<th class="num">Count</th></tr></thead><tbody>' +
      rows.map(function (t) {
        return '<tr><td class="tick">' + esc(t) + "</td>" + cols.map(function (c) { var on = map[t].indexOf(c) >= 0; return '<td><span class="cell ' + (on ? "on" : "off") + '" aria-label="' + (on ? "yes" : "no") + '">' + (on ? "✓" : "") + "</span></td>"; }).join("") + '<td class="num">' + map[t].length + "</td></tr>";
      }).join("") + "</tbody></table></div></div>";

    if (G && G.institutions && G.institutions.length) {
      h += '<div class="callout" style="margin-top:16px"><strong>Raw 13F data available</strong>The pipeline pulled full filings for ' + G.institutions.length + " filers. See the <a href=\"#model\">Live Model</a> tab for position-level adds and cuts.</div>";
    }

    chart(function () {
      var rowsA = [];
      I.banks.forEach(function (b) {
        rowsA.push({ label: b.name, value: b.aum, color: "var(--series-1)", tip: "<b>" + esc(b.name) + "</b><br>Q2 2026: $" + b.aum.toLocaleString() + "B" + (b.prior ? "<br>Q1 2026: $" + b.prior.toLocaleString() + "B" : "") });
        if (b.prior) rowsA.push({ label: "", value: b.prior, color: "var(--pos-soft)", tip: "<b>" + esc(b.name) + "</b><br>Q1 2026: $" + b.prior.toLocaleString() + "B" });
      });
      C.hbar($("#sm-aum"), rowsA, { format: function (v) { return v >= 1000 ? "$" + (v / 1000).toFixed(2) + "T" : "$" + v.toFixed(0) + "B"; }, rowHeight: 22, labelWidth: 120 });
      C.hbar($("#sm-cons"), I.consensus.rows.map(function (r) { return { label: r.t, value: r.net, tip: "<b>" + r.t + "</b><br>" + r.funds + " funds buying<br>Net buying $" + r.net + "B" }; }), { format: function (v) { return "$" + v.toFixed(v < 10 ? 1 : 0) + "B"; }, labelWidth: 60, rowHeight: 32 });
    });
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* View: Bank views                                                    */
  /* ------------------------------------------------------------------ */
  function viewBanks() {
    var B = S.bankViews;
    var h = '<div class="section-head"><div><h2>What the investment banks are telling clients</h2><p>Year-end index targets and the banks\' curated "best ideas" lists.</p></div></div>';
    h += '<div class="grid g2">';
    h += card("S&amp;P 500 year-end 2026 targets", "Implied move vs. " + B.spxCurrent.toLocaleString() + cite(B.targets.src), '<div id="bk-tgt"></div><div class="table-wrap"><table><thead><tr><th>Firm</th><th class="num">Target</th><th class="num">Implied</th><th>Note</th></tr></thead><tbody>' +
      B.targets.rows.map(function (r) { var u = (r.target / B.spxCurrent - 1) * 100; return "<tr><td>" + esc(r.firm) + '</td><td class="num">' + r.target.toLocaleString() + '</td><td class="num ' + signClass(u) + '">' + pct(u) + '</td><td class="small secondary">' + esc(r.note || "") + "</td></tr>"; }).join("") +
      "</tbody></table></div>");
    h += '<div class="card"><h3>Reading the targets</h3><p class="small">The median target of about 8,000 implies only a few percent upside from here. Strategists expect earnings, not multiple expansion, to carry the rest of the year. With the forward P/E already down from 20.4× to 19.1×' + cite("factset") + ', the market has absorbed part of the rate shock.</p><p class="small">For stock pickers the signal is <strong>dispersion</strong>. Index-level upside is modest, but single-name moves (memory +200–500%, software −40–50%) are the largest in years. The big returns in this market come from picking stocks, not from owning the index.</p></div>';
    h += "</div>";
    h += '<div class="grid g2" style="margin-top:16px">' + B.lists.map(function (l) {
      return card(esc(l.firm) + cite(l.src), "", '<p class="small">' + esc(l.text) + "</p><div>" + l.names.map(function (n) { return '<span class="chip t">' + esc(n) + "</span>"; }).join("") + "</div>");
    }).join("") + "</div>";
    chart(function () {
      C.hbar($("#bk-tgt"), B.targets.rows.map(function (r) { var u = (r.target / B.spxCurrent - 1) * 100; return { label: r.firm, value: u, tip: "<b>" + esc(r.firm) + "</b><br>Target " + r.target.toLocaleString() + "<br>Implied " + pct(u) }; }), { format: function (v) { return pct(v, 1); }, labelWidth: 130 });
    });
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* View: History (past doublers)                                       */
  /* ------------------------------------------------------------------ */
  function viewHistory() {
    var H = S.history;
    var rets = H.spxAnnual.map(function (r) { return r[1]; });
    var sorted = rets.slice().sort(function (a, b) { return a - b; });
    var mean = rets.reduce(function (a, b) { return a + b; }, 0) / rets.length;
    var median = sorted[Math.floor(sorted.length / 2)];
    var posYears = rets.filter(function (r) { return r > 0; }).length;
    var bigYears = rets.filter(function (r) { return r >= 20; }).length;
    var geo = (Math.pow(rets.reduce(function (a, r) { return a * (1 + r / 100); }, 1), 1 / rets.length) - 1) * 100;
    var doubleYears = Math.log(2) / Math.log(1 + geo / 100);

    var h = '<div class="section-head"><div><h2>Past data: who doubled, and why</h2><p>Before predicting future doublers, measure how rare they are and what the past ones had in common.</p></div></div>';
    h += '<div class="kpis">' +
      [["Avg annual S&P return", pct(mean), H.spxAnnual[0][0] + "–" + H.spxAnnual[H.spxAnnual.length - 1][0] + ", price only"],
        ["Compound annual rate", pct(geo), "The index itself doubles every ~" + doubleYears.toFixed(1) + " yrs"],
        ["Median year", pct(median), "Half of years were better"],
        ["Up years", posYears + " / " + rets.length, Math.round(posYears / rets.length * 100) + "% of the time"],
        ["20%+ years", String(bigYears), "Strong years are common"],
        ["Worst year", pct(sorted[0]), String(H.spxAnnual.filter(function (r) { return r[1] === sorted[0]; })[0][0])]
      ].map(function (k) { return '<div class="kpi"><div class="label">' + k[0] + '</div><div class="value">' + k[1] + '</div><div class="note">' + k[2] + "</div></div>"; }).join("") + "</div>";

    h += '<div class="card" style="margin-top:16px"><h3>S&amp;P 500 calendar-year returns, ' + H.spxAnnual[0][0] + "–" + H.spxAnnual[H.spxAnnual.length - 1][0] + '</h3><div class="sub">Price return, %. Hover a bar for the year' + cite(H.spxAnnualSrc) + '</div><div id="hi-spx"></div></div>';

    h += '<div class="grid g2" style="margin-top:16px">';
    h += card("Top S&amp;P 500 doublers by year", "Calendar-year return, % (2026 = YTD)", '<div id="hi-dbl"></div>');
    var counts = {};
    H.doublers.forEach(function (d) { counts[d.pattern] = (counts[d.pattern] || 0) + 1; });
    h += card("How they doubled", "Share of the " + H.doublers.length + " doublers in the table, by primary pattern", '<div id="hi-pat"></div>' +
      '<div class="callout" style="margin-top:12px"><strong>Base rate</strong>' + esc(H.baseRate) + "</div>");
    h += "</div>";

    h += '<div class="grid g3" style="margin-top:16px">' + H.patterns.map(function (p) {
      var n = counts[p.key] || 0;
      return card(esc(p.name), n + " of " + H.doublers.length + " (" + Math.round(n / H.doublers.length * 100) + "%) · e.g. " + esc(p.ex), '<p class="small">' + esc(p.text) + "</p>");
    }).join("") + "</div>";

    h += '<div class="card" style="margin-top:16px"><h3>Doubler case files</h3><div class="table-wrap"><table><thead><tr><th>Year</th><th>Ticker</th><th class="num">Return</th><th>Driver</th><th>Set-up before the move</th></tr></thead><tbody>' +
      H.doublers.map(function (d) { return "<tr><td>" + d.year + (d.ytd ? ' <span class="chip">YTD</span>' : "") + '</td><td><span class="tick">' + esc(d.t) + '</span> <span class="small muted">' + esc(d.n) + '</span></td><td class="num up">' + pct(d.r, 0) + "</td><td>" + esc(d.driver) + '</td><td class="small secondary">' + esc(d.setup) + cite(d.src) + "</td></tr>"; }).join("") +
      "</tbody></table></div></div>";

    var pnames = {}; H.patterns.forEach(function (p) { pnames[p.key] = p.name; });
    chart(function () {
      C.columns($("#hi-spx"), H.spxAnnual.map(function (r) { return { label: String(r[0]), value: r[1] }; }), { format: function (v) { return v.toFixed(0) + "%"; }, height: 260 });
      C.hbar($("#hi-dbl"), H.doublers.slice().sort(function (a, b) { return a.year - b.year || b.r - a.r; }).map(function (d) {
        return { label: d.year + " " + d.t, value: d.r, tip: "<b>" + d.t + "</b> " + esc(d.n) + " (" + d.year + (d.ytd ? " YTD" : "") + ")<br>" + pct(d.r, 0) + "<br>" + esc(d.driver) };
      }), { format: function (v) { return pct(v, 0); }, rowHeight: 22, labelWidth: 90 });
      C.hbar($("#hi-pat"), H.patterns.map(function (p) { return { label: p.name.split(" (")[0].replace("A new demand wave hits a supply-constrained product", "Demand wave"), value: (counts[p.key] || 0) / H.doublers.length * 100, tip: "<b>" + esc(p.name) + "</b><br>" + (counts[p.key] || 0) + " of " + H.doublers.length }; }).sort(function (a, b) { return b.value - a.value; }),
        { format: function (v) { return v.toFixed(0) + "%"; }, labelWidth: 170, rowHeight: 30 });
    });
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* View: Doubling Lab                                                  */
  /* ------------------------------------------------------------------ */
  var FACTOR_LABELS = {
    wave: "Demand-wave exposure", growth: "Growth acceleration", street: "Street upside", smart: "Smart-money flow",
    asym: "Asymmetry / drawdown", size: "Small size", risk: "Risk (penalty)"
  };
  var lab = {
    weights: Object.assign({}, M.DEFAULT_WEIGHTS, store("lab.weights") || {}),
    params: Object.assign({}, M.DEFAULT_PARAMS, store("lab.params") || {}),
    theme: "all", sort: "pDoubleTouch", dir: -1, open: {}
  };

  function measured(t) {
    if (!G || !G.current) return null;
    for (var i = 0; i < G.current.length; i++) if (G.current[i].ticker === t) return G.current[i];
    return null;
  }
  function withMeasuredVol(s) {
    var m = measured(s.t);
    return m && m.vol ? Object.assign({}, s, { vol: m.vol, volMeasured: true }) : s;
  }
  function streetUpside(s) {
    if (s.upside != null) return s.upside;
    if (s.price && s.target) return (s.target / s.price - 1) * 100;
    return null;
  }

  function viewLab() {
    var themes = Array.from(new Set(S.watchlist.map(function (s) { return s.theme; }))).sort();
    var h = '<div class="section-head"><div><h2>Doubling Lab: candidates that could double</h2><p>' + S.watchlist.length +
      ' candidates chosen from the patterns in past doublers (demand wave, deep drawdown, catalyst, new ownership) and cross-checked against Q2 13F flows and Street targets. Each gets a factor score, and the score plus the stock\'s volatility gives a probability of doubling. Move the sliders to apply your own view.</p></div></div>';

    h += '<div class="callout warn"><strong>Read this first</strong>These are scenario probabilities from a transparent model, not recommendations or price targets. The same volatility that makes a double possible makes a 50% drawdown likely, so every row shows both. Past doublers were mostly identified <em>after</em> the fact.</div>';

    h += '<div class="card" style="margin-top:16px"><h3>Model controls <button id="lab-reset" type="button">Reset</button></h3><div class="controls">';
    h += '<div class="control" style="max-width:220px"><label>Horizon</label><div class="seg" role="group" aria-label="Horizon">' +
      [1, 2].map(function (y) { return '<button type="button" data-h="' + y + '" aria-pressed="' + (lab.params.horizonYears === y) + '">' + (y * 12) + " months</button>"; }).join("") + "</div></div>";
    h += '<div class="control"><label for="p-rf">Risk-free rate <output id="o-rf"></output></label><input id="p-rf" type="range" min="0" max="0.08" step="0.0025"></div>';
    h += '<div class="control"><label for="p-sp">Score → return spread <output id="o-sp"></output></label><input id="p-sp" type="range" min="0" max="0.8" step="0.01"></div>';
    h += '<div class="control" style="max-width:240px"><label for="p-theme">Theme</label><select id="p-theme"><option value="all">All themes</option>' + themes.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + "</option>"; }).join("") + "</select></div>";
    h += "</div><h4 style=\"margin:16px 0 8px\" class=\"small secondary\">Factor weights</h4><div class=\"controls\">";
    M.FACTORS.forEach(function (f) {
      h += '<div class="control"><label for="w-' + f + '">' + FACTOR_LABELS[f] + ' <output id="ow-' + f + '"></output></label><input id="w-' + f + '" data-f="' + f + '" type="range" min="0" max="40" step="1"></div>';
    });
    h += "</div></div>";

    h += '<div class="grid g2" style="margin-top:16px">';
    h += card("Upside vs downside", "Probability of touching 2× (right) vs touching ½× (left) within the horizon", '<div id="lab-bf"></div>');
    h += card("Score vs volatility", "Bubble size = P(touch 2×). Top-right is strong and volatile, which is where doubles come from and where 50% drawdowns do too", '<div id="lab-sc"></div>');
    h += "</div>";

    h += '<div class="card" style="margin-top:16px"><h3>Candidate table</h3><div class="sub">Click a column to sort, or a row to open its thesis, catalysts and risks. σ is assumed by volatility class unless marked ● (measured from pipeline data). Up/down = P(touch 2×) ÷ P(touch ½×). Above 1× means the model sees a double as more likely than a halving.</div><div class="table-wrap"><table id="lab-table"><thead><tr>' +
      [["", ""], ["t", "Ticker"], ["theme", "Theme"], ["score", "Score", 1], ["sigma", "σ", 1], ["mu", "Exp. return", 1], ["street", "Street upside", 1], ["pDoubleEnd", "P(end ≥2×)", 1], ["pDoubleTouch", "P(touch 2×)", 1], ["pHalveTouch", "P(touch ½×)", 1], ["ratio", "Up/down", 1]]
        .map(function (c) { return '<th class="' + (c[0] ? "sortable " : "") + (c[2] ? "num" : "") + '" data-k="' + c[0] + '">' + c[1] + "</th>"; }).join("") +
      "</tr></thead><tbody></tbody></table></div></div>";

    h += '<div class="card" style="margin-top:16px"><h3>How the probability is computed</h3><ol class="small"><li><strong>Score (0–100)</strong>: weighted average of seven 0–10 factor ratings, with risk inverted.</li><li><strong>Expected return</strong> μ = risk-free + spread × (score − 50) / 50. A score of 50 earns the risk-free rate.</li><li><strong>Price path</strong>: geometric Brownian motion with drift μ and volatility σ. P(end ≥ 2×) uses the terminal lognormal distribution. P(touch 2×) and P(touch ½×) use the reflection-principle formula for the running max/min, which was checked against a 20,000-path Monte Carlo in <code>tests/model.test.js</code>.</li></ol><p class="small secondary">Calibration check: for a typical large cap (σ = 25%, μ = 8%) the model gives P(touch 2× in 12m) ≈ 0.9%. That is in line with roughly 1% of S&amp;P 500 members doubling in a strong year. At σ = 30% it is already ≈ 2.7%, which shows how much the result depends on volatility.</p></div>';

    chart(renderLab);
    setTimeout(bindLab, 0);
    return h;
  }

  function labRows() {
    return S.watchlist.filter(function (s) { return lab.theme === "all" || s.theme === lab.theme; }).map(function (s0) {
      var s = withMeasuredVol(s0);
      var e = M.evaluate(s, lab.weights, lab.params);
      e.ratio = e.pHalveTouch > 0 ? e.pDoubleTouch / e.pHalveTouch : 0;
      return { s: s, e: e, street: streetUpside(s) };
    });
  }

  function renderLab() {
    var rows = labRows();
    var key = lab.sort, dir = lab.dir;
    rows.sort(function (a, b) {
      var va = key === "t" || key === "theme" ? a.s[key] : key === "street" ? a.street : a.e[key];
      var vb = key === "t" || key === "theme" ? b.s[key] : key === "street" ? b.street : b.e[key];
      if (va == null) return 1; if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
    var tb = $("#lab-table tbody");
    if (!tb) return;
    tb.innerHTML = rows.map(function (r) {
      var s = r.s, e = r.e, open = !!lab.open[s.t];
      var fac = M.FACTORS.map(function (f) { return '<span class="chip">' + FACTOR_LABELS[f].split(" ")[0] + " " + s.factors[f] + "</span>"; }).join("");
      return '<tr data-t="' + esc(s.t) + '" style="cursor:pointer"><td><button class="expander" aria-expanded="' + open + '" aria-label="Details for ' + esc(s.t) + '">' + (open ? "▾" : "▸") + "</button></td>" +
        '<td><span class="tick">' + esc(s.t) + '</span><div class="small muted">' + esc(s.n) + "</div></td>" +
        '<td class="small">' + esc(s.theme) + "</td>" +
        '<td class="num"><div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">' + e.score.toFixed(0) + '<div class="meter" style="width:60px"><i style="width:' + e.score.toFixed(0) + '%"></i></div></div></td>' +
        '<td class="num">' + pctU(e.sigma) + (s.volMeasured ? ' <span title="measured from price history">●</span>' : "") + "</td>" +
        '<td class="num ' + signClass(e.mu) + '">' + pct(e.mu * 100, 0) + "</td>" +
        '<td class="num">' + (r.street == null ? "—" : pct(r.street, 0)) + "</td>" +
        '<td class="num">' + pctU(e.pDoubleEnd, 1) + "</td>" +
        '<td class="num up"><strong>' + pctU(e.pDoubleTouch, 1) + "</strong></td>" +
        '<td class="num down">' + pctU(e.pHalveTouch, 1) + "</td>" +
        '<td class="num" title="P(touch 2×) ÷ P(touch ½×)">' + e.ratio.toFixed(2) + "×</td></tr>" +
        '<tr class="detail' + (open ? " open" : "") + '"><td></td><td colspan="10"><div class="cols"><div><strong>Thesis</strong><p class="small">' + esc(s.thesis) + cite(s.src) + "</p>" +
        (s.price ? '<p class="small muted">Reference price ' + money(s.price) + (s.target ? " · target " + money(s.target) : "") + (s.priceNote ? " · " + esc(s.priceNote) : "") + "</p>" : s.priceNote ? '<p class="small muted">' + esc(s.priceNote) + "</p>" : "") +
        "<div>" + fac + "</div></div>" +
        '<div><strong>Catalysts</strong><ul class="small">' + s.catalysts.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul></div>" +
        '<div><strong>Risks</strong><ul class="small">' + s.risks.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul></div></div></td></tr>";
    }).join("");
    $$("#lab-table th.sortable").forEach(function (th) {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.k === lab.sort) th.classList.add(lab.dir > 0 ? "sorted-asc" : "sorted-desc");
    });

    var byP = rows.slice().sort(function (a, b) { return b.e.pDoubleTouch - a.e.pDoubleTouch; });
    C.butterfly($("#lab-bf"), byP.map(function (r) {
      return { label: r.s.t, left: r.e.pHalveTouch, right: r.e.pDoubleTouch, tip: "<b>" + r.s.t + "</b> " + esc(r.s.n) + "<br>P(touch 2×): " + pctU(r.e.pDoubleTouch, 1) + "<br>P(touch ½×): " + pctU(r.e.pHalveTouch, 1) + "<br>P(end ≥ 2×): " + pctU(r.e.pDoubleEnd, 1) };
    }), { leftTitle: "◀ P(touch ½×)", rightTitle: "P(touch 2×) ▶", max: 1 });
    C.scatter($("#lab-sc"), rows.map(function (r) {
      return { x: r.e.sigma * 100, y: r.e.score, r: 4 + r.e.pDoubleTouch * 22, label: r.s.t, tip: "<b>" + r.s.t + "</b><br>Score " + r.e.score.toFixed(0) + " · σ " + pctU(r.e.sigma) + "<br>P(touch 2×) " + pctU(r.e.pDoubleTouch, 1) };
    }), { xLabel: "Volatility σ (%)", yLabel: "Factor score", xFormat: function (v) { return v + "%"; }, yMin: 30, yMax: 80, xMin: 40, xMax: 120 });
  }

  function syncLabControls() {
    var rf = $("#p-rf"), sp = $("#p-sp");
    if (!rf) return;
    rf.value = lab.params.riskFree; $("#o-rf").textContent = (lab.params.riskFree * 100).toFixed(2) + "%";
    sp.value = lab.params.spread; $("#o-sp").textContent = "±" + (lab.params.spread * 100).toFixed(0) + "%";
    M.FACTORS.forEach(function (f) { $("#w-" + f).value = lab.weights[f]; $("#ow-" + f).textContent = lab.weights[f]; });
    $$(".seg button[data-h]").forEach(function (b) { b.setAttribute("aria-pressed", String(Number(b.dataset.h) === lab.params.horizonYears)); });
    $("#p-theme").value = lab.theme;
  }

  function bindLab() {
    syncLabControls();
    var save = function () { store("lab.weights", lab.weights); store("lab.params", lab.params); };
    $("#p-rf").addEventListener("input", function (e) { lab.params.riskFree = Number(e.target.value); syncLabControls(); save(); renderLab(); });
    $("#p-sp").addEventListener("input", function (e) { lab.params.spread = Number(e.target.value); syncLabControls(); save(); renderLab(); });
    $("#p-theme").addEventListener("change", function (e) { lab.theme = e.target.value; renderLab(); });
    $$(".seg button[data-h]").forEach(function (b) { b.addEventListener("click", function () { lab.params.horizonYears = Number(b.dataset.h); syncLabControls(); save(); renderLab(); }); });
    M.FACTORS.forEach(function (f) { $("#w-" + f).addEventListener("input", function (e) { lab.weights[f] = Number(e.target.value); syncLabControls(); save(); renderLab(); }); });
    $("#lab-reset").addEventListener("click", function () { lab.weights = Object.assign({}, M.DEFAULT_WEIGHTS); lab.params = Object.assign({}, M.DEFAULT_PARAMS); lab.theme = "all"; save(); syncLabControls(); renderLab(); });
    $$("#lab-table th.sortable").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.dataset.k;
        if (lab.sort === k) lab.dir = -lab.dir; else { lab.sort = k; lab.dir = k === "t" || k === "theme" ? 1 : -1; }
        renderLab();
      });
    });
    $("#lab-table tbody").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-t]");
      if (!tr) return;
      var t = tr.dataset.t;
      lab.open[t] = !lab.open[t];
      renderLab();
    });
  }

  /* ------------------------------------------------------------------ */
  /* View: Live model (pipeline output)                                  */
  /* ------------------------------------------------------------------ */
  function viewModel() {
    var h = '<div class="section-head"><div><h2>Live model: backtested on real price history</h2><p>Run <code>python -m pipeline.build</code> to download ~10 years of daily prices, the latest two 13F filings from major institutions, and FRED macro series. The pipeline trains a doubling classifier on history and scores today\'s universe. Results appear here automatically.</p></div></div>';
    if (!G) {
      h += '<div class="card"><h3>No generated dataset found</h3><p>This tab is empty until the data pipeline has been run. The pipeline uses only the Python standard library and free public sources: Yahoo Finance chart API (Stooq fallback), SEC EDGAR, FRED.</p>' +
        '<pre class="code">cd market-atlas\n# optional: SEC asks for a contact in the User-Agent\nexport SEC_USER_AGENT="Your Name you@example.com"\npython3 -m pipeline.build            # full universe (~200 tickers)\npython3 -m pipeline.build --quick    # 30 tickers, fast smoke run\n# then reload index.html</pre>' +
        '<p class="small secondary">What it computes:</p><ul class="small secondary"><li>Label: did the stock close at ≥ 2× its price at any point in the next 252 trading days?</li><li>Features: 12-1 month momentum, 3-month momentum, 1-yr realised volatility, drawdown from 52-week high, distance from 200-day average, and a volume trend.</li><li>A logistic regression is trained on data before a cut-off date and tested out-of-sample after it (AUC and a calibration table), with doubling rates by feature quintile.</li><li>Current scores for every ticker, plus position-level Q/Q adds and cuts from each institution\'s 13F.</li></ul></div>';
      return h;
    }
    var B = G.backtest;
    h += '<div class="kpis">' + [
      ["Universe", G.universe + " tickers", G.priceStart + " → " + G.priceEnd],
      ["Samples", B.samples.toLocaleString(), "Monthly stock-dates with a full 12m forward window"],
      ["Base rate", pctU(B.baseRate, 2), "Share that touched 2× within 12m"],
      ["Out-of-sample AUC", B.aucTest == null ? "n/a" : B.aucTest.toFixed(3), "Train AUC " + (B.aucTrain == null ? "n/a" : B.aucTrain.toFixed(3)) + " · 0.5 = random"],
      ["Train / test split", B.trainEnd, "Test from " + B.testStart],
      ["Generated", G.generatedAt.slice(0, 16).replace("T", " "), "UTC"]
    ].map(function (k) { return '<div class="kpi"><div class="label">' + k[0] + '</div><div class="value" style="font-size:1.2rem">' + esc(k[1]) + '</div><div class="note">' + esc(k[2]) + "</div></div>"; }).join("") + "</div>";

    h += '<div class="grid g2" style="margin-top:16px">';
    h += card("Calibration (out-of-sample)", "Predicted vs. realised doubling rate by predicted-probability decile", '<div class="table-wrap"><table><thead><tr><th>Bucket</th><th class="num">N</th><th class="num">Predicted</th><th class="num">Actual</th></tr></thead><tbody>' +
      B.calibration.map(function (c) { return "<tr><td>" + esc(c.bucket) + '</td><td class="num">' + c.n + '</td><td class="num">' + pctU(c.predicted, 1) + '</td><td class="num">' + pctU(c.actual, 1) + "</td></tr>"; }).join("") + "</tbody></table></div>");
    h += card("Model coefficients", "Standardised logistic-regression weights (positive = raises doubling odds)", '<div id="lm-coef"></div>');
    h += "</div>";

    h += '<h3 style="margin:24px 0 12px">Doubling rate by feature quintile (full history)</h3><div class="grid g3">' +
      G.factorBuckets.map(function (f, i) { return card(esc(f.label), "Q1 = lowest, Q5 = highest", '<div id="lm-fb-' + i + '"></div>'); }).join("") + "</div>";

    h += '<div class="card" style="margin-top:16px"><h3>Current universe ranked by model probability</h3><div class="sub">Probability of touching 2× within 12 months, from the logistic model trained on history</div><div class="table-wrap"><table><thead><tr><th>#</th><th>Ticker</th><th class="num">Price</th><th class="num">P(2× in 12m)</th><th class="num">1-yr</th><th class="num">12-1 mom</th><th class="num">3m mom</th><th class="num">σ</th><th class="num">From 52w high</th><th class="num">vs 200d</th></tr></thead><tbody>' +
      G.current.slice(0, 60).map(function (r, i) {
        return "<tr><td>" + (i + 1) + '</td><td class="tick">' + esc(r.ticker) + '</td><td class="num">' + money(r.price) + '</td><td class="num up"><strong>' + pctU(r.prob, 1) + '</strong></td><td class="num ' + signClass(r.ret1y) + '">' + pct(r.ret1y * 100, 0) + '</td><td class="num">' + pct(r.mom12_1 * 100, 0) + '</td><td class="num">' + pct(r.mom3 * 100, 0) + '</td><td class="num">' + pctU(r.vol) + '</td><td class="num down">' + pct(r.dd52 * 100, 0) + '</td><td class="num">' + pct(r.above200 * 100, 0) + "</td></tr>";
      }).join("") + "</tbody></table></div></div>";

    if (G.institutions && G.institutions.length) {
      h += '<h3 style="margin:24px 0 12px">13F: position-level changes (latest vs prior quarter)</h3><div class="grid g2">' +
        G.institutions.map(function (inst) {
          var li = function (arr, cls) { return '<ul class="' + cls + '">' + arr.slice(0, 10).map(function (x) { return '<li><span class="tick">' + esc(x.ticker || x.name.slice(0, 10)) + '</span><span class="secondary small">' + esc(x.status) + " · " + (x.valueChange >= 0 ? "+" : "−") + "$" + (Math.abs(x.valueChange) / 1e6).toFixed(0) + "M</span></li>"; }).join("") + "</ul>"; };
          return '<div class="card"><div class="inst-head"><h3 style="margin:0">' + esc(inst.name) + '</h3><span class="aum">$' + (inst.total / 1e9).toFixed(1) + 'B</span></div><div class="small muted">Period ' + esc(inst.period) + " vs " + esc(inst.prevPeriod) + " · " + inst.positions + " positions · Q/Q " + pct((inst.total / inst.prevTotal - 1) * 100) + '</div><div style="margin-top:8px">' +
            inst.top.slice(0, 8).map(function (t) { return '<span class="chip t">' + esc(t.ticker || t.name) + " " + (t.weight * 100).toFixed(1) + "%</span>"; }).join("") +
            '</div><div class="moves"><div><h4>Largest adds</h4>' + li(inst.adds, "buy") + "</div><div><h4>Largest cuts</h4>" + li(inst.cuts, "sell") + "</div></div></div>";
        }).join("") + "</div>";
    }

    if (G.macro && G.macro.length) {
      h += '<div class="card" style="margin-top:16px"><h3>FRED macro series (latest)</h3><div class="table-wrap"><table><thead><tr><th>Series</th><th class="num">Latest</th><th>Date</th><th class="num">1-yr change</th></tr></thead><tbody>' +
        G.macro.map(function (m) { return "<tr><td>" + esc(m.name) + ' <span class="small muted">' + esc(m.id) + '</span></td><td class="num">' + m.latest.toFixed(2) + "</td><td>" + esc(m.date) + '</td><td class="num">' + (m.change1y == null ? "—" : (m.change1y > 0 ? "+" : "") + m.change1y.toFixed(2)) + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
    }

    chart(function () {
      C.hbar($("#lm-coef"), B.coef.map(function (c) { return { label: c.feature, value: c.weight }; }), { format: function (v) { return v.toFixed(2); }, labelWidth: 130 });
      G.factorBuckets.forEach(function (f, i) {
        C.columns($("#lm-fb-" + i), f.buckets.map(function (b) { return { label: "Q" + b.q, value: b.rate * 100, color: "var(--series-1)", tip: "<b>Q" + b.q + "</b> (" + b.lo.toFixed(2) + " → " + b.hi.toFixed(2) + ")<br>Doubling rate " + pctU(b.rate, 2) + "<br>n = " + b.n.toLocaleString() }; }), { format: function (v) { return v.toFixed(1) + "%"; }, height: 180 });
      });
    });
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* View: Methodology & sources                                         */
  /* ------------------------------------------------------------------ */
  function viewMethod() {
    var h = '<div class="section-head"><div><h2>Methodology, limitations &amp; sources</h2></div></div><div class="grid g2">';
    h += card("How this site is built", "", '<ul class="small"><li><strong>Research snapshot</strong> (<code>data/snapshot.js</code>): every hard number was taken from a published report and cited inline. Figures are as reported and were not re-verified against exchange data.</li><li><strong>Factor ratings</strong> in the Doubling Lab are analyst judgement based on the cited facts. They are editable in the data file, and the weights are editable with the sliders.</li><li><strong>Probability engine</strong> (<code>assets/js/model.js</code>): closed-form GBM probabilities, unit-tested against Monte Carlo.</li><li><strong>Live model</strong> (<code>pipeline/</code>): downloads raw prices, 13F filings and FRED series, backtests a doubling classifier out-of-sample, and writes <code>data/generated/dataset.js</code>.</li></ul>');
    h += card("Known limitations", "", '<ul class="small"><li>13F filings are 45+ days stale, long-only, exclude non-U.S. and most derivative positions, and bank filings mostly reflect client assets.</li><li>Price-based backtests of a hand-picked universe have <em>survivorship bias</em>: delisted losers are missing, which overstates doubling rates.</li><li>GBM assumes constant volatility and no jumps. Binary events (FDA, trial readouts) are fatter-tailed than the model assumes.</li><li>Analyst targets lag prices and cluster. A target implying +100% is a bull case, not a base case.</li><li>Nothing here is investment advice. Size positions for the ½× outcome, not the 2× one.</li></ul>');
    h += "</div>";
    h += '<div class="card sources" style="margin-top:16px"><h3>Sources (' + sourceIds.length + ")</h3><ol>" +
      sourceIds.map(function (id) { var s = S.sources[id]; return '<li><a href="' + esc(s.u) + '" target="_blank" rel="noopener">' + esc(s.t) + "</a></li>"; }).join("") + "</ol></div>";
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* Router                                                              */
  /* ------------------------------------------------------------------ */
  var VIEWS = [
    ["overview", "Overview", viewOverview],
    ["macro", "Macro & Rates", viewMacro],
    ["equities", "Sectors & Leaders", viewEquities],
    ["smart-money", "Smart Money (13F)", viewSmartMoney],
    ["banks", "Bank Views", viewBanks],
    ["history", "Past Doublers", viewHistory],
    ["lab", "Doubling Lab", viewLab],
    ["model", "Live Model", viewModel],
    ["method", "Method & Sources", viewMethod]
  ];

  function route() {
    var id = (location.hash || "#overview").slice(1);
    var v = VIEWS.filter(function (x) { return x[0] === id; })[0] || VIEWS[0];
    $$(".tabs a").forEach(function (a) { a.setAttribute("aria-current", a.getAttribute("href") === "#" + v[0] ? "page" : "false"); });
    var main = $("#view");
    chartJobs = [];
    main.innerHTML = '<section class="view active" aria-labelledby="tab-' + v[0] + '">' + v[2]() + "</section>";
    flushCharts();
    window.scrollTo(0, 0);
  }

  function init() {
    $("#asof").textContent = "Snapshot " + S.asOf;
    var live = $("#live");
    if (G) { live.innerHTML = '<span class="dot"></span>Pipeline data ' + esc(G.generatedAt.slice(0, 10)); }
    else { live.classList.add("warn"); live.innerHTML = '<span class="dot"></span>Snapshot only'; }
    $("#nav").innerHTML = VIEWS.map(function (v) { return '<a id="tab-' + v[0] + '" href="#' + v[0] + '">' + esc(v[1]) + "</a>"; }).join("");

    var saved = store("theme");
    if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
    $("#theme").addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme") ||
        (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      var next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      store("theme", next);
    });

    window.addEventListener("hashchange", route);
    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(flushCharts, 150); });
    route();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
