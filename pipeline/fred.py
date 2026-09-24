"""FRED macro series via the key-less fredgraph CSV endpoint."""

import csv
import datetime as dt
import io

from . import net


def parse_csv(text):
    """Return [(date, value)] skipping FRED's '.' missing markers."""
    if isinstance(text, bytes):
        text = text.decode("utf-8", "replace")
    rows = []
    reader = csv.reader(io.StringIO(text))
    next(reader, None)  # header: DATE/observation_date, SERIES
    for r in reader:
        if len(r) < 2:
            continue
        try:
            rows.append((r[0], float(r[1])))
        except ValueError:
            continue
    return rows


def summarize(sid, name, rows):
    if not rows:
        return None
    last_d, last_v = rows[-1]
    target = (dt.date.fromisoformat(last_d) - dt.timedelta(days=365)).isoformat()
    year_ago = None
    for d, v in reversed(rows):
        if d <= target:
            year_ago = v
            break
    # Downsample to at most ~260 points for the page.
    step = max(1, len(rows) // 260)
    return {
        "id": sid, "name": name, "latest": last_v, "date": last_d,
        "change1y": None if year_ago is None else last_v - year_ago,
        "series": rows[::step],
    }


def fetch(sid, name, start="2016-01-01"):
    raw = net.get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=%s&cosd=%s" % (sid, start), ttl_hours=12)
    return summarize(sid, name, parse_csv(raw))
