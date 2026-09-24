/*
 * Possession-by-possession game engine.
 *
 * Each possession: rotation check -> turnover roll -> shooter by usage -> shot type by tendencies ->
 * make probability from shooter vs defender ratings, badges, fatigue and openness -> blocks, fouls,
 * free throws, assists, rebounds. Minutes come from per-player targets and fatigue.
 *
 * In interactive games the engine pauses with `sim.pending` whenever the user's player gets the
 * ball (offense), is attacked by his matchup (defense), or goes to the line (free throws with a meter).
 */
(function (root, factory) {
  var HL = (root.HL = root.HL || {});
  factory(HL);
  if (typeof module === "object" && module.exports) module.exports = HL;
})(typeof globalThis !== "undefined" ? globalThis : this, function (HL) {
  "use strict";
  var D = HL.data, R = HL.rng, rand = R.rand, clamp = R.clamp, normal = R.normal;

  var QUARTER = 720, OT = 300;
  var MIN_BY_RANK = [36, 35, 33, 31, 29, 24, 20, 14, 10, 6, 2, 0, 0, 0, 0];
  var POS_IDX = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };
  var POS3 = { PG: 1, SG: 1.05, SF: 0.95, PF: 0.7, C: 0.45 };
  var POS_RIM = { PG: 0.85, SG: 0.9, SF: 1, PF: 1.05, C: 1.15 };
  var POS_REB = { PG: 0.85, SG: 0.9, SF: 1, PF: 1.1, C: 1.2 };
  var OPEN_LABEL = { "-2": "Smothered", "-1": "Contested", "0": "Guarded", "1": "Open", "2": "Wide Open" };
  var OPEN_BONUS = { three: 0.07, mid: 0.06, rim: 0.06, post: 0.05 };
  var SHOT_NAME = { three: "Three", mid: "Mid-Range Jumper", rim: "Attack the Rim", post: "Post Up" };

  function nm(p) { return p.first.charAt(0) + ". " + p.last; }
  function fmtClock(s) {
    s = Math.max(0, Math.ceil(s));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }
  function pickText(arr) { return arr[Math.floor(rand() * arr.length)]; }

  // ---- Player-level helpers (pure, reused by the UI for estimates) ----------
  function offScore(p) {
    var r = p.r;
    return 0.34 * Math.max(r.three, r.mid) + 0.34 * Math.max(r.layup, r.dunk, r.post, (r.closeShot + r.standDunk) / 2) +
      0.14 * r.handle + 0.18 * p.ovr;
  }
  function usageWeight(p) { return Math.pow(offScore(p) / 50, 3.6); }

  function shotTendencies(p) {
    var r = p.r;
    var w3 = Math.pow(Math.max(0, r.three - 40) / 40, 2.2) * POS3[p.pos] * 1.75;
    var wm = Math.pow(Math.max(0, r.mid - 40) / 40, 1.8) * 0.5;
    var fin = Math.max(r.layup, r.dunk, (r.closeShot + r.standDunk) / 2);
    var wr = Math.pow(Math.max(0, fin - 35) / 40, 1.8) * POS_RIM[p.pos] * 0.95;
    var big = p.pos === "PF" || p.pos === "C";
    var wp = Math.pow(Math.max(0, r.post - (big ? 40 : 55)) / 40, 2) * (big ? 0.45 : 0.2);
    var t = w3 + wm + wr + wp || 1;
    return { three: w3 / t, mid: wm / t, rim: wr / t, post: wp / t };
  }
  function pickShotType(p, mult) {
    var t = shotTendencies(p), k = ["three", "mid", "rim", "post"], m = mult || {};
    return R.weighted(k, function (x) { return t[x] * (m[x] == null ? 1 : m[x]); });
  }

  function dunkChance(p) {
    var r = p.r, big = p.pos === "PF" || p.pos === "C";
    var d = big ? Math.max(r.dunk, r.standDunk) : r.dunk;
    return clamp((d - 52) / 65 + (r.vertical - 60) / 200, 0.03, 0.7);
  }

  // Core make probability before fouls/blocks. ctx: {defender, helper, openness, dunk, energy, clutch, home, user}
  function shotProb(s, type, ctx) {
    var r = s.r, d = ctx.defender ? ctx.defender.r : null, b = s.bdg || {}, db = ctx.defender ? (ctx.defender.bdg || {}) : {};
    var p;
    if (type === "three") {
      p = 0.338 + (r.three - 75) * 0.0041 - (d ? (d.perD - 70) * 0.0014 : 0) + (b.sniper || 0) * 0.008 - (db.lockdown || 0) * 0.006;
    } else if (type === "mid") {
      p = 0.405 + (r.mid - 75) * 0.0042 - (d ? (d.perD - 70) * 0.0014 : 0) + (b.midMaestro || 0) * 0.008 - (db.lockdown || 0) * 0.006;
    } else if (type === "rim") {
      var fin = ctx.dunk ? Math.max(r.dunk, r.standDunk) : Math.max(r.layup, (r.closeShot + r.standDunk) / 2);
      var h = ctx.helper ? ctx.helper.r : d, hb = ctx.helper ? (ctx.helper.bdg || {}) : db;
      p = (ctx.dunk ? 0.78 : 0.525) + (fin - 75) * 0.0042 - (h ? (h.intD - 70) * 0.0018 : 0) - (hb.rimProtector || 0) * 0.008 +
        (ctx.dunk ? (b.rimWrecker || 0) * 0.01 : (b.acrobat || 0) * 0.009) + (b.blurStep || 0) * 0.004;
    } else {
      var pf = r.post * 0.6 + r.closeShot * 0.4;
      p = 0.45 + (pf - 75) * 0.004 + (d ? (r.strength - d.strength) * 0.0009 - (d.intD - 70) * 0.0015 : 0) + (b.postTech || 0) * 0.009;
    }
    if (ctx.openness) p += ctx.openness * OPEN_BONUS[type];
    if (ctx.clutch) p += (b.clutch || 0) * 0.012;
    if (ctx.home) p += 0.008;
    if (ctx.assistBoost) p += ctx.assistBoost;
    if (ctx.diff) p += ctx.diff;
    p *= 0.87 + 0.13 * (ctx.energy == null ? 1 : ctx.energy);
    return clamp(p, 0.04, 0.97);
  }
  function ftProb(p) { return clamp(0.395 + p.r.ft * 0.005 + (p.bdg && p.bdg.iceVeins || 0) * 0.01, 0.3, 0.96); }

  // Shot meter: green window width (fraction of the bar) by rating.
  function meterWindow(p, type, openness, diffWin) {
    var rating = type === "three" ? p.r.three : type === "mid" ? p.r.mid : type === "ft" ? p.r.ft :
      type === "post" ? p.r.post : Math.max(p.r.layup, p.r.dunk);
    var w = 0.035 + Math.max(0, rating - 35) * 0.0016 + (openness || 0) * 0.01 + (p.bdg && p.bdg.iceVeins || 0) * 0.004;
    if (type === "rim") w += 0.03;
    return clamp(w * (diffWin || 1), 0.025, 0.2);
  }
  // Timing grade -> adjusted probability.
  function applyTiming(p, grade, openness) {
    var o = openness == null ? 0 : openness;
    if (grade === "green") return clamp(p + (1 - p) * (o >= 1 ? 0.8 : o === 0 ? 0.6 : o === -1 ? 0.4 : 0.25), 0, 0.98);
    if (grade === "good") return clamp(p * 1.06, 0, 0.95);
    if (grade === "slight") return p * 0.72;
    if (grade === "very") return p * 0.35;
    return p;
  }

  // ---- Game ---------------------------------------------------------------------
  function GameSim(league, homeId, awayId, opts) {
    opts = opts || {};
    this.league = league;
    this.interactive = !!opts.interactive;
    this.meter = opts.meter !== false;
    this.playoff = !!opts.playoff;
    this.userId = league.userId;
    var diff = D.DIFFICULTY[(league.settings && league.settings.difficulty) || "allstar"];
    this.diffShot = diff.shot;
    this.diffWin = diff.win;
    this.sides = [this.makeSide(homeId, true), this.makeSide(awayId, false)];
    this.q = 1;
    this.clock = QUARTER;
    this.elapsed = 0;
    this.nextSub = 0;
    this.off = rand() < 0.5 ? 0 : 1;
    this.tipWinner = this.off;
    this.log = [];
    this.pending = null;
    this.done = false;
    this.userShots = [];
    this.possCount = 0;
    this.lineups(true);
    var tip = this.sides[this.off];
    this.push(tip, tip.team.city + " " + tip.team.name + " win the opening tip.", "info");
  }

  GameSim.prototype.makeSide = function (tid, home) {
    var L = this.league, team = L.teams[tid], self = this;
    var players = team.roster.map(function (id) { return L.players[id]; }).filter(function (p) { return !p.inj; });
    players.sort(function (a, b) { return b.ovr - a.ovr; });
    var box = {}, energy = {}, targets = {}, uw = {};
    players.forEach(function (p, i) {
      box[p.id] = { sec: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pm: 0, gs: 0, out: false };
      energy[p.id] = 1;
      targets[p.id] = MIN_BY_RANK[i] || 0;
      uw[p.id] = usageWeight(p);
    });
    // The user's minutes depend on rank and coach trust, with a floor so you always get run.
    var user = players.filter(function (p) { return p.isUser; })[0];
    if (user && L.user) {
      var rank = players.indexOf(user);
      var t = (MIN_BY_RANK[rank] || 0) + ((L.user.trust || 50) - 50) / 50 * 6;
      t = clamp(Math.round(t), 16, 38);
      var others = 240 - t, curOthers = 240 - (MIN_BY_RANK[rank] || 0);
      players.forEach(function (p) { if (p !== user) targets[p.id] = targets[p.id] * others / curOthers; });
      targets[user.id] = t;
    }
    // Starters: best five with position balance; coach trust can promote the user.
    var startScore = function (p) { return p.ovr + (p.isUser && L.user ? ((L.user.trust || 50) - 50) / 8 : 0); };
    var cands = players.slice().sort(function (a, b) { return startScore(b) - startScore(a); });
    var starters = self.balanced(cands, function (p) { return startScore(p); });
    starters.forEach(function (p) { box[p.id].gs = 1; });
    return { tid: tid, team: team, home: home, players: players, box: box, energy: energy, targets: targets, uw: uw,
      starters: starters.map(function (p) { return p.id; }), on: [], score: 0, qScores: [0, 0, 0, 0] };
  };

  // Greedy positional balance: at most 3 guards, 3 bigs, 2 centers; at least 1 guard and 1 big.
  GameSim.prototype.balanced = function (sorted, score) {
    var out = [], g = 0, b = 0, c = 0;
    for (var i = 0; i < sorted.length && out.length < 5; i++) {
      var p = sorted[i], isG = p.pos === "PG" || p.pos === "SG", isB = p.pos === "PF" || p.pos === "C";
      if (isG && g >= 3) continue;
      if (isB && b >= 3) continue;
      if (p.pos === "C" && c >= 2) continue;
      out.push(p); if (isG) g++; if (isB) b++; if (p.pos === "C") c++;
    }
    for (i = 0; i < sorted.length && out.length < 5; i++) if (out.indexOf(sorted[i]) < 0) out.push(sorted[i]);
    function ensure(test) {
      if (out.some(test)) return;
      var cand = sorted.filter(function (p) { return test(p) && out.indexOf(p) < 0; })[0];
      if (!cand) return;
      var worst = out.slice().sort(function (a, b2) { return score(a) - score(b2); })[0];
      out[out.indexOf(worst)] = cand;
    }
    ensure(function (p) { return p.pos === "PG" || p.pos === "SG"; });
    ensure(function (p) { return p.pos === "PF" || p.pos === "C"; });
    return out.sort(function (a, b2) { return POS_IDX[a.pos] - POS_IDX[b2.pos] || a.height - b2.height; });
  };

  GameSim.prototype.lineups = function (force) {
    if (!force && this.elapsed < this.nextSub) return;
    this.nextSub = this.elapsed + 150 + rand() * 90;
    for (var s = 0; s < 2; s++) this.chooseLineup(this.sides[s]);
  };

  GameSim.prototype.chooseLineup = function (side) {
    var other = this.sides[side === this.sides[0] ? 1 : 0];
    var avail = side.players.filter(function (p) { return !side.box[p.id].out; });
    var margin = Math.abs(side.score - other.score), min = this.elapsed / 60;
    var late = this.q >= 4 && this.clock <= 300 && margin <= 12;
    var garbage = this.q >= 4 && this.clock <= 420 && margin >= 22;
    var halfStart = (this.q === 1 || this.q === 3) && this.clock >= QUARTER - 1;
    var rank = {}, trust = this.league.user ? this.league.user.trust || 50 : 50;
    side.players.forEach(function (p, i) { rank[p.id] = i - (p.isUser ? (trust - 50) / 12 : 0); });
    var score = function (p) {
      var id = p.id, e = side.energy[id], t = side.targets[id];
      if (halfStart) return (side.starters.indexOf(id) >= 0 ? 1000 : 0) + t;
      if (late) return 600 - rank[id] * 10 + (e - 1) * 60 + (side.box[id].pf >= 5 ? -30 : 0);
      if (garbage) return -t + e * 5;
      var need = t * Math.min(48, min + 4) / 48 - side.box[id].sec / 60;
      return need + (e - 0.8) * 6 + (t === 0 ? -40 : 0);
    };
    var sorted = avail.slice().sort(function (a, b) { return score(b) - score(a); });
    var before = side.on.slice();
    side.on = this.balanced(sorted, score).map(function (p) { return p.id; });
    if (this.interactive && before.length) {
      var uid = this.userId, wasOn = before.indexOf(uid) >= 0, isOn = side.on.indexOf(uid) >= 0;
      if (!wasOn && isOn) this.push(side, "You check back into the game.", "sub", true);
      if (wasOn && !isOn) this.push(side, "You head to the bench for a breather.", "sub", true);
    }
  };

  GameSim.prototype.P = function (id) { return this.league.players[id]; };
  GameSim.prototype.onP = function (side) { var self = this; return side.on.map(function (id) { return self.P(id); }); };

  GameSim.prototype.push = function (side, text, type, user) {
    this.log.push({ q: this.q, clock: fmtClock(this.clock), tid: side ? side.tid : -1, text: text, type: type || "play",
      user: !!user, score: [this.sides ? this.sides[0].score : 0, this.sides ? this.sides[1].score : 0] });
  };

  GameSim.prototype.isClutch = function () {
    return this.q >= 4 && this.clock <= 180 && Math.abs(this.sides[0].score - this.sides[1].score) <= 5;
  };

  // ---- Clock & possession flow -----------------------------------------------------
  GameSim.prototype.possDuration = function (second) {
    var d = second ? clamp(normal(6, 3), 2, 14) : clamp(normal(15.4, 4.6), 4, 24);
    return Math.min(d, this.clock);
  };

  GameSim.prototype.tick = function (sec) {
    this.clock = Math.max(0, this.clock - sec);
    this.elapsed += sec;
    for (var s = 0; s < 2; s++) {
      var side = this.sides[s];
      side.players.forEach(function (p) {
        var id = p.id;
        if (side.on.indexOf(id) >= 0) {
          side.box[id].sec += sec;
          var drain = 0.0185 * (1.3 - p.r.stamina / 100) * (1 - (p.bdg.tireless || 0) * 0.08);
          side.energy[id] = Math.max(0.35, side.energy[id] - drain * sec / 60 * 6);
        } else {
          side.energy[id] = Math.min(1, side.energy[id] + 0.028 * sec / 60 * 6);
        }
      });
    }
  };

  GameSim.prototype.endPeriod = function () {
    var h = this.sides[0], a = this.sides[1];
    var label = this.q <= 4 ? "End of Q" + this.q : "End of OT" + (this.q - 4);
    this.clock = 0;
    this.push(null, label + ": " + a.team.abbr + " " + a.score + ", " + h.team.abbr + " " + h.score, "period");
    if (this.q >= 4 && h.score !== a.score) { this.finish(); return; }
    this.q++;
    this.clock = this.q <= 4 ? QUARTER : OT;
    if (this.q > 4) { h.qScores.push(0); a.qScores.push(0); }
    // Q2 and Q3 go to the team that lost the tip, Q4 to the winner. OT: coin flip.
    this.off = this.q === 4 ? this.tipWinner : this.q > 4 ? (rand() < 0.5 ? 0 : 1) : 1 - this.tipWinner;
    this.lineups(true);
  };

  GameSim.prototype.finish = function () {
    this.done = true;
    this.pending = null;
    var h = this.sides[0], a = this.sides[1], w = h.score > a.score ? h : a;
    this.push(null, "Final: " + w.team.city + " " + w.team.name + " win " + Math.max(h.score, a.score) + "-" + Math.min(h.score, a.score) +
      (this.q > 4 ? " in " + (this.q === 5 ? "overtime" : (this.q - 4) + "OT") : "") + ".", "final");
  };

  GameSim.prototype.score = function (side, pts) {
    var other = this.sides[side === this.sides[0] ? 1 : 0];
    side.score += pts;
    side.qScores[this.q - 1] = (side.qScores[this.q - 1] || 0) + pts;
    side.on.forEach(function (id) { side.box[id].pm += pts; });
    other.on.forEach(function (id) { other.box[id].pm -= pts; });
  };

  // Run possessions until the game ends or the user must decide. Returns number of possessions run.
  GameSim.prototype.run = function (maxPoss) {
    var n = 0;
    while (!this.done && !this.pending && (maxPoss == null || n < maxPoss)) { this.step(); n++; }
    return n;
  };

  GameSim.prototype.step = function () {
    if (this.done || this.pending) return;
    if (this.clock < 0.6) { this.tick(this.clock); this.endPeriod(); return; }
    this.lineups(false);
    var off = this.sides[this.off], def = this.sides[1 - this.off];
    var dur = this.possDuration(false);
    this.possCount++;
    if (this.interactive) {
      var uid = this.userId;
      if (off.on.indexOf(uid) >= 0) {
        var share = off.uw[uid] / off.on.reduce(function (s, id) { return s + off.uw[id]; }, 0);
        if (rand() < Math.min(0.5, share * 1.3 + 0.04)) { this.offenseDecision(off, def, dur); return; }
      } else if (def.on.indexOf(uid) >= 0 && rand() < 0.16) {
        this.defenseDecision(off, def, dur); return;
      }
    }
    this.autoPossession(off, def, dur);
  };

  GameSim.prototype.matchup = function (off, def, shooterId) {
    var i = off.on.indexOf(shooterId);
    return this.P(def.on[i >= 0 ? i : 0]);
  };
  GameSim.prototype.rimHelper = function (def) {
    var best = null, bv = -1, self = this;
    def.on.forEach(function (id) { var p = self.P(id), v = p.r.block + p.r.intD; if (v > bv) { bv = v; best = p; } });
    return best;
  };

  GameSim.prototype.autoPossession = function (off, def, dur) {
    var onO = this.onP(off), onD = this.onP(def);
    // Late-game intentional foul by the trailing team.
    var trail = def.score - off.score;
    if (this.q >= 4 && this.clock < 50 && trail < 0 && trail >= -8) {
      var fouled = R.weighted(onO, function (p) { return 110 - p.r.ft; });
      var fouler = R.pick(onD);
      this.tick(Math.min(this.clock, 2 + rand() * 4));
      this.foul(def, fouler);
      this.push(def, nm(fouler) + " fouls " + nm(fouled) + " intentionally to stop the clock.", "foul", fouler.isUser || fouled.isUser);
      this.freeThrows(off, def, fouled, 2, {});
      return;
    }
    // Turnover
    var ho = 0, hd = 0;
    onO.forEach(function (p) { ho += (p.r.handle + p.r.pass) / 2 + (p.bdg.tightHandles || 0) * 1.5; });
    onD.forEach(function (p) { hd += (p.r.steal + p.r.perD) / 2 + (p.bdg.pickpocket || 0) * 1.5; });
    var pTO = 0.128 + (hd / 5 - 60) * 0.0022 - (ho / 5 - 62) * 0.0018;
    if (rand() < clamp(pTO, 0.07, 0.2)) {
      var tp = R.weighted(onO, function (p) { return off.uw[p.id] * (1.45 - p.r.handle / 100); });
      this.turnover(off, def, tp, dur);
      return;
    }
    // Non-shooting foul in the bonus
    if (rand() < 0.03) {
      var fp = R.weighted(onO, function (p) { return off.uw[p.id]; });
      var fd = this.matchup(off, def, fp.id);
      this.tick(dur * 0.5);
      this.foul(def, fd);
      this.push(def, "Foul on " + nm(fd) + ". " + nm(fp) + " heads to the line.", "foul", fp.isUser || fd.isUser);
      this.freeThrows(off, def, fp, 2, {});
      return;
    }
    // Common foul away from the ball (no free throws), keeps personal fouls realistic.
    if (rand() < 0.055) {
      var cf = R.pick(onD);
      this.foul(def, cf);
      if (this.interactive && cf.isUser) this.push(def, "You pick up a foul (" + def.box[cf.id].pf + ").", "foul", true);
    }
    var shooter = R.weighted(onO, function (p) { return off.uw[p.id] * (0.6 + 0.4 * off.energy[p.id]); });
    var type = pickShotType(shooter);
    var openness = Math.round(clamp(normal(0, 0.8), -2, 2));
    this.shot(off, def, shooter, type, { dur: dur, openness: openness });
  };

  GameSim.prototype.turnover = function (off, def, p, dur, stealer) {
    var onD = this.onP(def), box = off.box[p.id];
    this.tick(dur * (0.3 + rand() * 0.5));
    box.tov++;
    var isSteal = stealer || rand() < 0.56;
    if (isSteal) {
      var st = stealer || R.weighted(onD, function (d) { return Math.pow(d.r.steal / 50, 2.5) * (1 + (d.bdg.pickpocket || 0) * 0.15); });
      def.box[st.id].stl++;
      this.push(off, pickText([
        nm(st) + " picks " + nm(p) + "'s pocket.",
        nm(st) + " jumps the passing lane and steals it from " + nm(p) + ".",
        nm(p) + " gets stripped by " + nm(st) + "."]), "to", p.isUser || st.isUser);
    } else {
      this.push(off, pickText([
        nm(p) + " throws it away.", nm(p) + " steps out of bounds.", "Offensive foul on " + nm(p) + ".",
        nm(p) + " is called for traveling.", "Shot clock violation. " + nm(p) + " couldn't get a shot off."]), "to", p.isUser);
    }
    this.change();
  };

  GameSim.prototype.change = function () { if (!this.done) this.off = 1 - this.off; };

  GameSim.prototype.foul = function (def, p) {
    var b = def.box[p.id];
    b.pf++;
    if (b.pf >= 6 && !b.out) {
      b.out = true;
      this.push(def, nm(p) + " has fouled out.", "info", p.isUser);
      this.chooseLineup(def);
    }
  };

  // ctx: {dur, openness, defender, assister, assistBoost, timing, userDefense, second}
  GameSim.prototype.shot = function (off, def, s, type, ctx) {
    var onO = this.onP(off), onD = this.onP(def);
    var defender = ctx.defender || this.matchup(off, def, s.id);
    var helper = type === "rim" ? this.rimHelper(def) : null;
    if (helper && helper !== defender && defender.r.intD > helper.r.intD) helper = defender;
    var dunk = type === "rim" && rand() < dunkChance(s);
    var prob = shotProb(s, type, {
      defender: defender, helper: helper, openness: ctx.openness || 0, dunk: dunk,
      energy: off.energy[s.id], clutch: this.isClutch(), home: off.home,
      assistBoost: ctx.assistBoost || 0, diff: s.isUser ? this.diffShot : 0
    });
    if (ctx.timing) prob = applyTiming(prob, ctx.timing, ctx.openness || 0);
    this.tick(ctx.dur || 0);
    var box = off.box[s.id], is3 = type === "three";
    // Block
    var pb = type === "three" ? 0.015 : type === "mid" ? 0.06 : type === "post" ? 0.12 : dunk ? 0.04 : 0.16;
    var blocker = null;
    if (rand() < pb) {
      blocker = R.weighted(onD, function (d) {
        return Math.pow(d.r.block / 50, 3) * (d === helper ? 2 : 1) * (d === defender ? 1.5 : 1) * (1 + (d.bdg.rimProtector || 0) * 0.15);
      });
      if (rand() > clamp(0.5 + (blocker.r.block - 60) * 0.012 + (blocker.bdg.rimProtector || 0) * 0.05 - (s.bdg.acrobat || 0) * 0.04, 0.1, 0.95)) blocker = null;
    }
    // Shooting foul
    var pf = type === "rim" ? (dunk ? 0.11 : 0.19) : type === "post" ? 0.14 : type === "mid" ? 0.05 : 0.018;
    if (ctx.gambleFoul) pf += 0.06;
    var fouled = !blocker && rand() < pf;
    var made = !blocker && rand() < (fouled ? prob * 0.55 : prob);
    box.fga += (fouled && !made) ? 0 : 1;
    if (is3) box.tpa += (fouled && !made) ? 0 : 1;
    var user = s.isUser || defender.isUser || (blocker && blocker.isUser);
    if (!fouled || made) this.recordShot(s, type, made, dunk);
    var fouler = type === "rim" && helper ? (rand() < 0.5 ? helper : defender) : defender;
    if (made) {
      var pts = is3 ? 3 : 2;
      box.fgm++; box.pts += pts; if (is3) box.tpm++;
      this.score(off, pts);
      var assister = null;
      var pa = is3 ? 0.8 : type === "mid" ? 0.42 : type === "post" ? 0.25 : dunk ? 0.72 : 0.55;
      if (ctx.assister) assister = ctx.assister;
      else if (!ctx.second && rand() < pa + 0.025 * onO.reduce(function (m, p) { return Math.max(m, p.bdg.floorGeneral || 0); }, 0)) {
        var mates = onO.filter(function (p) { return p !== s; });
        assister = R.weighted(mates, function (p) { return Math.pow(p.r.pass / 50, 3.2) * (1 + (p.bdg.floorGeneral || 0) * 0.12); });
      }
      if (assister) off.box[assister.id].ast++;
      this.push(off, this.madeText(s, type, dunk, is3, ctx) + (assister ? " (" + nm(assister) + " assists)" : ""), "make", user || (assister && assister.isUser));
      if (fouled) {
        this.foul(def, fouler);
        this.push(off, "And one! Foul on " + nm(fouler) + ".", "foul", user);
        this.freeThrows(off, def, s, 1, {});
        return;
      }
      this.change();
      return;
    }
    if (blocker) {
      def.box[blocker.id].blk++;
      this.push(off, pickText([nm(blocker) + " swats " + nm(s) + "'s shot!", nm(blocker) + " rejects " + nm(s) + " at the rim.",
        nm(s) + " gets blocked by " + nm(blocker) + "."]), "block", user);
    } else if (fouled) {
      this.foul(def, fouler);
      this.push(off, nm(s) + " is fouled by " + nm(fouler) + " on the " + (is3 ? "three" : "shot") + ".", "foul", user || fouler.isUser);
      this.freeThrows(off, def, s, is3 ? 3 : 2, {});
      return;
    } else {
      this.push(off, this.missText(s, type, dunk), "miss", user);
    }
    this.rebound(off, def, is3 ? 0.02 : 0);
  };

  GameSim.prototype.recordShot = function (s, type, made, dunk) {
    if (!s.isUser) return;
    this.userShots.push({ type: type, made: made, dunk: dunk, spot: HL.sim.shotSpot(type) });
  };

  GameSim.prototype.madeText = function (s, type, dunk, is3) {
    var n = nm(s);
    if (is3) return pickText([n + " drills a three from the wing.", n + " buries a 27-footer.", n + " splashes a corner three.",
      n + " hits from deep.", n + " knocks down the three off the catch."]);
    if (type === "mid") return pickText([n + " hits a pull-up jumper.", n + " drains a fadeaway from the elbow.",
      n + " knocks down a mid-range jumper.", n + " rises and hits from 16 feet."]);
    if (type === "post") return pickText([n + " scores on a turnaround hook.", n + " backs down and scores in the post.",
      n + " drop-steps and lays it in.", n + " hits a fadeaway off the block."]);
    if (dunk) return pickText([n + " throws down a thunderous dunk!", n + " slams it home!", n + " finishes with a two-handed jam.",
      n + " rises up and hammers it down!"]);
    return pickText([n + " scoops in a layup.", n + " finishes at the rim.", n + " lays it in off the glass.",
      n + " converts a floater in the lane.", n + " spins through traffic and scores."]);
  };
  GameSim.prototype.missText = function (s, type, dunk) {
    var n = nm(s);
    if (type === "three") return pickText([n + " misses a three.", n + "'s three rims out.", n + " bricks a three from the top.",
      n + "'s corner three is short."]);
    if (type === "mid") return pickText([n + " misses a pull-up jumper.", n + "'s fadeaway rims out.", n + " misses from the elbow."]);
    if (type === "post") return pickText([n + " misses a hook shot.", n + "'s post fadeaway is off."]);
    if (dunk) return n + " gets stuffed at the rim on the dunk attempt.";
    return pickText([n + " misses a layup.", n + "'s floater is off the mark.", n + " can't finish through contact."]);
  };

  GameSim.prototype.freeThrows = function (off, def, s, n, ctx) {
    if (this.interactive && this.meter && s.isUser) {
      this.pending = { kind: "ft", off: off, def: def, shooter: s, n: n, i: 0, made: 0 };
      return;
    }
    var made = 0, last = false;
    for (var i = 0; i < n; i++) { last = rand() < ftProb(s); if (last) made++; }
    this.ftResult(off, def, s, n, made, last);
    void ctx;
  };
  // lastMade: whether the final attempt went in (a miss is a live rebound).
  GameSim.prototype.ftResult = function (off, def, s, n, made, lastMade) {
    var box = off.box[s.id];
    box.fta += n; box.ftm += made; box.pts += made;
    if (made) this.score(off, made);
    this.push(off, nm(s) + " makes " + made + " of " + n + " free throws.", "ft", s.isUser);
    if (!lastMade) this.rebound(off, def, -0.12);
    else this.change();
  };

  GameSim.prototype.rebound = function (off, def, bonus) {
    if (this.done) return;
    var onO = this.onP(off), onD = this.onP(def);
    var o = 0, d = 0;
    onO.forEach(function (p) { o += p.r.oreb * POS_REB[p.pos] + (p.bdg.glassCleaner || 0) * 2; });
    onD.forEach(function (p) { d += p.r.dreb * POS_REB[p.pos] + (p.bdg.glassCleaner || 0) * 2; });
    var pO = clamp(0.25 + (o - d) / 5 * 0.004 + (bonus || 0), 0.08, 0.45);
    var w = function (key) { return function (p) { return (p.r[key] / 50) * POS_REB[p.pos] * (1 + (p.bdg.glassCleaner || 0) * 0.1); }; };
    if (rand() < pO) {
      var r = R.weighted(onO, w("oreb"));
      off.box[r.id].orb++;
      this.push(off, nm(r) + " grabs the offensive rebound.", "reb", r.isUser);
      // Putback or reset
      var big = r.pos === "PF" || r.pos === "C";
      if (rand() < (big ? 0.45 : 0.2) + (r.bdg.putback || 0) * 0.05) {
        this.shot(off, def, r, "rim", { dur: this.possDuration(true) * 0.4, openness: 0, second: true, putback: true });
      } else {
        this.secondChance(off, def);
      }
      return;
    }
    // About one defensive board in ten is a team rebound (out of bounds, deflections) with no credit.
    if (rand() < 0.9) {
      var dr = R.weighted(onD, w("dreb"));
      def.box[dr.id].drb++;
      if (dr.isUser && this.interactive) this.push(def, "You pull down the defensive rebound.", "reb", true);
    }
    this.change();
  };

  GameSim.prototype.secondChance = function (off, def) {
    if (this.done) return;
    var onO = this.onP(off);
    var dur = this.possDuration(true);
    var s = R.weighted(onO, function (p) { return off.uw[p.id]; });
    this.shot(off, def, s, pickShotType(s), { dur: dur, openness: Math.round(clamp(normal(0.3, 0.8), -2, 2)), second: true });
  };

  // ---- Interactive decisions ---------------------------------------------------------
  var LOOKS = [
    { text: "{d} is pressed up tight on you.", o: { three: -1, mid: -1, rim: 1, post: 0, pass: 0 } },
    { text: "{d} is sagging off, daring you to shoot.", o: { three: 1, mid: 1, rim: -1, post: 0, pass: 0 } },
    { text: "The pick-and-roll leaves {d} switched onto you.", o: { three: 1, mid: 1, rim: 1, post: -1, pass: 0 }, sw: "big" },
    { text: "A mismatch: {d} got switched onto you.", o: { three: -1, mid: 0, rim: 1, post: 2, pass: 0 }, sw: "small" },
    { text: "The help defense is collapsing into the paint.", o: { three: 0, mid: 0, rim: -2, post: -1, pass: 2 } },
    { text: "Transition! The defense is scrambling back.", o: { three: 1, mid: 0, rim: 2, post: -1, pass: 1 } },
    { text: "The shot clock is winding down.", o: { three: -1, mid: 0, rim: -1, post: -1, pass: -1 }, late: true },
    { text: "{d} is locked in on you at the top of the key.", o: { three: 0, mid: 0, rim: 0, post: 0, pass: 0 } },
    { text: "Your teammate sets a screen and {d} goes under it.", o: { three: 2, mid: 1, rim: 0, post: -1, pass: 0 } }
  ];

  GameSim.prototype.offenseDecision = function (off, def, dur, prev) {
    var user = this.P(this.userId), defender = this.matchup(off, def, user.id);
    var look = prev && prev.beat ? { text: "You shook " + nm(defender) + "! The lane is open.", o: { three: 2, mid: 2, rim: 2, post: 1, pass: 1 } } : R.pick(LOOKS);
    var onD = this.onP(def);
    if (look.sw === "big") defender = onD.slice().sort(function (a, b) { return b.height - a.height; })[0];
    if (look.sw === "small") defender = onD.slice().sort(function (a, b) { return a.height - b.height; })[0];
    var helper = this.rimHelper(def);
    var clutch = this.isClutch(), diff = this.diffShot;
    function jitter(v) { return clamp(v + (rand() < 0.25 ? (rand() < 0.5 ? -1 : 1) : 0), -2, 2); }
    var options = [];
    ["three", "mid", "rim", "post"].forEach(function (t) {
      if (t === "post" && user.r.post < 50 && !(user.pos === "PF" || user.pos === "C")) return;
      var o = jitter(look.o[t] || 0);
      var dunk = t === "rim" && dunkChance(user) > 0.45;
      var est = shotProb(user, t, { defender: defender, helper: helper, openness: o, dunk: dunk, energy: off.energy[user.id],
        clutch: clutch, home: off.home, diff: diff });
      options.push({ id: t, label: t === "three" ? "Pull-up Three" : SHOT_NAME[t], open: o, openLabel: OPEN_LABEL[o], est: est,
        dunk: dunk, meterType: t });
    });
    // Pass to the most dangerous open teammate.
    var mates = this.onP(off).filter(function (p) { return p !== user; });
    var target = R.weighted(mates, function (p) { return off.uw[p.id]; });
    var tType = pickShotType(target);
    var tOpen = jitter(clamp((look.o.pass || 0) + 1, -2, 2));
    var tDef = this.matchup(off, def, target.id);
    var fg = user.bdg.floorGeneral || 0;
    var tEst = shotProb(target, tType, { defender: tDef, helper: helper, openness: tOpen, energy: off.energy[target.id], home: off.home,
      assistBoost: fg * 0.01 + (user.r.pass - 60) * 0.0008 });
    options.push({ id: "pass", label: "Pass to " + nm(target), sub: (tType === "three" ? "3PT" : tType === "rim" ? "Cutting to the rim" : tType === "post" ? "Post" : "Mid-range") + " · " + OPEN_LABEL[tOpen],
      open: tOpen, openLabel: OPEN_LABEL[tOpen], est: tEst, target: target, tType: tType });
    var sizeups = prev ? prev.sizeups : 0;
    if (sizeups < 2) {
      var pBeat = clamp(0.42 + (user.r.handle - defender.r.perD) * 0.008 + (user.bdg.tightHandles || 0) * 0.04 + (user.bdg.blurStep || 0) * 0.03, 0.12, 0.85);
      options.push({ id: "sizeup", label: "Size Up (dribble move)", sub: "Beat your man to open up everything", est: pBeat, isMove: true });
    }
    this.pending = {
      kind: "offense", off: off, def: def, dur: dur, defender: defender, helper: helper, look: look.text.replace("{d}", nm(defender) + " (" + defender.ovr + ")"),
      options: options, sizeups: sizeups, shotClock: look.late ? R.randInt(3, 6) : Math.max(4, Math.round(22 - (prev ? prev.used : 0) - rand() * 8))
    };
  };

  GameSim.prototype.resolveOffense = function (optId, timing) {
    var pd = this.pending;
    if (!pd || pd.kind !== "offense") return;
    var opt = pd.options.filter(function (o) { return o.id === optId; })[0];
    if (!opt) return;
    var user = this.P(this.userId), off = pd.off, def = pd.def;
    this.pending = null;
    if (opt.id === "sizeup") {
      var beat = rand() < opt.est;
      if (!beat && rand() < 0.2) {
        this.turnover(off, def, user, pd.dur, pd.defender);
        return;
      }
      this.push(off, beat ? "You cross up " + nm(pd.defender) + " and create space!" : nm(pd.defender) + " stays in front of you.", "info", true);
      this.offenseDecision(off, def, pd.dur, { beat: beat, sizeups: pd.sizeups + 1, used: 24 - pd.shotClock + 4 });
      return;
    }
    if (opt.id === "pass") {
      if (rand() < clamp(0.045 - (user.r.pass - 60) * 0.0009, 0.01, 0.08)) {
        this.turnover(off, def, user, pd.dur);
        return;
      }
      var fg = user.bdg.floorGeneral || 0;
      this.push(off, "You find " + nm(opt.target) + ".", "info", true);
      this.shot(off, def, opt.target, opt.tType, { dur: pd.dur, openness: opt.open, assister: user,
        assistBoost: fg * 0.01 + (user.r.pass - 60) * 0.0008 });
      return;
    }
    this.shot(off, def, user, opt.id, { dur: pd.dur, openness: opt.open, defender: pd.defender, timing: this.meter ? timing : null });
  };

  GameSim.prototype.defenseDecision = function (off, def, dur) {
    var user = this.P(this.userId), idx = def.on.indexOf(user.id), s = this.P(off.on[idx]);
    var t = shotTendencies(s);
    var top = Object.keys(t).sort(function (a, b) { return t[b] - t[a]; })[0];
    var like = { three: "shoot the three", mid: "pull up from mid-range", rim: "attack the rim", post: "back you down in the post" }[top];
    var pSteal = clamp(0.1 + (user.r.steal - 60) * 0.004 + (user.bdg.pickpocket || 0) * 0.02 - (s.r.handle - 70) * 0.002, 0.04, 0.4);
    this.pending = {
      kind: "defense", off: off, def: def, dur: dur, shooter: s,
      look: nm(s) + " (" + s.pos + " · " + s.ovr + " OVR) is sizing you up. He likes to " + like + ".",
      options: [
        { id: "contest", label: "Stay in Front", sub: "Contest whatever he takes", est: null },
        { id: "gamble", label: "Gamble for the Steal", sub: "Big reward, gives up a blow-by if you miss", est: pSteal },
        { id: "sag", label: "Sag Off, Protect the Paint", sub: "Take away the drive, concede the jumper", est: null }
      ]
    };
  };

  GameSim.prototype.resolveDefense = function (optId) {
    var pd = this.pending;
    if (!pd || pd.kind !== "defense") return;
    this.pending = null;
    var user = this.P(this.userId), s = pd.shooter, off = pd.off, def = pd.def;
    var dRating = (user.r.perD + user.r.intD) / 2;
    if (optId === "gamble") {
      var opt = pd.options[1];
      if (rand() < opt.est) { this.turnover(off, def, s, pd.dur, user); return; }
      this.push(def, nm(s) + " blows by you after the gamble.", "info", true);
      var type = pickShotType(s, { rim: 1.8, three: 0.6 });
      this.shot(off, def, s, type, { dur: pd.dur, openness: 2, defender: user, gambleFoul: true });
      return;
    }
    if (optId === "sag") {
      var t2 = pickShotType(s, { three: 1.7, mid: 1.3, rim: 0.45, post: 0.6 });
      this.shot(off, def, s, t2, { dur: pd.dur, openness: t2 === "three" || t2 === "mid" ? 1 : -1, defender: user });
      return;
    }
    var t3 = pickShotType(s);
    this.shot(off, def, s, t3, { dur: pd.dur, openness: dRating >= 72 ? -1 : 0, defender: user });
  };

  GameSim.prototype.resolveFT = function (timing) {
    var pd = this.pending;
    if (!pd || pd.kind !== "ft") return null;
    var p = applyTiming(ftProb(pd.shooter), timing, 1);
    var made = rand() < p;
    pd.i++;
    if (made) pd.made++;
    if (pd.i >= pd.n) {
      this.pending = null;
      this.ftResult(pd.off, pd.def, pd.shooter, pd.n, pd.made, made);
    }
    return made;
  };

  // Auto-play everything that is left for the user (used by "Sim to end").
  GameSim.prototype.autoFinish = function () {
    this.interactive = false;
    var pd = this.pending;
    if (pd) {
      if (pd.kind === "offense") this.resolveOffense(pd.options[Math.floor(rand() * 3)].id, null);
      else if (pd.kind === "defense") this.resolveDefense("contest");
      else if (pd.kind === "ft") { this.meter = false; while (this.pending) this.resolveFT(null); }
    }
    this.pending = null;
    this.run();
  };

  GameSim.prototype.result = function () {
    var h = this.sides[0], a = this.sides[1];
    return { home: h.tid, away: a.tid, hs: h.score, as: a.score, ot: Math.max(0, this.q - 4), boxes: [h.box, a.box],
      starters: [h.starters, a.starters], qScores: [h.qScores, a.qScores] };
  };

  // Random court coordinates (feet from the baseline, 50x47 half court) for the shot chart.
  function shotSpot(type) {
    var bx = 25, by = 5.25, ang, r;
    if (type === "three") {
      if (rand() < 0.22) return { x: rand() < 0.5 ? 1.5 + rand() * 1.5 : 47 + rand() * 1.5, y: 1 + rand() * 11 };
      ang = (rand() - 0.5) * 2 * 1.15; r = 24 + rand() * 3;
    } else if (type === "mid") {
      ang = (rand() - 0.5) * 2 * 1.35; r = 9 + rand() * 12;
    } else if (type === "post") {
      ang = (rand() - 0.5) * 2 * 1.3; r = 4 + rand() * 6;
    } else {
      ang = (rand() - 0.5) * 2 * 1.4; r = rand() * 4;
    }
    return { x: clamp(bx + r * Math.sin(ang), 1, 49), y: clamp(by + r * Math.cos(ang), 0.5, 46) };
  }

  HL.sim = {
    GameSim: GameSim, shotProb: shotProb, ftProb: ftProb, shotTendencies: shotTendencies, usageWeight: usageWeight,
    meterWindow: meterWindow, applyTiming: applyTiming, shotSpot: shotSpot, fmtClock: fmtClock, nm: nm,
    OPEN_LABEL: OPEN_LABEL, MIN_BY_RANK: MIN_BY_RANK
  };
});
