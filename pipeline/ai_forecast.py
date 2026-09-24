"""Price history and backtest for the AI Megacap Forecast site (ai-forecast/).

Reads the stock universe from ai-forecast/data/universe.js, downloads about ten
years of daily prices for every stock and for SPY, and writes
ai-forecast/data/generated/forecast.js (plus a .json copy). The site then
switches from research estimates to measured inputs:

- per stock: latest price and date, exact 52-week range, 12-1 month momentum,
  last-month return, realised volatility (63 and 252 days), beta against SPY
  from two years of weekly returns, YTD and 1-year return, base rates for past
  3-month returns, and the last ~9 months of closes for the chart
- a walk-forward backtest across the whole universe: the information
  coefficient (IC) of each price signal against the next 63-day
  volatility-scaled return, the out-of-sample performance of the combined
  score, and how often realised 3-month returns landed inside the model's
  50% and 80% bands
- the empirical shape of standardised 3-month returns, which replaces the
  default Student-t in the fan charts

Usage:
    python3 -m pipeline.ai_forecast
    python3 -m pipeline.ai_forecast --tickers NVDA,MU,0700.HK
"""

import argparse
import datetime as dt
import json
import math
import os
import re
import sys
from collections import defaultdict

from . import prices
from .build import _clean

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNIVERSE_JS = os.path.join(ROOT, "ai-forecast", "data", "universe.js")
OUT_DIR = os.path.join(ROOT, "ai-forecast", "data", "generated")

BENCHMARK = "SPY"
HORIZON = 63           # forecast horizon, trading days (~3 months)
YEAR = 252
MONTH = 21
HISTORY_DAYS = 190     # closes exported for the chart
MIN_CROSS = 8          # stocks needed in a month to measure a cross-sectional IC
MIN_TRAIN_MONTHS = 24  # history needed before the combined score is scored out of sample
OVERLAP = HORIZON // MONTH  # monthly samples of 63-day returns overlap 3-fold

SIGNALS = ("mom", "rev", "high52")
# Priors and settings shared with ai-forecast/assets/forecast.js.
IC_PRIOR = {"mom": 0.04, "rev": 0.02, "high52": 0.04}
IC_MEASURED_WEIGHT = 0.5
CORR_SHRINK = 0.5
WINSOR = 2.5

QUANTILES = [0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.975, 0.99]
# Unit-variance Student-t (5 d.f.) band edges used by the site by default.
T5 = {p: q * math.sqrt(3 / 5) for p, q in {0.1: -1.475884, 0.25: -0.726687, 0.75: 0.726687, 0.9: 1.475884}.items()}


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def load_universe(path=UNIVERSE_JS):
    """Parse the JSON body of universe.js (everything after `window.AI_UNIVERSE =`)."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    m = re.search(r"^window\.AI_UNIVERSE\s*=\s*", text, re.M)
    if not m:
        raise ValueError("window.AI_UNIVERSE assignment not found in %s" % path)
    body = text[m.end():].strip()
    if body.endswith(";"):
        body = body[:-1]
    return json.loads(body)


# ---------------------------------------------------------------------------
# Statistics helpers
# ---------------------------------------------------------------------------

def mean(xs):
    return sum(xs) / len(xs)


def stdev(xs):
    if len(xs) < 2:
        return 0.0
    mu = mean(xs)
    return math.sqrt(sum((x - mu) ** 2 for x in xs) / (len(xs) - 1))


def quantile(sorted_xs, p):
    """Linear-interpolated quantile of an already sorted list."""
    if not sorted_xs:
        return None
    k = (len(sorted_xs) - 1) * p
    lo = int(math.floor(k))
    hi = min(lo + 1, len(sorted_xs) - 1)
    return sorted_xs[lo] + (sorted_xs[hi] - sorted_xs[lo]) * (k - lo)


def ranks(xs):
    """Ranks starting at 1, ties get the average rank."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    out = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            out[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return out


