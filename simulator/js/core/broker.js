/*
 * The brokerage account: orders, fills, positions, margin and cash.
 *
 * Positions come in three kinds:
 *   sec  stocks, ETFs, crypto (units) and bonds (face value in $)
 *   opt  listed options (contracts; value = qty × multiplier × premium)
 *   ctr  margined contracts: futures (settled to cash daily), spot FX
 *        (lots of 100,000 base currency) and crypto perpetuals (coins)
 *
 * Net liquidation value (NLV) = cash + long market value − short market
 * value ± open P&L on contracts. Cash below zero is a margin loan.
 *
 * Account types:
 *   cash    no borrowing or shorting; options limited to buying, covered
 *           calls and cash-secured puts; no futures/FX/perps.
 *   margin  Reg T: 50% initial / 25% maintenance on stock (higher for
 *           leveraged ETFs and low-priced shares), 150% initial / 30%
 *           maintenance on shorts, strategy-based option margin (spreads,
 *           covered positions and naked formulas), exchange margin on
 *           futures, 50:1 / 20:1 FX, user-chosen leverage on perps.
 *   pm      portfolio margin: each underlying's stock + options are
 *           stress-tested over ±15% (±8% for broad indices) and the
 *           worst loss is the requirement. Needs $100,000 of equity.
 *
 * When equity falls below maintenance the account gets a margin call due
 * at the next day's close; below half of maintenance, or at the deadline,
 * the broker liquidates the positions with the biggest requirements.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./calendar.js"), require("./pricing.js"), require("./economy.js"), require("./market.js"), require("./options.js"));
  } else {
    root.BSX = root.BSX || {};
    root.BSX.Broker = factory(root.BSX.Cal, root.BSX.Pricing, root.BSX.Economy, root.BSX.Market, root.BSX.Options);
  }
})(typeof self !== "undefined" ? self : this, function (Cal, P, Econ, Market, Options) {
  "use strict";

  var LOT = 100000;
  var PM_MIN = 100000;
  var FEES = {
    optContract: 0.65, optReg: 0.02, futContract: 2.25, cryptoSpot: 0.0025, perp: 0.0005,
    secFee: 27.8e-6, taf: 0.000166, tafMax: 8.3, optTaf: 0.00279, bondPer1k: 1
  };
  var LEDGER_MAX = 3000, HIST_MAX = 600;

  function round2(x) { return Math.round(x * 100) / 100; }
  function sign(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }

  function create(type, cash, day) {
    return {
      type: type || "margin",
      cash: cash,
      pos: {},
      orders: [],
      hist: [],
      ledger: [],
      seq: 1,
      stats: { realized: 0, dividends: 0, interestEarned: 0, interestPaid: 0, borrow: 0, fees: 0, funding: 0, swaps: 0, coupons: 0, staking: 0 },
      deposits: cash,
      flowsToday: 0,
      equity: [],
      twr: 1,
      dayStart: cash,
      marginCall: null,
      settings: { drip: false },
      alerts: [],
      events: [],
      startDay: day
    };
  }

  /* ------------------------------------------------------------------ */
  /* Instruments                                                         */
  /* ------------------------------------------------------------------ */
  function kindOf(a) { return a.type === "future" || a.type === "perp" || a.type === "fx" ? "ctr" : "sec"; }

  // Everything the account needs to know about what an order trades.
  function instrument(W, spec) {
    if (spec.c) {
      var c = spec.c;
      return { key: Options.key(c), kind: "opt", c: c, mult: c.mult || 100, und: c.und };
    }
    var a = W.M.assets[spec.sym];
    if (!a) return null;
    return { key: a.id, kind: kindOf(a), sym: a.id, a: a, mult: a.type === "future" ? a.mult : 1 };
  }

  function optQuote(W, c, cache) {
    var k = Options.key(c);
    if (cache && cache[k]) return cache[k];
    var q = Options.price(W, c);
    if (cache && q) cache[k] = q;
    return q;
  }

  function quoteFor(W, inst, cache) {
    if (inst.kind === "opt") { var q = optQuote(W, inst.c, cache); return q ? { bid: q.bid, ask: q.ask, mid: q.mid } : null; }
    return Market.quote(W.M, inst.sym);
  }

  function canTradeNow(W, inst) {
    if (inst.kind === "opt") return W.phase === "open";
    var t = inst.a.type;
    if (t === "stock" || t === "etf" || t === "bond") return W.phase === "open";
    return true; // crypto, perps, FX and futures trade around the clock
  }

  function fxUsd(a, amtQuote) { return a.quote === "USD" ? amtQuote : amtQuote / a.px; }

  /* ------------------------------------------------------------------ */
  /* Valuation                                                           */
  /* ------------------------------------------------------------------ */
  function mark(W, p, cache) {
    if (p.kind === "opt") { var q = optQuote(W, p.c, cache); return q ? q.mid : 0; }
    var a = W.M.assets[p.sym];
    return a ? a.px : (p.last || 0);
  }

  // Contribution of a position to NLV.
  function value(W, p, cache) {
    var m = mark(W, p, cache);
    var a = W.M.assets[p.sym];
    if (p.kind === "opt") return p.qty * p.mult * m;
    if (p.kind === "sec") {
      if (a && a.type === "bond") return p.qty / 100 * (m + a.acc);
      return p.qty * m;
    }
    if (!a) return 0;
    if (a.type === "future") return p.qty * a.mult * (m - p.settle);
    if (a.type === "fx") return fxUsd(a, p.qty * LOT * (m - p.avg));
    return p.qty * (m - p.avg); // perp
  }

  // Unrealized P&L versus average cost (for display).
  function openPnl(W, p, cache) {
    var m = mark(W, p, cache);
    var a = W.M.assets[p.sym];
    if (p.kind === "opt") return p.qty * p.mult * (m - p.avg);
    if (p.kind === "sec") return a && a.type === "bond" ? p.qty / 100 * (m - p.avg) : p.qty * (m - p.avg);
    if (!a) return 0;
    if (a.type === "future") return p.qty * a.mult * (m - p.avg);
    if (a.type === "fx") return fxUsd(a, p.qty * LOT * (m - p.avg));
    return p.qty * (m - p.avg);
  }

  function notional(W, p, cache) {
    var a = W.M.assets[p.sym], m = mark(W, p, cache);
    if (p.kind === "opt") {
      var q = optQuote(W, p.c, cache);
      return q ? Math.abs(q.delta * p.qty * p.mult * q.S) : 0;
    }
    if (!a) return 0;
    if (a.type === "bond") return Math.abs(p.qty / 100 * m);
    if (a.type === "future") return Math.abs(p.qty * a.mult * m);
    if (a.type === "fx") return Math.abs(p.qty * LOT * (a.base === "USD" ? 1 : m));
    return Math.abs(p.qty * m);
  }

  /* ------------------------------------------------------------------ */
  /* Margin                                                              */
  /* ------------------------------------------------------------------ */
  function secRates(W, a, qty, px) {
    if (a.type === "crypto") return [1, 1];
    if (a.type === "bond") {
      var yrs = (a.mat - W.day) / 365.25;
      if (a.cls === "ust") { var r = yrs < 1 ? 0.01 : yrs < 3 ? 0.02 : yrs < 5 ? 0.03 : yrs < 10 ? 0.04 : yrs < 20 ? 0.05 : 0.06; return [r, r]; }
      if (a.cls === "muni") return [0.25, 0.15];
      var hy = ["BB", "B", "CCC"].indexOf(a.rating) >= 0;
      return hy ? [0.5, 0.4] : [0.3, 0.2];
    }
    var lev = a.type === "etf" && a.kind === "lev" ? Math.abs(a.lev) : 1;
    if (qty > 0) {
      if (px < 3) return [1, 1];
      var m = 0.25 * lev;
      if (a.type === "etf" && (a.kind === "crypto" || a.kind === "vol")) m = Math.max(m, 0.5);
      if (a.type === "stock" && a.sig > 0.55) m = Math.max(m, 0.4);
      m = Math.min(1, m);
      return [Math.max(0.5, m), m];
    }
    return null; // shorts handled separately
  }

  function shortReq(a, qty, px) {
    var n = Math.abs(qty), mv = n * px;
    var lev = a.type === "etf" && a.kind === "lev" ? Math.abs(a.lev) : 1;
    var maint = px >= 5 ? Math.max(5 * n, 0.3 * mv) : Math.max(2.5 * n, mv);
    maint = Math.max(maint, Math.min(1, 0.25 * lev) * mv);
    return [Math.max(0.5 * mv, maint), maint];
  }

  function ctrRates(W, a, p) {
    if (a.type === "future") {
      var und = W.M.assets[a.und];
      var scale = 1;
      if (und && und.type === "index") scale = Math.max(1, Math.pow(W.M.f.v / 0.16, 0.8));
      if (und && und.type === "crypto") scale = Math.max(1, W.M.f.cv / 0.5);
      return [a.im * scale, a.mm * scale];
    }
    if (a.type === "fx") { var im = a.major ? 0.02 : 0.05; return [im, im * 0.5]; }
    var lev = Math.max(1, Math.min(a.maxLev, p.lev || 1));
    return [1 / lev, Math.max(0.5 / lev, 0.005)];
  }

  // Strategy-based option requirements for one underlying.
  function optionGroupReq(W, und, opts, shares, cache) {
    var a = W.M.assets[und];
    var S = a ? a.px : 0;
    var per = {};
    var total = 0;
    function addReq(k, v) { per[k] = (per[k] || 0) + v; total += v; }
    var longs = opts.filter(function (p) { return p.qty > 0; }).map(function (p) { return { p: p, left: p.qty, mid: optQuote(W, p.c, cache).mid }; });
    var shorts = opts.filter(function (p) { return p.qty < 0; }).map(function (p) { return { p: p, left: -p.qty, mid: optQuote(W, p.c, cache).mid }; });
    var longShares = Math.max(0, shares), shortShares = Math.max(0, -shares);
    var nakedRate = Options.isIndex(und) ? 0.15 : 0.2 * (a && a.kind === "lev" ? Math.max(1, Math.abs(a.lev)) : 1);
    // Tightest pairs first: shorts closest to the money.
    shorts.sort(function (x, y) { return Math.abs(x.p.c.K - S) - Math.abs(y.p.c.K - S); });
    shorts.forEach(function (s) {
      var c = s.p.c, isCall = c.right === "C", m = s.p.mult;
      // 1. Covered by stock.
      var coverShares = isCall ? longShares : shortShares;
      var n = Math.min(s.left, Math.floor(coverShares / m + 1e-9));
      if (n > 0) {
        s.left -= n;
        if (isCall) longShares -= n * m; else shortShares -= n * m;
        addReq(s.p.key, 0);
      }
      // 2. Spread with a long option of the same type expiring no earlier.
      var cands = longs.filter(function (l) { return l.left > 0 && l.p.c.right === c.right && l.p.c.exp >= c.exp && l.p.mult === m; });
      cands.sort(function (x, y) { return isCall ? x.p.c.K - y.p.c.K : y.p.c.K - x.p.c.K; });
      cands.forEach(function (l) {
        if (s.left <= 0) return;
        var k = Math.min(s.left, l.left);
        var width = isCall ? Math.max(0, l.p.c.K - c.K) : Math.max(0, c.K - l.p.c.K);
        var req = Math.max(0, width * m - (s.mid - l.mid) * m) * k;
        addReq(s.p.key, req);
        if (!(l.p.key in per)) per[l.p.key] = 0;
        s.left -= k; l.left -= k;
      });
      // 3. Naked.
      if (s.left > 0) {
        var otm = isCall ? Math.max(0, c.K - S) : Math.max(0, S - c.K);
        var per1 = Math.max(nakedRate * S - otm, 0.1 * (isCall ? S : c.K)) * m;
        addReq(s.p.key, per1 * s.left);
        s.naked = s.left;
      }
    });
    // Long options not used in spreads are paid in full (no loan value).
    longs.forEach(function (l) { if (l.left > 0) addReq(l.p.key, l.left * l.p.mult * l.mid); });
    return { total: total, per: per, nakedShorts: shorts.filter(function (s) { return s.naked; }) };
  }

  // Portfolio margin: worst loss over price shocks for one underlying.
  function pmShock(a) {
    if (!a) return 0.15;
    if (a.type === "index") return 0.08;
    if (a.type === "etf") {
      if (a.kind === "lev") return Math.min(0.9, 0.08 * Math.abs(a.lev));
      if (a.kind === "bond") return 0.06;
      if (a.kind === "crypto") return 0.3;
      if (a.kind === "vol") return 0.4;
      if (a.kind === "commodity") return 0.12;
      return a.track && a.track.indexOf(":") > 0 ? 0.1 : 0.08;
    }
    return 0.15;
  }

  function pmGroupReq(W, und, shares, opts, cache) {
    var a = W.M.assets[und];
    var S = a.px, s = pmShock(a);
    var worst = 0;
    var qs = opts.map(function (p) { return { p: p, q: optQuote(W, p.c, cache) }; });
    for (var i = -5; i <= 5; i++) {
      var x = s * i / 5, S1 = S * (1 + x);
      var pnl = shares * S * x;
      qs.forEach(function (o) {
        var c = o.p.c, q = o.q, isCall = c.right === "C";
        var v = q.T <= 0 ? P.intrinsic(S1, c.K, isCall) : (q.euro ? P.bsPrice(S1, c.K, q.T, q.r, q.q, q.iv, isCall) : P.optionValue(S1, c.K, q.T, q.r, q.q, q.iv, isCall));
        pnl += o.p.qty * o.p.mult * (v - q.mid);
      });
      if (pnl < worst) worst = pnl;
    }
    var minPer = 0;
    opts.forEach(function (p) { if (p.qty < 0) minPer += 37.5 * (p.mult / 100) * -p.qty; });
    return Math.max(-worst, minPer);
  }

  // Requirements for the whole account. Returns totals and a per-position
  // breakdown (option-spread requirements are charged to the short leg).
  function requirements(W, A, cache, nlvHint) {
    cache = cache || {};
    var init = 0, maint = 0, per = {}, reserve = 0;
    var byUnd = {};
    var usePm = A.type === "pm" && (nlvHint == null || nlvHint >= PM_MIN);
    Object.keys(A.pos).forEach(function (k) {
      var p = A.pos[k];
      if (p.kind === "opt") { (byUnd[p.c.und] = byUnd[p.c.und] || { opts: [], shares: 0 }).opts.push(p); return; }
      var a = W.M.assets[p.sym];
      if (!a) return;
      var px = a.px;
      var r;
      if (p.kind === "sec") {
        if (a.type === "stock" || a.type === "etf") {
          (byUnd[a.id] = byUnd[a.id] || { opts: [], shares: 0 }).shares += p.qty;
          if (usePm) return; // handled in the group
        }
        var mv = Math.abs(value(W, p, cache));
        if (A.type === "cash") { per[k] = { init: mv, maint: 0 }; return; }
        if (p.qty > 0 || a.type === "crypto" || a.type === "bond") {
          var rr = secRates(W, a, p.qty, px);
          if (a.type === "bond") {
            var face = Math.abs(p.qty);
            var mt = a.cls === "corp" ? Math.max(rr[1] * mv, 0.07 * face) : a.cls === "muni" ? Math.max(rr[1] * mv, 0.07 * face) : rr[1] * mv;
            r = [Math.max(rr[0] * mv, mt), mt];
          } else r = [rr[0] * mv, rr[1] * mv];
        } else r = shortReq(a, p.qty, px);
      } else {
        var rt = ctrRates(W, a, p);
        var nt = notional(W, p, cache);
        r = [rt[0] * nt, rt[1] * nt];
      }
      per[k] = { init: r[0], maint: r[1] };
      init += r[0]; maint += r[1];
    });
    Object.keys(byUnd).forEach(function (und) {
      var g = byUnd[und];
      if (A.type === "cash") {
        // Cash account: long options paid in full, covered calls, and
        // cash-secured puts (strike reserved from cash).
        g.opts.forEach(function (p) {
          if (p.qty < 0 && p.c.right === "P") { var res = p.c.K * p.mult * -p.qty; reserve += res; per[p.key] = { init: 0, maint: 0, reserve: res }; }
          else per[p.key] = { init: 0, maint: 0 };
        });
        return;
      }
      if (usePm) {
        var req = pmGroupReq(W, und, g.shares, g.opts, cache);
        init += req; maint += req;
        // Charge the group's requirement to its largest leg for display.
        var legs = g.opts.map(function (p) { return p.key; });
        if (g.shares) legs.unshift(und);
        legs.forEach(function (k, i) { per[k] = { init: i === 0 ? req : 0, maint: i === 0 ? req : 0 }; });
        return;
      }
      if (!g.opts.length) return;
      var og = optionGroupReq(W, und, g.opts, g.shares, cache);
      Object.keys(og.per).forEach(function (k) { per[k] = { init: og.per[k], maint: og.per[k] }; });
      init += og.total; maint += og.total;
    });
    return { init: init, maint: maint, per: per, reserve: reserve, pm: usePm };
  }

  function summary(W, A, cache) {
    cache = cache || {};
    var nlv = A.cash, longMv = 0, shortMv = 0, optLong = 0, optShort = 0, ctrPnl = 0, gross = 0, open = 0;
    var byClass = { stock: 0, etf: 0, crypto: 0, bond: 0, option: 0, future: 0, fx: 0, perp: 0 };
    Object.keys(A.pos).forEach(function (k) {
      var p = A.pos[k];
      var v = value(W, p, cache);
      nlv += v;
      open += openPnl(W, p, cache);
      var nt = notional(W, p, cache);
      gross += nt;
      if (p.kind === "opt") { if (v >= 0) optLong += v; else optShort -= v; byClass.option += v; return; }
      var a = W.M.assets[p.sym];
      if (!a) return;
      if (p.kind === "sec") { if (v >= 0) longMv += v; else shortMv -= v; byClass[a.type] += v; }
      else { ctrPnl += v; byClass[a.type] += p.qty > 0 ? nt : -nt; }
    });
    var req = requirements(W, A, cache, nlv);
    var cashAcct = A.type === "cash";
    var available = cashAcct ? A.cash - req.reserve : nlv - req.init;
    var excess = cashAcct ? A.cash - req.reserve : nlv - req.maint;
    return {
      nlv: nlv, cash: A.cash, longMv: longMv, shortMv: shortMv, optLong: optLong, optShort: optShort, ctrPnl: ctrPnl,
      init: req.init, maint: req.maint, per: req.per, reserve: req.reserve, pm: req.pm,
      available: available, excess: excess,
      buyingPower: cashAcct ? Math.max(0, available) : Math.max(0, available) / 0.5,
      gross: gross, leverage: nlv > 0 ? gross / nlv : 0, open: open,
      loan: Math.max(0, -A.cash), byClass: byClass,
      dayPnl: nlv - A.dayStart - A.flowsToday,
      cushion: nlv > 0 ? excess / nlv : 0
    };
  }

  /* ------------------------------------------------------------------ */
  /* Ledger & events                                                     */
  /* ------------------------------------------------------------------ */
  function log(W, A, type, text, amount, sym) {
    A.ledger.unshift({ day: W.day, tick: W.phase === "closed" ? Cal.TICKS_PER_DAY : W.tick, type: type, text: text, amount: amount == null ? null : round2(amount), sym: sym || null });
    if (A.ledger.length > LEDGER_MAX) A.ledger.length = LEDGER_MAX;
  }
  function emit(A, ev) { A.events.push(ev); if (A.events.length > 60) A.events.shift(); }

  /* ------------------------------------------------------------------ */
  /* Applying trades                                                     */
  /* ------------------------------------------------------------------ */
  // Change a position by dq at price px. Updates cash (except for contract
  // notional), average cost and realized P&L. Returns realized P&L.
  function applyTrade(W, A, inst, dq, px, opts) {
    opts = opts || {};
    var k = inst.key;
    var p = A.pos[k];
    if (!p) {
      p = A.pos[k] = { key: k, kind: inst.kind, qty: 0, avg: 0, opened: W.day, realized: 0 };
      if (inst.kind === "opt") { p.c = inst.c; p.mult = inst.mult; }
      else { p.sym = inst.sym; if (inst.kind === "ctr") p.settle = px; }
      if (opts.lev) p.lev = opts.lev;
    }
    var a = inst.a || W.M.assets[inst.sym];
    var mult = inst.kind === "opt" ? p.mult : 1;
    var realized = 0;
    // Futures: settle the existing position to the trade price first.
    if (a && a.type === "future") {
      A.cash += p.qty * a.mult * (px - p.settle);
      p.settle = px;
      mult = a.mult;
    }
    var bond = a && a.type === "bond";
    var fx = a && a.type === "fx";
    var closing = p.qty !== 0 && sign(dq) !== sign(p.qty);
    var closeQty = closing ? sign(dq) * Math.min(Math.abs(dq), Math.abs(p.qty)) : 0;
    if (closeQty) {
      var per = px - p.avg;
      if (bond) realized = -closeQty / 100 * per;
      else if (fx) realized = fxUsd(a, -closeQty * LOT * per);
      else realized = -closeQty * per * mult;
      p.qty += closeQty;
      p.realized += realized;
      A.stats.realized += realized;
      if (fx || (a && a.type === "perp")) A.cash += realized;
    }
    var rest = dq - closeQty;
    if (Math.abs(rest) > 1e-12) {
      if (p.qty === 0 || Math.abs(p.qty) < 1e-12) { p.qty = rest; p.avg = px; p.opened = W.day; if (inst.kind === "ctr") p.settle = a && a.type === "future" ? px : px; }
      else { p.avg = (p.avg * Math.abs(p.qty) + px * Math.abs(rest)) / (Math.abs(p.qty) + Math.abs(rest)); p.qty += rest; }
      if (opts.lev) p.lev = opts.lev;
    }
    // Cash for securities and options.
    if (inst.kind === "sec") A.cash -= bond ? dq / 100 * (px + (a.acc || 0)) : dq * px;
    else if (inst.kind === "opt") A.cash -= dq * px * mult;
    if (Math.abs(p.qty) < 1e-9) delete A.pos[k];
    return realized;
  }

  function fees(W, inst, dq, px) {
    var a = inst.a;
    var n = Math.abs(dq);
    if (inst.kind === "opt") {
      var f = n * (FEES.optContract + FEES.optReg);
      if (dq < 0) f += n * FEES.optTaf + Math.ceil(n * px * inst.mult * FEES.secFee * 100) / 100;
      return f;
    }
    if (a.type === "stock" || a.type === "etf") {
      if (dq >= 0) return 0;
      return Math.ceil(n * px * FEES.secFee * 100) / 100 + Math.min(FEES.tafMax, Math.ceil(n * FEES.taf * 100) / 100);
    }
    if (a.type === "crypto") return n * px * FEES.cryptoSpot;
    if (a.type === "perp") return n * px * FEES.perp;
    if (a.type === "future") return n * FEES.futContract;
    if (a.type === "bond") return a.cls === "ust" ? 0 : n / 1000 * FEES.bondPer1k;
    return 0; // FX: spread only
  }

  // Price impact for size: ~0.1 × daily vol × √(order / daily volume).
  function impact(W, inst, dq, q) {
    var a = inst.a;
    if (!a || !a.adv || inst.kind !== "sec" || a.type === "bond") return 0;
    var dailyVol = a.type === "crypto" ? (a.sig || 0.6) / Math.sqrt(365) : (a.sig || 0.2) / Math.sqrt(252);
    var frac = Math.abs(dq) / Math.max(1, a.adv);
    return Math.min(0.05, 0.1 * dailyVol * Math.sqrt(frac)) * q.mid;
  }

  /* ------------------------------------------------------------------ */
  /* Pre-trade checks                                                    */
  /* ------------------------------------------------------------------ */
  function clone(A) {
    var pos = {};
    Object.keys(A.pos).forEach(function (k) { var p = A.pos[k]; var c = {}; for (var f in p) c[f] = p[f]; pos[k] = c; });
    return { type: A.type, cash: A.cash, pos: pos, stats: { realized: 0 }, ledger: [], events: [] };
  }

  // Would this account still be in good standing? Trades that only reduce
  // risk are always allowed.
  function afterCheck(W, A, fills) {
    var B = clone(A);
    var cache = {};
    var before = summary(W, A, cache);
    fills.forEach(function (f) { applyTrade(W, B, f.inst, f.dq, f.px, f.opts); B.cash -= f.fee || 0; });
    var after = summary(W, B, cache);
    if (A.type === "cash") {
      if (after.cash - after.reserve < -0.005) return "Not enough cash. This trade needs " + fmt(-(after.cash - after.reserve) + Math.max(0, before.cash - before.reserve)) + " but you have " + fmt(Math.max(0, before.cash - before.reserve)) + " available.";
      return null;
    }
    if (after.available < -0.005 && after.init > before.init + 0.005) {
      return "Not enough buying power. After this trade the initial margin requirement would be " + fmt(after.init) + " against equity of " + fmt(after.nlv) + ".";
    }
    return null;
  }
  function fmt(x) { return "$" + (Math.round(x * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // Rules that don't depend on money.
  function ruleCheck(W, A, inst, dq, spec) {
    var a = inst.a;
    var cur = A.pos[inst.key] ? A.pos[inst.key].qty : 0;
    var opening = cur === 0 || sign(dq) === sign(cur) || Math.abs(dq) > Math.abs(cur);
    if (inst.kind === "opt") {
      var und = W.M.assets[inst.c.und];
      if (!und || !Options.optionable(und)) return "Options aren't listed on " + inst.c.und + ".";
      if (inst.c.exp < W.day) return "That contract has expired.";
      if (Math.abs(dq) % 1 !== 0) return "Options trade in whole contracts.";
      if (A.type === "cash" && dq < 0 && cur + dq < 0) {
        var shortAfter = -(cur + dq);
        if (inst.c.right === "C") {
          var sh = A.pos[inst.c.und] ? A.pos[inst.c.und].qty : 0;
          var usedCalls = 0;
          Object.keys(A.pos).forEach(function (k) { var p = A.pos[k]; if (p.kind === "opt" && p.c.und === inst.c.und && p.c.right === "C" && p.qty < 0 && k !== inst.key) usedCalls += -p.qty * p.mult; });
          if (sh - usedCalls < shortAfter * inst.mult) return "A cash account can only sell calls covered by shares you own (" + inst.mult + " shares per contract).";
        }
      }
      return null;
    }
    if (a.type === "index" || a.hidden) return a.name + " can't be traded directly. Trade its futures, options or index fund instead.";
    if (inst.kind === "ctr" && A.type === "cash") return "Futures, FX and perpetuals need a margin account. Switch the account type in Settings.";
    if (a.type === "stock" || a.type === "etf") {
      if (cur + dq < -1e-9) {
        if (A.type === "cash") return "Short selling needs a margin account.";
        if (Math.abs(dq) % 1 !== 0 && opening) return "Short sales must be whole shares.";
        if (a.px < 1) return "Shares under $1 can't be sold short.";
      }
    }
    if (a.type === "crypto" && cur + dq < -1e-9) return "Spot crypto can't be sold short. Use a perpetual contract to go short.";
    if (a.type === "bond") {
      if (cur + dq < -1e-9) return "Bonds can't be sold short here. Use Treasury futures or a bond fund.";
      if (Math.abs(dq) % 1000 !== 0) return "Bonds trade in multiples of $1,000 face value.";
    }
    if (a.type === "future" && Math.abs(dq) % 1 !== 0) return "Futures trade in whole contracts.";
    if (a.type === "future" && a.exp < W.day) return "That contract has expired.";
    if (a.type === "fx" && Math.abs(Math.round(Math.abs(dq) * 100) - Math.abs(dq) * 100) > 1e-6) return "FX trades in lots of 0.01 (1,000 units).";
    if (a.type === "perp" && spec.lev && spec.lev > a.maxLev) return "Maximum leverage on " + a.id + " is " + a.maxLev + "x.";
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Orders                                                              */
  /* ------------------------------------------------------------------ */
  // spec: { sym | c | legs, side "buy"|"sell", qty, type, limit, stop,
  //         trail, trailPct, tif, lev }
  function place(W, A, spec) {
    var o = {
      id: A.seq++, created: W.day, createdTick: W.phase === "closed" ? Cal.TICKS_PER_DAY : W.tick,
      side: spec.side, qty: +spec.qty, type: spec.type || "market", limit: spec.limit != null && spec.limit !== "" ? +spec.limit : null,
      stop: spec.stop != null && spec.stop !== "" ? +spec.stop : null, trail: spec.trail ? +spec.trail : null, trailPct: spec.trailPct ? +spec.trailPct : null,
      tif: spec.tif || "day", lev: spec.lev ? +spec.lev : null, status: "open", note: spec.note || null
    };
    if (spec.legs) {
      o.legs = spec.legs.map(function (l) { return { c: l.c, side: l.side, ratio: l.ratio || 1 }; });
      o.combo = true;
    } else if (spec.c) o.c = spec.c;
    else o.sym = spec.sym;
    var err = validate(W, A, o);
    if (err) { o.status = "rejected"; o.reason = err; finish(W, A, o); return { ok: false, error: err, order: o }; }
    if (o.type === "trail") {
      var inst0 = instrument(W, o);
      o.peak = inst0.kind === "opt" ? quoteFor(W, inst0).mid : inst0.a.px;
    }
    A.orders.push(o);
    process(W, A, o, false);
    return { ok: o.status !== "rejected", order: o, error: o.status === "rejected" ? o.reason : null };
  }

  function validate(W, A, o) {
    if (!(o.qty > 0) || !isFinite(o.qty)) return "Enter a quantity greater than zero.";
    if (o.side !== "buy" && o.side !== "sell") return "Choose buy or sell.";
    if (["market", "limit", "stop", "stop_limit", "trail"].indexOf(o.type) < 0) return "Unknown order type.";
    if ((o.type === "limit" || o.type === "stop_limit") && !(o.limit != null && isFinite(o.limit))) return "Enter a limit price.";
    if (!o.combo && (o.type === "limit" || o.type === "stop_limit") && o.limit <= 0) return "Enter a limit price above zero.";
    if ((o.type === "stop" || o.type === "stop_limit") && !(o.stop > 0)) return "Enter a stop price above zero.";
    if (o.type === "trail" && !(o.trail > 0) && !(o.trailPct > 0)) return "Enter a trailing amount.";
    if (o.combo) {
      if (o.type !== "market" && o.type !== "limit") return "Multi-leg orders can be market or limit only.";
      if (o.qty % 1 !== 0) return "Options trade in whole contracts.";
      for (var i = 0; i < o.legs.length; i++) {
        var li = instrument(W, { c: o.legs[i].c });
        var e = ruleCheck(W, A, li, (o.legs[i].side === "buy" ? 1 : -1) * o.qty * o.legs[i].ratio, o);
        if (e) return e;
      }
      return null;
    }
    var inst = instrument(W, o);
    if (!inst) return "Unknown symbol.";
    if (inst.kind !== "opt" && !Market.tradable(inst.a) && inst.a.type !== "index") return inst.a.name + " can't be traded directly.";
    return ruleCheck(W, A, inst, (o.side === "buy" ? 1 : -1) * o.qty, o);
  }

  function finish(W, A, o) {
    var i = A.orders.indexOf(o);
    if (i >= 0) A.orders.splice(i, 1);
    o.done = W.day; o.doneTick = W.phase === "closed" ? Cal.TICKS_PER_DAY : W.tick;
    A.hist.unshift(o);
    if (A.hist.length > HIST_MAX) A.hist.length = HIST_MAX;
    if (o.status === "rejected") emit(A, { type: "reject", order: o, text: o.reason });
  }

  function cancel(W, A, id) {
    var o = A.orders.filter(function (x) { return x.id === id; })[0];
    if (!o) return false;
    o.status = "cancelled";
    finish(W, A, o);
    return true;
  }

  function orderLabel(o) {
    if (o.combo) return o.legs.map(function (l) { return (l.side === "buy" ? "+" : "−") + (l.ratio > 1 ? l.ratio + "×" : "") + Options.label(l.c); }).join(" / ");
    return o.c ? Options.label(o.c) : o.sym;
  }

  // Try to fill one order. atOpen: first step of the session (gaps).
  function process(W, A, o, atOpen) {
    if (o.combo) return processCombo(W, A, o);
    var inst = instrument(W, o);
    if (!inst || (inst.kind !== "opt" && !W.M.assets[inst.sym])) { o.status = "cancelled"; o.reason = "The instrument is no longer listed."; finish(W, A, o); return false; }
    if (!canTradeNow(W, inst)) return false;
    var q = quoteFor(W, inst);
    if (!q) return false;
    var buy = o.side === "buy";
    var last = q.mid;
    // Stops and trailing stops become market/limit orders when touched.
    if (o.type === "trail") {
      if (buy) { o.peak = Math.min(o.peak, last); o.stop = o.peak + (o.trail || o.peak * o.trailPct / 100); }
      else { o.peak = Math.max(o.peak, last); o.stop = o.peak - (o.trail || o.peak * o.trailPct / 100); }
    }
    var type = o.type;
    if (type === "stop" || type === "stop_limit" || type === "trail") {
      var hit = buy ? last >= o.stop : last <= o.stop;
      if (!hit && !o.triggered) return false;
      o.triggered = true;
      type = type === "stop_limit" ? "limit" : "market";
    }
    var dq = (buy ? 1 : -1) * o.qty;
    var px;
    if (type === "market") {
      px = buy ? q.ask : q.bid;
      var imp = impact(W, inst, dq, q);
      px += buy ? imp : -imp;
      if (!buy && px <= 0 && inst.kind === "opt") px = 0;
    } else {
      if (buy && q.ask <= o.limit) px = q.ask;
      else if (!buy && q.bid >= o.limit && q.bid > 0) px = q.bid;
      else return false;
    }
    return fill(W, A, o, [{ inst: inst, dq: dq, px: px, opts: { lev: o.lev } }]);
  }

  function processCombo(W, A, o) {
    if (W.phase !== "open") return false;
    var fills = [], net = 0;
    for (var i = 0; i < o.legs.length; i++) {
      var l = o.legs[i];
      var inst = instrument(W, { c: l.c });
      var q = quoteFor(W, inst);
      var buy = l.side === "buy";
      var px = buy ? q.ask : q.bid;
      var dq = (buy ? 1 : -1) * o.qty * l.ratio;
      net += (buy ? 1 : -1) * px * l.ratio;
      fills.push({ inst: inst, dq: dq, px: px });
    }
    // Net price per combo: positive = debit paid, negative = credit received.
    if (o.type === "limit" && net > o.limit + 1e-9) return false;
    o.net = net;
    return fill(W, A, o, fills);
  }

  function fill(W, A, o, fills) {
    fills.forEach(function (f) { f.fee = fees(W, f.inst, f.dq, f.px); });
    var err = null;
    for (var i = 0; i < fills.length && !err; i++) {
      var f = fills[i];
      err = ruleCheck(W, A, f.inst, f.dq, o);
    }
    if (!err) err = afterCheck(W, A, fills);
    if (err) { o.status = "rejected"; o.reason = err; finish(W, A, o); return false; }
    var totalFee = 0, realized = 0;
    fills.forEach(function (f) {
      var a = f.inst.a;
      var acc = a && a.type === "bond" ? f.dq / 100 * a.acc : 0;
      realized += applyTrade(W, A, f.inst, f.dq, f.px, f.opts);
      A.cash -= f.fee;
      A.stats.fees += f.fee;
      totalFee += f.fee;
      var name = f.inst.kind === "opt" ? Options.label(f.inst.c) : f.inst.sym;
      var verb = f.dq > 0 ? "Bought" : "Sold";
      var unit = f.inst.kind === "opt" ? " contracts" : a && a.type === "bond" ? " face" : a && a.type === "fx" ? " lots" : "";
      var qtyStr = a && a.type === "bond" ? "$" + Math.abs(f.dq).toLocaleString("en-US") : fmtQty(Math.abs(f.dq));
      var cashMove = f.inst.kind === "opt" ? -f.dq * f.px * f.inst.mult : f.inst.kind === "sec" ? (a.type === "bond" ? -f.dq / 100 * f.px - acc : -f.dq * f.px) : 0;
      log(W, A, "trade", verb + " " + qtyStr + unit + " " + name + " @ " + fmtPx(f.px) + (acc ? " + " + fmt(Math.abs(acc)) + " accrued interest" : "") + (f.fee ? " · fees " + fmt(f.fee) : ""), cashMove - f.fee, f.inst.sym || f.inst.c.und);
    });
    o.status = "filled";
    o.fillPx = fills.length === 1 ? fills[0].px : o.net;
    o.fee = totalFee;
    o.realized = realized;
    finish(W, A, o);
    emit(A, { type: "fill", order: o, text: (o.side === "buy" ? "Bought " : "Sold ") + (o.combo ? o.qty + "× " : fmtQty(o.qty) + " ") + orderLabel(o) + " @ " + fmtPx(o.fillPx) });
    return true;
  }

  function fmtQty(x) { return Math.abs(x - Math.round(x)) < 1e-9 ? Math.round(x).toLocaleString("en-US") : (+x.toFixed(6)).toString(); }
  function fmtPx(x) {
    if (x == null) return "—";
    var ax = Math.abs(x);
    var d = ax >= 1000 ? 2 : ax >= 1 ? 2 : ax >= 0.01 ? 4 : 8;
    return (x < 0 ? "−$" : "$") + ax.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  // Close (flatten) a position at market.
  function closePosition(W, A, key, note) {
    var p = A.pos[key];
    if (!p) return { ok: false, error: "No position." };
    var spec = { side: p.qty > 0 ? "sell" : "buy", qty: Math.abs(p.qty), type: "market", tif: "day", note: note || null };
    if (p.kind === "opt") spec.c = p.c; else spec.sym = p.sym;
    return place(W, A, spec);
  }

  /* ------------------------------------------------------------------ */
  /* Exercise & expiry                                                   */
  /* ------------------------------------------------------------------ */
  // Deliver shares for an exercised/assigned option: close the option at
  // intrinsic value and trade the shares at market, which nets to paying
  // (or receiving) the strike.
  function deliver(W, A, p, n, why) {
    var c = p.c, und = W.M.assets[c.und], S = und.px;
    var isCall = c.right === "C";
    var intr = P.intrinsic(S, c.K, isCall);
    var optInst = { key: p.key, kind: "opt", c: c, mult: p.mult };
    var sign_ = p.qty > 0 ? 1 : -1;
    var realized = applyTrade(W, A, optInst, -sign_ * n, intr);
    // Long call / short put receive shares; long put / short call deliver them.
    var shares = n * p.mult * (isCall ? sign_ : -sign_);
    applyTrade(W, A, { key: und.id, kind: "sec", sym: und.id, a: und, mult: 1 }, shares, S);
    log(W, A, why, (why === "exercise" ? "Exercised " : "Assigned on ") + n + " " + Options.label(c) + ": " + (shares > 0 ? "bought " : "sold ") + Math.abs(shares).toLocaleString("en-US") + " " + und.id + " at the $" + Options.fmtK(c.K) + " strike", -shares * c.K, und.id);
    emit(A, { type: why, text: (why === "exercise" ? "Exercised " : "Assigned: ") + n + " " + Options.label(c) });
    return realized;
  }

  function cashSettle(W, A, p, why) {
    var c = p.c, S = W.M.assets[c.und].px;
    var intr = P.intrinsic(S, c.K, c.right === "C");
    var amount = p.qty * p.mult * intr;
    applyTrade(W, A, { key: p.key, kind: "opt", c: c, mult: p.mult }, -p.qty, intr);
    log(W, A, "expiry", Options.label(c) + " cash-settled at " + fmtPx(intr) + " (index " + S.toFixed(2) + ")", amount, c.und);
  }

  function exercise(W, A, key, n) {
    var p = A.pos[key];
    if (!p || p.kind !== "opt") return { ok: false, error: "No option position." };
    if (p.qty <= 0) return { ok: false, error: "Only long options can be exercised." };
    if (Options.isIndex(p.c.und)) return { ok: false, error: "Index options are European-style: they settle in cash at expiration." };
    if (W.phase !== "open") return { ok: false, error: "Exercise instructions are accepted while the market is open." };
    n = Math.min(n || p.qty, p.qty);
    var B = clone(A);
    deliver(W, B, B.pos[key], n, "exercise");
    var s = summary(W, B);
    if ((A.type === "cash" && B.cash < 0) || (A.type !== "cash" && s.available < 0)) return { ok: false, error: "Not enough buying power to take delivery of the shares." };
    deliver(W, A, p, n, "exercise");
    return { ok: true };
  }

  function expireOptions(W, A) {
    var keys = Object.keys(A.pos).filter(function (k) { var p = A.pos[k]; return p.kind === "opt" && p.c.exp <= W.day; });
    // Shorts first so assigned shares can cover long exercises.
    keys.sort(function (x, y) { return A.pos[x].qty - A.pos[y].qty; });
    keys.forEach(function (k) {
      var p = A.pos[k];
      if (!p) return;
      var und = W.M.assets[p.c.und];
      if (!und) { applyTrade(W, A, { key: k, kind: "opt", c: p.c, mult: p.mult }, -p.qty, 0); return; }
      var intr = P.intrinsic(und.px, p.c.K, p.c.right === "C");
      var label = Options.label(p.c);
      if (intr < 0.01) {
        var side = (p.qty > 0 ? "long" : "short") + " " + Math.abs(p.qty);
        applyTrade(W, A, { key: k, kind: "opt", c: p.c, mult: p.mult }, -p.qty, 0);
        log(W, A, "expiry", label + " expired worthless (" + side + ")", 0, p.c.und);
        emit(A, { type: "expire", text: label + " expired worthless" });
        return;
      }
      if (Options.isIndex(p.c.und)) { cashSettle(W, A, p); return; }
      if (p.qty < 0) { deliver(W, A, p, -p.qty, "assign"); return; }
      var B = clone(A);
      deliver(W, B, B.pos[k], p.qty, "exercise");
      var s = summary(W, B);
      if ((A.type === "cash" && B.cash < 0) || (A.type !== "cash" && s.excess < 0)) {
        var sale = p.qty * p.mult * Math.max(0, intr - 0.01);
        applyTrade(W, A, { key: k, kind: "opt", c: p.c, mult: p.mult }, -p.qty, Math.max(0, intr - 0.01));
        log(W, A, "expiry", label + " sold at intrinsic value; the account couldn't afford to exercise", sale, p.c.und);
        emit(A, { type: "expire", text: label + " sold at intrinsic value (not enough funds to exercise)" });
        return;
      }
      deliver(W, A, p, p.qty, "exercise");
    });
  }

  // Early assignment of American short options: calls the day before an
  // ex-dividend date when the dividend exceeds the remaining time value, and
  // deep in-the-money options with almost no time value.
  function earlyAssign(W, A, nextDay) {
    Object.keys(A.pos).forEach(function (k) {
      var p = A.pos[k];
      if (!p || p.kind !== "opt" || p.qty >= 0 || Options.isIndex(p.c.und) || p.c.exp <= W.day) return;
      var und = W.M.assets[p.c.und];
      if (!und) return;
      var q = Options.price(W, p.c);
      if (!q || q.intrinsic <= 0) return;
      var divTomorrow = und.type === "stock" && und.nextEx === nextDay && und.dps > 0 && p.c.right === "C" && und.dps / 4 > q.extrinsic;
      var deep = q.extrinsic < 0.003 * und.px && W.rng.next() < 0.3;
      if (divTomorrow || deep) deliver(W, A, p, -p.qty, "assign");
    });
  }

  /* ------------------------------------------------------------------ */
  /* Corporate actions                                                   */
  /* ------------------------------------------------------------------ */
  function corporate(W, A, events) {
    events.forEach(function (ev) {
      var a = W.M.assets[ev.id];
      if (ev.type === "div") {
        var p = A.pos[ev.id];
        if (!p || !p.qty) return;
        var amt = p.qty * ev.amount;
        A.cash += amt;
        A.stats.dividends += amt;
        if (p.qty > 0) {
          log(W, A, "dividend", (ev.fund ? "Distribution" : "Dividend") + " $" + ev.amount.toFixed(4) + "/sh on " + fmtQty(p.qty) + " " + ev.id, amt, ev.id);
          if (A.settings.drip && (a.type === "stock" || a.type === "etf") && W.phase === "open") {
            var q = Market.quote(W.M, ev.id);
            var sh = Math.floor(amt / q.ask * 10000) / 10000;
            if (sh > 0) { applyTrade(W, A, { key: ev.id, kind: "sec", sym: ev.id, a: a }, sh, q.ask); log(W, A, "trade", "Reinvested dividend: bought " + sh + " " + ev.id + " @ " + fmtPx(q.ask), -sh * q.ask, ev.id); }
          }
        } else log(W, A, "dividend", "Paid dividend in lieu on short " + fmtQty(-p.qty) + " " + ev.id, amt, ev.id);
      } else if (ev.type === "split") {
        var n = ev.ratio;
        var sp = A.pos[ev.id];
        if (sp) {
          sp.qty *= n; sp.avg /= n;
          if (n < 1 && sp.qty > 0 && sp.qty % 1 !== 0) {
            var frac = sp.qty - Math.floor(sp.qty);
            if (sp.qty >= 1) { A.cash += frac * a.px; sp.qty = Math.floor(sp.qty); log(W, A, "split", "Cash in lieu of " + frac.toFixed(4) + " fractional " + ev.id + " shares", frac * a.px, ev.id); }
          }
          log(W, A, "split", ev.id + (n >= 1 ? " " + n + "-for-1 split" : " 1-for-" + Math.round(1 / n) + " reverse split") + ": now " + fmtQty(sp.qty) + " shares", 0, ev.id);
        }
        // Options on the stock are adjusted.
        Object.keys(A.pos).forEach(function (k) {
          var p = A.pos[k];
          if (p.kind !== "opt" || p.c.und !== ev.id) return;
          delete A.pos[k];
          var c = { und: p.c.und, exp: p.c.exp, right: p.c.right, K: Math.round(p.c.K / n * 10000) / 10000, mult: p.mult };
          if (n >= 2 && n % 1 === 0) { p.qty *= n; p.avg /= n; }
          else { c.mult = Math.round(p.mult * n * 1000) / 1000; }
          p.c = c; p.mult = c.mult; p.key = Options.key(c);
          A.pos[p.key] = p;
        });
        A.orders.slice().forEach(function (o) {
          var hitsOpt = o.c && o.c.und === ev.id || (o.legs && o.legs.some(function (l) { return l.c.und === ev.id; }));
          if (hitsOpt) { o.status = "cancelled"; o.reason = "Cancelled for the " + ev.id + " split"; finish(W, A, o); return; }
          if (o.sym !== ev.id) return;
          o.qty *= n;
          if (o.limit != null) o.limit /= n;
          if (o.stop != null) o.stop /= n;
          if (o.trail) o.trail /= n;
          if (o.peak) o.peak /= n;
        });
        A.alerts.forEach(function (al) { if (al.sym === ev.id) al.price /= n; });
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* The trading day                                                     */
  /* ------------------------------------------------------------------ */
  function processOrders(W, A, atOpen) {
    A.orders.slice().forEach(function (o) { if (o.status === "open") process(W, A, o, atOpen); });
  }

  function checkAlerts(W, A) {
    A.alerts.forEach(function (al) {
      if (!al.active) return;
      var a = W.M.assets[al.sym];
      if (!a) { al.active = false; return; }
      if ((al.op === ">=" && a.px >= al.price) || (al.op === "<=" && a.px <= al.price)) {
        al.active = false; al.hit = W.day;
        emit(A, { type: "alert", text: al.sym + " is " + (al.op === ">=" ? "at or above " : "at or below ") + fmtPx(al.price) + " (now " + fmtPx(a.px) + ")", sym: al.sym, pause: true });
      }
    });
  }

  function checkMargin(W, A, atClose) {
    if (A.type === "cash" || !Object.keys(A.pos).length) { if (A.marginCall) A.marginCall = null; return; }
    var s = summary(W, A);
    if (s.nlv < s.maint - 0.005) {
      if (!A.marginCall) {
        var again = A.lastCall && A.lastCall.day === W.day;
        A.marginCall = { day: W.day, due: again ? A.lastCall.due : Cal.nextTradingDay(W.day), amount: s.maint - s.nlv };
        if (!again) log(W, A, "margin", "Margin call: equity " + fmt(s.nlv) + " is below the maintenance requirement of " + fmt(s.maint) + ". Deposit cash or reduce positions by the close on " + Cal.nice(A.marginCall.due) + ".", null);
        if (!again) emit(A, { type: "margincall", text: "Margin call: you need " + fmt(s.maint - s.nlv) + " more equity by the close on " + Cal.nice(A.marginCall.due) + ".", pause: true });
      } else A.marginCall.amount = s.maint - s.nlv;
      var deadline = W.day > A.marginCall.due || (W.day === A.marginCall.due && atClose);
      if (s.nlv <= 0 || s.nlv < 0.5 * s.maint || deadline) liquidate(W, A, s.nlv <= 0 ? "Equity fell to zero" : deadline ? "The margin call was not met by the deadline" : "Equity fell below half of the maintenance requirement");
    } else if (A.marginCall) {
      A.lastCall = A.marginCall;
      A.marginCall = null;
      if (atClose || A.lastCall.day !== W.day) { log(W, A, "margin", "Margin call satisfied.", null); emit(A, { type: "info", text: "Margin call satisfied." }); }
    }
  }

  function liquidate(W, A, why) {
    log(W, A, "liquidation", "Forced liquidation: " + why + ".", null);
    emit(A, { type: "liquidation", text: "The broker is liquidating positions: " + why + ".", pause: true });
    for (var guard = 0; guard < 60; guard++) {
      var s = summary(W, A);
      if (s.nlv > 0 && s.nlv >= s.maint * 1.1) break;
      var keys = Object.keys(A.pos);
      if (!keys.length) break;
      // Close the position carrying the biggest requirement first.
      keys.sort(function (x, y) { return ((s.per[y] || {}).maint || 0) - ((s.per[x] || {}).maint || 0); });
      var k = keys[0];
      var p = A.pos[k];
      var inst = p.kind === "opt" ? { key: k, kind: "opt", c: p.c, mult: p.mult } : instrument(W, { sym: p.sym });
      if (!inst || (inst.kind !== "opt" && !inst.a)) { delete A.pos[k]; continue; }
      var q = quoteFor(W, inst);
      var dq = -p.qty;
      var px = dq > 0 ? q.ask : q.bid;
      var fee = inst.a ? fees(W, inst, dq, px) : fees(W, inst, dq, px);
      applyTrade(W, A, inst, dq, px);
      A.cash -= fee; A.stats.fees += fee;
      log(W, A, "liquidation", "Liquidated " + (p.kind === "opt" ? Options.label(p.c) : p.sym) + ": " + (dq > 0 ? "bought " : "sold ") + fmtQty(Math.abs(dq)) + " @ " + fmtPx(px), null, inst.sym || inst.c.und);
    }
    A.orders.slice().forEach(function (o) { o.status = "cancelled"; o.reason = "Cancelled during liquidation"; finish(W, A, o); });
    A.marginCall = null;
  }

  // Called once per session step, after prices move.
  function onTick(W, A, atOpen) {
    processOrders(W, A, atOpen);
    checkAlerts(W, A);
    checkMargin(W, A, false);
  }

  // At the close: expiries, settlements, interest and the daily snapshot.
  function endOfDay(W, A, nextDay) {
    var M = W.M, E = W.E, day = W.day;
    var d = nextDay - day; // calendar days until the next session
    expireOptions(W, A);
    earlyAssign(W, A, nextDay);

    Object.keys(A.pos).forEach(function (k) {
      var p = A.pos[k];
      if (p.kind === "opt") return;
      var a = M.assets[p.sym];
      if (!a) return;
      if (a.type === "future") {
        var vm = p.qty * a.mult * (a.px - p.settle);
        A.cash += vm;
        p.settle = a.px;
        if (a.exp <= day) {
          var realized = p.qty * a.mult * (a.px - p.avg);
          A.stats.realized += realized;
          log(W, A, "expiry", a.id + " expired; final settlement " + a.px.toFixed(a.tick < 0.01 ? 4 : 2) + " (cash-settled)", vm, a.id);
          emit(A, { type: "expire", text: a.id + " futures expired and were cash-settled" });
          delete A.pos[k];
        }
      } else if (a.type === "perp") {
        var fund = p.qty * a.px * a.funding * 3 * d;
        A.cash -= fund; A.stats.funding -= fund;
        if (Math.abs(fund) >= 0.005) log(W, A, "funding", a.id + " funding " + (a.funding * 100).toFixed(4) + "% per 8h", -fund, a.id);
      } else if (a.type === "fx") {
        var baseRate = a.base === "USD" ? Econ.effective(E) / 100 : M.fxRates[a.base];
        var quoteRate = a.quote === "USD" ? Econ.effective(E) / 100 : M.fxRates[a.quote];
        var diff = (p.qty > 0 ? baseRate - quoteRate : quoteRate - baseRate) - 0.005;
        var swapQuote = Math.abs(p.qty) * LOT * a.px * diff / 365 * d;
        var swap = fxUsd(a, swapQuote);
        A.cash += swap; A.stats.swaps += swap;
        if (Math.abs(swap) >= 0.005) log(W, A, "swap", a.id + " overnight swap (" + (p.qty > 0 ? "long" : "short") + " " + a.base + ")", swap, a.id);
      } else if (a.type === "crypto" && a.stake && p.qty > 0) {
        var reward = p.qty * a.stake / 365 * d;
        p.qty += reward;
        p.avg = p.avg * (p.qty - reward) / p.qty;
        A.stats.staking += reward * a.px;
        log(W, A, "staking", "Staking reward " + reward.toFixed(6) + " " + a.id + " (" + (a.stake * 100).toFixed(1) + "% APY)", 0, a.id);
      } else if (a.type === "bond") {
        // Coupons due before the next session, then principal at maturity.
        if (a.freq) {
          var br = P.couponBracket(a.mat, a.freq, day);
          if (br.next > day && br.next <= nextDay) {
            var cpn = p.qty * a.coupon / a.freq;
            A.cash += cpn; A.stats.coupons += cpn;
            log(W, A, "coupon", "Coupon on $" + p.qty.toLocaleString("en-US") + " " + a.name, cpn, a.id);
          }
        }
        if (a.mat <= nextDay) {
          A.cash += p.qty;
          var rz = p.qty / 100 * (100 - p.avg);
          A.stats.realized += rz;
          log(W, A, "maturity", a.name + " matured: principal of $" + p.qty.toLocaleString("en-US") + " repaid", p.qty, a.id);
          emit(A, { type: "info", text: a.name + " matured" });
          delete A.pos[k];
        }
      }
    });

    // Interest: debit balances pay the benchmark plus a spread; idle cash
    // (excluding short-sale proceeds) earns a sweep rate.
    var s = summary(W, A);
    var fed = E.fed / 100;
    var shortProceeds = 0, borrowFee = 0;
    Object.keys(A.pos).forEach(function (k) {
      var p = A.pos[k];
      var a = M.assets[p.sym];
      if (p.kind === "sec" && p.qty < 0 && a) { var mv = -p.qty * a.px; shortProceeds += mv; borrowFee += mv * (a.borrow || 0.003) / 360 * d; }
    });
    if (borrowFee > 0) { A.cash -= borrowFee; A.stats.borrow += borrowFee; log(W, A, "borrow", "Stock borrow fees on short positions", -borrowFee); }
    if (A.cash < 0) {
      var debit = -A.cash;
      var spread = debit < 1e5 ? 0.03 : debit < 1e6 ? 0.02 : 0.01;
      var int_ = debit * (fed + spread) / 360 * d;
      A.cash -= int_; A.stats.interestPaid += int_;
      log(W, A, "interest", "Margin interest at " + ((fed + spread) * 100).toFixed(2) + "% on " + fmt(debit), -int_);
    } else {
      var idle = Math.max(0, A.cash - shortProceeds);
      var rate = Math.max(0, Econ.effective(E) / 100 - 0.005);
      var earn = idle * rate / 360 * d;
      if (earn > 0.005) { A.cash += earn; A.stats.interestEarned += earn; log(W, A, "interest", "Cash sweep interest at " + (rate * 100).toFixed(2) + "%", earn); }
    }

    // Day orders expire; GTC orders last 90 days.
    A.orders.slice().forEach(function (o) {
      if (o.tif === "day" || day - o.created > 90) { o.status = "expired"; finish(W, A, o); }
    });
    checkMargin(W, A, true);
    snapshot(W, A);
  }

  function snapshot(W, A) {
    var s = summary(W, A);
    var base = A.equity.length ? A.equity[A.equity.length - 1].nlv : A.deposits - A.flowsToday;
    var r = base > 0 ? (s.nlv - A.flowsToday) / base : 1;
    if (isFinite(r) && r > 0) A.twr *= r;
    A.equity.push({ d: W.day, nlv: s.nlv, twr: A.twr, bench: W.M.assets.US500.px, flows: A.flowsToday });
    if (A.equity.length > 3000) A.equity.shift();
    A.flowsToday = 0;
  }

  function deposit(W, A, amt) {
    amt = +amt;
    if (!(amt > 0)) return { ok: false, error: "Enter an amount above zero." };
    A.cash += amt; A.deposits += amt; A.flowsToday += amt;
    log(W, A, "deposit", "Deposited " + fmt(amt), amt);
    if (A.marginCall) checkMargin(W, A, false);
    return { ok: true };
  }
  function withdraw(W, A, amt) {
    amt = +amt;
    if (!(amt > 0)) return { ok: false, error: "Enter an amount above zero." };
    var s = summary(W, A);
    var max = A.type === "cash" ? Math.max(0, A.cash - s.reserve) : Math.max(0, Math.min(A.cash, s.available));
    if (amt > max + 0.005) return { ok: false, error: "You can withdraw up to " + fmt(max) + "." };
    A.cash -= amt; A.deposits -= amt; A.flowsToday -= amt;
    log(W, A, "withdraw", "Withdrew " + fmt(amt), -amt);
    return { ok: true };
  }

  function setType(W, A, type) {
    if (type === A.type) return { ok: true };
    var s = summary(W, A);
    if (type === "pm" && s.nlv < PM_MIN) return { ok: false, error: "Portfolio margin needs at least " + fmt(PM_MIN) + " of equity." };
    if (type === "cash") {
      if (A.cash < 0) return { ok: false, error: "Pay off the margin loan (cash is negative) before switching to a cash account." };
      var bad = Object.keys(A.pos).some(function (k) { var p = A.pos[k]; return p.qty < 0 && !(p.kind === "opt") || p.kind === "ctr"; });
      if (bad) return { ok: false, error: "Close short stock, futures, FX and perpetual positions before switching to a cash account." };
    }
    var old = A.type;
    A.type = type;
    if (type === "cash") {
      var s2 = summary(W, A);
      if (s2.cash - s2.reserve < 0) { A.type = old; return { ok: false, error: "Your short options need more cash or share coverage than a cash account allows." }; }
    }
    log(W, A, "info", "Account type changed to " + ({ cash: "Cash", margin: "Reg T margin", pm: "Portfolio margin" })[type], null);
    return { ok: true };
  }

  // Aggregate option Greeks (share-equivalent delta, $ per day theta, $ per
  // vol point vega) and the portfolio's beta-weighted delta to the US 500.
  function risk(W, A) {
    var cache = {};
    var delta = 0, gamma = 0, theta = 0, vega = 0, betaDollars = 0;
    var spx = W.M.assets.US500.px;
    Object.keys(A.pos).forEach(function (k) {
      var p = A.pos[k];
      var a, d$;
      if (p.kind === "opt") {
        var q = optQuote(W, p.c, cache);
        if (!q) return;
        a = W.M.assets[p.c.und];
        var sh = q.delta * p.qty * p.mult;
        delta += sh * q.S; gamma += q.gamma * p.qty * p.mult; theta += q.theta * p.qty * p.mult; vega += q.vega * p.qty * p.mult;
        d$ = sh * q.S;
      } else {
        a = W.M.assets[p.sym];
        if (!a) return;
        if (a.type === "stock" || a.type === "etf" || a.type === "crypto") d$ = p.qty * a.px;
        else if (a.type === "future" && W.M.assets[a.und] && W.M.assets[a.und].type === "index") { d$ = p.qty * a.mult * a.px; a = W.M.assets[a.und]; }
        else d$ = 0;
      }
      var beta = a.type === "stock" ? a.beta : a.type === "etf" ? (a.kind === "lev" ? a.lev : a.kind === "index" ? 1 : a.kind === "crypto" ? 1.5 : 0.1) : a.type === "index" ? (a.id === "US500" ? 1 : 1.15) : a.type === "crypto" ? 1.5 : 0;
      betaDollars += d$ * beta;
    });
    return { delta$: delta, gamma: gamma, theta: theta, vega: vega, beta$: betaDollars, spxEq: betaDollars / spx };
  }

  // What an order would do if it filled now: price, fees, cash and the
  // account's margin before and after. Nothing is changed.
  function preview(W, A, spec) {
    var o = { side: spec.side, qty: +spec.qty, type: spec.type || "market", limit: spec.limit != null && spec.limit !== "" ? +spec.limit : null, lev: spec.lev ? +spec.lev : null };
    if (spec.legs) o.legs = spec.legs; else if (spec.c) o.c = spec.c; else o.sym = spec.sym;
    if (!(o.qty > 0)) return { error: "Enter a quantity greater than zero." };
    var fills = [], net = 0;
    var legs = o.legs || [{ c: o.c, sym: o.sym, side: o.side, ratio: 1 }];
    for (var i = 0; i < legs.length; i++) {
      var l = legs[i];
      var inst = instrument(W, l.c ? { c: l.c } : { sym: l.sym });
      if (!inst) return { error: "Unknown symbol." };
      var q = quoteFor(W, inst);
      if (!q) return { error: "No quote." };
      var buy = l.side === "buy";
      var dq = (buy ? 1 : -1) * o.qty * (l.ratio || 1);
      var px = buy ? q.ask : q.bid;
      if (!o.legs && (o.type === "limit" || o.type === "stop_limit") && o.limit != null) px = o.limit;
      if (!o.legs && o.type === "market") { var imp = impact(W, inst, dq, q); px += buy ? imp : -imp; }
      var err = ruleCheck(W, A, inst, dq, o);
      if (err) return { error: err };
      var f = { inst: inst, dq: dq, px: px, opts: { lev: o.lev } };
      f.fee = fees(W, inst, dq, px);
      fills.push(f);
      net += (buy ? 1 : -1) * px * (l.ratio || 1);
    }
    var cache = {};
    var before = summary(W, A, cache);
    var B = clone(A);
    var cashBefore = B.cash;
    var fee = 0;
    fills.forEach(function (f) { applyTrade(W, B, f.inst, f.dq, f.px, f.opts); B.cash -= f.fee; fee += f.fee; });
    var after = summary(W, B, cache);
    var err2 = afterCheck(W, A, fills);
    return { px: fills.length === 1 ? fills[0].px : net, net: net, fee: fee, cash: B.cash - cashBefore, before: before, after: after, error: err2, fills: fills };
  }

  return {
    LOT: LOT, FEES: FEES, PM_MIN: PM_MIN, preview: preview,
    create: create, instrument: instrument, place: place, cancel: cancel, closePosition: closePosition, exercise: exercise,
    summary: summary, requirements: requirements, value: value, openPnl: openPnl, mark: mark, notional: notional,
    onTick: onTick, endOfDay: endOfDay, corporate: corporate, processOrders: processOrders, checkMargin: checkMargin,
    deposit: deposit, withdraw: withdraw, setType: setType, risk: risk, orderLabel: orderLabel, fees: fees,
    canTradeNow: canTradeNow, quoteFor: quoteFor, fmtPx: fmtPx, fmtQty: fmtQty, afterCheck: afterCheck, ctrRates: ctrRates
  };
});
