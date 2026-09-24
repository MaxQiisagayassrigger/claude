"""Offline tests for pipeline.ai_forecast. Run: python3 -m unittest discover -s pipeline/tests -t ."""

import datetime as dt
import json
import math
import os
import random
import re
import tempfile
import unittest

from pipeline import ai_forecast as af


def trading_dates(n, start=dt.date(2016, 1, 4)):
    out, d = [], start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d += dt.timedelta(days=1)
    return out


def gbm(n, mu, sigma, seed, start=100.0, shocks=None):
    """[(date, close, volume)] from GBM; `shocks` optionally supplies the daily normal draws."""
    rnd = random.Random(seed)
    p, rows = start, []
    for i, d in enumerate(trading_dates(n)):
        eps = shocks[i] if shocks is not None else rnd.gauss(0, 1)
        if i:
            p *= math.exp((mu - sigma * sigma / 2) / 252 + sigma / math.sqrt(252) * eps)
        rows.append((d, p, 1e6))
    return rows


class TestUniverse(unittest.TestCase):
    def test_parses_real_universe_file(self):
        u = af.load_universe()
        self.assertGreaterEqual(len(u["stocks"]), 40)
        for s in u["stocks"]:
            self.assertGreaterEqual(s["mcap"], u["threshold"])
            self.assertTrue(s["y"])

    def test_priors_match_the_site(self):
        with open(os.path.join(af.ROOT, "ai-forecast", "assets", "forecast.js"), encoding="utf-8") as f:
            js = f.read()
        for key, ic in af.IC_PRIOR.items():
            self.assertRegex(js, r'key: "%s".*?ic: %s\b' % (key, re.escape(str(ic))))
        self.assertIn("corrShrink: %s," % af.CORR_SHRINK, js)
        self.assertIn("icMeasuredWeight: %s," % af.IC_MEASURED_WEIGHT, js)
        self.assertIn("winsor: %s," % af.WINSOR, js)


class TestStats(unittest.TestCase):
    def test_ranks_average_ties(self):
        self.assertEqual(af.ranks([3, 1, 3, 2]), [3.5, 1, 3.5, 2])

    def test_spearman_monotone(self):
        self.assertAlmostEqual(af.spearman([1, 2, 3, 4], [10, 20, 25, 100]), 1.0)
        self.assertAlmostEqual(af.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)

    def test_solve(self):
        x = af.solve([[2, 1], [1, 3]], [3, 5])
        self.assertAlmostEqual(2 * x[0] + x[1], 3)
        self.assertAlmostEqual(x[0] + 3 * x[1], 5)

    def test_quantile(self):
        xs = sorted(range(101))
        self.assertAlmostEqual(af.quantile(xs, 0.25), 25)
        self.assertAlmostEqual(af.quantile([1.0, 3.0], 0.5), 2.0)

    def test_t5_band_edges_are_unit_variance_t(self):
        # 80% two-sided critical value of t(5) is 1.4759; scaled to unit variance.
        self.assertAlmostEqual(af.T5[0.9], 1.4759 * math.sqrt(0.6), places=3)
        self.assertAlmostEqual(af.T5[0.1], -af.T5[0.9])


class TestMeasure(unittest.TestCase):
    def test_volatility_and_range(self):
        rows = gbm(800, 0.1, 0.4, seed=1)
        m = af.measure(rows)
        closes = [r[1] for r in rows]
        self.assertAlmostEqual(m["vol252"], 0.4, delta=0.05)
        self.assertEqual(m["hi52"], max(closes[-252:]))
        self.assertEqual(m["lo52"], min(closes[-252:]))
        self.assertEqual(m["price"], closes[-1])
        self.assertAlmostEqual(m["mom12_1"], closes[-22] / closes[-253] - 1)
        self.assertAlmostEqual(m["ret1m"], closes[-1] / closes[-22] - 1)
        self.assertEqual(len(m["history"]), af.HISTORY_DAYS)
        self.assertEqual(m["history"][-1][0], rows[-1][0])

    def test_ytd_uses_last_close_of_prior_year(self):
        rows = gbm(600, 0.0, 0.3, seed=2)
        m = af.measure(rows)
        year = rows[-1][0][:4]
        prior = [r for r in rows if r[0] < year + "-01-01"][-1][1]
        self.assertAlmostEqual(m["ytd"], rows[-1][1] / prior - 1)

    def test_weekly_beta_recovers_true_beta(self):
        rnd = random.Random(5)
        mkt = [rnd.gauss(0, 1) for _ in range(900)]
        bench = gbm(900, 0.08, 0.16, seed=0, shocks=mkt)
        # Stock daily log return = 1.8 × market return + independent noise.
        rows, p = [], 50.0
        for i, (d, _, _) in enumerate(bench):
            if i:
                p *= math.exp(1.8 * math.log(bench[i][1] / bench[i - 1][1]) + 0.08 / math.sqrt(252) * rnd.gauss(0, 1))
            rows.append((d, p, 1e6))
        self.assertAlmostEqual(af.weekly_beta(rows, bench), 1.8, delta=0.15)

    def test_short_history_degrades_gracefully(self):
        m = af.measure(gbm(70, 0.0, 0.5, seed=3))  # e.g. a recent IPO
        self.assertIsNone(m["mom12_1"])
        self.assertIsNone(m["ret1y"])
        self.assertIsNotNone(m["vol63"])
        self.assertIsNone(af.weekly_beta(gbm(70, 0, 0.5, seed=3), gbm(70, 0, 0.2, seed=4)))

    def test_signals_have_no_look_ahead(self):
        rows = gbm(600, 0.0, 0.3, seed=6)
        closes = [r[1] for r in rows]
        a = af.signals_at(closes, 400)
        changed = closes[:401] + [c * 3 for c in closes[401:]]
        self.assertEqual(a, af.signals_at(changed, 400))


