"""Offline tests for the data pipeline. Run: python3 -m unittest discover -s pipeline/tests -t ."""

import datetime as dt
import json
import math
import os
import random
import tempfile
import unittest
from unittest import mock

from pipeline import build, features, fred, ml, prices, sec13f

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


def fixture(name, mode="rb"):
    with open(os.path.join(FIX, name), mode) as f:
        return f.read()


def gbm_rows(n, mu, sigma, seed, start=100.0):
    rnd = random.Random(seed)
    p, rows, d = start, [], dt.date(2016, 1, 4)
    for i in range(n):
        p *= math.exp((mu - sigma * sigma / 2) / 252 + sigma / math.sqrt(252) * rnd.gauss(0, 1))
        rows.append((d.isoformat(), p, 1000.0 + i))
        d += dt.timedelta(days=3 if d.weekday() == 4 else 1)
    return rows


class TestPriceParsers(unittest.TestCase):
    def test_yahoo_uses_adjclose_skips_nulls_and_dedupes(self):
        rows = prices.parse_yahoo(fixture("yahoo_chart.json"))
        self.assertEqual([r[1] for r in rows], [9.8, 10.3, 10.9])
        self.assertEqual(rows[0][0], "2025-01-02")
        self.assertEqual(rows[-1][2], 1500.0)

    def test_yahoo_error_raises(self):
        with self.assertRaises(ValueError):
            prices.parse_yahoo({"chart": {"result": None, "error": {"code": "Not Found"}}})

    def test_stooq_sorted_and_drops_nonpositive(self):
        rows = prices.parse_stooq(fixture("stooq.csv"))
        self.assertEqual([r[0] for r in rows], ["2025-01-02", "2025-01-03"])


class TestFred(unittest.TestCase):
    def test_parse_and_summarize(self):
        rows = fred.parse_csv(fixture("fred.csv"))
        self.assertEqual(len(rows), 3)  # "." skipped
        s = fred.summarize("DGS10", "10y", rows)
        self.assertEqual(s["latest"], 4.12)
        self.assertAlmostEqual(s["change1y"], 4.12 - 3.73)


class Test13F(unittest.TestCase):
    def test_parse_and_aggregate(self):
        pos = sec13f.parse_infotable(fixture("infotable.xml"))
        self.assertEqual(len(pos), 4)
        agg = sec13f.aggregate(pos)
        aapl = agg[("037833100", "")]
        self.assertEqual(aapl["value"], 3_000_000)
        self.assertEqual(aapl["shares"], 15_000)
        self.assertIn(("69608A108", "PUT"), agg)

    def test_thousands_scaling(self):
        pos = sec13f.parse_infotable(fixture("infotable.xml"), values_in_thousands=True)
        self.assertEqual(pos[0]["value"], 2_000_000_000)

    def test_diff_statuses_and_trade_value(self):
        cur = sec13f.aggregate(sec13f.parse_infotable(fixture("infotable.xml")))
        prev = sec13f.aggregate(sec13f.parse_infotable(fixture("infotable_prev.xml")))
        ch = {c["name"]: c for c in sec13f.diff(cur, prev)}
        self.assertEqual(ch["MICRON TECHNOLOGY INC"]["status"], "New")
        self.assertEqual(ch["CONSTELLATION BRANDS INC"]["status"], "Exited")
        self.assertEqual(ch["CONSTELLATION BRANDS INC"]["valueChange"], -800_000)
        # AAPL: 20k -> 15k shares at $200 current => -$1.0M of selling, -25%
        self.assertTrue(ch["APPLE INC"]["status"].startswith("Trimmed -25"))
        self.assertAlmostEqual(ch["APPLE INC"]["valueChange"], -1_000_000)
        self.assertNotIn("PALANTIR TECHNOLOGIES INC", ch)  # options excluded

    def test_select_filings_ignores_amendments_and_keeps_latest(self):
        recent = {
            "form": ["13F-HR", "13F-HR/A", "13F-HR", "13F-HR", "10-K"],
            "accessionNumber": ["a3", "a2b", "a2", "a1", "x"],
            "filingDate": ["2026-08-14", "2026-06-01", "2026-05-15", "2026-02-14", "2026-02-01"],
            "reportDate": ["2026-06-30", "2026-03-31", "2026-03-31", "2025-12-31", "2025-12-31"],
        }
        got = sec13f.select_filings(recent, 2)
        self.assertEqual([g["accession"] for g in got], ["a3", "a2"])

    def test_pick_infotable(self):
        items = [{"name": "primary_doc.xml", "size": "9"}, {"name": "0001-index.html"},
                 {"name": "50240.xml", "size": "400"}, {"name": "infotable.xml", "size": "100"}]
        self.assertEqual(sec13f.pick_infotable(items), "infotable.xml")
        self.assertEqual(sec13f.pick_infotable(items[:3]), "50240.xml")


