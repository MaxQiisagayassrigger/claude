/*
 * Controller: app state, rendering, actions, the shot meter, the live game loop, batch sims and saves.
 */
(function () {
  "use strict";
  var HL = window.HL, D = HL.data, P = HL.player, Lg = HL.league, Sm = HL.sim, UI = HL.ui, R = HL.rng;
  var KEY = "hardwood-legacy:v1";
  var root = document.getElementById("app");

  var S = {
    screen: "title", tab: "home", league: null, builder: null, draftee: null,
    settings: { seasonLength: 82, difficulty: "allstar", injuries: true, meter: true },
    combine: null, meterState: null, game: null, busy: null, confirm: null, toast: null,
    savedSummary: null, importOpen: false, importError: null, copyFallback: null, saveStatus: "",
    draftShown: 0, draftNames: [], pref: { speed: "fast" }
  };

  function newBuilder() {
    var pos = "PG", Pm = D.POSITIONS[pos];
    return { first: R.pick(D.FIRST), last: R.pick(D.LAST), jersey: R.randInt(0, 55), hometown: "", college: R.pick(D.COLLEGES),
      pos: pos, arch: "shotCreator", height: Pm.hMid, weight: Pm.wMid, wingspan: Pm.hMid + 3 };
  }

  // ---- Rendering ---------------------------------------------------------------
  var VIEWS = {
    title: UI.title, builder: UI.builder, combine: UI.combine, draft: UI.draft, hub: UI.hub, game: UI.gameScreen,
    postgame: UI.postgame, awards: UI.awards, champion: UI.champion, offseason: UI.offseason, retired: UI.retired
  };
  var lastScreen = null;
  function render() {
    var active = document.activeElement && document.activeElement.id;
    root.innerHTML = (VIEWS[S.screen] || UI.title)(S) + UI.overlay(S);
    if (S.screen !== lastScreen) { window.scrollTo(0, 0); lastScreen = S.screen; }
    if (active) {
      var el = document.getElementById(active);
      if (el && el.focus) el.focus({ preventScroll: true });
    }
    if (S.meterState && !S.meterState.done) paintMeter();
  }
  function toast(msg) {
    S.toast = msg;
    render();
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { S.toast = null; render(); }, 2400);
  }
  function go(screen, tab) {
    S.screen = screen;
    if (tab) S.tab = tab;
    render();
  }

  // ---- Persistence ----------------------------------------------------------------
  function save() {
    if (!S.league) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, league: S.league }));
      S.saveStatus = "Saved";
    } catch (e) {
      S.saveStatus = "Not saved: browser storage is unavailable";
    }
  }
  function readSaved() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return o && o.league && o.league.players ? o.league : null;
    } catch (e) { return null; }
  }
  function summarize(L) {
    var u = L.players[L.userId], t = u && u.teamId >= 0 ? L.teams[u.teamId] : null;
    if (!u || !t) return null;
    return { name: u.first + " " + u.last, ovr: u.ovr, vars: "--c1:" + t.c1 + ";--c2:" + t.c2,
      meta: u.pos + " · " + Lg.teamName(t) + " · " + Lg.seasonLabel(L.year) + (L.phase === "retired" ? " · Retired" : " · " + t.w + "-" + t.l) };
  }
  function adopt(L) {
    var maxId = 0;
    Object.keys(L.players).forEach(function (id) { maxId = Math.max(maxId, +id); });
    P.setNextId(maxId + 1);
    Object.keys(L.players).forEach(function (id) { P.refresh(L.players[id]); });
    S.league = L;
  }
  function screenForPhase(L) {
    return L.phase === "offseason" ? "offseason" : L.phase === "retired" ? "retired" : "hub";
  }

  // ---- Shot meter --------------------------------------------------------------------
  // cfg: { player, type, open, title, label, onDone(grade) }
  function startMeter(cfg) {
    var L = S.league, diffWin = L ? D.DIFFICULTY[L.settings.difficulty].win : 1;
    S.meterState = {
      center: 0.8, width: Sm.meterWindow(cfg.player, cfg.type, cfg.open, diffWin), label: cfg.label, title: cfg.title,
      dur: cfg.type === "ft" ? 1150 : cfg.type === "three" ? 1000 : 900, start: null, v: 0, done: false, cb: cfg.onDone, feedback: null
    };
    render();
    requestAnimationFrame(meterFrame);
  }
  function paintMeter() {
    var M = S.meterState, fill = document.getElementById("meterFill");
    if (fill) fill.style.height = Math.min(100, M.v * 100).toFixed(1) + "%";
  }
  function meterFrame(ts) {
    var M = S.meterState;
    if (!M || M.done) return;
    if (M.start == null) M.start = ts;
    M.v = (ts - M.start) / M.dur;
    paintMeter();
    if (M.v > 1.12) { releaseMeter(); return; }
    requestAnimationFrame(meterFrame);
  }
  function releaseMeter() {
    var M = S.meterState;
    if (!M || M.done) return;
    M.done = true;
    var v = M.v, lo = M.center - M.width / 2, hi = M.center + M.width / 2, grade, text;
    if (v >= lo && v <= hi) { grade = "green"; text = "Excellent release"; }
    else {
      var d = v < lo ? lo - v : v - hi, side = v < lo ? "early" : "late";
      if (d <= 0.03) { grade = "good"; text = "Good release, a touch " + side; }
      else if (d <= 0.08) { grade = "slight"; text = "Slightly " + side; }
      else { grade = "very"; text = "Very " + side; }
    }
    var fb = document.getElementById("meterFb"), mark = document.getElementById("meterMark"), meter = document.getElementById("meter");
    if (fb) fb.textContent = text;
    if (mark) { mark.style.bottom = Math.min(100, v * 100).toFixed(1) + "%"; mark.style.opacity = "1"; }
    if (meter) meter.classList.add("m-" + grade);
    setTimeout(function () {
      var cb = M.cb;
      S.meterState = null;
      cb(grade, text);
    }, 650);
  }

  // ---- Live game ---------------------------------------------------------------------------
  function speedDelay() { var G = S.game; return G.speed === "watch" ? 700 : G.speed === "fast" ? 150 : 0; }
  function schedule(delay) {
    var G = S.game;
    if (!G) return;
    clearTimeout(G.timer);
    G.timer = setTimeout(tickGame, delay != null ? delay : speedDelay());
  }
  function tickGame() {
    var G = S.game;
    if (!G || S.screen !== "game") return;
    var sim = G.sim;
    if (!G.running || sim.pending || sim.done || S.meterState || G.flash) { render(); return; }
    if (G.speed === "skip") sim.run();
    else sim.step();
    render();
    if (!sim.done && !sim.pending) schedule();
  }
  function startGame() {
    var L = S.league, g = Lg.nextUserGame(L);
    if (!g) return;
    var sim = new Sm.GameSim(L, g.h, g.a, { interactive: true, meter: L.settings.meter, playoff: g.playoff });
    S.game = { sim: sim, speed: S.pref.speed, running: true, showBox: false, playoff: g.playoff, flash: null, meterFor: null, timer: null };
    go("game");
    schedule(400);
  }
  function userScore(sim) {
    var my = sim.sides[0].tid === Lg.user(S.league).teamId ? 0 : 1;
    return [sim.sides[my].score, sim.sides[1 - my].score];
  }
  // After the user acts: flash the outcome, then continue.
  function afterPlay(logStart, before, wasDefense) {
    var G = S.game, sim = G.sim, after = userScore(sim);
    var lines = sim.log.slice(logStart).filter(function (e) { return e.type !== "sub"; }).map(function (e) { return e.text; });
    var good = after[0] > before[0] || (wasDefense ? after[1] === before[1] : false) || !!sim.pending;
    G.flash = { text: lines.slice(0, 3).join(" ") || "Play on.", good: good };
    render();
    setTimeout(function () {
      if (!S.game || S.game !== G) return;
      G.flash = null;
      render();
      if (!sim.pending && !sim.done && G.running) schedule(200);
    }, lines.join(" ").length > 70 ? 1700 : 1250);
  }

  // ---- Batch simulation -------------------------------------------------------------------------
  function simWhile(pred, label, progress, showPostgame) {
    var L = S.league;
    S.busy = { label: label, frac: 0 };
    render();
    function chunk() {
      var t0 = Date.now();
      while (Date.now() - t0 < 45) {
        if (!(L.phase === "regular" || L.phase === "playoffs") || !pred()) return done();
        Lg.playDay(L);
      }
      S.busy.frac = Math.min(1, progress());
      render();
      setTimeout(chunk, 0);
    }
    function done() {
      S.busy = null;
      save();
      if (showPostgame && L.user.lastGame) S.screen = "postgame";
      render();
    }
    setTimeout(chunk, 30);
  }

  // ---- Actions ----------------------------------------------------------------------------------
  var A = {};
  A.newCareer = function () {
    S.builder = newBuilder();
    S.draftee = null;
    S.league = null;
    go("builder");
  };
  A.continueCareer = function () {
    var L = readSaved();
    if (!L) { toast("No saved career found in this browser."); return; }
    adopt(L);
    go(screenForPhase(L), "home");
  };
  A.toggleImport = function () { S.importOpen = !S.importOpen; S.importError = null; render(); };
  A.importSave = function () {
    var el = document.getElementById("importText"), txt = el ? el.value.trim() : "";
    try {
      var o = JSON.parse(txt), L = o.league || o;
      if (!L.players || L.userId == null || !L.teams) throw new Error("bad");
      adopt(L);
      save();
      S.importOpen = false;
      go(screenForPhase(L), "home");
    } catch (e) {
      S.importError = "That code could not be read. Copy the full code from Settings and try again.";
      render();
    }
  };
  A.goTitle = function () {
    if (S.screen === "game" && S.game && !S.game.sim.done) {
      ask("Leave this game?", "The game will not count. You can play it again from the hub.", "Leave game", false, function () {
        clearTimeout(S.game.timer); S.game = null; S.meterState = null; go("hub");
      });
      return;
    }
    if (S.game) { clearTimeout(S.game.timer); S.game = null; }
    var L = readSaved();
    S.savedSummary = L ? summarize(L) : null;
    go("title");
  };

  // Builder
  A.setPos = function (pos) {
    var b = S.builder, Pm = D.POSITIONS[pos];
    b.pos = pos;
    if (D.ARCHETYPES[b.arch].pos.indexOf(pos) < 0) b.arch = Object.keys(D.ARCHETYPES).filter(function (k) { return D.ARCHETYPES[k].pos.indexOf(pos) >= 0; })[0];
    b.height = Pm.hMid; b.weight = Pm.wMid; b.wingspan = Pm.hMid + 3;
    render();
  };
  A.setArch = function (k) { S.builder.arch = k; render(); };
  A.toggleSetting = function (k) { S.settings[k] = !S.settings[k]; render(); };
  A.toCombine = function () {
    var b = S.builder;
    b.first = (b.first || "").trim() || "Rookie";
    b.last = (b.last || "").trim() || "Prospect";
    b.jersey = R.clamp(parseInt(b.jersey, 10) || 0, 0, 99);
    S.draftee = P.createUser({ first: b.first, last: b.last, pos: b.pos, arch: b.arch, height: b.height, weight: b.weight,
      wingspan: b.wingspan, jersey: b.jersey, college: b.college, hometown: b.hometown, startOvr: 60 });
    S.combine = { results: [], active: false };
    go("combine");
  };
  function combineShotResult(grade) {
    var p = Sm.shotProb(S.draftee, "three", { openness: 1 });
    if (grade) p = Sm.applyTiming(p, grade, 1);
    S.combine.results.push(R.rand() < p);
  }
  A.combineShot = function () {
    var C = S.combine;
    if (C.results.length >= 10) return;
    if (!S.settings.meter) { combineShotResult(null); render(); return; }
    C.active = true;
    startMeter({ player: S.draftee, type: "three", open: 1, title: "Spot-up three", label: "Shot " + (C.results.length + 1) + " of 10",
      onDone: function (grade) { combineShotResult(grade); C.active = false; render(); } });
  };
  A.combineSkip = function () {
    while (S.combine.results.length < 10) combineShotResult(null);
    render();
  };
  A.toDraft = function () {
    var u = S.draftee, made = S.combine.results.filter(Boolean).length;
    var L = Lg.create(u, JSON.parse(JSON.stringify(S.settings)));
    var athletic = ((u.r.vertical + u.r.speed) / 2 - 62) / 15;
    adopt(L);
    Lg.draftUser(L, made, athletic);
    S.draftNames = [];
    for (var i = 0; i < 45; i++) S.draftNames.push(R.pick(D.FIRST) + " " + R.pick(D.LAST));
    S.draftShown = 0;
    go("draft");
    var pick = L.user.draft.pick;
    (function reveal() {
      if (S.screen !== "draft" || S.draftShown >= pick) return;
      S.draftShown++;
      render();
      setTimeout(reveal, S.draftShown >= pick - 1 ? 900 : 260);
    })();
  };
  A.skipDraft = function () { S.draftShown = S.league.user.draft.pick; render(); };
  A.startCareer = function () {
    Lg.startSeason(S.league);
    save();
    go("hub", "home");
  };

  // Hub
  A.tab = function (t) { S.tab = t; S.copyFallback = null; render(); };
  A.playGame = function () { startGame(); };
  A.simGame = function () {
    var L = S.league;
    if (!Lg.nextUserGame(L)) return;
    Lg.playDay(L);
    save();
    go("postgame");
  };
  A.simDays = function (n) {
    var L = S.league, start = L.day, end = Math.min(L.schedule.length, start + (+n || 7));
    simWhile(function () { return L.day < end; }, "Simulating " + (end - start) + " days", function () { return (L.day - start) / (end - start); });
  };
  A.simToAllStar = function () {
    var L = S.league, start = L.day, end = Math.floor(L.settings.seasonLength / 2);
    simWhile(function () { return L.day < end; }, "Simulating to the All-Star break", function () { return (L.day - start) / Math.max(1, end - start); });
  };
  A.simToEnd = function () {
    var L = S.league, start = L.day, end = L.schedule.length;
    simWhile(function () { return L.phase === "regular"; }, "Simulating the rest of the season", function () { return (L.day - start) / Math.max(1, end - start); });
  };
  A.simSeries = function () {
    var s = Lg.userSeries(S.league);
    if (!s) return;
    simWhile(function () { return !s.done; }, "Simulating the series", function () { return (s.hw + s.lw) / 7; }, true);
  };
  A.simPlayoffs = function () {
    var L = S.league, n = 0;
    simWhile(function () { n++; return L.phase === "playoffs"; }, "Simulating the playoffs", function () { return Math.min(1, n / 60); });
  };
  A.setFocus = function (k) { S.league.user.trainFocus = k; save(); render(); };
  A.upgrade = function (arg) {
    var parts = String(arg).split(":"), L = S.league, before = Lg.user(L).ovr;
    var n = Lg.upgrade(L, parts[0], +parts[1] || 1);
    if (!n) { toast("Not enough VC for that upgrade."); return; }
    save();
    var after = Lg.user(L).ovr;
    toast(D.ATTR_LABEL[parts[0]] + " +" + n + (after > before ? ". Overall is now " + after + "!" : "."));
  };
  A.askTrade = function () {
    ask("Request a trade?", "The front office will move you before the next game. You cannot choose the destination, and your new coach starts you at 45 trust.", "Request trade", false, function () {
      var t = Lg.requestTrade(S.league);
      save();
      if (t) toast("Traded to the " + Lg.teamName(t) + ".");
    });
  };
  A.showAwards = function () { go("awards"); };
  A.startPlayoffs = function () { Lg.startPlayoffs(S.league); save(); go("hub", "home"); };
  A.showChampion = function () { go("champion"); };
  A.toOffseason = function () { Lg.runOffseason(S.league); save(); go("offseason"); };
  A.showOffseason = function () { go("offseason"); };
  A.acceptOffer = function (i) { Lg.acceptOffer(S.league, +i); save(); render(); };
  A.nextSeason = function () { Lg.newSeason(S.league); save(); go("hub", "home"); };
  A.confirmRetire = function () {
    ask("Retire now?", "Your career ends and your legacy is final. This cannot be undone.", "Retire", true, function () {
      S.league.phase = "retired";
      save();
      go("retired");
    });
  };
  A.closePostgame = function () { go("hub", "home"); };

  // Settings
  A.toggleLeagueSetting = function (k) { S.league.settings[k] = !S.league.settings[k]; save(); render(); };
  A.copySave = function () {
    var code = JSON.stringify({ v: 1, league: S.league });
    var fallback = function () { S.copyFallback = code; render(); };
    try {
      navigator.clipboard.writeText(code).then(function () { toast("Save code copied."); }, fallback);
    } catch (e) { fallback(); }
  };
  A.confirmReset = function () {
    ask("Delete this career?", "This erases the saved career from this browser. Copy a save code first if you want a backup.", "Delete career", true, function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
      S.league = null; S.savedSummary = null;
      go("title");
    });
  };

  // Game
  A.speed = function (s) {
    var G = S.game;
    G.speed = s; S.pref.speed = s;
    render();
    if (G.running && !G.sim.pending && !G.sim.done) schedule(50);
  };
  A.stepNow = function () {
    var G = S.game;
    G.running = !G.running;
    render();
    if (G.running) schedule(50);
  };
  A.toggleBox = function () { S.game.showBox = !S.game.showBox; render(); };
  A.simRest = function () {
    var G = S.game;
    clearTimeout(G.timer);
    S.meterState = null; G.flash = null;
    G.sim.autoFinish();
    render();
  };
  A.choose = function (id) {
    var G = S.game, sim = G.sim, pd = sim.pending;
    if (!pd || S.meterState || G.flash) return;
    var logStart = sim.log.length, before = userScore(sim), u = Lg.user(S.league);
    if (pd.kind === "defense") { sim.resolveDefense(id); afterPlay(logStart, before, true); return; }
    if (pd.kind !== "offense") return;
    var opt = pd.options.filter(function (o) { return o.id === id; })[0];
    if (!opt) return;
    var isShot = ["three", "mid", "rim", "post"].indexOf(id) >= 0;
    if (isShot && sim.meter) {
      G.meterFor = "shot";
      startMeter({ player: u, type: id, open: opt.open, title: opt.label, label: opt.openLabel + " · " + Math.round(opt.est * 100) + "% before timing",
        onDone: function (grade) { G.meterFor = null; sim.resolveOffense(id, grade); afterPlay(logStart, before, false); } });
      return;
    }
    sim.resolveOffense(id, null);
    afterPlay(logStart, before, false);
  };
  A.shootFT = function () {
    var G = S.game, sim = G.sim, pd = sim.pending, u = Lg.user(S.league);
    if (!pd || pd.kind !== "ft" || S.meterState) return;
    var logStart = sim.log.length, before = userScore(sim);
    G.meterFor = "ft";
    startMeter({ player: u, type: "ft", open: 1, title: "Free throw " + (pd.i + 1) + " of " + pd.n, label: Math.round(Sm.ftProb(u) * 100) + "% shooter",
      onDone: function (grade) {
        G.meterFor = null;
        var made = sim.resolveFT(grade);
        if (sim.pending && sim.pending.kind === "ft") {
          G.flash = { text: made ? "Good." : "Off the rim.", good: made };
          render();
          setTimeout(function () { G.flash = null; render(); }, 700);
        } else afterPlay(logStart, before, false);
      } });
  };
  A.release = function () { releaseMeter(); };
  A.finishGame = function () {
    var G = S.game;
    clearTimeout(G.timer);
    Lg.playDay(S.league, G.sim);
    S.game = null;
    save();
    go("postgame");
  };

  // Confirm dialog
  function ask(title, text, yes, danger, fn) { S.confirm = { title: title, text: text, yes: yes, danger: danger, fn: fn }; render(); }
  A.confirmYes = function () { var c = S.confirm; S.confirm = null; if (c) c.fn(); render(); };
  A.confirmNo = function () { S.confirm = null; render(); };

  // ---- Events ------------------------------------------------------------------------------
  root.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    var act = el.getAttribute("data-act");
    if (S.busy && act !== "confirmNo") return;
    if (act === "release") return; // handled on pointerdown for tighter timing
    if (A[act]) A[act](el.getAttribute("data-arg"), el);
  });
  root.addEventListener("pointerdown", function (e) {
    if (!S.meterState || S.meterState.done) return;
    if (e.target.closest("#releaseBtn") || e.target.closest("#meter")) { e.preventDefault(); releaseMeter(); }
  });
  root.addEventListener("input", function (e) {
    var el = e.target, k = el.getAttribute("data-bind");
    if (!k || !S.builder) return;
    var b = S.builder;
    b[k] = el.type === "range" || el.type === "number" ? +el.value : el.value;
    if (k === "height") b.wingspan = R.clamp(b.wingspan, b.height - 2, b.height + 9);
    var out = document.getElementById(el.id + "Out");
    if (out) out.textContent = k === "weight" ? b.weight + " lbs" : P.heightStr(b[k]);
    var pv = document.getElementById("builderPreview");
    if (pv) pv.innerHTML = UI.builderPreview(S);
  });
  root.addEventListener("change", function (e) {
    var el = e.target;
    if (el.getAttribute("data-set")) {
      var k = el.getAttribute("data-set");
      S.settings[k] = k === "seasonLength" ? +el.value : el.value;
    } else if (el.getAttribute("data-lset") && S.league) {
      S.league.settings[el.getAttribute("data-lset")] = el.value;
      save();
      toast("Difficulty set to " + D.DIFFICULTY[el.value].name + ".");
    } else if (el.type === "range" && S.screen === "builder") {
      render(); // refresh dependent slider bounds (wingspan follows height)
    }
  });
  document.addEventListener("keydown", function (e) {
    if (S.meterState && !S.meterState.done && (e.code === "Space" || e.key === "Enter")) {
      e.preventDefault();
      releaseMeter();
      return;
    }
    if (e.key === "Escape" && S.confirm) { S.confirm = null; render(); return; }
    if (S.screen === "game" && S.game && !S.meterState && !S.game.flash) {
      var pd = S.game.sim.pending;
      if (!pd) return;
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (pd.kind === "ft" && (e.code === "Space" || e.key === "Enter")) { e.preventDefault(); A.shootFT(); return; }
      var n = parseInt(e.key, 10);
      if (pd.options && n >= 1 && n <= pd.options.length) { e.preventDefault(); A.choose(pd.options[n - 1].id); }
    }
  });

  // ---- Boot ------------------------------------------------------------------------------------
  function boot(data) {
    var L = readSaved();
    S.savedSummary = L ? summarize(L) : null;
    if (data && data.save) {
      try {
        var o = JSON.parse(data.save);
        adopt(o);
        S.screen = data.screen && VIEWS[data.screen] && data.screen !== "game" ? data.screen : screenForPhase(o);
        S.tab = data.tab || "home";
      } catch (e) { S.screen = "title"; }
    }
    render();
  }
  var hot = window.claude && window.claude.hot;
  try {
    if (hot && hot.snapshot) hot.snapshot(function () {
      return { save: S.league && S.league.phase !== "draft" ? JSON.stringify(S.league) : null, screen: S.screen, tab: S.tab };
    });
  } catch (e) { /* hot reload is optional */ }
  if (hot && hot.ready) hot.ready(boot);
  else boot((hot && hot.data) || {});
})();