class TestBacktest(unittest.TestCase):
    def universe(self, n_stocks=20, n_days=1500):
        vols = [0.25 + 0.03 * k for k in range(n_stocks)]
        return {"S%02d" % k: gbm(n_days, 0.08, vols[k], seed=100 + k) for k in range(n_stocks)}

    def test_random_walks_have_no_skill_and_calibrated_bands(self):
        bt = af.backtest(self.universe())
        for k in af.SIGNALS:
            self.assertLess(abs(bt["ic"][k]["mean"]), 0.06, k)
        self.assertLess(abs(bt["model"]["ic"]), 0.06)
        self.assertAlmostEqual(bt["model"]["hit"], 0.5, delta=0.05)
        # The unit-variance t(5) is more peaked than a normal, so Gaussian
        # outcomes land inside its 80% band 74.7% of the time and inside its
        # 50% band 42.7% of the time.
        self.assertAlmostEqual(bt["calibration"]["cover80"], 0.747, delta=0.05)
        self.assertAlmostEqual(bt["calibration"]["cover50"], 0.427, delta=0.05)
        self.assertAlmostEqual(bt["calibration"]["sd"], 1.0, delta=0.12)
        z = bt["zq"]["z"]
        self.assertEqual(z, sorted(z))
        self.assertAlmostEqual(z[bt["zq"]["p"].index(0.5)], 0.0, places=9)

    def test_detects_a_planted_reversal_effect(self):
        # Each stock's next-quarter drift is the opposite of its last-month move.
        series = {}
        for k in range(20):
            rnd = random.Random(500 + k)
            closes, p, drift = [], 100.0, 0.0
            for i in range(1500):
                if i >= 42 and i % 21 == 0:
                    last = math.log(closes[-1] / closes[-22])
                    drift = -2.0 * last  # annualised drift tilted against last month
                p *= math.exp(drift / 252 * 4 + 0.3 / math.sqrt(252) * rnd.gauss(0, 1))
                closes.append(p)
            series["S%02d" % k] = list(zip(trading_dates(1500), closes, [1e6] * 1500))
        bt = af.backtest(series)
        self.assertGreater(bt["ic"]["rev"]["mean"], 0.1)
        self.assertGreater(bt["model"]["ic"], 0.05)

    def test_needs_enough_history(self):
        with self.assertRaises(RuntimeError):
            af.backtest(self.universe(n_days=400))


class TestEndToEnd(unittest.TestCase):
    def test_build_and_write_with_stub_fetch(self):
        universe = af.load_universe()
        universe["stocks"] = universe["stocks"][:12]
        fake = {s["y"]: gbm(1500, 0.1, 0.35 + 0.02 * i, seed=i) for i, s in enumerate(universe["stocks"])}
        fake[af.BENCHMARK] = gbm(1500, 0.08, 0.16, seed=99)
        fake.pop(universe["stocks"][3]["y"])  # one download fails

        def fetch(sym):
            if sym not in fake:
                raise ValueError("404")
            return fake[sym], "stub"

        ds = af.build(universe, fetch=fetch)
        self.assertEqual(ds["universe"], 11)
        self.assertEqual(ds["failed"], [universe["stocks"][3]["t"]])
        self.assertIsNotNone(ds["backtest"])
        with tempfile.TemporaryDirectory() as d:
            af.write(ds, d)
            with open(os.path.join(d, "forecast.js")) as f:
                text = f.read()
            self.assertTrue(text.startswith("// Generated"))
            body = text.split("window.AI_GENERATED = ", 1)[1].rstrip().rstrip(";")
            data = json.loads(body)
            self.assertEqual(set(data["stocks"]), {s["t"] for s in universe["stocks"]} - {universe["stocks"][3]["t"]})
            one = next(iter(data["stocks"].values()))
            for k in ("price", "asOf", "hi52", "lo52", "vol63", "vol252", "beta", "mom12_1", "ret1m", "history", "base"):
                self.assertIn(k, one)
            with open(os.path.join(d, "forecast.json")) as f:
                self.assertEqual(json.load(f)["horizonDays"], 63)

    def test_stops_early_when_prices_are_unreachable(self):
        calls = []

        def fetch(sym):
            calls.append(sym)
            raise OSError("network unreachable")

        universe = af.load_universe()
        with self.assertRaises(RuntimeError):
            af.build(universe, fetch=fetch)
        self.assertEqual(calls, [af.BENCHMARK])

    def test_main_rejects_unknown_tickers(self):
        self.assertEqual(af.main(["--tickers", "NOT_A_TICKER"]), 1)


if __name__ == "__main__":
    unittest.main()
