// Run: node tests/sim/broker.test.js
const { core, test, done, near, assert } = require("./harness");
const Sim = core("sim"), Broker = core("broker"), Market = core("market"), Options = core("options"), Cal = core("calendar"), P = core("pricing");

function world(opts) { return Sim.newGame(Object.assign({ seed: "broker-tests", historyDays: 40 }, opts || {})); }
// A liquid, not-too-volatile stock (25% maintenance) with a price in a normal range.
function plainStock(W) { return W.M.lists.stock.map((id) => W.M.assets[id]).find((a) => a.sig < 0.4 && a.px > 20 && a.px < 400 && a.dps > 0); }
function place(W, spec) { const r = Broker.place(W, W.A, spec); return r; }
function runUntil(W, pred, max) { for (let i = 0; i < (max || 5000); i++) { if (pred(W)) return true; Sim.step(W); } return pred(W); }
function hasLedger(A, type, re) { return A.ledger.some((l) => l.type === type && (!re || re.test(l.text))); }

test("market buy then sell: cash, average cost, realized P&L and sale fees", () => {
  const W = world(), A = W.A, a = plainStock(W);
  const r = place(W, { sym: a.id, side: "buy", qty: 10, type: "market" });
  assert(r.ok, r.error);
  const buyPx = r.order.fillPx;
  near(A.cash, 100000 - 10 * buyPx, 1e-6);
  assert.strictEqual(A.pos[a.id].qty, 10);
  near(A.pos[a.id].avg, buyPx, 1e-9);
  const cashBefore = A.cash;
  const s = place(W, { sym: a.id, side: "sell", qty: 4, type: "market" });
  const sellPx = s.order.fillPx;
  const fee = Math.ceil(4 * sellPx * Broker.FEES.secFee * 100) / 100 + Math.ceil(4 * Broker.FEES.taf * 100) / 100;
  near(A.cash, cashBefore + 4 * sellPx - fee, 1e-6);
  near(A.stats.realized, 4 * (sellPx - buyPx), 1e-6);
  assert.strictEqual(A.pos[a.id].qty, 6);
});

test("preview matches the actual fill", () => {
  const W = world(), a = plainStock(W);
  const pv = Broker.preview(W, W.A, { sym: a.id, side: "buy", qty: 25, type: "market" });
  const r = place(W, { sym: a.id, side: "buy", qty: 25, type: "market" });
  near(pv.px, r.order.fillPx, 1e-9);
  near(pv.cash, -25 * r.order.fillPx - r.order.fee, 1e-6);
});

test("limit order rests, then fills at the ask once it is at or below the limit", () => {
  const W = world(), A = W.A, a = plainStock(W);
  const lim = Math.round(a.px * 0.9 * 100) / 100;
  const r = place(W, { sym: a.id, side: "buy", qty: 5, type: "limit", limit: lim, tif: "gtc" });
  assert(r.ok && r.order.status === "open");
  a.px = lim * 0.99;
  Broker.onTick(W, A, false);
  assert.strictEqual(r.order.status, "filled");
  assert(r.order.fillPx <= lim);
});

test("stop-loss triggers into a market sell; trailing stop follows the peak", () => {
  const W = world(), A = W.A, a = plainStock(W);
  place(W, { sym: a.id, side: "buy", qty: 10, type: "market" });
  const p0 = a.px;
  const stop = place(W, { sym: a.id, side: "sell", qty: 5, type: "stop", stop: p0 * 0.95, tif: "gtc" }).order;
  const trail = place(W, { sym: a.id, side: "sell", qty: 5, type: "trail", trailPct: 5, tif: "gtc" }).order;
  a.px = p0 * 1.2; Broker.onTick(W, A, false);
  assert.strictEqual(stop.status, "open"); assert.strictEqual(trail.status, "open");
  near(trail.stop, p0 * 1.2 * 0.95, 1e-6, "trail stop moved up with the peak");
  a.px = p0 * 1.12; Broker.onTick(W, A, false);
  assert.strictEqual(trail.status, "filled", "trailing stop fired after a 6.7% pullback");
  assert.strictEqual(stop.status, "open");
  a.px = p0 * 0.9; Broker.onTick(W, A, false);
  assert.strictEqual(stop.status, "filled");
  assert(!A.pos[a.id]);
});

