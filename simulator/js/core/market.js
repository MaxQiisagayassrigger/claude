/*
 * The market: how every price moves.
 *
 * Stocks follow a factor model in log space:
 *   r_i = β_i·ε_mkt + ε_sector + σ_i·√dt·z_i + (μ_i − ½σ_i,tot²)·dt + jumps
 * where the market shock ε_mkt has stochastic volatility (log-OU, negatively
 * correlated with returns so selloffs raise volatility), sectors respond to
 * oil and to changes in the 10-yr yield, and μ_i = r_f + β_i(μ_mkt − r_f)
 * plus a slowly-varying stock-specific drift and a pull toward a fair P/E.
 *
 * Crypto has its own factor and bull/neutral/winter regime; commodities are
 * mean-reverting in log price with contango/backwardation; FX pairs share a
 * dollar factor. Indices are rebuilt from constituents each step, ETFs from
 * their indices (leveraged funds reset daily), bonds from the Treasury
 * curve plus credit spreads, and futures from spot plus carry.
 *
 * A trading day is 26 session steps (9:30–16:00) plus one overnight step
 * that also covers weekends and holidays. Stocks get ~20% of a day's
 * variance overnight; crypto keeps trading through nights and weekends.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./calendar.js"), require("./pricing.js"), require("./economy.js"), require("./events.js"), require("./universe.js"));
  } else {
    root.BSX = root.BSX || {};
    root.BSX.Market = factory(root.BSX.Cal, root.BSX.Pricing, root.BSX.Economy, root.BSX.Events, root.BSX.Universe);
  }
})(typeof self !== "undefined" ? self : this, function (Cal, P, Econ, Events, Universe) {
  "use strict";

  var TPD = Cal.TICKS_PER_DAY;
  var MAX_BARS = 560, TRIM_TO = 510;
  var NEWS_MAX = 400;
  var SEC_BY_ID = {};
  Universe.SECTORS.forEach(function (s) { SEC_BY_ID[s.id] = s; });

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function mkBars() { return { o: [], h: [], l: [], c: [], v: [] }; }

  function baseAsset(id, type, name, px) {
    return { id: id, type: type, name: name, px: px, prev: px, open: px, hi: px, lo: px, vol: 0, bars: mkBars(), intra: [px], intraHist: [] };
  }

  /* ------------------------------------------------------------------ */
  /* Creation                                                            */
  /* ------------------------------------------------------------------ */
  function create(rng, E, startDay) {
    var U = Universe.get();
    var M = {
      assets: {},
      lists: { stock: [], etf: [], index: [], crypto: [], commodity: [], basket: [], fx: [], future: [], perp: [], bond: [] },
      days: [],
      f: { v: 0.14, cv: 0.5, cRegime: "neutral", cAge: 60, dollar: 0, oilAcc: 0, y10: 0, y2: 0, crashAge: 999 },
      alphaSector: {},
      fxRates: {},
      news: [], newsSeq: 0,
      corp: [], expiring: [],
      auctions: {},
      pe: { mkt: 22, fair: 22 }
    };
    function add(a) { M.assets[a.id] = a; M.lists[a.type].push(a.id); return a; }

    U.sectors.forEach(function (s) { M.alphaSector[s.id] = 0; });

    U.stocks.forEach(function (s) {
      var a = baseAsset(s.id, "stock", s.name, s.p0);
      for (var k in s) if (!(k in a)) a[k] = s[k];
      a.alpha = 0.06 * rng.gauss();
      a.spr = 0.00008 + 0.0025 * Math.sqrt(1e9 / s.cap0);
      a.adv = s.shares * s.turnover;
      a.nextEarn = null; a.nextEx = null; a.lastEarn = null;
      a.q = s.dps / s.p0;
      a.peFair = SEC_BY_ID[s.sector].pe * 1.05;
      add(a);
    });

    U.crypto.forEach(function (c) {
      var a = baseAsset(c.id, "crypto", c.name, c.p0);
      a.supply = c.supply; a.desc = c.desc; a.stake = c.stake || 0; a.stable = !!c.stable;
      a.beta = c.beta || 0; a.sig = c.sig || 0.01;
      a.idio = c.stable ? 0.004 : Math.sqrt(Math.max(0.01, a.sig * a.sig - Math.pow(a.beta * 0.45, 2)));
      a.spr = c.stable ? 0.0001 : c.supply * c.p0 > 1e11 ? 0.0004 : 0.0015;
      a.adv = c.supply * 0.012;
      add(a);
    });

    U.commodities.forEach(function (c) {
      var a = baseAsset(c.id, "commodity", c.name, c.p0);
      a.unit = c.unit; a.mean = c.mean; a.kappa = c.kappa; a.sig = c.sig; a.carry0 = c.carry; a.carry = c.carry; a.drift = c.drift || 0; a.group = c.group;
      add(a);
    });
    Object.keys(U.baskets).forEach(function (id) {
      var b = U.baskets[id];
      var a = baseAsset(id, "basket", b.name, b.p0);
      a.w = b.w; a.hidden = true;
      add(a);
    });

    U.fx.forEach(function (x) {
      var a = baseAsset(x.id, "fx", x.base + "/" + x.quote, x.p0);
      for (var k in x) if (!(k in a)) a[k] = x[k];
      a.pip = x.quote === "JPY" ? 0.01 : 0.0001;
      a.sprPips = x.major ? 1.2 : 3.5;
      a.idio = Math.sqrt(Math.max(0.0004, x.sig * x.sig - 0.055 * 0.055));
      M.fxRates[x.base === "USD" ? x.quote : x.base] = x.rate;
      add(a);
    });

    // Indices (public + hidden sector/industry indices for the sector funds).
    U.indices.forEach(function (ix) {
      var a = baseAsset(ix.id, "index", ix.name, ix.base);
      a.rule = ix.rule; a.weight = ix.weight; a.desc = ix.desc; a.members = []; a.divisor = 1; a.divPts = 0;
      add(a);
    });
    U.sectors.forEach(function (s) {
      var a = baseAsset("SEC:" + s.id, "index", s.name + " Sector", 100);
      a.rule = "sector:" + s.id; a.weight = "cap"; a.members = []; a.divisor = 1; a.hidden = true; a.divPts = 0;
      add(a);
    });
    var industryIds = {};
    U.etfs.forEach(function (e) { if (e.track && e.track.indexOf("IND:") === 0) industryIds[e.track] = 1; });
    Object.keys(industryIds).forEach(function (id) {
      var a = baseAsset(id, "index", id.slice(4) + " Industry", 100);
      a.rule = "industry:" + id.slice(4); a.weight = "cap"; a.members = []; a.divisor = 1; a.hidden = true; a.divPts = 0;
      add(a);
    });
    var svx = baseAsset("SVX", "index", "Volatility Index", 16);
    svx.rule = "vol"; svx.members = []; svx.divPts = 0; svx.desc = "Expected 30-day volatility of the US 500 implied by option prices, in annualized percent. Above 30 signals fear.";
    add(svx);
    rebalance(M, true);
    M.lists.index.forEach(function (id) {
      var ix = M.assets[id];
      if (ix.rule === "vol") return;
      var target = ix.px / 1.08; // about a year of growth brings it to its base level
      if (ix.hidden) target = rng.range(60, 240);
      ix.divisor = 1;
      var raw = indexRaw(M, ix);
      ix.divisor = raw / target;
      ix.px = ix.prev = ix.open = ix.hi = ix.lo = target;
      ix.intra = [target];
      ix.lastPx = memberPrices(M, ix);
    });

    // ETFs.
    U.etfs.forEach(function (e) {
      var a = baseAsset(e.id, "etf", e.name, 1);
      for (var k in e) if (!(k in a)) a[k] = e[k];
      a.tf = 1; a.acc = 0;
      a.spr = e.kind === "index" ? 0.00015 : 0.0006;
      a.adv = 2e6 * (e.kind === "index" && !e.track.match(/:/) ? 20 : 1);
      a.q = 0;
      if (e.kind === "index") { a.nav = M.assets[e.track].px * (e.scale || 1); }
      else if (e.kind === "lev") { a.nav = e.p0; }
      else if (e.kind === "bond") { a.nav = e.p0; }
      else if (e.kind === "commodity") { a.nav = (e.spot ? M.assets[e.track].px * e.scale : 40 + 30 * rng.next()); }
      else if (e.kind === "crypto") { a.nav = M.assets[e.track].px * e.scale; }
      else if (e.kind === "vol") { a.nav = e.p0; }
      a.px = a.prev = a.open = a.hi = a.lo = a.nav;
      a.intra = [a.nav];
      a.base = null;
      add(a);
    });

    U.perps.forEach(function (p) {
      var und = M.assets[p.und];
      var a = baseAsset(p.id, "perp", und.name + " Perpetual", und.px);
      a.und = p.und; a.maxLev = p.maxLev; a.funding = 0.0001; a.mult = 1;
      add(a);
    });

    M.f.y10 = Econ.yieldAt(E, 10, startDay);
    M.f.y2 = Econ.yieldAt(E, 2, startDay);
    listFutures(M, E, startDay);
    initBonds(M, E, rng, startDay, U);
    derived(M, E, startDay, 0, 0);
    M.lists.stock.forEach(function (id) { schedule(M.assets[id], startDay); });
    return M;
  }

  /* ------------------------------------------------------------------ */
  /* Indices                                                             */
  /* ------------------------------------------------------------------ */
  function cap(a) { return a.px * a.shares; }

  function rebalance(M, initial) {
    var stocks = M.lists.stock.map(function (id) { return M.assets[id]; });
    var byCap = stocks.slice().sort(function (a, b) { return cap(b) - cap(a); });
    var changes = [];
    M.lists.index.forEach(function (id) {
      var ix = M.assets[id];
      var r = ix.rule, members;
      if (r === "vol") return;
      if (r === "top500") members = byCap.slice(0, 500);
      else if (r === "all") members = byCap;
      else if (r === "small200") members = byCap.slice(-200);
      else if (r === "tech100") members = byCap.filter(function (s) { return s.sector !== "fin" && s.sector !== "utils" && s.sector !== "realest"; }).slice(0, 100);
      else if (r === "blue30") {
        if (!initial) return; // the Average's membership is fixed
        members = byCap.filter(function (s) { return s.sector !== "utils" && s.sector !== "realest"; }).slice(0, 34).filter(function (s, i) { return i % 8 !== 7; }).slice(0, 30);
      }
      else if (r === "div50") members = byCap.slice(0, 300).filter(function (s) { return s.dps > 0; }).sort(function (a, b) { return b.dps / b.px - a.dps / a.px; }).slice(0, 50);
      else if (r.indexOf("sector:") === 0) { if (!initial) return; var sid = r.slice(7); members = stocks.filter(function (s) { return s.sector === sid; }); }
      else if (r.indexOf("industry:") === 0) { if (!initial) return; var ind = r.slice(9); members = stocks.filter(function (s) { return s.industry === ind; }); }
      var ids = members.map(function (s) { return s.id; });
      if (!initial && !ix.hidden && (r === "top500" || r === "tech100")) {
        var old = {}; ix.members.forEach(function (m) { old[m] = 1; });
        var neu = {}; ids.forEach(function (m) { neu[m] = 1; });
        ids.forEach(function (m) { if (!old[m]) changes.push({ ix: ix, id: m, add: true }); });
        ix.members.forEach(function (m) { if (!neu[m]) changes.push({ ix: ix, id: m, add: false }); });
      }
      if (initial) { ix.members = ids; return; }
      // Keep the level continuous across the membership change.
      var before = indexRaw(M, ix);
      ix.members = ids;
      var after = indexRaw(M, ix);
      if (ix.weight !== "equal") ix.divisor *= after / before;
      ix.lastPx = memberPrices(M, ix);
    });
    return changes;
  }

  function memberPrices(M, ix) { return ix.members.map(function (id) { return M.assets[id].px; }); }

  function indexRaw(M, ix) {
    var s = 0, m = ix.members, i;
    if (ix.weight === "cap") { for (i = 0; i < m.length; i++) s += cap(M.assets[m[i]]); return s / ix.divisor; }
    if (ix.weight === "price") { for (i = 0; i < m.length; i++) s += M.assets[m[i]].px; return s / ix.divisor; }
    // Equal weight: chain-link the average member return.
    if (!ix.lastPx || ix.lastPx.length !== m.length) return ix.px;
    for (i = 0; i < m.length; i++) s += M.assets[m[i]].px / ix.lastPx[i];
    return ix.px * s / m.length;
  }

  function updateIndices(M) {
    M.lists.index.forEach(function (id) {
      var ix = M.assets[id];
      if (ix.rule === "vol") return;
      ix.px = indexRaw(M, ix);
      if (ix.weight === "equal") ix.lastPx = memberPrices(M, ix);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Bonds                                                               */
  /* ------------------------------------------------------------------ */
  function roundDown8(x) { return Math.max(0.125, Math.floor(x * 8) / 8); }
  function pct3(x) { return (Math.round(x * 1000) / 1000).toString(); }

  function makeBond(M, spec) {
    var id = spec.id;
    if (M.assets[id]) return M.assets[id];
    var a = baseAsset(id, "bond", spec.name, 100);
    for (var k in spec) if (!(k in a)) a[k] = spec[k];
    a.yld = 0; a.acc = 0; a.dur = 0; a.cvx = 0; a.listed = true;
    M.assets[id] = a;
    M.lists.bond.push(id);
    return a;
  }

  function ustLabel(coupon, mat, bill) {
    var p = Cal.parts(mat);
    var d = (p.m < 10 ? "0" : "") + p.m + "/" + (p.d < 10 ? "0" : "") + p.d + "/" + String(p.y).slice(2);
    return bill ? "T-Bill " + d : "T " + pct3(coupon * 100) + " " + d;
  }

  function issueTreasury(M, E, bucket, day, coupon, name) {
    var bill = !!bucket.bill;
    var mat = bill ? day + Math.round(bucket.term * 364) : P.addMonths(day, Math.round(bucket.term * 12));
    mat = Cal.onOrAfter(mat);
    var y = Econ.yieldAt(E, bucket.term, day) / 100;
    var cpn = bill ? 0 : (coupon != null ? coupon : roundDown8(y * 100) / 100);
    var id = "UST-" + Cal.iso(mat) + "-" + (bill ? "B" : pct3(cpn * 100));
    return makeBond(M, {
      id: id, name: ustLabel(cpn, mat, bill), label: bucket.label, cls: "ust", issuer: "US Treasury", rating: "AA+",
      coupon: cpn, freq: bill ? 0 : 2, mat: mat, issued: day, term: bucket.term, spread0: 0, face: 100
    });
  }

  function initBonds(M, E, rng, day, U) {
    U.ustBuckets.forEach(function (b) {
      var step = b.every;
      var n = b.bill ? Math.max(2, Math.round(b.term * 12 / 2)) : 2;
      for (var i = n - 1; i >= 0; i--) {
        var iss = Cal.onOrAfter(P.addMonths(day, -i * step));
        if (iss < day - b.term * 365 + 20) continue;
        issueTreasury(M, E, b, iss);
      }
      M.auctions[b.term] = day;
    });
    // Older, off-the-run coupons with the coupons of their era.
    var y0 = Cal.parts(day).y;
    [[30, 22], [30, 12], [30, 5], [20, 8], [10, 4], [10, 7], [7, 3]].forEach(function (t) {
      var term = t[0], ago = t[1];
      var iss = Cal.onOrAfter(P.addMonths(day, -ago * 12 - rng.int(0, 5)));
      var yr = y0 - ago;
      var cpn = yr <= 2007 ? rng.range(4.5, 5.5) : yr <= 2019 ? rng.range(2.25, 3.5) : yr <= 2021 ? rng.range(1.1, 2.0) : rng.range(3.5, 4.75);
      var b = U.ustBuckets.filter(function (x) { return x.term === term; })[0];
      issueTreasury(M, E, b, iss, Math.round(cpn * 8) / 800);
    });
    // Corporates.
    U.corpIssuers.forEach(function (iss) {
      var s = M.assets[iss.ticker];
      for (var k = 0; k < iss.bonds; k++) {
        var term = rng.pick([5, 7, 10, 10, 20, 30]);
        var ago = rng.int(0, Math.min(term - 1, 8));
        var issued = Cal.onOrAfter(P.addMonths(day, -ago * 12 - rng.int(0, 11)));
        var mat = Cal.onOrAfter(P.addMonths(issued, term * 12));
        var cpn = Math.round((rng.range(3.2, 5.2) + U.ratingSpread[iss.rating] * 100) * 8) / 800;
        var id = s.id + "-" + Cal.iso(mat) + "-" + pct3(cpn * 100);
        makeBond(M, {
          id: id, name: s.id + " " + pct3(cpn * 100) + " " + String(Cal.parts(mat).y).slice(2), label: Events.nm(s) + " " + term + "-yr notes",
          cls: "corp", issuer: s.id, rating: iss.rating, coupon: cpn, freq: 2, mat: mat, issued: issued, term: term,
          spread0: U.ratingSpread[iss.rating], face: 100
        });
      }
    });
    U.munis.forEach(function (m, i) {
      var term = [10, 15, 20, 25, 8, 12, 18, 30][i % 8];
      var issued = Cal.onOrAfter(P.addMonths(day, -rng.int(6, 60)));
      var mat = Cal.onOrAfter(P.addMonths(issued, term * 12));
      var cpn = rng.chance(0.6) ? 0.05 : 0.04;
      var short = m.issuer.split(" ").map(function (w) { return w[0]; }).join("");
      makeBond(M, {
        id: "MUNI-" + short + "-" + Cal.iso(mat), name: short + " " + pct3(cpn * 100) + " " + String(Cal.parts(mat).y).slice(2),
        label: m.issuer + " " + m.kind, cls: "muni", issuer: m.issuer, rating: m.rating, coupon: cpn, freq: 2, mat: mat, issued: issued, term: term,
        spread0: m.spread, face: 100
      });
    });
  }

  function bondYield(M, E, a, day, sp) {
    var tau = Math.max(1 / 365, (a.mat - day) / 365.25);
    var ust = Econ.yieldAt(E, tau, day) / 100;
    if (a.cls === "ust") return ust;
    if (a.cls === "muni") return 0.72 * ust + a.spread0 * Math.sqrt(E.credit);
    var hy = ["BB", "B", "CCC"].indexOf(a.rating) >= 0;
    var mult = hy ? Math.pow(E.credit, 1.45) : E.credit;
    var iss = M.assets[a.issuer];
    var issuerF = 1;
    if (iss && iss.ma200) issuerF = clamp(Math.exp(-1.2 * Math.log(iss.px / iss.ma200)), 0.55, 3.5);
    return ust + a.spread0 * mult * issuerF;
  }

  function updateBonds(M, E, day) {
    var sp = Econ.spreads(E);
    M.lists.bond.forEach(function (id) {
      var a = M.assets[id];
      a.yld = bondYield(M, E, a, day, sp);
      var m = P.bondMetrics(a.coupon, a.mat, day, a.yld, a.freq);
      a.px = m.clean; a.acc = m.accrued; a.dur = m.modDur; a.cvx = m.convexity;
    });
  }

  // Monthly/quarterly Treasury auctions; retire old issues nobody holds.
  function auctions(M, E, day, isHeld) {
    var U = Universe.get();
    var p = Cal.parts(day);
    var firstBiz = Cal.onOrAfter(Cal.dayNum(p.y, p.m, 1)) === day;
    var out = [];
    if (!firstBiz) return out;
    U.ustBuckets.forEach(function (b) {
      if (b.every === 3 && p.m % 3 !== 2) return;
      var a = issueTreasury(M, E, b, day);
      out.push(a);
    });
    // Keep the list short: the most recent few issues per bucket, plus any held.
    var byTerm = {};
    M.lists.bond.forEach(function (id) {
      var a = M.assets[id];
      if (a.cls !== "ust") return;
      (byTerm[a.term] = byTerm[a.term] || []).push(a);
    });
    Object.keys(byTerm).forEach(function (t) {
      var list = byTerm[t].sort(function (x, y) { return y.issued - x.issued; });
      var keep = +t < 1 ? 4 : 3;
      list.forEach(function (a, i) {
        if (i >= keep && !isHeld(a.id) && !(a.issued < day - 365 * 3 && i < keep + 3)) delist(M, a.id);
      });
    });
    return out;
  }

  function delist(M, id) {
    var a = M.assets[id];
    if (!a) return;
    delete M.assets[id];
    var list = M.lists[a.type];
    var i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
  }

  /* ------------------------------------------------------------------ */
  /* Futures                                                             */
  /* ------------------------------------------------------------------ */
  function contractMonths(cycle, day, n) {
    var p = Cal.parts(day), out = [];
    for (var k = 0; out.length < n && k < 30; k++) {
      var y = p.y + Math.floor((p.m - 1 + k) / 12), m = ((p.m - 1 + k) % 12) + 1;
      if (cycle === "Q" && m % 3 !== 0) continue;
      var exp = Cal.thirdFriday(y, m);
      if (exp < day) continue;
      out.push({ y: y, m: m, exp: exp });
    }
    return out;
  }

  function listFutures(M, E, day) {
    Universe.get().futures.forEach(function (f) {
      contractMonths(f.cycle, day, 2).forEach(function (cm) {
        var id = f.root + Cal.futCode(cm.y, cm.m);
        if (M.assets[id]) return;
        var a = baseAsset(id, "future", f.name + " " + Cal.MONTHS[cm.m - 1] + " " + cm.y, 1);
        a.root = f.root; a.und = f.und; a.mult = f.mult; a.tick = f.tick; a.exp = cm.exp; a.im = f.im; a.mm = f.mm; a.group = f.group; a.cycle = f.cycle;
        a.settle = null;
        M.assets[id] = a;
        M.lists.future.push(id);
        a.px = futuresPrice(M, E, a, day, 0);
        a.prev = a.open = a.hi = a.lo = a.px; a.intra = [a.px];
      });
    });
    M.lists.future.sort(function (x, y) {
      var a = M.assets[x], b = M.assets[y];
      return a.root === b.root ? a.exp - b.exp : 0;
    });
  }

  function underlyingSpot(M, E, und, day) {
    if (und === "UST10" || und === "UST30") {
      var tau = und === "UST10" ? 9 : 22;
      return P.bondMetrics(0.06, day + Math.round(tau * 365.25), day, Econ.yieldAt(E, tau, day) / 100, 2).clean;
    }
    return M.assets[und].px;
  }

  function futuresPrice(M, E, a, day, tick) {
    var S = underlyingSpot(M, E, a.und, day);
    var T = Math.max(0, (a.exp - day) + (16 / 24 - Cal.tickDayFrac(tick))) / 365;
    var r = Econ.yieldAt(E, Math.max(T, 0.02), day) / 100;
    var u = M.assets[a.und];
    var carry;
    if (a.und === "UST10" || a.und === "UST30") carry = 0;
    else if (u.type === "index") carry = r - (u.q || 0.013);
    else if (u.type === "crypto") carry = r + 0.05;
    else if (u.group === "metals" && u.kappa === 0) carry = r + 0.002;
    else carry = u.carry;
    var raw = S * Math.exp(carry * T);
    return Math.round(raw / a.tick) * a.tick;
  }

  /* ------------------------------------------------------------------ */
  /* Scheduling helpers                                                  */
  /* ------------------------------------------------------------------ */
  function earnDayForQuarter(s, y, qm) {
    var qEnd = Cal.dayNum(y, qm + 1, 1) - 1;
    var d = qEnd + s.earnWeek * 7;
    d += (s.earnWd - Cal.weekday(d) + 7) % 7;
    return Cal.onOrAfter(d);
  }
  function schedule(s, day) {
    var p = Cal.parts(day);
    s.nextEarn = null;
    for (var k = -1; k < 6 && s.nextEarn == null; k++) {
      var y = p.y + Math.floor((p.m - 1 + 3 * k) / 12);
      var mm = ((p.m - 1 + 3 * k) % 12 + 12) % 12 + 1;
      var qm = Math.ceil(mm / 3) * 3; // quarter-end month for this step
      var ed = earnDayForQuarter(s, y, qm);
      if (ed >= day) s.nextEarn = ed;
    }
    s.nextEx = null;
    if (s.dps > 0) {
      for (var j = 0; j < 5 && s.nextEx == null; j++) {
        var yy = p.y + Math.floor((p.m - 1 + j) / 12), m = ((p.m - 1 + j) % 12) + 1;
        if ((m - 1) % 3 !== s.divMonth) continue;
        var ex = Cal.onOrAfter(Cal.dayNum(yy, m, s.divDay));
        if (ex >= day) s.nextEx = ex;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* News & shocks                                                       */
  /* ------------------------------------------------------------------ */
  function addNews(M, day, tick, item) {
    item.id = ++M.newsSeq;
    item.day = day; item.tick = tick;
    M.news.unshift(item);
    if (M.news.length > NEWS_MAX) M.news.length = NEWS_MAX;
    return item;
  }

  // Apply an instant shock (log returns) and record the realized moves.
  function applyShock(M, E, sh) {
    if (!sh) return;
    var eq = sh.eq || 0;
    var sec = sh.sectors || {}, ind = sh.industries || {}, st = sh.stocks || {};
    if (eq || Object.keys(sec).length || Object.keys(ind).length || Object.keys(st).length) {
      M.lists.stock.forEach(function (id) {
        var a = M.assets[id];
        var r = a.beta * eq + (sec[a.sector] || 0) + (ind[a.industry] || 0) + (st[id] || 0);
        if (r) move(a, r);
      });
    }
    if (sh.crypto || sh.coins) {
      M.lists.crypto.forEach(function (id) {
        var a = M.assets[id];
        var r = (a.stable ? 0 : a.beta * (sh.crypto || 0)) + ((sh.coins || {})[id] || 0);
        if (r) move(a, r);
      });
    }
    if (sh.commodities) for (var c in sh.commodities) if (M.assets[c]) move(M.assets[c], sh.commodities[c]);
    if (sh.gold) move(M.assets.GOLD, sh.gold);
    if (sh.usd) {
      M.f.dollar += sh.usd;
      M.lists.fx.forEach(function (id) { var a = M.assets[id]; move(a, a.dollarBeta * sh.usd); });
    }
    if (sh.vol) M.f.v = clamp(M.f.v * sh.vol, 0.07, 1.2);
    if (sh.cvol) M.f.cv = clamp(M.f.cv * sh.cvol, 0.2, 2);
    if (sh.y) E.lvl += sh.y / 100;
    if (sh.front) E.front += sh.front / 100;
    if (sh.credit) E.credit = clamp(E.credit + sh.credit, 0.6, 4);
  }
  function move(a, r) {
    a.px = Math.max(1e-9, a.px * Math.exp(r));
    if (a.px > a.hi) a.hi = a.px;
    if (a.px < a.lo) a.lo = a.px;
  }

  function regimeScore(E) { return { boom: 0.5, expansion: 0.3, recovery: 0.5, slowdown: -0.5, recession: -1 }[E.regime]; }

  function randomEvents(W, frac) {
    var M = W.M, E = W.E, rng = W.rng;
    var R = Events.RATES;
    var nStocks = M.lists.stock.length;
    var ctx = {
      bigTech: function (r, not) { var top = M.lists.stock.slice(0, 8).filter(function (x) { return x !== not; }); return M.assets[r.pick(top)]; },
      randomCoin: function (r, noStable) { var l = M.lists.crypto.filter(function (id) { return !noStable || !M.assets[id].stable; }); return M.assets[r.pick(l)]; },
      assets: M.assets
    };
    var out = [];
    var n = poisson(rng, nStocks * R.companyPerStockYear / 252 * frac);
    for (var i = 0; i < n; i++) {
      var s = M.assets[rng.pick(M.lists.stock)];
      var ev = Events.company(ctx, rng, s);
      applyShock(M, E, ev.shock);
      if (ev.borrowUp) { s.borrow = Math.min(0.9, Math.max(s.borrow, 0.05) * rng.range(2, 4)); s.shortInt = Math.min(0.45, s.shortInt + 0.05); }
      if (ev.squeeze) s.shortInt *= 0.6;
      out.push(ev);
    }
    if (rng.next() < R.sector * frac) { var se = Events.sector(ctx, rng); applyShock(M, E, se.shock); out.push(se); }
    if (rng.next() < R.commodity * frac) { var ce = Events.commodity(ctx, rng, Cal.parts(W.day).m); applyShock(M, E, ce.shock); out.push(ce); }
    if (rng.next() < R.market * frac * (E.regime === "recession" ? 1.3 : 1)) {
      var me = Events.market(ctx, rng, regimeScore(E));
      if (me.shock.eq < -0.05 && M.f.crashAge < 60) me = null; // no back-to-back crashes
      if (me) { applyShock(M, E, me.shock); out.push(me); if (me.shock.eq < -0.05) M.f.crashAge = 0; }
    }
    return out;
  }

  function cryptoEvents(W, days) {
    var M = W.M, rng = W.rng, out = [];
    var ctx = {
      bigTech: function (r) { return M.assets[r.pick(M.lists.stock.slice(0, 8))]; },
      randomCoin: function (r, noStable) { var l = M.lists.crypto.filter(function (id) { return !noStable || !M.assets[id].stable; }); return M.assets[r.pick(l)]; },
      assets: M.assets
    };
    var n = poisson(rng, Events.RATES.crypto * days * 252 / 365);
    for (var i = 0; i < n; i++) { var ev = Events.crypto(ctx, rng); applyShock(M, W.E, ev.shock); out.push(ev); }
    return out;
  }

  function poisson(rng, lam) {
    if (lam <= 0) return 0;
    if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * rng.gauss()));
    var L = Math.exp(-lam), k = 0, p = 1;
    do { k++; p *= rng.next(); } while (p > L);
    return k - 1;
  }

  /* ------------------------------------------------------------------ */
  /* Dynamics                                                            */
  /* ------------------------------------------------------------------ */
  // One slice of the market. eqFrac: share of a trading day's equity
  // variance · cDays: calendar days of crypto time · xFrac: share of a
  // day for FX/commodities · dtDay: trading-day fraction for drifts/fees.
  function evolve(W, eqFrac, cDays, xFrac, dtDay) {
    var M = W.M, E = W.E, rng = W.rng, f = M.f;
    var R = Econ.REGIMES[E.regime];
    var rf = Econ.effective(E) / 100;
    var dt = eqFrac / 252;

    // Rates first: the curve moves, and rate-sensitive sectors react.
    var y10b = f.y10, y2b = f.y2;
    Econ.noise(E, rng, eqFrac);
    f.y10 = Econ.yieldAt(E, 10, W.day);
    f.y2 = Econ.yieldAt(E, 2, W.day);
    var dy10 = f.y10 - y10b, dy2 = f.y2 - y2b;

    // Equity volatility (log-OU) and the market shock, correlated −0.7.
    var vBar = R.vol * (1 + 0.25 * Math.max(0, E.drawdown - 0.1));
    var zv = rng.gauss(), zi = rng.gauss();
    var zm = -0.65 * zv + 0.76 * zi;
    if (dt > 0) f.v = clamp(Math.exp(Math.log(f.v) + 6 * (Math.log(vBar) - Math.log(f.v)) * dt + 0.8 * Math.sqrt(dt) * zv), 0.07, Math.max(0.35, R.vol * 2.2));
    E.mktVol = f.v;
    var eM = f.v * Math.sqrt(dt) * zm;
    // Valuation pulls expected returns: cheap markets (P/E below the
    // rate-implied fair multiple) earn more, expensive ones less.
    var val = Math.log(M.pe.mkt / M.pe.fair);
    var muM = rf + Econ.equityDrift(E) - (val < 0 ? 0.5 : 0.3) * val;

    // Oil moves first so sectors can use it.
    var oil = M.assets.WTI, oilBefore = oil.px;
    commodities(M, E, rng, xFrac, eM, Cal.parts(W.day).m);
    var oilRet = Math.log(oil.px / oilBefore);
    f.oilAcc += oilRet;

    // Sector shocks.
    var secRet = {};
    Universe.SECTORS.forEach(function (s) {
      var tilt = (s.cyc - 1) * R.cyc + M.alphaSector[s.id];
      secRet[s.id] = 0.85 * s.sigS * Math.sqrt(dt) * rng.gauss() + (tilt - 0.5 * s.sigS * s.sigS) * dt + s.oil * oilRet - s.rateDur * dy10 / 100;
    });

    // Stocks.
    var volScale = 0.7 + 0.3 * f.v / 0.15;
    var list = M.lists.stock;
    for (var i = 0; i < list.length; i++) {
      var a = M.assets[list[i]];
      var sig = a.sig * volScale;
      var val = 0;
      if (a.eps > 0) val = clamp(-0.15 * Math.log(a.px / a.eps / a.peFair), -0.3, 0.3);
      var mu = rf + a.beta * (muM - rf) + a.alpha + val;
      var tot2 = a.beta * a.beta * f.v * f.v + sig * sig;
      var r = a.beta * eM + secRet[a.sector] + (mu - 0.5 * tot2) * dt + sig * Math.sqrt(dt) * rng.fat();
      var old = a.px;
      a.px = Math.max(0.01, a.px * Math.exp(r));
      if (a.px > a.hi) a.hi = a.px;
      if (a.px < a.lo) a.lo = a.px;
      if (dtDay > 0) a.vol += a.adv * dtDay * (0.6 + 0.8 * rng.next()) * (1 + 6 * Math.abs(Math.log(a.px / old)) / (sig * Math.sqrt(dt) + 1e-9) * 0.15);
    }

    crypto(M, E, rng, cDays, zm, dtDay);
    fx(M, E, rng, xFrac, eM, dy2, oilRet);
    return { dy10: dy10, dy2: dy2, dt: dt };
  }

  function commodities(M, E, rng, xFrac, eM, month) {
    var dt = xFrac / 252;
    if (dt <= 0) return;
    var sq = Math.sqrt(dt);
    var zAg = rng.gauss();
    var g = M.assets.GOLD, goldR = 0;
    M.lists.commodity.forEach(function (id) {
      var a = M.assets[id];
      var z = rng.gauss();
      var r;
      if (id === "GOLD") {
        r = (a.drift - 0.5 * a.sig * a.sig) * dt + a.sig * sq * z - 0.12 * eM;
        goldR = r;
      } else if (id === "SILVER") {
        r = 1.25 * goldR + 0.17 * sq * z - 0.5 * 0.17 * 0.17 * dt + 0.2 * eM;
      } else {
        var mean = a.mean;
        if (id === "NATGAS") mean *= 1 + 0.22 * Math.cos(2 * Math.PI * (month - 1) / 12);
        var zz = a.group === "ags" ? 0.6 * zAg + 0.8 * z : z;
        r = a.kappa * (Math.log(mean) - Math.log(a.px)) * dt + a.sig * sq * zz - 0.5 * a.sig * a.sig * dt;
        if (id === "COPPER") r += 0.5 * eM;
        if (id === "WTI") r += 0.3 * eM;
      }
      a.px = Math.max(0.01, a.px * Math.exp(r));
      if (a.px > a.hi) a.hi = a.px;
      if (a.px < a.lo) a.lo = a.px;
      a.carry += 1.5 * (a.carry0 - a.carry) * dt + 0.08 * sq * rng.gauss();
    });
  }

  var C_REGIMES = { bull: { mu: 0.7, vol: 0.5, name: "Bull run" }, neutral: { mu: 0.1, vol: 0.45, name: "Range-bound" }, winter: { mu: -0.35, vol: 0.56, name: "Crypto winter" } };
  var C_TRANS = { neutral: { bull: 0.055, winter: 0.03 }, bull: { neutral: 0.07, winter: 0.04 }, winter: { neutral: 0.08 } };

  function crypto(M, E, rng, cDays, zm, dtDay) {
    if (cDays <= 0) return;
    var f = M.f;
    var dt = cDays / 365, sq = Math.sqrt(dt);
    var CR = C_REGIMES[f.cRegime];
    f.cv = clamp(Math.exp(Math.log(f.cv) + 3 * (Math.log(CR.vol) - Math.log(f.cv)) * dt + 0.9 * sq * rng.gauss()), 0.2, 2);
    var zc = 0.35 * zm + 0.937 * rng.gauss();
    var eC = f.cv * sq * zc;
    var rf = Econ.effective(E) / 100;
    M.lists.crypto.forEach(function (id) {
      var a = M.assets[id];
      if (a.stable) {
        a.px = 1 + (a.px - 1) * Math.exp(-40 * dt) + 0.0004 * sq * rng.gauss();
      } else {
        var mu = rf + a.beta * (CR.mu - rf);
        var r = a.beta * eC + (mu - 0.5 * (a.beta * a.beta * f.cv * f.cv + a.idio * a.idio)) * dt + a.idio * sq * rng.fat();
        a.px = Math.max(1e-9, a.px * Math.exp(r));
      }
      if (a.px > a.hi) a.hi = a.px;
      if (a.px < a.lo) a.lo = a.px;
      a.vol += a.adv * cDays * (0.5 + rng.next());
    });
  }

  function fx(M, E, rng, xFrac, eM, dy2, oilRet) {
    var dt = xFrac / 252;
    if (dt <= 0) return;
    var sq = Math.sqrt(dt);
    var dD = 0.055 * sq * rng.gauss() + 0.02 * dy2;
    M.f.dollar += dD;
    M.lists.fx.forEach(function (id) {
      var a = M.assets[id];
      var r = a.dollarBeta * dD + a.idio * sq * rng.gauss() + (a.haven ? 0.25 * a.haven * eM : 0) + (a.risk ? 0.3 * a.risk * eM : 0) + (a.oil ? a.oil * oilRet : 0);
      a.px *= Math.exp(r);
      if (a.px > a.hi) a.hi = a.px;
      if (a.px < a.lo) a.lo = a.px;
    });
  }

  // Everything computed from other prices: indices, ETFs, bonds, futures,
  // perps and the volatility index. dtDay = trading-day fraction elapsed
  // (for fees and carry); dy10 = change in the 10-yr yield (percent).
  function derived(M, E, day, tick, dtDay, rates) {
    updateIndices(M);
    var rf = Econ.effective(E) / 100;
    var dt = dtDay / 252;
    var sp = Econ.spreads(E);
    rates = rates || {};

    M.lists.basket.forEach(function (id) {
      var a = M.assets[id];
      if (!a.last) a.last = {};
      var r = 0;
      for (var k in a.w) { var c = M.assets[k]; if (a.last[k]) r += a.w[k] * Math.log(c.px / a.last[k]); a.last[k] = c.px; }
      a.px *= Math.exp(r);
    });

    M.lists.etf.forEach(function (id) {
      var a = M.assets[id];
      var feeF = 1 - a.er * dt;
      if (a.kind === "index") {
        a.tf *= feeF;
        a.nav = M.assets[a.track].px * a.scale * a.tf;
      } else if (a.kind === "lev") {
        var u = a.track.indexOf("ETF:") === 0 ? M.assets[a.track.slice(4)] : M.assets[a.track];
        var uPx = u.type === "etf" ? u.nav : u.px;
        if (a.base == null) { a.base = uPx; a.navBase = a.nav; }
        var borrowCost = (a.lev > 1 ? (a.lev - 1) * rf : a.lev < 0 ? 0 : 0);
        a.navBase *= 1 - (a.er + borrowCost) * dt;
        a.nav = Math.max(0.01, a.navBase * (1 + a.lev * (uPx / a.base - 1)));
      } else if (a.kind === "bond") {
        var y = bondFundYield(M, E, a, day, sp);
        if (a.lastY != null) {
          var D = a.tenor < 1 ? a.tenor : a.tenor * 0.92;
          var dy = y - a.lastY;
          a.nav *= Math.exp(-D * dy + 0.5 * D * D * dy * dy);
          if (a.credit === "tips") a.nav *= 1 + (E.infl / 100) * dt;
          a.acc += a.nav * Math.max(0, y - a.er) * dt;
        }
        a.lastY = y;
        a.yld = y;
      } else if (a.kind === "commodity") {
        var c = M.assets[a.track];
        if (a.lastU != null) {
          var roll = a.spot ? 0 : (c.carry != null ? c.carry : 0.02);
          a.nav *= Math.exp(Math.log(c.px / a.lastU) - roll * dt) * feeF;
        }
        a.lastU = c.px;
      } else if (a.kind === "crypto") {
        a.tf *= feeF;
        a.nav = M.assets[a.track].px * a.scale * a.tf;
      } else if (a.kind === "vol") {
        var s = M.assets.SVX;
        if (a.lastU != null) {
          // Monthly roll yield: about −8% with the index at 12 (steep contango),
          // zero near 32, positive in backwardation during panics.
          var roll = clamp(-0.08 + 0.0025 * (s.px - 12) * 1.6, -0.1, 0.08);
          a.nav *= Math.exp(0.55 * Math.log(s.px / a.lastU) + roll * 12 * dt) * feeF;
        }
        a.lastU = s.px;
      }
      a.px = a.nav + a.acc;
      if (a.px > a.hi) a.hi = a.px;
      if (a.px < a.lo) a.lo = a.px;
      if (dtDay > 0) a.vol += a.adv * dtDay;
    });

    // Volatility index: 30-day expected vol of the US 500 plus a premium.
    var R = Econ.REGIMES[E.regime];
    var T = 30 / 365, k = 5;
    var vl = R.vol, vn = M.f.v * 1.02;
    var iv = Math.sqrt(vl * vl + (vn * vn - vl * vl) * (1 - Math.exp(-k * T)) / (k * T)) * 1.12;
    var svx = M.assets.SVX;
    svx.px = Math.max(8, iv * 100);
    if (svx.px > svx.hi) svx.hi = svx.px;
    if (svx.px < svx.lo) svx.lo = svx.px;

    updateBonds(M, E, day);

    M.lists.future.forEach(function (id) {
      var a = M.assets[id];
      a.px = futuresPrice(M, E, a, day, tick);
      if (a.px > a.hi) a.hi = a.px;
      if (a.px < a.lo) a.lo = a.px;
      if (dtDay > 0) a.vol += 2000 * dtDay;
    });
    M.lists.perp.forEach(function (id) {
      var a = M.assets[id];
      var u = M.assets[a.und];
      a.px = u.px * (1 + a.funding * 3);
      if (a.px > a.hi) a.hi = a.px;
      if (a.px < a.lo) a.lo = a.px;
    });
  }

  function bondFundYield(M, E, a, day, sp) {
    var t = a.tenor;
    var ust = Econ.yieldAt(E, t, day) / 100;
    switch (a.credit) {
      case "ig": return ust + sp.ig / 100;
      case "hy": return ust + sp.hy / 100;
      case "agg": return ust + 0.3 * sp.ig / 100;
      case "muni": return 0.72 * ust + 0.003 * Math.sqrt(E.credit);
      case "tips": return Econ.realYieldAt(E, t, day) / 100;
      default: return ust;
    }
  }

  /* ------------------------------------------------------------------ */
  /* The trading day                                                     */
  /* ------------------------------------------------------------------ */
  // One 15-minute session step (or the whole session when frac = 1).
  function session(W, frac) {
    var M = W.M, E = W.E;
    var news = [];
    // Scheduled intraday releases (PMI 10:00, FOMC 2:00).
    var startTick = W.tick, endTick = frac >= 1 ? TPD : W.tick + 1;
    Econ.scheduledOn(W.day).forEach(function (k) {
      var t = Econ.RELEASE_INFO[k].tick;
      if (t >= 0 && t > startTick && t <= endTick) {
        var ev = Econ.release(E, W.rng, k, W.day);
        applyShock(M, E, ev.shock);
        news.push(addNews(M, W.day, t, { kind: k === "fomc" ? "fed" : "macro", title: ev.headline, syms: ["US500"], release: ev }));
      }
    });
    var res = evolve(W, 0.8 * frac, 0.27 * frac, 0.3 * frac, frac);
    randomEvents(W, frac).forEach(function (ev) { news.push(addNews(M, W.day, endTick, ev)); });
    derived(M, E, W.day, endTick, frac, res);
    M.f.crashAge += frac;
    return news;
  }

  // From the close of `prevDay` to the open of `day`: economy, releases,
  // earnings, dividends, splits and the overnight gap.
  function overnight(W, prevDay, day) {
    var M = W.M, E = W.E, rng = W.rng;
    var cal = day - prevDay;
    var news = [];
    for (var id0 in M.assets) { var a0 = M.assets[id0]; a0.prev = a0.px; a0.vol = 0; }
    Econ.advance(E, rng, day, cal, M.f.oilAcc);
    M.f.oilAcc = 0;
    if (E.regimeChanged) {
      E.regimeChanged = false;
      news.push(addNews(M, day, -1, { kind: "macro", title: "Economists say the economy has entered a " + Econ.REGIMES[E.regime].name.toLowerCase() + " phase", syms: [], regime: E.regime }));
    }
    // Crypto regime.
    M.f.cAge += cal;
    if (M.f.cAge > 30) {
      var tr = C_TRANS[M.f.cRegime];
      for (var to in tr) if (rng.next() < 1 - Math.pow(1 - tr[to], cal / 30.4)) {
        M.f.cRegime = to; M.f.cAge = 0;
        news.push(addNews(M, day, -1, { kind: "crypto", title: to === "bull" ? "Crypto rally broadens as coins break out to new highs" : to === "winter" ? "Crypto slump deepens; traders call it a new winter" : "Crypto prices settle into a range", syms: ["ORB"] }));
        break;
      }
    }
    // Stock-specific drifts drift (OU, half-life ~4 months), sector tilts.
    var dtd = 1 / 252;
    M.lists.stock.forEach(function (id) {
      var a = M.assets[id];
      a.alpha += -a.alpha / 0.5 * dtd + 0.14 * Math.sqrt(dtd) * rng.gauss();
    });
    Object.keys(M.alphaSector).forEach(function (k) { M.alphaSector[k] += -M.alphaSector[k] / 0.7 * dtd + 0.06 * Math.sqrt(dtd) * rng.gauss(); });
    // Foreign policy rates drift slowly.
    Object.keys(M.fxRates).forEach(function (c) { M.fxRates[c] = Math.max(-0.005, M.fxRates[c] + 0.004 * Math.sqrt(cal / 365) * rng.gauss()); });

    // Pre-market data releases.
    Econ.scheduledOn(day).forEach(function (k) {
      if (Econ.RELEASE_INFO[k].tick >= 0) return;
      var ev = Econ.release(E, rng, k, day);
      applyShock(M, E, ev.shock);
      news.push(addNews(M, day, -1, { kind: "macro", title: ev.headline, syms: ["US500"], release: ev }));
    });

    // The gap itself.
    var extra = cal - 1;
    var res = evolve(W, 0.2 + 0.04 * extra, cal - 0.27, 0.7 + 0.03 * extra, 0);
    cryptoEvents(W, cal).forEach(function (ev) { news.push(addNews(M, day, -1, ev)); });
    randomEvents(W, 0.35).forEach(function (ev) { news.push(addNews(M, day, -1, ev)); });

    // Earnings: after-close reports from the prior day, pre-open today.
    M.lists.stock.forEach(function (id) {
      var s = M.assets[id];
      if (s.nextEarn == null) return;
      var due = (s.earnAmc && s.nextEarn === prevDay) || (!s.earnAmc && s.nextEarn === day) || (s.nextEarn < day && s.nextEarn !== prevDay);
      if (!due) return;
      news.push(addNews(M, s.earnAmc ? prevDay : day, s.earnAmc ? TPD : -1, earnings(M, E, rng, s, day)));
      schedule(s, day + 1);
    });

    // Corporate actions effective at today's open.
    M.corp = [];
    M.lists.stock.forEach(function (id) {
      var s = M.assets[id];
      if (s.nextEx === day && s.dps > 0) {
        var amt = Math.round(s.dps / 4 * 10000) / 10000;
        s.px = Math.max(0.01, s.px - amt);
        M.corp.push({ type: "div", id: id, amount: amt });
        M.lists.index.forEach(function (ixId) {
          var ix = M.assets[ixId];
          if (ix.members.indexOf(id) < 0) return;
          if (ix.weight === "cap") ix.divPts += amt * s.shares / ix.divisor;
          else if (ix.weight === "price") ix.divPts += amt / ix.divisor;
          else ix.divPts += ix.px * amt / (s.px + amt) / ix.members.length;
        });
        schedule(s, day + 1);
      }
      // Splits keep share prices in a tradable range.
      if (s.px > 700 && rng.next() < (s.px > 1500 ? 0.03 : 0.004)) {
        var n = [2, 3, 4, 5, 10, 20].filter(function (k) { return s.px / k >= 70 && s.px / k <= 350; })[0] || 2;
        split(M, s, n);
        M.corp.push({ type: "split", id: id, ratio: n });
        news.push(addNews(M, day, -1, { kind: "corporate", title: Events.nm(s) + " shares begin trading after a " + n + "-for-1 stock split", syms: [id] }));
      } else if (s.px < 1.5 && rng.next() < 0.05) {
        split(M, s, 0.1);
        M.corp.push({ type: "split", id: id, ratio: 0.1 });
        news.push(addNews(M, day, -1, { kind: "corporate", title: Events.nm(s) + " completes a 1-for-10 reverse split to keep its listing", syms: [id] }));
      }
    });
    // Fund distributions: bond funds monthly, equity funds quarterly.
    var p = Cal.parts(day);
    var firstBiz = Cal.onOrAfter(Cal.dayNum(p.y, p.m, 1)) === day;
    var qDist = p.m % 3 === 0 && prevDay < Cal.thirdFriday(p.y, p.m) + 3 && day >= Cal.thirdFriday(p.y, p.m) + 3;
    M.lists.etf.forEach(function (id) {
      var a = M.assets[id];
      if (a.kind === "index") {
        var ix = M.assets[a.track];
        a.acc += ix.divPts * a.scale * a.tf;
      }
    });
    M.lists.index.forEach(function (id) { M.assets[id].divPts = 0; });
    M.lists.etf.forEach(function (id) {
      var a = M.assets[id];
      if (a.acc <= 0) return;
      if ((a.kind === "bond" && firstBiz) || (a.kind === "index" && qDist)) {
        var amt = Math.round(a.acc * 10000) / 10000;
        a.acc = 0;
        if (amt > 0) M.corp.push({ type: "div", id: id, amount: amt, fund: true });
      }
    });

    // Open the new day.
    derived(M, E, day, 0, 0, res);
    M.lists.stock.forEach(function (id) { var s = M.assets[id]; s.q = s.dps / s.px; });
    return news;
  }

  function split(M, s, n) {
    s.px /= n; s.prev /= n; s.hi /= n; s.lo /= n; s.open /= n;
    s.shares *= n; s.eps /= n; s.dps /= n; s.adv *= n;
    var b = s.bars;
    for (var i = 0; i < b.c.length; i++) { b.o[i] /= n; b.h[i] /= n; b.l[i] /= n; b.c[i] /= n; b.v[i] *= n; }
    s.intra = s.intra.map(function (x) { return x / n; });
    s.intraHist = s.intraHist.map(function (d) { return { d: d.d, p: d.p.map(function (x) { return x / n; }) }; });
    if (s.ma200) s.ma200 /= n;
    if (s.hi52) { s.hi52 /= n; s.lo52 /= n; }
    // The price-weighted Average changes its divisor so its level is unchanged.
    M.lists.index.forEach(function (id) {
      var ix = M.assets[id];
      if (ix.weight !== "price" || ix.members.indexOf(s.id) < 0) return;
      var sumNew = 0;
      ix.members.forEach(function (m) { sumNew += M.assets[m].px; });
      ix.divisor = sumNew / ix.px;
    });
    M.lists.index.forEach(function (id) {
      var ix = M.assets[id];
      if (ix.weight === "equal" && ix.lastPx) ix.lastPx = memberPrices(M, ix);
    });
  }

  function earnings(M, E, rng, s, day) {
    var sig = s.sig;
    // Quarterly EPS consistent with the trailing figure growing at the
    // company's growth rate, bent by the business cycle.
    var gEff = s.growth + SEC_BY_ID[s.sector].cyc * (E.gdp - 2.2) * 0.04;
    var q;
    if (s.eps > 0) q = s.eps / 4 * (1 + gEff);
    else q = s.eps / 4 * (0.9 - SEC_BY_ID[s.sector].cyc * (E.gdp - 2.2) * 0.04);
    var est = q * (1 - 0.02 * Math.sign(q)) + Math.abs(q) * 0.015 * rng.gauss();
    var actual = q * (1 + 0.035 * rng.gauss() * (1 + 2 * sig)) + (s.eps <= 0 ? Math.abs(q) * 0.1 * rng.gauss() : 0);
    var surprise = (actual - est) / Math.max(Math.abs(est), 0.01);
    // Companies usually beat by ~2%; the stock moves on the surprise beyond that.
    var r = clamp(1.0 * (surprise - 0.018), -0.2, 0.2) + (0.02 + 0.12 * sig) * rng.gauss();
    var prevEps = s.eps;
    s.eps = 0.75 * s.eps + actual;
    s.lastEarn = { day: day, est: est, actual: actual, surprise: surprise, move: r };
    move(s, r);
    var beat = actual >= est;
    var title = Events.nm(s) + (beat ? " beats" : " misses") + " estimates: EPS $" + actual.toFixed(2) + " vs $" + est.toFixed(2) + " expected";
    // Annual dividend review at the fiscal Q4 report.
    var p = Cal.parts(day);
    if (p.m <= 3 && s.dps > 0) {
      if (s.eps <= 0) { s.dps = 0; title += "; dividend suspended"; }
      else if (s.dps / s.eps > 1.1) { s.dps *= 0.5; title += "; dividend cut in half"; }
      else if (s.eps > prevEps) { var g = clamp(0.03 + 0.5 * (s.eps / prevEps - 1), 0.01, 0.2); s.dps *= 1 + g; title += "; dividend raised " + Math.round(g * 100) + "%"; }
    } else if (s.dps === 0 && s.eps > 0 && p.m <= 3 && rng.chance(0.08)) {
      s.dps = s.eps * 0.2; title += "; initiates a dividend";
    }
    return { kind: "earnings", title: title, syms: [s.id], earn: s.lastEarn };
  }

  // End of the session: record bars, per-asset stats and reset intraday data.
  function close(W) {
    var M = W.M, E = W.E, day = W.day;
    M.days.push(day);
    var trim = M.days.length > MAX_BARS ? M.days.length - TRIM_TO : 0;
    if (trim) M.days.splice(0, trim);
    var maxLen = M.days.length;
    Object.keys(M.assets).forEach(function (id) {
      var a = M.assets[id];
      var b = a.bars;
      b.o.push(a.open); b.h.push(Math.max(a.hi, a.px, a.open)); b.l.push(Math.min(a.lo, a.px, a.open)); b.c.push(a.px); b.v.push(Math.round(a.vol));
      if (b.c.length > maxLen) { var k = b.c.length - maxLen; b.o.splice(0, k); b.h.splice(0, k); b.l.splice(0, k); b.c.splice(0, k); b.v.splice(0, k); }
      var c = b.c, n = c.length;
      var lo = Math.max(0, n - 252), hi52 = -Infinity, lo52 = Infinity;
      for (var i = lo; i < n; i++) { if (b.h[i] > hi52) hi52 = b.h[i]; if (b.l[i] < lo52) lo52 = b.l[i]; }
      a.hi52 = hi52; a.lo52 = lo52;
      if (a.type === "stock") {
        var s = 0, m = Math.min(200, n);
        for (var j = n - m; j < n; j++) s += c[j];
        a.ma200 = s / m;
      }
      a.intraHist.push({ d: day, p: a.intra });
      if (a.intraHist.length > 5) a.intraHist.shift();
      a.settle = a.px;
    });
    // Market P/E versus a fair multiple that falls as real yields rise.
    var capSum = 0, earnSum = 0;
    M.assets.US500.members.forEach(function (id) { var s = M.assets[id]; capSum += s.px * s.shares; earnSum += Math.max(0, s.eps) * s.shares; });
    M.pe.mkt = capSum / Math.max(1, earnSum);
    var y10 = Econ.yieldAt(E, 10, day) / 100;
    M.pe.fair = 22 * (0.045 + 0.04) / (Math.max(0.005, y10) + 0.04);
    var rateAdj = M.pe.fair / 22;
    M.lists.stock.forEach(function (id) { var s = M.assets[id]; s.peFair = SEC_BY_ID[s.sector].pe * rateAdj * 1.05; });
    // Index dividend yield (for options and futures).
    M.lists.index.forEach(function (id) {
      var ix = M.assets[id];
      if (!ix.members.length) return;
      var d = 0, cp = 0;
      ix.members.forEach(function (m) { var s = M.assets[m]; d += s.dps * s.shares; cp += s.px * s.shares; });
      ix.q = d / Math.max(1, cp);
    });
    // Drawdown of the US 500 from its 1-year high feeds the economy.
    var us = M.assets.US500;
    E.drawdown = Math.max(0, 1 - us.px / us.hi52);
    // Perp funding follows momentum: longs pay when the market is hot.
    M.lists.perp.forEach(function (id) {
      var a = M.assets[id];
      var c = M.assets[a.und].bars.c, n = c.length;
      var mom = n > 7 ? Math.log(c[n - 1] / c[n - 8]) : 0;
      a.funding = clamp(0.0001 + 0.002 * mom + 0.00005 * W.rng.gauss(), -0.0015, 0.003);
    });
    Econ.record(E, day);
  }

  // After the broker has settled expiries and maturities for the day.
  function afterClose(W, isHeld, nextDay) {
    var M = W.M, E = W.E, day = W.day;
    var news = [];
    M.lists.future.slice().forEach(function (id) { if (M.assets[id].exp <= day) delist(M, id); });
    listFutures(M, E, nextDay);
    M.lists.bond.slice().forEach(function (id) { if (M.assets[id].mat <= nextDay) delist(M, id); });
    auctions(M, E, nextDay, isHeld).forEach(function (a) {
      if (a.term >= 2) news.push(addNews(M, nextDay, -1, { kind: "bonds", title: "Treasury auctions new " + a.label.toLowerCase() + " at a " + (a.coupon * 100).toFixed(3) + "% coupon", syms: [a.id] }));
    });
    // Corporate bonds that matured get refinanced with a new 10-year issue.
    var U = Universe.get();
    U.corpIssuers.forEach(function (iss) {
      var have = M.lists.bond.filter(function (id) { return M.assets[id].issuer === iss.ticker; }).length;
      if (have >= 1) return;
      var s = M.assets[iss.ticker];
      var mat = Cal.onOrAfter(P.addMonths(nextDay, 120));
      var y = Econ.yieldAt(E, 10, nextDay) / 100 + U.ratingSpread[iss.rating] * E.credit;
      var cpn = Math.round(y * 800) / 800;
      makeBond(M, { id: s.id + "-" + Cal.iso(mat) + "-" + pct3(cpn * 100), name: s.id + " " + pct3(cpn * 100) + " " + String(Cal.parts(mat).y).slice(2), label: Events.nm(s) + " 10-yr notes", cls: "corp", issuer: s.id, rating: iss.rating, coupon: cpn, freq: 2, mat: mat, issued: nextDay, term: 10, spread0: U.ratingSpread[iss.rating], face: 100 });
    });
    // Quarterly index rebalance after the third Friday of Mar/Jun/Sep/Dec.
    var p = Cal.parts(day);
    if (p.m % 3 === 0 && Cal.thirdFriday(p.y, p.m) === day) {
      var ch = rebalance(M, false);
      var adds = ch.filter(function (c) { return c.add && c.ix.id === "US500"; }).slice(0, 4);
      adds.forEach(function (c) { news.push(addNews(M, day, TPD, { kind: "corporate", title: Events.nm(M.assets[c.id]) + " will join the US 500 Index", syms: [c.id] })); });
    }
    // Leveraged funds reset their exposure at the close.
    M.lists.etf.forEach(function (id) {
      var a = M.assets[id];
      if (a.kind !== "lev") return;
      var u = a.track.indexOf("ETF:") === 0 ? M.assets[a.track.slice(4)] : M.assets[a.track];
      a.base = u.type === "etf" ? u.nav : u.px;
      a.navBase = a.nav;
    });
    return news;
  }

  function openDay(M) {
    Object.keys(M.assets).forEach(function (id) {
      var a = M.assets[id];
      a.open = a.hi = a.lo = a.px;
      a.intra = [a.px];
    });
  }

  function recordTick(M) {
    for (var id in M.assets) M.assets[id].intra.push(M.assets[id].px);
  }

  // Daily simulation without intraday detail (used to build price history
  // before the game starts). Highs and lows come from a Brownian-bridge
  // style estimate around the open–close path.
  function fullDay(W) {
    var M = W.M;
    session(W, 1);
    var rng = W.rng;
    Object.keys(M.assets).forEach(function (id) {
      var a = M.assets[id];
      var hi = Math.max(a.open, a.px), lo = Math.min(a.open, a.px);
      var sig = a.type === "stock" ? a.sig * 0.063 : a.type === "crypto" ? (a.sig || 0.01) * 0.05 : 0.008;
      a.hi = hi * (1 + Math.abs(rng.gauss()) * sig * 0.35);
      a.lo = lo * (1 - Math.abs(rng.gauss()) * sig * 0.35);
      if (a.type === "stock") a.vol = a.adv * (0.6 + 0.8 * rng.next());
    });
  }

  /* ------------------------------------------------------------------ */
  /* Quotes                                                              */
  /* ------------------------------------------------------------------ */
  function quote(M, id) {
    var a = M.assets[id];
    if (!a) return null;
    var px = a.px, half;
    switch (a.type) {
      case "stock": half = Math.max(0.005, px * a.spr * Math.sqrt(M.f.v / 0.15) / 2); break;
      case "etf": half = Math.max(0.005, px * a.spr / 2); break;
      case "crypto": half = px * a.spr / 2; break;
      case "fx": half = a.sprPips * a.pip / 2; break;
      case "future": half = a.tick / 2; break;
      case "perp": half = px * 0.0002; break;
      case "bond": half = a.cls === "ust" ? (a.freq === 0 ? 0.004 : 1 / 64) : a.cls === "corp" ? (["BB", "B", "CCC"].indexOf(a.rating) >= 0 ? 0.375 : 0.2) : 0.3; break;
      default: half = 0;
    }
    var bid = px - half, ask = px + half;
    if (a.type === "stock" || a.type === "etf") { bid = Math.floor(bid * 100) / 100; ask = Math.ceil(ask * 100) / 100; if (ask - bid < 0.01) ask = bid + 0.01; }
    return { bid: Math.max(0, bid), ask: ask, mid: px };
  }

  function tradable(a) {
    return a && !a.hidden && ["stock", "etf", "crypto", "bond", "future", "perp", "fx"].indexOf(a.type) >= 0;
  }

  // Annualized volatility from daily closes.
  function realizedVol(a, n) {
    var c = a.bars.c, len = c.length;
    if (len < 3) return null;
    var k = Math.min(n, len - 1), s = 0, s2 = 0;
    for (var i = len - k; i < len; i++) { var r = Math.log(c[i] / c[i - 1]); s += r; s2 += r * r; }
    var mean = s / k;
    return Math.sqrt(Math.max(0, s2 / k - mean * mean) * 252);
  }

  return {
    create: create, session: session, overnight: overnight, close: close, afterClose: afterClose, openDay: openDay, recordTick: recordTick, fullDay: fullDay,
    quote: quote, tradable: tradable, realizedVol: realizedVol, applyShock: applyShock, addNews: addNews, futuresPrice: futuresPrice,
    bondYield: bondYield, schedule: schedule, delist: delist, C_REGIMES: C_REGIMES, SEC_BY_ID: SEC_BY_ID
  };
});
