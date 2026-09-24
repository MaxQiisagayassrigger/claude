/*
 * Curated research snapshot — compiled 2026-09-24.
 *
 * Every hard number here was taken from a published report and carries a
 * `src` key pointing into SOURCES at the bottom of this file. Figures are
 * "as reported" by those outlets; they were not independently re-verified
 * against exchange data. Scores in WATCHLIST.factors are analyst judgement
 * (documented in the Methodology tab), not reported data.
 *
 * To refresh with raw market data (prices, 13F filings, FRED macro), run the
 * pipeline in /pipeline — it writes data/generated/dataset.js, which the site
 * picks up automatically.
 */
window.SNAPSHOT = {
  asOf: "2026-09-24",

  /* ------------------------------------------------------------------ */
  /* Headline tiles                                                      */
  /* ------------------------------------------------------------------ */
  headline: [
    { id: "spx", label: "S&P 500", value: "7,764.70", note: "+1.49% on the day, then −0.7% on Sep 23; ~1.1% below its August record", asOf: "mid-Sep 2026", src: "cnbc_nasdaq_record" },
    { id: "ndx", label: "Nasdaq Composite", value: "27,122.09", note: "Record close, first since June (AI rebound)", asOf: "mid-Sep 2026", src: "cnbc_nasdaq_record" },
    { id: "us10y", label: "10-yr Treasury", value: "5.10%", note: "Touched 5.13% intraday. Highest since 2007", asOf: "Sep 23", src: "cnbc_10y" },
    { id: "ff", label: "Fed funds target", value: "3.75–4.00%", note: "+25 bp on Sep 16. First hike since 2023", asOf: "Sep 16", src: "cnbc_fed" },
    { id: "cpi", label: "CPI (y/y)", value: "3.4%", note: "Core 2.4% y/y; gasoline +27.4% y/y", asOf: "Aug data", src: "cnbc_cpi" },
    { id: "brent", label: "Brent crude", value: "$101.59", note: "+2.4% on Sep 23; war-driven supply shock", asOf: "Sep 23", src: "gvwire_yields" },
    { id: "gold", label: "Gold", value: "$4,325", note: "Per oz", asOf: "Sep 14", src: "yahoo_cross_asset" },
    { id: "btc", label: "Bitcoin", value: "$84,477", note: "−2.0% on the day", asOf: "Sep 14", src: "yahoo_cross_asset" },
    { id: "vix", label: "VIX", value: "15.18", note: "Calm despite yield spike", asOf: "Sep 14", src: "yahoo_cross_asset" },
    { id: "pe", label: "S&P fwd P/E", value: "19.1×", note: "5-yr avg 19.8×, 10-yr avg 19.0×", asOf: "Sep 2026", src: "factset" },
    { id: "eps", label: "Q3 EPS growth (est.)", value: "+28.9%", note: "Q4 est. +26.5%; 63% positive guidance", asOf: "Sep 2026", src: "factset" },
    { id: "unrate", label: "Unemployment", value: "4.1%", note: "Payrolls +162k vs 53k expected", asOf: "Aug data", src: "foxbiz_jobs" }
  ],

  /* ------------------------------------------------------------------ */
  /* Narrative: the regime in one read                                   */
  /* ------------------------------------------------------------------ */
  regime: {
    title: "An earnings boom that has run into an oil-driven rate shock",
    bullets: [
      { text: "Earnings are carrying the market. S&P 500 Q3 EPS growth is estimated at +28.9% y/y, and 63% of companies issuing guidance raised it (5-yr average: 41%). The forward P/E has de-rated to 19.1× from 20.4× at the end of June.", src: "factset" },
      { text: "The AI build-out has moved from GPUs into memory, storage and power. Nvidia's data-center revenue hit $89.0B (+117% y/y) and it guided to $108B next quarter. Micron posted +345.7% revenue growth, and the S&P's best 2026 performers are almost all memory, storage or AI hardware.", src: "nvda_q2" },
      { text: "The Iran war shock to oil is feeding into inflation. Brent went from about $72 before the war to about $120 at its peak and is back above $100. August headline CPI was 3.4% y/y with gasoline +27.4%.", src: "cnbc_oil_timeline" },
      { text: "The Fed has turned hawkish. It hiked 25 bp to 3.75–4.00% on Sep 16, its first hike since 2023. Most FOMC participants see another hike this year, and the 10-yr yield hit its highest level since 2007.", src: "cnbc_fed" },
      { text: "Market leadership is rotating. Energy leads YTD at about +47.7%, and the Russell 2000 was on pace for its best year since 2003. The Magnificent 7 are up only ~7.7% YTD, and software and consulting names that AI may disrupt are the biggest losers.", src: "sector_ytd" },
      { text: "Big managers are putting cash to work. Berkshire bought $23.5B of stock against $3.7B of sales, ending a 14-quarter net-selling streak. Hedge-fund consensus buys were Amazon, SpaceX, Alphabet and Meta.", src: "brk_q2" }
    ],
    risks: [
      { title: "Rates", text: "A 10-yr above 5% raises the discount rate on long-duration growth stocks. Those are exactly the names that can double, and they fall hardest when yields spike.", src: "cnbc_10y" },
      { title: "Oil / geopolitics", text: "The EIA expects Brent below $90 in Q4 as shut-ins ease. If the Strait of Hormuz stays disrupted instead, inflation and Fed-hike risk get worse.", src: "wiki_oil" },
      { title: "AI capex digestion", text: "Neocloud stocks have fallen sharply from their highs (Nebius $300 → $224, IREN $77 → $43). The trade is crowded and moves violently in both directions.", src: "neocloud" },
      { title: "Peak-cycle memory", text: "Memory is cyclical. Micron's 84.6% gross margin is extraordinary, and investors will be watching for any sign supply is catching up with demand.", src: "mu_sep" },
      { title: "Growth slowdown", text: "Q2 real GDP slowed to 1.5% from 2.1% in Q1, so earnings strength and macro momentum are diverging.", src: "bea_gdp" }
    ]
  },

  /* ------------------------------------------------------------------ */
  /* Macro dashboard                                                     */
  /* ------------------------------------------------------------------ */
  macro: {
    table: [
      { k: "Fed funds target range", v: "3.75% – 4.00%", d: "Hiked +25 bp Sep 16 (12–0 vote). Was 3.50–3.75% for all of 2026 before that", src: "cnbc_fed" },
      { k: "FOMC year-end 2026 median", v: "4.00% – 4.25%", d: "12 participants see one more hike; 4 see two", src: "cnbc_fed" },
      { k: "10-yr Treasury", v: "5.10% (5.13% intraday high)", d: "Highest since 2007. 5- and 30-yr also at pre-GFC highs", src: "cnbc_10y" },
      { k: "Headline CPI", v: "+0.4% m/m, 3.4% y/y", d: "August; in line with estimates", src: "cnbc_cpi" },
      { k: "Core CPI", v: "+0.3% m/m, 2.4% y/y", d: "Monthly core a touch above estimates", src: "cnbc_cpi" },
      { k: "Energy inflation", v: "Gasoline +27.4% y/y, fuel oil +52%", d: "Shelter eased to 3.0%, food to 2.7%", src: "cnbc_cpi" },
      { k: "Nonfarm payrolls", v: "+162k (Aug)", d: "vs 53k consensus; July revised to +21k, June to +31k", src: "foxbiz_jobs" },
      { k: "Unemployment rate", v: "4.1%", d: "Unchanged; labor force +683k", src: "foxbiz_jobs" },
      { k: "Real GDP", v: "Q2 +1.5% saar", d: "Second estimate. Q1 was +2.1%", src: "bea_gdp" },
      { k: "Brent crude", v: "$101.59", d: "Sep 23. EIA: 2026 average $87, sub-$90 in Q4", src: "gvwire_yields" },
      { k: "S&P 500 forward P/E", v: "19.1×", d: "Down from 20.4× on June 30", src: "factset" },
      { k: "Gold / Bitcoin / VIX", v: "$4,325 / $84,477 / 15.18", d: "Sep 14 snapshot", src: "yahoo_cross_asset" }
    ],
    payrolls: { unit: "k jobs", src: "foxbiz_jobs", rows: [["Jun", 31], ["Jul", 21], ["Aug", 162]] },
    gdp: { unit: "% saar", src: "bea_gdp", rows: [["Q1 2026", 2.1], ["Q2 2026", 1.5]] },
    oilTimeline: [
      { date: "Feb 27", text: "Brent ≈ $72/bbl before the war", src: "cnbc_oil_timeline" },
      { date: "Mar 3", text: "Brent closes $81.49, the highest since Jan 2025", src: "wiki_oil" },
      { date: "Mar week 1", text: "WTI +35% in a week, the biggest weekly gain since 1983. Brent $92.69", src: "wiki_oil" },
      { date: "Spring", text: "Strait of Hormuz disrupted (~20% of global oil). Brent peaks near $120", src: "cnbc_oil_timeline" },
      { date: "Sep 23", text: "Brent $101.59 (+2.4%). 10-yr hits 5.13%", src: "gvwire_yields" },
      { date: "EIA view", text: "Middle East output back near pre-war levels by early 2027. Brent below $90 in Q4 2026", src: "wiki_oil" }
    ],
    fedPath: { src: "cnbc_fed", rows: [["Jan–Aug 2026", 3.625], ["Sep 16 2026", 3.875], ["YE 2026 (median dot)", 4.125]] }
  },

  /* ------------------------------------------------------------------ */
  /* Equity market internals                                             */
  /* ------------------------------------------------------------------ */
  indices: [
    { name: "S&P 500", ytd: null, level: "7,764.70", note: "YTD ≈ +11% as of mid-July. 2025: +15.96% price, +17.44% total return", src: "sp_2025" },
    { name: "Nasdaq Composite", ytd: null, level: "27,122.09", note: "Record close in mid-September", src: "cnbc_nasdaq_record" },
    { name: "Russell 2000", ytd: 20, level: null, note: "+20% YTD by mid-July, on pace for its best year since 2003", src: "r2k" },
    { name: "Magnificent 7 (basket)", ytd: 7.66, level: null, note: "As of Sep 20. On track for the worst year since 2022", src: "mag7" }
  ],
  sectors: {
    src: "sector_ytd",
    note: "S&P Dow Jones' published sector dashboard has the full 11-sector table. Only the two endpoints were stated numerically in the sources reviewed; the rest are described qualitatively.",
    rows: [
      { name: "Energy", ytd: 47.7, read: "Leader. Oil > $100 and the cheapest sector at ~13× P/E with 16.3% ROE" },
      { name: "Information Technology", ytd: null, read: "Strong in August on renewed AI enthusiasm. Hardware and memory lead, software lags" },
      { name: "Health Care", ytd: null, read: "Best 3-month momentum of any sector (+14.1%). 1-yr +24.1%" },
      { name: "Industrials", ytd: null, read: "Supported by capex for electricity, AI construction and defense. Lagged in August" },
      { name: "Utilities", ytd: null, read: "Power-demand story intact. Lagged in August as yields rose" },
      { name: "Materials", ytd: null, read: "Benefits from the same infrastructure capex" },
      { name: "Communication Services", ytd: null, read: "Negative YTD per S&P dashboard commentary" },
      { name: "Consumer Discretionary", ytd: -5.0, read: "Laggard. Gasoline shock squeezes consumers; Tesla −20.9% YTD" }
    ]
  },
  leaders2026: {
    asOf: "Sep 4, 2026", src: "investing_top3",
    rows: [
      { t: "SNDK", n: "SanDisk", r: 536, why: "NAND / flash pricing for AI data centers" },
      { t: "MRNA", n: "Moderna", r: 399, why: "Phase 3 melanoma vaccine win with Merck" },
      { t: "DELL", n: "Dell Technologies", r: 306, why: "AI server demand" },
      { t: "MU", n: "Micron", r: 225, why: "HBM / DRAM shortage" },
      { t: "STX", n: "Seagate", r: 184, why: "High-capacity HDD demand" }
    ]
  },
  laggards2026: {
    asOf: "Sep 2026", src: "usnews_worst",
    rows: [
      { t: "CSGP", n: "CoStar", r: -56.2 }, { t: "TTD", n: "Trade Desk", r: -52.1 },
      { t: "BSX", n: "Boston Scientific", r: -50.7 }, { t: "INTU", n: "Intuit", r: -49.8 },
      { t: "EPAM", n: "EPAM Systems", r: -47.3 }, { t: "LULU", n: "Lululemon", r: -43.6 },
      { t: "PODD", n: "Insulet", r: -41.6 }, { t: "PSKY", n: "Paramount Skydance", r: -39.6 },
      { t: "TSCO", n: "Tractor Supply", r: -39.5 }, { t: "ZTS", n: "Zoetis", r: -38.6 }
    ]
  },
  mag7: {
    src: "mag7",
    rows: [
      { t: "AAPL", r: 20.0, asOf: "Sep 20", note: "Best of the group" },
      { t: "GOOGL", r: 12.7, asOf: "Jul 13", note: "" },
      { t: "MSFT", r: -20.4, asOf: "Jul 13", note: "AI-disruption fears hit software" },
      { t: "TSLA", r: -20.9, asOf: "Sep 20", note: "Worst of the group" }
    ]
  },
  bigEvents: [
    { date: "May 14", title: "Cerebras IPO (CBRS)", text: "Priced at $185 (range raised twice) and raised $5.5B. Opened at $385 and closed day 1 at $311, a $66B valuation.", src: "cbrs" },
    { date: "Jun 12", title: "SpaceX IPO (SPCX)", text: "Largest IPO ever: $75B raised at $135. Closed above $160 with a market cap above $2.1T. Fell ~30% from IPO-day levels by late July.", src: "spcx" },
    { date: "Aug 19", title: "Moderna / Merck melanoma vaccine", text: "Phase 3 intismeran met its endpoints in >1,100 patients. MRNA added $45B in market value in a single day.", src: "mrna" },
    { date: "Aug 26", title: "Nvidia FQ2-27", text: "Revenue $96.2B (+106%), data center $89.0B. Guided $108B ±2% vs $104.2B expected. No China data-center sales in the guide.", src: "nvda_q2" },
    { date: "Sep 16", title: "Fed hikes", text: "+25 bp to 3.75–4.00%, the first hike in more than three years, with another signaled.", src: "cnbc_fed" },
    { date: "Sep 23", title: "Yield shock", text: "10-yr at 5.13% intraday on strong manufacturing surveys, a weak 5-yr auction and WTI +2%.", src: "cnbc_10y" }
  ],

  /* ------------------------------------------------------------------ */
  /* Institutional / "smart money" — Q2 2026 13F filings (as of 6/30)     */
  /* ------------------------------------------------------------------ */
  institutions: {
    note: "13F filings show U.S.-listed long equity positions (and listed options) as of quarter-end. They are filed up to 45 days later, so the Q2 2026 data (June 30) was published Aug 14. Bank 13Fs mostly reflect client, wealth-management and index assets, not proprietary bets.",
    banks: [
      { name: "BlackRock", type: "Asset manager", aum: 6730, prior: null, holdings: 5694, top: [], flow: { new: 233, inc: 3449, red: 1232, exit: 186 }, src: "13radar_blk" },
      { name: "Morgan Stanley", type: "Bank / wealth", aum: 1890, prior: 1660, holdings: 8715, top: ["AAPL", "NVDA", "MSFT", "AMZN", "GOOGL"], flow: { new: 423, inc: 3809, red: 3216, exit: 305 }, src: "wallstrank_ms" },
      { name: "JPMorgan Chase", type: "Bank / asset mgmt", aum: 1807.37, prior: 1560.14, holdings: 7720, top: ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN"], flow: null, src: "jpm_13f" },
      { name: "Goldman Sachs", type: "Bank", aum: 1151.63, prior: null, holdings: null, top: ["NVDA", "AAPL", "MSFT", "SPY", "GOOGL"], flow: null, src: "gs_13f" }
    ],
    funds: [
      {
        name: "Berkshire Hathaway", manager: "Greg Abel", aum: null,
        summary: "Bought $23.5B and sold $3.7B, ending a 14-quarter streak of net selling. Alphabet was the most-traded name.",
        top: [],
        buys: [{ t: "DHI", note: "New position (D.R. Horton)" }, { t: "GOOGL", note: "Most-traded holding" }],
        sells: [{ t: "STZ", note: "Exited" }, { t: "BAC", note: "Trimmed (~$1.7B sold)" }, { t: "DVA", note: "Trimmed" }, { t: "KR", note: "Trimmed" }, { t: "ALLY", note: "Trimmed" }, { t: "COF", note: "Trimmed" }],
        src: "brk_q2"
      },
      {
        name: "Appaloosa", manager: "David Tepper", aum: null,
        summary: "Sold out of memory winners and moved into mega-cap platforms. 34 changes: 6 new positions, 12 exits.",
        top: [{ t: "AMZN", w: 15.95 }, { t: "MU", w: 15.06 }, { t: "TSM", w: 10.55 }, { t: "GOOGL", w: 8.75 }, { t: "UBER", w: 7.43 }],
        buys: [{ t: "AAPL", note: "New, > $241M" }, { t: "AVGO", note: "New" }, { t: "CRWV", note: "New" }, { t: "BA", note: "New, ~$173M" }, { t: "AAL", note: "New, ~$136M" }, { t: "TSM", note: "+24.3%" }, { t: "UBER", note: "+21.5%" }, { t: "AMZN", note: "+15.7%" }],
        sells: [{ t: "SNDK", note: "Exited (> $400M stake)" }, { t: "GLW", note: "Exited" }, { t: "PDD", note: "Exited" }, { t: "QCOM", note: "Cut" }, { t: "BABA", note: "Cut" }, { t: "WHR", note: "Cut" }],
        src: "tepper"
      },
      {
        name: "Duquesne Family Office", manager: "Stanley Druckenmiller", aum: 5.21,
        summary: "Portfolio grew from $3.38B to $5.21B with heavy rotation: 44 new positions reported, 23 exits. Added a cluster of bitcoin-miner and AI-hosting names.",
        top: [{ t: "NTRA", w: 16.6 }],
        buys: [{ t: "IREN", note: "New" }, { t: "HUT", note: "New (Hut 8)" }, { t: "RIOT", note: "New" }, { t: "BTDR", note: "New (Bitdeer)" }, { t: "GOOGL", note: "New" }, { t: "CDW", note: "New" }, { t: "FOX", note: "New" }],
        sells: [],
        src: "druck"
      },
      {
        name: "Pershing Square", manager: "Bill Ackman", aum: 19.47,
        summary: "Went from 10 to 14 positions. New stakes in payments, ratings and streaming. Exited Alphabet.",
        top: [{ t: "UBER", w: 12.72 }, { t: "BN", w: 12.58 }, { t: "MSFT", w: 11.89 }, { t: "AMZN", w: 10.49 }, { t: "HHH", w: 10.23 }],
        buys: [{ t: "V", note: "New" }, { t: "MA", note: "New" }, { t: "SPGI", note: "New" }, { t: "NFLX", note: "New" }, { t: "META", note: "Increased" }, { t: "QSR", note: "Increased" }],
        sells: [{ t: "GOOGL", note: "Exited" }, { t: "UMG", note: "Divested" }],
        src: "ackman"
      },
      {
        name: "Coatue", manager: "Philippe Laffont", aum: 48.63,
        summary: "13F value rose from $29.01B to $48.63B. The book tilts heavily toward semicap and memory, and SpaceX is already a top-5 holding.",
        top: [{ t: "TSM" }, { t: "LRCX" }, { t: "MU" }, { t: "SPCX" }, { t: "AMAT" }],
        buys: [{ t: "EQIX", note: "+$1.1B" }, { t: "ASML", note: "+$655M (new)" }, { t: "TSM", note: "+$221M" }, { t: "V", note: "+$217M (new)" }, { t: "QCOM", note: "+$179M (new)" }, { t: "ENPH", note: "New" }, { t: "PATH", note: "New" }, { t: "NVAX", note: "New" }],
        sells: [],
        src: "coatue_tiger"
      },
      {
        name: "Tiger Global", manager: "Chase Coleman", aum: 23.98,
        summary: "Trimmed all ten of its largest holdings and made new bets on AI chip challengers.",
        top: [{ t: "TSM" }, { t: "AMZN" }, { t: "NVDA" }, { t: "GOOGL" }, { t: "META" }, { t: "MSFT" }],
        buys: [{ t: "CBRS", note: "New, ~$660M" }, { t: "AMD", note: "New, ~$392M" }, { t: "INTC", note: "+159.5% to 4.25M sh" }, { t: "STX", note: "New" }, { t: "V", note: "New" }],
        sells: [{ t: "APP", note: "Exited" }, { t: "GOOGL", note: "Trimmed" }],
        src: "coatue_tiger"
      },
      {
        name: "Bridgewater", manager: "Bridgewater Associates", aum: 24.4,
        summary: "997 holdings, mostly beta: large index-ETF positions plus AI mega caps.",
        top: [{ t: "SPY" }, { t: "IVV" }, { t: "NVDA" }, { t: "AVGO" }, { t: "AMZN" }],
        buys: [], sells: [],
        src: "hf_consensus"
      },
      {
        name: "Scion", manager: "Michael Burry", aum: null,
        summary: "No 13F filed since Q3 2025. The last one showed ~80% of reported value in puts on Palantir and Nvidia.",
        top: [{ t: "PLTR", note: "put" }, { t: "NVDA", note: "put" }],
        buys: [], sells: [],
        src: "burry"
      }
    ],
    consensus: {
      src: "hf_consensus",
      note: "Across the hedge-fund 13F universe tracked by 13F.finance. SpaceX's figure includes IPO allocations.",
      rows: [
        { t: "SPCX", funds: 39, net: 92.6 },
        { t: "GOOGL", funds: 38, net: 37.3 },
        { t: "AMZN", funds: 41, net: 15.3 },
        { t: "META", funds: 33, net: 6.5 }
      ],
      crowded: "AMZN is the most widely held U.S. stock in the tracked universe (70 funds). Hedge funds get their nuclear-power exposure through CEG and VST. Among specialist biotech funds, Revolution Medicines (RVMD) is the most widely held (19 of 45)."
    }
  },

  /* ------------------------------------------------------------------ */
  /* What the banks are telling clients                                  */
  /* ------------------------------------------------------------------ */
  bankViews: {
    spxCurrent: 7764.70,
    targets: {
      src: "targets",
      rows: [
        { firm: "Yardeni Research", target: 8250 },
        { firm: "Citigroup", target: 8100 },
        { firm: "JPMorgan", target: 8000, note: "Raised from 7,800. Cut to 7,200 earlier in the year" },
        { firm: "Goldman Sachs", target: 8000 },
        { firm: "Morgan Stanley", target: 8000, note: "\"New bull market\" call" }
      ]
    },
    lists: [
      {
        firm: "Goldman Sachs — U.S. Conviction List (Sep)", src: "gs_conviction",
        text: "Added Vertex (VRTX) and removed Interactive Brokers, leaving 23 names. The thesis on VRTX: up to five multi-billion-dollar franchises (CF, pain, kidney, hematology, plus endocrinology via Crinetics).",
        names: ["VRTX", "MSFT", "WFC", "UNH", "DAL", "COP", "EL", "XYZ"]
      },
      {
        firm: "Goldman Sachs — Europe Conviction List (Sep)", src: "gs_conviction",
        text: "Added RWE (€75 target, +28%), Adyen (+77% upside, the biggest call) and Talanx (€141, +13%). Removed Enel, Wise, Hannover Re and Zalando.",
        names: ["ADYEN", "RWE", "TLX"]
      },
      {
        firm: "Morgan Stanley — Vintage Values 2027", src: "ms_vintage",
        text: "15 one-year buy-and-hold picks from the analysts' top ideas. The 2026 list returned 32.12% vs about 19% for the S&P 500 (Sep 9, 2025 – Sep 11, 2026). New members include Alphabet and Coca-Cola.",
        names: ["GOOGL", "KO"]
      },
      {
        firm: "Morgan Stanley — sector top picks", src: "ms_vintage",
        text: "ServiceTitan is the top vertical-software pick. The firm argues the AI-disruption sell-off in financial software has gone too far, and names Equinix a top pick.",
        names: ["TTAN", "EQIX"]
      },
      {
        firm: "Bank of America — US 1 / top ideas", src: "bofa",
        text: "Q3 top ideas included Ford, IBM ($10B quantum investment), Visa (a 3× discount to its 5-yr average forward P/E) and Walmart. Into September it highlighted ASML and Church & Dwight.",
        names: ["F", "IBM", "V", "WMT", "ASML", "CHD"]
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  /* Past doublers — who doubled, and what they had in common            */
  /* ------------------------------------------------------------------ */
  history: {
    // S&P 500 calendar-year PRICE returns (%). 1990–2024: standard published
    // index history; 2025 from the cited recap.
    spxAnnual: [
      [1990, -6.56], [1991, 26.31], [1992, 4.46], [1993, 7.06], [1994, -1.54], [1995, 34.11],
      [1996, 20.26], [1997, 31.01], [1998, 26.67], [1999, 19.53], [2000, -10.14], [2001, -13.04],
      [2002, -23.37], [2003, 26.38], [2004, 8.99], [2005, 3.00], [2006, 13.62], [2007, 3.53],
      [2008, -38.49], [2009, 23.45], [2010, 12.78], [2011, 0.00], [2012, 13.41], [2013, 29.60],
      [2014, 11.39], [2015, -0.73], [2016, 9.54], [2017, 19.42], [2018, -6.24], [2019, 28.88],
      [2020, 16.26], [2021, 26.89], [2022, -19.44], [2023, 24.23], [2024, 23.31], [2025, 15.96]
    ],
    spxAnnualSrc: "sp_2025",
    doublers: [
      { year: 2023, t: "NVDA", pattern: "wave", n: "Nvidia", r: 239, driver: "AI demand wave", setup: "Came off a −50% 2022; data-center revenue estimates exploded after the May 2023 guide", src: "top2023" },
      { year: 2023, t: "META", pattern: "turnaround", n: "Meta Platforms", r: 194, driver: "Turnaround + cost cuts", setup: "Came off a deep 2022 drawdown; 'year of efficiency' margin recovery", src: "top2023" },
      { year: 2023, t: "RCL", pattern: "turnaround", n: "Royal Caribbean", r: 163.4, driver: "Reopening demand", setup: "Beaten-down balance-sheet story; bookings accelerated", src: "top2023b" },
      { year: 2023, t: "BLDR", pattern: "compounder", n: "Builders FirstSource", r: 157.3, driver: "Housing + buybacks", setup: "Low P/E, heavy share repurchases", src: "top2023b" },
      { year: 2024, t: "PLTR", pattern: "ownership", n: "Palantir", r: 340.5, driver: "AI software adoption", setup: "S&P inclusion; accelerating U.S. commercial growth", src: "top2024" },
      { year: 2024, t: "VST", pattern: "wave", n: "Vistra", r: 261.3, driver: "AI power demand", setup: "Power producer re-rated as a data-center electricity supplier", src: "top2024" },
      { year: 2024, t: "NVDA", pattern: "wave", n: "Nvidia", r: 171.2, driver: "AI demand wave (yr 2)", setup: "Estimates kept rising faster than the price", src: "top2024" },
      { year: 2024, t: "UAL", pattern: "turnaround", n: "United Airlines", r: 135.3, driver: "Cyclical re-rating", setup: "Very low starting multiple", src: "top2024" },
      { year: 2024, t: "AXON", pattern: "compounder", n: "Axon Enterprise", r: 130.1, driver: "Recurring software + AI", setup: "Consistent 30%+ growth", src: "top2024" },
      { year: 2025, t: "SNDK", pattern: "wave", n: "SanDisk", r: 559, driver: "Memory/storage super-cycle", setup: "Spun off from WDC in Feb 2025; ignored small-float spin-off", src: "top2025" },
      { year: 2025, t: "STX", pattern: "wave", n: "Seagate", r: 226, driver: "Memory/storage super-cycle", setup: "HDD capacity demand from AI data centers", src: "top2025b" },
      { year: 2025, t: "HOOD", pattern: "ownership", n: "Robinhood", r: 225, driver: "Retail trading + crypto", setup: "S&P inclusion; product expansion", src: "top2025b" },
      { year: 2026, t: "SNDK", pattern: "wave", n: "SanDisk", r: 536, driver: "Memory/storage super-cycle (yr 2)", setup: "Had been up ~800% at mid-year", src: "investing_top3", ytd: true },
      { year: 2026, t: "MRNA", pattern: "binary", n: "Moderna", r: 399, driver: "Binary clinical catalyst", setup: "Had fallen to about $25 and was priced for failure. The Phase 3 cancer vaccine hit", src: "mrna", ytd: true },
      { year: 2026, t: "DELL", pattern: "wave", n: "Dell", r: 306, driver: "AI servers", setup: "Hardware integrator re-rated as AI infrastructure", src: "investing_top3", ytd: true },
      { year: 2026, t: "INTC", pattern: "turnaround", n: "Intel", r: 278, driver: "Turnaround + foundry", setup: "Deeply depressed starting valuation (H1 figure)", src: "h1_2026", ytd: true },
      { year: 2026, t: "MU", pattern: "wave", n: "Micron", r: 225, driver: "HBM / DRAM shortage", setup: "Revenue +345.7% y/y", src: "investing_top3", ytd: true }
    ],
    // Patterns drawn from the doublers table above.
    patterns: [
      { key: "wave", name: "A new demand wave hits a supply-constrained product", ex: "NVDA '23/'24, VST, SNDK, STX, MU, DELL", text: "The most common path. Revenue estimates rise faster than the stock, so the stock doubles while the P/E sometimes falls. Look for backlogs, sold-out capacity and price hikes." },
      { key: "turnaround", name: "Deep drawdown + a fixable problem (turnaround)", ex: "META '23, RCL, UAL, INTC", text: "The stock started far below its prior high because the market had priced in permanent damage. Operating proof (cost cuts, reopening, restructuring) forced a re-rating." },
      { key: "binary", name: "Binary catalyst", ex: "MRNA '26", text: "A trial readout, approval or contract. Highest variance: if the catalyst fails, the same setup usually produces a large drop instead." },
      { key: "compounder", name: "Compounder re-rating", ex: "AXON, BLDR", text: "Steady 20–30% growth, buybacks or a low starting multiple, combined with a market that suddenly pays up for it. Rarer, but the lowest-variance route to a double." },
      { key: "ownership", name: "Index inclusion / new investor base", ex: "PLTR, HOOD (SNDK spin-off also fits)", text: "Forced buying and wider ownership compound whatever fundamental momentum already exists." }
    ],
    baseRate: "Even in strong years only a handful of S&P 500 members double. In 2024 the fifth-best stock returned +130%, so roughly 1% of the index doubled. Small caps double more often because they are more volatile, and they halve more often for the same reason. The pipeline measures this on real price history for your chosen universe."
  },

  /* ------------------------------------------------------------------ */
  /* Doubling watchlist                                                  */
  /* ------------------------------------------------------------------ */
  // factors: 0–10 (higher = more supportive), except `risk` (higher = riskier).
  //   wave   — exposure to a demand wave that is currently accelerating
  //   growth — reported revenue/earnings acceleration
  //   street — consensus / named-analyst upside to target
  //   smart  — 13F accumulation by notable managers (Q2 2026)
  //   asym   — room to recover (distance below prior high) / starting valuation
  //   size   — smaller market cap = more room to double
  //   risk   — dilution, pre-revenue, binary events, leverage, valuation
  // vol: assumed annualised volatility used by the probability engine. It is an
  //      estimate by volatility class, not a measurement. The pipeline measures it.
  watchlist: [
    {
      t: "IREN", n: "IREN Ltd", theme: "AI neocloud / hosting", price: 43, priceNote: "vs YTD high $77", target: null,
      factors: { wave: 9, growth: 8, street: 5, smart: 7, asym: 8, size: 6, risk: 8 }, vol: 0.95,
      thesis: "Former bitcoin miner turned AI cloud, with a 5-yr, $3.4B NVIDIA AI-cloud contract and up to $2.1B of NVIDIA investment vesting as capacity scales toward 600k GPUs. Druckenmiller opened a new position in Q2.",
      catalysts: ["GPU capacity milestones that trigger NVIDIA investment tranches", "New hyperscaler / lab contracts"],
      risks: ["Capex funding and dilution", "Crowded neocloud trade; −44% from YTD high shows the downside"],
      src: ["neocloud", "druck"]
    },
    {
      t: "QBTS", n: "D-Wave Quantum", theme: "Quantum computing", price: 18.38, target: 35.79,
      factors: { wave: 7, growth: 5, street: 9, smart: 4, asym: 6, size: 7, risk: 9 }, vol: 1.1,
      thesis: "The consensus target implies about 95% upside, the closest thing to a Street-endorsed double in this list. Sector sentiment turned after IonQ's real-time error-decoder result and its NVIDIA work.",
      catalysts: ["Enterprise annealing contracts", "Sector-wide re-rating on error-correction progress"],
      risks: ["Revenue is tiny relative to market cap", "Equity raises; up ~1,670% over 2 years already"],
      src: ["quantum"]
    },
    {
      t: "RGTI", n: "Rigetti Computing", theme: "Quantum computing", price: 17.15, target: 29.5,
      factors: { wave: 7, growth: 4, street: 8, smart: 4, asym: 6, size: 7, risk: 9 }, vol: 1.1,
      thesis: "Average target about 72% above the price. Pure-play gate-model quantum with high beta to sector news.",
      catalysts: ["Fidelity / qubit-count roadmap", "Government contracts"],
      risks: ["Up ~1,820% in 2 years; pre-profit", "Dilution"],
      src: ["quantum"]
    },
    {
      t: "IONQ", n: "IonQ", theme: "Quantum computing", price: 45.29, target: 71,
      factors: { wave: 7, growth: 8, street: 7, smart: 4, asym: 6, size: 5, risk: 8 }, vol: 1.0,
      thesis: "The only quantum name here with meaningful revenue: FY guide raised to $280–290M. Showed the industry's first end-to-end real-time quantum error decoder on a standard CPU, followed by an NVIDIA research-center deal.",
      catalysts: ["Guidance raises", "NVIDIA partnership milestones"],
      risks: ["Acquisition-driven growth", "Valuation relies on the long-dated fault-tolerance roadmap"],
      src: ["quantum"]
    },
    {
      t: "OKLO", n: "Oklo", theme: "Advanced nuclear", price: null, priceNote: "−39% YTD, −73% from 52-wk high", target: null,
      factors: { wave: 7, growth: 2, street: 5, smart: 5, asym: 9, size: 6, risk: 9 }, vol: 1.0,
      thesis: "A classic setup from the 'deep drawdown + fixable problem' pattern. Hyperscalers need firm power, and the stock has already de-rated by about three-quarters from its peak.",
      catalysts: ["NRC licensing steps", "Hyperscaler power-purchase agreements"],
      risks: ["Pre-revenue; long timelines", "Hedge funds prefer CEG/VST for nuclear exposure"],
      src: ["nuclear", "hf_consensus"]
    },
    {
      t: "SMR", n: "NuScale Power", theme: "Advanced nuclear", price: null, priceNote: "−24% YTD, −83% from 52-wk high", target: null,
      factors: { wave: 6, growth: 3, street: 5, smart: 3, asym: 10, size: 7, risk: 9 }, vol: 1.0,
      thesis: "The only U.S. SMR design with NRC approval, trading 83% below its high. Maximum asymmetry if a customer order firms up.",
      catalysts: ["First firm plant order", "DOE / hyperscaler financing"],
      risks: ["Order timing has repeatedly slipped", "Dilution"],
      src: ["nuclear"]
    },
    {
      t: "CRWV", n: "CoreWeave", theme: "AI neocloud", price: null, priceNote: "−27% over 12 months", target: null,
      factors: { wave: 9, growth: 9, street: 5, smart: 7, asym: 7, size: 4, risk: 8 }, vol: 0.9,
      thesis: "Revenue +112% with a $104B backlog, yet the stock is down 27% over 12 months. Tepper opened a new position in Q2.",
      catalysts: ["Backlog conversion", "Financing cost relief"],
      risks: ["Heavy debt; rates at 5%+ hurt", "Customer concentration"],
      src: ["neocloud", "tepper"]
    },
    {
      t: "NBIS", n: "Nebius Group", theme: "AI neocloud", price: 224, priceNote: "vs YTD high $300", target: null,
      factors: { wave: 9, growth: 10, street: 5, smart: 5, asym: 5, size: 5, risk: 7 }, vol: 0.85,
      thesis: "Revenue +454%, the fastest grower here. Up about 201% YTD but 25% off its high.",
      catalysts: ["Capacity additions", "Large-lab contracts"],
      risks: ["Already tripled this year", "Crowded trade"],
      src: ["neocloud"]
    },
    {
      t: "CBRS", n: "Cerebras Systems", theme: "AI chips", price: null, priceNote: "IPO $185 (May), day-1 close $311", target: null,
      factors: { wave: 9, growth: 7, street: 5, smart: 7, asym: 6, size: 4, risk: 8 }, vol: 0.9,
      thesis: "Wafer-scale inference chips. Revenue +76% to $510M last year and profitable. Tiger Global opened a ~$660M position. The stock fell 14% after its second print even though guidance was raised.",
      catalysts: ["Inference-demand contracts", "Lock-up expiry clearing"],
      risks: ["Post-IPO supply", "Competition from NVDA/AMD"],
      src: ["cbrs", "coatue_tiger"]
    },
    {
      t: "RKLB", n: "Rocket Lab", theme: "Space", price: 74.34, priceNote: "Aug 4 print", target: null,
      factors: { wave: 8, growth: 7, street: 5, smart: 4, asym: 6, size: 5, risk: 6 }, vol: 0.8,
      thesis: "The SpaceX IPO set a public valuation for launch businesses. Rocket Lab has proven launch cadence and a growing backlog, and analysts see a better risk/reward here than in SPCX.",
      catalysts: ["Neutron first launch", "Defense constellation awards"],
      risks: ["Trades as a SpaceX sympathy play (−26% in one month)"],
      src: ["space"]
    },
    {
      t: "ASTS", n: "AST SpaceMobile", theme: "Space / telecom", price: 69, priceNote: "Aug 4 print", target: null,
      factors: { wave: 8, growth: 3, street: 5, smart: 4, asym: 6, size: 6, risk: 9 }, vol: 0.95,
      thesis: "Direct-to-cell satellite broadband. Sold off 20% during the SpaceX IPO frenzy and has been recovering.",
      catalysts: ["Satellite deployment cadence", "Carrier commercial launch"],
      risks: ["Starlink direct-to-cell competition", "Capital intensity"],
      src: ["space"]
    },
    {
      t: "RVMD", n: "Revolution Medicines", theme: "Oncology biotech", price: 190.5, target: 251.21,
      factors: { wave: 7, growth: 6, street: 6, smart: 9, asym: 4, size: 4, risk: 6 }, vol: 0.6,
      thesis: "Daraxonrasib cut the risk of death by 60% in 2L pancreatic cancer (median OS 13.2 vs 6.7 months), and the NDA has been accepted. It is the most widely held name among specialist biotech funds (19 of 45).",
      catalysts: ["FDA approval / launch", "1L pancreatic Phase 3 (RASolute 303)"],
      risks: ["Already ~4.5× off its 52-wk low", "Launch execution"],
      src: ["rvmd", "hf_consensus"]
    },
    {
      t: "POET", n: "POET Technologies", theme: "AI optics", price: 10.25, priceNote: "implied from bull case", target: 20.5,
      factors: { wave: 8, growth: 5, street: 7, smart: 2, asym: 6, size: 9, risk: 9 }, vol: 1.0,
      thesis: "A micro-cap in optical interposers for AI-cluster Ethernet. The published bull case is $20.50, about 2×, if execution is clean.",
      catalysts: ["Design wins with module makers", "Volume production"],
      risks: ["Micro-cap liquidity", "The target is a bull case, not consensus"],
      src: ["poet"]
    },
    {
      t: "HUT", n: "Hut 8 (and BTC-miner / HPC basket)", theme: "Bitcoin + AI hosting", price: null, target: null,
      factors: { wave: 7, growth: 5, street: 5, smart: 7, asym: 6, size: 7, risk: 9 }, vol: 1.0,
      thesis: "Druckenmiller opened new positions across Hut 8, Riot, Bitdeer and IREN. Power-rich miner sites can be converted to AI hosting, with bitcoin at ~$84k as a second lever.",
      catalysts: ["AI hosting lease signings", "Bitcoin recovery"],
      risks: ["BTC drawdowns", "Conversion capex"],
      src: ["druck", "yahoo_cross_asset"]
    },
    {
      t: "ENPH", n: "Enphase Energy", theme: "Solar / energy security", price: null, priceNote: "far below 2022 peak", target: null,
      factors: { wave: 5, growth: 3, street: 5, smart: 6, asym: 8, size: 6, risk: 7 }, vol: 0.7,
      thesis: "Coatue opened a new position. Oil above $100 and 27% gasoline inflation revive the energy-independence case for residential solar and storage.",
      catalysts: ["Rate cuts (if oil fades)", "Storage attach rates"],
      risks: ["Rates rising, not falling", "Policy / tariff exposure"],
      src: ["coatue_tiger", "cnbc_cpi"]
    },
    {
      t: "ADYEN", n: "Adyen", theme: "Payments (EU)", price: null, target: null, upside: 77,
      factors: { wave: 5, growth: 6, street: 9, smart: 7, asym: 7, size: 3, risk: 5 }, vol: 0.45,
      thesis: "Goldman added it to the Europe Conviction List with about 77% upside, its biggest call among the September additions. A lower-volatility way to a large move.",
      catalysts: ["Volume re-acceleration", "Margin guidance"],
      risks: ["Low volatility makes a full double in 12 months unlikely"],
      src: ["gs_conviction"]
    },
    {
      t: "NTRA", n: "Natera", theme: "Diagnostics", price: null, target: null,
      factors: { wave: 6, growth: 5, street: 5, smart: 9, asym: 5, size: 3, risk: 5 }, vol: 0.45,
      thesis: "Druckenmiller's largest disclosed holding at ~$865M (16.6% of the 13F book). Health Care has the best 3-month momentum of any sector.",
      catalysts: ["Test volume / reimbursement wins"],
      risks: ["Large-cap already; litigation"],
      src: ["druck", "sector_ytd"]
    },
    {
      t: "MU", n: "Micron Technology", theme: "Memory super-cycle", price: 1096.16, target: 1515,
      factors: { wave: 10, growth: 10, street: 6, smart: 9, asym: 3, size: 1, risk: 6 }, vol: 0.6,
      thesis: "Revenue +345.7% y/y, gross margin 84.6%, record $18.3B FCF, FQ4 guide of $50B. The highest published target, Melius at $2,200, implies a double. A top-2 Tepper holding and a new Coatue position.",
      catalysts: ["Earnings (late Sep)", "HBM4 ramp, already >$1B booked"],
      risks: ["Already a mega-cap; up ~225% YTD", "Memory cycles turn abruptly"],
      src: ["mu_sep", "tepper", "coatue_tiger"]
    },
    {
      t: "SPCX", n: "SpaceX", theme: "Space / AI compute", price: null, priceNote: "IPO $135; ~30% below IPO-day levels in late July", target: null,
      factors: { wave: 8, growth: 6, street: 5, smart: 10, asym: 5, size: 0, risk: 7 }, vol: 0.6,
      thesis: "The largest consensus hedge-fund buy of Q2 (39 funds, +$92.6B including IPO allocations) and a Coatue top-5 holding.",
      catalysts: ["Index inclusion", "Starlink / launch disclosures in early earnings"],
      risks: ["$2T+ starting value makes a double improbable", "Post-IPO supply"],
      src: ["spcx", "hf_consensus", "coatue_tiger"]
    }
  ],

  /* ------------------------------------------------------------------ */
  /* Sources                                                             */
  /* ------------------------------------------------------------------ */
  sources: {
    cnbc_nasdaq_record: { t: "CNBC — Nasdaq jumps 2% to close at a record (Sep 2026)", u: "https://www.cnbc.com/2026/09/20/stock-market-today-live-updates.html" },
    cnbc_10y: { t: "CNBC — 10-year Treasury yield rockets to 19-year high (Sep 23, 2026)", u: "https://www.cnbc.com/2026/09/23/treasury-yields-oil-inflation-fed.html" },
    gvwire_yields: { t: "GV Wire / AP — US stocks fall as 10-year yield hits highest since 2007", u: "https://gvwire.com/2026/09/23/us-stocks-fall-as-10-year-treasury-yield-hits-highest-since-2007/" },
    cnbc_fed: { t: "CNBC — Fed rate decision September 2026: rates rise to 3.75%–4%", u: "https://www.cnbc.com/2026/09/16/fed-rate-decision-september-2026.html" },
    cnbc_cpi: { t: "CNBC — CPI inflation report August 2026", u: "https://www.cnbc.com/2026/09/11/cpi-inflation-report-august-2026.html" },
    foxbiz_jobs: { t: "Fox Business — August jobs report: +162,000, unemployment 4.1%", u: "https://www.foxbusiness.com/economy/us-jobs-report-august-2026" },
    bea_gdp: { t: "BEA — GDP (Second Estimate), 2nd Quarter 2026", u: "https://www.bea.gov/news/2026/gdp-second-estimate-and-corporate-profits-2nd-quarter-2026" },
    yahoo_cross_asset: { t: "Yahoo Finance — VIX / BTC-USD quotes (Sep 14, 2026 snapshot)", u: "https://finance.yahoo.com/quote/%5EVIX/" },
    factset: { t: "FactSet Earnings Insight", u: "https://www.factset.com/earningsinsight" },
    cnbc_oil_timeline: { t: "CNBC — A timeline of how the Iran war shook oil prices", u: "https://www.cnbc.com/2026/04/21/oil-price-iran-war-middle-east.html" },
    wiki_oil: { t: "Wikipedia — 2026 Iran war fuel crisis", u: "https://en.wikipedia.org/wiki/2026_Iran_war_fuel_crisis" },
    sector_ytd: { t: "S&P DJI — U.S. Sector Dashboard (Aug 31, 2026)", u: "https://www.spglobal.com/spdji/en/documents/performance-reports/dashboard-us-sector.pdf" },
    r2k: { t: "24/7 Wall St. — The Russell 2000 is having its best year in 23 years", u: "https://247wallst.com/investing/2026/07/16/the-russell-2000-is-having-its-best-year-in-23-years-heres-why-small-caps-are-winning-again/" },
    mag7: { t: "Motley Fool — Are the Magnificent Seven stocks still worth buying?", u: "https://www.fool.com/investing/2026/08/31/are-the-magnificent-seven-stocks-still-worth-buyin/" },
    sp_2025: { t: "DQYDJ — 2025 S&P 500 return", u: "https://dqydj.com/2025-sp-500-return/" },
    investing_top3: { t: "Investing.com — The S&P 500's 3 best-performing stocks so far in 2026", u: "https://www.investing.com/analysis/the-sp-500-3-bestperforming-stocks-so-far-in-2026-200676716" },
    h1_2026: { t: "Motley Fool — S&P 500's best-performing stocks at the halfway mark of 2026", u: "https://www.fool.com/investing/2026/07/06/these-were-the-sp-500s-best-performing-stocks-at-t/" },
    usnews_worst: { t: "U.S. News — 2026's 10 worst-performing stocks", u: "https://money.usnews.com/investing/articles/worst-performing-stocks" },
    nvda_q2: { t: "CNBC — Nvidia earnings takeaways (Aug 26, 2026)", u: "https://www.cnbc.com/2026/08/26/nvidia-nvda-earnings-report-q2-2027-live-updates.html" },
    mrna: { t: "CNBC — Moderna/Merck cancer vaccine late-stage data (Aug 19, 2026)", u: "https://www.cnbc.com/2026/08/19/moderna-merck-cancer-vaccine-shows-initial-late-stage-melanoma-data.html" },
    cbrs: { t: "TechCrunch — Cerebras raises $5.5B, stock pops", u: "https://techcrunch.com/2026/05/14/cerebras-raises-5-5b-kicking-off-2026s-ipo-season-with-a-bang/" },
    spcx: { t: "CNBC — SpaceX IPO: market cap tops $2 trillion", u: "https://www.cnbc.com/2026/06/12/spacex-stock-jumps-2-trillion.html" },
    brk_q2: { t: "Kiplinger — All the stocks Berkshire Hathaway bought and sold in Q2 2026", u: "https://www.kiplinger.com/investing/stocks/stocks-berkshire-hathaway-bought-sold-q2-2026" },
    tepper: { t: "CNBC — Tepper's Appaloosa sells AI memory stocks, loads up on Mag 7 (Aug 14, 2026)", u: "https://www.cnbc.com/2026/08/14/david-tepper-appaloosa-13f-q2.html" },
    druck: { t: "Seeking Alpha — Druckenmiller's Duquesne portfolio, Q2 2026 update", u: "https://seekingalpha.com/article/4944764-stanley-druckenmiller-duquesne-family-office-portfolio-q2-2026-update" },
    ackman: { t: "Seeking Alpha — Pershing Square 13F portfolio, Q2 2026 update", u: "https://seekingalpha.com/article/4937160-tracking-bill-ackmans-pershing-square-13f-portfolio-q2-2026-update" },
    coatue_tiger: { t: "BBAE — 13F highlights: where top investors moved in Q2 2026", u: "https://www.bbae.com/blog/13f-highlights-where-top-investors-moved-in-q2-2026/" },
    hf_consensus: { t: "13F.finance — Hedge fund consensus trades, Q2 2026", u: "https://13f.finance/consensus" },
    burry: { t: "Hedge Fund Alpha — Michael Burry portfolio: Scion's final 13F", u: "https://hedgefundalpha.com/strategies/michael-burry-portfolio/" },
    wallstrank_ms: { t: "WallStRank — Morgan Stanley Q2 2026 13F", u: "https://www.wallstrank.com/portfolios/morgan-stanley" },
    jpm_13f: { t: "Holdings Channel — JPMorgan Chase 13F", u: "https://www.holdingschannel.com/13f/jpmorgan-chase-co-top-holdings/" },
    gs_13f: { t: "Holdings Channel — Goldman Sachs Group 13F", u: "https://www.holdingschannel.com/13f/goldman-sachs-group-inc-top-holdings/" },
    "13radar_blk": { t: "13Radar — BlackRock 13F Q2 2026", u: "https://www.13radar.com/filer/blackrock" },
    targets: { t: "Investing.com — Wall Street lifts S&P 500 targets", u: "https://www.investing.com/analysis/sp-500-outlook-wall-street-lifts-targets-as-bull-market-conviction-strengthens-200671599" },
    gs_conviction: { t: "Seeking Alpha — Vertex, RWE, Adyen added to Goldman conviction lists (Sep)", u: "https://seekingalpha.com/news/4639287-vertex-rwe-adyen-added-to-goldman-sachs-conviction-lists-for-september" },
    ms_vintage: { t: "CNBC — Morgan Stanley's top picks list beat the S&P 500 (Sep 21, 2026)", u: "https://www.cnbc.com/2026/09/21/morgan-stanleys-top-picks-list-beat-the-sp-500-the-last-12-months.html" },
    bofa: { t: "CNBC — Bank of America says these stocks have upside heading into September", u: "https://www.cnbc.com/2026/08/29/bank-of-america-says-these-stocks-have-upside-heading-into-september.html" },
    top2023: { t: "Motley Fool — The 2 best-performing S&P 500 stocks in 2023", u: "https://www.fool.com/investing/2024/01/02/its-official-these-2-best-performing-stocks-2023/" },
    top2023b: { t: "Motley Fool — 10 best-performing S&P 500 stocks in 2023", u: "https://www.fool.com/investing/2024/01/06/10-best-sp-500-stocks-and-best-stock-to-buy-2024/" },
    top2024: { t: "CNBC — The top S&P 500 stock of 2024 returned 340.5%", u: "https://www.cnbc.com/2025/01/13/top-performing-stocks-of-2024.html" },
    top2025: { t: "Motley Fool — What's the best-performing S&P 500 stock in 2025?", u: "https://www.fool.com/investing/2025/12/24/whats-the-best-performing-sp-500-stock-in-2025/" },
    top2025b: { t: "Motley Fool — These 5 S&P 500 stocks are up more than 200% in 2025", u: "https://www.fool.com/investing/2025/12/25/these-5-sp-500-stocks-are-up-more-than-200-in-2025/" },
    neocloud: { t: "24/7 Wall St. — CoreWeave & Nebius are soaring (neocloud ETF)", u: "https://247wallst.com/investing/2026/08/12/coreweave-nebius-are-soaring-this-brand-new-etf-gives-exposure-across-top-neocloud-stocks/" },
    quantum: { t: "24/7 Wall St. — IonQ surges 11% on NVIDIA research-center deal (Sep 23, 2026)", u: "https://247wallst.com/investing/2026/09/23/ionq-surges-11-as-nvidia-research-center-deal-follows-error-decoder-breakthrough-d-wave-climbs-5-rigetti-rises-4/" },
    nuclear: { t: "24/7 Wall St. — NuScale spikes 13%, Oklo climbs 7% (Sep 8, 2026)", u: "https://247wallst.com/investing/2026/09/08/nuscale-power-spikes-13-oklo-climbs-7-is-the-nuclear-selloff-finally-exhausted/" },
    space: { t: "24/7 Wall St. — SpaceX climbs, AST SpaceMobile rallies, Rocket Lab rises (Aug 4, 2026)", u: "https://247wallst.com/investing/2026/08/04/spacex-climbs-4-ast-spacemobile-rallies-9-rocket-lab-rises-5-as-traders-position-for-spacexs-debut-earnings-report/" },
    rvmd: { t: "Revolution Medicines — RASolute 302 overall survival results", u: "https://ir.revmed.com/news-releases/news-release-details/daraxonrasib-demonstrates-unprecedented-overall-survival-benefit" },
    poet: { t: "24/7 Wall St. — One under-the-radar stock with 100% upside potential", u: "https://247wallst.com/investing/2026/09/22/one-under-the-radar-stock-with-100-upside-potential/" },
    mu_sep: { t: "24/7 Wall St. — Micron Wall Street target hits $2,000 (Sep 23, 2026)", u: "https://247wallst.com/investing/2026/09/23/micron-wall-street-target-hits-2000-as-traders-pile-in-before-earnings/" }
  }
};
