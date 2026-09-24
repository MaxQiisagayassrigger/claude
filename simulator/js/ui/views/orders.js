(function (root) {
  "use strict";
  var BSX = root.BSX, U = BSX.UI.util, App = BSX.UI.App;
  var Cal = BSX.Cal, Broker = BSX.Broker, Options = BSX.Options;
  var esc = U.esc, $ = U.$;

  var TYPES = [["all", "All"], ["trade", "Trades"], ["dividend", "Dividends"], ["coupon", "Coupons"], ["interest", "Interest"], ["expiry", "Expiries"], ["exercise", "Exercise"], ["assign", "Assignment"], ["funding", "Funding"], ["swap", "Swaps"], ["borrow", "Borrow fees"], ["margin", "Margin"], ["liquidation", "Liquidation"], ["deposit", "Deposits"]];
  var OT = { market: "Market", limit: "Limit", stop: "Stop", stop_limit: "Stop limit", trail: "Trailing stop" };

  function st() { return App.state("orders", { led: "all" }); }

  function render() {
    var s = st();
    return '<div class="section-head"><div><h2>Orders &amp; activity</h2><p>Working orders, order history with fill prices and rejection reasons, and every cash movement in the account.</p></div></div>' +
      '<div class="card flush"><div class="card-head" style="padding:12px 14px 0"><h3>Working orders</h3><button type="button" class="sm" data-cancel-all="1">Cancel all</button></div><div class="table-wrap" data-region="open"></div></div>' +
      '<div class="grid g2" style="margin-top:14px">' +
      '<div class="card flush"><div class="card-head" style="padding:12px 14px 0"><h3>Order history</h3></div><div class="table-wrap" style="max-height:560px;overflow-y:auto" data-region="hist"></div></div>' +
      '<div class="card flush"><div class="card-head" style="padding:12px 14px 0"><h3>Account activity</h3></div><div class="chips" style="padding:8px 14px">' + TYPES.map(function (t) { return '<button type="button" class="chip" data-led="' + t[0] + '" aria-pressed="' + (s.led === t[0]) + '">' + t[1] + "</button>"; }).join("") + '</div><div class="table-wrap" style="max-height:520px;overflow-y:auto" data-region="ledger"></div></div>' +
      "</div>";
  }

  function mount(app, el) {
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cancel],[data-cancel-all],[data-led]");
      if (!b) return;
      var W = App.W, A = W.A;
      if (b.dataset.cancel) Broker.cancel(W, A, +b.dataset.cancel);
      else if (b.dataset.cancelAll) A.orders.slice().forEach(function (o) { Broker.cancel(W, A, o.id); });
      else if (b.dataset.led) { st().led = b.dataset.led; App.refresh(true); return; }
      App.refresh(false);
    });
  }

  function priceTxt(W, o) {
    var a = o.sym ? W.M.assets[o.sym] : null;
    var f = function (x) { return x == null ? "" : a ? U.assetPx(a, x) : U.num(x); };
    if (o.combo) return o.type === "limit" ? "Net " + (o.limit >= 0 ? "debit " : "credit ") + U.num(Math.abs(o.limit)) : "Market";
    var parts = [];
    if (o.limit != null) parts.push("Lmt " + f(o.limit));
    if (o.stop != null) parts.push("Stop " + f(o.stop));
    if (o.type === "trail") parts.push("Trail " + (o.trail ? f(o.trail) : o.trailPct + "%"));
    return parts.join(" · ") || "—";
  }
  function qtyTxt(W, o) {
    var a = o.sym ? W.M.assets[o.sym] : null;
    if (a && a.type === "bond") return "$" + o.qty.toLocaleString("en-US");
    return U.qty(o.qty) + (o.c || o.combo ? " ct" : a && a.type === "fx" ? " lots" : "");
  }
  function name(W, o) {
    if (o.combo || o.c) return Broker.orderLabel(o);
    var a = W.M.assets[o.sym];
    return a && a.type === "bond" ? a.name : o.sym;
  }

  function update(app, el) {
    var W = App.W, A = W.A, s = st();
    $('[data-region="open"]', el).innerHTML = A.orders.length ? '<table><thead><tr><th>#</th><th>Placed</th><th>Instrument</th><th>Side</th><th class="num">Qty</th><th>Type</th><th>Price</th><th>TIF</th><th>Status</th><th></th></tr></thead><tbody>' +
      A.orders.map(function (o) {
        return '<tr><td class="mono small">' + o.id + '</td><td class="small">' + esc(U.when(o.created, o.createdTick)) + '</td><td class="small">' + esc(name(W, o)) + '</td><td><span class="chip ' + (o.side === "buy" ? "pos" : "neg") + '">' + (o.combo ? "Spread" : o.side === "buy" ? "Buy" : "Sell") + '</span></td><td class="num">' + qtyTxt(W, o) + "</td><td>" + OT[o.type] + '</td><td class="small mono">' + esc(priceTxt(W, o)) + "</td><td>" + (o.tif === "gtc" ? "GTC" : "Day") + "</td><td>" + (o.triggered ? "Triggered" : "Working") + '</td><td class="num"><button type="button" class="sm" data-cancel="' + o.id + '">Cancel</button></td></tr>';
      }).join("") + "</tbody></table>" : '<div class="empty">No working orders. Limit, stop and trailing orders wait here until they fill, expire or you cancel them.</div>';
    var hist = A.hist.slice(0, 200);
    $('[data-region="hist"]', el).innerHTML = hist.length ? '<table><thead><tr><th>#</th><th>Done</th><th>Order</th><th>Result</th></tr></thead><tbody>' + hist.map(function (o) {
      var res = o.status === "filled" ? '<span class="chip pos">Filled</span> <span class="mono small">' + (o.combo ? "net " + U.num(o.fillPx) : o.sym ? U.assetPx(W.M.assets[o.sym] || { type: "stock" }, o.fillPx) : U.num(o.fillPx)) + "</span>" + (o.fee ? ' <span class="tiny muted">fees ' + U.money(o.fee) + "</span>" : "")
        : o.status === "rejected" ? '<span class="chip neg">Rejected</span> <span class="small">' + esc(o.reason) + "</span>"
        : '<span class="chip">' + (o.status === "expired" ? "Expired" : "Cancelled") + "</span>" + (o.reason ? ' <span class="small muted">' + esc(o.reason) + "</span>" : "");
      return '<tr><td class="mono small">' + o.id + '</td><td class="small">' + esc(U.when(o.done, o.doneTick)) + '</td><td class="small">' + (o.side === "buy" ? "Buy " : "Sell ") + qtyTxt(W, o) + " " + esc(name(W, o)) + ' <span class="muted">' + OT[o.type] + "</span></td><td>" + res + "</td></tr>";
    }).join("") + "</tbody></table>" : '<div class="empty">No orders yet.</div>';
    var led = A.ledger.filter(function (l) { return s.led === "all" || l.type === s.led || (s.led === "deposit" && l.type === "withdraw") || (s.led === "dividend" && l.type === "split"); }).slice(0, 300);
    $('[data-region="ledger"]', el).innerHTML = led.length ? '<table><thead><tr><th>When</th><th>Type</th><th>Description</th><th class="num">Cash</th></tr></thead><tbody>' + led.map(function (l) {
      return '<tr><td class="small">' + esc(U.when(l.day, l.tick)) + '</td><td><span class="chip">' + esc(l.type) + '</span></td><td class="small">' + esc(l.text) + '</td><td class="num ' + U.cls(l.amount) + '">' + (l.amount == null ? "" : U.signedMoney(l.amount)) + "</td></tr>";
    }).join("") + "</tbody></table>" : '<div class="empty">No activity of this type yet.</div>';
  }

  App.register({ id: "orders", title: "Orders", render: render, mount: mount, update: update });
})(typeof self !== "undefined" ? self : this);
