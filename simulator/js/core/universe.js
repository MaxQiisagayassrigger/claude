/*
 * The tradable universe. Everything is fictional and generated from a fixed
 * seed, so every game uses the same 552 companies. The game's own seed then
 * decides how prices evolve.
 *
 * Sector sizes, multiples, betas and dividend habits are set to resemble the
 * US large-cap market: a handful of trillion-dollar tech names at the top, a
 * long tail of $5–20B companies, high-yielding utilities and REITs, and
 * unprofitable biotech.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rng.js"));
  else { root.BSX = root.BSX || {}; root.BSX.Universe = factory(root.BSX.Rng); }
})(typeof self !== "undefined" ? self : this, function (Rng) {
  "use strict";

  var UNIVERSE_SEED = "broad-street-universe-v1";

  /* ------------------------------------------------------------------ */
  /* Sectors                                                             */
  /* ------------------------------------------------------------------ */
  // beta: market beta · sig: idiosyncratic vol · sigS: sector-factor vol ·
  // rateDur: price sensitivity to the 10-yr yield · oil: beta to crude ·
  // cyc: cyclicality (earnings & drift sensitivity to the cycle) ·
  // pe: typical P/E · div: typical dividend yield · payers: share paying one.
  var SECTORS = [
    { id: "tech", name: "Information Technology", short: "Tech", n: 80, beta: 1.2, sig: 0.22, sigS: 0.13, rateDur: 5, oil: -0.03, cyc: 1.3, pe: 31, div: 0.008, payers: 0.55, growth: 0.14,
      industries: [
        ["Semiconductors", 16, ["Semiconductor", "Micro", "Silicon", "Microdevices", "Photonics"], ["designs GPUs and accelerators for AI data centers", "makes analog and power-management chips for cars and factories", "produces memory and storage chips", "designs RF and connectivity chips for phones", "builds custom silicon for hyperscale cloud providers"]],
        ["Software", 24, ["Software", "Systems", "Cloud", "Data", "Logic", "Analytics", "Cyber"], ["sells cloud software for finance and HR teams", "provides cybersecurity software for enterprises", "runs a data and analytics platform", "makes design and engineering software", "offers developer tools and AI coding platforms", "sells customer-relationship software to mid-size businesses"]],
        ["IT Services", 8, ["Consulting", "Technologies", "Digital", "Solutions"], ["provides IT consulting and outsourcing", "runs digital transformation projects for large companies"]],
        ["Hardware & Storage", 10, ["Computing", "Devices", "Storage", "Hardware"], ["builds servers for AI workloads", "makes enterprise storage systems", "sells laptops, phones and wearables"]],
        ["Semiconductor Equipment", 8, ["Instruments", "Lithography", "Process Systems", "Wafer Tech"], ["makes wafer fabrication equipment", "builds chip inspection and metrology tools"]],
        ["Electronic Components", 7, ["Electronics", "Components", "Sensors", "Connectors"], ["makes connectors and sensors for cars and data centers", "produces passive components and circuit boards"]],
        ["Networking", 7, ["Networks", "Optical", "Wireless", "Communications"], ["sells high-speed data-center switches", "makes optical transceivers for AI clusters", "provides enterprise networking gear"]]
      ] },
    { id: "comms", name: "Communication Services", short: "Comms", n: 30, beta: 1.05, sig: 0.2, sigS: 0.12, rateDur: 3, oil: -0.03, cyc: 1.1, pe: 22, div: 0.01, payers: 0.5, growth: 0.1,
      industries: [
        ["Interactive Media", 9, ["Media", "Social", "Search", "Interactive"], ["runs a search engine and online ad network", "operates social networks funded by advertising", "runs an online video platform"]],
        ["Telecom", 8, ["Telecom", "Broadband", "Mobile", "Communications"], ["provides wireless and fiber broadband service", "operates a national mobile network"]],
        ["Entertainment", 9, ["Entertainment", "Studios", "Games", "Streaming"], ["streams films and series to subscribers", "publishes video games", "owns film studios and theme parks"]],
        ["Advertising & Publishing", 4, ["Media Group", "Publishing", "Advertising"], ["runs advertising agencies", "publishes newspapers and digital media"]]
      ] },
    { id: "consdisc", name: "Consumer Discretionary", short: "Cons. Disc.", n: 58, beta: 1.2, sig: 0.22, sigS: 0.12, rateDur: 3, oil: -0.12, cyc: 1.4, pe: 25, div: 0.01, payers: 0.55, growth: 0.09,
      industries: [
        ["Internet Retail", 7, ["Commerce", "Marketplace", "Online"], ["runs an online marketplace and cloud business", "operates a food and grocery delivery app", "runs an online travel booking site"]],
        ["Automobiles", 6, ["Motors", "Automotive", "EV"], ["builds electric vehicles and batteries", "makes trucks and SUVs"]],
        ["Auto Parts", 5, ["Auto Parts", "Drivetrain"], ["supplies drivetrain and braking systems", "sells replacement auto parts"]],
        ["Homebuilders", 6, ["Homes", "Builders", "Communities"], ["builds single-family homes in the Sun Belt", "develops master-planned communities"]],
        ["Restaurants", 8, ["Restaurants", "Grill", "Kitchen", "Coffee"], ["runs a chain of fast-casual restaurants", "operates coffee shops nationwide", "franchises burger restaurants"]],
        ["Hotels & Leisure", 8, ["Hotels", "Resorts", "Cruise Lines", "Travel"], ["operates hotels and resorts", "runs a cruise line", "operates casinos and sports betting"]],
        ["Apparel & Luxury", 8, ["Apparel", "Outfitters", "Footwear", "Brands"], ["designs athletic footwear and apparel", "sells luxury handbags and accessories"]],
        ["Specialty Retail", 10, ["Retail", "Stores", "Home Improvement", "Outlet"], ["runs home-improvement warehouse stores", "operates off-price apparel stores", "sells auto parts and accessories"]]
      ] },
    { id: "fin", name: "Financials", short: "Financials", n: 78, beta: 1.1, sig: 0.15, sigS: 0.12, rateDur: -3, oil: 0, cyc: 1.3, pe: 15, div: 0.022, payers: 0.9, growth: 0.07,
      industries: [
        ["Banks", 24, ["Bancorp", "Bank", "Financial", "Bankshares"], ["is a money-center bank with trading and wealth units", "runs a regional bank across the Midwest", "operates community banks in the Southeast", "is a commercial bank focused on tech startups"]],
        ["Insurance", 16, ["Insurance", "Assurance", "Mutual", "Re"], ["sells property and casualty insurance", "provides life insurance and annuities", "writes reinsurance for catastrophe risk"]],
        ["Capital Markets", 16, ["Capital", "Securities", "Asset Management", "Partners"], ["runs an investment bank and brokerage", "manages mutual funds and ETFs", "operates stock and derivatives exchanges", "manages private equity and credit funds"]],
        ["Payments & Fintech", 12, ["Pay", "Payments", "Card Services", "Fintech"], ["runs a card payment network", "processes merchant payments", "offers a consumer payments app"]],
        ["Consumer Finance", 10, ["Credit", "Lending", "Finance"], ["issues credit cards", "makes auto and personal loans"]],
        ["Diversified Financials", 0, ["Holdings", "Group"], ["owns insurance, rail and energy businesses"]]
      ] },
    { id: "health", name: "Health Care", short: "Health Care", n: 70, beta: 0.8, sig: 0.2, sigS: 0.1, rateDur: 2, oil: 0, cyc: 0.6, pe: 22, div: 0.016, payers: 0.55, growth: 0.07,
      industries: [
        ["Pharmaceuticals", 14, ["Pharmaceuticals", "Pharma", "Laboratories"], ["sells obesity and diabetes drugs", "develops cancer and immunology drugs", "makes vaccines and generic medicines"]],
        ["Biotechnology", 20, ["Therapeutics", "Bio", "Biosciences", "Genomics", "Oncology"], ["develops gene therapies for rare diseases", "is testing a late-stage Alzheimer's drug", "develops antibody treatments for cancer", "builds RNA-based medicines"]],
        ["Medical Devices", 14, ["Medical", "Surgical", "Scientific", "Cardio", "Ortho"], ["makes surgical robots", "sells heart valves and cardiac devices", "makes orthopedic implants", "sells continuous glucose monitors"]],
        ["Managed Care", 7, ["Health", "Healthcare", "Care Group"], ["runs health insurance plans", "manages Medicare Advantage plans"]],
        ["Life Sciences Tools", 8, ["Life Sciences", "Diagnostics", "BioTools"], ["sells lab instruments and reagents", "runs diagnostic testing labs"]],
        ["Health Care Services", 7, ["Health Services", "Clinics", "Pharmacy"], ["operates hospitals and clinics", "runs a pharmacy-benefit manager"]]
      ] },
    { id: "indust", name: "Industrials", short: "Industrials", n: 82, beta: 1.05, sig: 0.17, sigS: 0.09, rateDur: 1, oil: -0.08, cyc: 1.2, pe: 22, div: 0.015, payers: 0.8, growth: 0.07,
      industries: [
        ["Aerospace & Defense", 12, ["Aerospace", "Defense", "Dynamics", "Avionics"], ["builds commercial jets and engines", "makes missiles and defense electronics", "supplies avionics and cabin systems"]],
        ["Machinery", 14, ["Machinery", "Equipment", "Industries"], ["makes construction and mining equipment", "sells farm machinery", "makes pumps, valves and motion controls"]],
        ["Transportation", 14, ["Freight", "Logistics", "Rail", "Airlines", "Trucking"], ["operates a freight railroad", "runs a passenger airline", "provides parcel delivery and logistics", "operates a trucking fleet"]],
        ["Building Products", 10, ["Building Products", "Windows", "Climate"], ["makes HVAC and climate systems", "makes windows, doors and roofing"]],
        ["Electrical Equipment", 12, ["Electric", "Power Systems", "Grid"], ["makes transformers and switchgear for data centers", "builds gas turbines and grid equipment"]],
        ["Industrial Services", 12, ["Services", "Staffing", "Environmental"], ["provides waste collection and recycling", "runs staffing and payroll services", "rents construction equipment"]],
        ["Conglomerates", 8, ["Industries", "Holdings", "Group"], ["owns industrial, aerospace and automation businesses"]]
      ] },
    { id: "staples", name: "Consumer Staples", short: "Staples", n: 38, beta: 0.6, sig: 0.14, sigS: 0.08, rateDur: 3, oil: -0.05, cyc: 0.4, pe: 21, div: 0.027, payers: 0.95, growth: 0.04,
      industries: [
        ["Food Products", 9, ["Foods", "Farms", "Brands", "Bakery"], ["makes packaged snacks and cereals", "processes meat and poultry"]],
        ["Beverages", 7, ["Beverage", "Brewing", "Spirits", "Bottling"], ["sells soft drinks worldwide", "brews beer and distills spirits"]],
        ["Household Products", 6, ["Household", "Home Products"], ["makes detergents, diapers and paper goods"]],
        ["Food & Staples Retail", 9, ["Market", "Grocers", "Wholesale", "Supermarkets"], ["runs discount supercenters", "operates membership warehouse clubs", "runs regional supermarkets"]],
        ["Tobacco", 3, ["Tobacco"], ["sells cigarettes and nicotine pouches"]],
        ["Personal Care", 4, ["Beauty", "Personal Care", "Cosmetics"], ["sells cosmetics and skincare"]]
      ] },
    { id: "energy", name: "Energy", short: "Energy", n: 28, beta: 0.95, sig: 0.18, sigS: 0.17, rateDur: 0, oil: 0.55, cyc: 1.0, pe: 12, div: 0.034, payers: 0.95, growth: 0.03,
      industries: [
        ["Integrated Oil & Gas", 4, ["Petroleum", "Oil", "Energy"], ["produces, refines and sells oil and gas worldwide"]],
        ["Exploration & Production", 11, ["Resources", "Exploration", "Oil & Gas"], ["drills for oil in the Permian Basin", "produces natural gas in Appalachia"]],
        ["Oilfield Services", 5, ["Drilling", "Oilfield Services", "Offshore"], ["provides drilling rigs and oilfield services"]],
        ["Midstream", 5, ["Pipeline", "Midstream"], ["operates oil and gas pipelines", "exports liquefied natural gas"]],
        ["Refining", 3, ["Refining", "Fuels"], ["refines crude into gasoline and diesel"]]
      ] },
    { id: "utils", name: "Utilities", short: "Utilities", n: 30, beta: 0.5, sig: 0.11, sigS: 0.1, rateDur: 7, oil: 0, cyc: 0.3, pe: 18, div: 0.034, payers: 1, growth: 0.05,
      industries: [
        ["Electric Utilities", 14, ["Electric", "Power", "Energy"], ["supplies electricity across the Southeast", "operates nuclear and gas power plants"]],
        ["Gas Utilities", 5, ["Gas", "Natural Gas"], ["distributes natural gas to homes"]],
        ["Multi-Utilities", 6, ["Utilities", "Energy Group"], ["provides electricity and gas in the Northeast"]],
        ["Water Utilities", 2, ["Water"], ["supplies drinking water and wastewater service"]],
        ["Renewables", 3, ["Renewables", "Solar", "Wind"], ["develops solar and wind farms"]]
      ] },
    { id: "realest", name: "Real Estate", short: "Real Estate", n: 30, beta: 0.85, sig: 0.14, sigS: 0.11, rateDur: 8, oil: 0, cyc: 0.8, pe: 34, div: 0.037, payers: 1, growth: 0.04,
      industries: [
        ["Data Center REITs", 3, ["Data Centers", "Datacenter Trust"], ["owns data centers leased to cloud providers"]],
        ["Industrial REITs", 4, ["Logistics Trust", "Industrial Realty"], ["owns warehouses near big cities"]],
        ["Residential REITs", 5, ["Residential", "Apartment Communities"], ["owns apartment communities"]],
        ["Retail REITs", 5, ["Retail Properties", "Shopping Centers"], ["owns shopping centers and malls"]],
        ["Office REITs", 3, ["Office Properties"], ["owns office towers in major cities"]],
        ["Health Care REITs", 3, ["Healthcare Properties"], ["owns senior housing and medical offices"]],
        ["Tower REITs", 3, ["Towers"], ["owns cell towers leased to carriers"]],
        ["Storage REITs", 2, ["Storage Trust"], ["owns self-storage facilities"]],
        ["Real Estate Services", 2, ["Realty", "Real Estate Services"], ["brokers and manages commercial property"]]
      ] },
    { id: "materials", name: "Materials", short: "Materials", n: 28, beta: 1.05, sig: 0.18, sigS: 0.12, rateDur: 1, oil: 0.1, cyc: 1.2, pe: 18, div: 0.02, payers: 0.85, growth: 0.05,
      industries: [
        ["Chemicals", 9, ["Chemical", "Chemicals", "Specialty Chemicals"], ["makes industrial gases", "produces specialty chemicals and coatings"]],
        ["Metals & Mining", 8, ["Mining", "Metals", "Steel", "Copper"], ["mines copper and gold", "makes steel from scrap in electric furnaces"]],
        ["Construction Materials", 4, ["Aggregates", "Cement"], ["produces crushed stone and cement"]],
        ["Packaging", 4, ["Packaging", "Containers", "Paper"], ["makes cans, boxes and containers"]],
        ["Fertilizers", 3, ["Agri", "Fertilizer", "Crop Nutrients"], ["produces nitrogen and potash fertilizers"]]
      ] }
  ];

  var ROOTS = ("Apex Beacon Cedar Summit Harbor Northwind Keystone Meridian Pinnacle Redwood Sterling Atlas Bluewater Cascade Crescent " +
    "Evergreen Frontier Granite Horizon Ironwood Juniper Liberty Magnolia Northstar Oakmont Pacifica Ridgeline Sagebrush Tidewater " +
    "Valor Westbrook Zenith Aldridge Amberly Anchor Arbor Ardent Argent Ascent Aspen Aurora Axiom Bayview Bellwether Birchwood " +
    "Blackstone Bluebird Boulder Bramble Brightwater Brookfield Canyon Capstone Cardinal Carver Castle Centennial Chesapeake Cinder " +
    "Clearwater Cobalt Colfax Comet Compass Concord Copperline Corona Cortland Crestview Cypress Dakota Delta Denali Driftwood Eastgate " +
    "Echo Elkhorn Ember Emerald Falcon Fieldstone Firefly Flagstaff Flint Foxglove Galena Garnet Gateway Glacier Goldcrest Greystone " +
    "Halcyon Hawthorne Heartland Helix Heron Highpoint Hollis Hudson Huron Indigo Iris Jasper Kestrel Kingsley Lakeshore Lancaster " +
    "Landmark Larkspur Laurel Lighthouse Linden Lodestar Lynx Mariner Marlow Meadow Mercer Mesa Midland Millstone Monarch Mosaic " +
    "Mountaineer Nautilus Newport Noble Nova Oakridge Obsidian Onyx Orchard Osprey Palisade Paragon Pathfinder Peregrine Pioneer " +
    "Polaris Prairie Prospect Quantum Quarry Radiant Rainier Raven Regent Riverbend Rockport Rosewood Sable Salem Sapphire Saratoga " +
    "Sentinel Sequoia Shoreline Sierra Silverline Skyline Solstice Sonora Spire Starling Stonegate Sunrise Sycamore Talon Tamarack " +
    "Terra Thistle Timberline Topaz Trident Trillium Tundra Twin Peaks Unity Vantage Velocity Verdant Vertex Vista Wabash Walden " +
    "Waverly Whitmore Wildwood Willow Windham Wolverine Yarrow Yukon Zephyr Alder Bastion Beaconsfield Bristol Calloway Camden " +
    "Chandler Clayton Corvus Dorian Everett Fairmont Gideon Hamilton Ingram Kendall Langley Monroe Norwood Oberlin Prescott Quincy " +
    "Rutherford Sheridan Thornton Upton Vaughn Whitfield Ashford Brandt Caldwell Darrow Ellison Fenwick Garrison Holloway Irvine " +
    "Jeffers Kinsley Lowell Merritt Nash Orion Pembroke Radford Stratton Tolland Vale Winslow Arcadia Bayridge Coastal Dunmore " +
    "Everly Fox River Great Plains High Desert Iron Range Lone Star Old Harbor Red Rock Silver Creek Three Rivers").split(" ");
  // Two-word roots are joined back.
  (function joinTwoWord() {
    var joins = { "Twin": "Peaks", "Fox": "River", "Great": "Plains", "High": "Desert", "Iron": "Range", "Lone": "Star", "Old": "Harbor", "Red": "Rock", "Silver": "Creek", "Three": "Rivers" };
    var out = [];
    for (var i = 0; i < ROOTS.length; i++) {
      if (joins[ROOTS[i]] && ROOTS[i + 1] === joins[ROOTS[i]]) { out.push(ROOTS[i] + " " + ROOTS[i + 1]); i++; }
      else out.push(ROOTS[i]);
    }
    ROOTS = out;
  })();

  var CITIES = ["New York, NY", "San Jose, CA", "Seattle, WA", "Austin, TX", "Boston, MA", "Chicago, IL", "Atlanta, GA", "Dallas, TX",
    "Houston, TX", "Denver, CO", "Phoenix, AZ", "Charlotte, NC", "Minneapolis, MN", "Columbus, OH", "Pittsburgh, PA", "San Diego, CA",
    "Los Angeles, CA", "Nashville, TN", "Raleigh, NC", "Salt Lake City, UT", "Miami, FL", "Tampa, FL", "Detroit, MI", "St. Louis, MO",
    "Kansas City, MO", "Cincinnati, OH", "Milwaukee, WI", "Portland, OR", "Richmond, VA", "Omaha, NE", "Indianapolis, IN", "Oklahoma City, OK",
    "Palo Alto, CA", "Stamford, CT", "Newark, NJ", "Baltimore, MD", "Philadelphia, PA", "Cleveland, OH", "Boise, ID", "Tulsa, OK"];

  /* ------------------------------------------------------------------ */
  /* Stocks                                                              */
  /* ------------------------------------------------------------------ */
  function makeTicker(rng, name, noun, taken, preferLen) {
    var letters = (name + " " + noun).toUpperCase().replace(/[^A-Z ]/g, "");
    var words = letters.split(" ").filter(Boolean);
    var cands = [];
    var w0 = words[0], w1 = words[1] || "";
    var cons = function (w) { return w[0] + w.slice(1).replace(/[AEIOU]/g, ""); };
    cands.push(w0.slice(0, preferLen));
    cands.push(cons(w0).slice(0, preferLen));
    if (w1) {
      cands.push((w0.slice(0, preferLen - 1) + w1[0]));
      cands.push((cons(w0).slice(0, preferLen - 1) + w1[0]));
      cands.push((w0.slice(0, 2) + w1.slice(0, preferLen - 2)));
      cands.push((w0[0] + w1.slice(0, preferLen - 1)));
    }
    cands.push(w0.slice(0, 4));
    cands.push(cons(w0).slice(0, 4));
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (c.length >= 2 && c.length <= 4 && !taken[c]) return c;
    }
    // Random picks of later letters, keeping the first.
    var pool = letters.replace(/ /g, "");
    for (var k = 0; k < 400; k++) {
      var len = k < 200 ? preferLen : 4;
      var t = pool[0];
      var idx = 0;
      while (t.length < len) {
        idx = Math.min(pool.length - 1, idx + 1 + Math.floor(rng.next() * 3));
        t += pool[idx];
        if (idx === pool.length - 1 && t.length < len) t += String.fromCharCode(65 + Math.floor(rng.next() * 26));
      }
      if (!taken[t]) return t;
    }
    throw new Error("ticker space exhausted for " + name);
  }

  // Market-wide cap curve (log-interpolated anchors, rank -> $), shaped like
  // the US large-cap market in 2026: ~35% of value in the top 10.
  var CAP_ANCHORS = [[1, 4.4e12], [2, 3.9e12], [3, 3.4e12], [5, 2.3e12], [8, 1.4e12], [10, 1.05e12], [20, 5.8e11], [50, 2.5e11],
    [100, 1.25e11], [200, 5.8e10], [300, 3.4e10], [400, 2.2e10], [500, 1.3e10], [552, 3.5e9]];
  function capAtRank(r) {
    for (var i = 1; i < CAP_ANCHORS.length; i++) {
      var a = CAP_ANCHORS[i - 1], b = CAP_ANCHORS[i];
      if (r <= b[0]) {
        var t = (Math.log(r) - Math.log(a[0])) / (Math.log(b[0]) - Math.log(a[0]));
        return Math.exp(Math.log(a[1]) + t * (Math.log(b[1]) - Math.log(a[1])));
      }
    }
    return CAP_ANCHORS[CAP_ANCHORS.length - 1][1];
  }
  // Share of total market value by sector (approx. S&P 500 weights).
  var SECTOR_WEIGHT = { tech: 0.33, comms: 0.1, consdisc: 0.105, fin: 0.13, health: 0.095, indust: 0.085, staples: 0.055, energy: 0.032, utils: 0.025, realest: 0.021, materials: 0.019 };
  // Largest plausible company per sector (no $700B water utility).
  var SECTOR_MAX_CAP = { tech: 5e12, comms: 3e12, consdisc: 3e12, fin: 1.2e12, health: 1.1e12, indust: 4e11, staples: 8e11, energy: 6e11, utils: 2e11, realest: 2.5e11, materials: 2.5e11 };
  var TOP_TEN = ["tech", "tech", "tech", "comms", "consdisc", "tech", "comms", "consdisc", "fin", "health"];

  function generateStocks(rng, taken) {
    var stocks = [];
    var usedNames = {};
    var rootUse = {};
    var rootsShuffled = rng.shuffle(ROOTS.slice());
    var rootIdx = 0;
    function nextRoot() {
      for (var tries = 0; tries < ROOTS.length * 3; tries++) {
        var r = rootsShuffled[rootIdx++ % rootsShuffled.length];
        if ((rootUse[r] || 0) < 2) { rootUse[r] = (rootUse[r] || 0) + 1; return r; }
      }
      return rng.pick(ROOTS);
    }

    // 1. Caps by rank, then a sector for each rank. Each rank goes to a
    //    sector in proportion to how far that sector is below its target
    //    share of market value, so sector sizes land near SECTOR_WEIGHT and
    //    the sectors with many small companies (utilities, REITs) fill the tail.
    var total = SECTORS.reduce(function (a, sec) { return a + sec.n; }, 0);
    var caps = [], totalCap = 0, r;
    for (r = 1; r <= total; r++) { var c = capAtRank(r) * (r <= 3 ? 1 : rng.lognormal(0, 0.12)); caps.push(c); totalCap += c; }
    caps.sort(function (a, b) { return b - a; });
    var left = {}, got = {};
    SECTORS.forEach(function (sec) { left[sec.id] = sec.n; got[sec.id] = 0; });
    var rankSector = [];
    for (r = 0; r < total; r++) {
      var pickId = r < TOP_TEN.length ? TOP_TEN[r] : null;
      if (!pickId) {
        var pairs = SECTORS.filter(function (sec) { return left[sec.id] > 0 && caps[r] <= SECTOR_MAX_CAP[sec.id]; }).map(function (sec) {
          var deficit = Math.max(0, SECTOR_WEIGHT[sec.id] * totalCap - got[sec.id]);
          // Keep a little probability for every sector so none is starved.
          return [sec.id, deficit / totalCap + 0.002 * left[sec.id] / sec.n];
        });
        pickId = rng.weighted(pairs);
      }
      left[pickId]--; got[pickId] += caps[r];
      rankSector.push(pickId);
    }

    // 2. Within each sector, hand the biggest slots to the industries that
    //    are biggest in real life, then build each company.
    SECTORS.forEach(function (sec) {
      var myCaps = [];
      rankSector.forEach(function (id, i) { if (id === sec.id) myCaps.push(caps[i]); });
      var slots = [];
      sec.industries.forEach(function (ind) { for (var i = 0; i < ind[1]; i++) slots.push(ind); });
      var diversified = sec.industries.filter(function (ind) { return ind[1] === 0; })[0];
      slots = rng.shuffle(slots).slice(0, sec.n - (diversified ? 1 : 0));
      var bigFirst = { tech: ["Semiconductors", "Software", "Hardware & Storage"], comms: ["Interactive Media"], consdisc: ["Internet Retail", "Automobiles"], health: ["Pharmaceuticals", "Managed Care"], fin: ["Banks", "Payments & Fintech"], staples: ["Food & Staples Retail", "Beverages", "Household Products"], energy: ["Integrated Oil & Gas"], utils: ["Electric Utilities"], realest: ["Tower REITs", "Industrial REITs", "Data Center REITs"], materials: ["Chemicals"], indust: ["Aerospace & Defense", "Electrical Equipment", "Machinery", "Transportation"] }[sec.id] || [];
      var favoured = slots.filter(function (s) { return bigFirst.indexOf(s[0]) >= 0; });
      var rest = slots.filter(function (s) { return bigFirst.indexOf(s[0]) < 0; });
      var order = [];
      if (diversified) order.push(diversified);
      var fi = 0, ri = 0;
      while (order.length < sec.n) {
        var k = order.length;
        var takeFav = fi < favoured.length && (k < 5 || ri >= rest.length || rng.next() < 0.4);
        order.push(takeFav ? favoured[fi++] : rest[ri++]);
      }

      order.forEach(function (ind, i) {
        var cap = myCaps[i];
        var noun = rng.pick(ind[2]);
        var root = nextRoot();
        var base = root + " " + noun;
        var guard = 0;
        while (usedNames[base] && guard++ < 50) { root = nextRoot(); base = root + " " + noun; }
        usedNames[base] = 1;
        var suffix = /Trust|Bancorp|Bankshares|Group|Holdings|Partners|Mutual|Re$|Industries/.test(noun) ? "" : rng.pick([" Inc.", " Corp.", " Inc.", " Holdings", " Co.", " Group", " Inc."]);
        var bigCap = cap > 2e11;
        var ticker = makeTicker(rng, root, noun, taken, bigCap || rng.next() < 0.3 ? 3 : 4);
        taken[ticker] = 1;

        var isBio = ind[0] === "Biotechnology";
        var sizeFactor = 1 + 0.2 * Math.log10(Math.max(1, 1e12 / cap)); // small caps are more volatile
        var sig = sec.sig * sizeFactor * rng.lognormal(0, 0.18) * (isBio ? 1.8 : 1) * (ind[0] === "Automobiles" ? 1.4 : 1);
        var beta = Math.max(0.25, Math.min(2.4, sec.beta + 0.22 * rng.gauss() + 0.1 * (sizeFactor - 1.3)));
        var price;
        if (cap > 5e11) price = rng.lognormal(Math.log(240), 0.5);
        else price = rng.lognormal(Math.log(85), 0.75);
        price = Math.max(6, Math.min(950, price));
        var unprofitable = isBio ? rng.chance(0.5) : (cap < 2e10 && rng.chance(ind[0] === "Automobiles" || ind[0] === "Software" ? 0.3 : 0.04));
        var pe = sec.pe * rng.lognormal(0, 0.3) * (cap > 5e11 ? 1.1 : 1) * (isBio ? 1.4 : 1);
        var eps = unprofitable ? -price * rng.range(0.02, 0.12) : price / pe;
        var pays = !unprofitable && rng.chance(Math.min(1, sec.payers * (cap > 5e10 ? 1.1 : 0.9)));
        var dy = pays ? Math.max(0.002, sec.div * rng.lognormal(0, 0.35)) : 0;
        var htb = rng.chance(cap < 3e10 ? 0.06 : 0.01);
        stocks.push({
          id: ticker,
          type: "stock",
          name: base + suffix,
          sector: sec.id,
          industry: ind[0],
          desc: base + suffix + " " + rng.pick(ind[3]) + ".",
          hq: rng.pick(CITIES),
          employees: Math.round(Math.max(150, 0.02 * Math.pow(cap, 0.55) * rng.lognormal(0, 0.5)) / 10) * 10,
          founded: rng.int(1880, 2016),
          cap0: cap,
          p0: Math.round(price * 100) / 100,
          shares: cap / price,
          beta: Math.round(beta * 100) / 100,
          sig: Math.round(sig * 1000) / 1000,
          eps: eps,
          growth: sec.growth + 0.05 * rng.gauss() + (isBio ? 0.1 : 0),
          dps: dy * price, // annual dividend per share
          divMonth: rng.int(0, 2), divDay: rng.int(3, 26),
          earnWeek: rng.int(2, 6), earnWd: rng.int(1, 4), earnAmc: rng.chance(0.55),
          borrow: htb ? rng.range(0.06, 0.55) : rng.range(0.0025, 0.006),
          shortInt: htb ? rng.range(0.14, 0.38) : rng.range(0.008, 0.07),
          turnover: rng.range(0.004, 0.012) * (sizeFactor > 1.5 ? 1.4 : 1)
        });
      });
    });
    stocks.sort(function (a, b) { return b.cap0 - a.cap0; });
    stocks.forEach(function (s, i) { s.rank0 = i + 1; });
    return stocks;
  }

  /* ------------------------------------------------------------------ */
  /* Indices & ETFs                                                      */
  /* ------------------------------------------------------------------ */
  // Index membership rules are applied by the market (it re-ranks by
  // market cap at each quarterly rebalance).
  var INDICES = [
    { id: "US500", name: "US 500 Index", rule: "top500", weight: "cap", base: 6500, desc: "The 500 largest companies by market cap. The benchmark for the whole market." },
    { id: "TECH100", name: "Tech 100 Index", rule: "tech100", weight: "cap", base: 23500, desc: "The 100 largest non-financial, non-utility, non-REIT companies. Heavy in technology and growth." },
    { id: "IND30", name: "Industrial 30 Average", rule: "blue30", weight: "price", base: 45000, desc: "30 blue-chip companies, price-weighted like the oldest US averages. A higher share price means a bigger weight." },
    { id: "SMALL200", name: "Small Cap 200 Index", rule: "small200", weight: "cap", base: 2400, desc: "The 200 smallest companies in the universe." },
    { id: "TOTAL", name: "Total Market Index", rule: "all", weight: "cap", base: 60000, desc: "Every listed company." },
    { id: "DIV50", name: "Dividend 50 Index", rule: "div50", weight: "equal", base: 1200, desc: "50 highest-yielding large companies, equal-weighted." }
  ];

  // kind: index | lev (daily-reset leveraged) | bond | commodity | crypto | vol
  var ETFS = [
    { id: "USFV", name: "US 500 Index Fund", kind: "index", track: "US500", scale: 0.1, er: 0.0003, desc: "Tracks the US 500 Index." },
    { id: "TCHQ", name: "Tech 100 Index Fund", kind: "index", track: "TECH100", scale: 0.025, er: 0.002, desc: "Tracks the Tech 100 Index." },
    { id: "BLUE", name: "Industrial 30 Fund", kind: "index", track: "IND30", scale: 0.01, er: 0.0016, desc: "Tracks the price-weighted Industrial 30 Average." },
    { id: "SMLL", name: "Small Cap 200 Fund", kind: "index", track: "SMALL200", scale: 0.1, er: 0.0019, desc: "Tracks the Small Cap 200 Index." },
    { id: "TOTL", name: "Total Market Fund", kind: "index", track: "TOTAL", scale: 0.005, er: 0.0003, desc: "Tracks every listed company." },
    { id: "DIVY", name: "Dividend 50 Fund", kind: "index", track: "DIV50", scale: 0.08, er: 0.0006, desc: "Equal-weighted high-dividend stocks." },
    { id: "XTEC", name: "Technology Sector Fund", kind: "index", track: "SEC:tech", scale: 1, er: 0.0009 },
    { id: "XCOM", name: "Communication Services Sector Fund", kind: "index", track: "SEC:comms", scale: 1, er: 0.0009 },
    { id: "XCND", name: "Consumer Discretionary Sector Fund", kind: "index", track: "SEC:consdisc", scale: 1, er: 0.0009 },
    { id: "XFIN", name: "Financials Sector Fund", kind: "index", track: "SEC:fin", scale: 1, er: 0.0009 },
    { id: "XHLT", name: "Health Care Sector Fund", kind: "index", track: "SEC:health", scale: 1, er: 0.0009 },
    { id: "XIND", name: "Industrials Sector Fund", kind: "index", track: "SEC:indust", scale: 1, er: 0.0009 },
    { id: "XSTP", name: "Consumer Staples Sector Fund", kind: "index", track: "SEC:staples", scale: 1, er: 0.0009 },
    { id: "XENR", name: "Energy Sector Fund", kind: "index", track: "SEC:energy", scale: 1, er: 0.0009 },
    { id: "XUTL", name: "Utilities Sector Fund", kind: "index", track: "SEC:utils", scale: 1, er: 0.0009 },
    { id: "XREA", name: "Real Estate Sector Fund", kind: "index", track: "SEC:realest", scale: 1, er: 0.0009 },
    { id: "XMAT", name: "Materials Sector Fund", kind: "index", track: "SEC:materials", scale: 1, er: 0.0009 },
    { id: "SEMI", name: "Semiconductor Industry Fund", kind: "index", track: "IND:Semiconductors", scale: 1, er: 0.0035 },
    { id: "SOFT", name: "Software Industry Fund", kind: "index", track: "IND:Software", scale: 1, er: 0.0035 },
    { id: "BIOT", name: "Biotech Industry Fund", kind: "index", track: "IND:Biotechnology", scale: 1, er: 0.0035 },
    { id: "BANK", name: "Bank Industry Fund", kind: "index", track: "IND:Banks", scale: 1, er: 0.0035 },
    { id: "HOMZ", name: "Homebuilders Industry Fund", kind: "index", track: "IND:Homebuilders", scale: 1, er: 0.0035 },
    { id: "UPR3", name: "US 500 3x Bull", kind: "lev", track: "US500", lev: 3, p0: 90, er: 0.0091, desc: "Three times the daily return of the US 500. Resets daily, so returns over longer periods drift from 3x." },
    { id: "UPR2", name: "US 500 2x Bull", kind: "lev", track: "US500", lev: 2, p0: 110, er: 0.0089 },
    { id: "USH1", name: "US 500 Short", kind: "lev", track: "US500", lev: -1, p0: 40, er: 0.0089, desc: "The inverse of the US 500's daily return." },
    { id: "SPX3", name: "US 500 3x Bear", kind: "lev", track: "US500", lev: -3, p0: 25, er: 0.0095 },
    { id: "TQX3", name: "Tech 100 3x Bull", kind: "lev", track: "TECH100", lev: 3, p0: 85, er: 0.0084 },
    { id: "TQS3", name: "Tech 100 3x Bear", kind: "lev", track: "TECH100", lev: -3, p0: 20, er: 0.0095 },
    { id: "SMX3", name: "Small Cap 3x Bull", kind: "lev", track: "SMALL200", lev: 3, p0: 45, er: 0.0099 },
    { id: "SMC3", name: "Semiconductor 3x Bull", kind: "lev", track: "IND:Semiconductors", lev: 3, p0: 35, er: 0.0098 },
    { id: "SMS3", name: "Semiconductor 3x Bear", kind: "lev", track: "IND:Semiconductors", lev: -3, p0: 18, er: 0.0098 },
    { id: "TBIL", name: "0–3 Month T-Bill Fund", kind: "bond", tenor: 0.15, credit: "ust", p0: 50, er: 0.0015, desc: "Treasury bills. Close to cash; pays about the Fed funds rate." },
    { id: "SHRT", name: "1–3 Year Treasury Fund", kind: "bond", tenor: 1.9, credit: "ust", p0: 82, er: 0.0015 },
    { id: "MIDT", name: "7–10 Year Treasury Fund", kind: "bond", tenor: 8, credit: "ust", p0: 95, er: 0.0015 },
    { id: "LONG", name: "20+ Year Treasury Fund", kind: "bond", tenor: 17, credit: "ust", p0: 88, er: 0.0015, desc: "Long Treasuries. About 16 years of duration, so a 1-point rise in yields costs about 16%." },
    { id: "AGGB", name: "Aggregate Bond Fund", kind: "bond", tenor: 6, credit: "agg", p0: 98, er: 0.0003 },
    { id: "CORP", name: "Investment Grade Corporate Fund", kind: "bond", tenor: 8, credit: "ig", p0: 108, er: 0.0014 },
    { id: "JUNK", name: "High Yield Corporate Fund", kind: "bond", tenor: 3.5, credit: "hy", p0: 79, er: 0.004 },
    { id: "MUNI", name: "National Municipal Bond Fund", kind: "bond", tenor: 6, credit: "muni", p0: 106, er: 0.0005 },
    { id: "TIPX", name: "Inflation-Protected Treasury Fund", kind: "bond", tenor: 6.5, credit: "tips", p0: 109, er: 0.0019, desc: "TIPS: principal rises with CPI. Price moves with real yields." },
    { id: "LNG3", name: "20+ Year Treasury 3x Bull", kind: "lev", track: "ETF:LONG", lev: 3, p0: 42, er: 0.0098 },
    { id: "LNS3", name: "20+ Year Treasury 3x Bear", kind: "lev", track: "ETF:LONG", lev: -3, p0: 38, er: 0.0098 },
    { id: "GLDX", name: "Gold Trust", kind: "commodity", track: "GOLD", scale: 0.092, er: 0.004, spot: true },
    { id: "SLVX", name: "Silver Trust", kind: "commodity", track: "SILVER", scale: 0.93, er: 0.005, spot: true },
    { id: "OILX", name: "Oil Futures Fund", kind: "commodity", track: "WTI", scale: 1, er: 0.006, desc: "Holds front-month crude futures and rolls monthly. Contango makes it lag spot oil." },
    { id: "NGSX", name: "Natural Gas Futures Fund", kind: "commodity", track: "NATGAS", scale: 4, er: 0.01, desc: "Holds front-month gas futures. Steep contango has eroded funds like this over time." },
    { id: "AGRX", name: "Agriculture Futures Fund", kind: "commodity", track: "AGRI", scale: 1, er: 0.0085 },
    { id: "CMDX", name: "Broad Commodity Fund", kind: "commodity", track: "BCOM", scale: 1, er: 0.0059 },
    { id: "ORBX", name: "Orbit Spot Trust", kind: "crypto", track: "ORB", scale: 0.0006, er: 0.0025, desc: "Holds Orbit coins. Trades like a stock, with options." },
    { id: "AETX", name: "Aether Spot Trust", kind: "crypto", track: "AETH", scale: 0.009, er: 0.0025 },
    { id: "VOLX", name: "Short-Term Volatility ETN", kind: "vol", p0: 42, er: 0.0089, desc: "Tracks 1-month volatility futures. Jumps in a selloff and bleeds in calm markets from futures roll." }
  ];

  /* ------------------------------------------------------------------ */
  /* Crypto                                                              */
  /* ------------------------------------------------------------------ */
  var CRYPTO = [
    { id: "ORB", name: "Orbit", p0: 88000, supply: 19.9e6, sig: 0.48, beta: 1.0, desc: "The original proof-of-work coin. Fixed supply; treated as digital gold." },
    { id: "AETH", name: "Aether", p0: 3300, supply: 120.5e6, sig: 0.62, beta: 1.2, stake: 0.031, desc: "Smart-contract platform that hosts most decentralized finance apps." },
    { id: "SOLX", name: "Solex", p0: 165, supply: 540e6, sig: 0.8, beta: 1.4, stake: 0.068, desc: "High-throughput smart-contract chain." },
    { id: "TIDE", name: "Tide", p0: 2.35, supply: 58e9, sig: 0.78, beta: 1.2, desc: "Payments network for cross-border settlement." },
    { id: "HIVE", name: "Hive Token", p0: 610, supply: 146e6, sig: 0.55, beta: 1.0, desc: "Exchange token with fee discounts and quarterly burns." },
    { id: "LUMA", name: "Luma", p0: 0.72, supply: 36e9, sig: 0.9, beta: 1.3, stake: 0.045, desc: "Proof-of-stake chain for tokenized assets." },
    { id: "PAW", name: "Pawprint", p0: 0.21, supply: 148e9, sig: 1.2, beta: 1.6, desc: "Meme coin with a dog mascot. Moves on social media." },
    { id: "FROG", name: "Froggo", p0: 0.0000105, supply: 420e12, sig: 1.55, beta: 1.9, desc: "Meme coin. Extremely volatile." },
    { id: "NODE", name: "Nodechain", p0: 18.5, supply: 660e6, sig: 0.95, beta: 1.3, desc: "Oracle network that feeds off-chain data to smart contracts." },
    { id: "VOLT", name: "Voltaic", p0: 7.4, supply: 1.2e9, sig: 1.0, beta: 1.35, stake: 0.052, desc: "Layer-2 network that batches transactions." },
    { id: "ARCD", name: "Arcadia", p0: 0.95, supply: 6.5e9, sig: 1.1, beta: 1.4, desc: "Gaming and virtual-world token." },
    { id: "PRSM", name: "Prism", p0: 142, supply: 18e6, sig: 0.85, beta: 1.1, desc: "Privacy coin." },
    { id: "USDS", name: "SimDollar", p0: 1, supply: 165e9, stable: true, desc: "Dollar stablecoin backed by T-bills." },
    { id: "USDB", name: "Base Dollar", p0: 1, supply: 62e9, stable: true, desc: "Dollar stablecoin." }
  ];

  /* ------------------------------------------------------------------ */
  /* Commodities, FX                                                     */
  /* ------------------------------------------------------------------ */
  // mean: long-run level for mean reversion (null = no reversion) · kappa:
  // reversion speed per year · carry: annual contango of futures over spot
  // (negative = backwardation), mean-reverting around this value.
  var COMMODITIES = [
    { id: "WTI", name: "Crude Oil (WTI)", unit: "$/bbl", p0: 76, mean: 74, kappa: 0.8, sig: 0.34, carry: 0.04, group: "energy" },
    { id: "NATGAS", name: "Natural Gas", unit: "$/MMBtu", p0: 3.3, mean: 3.6, kappa: 1.4, sig: 0.55, carry: 0.22, group: "energy" },
    { id: "GOLD", name: "Gold", unit: "$/oz", p0: 3650, mean: null, kappa: 0, sig: 0.16, carry: 0.0, drift: 0.05, group: "metals" },
    { id: "SILVER", name: "Silver", unit: "$/oz", p0: 42, mean: null, kappa: 0, sig: 0.27, carry: 0.0, drift: 0.04, group: "metals" },
    { id: "COPPER", name: "Copper", unit: "$/lb", p0: 4.7, mean: 4.5, kappa: 0.4, sig: 0.24, carry: 0.01, group: "metals" },
    { id: "CORN", name: "Corn", unit: "$/bu", p0: 4.35, mean: 4.6, kappa: 1.0, sig: 0.26, carry: 0.06, group: "ags" },
    { id: "WHEAT", name: "Wheat", unit: "$/bu", p0: 5.6, mean: 6.0, kappa: 1.0, sig: 0.3, carry: 0.07, group: "ags" },
    { id: "SOY", name: "Soybeans", unit: "$/bu", p0: 10.6, mean: 11.2, kappa: 0.9, sig: 0.21, carry: 0.04, group: "ags" }
  ];
  // Composite indices used by commodity funds (weights on log returns).
  var COMMODITY_BASKETS = {
    AGRI: { name: "Agriculture Basket", p0: 26, w: { CORN: 0.35, WHEAT: 0.3, SOY: 0.35 } },
    BCOM: { name: "Broad Commodity Basket", p0: 21, w: { WTI: 0.25, NATGAS: 0.08, GOLD: 0.2, SILVER: 0.05, COPPER: 0.12, CORN: 0.1, WHEAT: 0.08, SOY: 0.12 } }
  };

  // Foreign policy rates drift slowly; `major` pairs get 50:1 leverage.
  var FX = [
    { id: "EURUSD", base: "EUR", quote: "USD", p0: 1.165, sig: 0.075, rate: 0.02, major: true, dollarBeta: -1 },
    { id: "USDJPY", base: "USD", quote: "JPY", p0: 147.5, sig: 0.095, rate: 0.005, major: true, dollarBeta: 1, haven: 1 },
    { id: "GBPUSD", base: "GBP", quote: "USD", p0: 1.345, sig: 0.08, rate: 0.0375, major: true, dollarBeta: -1 },
    { id: "USDCHF", base: "USD", quote: "CHF", p0: 0.795, sig: 0.08, rate: 0.0, major: true, dollarBeta: 1, haven: 0.7 },
    { id: "AUDUSD", base: "AUD", quote: "USD", p0: 0.66, sig: 0.1, rate: 0.036, major: true, dollarBeta: -1, risk: 1 },
    { id: "USDCAD", base: "USD", quote: "CAD", p0: 1.385, sig: 0.065, rate: 0.025, major: true, dollarBeta: 1, oil: -0.15 },
    { id: "NZDUSD", base: "NZD", quote: "USD", p0: 0.585, sig: 0.105, rate: 0.03, major: false, dollarBeta: -1, risk: 1 },
    { id: "USDMXN", base: "USD", quote: "MXN", p0: 18.6, sig: 0.12, rate: 0.0725, major: false, dollarBeta: 1, risk: -1.2 }
  ];

  /* ------------------------------------------------------------------ */
  /* Futures & perpetuals                                                */
  /* ------------------------------------------------------------------ */
  // cycle: "Q" quarterly (Mar/Jun/Sep/Dec) or "M" monthly. im/mm: initial
  // and maintenance margin as a share of notional at normal volatility.
  var FUTURES = [
    { root: "FUS", name: "US 500 Futures", und: "US500", mult: 50, tick: 0.25, cycle: "Q", im: 0.06, mm: 0.055, group: "Equity index" },
    { root: "MUS", name: "Micro US 500 Futures", und: "US500", mult: 5, tick: 0.25, cycle: "Q", im: 0.06, mm: 0.055, group: "Equity index" },
    { root: "FTQ", name: "Tech 100 Futures", und: "TECH100", mult: 20, tick: 0.25, cycle: "Q", im: 0.075, mm: 0.068, group: "Equity index" },
    { root: "FSC", name: "Small Cap 200 Futures", und: "SMALL200", mult: 50, tick: 0.1, cycle: "Q", im: 0.075, mm: 0.068, group: "Equity index" },
    { root: "CL", name: "Crude Oil Futures", und: "WTI", mult: 1000, tick: 0.01, cycle: "M", im: 0.1, mm: 0.09, group: "Energy" },
    { root: "NG", name: "Natural Gas Futures", und: "NATGAS", mult: 10000, tick: 0.001, cycle: "M", im: 0.17, mm: 0.155, group: "Energy" },
    { root: "GC", name: "Gold Futures", und: "GOLD", mult: 100, tick: 0.1, cycle: "M", im: 0.07, mm: 0.064, group: "Metals" },
    { root: "SI", name: "Silver Futures", und: "SILVER", mult: 5000, tick: 0.005, cycle: "M", im: 0.1, mm: 0.09, group: "Metals" },
    { root: "HG", name: "Copper Futures", und: "COPPER", mult: 25000, tick: 0.0005, cycle: "M", im: 0.08, mm: 0.072, group: "Metals" },
    { root: "ZC", name: "Corn Futures", und: "CORN", mult: 5000, tick: 0.0025, cycle: "M", im: 0.07, mm: 0.064, group: "Agriculture" },
    { root: "ZW", name: "Wheat Futures", und: "WHEAT", mult: 5000, tick: 0.0025, cycle: "M", im: 0.08, mm: 0.072, group: "Agriculture" },
    { root: "ZS", name: "Soybean Futures", und: "SOY", mult: 5000, tick: 0.0025, cycle: "M", im: 0.06, mm: 0.055, group: "Agriculture" },
    { root: "ZN", name: "10-Year T-Note Futures", und: "UST10", mult: 1000, tick: 0.015625, cycle: "Q", im: 0.022, mm: 0.02, group: "Interest rates" },
    { root: "ZB", name: "30-Year T-Bond Futures", und: "UST30", mult: 1000, tick: 0.03125, cycle: "Q", im: 0.04, mm: 0.036, group: "Interest rates" },
    { root: "ORF", name: "Orbit Futures", und: "ORB", mult: 5, tick: 5, cycle: "M", im: 0.35, mm: 0.32, group: "Crypto" }
  ];

  var PERPS = [
    { id: "ORB-PERP", und: "ORB", maxLev: 20 },
    { id: "AETH-PERP", und: "AETH", maxLev: 20 },
    { id: "SOLX-PERP", und: "SOLX", maxLev: 15 },
    { id: "TIDE-PERP", und: "TIDE", maxLev: 15 },
    { id: "HIVE-PERP", und: "HIVE", maxLev: 15 },
    { id: "PAW-PERP", und: "PAW", maxLev: 10 }
  ];

  /* ------------------------------------------------------------------ */
  /* Bonds                                                               */
  /* ------------------------------------------------------------------ */
  // Treasury auction buckets: original term in years, how often a new issue
  // is auctioned (months), zero-coupon bills vs coupon notes/bonds.
  var UST_BUCKETS = [
    { term: 0.25, label: "3-Month Bill", every: 1, bill: true },
    { term: 0.5, label: "6-Month Bill", every: 1, bill: true },
    { term: 1, label: "1-Year Bill", every: 1, bill: true },
    { term: 2, label: "2-Year Note", every: 1 },
    { term: 3, label: "3-Year Note", every: 3 },
    { term: 5, label: "5-Year Note", every: 1 },
    { term: 7, label: "7-Year Note", every: 3 },
    { term: 10, label: "10-Year Note", every: 3 },
    { term: 20, label: "20-Year Bond", every: 3 },
    { term: 30, label: "30-Year Bond", every: 3 }
  ];
  // Base credit spreads (decimal) in a normal market, by rating.
  var RATING_SPREAD = { AAA: 0.0045, AA: 0.006, A: 0.0085, BBB: 0.013, BB: 0.024, B: 0.038, CCC: 0.075 };
  var MUNIS = [
    { issuer: "Harbor City", kind: "General Obligation", rating: "AA", spread: 0.001 },
    { issuer: "Lakeshore County", kind: "Water & Sewer Revenue", rating: "AA", spread: 0.0015 },
    { issuer: "State Turnpike Authority", kind: "Toll Revenue", rating: "A", spread: 0.003 },
    { issuer: "Metro Transit District", kind: "Sales Tax Revenue", rating: "A", spread: 0.0035 },
    { issuer: "Central State University", kind: "Revenue", rating: "AA", spread: 0.0015 },
    { issuer: "Riverside Health System", kind: "Hospital Revenue", rating: "BBB", spread: 0.007 },
    { issuer: "Pine Valley School District", kind: "General Obligation", rating: "AA", spread: 0.0012 },
    { issuer: "Gulf Coast Port Authority", kind: "Revenue", rating: "A", spread: 0.004 }
  ];

  function generate() {
    var rng = new Rng(UNIVERSE_SEED);
    var taken = {};
    INDICES.forEach(function (x) { taken[x.id] = 1; });
    ETFS.forEach(function (x) { taken[x.id] = 1; });
    CRYPTO.forEach(function (x) { taken[x.id] = 1; });
    COMMODITIES.forEach(function (x) { taken[x.id] = 1; });
    FUTURES.forEach(function (x) { taken[x.root] = 1; });
    var stocks = generateStocks(rng, taken);

    // Corporate bond issuers: ~40 companies across sizes; ratings follow size.
    var issuers = [];
    var picks = rng.shuffle(stocks.filter(function (s) { return s.rank0 <= 400 && s.eps > 0; }).slice()).slice(0, 36);
    picks.forEach(function (s) {
      var r = s.rank0;
      var rating = r <= 15 ? rng.pick(["AAA", "AA", "AA", "A"]) : r <= 80 ? rng.pick(["AA", "A", "A", "BBB"]) : r <= 200 ? rng.pick(["A", "BBB", "BBB", "BB"]) : rng.pick(["BBB", "BB", "BB", "B", "B", "CCC"]);
      if (s.sector === "utils" && ["BB", "B", "CCC"].indexOf(rating) >= 0) rating = rng.pick(["A", "BBB"]);
      issuers.push({ ticker: s.id, rating: rating, bonds: rng.chance(0.4) ? 2 : 1 });
    });

    return {
      seed: UNIVERSE_SEED,
      sectors: SECTORS,
      stocks: stocks,
      indices: INDICES,
      etfs: ETFS,
      crypto: CRYPTO,
      commodities: COMMODITIES,
      baskets: COMMODITY_BASKETS,
      fx: FX,
      futures: FUTURES,
      perps: PERPS,
      ustBuckets: UST_BUCKETS,
      ratingSpread: RATING_SPREAD,
      corpIssuers: issuers,
      munis: MUNIS
    };
  }

  var cached = null;
  return {
    get: function () { return cached || (cached = generate()); },
    SECTORS: SECTORS
  };
});
