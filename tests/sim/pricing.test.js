// Run: node tests/sim/pricing.test.js
const { core, test, done, near, assert } = require("./harness");
const P = core("pricing"), Cal = core("calendar");

test("normal CDF matches known values", () => {
  near(P.normCdf(0), 0.5, 1e-12);
  near(P.normCdf(1.959963985), 0.975, 1e-9);
  near(P.normCdf(-3), 0.0013498980316301, 1e-12);
});

test("Black–Scholes reference price (Hull: S=K=100, r=5%, σ=20%, T=1)", () => {
  near(P.bsPrice(100, 100, 1, 0.05, 0, 0.2, true), 10.450583572185565, 1e-9);
  near(P.bsPrice(100, 100, 1, 0.05, 0, 0.2, false), 5.573526022256971, 1e-9);
});

test("put–call parity with dividends", () => {
  for (const [S, K, T, r, q, v] of [[120, 100, 0.5, 0.04, 0.02, 0.3], [50, 70, 2, 0.01, 0.03, 0.6], [3000, 3100, 0.1, 0.05, 0.013, 0.15]]) {
    const c = P.bsPrice(S, K, T, r, q, v, true), p = P.bsPrice(S, K, T, r, q, v, false);
    near(c - p, S * Math.exp(-q * T) - K * Math.exp(-r * T), 1e-8);
  }
});

test("Greeks match finite differences", () => {
  const S = 100, K = 105, T = 0.5, r = 0.04, q = 0.01, v = 0.3, h = 1e-3;
  for (const call of [true, false]) {
    const g = P.greeks(S, K, T, r, q, v, call);
    const f = (s, t, vol, rr) => P.bsPrice(s, K, t, rr, q, vol, call);
    near(g.delta, (f(S + h, T, v, r) - f(S - h, T, v, r)) / (2 * h), 1e-6, "delta");
    near(g.gamma, (f(S + h, T, v, r) - 2 * f(S, T, v, r) + f(S - h, T, v, r)) / (h * h), 1e-4, "gamma");
    near(g.vega, (f(S, T, v + h, r) - f(S, T, v - h, r)) / (2 * h) / 100, 1e-6, "vega");
    near(g.rho, (f(S, T, v, r + h) - f(S, T, v, r - h)) / (2 * h) / 100, 1e-6, "rho");
    near(g.theta, -(f(S, T + 1 / 365, v, r) - f(S, T, v, r)), 1e-3, "theta per day");
  }
});

test("implied volatility round-trips", () => {
  for (const v of [0.08, 0.25, 0.9, 2.5]) {
    for (const K of [60, 100, 160]) {
      const call = K > 100; // out-of-the-money side
      if (P.greeks(100, K, 0.75, 0.03, 0.01, v, call).vega < 1e-4) continue; // price carries no volatility information
      const px = P.bsPrice(100, K, 0.75, 0.03, 0.01, v, call);
      near(P.impliedVol(px, 100, K, 0.75, 0.03, 0.01, call), v, 1e-6);
    }
  }
});

test("American floor: option value is never below intrinsic", () => {
  // Deep ITM put with high rates: the European value is below intrinsic.
  assert(P.bsPrice(50, 100, 2, 0.08, 0, 0.2, false) < 50);
  near(P.optionValue(50, 100, 2, 0.08, 0, 0.2, false), 50, 1e-12);
});

test("bond at a coupon date prices at par when yield = coupon", () => {
  const s = Cal.parse("2026-11-15"), m = Cal.parse("2036-11-15");
  const b = P.bondMetrics(0.045, m, s, 0.045, 2);
  near(b.clean, 100, 1e-9); near(b.accrued, 0, 1e-12);
});

test("bond duration and convexity match finite differences", () => {
  const s = Cal.parse("2027-02-10"), m = Cal.parse("2045-08-15"), y = 0.048, h = 1e-5;
  const b = P.bondMetrics(0.03, m, s, y, 2);
  const up = P.bondMetrics(0.03, m, s, y + h, 2).dirty, dn = P.bondMetrics(0.03, m, s, y - h, 2).dirty;
  near(b.modDur, (dn - up) / (2 * h) / b.dirty, 1e-5, "modified duration");
  near(b.convexity, (up + dn - 2 * b.dirty) / (h * h) / b.dirty, 0.05, "convexity");
  assert(b.clean < 100, "discount bond when coupon < yield");
});

test("accrued interest grows linearly between coupons and yield round-trips", () => {
  const m = Cal.parse("2031-06-30");
  const a1 = P.bondMetrics(0.05, m, Cal.parse("2027-01-31"), 0.04, 2).accrued;
  const a2 = P.bondMetrics(0.05, m, Cal.parse("2027-03-31"), 0.04, 2).accrued;
  assert(a2 > a1 && a1 > 0);
  const px = P.bondMetrics(0.05, m, Cal.parse("2027-03-31"), 0.0437, 2).clean;
  near(P.bondYield(px, 0.05, m, Cal.parse("2027-03-31"), 2), 0.0437, 1e-8);
});

test("T-bill priced at a discount to 100", () => {
  const s = Cal.parse("2026-10-01");
  const b = P.bondMetrics(0, s + 91, s, 0.04, 0);
  assert(b.clean < 100 && b.clean > 98.9);
});

done("pricing");