class TestFeatures(unittest.TestCase):
    def test_no_lookahead(self):
        rows = gbm_rows(600, 0.1, 0.4, 1)
        closes = [r[1] for r in rows]
        vols = [r[2] for r in rows]
        f1 = features.features_at(closes, vols, 300)
        closes2 = closes[:301] + [c * 10 for c in closes[301:]]  # change the future only
        f2 = features.features_at(closes2, vols, 300)
        self.assertEqual(f1, f2)

    def test_label(self):
        closes = [1.0] * 10 + [2.0] + [1.0] * 300
        self.assertEqual(features.doubled_within(closes, 0), 1)
        self.assertEqual(features.doubled_within([1.0] * 400, 0), 0)
        self.assertIsNone(features.doubled_within([1.0] * 100, 0))

    def test_volatility_estimate(self):
        rows = gbm_rows(800, 0.0, 0.5, 7)
        f = features.current("X", rows)
        self.assertAlmostEqual(f["vol"], 0.5, delta=0.08)


class TestML(unittest.TestCase):
    def test_auc(self):
        self.assertEqual(ml.auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]), 1.0)
        self.assertEqual(ml.auc([0.5, 0.5], [0, 1]), 0.5)

    def test_logistic_learns_signal(self):
        rnd = random.Random(3)
        X, y = [], []
        for _ in range(2000):
            a, b = rnd.gauss(0, 1), rnd.gauss(0, 1)
            X.append([a, b])
            y.append(1 if rnd.random() < ml.sigmoid(-2 + 1.5 * a) else 0)
        w, b0 = ml.fit_logistic(X, y)
        self.assertGreater(w[0], 1.0)
        self.assertLess(abs(w[1]), 0.3)
        self.assertGreater(ml.auc(ml.predict(w, b0, X), y), 0.75)


class TestBuildEndToEnd(unittest.TestCase):
    """Runs the whole build offline against synthetic price series."""

    def test_build_writes_valid_dataset(self):
        rnd = random.Random(11)
        fake = {}
        for k in range(24):
            sigma = 0.25 + 0.05 * k
            fake["T%02d" % k] = gbm_rows(1200, rnd.uniform(-0.1, 0.4), sigma, 100 + k)

        def fetch(sym, years=10):
            return fake[sym], "fake"

        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(prices, "fetch", side_effect=fetch), \
                mock.patch.object(build, "OUT_DIR", tmp):
            rc = build.main(["--tickers", ",".join(fake), "--skip-13f", "--skip-macro"])
            self.assertEqual(rc, 0)
            with open(os.path.join(tmp, "dataset.json")) as f:
                ds = json.load(f)
            with open(os.path.join(tmp, "dataset.js")) as f:
                self.assertTrue(f.read().startswith("// Generated"))
        self.assertEqual(ds["universe"], 24)
        self.assertEqual(len(ds["current"]), 24)
        self.assertEqual(len(ds["factorBuckets"]), len(features.FEATURES))
        self.assertGreater(ds["backtest"]["samples"], 500)
        probs = [c["prob"] for c in ds["current"]]
        self.assertEqual(probs, sorted(probs, reverse=True))


if __name__ == "__main__":
    unittest.main()
