(function (root) {
  "use strict";
  var BSX = root.BSX, U = BSX.UI.util, C = BSX.UI.charts, App = BSX.UI.App;
  var Cal = BSX.Cal, Econ = BSX.Economy;
  var esc = U.esc, $ = U.$;

  function st() { return App.state("bonds", { tab: "ust", sort: "mat", dir: 1 }); }

  function render() {
    var s = st();
    var h = '<div class="section-head"><div><h2>Bonds &amp; rates</h2><p>Treasury bills, notes and bonds auctioned on a real-world schedule, investment-grade and high-yield corporates whose spreads widen when their issuer\'s stock falls, tax-exempt municipals, and bond funds. Prices are per $100 of face value; bonds trade in $1,000 increments.</p></div></div>';
    h += '<div class="kpis" data-region="kpis"></div>';
    h += '<div class="grid g2" style="margin-top:14px">' +
      '<div class="card"><div class="card-head"><h3>Treasury yield curve</h3><div class="legend"><span><i style="background:var(--series-1)"></i>Today</span><span><i style="background:var(--series-2)"></i>1 month ago</span><span><i style="background:var(--series-3)"></i>1 year ago</span></div></div><div class="chart-box"><canvas data-region="curve" aria-label="Yield curve"></canvas></div></div>' +
      '<div class="card"><div class="card-head"><h3>Rates over time</h3><div class="legend"><span><i style="background:var(--series-4)"></i>Fed funds (upper)</span><span><i style="background:var(--series-1)"></i>2-yr</span><span><i style="background:var(--series-2)"></i>10-yr</span><span><i style="background:var(--series-3)"></i>30-yr</span></div></div><div class="chart-box"><canvas data-region="hist" aria-label="Rates history"></canvas></div></div>' +
      "</div>";
    h += '<div class="card flush" style="margin-top:14px"><div class="card-head" style="padding:12px 14px 0"><div class="seg">' +
      [["ust", "Treasuries"], ["corp", "Corporate"], ["muni", "Municipal"], ["funds", "Bond funds"]].map(function (x) { return '<button type="button" data-tab="' + x[0] + '" aria-pressed="' + (s.tab === x[0]) + '">' + x[1] + "</button>"; }).join("") +
      '</div><span class="small muted" data-region="note"></span></div><div class="table-wrap" data-region="table"></div></div>';
    h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h3>Credit spreads</h3><div class="sub">Extra yield over Treasuries, in percentage points. They widen in slowdowns and when volatility jumps.</div><div class="chart-box"><canvas data-region="spreads" aria-label="Credit spreads"></canvas></div></div>' +
      '<div class="card"><h3>How bond prices move</h3><ul class="small secondary" style="padding-left:18px;margin:0">' +
      "<li>Price and yield move in opposite directions. A bond's <b>duration</b> is its price sensitivity: with duration 8, a 1-point rise in yields cuts the price about 8%.</li>" +
      "<li>Coupons are paid twice a year into cash. You pay the seller accrued interest when you buy between coupon dates and get it back at the next coupon.</li>" +
      "<li>Bills pay no coupon; they're sold at a discount and mature at 100.</li>" +
      "<li>Corporate yields = Treasury yield + credit spread. HY (BB and below) spreads react more to the economy.</li>" +
      "<li>Municipal interest is tax-exempt; the tax-equivalent yield assumes a 37% bracket.</li>" +
      "<li>At maturity the principal is repaid in cash. Margin on Treasuries runs 1–6% of value depending on maturity.</li></ul></div></div>";
    return h;
  }

  function mount(app, el) {
    var s = st();
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-tab],[data-sort]");
      if (!b) return;
      if (b.dataset.tab) { s.tab = b.dataset.tab; s.sort = s.tab === "funds" ? "tenor" : "mat"; s.dir = 1; App.refresh(true); }
      else { var k = b.dataset.sort; if (s.sort === k) s.dir = -s.dir; else { s.sort = k; s.dir = 1; } update(app, el, true); }
    });
  }

  function yld(W, t) { return Econ.yieldAt(W.E, t, W.day); }

  function update(app, el, force) {
    var W = App.W, M = W.M, E = W.E, s = st(), h = E.hist;
    var last = h.d.length ? (h.d[h.d.length - 1] === W.day && W.phase === "closed" ? h.d.length - 2 : h.d.length - 1) : -1;
    var prevCurve = last >= 0 ? h.curve[last] : null;
    function tenorIdx(t) { return Econ.TENORS.map(function (x) { return x[0]; }).indexOf(t); }
    function k(label, t) {
      var y = yld(W, t), p = prevCurve ? prevCurve[tenorIdx(t)] : y;
      return '<div class="kpi"><div class="label">' + label + '</div><div class="value">' + y.toFixed(3) + '%</div><div class="note ' + U.cls(p - y) + '">' + U.bp((y - p) * 100) + " today</div></div>";
    }
    var sp = Econ.spreads(E);
    var y2 = yld(W, 2), y10 = yld(W, 10);
    $('[data-region="kpis"]', el).innerHTML = k("3-month bill", 0.25) + k("2-year note", 2) + k("10-year note", 10) + k("30-year bond", 30) +
      '<div class="kpi"><div class="label">2s10s curve</div><div class="value">' + U.bp((y10 - y2) * 100).replace(" bp", "") + ' bp</div><div class="note">' + (y10 < y2 ? "Inverted: a classic recession signal" : "Normal, upward sloping") + "</div></div>" +
      '<div class="kpi"><div class="label">Fed funds target</div><div class="value">' + Econ.fracStr(E.fed - 0.25) + "–" + Econ.fracStr(E.fed) + '%</div><div class="note">Effective ' + Econ.effective(E).toFixed(2) + "%</div></div>" +
      '<div class="kpi"><div class="label">IG / HY spread</div><div class="value">' + sp.ig.toFixed(2) + " / " + sp.hy.toFixed(2) + '</div><div class="note">Percentage points over Treasuries</div></div>';
    var now = Date.now();
    if (force || !s.drawn || now - s.drawn > 1500 || !App.running) {
      s.drawn = now;
      var cur = Econ.curve(E, W.day).map(function (c) { return c.y; });
      var n = h.curve.length;
      var m1 = n > 21 ? h.curve[n - 22] : null, y1 = n > 251 ? h.curve[n - 252] : (n ? h.curve[0] : null);
      C.lines($('[data-region="curve"]', el), {
        series: [{ values: cur, color: "--series-1", label: "Today", width: 2.2 }].concat(m1 ? [{ values: m1, color: "--series-2", label: "1 month ago" }] : []).concat(y1 ? [{ values: y1, color: "--series-3", label: n > 251 ? "1 year ago" : "Start", dash: true }] : []),
        label: function (i) { return Econ.TENORS[i][1]; }, fmt: function (v) { return v.toFixed(2) + "%"; }, height: 240
      });
      var k2 = Math.min(504, h.d.length);
      var sl = function (arr) { return arr.slice(arr.length - k2); };
      C.lines($('[data-region="hist"]', el), {
        series: [{ values: sl(h.fed), color: "--series-4", label: "Fed funds", step: true }, { values: sl(h.y2), color: "--series-1", label: "2-yr" }, { values: sl(h.y10), color: "--series-2", label: "10-yr" }, { values: sl(h.y30), color: "--series-3", label: "30-yr" }],
        label: function (i, full) { var d = h.d[h.d.length - k2 + i]; return full ? Cal.nice(d) : Cal.short(d) + " " + String(Cal.parts(d).y).slice(2); }, fmt: function (v) { return v.toFixed(2) + "%"; }, height: 240
      });
      C.lines($('[data-region="spreads"]', el), {
        series: [{ values: sl(h.ig), color: "--series-1", label: "Investment grade" }, { values: sl(h.hy), color: "--series-2", label: "High yield" }],
        label: function (i, full) { var d = h.d[h.d.length - k2 + i]; return full ? Cal.nice(d) : Cal.short(d) + " " + String(Cal.parts(d).y).slice(2); }, fmt: function (v) { return v.toFixed(2); }, height: 200, zero: true
      });
    }
    table(W, el, s);
  }

  function table(W, el, s) {
    var M = W.M;
    var head, rows, note = "";
    var th = function (k, label, num) { return "<th data-sort=\"" + k + "\" class=\"sortable " + (num ? "num " : "") + (s.sort === k ? (s.dir > 0 ? "sorted-asc" : "sorted-desc") : "") + '">' + label + "</th>"; };
    if (s.tab === "funds") {
      var funds = M.lists.etf.map(function (id) { return M.assets[id]; }).filter(function (a) { return a.kind === "bond" || (a.kind === "lev" && a.track === "ETF:LONG"); });
      funds.sort(function (a, b) { var x = s.sort === "yld" ? (a.yld || 0) - (b.yld || 0) : s.sort === "chg" ? U.change(a) - U.change(b) : (a.tenor || 99) - (b.tenor || 99); return x * s.dir; });
      head = "<tr><th>Fund</th>" + th("tenor", "Duration", true) + th("yld", "Yield", true) + '<th class="num">Price</th>' + th("chg", "Today", true) + '<th class="num">Expense</th></tr>';
      rows = funds.map(function (a) {
        var ch = U.change(a);
        return '<tr class="click" data-trade="' + a.id + '"><td><div class="sym-cell"><span class="sym">' + a.id + '</span><span class="nm">' + esc(a.name) + '</span></div></td><td class="num">' + (a.kind === "lev" ? a.lev + "× long bond" : (a.tenor < 1 ? a.tenor : a.tenor * 0.92).toFixed(1) + " yrs") + '</td><td class="num">' + (a.yld != null ? U.pctU(a.yld, 2) : "—") + '</td><td class="num">' + U.assetPx(a) + '</td><td class="num ' + U.cls(ch) + '">' + U.pct(ch) + '</td><td class="num">' + U.pctU(a.er, 2) + "</td></tr>";
      }).join("");
      note = "Funds pay monthly income";
    } else {
      var list = M.lists.bond.map(function (id) { return M.assets[id]; }).filter(function (a) { return a.cls === s.tab; });
      var key = function (a) { return s.sort === "yld" ? a.yld : s.sort === "px" ? a.px : s.sort === "cpn" ? a.coupon : s.sort === "dur" ? a.dur : s.sort === "rating" ? "AAA AA+ AA A BBB BB B CCC".split(" ").indexOf(a.rating) : s.sort === "chg" ? U.change(a) : a.mat; };
      list.sort(function (a, b) { return (key(a) - key(b)) * s.dir; });
      var ustY = function (a) { return Econ.yieldAt(W.E, Math.max((a.mat - W.day) / 365.25, 1 / 365), W.day) / 100; };
      head = "<tr><th>" + (s.tab === "ust" ? "Security" : "Issue") + "</th>" + (s.tab === "ust" ? "<th>Type</th>" : th("rating", "Rating")) + th("cpn", "Coupon", true) + th("mat", "Maturity", true) + th("px", "Price", true) + th("yld", "Yield", true) +
        (s.tab === "ust" ? "" : '<th class="num">Spread</th>') + (s.tab === "muni" ? '<th class="num">Tax-equiv.</th>' : "") + th("dur", "Duration", true) + '<th class="num">Accrued</th>' + th("chg", "Today", true) + "</tr>";
      rows = list.map(function (a) {
        var ch = U.change(a);
        var held = W.A.pos[a.id] ? " ●" : "";
        return '<tr class="click" data-trade="' + esc(a.id) + '"><td><div class="sym-cell"><span class="sym">' + esc(a.name) + held + '</span><span class="nm">' + esc(a.label) + "</span></div></td>" +
          (s.tab === "ust" ? '<td class="small">' + (a.freq ? (a.term >= 20 ? "Bond" : "Note") : "Bill") + "</td>" : '<td><span class="chip ' + (["BB", "B", "CCC"].indexOf(a.rating) >= 0 ? "warn" : "") + '">' + a.rating + "</span></td>") +
          '<td class="num">' + (a.freq ? U.pctU(a.coupon, 3) : "—") + '</td><td class="num">' + Cal.shortY(a.mat) + '</td><td class="num">' + a.px.toFixed(3) + '</td><td class="num">' + U.pctU(a.yld, 3) + "</td>" +
          (s.tab === "ust" ? "" : '<td class="num">' + Math.round((a.yld - ustY(a)) * 1e4) + " bp</td>") +
          (s.tab === "muni" ? '<td class="num">' + U.pctU(a.yld / 0.63, 2) + "</td>" : "") +
          '<td class="num">' + a.dur.toFixed(2) + '</td><td class="num">' + a.acc.toFixed(3) + '</td><td class="num ' + U.cls(ch) + '">' + U.pct(ch) + "</td></tr>";
      }).join("");
      note = list.length + " issues" + (s.tab === "ust" ? " · new notes and bonds are auctioned monthly and quarterly" : "");
    }
    $('[data-region="table"]', el).innerHTML = "<table><thead>" + head + "</thead><tbody>" + (rows || '<tr><td class="empty" colspan="10">None listed.</td></tr>') + "</tbody></table>";
    $('[data-region="note"]', el).textContent = note;
  }

  App.register({ id: "bonds", title: "Bonds", render: render, mount: mount, update: function (app, el) { update(app, el, false); } });
})(typeof self !== "undefined" ? self : this);
