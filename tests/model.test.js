// Run: node tests/model.test.js
// Verifies the closed-form GBM probabilities against a Monte Carlo simulation.
const assert = require("assert");
const M = require("../assets/js/model.js");

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

function simulate(mu, sigma, T, paths, steps, seed) {
  const r = rng(seed), dt = T / steps, nu = mu - 0.5 * sigma * sigma;
  let end = 0, up = 0, down = 0;
  for (let p = 0; p < paths; p++) {
    let x = 0, hitUp = false, hitDown = false;
    for (let i = 0; i < steps; i++) {
      x += nu * dt + sigma * Math.sqrt(dt) * gauss(r);
      if (x >= Math.LN2) hitUp = true;
      if (x <= -Math.LN2) hitDown = true;
    }
    if (x >= Math.LN2) end++;
    if (hitUp) up++;
    if (hitDown) down++;
  }
  return { end: end / paths, up: up / paths, down: down / paths };
}

// normCdf sanity
assert(Math.abs(M.normCdf(0) - 0.5) < 1e-7);
assert(Math.abs(M.normCdf(1.959964) - 0.975) < 1e-5);

// factor score bounds and risk inversion
const best = { wave: 10, growth: 10, street: 10, smart: 10, asym: 10, size: 10, risk: 0 };
const worst = { wave: 0, growth: 0, street: 0, smart: 0, asym: 0, size: 0, risk: 10 };
assert.strictEqual(Math.round(M.factorScore(best)), 100);
assert.strictEqual(Math.round(M.factorScore(worst)), 0);
assert.strictEqual(M.factorScore(best, { wave: 0, growth: 0, street: 0, smart: 0, asym: 0, size: 0, risk: 0 }), 50);

// closed forms vs Monte Carlo (discrete monitoring slightly under-counts touches)
for (const [mu, sigma] of [[0.2, 1.0], [0.05, 0.5], [-0.1, 0.8]]) {
  const T = 1;
  const mc = simulate(mu, sigma, T, 20000, 504, 42);
  const end = M.pEnd(2, mu, sigma, T), up = M.pTouchUp(2, mu, sigma, T), down = M.pTouchDown(0.5, mu, sigma, T);
  console.log(`mu=${mu} sigma=${sigma}  end ${end.toFixed(3)}/${mc.end.toFixed(3)}  up ${up.toFixed(3)}/${mc.up.toFixed(3)}  down ${down.toFixed(3)}/${mc.down.toFixed(3)}`);
  assert(Math.abs(end - mc.end) < 0.012, "pEnd mismatch");
  assert(Math.abs(up - mc.up) < 0.03 && up >= mc.up - 0.005, "pTouchUp mismatch");
  assert(Math.abs(down - mc.down) < 0.03 && down >= mc.down - 0.005, "pTouchDown mismatch");
  assert(up >= end, "touch must be >= end");
}
console.log("model tests passed");
