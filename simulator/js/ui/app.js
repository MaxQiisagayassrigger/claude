/*
 * App shell: the clock loop, header, tabs, search, modals, toasts,
 * keyboard shortcuts and autosave.
 */
(function (root) {
  "use strict";
  var BSX = root.BSX, U = BSX.UI.util, Sim = BSX.Sim, Broker = BSX.Broker, Cal = BSX.Cal, Econ = BSX.Economy;
  var $ = U.$, esc = U.esc;

  // Steps per second (one step = 15 minutes of market time).
  var SPEEDS = [
    { id: 0, label: "15 min / sec", sps: 1 },
    { id: 1, label: "1 hour / sec", sps: 4 },
    { id: 2, label: "3 hours / sec", sps: 12 },
    { id: 3, label: "1 day / sec", sps: 27 },
    { id: 4, label: "3 days / sec", sps: 81 },
    { id: 5, label: "1 week / sec", sps: 135 }
  ];

  var App = {
    W: null, running: false, speed: 2, view: "markets", views: {}, order: [], ui: {}, watch: [],
    lastRender: 0, lastSave: 0, busy: false, modal: null, modalUpdate: null, searchIndex: null
  };
  BSX.UI.App = App;

  App.register = function (v) { App.views[v.id] = v; App.order.push(v.id); };
  // Per-view UI state with defaults filled in.
  App.state = function (id, defaults) {
    var s = App.ui[id] || (App.ui[id] = {});
    for (var k in defaults) if (!(k in s)) s[k] = defaults[k];
    return s;
  };

  /* ---------------- Toasts ---------------- */
  App.toast = function (text, kind, ms) {
    var box = $("#toasts");
    var el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.setAttribute("role", "status");
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, ms || 5000);
  };

  /* ---------------- Modal ---------------- */
  App.openModal = function (html, opts) {
    App.closeModal();
    opts = opts || {};
    var bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = '<div class="modal ' + (opts.narrow ? "narrow" : "") + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.label || "Dialog") + '">' + html + "</div>";
    bg.addEventListener("mousedown", function (e) { if (e.target === bg) App.closeModal(); });
    document.body.appendChild(bg);
    document.body.style.overflow = "hidden";
    App.modal = bg;
    App.modalUpdate = opts.update || null;
    App.modalClose = opts.onClose || null;
    var first = bg.querySelector("[autofocus]") || bg.querySelector(".modal-close");
    if (first) first.focus();
    return bg.firstChild;
  };
  App.closeModal = function () {
    if (!App.modal) return;
    if (App.modalClose) try { App.modalClose(); } catch (e) { console.error(e); }
    App.modal.parentNode.removeChild(App.modal);
    App.modal = null; App.modalUpdate = null; App.modalClose = null;
    document.body.style.overflow = "";
    U.hideTip();
  };

  /* ---------------- Navigation ---------------- */
  App.go = function (id, state) {
    if (!App.views[id]) id = "markets";
    if (state) App.ui[id] = Object.assign(App.ui[id] || {}, state);
    App.view = id;
    if (location.hash.slice(1) !== id) { try { history.replaceState(null, "", "#" + id); } catch (e) { /* sandboxed frame */ } }
    renderTabs();
    renderView(true);
    window.scrollTo(0, 0);
  };

  function renderTabs() {
    var A = App.W.A;
    $("#nav").innerHTML = App.order.map(function (id) {
      var v = App.views[id];
      var badge = id === "orders" && A.orders.length ? '<span class="badge">' + A.orders.length + "</span>" : "";
      return '<a href="#' + id + '"' + (id === App.view ? ' aria-current="page"' : "") + ">" + esc(v.title) + badge + "</a>";
    }).join("");
  }

  // Each full render builds a fresh root element, so listeners a view
  // attaches in mount() are dropped with the old root.
  function renderView(full) {
    var v = App.views[App.view];
    var host = $("#view");
    var el = host.firstElementChild;
    try {
      if (full || !el || el.dataset.view !== App.view) {
        el = document.createElement("div");
        el.dataset.view = App.view;
        el.innerHTML = v.render(App);
        host.innerHTML = "";
        host.appendChild(el);
        if (v.mount) v.mount(App, el);
      }
      if (v.update) v.update(App, el);
    } catch (e) {
      console.error(e);
      host.innerHTML = '<div class="callout bad"><strong>Something went wrong drawing this page.</strong>' + esc(e.message) + "</div>";
    }
  }
  App.refresh = function (full) { renderHeader(); renderTabs(); renderView(!!full); if (App.modalUpdate) App.modalUpdate(); };

  /* ---------------- Header ---------------- */
  function renderHeader() {
    var W = App.W, A = W.A;
    var s = Broker.summary(W, A);
    var open = W.phase === "open";
    var hol = Cal.holidayName(W.day);
    $("#clock-when").textContent = Cal.WEEKDAYS[Cal.weekday(W.day)] + " " + Cal.nice(W.day) + " · " + (open ? Cal.tickTime(W.tick) : "4:00 pm");
    var st = $("#clock-status");
    st.className = "status " + (open ? "open" : "closed");
    st.innerHTML = "<i></i>" + (open ? (W.tick === 0 ? "Opening bell" : "Market open") : "Market closed" + (hol ? " · " + esc(hol) : ""));
    $("#nlv").textContent = U.money(s.nlv);
    var dp = $("#daypnl");
    dp.textContent = U.signedMoney(s.dayPnl) + " (" + U.pct(A.dayStart ? s.dayPnl / A.dayStart : 0) + ")";
    dp.className = U.cls(s.dayPnl);
    $("#bp").textContent = U.money0(s.buyingPower);
    var mc = $("#margin-flag");
    mc.hidden = !A.marginCall;
    if (A.marginCall) mc.textContent = "Margin call · " + U.money(A.marginCall.amount) + " due " + Cal.short(A.marginCall.due);
    [$("#play"), $("#mini-play")].forEach(function (play) {
      play.textContent = App.running ? "❚❚" : "▶";
      play.classList.toggle("on", App.running);
      play.setAttribute("aria-label", App.running ? "Pause" : "Play");
      play.title = App.running ? "Pause (Space)" : "Play (Space)";
    });
    $("#mini-clock").textContent = Cal.short(W.day) + " " + (open ? Cal.tickTime(W.tick) : "Closed");
  }

  /* ---------------- Clock ---------------- */
  var acc = 0, lastTs = 0;
  function frame(ts) {
    var dt = lastTs ? Math.min(0.25, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (App.running && !App.busy) {
      acc += dt * SPEEDS[App.speed].sps;
      var n = Math.min(200, Math.floor(acc));
      acc -= n;
      for (var i = 0; i < n && App.running; i++) {
        var news = Sim.step(App.W);
        if (handle(news)) App.pause();
      }
      var interval = SPEEDS[App.speed].sps > 30 ? 250 : 120;
      if (n > 0 && ts - App.lastRender > interval) { App.lastRender = ts; App.refresh(false); }
      if (ts - App.lastSave > 30000) { App.lastSave = ts; App.save(); }
    }
    requestAnimationFrame(frame);
  }

  // React to news and account events. Returns true if the clock should stop.
  function handle(news) {
    var A = App.W.A, stop = false;
    var prefs = App.prefs();
    while (A.events.length) {
      var ev = A.events.shift();
      if (ev.type === "fill" && !prefs.toastFills) continue;
      App.toast(ev.text, ev.type, ev.pause ? 9000 : 5000);
      if (ev.pause) stop = true;
      if (ev.type === "fill" && prefs.pauseFills) stop = true;
    }
    news.forEach(function (n) {
      if (n.kind === "market" || n.kind === "fed" || (n.kind === "macro" && n.regime)) {
        if (prefs.toastNews) App.toast(n.title, "info", 6000);
        if (prefs.pauseNews && n.kind === "market") stop = true;
      }
      if (n.syms && App.watch.length && prefs.toastNews) {
        var w = n.syms.filter(function (s) { return App.watch.indexOf(s) >= 0; });
        if (w.length && n.kind !== "market" && n.kind !== "fed") App.toast(n.title, "info", 6000);
      }
    });
    return stop;
  }

  App.play = function () { if (App.busy) return; App.running = true; acc = 0; renderHeader(); };
  App.pause = function () { App.running = false; renderHeader(); App.refresh(false); App.save(); };
  App.toggle = function () { if (App.running) App.pause(); else App.play(); };

  // Run ahead without drawing every step. target: "step" | "close" | days.
  App.skip = function (target) {
    if (App.busy) return;
    var W = App.W;
    App.running = false;
    if (target === "step") { handle(Sim.step(W)); App.refresh(false); return; }
    var closes = target === "close" ? 1 : target;
    if (W.phase === "closed" && target === "close") closes = 1;
    var seen = 0, wasClosed = W.phase === "closed";
    App.busy = true;
    var btns = document.querySelectorAll(".transport button");
    btns.forEach(function (b) { b.disabled = true; });
    function chunk() {
      var stop = false;
      for (var i = 0; i < 160 && !stop; i++) {
        var news = Sim.step(W);
        if (handle(news)) stop = true;
        if (W.phase === "closed" && !wasClosed) seen++;
        wasClosed = W.phase === "closed";
        if (seen >= closes) stop = true;
      }
      renderHeader();
      if (!stop) { setTimeout(chunk, 0); return; }
      App.busy = false;
      btns.forEach(function (b) { b.disabled = false; });
      App.refresh(false);
      App.save();
    }
    setTimeout(chunk, 0);
  };

  /* ---------------- Preferences ---------------- */
  var DEFAULT_PREFS = { toastFills: true, pauseFills: false, toastNews: true, pauseNews: false, gain: "blue" };
  App.prefs = function () { return Object.assign({}, DEFAULT_PREFS, U.pref("prefs") || {}); };
  App.setPref = function (k, v) { var p = App.prefs(); p[k] = v; U.pref("prefs", p); applyPrefs(); };
  function applyPrefs() { document.documentElement.setAttribute("data-gain", App.prefs().gain); }

  App.isWatched = function (id) { return App.watch.indexOf(id) >= 0; };
  App.toggleWatch = function (id) {
    var i = App.watch.indexOf(id);
    if (i >= 0) App.watch.splice(i, 1); else App.watch.push(id);
    U.pref("watch", App.watch);
  };

  /* ---------------- Save / load ---------------- */
  App.save = function () {
    if (!App.W || App.saving) return;
    App.saving = true;
    var snap;
    try { snap = Sim.snapshot(App.W); } catch (e) { App.saving = false; console.error(e); return; }
    U.idbPut("auto", snap).then(function () { App.saving = false; }, function () { App.saving = false; });
  };

  App.newGame = function (opts) {
    App.running = false;
    showLoading("Building a year of market history…");
    setTimeout(function () {
      try {
        App.W = Sim.newGame(opts);
        App.searchIndex = null;
        App.ui = {};
        hideLoading();
        App.closeModal();
        App.go("markets");
        App.refresh(true);
        App.save();
        App.toast("New game: " + U.money0(App.W.A.cash) + " " + ({ cash: "cash", margin: "margin", pm: "portfolio margin" })[App.W.A.type] + " account. Press ▶ to start the clock.", "info", 7000);
      } catch (e) {
        console.error(e);
        hideLoading();
        App.toast("Couldn't start a new game: " + e.message, "reject", 8000);
      }
    }, 30);
  };

  function showLoading(text) {
    var el = $("#loading");
    el.hidden = false;
    $("#loading-text").textContent = text;
  }
  function hideLoading() { $("#loading").hidden = true; }

  /* ---------------- Search ---------------- */
  var TYPE_LABEL = { stock: "Stock", etf: "ETF", crypto: "Crypto", bond: "Bond", future: "Future", perp: "Perpetual", fx: "FX", index: "Index" };
  function buildIndex() {
    var M = App.W.M, out = [];
    Object.keys(M.assets).forEach(function (id) {
      var a = M.assets[id];
      if (a.hidden || a.type === "basket" || a.type === "commodity") return;
      out.push({ id: id, name: a.name, type: a.type, label: a.type === "bond" ? a.name : id, key: (id + " " + a.name + " " + (a.label || "")).toLowerCase() });
    });
    return out;
  }
  function search(q) {
    if (!App.searchIndex) App.searchIndex = buildIndex();
    q = q.trim().toLowerCase();
    if (!q) return [];
    var starts = [], has = [];
    App.searchIndex.forEach(function (x) {
      if (x.id.toLowerCase() === q) starts.unshift(x);
      else if (x.id.toLowerCase().indexOf(q) === 0) starts.push(x);
      else if (x.key.indexOf(q) >= 0) has.push(x);
    });
    return starts.concat(has).slice(0, 14);
  }
  function bindSearch() {
    var input = $("#search"), box = $("#search-results"), sel = 0, items = [];
    function draw() {
      if (!items.length) { box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = items.map(function (x, i) {
        return '<button type="button" data-i="' + i + '" class="' + (i === sel ? "sel" : "") + '"><span class="t">' + esc(x.label) + '</span><span class="n">' + esc(x.name) + '</span><span class="k">' + TYPE_LABEL[x.type] + "</span></button>";
      }).join("");
    }
    input.addEventListener("input", function () {
      items = search(input.value);
      sel = 0; draw();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      else if (e.key === "Enter" && items[sel]) { pick(items[sel]); }
      else if (e.key === "Escape") { input.value = ""; items = []; draw(); input.blur(); }
    });
    box.addEventListener("mousedown", function (e) {
      var b = e.target.closest("button");
      if (b) { e.preventDefault(); pick(items[+b.dataset.i]); }
    });
    input.addEventListener("blur", function () { setTimeout(function () { box.hidden = true; }, 120); });
    // New bonds and futures list over time, so rebuild the index on focus.
    input.addEventListener("focus", function () { App.searchIndex = null; if (items.length) draw(); });
    function pick(x) { input.value = ""; items = []; draw(); input.blur(); App.openTrade(x.id); }
  }

  /* ---------------- Events ---------------- */
  function bindGlobal() {
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-trade]");
      if (t && !e.target.closest("[data-stop]")) { e.preventDefault(); App.openTrade(t.getAttribute("data-trade"), t.dataset.side ? { side: t.dataset.side } : null); return; }
      var g = e.target.closest("[data-go]");
      if (g) { e.preventDefault(); var st = {}; if (g.dataset.und) st.und = g.dataset.und; if (g.dataset.tab) st.tab = g.dataset.tab; App.closeModal(); App.go(g.dataset.go, st); return; }
      var w = e.target.closest("[data-watch]");
      if (w) { App.toggleWatch(w.dataset.watch); App.refresh(false); return; }
    });
    window.addEventListener("hashchange", function () { var id = location.hash.slice(1); if (App.views[id] && id !== App.view) App.go(id); });
    $("#play").addEventListener("click", App.toggle);
    $("#mini-play").addEventListener("click", App.toggle);
    $("#step").addEventListener("click", function () { App.skip("step"); });
    $("#nextday").addEventListener("click", function () { App.skip("close"); });
    $("#week").addEventListener("click", function () { App.skip(5); });
    $("#month").addEventListener("click", function () { App.skip(21); });
    var sp = $("#speed");
    sp.innerHTML = SPEEDS.map(function (s) { return '<option value="' + s.id + '">' + s.label + "</option>"; }).join("");
    sp.value = String(App.speed);
    sp.addEventListener("change", function () { App.speed = +sp.value; U.pref("speed", App.speed); });
    $("#settings").addEventListener("click", function () { BSX.UI.openSettings(App); });
    $("#theme").addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme");
      var dark = cur ? cur === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      var next = dark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      U.pref("theme", next);
      App.refresh(true);
    });
    document.addEventListener("keydown", function (e) {
      var tag = (e.target.tagName || "").toLowerCase();
      var typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
      if (e.key === "Escape" && App.modal) { App.closeModal(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") { e.preventDefault(); App.toggle(); }
      else if (e.key === ".") App.skip("step");
      else if (e.key === "n") App.skip("close");
      else if (e.key === "/") { e.preventDefault(); $("#search").focus(); }
    });
    var resize = U.debounce(function () { measureTop(); renderView(false); if (App.modalUpdate) App.modalUpdate(true); }, 150);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", function () { if (document.hidden) App.save(); });
    window.addEventListener("pagehide", function () { App.save(); });
  }

  function measureTop() {
    var h = $(".topbar").offsetHeight;
    document.documentElement.style.setProperty("--topbar-h", h + "px");
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    var th = U.pref("theme");
    if (th) document.documentElement.setAttribute("data-theme", th);
    applyPrefs();
    App.watch = U.pref("watch") || ["US500", "ORB"];
    var sp = U.pref("speed");
    if (sp != null && SPEEDS[sp]) App.speed = sp;
    bindGlobal();
    bindSearch();
    measureTop();
    var start = function (W) {
      App.W = W;
      hideLoading();
      var id = location.hash.slice(1);
      App.view = App.views[id] ? id : "markets";
      App.refresh(true);
      measureTop();
      requestAnimationFrame(frame);
    };
    showLoading("Loading your market…");
    var fresh = function () {
      showLoading("Building a year of market history…");
      setTimeout(function () {
        var W = Sim.newGame({});
        start(W);
        App.save();
      }, 30);
    };
    var timer = setTimeout(fresh, 2500); // storage that never answers
    var done = false;
    U.idbGet("auto").then(function (snap) {
      if (done) return; done = true; clearTimeout(timer);
      if (snap) {
        try { start(Sim.restore(snap)); App.toast("Welcome back. Your game resumed on " + Cal.nice(App.W.day) + ".", "info", 5000); return; }
        catch (e) { console.warn("Saved game could not be restored", e); }
      }
      fresh();
    }, function () { if (done) return; done = true; clearTimeout(timer); fresh(); });
  }

  App.SPEEDS = SPEEDS;
  App.boot = boot;
})(typeof self !== "undefined" ? self : this);
