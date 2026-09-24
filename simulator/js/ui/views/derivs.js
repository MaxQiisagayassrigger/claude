(function (root) {
  "use strict";
  var BSX = root.BSX, U = BSX.UI.util, App = BSX.UI.App;
  var Cal = BSX.Cal, Broker = BSX.Broker, Econ = BSX.Economy;
  var esc = U.esc, $ = U.$;

  function st() { return App.state("derivs", { tab: "futures" }); }
  function ret(a, n) { var c = a.bars.c, k = c.length; return k > n ? a.px / c[k - n - 1] - 1 : null; }

  function render() {
    var s = st();
    var h = '<div class="section-head"><div><h2>Futures, FX &amp; commodities</h2><p>Leverage through margined contracts. Futures are marked to market at every close and settle in cash at expiry. Spot FX trades in lots of 100,000 at 50:1 (majors) or 20:1, and earns or pays the interest-rate difference overnight. Contracts trade almost around the clock.</p></div>' +
      '<div class="seg">' + [["futures", "Futures"], ["fx", "Currencies"], ["cmdty", "Commodities"]].map(function (x) { return '<button type="button" data-tab="' + x[0] + '" aria-pressed="' + (s.tab === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div></div>";
    h += '<div class="card flush"><div class="table-wrap" data-region="table"></div></div>';
    h += '<div class="grid g3" style="margin-top:14px">' +
      '<div class="card"><h3>Futures in brief</h3><p class="small secondary">A futures contract controls a large notional amount (for example 50 × the US 500 index) for a margin deposit of a few percent. Every day your gain or loss is settled in cash. The futures price sits above or below spot by the cost of carry: interest minus dividends for index futures, storage and convenience yield for commodities.</p></div>' +
      '<div class="card"><h3>Currencies in brief</h3><p class="small secondary">One lot is 100,000 units of the base currency. A 1-pip move on EUR/USD is $10 per lot. Holding a currency with a higher interest rate than the one you sold earns a daily swap; the reverse costs you. US rules cap leverage at 50:1 on majors and 20:1 on other pairs.</p></div>' +
      '<div class="card"><h3>Commodities in brief</h3><p class="small secondary">Spot prices are reference rates. Trade them through futures or commodity funds. When futures trade above spot (contango), funds that roll futures lose a little every month, which is why oil and gas funds often lag the commodity itself.</p></div>' +
      "</div>";
    return h;
  }

  function mount(app, el) {
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-tab]");
      if (b) { st().tab = b.dataset.tab; App.refresh(true); }
    });
  }

  function update(app, el) {
    var W = App.W, M = W.M, s = st(), h;
    if (s.tab === "futures") {
      var groups = {};
      M.lists.future.forEach(function (id) { var a = M.assets[id]; (groups[a.group] = groups[a.group] || []).push(a); });
      h = '<table><thead><tr><th>Contract</th><th class="num">Expires</th><th class="num">Last</th><th class="num">Today</th><th class="num">Spot</th><th class="num">Basis</th><th class="num">Multiplier</th><th class="num">Notional</th><th class="num">Initial margin</th><th class="num">Your position</th></tr></thead><tbody>';
      Object.keys(groups).forEach(function (g) {
        h += '<tr class="group"><td colspan="10">' + esc(g) + "</td></tr>";
        groups[g].forEach(function (a) {
          var ch = U.change(a);
          var spot = M.assets[a.und];
          var rates = Broker.ctrRates(W, a, {});
          var p = W.A.pos[a.id];
          h += '<tr class="click" data-trade="' + a.id + '"><td><div class="sym-cell"><span class="sym">' + a.id + '</span><span class="nm">' + esc(a.name) + "</span></div></td>" +
            '<td class="num">' + Cal.shortY(a.exp) + ' <span class="muted">(' + Cal.tradingDaysBetween(W.day, a.exp) + 'd)</span></td><td class="num">' + U.assetPx(a) + '</td><td class="num ' + U.cls(ch) + '">' + U.pct(ch) + "</td>" +
            '<td class="num">' + (spot ? U.assetPx(spot) : "—") + '</td><td class="num">' + (spot ? U.assetPx(a, a.px - spot.px) : "—") + '</td><td class="num">$' + a.mult.toLocaleString("en-US") + "</td>" +
            '<td class="num">' + U.compact(a.px * a.mult, "$") + '</td><td class="num">' + U.money0(a.px * a.mult * rates[0]) + '</td><td class="num">' + (p ? (p.qty > 0 ? "+" : "") + p.qty : "") + "</td></tr>";
        });
      });
      h += "</tbody></table>";
    } else if (s.tab === "fx") {
      var us = Econ.effective(W.E) / 100;
      h = '<table><thead><tr><th>Pair</th><th class="num">Bid</th><th class="num">Ask</th><th class="num">Spread</th><th class="num">Today</th><th></th><th class="num">1M</th><th class="num">Margin</th><th class="num">Swap long/lot/day</th><th class="num">Swap short/lot/day</th><th class="num">Your position</th></tr></thead><tbody>' +
        M.lists.fx.map(function (id) {
          var a = M.assets[id], q = BSX.Market.quote(M, id), ch = U.change(a), m1 = ret(a, 21);
          var rb = a.base === "USD" ? us : M.fxRates[a.base], rq = a.quote === "USD" ? us : M.fxRates[a.quote];
          var lotUsd = Broker.LOT * (a.base === "USD" ? 1 : a.px);
          var p = W.A.pos[id];
          return '<tr class="click" data-trade="' + id + '"><td><div class="sym-cell"><span class="sym">' + esc(a.name) + '</span><span class="nm">' + (a.major ? "Major" : "Minor") + "</span></div></td>" +
            '<td class="num">' + U.assetPx(a, q.bid) + '</td><td class="num">' + U.assetPx(a, q.ask) + '</td><td class="num">' + a.sprPips + ' pips</td><td class="num ' + U.cls(ch) + '">' + U.pct(ch) + "</td><td>" + U.spark(BSX.UI.sparkSeries(a), { base: a.intra.length > 2 ? a.prev : null }) + "</td>" +
            '<td class="num ' + U.cls(m1) + '">' + U.pct(m1, 1) + '</td><td class="num">' + (a.major ? "2%" : "5%") + '</td><td class="num ' + U.cls(rb - rq - 0.005) + '">' + U.signedMoney(lotUsd * (rb - rq - 0.005) / 365) + '</td><td class="num ' + U.cls(rq - rb - 0.005) + '">' + U.signedMoney(lotUsd * (rq - rb - 0.005) / 365) + "</td>" +
            '<td class="num">' + (p ? (p.qty > 0 ? "+" : "") + p.qty + " lots" : "") + "</td></tr>";
        }).join("") + "</tbody></table>";
    } else {
      h = '<table><thead><tr><th>Commodity</th><th class="num">Price</th><th class="num">Today</th><th></th><th class="num">1M</th><th class="num">1Y</th><th class="num">Futures curve</th><th>Trade via</th></tr></thead><tbody>' +
        M.lists.commodity.map(function (id) {
          var a = M.assets[id], ch = U.change(a), m1 = ret(a, 21), y1 = ret(a, 252);
          var via = M.lists.future.filter(function (f) { return M.assets[f].und === id; }).slice(0, 1).concat(M.lists.etf.filter(function (e) { return M.assets[e].track === id; }));
          return '<tr class="click" data-trade="' + id + '"><td><div class="sym-cell"><span class="sym">' + esc(a.name) + '</span><span class="nm">' + esc(a.unit) + "</span></div></td>" +
            '<td class="num">' + U.assetPx(a) + '</td><td class="num ' + U.cls(ch) + '">' + U.pct(ch) + "</td><td>" + U.spark(BSX.UI.sparkSeries(a), { base: a.intra.length > 2 ? a.prev : null }) + "</td>" +
            '<td class="num ' + U.cls(m1) + '">' + U.pct(m1, 1) + '</td><td class="num ' + U.cls(y1) + '">' + U.pct(y1, 1) + '</td><td class="num">' + (a.kappa === 0 ? "Carry" : (a.carry >= 0 ? "Contango " : "Backwardation ") + U.pctU(Math.abs(a.carry), 1)) + "</td>" +
            "<td>" + via.map(function (x) { return '<button type="button" class="chip t" data-trade="' + x + '">' + x + "</button>"; }).join("") + "</td></tr>";
        }).join("") + "</tbody></table>";
    }
    $('[data-region="table"]', el).innerHTML = h;
  }

  App.register({ id: "derivs", title: "Futures & FX", render: render, mount: mount, update: update });
})(typeof self !== "undefined" ? self : this);