def pearson(xs, ys):
    mx, my = mean(xs), mean(ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx <= 0 or syy <= 0:
        return None
    return sxy / math.sqrt(sxx * syy)


def spearman(xs, ys):
    return pearson(ranks(xs), ranks(ys))


def solve(a, b):
    """Gauss-Jordan elimination with partial pivoting for a small dense system."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(m[r][col]))
        if abs(m[piv][col]) < 1e-12:
            raise ValueError("singular matrix")
        m[col], m[piv] = m[piv], m[col]
        for r in range(n):
            if r != col:
                f = m[r][col] / m[col][col]
                for c in range(col, n + 1):
                    m[r][c] -= f * m[col][c]
    return [m[i][n] / m[i][i] for i in range(n)]


def summarize(values, overlap=OVERLAP):
    """Mean, dispersion and an overlap-adjusted t-statistic of monthly values."""
    vals = [v for v in values if v is not None]
    if len(vals) < 3:
        return {"mean": None, "sd": None, "t": None, "n": len(vals)}
    mu, sd = mean(vals), stdev(vals)
    t = mu / sd * math.sqrt(len(vals) / overlap) if sd > 0 else None
    return {"mean": mu, "sd": sd, "t": t, "n": len(vals)}


# ---------------------------------------------------------------------------
# Per-stock measurements
# ---------------------------------------------------------------------------

def realised_vol(closes, end, n):
    """Annualised volatility of daily log returns over the n days ending at index `end`."""
    n = min(n, end)
    if n < 20:
        return None
    rets = [math.log(closes[j] / closes[j - 1]) for j in range(end - n + 1, end + 1)]
    return stdev(rets) * math.sqrt(YEAR)


def blended_vol(vol63, vol252):
    """The ex-ante volatility the site uses when only measured data is available."""
    if vol63 is None or vol252 is None:
        return None
    return math.sqrt(0.5 * vol63 ** 2 + 0.5 * vol252 ** 2)


def signals_at(closes, i):
    """Price signals using data up to and including index i (no look-ahead)."""
    if i < YEAR:
        return None
    hi = max(closes[i - YEAR + 1:i + 1])
    return {
        "mom": math.log(closes[i - MONTH] / closes[i - YEAR]),
        "rev": -math.log(closes[i] / closes[i - MONTH]),
        "high52": math.log(closes[i] / hi),
        "vol": blended_vol(realised_vol(closes, i, 63), realised_vol(closes, i, YEAR)),
    }


def weekly_beta(rows, bench_rows, weeks=104):
    """Beta against the benchmark from weekly log returns on shared dates.

    Weekly sampling limits the bias from stocks that close before New York does.
    """
    if not bench_rows:
        return None
    bench = {r[0]: r[1] for r in bench_rows}
    common = [(r[1], bench[r[0]]) for r in rows if r[0] in bench]
    common = common[-(weeks * 5 + 1):]
    pts = common[::-1][::5][::-1]
    if len(pts) < 27:
        return None
    xs = [math.log(b1 / b0) for (_, b0), (_, b1) in zip(pts, pts[1:])]
    ys = [math.log(s1 / s0) for (s0, _), (s1, _) in zip(pts, pts[1:])]
    mx, my = mean(xs), mean(ys)
    var = sum((x - mx) ** 2 for x in xs)
    if var <= 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / var


def base_rates(closes):
    """Distribution of past 63-day returns, sampled every 21 trading days."""
    rets = sorted(closes[i + HORIZON] / closes[i] - 1 for i in range(0, len(closes) - HORIZON, MONTH))
    if len(rets) < 4:
        return None
    return {
        "n": len(rets),
        "pos": sum(1 for r in rets if r > 0) / len(rets),
        "p10": quantile(rets, 0.1), "p50": quantile(rets, 0.5), "p90": quantile(rets, 0.9),
    }


def _sig(x, digits=6):
    return float("%.*g" % (digits, x))


def measure(rows, bench_rows=None):
    """Current measured inputs for one stock from [(date, close, volume)] rows."""
    dates = [r[0] for r in rows]
    closes = [r[1] for r in rows]
    i = len(closes) - 1
    last = closes[i]
    window = closes[max(0, i - YEAR + 1):]
    year_start = dates[i][:4] + "-01-01"
    prior = [c for d, c in zip(dates, closes) if d < year_start]
    return {
        "asOf": dates[i],
        "price": last,
        "hi52": max(window),
        "lo52": min(window),
        "days": len(closes),
        "vol63": realised_vol(closes, i, 63),
        "vol252": realised_vol(closes, i, YEAR),
        "ret1m": last / closes[i - MONTH] - 1 if i >= MONTH else None,
        "mom12_1": closes[i - MONTH] / closes[i - YEAR] - 1 if i >= YEAR else None,
        "ret1y": last / closes[i - YEAR] - 1 if i >= YEAR else None,
        "ytd": last / prior[-1] - 1 if prior else None,
        "beta": weekly_beta(rows, bench_rows),
        "base": base_rates(closes),
        "history": [[d, _sig(c)] for d, c in zip(dates[-HISTORY_DAYS:], closes[-HISTORY_DAYS:])],
    }


# ---------------------------------------------------------------------------
# Backtest
# ---------------------------------------------------------------------------

def month_end_indices(dates):
    return [k for k in range(len(dates) - 1) if dates[k][:7] != dates[k + 1][:7]]


def samples(series):
    """Month-end samples per stock: signals, ex-ante volatility and the next 63-day return."""
    by_month = defaultdict(list)
    for t, rows in series.items():
        dates = [r[0] for r in rows]
        closes = [r[1] for r in rows]
        for i in month_end_indices(dates):
            if i + HORIZON >= len(closes):
                break
            x = signals_at(closes, i)
            if not x or not x["vol"]:
                continue
            s = x["vol"] * math.sqrt(HORIZON / YEAR)
            fwd = math.log(closes[i + HORIZON] / closes[i])
            by_month[dates[i][:7]].append({"t": t, "x": x, "fwd": fwd, "s": s, "y": fwd / s})
    return {m: v for m, v in by_month.items() if len(v) >= MIN_CROSS}


def zscores(values):
    mu, sd = mean(values), stdev(values)
    if sd <= 0:
        return [0.0] * len(values)
    return [max(-WINSOR, min(WINSOR, (v - mu) / sd)) for v in values]


def composite(month_samples, ics):
    """The site's combined score: z-scores weighted by (shrunk correlation)^-1 · IC."""
    z = {k: zscores([s["x"][k] for s in month_samples]) for k in SIGNALS}
    n = len(month_samples)
    corr = [[1.0 if a == b else (1 - CORR_SHRINK) * (sum(z[a][i] * z[b][i] for i in range(n)) / n) /
             max(1e-12, math.sqrt(sum(v * v for v in z[a]) / n * sum(v * v for v in z[b]) / n))
             for b in SIGNALS] for a in SIGNALS]
    w = solve(corr, [ics[k] for k in SIGNALS])
    return [sum(w[j] * z[k][i] for j, k in enumerate(SIGNALS)) for i in range(n)]


def backtest(series):
    by_month = samples(series)
    months = sorted(by_month)
    if len(months) < MIN_TRAIN_MONTHS + OVERLAP + 3:
        raise RuntimeError("not enough history for a backtest (%d usable months)" % len(months))

    # 1. Each price signal's monthly rank IC against the next risk-adjusted return.
    ic_by_month = {k: {} for k in SIGNALS}
    for m in months:
        ss = by_month[m]
        ys = [s["y"] for s in ss]
        for k in SIGNALS:
            ic_by_month[k][m] = spearman([s["x"][k] for s in ss], ys)
    ic = {k: summarize([ic_by_month[k][m] for m in months]) for k in SIGNALS}

    # 2. The combined score, scored out of sample: month m only uses ICs from
    #    months whose 63-day windows had closed before m.
    oos_ic, hits, spreads = [], [], []
    for idx in range(MIN_TRAIN_MONTHS + OVERLAP, len(months)):
        train = months[:idx - OVERLAP]
        est = {}
        for k in SIGNALS:
            vals = [ic_by_month[k][m] for m in train if ic_by_month[k][m] is not None]
            measured = mean(vals) if vals else IC_PRIOR[k]
            est[k] = max(-0.1, min(0.1, IC_MEASURED_WEIGHT * measured + (1 - IC_MEASURED_WEIGHT) * IC_PRIOR[k]))
        ss = by_month[months[idx]]
        score = composite(ss, est)
        ys = [s["y"] for s in ss]
        oos_ic.append(spearman(score, ys))
        ybar = mean(ys)
        hits.append(sum(1 for sc, y in zip(score, ys) if (sc > 0) == (y > ybar)) / len(ys))
        order = sorted(range(len(ss)), key=lambda i: score[i])
        q = max(1, len(ss) // 5)
        top = mean([math.exp(ss[i]["fwd"]) - 1 for i in order[-q:]])
        bottom = mean([math.exp(ss[i]["fwd"]) - 1 for i in order[:q]])
        spreads.append(top - bottom)

    # 3. Band calibration. Standardise each realised 63-day log return by its
    #    ex-ante volatility, centred on the median outcome, and compare with
    #    the unit-variance Student-t bands the site draws by default.
    zs = []
    for m in months:
        for s in by_month[m]:
            zs.append(s["y"] + s["s"] / 2)
    zs.sort()
    med = quantile(zs, 0.5)
    zc = [z - med for z in zs]
    cover80 = sum(1 for z in zc if T5[0.1] <= z <= T5[0.9]) / len(zc)
    cover50 = sum(1 for z in zc if T5[0.25] <= z <= T5[0.75]) / len(zc)

    oos = summarize(oos_ic)
    return {
        "start": months[0], "end": months[-1], "months": len(months),
        "samples": sum(len(by_month[m]) for m in months),
        "horizonDays": HORIZON,
        "ic": ic,
        "model": {
            "months": len(oos_ic), "ic": oos["mean"], "icT": oos["t"],
            "hit": mean(hits), "spread": mean(spreads), "spreadT": summarize(spreads)["t"],
        },
        "calibration": {"n": len(zc), "sd": stdev(zc), "cover80": cover80, "cover50": cover50},
        "zq": {"p": QUANTILES, "z": [quantile(zc, p) for p in QUANTILES]},
    }


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def fetch_all(universe_stocks, fetch=prices.fetch):
    series, failed = {}, []
    for n, s in enumerate(universe_stocks, 1):
        sym = s["y"]
        try:
            rows, src = fetch(sym)
        except Exception as e:  # noqa: BLE001
            log("  [%d/%d] %-10s FAILED: %s" % (n, len(universe_stocks), sym, e))
            failed.append(s["t"])
            continue
        if len(rows) < 40:
            log("  [%d/%d] %-10s skipped (%d rows)" % (n, len(universe_stocks), sym, len(rows)))
            failed.append(s["t"])
            continue
        series[s["t"]] = rows
        log("  [%d/%d] %-10s %d rows via %s" % (n, len(universe_stocks), sym, len(rows), src))
    return series, failed


def build(universe, fetch=prices.fetch):
    stocks = universe["stocks"]
    log("Benchmark %s" % BENCHMARK)
    try:
        bench_rows, _ = fetch(BENCHMARK)
    except Exception as e:  # noqa: BLE001
        log("  benchmark FAILED (%s); betas will be estimated on the site" % e)
        bench_rows = None
    log("Prices: %d stocks" % len(stocks))
    series, failed = fetch_all(stocks, fetch)
    if not series:
        raise RuntimeError("no price data downloaded; check network access")

    measured = {t: measure(rows, bench_rows) for t, rows in series.items()}
    log("Backtesting…")
    try:
        bt = backtest(series)
        log("  %s → %s, %d months, %d samples; combined out-of-sample IC %.3f (t %.1f), 80%% band coverage %.0f%%" % (
            bt["start"], bt["end"], bt["months"], bt["samples"], bt["model"]["ic"] or float("nan"),
            bt["model"]["icT"] or float("nan"), bt["calibration"]["cover80"] * 100))
    except RuntimeError as e:
        log("  skipped: %s" % e)
        bt = None

    all_dates = [r[0] for rows in series.values() for r in (rows[0], rows[-1])]
    return {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "benchmark": BENCHMARK if bench_rows else None,
        "horizonDays": HORIZON,
        "priceStart": min(all_dates), "priceEnd": max(all_dates),
        "universe": len(series), "failed": failed,
        "stocks": measured,
        "backtest": bt,
    }


def write(dataset, out_dir=None):
    out_dir = out_dir or OUT_DIR
    os.makedirs(out_dir, exist_ok=True)
    body = json.dumps(_clean(dataset), separators=(",", ":"), allow_nan=False)
    with open(os.path.join(out_dir, "forecast.json"), "w") as f:
        f.write(body)
    with open(os.path.join(out_dir, "forecast.js"), "w") as f:
        f.write("// Generated by `python3 -m pipeline.ai_forecast`. Do not edit by hand.\nwindow.AI_GENERATED = ")
        f.write(body)
        f.write(";\n")
    log("Wrote %s (%.1f KB)" % (os.path.join(out_dir, "forecast.js"), len(body) / 1024))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tickers", help="comma-separated subset of display tickers (default: whole universe)")
    ap.add_argument("--universe", default=UNIVERSE_JS, help="path to universe.js")
    ap.add_argument("--out", default=None, help="output directory (default: ai-forecast/data/generated)")
    args = ap.parse_args(argv)

    universe = load_universe(args.universe)
    if args.tickers:
        wanted = {t.strip().upper() for t in args.tickers.split(",") if t.strip()}
        universe["stocks"] = [s for s in universe["stocks"] if s["t"].upper() in wanted]
        if not universe["stocks"]:
            log("None of %s are in the universe." % ", ".join(sorted(wanted)))
            return 1
    try:
        dataset = build(universe)
    except RuntimeError as e:
        log(str(e))
        return 1
    write(dataset, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
