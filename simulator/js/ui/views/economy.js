(function (root) {
  "use strict";
  var BSX = root.BSX, U = BSX.UI.util, C = BSX.UI.charts, App = BSX.UI.App;
  var Cal = BSX.Cal, Econ = BSX.Economy;
  var esc = U.esc, $ = U.$;

  var REGIME_COLOR = { expansion: "var(--series-1)", boom: "var(--series-3)", slowdown: "var(--warning)", recession: "var(--critical)", recovery: "var(--series-4)" };

  // Dollar index: the standard geometric formula, with a fixed Swedish krona.
  function dxy(M) {
    var g = function (id) { return M.assets[id].px; };
    return 50.14348112 * Math.pow(g("EURUSD"), -0.576) * Math.pow(g("USDJPY"), 0.136) * Math.pow(g("GBPUSD"), -0.119) * Math.pow(g("USDCAD"), 0.091) * Math.pow(9.5, 0.042) * Math.pow(g("USDCHF"), 0.036);
  }
  App.dxy = dxy;

  function render() {
    var h = '<div class="section-head"><div><h2>Economy</h2><p>A business cycle moves through expansion, late-cycle boom, slowdown, recession and recovery. Growth, inflation and jobs follow it; the Fed sets rates with a Taylor rule; markets react to each data release versus the consensus forecast.</p></div></div>';
    h += '<div class="card"><div class="row between"><div><h4 style="margin-bottom:4px">Current phase</h4><h3 data-region="regime" style="margin:0"></h3><p class="small secondary" data-region="regime-desc" style="margin:4px 0 0"></p></div><div class="legend" data-region="regime-legend"></div></div><div data-region="timeline" style="margin-top:12px"></div></div>';
    h += '<div class="kpis" style="margin-top:14px" data-region="kpis"></div>';
    h += '<div class="grid g2" style="margin-top:14px">' +
      '<div class="card"><div class="card-head"><h3>Inflation and interest rates</h3><div class="legend"><span><i style="background:var(--series-2)"></i>CPI y/y</span><span><i style="background:var(--series-4)"></i>Fed funds (upper)</span><span><i style="background:var(--series-1)"></i>10-yr yield</span></div></div><div class="chart-box"><canvas data-region="c1" aria-label="Inflation and rates"></canvas></div></div>' +
      '<div class="card"><div class="card-head"><h3>Unemployment rate</h3></div><div class="chart-box"><canvas data-region="c2" aria-label="Unemployment rate"></canvas></div></div>' +
      '<div class="card"><div class="card-head"><h3>GDP growth</h3><span class="small muted">Advance estimates, annualized</span></div><div class="chart-box"><canvas data-region="c3" aria-label="GDP growth"></canvas></div></div>' +
      '<div class="card"><h3>Latest Fed statement</h3><p class="small secondary" data-region="stmt"></p><dl class="list-kv" data-region="fed"></dl></div>' +
      "</div>";
    h += '<div class="grid g2" style="margin-top:14px">' +
      '<div class="card flush"><div class="card-head" style="padding:12px 14px 0"><h3>Calendar</h3></div><div class="table-wrap" data-region="cal"></div></div>' +
      '<div class="card flush"><div class="card-head" style="padding:12px 14px 0"><h3>Recent releases</h3><span class="small muted">Surprise in standard units</span></div><div class="table-wrap" style="max-height:420px;overflow-y:auto" data-region="rel"></div></div>' +
      "</div>";
    return h;
  }

  function update(app, el) {
    var W = App.W, E = W.E, M = W.M, h = E.hist;
    var R = Econ.REGIMES[E.regime];
    $('[data-region="regime"]', el).innerHTML = '<span style="color:' + REGIME_COLOR[E.regime] + '">●</span> ' + esc(R.name) + ' <span class="small muted">for ' + E.regimeAge + " days</span>";
    $('[data-region="regime-desc"]', el).textContent = R.desc;
    $('[data-region="regime-legend"]', el).innerHTML = Object.keys(Econ.REGIMES).map(function (k) { return '<span><i style="background:' + REGIME_COLOR[k] + '"></i>' + Econ.REGIMES[k].name + "</span>"; }).join("");
    // Regime timeline as proportional segments.
    var segs = [], n = h.regime.length;
    for (var i = 0; i < n; i++) { if (!segs.length || segs[segs.length - 1].r !== h.regime[i]) segs.push({ r: h.regime[i], n: 0, from: h.d[i] }); segs[segs.length - 1].n++; }
    $('[data-region="timeline"]', el).innerHTML = n ? '<div style="display:flex;height:12px;border-radius:6px;overflow:hidden">' + segs.map(function (sg) { return '<span title="' + esc(Econ.REGIMES[sg.r].name) + " from " + Cal.nice(sg.from) + " (" + sg.n + ' trading days)" style="flex:' + sg.n + ";background:" + REGIME_COLOR[sg.r] + '"></span>'; }).join("") + '</div><div class="gauge-labels"><span>' + Cal.nice(h.d[0]) + "</span><span>" + Cal.nice(h.d[n - 1]) + "</span></div>" : "";
    var k = function (label, value, note) { return '<div class="kpi"><div class="label">' + label + '</div><div class="value">' + value + '</div><div class="note">' + note + "</div></div>"; };
    $('[data-region="kpis"]', el).innerHTML =
      k("Real GDP growth", E.gdpPrint.toFixed(1) + "%", "Last quarterly print, annualized") +
      k("CPI inflation", E.cpiPrint.toFixed(1) + "%", "Core " + E.corePrint.toFixed(1) + "% · target 2%") +
      k("Unemployment", E.unempPrint.toFixed(1) + "%", "Payrolls " + (E.payrollsPrint >= 0 ? "+" : "") + E.payrollsPrint + "k last month") +
      k("Fed funds", Econ.fracStr(E.fed - 0.25) + "–" + Econ.fracStr(E.fed) + "%", "Rule-based target " + Econ.taylor(E).toFixed(2) + "%") +
      k("10-yr Treasury", Econ.yieldAt(E, 10, W.day).toFixed(2) + "%", "2-yr " + Econ.yieldAt(E, 2, W.day).toFixed(2) + "%") +
      k("ISM manufacturing", E.pmi.toFixed(1), E.pmi >= 50 ? "Above 50: expanding" : "Below 50: contracting") +
      k("Retail sales", (E.retail >= 0 ? "+" : "") + E.retail.toFixed(1) + "%", "Month over month") +
      k("Consumer sentiment", E.sentiment.toFixed(0), "Index") +
      k("Crude oil", "$" + M.assets.WTI.px.toFixed(2), U.pct(U.change(M.assets.WTI)) + " today") +
      k("US dollar index", dxy(M).toFixed(2), "vs six major currencies") +
      k("Volatility (SVX)", M.assets.SVX.px.toFixed(1), M.assets.SVX.px > 30 ? "Fear" : M.assets.SVX.px > 20 ? "Elevated" : "Calm") +
      k("US 500 P/E", M.pe.mkt.toFixed(1), "Fair at today's rates ≈ " + M.pe.fair.toFixed(1));
    var now = Date.now(), s = App.state("economy", {});
    if (!s.drawn || now - s.drawn > 2000 || !App.running) {
      s.drawn = now;
      var len = Math.min(756, h.d.length);
      var sl = function (a) { return a.slice(a.length - len); };
      var lab = function (i, full) { var d = h.d[h.d.length - len + i]; return full ? Cal.nice(d) : Cal.short(d) + " " + String(Cal.parts(d).y).slice(2); };
      var pf = function (v) { return v.toFixed(2) + "%"; };
      C.lines($('[data-region="c1"]', el), { series: [{ values: sl(h.cpi), color: "--series-2", label: "CPI" }, { values: sl(h.fed), color: "--series-4", label: "Fed funds" }, { values: sl(h.y10), color: "--series-1", label: "10-yr" }], label: lab, fmt: pf, height: 220, minRange: 1 });
      C.lines($('[data-region="c2"]', el), { series: [{ values: sl(h.unemp), color: "--series-1", label: "Unemployment", area: true }], label: lab, fmt: function (v) { return v.toFixed(1) + "%"; }, height: 220, minRange: 1 });
      var gdp = [], gl = [];
      for (var j = 0; j < h.gdp.length; j++) if (j === 0 || h.gdp[j] !== h.gdp[j - 1]) { gdp.push(h.gdp[j]); gl.push(h.d[j]); }
      C.columns($('[data-region="c3"]', el), { values: gdp.slice(-16), label: function (i, full) { var d = gl.slice(-16)[i]; return full ? "Released " + Cal.nice(d) : Cal.MONTHS[Cal.parts(d).m - 1] + " " + String(Cal.parts(d).y).slice(2); }, fmt: function (v) { return v.toFixed(1) + "%"; }, height: 220 });
    }
    $('[data-region="stmt"]', el).textContent = E.statement;
    $('[data-region="fed"]', el).innerHTML = "<dt>Next meeting</dt><dd>" + (E.nextFomc ? Cal.nice(E.nextFomc) : "—") + "</dd><dt>Market pricing</dt><dd>" + (E.fedExpMove === 0 ? "Hold" : (E.fedExpMove > 0 ? "Hike " : "Cut ") + Math.abs(Math.round(E.fedExpMove * 100)) + " bp") + "</dd><dt>Neutral rate estimate</dt><dd>" + (1 + 2.4).toFixed(1) + "%</dd>";
    var up = Econ.upcoming(E, W.phase === "closed" ? Cal.nextTradingDay(W.day) : W.day, 12);
    $('[data-region="cal"]', el).innerHTML = '<table><thead><tr><th>Date</th><th>Time</th><th>Release</th><th>Priced in</th></tr></thead><tbody>' + up.map(function (x) {
      return '<tr><td class="mono small">' + Cal.WEEKDAYS[Cal.weekday(x.day)] + " " + Cal.short(x.day) + '</td><td class="small muted">' + x.time + "</td><td>" + esc(x.name) + '</td><td class="small">' + (x.cons || "—") + "</td></tr>";
    }).join("") + "</tbody></table>";
    $('[data-region="rel"]', el).innerHTML = E.releases.length ? '<table><thead><tr><th>Date</th><th>Release</th><th class="num">Actual</th><th class="num">Consensus</th><th class="num">Prior</th><th class="num">Surprise</th></tr></thead><tbody>' + E.releases.slice(0, 40).map(function (r) {
      return '<tr><td class="mono small">' + Cal.short(r.day) + "</td><td>" + esc(r.name) + (r.extra ? '<div class="tiny muted">' + esc(r.extra) + "</div>" : "") + '</td><td class="num">' + esc(r.actual) + '</td><td class="num">' + esc(r.cons) + '</td><td class="num">' + esc(r.prior) + '</td><td class="num ' + (Math.abs(r.z) >= 1 ? (r.z > 0 ? "up" : "down") : "") + '">' + (r.z > 0 ? "+" : "") + r.z.toFixed(1) + "</td></tr>";
    }).join("") + "</tbody></table>" : '<div class="empty">No releases yet.</div>';
  }

  App.register({ id: "economy", title: "Economy", render: render, update: update });
})(typeof self !== "undefined" ? self : this);