test("day orders expire at the close", () => {
  const W = world(), A = W.A, a = plainStock(W);
  const o = place(W, { sym: a.id, side: "buy", qty: 1, type: "limit", limit: a.px * 0.5 }).order;
  runUntil(W, (w) => w.phase === "closed");
  assert.strictEqual(o.status, "expired");
  assert.strictEqual(A.orders.length, 0);
});

test("cash account: no shorts, no futures, covered calls and cash-secured puts only", () => {
  const W = world({ account: "cash", cash: 100000 }), A = W.A;
  const a = W.M.lists.stock.map((id) => W.M.assets[id]).find((x) => x.sig < 0.4 && x.px > 20 && x.px < 150);
  assert(!place(W, { sym: a.id, side: "sell", qty: 1, type: "market" }).ok, "short rejected");
  const fut = W.M.lists.future[0];
  assert(!place(W, { sym: fut, side: "buy", qty: 1, type: "market" }).ok, "futures rejected");
  const exp = Options.expiries(W.day).find((e) => e.day - W.day > 10).day;
  const K = Options.strikes(a.px, 3)[5];
  const call = { und: a.id, exp: exp, right: "C", K: K, mult: 100 };
  assert(!place(W, { c: call, side: "sell", qty: 1, type: "market" }).ok, "naked call rejected");
  assert(place(W, { sym: a.id, side: "buy", qty: 100, type: "market" }).ok);
  assert(place(W, { c: call, side: "sell", qty: 1, type: "market" }).ok, "covered call allowed");
  assert(!place(W, { c: call, side: "sell", qty: 1, type: "market" }).ok, "second call is not covered");
  const put = { und: a.id, exp: exp, right: "P", K: Options.strikes(a.px, 3)[1], mult: 100 };
  const before = Broker.summary(W, A).available;
  assert(place(W, { c: put, side: "sell", qty: 1, type: "market" }).ok, "cash-secured put allowed");
  const after = Broker.summary(W, A);
  near(after.reserve, put.K * 100, 1e-9);
  assert(after.available < before - put.K * 100 + 1000);
  const tooMany = Math.ceil(after.available / (put.K * 100)) + 1;
  assert(!place(W, { c: put, side: "sell", qty: tooMany, type: "market" }).ok, "put beyond available cash rejected");
});

test("Reg T: 2:1 buying power on marginable stock", () => {
  const W = world(), a = plainStock(W);
  const q = Market.quote(W.M, a.id);
  assert(place(W, { sym: a.id, side: "buy", qty: Math.floor(190000 / q.ask), type: "market" }).ok, "$190k on $100k equity");
  assert(!place(W, { sym: a.id, side: "buy", qty: Math.floor(30000 / q.ask), type: "market" }).ok, "a further $30k exceeds buying power");
  assert(W.A.cash < 0, "cash went negative: a margin loan");
});

test("short sale credits proceeds; maintenance is the greater of 30% or $5 a share", () => {
  const W = world(), A = W.A, a = plainStock(W);
  const r = place(W, { sym: a.id, side: "sell", qty: 100, type: "market" });
  assert(r.ok, r.error);
  assert(A.cash > 100000);
  const req = Broker.requirements(W, A).per[a.id];
  near(req.maint, Math.max(0.3 * 100 * a.px, 5 * 100), 1e-6);
  near(req.init, Math.max(0.5 * 100 * a.px, req.maint), 1e-6);
});

