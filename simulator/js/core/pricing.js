/*
 * Pricing math shared by the engine, the broker and the UI.
 *
 * Options: Black–Scholes–Merton with a continuous dividend yield q. Listed
 * equity options are American, so a quote is never allowed below intrinsic
 * value. Greeks are per share: theta per calendar day, vega per 1 vol
 * point, rho per 1 percentage point of rates.
 *
 * Bonds: street convention with semiannual compounding. Clean price per 100
 * face, accrued interest by the fraction of the coupon period elapsed,
 * Macaulay/modified duration and convexity.
 *
 * Yield curve: Nelson–Siegel, y(τ) = b0 + b1·L(τ) + b2·(L(τ) − e^(−τ/λ)),
 * L(τ) = (1 − e^(−τ/λ)) / (τ/λ).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.BSX = root.BSX || {}; root.BSX.Pricing = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SQRT2PI = Math.sqrt(2 * Math.PI);

  // Normal CDF: Hart / West double-precision algorithm (abs error ~1e-15).
  function normCdf(x) {
    var z = Math.abs(x);
    var c;
    if (z > 37) c = 0;
    else {
      var e = Math.exp(-z * z / 2);
      if (z < 7.07106781186547) {
        var n = ((((((0.0352624965998911 * z + 0.700383064443688) * z + 6.37396220353165) * z + 33.912866078383) * z + 112.079291497871) * z + 221.213596169931) * z + 220.206867912376);
        var d = (((((((0.0883883476483184 * z + 1.75566716318264) * z + 16.064177579207) * z + 86.7807322029461) * z + 296.564248779674) * z + 637.333633378831) * z + 793.826512519948) * z + 440.413735824752);
        c = e * n / d;
      } else {
        var f = z + 1 / (z + 2 / (z + 3 / (z + 4 / (z + 0.65))));
        c = e / f / SQRT2PI;
      }
    }
    return x <= 0 ? c : 1 - c;
  }
  function normPdf(x) { return Math.exp(-0.5 * x * x) / SQRT2PI; }

  /* ---------------- Options ---------------- */

  function intrinsic(S, K, isCall) { return Math.max(0, isCall ? S - K : K - S); }

  function bsPrice(S, K, T, r, q, sigma, isCall) {
    if (!(S > 0) || !(K > 0)) return intrinsic(S, K, isCall);
    if (T <= 1e-9 || sigma <= 1e-9) {
      var fwd = S * Math.exp((r - q) * Math.max(T, 0)), df = Math.exp(-r * Math.max(T, 0));
      return Math.max(0, isCall ? (fwd - K) * df : (K - fwd) * df);
    }
    var sq = sigma * Math.sqrt(T);
    var d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / sq;
    var d2 = d1 - sq;
    var dq = Math.exp(-q * T), dr = Math.exp(-r * T);
    return isCall
      ? S * dq * normCdf(d1) - K * dr * normCdf(d2)
      : K * dr * normCdf(-d2) - S * dq * normCdf(-d1);
  }

  // American-style floor: never below intrinsic.
  function optionValue(S, K, T, r, q, sigma, isCall) {
    return Math.max(bsPrice(S, K, T, r, q, sigma, isCall), T > 0 ? intrinsic(S, K, isCall) : intrinsic(S, K, isCall));
  }

  function greeks(S, K, T, r, q, sigma, isCall) {
    if (T <= 1e-9 || sigma <= 1e-9 || !(S > 0)) {
      var itm = isCall ? S > K : S < K;
      return { delta: itm ? (isCall ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    }
    var sqT = Math.sqrt(T), sq = sigma * sqT;
    var d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / sq;
    var d2 = d1 - sq;
    var dq = Math.exp(-q * T), dr = Math.exp(-r * T);
    var pdf = normPdf(d1);
    var gamma = dq * pdf / (S * sq);
    var vega = S * dq * pdf * sqT / 100;
    var delta, theta, rho;
    if (isCall) {
      delta = dq * normCdf(d1);
      theta = (-S * dq * pdf * sigma / (2 * sqT) - r * K * dr * normCdf(d2) + q * S * dq * normCdf(d1)) / 365;
      rho = K * T * dr * normCdf(d2) / 100;
    } else {
      delta = -dq * normCdf(-d1);
      theta = (-S * dq * pdf * sigma / (2 * sqT) + r * K * dr * normCdf(-d2) - q * S * dq * normCdf(-d1)) / 365;
      rho = -K * T * dr * normCdf(-d2) / 100;
    }
    return { delta: delta, gamma: gamma, theta: theta, vega: vega, rho: rho };
  }

  // Implied volatility: Newton steps guarded by a bisection bracket.
  function impliedVol(price, S, K, T, r, q, isCall) {
    if (T <= 0) return NaN;
    var lo = 1e-4, hi = 6;
    if (price <= bsPrice(S, K, T, r, q, lo, isCall) + 1e-12) return lo;
    if (price >= bsPrice(S, K, T, r, q, hi, isCall)) return hi;
    var v = 0.3;
    for (var i = 0; i < 100; i++) {
      var p = bsPrice(S, K, T, r, q, v, isCall);
      var diff = p - price;
      if (Math.abs(diff) < 1e-10) return v;
      if (diff > 0) hi = v; else lo = v;
      var vg = greeks(S, K, T, r, q, v, isCall).vega * 100;
      var nv = vg > 1e-8 ? v - diff / vg : NaN;
      v = (nv > lo && nv < hi) ? nv : 0.5 * (lo + hi);
      if (hi - lo < 1e-10) return v;
    }
    return v;
  }

  /* ---------------- Bonds ---------------- */

  // Coupon schedule for a bond maturing on `maturity` (day number) paying
  // `freq` coupons a year: coupon dates step back from maturity in months.
  function addMonths(day, months) {
    var dt = new Date(day * 86400000);
    var y = dt.getUTCFullYear(), m = dt.getUTCMonth() + months, d = dt.getUTCDate();
    var ny = y + Math.floor(m / 12), nm = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return Math.round(Date.UTC(ny, nm, Math.min(d, last)) / 86400000);
  }

  // Previous and next coupon dates around settlement day `s`. Cached: every
  // bond is repriced each 15-minute step, but the answer changes once a day.
  var bracketCache = {}, bracketCount = 0;
  function couponBracket(maturity, freq, s) {
    var key = maturity + "|" + freq + "|" + s;
    var hit = bracketCache[key];
    if (hit) return hit;
    if (++bracketCount > 4000) { bracketCache = {}; bracketCount = 0; }
    return (bracketCache[key] = computeBracket(maturity, freq, s));
  }
  function computeBracket(maturity, freq, s) {
    var step = 12 / freq;
    var next = maturity, k = 0;
    while (true) {
      var prev = addMonths(maturity, -step * (k + 1));
      if (prev <= s) return { prev: prev, next: next, remaining: k + 1 };
      next = prev;
      k++;
      if (k > 400) return { prev: s, next: maturity, remaining: 1 };
    }
  }

  // Clean price, accrued interest and risk measures at yield y (decimal).
  // coupon is the annual rate (decimal); freq = 0 means zero-coupon.
  function bondMetrics(coupon, maturity, s, y, freq) {
    if (s >= maturity) return { clean: 100, accrued: 0, dirty: 100, dur: 0, modDur: 0, convexity: 0, years: 0 };
    var years = (maturity - s) / 365.25;
    var f = freq || 2;
    var yy = Math.max(y, -0.009);
    if (!freq || coupon === 0) {
      var n = years * f;
      var p = 100 / Math.pow(1 + yy / f, n);
      var md = years / (1 + yy / f);
      return { clean: p, accrued: 0, dirty: p, dur: years, modDur: md, convexity: n * (n + 1) / (f * f) / Math.pow(1 + yy / f, 2), years: years };
    }
    var br = couponBracket(maturity, f, s);
    var w = (br.next - s) / Math.max(1, br.next - br.prev); // fraction of period to next coupon
    var cpn = 100 * coupon / f;
    var v = 1 / (1 + yy / f);
    var dirty = 0, tw = 0, cx = 0;
    for (var k = 0; k < br.remaining; k++) {
      var t = w + k; // in periods
      var cf = cpn + (k === br.remaining - 1 ? 100 : 0);
      var pv = cf * Math.pow(v, t);
      dirty += pv;
      tw += t * pv;
      cx += t * (t + 1) * pv;
    }
    var accrued = cpn * (1 - w);
    var mac = tw / dirty / f;
    return {
      clean: dirty - accrued,
      accrued: accrued,
      dirty: dirty,
      dur: mac,
      modDur: mac / (1 + yy / f),
      convexity: cx * v * v / dirty / (f * f),
      years: years
    };
  }

  function bondYield(clean, coupon, maturity, s, freq) {
    var lo = -0.009, hi = 0.6;
    for (var i = 0; i < 200; i++) {
      var mid = 0.5 * (lo + hi);
      var p = bondMetrics(coupon, maturity, s, mid, freq).clean;
      if (p > clean) lo = mid; else hi = mid;
      if (hi - lo < 1e-10) break;
    }
    return 0.5 * (lo + hi);
  }

  /* ---------------- Curves & futures ---------------- */

  var NS_LAMBDA = 1.8;
  function nsYield(b0, b1, b2, tau) {
    var t = Math.max(tau, 1e-4) / NS_LAMBDA;
    var L = (1 - Math.exp(-t)) / t;
    return b0 + b1 * L + b2 * (L - Math.exp(-t));
  }

  function futuresFair(spot, r, carry, T) { return spot * Math.exp((r + carry) * Math.max(T, 0)); }

  return {
    normCdf: normCdf, normPdf: normPdf,
    intrinsic: intrinsic, bsPrice: bsPrice, optionValue: optionValue, greeks: greeks, impliedVol: impliedVol,
    addMonths: addMonths, couponBracket: couponBracket, bondMetrics: bondMetrics, bondYield: bondYield,
    nsYield: nsYield, NS_LAMBDA: NS_LAMBDA, futuresFair: futuresFair
  };
});
