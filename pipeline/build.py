"""Build data/generated/dataset.js (and .json) from live public data.

Usage:
    python3 -m pipeline.build              # full run
    python3 -m pipeline.build --quick      # small universe, 3 filers
    python3 -m pipeline.build --skip-13f --skip-macro
"""

import argparse
import datetime as dt
import json
import math
import os
import sys

from . import config, features, fred, ml, prices, sec13f

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data", "generated")


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def load_prices(universe):
    series = {}
    for n, sym in enumerate(universe, 1):
        try:
            rows, src = prices.fetch(sym)
        except Exception as e:  # noqa: BLE001
            log("  [%d/%d] %-6s FAILED: %s" % (n, len(universe), sym, e))
            continue
        if len(rows) < features.LOOKBACK + 5:
            log("  [%d/%d] %-6s skipped (%d rows)" % (n, len(universe), sym, len(rows)))
            continue
        series[sym] = rows
        log("  [%d/%d] %-6s %d rows via %s" % (n, len(universe), sym, len(rows), src))
    return series


def backtest(series):
    """Train on older samples, test on newer ones, with a 1-year embargo."""
    allsamp = []
    for sym, rows in series.items():
        allsamp.extend(features.samples(sym, rows))
    if len(allsamp) < 200:
        raise RuntimeError("not enough samples to fit a model (%d)" % len(allsamp))
    dates = sorted(s["date"] for s in allsamp)
    cutoff = dates[int(len(dates) * 0.7)]
    embargo = (dt.date.fromisoformat(cutoff) - dt.timedelta(days=365)).isoformat()
    train = [s for s in allsamp if s["date"] < embargo]
    test = [s for s in allsamp if s["date"] >= cutoff]
    if len(train) < 100 or len(test) < 50:
        # Short histories: fall back to a plain chronological split.
        train = [s for s in allsamp if s["date"] < cutoff]
        test = [s for s in allsamp if s["date"] >= cutoff]
        embargo = cutoff

    Xtr_raw = [ml.transform(s["x"]) for s in train]
    std = ml.Standardizer().fit(Xtr_raw)
    Xtr = std.apply(Xtr_raw)
    ytr = [s["y"] for s in train]
    w, b = ml.fit_logistic(Xtr, ytr)
    Xte = std.apply([ml.transform(s["x"]) for s in test])
    yte = [s["y"] for s in test]
    ptr, pte = ml.predict(w, b, Xtr), ml.predict(w, b, Xte)

    # Refit on everything for today's scores.
    Xall_raw = [ml.transform(s["x"]) for s in allsamp]
    std_all = ml.Standardizer().fit(Xall_raw)
    w_all, b_all = ml.fit_logistic(std_all.apply(Xall_raw), [s["y"] for s in allsamp])

    buckets = []
    for f in features.FEATURES:
        buckets.append({"feature": f, "label": features.FEATURE_LABELS[f],
                        "buckets": ml.quantile_buckets([s["x"][f] for s in allsamp], [s["y"] for s in allsamp])})

    bt = {
        "horizonDays": config.HORIZON_DAYS,
        "samples": len(allsamp),
        "positives": sum(s["y"] for s in allsamp),
        "baseRate": sum(s["y"] for s in allsamp) / len(allsamp),
        "trainEnd": embargo, "testStart": cutoff,
        "trainN": len(train), "testN": len(test),
        "aucTrain": ml.auc(ptr, ytr), "aucTest": ml.auc(pte, yte),
        "calibration": ml.calibration(pte, yte),
        "coef": [{"feature": features.FEATURE_LABELS[f], "weight": wj} for f, wj in zip(features.FEATURES, w_all)],
    }
    return bt, buckets, (std_all, w_all, b_all)


def score_current(series, model):
    std, w, b = model
    rows = []
    for sym, r in series.items():
        c = features.current(sym, r)
        if not c:
            continue
        c["prob"] = ml.predict(w, b, std.apply([ml.transform(c)]))[0]
        rows.append(c)
    rows.sort(key=lambda r: -r["prob"])
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--quick", action="store_true", help="small universe and 3 filers")
    ap.add_argument("--skip-13f", action="store_true")
    ap.add_argument("--skip-macro", action="store_true")
    ap.add_argument("--tickers", help="comma-separated override of the price universe")
    args = ap.parse_args(argv)

    universe = args.tickers.split(",") if args.tickers else (config.QUICK_UNIVERSE if args.quick else config.UNIVERSE)
    universe = list(dict.fromkeys(t.strip().upper() for t in universe if t.strip()))

    log("Prices: %d tickers" % len(universe))
    series = load_prices(universe)
    if not series:
        log("No price data downloaded. Check network access.")
        return 1

    log("Backtesting doubling model…")
    bt, buckets, model = backtest(series)
    log("  samples=%d base rate=%.2f%% AUC train=%.3f test=%.3f" % (bt["samples"], bt["baseRate"] * 100, bt["aucTrain"], bt["aucTest"]))
    current = score_current(series, model)

    institutions = []
    if not args.skip_13f:
        wanted = config.INSTITUTIONS
        if args.quick:
            wanted = [x for x in wanted if x[0] in config.QUICK_INSTITUTIONS]
        log("13F: %d filers" % len(wanted))
        for name, cik in wanted:
            try:
                inst = sec13f.build_institution(name, cik)
                institutions.append(inst)
                log("  %-28s %s  $%.1fB  %d positions" % (name, inst["period"], inst["total"] / 1e9, inst["positions"]))
            except Exception as e:  # noqa: BLE001
                log("  %-28s FAILED: %s" % (name, e))

    macro = []
    if not args.skip_macro:
        log("FRED: %d series" % len(config.FRED_SERIES))
        for sid, name in config.FRED_SERIES:
            try:
                m = fred.fetch(sid, name)
                if m:
                    macro.append(m)
                    log("  %-14s %s = %.2f" % (sid, m["date"], m["latest"]))
            except Exception as e:  # noqa: BLE001
                log("  %-14s FAILED: %s" % (sid, e))

    all_dates = [r[0] for rows in series.values() for r in (rows[0], rows[-1])]
    dataset = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "universe": len(series),
        "priceStart": min(all_dates), "priceEnd": max(all_dates),
        "backtest": bt, "factorBuckets": buckets, "current": current,
        "institutions": institutions, "macro": macro,
    }
    write(dataset)
    return 0


def write(dataset, out_dir=None):
    out_dir = out_dir or OUT_DIR
    os.makedirs(out_dir, exist_ok=True)
    body = json.dumps(_clean(dataset), separators=(",", ":"), allow_nan=False)
    with open(os.path.join(out_dir, "dataset.json"), "w") as f:
        f.write(body)
    with open(os.path.join(out_dir, "dataset.js"), "w") as f:
        f.write("// Generated by `python3 -m pipeline.build`. Do not edit by hand.\nwindow.GENERATED = ")
        f.write(body)
        f.write(";\n")
    log("Wrote %s (%.1f KB)" % (os.path.join(out_dir, "dataset.js"), len(body) / 1024))


def _clean(o):
    """Replace NaN/inf (e.g. an AUC with no positives) with null for valid JSON."""
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    return o


if __name__ == "__main__":
    sys.exit(main())
