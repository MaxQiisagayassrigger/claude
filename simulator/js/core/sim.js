/*
 * The simulation: one world (economy + market + account) and the clock.
 *
 * A new game runs one year of daily history before the start date so
 * charts, 52-week ranges and realized volatility have data from the first
 * minute. After that the clock advances in 15-minute steps through each
 * session; one extra step covers the close-to-open gap (nights, weekends,
 * holidays).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./rng.js"), require("./calendar.js"), require("./economy.js"), require("./market.js"), require("./broker.js"));
  } else {
    root.BSX = root.BSX || {};
    root.BSX.Sim = factory(root.BSX.Rng, root.BSX.Cal, root.BSX.Economy, root.BSX.Market, root.BSX.Broker);
  }
})(typeof self !== "undefined" ? self : this, function (Rng, Cal, Econ, Market, Broker) {
  "use strict";

  var VERSION = 1;
  var TPD = Cal.TICKS_PER_DAY;
  var DEFAULT_START = "2026-09-28";

  function newGame(opts) {
    opts = opts || {};
    var seed = opts.seed != null && opts.seed !== "" ? String(opts.seed) : String(Math.floor(Math.random() * 1e9));
    var rng = new Rng(seed);
    var startDay = Cal.onOrAfter(Cal.parse(opts.start || DEFAULT_START));
    var warm = Cal.addTradingDays(startDay, -(opts.historyDays || 252));
    var E = Econ.create(rng, warm);
    E.lock = true; // the year of history before the start is a steady expansion
    var M = Market.create(rng, E, warm);
    var W = { version: VERSION, seed: seed, rng: rng, day: warm, tick: 0, phase: "open", E: E, M: M, A: null, startDay: startDay };
    var none = function () { return false; };
    while (W.day < startDay) {
      Market.fullDay(W);
      Market.close(W);
      var next = Cal.nextTradingDay(W.day);
      Market.afterClose(W, none, next);
      Market.overnight(W, W.day, next);
      W.day = next;
      Market.openDay(M);
      M.corp = [];
    }
    delete E.lock;
    W.tick = 0;
    W.phase = "open";
    W.A = Broker.create(opts.account || "margin", opts.cash != null ? +opts.cash : 100000, startDay);
    return W;
  }

  function isHeldFn(A) { return function (id) { return !!A.pos[id]; }; }

  // Advance one step. Returns the news and account events it produced.
  function step(W) {
    var M = W.M, A = W.A;
    var news = [];
    if (W.phase === "open") {
      news = Market.session(W, 1 / TPD);
      W.tick++;
      Market.recordTick(M);
      Broker.onTick(W, A, false);
      if (W.tick >= TPD) news = news.concat(closeDay(W));
    } else {
      var next = Cal.nextTradingDay(W.day);
      var prev = W.day;
      A.dayStart = A.equity.length ? A.equity[A.equity.length - 1].nlv : A.dayStart;
      news = Market.overnight(W, prev, next);
      W.day = next;
      W.tick = 0;
      W.phase = "open";
      Market.openDay(M);
      Broker.corporate(W, A, M.corp);
      M.corp = [];
      Broker.onTick(W, A, true);
    }
    return news;
  }

  function closeDay(W) {
    var next = Cal.nextTradingDay(W.day);
    Market.close(W);
    Broker.endOfDay(W, W.A, next);
    var news = Market.afterClose(W, isHeldFn(W.A), next);
    W.phase = "closed";
    return news;
  }

  // Run until `stop(W, news)` returns true or `maxSteps` pass.
  function run(W, maxSteps, stop) {
    var all = [];
    for (var i = 0; i < maxSteps; i++) {
      var n = step(W);
      if (n.length) all = all.concat(n);
      if (stop && stop(W, n)) break;
    }
    return all;
  }

  /* ---------------- Save / restore ---------------- */
  var BAR_KEYS = ["o", "h", "l", "c", "v"];

  // A structured-clone-friendly snapshot: price history as Float32Arrays.
  function snapshot(W) {
    var M = {};
    for (var mk in W.M) if (mk !== "assets") M[mk] = deepCopy(W.M[mk]);
    M.assets = {};
    Object.keys(W.M.assets).forEach(function (id) {
      var a = W.M.assets[id], c = {};
      for (var k in a) if (k !== "bars") c[k] = a[k];
      c = deepCopy(c);
      var n = a.bars.c.length, buf = new Float32Array(n * 5);
      BAR_KEYS.forEach(function (bk, j) { var arr = a.bars[bk]; for (var i = 0; i < n; i++) buf[j * n + i] = arr[i]; });
      c.barsBuf = buf;
      M.assets[id] = c;
    });
    return { v: VERSION, seed: W.seed, rng: W.rng.s, day: W.day, tick: W.tick, phase: W.phase, startDay: W.startDay, E: deepCopy(W.E), A: deepCopy(W.A), M: M, savedAt: Date.now() };
  }

  function deepCopy(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

  function restore(S) {
    if (!S || S.v !== VERSION) throw new Error("Saved game is from an incompatible version.");
    var M = S.M;
    Object.keys(M.assets).forEach(function (id) {
      var a = M.assets[id];
      var buf = a.barsBuf;
      if (buf && !(buf instanceof Float32Array)) buf = new Float32Array(buf);
      var n = buf ? buf.length / 5 : 0;
      a.bars = {};
      BAR_KEYS.forEach(function (bk, j) { var arr = new Array(n); for (var i = 0; i < n; i++) arr[i] = buf[j * n + i]; a.bars[bk] = arr; });
      delete a.barsBuf;
    });
    var rng = new Rng(1);
    rng.s = S.rng >>> 0;
    return { version: VERSION, seed: S.seed, rng: rng, day: S.day, tick: S.tick, phase: S.phase, startDay: S.startDay, E: S.E, M: M, A: S.A };
  }

  // JSON text for export (Float32Array → base64).
  function toJSON(W) {
    var s = snapshot(W);
    Object.keys(s.M.assets).forEach(function (id) {
      var a = s.M.assets[id];
      a.barsB64 = b64(new Uint8Array(a.barsBuf.buffer));
      a.barsBuf = null;
    });
    return JSON.stringify(s);
  }
  function fromJSON(text) {
    var s = JSON.parse(text);
    Object.keys(s.M.assets).forEach(function (id) {
      var a = s.M.assets[id];
      if (a.barsB64 != null) { var bytes = unb64(a.barsB64); a.barsBuf = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4); delete a.barsB64; }
    });
    return restore(s);
  }
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function b64(u8) {
    var out = "", i;
    for (i = 0; i + 2 < u8.length; i += 3) { var n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2]; out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63]; }
    var rem = u8.length - i;
    if (rem === 1) { var n1 = u8[i] << 16; out += B64[n1 >> 18 & 63] + B64[n1 >> 12 & 63] + "=="; }
    else if (rem === 2) { var n2 = (u8[i] << 16) | (u8[i + 1] << 8); out += B64[n2 >> 18 & 63] + B64[n2 >> 12 & 63] + B64[n2 >> 6 & 63] + "="; }
    return out;
  }
  function unb64(s) {
    var map = {}; for (var i = 0; i < 64; i++) map[B64[i]] = i;
    var clean = s.replace(/=+$/, "");
    var out = new Uint8Array(Math.floor(clean.length * 3 / 4));
    var o = 0;
    for (var j = 0; j < clean.length; j += 4) {
      var n = (map[clean[j]] << 18) | (map[clean[j + 1]] << 12) | ((map[clean[j + 2]] || 0) << 6) | (map[clean[j + 3]] || 0);
      if (o < out.length) out[o++] = n >> 16 & 255;
      if (o < out.length) out[o++] = n >> 8 & 255;
      if (o < out.length) out[o++] = n & 255;
    }
    return out;
  }

  function clockLabel(W) {
    if (W.phase === "closed") return "4:00 pm · Closed";
    return Cal.tickTime(W.tick);
  }

  return { VERSION: VERSION, DEFAULT_START: DEFAULT_START, newGame: newGame, step: step, run: run, snapshot: snapshot, restore: restore, toJSON: toJSON, fromJSON: fromJSON, clockLabel: clockLabel };
});
