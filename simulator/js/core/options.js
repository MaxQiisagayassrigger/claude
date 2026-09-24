/*
 * Listed options: contracts, strike grids, expirations and quotes.
 *
 * A contract is { und, exp (day number), right "C"|"P", K, mult }. Stock and
 * ETF options are American and settle in shares; index options (US500,
 * TECH100, SMALL200) are European and cash-settled, like their real
 * counterparts.
 *
 * Implied volatility is built from the same state that drives prices, so
 * options are fairly priced on average:
 *   - ATM level: the stock's current factor volatility, mean-reverting
 *     toward its long-run level over the term (so short-dated IV jumps in a
 *     selloff and long-dated IV moves less);
 *   - earnings: an earnings date before expiry adds the variance of a
 *     typical earnings move, so front-month IV rises into the report and
 *     collapses after it;
 *   - skew: IV(K) = ATM · (1 + skew·x + smile·x²), x = ln(K/F)/(ATM·√T).
 * Theoretical value is Black–Scholes–Merton (American contracts floored at
 * intrinsic). Bid/ask widen for low-priced, small-cap and far-OTM options.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./calendar.js"), require("./pricing.js"), require("./economy.js"), require("./market.js"));
  } else {
    root.BSX = root.BSX || {};
    root.BSX.Options = factory(root.BSX.Cal, root.BSX.Pricing, root.BSX.Economy, root.BSX.Market);
  }
})(typeof self !== "undefined" ? self : this, function (Cal, P, Econ, Market) {
  "use strict";

  var INDEX_OPTIONS = { US500: 1, TECH100: 1, SMALL200: 1 };

  function optionable(a) {
    if (!a) return false;
    if (a.type === "stock" || a.type === "etf") return a.px >= 1;
    return a.type === "index" && !!INDEX_OPTIONS[a.id];
  }
  function isIndex(und) { return !!INDEX_OPTIONS[und]; }

  function strikeStep(px) {
    if (px < 5) return 0.5;
    if (px < 25) return 1;
    if (px < 60) return 2.5;
    if (px < 200) return 5;
    if (px < 500) return 10;
    if (px < 1000) return 25;
    if (px < 3000) return 50;
    if (px < 12000) return 50;
    return 250;
  }
  function roundStrike(x) { return Math.round(x * 100) / 100; }

  function strikes(px, n) {
    var step = strikeStep(px);
    var atm = Math.round(px / step) * step;
    var out = [];
    for (var i = -n; i <= n; i++) { var k = roundStrike(atm + i * step); if (k > 0) out.push(k); }
    return out;
  }

  function expiries(day) { return Cal.optionExpiries(day, 4, 6); }

  function key(c) { return c.und + "|" + c.exp + "|" + c.right + "|" + c.K + (c.mult && c.mult !== 100 ? "|x" + c.mult : ""); }
  function parse(k) {
    var p = k.split("|");
    return { und: p[0], exp: +p[1], right: p[2], K: +p[3], mult: p[4] ? +p[4].slice(1) : 100 };
  }
  function fmtK(K) { return K % 1 === 0 ? String(K) : K.toFixed(2).replace(/0$/, ""); }
  function label(c) { return c.und + " " + Cal.shortY(c.exp) + " " + fmtK(c.K) + " " + (c.right === "C" ? "Call" : "Put") + (c.mult && c.mult !== 100 ? " (adj. ×" + c.mult + ")" : ""); }
  function occ(c) {
    var p = Cal.parts(c.exp);
    var d = String(p.y).slice(2) + ("0" + p.m).slice(-2) + ("0" + p.d).slice(-2);
    return c.und + d + c.right + ("00000000" + Math.round(c.K * 1000)).slice(-8);
  }

  // Years to expiry: contracts expire at 4:00 pm on the expiry date.
  function tte(W, exp) {
    var days = (exp - W.day) + (16 / 24 - Cal.tickDayFrac(W.phase === "closed" ? Cal.TICKS_PER_DAY : W.tick));
    return Math.max(0, days / 365);
  }

  function A(k, T) { var x = k * T; return x < 1e-6 ? 1 : (1 - Math.exp(-x)) / x; }

  // Typical earnings-day move (standard deviation) for a stock.
  function earnMove(a) { return Math.sqrt(Math.pow(0.02 + 0.12 * a.sig, 2) + Math.pow(0.035 * (1 + 2 * a.sig), 2)); }

  function atmVol(W, a, T, exp) {
    var M = W.M, E = W.E;
    var vbar = Econ.REGIMES[E.regime].vol, v = M.f.v;
    var now2, long2;
    if (a.type === "stock") {
      var sec = Market.SEC_BY_ID[a.sector];
      var sNow = a.sig * (0.7 + 0.3 * v / 0.15), sLong = a.sig * (0.7 + 0.3 * vbar / 0.15);
      now2 = a.beta * a.beta * v * v + sec.sigS * sec.sigS + sNow * sNow;
      long2 = a.beta * a.beta * vbar * vbar + sec.sigS * sec.sigS + sLong * sLong;
    } else {
      var rv20 = Market.realizedVol(a, 20) || 0.2, rvL = Market.realizedVol(a, 250) || rv20;
      var nowV = 0.5 * rv20 + 0.5 * rvL * v / vbar;
      if (a.id === "US500" || (a.track === "US500" && a.kind === "index")) nowV = v * 1.02;
      now2 = nowV * nowV; long2 = rvL * rvL;
    }
    var T2 = Math.max(T, 1 / 365);
    var var_ = long2 + (now2 - long2) * A(4, T2);
    if (a.type === "stock" && a.nextEarn != null && exp != null && a.nextEarn <= exp) {
      var pending = a.nextEarn > W.day || (a.nextEarn === W.day && a.earnAmc);
      if (pending) var_ += Math.pow(earnMove(a), 2) / T2;
    }
    return Math.max(0.05, Math.sqrt(var_) * 1.07);
  }

  function skewParams(a) {
    if (a.type === "index" || (a.type === "etf" && a.kind === "index")) return [-0.14, 0.03];
    if (a.type === "etf" && a.kind === "lev") return a.lev < 0 ? [0.1, 0.03] : [-0.12, 0.03];
    if (a.type === "etf" && (a.kind === "crypto" || a.kind === "vol")) return a.kind === "vol" ? [0.12, 0.04] : [-0.03, 0.05];
    if (a.type === "etf") return [-0.08, 0.03];
    return [-0.09, 0.025];
  }

  function carry(W, a) {
    return a.type === "stock" ? a.dps / Math.max(0.01, a.px) : a.type === "index" ? (a.q || 0.013) : (a.q || 0);
  }

  // Full theoretical quote for a contract.
  function price(W, c, atmCache) {
    var a = W.M.assets[c.und];
    if (!a) return null;
    var S = a.px;
    var T = tte(W, c.exp);
    var r = Econ.yieldAt(W.E, Math.max(T, 0.02), W.day) / 100;
    var q = carry(W, a);
    var F = S * Math.exp((r - q) * T);
    var atm = atmCache && atmCache[c.exp] != null ? atmCache[c.exp] : atmVol(W, a, T, c.exp);
    var sk = skewParams(a);
    var sqT = Math.sqrt(Math.max(T, 1 / 365));
    var x = Math.max(-4, Math.min(4, Math.log(c.K / F) / (atm * sqT)));
    var iv = Math.max(0.04, atm * Math.max(0.45, 1 + sk[0] * x + sk[1] * x * x));
    var isCall = c.right === "C";
    var euro = isIndex(c.und);
    var mid = euro ? P.bsPrice(S, c.K, T, r, q, iv, isCall) : P.optionValue(S, c.K, T, r, q, iv, isCall);
    var g = P.greeks(S, c.K, T, r, q, iv, isCall);
    // Spread: a few cents plus a share of value; wider for small, thin names.
    var liq = a.type === "stock" ? (a.shares * S > 2e11 ? 0.025 : a.shares * S > 3e10 ? 0.045 : 0.08) : 0.03;
    var tick = mid < 3 ? 0.01 : 0.05;
    var half = Math.max(tick / 2, 0.01 + mid * liq / 2 + (Math.abs(x) > 2.5 ? tick : 0));
    var bid = Math.floor((mid - half) / tick) * tick;
    var ask = Math.ceil((mid + half) / tick) * tick;
    if (bid < tick) bid = mid > tick ? tick : 0;
    if (ask <= bid) ask = bid + tick;
    var intr = P.intrinsic(S, c.K, isCall);
    return {
      bid: Math.round(bid * 100) / 100, ask: Math.round(ask * 100) / 100, mid: mid, iv: iv, T: T, S: S, r: r, q: q,
      delta: g.delta, gamma: g.gamma, theta: g.theta, vega: g.vega, rho: g.rho,
      intrinsic: intr, extrinsic: Math.max(0, mid - intr), euro: euro
    };
  }

  // Value at an arbitrary underlying price / date (for payoff charts and
  // portfolio-margin scenarios). dT: years elapsed from now.
  function valueAt(W, c, S, dT, ivOverride) {
    var q0 = price(W, c);
    if (!q0) return 0;
    var T = Math.max(0, q0.T - (dT || 0));
    var iv = ivOverride != null ? ivOverride : q0.iv;
    var isCall = c.right === "C";
    if (T <= 0) return P.intrinsic(S, c.K, isCall);
    return q0.euro ? P.bsPrice(S, c.K, T, q0.r, q0.q, iv, isCall) : P.optionValue(S, c.K, T, q0.r, q0.q, iv, isCall);
  }

  function chain(W, und, exp, n) {
    var a = W.M.assets[und];
    var T = tte(W, exp);
    var cache = {}; cache[exp] = atmVol(W, a, T, exp);
    return strikes(a.px, n || 12).map(function (K) {
      var cc = { und: und, exp: exp, right: "C", K: K, mult: 100 };
      var pc = { und: und, exp: exp, right: "P", K: K, mult: 100 };
      return { K: K, call: price(W, cc, cache), put: price(W, pc, cache), callC: cc, putC: pc };
    });
  }

  return {
    optionable: optionable, isIndex: isIndex, strikeStep: strikeStep, strikes: strikes, expiries: expiries,
    key: key, parse: parse, label: label, occ: occ, fmtK: fmtK, tte: tte, atmVol: atmVol, price: price, valueAt: valueAt, chain: chain, earnMove: earnMove
  };
});
