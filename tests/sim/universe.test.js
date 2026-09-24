// Run: node tests/sim/universe.test.js
const { core, test, done, assert } = require("./harness");
const U = core("universe").get();

test("at least 500 stocks with unique tickers and names", () => {
  assert(U.stocks.length >= 500, "only " + U.stocks.length);
  assert.strictEqual(new Set(U.stocks.map((s) => s.id)).size, U.stocks.length);
  assert.strictEqual(new Set(U.stocks.map((s) => s.name)).size, U.stocks.length);
});

test("tickers don't collide across asset classes", () => {
  const all = U.stocks.map((s) => s.id).concat(U.etfs.map((e) => e.id), U.crypto.map((c) => c.id), U.indices.map((i) => i.id), U.commodities.map((c) => c.id));
  assert.strictEqual(new Set(all).size, all.length);
});

test("every stock has sane fundamentals", () => {
  U.stocks.forEach((s) => {
    for (const k of ["p0", "shares", "beta", "sig", "eps", "dps", "borrow", "cap0"]) assert(isFinite(s[k]), s.id + " " + k);
    assert(s.p0 > 0 && s.sig > 0 && s.beta > 0 && s.dps >= 0, s.id);
    assert(/^[A-Z]{2,4}$/.test(s.id), s.id);
  });
});

test("market shape: top 10 hold 25–45% of value, every sector is represented", () => {
  const tot = U.stocks.reduce((a, s) => a + s.cap0, 0);
  const top = U.stocks.slice(0, 10).reduce((a, s) => a + s.cap0, 0) / tot;
  assert(top > 0.25 && top < 0.45, "top-10 share " + top);
  U.sectors.forEach((sec) => assert(U.stocks.filter((s) => s.sector === sec.id).length === sec.n, sec.id));
});

test("generation is deterministic", () => {
  // get() caches; regenerate through a fresh module instance.
  delete require.cache[require.resolve("../../simulator/js/core/universe.js")];
  const U2 = require("../../simulator/js/core/universe.js").get();
  assert.deepStrictEqual(U2.stocks.map((s) => s.id + s.p0), U.stocks.map((s) => s.id + s.p0));
});

test("every ETF, future and perp points at something that exists", () => {
  const ids = new Set(U.stocks.map((s) => s.id).concat(U.indices.map((i) => i.id), U.crypto.map((c) => c.id), U.commodities.map((c) => c.id), Object.keys(U.baskets), U.etfs.map((e) => e.id)));
  U.sectors.forEach((s) => ids.add("SEC:" + s.id));
  U.etfs.forEach((e) => {
    if (!e.track) return;
    if (e.track.indexOf("IND:") === 0) assert(U.stocks.some((s) => s.industry === e.track.slice(4)), e.id);
    else if (e.track.indexOf("ETF:") === 0) assert(ids.has(e.track.slice(4)), e.id);
    else assert(ids.has(e.track), e.id + " → " + e.track);
  });
  U.futures.forEach((f) => assert(ids.has(f.und) || /^UST/.test(f.und), f.root));
  U.perps.forEach((p) => assert(ids.has(p.und), p.id));
});

done("universe");
