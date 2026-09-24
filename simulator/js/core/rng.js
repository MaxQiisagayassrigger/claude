/*
 * Seeded pseudo-random numbers (mulberry32). The whole simulation draws from
 * one generator whose 32-bit state is saved with the game, so a saved game
 * resumes exactly and two games with the same seed are identical.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.BSX = root.BSX || {}; root.BSX.Rng = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function hashString(str) {
    // FNV-1a, 32-bit.
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function Rng(seed) {
    if (typeof seed === "string") seed = hashString(seed);
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  Rng.prototype.next = function () {
    var t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Standard normal via Box–Muller. No cached second value, so the saved
  // state is just `s`.
  Rng.prototype.gauss = function () {
    var u = 0;
    while (u === 0) u = this.next();
    var v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // Fat-tailed shock: mostly normal, occasionally a 3x draw. Unit variance
  // is preserved: 0.97 * 1 + 0.03 * 9 = 1.24, so scale by 1/sqrt(1.24).
  Rng.prototype.fat = function () {
    var z = this.gauss();
    if (this.next() < 0.03) z *= 3;
    return z * 0.898;
  };

  Rng.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  Rng.prototype.int = function (a, b) { return a + Math.floor(this.next() * (b - a + 1)); };
  Rng.prototype.chance = function (p) { return this.next() < p; };
  Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  Rng.prototype.lognormal = function (mu, sigma) { return Math.exp(mu + sigma * this.gauss()); };
  Rng.prototype.sign = function () { return this.next() < 0.5 ? -1 : 1; };

  // Weighted pick from [[item, weight], ...].
  Rng.prototype.weighted = function (pairs) {
    var total = 0, i;
    for (i = 0; i < pairs.length; i++) total += pairs[i][1];
    var r = this.next() * total;
    for (i = 0; i < pairs.length; i++) {
      r -= pairs[i][1];
      if (r <= 0) return pairs[i][0];
    }
    return pairs[pairs.length - 1][0];
  };

  Rng.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  Rng.hashString = hashString;
  return Rng;
});
