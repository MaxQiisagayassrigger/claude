/*
 * The trade window: chart, key stats, your position, news and an order
 * ticket that adapts to the instrument (shares, coins, bonds, futures,
 * FX lots, perpetuals with leverage).
 */
(function (root) {
  "use strict";
  var BSX = root.BSX, U = BSX.UI.util, C = BSX.UI.charts, App = BSX.UI.App;
  var Cal = BSX.Cal, Broker = BSX.Broker, Market = BSX.Market, Options = BSX.Options, Econ = BSX.Economy, P = BSX.Pricing;
  var esc = U.esc, $ = U.$;

  var TYPE = { stock: "Stock", etf: "ETF", crypto: "Crypto", bond: "Bond", future: "Futures", perp: "Perpetual", fx: "Spot FX", index: "Index", commodity: "Commodity" };
  var RANGES = [["1D", 0], ["5D", 0], ["1M", 21], ["3M", 63], ["6M", 126], ["1Y", 252], ["2Y", 504]];

  function unitsLabel(a, n) {
    if (a.type === "bond") return "face";
    if (a.type === "future") return n === 1 ? "contract" : "contracts";
    if (a.type === "fx") return n === 1 ? "lot" : "lots";
    if (a.type === "crypto" || a.type === "perp") return a.type === "perp" ? a.und : a.id;
    return n === 1 ? "share" : "shares";
  }

  App.openTrade = function (id, opts) {
    var W = App.W, a = W.M.assets[id];
    if (!a) { App.toast("That symbol isn't listed anymore.", "reject"); return; }
    opts = opts || {};
    var st = {
      id: id,
      range: U.pref("range") || "3M",
      mode: U.pref("chartMode") || "line",
      side: opts.side || "buy",
      type: "market", tif: "day",
      qtyMode: "units",
      lev: a.type === "perp" ? Math.min(5, a.maxLev) : null,
      lastDraw: 0
    };
    var tradable = Market.tradable(a);
    var html =
      '<div class="modal-head">' +
        '<div class="title"><div class="t"><b>' + esc(a.type === "bond" ? a.name : id) + "</b><span>" + esc(a.type === "bond" ? a.label : a.name) + '</span><span class="chip">' + TYPE[a.type] + "</span>" +
        (a.type !== "bond" ? '<button type="button" class="ghost sm" data-r="star" data-watch="' + esc(id) + '" aria-label="Toggle watchlist"></button>' : "") + "</div>" +
        '<div class="small muted" data-r="sub"></div></div>' +
        '<div class="quote" data-r="quote"></div>' +
        '<button type="button" class="ghost modal-close" aria-label="Close">✕</button>' +
      "</div>" +
      '<div class="modal-body"><div class="grid split-r">' +
        '<div class="stack">' +
          '<div class="card"><div class="chart-toolbar">' +
            '<div class="seg" data-r="ranges">' + RANGES.map(function (r) { return '<button type="button" data-range="' + r[0] + '" aria-pressed="' + (r[0] === st.range) + '">' + r[0] + "</button>"; }).join("") + "</div>" +
            '<div class="row"><div class="legend" data-r="legend"></div><div class="seg" data-r="modes"><button type="button" data-mode="line" aria-pressed="' + (st.mode === "line") + '">Line</button><button type="button" data-mode="candle" aria-pressed="' + (st.mode === "candle") + '">Candles</button></div></div>' +
          '</div><div class="chart-box"><canvas data-r="chart" aria-label="Price chart"></canvas></div></div>' +
          '<div class="card"><h3>Key stats</h3><div class="stats-grid" data-r="stats"></div></div>' +
          '<div class="card" data-r="position-card"></div>' +
          '<div class="card"><h3>About</h3><p class="small secondary" data-r="about"></p><div data-r="links" class="row"></div><h4 style="margin-top:12px">News</h4><ul class="news" data-r="news"></ul></div>' +
        "</div>" +
        '<div class="stack"><div class="card">' + (tradable ? ticketHtml(a, st) : noTicketHtml(a)) + "</div>" +
          (tradable ? '<div class="card"><h3>Price alert</h3><div class="row"><select data-r="al-op" aria-label="Condition"><option value=">=">At or above</option><option value="<=">At or below</option></select><input data-r="al-px" class="num" type="number" step="any" style="width:120px" aria-label="Alert price"><button type="button" data-act="alert">Add</button></div><div data-r="alerts" class="small" style="margin-top:8px"></div></div>' : "") +
        "</div>" +
      "</div></div>";
    var el = App.openModal(html, { label: id + " trade window", update: function (resized) { update(st, resized); } });
    st.el = el;
    bind(st);
    update(st, true);
    var q = el.querySelector('[data-r="qty"]');
    if (q && !opts.noFocus) setTimeout(function () { q.focus(); }, 30);
  };

  function noTicketHtml(a) {
    var W = App.W, M = W.M;
    var links = [];
    if (a.type === "index") {
      M.lists.future.forEach(function (fid) { if (M.assets[fid].und === a.id) links.push('<button type="button" data-trade="' + fid + '">' + fid + " futures</button>"); });
      M.lists.etf.forEach(function (eid) { var e = M.assets[eid]; if (e.track === a.id) links.push('<button type="button" data-trade="' + eid + '">' + eid + " (" + esc(e.name) + ")</button>"); });
      if (Options.optionable(a)) links.push('<button type="button" data-go="options" data-und="' + a.id + '">' + a.id + " options</button>");
    }
    if (a.type === "commodity") {
      M.lists.future.forEach(function (fid) { if (M.assets[fid].und === a.id) links.push('<button type="button" data-trade="' + fid + '">' + fid + " futures</button>"); });
      M.lists.etf.forEach(function (eid) { var e = M.assets[eid]; if (e.track === a.id) links.push('<button type="button" data-trade="' + eid + '">' + eid + " (" + esc(e.name) + ")</button>"); });
    }
    return "<h3>How to trade it</h3><p class=\"small secondary\">" + esc(a.name) + " is a reference price and can't be bought directly. Use one of these instead:</p><div class=\"stack\" style=\"gap:6px\">" + (links.join("") || '<span class="muted small">No linked instruments.</span>') + "</div>";
  }

  function ticketHtml(a, st) {
    var buyL = a.type === "perp" ? "Long" : "Buy", sellL = a.type === "perp" ? "Short" : "Sell";
    var qtyLabel = a.type === "bond" ? "Face value ($)" : a.type === "future" ? "Contracts" : a.type === "fx" ? "Lots (100,000 " + a.base + ")" : a.type === "perp" ? "Size (" + a.und + ")" : a.type === "crypto" ? "Amount" : "Quantity";
    var modes = (a.type === "stock" || a.type === "etf" || a.type === "crypto" || a.type === "perp") ?
      '<div class="seg" data-r="qtymodes"><button type="button" data-qm="units" aria-pressed="true">' + (a.type === "crypto" || a.type === "perp" ? "Coins" : "Shares") + '</button><button type="button" data-qm="usd" aria-pressed="false">Dollars</button></div>' : "";
    var types = [["market", "Market"], ["limit", "Limit"], ["stop", "Stop"], ["stop_limit", "Stop limit"], ["trail", "Trailing stop"]];
    if (a.type === "bond") types = types.slice(0, 2);
    var step = a.type === "bond" ? 1000 : a.type === "fx" ? 0.01 : a.type === "future" ? 1 : "any";
    var def = a.type === "bond" ? 10000 : a.type === "future" ? 1 : a.type === "fx" ? 0.1 : a.type === "perp" ? "" : "";
    return '<div class="ticket">' +
      '<div class="row between"><h3 style="margin:0">Order ticket</h3><span class="small muted" data-r="hours"></span></div>' +
      '<div class="sides"><button type="button" class="b" data-side="buy" aria-pressed="' + (st.side === "buy") + '">' + buyL + '</button><button type="button" class="s" data-side="sell" aria-pressed="' + (st.side === "sell") + '">' + sellL + "</button></div>" +
      '<div data-r="holding" class="small secondary"></div>' +
      '<label class="field"><span>' + qtyLabel + " " + modes + '</span><input data-r="qty" class="num" type="number" min="0" step="' + step + '" value="' + def + '" inputmode="decimal"></label>' +
      '<div class="quick" data-r="quick"></div>' +
      (a.type === "perp" ? '<label class="field"><span>Leverage <output data-r="levout">' + st.lev + '×</output></span><input data-r="lev" type="range" min="1" max="' + a.maxLev + '" step="1" value="' + st.lev + '"></label>' : "") +
      '<div class="two"><label class="field"><span>Order type</span><select data-r="otype">' + types.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + "</option>"; }).join("") + '</select></label>' +
      '<label class="field"><span>Time in force</span><select data-r="tif"><option value="day">Day</option><option value="gtc">Good till canceled</option></select></label></div>' +
      '<div class="two" data-r="prices">' +
        '<label class="field" data-r="f-limit" hidden><span>Limit price</span><input data-r="limit" class="num" type="number" step="any"></label>' +
        '<label class="field" data-r="f-stop" hidden><span>Stop price</span><input data-r="stop" class="num" type="number" step="any"></label>' +
        '<label class="field" data-r="f-trail" hidden><span>Trail by</span><div class="row" style="flex-wrap:nowrap"><input data-r="trail" class="num" type="number" step="any" style="width:100%"><select data-r="trailu"><option value="pct">%</option><option value="abs">$</option></select></div></label>' +
      "</div>" +
      '<div class="est" data-r="est"></div>' +
      '<button type="button" class="submit buy" data-r="submit">Review</button>' +
      '<div class="msg" data-r="msg" role="alert"></div>' +
    "</div>";
  }

  function r(st, name) { return st.el.querySelector('[data-r="' + name + '"]'); }

  function bind(st) {
    var el = st.el;
    el.querySelector(".modal-close").addEventListener("click", App.closeModal);
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.range) { st.range = b.dataset.range; U.pref("range", st.range); U.$$("[data-range]", el).forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); drawChart(st); }
      else if (b.dataset.mode) { st.mode = b.dataset.mode; U.pref("chartMode", st.mode); U.$$("[data-mode]", el).forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); drawChart(st); }
      else if (b.dataset.side) { st.side = b.dataset.side; U.$$("[data-side]", el).forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); ticketUpdate(st); }
      else if (b.dataset.qm) { st.qtyMode = b.dataset.qm; U.$$("[data-qm]", el).forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); ticketUpdate(st); }
      else if (b.dataset.quick != null) { r(st, "qty").value = b.dataset.quick; ticketUpdate(st); }
      else if (b.dataset.r === "submit") submit(st);
      else if (b.dataset.act === "close-pos") { var res = Broker.closePosition(App.W, App.W.A, b.dataset.key); if (!res.ok) App.toast(res.error, "reject"); flush(); }
      else if (b.dataset.act === "alert") addAlert(st);
      else if (b.dataset.act === "rm-alert") { App.W.A.alerts.splice(+b.dataset.i, 1); update(st); }
    });
    ["qty", "limit", "stop", "trail"].forEach(function (k) { var i = r(st, k); if (i) i.addEventListener("input", function () { st.confirm = false; ticketUpdate(st); }); });
    ["otype", "tif", "trailu"].forEach(function (k) { var i = r(st, k); if (i) i.addEventListener("change", function () { st.confirm = false; ticketUpdate(st, true); }); });
    var lev = r(st, "lev");
    if (lev) lev.addEventListener("input", function () { st.lev = +lev.value; r(st, "levout").textContent = st.lev + "×"; ticketUpdate(st); });
  }

  function flush() {
    var A = App.W.A;
    while (A.events.length) { var ev = A.events.shift(); App.toast(ev.text, ev.type); }
    App.refresh(false);
  }

  function addAlert(st) {
    var px = +r(st, "al-px").value;
    if (!(px > 0)) { App.toast("Enter an alert price above zero.", "reject"); return; }
    App.W.A.alerts.push({ sym: st.id, op: r(st, "al-op").value, price: px, active: true });
    r(st, "al-px").value = "";
    update(st);
    App.toast("Alert set. The clock pauses when it triggers.", "info");
  }

  /* ---------------- Updating ---------------- */
  function update(st, force) {
    var W = App.W, a = W.M.assets[st.id];
    if (!a) { App.closeModal(); return; }
    var q = Market.quote(W.M, st.id);
    var ch = U.change(a);
    var star = r(st, "star");
    if (star) star.textContent = App.isWatched(st.id) ? "★ Watching" : "☆ Watch";
    r(st, "quote").innerHTML = '<span class="px">' + U.assetPx(a) + "</span>" +
      '<span class="mono ' + U.cls(ch) + '">' + (a.px - a.prev >= 0 ? "+" : "−") + U.assetPx(a, Math.abs(a.px - a.prev)) + " (" + U.pct(ch) + ")</span>" +
      (a.type === "bond" ? '<span class="mono small">YTM ' + U.pctU(a.yld, 3) + "</span>" : "") +
      (Market.tradable(a) && q ? '<span class="small muted mono">Bid ' + U.assetPx(a, q.bid) + " · Ask " + U.assetPx(a, q.ask) + "</span>" : "");
    r(st, "sub").textContent = subline(a);
    var now = Date.now();
    if (force || now - st.lastDraw > 400) { st.lastDraw = now; drawChart(st); }
    r(st, "stats").innerHTML = stats(W, a).map(function (kv) { return "<div><span>" + esc(kv[0]) + "</span><b title=\"" + esc(kv[1]) + "\">" + kv[1] + "</b></div>"; }).join("");
    r(st, "about").textContent = about(W, a);
    r(st, "links").innerHTML = links(W, a);
    var news = W.M.news.filter(function (n) { return n.syms && n.syms.indexOf(st.id) >= 0 || (a.type === "etf" && a.track && n.syms && n.syms.indexOf(a.track) >= 0); }).slice(0, 8);
    r(st, "news").innerHTML = news.length ? news.map(newsLi).join("") : '<li><span></span><span class="muted small">No recent headlines.</span></li>';
    r(st, "position-card").innerHTML = positionHtml(W, a);
    var al = r(st, "alerts");
    if (al) {
      var list = W.A.alerts.map(function (x, i) { return { x: x, i: i }; }).filter(function (o) { return o.x.sym === st.id; });
      al.innerHTML = list.length ? list.map(function (o) { return '<div class="row between"><span>' + (o.x.op === ">=" ? "≥ " : "≤ ") + U.assetPx(a, o.x.price) + (o.x.active ? "" : ' <span class="chip">Triggered</span>') + '</span><button type="button" class="ghost sm" data-act="rm-alert" data-i="' + o.i + '">Remove</button></div>'; }).join("") : '<span class="muted">No alerts on ' + esc(st.id) + ".</span>";
    }
    if (Market.tradable(a)) ticketUpdate(st);
  }

  function subline(a) {
    if (a.type === "stock") return Market.SEC_BY_ID[a.sector].name + " · " + a.industry;
    if (a.type === "etf") return a.kind === "lev" ? (a.lev > 0 ? a.lev + "× daily" : "−" + Math.abs(a.lev) + "× daily inverse") : a.kind === "bond" ? "Bond fund" : a.kind === "commodity" ? "Commodity fund" : a.kind === "crypto" ? "Crypto trust" : a.kind === "vol" ? "Volatility note" : "Index fund";
    if (a.type === "bond") return (a.cls === "ust" ? "US Treasury" : a.cls === "muni" ? "Municipal · tax-exempt" : "Corporate") + " · " + a.rating;
    if (a.type === "future") return a.group + " · expires " + Cal.nice(a.exp);
    if (a.type === "perp") return "Perpetual swap on " + a.und + " · up to " + a.maxLev + "× leverage";
    if (a.type === "fx") return "Spot foreign exchange · " + (a.major ? "major pair, 50:1" : "minor pair, 20:1");
    if (a.type === "crypto") return a.stable ? "Stablecoin" : "Cryptocurrency · trades around the clock";
    if (a.type === "commodity") return a.unit;
    return "Index";
  }

  function newsLi(n) {
    return '<li><span class="when">' + esc(U.when(n.day, n.tick)) + '</span><span><span class="k ' + n.kind + '">' + esc(n.kind) + "</span> " + esc(n.title) + "</span></li>";
  }

  /* ---------------- Chart ---------------- */
  function drawChart(st) {
    var W = App.W, M = W.M, a = M.assets[st.id];
    var canvas = r(st, "chart");
    if (!canvas || !canvas.clientWidth) return;
    var fmt = function (x) { return U.assetPx(a, x); };
    var range = st.range, legend = r(st, "legend");
    legend.innerHTML = "";
    if (range === "1D" || range === "5D") {
      var pts = [], labels = [];
      var days = range === "1D" ? [] : a.intraHist.slice(-4);
      days.forEach(function (d) { d.p.forEach(function (p, i) { pts.push(p); labels.push(Cal.WEEKDAYS[Cal.weekday(d.d)] + " " + Cal.tickTime(i)); }); });
      var today = W.phase === "closed" && a.intraHist.length && a.intraHist[a.intraHist.length - 1].d === W.day ? [] : a.intra;
      if (range === "1D" && W.phase === "closed" && a.intraHist.length) { var last = a.intraHist[a.intraHist.length - 1]; today = last.p; }
      today.forEach(function (p, i) { pts.push(p); labels.push((range === "5D" ? Cal.WEEKDAYS[Cal.weekday(W.day)] + " " : "") + Cal.tickTime(i)); });
      var base = range === "1D" ? a.prev : (pts.length ? pts[0] : null);
      C.price(canvas, { mode: "line", c: pts, base: base, fmt: fmt, height: 300, label: function (i) { return labels[i] || ""; } });
      return;
    }
    var n = RANGES.filter(function (x) { return x[0] === range; })[0][1];
    var b = a.bars, days = M.days;
    // While the session runs, add today's bar in progress.
    if (W.phase === "open") {
      b = { o: b.o.concat([a.open]), h: b.h.concat([Math.max(a.hi, a.px)]), l: b.l.concat([Math.min(a.lo, a.px)]), c: b.c.concat([a.px]), v: b.v.concat([a.vol]) };
      days = days.concat([W.day]);
    }
    var len = b.c.length, k = Math.min(n, len);
    var off = days.length - len;
    var sl = function (arr) { return arr.slice(len - k); };
    var smaList = k >= 120 ? [50, 200] : k >= 40 ? [20, 50] : null;
    if (smaList) legend.innerHTML = '<span><i style="background:var(--series-2)"></i>' + smaList[0] + "-day</span><span><i style=\"background:var(--series-3)\"></i>" + smaList[1] + "-day</span>";
    // Moving averages need earlier data, so compute on the longer series and trim.
    C.price(canvas, {
      mode: st.mode, o: sl(b.o), h: sl(b.h), l: sl(b.l), c: sl(b.c), v: a.type === "bond" || a.type === "index" || a.type === "fx" || a.type === "commodity" ? null : sl(b.v),
      fmt: fmt, height: 300, sma: smaList,
      label: function (i, full) { var d = days[off + len - k + i]; return d == null ? "" : full ? Cal.nice(d) + (d === W.day && W.phase === "open" ? " (today)" : "") : Cal.short(d); }
    });
  }

  /* ---------------- Stats ---------------- */
  function rv(a, n) { var v = Market.realizedVol(a, n); return v == null ? "—" : U.pctU(v, 1); }
  function ivOf(W, a) {
    if (!Options.optionable(a)) return null;
    var ex = Options.expiries(W.day).filter(function (e) { return e.day - W.day >= 20; })[0];
    return ex ? Options.atmVol(W, a, Options.tte(W, ex.day), ex.day) : null;
  }

  function stats(W, a) {
    var M = W.M, out = [];
    var range52 = a.lo52 != null ? U.assetPx(a, a.lo52) + " – " + U.assetPx(a, a.hi52) : "—";
    if (a.type === "stock") {
      var capv = a.px * a.shares;
      out.push(["Open", U.assetPx(a, a.open)], ["Day range", U.assetPx(a, a.lo) + " – " + U.assetPx(a, a.hi)], ["Prev close", U.assetPx(a, a.prev)],
        ["52-wk range", range52], ["Volume", U.compact(a.vol)], ["Avg volume", U.compact(a.adv)],
        ["Market cap", U.compact(capv, "$")], ["P/E (ttm)", a.eps > 0 ? (a.px / a.eps).toFixed(1) : "n/m"], ["EPS (ttm)", U.money(a.eps)],
        ["Dividend", a.dps > 0 ? U.money(a.dps) + " (" + U.pctU(a.dps / a.px, 2) + ")" : "None"], ["Ex-dividend", a.nextEx ? Cal.short(a.nextEx) : "—"],
        ["Next earnings", a.nextEarn ? Cal.short(a.nextEarn) + (a.earnAmc ? " after close" : " before open") : "—"],
        ["Beta", a.beta.toFixed(2)], ["Implied vol (30d)", U.pctU(ivOf(W, a), 1)], ["Realized vol (1M)", rv(a, 21)],
        ["Short interest", U.pctU(a.shortInt, 1) + " of float"], ["Borrow fee", U.pctU(a.borrow, a.borrow < 0.01 ? 2 : 1) + "/yr" + (a.borrow > 0.05 ? " · hard to borrow" : "")],
        ["Headquarters", esc(a.hq)], ["Employees", a.employees.toLocaleString("en-US")], ["Founded", String(a.founded)],
        ["Index member", ["US500", "TECH100", "IND30", "SMALL200", "DIV50"].filter(function (ix) { return M.assets[ix].members.indexOf(a.id) >= 0; }).join(", ") || "—"]);
      if (a.lastEarn) out.push(["Last earnings", "EPS " + U.money(a.lastEarn.actual) + " vs " + U.money(a.lastEarn.est) + " (" + (a.lastEarn.actual >= a.lastEarn.est ? "beat" : "miss") + ")"]);
    } else if (a.type === "etf") {
      out.push(["Open", U.assetPx(a, a.open)], ["Day range", U.assetPx(a, a.lo) + " – " + U.assetPx(a, a.hi)], ["Prev close", U.assetPx(a, a.prev)], ["52-wk range", range52],
        ["NAV", U.assetPx(a, a.px)], ["Expense ratio", U.pctU(a.er, 2)], ["Implied vol (30d)", U.pctU(ivOf(W, a), 1)], ["Realized vol (1M)", rv(a, 21)]);
      if (a.kind === "index" || a.kind === "lev") { var t = a.track.indexOf("ETF:") === 0 ? M.assets[a.track.slice(4)] : M.assets[a.track]; out.push(["Tracks", esc(t.name)]); }
      if (a.kind === "lev") out.push(["Daily leverage", (a.lev > 0 ? "" : "−") + Math.abs(a.lev) + "×"]);
      if (a.kind === "bond") out.push(["Yield", U.pctU(a.yld, 2)], ["Duration", (a.tenor < 1 ? a.tenor : a.tenor * 0.92).toFixed(1) + " yrs"], ["Distributions", "Monthly"]);
      if (a.kind === "index") out.push(["Distributions", "Quarterly"], ["Accrued income", U.money(a.acc, 4) + "/sh"]);
      if (a.kind === "commodity") out.push(["Holds", a.spot ? "Physical metal" : "Front-month futures, rolled monthly"]);
    } else if (a.type === "crypto") {
      out.push(["Market cap", U.compact(a.px * a.supply, "$")], ["Circulating supply", U.compact(a.supply) + " " + a.id], ["Day range", U.assetPx(a, a.lo) + " – " + U.assetPx(a, a.hi)],
        ["Prev close (4 pm)", U.assetPx(a, a.prev)], ["52-wk range", range52], ["Realized vol (1M)", rv(a, 21)], ["Staking yield", a.stake ? U.pctU(a.stake, 1) + " APY" : "None"]);
      var perp = M.assets[a.id + "-PERP"];
      if (perp) out.push(["Perp funding (8h)", U.pctU(perp.funding, 4)]);
    } else if (a.type === "bond") {
      var years = (a.mat - W.day) / 365.25;
      var ust = Econ.yieldAt(W.E, Math.max(years, 1 / 365), W.day) / 100;
      var br = a.freq ? P.couponBracket(a.mat, a.freq, W.day) : null;
      out.push(["Issuer", esc(a.issuer === "US Treasury" ? a.issuer : a.cls === "corp" ? M.assets[a.issuer].name : a.issuer)], ["Rating", a.rating], ["Coupon", a.freq ? U.pctU(a.coupon, 3) + " semiannual" : "Zero (discount bill)"],
        ["Maturity", Cal.nice(a.mat)], ["Years to maturity", years.toFixed(2)], ["Clean price", a.px.toFixed(3)], ["Accrued", a.acc.toFixed(3)], ["Dirty price", (a.px + a.acc).toFixed(3)],
        ["Yield to maturity", U.pctU(a.yld, 3)], ["Spread vs Treasury", a.cls === "ust" ? "—" : Math.round((a.yld - ust) * 1e4) + " bp"], ["Modified duration", a.dur.toFixed(2)], ["Convexity", a.cvx.toFixed(1)],
        ["DV01 per $10k", U.money(a.dur * (a.px + a.acc) / 100 * 10000 * 0.0001)], ["Next coupon", br ? Cal.nice(br.next) : "At maturity"], ["Issued", Cal.nice(a.issued)]);
      if (a.cls === "muni") out.push(["Tax-equivalent yield", U.pctU(a.yld / (1 - 0.37), 2) + " at 37%"]);
    } else if (a.type === "future") {
      var spot = a.und === "UST10" || a.und === "UST30" ? null : M.assets[a.und];
      var rates = Broker.ctrRates(W, a, {});
      out.push(["Underlying", spot ? esc(spot.name) : a.und === "UST10" ? "10-yr Treasury (6% notional)" : "30-yr Treasury (6% notional)"], ["Spot", spot ? U.assetPx(spot) : "—"],
        ["Basis", spot ? U.assetPx(a, a.px - spot.px) : "—"], ["Expires", Cal.nice(a.exp) + " (" + Cal.tradingDaysBetween(W.day, a.exp) + " trading days)"],
        ["Multiplier", "$" + a.mult.toLocaleString("en-US") + " × price"], ["Tick", a.tick + " = " + U.money(a.tick * a.mult)], ["Notional / contract", U.money0(a.px * a.mult)],
        ["Initial margin", U.money0(a.px * a.mult * rates[0]) + " (" + U.pctU(rates[0], 1) + ")"], ["Maintenance", U.money0(a.px * a.mult * rates[1])], ["Last settlement", U.assetPx(a, a.settle || a.prev)], ["Settlement", "Cash"]);
    } else if (a.type === "perp") {
      var u = M.assets[a.und];
      out.push(["Mark", U.assetPx(a)], ["Index (spot)", U.assetPx(u)], ["Funding (8h)", U.pctU(a.funding, 4)], ["Funding (annualized)", U.pctU(a.funding * 3 * 365, 1)], ["Max leverage", a.maxLev + "×"], ["Contract", "1 " + a.und + ", no expiry"], ["Maintenance", "Half of initial margin"]);
    } else if (a.type === "fx") {
      var us = Econ.effective(W.E) / 100;
      var rb = a.base === "USD" ? us : W.M.fxRates[a.base], rq = a.quote === "USD" ? us : W.M.fxRates[a.quote];
      var lotUsd = Broker.LOT * (a.base === "USD" ? 1 : a.px);
      var pipUsd = a.quote === "USD" ? Broker.LOT * a.pip : Broker.LOT * a.pip / a.px;
      out.push(["Spread", a.sprPips + " pips"], ["Pip value / lot", U.money(pipUsd)], ["Notional / lot", U.money0(lotUsd)], ["Margin", (a.major ? "2% (50:1)" : "5% (20:1)")],
        [a.base + " rate", U.pctU(rb, 2)], [a.quote + " rate", U.pctU(rq, 2)],
        ["Swap long / lot / day", U.money(lotUsd * (rb - rq - 0.005) / 365)], ["Swap short / lot / day", U.money(lotUsd * (rq - rb - 0.005) / 365)], ["52-wk range", range52]);
    } else if (a.type === "index") {
      out.push(["Level", U.assetPx(a)], ["Day range", U.assetPx(a, a.lo) + " – " + U.assetPx(a, a.hi)], ["52-wk range", range52]);
      if (a.members && a.members.length) out.push(["Members", String(a.members.length)], ["Weighting", a.weight === "cap" ? "Market cap" : a.weight === "price" ? "Share price" : "Equal"], ["Dividend yield", U.pctU(a.q, 2)]);
      if (a.id === "US500") out.push(["P/E", W.M.pe.mkt.toFixed(1)], ["Fair P/E at current rates", W.M.pe.fair.toFixed(1)]);
      out.push(["Realized vol (1M)", rv(a, 21)]);
    } else if (a.type === "commodity") {
      out.push(["Price", U.assetPx(a) + " " + a.unit], ["Day range", U.assetPx(a, a.lo) + " – " + U.assetPx(a, a.hi)], ["52-wk range", range52], ["Futures curve", a.kappa === 0 ? "Carry = financing" : (a.carry >= 0 ? "Contango " : "Backwardation ") + U.pctU(Math.abs(a.carry), 1) + "/yr"], ["Realized vol (1M)", rv(a, 21)]);
    }
    return out;
  }

  function about(W, a) {
    if (a.type === "stock") return a.desc;
    if (a.desc) return a.desc;
    if (a.type === "etf" && a.kind === "index") return "Tracks the " + (W.M.assets[a.track] ? W.M.assets[a.track].name : a.track) + " and passes its dividends through quarterly.";
    if (a.type === "etf" && a.kind === "lev") return "Seeks " + a.lev + "× the daily return of its benchmark. Because it rebalances every day, returns over weeks or months can differ a lot from " + a.lev + "× the benchmark, especially when markets are volatile.";
    if (a.type === "etf" && a.kind === "bond") return "Holds a portfolio of bonds with an average maturity near " + a.tenor + " years. Pays monthly income; price moves opposite to yields.";
    if (a.type === "future") return "A standardized contract to buy or sell the underlying at a set price on the expiry date. Futures are marked to market every day: gains and losses settle into cash at each close. In this simulator every contract settles in cash at expiry.";
    if (a.type === "perp") return "A futures contract with no expiry. The price stays near spot because longs and shorts pay each other a funding rate every 8 hours. Leverage magnifies gains and losses; positions are liquidated if equity falls too far.";
    if (a.type === "fx") return "Trade one currency against another. Positions carry an overnight swap based on the difference in interest rates between the two currencies.";
    if (a.type === "bond") return a.cls === "ust" ? "Backed by the US government. Prices move inversely to yields: the longer the maturity, the bigger the move." : a.cls === "muni" ? "Interest is exempt from federal income tax, so the yield compares to a higher taxable yield." : "Corporate debt. The yield is the Treasury yield plus a credit spread that widens when the economy weakens or the issuer's stock falls.";
    if (a.type === "commodity") return "Spot reference price. Trade it through futures or a commodity fund.";
    return "";
  }

  function links(W, a) {
    var out = [];
    if (Options.optionable(a)) out.push('<button type="button" class="sm" data-go="options" data-und="' + a.id + '">Options chain</button>');
    if (a.type === "crypto" && W.M.assets[a.id + "-PERP"]) out.push('<button type="button" class="sm" data-trade="' + a.id + '-PERP">' + a.id + " perpetual</button>");
    if (a.type === "perp") out.push('<button type="button" class="sm" data-trade="' + a.und + '">' + a.und + " spot</button>");
    if (a.type === "etf" && a.track && W.M.assets[a.track] && !W.M.assets[a.track].hidden) out.push('<button type="button" class="sm" data-trade="' + a.track + '">' + a.track + "</button>");
    if (a.type === "future" && W.M.assets[a.und]) out.push('<button type="button" class="sm" data-trade="' + a.und + '">' + a.und + "</button>");
    if (a.type === "bond" && a.cls === "corp") out.push('<button type="button" class="sm" data-trade="' + a.issuer + '">' + a.issuer + " stock</button>");
    if (a.type === "stock") W.M.lists.bond.forEach(function (id) { var b = W.M.assets[id]; if (b.issuer === a.id) out.push('<button type="button" class="sm" data-trade="' + esc(id) + '">' + esc(b.name) + " bond</button>"); });
    return out.join("");
  }

  function positionHtml(W, a) {
    var A = W.A, M = W.M;
    var p = A.pos[a.id];
    var opts = Object.keys(A.pos).filter(function (k) { return A.pos[k].kind === "opt" && A.pos[k].c.und === a.id; });
    if (!p && !opts.length) return '<h3>Your position</h3><p class="small muted" style="margin:0">You don\'t hold ' + esc(a.type === "bond" ? a.name : a.id) + ".</p>";
    var s = Broker.summary(W, A);
    var h = "<h3>Your position</h3>";
    if (p) {
      var val = Broker.value(W, p), pnl = Broker.openPnl(W, p);
      var cost = a.type === "bond" ? p.qty / 100 * p.avg : a.type === "future" ? p.qty * a.mult * p.avg : a.type === "fx" ? p.qty * Broker.LOT * (a.base === "USD" ? 1 : p.avg) : p.qty * p.avg;
      var req = s.per[p.key] || {};
      h += '<div class="stats-grid">' +
        "<div><span>Quantity</span><b>" + (a.type === "bond" ? "$" + p.qty.toLocaleString("en-US") : U.qty(p.qty)) + " " + (p.qty < 0 ? "(short)" : "") + "</b></div>" +
        "<div><span>Average cost</span><b>" + U.assetPx(a, p.avg) + "</b></div>" +
        "<div><span>" + (p.kind === "ctr" ? "Notional" : "Market value") + "</span><b>" + (p.kind === "ctr" ? U.money0(Broker.notional(W, p)) : U.money(val)) + "</b></div>" +
        '<div><span>Open P&amp;L</span><b class="' + U.cls(pnl) + '">' + U.signedMoney(pnl) + (cost ? " (" + U.pct(pnl / Math.abs(cost)) + ")" : "") + "</b></div>" +
        "<div><span>Realized P&amp;L</span><b class=\"" + U.cls(p.realized) + "\">" + U.signedMoney(p.realized) + "</b></div>" +
        "<div><span>Maintenance margin</span><b>" + U.money(req.maint || 0) + "</b></div>" +
        (p.lev ? "<div><span>Leverage</span><b>" + p.lev + "×</b></div>" : "") +
        "</div>" +
        '<div class="row" style="margin-top:10px"><button type="button" class="sm" data-act="close-pos" data-key="' + esc(p.key) + '">Close position</button></div>';
    }
    if (opts.length) {
      h += '<h4 style="margin-top:12px">Options on ' + esc(a.id) + '</h4><div class="table-wrap"><table><tbody>' + opts.map(function (k) {
        var o = A.pos[k], pl = Broker.openPnl(W, o);
        return "<tr><td>" + esc(Options.label(o.c)) + '</td><td class="num">' + o.qty + '</td><td class="num ' + U.cls(pl) + '">' + U.signedMoney(pl) + '</td><td class="num"><button type="button" class="sm" data-act="close-pos" data-key="' + esc(k) + '">Close</button></td></tr>';
      }).join("") + "</tbody></table></div>";
    }
    return h;
  }

  /* ---------------- Ticket ---------------- */
  function unitsFromInput(st, a, px) {
    var v = +r(st, "qty").value;
    if (!(v > 0)) return 0;
    if (st.qtyMode === "usd" && px > 0) {
      var u = v / px;
      if (a.type === "stock" || a.type === "etf") u = Math.floor(u * 10000) / 10000;
      else u = Math.floor(u * 1e8) / 1e8;
      return u;
    }
    return v;
  }

  function spec(st) {
    var W = App.W, a = W.M.assets[st.id];
    var q = Market.quote(W.M, st.id);
    var px = st.side === "buy" ? q.ask : q.bid;
    var o = { sym: st.id, side: st.side, qty: unitsFromInput(st, a, px), type: r(st, "otype").value, tif: r(st, "tif").value, lev: st.lev };
    var lim = r(st, "limit"), stp = r(st, "stop"), tr = r(st, "trail");
    if (o.type === "limit" || o.type === "stop_limit") o.limit = lim.value;
    if (o.type === "stop" || o.type === "stop_limit") o.stop = stp.value;
    if (o.type === "trail") { if (r(st, "trailu").value === "pct") o.trailPct = tr.value; else o.trail = tr.value; }
    return o;
  }

  function ticketUpdate(st, typeChanged) {
    var W = App.W, A = W.A, a = W.M.assets[st.id];
    var el = st.el;
    var t = r(st, "otype").value;
    r(st, "f-limit").hidden = !(t === "limit" || t === "stop_limit");
    r(st, "f-stop").hidden = !(t === "stop" || t === "stop_limit");
    r(st, "f-trail").hidden = t !== "trail";
    var q = Market.quote(W.M, st.id);
    if (typeChanged) {
      var dflt = st.side === "buy" ? q.ask : q.bid;
      var lim = r(st, "limit"), stp = r(st, "stop"), tr = r(st, "trail");
      var dp = a.type === "fx" ? 5 : a.type === "bond" ? 3 : a.px < 1 ? 6 : 2;
      if (!lim.value) lim.value = dflt.toFixed(dp);
      if (!stp.value) stp.value = (st.side === "buy" ? a.px * 1.02 : a.px * 0.98).toFixed(dp);
      if (!tr.value) tr.value = "5";
    }
    var inst = Broker.instrument(W, { sym: st.id });
    var openNow = Broker.canTradeNow(W, inst);
    r(st, "hours").textContent = openNow ? (a.type === "stock" || a.type === "etf" || a.type === "bond" ? "Market open" : "Trades 24 hours") : "Market closed · fills at the open";
    var p = A.pos[st.id];
    var holding = p ? p.qty : 0;
    var hold = r(st, "holding");
    var unit = unitsLabel(a, Math.abs(holding));
    hold.innerHTML = holding ? "You hold " + (a.type === "bond" ? "$" + holding.toLocaleString("en-US") + " face" : U.qty(holding) + " " + unit) + (holding < 0 ? " short" : "") + "." +
      (st.side === "sell" && holding > 0 && (a.type === "stock" || a.type === "etf") ? " Selling more opens a short position." : "") : (st.side === "sell" && (a.type === "stock" || a.type === "etf") ? "You don't hold this. Selling opens a short position (margin account)." : "");
    // Quick sizes.
    var quick = [];
    if (a.type === "bond") quick = [1000, 5000, 10000, 25000, 100000];
    else if (a.type === "future") quick = [1, 2, 5, 10];
    else if (a.type === "fx") quick = [0.01, 0.1, 0.5, 1, 2];
    else if (st.qtyMode === "usd") quick = [100, 1000, 5000, 10000, 50000];
    else if (a.type === "stock" || a.type === "etf") quick = [1, 10, 50, 100, 500];
    else quick = a.px > 1000 ? [0.01, 0.1, 0.5, 1] : a.px > 1 ? [1, 10, 100, 1000] : [1000, 10000, 100000, 1000000];
    var quickHtml = quick.map(function (x) { return '<button type="button" data-quick="' + x + '">' + (st.qtyMode === "usd" ? "$" + x.toLocaleString("en-US") : a.type === "bond" ? "$" + (x / 1000) + "k" : x.toLocaleString("en-US")) + "</button>"; }).join("");
    if (holding && st.side === (holding > 0 ? "sell" : "buy")) quickHtml += '<button type="button" data-quick="' + Math.abs(holding) + '">All (' + (a.type === "bond" ? "$" + Math.abs(holding).toLocaleString("en-US") : U.qty(Math.abs(holding))) + ")</button>";
    var qk = r(st, "quick");
    if (qk.dataset.sig !== quickHtml) { qk.innerHTML = quickHtml; qk.dataset.sig = quickHtml; }

    var s = spec(st);
    var btn = r(st, "submit");
    var buyL = a.type === "perp" ? "long" : "buy", sellL = a.type === "perp" ? "short" : "sell";
    btn.className = "submit " + (st.side === "buy" ? "buy" : "sell");
    var est = r(st, "est");
    if (!(s.qty > 0)) {
      est.innerHTML = '<span class="small muted">Enter a size to see the cost and margin impact.</span>';
      btn.textContent = "Review " + (st.side === "buy" ? buyL : sellL);
      btn.disabled = true;
      return;
    }
    btn.disabled = false;
    var pv = Broker.preview(W, A, s);
    if (pv.error && !pv.before) { est.innerHTML = '<span class="small down">' + esc(pv.error) + "</span>"; btn.textContent = "Can't place this order"; btn.disabled = true; return; }
    var rows = [];
    var sizeTxt = a.type === "bond" ? "$" + s.qty.toLocaleString("en-US") + " face" : U.qty(s.qty) + " " + unitsLabel(a, s.qty);
    rows.push(["Size", sizeTxt]);
    rows.push([t === "market" ? "Est. price" : "Price", U.assetPx(a, pv.px)]);
    var notional = a.type === "bond" ? s.qty / 100 * pv.px : a.type === "future" ? s.qty * a.mult * pv.px : a.type === "fx" ? s.qty * Broker.LOT * (a.base === "USD" ? 1 : pv.px) : s.qty * pv.px;
    if (a.type === "bond") rows.push(["Principal", U.money(notional)], ["Accrued interest", U.money(s.qty / 100 * a.acc)]);
    else if (a.type === "future" || a.type === "fx" || a.type === "perp") rows.push(["Notional", U.money0(notional)]);
    else rows.push([st.side === "buy" ? "Est. cost" : "Est. proceeds", U.money(notional)]);
    rows.push(["Fees", U.money(pv.fee)]);
    var dInit = pv.after.init - pv.before.init;
    if (A.type !== "cash") rows.push(["Initial margin", (dInit >= 0 ? "+" : "−") + U.money(Math.abs(dInit)).replace("−", "")]);
    rows.push(["Buying power after", U.money0(pv.after.buyingPower)]);
    if (a.type === "perp") {
      var lev = st.lev || 1;
      var entry = pv.px, dir = st.side === "buy" ? 1 : -1;
      var liq = entry * (1 - dir * (1 / lev - 0.5 / lev));
      rows.push(["Position margin", U.money(notional / lev)], ["Isolated liq. price", U.assetPx(a, liq) + " (≈)"]);
    }
    if (a.type === "stock" && st.side === "sell" && holding - s.qty < 0) rows.push(["Borrow fee", U.pctU(a.borrow, 2) + "/yr"]);
    est.innerHTML = '<dl class="list-kv">' + rows.map(function (x) { return "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>"; }).join("") + "</dl>" + (pv.error ? '<div class="small down" style="margin-top:6px">' + esc(pv.error) + "</div>" : "");
    var verb = st.side === "buy" ? (holding < 0 ? "Buy to cover" : a.type === "perp" ? "Open long" : "Buy") : (holding > 0 ? "Sell" : a.type === "perp" ? "Open short" : a.type === "stock" || a.type === "etf" ? "Sell short" : "Sell");
    btn.textContent = st.confirm ? "Confirm: " + verb + " " + sizeTxt : verb + " " + sizeTxt;
  }

  function submit(st) {
    var W = App.W, A = W.A;
    var s = spec(st);
    var msg = r(st, "msg");
    if (!st.confirm) { st.confirm = true; ticketUpdate(st); msg.className = "msg"; msg.textContent = "Check the details and press again to send."; return; }
    st.confirm = false;
    var res = Broker.place(W, A, s);
    // Drop the fill toast here; the message below says it.
    A.events = A.events.filter(function (ev) { return ev.order !== res.order; });
    if (!res.ok) { msg.className = "msg err"; msg.textContent = res.error; ticketUpdate(st); return; }
    var o = res.order;
    msg.className = "msg ok";
    msg.textContent = o.status === "filled" ? "Filled at " + U.assetPx(W.M.assets[st.id], o.fillPx) + "." : "Order #" + o.id + " is working (" + o.type.replace("_", " ") + ", " + (o.tif === "gtc" ? "GTC" : "day") + ").";
    App.refresh(false);
  }
})(typeof self !== "undefined" ? self : this);