test("margin call when equity < maintenance; liquidation at the deadline", () => {
  const W = world(), A = W.A, a = plainStock(W);
  const q = Market.quote(W.M, a.id);
  place(W, { sym: a.id, side: "buy", qty: Math.floor(190000 / q.ask), type: "market" });
  const p0 = a.px;
  a.px = p0 * 0.62; // equity ≈ $22k vs maintenance ≈ $29k
  Broker.checkMargin(W, A, false);
  assert(A.marginCall, "margin call issued");
  assert(A.pos[a.id], "not liquidated yet");
  W.day = A.marginCall.due;
  Broker.checkMargin(W, A, true);
  const s = Broker.summary(W, A);
  assert(!A.pos[a.id] || s.nlv >= s.maint, "liquidated to restore maintenance");
  assert(hasLedger(A, "liquidation"));
});

test("immediate liquidation below half of maintenance", () => {
  const W = world(), A = W.A, a = plainStock(W);
  const q = Market.quote(W.M, a.id);
  place(W, { sym: a.id, side: "buy", qty: Math.floor(190000 / q.ask), type: "market" });
  a.px *= 0.5; // equity ≈ $5k, far below half of maintenance (≈ $12k)
  Broker.onTick(W, A, false);
  assert(hasLedger(A, "liquidation"));
  const s = Broker.summary(W, A);
  assert(s.nlv >= s.maint);
});

function expiryWorld(opts) {
  const W = world(opts);
  const exp = Options.expiries(W.day).find((e) => e.day > W.day + 2 && e.day < W.day + 12).day;
  return { W, exp };
}

test("long ITM call is exercised at expiry: shares delivered at the strike", () => {
  const { W, exp } = expiryWorld();
  const A = W.A, a = plainStock(W);
  const K = Options.strikes(a.px * 0.6, 1)[1];
  assert(place(W, { c: { und: a.id, exp, right: "C", K, mult: 100 }, side: "buy", qty: 1, type: "market" }).ok);
  runUntil(W, (w) => w.day === exp && w.phase === "closed");
  assert.strictEqual(A.pos[a.id].qty, 100);
  assert(!Object.keys(A.pos).some((k) => A.pos[k].kind === "opt"));
  assert(hasLedger(A, "exercise"));
});

test("short ITM put is assigned: you buy the shares", () => {
  const { W, exp } = expiryWorld();
  const A = W.A, a = plainStock(W);
  const K = Options.strikes(a.px * 1.5, 1)[1];
  assert(place(W, { c: { und: a.id, exp, right: "P", K, mult: 100 }, side: "sell", qty: 1, type: "market" }).ok);
  runUntil(W, (w) => w.day === exp && w.phase === "closed");
  assert.strictEqual(A.pos[a.id].qty, 100);
  assert(hasLedger(A, "assign"));
});

test("index options settle in cash; out-of-the-money options expire worthless", () => {
  const { W, exp } = expiryWorld();
  const A = W.A, ix = W.M.assets.SMALL200;
  const Kitm = Options.strikes(ix.px * 0.9, 1)[1], Kotm = Options.strikes(ix.px * 1.3, 1)[1];
  assert(place(W, { c: { und: "SMALL200", exp, right: "C", K: Kitm, mult: 100 }, side: "buy", qty: 1, type: "market" }).ok);
  const otm = place(W, { c: { und: "SMALL200", exp, right: "C", K: Kotm, mult: 100 }, side: "buy", qty: 1, type: "market" }).order;
  runUntil(W, (w) => w.day === exp && w.phase === "closed");
  assert(!A.pos.SMALL200, "no index position is ever delivered");
  const settle = A.ledger.find((l) => l.type === "expiry" && /cash-settled/.test(l.text));
  near(settle.amount, 100 * (ix.px - Kitm), 0.01);
  const worthless = A.ledger.find((l) => l.type === "expiry" && /worthless/.test(l.text));
  assert(worthless);
  assert(A.stats.realized < 0 || otm.fillPx * 100 > 0);
});

