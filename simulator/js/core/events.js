/*
 * Random news. Each generator returns an event spec:
 *   { kind, title, syms: [...], shock: {...}, effect?: fn(market) }
 * The market applies the shock (instant log-returns on the named assets)
 * and records the headline. Firms, drugs and people are all fictional.
 *
 * Shock keys: eq (market factor, scaled by each stock's beta), sectors,
 * industries, stocks, crypto (crypto factor), coins, commodities, usd,
 * vol (multiplier on equity volatility), cvol (crypto volatility),
 * y / front (bp moves in the Treasury curve), credit (multiplier change).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.BSX = root.BSX || {}; root.BSX.Events = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var BANKS = ["Morrow & Pike", "Castellan Securities", "Brightline Capital Markets", "Hanover Street Research", "Ridgeway Partners", "Alder & Finch", "Northgate Securities", "Seaport Equity Research"];
  var SHORTERS = ["Crimson Kite Research", "Blind Spot Capital", "Night Owl Research", "Glasshouse Analytics"];
  var DRUG_A = ["Vel", "Zor", "Tre", "Qua", "Ami", "Lux", "Obi", "Cera", "Nexa", "Pria", "Ruxo", "Sema", "Tivo", "Xelo"];
  var DRUG_B = ["trozi", "vamo", "lapi", "fleni", "rina", "zeta", "cori", "doxa", "meni", "tega"];
  var DRUG_C = ["mab", "tinib", "parin", "stat", "vir", "zumab", "cept", "glutide"];
  var PRODUCTS = {
    tech: ["AI accelerator", "cloud platform", "security suite", "flagship smartphone", "data-center switch", "AI agent platform"],
    comms: ["streaming bundle", "AI assistant", "ad platform", "5G home internet plan"],
    consdisc: ["electric pickup", "loyalty program", "store format", "sneaker line"],
    indust: ["narrow-body jet", "autonomous truck", "grid battery system", "cargo drone"],
    health: ["surgical robot", "glucose monitor", "diagnostic test"],
    staples: ["plant-based line", "premium beverage", "private-label range"],
    fin: ["trading app", "high-yield savings account", "stablecoin payments service"],
    energy: ["LNG export terminal", "carbon-capture project"],
    utils: ["nuclear restart plan", "grid expansion plan"],
    realest: ["data-center campus", "logistics park"],
    materials: ["battery-grade lithium plant", "low-carbon steel process"]
  };
  var UNITS = ["cloud", "consumer", "medical", "industrial", "payments", "media"];

  function drug(rng) { return rng.pick(DRUG_A) + rng.pick(DRUG_B) + rng.pick(DRUG_C); }
  function money(x) { return x >= 1e9 ? "$" + (x / 1e9).toFixed(x >= 1e10 ? 0 : 1) + "B" : "$" + Math.round(x / 1e6) + "M"; }
  function nm(s) { return s.name.replace(/ (Inc\.|Corp\.|Co\.)$/, ""); }
  function normal(rng, m, sd) { return m + sd * rng.gauss(); }

  /* ---------------- Company events ---------------- */
  // w: weight · when: optional filter · make: builds the event
  var COMPANY = [
    { w: 10, make: function (s, rng) { var r = normal(rng, 0.03, 0.012); return { title: nm(s) + " upgraded to Buy at " + rng.pick(BANKS), r: r }; } },
    { w: 10, make: function (s, rng) { var r = normal(rng, -0.035, 0.012); return { title: nm(s) + " cut to Sell at " + rng.pick(BANKS), r: r }; } },
    { w: 6, make: function (s, rng) { return { title: nm(s) + " raises full-year outlook", r: normal(rng, 0.06, 0.02) }; } },
    { w: 6, make: function (s, rng) { return { title: nm(s) + " cuts guidance, citing weaker demand", r: normal(rng, -0.08, 0.03) }; } },
    { w: 5, when: function (s) { return s.eps > 0; }, make: function (s, rng, M) { return { title: nm(s) + " announces " + money(s.px * s.shares * rng.range(0.02, 0.08)) + " share buyback", r: normal(rng, 0.025, 0.01) }; } },
    { w: 5, when: function (s) { return s.sector === "indust" || s.sector === "tech" || s.sector === "energy"; }, make: function (s, rng) { return { title: nm(s) + " wins " + money(s.px * s.shares * rng.range(0.01, 0.05)) + " contract", r: normal(rng, 0.04, 0.02) }; } },
    { w: 5, make: function (s, rng) { return { title: nm(s) + " unveils new " + rng.pick(PRODUCTS[s.sector] || ["product"]), r: normal(rng, 0.025, 0.025) }; } },
    { w: 3, when: function (s) { return ["consdisc", "health", "staples"].indexOf(s.sector) >= 0; }, make: function (s, rng) { return { title: nm(s) + " recalls products over safety concerns", r: normal(rng, -0.05, 0.02) }; } },
    { w: 4, make: function (s, rng) { return { title: nm(s) + " hit with " + money(s.px * s.shares * rng.range(0.005, 0.03)) + " lawsuit", r: normal(rng, -0.035, 0.015) }; } },
    { w: 1.5, make: function (s, rng) { return { title: "Regulators open accounting probe into " + nm(s), r: normal(rng, -0.13, 0.05) }; } },
    { w: 3, make: function (s, rng) { return { title: nm(s) + " CEO steps down unexpectedly", r: normal(rng, -0.04, 0.03) }; } },
    { w: 2, make: function (s, rng) { return { title: "Activist investor takes stake in " + nm(s) + ", pushes for changes", r: normal(rng, 0.07, 0.03) }; } },
    { w: 1.5, make: function (s, rng) { return { title: rng.pick(SHORTERS) + " discloses short position in " + nm(s) + ", alleging inflated sales", r: normal(rng, -0.14, 0.05), borrowUp: true }; } },
    { w: 1.2, when: function (s) { return s.px * s.shares < 6e10; }, make: function (s, rng) { var prem = rng.range(0.22, 0.42); return { title: nm(s) + " agrees to be taken private at $" + (s.px * (1 + prem)).toFixed(2) + " a share", r: Math.log(1 + prem) - 0.02 }; } },
    { w: 1, when: function (s) { return s.shortInt > 0.14; }, make: function (s, rng) { return { title: "Short squeeze sends " + nm(s) + " soaring; " + Math.round(s.shortInt * 100) + "% of float was sold short", r: rng.range(0.2, 0.6), squeeze: true }; } },
    { w: 7, when: function (s) { return s.industry === "Biotechnology" || s.industry === "Pharmaceuticals"; }, make: function (s, rng) { var bio = s.industry === "Biotechnology"; return { title: "FDA approves " + nm(s) + "'s " + drug(rng), r: bio ? normal(rng, 0.22, 0.1) : normal(rng, 0.04, 0.02) }; } },
    { w: 4, when: function (s) { return s.industry === "Biotechnology" || s.industry === "Pharmaceuticals"; }, make: function (s, rng) { var bio = s.industry === "Biotechnology"; return { title: "FDA rejects " + nm(s) + "'s " + drug(rng), r: bio ? normal(rng, -0.35, 0.12) : normal(rng, -0.06, 0.02) }; } },
    { w: 6, when: function (s) { return s.industry === "Biotechnology"; }, make: function (s, rng) { var hit = rng.chance(0.55); return { title: nm(s) + "'s " + drug(rng) + " " + (hit ? "meets" : "misses") + " primary goal in late-stage trial", r: hit ? normal(rng, 0.3, 0.12) : normal(rng, -0.4, 0.12) }; } },
    { w: 2, when: function (s) { return ["tech", "fin", "comms", "consdisc"].indexOf(s.sector) >= 0; }, make: function (s, rng) { return { title: nm(s) + " discloses data breach affecting " + rng.int(2, 90) + " million customers", r: normal(rng, -0.06, 0.02) }; } },
    { w: 3, when: function (s) { return s.sector === "tech" || s.sector === "comms"; }, make: function (s, rng, M) { var big = M.bigTech(rng, s.id); return { title: nm(s) + " signs AI partnership with " + nm(big), r: normal(rng, 0.08, 0.04), also: [[big.id, 0.005]] }; } },
    { w: 2, when: function (s) { return s.sector === "indust" || s.sector === "consdisc"; }, make: function (s, rng) { return { title: "Workers strike at " + nm(s) + " plants", r: normal(rng, -0.03, 0.01) }; } },
    { w: 2, when: function (s) { return s.sector === "tech" || s.sector === "health"; }, make: function (s, rng) { var win = rng.chance(0.5); return { title: nm(s) + (win ? " wins" : " loses") + " major patent case", r: win ? normal(rng, 0.04, 0.02) : normal(rng, -0.05, 0.02) }; } },
    { w: 1, make: function (s, rng) { return { title: nm(s) + " plans to spin off its " + rng.pick(UNITS) + " unit", r: normal(rng, 0.04, 0.02) }; } },
    { w: 3, make: function (s, rng) { var buy = rng.chance(0.5); return { title: (buy ? "Director buys " : "CEO sells ") + money(rng.range(2e6, 6e7)) + " of " + nm(s) + " stock", r: buy ? normal(rng, 0.015, 0.008) : normal(rng, -0.012, 0.008) }; } }
  ];

  /* ---------------- Sector, commodity, market, crypto ---------------- */
  var SECTOR = [
    { w: 3, title: "New export curbs on advanced chips announced", shock: { industries: { "Semiconductors": -0.06, "Semiconductor Equipment": -0.07 } } },
    { w: 4, title: "Cloud giants lift AI spending plans again", shock: { industries: { "Semiconductors": 0.05, "Semiconductor Equipment": 0.05, "Networking": 0.04, "Electrical Equipment": 0.03, "Data Center REITs": 0.03 } } },
    { w: 2, title: "Drug-pricing bill advances in the Senate", shock: { industries: { "Pharmaceuticals": -0.04, "Biotechnology": -0.05, "Managed Care": -0.02 } } },
    { w: 2, title: "Regional bank shares slide after a lender discloses heavy loan losses", shock: { industries: { "Banks": -0.07 }, sectors: { fin: -0.02 }, eq: -0.006, credit: 0.12 } },
    { w: 2, title: "Congress extends electric-vehicle tax credits", shock: { industries: { "Automobiles": 0.06, "Auto Parts": 0.02 } } },
    { w: 2, title: "Mortgage applications jump as home sales rebound", shock: { industries: { "Homebuilders": 0.05, "Building Products": 0.03 } } },
    { w: 2, title: "White House announces sweeping new tariffs", shock: { eq: -0.012, sectors: { indust: -0.015, materials: -0.02, consdisc: -0.02 }, usd: 0.004 } },
    { w: 2, title: "US and major trading partners reach tariff truce", shock: { eq: 0.012, sectors: { indust: 0.012, materials: 0.015, consdisc: 0.012 } } },
    { w: 2, title: "Congress passes record defense budget", shock: { industries: { "Aerospace & Defense": 0.04 } } },
    { w: 2, title: "Justice Department sues big tech platforms over ad monopolies", shock: { industries: { "Interactive Media": -0.05, "Software": -0.015 } } },
    { w: 2, title: "Airline bookings slump as travel demand cools", shock: { industries: { "Transportation": -0.03, "Hotels & Leisure": -0.035 } } },
    { w: 2, title: "Next-generation obesity pills show strong trial results", shock: { industries: { "Pharmaceuticals": 0.035, "Food Products": -0.02, "Restaurants": -0.015 } } },
    { w: 2, title: "Ransomware wave pushes companies to boost security spending", shock: { industries: { "Software": 0.025 } } },
    { w: 2, title: "Office vacancies hit a record high", shock: { industries: { "Office REITs": -0.06 }, sectors: { realest: -0.012 } } },
    { w: 2, title: "Data-center power deals lift utilities and grid suppliers", shock: { industries: { "Electric Utilities": 0.03, "Electrical Equipment": 0.05, "Renewables": 0.04 } } },
    { w: 1.5, title: "Streaming price war erupts", shock: { industries: { "Entertainment": -0.04 } } },
    { w: 1.5, title: "Consumer spending on luxury goods cools", shock: { industries: { "Apparel & Luxury": -0.04 } } }
  ];

  var COMMODITY = [
    { w: 2, title: "OPEC+ announces surprise production cut", shock: { commodities: { WTI: 0.08 }, sectors: { energy: 0.035 }, industries: { "Transportation": -0.015 } } },
    { w: 2, title: "OPEC+ agrees to boost output", shock: { commodities: { WTI: -0.07 }, sectors: { energy: -0.03 } } },
    { w: 1.5, months: [6, 7, 8, 9, 10], title: "Hurricane forces Gulf of Mexico production shut-ins", shock: { commodities: { WTI: 0.04, NATGAS: 0.08 }, industries: { "Insurance": -0.04, "Refining": 0.03 } } },
    { w: 1.5, months: [5, 6, 7, 8], title: "Midwest drought threatens crop yields", shock: { commodities: { CORN: 0.08, SOY: 0.06, WHEAT: 0.05 }, industries: { "Fertilizers": 0.03 } } },
    { w: 1.5, months: [8, 9, 10], title: "USDA forecasts a record harvest", shock: { commodities: { CORN: -0.06, SOY: -0.04 } } },
    { w: 2, title: "Central banks step up gold purchases", shock: { commodities: { GOLD: 0.03, SILVER: 0.035 }, industries: { "Metals & Mining": 0.02 } } },
    { w: 1.5, title: "Strike halts a major copper mine", shock: { commodities: { COPPER: 0.05 }, industries: { "Metals & Mining": 0.025 } } },
    { w: 1.5, title: "China unveils a large stimulus package", shock: { commodities: { COPPER: 0.04, WTI: 0.03, GOLD: 0.005 }, sectors: { materials: 0.025 }, eq: 0.004 } },
    { w: 1, title: "Black Sea shipping disrupted; wheat prices spike", shock: { commodities: { WHEAT: 0.12, CORN: 0.04 } } },
    { w: 1.5, months: [11, 12, 1, 2], title: "Arctic blast sends natural gas soaring", shock: { commodities: { NATGAS: 0.15 }, industries: { "Gas Utilities": 0.02 } } },
    { w: 1.5, months: [3, 4, 5], title: "Mild weather leaves natural gas storage bloated", shock: { commodities: { NATGAS: -0.1 } } }
  ];

  // bias: >0 more likely in good times, <0 in bad times.
  var MARKET = [
    { w: 1, bias: -1, title: "Military conflict erupts in the Middle East; oil jumps", shock: { eq: -0.02, vol: 1.3, commodities: { WTI: 0.09, GOLD: 0.03 }, usd: 0.004, y: -8, crypto: -0.05, sectors: { energy: 0.04 }, industries: { "Aerospace & Defense": 0.04, "Transportation": -0.03 } } },
    { w: 0.6, bias: -1, title: "Flash crash: stocks plunge as trading algorithms dump shares", shock: { eq: -0.04, vol: 1.6, crypto: -0.06, y: -6 } },
    { w: 1, bias: 0, title: "Federal government shuts down after budget talks collapse", shock: { eq: -0.008, y: -2 } },
    { w: 1, bias: 1, title: "Congress passes an infrastructure and tax package", shock: { eq: 0.015, y: 6, sectors: { indust: 0.02, materials: 0.02 } } },
    { w: 0.5, bias: -1, title: "Rating agency downgrades US government credit", shock: { eq: -0.015, y: 10, usd: -0.006, commodities: { GOLD: 0.02 }, vol: 1.2 } },
    { w: 1, bias: 0, title: "AI stocks slide as investors question returns on spending", shock: { eq: -0.018, industries: { "Semiconductors": -0.06, "Software": -0.035, "Semiconductor Equipment": -0.05 }, vol: 1.25 } },
    { w: 1, bias: 1, title: "Stocks surge to records on soft-landing hopes", shock: { eq: 0.018, vol: 0.9, crypto: 0.03 } },
    { w: 0.7, bias: -1, title: "Private-credit fund freezes redemptions, sparking credit fears", shock: { eq: -0.025, credit: 0.3, vol: 1.35, sectors: { fin: -0.03 }, y: -5 } },
    { w: 0.15, bias: -1, title: "New virus variant spreads rapidly; travel stocks crash", shock: { eq: -0.06, vol: 2.0, commodities: { WTI: -0.12 }, y: -20, industries: { "Hotels & Leisure": -0.12, "Transportation": -0.08, "Biotechnology": 0.05 }, crypto: -0.08 } },
    { w: 0.12, bias: -1, title: "Black Monday: stocks suffer their worst day in decades", shock: { eq: -0.085, vol: 2.3, y: -25, credit: 0.5, crypto: -0.15, commodities: { GOLD: 0.03, WTI: -0.06 } } },
    { w: 0.8, bias: 1, title: "Big Tech earnings blowout lifts the whole market", shock: { eq: 0.012, sectors: { tech: 0.015, comms: 0.015 } } }
  ];

  var CRYPTO = [
    { w: 2, make: function (M, rng) { var c = M.randomCoin(rng, true); return { title: "Exchange hack drains " + money(rng.range(8e7, 9e8)) + " of " + c.name + " tokens", shock: { crypto: -0.06, coins: pair(c.id, -0.22) }, syms: [c.id] }; } },
    { w: 2, make: function (M, rng) { return { title: "Record inflows into spot crypto trusts", shock: { crypto: 0.05, coins: { ORB: 0.03 } }, syms: ["ORB", "ORBX"] }; } },
    { w: 1.5, make: function (M, rng) { return { title: "Regulators sue a major crypto exchange", shock: { crypto: -0.09, coins: { HIVE: -0.15 }, cvol: 1.3 }, syms: ["HIVE"] }; } },
    { w: 2, make: function (M, rng) { var c = M.randomCoin(rng, true); return { title: c.name + " listed on a major US exchange", shock: { coins: pair(c.id, 0.28) }, syms: [c.id] }; } },
    { w: 0.8, make: function (M, rng) { var s = rng.pick(["USDS", "USDB"]); return { title: M.assets[s].name + " briefly loses its dollar peg", shock: { crypto: -0.06, coins: pair(s, -0.035) }, syms: [s] }; } },
    { w: 1.5, make: function (M, rng) { var c = rng.pick(["PAW", "FROG"]); return { title: "Celebrity post sends " + M.assets[c].name + " soaring", shock: { coins: pair(c, rng.range(0.35, 0.9)) }, syms: [c] }; } },
    { w: 1.5, make: function (M, rng) { return { title: "Dormant whale wallet moves 40,000 ORB to exchanges", shock: { coins: { ORB: -0.06 }, crypto: -0.03 }, syms: ["ORB"] }; } },
    { w: 1.5, make: function (M, rng) { var c = rng.pick(["AETH", "SOLX", "VOLT", "LUMA"]); return { title: M.assets[c].name + " network upgrade goes live", shock: { coins: pair(c, 0.1) }, syms: [c] }; } },
    { w: 1, make: function (M, rng) { var c = rng.pick(["SOLX", "LUMA", "ARCD"]); return { title: M.assets[c].name + " network halts for six hours", shock: { coins: pair(c, -0.12) }, syms: [c] }; } },
    { w: 1, make: function (M, rng) { return { title: "Senate passes crypto market-structure bill", shock: { crypto: 0.07 }, syms: [] }; } },
    { w: 1, make: function (M, rng) { var s = M.bigTech(rng); return { title: nm(s) + " adds ORB to its corporate treasury", shock: { coins: { ORB: 0.05 }, crypto: 0.02 }, syms: ["ORB", s.id] }; } }
  ];

  function pair(k, v) { var o = {}; o[k] = v; return o; }

  function pickWeighted(rng, list, filter, bias, regimeScore) {
    var pairs = [];
    list.forEach(function (e) {
      if (filter && !filter(e)) return;
      var w = e.w;
      if (bias != null && e.bias) w *= Math.max(0.2, 1 + e.bias * regimeScore);
      pairs.push([e, w]);
    });
    return pairs.length ? rng.weighted(pairs) : null;
  }

  function company(M, rng, s) {
    var tmpl = pickWeighted(rng, COMPANY, function (e) { return !e.when || e.when(s); });
    var ev = tmpl.make(s, rng, M);
    var stocks = {}; stocks[s.id] = ev.r;
    (ev.also || []).forEach(function (a) { stocks[a[0]] = a[1]; });
    return { kind: "company", title: ev.title, syms: [s.id].concat((ev.also || []).map(function (a) { return a[0]; })), shock: { stocks: stocks }, r: ev.r, borrowUp: ev.borrowUp, squeeze: ev.squeeze };
  }

  function sector(M, rng) {
    var e = pickWeighted(rng, SECTOR);
    return { kind: "sector", title: e.title, shock: e.shock, syms: [] };
  }

  function commodity(M, rng, month) {
    var e = pickWeighted(rng, COMMODITY, function (x) { return !x.months || x.months.indexOf(month) >= 0; });
    return { kind: "commodity", title: e.title, shock: e.shock, syms: Object.keys(e.shock.commodities || {}) };
  }

  // regimeScore: +1 in booms/recoveries, −1 in recessions.
  function market(M, rng, regimeScore) {
    var e = pickWeighted(rng, MARKET, null, true, regimeScore);
    return { kind: "market", title: e.title, shock: e.shock, syms: ["US500"] };
  }

  function crypto(M, rng) {
    var e = pickWeighted(rng, CRYPTO).make(M, rng);
    e.kind = "crypto";
    return e;
  }

  return {
    company: company, sector: sector, commodity: commodity, market: market, crypto: crypto,
    drug: drug, BANKS: BANKS, nm: nm, money: money,
    // Expected counts per trading day (company events are per stock per year).
    RATES: { companyPerStockYear: 0.7, sector: 5 / 252, commodity: 5 / 252, market: 2.5 / 252, crypto: 8 / 252 }
  };
});
