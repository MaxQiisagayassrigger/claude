(function (root) {
  "use strict";
  var BSX = root.BSX, U = BSX.UI.util, C = BSX.UI.charts, App = BSX.UI.App;
  var Cal = BSX.Cal, Broker = BSX.Broker, Options = BSX.Options;
  var esc = U.esc, $ = U.$;

  var ACCT = { cash: "Cash account", margin: "Reg T margin account", pm: "Portfolio margin account" };
  var GROUPS = [
    ["eq", "Stocks & ETFs"], ["opt", "Options"], ["bond", "Bonds"], ["crypto", "Crypto"], ["ctr", "Futures, FX & perpetuals"]
  ];

  function st() { return App.state("portfolio", { range: "all" }); }

  function render() {
    var W = App.W, A = W.A;
    var h = '<div class="section-head"><div><h2>Portfolio</h2><p>' + ACCT[A.type] + " · opened " + Cal.nice(A.startDay) + ". Positions are marked at the mid price; futures settle to cash at each close.</p></div>" +
      '<div class="row"><button type="button" id="acct-settings">Account settings</button></div></div>';
    h += '<div data-region="alert"></div><div class="kpis" data-region="kpis"></div>';
    h += '<div class="grid split" style="margin-top:14px">' +
      '<div class="card"><div class="card-head"><h3>Performance</h3><div class="legend"><span><i style="background:var(--series-1)"></i>Your account (time-weighted)</span><span><i style="background:var(--series-2)"></i>US 500</span></div></div><div class="chart-box"><canvas data-region="equity" aria-label="Account performance"></canvas></div><div class="stats-grid" data-region="perf" style="margin-top:12px"></div></div>' +
      '<div class="stack"><div class="card"><h3>Margin</h3><div data-region="margin"></div></div><div class="card"><h3>Exposure</h3><div data-region="alloc"></div></div></div>' +
      "</div>";
    h += '<div class="card flush" style="margin-top:14px"><div class="card-head" style="padding:12px 14px 0"><h3>Positions</h3><span class="small muted" data-region="poscount"></span></div><div class="table-wrap" data-region="positions"></div></div>';
    h += '<div class="grid g3" style="margin-top:14px">' +
      '<div class="card"><h3>Risk</h3><div data-region="risk"></div></div>' +
      '<div class="card"><h3>Income &amp; costs</h3><div data-region="income"></div></div>' +
      '<div class="card"><h3>Move cash</h3><p class="small secondary">Deposits and withdrawals are excluded from performance (returns are time-weighted).</p><div class="row"><input type="number" id="cash-amt" class="num" min="0" step="100" placeholder="Amount" style="width:140px" aria-label="Amount"><button type="button" data-cash="deposit">Deposit</button><button type="button" data-cash="withdraw">Withdraw</button></div><div class="small" id="cash-msg" style="margin-top:6px"></div></div>' +
      "</div>";
    return h;
  }

  function mount(app, el) {
    $("#acct-settings", el).addEventListener("click", function () { BSX.UI.openSettings(App, "account"); });
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-close],[data-cash],[data-exercise],[data-cancel-all]");
      if (!b) return;
      var W = App.W, A = W.A;
      if (b.dataset.close) {
        var r = Broker.closePosition(W, A, b.dataset.close);
        if (!r.ok) App.toast(r.error, "reject");
      } else if (b.dataset.exercise) {
        var r2 = Broker.exercise(W, A, b.dataset.exercise);
        if (!r2.ok) App.toast(r2.error, "reject");
      } else if (b.dataset.cash) {
        var amt = $("#cash-amt", el).value;
        var res = b.dataset.cash === "deposit" ? Broker.deposit(W, A, amt) : Broker.withdraw(W, A, amt);
        var m = $("#cash-msg", el);
        m.className = "small " + (res.ok ? "up" : "down");
        m.textContent = res.ok ? (b.dataset.cash === "deposit" ? "Deposited " : "Withdrew ") + U.money(+amt) + "." : res.error;
        if (res.ok) $("#cash-amt", el).value = "";
      }
      while (A.events.length) { var ev = A.events.shift(); App.toast(ev.text, ev.type); }
      App.refresh(false);
    });
  }

  function group(W, p) {
    if (p.kind === "opt") return "opt";
    if (p.kind === "ctr") return "ctr";
    var a = W.M.assets[p.sym];
    if (!a) return "eq";
    if (a.type === "bond") return "bond";
    if (a.type === "crypto") return "crypto";
    return "eq";
  }

  function perfStats(A) {
    var e = A.equity;
    if (e.length < 2) return null;
    var rets = [], peak = -Infinity, dd = 0, best = -Infinity, worst = Infinity;
    for (var i = 1; i < e.length; i++) {
      var r = e[i].twr / e[i - 1].twr - 1;
      rets.push(r);
      if (r > best) best = r; if (r < worst) worst = r;
    }
    e.forEach(function (x) { peak = Math.max(peak, x.twr); dd = Math.max(dd, 1 - x.twr / peak); });
    var mean = rets.reduce(function (a, b) { return a + b; }, 0) / rets.length;
    var sd = Math.sqrt(rets.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / Math.max(1, rets.length - 1));
    var years = (e[e.length - 1].d - e[0].d) / 365.25;
    var tot = e[e.length - 1].twr / e[0].twr - 1;
    return { total: tot, ann: years > 0.08 ? Math.pow(1 + tot, 1 / years) - 1 : null, vol: sd * Math.sqrt(252), sharpe: sd > 0 ? mean / sd * Math.sqrt(252) : null, dd: dd, best: best, worst: worst, days: e.length };
  }

  function update(app, el) {
    var W = App.W, A = W.A, M = W.M;
    var cache = {};
    var s = Broker.summary(W, A, cache);
    var base = A.equity.length ? A.equity[A.equity.length - 1].nlv : A.deposits - A.flowsToday;
    var twrNow = A.twr * (base > 0 ? (s.nlv - A.flowsToday) / base : 1);
    var bench0 = A.equity.length ? A.equity[0].bench : M.assets.US500.px;
    var totalRet = twrNow - 1, benchRet = M.assets.US500.px / bench0 - 1;
    // Alert banner
    var al = "";
    if (A.marginCall) al = '<div class="callout bad" style="margin-bottom:14px"><strong>Margin call: ' + U.money(A.marginCall.amount) + " due by the close on " + Cal.nice(A.marginCall.due) + "</strong>Equity is below the maintenance requirement. Deposit cash or close positions, or the broker will liquidate positions for you.</div>";
    else if (s.nlv > 0 && s.cushion < 0.1 && A.type !== "cash" && Object.keys(A.pos).length) al = '<div class="callout warn" style="margin-bottom:14px"><strong>Low margin cushion</strong>Your excess liquidity is ' + U.pctU(s.cushion, 1) + " of equity. A small move against you could trigger a margin call.</div>";
    $('[data-region="alert"]', el).innerHTML = al;
    var k = function (label, value, note, c) { return '<div class="kpi"><div class="label">' + label + '</div><div class="value ' + (c || "") + '">' + value + '</div><div class="note">' + note + "</div></div>"; };
    $('[data-region="kpis"]', el).innerHTML =
      k("Net liquidation value", U.money(s.nlv), "Deposits " + U.money0(A.deposits)) +
      k("Today", U.signedMoney(s.dayPnl), U.pct(A.dayStart ? s.dayPnl / A.dayStart : 0) + " since yesterday's close", U.cls(s.dayPnl)) +
      k("Total return", U.pct(totalRet), "US 500: " + U.pct(benchRet) + " over the same period", U.cls(totalRet)) +
      k(s.cash >= 0 ? "Cash" : "Margin loan", U.money(Math.abs(s.cash)), s.cash >= 0 ? "Earns the sweep rate" : "Charged benchmark + spread", s.cash < 0 ? "down" : "") +
      k("Buying power", U.money0(s.buyingPower), A.type === "cash" ? "Settled cash less reserves" : "For marginable stock") +
      k("Excess liquidity", U.money0(s.excess), A.type === "cash" ? "—" : "Equity above maintenance", s.excess < 0 ? "down" : "") +
      k("Leverage", s.leverage.toFixed(2) + "×", "Gross exposure " + U.compact(s.gross, "$")) +
      k("Open P&amp;L", U.signedMoney(s.open), "Unrealized, all positions", U.cls(s.open));
    // Equity chart
    var eq = A.equity.slice();
    var series = eq.map(function (x) { return (x.twr - 1) * 100; });
    var bench = eq.map(function (x) { return (x.bench / bench0 - 1) * 100; });
    series.push((twrNow - 1) * 100); bench.push(benchRet * 100);
    var days = eq.map(function (x) { return x.d; }).concat([W.day]);
    C.lines($('[data-region="equity"]', el), {
      series: [{ values: series, color: "--series-1", label: "You", width: 2, area: true }, { values: bench, color: "--series-2", label: "US 500" }],
      label: function (i, full) { return full ? Cal.nice(days[i]) + (i === days.length - 1 ? " (now)" : "") : Cal.short(days[i]); },
      fmt: function (v) { return (v >= 0 ? "+" : "") + v.toFixed(1) + "%"; }, zero: true, height: 250
    });
    var ps = perfStats(A);
    $('[data-region="perf"]', el).innerHTML = ps ? [
      ["Annualized", ps.ann == null ? "—" : U.pct(ps.ann, 1)], ["Volatility", U.pctU(ps.vol, 1)], ["Sharpe", ps.sharpe == null ? "—" : ps.sharpe.toFixed(2)], ["Max drawdown", U.pctU(ps.dd, 1)],
      ["Best day", U.pct(ps.best)], ["Worst day", U.pct(ps.worst)], ["Trading days", String(ps.days)], ["Realized P&amp;L", U.signedMoney(A.stats.realized)]
    ].map(function (x) { return "<div><span>" + x[0] + "</span><b>" + x[1] + "</b></div>"; }).join("") : '<div><span>Run the clock for a few days to see statistics.</span></div>';
    // Margin gauge
    var mg = $('[data-region="margin"]', el);
    if (A.type === "cash") {
      mg.innerHTML = '<p class="small secondary" style="margin:0">Cash account: no borrowing. ' + (s.reserve ? U.money(s.reserve) + " is reserved for cash-secured puts." : "") + " Switch to a margin account in Settings to short, use leverage or trade futures, FX and perpetuals.</p>";
    } else {
      var scale = Math.max(s.nlv, s.init, s.maint, 1) * 1.1;
      var used = s.nlv > 0 ? s.maint / s.nlv : 1;
      var color = used > 0.9 ? "var(--critical)" : used > 0.7 ? "var(--warning)" : "var(--good)";
      mg.innerHTML = '<div class="gauge" role="img" aria-label="Maintenance requirement is ' + U.pctU(used, 0) + ' of equity"><i style="width:' + Math.min(100, s.maint / scale * 100).toFixed(1) + "%;background:" + color + '"></i><span class="mark" style="left:' + Math.min(100, Math.max(0, s.nlv / scale * 100)).toFixed(1) + '%"></span></div>' +
        '<div class="gauge-labels"><span>Maintenance ' + U.money0(s.maint) + "</span><span>Equity " + U.money0(s.nlv) + "</span></div>" +
        '<dl class="list-kv" style="margin-top:10px"><dt>Initial requirement</dt><dd>' + U.money(s.init) + "</dd><dt>Maintenance requirement</dt><dd>" + U.money(s.maint) + "</dd><dt>Available funds</dt><dd class=\"" + U.cls(s.available) + "\">" + U.money(s.available) + "</dd><dt>Excess liquidity</dt><dd class=\"" + U.cls(s.excess) + "\">" + U.money(s.excess) + "</dd><dt>Margin method</dt><dd>" + (s.pm ? "Risk-based (portfolio)" : "Strategy-based (Reg T)") + "</dd></dl>";
    }
    // Allocation
    var labels = { stock: "Stocks", etf: "ETFs", crypto: "Crypto", bond: "Bonds", option: "Options (value)", future: "Futures (notional)", fx: "FX (notional)", perp: "Perpetuals (notional)" };
    var entries = Object.keys(s.byClass).filter(function (x) { return Math.abs(s.byClass[x]) > 0.5; });
    var mx = Math.max.apply(null, entries.map(function (x) { return Math.abs(s.byClass[x]); }).concat([1]));
    $('[data-region="alloc"]', el).innerHTML = entries.length ? "<table><tbody>" + entries.map(function (x) {
      var v = s.byClass[x];
      return '<tr><td class="small">' + labels[x] + '</td><td class="bar-cell" style="width:45%"><i style="left:0;background:' + (v >= 0 ? "var(--pos)" : "var(--neg)") + ";width:" + (Math.abs(v) / mx * 100).toFixed(1) + '%"></i></td><td class="num">' + U.compact(v, "$") + '</td><td class="num muted">' + (s.nlv > 0 ? U.pctU(Math.abs(v) / s.nlv, 0) : "—") + "</td></tr>";
    }).join("") + "</tbody></table>" : '<p class="small muted" style="margin:0">All cash. Open the trade window from any symbol to invest.</p>';
    // Positions
    var keys = Object.keys(A.pos);
    $('[data-region="poscount"]', el).textContent = keys.length ? keys.length + " position" + (keys.length > 1 ? "s" : "") : "";
    if (!keys.length) $('[data-region="positions"]', el).innerHTML = '<div class="empty">No open positions. Search for a symbol or click any row on the Markets, Stocks, Bonds, Crypto or Futures pages to trade.</div>';
    else {
      var h = '<table><thead><tr><th>Position</th><th class="num">Quantity</th><th class="num">Avg cost</th><th class="num">Last</th><th class="num">Today</th><th class="num">Value / notional</th><th class="num">Open P&amp;L</th><th class="num">Weight</th><th class="num">Maint. req.</th><th></th></tr></thead><tbody>';
      GROUPS.forEach(function (g) {
        var ks = keys.filter(function (k2) { return group(W, A.pos[k2]) === g[0]; });
        if (!ks.length) return;
        h += '<tr class="group"><td colspan="10">' + g[1] + "</td></tr>";
        var sub = 0;
        ks.forEach(function (k2) {
          var p = A.pos[k2];
          var a = p.kind === "opt" ? W.M.assets[p.c.und] : W.M.assets[p.sym];
          var mark = Broker.mark(W, p, cache), pnl = Broker.openPnl(W, p, cache);
          sub += pnl;
          var val = p.kind === "ctr" ? Broker.notional(W, p, cache) * (p.qty > 0 ? 1 : -1) : Broker.value(W, p, cache);
          var costBasis = p.kind === "opt" ? Math.abs(p.qty * p.mult * p.avg) : p.kind === "ctr" ? Math.abs(val) : a && a.type === "bond" ? Math.abs(p.qty / 100 * p.avg) : Math.abs(p.qty * p.avg);
          var day = p.kind === "sec" && a && a.prev && p.opened < W.day ? (a.type === "bond" ? p.qty / 100 : p.qty) * (a.px - a.prev) : null;
          var name = p.kind === "opt" ? Options.label(p.c) : a ? (a.type === "bond" ? a.name : p.sym) : p.sym;
          var sub2 = p.kind === "opt" ? (Options.isIndex(p.c.und) ? "Cash-settled" : "American") + " · " + (p.c.exp - W.day) + " days left" : a ? a.name : "";
          var qtyTxt = a && a.type === "bond" && p.kind === "sec" ? "$" + p.qty.toLocaleString("en-US") : U.qty(p.qty) + (p.kind === "opt" ? " ct" : a && a.type === "fx" ? " lots" : "");
          var fmtPx = function (x) { return p.kind === "opt" ? x.toFixed(2) : a ? U.assetPx(a.type === "fx" || a.type === "future" || a.type === "bond" ? a : a, x) : U.num(x); };
          var req = (s.per[k2] || {}).maint;
          var canEx = p.kind === "opt" && p.qty > 0 && !Options.isIndex(p.c.und);
          var tradeId = p.kind === "opt" ? null : p.sym;
          h += "<tr><td><div class=\"sym-cell\"><span class=\"sym\">" + (tradeId ? '<a href="#" data-trade="' + esc(tradeId) + '">' + esc(name) + "</a>" : '<a href="#options" data-go="options" data-und="' + esc(p.c.und) + '">' + esc(name) + "</a>") + (p.qty < 0 ? ' <span class="chip neg">Short</span>' : "") + (p.lev ? ' <span class="chip">' + p.lev + "×</span>" : "") + '</span><span class="nm">' + esc(sub2) + "</span></div></td>" +
            '<td class="num">' + qtyTxt + '</td><td class="num">' + fmtPx(p.avg) + '</td><td class="num">' + fmtPx(mark) + '</td><td class="num ' + U.cls(day) + '">' + (day == null ? "—" : U.signedMoney(day)) + "</td>" +
            '<td class="num">' + U.money(val) + '</td><td class="num ' + U.cls(pnl) + '">' + U.signedMoney(pnl) + (costBasis ? '<div class="tiny">' + U.pct(pnl / costBasis) + "</div>" : "") + "</td>" +
            '<td class="num">' + (s.nlv > 0 ? U.pctU(Math.abs(p.kind === "ctr" ? val : Broker.value(W, p, cache)) / s.nlv, 1) : "—") + '</td><td class="num">' + (req != null && A.type !== "cash" ? U.money0(req) : "—") + "</td>" +
            '<td class="num"><span class="row" style="justify-content:flex-end;flex-wrap:nowrap">' + (canEx ? '<button type="button" class="sm" data-exercise="' + esc(k2) + '">Exercise</button>' : "") + '<button type="button" class="sm" data-close="' + esc(k2) + '">Close</button></span></td></tr>';
        });
        h += '<tr class="total"><td colspan="6" class="small">' + g[1] + ' open P&amp;L</td><td class="num ' + U.cls(sub) + '">' + U.signedMoney(sub) + '</td><td colspan="3"></td></tr>';
      });
      h += "</tbody></table>";
      $('[data-region="positions"]', el).innerHTML = h;
    }
    // Risk
    var rk = Broker.risk(W, A);
    $('[data-region="risk"]', el).innerHTML = '<dl class="list-kv">' +
      "<dt>Beta-weighted delta</dt><dd class=\"" + U.cls(rk.beta$) + "\">" + U.signedMoney(rk.beta$, 0) + "</dd>" +
      "<dt>US 500 equivalent</dt><dd>" + rk.spxEq.toFixed(2) + " units</dd>" +
      "<dt>If the US 500 moves 1%</dt><dd class=\"" + U.cls(rk.beta$) + "\">" + U.signedMoney(rk.beta$ * 0.01, 0) + "</dd>" +
      "<dt>Option theta / day</dt><dd class=\"" + U.cls(rk.theta) + "\">" + U.signedMoney(rk.theta) + "</dd>" +
      "<dt>Option vega / vol pt</dt><dd>" + U.signedMoney(rk.vega) + "</dd>" +
      "<dt>Option gamma (sh per $1)</dt><dd>" + rk.gamma.toFixed(2) + "</dd>" +
      "<dt>Long market value</dt><dd>" + U.money0(s.longMv + s.optLong) + "</dd>" +
      "<dt>Short market value</dt><dd>" + U.money0(s.shortMv + s.optShort) + "</dd></dl>";
    var st_ = A.stats;
    var row = function (l, v) { return "<dt>" + l + '</dt><dd class="' + U.cls(v) + '">' + U.signedMoney(v) + "</dd>"; };
    $('[data-region="income"]', el).innerHTML = '<dl class="list-kv">' + row("Realized trading P&amp;L", st_.realized) + row("Dividends (net)", st_.dividends) + row("Bond coupons", st_.coupons) + row("Interest earned", st_.interestEarned) + row("Staking rewards", st_.staking) +
      row("Margin interest", -st_.interestPaid) + row("Stock borrow fees", -st_.borrow) + row("Perp funding", st_.funding) + row("FX swaps", st_.swaps) + row("Commissions &amp; fees", -st_.fees) + "</dl>";
  }

  App.register({ id: "portfolio", title: "Portfolio", render: render, mount: mount, update: update });
})(typeof self !== "undefined" ? self : this);
