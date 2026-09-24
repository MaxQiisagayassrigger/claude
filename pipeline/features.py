"""Point-in-time features and forward doubling labels from a price series."""

import math

from . import config

FEATURES = ["mom12_1", "mom3", "vol", "dd52", "above200", "volTrend"]
FEATURE_LABELS = {
    "mom12_1": "12-1 month momentum",
    "mom3": "3-month momentum",
    "vol": "1-yr realised volatility",
    "dd52": "Drawdown from 52-wk high",
    "above200": "Distance from 200-day avg",
    "volTrend": "Volume trend (20d vs 1y)",
}
LOOKBACK = 252


def features_at(closes, volumes, i):
    """Features using only data up to and including index i (no look-ahead)."""
    if i < LOOKBACK:
        return None
    p = closes
    rets = [math.log(p[j] / p[j - 1]) for j in range(i - LOOKBACK + 1, i + 1)]
    mean = sum(rets) / len(rets)
    vol = math.sqrt(sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)) * math.sqrt(252)
    hi = max(p[i - LOOKBACK + 1:i + 1])
    ma200 = sum(p[i - 199:i + 1]) / 200
    vt = 0.0
    vv = volumes[i - LOOKBACK + 1:i + 1]
    if all(v is not None for v in vv):
        long_avg = sum(vv) / len(vv)
        short_avg = sum(vv[-20:]) / 20
        if long_avg > 0 and short_avg > 0:
            vt = math.log(short_avg / long_avg)
    return {
        "mom12_1": p[i - 21] / p[i - LOOKBACK] - 1,
        "mom3": p[i] / p[i - 63] - 1,
        "vol": vol,
        "dd52": p[i] / hi - 1,
        "above200": p[i] / ma200 - 1,
        "volTrend": vt,
    }


def doubled_within(closes, i, horizon=config.HORIZON_DAYS, k=config.DOUBLE):
    """1 if any close in (i, i+horizon] is >= k × close[i]; None if window incomplete."""
    if i + horizon >= len(closes):
        return None
    base = closes[i]
    return 1 if max(closes[i + 1:i + horizon + 1]) >= k * base else 0


def samples(ticker, rows, every=config.SAMPLE_EVERY):
    """Monthly (date, features, label) samples with a complete forward window."""
    closes = [r[1] for r in rows]
    vols = [r[2] for r in rows]
    out = []
    for i in range(LOOKBACK, len(rows), every):
        y = doubled_within(closes, i)
        if y is None:
            break
        f = features_at(closes, vols, i)
        if f:
            out.append({"ticker": ticker, "date": rows[i][0], "x": f, "y": y})
    return out


def current(ticker, rows):
    closes = [r[1] for r in rows]
    vols = [r[2] for r in rows]
    i = len(rows) - 1
    f = features_at(closes, vols, i)
    if not f:
        return None
    f.update({"ticker": ticker, "price": closes[i], "asOf": rows[i][0], "ret1y": closes[i] / closes[i - LOOKBACK] - 1})
    return f
