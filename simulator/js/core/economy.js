/*
 * The macro economy.
 *
 * A five-state business cycle (expansion → late-cycle boom → slowdown →
 * recession → recovery) drives latent growth. Inflation mean-reverts
 * toward ~2.4% but is pushed by the output gap and by oil. Unemployment
 * follows Okun's law. The Fed meets eight times a year and moves toward a
 * Taylor-rule target in 25 bp steps (50 bp when far behind).
 *
 * The Treasury curve is expectations + term premium:
 *   y(τ) = s∞ + (T − s∞)·A(k2, τ) + (s − T)·A(k1, τ) + TP(τ) + shocks
 * where s is the priced policy rate, T the Taylor target, s∞ the long-run
 * neutral rate and A(k, τ) = (1 − e^(−kτ))/(kτ) the average of an
 * exponential path over [0, τ].
 *
 * Data releases (jobs, CPI, GDP, retail sales, PMI, FOMC) come with a
 * consensus forecast; the surprise versus consensus moves markets.
 * All macro figures are in percent (4.25 means 4.25%).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./calendar.js"));
  else { root.BSX = root.BSX || {}; root.BSX.Economy = factory(root.BSX.Cal); }
})(typeof self !== "undefined" ? self : this, function (Cal) {
  "use strict";

  var REGIMES = {
    expansion: { name: "Expansion", g: 2.4, eq: 0.055, vol: 0.13, credit: 1.0, cyc: 0.02, tp: 1.35, desc: "Steady growth, healthy hiring and moderate inflation. Stocks grind higher." },
    boom: { name: "Late-cycle boom", g: 3.6, eq: 0.07, vol: 0.125, credit: 0.85, cyc: 0.04, tp: 1.5, desc: "Growth runs hot and inflation builds. The Fed leans toward hiking; credit is loose." },
    slowdown: { name: "Slowdown", g: 0.7, eq: -0.05, vol: 0.2, credit: 1.35, cyc: -0.05, tp: 1.25, desc: "Growth stalls. Cyclicals and small caps lag; defensives and bonds hold up." },
    recession: { name: "Recession", g: -2.3, eq: -0.24, vol: 0.3, credit: 2.3, cyc: -0.12, tp: 1.05, desc: "Output shrinks and layoffs mount. The Fed cuts, credit spreads blow out and volatility spikes." },
    recovery: { name: "Recovery", g: 3.3, eq: 0.22, vol: 0.19, credit: 1.25, cyc: 0.08, tp: 1.3, desc: "The economy turns up from a trough. Beaten-down cyclicals rally hardest." }
  };
  // Monthly transition probabilities.
  var TRANSITIONS = {
    expansion: { boom: 0.025, slowdown: 0.028 },
    boom: { slowdown: 0.09, expansion: 0.03 },
    slowdown: { recession: 0.11, expansion: 0.08 },
    recession: { recovery: 0.16 },
    recovery: { expansion: 0.12 }
  };
  var MIN_REGIME_DAYS = 45;

  var R_STAR = 1.0;        // real neutral policy rate
  var U_STAR = 4.3;        // natural unemployment rate
  var PI_STAR = 2.0;       // Fed inflation target
  var PI_ANCHOR = 2.4;     // where inflation settles absent shocks
  var HIST_MAX = 1100;

  function A(k, tau) { var x = k * tau; return x < 1e-6 ? 1 : (1 - Math.exp(-x)) / x; }
  function round1(x) { return Math.round(x * 10) / 10; }
  function round25(x) { return Math.round(x * 4) / 4; }
  function fracStr(x) {
    var whole = Math.floor(x + 1e-9), f = Math.round((x - whole) * 4);
    var frac = ["", "-1/4", "-1/2", "-3/4"][f] || "";
    return whole === 0 && frac ? frac.slice(1) : whole + frac;
  }

  function create(rng, startDay) {
    var E = {
      regime: "expansion", regimeAge: 200,
      gdp: 2.3, gdpPrint: 2.2, gdpQ: [2.3],
      infl: 2.9, energy: 0, cpiPrint: 2.9, corePrint: 2.9,
      unemp: 4.3, unempPrint: 4.3, payrollsPrint: 150,
      pmi: 50.4, retail: 0.3, sentiment: 72,
      fed: 4.25, fedExpMove: 0, nextFomc: null,
      tp: 1.35, lvl: 0, slope: 0, front: 0,
      credit: 1.0, mktVol: 0.14, drawdown: 0,
      lastDay: startDay,
      releases: [],
      statement: "",
      hist: { d: [], fed: [], y3m: [], y2: [], y10: [], y30: [], cpi: [], unemp: [], gdp: [], ig: [], hy: [], regime: [], curve: [] }
    };
    E.statement = "The Committee decided to maintain the target range for the federal funds rate at " + fracStr(E.fed - 0.25) + " to " + fracStr(E.fed) + " percent.";
    return E;
  }

  // Expected equity excess return for the regime. Markets sell off early
  // in a recession and start rallying well before the economy recovers.
  function equityDrift(E) {
    var R = REGIMES[E.regime];
    if (E.regime === "recession") return E.regimeAge < 100 ? -0.26 : 0.08;
    if (E.regime === "slowdown") return E.regimeAge < 90 ? -0.06 : 0.0;
    return R.eq;
  }

  function taylor(E) {
    var t = R_STAR + E.infl + 0.5 * (E.infl - PI_STAR) + (U_STAR - E.unemp);
    return Math.max(0.125, t);
  }
  function fedMid(E) { return E.fed - 0.125; }
  function effective(E) { return Math.max(0.05, E.fed - 0.17); }

  // What the rule says the committee does today (in percentage points).
  function ruleMove(E, target) {
    var diff = target - fedMid(E);
    if (diff >= 1.25 && E.infl > 4) return 0.5;
    if (diff >= 0.2) return 0.25;
    if (diff <= -1.0 && (E.regime === "recession" || E.regime === "slowdown")) return E.drawdown > 0.25 && diff <= -2 ? -0.75 : -0.5;
    if (diff <= -0.2) return E.fed > 0.3 ? -0.25 : 0;
    return 0;
  }

  // Priced short rate: the current rate plus the expected move at the next
  // meeting, weighted by how close the meeting is.
  function pricedShort(E, day) {
    var s = effective(E);
    if (E.nextFomc != null) {
      var days = Math.max(0, E.nextFomc - day);
      s += E.fedExpMove * Math.exp(-days / 25);
    }
    return s;
  }

  function longRunShort(E) {
    var piExp = PI_ANCHOR - 0.2 + 0.25 * (E.infl - PI_ANCHOR);
    return R_STAR - 0.1 + piExp;
  }

  // Treasury yield (percent) at maturity tau (years).
  function yieldAt(E, tau, day) {
    tau = Math.max(tau, 1 / 52);
    var s = pricedShort(E, day == null ? E.lastDay : day);
    var T = taylor(E);
    var sInf = longRunShort(E);
    var y = sInf + (T - sInf) * A(0.25, tau) + (s - T) * A(2, tau);
    y += E.tp * (1 - Math.exp(-tau / 8));
    // Shocks fade toward the very short end, which the policy rate anchors.
    var pin = 1 - Math.exp(-tau / 0.4);
    y += (E.lvl + E.slope * (1 - A(0.6, tau)) + E.front * A(1.5, tau)) * pin;
    return Math.max(0.01, y);
  }
  function breakeven(E, tau) { return PI_ANCHOR - 0.1 + 0.35 * (E.infl - PI_ANCHOR) * A(0.3, tau); }
  function realYieldAt(E, tau, day) { return yieldAt(E, tau, day) - breakeven(E, tau); }

  var TENORS = [[1 / 12, "1M"], [0.25, "3M"], [0.5, "6M"], [1, "1Y"], [2, "2Y"], [3, "3Y"], [5, "5Y"], [7, "7Y"], [10, "10Y"], [20, "20Y"], [30, "30Y"]];
  function curve(E, day) { return TENORS.map(function (t) { return { tau: t[0], label: t[1], y: yieldAt(E, t[0], day) }; }); }

  function spreads(E) {
    var ig = 0.95 * E.credit;
    var hy = 3.2 * Math.pow(E.credit, 1.45);
    return { ig: ig, hy: hy };
  }

  function nextFomc(day) {
    var y = Cal.parts(day).y;
    var list = Cal.fomcDates(y).concat(Cal.fomcDates(y + 1));
    for (var i = 0; i < list.length; i++) if (list[i] >= day) return list[i];
    return null;
  }

  /* ---------------- Daily evolution ---------------- */

  // Advance the latent economy by `days` calendar days ending on `day`.
  // oilRet is the log change in crude over the period.
  function advance(E, rng, day, days, oilRet) {
    for (var i = 0; i < days; i++) {
      // Regime switching.
      E.regimeAge++;
      if (E.regimeAge > MIN_REGIME_DAYS && !E.lock) {
        var tr = TRANSITIONS[E.regime];
        for (var to in tr) {
          var pm = tr[to];
          if (to === "recession" && E.drawdown > 0.2) pm *= 2;
          if (to === "recession" && yieldAt(E, 10, day) < yieldAt(E, 0.25, day) - 0.3) pm *= 1.4;
          if (rng.next() < 1 - Math.pow(1 - pm, 1 / 30.4)) { E.regime = to; E.regimeAge = 0; E.regimeChanged = true; break; }
        }
      }
      var R = REGIMES[E.regime];
      E.gdp += 0.02 * (R.g - E.gdp) + 0.05 * rng.gauss() - (i === 0 ? 1.2 * oilRet : 0);
      // Core inflation is sticky; energy prices push headline CPI for about a
      // year after an oil move and then drop out of the annual comparison.
      E.infl += (0.45 / 365) * (PI_ANCHOR - E.infl) + (0.3 / 365) * (E.gdp - 2.0) + 0.012 * rng.gauss() + (i === 0 ? 0.3 * oilRet : 0);
      E.energy = E.energy * Math.exp(-1 / 200) + (i === 0 ? 2.2 * oilRet : 0);
      E.infl = Math.max(-1.5, Math.min(12, E.infl));
      E.unemp += (-0.45 * (E.gdp - 2.2) + 0.25 * (U_STAR - E.unemp)) / 365 + 0.004 * rng.gauss();
      E.unemp = Math.max(3.0, Math.min(12, E.unemp));
      E.tp += (1.5 / 365) * (R.tp + 0.2 * Math.max(0, E.infl - 3) - E.tp);
      E.credit += (2 / 365) * (R.credit * (1 + 1.1 * Math.max(0, E.mktVol - 0.18) / 0.18) - E.credit) + 0.01 * rng.gauss();
      E.credit = Math.max(0.6, Math.min(4, E.credit));
      E.sentiment += 0.03 * (60 + 6 * E.gdp - 2 * Math.max(0, E.infl - 2.5) - E.sentiment) + 0.4 * rng.gauss();
      // Shocks decay.
      E.lvl *= Math.exp(-0.8 / 365);
      E.slope *= Math.exp(-1 / 365);
      E.front *= Math.exp(-3 / 365);
    }
    E.nextFomc = nextFomc(day);
    if (E.nextFomc != null) E.fedExpMove = ruleMove(E, taylor(E));
    E.lastDay = day;
  }

  // Random yield noise for a slice of the trading day (frac of a full day's
  // variance). Daily 10-yr std ≈ 5–6 bp.
  function noise(E, rng, frac) {
    var sq = Math.sqrt(frac);
    var vs = 0.8 + 0.4 * E.mktVol / 0.15;
    E.lvl += 0.03 * vs * sq * rng.gauss();
    E.slope += 0.02 * sq * rng.gauss();
    E.front += 0.02 * sq * rng.gauss();
    E.tp += 0.012 * sq * rng.gauss();
  }

  /* ---------------- Releases ---------------- */

  var RELEASE_INFO = {
    jobs: { name: "Jobs report", time: "8:30 am", tick: -1 },
    cpi: { name: "CPI inflation", time: "8:30 am", tick: -1 },
    retail: { name: "Retail sales", time: "8:30 am", tick: -1 },
    gdp: { name: "GDP (advance)", time: "8:30 am", tick: -1 },
    pmi: { name: "ISM manufacturing PMI", time: "10:00 am", tick: 2 },
    fomc: { name: "FOMC rate decision", time: "2:00 pm", tick: 18 }
  };

  function scheduledOn(day) {
    var p = Cal.parts(day);
    var r = Cal.releaseDates(p.y, p.m);
    var out = [];
    ["jobs", "cpi", "retail", "gdp", "pmi"].forEach(function (k) { if (r[k] === day) out.push(k); });
    if (Cal.isFomcDay(day)) out.push("fomc");
    return out;
  }

  // Next `count` scheduled releases on or after `from`.
  function upcoming(E, from, count) {
    var out = [];
    for (var d = from; out.length < count && d < from + 120; d++) {
      if (!Cal.isTradingDay(d)) continue;
      scheduledOn(d).forEach(function (k) {
        var cons = null;
        if (k === "fomc") cons = E.fedExpMove === 0 ? "Hold" : (E.fedExpMove > 0 ? "+" : "") + Math.round(E.fedExpMove * 100) + " bp";
        out.push({ day: d, type: k, name: RELEASE_INFO[k].name, time: RELEASE_INFO[k].time, cons: cons });
      });
    }
    return out.slice(0, count);
  }

  // Build a release: actual vs consensus, the surprise (in standard units)
  // and the market shock it causes.
  function release(E, rng, type, day) {
    var ev = { day: day, type: type, name: RELEASE_INFO[type].name, time: RELEASE_INFO[type].time };
    var hot = E.infl > 3.2;
    var weak = E.regime === "recession" || E.regime === "slowdown";
    var z, shock;
    if (type === "jobs") {
      var exp = 25 + 55 * E.gdp;
      var cons = Math.round((exp + 20 * rng.gauss()) / 5) * 5;
      var actual = Math.round(exp + 60 * rng.gauss());
      var uCons = round1(E.unempPrint + 0.3 * (E.unemp - E.unempPrint));
      var uAct = round1(E.unemp + 0.05 * rng.gauss());
      z = (actual - cons) / 55 - (uAct - uCons) / 0.1 * 0.3;
      ev.prior = E.payrollsPrint + "k";
      ev.cons = cons + "k";
      ev.actual = actual + "k";
      ev.extra = "Unemployment " + uAct.toFixed(1) + "% (cons. " + uCons.toFixed(1) + "%)";
      E.payrollsPrint = actual; E.unempPrint = uAct;
      shock = { eq: z * (hot ? -0.0025 : weak ? 0.004 : 0.002), y: 3 * z, front: 5 * z, usd: 0.0025 * z, gold: -0.002 * z, crypto: (hot ? -0.006 : 0.004) * z, sectors: { consdisc: 0.001 * z, indust: 0.001 * z } };
      ev.headline = "Payrolls " + (actual >= 0 ? "+" : "") + actual + "k vs " + cons + "k expected; unemployment " + uAct.toFixed(1) + "%";
    } else if (type === "cpi") {
      var head = E.infl + E.energy;
      var cCons = round1(E.cpiPrint + 0.8 * (head - E.cpiPrint) + 0.05 * rng.gauss());
      var cAct = round1(head + 0.09 * rng.gauss());
      var core = round1(E.infl + 0.06 * rng.gauss());
      z = (cAct - cCons) / 0.1;
      ev.prior = E.cpiPrint.toFixed(1) + "%"; ev.cons = cCons.toFixed(1) + "%"; ev.actual = cAct.toFixed(1) + "%";
      ev.extra = "Core " + core.toFixed(1) + "% y/y";
      E.cpiPrint = cAct; E.corePrint = core;
      shock = { eq: -0.005 * z, y: 5 * z, front: 6 * z, usd: 0.0025 * z, gold: 0.001 * z, crypto: -0.008 * z, sectors: { tech: -0.003 * z, realest: -0.002 * z, utils: -0.002 * z } };
      ev.headline = "CPI " + cAct.toFixed(1) + "% y/y vs " + cCons.toFixed(1) + "% expected" + (z >= 1 ? " — hotter than forecast" : z <= -1 ? " — cooler than forecast" : "");
    } else if (type === "gdp") {
      var q = E.gdpQ.length ? E.gdpQ.reduce(function (a, b) { return a + b; }, 0) / E.gdpQ.length : E.gdp;
      var gCons = round1(q + 0.35 * rng.gauss());
      var gAct = round1(q + 0.55 * rng.gauss());
      z = (gAct - gCons) / 0.5;
      ev.prior = E.gdpPrint.toFixed(1) + "%"; ev.cons = gCons.toFixed(1) + "%"; ev.actual = gAct.toFixed(1) + "%";
      E.gdpPrint = gAct; E.gdpQ = [];
      shock = { eq: 0.003 * z, y: 3 * z, front: 2 * z, usd: 0.0015 * z, crypto: 0.003 * z, sectors: {} };
      ev.headline = "GDP grew at a " + gAct.toFixed(1) + "% annual rate vs " + gCons.toFixed(1) + "% expected";
    } else if (type === "retail") {
      var rExp = 0.3 + 0.15 * (E.gdp - 2);
      var rCons = round1(rExp + 0.1 * rng.gauss());
      var rAct = round1(rExp + 0.4 * rng.gauss());
      z = (rAct - rCons) / 0.4;
      ev.prior = E.retail.toFixed(1) + "%"; ev.cons = rCons.toFixed(1) + "%"; ev.actual = rAct.toFixed(1) + "%";
      E.retail = rAct;
      shock = { eq: 0.0015 * z, y: 2 * z, front: 2 * z, sectors: { consdisc: 0.004 * z, staples: 0.001 * z } };
      ev.headline = "Retail sales " + (rAct >= 0 ? "+" : "") + rAct.toFixed(1) + "% m/m vs " + rCons.toFixed(1) + "% expected";
    } else if (type === "pmi") {
      var pExp = 50 + 2.4 * (E.gdp - 1.8);
      var pCons = round1(E.pmi + 0.6 * (pExp - E.pmi) + 0.3 * rng.gauss());
      var pAct = round1(pExp + 1.3 * rng.gauss());
      z = (pAct - pCons) / 1.3;
      ev.prior = E.pmi.toFixed(1); ev.cons = pCons.toFixed(1); ev.actual = pAct.toFixed(1);
      E.pmi = pAct;
      shock = { eq: 0.002 * z, y: 2 * z, front: 1 * z, commodities: { COPPER: 0.006 * z, WTI: 0.004 * z }, sectors: { indust: 0.003 * z, materials: 0.004 * z } };
      ev.headline = "ISM manufacturing " + pAct.toFixed(1) + (pAct >= 50 ? " (expanding)" : " (contracting)") + " vs " + pCons.toFixed(1) + " expected";
    } else if (type === "fomc") {
      var target = taylor(E);
      var expected = E.fedExpMove;
      var actualMove = ruleMove(E, target + 0.15 * rng.gauss());
      var surprise = actualMove - expected;
      var oldUpper = E.fed;
      E.fed = Math.max(0.25, round25(E.fed + actualMove));
      actualMove = E.fed - oldUpper;
      // Forward guidance: where the rule points after the move.
      var gap = target - fedMid(E);
      var tone = gap > 0.3 ? "hawkish" : gap < -0.3 ? "dovish" : "balanced";
      z = surprise / 0.25 + (tone === "hawkish" ? 0.4 : tone === "dovish" ? -0.4 : 0);
      ev.prior = fracStr(oldUpper - 0.25) + "–" + fracStr(oldUpper) + "%";
      ev.cons = expected === 0 ? "Hold" : (expected > 0 ? "+" : "") + Math.round(expected * 100) + " bp";
      ev.actual = actualMove === 0 ? "Hold" : (actualMove > 0 ? "+" : "") + Math.round(actualMove * 100) + " bp";
      ev.extra = "New range " + fracStr(E.fed - 0.25) + "–" + fracStr(E.fed) + "%; tone " + tone;
      // The priced component is already in the curve (pricedShort), so the
      // front end reacts to the surprise and the new guidance only.
      E.fedExpMove = 0;
      shock = { eq: -0.012 * z, y: 3 * z, front: 8 * z, usd: 0.003 * z, gold: -0.003 * z, crypto: -0.012 * z, sectors: { fin: 0.002 * z, realest: -0.004 * z, utils: -0.003 * z, tech: -0.003 * z } };
      var verb = actualMove > 0 ? "raised" : actualMove < 0 ? "cut" : "held";
      ev.headline = "Fed " + verb + " rates" + (actualMove !== 0 ? " by " + Math.abs(Math.round(actualMove * 100)) + " bp to " : " at ") + fracStr(E.fed - 0.25) + "–" + fracStr(E.fed) + "%" + (surprise !== 0 ? " in a surprise move" : "");
      E.statement = statement(E, actualMove, tone);
    }
    ev.z = Math.round(z * 100) / 100;
    ev.shock = shock;
    E.releases.unshift(ev);
    if (E.releases.length > 80) E.releases.length = 80;
    return ev;
  }

  function statement(E, move, tone) {
    var verb = move > 0 ? "raise the target range for the federal funds rate by " + fracStr(Math.abs(move)) + " percentage point to"
      : move < 0 ? "lower the target range for the federal funds rate by " + fracStr(Math.abs(move)) + " percentage point to"
      : "maintain the target range for the federal funds rate at";
    var growth = E.gdp > 3 ? "Economic activity has been expanding at a strong pace." : E.gdp > 1.5 ? "Economic activity has continued to expand at a solid pace." : E.gdp > 0 ? "Growth of economic activity has moderated." : "Economic activity has contracted.";
    var labor = E.unemp < 4.2 ? "The labor market remains tight." : E.unemp < 5 ? "Labor market conditions remain solid." : "The unemployment rate has moved up and job gains have slowed.";
    var infl = E.infl > 3.5 ? "Inflation remains elevated." : E.infl > 2.5 ? "Inflation has eased but remains somewhat elevated." : "Inflation has moved close to the Committee's 2 percent objective.";
    var guide = tone === "hawkish" ? "The Committee judges that additional policy firming may be appropriate."
      : tone === "dovish" ? "The Committee anticipates that further adjustments to the target range may be appropriate to support maximum employment."
      : "The Committee will carefully assess incoming data, the evolving outlook, and the balance of risks.";
    return growth + " " + labor + " " + infl + " The Committee decided to " + verb + " " + fracStr(E.fed - 0.25) + " to " + fracStr(E.fed) + " percent. " + guide;
  }

  function record(E, day) {
    var h = E.hist, sp = spreads(E);
    h.d.push(day); h.fed.push(E.fed); h.y3m.push(yieldAt(E, 0.25, day)); h.y2.push(yieldAt(E, 2, day));
    h.y10.push(yieldAt(E, 10, day)); h.y30.push(yieldAt(E, 30, day)); h.cpi.push(E.cpiPrint); h.unemp.push(E.unempPrint);
    h.gdp.push(E.gdpPrint); h.ig.push(sp.ig); h.hy.push(sp.hy); h.regime.push(E.regime);
    h.curve.push(TENORS.map(function (t) { return Math.round(yieldAt(E, t[0], day) * 1e4) / 1e4; }));
    if (h.d.length > HIST_MAX) for (var k in h) h[k].splice(0, h[k].length - HIST_MAX);
    // Quarterly GDP averages the latent series; the advance print reads it.
    E.gdpQ.push(E.gdp);
  }

  return {
    REGIMES: REGIMES, TENORS: TENORS, RELEASE_INFO: RELEASE_INFO,
    create: create, advance: advance, noise: noise, release: release, record: record,
    scheduledOn: scheduledOn, upcoming: upcoming,
    yieldAt: yieldAt, realYieldAt: realYieldAt, breakeven: breakeven, curve: curve, spreads: spreads,
    taylor: taylor, effective: effective, equityDrift: equityDrift, fracStr: fracStr, fedMid: fedMid
  };
});
