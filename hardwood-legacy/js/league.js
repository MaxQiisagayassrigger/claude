/*
 * League: rosters, schedule, standings, stat application, the user's career economy (VC, trust,
 * fans, goals), All-Stars, awards, playoffs, contracts and the offseason.
 */
(function (root, factory) {
  var HL = (root.HL = root.HL || {});
  factory(HL);
  if (typeof module === "object" && module.exports) module.exports = HL;
})(typeof globalThis !== "undefined" ? globalThis : this, function (HL) {
  "use strict";
  var D = HL.data, R = HL.rng, P = HL.player, S = HL.sim, rand = R.rand, clamp = R.clamp, normal = R.normal;

  var ROSTER_OFFSETS = [11, 7, 4, 2, 0, -2, -3, -5, -6, -8, -9, -11, -13];
  var GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"];
  var GRADE_CUTS = [2.0, 1.4, 0.95, 0.55, 0.2, -0.1, -0.4, -0.7, -1.0, -1.45];
  var GRADE_VC = { "A+": 200, "A": 165, "A-": 140, "B+": 115, "B": 95, "B-": 80, "C+": 66, "C": 54, "C-": 44, "D": 30, "F": 15 };
  var GRADE_TRUST = { "A+": 4, "A": 3, "A-": 2.2, "B+": 1.4, "B": 0.7, "B-": 0, "C+": -0.7, "C": -1.3, "C-": -2, "D": -3, "F": -4 };
  var AWARD_VC = { "All-Star": 2500, "All-NBA 1st Team": 5000, "All-NBA 2nd Team": 3500, "All-NBA 3rd Team": 2500,
    "All-Defensive 1st Team": 2500, "All-Defensive 2nd Team": 1500, "MVP": 9000, "Rookie of the Year": 3000,
    "Defensive Player of the Year": 4500, "Sixth Man of the Year": 2500, "Scoring Champion": 3000, "Champion": 6000, "Finals MVP": 5000 };
  var ENDORSE = [[0, "No deal", 0], [50e3, "Local sneaker deal", 1500], [250e3, "Regional brand deal", 4000],
    [1e6, "National endorsement", 8000], [3e6, "Signature shoe", 15000]];

  function seasonLabel(y) { return y + "-" + String((y + 1) % 100).padStart(2, "0"); }
  function teamName(t) { return t.city + " " + t.name; }
  function user(L) { return L.players[L.userId]; }
  function userTeam(L) { var u = user(L); return u.teamId >= 0 ? L.teams[u.teamId] : null; }
  function seasonScale(L) { return 82 / L.settings.seasonLength; }

  // ---- Creation --------------------------------------------------------------------
  function create(u, settings) {
    var L = {
      version: 1, year: 2026, settings: settings, teams: [], players: {}, userId: u.id, day: 0, phase: "draft",
      schedule: [], history: [], news: [], po: null, seasonAwards: null, allStars: null,
      user: { vc: 0, fans: 5000, trust: 50, gameLog: [], seasons: [], awards: [], rings: 0, highs: {}, shots: [],
        goals: [], contract: null, trainFocus: "shooting", trainXP: 0, tradeUsed: false, draft: null, lastGame: null,
        progress: null, milestones: {} }
    };
    L.players[u.id] = u;
    D.TEAMS.forEach(function (t) {
      L.teams.push({ id: t.id, abbr: t.abbr, city: t.city, name: t.name, conf: t.conf, c1: t.c1, c2: t.c2,
        w: 0, l: 0, pf: 0, pa: 0, roster: [] });
    });
    L.teams.forEach(function (t) {
      var base = 73 + clamp(normal(0, 3), -6, 6);
      var starterPos = R.shuffle(["PG", "SG", "SF", "PF", "C"]);
      var benchPos = R.shuffle(["PG", "SG", "SF", "PF", "C", "SG", "SF", "PF"]);
      var slots = starterPos.concat(benchPos);
      ROSTER_OFFSETS.forEach(function (off, i) {
        var ovr = Math.round(clamp(base + off + normal(0, 1.6), 46, 97));
        var age = clamp(Math.round(normal(ovr >= 80 ? 28 : 26, 3.5)), 20, 37);
        var p = P.makePlayer({ pos: slots[i], ovr: ovr, age: age, teamId: t.id, yearsPro: Math.max(0, age - 21) });
        L.players[p.id] = p;
        t.roster.push(p.id);
      });
    });
    return L;
  }

  function teamStrength(L, t) {
    var o = t.roster.map(function (id) { return L.players[id].ovr; }).sort(function (a, b) { return b - a; });
    var s = 0;
    for (var i = 0; i < 8 && i < o.length; i++) s += o[i] * (i < 5 ? 1.2 : 0.8);
    return s;
  }

  // ---- Draft -----------------------------------------------------------------------
  function draftOrder(L) {
    var byStrength = L.teams.slice().sort(function (a, b) { return teamStrength(L, a) - teamStrength(L, b); });
    var lottery = byStrength.slice(0, 14), order = [];
    for (var k = 0; k < 4; k++) {
      var t = R.weighted(lottery, function (x) { return 15 - byStrength.indexOf(x); });
      order.push(t); lottery.splice(lottery.indexOf(t), 1);
    }
    byStrength.forEach(function (t) { if (order.indexOf(t) < 0) order.push(t); });
    return order.map(function (t) { return t.id; });
  }
  function rookieSalary(pick) { return pick <= 30 ? Math.round((11.5 - (pick - 1) * 0.3) * 10) / 10 : 1.4; }

  // combineMakes: 0..10 from the shooting drill. Returns the draft result and signs the user.
  function draftUser(L, combineMakes, athleticScore) {
    var u = user(L);
    var stock = 32 - combineMakes * 1.6 - (u.pot - 86) * 1.3 - (athleticScore || 0) * 3 + normal(0, 3.5);
    var pick = Math.round(clamp(stock, 1, 45));
    var order = draftOrder(L), tid = order[(pick - 1) % 30];
    var t = L.teams[tid];
    t.roster.push(u.id);
    u.teamId = tid;
    // Starting OVR nudged by draft stock (lottery picks arrive a little more polished).
    var bump = pick <= 5 ? 3 : pick <= 14 ? 2 : pick <= 30 ? 1 : 0;
    if (bump) {
      var caps = u.caps;
      u.r = P.builderStart(u.pos, caps, 60 + bump);
      P.refresh(u);
    }
    var years = pick <= 30 ? 4 : 2;
    L.user.contract = { salary: rookieSalary(pick), years: years, total: years, teamId: tid, rookie: true };
    L.user.draft = { year: L.year, pick: pick, round: pick <= 30 ? 1 : 2, teamId: tid, order: order };
    L.user.fans += Math.round(40000 / pick);
    addNews(L, "With the " + ordinal(pick) + " pick, the " + teamName(t) + " select " + u.first + " " + u.last + ".", "user");
    return L.user.draft;
  }
  function ordinal(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // ---- Schedule ----------------------------------------------------------------------
  function roundRobin(n) {
    var arr = [], rounds = [], i, r;
    for (i = 0; i < n; i++) arr.push(i);
    for (r = 0; r < n - 1; r++) {
      var pairs = [];
      for (i = 0; i < n / 2; i++) {
        var a = arr[i], b = arr[n - 1 - i];
        pairs.push((r + i) % 2 ? [a, b] : [b, a]);
      }
      rounds.push(pairs);
      arr.splice(1, 0, arr.pop());
    }
    return rounds;
  }
  function makeSchedule(L) {
    var n = L.settings.seasonLength, base = roundRobin(30), days = [], cycle = 0;
    while (days.length < n) {
      var order = R.shuffle(base.slice());
      for (var i = 0; i < order.length && days.length < n; i++) {
        days.push(order[i].map(function (p) {
          var h = cycle % 2 ? p[1] : p[0], a = cycle % 2 ? p[0] : p[1];
          return { h: h, a: a, hs: null, as: null, ot: 0 };
        }));
      }
      cycle++;
    }
    L.schedule = days;
  }

  // ---- Season start --------------------------------------------------------------
  function expectedPpg(ovr) { return Math.max(4, (ovr - 56) * 0.85); }
  function startSeason(L) {
    L.phase = "regular";
    L.day = 0;
    L.po = null;
    L.seasonAwards = null;
    L.allStars = null;
    L.teams.forEach(function (t) { t.w = 0; t.l = 0; t.pf = 0; t.pa = 0; });
    makeSchedule(L);
    var u = user(L), U = L.user;
    U.gameLog = [];
    U.shots = [];
    U.lastGame = null;
    U.tradeUsed = false;
    var t = userTeam(L), rank = rosterRank(L, u), str = teamStrength(L, t);
    var avgStr = L.teams.reduce(function (s, x) { return s + teamStrength(L, x); }, 0) / 30;
    var winPct = clamp(0.5 + (str - avgStr) / 120, 0.25, 0.75);
    var ppg = Math.round(expectedPpg(u.ovr) + (U.trust - 50) / 25 + 1.5);
    U.goals = [
      { id: "ppg", label: "Average " + ppg + " points per game", target: ppg, vc: 2000 },
      { id: "wins", label: "Win " + Math.round(winPct * L.settings.seasonLength + 2) + " games", target: Math.round(winPct * L.settings.seasonLength + 2), vc: 1500 },
      { id: "grade", label: "Keep a B or better teammate grade average", target: 4, vc: 1500 },
      u.ovr >= 78 || rank <= 2 ? { id: "allstar", label: "Make the All-Star team", target: 1, vc: 3000 }
        : { id: "games", label: "Play in 90% of your team's games", target: 0.9, vc: 1000 }
    ];
    addNews(L, "The " + seasonLabel(L.year) + " season tips off. " + t.city + " open against the " +
      L.teams[opponentOn(L, 0)].name + ".", "league");
  }
  function rosterRank(L, p) {
    var t = L.teams[p.teamId];
    var sorted = t.roster.map(function (id) { return L.players[id]; }).sort(function (a, b) { return b.ovr - a.ovr; });
    return sorted.indexOf(p) + 1;
  }
  function opponentOn(L, day) {
    var tid = user(L).teamId, g = findGame(L.schedule[day], tid);
    return g ? (g.h === tid ? g.a : g.h) : -1;
  }
  function findGame(day, tid) {
    if (!day) return null;
    for (var i = 0; i < day.length; i++) if (day[i].h === tid || day[i].a === tid) return day[i];
    return null;
  }

  // ---- Game application ------------------------------------------------------------
  var STAT_KEYS = ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "orb", "drb", "ast", "stl", "blk", "tov", "pf", "pm"];
  function applyBoxes(L, res, playoff) {
    for (var s = 0; s < 2; s++) {
      var box = res.boxes[s];
      Object.keys(box).forEach(function (pid) {
        var b = box[pid];
        if (b.sec <= 0) return;
        var p = L.players[pid];
        if (!p) return;
        var st = playoff ? p.po : p.stats;
        st.gp++; st.gs += b.gs; st.min += b.sec / 60;
        for (var k = 0; k < STAT_KEYS.length; k++) st[STAT_KEYS[k]] += b[STAT_KEYS[k]];
      });
    }
    if (!playoff) {
      var h = L.teams[res.home], a = L.teams[res.away];
      h.pf += res.hs; h.pa += res.as; a.pf += res.as; a.pa += res.hs;
      if (res.hs > res.as) { h.w++; a.l++; } else { a.w++; h.l++; }
    }
  }

  function injuries(L, res) {
    var rate = L.settings.injuries ? 0.0045 : 0;
    if (!rate) return;
    for (var s = 0; s < 2; s++) {
      var box = res.boxes[s];
      Object.keys(box).forEach(function (pid) {
        var b = box[pid], p = L.players[pid];
        if (!p || b.sec <= 0 || p.inj) return;
        var r = rate * (b.sec / 1800) * (p.isUser ? 0.55 : 1) * (p.age >= 32 ? 1.3 : 1);
        if (rand() < r) {
          var x = rand(), g = x < 0.6 ? R.randInt(1, 3) : x < 0.9 ? R.randInt(4, 10) : R.randInt(11, 25);
          p.inj = g;
          p.injName = R.pick(g <= 3 ? ["Ankle sprain", "Back spasms", "Hip contusion", "Sore knee"] :
            g <= 10 ? ["Hamstring strain", "Sprained wrist", "Groin strain", "Calf strain"] : ["Broken hand", "High ankle sprain", "Torn ligament in thumb", "Knee sprain"]);
          if (p.isUser) addNews(L, "You suffered a " + p.injName.toLowerCase() + " and will miss about " + g + " game" + (g > 1 ? "s" : "") + ".", "user");
          else if (p.ovr >= 84) addNews(L, L.teams[p.teamId].abbr + " star " + p.first + " " + p.last + " is out " + g + " game" + (g > 1 ? "s" : "") + " (" + p.injName.toLowerCase() + ").", "league");
        }
      });
    }
  }
  function healDay(L, teamsPlayed) {
    Object.keys(L.players).forEach(function (id) {
      var p = L.players[id];
      if (p.inj && teamsPlayed[p.teamId]) { p.inj--; if (!p.inj) { p.injName = ""; if (p.isUser) addNews(L, "You have been cleared to return.", "user"); } }
    });
  }

  function gameScore(b) {
    return b.pts + 0.4 * b.fgm - 0.7 * b.fga - 0.4 * (b.fta - b.ftm) + 0.7 * b.orb + 0.3 * b.drb + b.stl + 0.7 * b.ast + 0.7 * b.blk - 0.4 * b.pf - b.tov;
  }
  // Graded against what a player of this OVR should produce in these minutes.
  function teammateGrade(b, won, ovr) {
    var min = b.sec / 60, perMin = clamp(0.1 + ((ovr || 70) - 60) * 0.011, 0.08, 0.5);
    var z = (gameScore(b) - min * perMin) / Math.max(3, Math.sqrt(Math.max(min, 1)) * 1.3) + b.pm / 22 + (won ? 0.25 : -0.1);
    for (var i = 0; i < GRADE_CUTS.length; i++) if (z >= GRADE_CUTS[i]) return GRADES[i];
    return "F";
  }
  function gradeIndex(g) { return GRADES.length - 1 - GRADES.indexOf(g); } // F=0 .. A+=10

  // Post-game bookkeeping for the user. Returns a summary for the UI.
  function userPostGame(L, res, sim, playoff) {
    var u = user(L), U = L.user, side = res.home === u.teamId ? 0 : 1, b = res.boxes[side][u.id];
    var my = side === 0 ? res.hs : res.as, their = side === 0 ? res.as : res.hs, won = my > their;
    var opp = L.teams[side === 0 ? res.away : res.home];
    if (!b || b.sec <= 0) {
      var entry0 = { year: L.year, day: L.day, opp: opp.abbr, home: side === 0, won: won, score: my + "-" + their, dnp: true, playoff: playoff };
      U.gameLog.push(entry0);
      U.lastGame = { res: res, entry: entry0, sideIdx: side };
      return U.lastGame;
    }
    var grade = teammateGrade(b, won, u.ovr), diff = D.DIFFICULTY[L.settings.difficulty];
    var vc = Math.round((50 + GRADE_VC[grade] + (won ? 30 : 0) + b.pts * 2 + (playoff ? 60 : 0)) * diff.vc * (playoff ? 1 : seasonScale(L)));
    U.vc += vc;
    // Trust moves with each grade and drifts back toward neutral, so one bad stretch is recoverable.
    var sc = playoff ? 1 : seasonScale(L);
    var dTrust = GRADE_TRUST[grade] * Math.sqrt(sc) + (50 - U.trust) * 0.02 * sc;
    U.trust = clamp(U.trust + dTrust, 0, 100);
    var gs = gameScore(b);
    U.fans += Math.round(Math.max(0, gs) * 140 * (playoff ? 2 : 1) * Math.sqrt(seasonScale(L)) + (grade === "A+" ? 2500 : 0));
    var line = { min: Math.round(b.sec / 60), pts: b.pts, reb: b.orb + b.drb, ast: b.ast, stl: b.stl, blk: b.blk, tov: b.tov,
      fgm: b.fgm, fga: b.fga, tpm: b.tpm, tpa: b.tpa, ftm: b.ftm, fta: b.fta, pm: b.pm };
    var entry = { year: L.year, day: L.day, opp: opp.abbr, home: side === 0, won: won, score: my + "-" + their, line: line, grade: grade, vc: vc, playoff: playoff };
    U.gameLog.push(entry);
    if (sim && sim.userShots) U.shots = U.shots.concat(sim.userShots).slice(-600);
    // Career highs
    var highs = [];
    [["pts", line.pts], ["reb", line.reb], ["ast", line.ast], ["stl", line.stl], ["blk", line.blk], ["tpm", line.tpm]].forEach(function (x) {
      var cur = U.highs[x[0]];
      if (x[1] > 0 && (!cur || x[1] > cur.v)) { U.highs[x[0]] = { v: x[1], opp: opp.abbr, year: L.year }; if (cur) highs.push(x[0]); }
    });
    // Training XP (one tick per game played)
    train(L, grade);
    // Headline
    var tag = "";
    if (line.pts >= 10 && line.reb >= 10 && line.ast >= 10) tag = "records a triple-double";
    else if (line.pts >= 40) tag = "erupts for " + line.pts;
    else if (line.pts >= 30) tag = "pours in " + line.pts;
    else if ((line.pts >= 10) + (line.reb >= 10) + (line.ast >= 10) >= 2) tag = "posts a double-double";
    if (tag) addNews(L, u.first + " " + u.last + " " + tag + " as " + L.teams[u.teamId].abbr + (won ? " beat " : " fall to ") + opp.name + " " + my + "-" + their + ".", "user");
    milestones(L);
    U.lastGame = { res: res, entry: entry, sideIdx: side, grade: grade, vc: vc, trust: dTrust, highs: highs };
    return U.lastGame;
  }

  function milestones(L) {
    var u = user(L), U = L.user, pts = u.career.pts + u.stats.pts + u.po.pts;
    [1000, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000].forEach(function (m) {
      if (pts >= m && !U.milestones["pts" + m]) {
        U.milestones["pts" + m] = L.year;
        addNews(L, "Milestone: " + u.first + " " + u.last + " passes " + m.toLocaleString("en-US") + " career points.", "user");
      }
    });
  }

  function train(L, grade) {
    var U = L.user, u = user(L);
    U.trainXP += seasonScale(L) * (gradeIndex(grade || "C") >= 7 ? 1.4 : 1);
    while (U.trainXP >= 8) {
      U.trainXP -= 8;
      var group = D.ATTR_GROUPS.filter(function (g) { return g.key === U.trainFocus; })[0] || D.ATTR_GROUPS[1];
      var opts = group.attrs.map(function (a) { return a[0]; }).filter(function (a) { return u.r[a] < u.caps[a]; });
      if (!opts.length) continue;
      var a = R.pick(opts);
      u.r[a]++;
      P.refresh(u);
      U.progress = U.progress || {};
      U.progress[a] = (U.progress[a] || 0) + 1;
      addNews(L, "Training paid off: " + D.ATTR_LABEL[a] + " +1 (now " + u.r[a] + ").", "train");
    }
  }

  // ---- Day simulation --------------------------------------------------------------------
  function simGame(L, h, a, playoff) {
    var sim = new S.GameSim(L, h, a, { playoff: playoff });
    sim.run();
    return sim;
  }

  function nextUserGame(L) {
    var u = user(L);
    if (L.phase === "regular") {
      var g = findGame(L.schedule[L.day], u.teamId);
      return g ? { h: g.h, a: g.a, playoff: false } : null;
    }
    if (L.phase === "playoffs" && L.po) {
      var s = userSeries(L);
      if (!s || s.done) return null;
      var hi = homeOfGame(s);
      return { h: hi, a: hi === s.hi ? s.lo : s.hi, playoff: true, series: s };
    }
    return null;
  }

  // Plays the current day. userSim: a finished interactive GameSim for the user's game (optional).
  function playDay(L, userSim) {
    if (L.phase === "regular") return playRegularDay(L, userSim);
    if (L.phase === "playoffs") return playPlayoffDay(L, userSim);
    return null;
  }

  function playRegularDay(L, userSim) {
    var day = L.schedule[L.day], u = user(L), summary = null, played = {};
    day.forEach(function (g) {
      var isUser = g.h === u.teamId || g.a === u.teamId;
      var sim = isUser && userSim ? userSim : simGame(L, g.h, g.a, false);
      var res = sim.result();
      g.hs = res.hs; g.as = res.as; g.ot = res.ot;
      applyBoxes(L, res, false);
      injuries(L, res);
      played[g.h] = played[g.a] = true;
      if (isUser) summary = userPostGame(L, res, sim, false);
    });
    healDay(L, played);
    L.day++;
    if (L.day === Math.floor(L.settings.seasonLength / 2)) pickAllStars(L);
    if (L.day >= L.schedule.length) endRegularSeason(L);
    return summary;
  }

  // ---- Stats helpers -----------------------------------------------------------------------
  function perGame(st) {
    var g = Math.max(1, st.gp);
    return {
      gp: st.gp, gs: st.gs, min: st.min / g, pts: st.pts / g, reb: (st.orb + st.drb) / g, orb: st.orb / g, drb: st.drb / g, ast: st.ast / g,
      stl: st.stl / g, blk: st.blk / g, tov: st.tov / g, pf: st.pf / g, pm: st.pm / g,
      fg: st.fga ? st.fgm / st.fga : 0, tp: st.tpa ? st.tpm / st.tpa : 0, ft: st.fta ? st.ftm / st.fta : 0,
      ts: (st.fga + 0.44 * st.fta) ? st.pts / (2 * (st.fga + 0.44 * st.fta)) : 0,
      fga: st.fga / g, tpa: st.tpa / g, fta: st.fta / g
    };
  }
  function winPct(t) { return t.w + t.l ? t.w / (t.w + t.l) : 0.5; }
  function impact(p, L) {
    var s = perGame(p.stats), t = L.teams[p.teamId];
    return s.pts + 0.85 * s.reb + 1.3 * s.ast + 1.7 * s.stl + 1.7 * s.blk - 1.1 * s.tov + (s.ts - 0.56) * 35 + (t ? winPct(t) * 16 : 0);
  }
  function defImpact(p, L) {
    var s = perGame(p.stats), t = L.teams[p.teamId];
    return s.stl * 3 + s.blk * 3.2 + s.drb * 0.55 + (p.r.perD + p.r.intD) / 2 * 0.16 + (t ? winPct(t) * 6 : 0) + s.min * 0.05;
  }
  function eligible(L, minFrac) {
    var gamesSoFar = Math.max(1, L.day);
    return Object.keys(L.players).map(function (id) { return L.players[id]; }).filter(function (p) {
      return p.teamId >= 0 && p.stats.gp >= gamesSoFar * minFrac && p.stats.min / Math.max(1, p.stats.gp) >= 15;
    });
  }

  function pickAllStars(L) {
    var pool = eligible(L, 0.5), U = L.user, u = user(L);
    var res = { E: [], W: [] };
    ["E", "W"].forEach(function (c) {
      res[c] = pool.filter(function (p) { return L.teams[p.teamId].conf === c; })
        .sort(function (a, b) { return impact(b, L) - impact(a, L); }).slice(0, 12).map(function (p) { return p.id; });
    });
    L.allStars = res;
    if (res.E.concat(res.W).indexOf(u.id) >= 0) {
      grantAward(L, "All-Star");
      U.fans += 120000;
      addNews(L, "You have been named an All-Star for the " + seasonLabel(L.year) + " season!", "user");
    } else {
      addNews(L, "All-Star rosters are out. " + nameOf(L, res.W[0]) + " and " + nameOf(L, res.E[0]) + " lead the voting.", "league");
    }
  }
  function nameOf(L, id) { var p = L.players[id]; return p ? p.first + " " + p.last : "?"; }
  function grantAward(L, name) {
    var U = L.user;
    U.awards.push({ year: L.year, name: name });
    var vc = AWARD_VC[name] || 0;
    U.vc += vc;
    return vc;
  }

  function endRegularSeason(L) {
    var pool = eligible(L, 0.65), u = user(L);
    var by = function (fn) { return pool.slice().sort(function (a, b) { return fn(b, L) - fn(a, L); }); };
    var mvp = by(impact), dpoy = by(defImpact);
    var roy = pool.filter(function (p) { return p.yearsPro === 0; }).sort(function (a, b) { return impact(b, L) - impact(a, L); });
    var smoy = pool.filter(function (p) { return p.stats.gs / p.stats.gp < 0.3; }).sort(function (a, b) { return impact(b, L) - impact(a, L); });
    var scorer = pool.slice().sort(function (a, b) { return perGame(b.stats).pts - perGame(a.stats).pts; });
    var A = {
      year: L.year,
      MVP: mvp.slice(0, 5).map(function (p) { return p.id; }),
      "Defensive Player of the Year": dpoy.slice(0, 3).map(function (p) { return p.id; }),
      "Rookie of the Year": roy.slice(0, 3).map(function (p) { return p.id; }),
      "Sixth Man of the Year": smoy.slice(0, 3).map(function (p) { return p.id; }),
      "Scoring Champion": scorer.slice(0, 1).map(function (p) { return p.id; }),
      allNBA: [mvp.slice(0, 5), mvp.slice(5, 10), mvp.slice(10, 15)].map(function (a) { return a.map(function (p) { return p.id; }); }),
      allDef: [dpoy.slice(0, 5), dpoy.slice(5, 10)].map(function (a) { return a.map(function (p) { return p.id; }); })
    };
    L.seasonAwards = A;
    var mine = [];
    ["MVP", "Defensive Player of the Year", "Rookie of the Year", "Sixth Man of the Year", "Scoring Champion"].forEach(function (k) {
      if (A[k][0] === u.id) mine.push(k);
    });
    A.allNBA.forEach(function (team, i) { if (team.indexOf(u.id) >= 0) mine.push("All-NBA " + ["1st", "2nd", "3rd"][i] + " Team"); });
    A.allDef.forEach(function (team, i) { if (team.indexOf(u.id) >= 0) mine.push("All-Defensive " + ["1st", "2nd"][i] + " Team"); });
    A.mine = mine.map(function (k) { return { name: k, vc: grantAward(L, k) }; });
    if (mine.indexOf("MVP") >= 0) L.user.fans += 1500000;
    else if (mine.length) L.user.fans += 150000 * mine.length;
    // Season goals
    var s = perGame(u.stats), t = userTeam(L), logs = L.user.gameLog.filter(function (g) { return !g.playoff && g.grade; });
    var avgGrade = logs.length ? logs.reduce(function (x, g) { return x + gradeIndex(g.grade); }, 0) / logs.length : 0;
    L.user.goals.forEach(function (g) {
      var v = g.id === "ppg" ? s.pts : g.id === "wins" ? t.w : g.id === "grade" ? avgGrade - 2 : g.id === "allstar" ?
        (L.allStars && L.allStars.E.concat(L.allStars.W).indexOf(u.id) >= 0 ? 1 : 0) : u.stats.gp / L.settings.seasonLength;
      g.value = v;
      g.done = v >= g.target;
      if (g.done) L.user.vc += g.vc;
    });
    L.phase = "awards";
    addNews(L, "Regular season complete. " + nameOf(L, A.MVP[0]) + " is named MVP.", "league");
  }

  // ---- Standings ---------------------------------------------------------------------------
  function standings(L, conf) {
    return L.teams.filter(function (t) { return !conf || t.conf === conf; }).sort(function (a, b) {
      return winPct(b) - winPct(a) || (b.pf - b.pa) - (a.pf - a.pa);
    });
  }

  // ---- Playoffs ------------------------------------------------------------------------------
  function startPlayoffs(L) {
    var series = [];
    ["E", "W"].forEach(function (c) {
      var s = standings(L, c).slice(0, 8);
      [[0, 7], [3, 4], [2, 5], [1, 6]].forEach(function (m) {
        series.push({ conf: c, round: 1, hi: s[m[0]].id, lo: s[m[1]].id, hiSeed: m[0] + 1, loSeed: m[1] + 1, hw: 0, lw: 0, games: [], done: false });
      });
    });
    L.po = { round: 1, series: series, rounds: [series.slice()], champion: null, fmvp: null };
    L.phase = "playoffs";
    var u = user(L);
    var mine = userSeries(L);
    addNews(L, mine ? "Playoffs! " + L.teams[u.teamId].abbr + " (" + (mine.hi === u.teamId ? mine.hiSeed : mine.loSeed) + ") face " +
      L.teams[mine.hi === u.teamId ? mine.lo : mine.hi].name + " in round one." : "Your team missed the playoffs.", "user");
  }
  function userSeries(L) {
    if (!L.po) return null;
    var tid = user(L).teamId;
    for (var i = 0; i < L.po.series.length; i++) {
      var s = L.po.series[i];
      if (s.round === L.po.round && (s.hi === tid || s.lo === tid)) return s;
    }
    return null;
  }
  function homeOfGame(s) {
    var n = s.hw + s.lw; // 2-2-1-1-1
    return [0, 1, 4, 6].indexOf(n) >= 0 ? s.hi : s.lo;
  }
  var ROUND_NAMES = ["First Round", "Conference Semifinals", "Conference Finals", "NBA Finals"];

  function playPlayoffDay(L, userSim) {
    var po = L.po, u = user(L), summary = null, played = {};
    po.series.forEach(function (s) {
      if (s.round !== po.round || s.done) return;
      var h = homeOfGame(s), a = h === s.hi ? s.lo : s.hi;
      var isUser = h === u.teamId || a === u.teamId;
      var sim = isUser && userSim ? userSim : simGame(L, h, a, true);
      var res = sim.result();
      applyBoxes(L, res, true);
      injuries(L, res);
      played[h] = played[a] = true;
      var hiWon = (res.hs > res.as) === (h === s.hi);
      if (hiWon) s.hw++; else s.lw++;
      s.games.push({ h: h, hs: res.hs, as: res.as, boxes: s.round === 4 ? res.boxes : null, home: res.home, away: res.away });
      if (s.hw === 4 || s.lw === 4) {
        s.done = true;
        s.winner = s.hw === 4 ? s.hi : s.lo;
        var loser = s.winner === s.hi ? s.lo : s.hi;
        addNews(L, L.teams[s.winner].city + " eliminate " + L.teams[loser].city + " " + Math.max(s.hw, s.lw) + "-" + Math.min(s.hw, s.lw) + " in the " + ROUND_NAMES[s.round - 1] + ".",
          s.winner === u.teamId || loser === u.teamId ? "user" : "league");
      }
      if (isUser) summary = userPostGame(L, res, sim, true);
    });
    healDay(L, played);
    L.day++;
    var cur = po.series.filter(function (s) { return s.round === po.round; });
    if (cur.every(function (s) { return s.done; })) advanceRound(L, cur);
    return summary;
  }

  function advanceRound(L, cur) {
    var po = L.po;
    if (po.round === 4) {
      var f = cur[0];
      po.champion = f.winner;
      // Finals MVP: best combined game score on the champion across the Finals.
      var totals = {};
      f.games.forEach(function (g) {
        var side = g.home === f.winner ? 0 : 1;
        var box = g.boxes[side];
        Object.keys(box).forEach(function (pid) { totals[pid] = (totals[pid] || 0) + gameScore(box[pid]); });
      });
      var best = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; })[0];
      po.fmvp = +best;
      var u = user(L);
      if (f.winner === u.teamId) {
        L.user.rings++;
        grantAward(L, "Champion");
        L.user.fans += 800000;
        if (+best === u.id) { grantAward(L, "Finals MVP"); L.user.fans += 700000; }
      }
      addNews(L, "The " + teamName(L.teams[f.winner]) + " are " + seasonLabel(L.year) + " champions! " + nameOf(L, best) + " wins Finals MVP.", f.winner === u.teamId ? "user" : "league");
      L.phase = "champion";
      return;
    }
    var winners = cur.map(function (s) { return { tid: s.winner, seed: s.winner === s.hi ? s.hiSeed : s.loSeed, conf: s.conf }; });
    var next = [];
    if (po.round < 3) {
      ["E", "W"].forEach(function (c) {
        var w = winners.filter(function (x) { return x.conf === c; });
        for (var i = 0; i < w.length; i += 2) {
          var a = w[i], b = w[i + 1], hi = a.seed <= b.seed ? a : b, lo = hi === a ? b : a;
          next.push({ conf: c, round: po.round + 1, hi: hi.tid, lo: lo.tid, hiSeed: hi.seed, loSeed: lo.seed, hw: 0, lw: 0, games: [], done: false });
        }
      });
    } else {
      var e = winners.filter(function (x) { return x.conf === "E"; })[0], w2 = winners.filter(function (x) { return x.conf === "W"; })[0];
      var te = L.teams[e.tid], tw = L.teams[w2.tid], hiT = winPct(te) >= winPct(tw) ? e : w2, loT = hiT === e ? w2 : e;
      next.push({ conf: "F", round: 4, hi: hiT.tid, lo: loT.tid, hiSeed: hiT.seed, loSeed: loT.seed, hw: 0, lw: 0, games: [], done: false });
    }
    po.round++;
    po.series = po.series.concat(next);
    po.rounds.push(next);
  }

  // ---- Offseason -----------------------------------------------------------------------------
  function marketSalary(ovr) { return Math.round((1.2 + Math.pow(Math.max(0, ovr - 60), 2) * 0.058) * 10) / 10; }
  function endorsement(fans) {
    var e = ENDORSE[0];
    ENDORSE.forEach(function (x) { if (fans >= x[0]) e = x; });
    return { name: e[1], vc: e[2], min: e[0] };
  }

  // Legacy score and Hall of Fame outlook.
  function legacy(L) {
    var U = L.user, u = user(L), pts = 0;
    var W = { "MVP": 12, "Finals MVP": 8, "Champion": 6, "All-NBA 1st Team": 5, "All-NBA 2nd Team": 3.5, "All-NBA 3rd Team": 2.5,
      "All-Star": 2, "Defensive Player of the Year": 5, "Rookie of the Year": 2, "Scoring Champion": 3, "Sixth Man of the Year": 1.5,
      "All-Defensive 1st Team": 1.5, "All-Defensive 2nd Team": 1 };
    U.awards.forEach(function (a) { pts += W[a.name] || 0; });
    var c = u.career, cp = c.pts + u.stats.pts;
    pts += cp / 1500 + (c.ast + u.stats.ast) / 800 + (c.orb + c.drb + u.stats.orb + u.stats.drb) / 1200;
    var verdict = pts >= 70 ? "First-ballot Hall of Famer" : pts >= 45 ? "Hall of Fame lock" : pts >= 30 ? "Likely Hall of Famer" :
      pts >= 18 ? "On the Hall of Fame bubble" : pts >= 8 ? "Long shot for the Hall" : "Not on the Hall of Fame radar yet";
    return { score: Math.round(pts * 10) / 10, verdict: verdict };
  }

  // Wraps up the season, ages everyone, runs retirements and the draft, and returns a report.
  function runOffseason(L) {
    var u = user(L), U = L.user, report = { year: L.year, userChanges: {}, retired: [], trades: [], rookies: 0, endorsement: null };
    // Record the user's season
    var awards = U.awards.filter(function (a) { return a.year === L.year; }).map(function (a) { return a.name; });
    U.seasons.push({ year: L.year, team: L.teams[u.teamId].abbr, age: u.age, ovr: u.ovr, stats: JSON.parse(JSON.stringify(u.stats)),
      po: JSON.parse(JSON.stringify(u.po)), awards: awards, record: L.teams[u.teamId].w + "-" + L.teams[u.teamId].l });
    // League history
    var A = L.seasonAwards || {};
    L.history.push({ year: L.year, champ: L.po && L.po.champion != null ? L.teams[L.po.champion].abbr : "-",
      fmvp: L.po && L.po.fmvp ? nameOf(L, L.po.fmvp) : "-", mvp: A.MVP ? nameOf(L, A.MVP[0]) : "-",
      roy: A["Rookie of the Year"] && A["Rookie of the Year"][0] ? nameOf(L, A["Rookie of the Year"][0]) : "-",
      dpoy: A["Defensive Player of the Year"] ? nameOf(L, A["Defensive Player of the Year"][0]) : "-" });
    // Endorsements
    var e = endorsement(U.fans);
    U.vc += e.vc;
    report.endorsement = e;
    // Roll stats into career totals, age everyone
    Object.keys(L.players).forEach(function (id) {
      var p = L.players[id];
      Object.keys(p.career).forEach(function (k) { p.career[k] += p.stats[k] + p.po[k]; });
      p.stats = P.newStats(); p.po = P.newStats();
      p.age++; p.yearsPro++; p.inj = 0; p.injName = "";
      if (p.isUser) {
        report.userChanges = P.applyChanges(p, userAging(p));
      } else {
        P.applyChanges(p, P.ageProgression(p));
      }
    });
    // Retirements
    Object.keys(L.players).forEach(function (id) {
      var p = L.players[id];
      if (p.isUser) return;
      var pr = p.age >= 40 ? 1 : p.age >= 35 ? 0.25 + (p.age - 35) * 0.18 : p.age >= 31 && p.ovr < 64 ? 0.35 : p.ovr < 52 ? 0.5 : 0;
      if (rand() < pr) {
        report.retired.push(p.first + " " + p.last + " (" + p.age + ", " + p.ovr + " OVR)");
        var t = L.teams[p.teamId];
        if (t) t.roster.splice(t.roster.indexOf(p.id), 1);
        delete L.players[id];
      }
    });
    // Player movement: swap similar players between teams
    for (var k = 0; k < 24; k++) {
      var t1 = R.pick(L.teams), t2 = R.pick(L.teams);
      if (t1 === t2) continue;
      var p1 = L.players[R.pick(t1.roster)];
      if (!p1 || p1.isUser) continue;
      var c2 = t2.roster.map(function (id) { return L.players[id]; }).filter(function (p) { return !p.isUser && Math.abs(p.ovr - p1.ovr) <= 3; });
      if (!c2.length) continue;
      var p2 = R.pick(c2);
      swapPlayers(L, p1, p2);
      if (Math.max(p1.ovr, p2.ovr) >= 80) report.trades.push(p1.first + " " + p1.last + " to " + L.teams[p1.teamId].abbr + " for " + p2.first + " " + p2.last);
    }
    // Draft: refill rosters to 13 (the user's team keeps 14).
    L.teams.forEach(function (t) {
      var want = t.id === u.teamId ? 14 : 13;
      while (t.roster.length < want) {
        var pos = R.pick(D.POS_ORDER);
        var p = P.makePlayer({ pos: pos, ovr: Math.round(clamp(normal(60, 5), 48, 79)), age: R.randInt(19, 22), teamId: t.id, yearsPro: 0 });
        L.players[p.id] = p; t.roster.push(p.id); report.rookies++;
      }
    });
    // Contract
    var c = U.contract;
    c.years--;
    report.contractExpired = c.years <= 0;
    report.legacy = legacy(L);
    L.phase = "offseason";
    L.offseason = report;
    L.offers = report.contractExpired ? makeOffers(L) : null;
    return report;
  }

  // The user grows mostly through VC and training, so natural growth is modest; decline is real.
  function userAging(p) {
    var ch = {}, n = p.age <= 23 ? 8 : p.age <= 26 ? 4 : 0;
    R.shuffle(D.ATTRS.slice()).slice(0, n).forEach(function (a) { ch[a] = 1; });
    if (p.age >= 30) {
      var dec = P.ageProgression(p);
      Object.keys(dec).forEach(function (a) { if (dec[a] < 0) ch[a] = dec[a]; });
    }
    return ch;
  }

  function swapPlayers(L, p1, p2) {
    var t1 = L.teams[p1.teamId], t2 = L.teams[p2.teamId];
    t1.roster[t1.roster.indexOf(p1.id)] = p2.id;
    t2.roster[t2.roster.indexOf(p2.id)] = p1.id;
    p1.teamId = t2.id; p2.teamId = t1.id;
  }

  function projectedRole(L, t, p) {
    var others = t.roster.filter(function (id) { return id !== p.id; }).map(function (id) { return L.players[id].ovr; }).sort(function (a, b) { return b - a; });
    var rank = 1;
    others.forEach(function (o) { if (o > p.ovr) rank++; });
    return rank <= 2 ? "Franchise Star" : rank <= 5 ? "Starter" : rank <= 7 ? "Sixth Man" : "Rotation";
  }

  function makeOffers(L) {
    var u = user(L), base = marketSalary(u.ovr), cur = L.teams[u.teamId];
    var others = R.shuffle(L.teams.filter(function (t) { return t.id !== cur.id; })).slice(0, 3);
    return [cur].concat(others).map(function (t, i) {
      var sal = Math.round(base * (i === 0 ? 1 + (L.user.trust - 50) / 400 : 0.9 + rand() * 0.25) * 10) / 10;
      return { teamId: t.id, salary: sal, years: R.randInt(i === 0 ? 2 : 1, 5), role: projectedRole(L, t, u),
        record: t.w + "-" + t.l, resign: i === 0 };
    });
  }

  function moveUser(L, tid) {
    var u = user(L), from = L.teams[u.teamId], to = L.teams[tid];
    if (from.id === to.id) return;
    // Send the new team's lowest-rated player back so both rosters stay the same size.
    var back = to.roster.map(function (id) { return L.players[id]; }).sort(function (a, b) { return a.ovr - b.ovr; })[0];
    from.roster.splice(from.roster.indexOf(u.id), 1);
    to.roster.splice(to.roster.indexOf(back.id), 1);
    to.roster.push(u.id); from.roster.push(back.id);
    u.teamId = to.id; back.teamId = from.id;
    L.user.trust = 45;
  }

  function acceptOffer(L, idx) {
    var o = L.offers[idx];
    moveUser(L, o.teamId);
    L.user.contract = { salary: o.salary, years: o.years, total: o.years, teamId: o.teamId, rookie: false };
    L.offers = null;
    addNews(L, "You sign a " + o.years + "-year, $" + (o.salary * o.years).toFixed(1) + "M deal with the " + teamName(L.teams[o.teamId]) + ".", "user");
  }

  function requestTrade(L) {
    if (L.user.tradeUsed || L.phase !== "regular") return null;
    var u = user(L);
    var dest = R.pick(L.teams.filter(function (t) { return t.id !== u.teamId; }));
    moveUser(L, dest.id);
    L.user.tradeUsed = true;
    L.user.contract.teamId = dest.id;
    addNews(L, "Trade! You have been dealt to the " + teamName(dest) + ".", "user");
    return dest;
  }

  // The user's projected role and minutes (mirrors the rotation logic in the game engine).
  function userRole(L) {
    var u = user(L), t = userTeam(L);
    if (!t) return null;
    var players = t.roster.map(function (id) { return L.players[id]; }).filter(function (p) { return !p.inj || p.isUser; })
      .sort(function (a, b) { return b.ovr - a.ovr; });
    var rank = players.indexOf(u), trust = L.user.trust;
    var mins = clamp(Math.round((S.MIN_BY_RANK[rank] || 0) + (trust - 50) / 50 * 6), 16, 38);
    var bonus = (trust - 50) / 8;
    var better = players.filter(function (p) { return p !== u && p.ovr > u.ovr + bonus; }).length;
    var starter = better < 5;
    var label = starter ? (rank === 0 ? "Franchise Star" : "Starter") : mins >= 24 ? "Sixth Man" : mins >= 19 ? "Rotation" : "Bench";
    return { label: label, mins: mins, starter: starter, rank: rank + 1 };
  }

  function newSeason(L) {
    L.year++;
    L.offseason = null;
    startSeason(L);
  }

  // ---- News --------------------------------------------------------------------------------
  function addNews(L, text, kind) {
    L.news.unshift({ year: L.year, day: L.day, text: text, kind: kind || "league" });
    if (L.news.length > 60) L.news.length = 60;
  }

  function leaders(L, key, n) {
    var pool = eligible(L, 0.4);
    return pool.map(function (p) { return { p: p, v: perGame(p.stats)[key] }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, n || 5);
  }

  function upgrade(L, attr, n) {
    var u = user(L), U = L.user, done = 0;
    for (var i = 0; i < n; i++) {
      var v = u.r[attr];
      if (v >= u.caps[attr]) break;
      var cost = P.upgradeCost(v);
      if (U.vc < cost) break;
      U.vc -= cost; u.r[attr]++; done++;
    }
    if (done) P.refresh(u);
    return done;
  }

  HL.league = {
    create: create, draftOrder: draftOrder, draftUser: draftUser, startSeason: startSeason, nextUserGame: nextUserGame,
    playDay: playDay, standings: standings, perGame: perGame, winPct: winPct, impact: impact, startPlayoffs: startPlayoffs,
    userSeries: userSeries, runOffseason: runOffseason, acceptOffer: acceptOffer, requestTrade: requestTrade,
    newSeason: newSeason, leaders: leaders, upgrade: upgrade, legacy: legacy, endorsement: endorsement,
    marketSalary: marketSalary, teammateGrade: teammateGrade, gameScore: gameScore, seasonLabel: seasonLabel,
    teamName: teamName, user: user, userTeam: userTeam, rosterRank: rosterRank, teamStrength: teamStrength,
    projectedRole: projectedRole, addNews: addNews, nameOf: nameOf, ordinal: ordinal, ROUND_NAMES: ROUND_NAMES,
    GRADES: GRADES, gradeIndex: gradeIndex, expectedPpg: expectedPpg, findGame: findGame, userRole: userRole,
    ENDORSE: ENDORSE, AWARD_VC: AWARD_VC
  };
});
