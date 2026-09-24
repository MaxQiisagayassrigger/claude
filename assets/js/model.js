/*
 * Doubling-probability engine.
 *
 * 1. A factor score (0–100) is built from seven 0–10 factor ratings and
 *    user-adjustable weights. `risk` is inverted (10 − risk).
 * 2. The score maps linearly to an expected annual drift:
 *        mu = riskFree + spread * (score − 50) / 50
 *    so score 50 earns the risk-free rate, 100 earns riskFree + spread.
 * 3. Prices follow geometric Brownian motion with that drift and the stock's
 *    volatility sigma. Log-price drift nu = mu − sigma²/2. Then:
 *      pEnd(k)   = P(S_T / S_0 ≥ k)                   (closes the horizon ≥ k×)
 *      pTouch(k) = P(max_{t≤T} S_t / S_0 ≥ k)          (hits k× at any point)
 *    with the reflection-principle closed form for the running maximum, and
 *    the mirror image for the running minimum (pHalve).
 *
 * This is a transparent, assumption-driven model: every input is visible and
 * editable in the UI. It is not a forecast of any specific security.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Model = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FACTORS = ["wave", "growth", "street", "smart", "asym", "size", "risk"];

  var DEFAULT_WEIGHTS = { wave: 22, growth: 18, street: 12, smart: 14, asym: 12, size: 10, risk: 12 };

  var DEFAULT_PARAMS = { riskFree: 0.04, spread: 0.35, horizonYears: 1 };

  // Abramowitz & Stegun 7.1.26 erf approximation (|error| < 1.5e-7).
  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return sign * y;
  }

  function normCdf(z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  }

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function factorScore(factors, weights) {
    weights = weights || DEFAULT_WEIGHTS;
    var num = 0, den = 0;
    FACTORS.forEach(function (f) {
      var w = Number(weights[f]) || 0;
      if (w <= 0) return;
      var v = Number(factors[f]);
      if (!isFinite(v)) v = 5;
      v = clamp(v, 0, 10);
      if (f === "risk") v = 10 - v;
      num += w * v;
      den += w;
    });
    return den === 0 ? 50 : (num / den) * 10;
  }

  function driftFromScore(score, params) {
    params = params || DEFAULT_PARAMS;
    return params.riskFree + params.spread * (score - 50) / 50;
  }

  // P(S_T/S_0 >= k) for GBM.
  function pEnd(k, mu, sigma, T) {
    if (sigma <= 0 || T <= 0) return mu * T >= Math.log(k) ? 1 : 0;
    var nu = mu - 0.5 * sigma * sigma;
    var sT = sigma * Math.sqrt(T);
    return 1 - normCdf((Math.log(k) - nu * T) / sT);
  }

  // P(max_{t<=T} S_t/S_0 >= k), k > 1.
  function pTouchUp(k, mu, sigma, T) {
    var b = Math.log(k);
    if (b <= 0) return 1;
    var nu = mu - 0.5 * sigma * sigma;
    var sT = sigma * Math.sqrt(T);
    var p = 1 - normCdf((b - nu * T) / sT) + Math.exp(2 * nu * b / (sigma * sigma)) * normCdf((-b - nu * T) / sT);
    return clamp(p, 0, 1);
  }

  // P(min_{t<=T} S_t/S_0 <= k), k < 1.
  function pTouchDown(k, mu, sigma, T) {
    var b = Math.log(k); // negative
    if (b >= 0) return 1;
    var nu = mu - 0.5 * sigma * sigma;
    var sT = sigma * Math.sqrt(T);
    var p = normCdf((b - nu * T) / sT) + Math.exp(2 * nu * b / (sigma * sigma)) * normCdf((b + nu * T) / sT);
    return clamp(p, 0, 1);
  }

  function evaluate(stock, weights, params) {
    params = Object.assign({}, DEFAULT_PARAMS, params || {});
    var score = factorScore(stock.factors, weights);
    var mu = driftFromScore(score, params);
    var sigma = stock.vol;
    var T = params.horizonYears;
    return {
      score: score,
      mu: mu,
      sigma: sigma,
      pDoubleEnd: pEnd(2, mu, sigma, T),
      pDoubleTouch: pTouchUp(2, mu, sigma, T),
      pHalveTouch: pTouchDown(0.5, mu, sigma, T),
      expectedMultiple: Math.exp(mu * T)
    };
  }

  return {
    FACTORS: FACTORS,
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    DEFAULT_PARAMS: DEFAULT_PARAMS,
    normCdf: normCdf,
    factorScore: factorScore,
    driftFromScore: driftFromScore,
    pEnd: pEnd,
    pTouchUp: pTouchUp,
    pTouchDown: pTouchDown,
    evaluate: evaluate
  };
});