test("strategy-based margin: credit spread needs its max loss; covered call needs nothing extra", () => {
  const W = world(), A = W.A, a = plainStock(W);
  const exp = Options.expiries(W.day).find((e) => e.day - W.day > 20).day;
  const ks = Options.strikes(a.px, 4);
  const short = { und: a.id, exp, right: "P", K: ks[3], mult: 100 }, long = { und: a.id, exp, right: "P", K: ks[1], mult: 100 };
  const r = place(W, { legs: [{ c: short, side: "sell" }, { c: long, side: "buy" }], side: "buy", qty: 2, type: "market" });
  assert(r.ok, r.error);
  const req = Broker.requirements(W, A);
  const qs = Options.price(W, short), ql = Options.price(W, long);
  near(req.per[Options.key(short)].maint, 2 * ((short.K - long.K) * 100 - (qs.mid - ql.mid) * 100), 1e-6);
  near(req.per[Options.key(long)].maint, 0, 1e-9);
  // Covered call
  place(W, { sym: a.id, side: "buy", qty: 100, type: "market" });
  const cc = { und: a.id, exp, right: "C", K: ks[6], mult: 100 };
  place(W, { c: cc, side: "sell", qty: 1, type: "market" });
  near(Broker.requirements(W, A).per[Options.key(cc)].maint, 0, 1e-9);
});

test("naked short put: 20% of the underlying less the OTM amount, floor 10% of strike", () => {
  const W = world(), A = W.A, a = plainStock(W);
  const exp = Options.expiries(W.day).find((e) => e.day - W.day > 20).day;
  const put = { und: a.id, exp, right: "P", K: Options.strikes(a.px * 0.9, 1)[1], mult: 100 };
  place(W, { c: put, side: "sell", qty: 3, type: "market" });
  const otm = Math.max(0, a.px - put.K);
  near(Broker.requirements(W, A).per[Options.key(put)].maint, 3 * 100 * Math.max(0.2 * a.px - otm, 0.1 * put.K), 1e-6);
});

test("portfolio margin charges far less than Reg T for a hedged position", () => {
  const W = world({ account: "pm", cash: 300000 }), A = W.A, a = plainStock(W);
  const exp = Options.expiries(W.day).find((e) => e.day - W.day > 25).day;
  place(W, { sym: a.id, side: "buy", qty: 1000, type: "market" });
  place(W, { c: { und: a.id, exp, right: "P", K: Options.strikes(a.px, 1)[1], mult: 100 }, side: "buy", qty: 10, type: "market" });
  const pm = Broker.requirements(W, A).maint;
  A.type = "margin";
  const regT = Broker.requirements(W, A).maint;
  A.type = "pm";
  assert(pm < regT * 0.6, "PM " + pm + " vs Reg T " + regT);
  assert(pm > 0);
});

test("futures: gains and losses flow to cash; margin scales with notional", () => {
  const W = world(), A = W.A;
  const id = W.M.lists.future.find((f) => W.M.assets[f].root === "FUS");
  const f = W.M.assets[id];
  const c0 = A.cash;
  const b = place(W, { sym: id, side: "buy", qty: 2, type: "market" }).order;
  near(A.cash, c0 - b.fee, 1e-9, "no notional changes hands");
  const req = Broker.requirements(W, A).per[id];
  const rates = Broker.ctrRates(W, f, A.pos[id]);
  near(req.init, 2 * f.mult * f.px * rates[0], 1e-6);
  f.px = b.fillPx + 20;
  const s = place(W, { sym: id, side: "sell", qty: 2, type: "market" }).order;
  near(A.cash, c0 - b.fee - s.fee + 2 * f.mult * (s.fillPx - b.fillPx), 1e-6);
});

test("FX: P&L in the quote currency converts to dollars", () => {
  const W = world(), A = W.A, a = W.M.assets.USDJPY;
  const b = place(W, { sym: "USDJPY", side: "buy", qty: 1, type: "market" }).order;
  a.px = b.fillPx * 1.01;
  const c0 = A.cash;
  const s = place(W, { sym: "USDJPY", side: "sell", qty: 1, type: "market" }).order;
  near(A.cash - c0, Broker.LOT * (s.fillPx - b.fillPx) / a.px, 1e-6);
  assert(A.cash - c0 > 900 && A.cash - c0 < 1000);
});

