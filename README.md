# Market Atlas

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
