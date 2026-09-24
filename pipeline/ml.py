"""Tiny pure-Python logistic regression plus evaluation helpers."""

import math


def transform(x):
    """Map raw features onto better-behaved scales before standardising."""
    return [
        math.copysign(math.log1p(abs(x["mom12_1"])), x["mom12_1"]),
        math.copysign(math.log1p(abs(x["mom3"])), x["mom3"]),
        math.log(max(x["vol"], 1e-4)),
        x["dd52"],
        max(-1.0, min(3.0, x["above200"])),
        max(-3.0, min(3.0, x["volTrend"])),
    ]


class Standardizer:
    def fit(self, X):
        n, d = len(X), len(X[0])
        self.mu = [sum(r[j] for r in X) / n for j in range(d)]
        self.sd = []
        for j in range(d):
            var = sum((r[j] - self.mu[j]) ** 2 for r in X) / max(1, n - 1)
            self.sd.append(math.sqrt(var) or 1.0)
        return self

    def apply(self, X):
        return [[(r[j] - self.mu[j]) / self.sd[j] for j in range(len(r))] for r in X]


def sigmoid(z):
    if z >= 0:
        return 1 / (1 + math.exp(-z))
    e = math.exp(z)
    return e / (1 + e)


def fit_logistic(X, y, l2=1e-3, lr=0.5, epochs=400):
    """Full-batch gradient descent on the L2-regularised log-loss."""
    n, d = len(X), len(X[0])
    w = [0.0] * d
    base = min(max(sum(y) / n, 1e-4), 1 - 1e-4)
    b = math.log(base / (1 - base))
    for _ in range(epochs):
        gw = [0.0] * d
        gb = 0.0
        for xi, yi in zip(X, y):
            err = sigmoid(b + sum(wj * xj for wj, xj in zip(w, xi))) - yi
            gb += err
            for j in range(d):
                gw[j] += err * xi[j]
        b -= lr * gb / n
        for j in range(d):
            w[j] -= lr * (gw[j] / n + l2 * w[j])
    return w, b


def predict(w, b, X):
    return [sigmoid(b + sum(wj * xj for wj, xj in zip(w, xi))) for xi in X]


def auc(scores, labels):
    """Mann–Whitney AUC with average ranks for ties."""
    pairs = sorted(zip(scores, labels))
    ranks = [0.0] * len(pairs)
    i = 0
    while i < len(pairs):
        j = i
        while j + 1 < len(pairs) and pairs[j + 1][0] == pairs[i][0]:
            j += 1
        r = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[k] = r
        i = j + 1
    pos = sum(1 for _, l in pairs if l == 1)
    neg = len(pairs) - pos
    if pos == 0 or neg == 0:
        return float("nan")
    rsum = sum(r for r, (_, l) in zip(ranks, pairs) if l == 1)
    return (rsum - pos * (pos + 1) / 2) / (pos * neg)


def calibration(pred, y, buckets=10):
    rows = sorted(zip(pred, y))
    out = []
    n = len(rows)
    for b in range(buckets):
        chunk = rows[b * n // buckets:(b + 1) * n // buckets]
        if not chunk:
            continue
        out.append({
            "bucket": "D%d" % (b + 1),
            "n": len(chunk),
            "predicted": sum(p for p, _ in chunk) / len(chunk),
            "actual": sum(t for _, t in chunk) / len(chunk),
        })
    return out


def quantile_buckets(values, labels, q=5):
    rows = sorted(zip(values, labels))
    n = len(rows)
    out = []
    for b in range(q):
        chunk = rows[b * n // q:(b + 1) * n // q]
        if not chunk:
            continue
        out.append({"q": b + 1, "lo": chunk[0][0], "hi": chunk[-1][0], "n": len(chunk),
                    "rate": sum(t for _, t in chunk) / len(chunk)})
    return out