test("perpetual: leverage sets reserved margin; funding is charged at the close", () => {
  const W = world(), A = W.A, p = W.M.assets["ORB-PERP"];
  assert(place(W, { sym: "ORB-PERP", side: "buy", qty: 1, type: "market", lev: 10 }).ok);
  near(Broker.requirements(W, A).per["ORB-PERP"].init, p.px / 10, 1e-6);
  assert(!place(W, { sym: "ORB-PERP", side: "buy", qty: 1, type: "market", lev: 50 }).ok, "above max leverage");
  runUntil(W, (w) => w.phase === "closed");
  assert(hasLedger(A, "funding") || Math.abs(W.M.assets["ORB-PERP"].funding) < 1e-9);
});

test("bonds: buyer pays accrued interest; principal is repaid at maturity", () => {
  const W = world(), A = W.A, M = W.M;
  const bill = M.lists.bond.map((id) => M.assets[id]).filter((b) => b.cls === "ust" && b.mat > Cal.nextTradingDay(W.day)).sort((x, y) => x.mat - y.mat)[0];
  const note = M.lists.bond.map((id) => M.assets[id]).find((b) => b.cls === "ust" && b.freq === 2 && b.acc > 0.1);
  const c0 = A.cash;
  const r = place(W, { sym: note.id, side: "buy", qty: 10000, type: "market" }).order;
  near(A.cash, c0 - 100 * (r.fillPx + note.acc), 1e-6);
  assert(!place(W, { sym: note.id, side: "buy", qty: 1500, type: "market" }).ok, "$1,000 increments");
  place(W, { sym: bill.id, side: "buy", qty: 10000, type: "market" });
  runUntil(W, (w) => !w.A.pos[bill.id], 27 * 80);
  assert(hasLedger(A, "maturity", new RegExp(bill.name.replace(/[/.]/g, "."))));
});

test("dividends: longs receive, shorts pay", () => {
  const W = world(), A = W.A, M = W.M;
  const soon = M.lists.stock.map((id) => M.assets[id]).filter((s) => s.nextEx && s.nextEx > W.day && s.nextEx < W.day + 25 && s.dps > 0 && s.sig < 0.5).slice(0, 2);
  assert(soon.length === 2, "need two stocks going ex-dividend soon");
  place(W, { sym: soon[0].id, side: "buy", qty: 100, type: "market" });
  place(W, { sym: soon[1].id, side: "sell", qty: 100, type: "market" });
  const last = Math.max(soon[0].nextEx, soon[1].nextEx);
  runUntil(W, (w) => w.day >= last && w.phase === "open" && w.tick > 0);
  const d = A.ledger.filter((l) => l.type === "dividend");
  assert(d.some((l) => l.sym === soon[0].id && l.amount > 0), "long received");
  assert(d.some((l) => l.sym === soon[1].id && l.amount < 0), "short paid");
});

test("stock split adjusts shares, cost basis and option strikes", () => {
  const W = world(), A = W.A, a = plainStock(W);
  place(W, { sym: a.id, side: "buy", qty: 10, type: "market" });
  const exp = Options.expiries(W.day).find((e) => e.day - W.day > 20).day;
  const c = { und: a.id, exp, right: "C", K: Options.strikes(a.px, 1)[1], mult: 100 };
  place(W, { c, side: "buy", qty: 1, type: "market" });
  const avg = A.pos[a.id].avg;
  Broker.corporate(W, A, [{ type: "split", id: a.id, ratio: 4 }]);
  assert.strictEqual(A.pos[a.id].qty, 40);
  near(A.pos[a.id].avg, avg / 4, 1e-9);
  const opt = Object.values(A.pos).find((p) => p.kind === "opt");
  near(opt.c.K, c.K / 4, 1e-3);
  assert.strictEqual(opt.qty, 4);
});

test("deposits don't count as performance", () => {
  const W = world(), A = W.A;
  runUntil(W, (w) => w.phase === "closed");
  const t0 = A.twr;
  Broker.deposit(W, A, 50000);
  Sim.step(W); // overnight
  runUntil(W, (w) => w.phase === "closed");
  near(A.twr, t0, 0.001, "cash-only account: TWR moves only by interest");
});

done("broker");
