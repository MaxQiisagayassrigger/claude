# Broad Street Exchange

A simulated US market you can trade. It has 552 stocks, 51 ETFs, listed options, Treasuries, corporate and municipal bonds, futures, spot FX, 14 crypto coins and crypto perpetuals. You can go long or short, with margin, in a cash, Reg T or portfolio-margin account. A macro economy with a business cycle, a rule-following Fed and scheduled data releases drives prices.

Every company, coin, bond issuer and headline is fictional. Prices come from a model, not from real markets.

Like the rest of this repo, it has no build step and no dependencies. Open `simulator/index.html` in a browser, or serve the repo:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000/simulator/
```

## Playing

- **Clock**: press ▶ or <kbd>Space</kbd>. Each step is 15 minutes of market time; speeds run from 15 minutes to a week per second. <kbd>.</kbd> steps once, <kbd>N</kbd> runs to the next close, and **+1 wk** and **+1 mo** fast-forward. The session runs 9:30 am to 4:00 pm ET on real NYSE trading days and holidays. Nights and weekends pass in one step, and crypto, FX and futures keep moving through them.
- **Trading**: search any symbol (<kbd>/</kbd>) or click a tile, heatmap cell, table row or headline ticker. The trade window shows a chart (1D to 2Y, line or candles, moving averages), key stats, your position, news, price alerts and an order ticket. The ticket previews the fill price, fees and the change in margin before you confirm.
- **Saving**: the game saves itself to IndexedDB in your browser. Settings can start a new game (seed, starting cash, account type, start date), switch the account type, and export or import a save file.

## What you can trade

| Market | Details |
|---|---|
| Stocks | 552 companies in 11 sectors and 50+ industries. Market caps range from $4.4T to $3.5B, shaped like the real large-cap market (top 10 ≈ 35% of value). Each has a P/E, EPS, dividend schedule, earnings dates, beta, short interest and borrow fee. |
| ETFs | Index funds (US 500, Tech 100, Industrial 30, Small Cap 200, total market, dividend), 11 sector and 5 industry funds, 2× and 3× leveraged and inverse funds (daily reset), Treasury, corporate, high-yield, muni and TIPS funds, gold, silver, oil, gas, agriculture and broad commodity funds, two spot crypto trusts and a volatility ETN. |
| Options | Calls and puts on every stock and ETF (American, physically settled), plus European cash-settled options on three indices. Weekly, monthly, quarterly and LEAPS expirations. The builder has 18 presets, a payoff chart, breakevens, probability of profit, Greeks and the buying-power effect. It handles auto-exercise and assignment at expiry, early assignment before ex-dividend dates, manual exercise, and adjustments for stock splits. |
| Bonds | Treasury bills, notes and bonds auctioned monthly or quarterly, older off-the-run issues, 40+ corporates rated AAA to CCC, and municipal bonds with tax-equivalent yield. Prices are quoted clean per 100; buyers pay accrued interest; coupons and principal are paid in cash. |
| Futures | US 500 (standard and micro), Tech 100, Small Cap 200, crude, natural gas, gold, silver, copper, corn, wheat, soybeans, 10-year and 30-year Treasuries, and a crypto future. Prices include cost of carry, positions are marked to market at each close, margins rise with volatility, and contracts cash-settle at expiry. |
| Spot FX | 8 USD pairs at 50:1 (majors) or 20:1, traded in lots of 100,000 base currency, with daily swaps from interest-rate differentials. |
| Crypto | 14 coins including two stablecoins. They trade around the clock, pay staking rewards, and run on their own bull/range/winter cycle. Perpetuals on 6 coins go up to 20× leverage and pay or receive funding every 8 hours. |

## Account rules

- **Cash account**: no borrowing or shorting. Options are limited to buying, covered calls and cash-secured puts.
- **Reg T margin**: 50% initial and 25% maintenance on stock. Leveraged ETFs need more (2× funds 50%, 3× funds 75%); shares under $3 and very volatile names need more too. Shorts need 150% initial, and maintenance is the greater of 30% or $5 a share. Treasuries need 1–6% by maturity; corporates 20–40%.
- **Option margin (Reg T, strategy-based)**: covered positions need nothing extra; spreads need their maximum loss; naked options need 20% of the underlying (15% for indices) less the out-of-the-money amount, with a 10% floor.
- **Portfolio margin**: each underlying's stock and options are stress-tested over ±15% (±8% for broad indices, scaled for leveraged funds). The requirement is the worst loss. Needs $100,000 of equity.
- **Costs**: $0.65 per option contract, $2.25 per futures contract, 0.25% on crypto, SEC and FINRA fees on sales, and market impact for large orders. Margin loans pay the Fed funds rate plus 1–3%; idle cash earns the Fed rate minus 0.5%; short stock pays a borrow fee and any dividends.
- **Margin calls**: when equity falls below maintenance, you have until the next day's close to fix it. Below half of maintenance, or at the deadline, the broker liquidates the positions with the largest requirements.

## How prices move

Each module in `js/core/` starts with a comment that documents its model.

- **Economy** (`economy.js`): a five-state business cycle (expansion, boom, slowdown, recession, recovery) sets latent growth. Core inflation is sticky; energy moves headline CPI for about a year. Unemployment follows Okun's law. The Fed meets 8 times a year and moves toward a Taylor-rule target. The Treasury curve is the expected policy path plus a term premium. Jobs, CPI, GDP, retail sales, ISM and FOMC releases arrive with a consensus, and the surprise moves markets.
- **Stocks** (`market.js`): log returns = beta × market shock + sector shock + a stock-specific drift + idiosyncratic noise with fat tails. The market shock has stochastic volatility, negatively correlated with returns. Sectors react to oil and to the 10-year yield. Expected returns fall when valuations are rich and rise when they are cheap. Quarterly earnings move stocks on the surprise versus estimates. Dividends go ex on schedule, and high-priced shares split.
- **Other assets**: crypto has its own factor and regime. Commodities are mean-reverting with contango or backwardation. FX pairs share a dollar factor that responds to rates and risk. Bonds price off the curve plus credit spreads that widen with the cycle, volatility and the issuer's stock. Futures follow spot plus carry. Leveraged ETFs reset daily, so their long-run returns decay in volatile markets.
- **News** (`events.js`): upgrades and downgrades, guidance changes, lawsuits, FDA decisions, trial results, takeovers, short squeezes, short-seller reports, sector shocks (chip export curbs, drug pricing, tariffs, OPEC, hurricanes, droughts), market-wide shocks (wars, flash crashes, credit scares, rare crashes) and crypto events.
- **Options** (`options.js`): implied volatility comes from the same state that drives prices. It has a term structure that reverts to the long-run level, a downside skew, and a bump before earnings that collapses after. Prices are Black–Scholes–Merton, floored at intrinsic value for American contracts.

Each new game first runs one year of daily history as a steady expansion, so charts and 52-week ranges are filled from the first minute.

## Files

```
simulator/
  index.html            page shell
  css/sim.css           styles (same color tokens as Market Atlas)
  js/core/              the simulation; no DOM access, runs in Node for tests
    rng.js              seeded random numbers (saved with the game)
    calendar.js         NYSE holidays, expirations, FOMC and release dates
    pricing.js          Black–Scholes, Greeks, implied vol, bond math
    universe.js         the 552 companies, ETFs, coins, commodities, FX, futures
    economy.js          business cycle, inflation, jobs, Fed, yield curve
    events.js           news and shocks
    market.js           price dynamics, indices, ETFs, bonds, futures, corporate actions
    options.js          chains, volatility surface, quotes
    broker.js           orders, fills, fees, margin, expiries, interest, liquidation
    sim.js              the clock, new games, save and restore
  js/ui/                app shell, charts, trade window, settings and one file per page
```

## Tests

```bash
for f in tests/sim/*.test.js; do node "$f"; done
```

- **Pricing**: reference values, put–call parity, Greeks against finite differences, implied-vol round trips, and bond duration and convexity.
- **Calendar**: 2026–27 NYSE holidays, expirations and FOMC dates.
- **Universe**: size, uniqueness and market shape.
- **Broker**: every order type, cash-account rules, Reg T, short margin, margin calls and liquidation, exercise, assignment and cash settlement, spread and naked option margin, portfolio margin, futures, FX, perpetuals, bonds, dividends, splits and time-weighted returns.
- **Engine**: determinism, save/restore, JSON export, a one-year random-trading fuzz run, and volatility ranges.
