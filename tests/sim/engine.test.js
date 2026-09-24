// Run: node tests/sim/engine.test.js
const { core, test, done, near, assert } = require("./harness");
const Sim = core("sim"), Broker = core("broker"), Options = core("options"), Rng = core("rng"), Cal = core("calendar");

function stepDays(W, n) { let closes = 0; while (closes < n) { Sim.step(W); if (W.phase === "closed") { closes++; if (closes < n) Sim.step(W); } } }
function prices(W) { return W.M.lists.stock.map((id) => W.M.assets[id].px); }

test("same seed, same market", () => {
  const a = Sim.newGame({ seed: "det", historyDays: 30 }), b = Sim.newGame({ seed: "det", historyDays: 30 });
  stepDays(a, 3); stepDays(b, 3);
  assert.deepStrictEqual(prices(a), prices(b));
  assert.strictEqual(a.M.news[0].title, b.M.news[0].title);
  const c = Sim.newGame({ seed: "other", historyDays: 30 });
  assert.notDeepStrictEqual(prices(c), prices(a));
});

test("the year of history starts the game in an expansion with full price bars", () => {
  const W = Sim.newGame({ seed: "hist" });
  assert.strictEqual(W.E.regime, "expansion");
  assert(W.M.days.length >= 250);
  assert.strictEqual(W.M.assets.US500.bars.c.length, W.M.days.length);
  assert.strictEqual(Cal.iso(W.day), "2026-09-28");
});

test("save and restore resumes the same game", () => {
  const W = Sim.newGame({ seed: "save", historyDays: 60 });
  Broker.place(W, W.A, { sym: W.M.lists.stock[3], side: "buy", qty: 10, type: "market" });
  stepDays(W, 2);
  const snap = Sim.snapshot(W);
  const R = Sim.restore(snap);
  assert.strictEqual(R.day, W.day); assert.strictEqual(R.rng.s, W.rng.s);
  assert.deepStrictEqual(Object.keys(R.A.pos), Object.keys(W.A.pos));
  stepDays(W, 3); stepDays(R, 3);
  const pa = prices(W), pb = prices(R);
  pa.forEach((x, i) => near(pb[i] / x, 1, 1e-3, "stock " + i));
  near(Broker.summary(R, R.A).nlv, Broker.summary(W, W.A).nlv, 50);
});

test("JSON export/import round-trips", () => {
  const W = Sim.newGame({ seed: "json", historyDays: 30 });
  const txt = Sim.toJSON(W);
  const R = Sim.fromJSON(txt);
  assert.strictEqual(R.M.lists.stock.length, W.M.lists.stock.length);
  const a = W.M.assets.US500.bars.c, b = R.M.assets.US500.bars.c;
  assert.strictEqual(a.length, b.length);
  a.forEach((x, i) => near(b[i] / x, 1, 1e-6));
});

test("a year of random trading never produces NaN or negative prices", () => {
  const W = Sim.newGame({ seed: "fuzz", historyDays: 40, cash: 1000000 });
  const r = new Rng("bot");
  const M = W.M, A = W.A;
  for (let d = 0; d < 252; d++) {
    for (let t = 0; t < 27; t++) {
      Sim.step(W);
      if (r.next() < 0.15) {
        const kind = r.int(0, 7);
        try {
          if (kind === 0) Broker.place(W, A, { sym: r.pick(M.lists.stock), side: r.pick(["buy", "sell"]), qty: r.int(1, 200), type: r.pick(["market", "limit", "stop", "trail"]), limit: 50, stop: 60, trailPct: 3, tif: r.pick(["day", "gtc"]) });
          if (kind === 1) Broker.place(W, A, { sym: r.pick(M.lists.etf), side: r.pick(["buy", "sell"]), qty: r.int(1, 100), type: "market" });
          if (kind === 2) { const u = r.pick(M.lists.stock.slice(0, 50)); const ex = r.pick(Options.expiries(W.day)); Broker.place(W, A, { c: { und: u, exp: ex.day, right: r.pick(["C", "P"]), K: r.pick(Options.strikes(M.assets[u].px, 5)), mult: 100 }, side: r.pick(["buy", "sell"]), qty: r.int(1, 3), type: "market" }); }
          if (kind === 3) Broker.place(W, A, { sym: r.pick(M.lists.future), side: r.pick(["buy", "sell"]), qty: 1, type: "market" });
          if (kind === 4) Broker.place(W, A, { sym: r.pick(M.lists.fx), side: r.pick(["buy", "sell"]), qty: 0.1, type: "market" });
          if (kind === 5) Broker.place(W, A, { sym: r.pick(M.lists.perp), side: r.pick(["buy", "sell"]), qty: 0.5, type: "market", lev: r.int(1, 10) });
          if (kind === 6) Broker.place(W, A, { sym: r.pick(M.lists.bond), side: "buy", qty: 5000, type: "market" });
          if (kind === 7) { const ks = Object.keys(A.pos); if (ks.length) Broker.closePosition(W, A, r.pick(ks)); }
        } catch (e) { throw new Error("order threw on " + Cal.iso(W.day) + ": " + e.stack); }
      }
    }
    A.events.length = 0;
  }
  Object.keys(M.assets).forEach((id) => { const a = M.assets[id]; assert(isFinite(a.px) && a.px > 0, id + " " + a.px); });
  const s = Broker.summary(W, A);
  assert(isFinite(s.nlv) && isFinite(s.maint) && isFinite(A.cash), "account values finite");
  assert(A.ledger.length > 100 && A.hist.length > 100);
});

test("market statistics stay in a realistic range", () => {
  for (const seed of ["stat-a", "stat-b"]) {
    const W = Sim.newGame({ seed: seed, historyDays: 20 });
    const c = [];
    for (let d = 0; d < 252; d++) { stepDays(W, 1); c.push(W.M.assets.US500.px); Sim.step(W); }
    const r = c.slice(1).map((x, i) => Math.log(x / c[i]));
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    const vol = Math.sqrt(r.reduce((a, b) => a + (b - m) * (b - m), 0) / r.length * 252);
    assert(vol > 0.08 && vol < 0.45, seed + " vol " + vol);
    const svx = W.M.assets.SVX.px;
    assert(svx > 8 && svx < 90, "SVX " + svx);
    const y10 = W.E.hist.y10[W.E.hist.y10.length - 1];
    assert(y10 > 0.3 && y10 < 10, "10y " + y10);
  }
});

done("engine");
