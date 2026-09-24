(function (root) {
  "use strict";
  var BSX = root.BSX, U = BSX.UI.util, C = BSX.UI.charts, App = BSX.UI.App;
  var Cal = BSX.Cal, Econ = BSX.Economy, Market = BSX.Market;
  var esc = U.esc, $ = U.$;

  var TILES = ["US500", "TECH100", "IND30", "SMALL200", "SVX", "Y10", "WTI", "GOLD", "ORB", "AETH", "EURUSD", "USDJPY"];
  var NEWS_KINDS = [["all", "All"], ["macro", "Economy & Fed"], ["market", "Market"], ["earnings", "Earnings"], ["company", "Companies"], ["sector", "Sectors"], ["commodity", "Commodities"], ["crypto", "Crypto"]];

  function st() { return App.state("markets", { mover: "gainers", news: "all", sectorRange: "1D", heat: "US500" }); }

  function render() {
    var W = App.W, s = st();
    var R = Econ.REGIMES[W.E.regime];
    var h = '<div class="section-head"><div><h2>Markets</h2><p>' + esc(R.name) + " · " + esc(R.desc) + "</p></div></div>";
    var fresh = W.day <= Cal.addTradingDays(W.startDay, 2) && !Object.keys(W.A.pos).length && !W.A.orders.length;
    if (fresh) {
      h += '<div class="card welcome" style="margin-bottom:14px"><div><h3 style="margin-bottom:4px">Your ' + U.money0(W.A.cash) + " account is ready</h3>" +
        '<p class="small secondary" style="margin:0">The clock is paused. Press ▶ (or Space) to run it; each step is 15 minutes of market time. Search any of 700+ symbols, or click a tile, a heatmap cell or a headline ticker to open its chart and order ticket. You can trade 552 stocks, 51 ETFs, options, Treasuries, corporate and municipal bonds, futures, FX, crypto and crypto perpetuals, long or short, with margin.</p></div>' +
        '<div class="row"><button type="button" class="primary" data-act="start">▶ Start the clock</button><button type="button" data-go="guide">How it works</button></div></div>';
    }
    h += '<div class="tiles" data-region="tiles"></div>';
    h += '<div class="grid split" style="margin-top:14px;align-items:start">' +
      '<div class="card"><div class="card-head"><h3>Heatmap</h3><div class="row"><div class="seg">' +
        [["US500", "US 500"], ["ALL", "All 552 stocks"]].map(function (x) { return '<button type="button" data-heat="' + x[0] + '" aria-pressed="' + (s.heat === x[0]) + '">' + x[1] + "</button>"; }).join("") +
        '</div><div class="heat-legend"><span>−3%</span><span class="ramp" data-region="ramp"></span><span>+3%</span></div></div></div>' +
        '<div class="sub">Box size is market cap; color is today\'s change. Click a box to trade.</div>' +
        '<div class="chart-box"><canvas data-region="heat" aria-label="Stock heatmap by sector"></canvas></div></div>' +
      '<div class="stack">' +
        '<div class="card flush"><div class="card-head" style="padding:14px 16px 0"><h3>Movers</h3><div class="seg">' +
          [["gainers", "Gainers"], ["losers", "Losers"], ["active", "Most active"]].map(function (x) { return '<button type="button" data-mover="' + x[0] + '" aria-pressed="' + (s.mover === x[0]) + '">' + x[1] + "</button>"; }).join("") +
        '</div></div><div class="table-wrap" data-region="movers"></div></div>' +
        '<div class="card"><div class="card-head"><h3>Sectors</h3><div class="seg">' +
          ["1D", "1M", "YTD"].map(function (x) { return '<button type="button" data-srange="' + x + '" aria-pressed="' + (s.sectorRange === x) + '">' + x + "</button>"; }).join("") +
        '</div></div><div data-region="sectors"></div></div>' +
      "</div></div>";
    h += '<div class="grid split" style="margin-top:14px">' +
      '<div class="card"><div class="card-head"><h3>Headlines</h3><div class="chips">' + NEWS_KINDS.map(function (k) { return '<button type="button" class="chip" data-news="' + k[0] + '" aria-pressed="' + (s.news === k[0]) + '">' + k[1] + "</button>"; }).join("") + '</div></div><ul class="news scroll" data-region="news"></ul></div>' +
      '<div class="stack">' +
        '<div class="card flush"><div class="card-head" style="padding:14px 16px 0"><h3>Watchlist</h3><span class="small muted">☆ Watch in any trade window</span></div><div class="table-wrap" data-region="watch"></div></div>' +
        '<div class="card"><h3>Coming up</h3><div data-region="cal"></div></div>' +
      "</div></div>";
    return h;
  }

  function mount(app, el) {
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      var s = st();
      if (b.dataset.act === "start") { App.play(); return; }
      if (b.dataset.heat) { s.heat = b.dataset.heat; App.refresh(true); }
      else if (b.dataset.mover) { s.mover = b.dataset.mover; App.refresh(true); }
      else if (b.dataset.srange) { s.sectorRange = b.dataset.srange; App.refresh(true); }
      else if (b.dataset.news) { s.news = b.dataset.news; App.refresh(true); }
    });
    var P = C.palette();
    $('[data-region="ramp"]', el).style.background = "linear-gradient(90deg," + P.neg + "," + P.surface3 + "," + P.pos + ")";
    st().heatDrawn = 0;
  }

  // Today's intraday path once the session is under way; otherwise the last month of closes.
  function sparkSeries(a) {
    if (a.intra.length > 2) return a.intra;
    var last = a.intraHist.length ? a.intraHist[a.intraHist.length - 1].p : null;
    if (last && last.length > 2) return last;
    return a.bars.c.slice(-22).concat([a.px]);
  }
  BSX.UI.sparkSeries = sparkSeries;

  function tile(W, id) {
    var M = W.M;
    if (id === "Y10") {
      var y = Econ.yieldAt(W.E, 10, W.day), h = W.E.hist.y10.slice(-40);
      var prev = h.length ? h[h.length - 1] : y;
      if (W.phase === "closed" && h.length > 1) prev = h[h.length - 2];
      var d = (y - prev) * 100;
      return '<button type="button" class="tile" data-go="bonds"><div class="nm"><span>10-yr Treasury</span><span class="muted">yield</span></div><div class="px">' + y.toFixed(3) + '%</div><div class="ch ' + U.cls(-d) + '">' + U.bp(d) + "</div>" + U.spark(h.concat([y]), { up: d <= 0 }) + "</button>";
    }
    var a = M.assets[id];
    var ch = U.change(a);
    var label = { US500: "US 500", TECH100: "Tech 100", IND30: "Industrial 30", SMALL200: "Small Cap 200", SVX: "Volatility (SVX)", WTI: "Crude oil", GOLD: "Gold", ORB: "Orbit (ORB)", AETH: "Aether (AETH)", EURUSD: "EUR/USD", USDJPY: "USD/JPY" }[id] || a.name;
    var up = id === "SVX" ? ch <= 0 : ch >= 0;
    return '<button type="button" class="tile" data-trade="' + id + '"><div class="nm"><span>' + esc(label) + "</span>" + (App.isWatched(id) ? '<span class="muted">★</span>' : "") + '</div><div class="px">' + U.assetPx(a) + '</div><div class="ch ' + U.cls(id === "SVX" ? -ch : ch) + '">' + U.pct(ch) + "</div>" + U.spark(sparkSeries(a), { base: a.intra.length > 2 ? a.prev : null, up: up }) + "</button>";
  }

  function update(app, el) {
    var W = App.W, M = W.M, s = st();
    $('[data-region="tiles"]', el).innerHTML = TILES.map(function (id) { return tile(W, id); }).join("");
    var now = Date.now();
    var heat = $('[data-region="heat"]', el);
    if (heat && (now - (s.heatDrawn || 0) > 900 || !App.running)) {
      s.heatDrawn = now;
      var ids = s.heat === "US500" ? M.assets.US500.members : M.lists.stock;
      var groups = {};
      ids.forEach(function (id) {
        var a = M.assets[id];
        var g = groups[a.sector] || (groups[a.sector] = { label: Market.SEC_BY_ID[a.sector].short, items: [] });
        g.items.push({ id: id, value: a.px * a.shares, change: U.change(a) });
      });
      C.treemap(heat, {
        groups: Object.keys(groups).map(function (k) { return groups[k]; }),
        height: window.innerWidth < 700 ? 380 : window.innerWidth < 1100 ? 480 : 700,
        tip: function (it) { var a = M.assets[it.id]; return "<b>" + it.id + "</b> " + esc(a.name) + "<br>" + U.assetPx(a) + ' <span class="' + U.cls(it.change) + '">' + U.pct(it.change) + "</span><br>Market cap " + U.compact(it.value, "$") + "<br>" + esc(a.industry); },
        onClick: function (it) { App.openTrade(it.id); }
      });
    }
    // Movers
    var stocks = M.lists.stock.map(function (id) { return M.assets[id]; });
    var list;
    if (s.mover === "active") list = stocks.slice().sort(function (a, b) { return b.vol * b.px - a.vol * a.px; });
    else list = stocks.slice().sort(function (a, b) { return s.mover === "gainers" ? U.change(b) - U.change(a) : U.change(a) - U.change(b); });
    $('[data-region="movers"]', el).innerHTML = '<table><thead><tr><th>Symbol</th><th class="num">Price</th><th class="num">Change</th><th class="num">' + (s.mover === "active" ? "$ volume" : "Mkt cap") + "</th></tr></thead><tbody>" +
      list.slice(0, 8).map(function (a) {
        var ch = U.change(a);
        return '<tr class="click" data-trade="' + a.id + '"><td><div class="sym-cell"><span class="sym">' + a.id + '</span><span class="nm">' + esc(a.name) + '</span></div></td><td class="num">' + U.assetPx(a) + '</td><td class="num ' + U.cls(ch) + '">' + U.pct(ch) + '</td><td class="num">' + U.compact(s.mover === "active" ? a.vol * a.px : a.px * a.shares, "$") + "</td></tr>";
      }).join("") + "</tbody></table>";
    // Sectors
    var rows = BSX.Universe.SECTORS.map(function (sec) {
      var ix = M.assets["SEC:" + sec.id];
      var v;
      if (s.sectorRange === "1D") v = U.change(ix);
      else {
        var c = ix.bars.c, n = c.length;
        if (s.sectorRange === "1M") v = n > 21 ? ix.px / c[n - 22] - 1 : null;
        else {
          var y = Cal.parts(W.day).y, first = null;
          for (var i = M.days.length - n; i < M.days.length; i++) if (Cal.parts(M.days[i]).y === y) { first = i - (M.days.length - n); break; }
          var base = first == null ? ix.px : first > 0 ? c[first - 1] : c[0];
          v = ix.px / base - 1;
        }
      }
      var etf = M.lists.etf.filter(function (e) { return M.assets[e].track === "SEC:" + sec.id; })[0];
      return { name: sec.name, v: v, etf: etf };
    }).sort(function (a, b) { return (b.v || 0) - (a.v || 0); });
    var mx = Math.max.apply(null, rows.map(function (x) { return Math.abs(x.v || 0); }).concat([0.001]));
    $('[data-region="sectors"]', el).innerHTML = '<table><tbody>' + rows.map(function (x) {
      var w = Math.abs(x.v || 0) / mx * 50;
      return '<tr class="click" data-trade="' + x.etf + '"><td class="small">' + esc(x.name) + ' <span class="muted mono tiny">' + x.etf + '</span></td><td class="bar-cell" style="width:40%"><i style="' + (x.v >= 0 ? "left:50%;background:var(--pos)" : "right:50%;background:var(--neg)") + ";width:" + w.toFixed(1) + '%"></i></td><td class="num ' + U.cls(x.v) + '">' + U.pct(x.v) + "</td></tr>";
    }).join("") + "</tbody></table>";
    // News
    var kinds = s.news === "macro" ? ["macro", "fed", "bonds"] : s.news === "company" ? ["company", "corporate"] : [s.news];
    var news = M.news.filter(function (n) { return s.news === "all" || kinds.indexOf(n.kind) >= 0; }).slice(0, 60);
    var sig = news.length + ":" + (news[0] ? news[0].id : 0) + ":" + s.news;
    var nel = $('[data-region="news"]', el);
    if (nel.dataset.sig !== sig) {
      nel.dataset.sig = sig;
      nel.innerHTML = news.length ? news.map(function (n) {
        var tags = (n.syms || []).filter(function (x) { return M.assets[x]; }).slice(0, 4).map(function (x) { return '<button type="button" class="chip t" data-trade="' + esc(x) + '">' + esc(M.assets[x].type === "bond" ? M.assets[x].name : x) + "</button>"; }).join("");
        var rel = n.release ? '<div class="tiny muted">Actual ' + esc(n.release.actual) + " · consensus " + esc(n.release.cons) + " · prior " + esc(n.release.prior) + (n.release.extra ? " · " + esc(n.release.extra) : "") + "</div>" : "";
        return '<li><span class="when">' + esc(U.when(n.day, n.tick)) + '</span><div><span class="k ' + n.kind + '">' + esc(n.kind === "fed" ? "Fed" : n.kind) + "</span> " + esc(n.title) + rel + (tags ? '<div class="tags">' + tags + "</div>" : "") + "</div></li>";
      }).join("") : '<li><span></span><span class="muted">No headlines in this category yet.</span></li>';
    }
    // Watchlist
    var wl = App.watch.filter(function (id) { return M.assets[id]; });
    $('[data-region="watch"]', el).innerHTML = wl.length ? "<table><tbody>" + wl.map(function (id) {
      var a = M.assets[id], ch = U.change(a);
      return '<tr class="click" data-trade="' + id + '"><td><div class="sym-cell"><span class="sym">' + esc(a.type === "bond" ? a.name : id) + '</span><span class="nm">' + esc(a.name) + "</span></div></td><td>" + U.spark(sparkSeries(a), { base: a.intra.length > 2 ? a.prev : null }) + '</td><td class="num">' + U.assetPx(a) + '</td><td class="num ' + U.cls(ch) + '">' + U.pct(ch) + '</td><td class="c"><button type="button" class="ghost sm" data-watch="' + id + '" data-stop="1" aria-label="Remove from watchlist">✕</button></td></tr>';
    }).join("") + "</tbody></table>" : '<div class="empty">Nothing watched yet.</div>';
    // Calendar
    var up = Econ.upcoming(W.E, W.phase === "closed" ? Cal.nextTradingDay(W.day) : W.day, 6);
    var horizon = Cal.addTradingDays(W.day, 4);
    var earn = M.assets.US500.members.slice().sort(function (a, b) { return M.assets[b].px * M.assets[b].shares - M.assets[a].px * M.assets[a].shares; }).slice(0, 150)
      .map(function (id) { return M.assets[id]; }).filter(function (a) { return a.nextEarn != null && a.nextEarn <= horizon && (a.nextEarn > W.day || (a.nextEarn === W.day && (W.phase === "open" && a.earnAmc))); })
      .sort(function (a, b) { return a.nextEarn - b.nextEarn; }).slice(0, 8);
    $('[data-region="cal"]', el).innerHTML = "<h4>Economic calendar</h4><table><tbody>" + up.map(function (x) {
      return "<tr><td class=\"mono small\">" + Cal.short(x.day) + '</td><td class="small muted">' + esc(x.time) + "</td><td>" + esc(x.name) + (x.cons ? ' <span class="chip">Priced: ' + esc(x.cons) + "</span>" : "") + "</td></tr>";
    }).join("") + "</tbody></table>" +
      '<h4 style="margin-top:12px">Earnings (large caps, next 4 days)</h4>' + (earn.length ? "<table><tbody>" + earn.map(function (a) {
        return '<tr class="click" data-trade="' + a.id + '"><td class="mono small">' + Cal.short(a.nextEarn) + '</td><td class="small muted">' + (a.earnAmc ? "After close" : "Before open") + '</td><td><span class="sym">' + a.id + '</span> <span class="small secondary">' + esc(a.name) + "</span></td></tr>";
      }).join("") + "</tbody></table>" : '<p class="small muted">No large-cap reports in the next four days.</p>');
  }

  App.register({ id: "markets", title: "Markets", render: render, mount: mount, update: update });
})(typeof self !== "undefined" ? self : this);
