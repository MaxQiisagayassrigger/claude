(function (root) {
  "use strict";
  var BSX = root.BSX, U = BSX.UI.util, C = BSX.UI.charts, App = BSX.UI.App;
  var Cal = BSX.Cal, Market = BSX.Market;
  var esc = U.esc, $ = U.$;

  function st() { return App.state("crypto", { sort: "cap", dir: -1 }); }
  function ret(a, n) { var c = a.bars.c, k = c.length; return k > n ? a.px / c[k - n - 1] - 1 : null; }

  function render() {
    var h = '<div class="section-head"><div><h2>Crypto</h2><p>Fourteen coins, including two dollar stablecoins. Spot crypto trades around the clock and keeps moving through nights and weekends while the stock market is shut. For leverage or to go short, use a perpetual contract; for options, use the spot trusts ORBX and AETX.</p></div></div>';
    h += '<div class="kpis" data-region="kpis"></div>';
    h += '<div class="card flush" style="margin-top:14px"><div class="table-wrap" data-region="table"></div></div>';
    h += '<div class="grid g2" style="margin-top:14px">' +
      '<div class="card flush"><div class="card-head" style="padding:12px 14px 0"><h3>Perpetual contracts</h3><span class="small muted">Funding is paid every 8 hours</span></div><div class="table-wrap" data-region="perps"></div></div>' +
      '<div class="card"><h3>Crypto on the stock exchange</h3><div data-region="trusts"></div>' +
      '<h4 style="margin-top:12px">Good to know</h4><ul class="small secondary" style="padding-left:18px;margin:0">' +
      "<li>Spot coins are paid in full: no margin and no shorting. Fees are 0.25% per trade.</li>" +
      "<li>Staking coins pay their yield daily in extra coins while you hold them.</li>" +
      "<li>Perpetuals let you go long or short with up to 20× leverage. When funding is positive, longs pay shorts.</li>" +
      "<li>Crypto has its own cycle: bull runs, sideways ranges and long winters, loosely tied to stocks.</li></ul></div>" +
      "</div>";
    return h;
  }

  function mount(app, el) {
    var s = st();
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-sort]");
      if (!b) return;
      var k = b.dataset.sort;
      if (s.sort === k) s.dir = -s.dir; else { s.sort = k; s.dir = -1; }
      update(app, el);
    });
  }

  function update(app, el) {
    var W = App.W, M = W.M, s = st();
    var coins = M.lists.crypto.map(function (id) { return M.assets[id]; });
    var total = 0, prevTotal = 0, stable = 0;
    coins.forEach(function (a) { total += a.px * a.supply; prevTotal += a.prev * a.supply; if (a.stable) stable += a.px * a.supply; });
    var orb = M.assets.ORB;
    var reg = Market.C_REGIMES[M.f.cRegime];
    $('[data-region="kpis"]', el).innerHTML =
      '<div class="kpi"><div class="label">Total market cap</div><div class="value">' + U.compact(total, "$") + '</div><div class="note ' + U.cls(total - prevTotal) + '">' + U.pct(total / prevTotal - 1) + " since 4 pm</div></div>" +
      '<div class="kpi"><div class="label">Orbit dominance</div><div class="value">' + U.pctU(orb.px * orb.supply / total, 1) + '</div><div class="note">Share of total value in ORB</div></div>' +
      '<div class="kpi"><div class="label">Crypto cycle</div><div class="value" style="font-size:1.05rem">' + esc(reg.name) + '</div><div class="note">Drives the whole asset class</div></div>' +
      '<div class="kpi"><div class="label">Crypto volatility</div><div class="value">' + U.pctU(M.f.cv, 0) + '</div><div class="note">Annualized, market-wide</div></div>' +
      '<div class="kpi"><div class="label">Stablecoin supply</div><div class="value">' + U.compact(stable, "$") + '</div><div class="note">SimDollar + Base Dollar</div></div>';
    var key = function (a) {
      switch (s.sort) {
        case "px": return a.px; case "chg": return U.change(a); case "d7": return ret(a, 5) || 0; case "d30": return ret(a, 21) || 0; case "y1": return ret(a, 252) || 0;
        case "vol": return a.vol * a.px; case "stake": return a.stake || 0; default: return a.px * a.supply;
      }
    };
    coins.sort(function (a, b) { return (key(a) - key(b)) * s.dir; });
    var th = function (k, label) { return '<th data-sort="' + k + '" class="num sortable ' + (s.sort === k ? (s.dir > 0 ? "sorted-asc" : "sorted-desc") : "") + '">' + label + "</th>"; };
    $('[data-region="table"]', el).innerHTML = "<table><thead><tr><th>Coin</th>" + th("px", "Price") + th("chg", "Today") + "<th></th>" + th("d7", "7D") + th("d30", "30D") + th("y1", "1Y") + th("cap", "Market cap") + th("vol", "Volume") + th("stake", "Staking") + '<th class="num">Perp</th></tr></thead><tbody>' +
      coins.map(function (a) {
        var ch = U.change(a), d7 = ret(a, 5), d30 = ret(a, 21), y1 = ret(a, 252);
        var perp = M.assets[a.id + "-PERP"];
        return '<tr class="click" data-trade="' + a.id + '"><td><div class="sym-cell"><span class="sym">' + a.id + (App.isWatched(a.id) ? " ★" : "") + '</span><span class="nm">' + esc(a.name) + "</span></div></td>" +
          '<td class="num">$' + U.price(a.px) + '</td><td class="num ' + U.cls(ch) + '">' + U.pct(ch) + "</td><td>" + U.spark(BSX.UI.sparkSeries(a), { base: a.intra.length > 2 ? a.prev : null }) + "</td>" +
          '<td class="num ' + U.cls(d7) + '">' + U.pct(d7, 1) + '</td><td class="num ' + U.cls(d30) + '">' + U.pct(d30, 1) + '</td><td class="num ' + U.cls(y1) + '">' + U.pct(y1, 1) + "</td>" +
          '<td class="num">' + U.compact(a.px * a.supply, "$") + '</td><td class="num">' + U.compact(a.vol * a.px, "$") + '</td><td class="num">' + (a.stake ? U.pctU(a.stake, 1) : "—") + "</td>" +
          '<td class="num">' + (perp ? '<button type="button" class="sm" data-trade="' + perp.id + '">' + (perp.funding >= 0 ? "+" : "") + (perp.funding * 100).toFixed(4) + "%</button>" : "—") + "</td></tr>";
      }).join("") + "</tbody></table>";
    $('[data-region="perps"]', el).innerHTML = '<table><thead><tr><th>Contract</th><th class="num">Mark</th><th class="num">Today</th><th class="num">Funding 8h</th><th class="num">Annualized</th><th class="num">Max lev.</th></tr></thead><tbody>' +
      M.lists.perp.map(function (id) {
        var a = M.assets[id], ch = U.change(a);
        return '<tr class="click" data-trade="' + id + '"><td><span class="sym">' + id + '</span></td><td class="num">' + U.price(a.px) + '</td><td class="num ' + U.cls(ch) + '">' + U.pct(ch) + '</td><td class="num ' + U.cls(-a.funding) + '">' + U.pct(a.funding, 4) + '</td><td class="num">' + U.pct(a.funding * 3 * 365, 1) + '</td><td class="num">' + a.maxLev + "×</td></tr>";
      }).join("") + "</tbody></table>";
    var tr = ["ORBX", "AETX"].map(function (id) { return M.assets[id]; });
    var fut = M.lists.future.filter(function (id) { return M.assets[id].root === "ORF"; }).map(function (id) { return M.assets[id]; });
    $('[data-region="trusts"]', el).innerHTML = "<table><tbody>" + tr.concat(fut).map(function (a) {
      var ch = U.change(a);
      return '<tr class="click" data-trade="' + a.id + '"><td><div class="sym-cell"><span class="sym">' + a.id + '</span><span class="nm">' + esc(a.name) + '</span></div></td><td class="num">' + U.assetPx(a) + '</td><td class="num ' + U.cls(ch) + '">' + U.pct(ch) + "</td></tr>";
    }).join("") + "</tbody></table>";
  }

  App.register({ id: "crypto", title: "Crypto", render: render, mount: mount, update: update });
})(typeof self !== "undefined" ? self : this);
