// Run: node hardwood-legacy/tests/sim.test.js
// Checks ratings, box-score integrity, league-wide realism, interactive decisions and a full career loop.
const assert = require("assert");
["data", "player", "sim", "league"].forEach((f) => require("../js/" + f + ".js"));
const HL = globalThis.HL, D = HL.data, P = HL.player, Sm = HL.sim, Lg = HL.league;

let passed = 0;
function test(name, fn) { fn(); passed++; console.log("ok -", name); }

function newLeague(seed, len, pos = "SG", arch = "sharpshooter") {
  HL.rng.seed(seed);
  const Pm = D.POSITIONS[pos];
  const u = P.createUser({ first: "Test", last: "Player", pos, arch, height: Pm.hMid, weight: Pm.wMid, wingspan: Pm.hMid + 3, jersey: 1 });
  const L = Lg.create(u, { seasonLength: len, difficulty: "allstar", injuries: true, meter: true });
  Lg.draftUser(L, 6, 0.5);
  Lg.startSeason(L);
  return { L, u };
}

test("generated players hit their target overall", () => {
  HL.rng.seed(1);
  for (const pos of D.POS_ORDER) for (const ovr of [55, 70, 85, 95]) {
    const p = P.makePlayer({ pos, ovr, age: 25 });
    assert(Math.abs(p.ovr - ovr) <= 1, `${pos} ${ovr} -> ${p.ovr}`);
    D.ATTRS.forEach((a) => assert(p.r[a] >= 25 && p.r[a] <= 99));
  }
});

test("builder caps stay in range and every build starts at 60", () => {
  for (const pos of D.POS_ORDER) {
    const Pm = D.POSITIONS[pos];
    for (const arch of Object.keys(D.ARCHETYPES).filter((k) => D.ARCHETYPES[k].pos.includes(pos))) {
      for (const h of Pm.h) {
        const caps = P.builderCaps(pos, arch, h, Pm.wMid, h + 3);
        D.ATTRS.forEach((a) => assert(caps[a] >= 40 && caps[a] <= 99));
        const start = P.builderStart(pos, caps, 60);
        assert(Math.abs(P.ovrFrom(start, pos) - 60) <= 1, `${pos} ${arch} start ${P.ovrFrom(start, pos)}`);
        D.ATTRS.forEach((a) => assert(start[a] <= caps[a]));
      }
    }
  }
});

test("upgrade costs rise and upgrades respect VC and caps", () => {
  assert(P.upgradeCost(80) > P.upgradeCost(60));
  const { L, u } = newLeague(2, 29);
  L.user.vc = 1e7;
  const a = "three", cap = u.caps[a];
  Lg.upgrade(L, a, 200);
  assert.strictEqual(u.r[a], cap);
  L.user.vc = 0;
  assert.strictEqual(Lg.upgrade(L, "mid", 1), 0);
});

test("box scores add up in an auto-simmed game", () => {
  const { L } = newLeague(3, 29);
  for (let g = 0; g < 20; g++) {
    const sim = new Sm.GameSim(L, g % 30, (g + 7) % 30, {});
    sim.run();
    assert(sim.done);
    const res = sim.result();
    assert.notStrictEqual(res.hs, res.as, "no ties");
    [0, 1].forEach((s) => {
      const box = Object.values(res.boxes[s]);
      const pts = box.reduce((t, b) => t + b.pts, 0);
      assert.strictEqual(pts, s === 0 ? res.hs : res.as);
      const secs = box.reduce((t, b) => t + b.sec, 0);
      assert(Math.abs(secs - (2880 + 300 * res.ot) * 5) < 1, "five players on court all game");
      box.forEach((b) => {
        assert(b.fgm <= b.fga && b.tpm <= b.tpa && b.ftm <= b.fta && b.tpm <= b.fgm);
        assert.strictEqual(b.pts, 2 * (b.fgm - b.tpm) + 3 * b.tpm + b.ftm);
      });
      assert.strictEqual(box.reduce((t, b) => t + b.gs, 0), 5);
    });
  }
});

