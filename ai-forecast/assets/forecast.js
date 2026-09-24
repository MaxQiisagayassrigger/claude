/*
 * Three-month forecast engine for the AI megacap universe.
 *
 * For every stock it returns an expected 3-month return plus a full
 * probability distribution of outcomes. The expected return has three parts:
 *
 *   E[R] = rf·T  +  β·(M − rf·T)  +  α
 *
 *   rf·T   the risk-free return over the horizon (3-month T-bill)
 *   β·(…)  the stock's share of the market's excess return. M is the S&P 500
 *          3-month return, by default rf·T + ERP·T (adjustable in the UI).
 *   α      the stock-specific part, built from signals that research has found
 *          to predict returns (analyst target upside, distance from the 52-week
 *          high, revenue growth and, when price history is loaded, 12-month
 *          momentum and last-month reversal).
 *
 * α uses the "fundamental law" form α = σ_resid·√T · Σ w_k·z_k, where z_k is the
 * stock's cross-sectional z-score on signal k and w = R⁻¹·IC. IC is each
 * signal's information coefficient (its correlation with the next 3-month
 * risk-adjusted return) and R is the signals' correlation matrix across the
 * universe. Multiplying by R⁻¹ stops correlated signals from being counted
 * twice. With realistic ICs of 0.02–0.05 the stock-specific view moves the
 * forecast by a few percent, not tens of percent.
 *
 * The spread of outcomes comes from the stock's volatility σ (implied, realised
 * or estimated from the 52-week range) and a fat-tailed shape: a Student-t with
 * 5 degrees of freedom by default, or the empirical shape measured by the
 * pipeline's backtest. Log-returns are centred so that the mean simple return
 * equals E[R].
 *
 * Works in the browser (window.Forecast) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Forecast = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var YEAR_DAYS = 252;

  /*
   * Signals. `ic` is the prior information coefficient at a 3-month horizon.
   * Every signal is oriented so a higher value is better (positive IC).
   * `needs: "prices"` signals only exist after the pipeline has run.
   */
  var SIGNALS = [
    {
      key: "street", label: "Analyst target upside", short: "Analyst upside", ic: 0.03,
      desc: "Log of the mean 12-month analyst target over the price. Targets are optimistic on average; only a stock's upside relative to the other AI names counts.",
      ref: "Brav & Lehavy (2003); Da & Schaumburg (2011)"
    },
    {
      key: "high52", label: "Closeness to 52-week high", short: "Near 52-wk high", ic: 0.04,
      desc: "Log of price over the 52-week high (0 at the high). Stocks near their highs tend to keep outperforming because investors under-react to good news.",
      ref: "George & Hwang (2004)"
    },
    {
      key: "growth", label: "Revenue growth", short: "Revenue growth", ic: 0.03,
      desc: "Log of one plus the latest reported year-on-year revenue growth. Fundamental momentum carries into returns over the following quarters.",
      ref: "Chan, Jegadeesh & Lakonishok (1996); Jegadeesh & Livnat (2006)"
    },
    {
      key: "mom", label: "12-month momentum (ex. last month)", short: "12-1 momentum", ic: 0.04, needs: "prices",
      desc: "Log return from 12 months ago to 1 month ago. Winners over the past year tend to keep winning for several months.",
      ref: "Jegadeesh & Titman (1993)"
    },
    {
      key: "rev", label: "Last-month reversal", short: "1-month reversal", ic: 0.02, needs: "prices",
      desc: "Minus the last month's log return. Very short-term moves partly reverse.",
      ref: "Jegadeesh (1990); Lehmann (1990)"
    }
  ];

  var DEFAULTS = {
    horizonDays: 63,      // ~3 months of trading days
    rf: 0.0411,           // annual, 3-month T-bill
    erp: 0.05,            // annual equity risk premium
    marketVol: 0.16,      // annual S&P 500 volatility
    market3m: null,       // S&P 500 3-month return; null = (rf + erp)·T
    icScale: 1,           // multiplies every IC; 0 gives a market-only model
    icMeasuredWeight: 0.5,// weight on backtest-measured ICs vs the priors
    corrShrink: 0.5,      // shrink the signal correlation matrix toward identity
    winsor: 2.5,          // clamp z-scores to ±winsor
    alphaCap: 0.3,        // |α| ≤ alphaCap · σ·√T
    tailNu: 5,            // Student-t degrees of freedom for the outcome shape
    betaMin: 0.3, betaMax: 2.2,
    volMin: 0.15, volMax: 1.2
  };

  // Without measured betas, a segment's typical beta is scaled by listing
  // region: stocks that trade outside U.S. hours co-move less with the S&P 500.
  var REGION_BETA = { US: 1, ADR: 0.85, Europe: 0.8, Asia: 0.55 };

  var QUANTILES = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];

  /* ------------------------------------------------------------------ */
  /* Distributions                                                       */
  /* ------------------------------------------------------------------ */
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7).
  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return sign * y;
  }
  function normCdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

  // Acklam's inverse normal CDF (relative error < 1.2e-9).
  function normInv(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
    var b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    var c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    var d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    var q, r;
    if (p < 0.02425) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > 1 - 0.02425) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  function logGamma(x) {
    var g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    var ser = 1.000000000190015;
    for (var j = 0; j < 6; j++) ser += g[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  // Continued fraction for the incomplete beta function (Numerical Recipes).
  function betacf(a, b, x) {
    var qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    var h = d;
    for (var m = 1; m <= 200; m++) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      var del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 3e-12) break;
    }
    return h;
  }
  function incBeta(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }

  // Student-t CDF and quantile with nu degrees of freedom.
  function tCdf(t, nu) {
    var x = nu / (nu + t * t);
    var tail = 0.5 * incBeta(nu / 2, 0.5, x);
    return t >= 0 ? 1 - tail : tail;
  }
  function tInv(p, nu) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;
    // Bisection on a bracket that is wide enough for p in [1e-9, 1 - 1e-9].
    var lo = -1e3, hi = 1e3;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2;
      if (tCdf(mid, nu) < p) lo = mid; else hi = mid;
      if (hi - lo < 1e-10) break;
    }
    return (lo + hi) / 2;
  }

  /*
   * An outcome "shape" is a unit-variance distribution for the standardised
   * log-return, exposing q(p) (quantile) and cdf(z).
   */
  function tShape(nu) {
    var k = Math.sqrt((nu - 2) / nu); // scale that gives unit variance
    return {
      name: "Student-t (" + nu + " d.f.)",
      q: function (p) { return tInv(p, nu) * k; },
      cdf: function (z) { return tCdf(z / k, nu); }
    };
  }
  function normalShape() {
    return { name: "Normal", q: normInv, cdf: normCdf };
  }
  // Empirical shape from sorted (p, z) knots. Between knots z is interpolated
  // against the normal score of p, which is exact for any normal and close for
  // smooth fat tails. Beyond the outer knots the Student-t takes over, rescaled
  // to meet the outer knot.
  function empiricalShape(ps, zs, nu) {
    var t = tShape(nu || 5);
    var n = ps.length, us = ps.map(normInv);
    function q(p) {
      if (p <= ps[0]) return t.q(p) * zs[0] / t.q(ps[0]);
      if (p >= ps[n - 1]) return t.q(p) * zs[n - 1] / t.q(ps[n - 1]);
      var u = normInv(p);
      for (var i = 1; i < n; i++) {
        if (p <= ps[i]) return zs[i - 1] + (u - us[i - 1]) / (us[i] - us[i - 1]) * (zs[i] - zs[i - 1]);
      }
      return zs[n - 1];
    }
    function cdf(z) {
      if (z <= zs[0]) return t.cdf(z * t.q(ps[0]) / zs[0]);
      if (z >= zs[n - 1]) return t.cdf(z * t.q(ps[n - 1]) / zs[n - 1]);
      for (var i = 1; i < n; i++) {
        if (z <= zs[i]) {
          var w = (z - zs[i - 1]) / ((zs[i] - zs[i - 1]) || 1e-12);
          return normCdf(us[i - 1] + w * (us[i] - us[i - 1]));
        }
      }
      return ps[n - 1];
    }
    return { name: "Empirical (backtest)", q: q, cdf: cdf };
  }

  // P(max_{t≤T} S_t/S_0 ≥ k) for GBM with drift mu and volatility sigma (k > 1).
  function pTouchUp(k, mu, sigma, T) {
    var b = Math.log(k);
    if (b <= 0) return 1;
    var nu = mu - 0.5 * sigma * sigma;
    var sT = sigma * Math.sqrt(T);
    var p = 1 - normCdf((b - nu * T) / sT) + Math.exp(2 * nu * b / (sigma * sigma)) * normCdf((-b - nu * T) / sT);
    return clamp(p, 0, 1);
  }

  /* ------------------------------------------------------------------ */
  /* Linear algebra (tiny, dense)                                        */
  /* ------------------------------------------------------------------ */
  // Solve A·x = b by Gauss-Jordan elimination with partial pivoting.
  function solve(A, b) {
    var n = b.length, M = A.map(function (row, i) { return row.slice().concat([b[i]]); });
    for (var col = 0; col < n; col++) {
      var piv = col;
      for (var r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-12) throw new Error("singular matrix");
      var tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === col) continue;
        var f = M[r2][col] / M[col][col];
        for (var c = col; c <= n; c++) M[r2][c] -= f * M[col][c];
      }
    }
    return M.map(function (row, i) { return row[n] / row[i]; });
  }

  /*
   * Combine signals: w = (shrunk R)⁻¹ · ic. With uncorrelated signals w = ic;
   * with two identical signals each gets half the weight, so nothing is
   * double-counted.
   */
  function combineWeights(ics, corr, shrink) {
    var n = ics.length;
    if (!n) return [];
    var R = corr.map(function (row, i) {
      return row.map(function (v, j) { return i === j ? 1 : (1 - shrink) * v; });
    });
    return solve(R, ics);
  }

  /* ------------------------------------------------------------------ */
  /* Per-stock inputs                                                    */
  /* ------------------------------------------------------------------ */
  // Volatility from the 52-week range. A plain range estimator overstates σ
  // for stocks that trended all year, so the trend (the asymmetry of the price
  // inside its range) is taken out first, keeping at least half the range.
  function rangeVol(price, hi, lo) {
    if (!(hi > 0 && lo > 0 && price > 0) || hi <= lo) return null;
    var L = Math.log(hi / lo);
    var d = Math.abs(Math.log(price / lo) - Math.log(hi / price));
    var adj = Math.sqrt(Math.max(L * L - d * d, 0.25 * L * L));
    return adj / 1.596; // E[range] of a unit Brownian motion over one year
  }

  // Annual volatility, best source first: option-implied, measured from daily
  // prices, then the 52-week range blended with the segment's typical level.
  function volEstimate(s, gen, seg, P) {
    var ivNow = s.iv != null ? s.iv / 100 : null;
    // Implied vol mean-reverts; the typical level sits in the lower part of
    // its 52-week range because spikes stretch the top.
    var ivTyp = s.ivLo != null && s.ivHi != null ? (s.ivLo + (s.ivHi - s.ivLo) / 4) / 100 : null;
    var sIV = ivNow != null ? (ivTyp != null ? 0.75 * ivNow + 0.25 * ivTyp : ivNow) : ivTyp;
    var sHist = gen && gen.vol63 > 0 && gen.vol252 > 0 ? Math.sqrt(0.5 * gen.vol63 * gen.vol63 + 0.5 * gen.vol252 * gen.vol252) : null;
    var prior = (seg && seg.vol) || 0.45;
    var sigma, source;
    if (sIV != null && sHist != null) { sigma = 0.5 * sIV + 0.5 * sHist; source = "Implied + measured"; }
    else if (sIV != null) { sigma = sIV; source = ivNow != null ? "Implied (options)" : "Typical implied (options)"; }
    else if (sHist != null) { sigma = sHist; source = "Measured (daily prices)"; }
    else {
      var sR = rangeVol(s.price, s.hi52, s.lo52);
      if (sR != null) { sigma = Math.sqrt(sR * sR / 3 + 2 * prior * prior / 3); source = "52-week range + segment prior"; }
      else { sigma = prior; source = "Segment prior"; }
    }
    return { sigma: clamp(sigma, P.volMin, P.volMax), source: source, implied: sIV, measured: sHist };
  }

  function betaEstimate(s, sigma, gen, seg, P) {
    if (gen && gen.beta != null && isFinite(gen.beta)) {
      // Blume adjustment: measured betas regress toward 1.
      return { beta: clamp(0.67 * gen.beta + 0.33, P.betaMin, P.betaMax), source: "Measured vs S&P 500 (Blume-adjusted)" };
    }
    var segBeta = (seg && seg.beta) || 1.2, segVol = (seg && seg.vol) || 0.45;
    var reg = REGION_BETA[s.region] != null ? REGION_BETA[s.region] : 1;
    return {
      beta: clamp(segBeta * reg * Math.sqrt(sigma / segVol), P.betaMin, P.betaMax),
      source: "Estimated from segment, listing and volatility"
    };
  }

  function rawSignals(s, gen) {
    var price = gen && gen.price > 0 ? gen.price : s.price;
    var hi = gen && gen.hi52 > 0 ? gen.hi52 : s.hi52;
    return {
      street: s.target > 0 && price > 0 ? Math.log(s.target / price) : null,
      high52: hi > 0 && price > 0 ? Math.min(0, Math.log(price / hi)) : null,
      growth: s.growth != null && s.growth > -99 ? Math.log(1 + s.growth / 100) : null,
      mom: gen && gen.mom12_1 != null && gen.mom12_1 > -0.99 ? Math.log(1 + gen.mom12_1) : null,
      rev: gen && gen.ret1m != null && gen.ret1m > -0.99 ? -Math.log(1 + gen.ret1m) : null
    };
  }

  /* ------------------------------------------------------------------ */
  /* Dates                                                               */
  /* ------------------------------------------------------------------ */
  function parseDate(iso) { var p = iso.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function isoDate(d) { return d.toISOString().slice(0, 10); }
  // Weekdays only; exchange holidays are ignored (a day or two over 3 months).
  function addTradingDays(iso, n) {
    var d = parseDate(iso);
    while (n > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      var wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) n--;
    }
    return isoDate(d);
  }
  function tradingDaysBetween(fromIso, toIso) {
    var a = parseDate(fromIso), b = parseDate(toIso), n = 0;
    if (b <= a) return 0;
    while (a < b) {
      a.setUTCDate(a.getUTCDate() + 1);
      var wd = a.getUTCDay();
      if (wd !== 0 && wd !== 6) n++;
    }
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* The model                                                           */
  /* ------------------------------------------------------------------ */
  function mean(xs) { return xs.reduce(function (a, b) { return a + b; }, 0) / xs.length; }

  /*
   * build(universe, generated, params) → model with one forecast per stock.
   * `generated` is the pipeline output (window.AI_GENERATED) or null.
   */
  function build(universe, generated, params) {
    var P = Object.assign({}, DEFAULTS, params || {});
    var gen = generated || null;
    var genStocks = (gen && gen.stocks) || {};
    var backtest = gen && gen.backtest;
    var T = P.horizonDays / YEAR_DAYS;
    var segs = {};
    (universe.segments || []).forEach(function (s) { segs[s.key] = s; });

    var stocks = universe.stocks.map(function (s) {
      var g = genStocks[s.t] || null;
      var v = volEstimate(s, g, segs[s.seg], P);
      var b = betaEstimate(s, v.sigma, g, segs[s.seg], P);
      return { s: s, g: g, vol: v, beta: b, raw: rawSignals(s, g) };
    });

    // Cross-sectional z-scores per signal.
    var signals = SIGNALS.map(function (sig) {
      var vals = stocks.map(function (x) { return x.raw[sig.key]; }).filter(function (v) { return v != null && isFinite(v); });
      var active = vals.length >= 5;
      var mu = active ? mean(vals) : 0;
      var sd = active ? Math.sqrt(mean(vals.map(function (v) { return (v - mu) * (v - mu); }))) : 0;
      if (!(sd > 1e-12)) active = false;
      var measured = backtest && backtest.ic && backtest.ic[sig.key];
      var ic = sig.ic;
      var icSource = "Prior (literature)";
      if (measured && measured.mean != null && isFinite(measured.mean)) {
        ic = clamp(P.icMeasuredWeight * measured.mean + (1 - P.icMeasuredWeight) * sig.ic, -0.1, 0.1);
        icSource = "Backtest-weighted";
      }
      return Object.assign({}, sig, {
        active: active, mean: mu, sd: sd, n: vals.length,
        icPrior: sig.ic, icMeasured: measured ? measured.mean : null, icSource: icSource,
        icUsed: ic * P.icScale
      });
    });
    var activeSigs = signals.filter(function (s) { return s.active; });

    stocks.forEach(function (x) {
      x.z = {};
      signals.forEach(function (sig) {
        var v = x.raw[sig.key];
        x.z[sig.key] = sig.active && v != null && isFinite(v) ? clamp((v - sig.mean) / sig.sd, -P.winsor, P.winsor) : 0;
      });
    });

    // Correlation of the (zero-filled) z-scores across the universe.
    var corr = activeSigs.map(function (a) {
      return activeSigs.map(function (b) {
        var za = stocks.map(function (x) { return x.z[a.key]; }), zb = stocks.map(function (x) { return x.z[b.key]; });
        var den = Math.sqrt(mean(za.map(function (v) { return v * v; })) * mean(zb.map(function (v) { return v * v; })));
        return den > 0 ? mean(za.map(function (v, i) { return v * zb[i]; })) / den : 0;
      });
    });
    var weights = combineWeights(activeSigs.map(function (s) { return s.icUsed; }), corr, P.corrShrink);
    activeSigs.forEach(function (s, i) { s.weight = weights[i]; });
    signals.forEach(function (s) { if (!s.active) s.weight = 0; });

    var shape = backtest && backtest.zq && backtest.zq.p && backtest.zq.p.length >= 3
      ? empiricalShape(backtest.zq.p, backtest.zq.z, P.tailNu)
      : tShape(P.tailNu);

    var rfT = P.rf * T;
    var M = P.market3m != null ? P.market3m : (P.rf + P.erp) * T;

    var results = stocks.map(function (x) {
      return forecastOne(x, { T: T, rfT: rfT, M: M, P: P, shape: shape, signals: activeSigs });
    });
    var byTicker = {};
    results.forEach(function (r) { byTicker[r.t] = r; });

    return {
      params: P, T: T, rfT: rfT, market3m: M, shape: shape.name,
      signals: signals, corr: corr, corrKeys: activeSigs.map(function (s) { return s.key; }),
      stocks: results, byTicker: byTicker, live: !!gen
    };
  }

  function forecastOne(x, ctx) {
    var s = x.s, g = x.g, P = ctx.P, T = ctx.T;
    var sigma = x.vol.sigma, beta = x.beta.beta;
    var sigmaResid = Math.sqrt(Math.max(sigma * sigma - beta * beta * P.marketVol * P.marketVol, Math.pow(0.25 * sigma, 2)));
    var scale = sigmaResid * Math.sqrt(T);

    var contribs = ctx.signals.map(function (sig) {
      return { key: sig.key, label: sig.label, short: sig.short, raw: x.raw[sig.key], z: x.z[sig.key], value: scale * sig.weight * x.z[sig.key] };
    });
    var alpha = contribs.reduce(function (a, c) { return a + c.value; }, 0);
    var cap = P.alphaCap * sigma * Math.sqrt(T);
    if (Math.abs(alpha) > cap) {
      var k = cap / Math.abs(alpha);
      contribs.forEach(function (c) { c.value *= k; });
      alpha *= k;
    }

    var mkt = beta * (ctx.M - ctx.rfT);
    var er = ctx.rfT + mkt + alpha;
    var sT = sigma * Math.sqrt(T);
    var m = Math.log(1 + er) - 0.5 * sT * sT; // log-median over the horizon

    var price = g && g.price > 0 ? g.price : s.price;
    var start = g && g.asOf ? g.asOf : s.asOf;
    var q = {};
    QUANTILES.forEach(function (p) { q[p] = Math.exp(m + sT * ctx.shape.q(p)) - 1; });

    function pAbove(r) { return 1 - ctx.shape.cdf((Math.log(1 + r) - m) / sT); }

    // Weekly points for the fan chart; the spread widens with √time.
    function pathPoint(days) {
      var f = days / P.horizonDays, pt = { days: days, date: addTradingDays(start, days) };
      QUANTILES.forEach(function (p) { pt[p] = price * Math.exp(f * m + sT * Math.sqrt(f) * ctx.shape.q(p)); });
      pt.mean = price * Math.pow(1 + er, f);
      return pt;
    }
    var path = [];
    for (var d = 0; d < P.horizonDays; d += 5) path.push(pathPoint(d));
    path.push(pathPoint(P.horizonDays));

    var endDate = addTradingDays(start, P.horizonDays);
    var earningsIn = s.earnings && s.earnings > start && s.earnings <= endDate;
    var targetMultiple = s.target > 0 ? s.target / price : null;

    return {
      t: s.t, stock: s, gen: g, price: price, start: start, end: endDate,
      sigma: sigma, volSource: x.vol.source, volImplied: x.vol.implied, volMeasured: x.vol.measured,
      beta: beta, betaSource: x.beta.source, sigmaResid: sigmaResid,
      rf: ctx.rfT, market: mkt, alpha: alpha, er: er, contribs: contribs,
      median: q[0.5], q: q, logMedian: m, logSd: sT,
      expectedPrice: price * (1 + er), medianPrice: price * (1 + q[0.5]),
      pGain: pAbove(0), pAbove: pAbove,
      pUp10: pAbove(0.10), pUp20: pAbove(0.20), pDown10: 1 - pAbove(-0.10), pDown20: 1 - pAbove(-0.20),
      pBeatMarket: pAbove(ctx.M),
      targetMultiple: targetMultiple,
      pTouchTarget: targetMultiple && targetMultiple > 1 ? pTouchUp(targetMultiple, Math.log(1 + er) / T, sigma, T) : null,
      earningsInWindow: !!earningsIn, earningsDaysOut: earningsIn ? tradingDaysBetween(start, s.earnings) : null,
      path: path
    };
  }

  return {
    SIGNALS: SIGNALS, DEFAULTS: DEFAULTS, QUANTILES: QUANTILES, REGION_BETA: REGION_BETA,
    normCdf: normCdf, normInv: normInv, tCdf: tCdf, tInv: tInv,
    tShape: tShape, normalShape: normalShape, empiricalShape: empiricalShape,
    pTouchUp: pTouchUp, solve: solve, combineWeights: combineWeights,
    rangeVol: rangeVol, volEstimate: volEstimate, betaEstimate: betaEstimate, rawSignals: rawSignals,
    addTradingDays: addTradingDays, tradingDaysBetween: tradingDaysBetween,
    build: build
  };
});
