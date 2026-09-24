# Market Atlas

This repository holds two static sites that share a Python data pipeline:

- **Market Atlas** (`index.html`, described below): a breakdown of the current market with a doubling-probability lab.
- **[AI Megacap Forecast](#ai-megacap-forecast)** (`ai-forecast/`): 3-month return forecasts for every AI-related stock worth $100B or more.


A static website with a deep breakdown of the current market. It covers macro and rates, sectors and leaders, what the big banks and hedge funds hold (13F), the banks' published views, a history of stocks that doubled, and a **Doubling Lab** that estimates which names could double.

It has no build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## What's inside

| Tab | Contents |
|---|---|
| **Overview** | 12 headline indicators, the market regime in six points, 2026 key events, key risks, 2026 leaders, and the top doubling candidates |
| **Macro & Rates** | Fed, 10-yr yield, CPI, jobs, GDP, oil-shock timeline, Fed path |
| **Sectors & Leaders** | Index and sector performance, Mag 7 dispersion, best and worst S&P 500 stocks of 2026 |
| **Smart Money (13F)** | Q2 2026 13F values for BlackRock, Morgan Stanley, JPMorgan and Goldman. Manager-by-manager buys and sells for Berkshire, Tepper, Druckenmiller, Ackman, Coatue, Tiger, Bridgewater and Burry. Hedge-fund consensus buys, and a matrix of where managers overlap |
| **Bank Views** | Year-end S&P 500 targets with implied upside. Goldman conviction lists, Morgan Stanley Vintage Values, BofA top ideas |
| **Past Doublers** | S&P 500 returns 1990–2025, case files for every 2023–2026 doubler, and a breakdown of the patterns they followed |
| **Doubling Lab** | 19 candidates scored on 7 factors. Adjustable weights, rates and horizon. P(end ≥ 2×), P(touch 2×), P(touch ½×) and the up/down ratio |
| **Live Model** | Output of the data pipeline: a doubling classifier backtested on real price history, plus full 13F diffs and FRED series |
| **Method & Sources** | Methodology, limitations and all 49 sources |

## Data

### 1. Research snapshot (`data/snapshot.js`)
A curated snapshot dated **2026-09-24**. Every hard number comes from a published report and is cited inline on the page. The numbers are as reported by those outlets and were not re-verified against exchange data. The Doubling Lab factor ratings are analyst judgement based on the cited facts. To update the snapshot, edit that file.

### 2. Live pipeline (`pipeline/`)
Pulls raw data from free public sources using only the Python standard library:

- **Prices**: ~10 years of daily adjusted closes for ~200 tickers (Yahoo Finance chart API, with Stooq as fallback)
- **13F filings**: the two most recent 13F-HR filings for 18 institutions (JPMorgan, Goldman, Morgan Stanley, BofA, Citi, Wells, Vanguard, State Street, BlackRock, Berkshire, Bridgewater, Appaloosa, Duquesne, Pershing Square, Coatue, Tiger, Renaissance, Citadel), from SEC EDGAR. CUSIPs are mapped to tickers via OpenFIGI
- **Macro**: 10 FRED series (yields, curve, fed funds, CPI, unemployment, VIX, Brent, HY spreads, USD)

```bash
export SEC_USER_AGENT="Your Name you@example.com"   # SEC asks for a contact
python3 -m pipeline.build            # full run (a few minutes; responses are cached in pipeline/.cache)
python3 -m pipeline.build --quick    # 30 tickers and 3 filers
python3 -m pipeline.build --tickers NVDA,MU,IREN --skip-13f
```

The pipeline writes `data/generated/dataset.js` and `data/generated/dataset.json`. Reload the page and the **Live Model** tab fills in. The Doubling Lab also switches to *measured* volatility for any candidate in the price universe.

**What the model does:** every ~21 trading days for every ticker, it computes point-in-time features:

- 12-1 month momentum
- 3-month momentum
- 1-yr realised volatility
- drawdown from the 52-week high
- distance from the 200-day average
- volume trend

It labels each sample 1 if the stock closed at 2× or more at any point in the next 252 trading days. A logistic regression is trained on older samples, with a one-year embargo, and tested out-of-sample on newer ones. The output includes AUC, a calibration table and doubling rates by feature quintile. The model is then refit on all data to score today's universe.

## The probability engine (`assets/js/model.js`)

1. **Score** (0–100) is a weighted average of 7 factor ratings, with risk inverted.
2. **Expected return** is μ = risk-free + spread × (score − 50)/50.
3. **Probabilities** come from geometric Brownian motion with drift μ and volatility σ. The engine computes the probability of ending ≥ 2×, plus reflection-principle closed forms for the probability of *touching* 2× or ½× within the horizon.

## Tests

```bash
node tests/model.test.js                                  # closed forms vs 20,000-path Monte Carlo
python3 -m unittest discover -s pipeline/tests -t .       # parsers, 13F diffing, features, ML, end-to-end build
```

## Limitations

- 13F data is at least 45 days old and long-only. Bank filings mostly reflect client assets.
- The price universe is currently-listed tickers only, so survivorship bias inflates historical doubling rates.
- GBM assumes constant volatility and no jumps, so binary events have fatter tails than the model shows.
- **Not investment advice.** The same volatility that makes a double possible makes a 50% drawdown likely, and the site shows both.

---

# AI Megacap Forecast

`ai-forecast/` is a static website with a 3-month forecast for each of the **50 AI-related stocks worth $100B or more** (snapshot of Sep 24, 2026). Visitors see every forecast in one sortable table and can select any stock for its full forecast page.

```bash
cd ai-forecast && python3 -m http.server 8000   # then visit http://localhost:8000
```

Opening `ai-forecast/index.html` directly from disk also works. There is no build step and there are no dependencies.

## Install on a Mac

Run `mac/Install.command` (double-click it in Finder, or `bash mac/Install.command`). It:

1. copies the site and pipeline to `~/Library/Application Support/AI Megacap Forecast/`
2. builds **AI Megacap Forecast.app** in `/Applications` (or `~/Applications`), with its own icon, so it opens from Launchpad, Spotlight or the Dock
3. offers to download ten years of prices right away (needs Python 3.8+)

Opening the app opens the site in the default browser. If the prices are more than 12 hours old, it also refreshes them in the background and posts a notification when they're done. `mac/refresh.sh` updates prices by hand, and `mac/Uninstall.command` removes everything. The app is created on the Mac itself, so Gatekeeper doesn't block it. A downloaded `Install.command` is quarantined, so macOS asks for approval the first time (steps in `mac/Read Me First.txt`).

## What a visitor sees

| Page | Contents |
|---|---|
| **All forecasts** (`#/`) | Expected 3-month return, 50% and 80% outcome ranges on a shared scale, chance of a gain and analyst upside for all 50 stocks. Search, filter by segment and sort. Also shows the average forecast by segment and the stocks just below $100B |
| **Stock page** (`#/s/NVDA`) | Headline expected return and price, probability tiles (gain, ranges, beating the S&P 500, ±20% moves, reaching the analyst target), a fan chart of the forecast path, the drivers of the forecast, every input with its source, bear/base/bull scenarios, the thesis, catalysts and risks, and the earnings date |
| **Method & data** (`#/method`) | The formulas, the signals with their research references, the backtest (once the pipeline has run), inclusion rules, near misses, limitations and all 175 sources |

**Model settings** on every page let a visitor set the S&P 500's 3-month return (bear, base, bull or any value) and the weight on stock-specific signals. Every forecast updates immediately.

## Universe

The universe covers AI chips, foundry and chip equipment, memory and storage, servers and networking, clouds and model owners, AI software and security, AI power, and devices, autonomy and AI holdings. It includes Asian and European listings (TSMC, Samsung, SK Hynix, Tencent, SoftBank, Tokyo Electron, Advantest, MediaTek, Foxconn, SAP) and SpaceX (which owns xAI). Companies whose AI link is incidental, or that are mainly exposed to AI disruption, are excluded. Adobe, Vertiv, Cambricon and SMIC sit just below $100B and are listed as near misses.

All company data lives in `ai-forecast/data/universe.js` with a source for every figure. That covers price, 52-week range, analyst target and rating, latest revenue growth, options-implied volatility, next earnings date, thesis, catalysts and risks. The file body is strict JSON so the Python pipeline can read it too. Figures are as reported by the cited outlets and were not re-verified against exchange data.

## The forecast model (`ai-forecast/assets/forecast.js`)

```
E[R] = rf·T + β·(M − rf·T) + α          T = 63 trading days
α    = σ_resid·√T · Σ w_k·z_k,   w = R⁻¹·IC
ln(1+R) = ln(1+E[R]) − ½σ²T + σ√T·ε      ε ~ unit-variance Student-t(5)
```

- **Risk-free and market.** The 3-month T-bill is 4.11%. The market's 3-month return M defaults to T-bill + 5% equity premium, and each stock moves with its beta.
- **Stock-specific tilt (α).** It comes from cross-sectional z-scores on analyst target upside, closeness to the 52-week high and revenue growth. With price history loaded, 12-1 month momentum and last-month reversal are added. Each signal has a research-based information coefficient (IC) of 0.02–0.04. Weights use the inverse of the signals' correlation matrix so overlapping signals are not double-counted. α is capped at 0.3·σ·√T.
- **Volatility.** Sources in order: option-implied (current level blended with its 52-week norm), then measured from daily prices, then the 52-week range blended with a segment prior.
- **Distribution.** A fat-tailed Student-t, or the empirical shape from the backtest when available, gives the percentiles, probabilities and fan chart. Reaching the analyst target uses the reflection principle.

With realistic ICs the stock-specific view moves forecasts by a few percentage points. The range of outcomes (typically ±15–35% over 3 months) is the main message, and the site says so.

## Measured prices and backtest (`pipeline/ai_forecast.py`)

```bash
python3 -m pipeline.ai_forecast                         # all 50 stocks + SPY
python3 -m pipeline.ai_forecast --tickers NVDA,MU,0700.HK
```

This downloads about ten years of daily prices (Yahoo Finance, with Stooq as fallback for U.S. symbols) and writes `ai-forecast/data/generated/forecast.js`. Reload the page and it switches to measured inputs:

- price, exact 52-week range, 12-1 momentum, last-month return, 63- and 252-day volatility, weekly beta vs SPY (Blume-adjusted on the site), YTD, and nine months of closes for the fan chart
- per-stock base rates of past 3-month returns
- a **walk-forward backtest** on month-end samples:
  - each price signal's rank IC against the next 63-day volatility-scaled return, with overlap-adjusted t-stats
  - the out-of-sample IC, hit rate and top-minus-bottom-fifth spread of the combined score, using only ICs known at the time
  - the coverage of the 50% and 80% bands
- the empirical shape of standardised 3-month returns

Measured ICs are averaged 50/50 with the research priors. The committed `forecast.js` is a placeholder (`null`), so the site runs on the research snapshot until you run the pipeline.

## Tests

```bash
node tests/ai_forecast.test.js                               # engine + data checks
python3 -m unittest pipeline.tests.test_ai_forecast          # measurements, backtest, end-to-end build
```

The JS tests check the Student-t and normal functions against table values and the touch probability against Monte Carlo. They also check that the forecast decomposition adds up, quantiles are monotone and simulated outcomes match the forecast. On the data side they check the market and signal-weight settings, the switch to pipeline data, and that every stock is at least $100B with sourced, consistent figures. The Python tests cover volatility, beta, no look-ahead, calibration on random walks, detection of a planted reversal effect and an end-to-end build with a stubbed download.

## Limitations

- **Not investment advice.** Forecasts are model outputs under stated assumptions.
- Snapshot prices are a mix of Sep 18–24, 2026 closes (each page shows its date). A few inputs are estimates and are flagged: CEG's price is implied from its reported 52-week distances, and Corning's is the midpoint of its Sep 23 range. Earnings dates are estimated unless marked confirmed.
- Research ICs come from broad U.S. samples; a concentrated AI universe in a boom may behave differently.
- Returns are in each stock's trading currency; currency moves are not modelled.
- Measured history has survivorship bias (today's listed winners only).
