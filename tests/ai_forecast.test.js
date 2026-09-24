// Run: node tests/ai_forecast.test.js
// Checks the 3-month forecast engine (ai-forecast/assets/forecast.js) and the
// research snapshot it runs on (ai-forecast/data/universe.js).
const assert = require("assert");
const F = require("../ai-forecast/assets/forecast.js");

global.window = {};
require("../ai-forecast/data/universe.js");
const U = window.AI_UNIVERSE;

function close(a, b, tol, msg) { assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`); }
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
// Standardised (unit-variance) Student-t draw: Z / sqrt(chi2_nu / nu), rescaled.
function stdT(r, nu) {
  let chi = 0;
  for (let i = 0; i < nu; i++) { const g = gauss(r); chi += g * g; }
  return gauss(r) / Math.sqrt(chi / nu) * Math.sqrt((nu - 2) / nu);
}

/* ---------------- distributions ---------------- */
close(F.normCdf(1.959964), 0.975, 1e-6, "normCdf");
for (const p of [0.001, 0.02, 0.1, 0.5, 0.8, 0.99, 0.9995]) close(F.normCdf(F.normInv(p)), p, 1e-6, "normInv round trip");
// Student-t critical values from standard tables.
close(F.tInv(0.975, 5), 2.5706, 1e-4, "t 0.975 nu=5");
close(F.tInv(0.95, 10), 1.8125, 1e-4, "t 0.95 nu=10");
close(F.tInv(0.995, 3), 5.8409, 1e-3, "t 0.995 nu=3");
close(F.tCdf(2.015, 5), 0.95, 1e-4, "tCdf nu=5");
close(F.tCdf(0, 7), 0.5, 1e-12, "tCdf symmetric");
{
  const sh = F.tShape(5);
  for (const p of [0.05, 0.25, 0.5, 0.9]) close(sh.cdf(sh.q(p)), p, 1e-6, "tShape cdf(q(p))");
  // Unit variance: compare with the variance of simulated standardised draws.
  const r = rng(7); let s2 = 0; const n = 200000;
  for (let i = 0; i < n; i++) { const z = stdT(r, 5); s2 += z * z; }
  close(s2 / n, 1, 0.05, "tShape unit variance");
  const qs = [0.05, 0.25, 0.5, 0.75, 0.95];
  const emp = F.empiricalShape(qs, qs.map(sh.q), 5);
  for (const p of [0.01, 0.1, 0.3, 0.6, 0.97]) close(emp.q(p), sh.q(p), p > 0.05 && p < 0.95 ? 0.05 : 1e-9, "empirical ≈ t inside, = t outside");
  for (const z of [-2, -0.5, 0.4, 1.8]) close(emp.q(emp.cdf(z)), z, 1e-6, "empirical q(cdf(z))");
}

/* ---------------- linear algebra & signal combination ---------------- */
{
  const x = F.solve([[4, 1, 0], [1, 3, 1], [0, 1, 2]], [1, 2, 3]);
  const A = [[4, 1, 0], [1, 3, 1], [0, 1, 2]];
  A.forEach((row, i) => close(row.reduce((a, v, j) => a + v * x[j], 0), [1, 2, 3][i], 1e-12, "solve"));
  // Uncorrelated signals keep their ICs; identical signals share one IC.
  const w0 = F.combineWeights([0.03, 0.04], [[1, 0], [0, 1]], 0);
  close(w0[0], 0.03, 1e-12, "uncorrelated w1"); close(w0[1], 0.04, 1e-12, "uncorrelated w2");
  const w1 = F.combineWeights([0.04, 0.04], [[1, 0.999999], [0.999999, 1]], 0);
  close(w1[0] + w1[1], 0.04, 1e-6, "duplicate signal is not double-counted");
}

/* ---------------- GBM touch probability vs Monte Carlo ---------------- */
{
  const mu = 0.2, sigma = 0.6, T = 0.25, k = 1.25, steps = 252, paths = 20000, r = rng(3);
  let hit = 0;
  for (let p = 0; p < paths; p++) {
    let x = 0;
    for (let i = 0; i < steps; i++) {
      x += (mu - sigma * sigma / 2) * T / steps + sigma * Math.sqrt(T / steps) * gauss(r);
      if (x >= Math.log(k)) { hit++; break; }
    }
  }
  const cf = F.pTouchUp(k, mu, sigma, T);
  console.log(`pTouchUp closed form ${cf.toFixed(3)} vs MC ${(hit / paths).toFixed(3)}`);
  assert(cf >= hit / paths - 0.005 && cf - hit / paths < 0.03, "pTouchUp vs Monte Carlo");
}

/* ---------------- dates ---------------- */
assert.strictEqual(F.addTradingDays("2026-09-25", 1), "2026-09-28", "Fri + 1 trading day = Mon");
assert.strictEqual(F.addTradingDays("2026-09-23", 63), "2026-12-21", "63 trading days (weekdays only)");
assert.strictEqual(F.tradingDaysBetween("2026-09-23", "2026-12-21"), 63);

/* ---------------- universe snapshot ---------------- */
const tickers = new Set();
const segKeys = new Set(U.segments.map((s) => s.key));
for (const s of U.stocks) {
  assert(!tickers.has(s.t), "duplicate ticker " + s.t); tickers.add(s.t);
  for (const k of ["t", "y", "n", "seg", "ai", "region", "ccy", "mcap", "price", "asOf", "target", "why", "thesis"]) assert(s[k] != null && s[k] !== "", `${s.t} missing ${k}`);
  assert(segKeys.has(s.seg), `${s.t} unknown segment`);
  assert(["core", "major", "adjacent"].includes(s.ai), `${s.t} bad ai exposure`);
  assert(s.mcap >= U.threshold, `${s.t} below the $${U.threshold}B threshold`);
  assert(s.price > 0 && s.target > 0, `${s.t} bad price/target`);
  assert(/^2026-09-\d\d$/.test(s.asOf), `${s.t} stale price date ${s.asOf}`);
  if (s.hi52) assert(s.price <= s.hi52 * 1.02, `${s.t} price above 52-week high`);
  if (s.lo52) assert(s.price >= s.lo52 * 0.98 && s.lo52 < s.hi52, `${s.t} bad 52-week range`);
  if (s.iv != null) assert(s.iv > 5 && s.iv < 200, `${s.t} implausible IV`);
  if (s.ivLo != null) assert(s.ivLo < s.ivHi, `${s.t} bad IV range`);
  assert(/^\d{4}-\d\d-\d\d$/.test(s.earnings), `${s.t} bad earnings date`);
  assert(s.src.length && s.src.every((id) => U.sources[id]), `${s.t} cites a missing source`);
}
assert(U.nearMisses.every((x) => x.mcap < U.threshold && U.sources[x.src]), "near misses are below the threshold and cited");
assert(Object.values(U.sources).every((x) => /^https:\/\//.test(x.u) && x.t), "sources have titles and https URLs");
console.log(`universe: ${U.stocks.length} stocks, ${Object.keys(U.sources).length} sources`);

/* ---------------- the model ---------------- */
const model = F.build(U, null, {});
assert.strictEqual(model.stocks.length, U.stocks.length);
for (const r of model.stocks) {
  // Decomposition adds up.
  close(r.rf + r.market + r.contribs.reduce((a, c) => a + c.value, 0), r.er, 1e-12, `${r.t} decomposition`);
  close(r.alpha, r.contribs.reduce((a, c) => a + c.value, 0), 1e-12, `${r.t} alpha`);
  assert(Math.abs(r.alpha) <= model.params.alphaCap * r.sigma * Math.sqrt(model.T) + 1e-12, `${r.t} alpha cap`);
  // Quantiles increase with p, both at the horizon and along the path.
  const qs = F.QUANTILES.map((p) => r.q[p]);
  qs.slice(1).forEach((v, i) => assert(v > qs[i], `${r.t} quantiles not increasing`));
  r.path.forEach((pt) => F.QUANTILES.slice(1).forEach((p, i) => assert(pt[p] >= pt[F.QUANTILES[i]], `${r.t} path quantiles`)));
  assert.strictEqual(r.path[0].days, 0); close(r.path[0][0.5], r.price, 1e-9, `${r.t} path starts at price`);
  assert.strictEqual(r.path[r.path.length - 1].days, model.params.horizonDays);
  close(r.path[r.path.length - 1][0.5], r.price * (1 + r.median), 1e-6, `${r.t} path ends at the median`);
  assert(r.pGain > 0.3 && r.pGain < 0.7, `${r.t} P(gain) implausible`);
  assert(r.pDown20 < r.pDown10 && r.pUp20 < r.pUp10, `${r.t} tail probabilities ordered`);
  assert(r.beta >= model.params.betaMin && r.beta <= model.params.betaMax);
  assert(r.sigma >= model.params.volMin && r.sigma <= model.params.volMax);
}
// Simulate one stock's outcome distribution and check the mean and quantiles.
{
  const r = model.byTicker.MU, rr = rng(11), n = 100000, xs = [];
  let sum = 0;
  for (let i = 0; i < n; i++) { const R = Math.exp(r.logMedian + r.logSd * stdT(rr, 5)) - 1; xs.push(R); sum += R; }
  xs.sort((a, b) => a - b);
  for (const p of [0.1, 0.5, 0.9]) close(xs[Math.floor(p * n)], r.q[p], 0.01, `MU simulated q${p}`);
  close(xs.filter((x) => x > 0).length / n, r.pGain, 0.01, "MU simulated P(gain)");
  // Fat tails push the simulated mean slightly above E[R]; it should be close.
  close(sum / n, r.er, 0.012, "MU simulated mean ≈ E[R]");
}
// A market-only model: no stock-specific view.
{
  const m0 = F.build(U, null, { icScale: 0 });
  m0.stocks.forEach((r) => { close(r.alpha, 0, 1e-15, "icScale 0"); close(r.er, r.rf + r.beta * (m0.market3m - m0.rfT), 1e-15, "market-only E[R]"); });
}
// A stronger market scenario raises every stock by beta × the change.
{
  const a = F.build(U, null, { market3m: 0.0 }), b = F.build(U, null, { market3m: 0.05 });
  a.stocks.forEach((r, i) => close(b.stocks[i].er - r.er, r.beta * 0.05, 1e-12, `${r.t} market sensitivity`));
}
// Signals are cross-sectional: z-scores average to ~0 and weights are finite.
model.signals.filter((s) => s.active).forEach((s) => {
  const zs = model.stocks.map((r) => r.contribs.find((c) => c.key === s.key).z);
  close(zs.reduce((a, v) => a + v, 0) / zs.length, 0, 0.12, `${s.key} z mean`);
  assert(isFinite(s.weight) && s.weight > 0, `${s.key} weight`);
});
// Price-history signals stay off without pipeline data.
assert(!model.signals.find((s) => s.key === "mom").active && !model.signals.find((s) => s.key === "rev").active);

/* ---------------- pipeline data switches in measured inputs ---------------- */
{
  const gen = {
    generatedAt: "2026-09-24T00:00:00Z",
    stocks: {},
    backtest: { ic: { mom: { mean: 0.06, t: 2.5, n: 100 }, high52: { mean: 0.02, t: 1, n: 100 } }, zq: { p: [0.05, 0.25, 0.5, 0.75, 0.95], z: [-1.7, -0.62, 0.02, 0.64, 1.6] } }
  };
  U.stocks.forEach((s, i) => { gen.stocks[s.t] = { asOf: "2026-09-24", price: s.price * 1.01, hi52: s.hi52 || s.price * 1.2, lo52: s.lo52 || s.price * 0.6, vol63: 0.4, vol252: 0.5, beta: 1.3, mom12_1: (i % 7) / 10 - 0.2, ret1m: (i % 5) / 20 - 0.1 }; });
  const g = F.build(U, gen, {});
  const mom = g.signals.find((s) => s.key === "mom");
  assert(mom.active && mom.icSource === "Backtest-weighted", "momentum active with measured IC");
  close(mom.icUsed, 0.5 * 0.06 + 0.5 * 0.04, 1e-12, "measured IC shrunk toward prior");
  assert(/Empirical/.test(g.shape), "empirical shape used");
  const nv = g.byTicker.NVDA;
  close(nv.price, U.stocks.find((s) => s.t === "NVDA").price * 1.01, 1e-9, "pipeline price used");
  assert.strictEqual(nv.start, "2026-09-24");
  close(nv.beta, 0.67 * 1.3 + 0.33, 1e-12, "Blume-adjusted measured beta");
  assert(/Implied \+ measured/.test(nv.volSource), "implied and measured vol blended");
}

console.log("ai forecast tests passed");
