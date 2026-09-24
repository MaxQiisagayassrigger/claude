"""SEC EDGAR 13F-HR: locate filings, parse information tables, diff quarters."""

import re
import sys
import xml.etree.ElementTree as ET

from . import config, net

SEC_HEADERS = {"User-Agent": config.SEC_USER_AGENT, "Accept-Encoding": "identity"}


def latest_13f_filings(cik, count=2):
    """Return up to `count` most recent original 13F-HR filings, newest first.

    Each item: {accession, filingDate, reportDate}. Amendments (13F-HR/A) are
    ignored; if a period was filed twice, the later filing wins.
    """
    sub = net.get_json("https://data.sec.gov/submissions/CIK%s.json" % cik.zfill(10),
                       headers=SEC_HEADERS, ttl_hours=12, min_interval=0.15)
    return select_filings(sub.get("filings", {}).get("recent", {}), count)


def select_filings(recent, count=2):
    by_period = {}
    forms = recent.get("form", [])
    for i, form in enumerate(forms):
        if form != "13F-HR":
            continue
        item = {
            "accession": recent["accessionNumber"][i],
            "filingDate": recent["filingDate"][i],
            "reportDate": recent["reportDate"][i],
        }
        prev = by_period.get(item["reportDate"])
        if prev is None or item["filingDate"] > prev["filingDate"]:
            by_period[item["reportDate"]] = item
    return [by_period[k] for k in sorted(by_period, reverse=True)[:count]]


def infotable_url(cik, accession):
    """Find the information-table XML inside a filing folder."""
    folder = "https://www.sec.gov/Archives/edgar/data/%d/%s/" % (int(cik), accession.replace("-", ""))
    idx = net.get_json(folder + "index.json", headers=SEC_HEADERS, ttl_hours=24 * 30, min_interval=0.15)
    return folder + pick_infotable(idx["directory"]["item"])


def pick_infotable(items):
    xmls = [it for it in items if it["name"].lower().endswith(".xml") and it["name"].lower() != "primary_doc.xml"]
    if not xmls:
        raise ValueError("no information table found")
    named = [it for it in xmls if re.search(r"info|table|13f", it["name"], re.I)]
    pool = named or xmls

    def size(it):
        try:
            return int(it.get("size") or 0)
        except ValueError:
            return 0
    return max(pool, key=size)["name"]


def _local(tag):
    return tag.rsplit("}", 1)[-1]


def parse_infotable(xml_bytes, values_in_thousands=False):
    """Parse an information table into a list of position dicts.

    Values are returned in dollars. Filings made before 2023-01-03 reported
    `value` in thousands; pass values_in_thousands=True for those.
    """
    root = ET.fromstring(xml_bytes)
    out = []
    for node in root.iter():
        if _local(node.tag) != "infoTable":
            continue
        rec = {"name": "", "cusip": "", "value": 0.0, "shares": 0.0, "type": "SH", "putCall": "", "cls": ""}
        for ch in node.iter():
            tag = _local(ch.tag)
            txt = (ch.text or "").strip()
            if tag == "nameOfIssuer":
                rec["name"] = txt
            elif tag == "titleOfClass":
                rec["cls"] = txt
            elif tag == "cusip":
                rec["cusip"] = txt.upper()
            elif tag == "value":
                rec["value"] = float(txt or 0) * (1000 if values_in_thousands else 1)
            elif tag == "sshPrnamt":
                rec["shares"] = float(txt or 0)
            elif tag == "sshPrnamtType":
                rec["type"] = txt
            elif tag == "putCall":
                rec["putCall"] = txt.upper()
        out.append(rec)
    return out


def aggregate(positions):
    """Collapse multiple lines per CUSIP (different managers/discretion) into one.

    Options (putCall set) are kept separate from the equity line.
    """
    agg = {}
    for p in positions:
        key = (p["cusip"], p["putCall"])
        a = agg.setdefault(key, {"name": p["name"], "cusip": p["cusip"], "putCall": p["putCall"], "value": 0.0, "shares": 0.0})
        a["value"] += p["value"]
        a["shares"] += p["shares"]
    return agg


