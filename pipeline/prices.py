"""Daily price history: Yahoo Finance chart API, with Stooq CSV as fallback."""

import csv
import datetime as dt
import io
import json
import sys
import time

from . import config, net


def parse_yahoo(payload):
    """Parse a v8 chart response into [(date, adj_close, volume)], oldest first."""
    if isinstance(payload, (bytes, str)):
        payload = json.loads(payload)
    chart = payload.get("chart") or {}
    if chart.get("error"):
        raise ValueError(str(chart["error"]))
    res = (chart.get("result") or [None])[0]
    if not res or not res.get("timestamp"):
        return []
    ts = res["timestamp"]
    ind = res.get("indicators", {})
    quote = (ind.get("quote") or [{}])[0]
    adj = (ind.get("adjclose") or [{}])[0].get("adjclose")
    closes = adj if adj else quote.get("close", [])
    vols = quote.get("volume") or [None] * len(ts)
    out = []
    for t, c, v in zip(ts, closes, vols):
        if c is None or c <= 0:
            continue
        d = dt.datetime.fromtimestamp(t, tz=dt.timezone.utc).date().isoformat()
        out.append((d, float(c), float(v) if v is not None else None))
    # Yahoo occasionally repeats the last bar; keep the latest per date.
    dedup = {}
    for row in out:
        dedup[row[0]] = row
    return [dedup[k] for k in sorted(dedup)]


def parse_stooq(text):
    """Parse Stooq daily CSV (Date,Open,High,Low,Close,Volume)."""
    if isinstance(text, bytes):
        text = text.decode("utf-8", "replace")
    rows = []
    reader = csv.DictReader(io.StringIO(text))
    for r in reader:
        try:
            c = float(r["Close"])
        except (KeyError, TypeError, ValueError):
            continue
        if c <= 0:
            continue
        v = r.get("Volume")
        rows.append((r["Date"], c, float(v) if v not in (None, "") else None))
    rows.sort()
    return rows


def fetch(symbol, years=config.YEARS_OF_HISTORY):
    end = int(time.time())
    start = end - int(years * 365.25 * 86400)
    url = ("https://query2.finance.yahoo.com/v8/finance/chart/%s?period1=%d&period2=%d&interval=1d&events=div%%2Csplit"
           % (symbol, start, end))
    try:
        rows = parse_yahoo(net.get(url, headers={"User-Agent": config.BROWSER_UA}, ttl_hours=12, min_interval=0.4))
        if rows:
            return rows, "yahoo"
    except Exception as e:  # noqa: BLE001 — fall through to Stooq
        print("  yahoo failed for %s: %s" % (symbol, e), file=sys.stderr)
    stooq_sym = symbol.lower().replace("-", ".") + ".us"
    rows = parse_stooq(net.get("https://stooq.com/q/d/l/?s=%s&i=d" % stooq_sym, ttl_hours=12, min_interval=0.5))
    cutoff = (dt.date.today() - dt.timedelta(days=int(years * 365.25))).isoformat()
    return [r for r in rows if r[0] >= cutoff], "stooq"
