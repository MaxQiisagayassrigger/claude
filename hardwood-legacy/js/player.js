/*
 * Random numbers, ratings, overall (OVR), badges, the player builder and aging.
 */
(function (root, factory) {
  var HL = (root.HL = root.HL || {});
  factory(HL);
  if (typeof module === "object" && module.exports) module.exports = HL;
})(typeof globalThis !== "undefined" ? globalThis : this, function (HL) {
  "use strict";
  var D = HL.data;

  // ---- RNG (seedable, so tests are repeatable) -----------------------------
  var state = (Date.now() ^ 0x9e3779b9) >>> 0;
  function rand() {
    state = (state + 0x6d2b79f5) >>> 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function seed(s) { state = s >>> 0; }
  function randInt(a, b) { return a + Math.floor(rand() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
  function normal(mean, sd) {
    var u = 0, v = 0;
    while (u === 0) u = rand();
    v = rand();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function weighted(items, weightFn) {
    var total = 0, i, w = new Array(items.length);
    for (i = 0; i < items.length; i++) { w[i] = Math.max(0, weightFn(items[i], i)); total += w[i]; }
    if (total <= 0) return items[Math.floor(rand() * items.length)];
    var r = rand() * total;
    for (i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1)), t = arr[i];
      arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  HL.rng = { rand: rand, seed: seed, randInt: randInt, pick: pick, normal: normal, weighted: weighted, shuffle: shuffle, clamp: clamp };

  // ---- Overall rating --------------------------------------------------------
  // Blend of the position-weighted average and the player's five best weighted skills,
  // so specialists rate like they do in 2K (peaks matter more than weaknesses).
  function ovrFrom(r, pos) {
    var w8 = D.POSITIONS[pos].w8, sum = 0, wsum = 0, peaks = [];
    for (var i = 0; i < D.ATTRS.length; i++) {
      var a = D.ATTRS[i];
      sum += r[a] * w8[a]; wsum += w8[a];
      if (w8[a] >= 0.5) peaks.push(r[a]);
    }
    peaks.sort(function (x, y) { return y - x; });
    var peak = (peaks[0] + peaks[1] + peaks[2] + peaks[3] + peaks[4]) / 5;
    var blend = 0.45 * (sum / wsum) + 0.55 * peak;
    return clamp(Math.round(1.28 * blend - 22), 35, 99);
  }

  function heightStr(inches) { return Math.floor(inches / 12) + "'" + (inches % 12) + '"'; }

  // Physical profile effects on attributes. d* are differences from the position norm.
  function physicalMods(pos, height, weight, wingspan) {
    var P = D.POSITIONS[pos];
    var dh = height - P.hMid, dw = (weight - P.wMid) / 10, dws = (wingspan - height) - 3;
    return {
      block: 1.5 * dh + 1.5 * dws, intD: 1.0 * dh + 0.8 * dws + 0.5 * dw, dreb: 1.2 * dh + 0.6 * dws + 0.4 * dw,
      oreb: 1.2 * dh + 0.5 * dws + 0.4 * dw, standDunk: 1.2 * dh + 0.5 * dw, post: 0.8 * dh + 1.0 * dw,
      closeShot: 0.5 * dh, speed: -1.2 * dh - 1.5 * dw, speedBall: -1.2 * dh - 1.2 * dw, handle: -1.0 * dh - 0.3 * dws,
      three: -0.6 * dh - 1.0 * dws, mid: -0.5 * dws, perD: -0.6 * dh + 0.8 * dws, steal: 1.0 * dws,
      strength: 3.0 * dw + 0.5 * dh, vertical: -1.2 * dw - 0.3 * dh, stamina: -1.0 * dw, dunk: -0.4 * dw,
      layup: -0.3 * dh, ft: 0, pass: 0
    };
  }

  // Ratings for a generated (league) player: template + archetype + noise, shifted to hit targetOvr.
  function ratingsFor(pos, arch, targetOvr, height, weight, wingspan) {
    var tpl = D.POSITIONS[pos].tpl, mod = D.ARCHETYPES[arch].mod, phys = physicalMods(pos, height, weight, wingspan);
    var base = {};
    D.ATTRS.forEach(function (a) { base[a] = tpl[a] + (mod[a] || 0) * 1.1 + phys[a] + normal(0, 4); });
    function build(delta) {
      var r = {};
      D.ATTRS.forEach(function (a) {
        // Strengths grow faster than weaknesses as the player gets better.
        var k = 0.75 + 0.5 * clamp((base[a] - 45) / 40, 0, 1);
        r[a] = Math.round(clamp(base[a] + delta * k, 25, 99));
      });
      return r;
    }
    var lo = -60, hi = 60, r = build(0);
    for (var it = 0; it < 24; it++) {
      var mid = (lo + hi) / 2;
      r = build(mid);
      var o = ovrFrom(r, pos);
      if (o === targetOvr) break;
      if (o < targetOvr) lo = mid; else hi = mid;
    }
    return r;
  }

  var uid = 1;
  function nextId() { return uid++; }
  function setNextId(n) { uid = Math.max(uid, n); }

  function newStats() {
    return { gp: 0, gs: 0, min: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
      orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pm: 0 };
  }

  function makePlayer(opts) {
    var pos = opts.pos, P = D.POSITIONS[pos];
    var arch = opts.arch || pick(Object.keys(D.ARCHETYPES).filter(function (k) { return D.ARCHETYPES[k].pos.indexOf(pos) >= 0; }));
    var height = opts.height || clamp(Math.round(normal(P.hMid, 1.4)), P.h[0], P.h[1]);
    var weight = opts.weight || clamp(Math.round(normal(P.wMid + (height - P.hMid) * 5, 10) / 5) * 5, P.w[0], P.w[1]);
    var wingspan = opts.wingspan || height + clamp(Math.round(normal(3, 2)), -1, 9);
    var p = {
      id: nextId(), first: opts.first || pick(D.FIRST), last: opts.last || pick(D.LAST),
      pos: pos, arch: arch, age: opts.age || 24, height: height, weight: weight, wingspan: wingspan,
      jersey: opts.jersey != null ? opts.jersey : randInt(0, 55), college: pick(D.COLLEGES),
      r: null, ovr: 0, pot: 0, teamId: opts.teamId != null ? opts.teamId : -1,
      yearsPro: opts.yearsPro || 0, inj: 0, injName: "",
      stats: newStats(), po: newStats(), career: newStats(), isUser: false
    };
    p.r = ratingsFor(pos, arch, opts.ovr, height, weight, wingspan);
    refresh(p);
    p.pot = clamp(Math.round(p.ovr + Math.max(0, (27 - p.age)) * randInt(1, 3) + normal(0, 2)), p.ovr, 97);
    return p;
  }

  // ---- Badges -----------------------------------------------------------------
  function badgeValue(r, b) {
    var s = 0;
    for (var i = 0; i < b.attrs.length; i++) s += r[b.attrs[i]];
    return s / b.attrs.length;
  }
  function badgeLevels(r) {
    var out = {};
    D.BADGES.forEach(function (b) {
      var v = badgeValue(r, b), lv = 0;
      for (var i = 0; i < 4; i++) if (v >= b.t[i]) lv = i + 1;
      out[b.id] = lv;
    });
    return out;
  }
  function refresh(p) {
    p.ovr = ovrFrom(p.r, p.pos);
    p.bdg = badgeLevels(p.r);
    return p;
  }

  // ---- Player builder (MyPlayer) -------------------------------------------------
  function builderCaps(pos, arch, height, weight, wingspan) {
    var tpl = D.POSITIONS[pos].tpl, mod = D.ARCHETYPES[arch].mod, phys = physicalMods(pos, height, weight, wingspan);
    var lift = arch === "allAround" ? 16 : 18, caps = {};
    D.ATTRS.forEach(function (a) {
      caps[a] = Math.round(clamp(tpl[a] + lift + (mod[a] || 0) * 1.5 + phys[a] * 1.2, 40, 99));
    });
    return caps;
  }
  // Starting ratings sit at the same fraction of every cap, tuned so the rookie starts at `startOvr`.
  function builderStart(pos, caps, startOvr) {
    function build(s) {
      var r = {};
      D.ATTRS.forEach(function (a) { r[a] = Math.round(clamp(25 + (caps[a] - 25) * s, 25, caps[a])); });
      return r;
    }
    var lo = 0.2, hi = 1, r = build(0.6);
    for (var it = 0; it < 30; it++) {
      var mid = (lo + hi) / 2;
      r = build(mid);
      var o = ovrFrom(r, pos);
      if (o === startOvr) break;
      if (o < startOvr) lo = mid; else hi = mid;
    }
    return r;
  }
  function createUser(o) {
    var caps = builderCaps(o.pos, o.arch, o.height, o.weight, o.wingspan);
    var p = {
      id: nextId(), first: o.first, last: o.last, pos: o.pos, arch: o.arch, age: 19,
      height: o.height, weight: o.weight, wingspan: o.wingspan, jersey: o.jersey, college: o.college,
      hometown: o.hometown || "", r: builderStart(o.pos, caps, o.startOvr || 60), caps: caps,
      ovr: 0, pot: ovrFrom(caps, o.pos), teamId: -1, yearsPro: 0, inj: 0, injName: "",
      stats: newStats(), po: newStats(), career: newStats(), isUser: true
    };
    refresh(p);
    return p;
  }

  // VC cost to raise an attribute from v to v+1. Gets steep near the top, like 2K.
  function upgradeCost(v) { return Math.round(22 * Math.pow(1.046, v - 40)); }

  // ---- Aging ----------------------------------------------------------------------
  var PHYS = { speed: 1, speedBall: 1, vertical: 1, stamina: 1, dunk: 0.6, layup: 0.3, perD: 0.4 };
  // Returns {attr: delta} applied to the player (league players). Caps apply to the user.
  function ageProgression(p) {
    var age = p.age, mean, sd;
    if (age <= 21) { mean = 3.2; sd = 2.4; }
    else if (age <= 23) { mean = 2.4; sd = 2.2; }
    else if (age <= 25) { mean = 1.4; sd = 1.8; }
    else if (age <= 27) { mean = 0.4; sd = 1.6; }
    else if (age <= 29) { mean = -0.4; sd = 1.5; }
    else if (age <= 31) { mean = -1.6; sd = 1.6; }
    else if (age <= 33) { mean = -2.8; sd = 1.8; }
    else { mean = -4.2; sd = 2.2; }
    if (!p.isUser && p.pot && p.ovr >= p.pot && mean > 0) mean *= 0.3;
    var ovrDelta = normal(mean, sd), changes = {};
    D.ATTRS.forEach(function (a) {
      var phys = PHYS[a] || 0, d;
      if (ovrDelta >= 0) d = ovrDelta * (1 - 0.4 * phys) + normal(0, 1);
      else d = ovrDelta * (0.6 + 1.1 * phys) + normal(0, 0.8);
      d = Math.round(d);
      if (d !== 0) changes[a] = d;
    });
    return changes;
  }
  function applyChanges(p, changes) {
    var applied = {};
    Object.keys(changes).forEach(function (a) {
      var cap = p.caps ? p.caps[a] : 99;
      var nv = clamp(p.r[a] + changes[a], 25, Math.max(cap, 25));
      if (nv !== p.r[a]) applied[a] = nv - p.r[a];
      p.r[a] = nv;
    });
    refresh(p);
    return applied;
  }

  HL.player = {
    ovrFrom: ovrFrom, heightStr: heightStr, physicalMods: physicalMods, ratingsFor: ratingsFor,
    makePlayer: makePlayer, newStats: newStats, badgeLevels: badgeLevels, badgeValue: badgeValue,
    refresh: refresh, builderCaps: builderCaps, builderStart: builderStart, createUser: createUser,
    upgradeCost: upgradeCost, ageProgression: ageProgression, applyChanges: applyChanges,
    nextId: nextId, setNextId: setNextId
  };
});