def diff(cur, prev):
    """Quarter-over-quarter changes for equity lines (putCall == "").

    valueChange isolates trading from price moves: share change × current
    price per share (prior price for exits).
    """
    changes = []
    keys = set(k for k in cur if not k[1]) | set(k for k in prev if not k[1])
    for k in keys:
        c, p = cur.get(k), prev.get(k)
        cs, ps = (c or {}).get("shares", 0.0), (p or {}).get("shares", 0.0)
        if c and not p:
            status, vchg = "New", c["value"]
        elif p and not c:
            status, vchg = "Exited", -p["value"]
        else:
            if cs == ps:
                continue
            px = c["value"] / cs if cs else (p["value"] / ps if ps else 0)
            vchg = (cs - ps) * px
            pct = (cs / ps - 1) * 100 if ps else 0
            status = ("Added +%.0f%%" if cs > ps else "Trimmed %.0f%%") % pct
        ref = c or p
        changes.append({"cusip": ref["cusip"], "name": ref["name"], "status": status, "valueChange": vchg,
                        "sharesChangePct": (cs / ps - 1) if ps else None})
    return changes


def figi_tickers(cusips):
    """Map CUSIPs to US tickers via OpenFIGI (anonymous: 10 ids/request)."""
    out = {}
    cusips = [c for c in dict.fromkeys(cusips) if c]
    for i in range(0, len(cusips), 10):
        batch = cusips[i:i + 10]
        try:
            res = net.get_json("https://api.openfigi.com/v3/mapping",
                               data=[{"idType": "ID_CUSIP", "idValue": c, "exchCode": "US"} for c in batch],
                               ttl_hours=24 * 90, min_interval=2.6)
        except Exception as e:  # noqa: BLE001
            print("  openfigi lookup failed: %s" % e, file=sys.stderr)
            continue
        for c, r in zip(batch, res):
            data = r.get("data") or []
            if data and data[0].get("ticker"):
                out[c] = data[0]["ticker"].replace("/", "-")
    return out


def build_institution(name, cik, lookups=config.FIGI_LOOKUPS_PER_FILER):
    filings = latest_13f_filings(cik, 2)
    if len(filings) < 2:
        raise ValueError("fewer than two 13F-HR filings")
    tables = []
    for f in filings:
        url = infotable_url(cik, f["accession"])
        raw = net.get(url, headers=SEC_HEADERS, ttl_hours=24 * 365, min_interval=0.15, timeout=120)
        tables.append(aggregate(parse_infotable(raw, values_in_thousands=f["filingDate"] < "2023-01-03")))
    cur, prev = tables
    equity = [v for k, v in cur.items() if not k[1]]
    total = sum(p["value"] for p in equity)
    prev_total = sum(v["value"] for k, v in prev.items() if not k[1])
    top = sorted(equity, key=lambda p: -p["value"])[:25]
    changes = diff(cur, prev)
    adds = sorted([c for c in changes if c["valueChange"] > 0], key=lambda c: -c["valueChange"])[:25]
    cuts = sorted([c for c in changes if c["valueChange"] < 0], key=lambda c: c["valueChange"])[:25]

    need = [p["cusip"] for p in top] + [c["cusip"] for c in adds[:15]] + [c["cusip"] for c in cuts[:15]]
    tick = figi_tickers(need[:lookups])
    for row in top + adds + cuts:
        row["ticker"] = tick.get(row["cusip"])

    return {
        "name": name, "cik": cik,
        "period": filings[0]["reportDate"], "prevPeriod": filings[1]["reportDate"],
        "filed": filings[0]["filingDate"],
        "total": total, "prevTotal": prev_total, "positions": len(equity),
        "top": [{"ticker": p.get("ticker"), "name": p["name"], "value": p["value"], "weight": p["value"] / total if total else 0} for p in top],
        "adds": adds, "cuts": cuts,
    }