test("a full season produces NBA-like league averages", () => {
  const { L } = newLeague(4, 82);
  while (L.phase === "regular") Lg.playDay(L);
  L.teams.forEach((t) => assert.strictEqual(t.w + t.l, 82));
  const T = { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0 };
  Object.values(L.players).forEach((p) => Object.keys(T).forEach((k) => (T[k] += p.stats[k])));
  const g = 30 * 82;
  const per = (k) => T[k] / g;
  const check = (label, v, lo, hi) => assert(v >= lo && v <= hi, `${label} ${v.toFixed(3)} outside [${lo}, ${hi}]`);
  check("PTS", per("pts"), 102, 120);
  check("FG%", T.fgm / T.fga, 0.44, 0.5);
  check("3P%", T.tpm / T.tpa, 0.33, 0.39);
  check("3PA", per("tpa"), 28, 42);
  check("FT%", T.ftm / T.fta, 0.72, 0.84);
  check("REB", per("orb") + per("drb"), 38, 50);
  check("AST", per("ast"), 21, 30);
  check("TOV", per("tov"), 11, 17);
  check("STL", per("stl"), 5.5, 10);
  check("BLK", per("blk"), 3, 7);
  const topScorer = Lg.leaders(L, "pts", 1)[0].v;
  check("top PPG", topScorer, 24, 38);
  assert.strictEqual(L.phase, "awards");
  assert(L.seasonAwards.MVP.length === 5);
});

test("interactive games resolve every kind of decision", () => {
  const { L, u } = newLeague(5, 29, "PG", "shotCreator");
  const seen = { offense: 0, defense: 0, ft: 0 };
  for (let n = 0; n < 6; n++) {
    const g = Lg.nextUserGame(L);
    const sim = new Sm.GameSim(L, g.h, g.a, { interactive: true, meter: true });
    let guard = 0;
    while (!sim.done && guard++ < 5000) {
      sim.run();
      const pd = sim.pending;
      if (!pd) continue;
      seen[pd.kind]++;
      const grades = ["green", "good", "slight", "very", null];
      const grade = grades[guard % grades.length];
      if (pd.kind === "offense") sim.resolveOffense(pd.options[guard % pd.options.length].id, grade);
      else if (pd.kind === "defense") sim.resolveDefense(pd.options[guard % 3].id);
      else sim.resolveFT(grade);
    }
    assert(sim.done, "game finished");
    Lg.playDay(L, sim);
    assert(L.user.gameLog.length === n + 1);
  }
  assert(seen.offense > 10 && seen.defense > 3 && seen.ft > 0, JSON.stringify(seen));
  assert(L.user.vc > 0);
  assert(u.stats.gp >= 1);
});

test("green releases beat bad timing", () => {
  const base = 0.4;
  assert(Sm.applyTiming(base, "green", 0) > Sm.applyTiming(base, "good", 0));
  assert(Sm.applyTiming(base, "good", 0) > Sm.applyTiming(base, "slight", 0));
  assert(Sm.applyTiming(base, "slight", 0) > Sm.applyTiming(base, "very", 0));
});

test("playoffs crown a champion and the offseason keeps rosters whole", () => {
  const { L, u } = newLeague(6, 29);
  while (L.phase === "regular") Lg.playDay(L);
  Lg.startPlayoffs(L);
  assert.strictEqual(L.po.series.length, 8);
  let guard = 0;
  while (L.phase === "playoffs" && guard++ < 200) Lg.playDay(L);
  assert.strictEqual(L.phase, "champion");
  assert(L.po.champion != null && L.po.fmvp != null);
  const age = u.age;
  Lg.runOffseason(L);
  assert.strictEqual(u.age, age + 1);
  assert.strictEqual(L.user.seasons.length, 1);
  L.teams.forEach((t) => {
    assert(t.roster.length >= 13, t.abbr + " roster " + t.roster.length);
    t.roster.forEach((id) => assert(L.players[id] && L.players[id].teamId === t.id));
  });
  if (L.offers) Lg.acceptOffer(L, 1);
  Lg.newSeason(L);
  assert.strictEqual(L.phase, "regular");
  assert.strictEqual(u.stats.gp, 0);
  assert(u.career.gp > 0);
  L.teams.forEach((t) => assert.strictEqual(t.w + t.l, 0));
});

test("a trade request moves the player and keeps roster sizes", () => {
  const { L, u } = newLeague(7, 29);
  const from = u.teamId, sizes = L.teams.map((t) => t.roster.length);
  const dest = Lg.requestTrade(L);
  assert(dest && u.teamId === dest.id && u.teamId !== from);
  assert.deepStrictEqual(L.teams.map((t) => t.roster.length), sizes);
  assert.strictEqual(Lg.requestTrade(L), null, "one request per season");
});

test("a save round-trips through JSON", () => {
  const { L } = newLeague(8, 29);
  for (let i = 0; i < 5; i++) Lg.playDay(L);
  const copy = JSON.parse(JSON.stringify(L));
  Lg.playDay(copy);
  assert.strictEqual(copy.day, 6);
});

console.log(`\n${passed} tests passed`);
