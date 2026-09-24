(function (root) {
  "use strict";
  var BSX = root.BSX, U = BSX.UI.util, C = BSX.UI.charts, App = BSX.UI.App;
  var Cal = BSX.Cal, Market = BSX.Market, Options = BSX.Options, Broker = BSX.Broker, P = BSX.Pricing;
  var esc = U.esc, $ = U.$;

  var PRESETS = [
    ["long_call", "Long call", "Bullish. Pay a premium for upside; the most you can lose is the premium."],
    ["long_put", "Long put", "Bearish or a hedge. Profits if the price falls below the strike minus the premium."],
    ["covered_call", "Covered call", "Sell a call against 100 shares you own per contract. Earns premium, caps upside."],
    ["csp", "Cash-secured put", "Sell a put with cash set aside to buy the shares if assigned."],
    ["protective_put", "Protective put", "Buy a put against shares you own to limit the downside."],
    ["collar", "Collar", "Own shares, buy a put and sell a call: a cheap hedge that caps both sides."],
    ["bull_call", "Bull call spread", "Buy a call, sell a higher-strike call. Cheaper upside with a cap."],
    ["bear_put", "Bear put spread", "Buy a put, sell a lower-strike put. Cheaper downside bet with a cap."],
    ["bull_put", "Bull put credit spread", "Sell a put, buy a lower one. Collect premium if the price stays up."],
    ["bear_call", "Bear call credit spread", "Sell a call, buy a higher one. Collect premium if the price stays down."],
    ["long_straddle", "Long straddle", "Buy a call and a put at the same strike. Profits from a big move either way."],
    ["short_straddle", "Short straddle", "Sell a call and a put. Profits if the price stays put; unlimited risk."],
    ["long_strangle", "Long strangle", "Buy an OTM call and an OTM put. A cheaper bet on a big move."],
    ["short_strangle", "Short strangle", "Sell an OTM call and put. Collect premium; large risk on a big move."],
    ["iron_condor", "Iron condor", "Sell a put spread and a call spread. Profits in a range, with defined risk."],
    ["iron_fly", "Iron butterfly", "Sell an ATM straddle and buy wings. Bigger credit, narrower profit zone."],
    ["butterfly", "Call butterfly", "Buy 1 low, sell 2 middle, buy 1 high. Cheap bet on the price pinning a strike."],
    ["calendar", "Calendar spread", "Sell a near-term call, buy a later one at the same strike. Profits from time decay and rising IV."]
  ];

  function st() { return App.state("options", { und: "US500", exp: null, n: 10, legs: [], qty: 1, type: "market" }); }

  function expiries(W) { return Options.expiries(W.day).filter(function (e) { return e.day > W.day || (e.day === W.day && W.phase === "open"); }); }

  function render() {
    var W = App.W, s = st();
    if (!W.M.assets[s.und] || !Options.optionable(W.M.assets[s.und])) s.und = "US500";
    if (s.legs.length && s.legs[0].c.und !== s.und) s.legs = [];
    var exps = expiries(W);
    if (!s.exp || exps.every(function (e) { return e.day !== s.exp; })) s.exp = (exps.filter(function (e) { return e.day - W.day >= 25; })[0] || exps[0]).day;
    var opts = W.M.lists.index.filter(function (id) { return Options.optionable(W.M.assets[id]); }).concat(W.M.lists.etf, W.M.lists.stock);
    var h = '<div class="section-head"><div><h2>Options</h2><p>Calls and puts on every stock and ETF, plus cash-settled European options on the US 500, Tech 100 and Small Cap 200 indices. Click an ask to buy or a bid to sell and the leg is added to the builder.</p></div></div>';
    h += '<div class="card"><div class="row between">' +
      '<div class="row"><label class="field" style="min-width:200px"><span>Underlying</span><input list="opt-unds" data-f="und" value="' + esc(s.und) + '" aria-label="Underlying symbol" autocomplete="off"></label>' +
      '<datalist id="opt-unds">' + opts.map(function (id) { return '<option value="' + id + '">' + esc(W.M.assets[id].name) + "</option>"; }).join("") + "</datalist>" +
      '<div class="chips" style="align-self:flex-end">' + ["US500", "TECH100", "USFV", "TCHQ", W.M.lists.stock[0], W.M.lists.stock[1], W.M.lists.stock[2], "ORBX", "SEMI"].map(function (id) { return '<button type="button" class="chip t" data-und="' + id + '" aria-pressed="' + (s.und === id) + '">' + id + "</button>"; }).join("") + "</div></div>" +
      '<div data-region="und" class="row"></div></div>' +
      '<div class="chips" style="margin-top:12px" data-region="exps"></div></div>';
    h += '<div class="grid split" style="margin-top:14px">' +
      '<div class="card flush"><div class="card-head" style="padding:12px 14px 0"><h3 data-region="chain-title">Chain</h3><div class="row"><span class="small muted">Strikes</span><div class="seg">' + [6, 10, 16].map(function (n) { return '<button type="button" data-n="' + n + '" aria-pressed="' + (s.n === n) + '">±' + n + "</button>"; }).join("") + '</div></div></div><div class="table-wrap" data-region="chain"></div></div>' +
      '<div class="stack">' +
        '<div class="card"><div class="card-head"><h3>Strategy builder</h3><select data-f="preset" aria-label="Strategy preset"><option value="">Load a strategy…</option>' + PRESETS.map(function (p) { return '<option value="' + p[0] + '">' + p[1] + "</option>"; }).join("") + '</select></div>' +
          '<div data-region="preset-note" class="small secondary"></div><div data-region="legs"></div></div>' +
        '<div class="card"><div class="card-head"><h3>Payoff</h3><div class="legend"><span><i style="background:var(--text-primary)"></i>At expiry</span><span style="color:var(--accent)"><i class="dash" style="background:var(--accent)"></i>Today</span></div></div><div class="chart-box"><canvas data-region="payoff" aria-label="Strategy payoff chart"></canvas></div><div data-region="pstats" style="margin-top:10px"></div></div>' +
        '<div class="card"><h3>Place order</h3><div data-region="order"></div></div>' +
      "</div></div>";
    h += '<div class="card flush" style="margin-top:14px"><div class="card-head" style="padding:12px 14px 0"><h3>Your option positions</h3></div><div class="table-wrap" data-region="positions"></div></div>';
    return h;
  }

  function mount(app, el) {
    var s = st();
    var und = $('[data-f="und"]', el);
    und.addEventListener("change", function () { setUnd(und.value.trim().toUpperCase()); });
    und.addEventListener("keydown", function (e) { if (e.key === "Enter") setUnd(und.value.trim().toUpperCase()); });
    $('[data-f="preset"]', el).addEventListener("change", function (e) { s.preset = e.target.value; buildPreset(e.target.value); e.target.value = ""; update(app, el, true); });
    el.addEventListener("click", function (e) {
      var t = e.target.closest("[data-und],[data-exp],[data-n],[data-leg],[data-rm],[data-flip],[data-act],[data-oact]");
      if (!t) return;
      if (t.dataset.und) setUnd(t.dataset.und);
      else if (t.dataset.exp) { s.exp = +t.dataset.exp; update(app, el, true); }
      else if (t.dataset.n) { s.n = +t.dataset.n; App.refresh(true); }
      else if (t.dataset.leg) {
        var c = Options.parse(t.dataset.leg);
        addLeg(c, t.dataset.side);
        update(app, el, true);
      } else if (t.dataset.rm != null) { s.legs.splice(+t.dataset.rm, 1); update(app, el, true); }
      else if (t.dataset.flip != null) { var l = s.legs[+t.dataset.flip]; l.side = l.side === "buy" ? "sell" : "buy"; update(app, el, true); }
      else if (t.dataset.act === "clear") { s.legs = []; update(app, el, true); }
      else if (t.dataset.act === "place") place(el);
      else if (t.dataset.oact === "close") { var r1 = Broker.closePosition(App.W, App.W.A, t.dataset.key); drain(r1); }
      else if (t.dataset.oact === "exercise") { var r2 = Broker.exercise(App.W, App.W.A, t.dataset.key); if (!r2.ok) App.toast(r2.error, "reject"); drain({ ok: true }); }
    });
    el.addEventListener("input", function (e) {
      var t = e.target;
      if (t.dataset.ratio != null) { s.legs[+t.dataset.ratio].ratio = Math.max(1, Math.round(+t.value || 1)); update(app, el, true); }
      if (t.dataset.f === "qty") { s.qty = Math.max(1, Math.round(+t.value || 1)); drawStats(el); }
      if (t.dataset.f === "limit") { s.limit = t.value; }
    });
    el.addEventListener("change", function (e) { if (e.target.dataset.f === "otype") { s.type = e.target.value; drawOrder(el, true); } });
  }

  function drain(res) {
    var A = App.W.A;
    while (A.events.length) { var ev = A.events.shift(); App.toast(ev.text, ev.type); }
    if (res && !res.ok && res.error) App.toast(res.error, "reject");
    App.refresh(false);
  }

  function setUnd(id) {
    var W = App.W, s = st();
    var a = W.M.assets[id];
    if (!a || !Options.optionable(a)) { App.toast("No options are listed on " + id + ".", "reject"); return; }
    if (s.und !== id) { s.und = id; s.legs = []; }
    App.refresh(true);
  }

  function addLeg(c, side) {
    var s = st();
    var k = Options.key(c);
    var ex = s.legs.filter(function (l) { return Options.key(l.c) === k; })[0];
    if (ex) { if (ex.side === side) ex.ratio++; else ex.side = side; return; }
    s.legs.push({ c: c, side: side, ratio: 1 });
  }

  function buildPreset(id) {
    var W = App.W, s = st(), a = W.M.assets[s.und];
    var step = Options.strikeStep(a.px);
    var atm = Math.round(a.px / step) * step;
    var K = function (k) { return Math.round((atm + k * step) * 100) / 100; };
    var mk = function (right, k, side, ratio, exp) { return { c: { und: s.und, exp: exp || s.exp, right: right, K: K(k), mult: 100 }, side: side, ratio: ratio || 1 }; };
    var exps = expiries(W).map(function (e) { return e.day; });
    var later = exps.filter(function (d) { return d > s.exp + 20; })[0] || exps[exps.length - 1];
    var L = {
      long_call: [mk("C", 0, "buy")], long_put: [mk("P", 0, "buy")], covered_call: [mk("C", 1, "sell")], csp: [mk("P", -1, "sell")],
      protective_put: [mk("P", -1, "buy")], collar: [mk("P", -2, "buy"), mk("C", 2, "sell")],
      bull_call: [mk("C", 0, "buy"), mk("C", 2, "sell")], bear_put: [mk("P", 0, "buy"), mk("P", -2, "sell")],
      bull_put: [mk("P", -1, "sell"), mk("P", -3, "buy")], bear_call: [mk("C", 1, "sell"), mk("C", 3, "buy")],
      long_straddle: [mk("C", 0, "buy"), mk("P", 0, "buy")], short_straddle: [mk("C", 0, "sell"), mk("P", 0, "sell")],
      long_strangle: [mk("C", 2, "buy"), mk("P", -2, "buy")], short_strangle: [mk("C", 2, "sell"), mk("P", -2, "sell")],
      iron_condor: [mk("P", -4, "buy"), mk("P", -2, "sell"), mk("C", 2, "sell"), mk("C", 4, "buy")],
      iron_fly: [mk("P", -3, "buy"), mk("P", 0, "sell"), mk("C", 0, "sell"), mk("C", 3, "buy")],
      butterfly: [mk("C", -2, "buy"), mk("C", 0, "sell", 2), mk("C", 2, "buy")],
      calendar: [mk("C", 0, "sell"), mk("C", 0, "buy", 1, later)]
    }[id];
    if (!L) return;
    s.legs = L;
    s.presetNote = PRESETS.filter(function (p) { return p[0] === id; })[0][2];
    if ((id === "covered_call" || id === "protective_put" || id === "collar") && !Options.isIndex(s.und)) {
      var held = W.A.pos[s.und] ? W.A.pos[s.und].qty : 0;
      s.presetNote += " You hold " + U.qty(held) + " " + s.und + " shares" + (held >= 100 ? " (" + Math.floor(held / 100) + " contracts' worth)." : ". Buy the shares first from the trade window.");
    }
  }

  /* ---------------- Updating ---------------- */
  function update(app, el, force) {
    var W = App.W, s = st(), a = W.M.assets[s.und];
    var exps = expiries(W);
    if (!exps.some(function (e) { return e.day === s.exp; })) s.exp = exps[0].day;
    var T = Options.tte(W, s.exp);
    var atmIv = Options.atmVol(W, a, T, s.exp);
    var chain = Options.chain(W, s.und, s.exp, s.n);
    var atmRow = chain.reduce(function (b, r) { return Math.abs(r.K - a.px) < Math.abs(b.K - a.px) ? r : b; }, chain[0]);
    var straddle = atmRow.call.mid + atmRow.put.mid;
    var ch = U.change(a);
    var earnFlag = a.type === "stock" && a.nextEarn && a.nextEarn <= s.exp && a.nextEarn >= W.day;
    $('[data-region="und"]', el).innerHTML =
      '<div class="stat"><span class="small muted">' + esc(a.name) + '</span><div><b class="mono" style="font-size:1.2rem">' + U.assetPx(a) + '</b> <span class="mono ' + U.cls(ch) + '">' + U.pct(ch) + "</span></div></div>" +
      '<div class="stat"><span class="small muted">ATM implied vol</span><div class="mono">' + U.pctU(atmIv, 1) + "</div></div>" +
      '<div class="stat"><span class="small muted">Expected move to ' + Cal.short(s.exp) + '</span><div class="mono">±' + U.num(straddle) + " (" + U.pctU(straddle / a.px, 1) + ")</div></div>" +
      (earnFlag ? '<span class="chip warn">Earnings ' + Cal.short(a.nextEarn) + " before expiry</span>" : "") +
      '<button type="button" class="sm" data-trade="' + s.und + '">Chart &amp; trade ' + esc(s.und) + "</button>";
    $('[data-region="exps"]', el).innerHTML = exps.map(function (e) {
      var dte = e.day - W.day;
      return '<button type="button" class="chip" data-exp="' + e.day + '" aria-pressed="' + (e.day === s.exp) + '">' + Cal.shortY(e.day) + ' <span class="muted">' + dte + "d" + (e.kind === "W" ? " · wk" : "") + "</span></button>";
    }).join("");
    $('[data-region="chain-title"]', el).textContent = s.und + " · " + Cal.nice(s.exp) + (Options.isIndex(s.und) ? " · European, cash-settled" : "");
    var S = a.px;
    var h = '<table class="chain"><thead><tr><th colspan="5" class="side-h">Calls</th><th class="strike"></th><th colspan="5" class="side-h">Puts</th></tr><tr>' +
      '<th class="num">Δ</th><th class="num">IV</th><th class="num">Last</th><th class="num">Bid</th><th class="num">Ask</th><th class="strike">Strike</th><th class="num">Bid</th><th class="num">Ask</th><th class="num">Last</th><th class="num">IV</th><th class="num">Δ</th></tr></thead><tbody>';
    var atmDone = false;
    chain.forEach(function (row) {
      var atm = !atmDone && row.K >= S;
      if (atm) atmDone = true;
      var cItm = row.K < S, pItm = row.K > S;
      var ck = Options.key(row.callC), pk = Options.key(row.putC);
      h += '<tr class="' + (atm ? "atm" : "") + '">' +
        '<td class="num ' + (cItm ? "itm" : "") + '">' + row.call.delta.toFixed(2) + '</td><td class="num ' + (cItm ? "itm" : "") + '">' + U.pctU(row.call.iv, 1) + '</td><td class="num ' + (cItm ? "itm" : "") + '">' + row.call.mid.toFixed(2) + "</td>" +
        '<td class="q ' + (cItm ? "itm" : "") + '" data-leg="' + ck + '" data-side="sell" title="Sell to open at the bid">' + row.call.bid.toFixed(2) + "</td>" +
        '<td class="q ' + (cItm ? "itm" : "") + '" data-leg="' + ck + '" data-side="buy" title="Buy at the ask">' + row.call.ask.toFixed(2) + "</td>" +
        '<td class="strike">' + Options.fmtK(row.K) + "</td>" +
        '<td class="q ' + (pItm ? "itm" : "") + '" data-leg="' + pk + '" data-side="sell" title="Sell to open at the bid">' + row.put.bid.toFixed(2) + "</td>" +
        '<td class="q ' + (pItm ? "itm" : "") + '" data-leg="' + pk + '" data-side="buy" title="Buy at the ask">' + row.put.ask.toFixed(2) + "</td>" +
        '<td class="num ' + (pItm ? "itm" : "") + '">' + row.put.mid.toFixed(2) + '</td><td class="num ' + (pItm ? "itm" : "") + '">' + U.pctU(row.put.iv, 1) + '</td><td class="num ' + (pItm ? "itm" : "") + '">' + row.put.delta.toFixed(2) + "</td></tr>";
    });
    h += "</tbody></table>";
    $('[data-region="chain"]', el).innerHTML = h;
    drawLegs(el);
    var now = Date.now();
    if (force || !s.drawn || now - s.drawn > 500) { s.drawn = now; drawStats(el); }
    drawOrder(el, force);
    drawPositions(el);
  }

  function legQuotes(W, legs) { return legs.map(function (l) { return { l: l, q: Options.price(W, l.c) }; }); }

  function drawLegs(el) {
    var W = App.W, s = st();
    $('[data-region="preset-note"]', el).textContent = s.legs.length ? (s.presetNote || "") : "";
    if (!s.legs.length) { $('[data-region="legs"]', el).innerHTML = '<div class="empty">Pick a strategy above or click a bid or ask in the chain.</div>'; return; }
    var lq = legQuotes(W, s.legs);
    $('[data-region="legs"]', el).innerHTML = '<div class="table-wrap"><table><thead><tr><th>Side</th><th class="num">Ratio</th><th>Contract</th><th class="num">Price</th><th class="num">Δ</th><th></th></tr></thead><tbody>' +
      lq.map(function (x, i) {
        var buy = x.l.side === "buy";
        return '<tr><td><button type="button" class="sm ' + (buy ? "buy" : "sell") + '" data-flip="' + i + '">' + (buy ? "Buy" : "Sell") + '</button></td><td class="num"><input type="number" min="1" step="1" value="' + x.l.ratio + '" data-ratio="' + i + '" style="width:54px" aria-label="Leg ratio"></td>' +
          '<td class="small">' + esc(Options.label(x.l.c)) + '</td><td class="num">' + (buy ? x.q.ask : x.q.bid).toFixed(2) + '</td><td class="num">' + ((buy ? 1 : -1) * x.l.ratio * x.q.delta).toFixed(2) + '</td><td class="c"><button type="button" class="ghost sm" data-rm="' + i + '" aria-label="Remove leg">✕</button></td></tr>';
      }).join("") + '</tbody></table></div><div class="row" style="margin-top:6px"><button type="button" class="ghost sm" data-act="clear">Clear all legs</button></div>';
  }

  // P&L curves, breakevens, max profit/loss and probability of profit.
  function analyze(W, legs, qty) {
    var s = st(), a = W.M.assets[s.und];
    var lq = legQuotes(W, legs);
    var Tmin = Math.min.apply(null, lq.map(function (x) { return x.q.T; }));
    var atm = Options.atmVol(W, a, Math.max(Tmin, 1 / 365), legs[0].c.exp);
    var span = Math.max(0.08, Math.min(0.6, 2.8 * atm * Math.sqrt(Math.max(Tmin, 5 / 365))));
    var S = a.px, lo = S * (1 - span), hi = S * (1 + span);
    lq.forEach(function (x) { lo = Math.min(lo, x.l.c.K * 0.9); hi = Math.max(hi, x.l.c.K * 1.1); });
    var N = 160, xs = [], ye = [], yt = [];
    var entry = lq.map(function (x) { return x.l.side === "buy" ? x.q.ask : x.q.bid; });
    for (var i = 0; i <= N; i++) {
      var X = lo + (hi - lo) * i / N;
      var e = 0, t = 0;
      lq.forEach(function (x, j) {
        var sign = (x.l.side === "buy" ? 1 : -1) * x.l.ratio * qty * 100;
        var c = x.l.c, isCall = c.right === "C", q = x.q;
        var rem = q.T - Tmin;
        var vE = rem <= 1e-9 ? P.intrinsic(X, c.K, isCall) : (q.euro ? P.bsPrice : P.optionValue)(X, c.K, rem, q.r, q.q, q.iv, isCall);
        var vT = q.T <= 0 ? P.intrinsic(X, c.K, isCall) : (q.euro ? P.bsPrice : P.optionValue)(X, c.K, q.T, q.r, q.q, q.iv, isCall);
        e += sign * (vE - entry[j]);
        t += sign * (vT - entry[j]);
      });
      xs.push(X); ye.push(e); yt.push(t);
    }
    var bes = [];
    for (i = 1; i <= N; i++) if ((ye[i - 1] < 0) !== (ye[i] < 0)) bes.push(xs[i - 1] + (xs[i] - xs[i - 1]) * (-ye[i - 1]) / (ye[i] - ye[i - 1]));
    var maxP = Math.max.apply(null, ye), maxL = Math.min.apply(null, ye);
    var slopeHi = ye[N] - ye[N - 1];
    var unlimitedUp = slopeHi > 1e-6 * qty && Tmin === Math.max.apply(null, lq.map(function (x) { return x.q.T; }));
    var unlimitedLoss = slopeHi < -1e-6 && Tmin === Math.max.apply(null, lq.map(function (x) { return x.q.T; }));
    // Probability the price at the first expiry lands in a profitable zone (lognormal).
    var r = lq[0].q.r, qd = lq[0].q.q, T = Math.max(Tmin, 1 / 365);
    var mu = Math.log(S) + (r - qd - 0.5 * atm * atm) * T, sd = atm * Math.sqrt(T);
    var pop = 0;
    for (i = 0; i < N; i++) {
      if ((ye[i] + ye[i + 1]) / 2 > 0) {
        var p1 = P.normCdf((Math.log(xs[i + 1]) - mu) / sd) - P.normCdf((Math.log(xs[i]) - mu) / sd);
        pop += p1;
      }
    }
    if (ye[0] > 0) pop += P.normCdf((Math.log(xs[0]) - mu) / sd);
    if (ye[N] > 0) pop += 1 - P.normCdf((Math.log(xs[N]) - mu) / sd);
    var g = { delta: 0, gamma: 0, theta: 0, vega: 0 };
    lq.forEach(function (x) { var k = (x.l.side === "buy" ? 1 : -1) * x.l.ratio * qty * 100; g.delta += k * x.q.delta; g.gamma += k * x.q.gamma; g.theta += k * x.q.theta; g.vega += k * x.q.vega; });
    var net = lq.reduce(function (acc, x, j) { return acc + (x.l.side === "buy" ? 1 : -1) * x.l.ratio * entry[j]; }, 0);
    var mid = lq.reduce(function (acc, x) { return acc + (x.l.side === "buy" ? 1 : -1) * x.l.ratio * x.q.mid; }, 0);
    return { xs: xs, ye: ye, yt: yt, bes: bes, maxP: maxP, maxL: maxL, unlimitedUp: unlimitedUp, unlimitedLoss: unlimitedLoss, pop: pop, g: g, net: net, mid: mid, S: S };
  }

  function drawStats(el) {
    var W = App.W, s = st();
    var canvas = $('[data-region="payoff"]', el), box = $('[data-region="pstats"]', el);
    canvas.hidden = !s.legs.length;
    if (!s.legs.length) { box.innerHTML = '<div class="empty">The payoff at expiry and today appears here once you add a leg.</div>'; return; }
    var an = analyze(W, s.legs, s.qty);
    C.payoff(canvas, { xs: an.xs, expiry: an.ye, today: an.yt, S: an.S, breakevens: an.bes, height: 250 });
    var legsSpec = s.legs.map(function (l) { return { c: l.c, side: l.side, ratio: l.ratio }; });
    var pv = Broker.preview(W, W.A, { legs: legsSpec, side: "buy", qty: s.qty, type: "market" });
    var bpe = pv.before && pv.after ? pv.after.available - pv.before.available : null;
    box.innerHTML = '<div class="stats-grid">' +
      "<div><span>" + (an.net >= 0 ? "Net debit" : "Net credit") + "</span><b>" + U.money(Math.abs(an.net * 100 * s.qty)) + "</b></div>" +
      "<div><span>Max profit</span><b class=\"up\">" + (an.unlimitedUp ? "Unlimited" : U.money0(Math.max(0, an.maxP))) + "</b></div>" +
      "<div><span>Max loss</span><b class=\"down\">" + (an.unlimitedLoss ? "Unlimited" : U.money0(Math.min(0, an.maxL))) + "</b></div>" +
      "<div><span>Breakeven</span><b>" + (an.bes.length ? an.bes.map(function (b) { return U.num(b, 2); }).join(" / ") : "—") + "</b></div>" +
      "<div><span>Prob. of profit</span><b>" + U.pctU(an.pop, 0) + "</b></div>" +
      "<div><span>Delta</span><b>" + an.g.delta.toFixed(1) + " sh</b></div>" +
      "<div><span>Theta / day</span><b class=\"" + U.cls(an.g.theta) + "\">" + U.signedMoney(an.g.theta) + "</b></div>" +
      "<div><span>Vega / vol pt</span><b>" + U.signedMoney(an.g.vega) + "</b></div>" +
      "<div><span>Gamma</span><b>" + an.g.gamma.toFixed(2) + "</b></div>" +
      "<div><span>Buying power effect</span><b>" + (bpe == null ? "—" : U.signedMoney(bpe, 0)) + "</b></div>" +
      "</div>" + (pv.error ? '<div class="small down" style="margin-top:6px">' + esc(pv.error) + "</div>" : "");
  }

  function drawOrder(el, force) {
    var W = App.W, s = st();
    var box = $('[data-region="order"]', el);
    if (!s.legs.length) { box.innerHTML = '<p class="small muted" style="margin:0">Add at least one leg.</p>'; box.dataset.sig = ""; return; }
    var an = legQuotes(W, s.legs).reduce(function (acc, x) { var sg = x.l.side === "buy" ? 1 : -1; acc.nat += sg * x.l.ratio * (sg > 0 ? x.q.ask : x.q.bid); acc.mid += sg * x.l.ratio * x.q.mid; return acc; }, { nat: 0, mid: 0 });
    var sig = s.legs.length + ":" + s.type;
    if (box.dataset.sig !== sig || force) {
      box.dataset.sig = sig;
      box.innerHTML = '<div class="ticket"><div class="two"><label class="field"><span>Contracts</span><input data-f="qty" class="num" type="number" min="1" step="1" value="' + s.qty + '"></label>' +
        '<label class="field"><span>Order type</span><select data-f="otype"><option value="market"' + (s.type === "market" ? " selected" : "") + '>Market</option><option value="limit"' + (s.type === "limit" ? " selected" : "") + ">Limit (net price)</option></select></label></div>" +
        '<label class="field" ' + (s.type === "limit" ? "" : "hidden") + '><span>Net price per spread (debit +, credit −)</span><input data-f="limit" class="num" type="number" step="0.01" value="' + (s.limit != null && s.type === "limit" ? s.limit : an.mid.toFixed(2)) + '"></label>' +
        '<div class="small secondary" data-region="natural"></div>' +
        '<button type="button" class="submit primary" data-act="place">Send order</button><div class="msg" data-region="omsg"></div>' +
        (W.phase !== "open" ? '<div class="small muted">Options trade 9:30 am – 4:00 pm. Orders sent now fill at the open.</div>' : "") + "</div>";
      if (s.type === "limit") s.limit = $('[data-f="limit"]', box).value;
    }
    var nat = $('[data-region="natural"]', box);
    if (nat) nat.textContent = "Natural price " + (an.nat >= 0 ? "debit " : "credit ") + U.num(Math.abs(an.nat)) + " · mid " + (an.mid >= 0 ? "debit " : "credit ") + U.num(Math.abs(an.mid)) + " per share (×100 per contract).";
  }

  function place(el) {
    var W = App.W, s = st();
    var msg = $('[data-region="omsg"]', el);
    var spec = { legs: s.legs.map(function (l) { return { c: l.c, side: l.side, ratio: l.ratio }; }), side: "buy", qty: s.qty, type: s.type, tif: "day" };
    if (s.type === "limit") spec.limit = +s.limit;
    if (s.legs.length === 1) { var l = s.legs[0]; spec = { c: l.c, side: l.side, qty: s.qty * l.ratio, type: s.type, tif: "day" }; if (s.type === "limit") spec.limit = Math.abs(+s.limit); }
    var res = Broker.place(W, W.A, spec);
    W.A.events = W.A.events.filter(function (ev) { return ev.order !== res.order; });
    if (!res.ok) { msg.className = "msg err"; msg.textContent = res.error; return; }
    msg.className = "msg ok";
    msg.textContent = res.order.status === "filled" ? "Filled at a net " + U.num(Math.abs(res.order.fillPx)) + (res.order.fillPx >= 0 ? " debit" : " credit") + "." : "Order #" + res.order.id + " is working.";
    App.refresh(false);
  }

  function drawPositions(el) {
    var W = App.W, A = W.A;
    var keys = Object.keys(A.pos).filter(function (k) { return A.pos[k].kind === "opt"; });
    if (!keys.length) { $('[data-region="positions"]', el).innerHTML = '<div class="empty">No option positions.</div>'; return; }
    var cache = {};
    $('[data-region="positions"]', el).innerHTML = '<table><thead><tr><th>Contract</th><th class="num">Qty</th><th class="num">Avg</th><th class="num">Mark</th><th class="num">P&amp;L</th><th class="num">Δ (sh)</th><th class="num">Θ / day</th><th class="num">DTE</th><th></th></tr></thead><tbody>' +
      keys.map(function (k) {
        var p = A.pos[k], q = Options.price(W, p.c);
        var pnl = Broker.openPnl(W, p, cache);
        var canEx = p.qty > 0 && !Options.isIndex(p.c.und) && q.intrinsic > 0;
        return "<tr><td><span class=\"small\">" + esc(Options.label(p.c)) + '</span></td><td class="num">' + p.qty + '</td><td class="num">' + p.avg.toFixed(2) + '</td><td class="num">' + q.mid.toFixed(2) + '</td><td class="num ' + U.cls(pnl) + '">' + U.signedMoney(pnl) + '</td><td class="num">' + (q.delta * p.qty * p.mult).toFixed(0) + '</td><td class="num ' + U.cls(q.theta * p.qty) + '">' + U.signedMoney(q.theta * p.qty * p.mult) + '</td><td class="num">' + (p.c.exp - W.day) + '</td><td class="num"><span class="row" style="justify-content:flex-end;flex-wrap:nowrap">' +
          (canEx ? '<button type="button" class="sm" data-oact="exercise" data-key="' + esc(k) + '">Exercise</button>' : "") + '<button type="button" class="sm" data-oact="close" data-key="' + esc(k) + '">Close</button></span></td></tr>';
      }).join("") + "</tbody></table>";
  }

  App.register({ id: "options", title: "Options", render: render, mount: mount, update: function (app, el) { update(app, el, false); } });
})(typeof self !== "undefined" ? self : this);
