(function (root) {
  "use strict";
  var BSX = root.BSX, U = BSX.UI.util, App = BSX.UI.App;
  var Cal = BSX.Cal, Market = BSX.Market, Options = BSX.Options;
  var esc = U.esc, $ = U.$;
  var PAGE = 50;

  function st() { return App.state("stocks", { tab: "stock", q: "", sector: "", index: "", sort: "cap", dir: -1, page: 0, etfKind: "" }); }

  function ret(a, n) { var c = a.bars.c, k = c.length; return k > n ? a.px / c[k - n - 1] - 1 : null; }

  var STOCK_COLS = [
    ["sym", "Symbol", false], ["px", "Price", true], ["chg", "Today", true], ["spark", "", false], ["vol", "Volume", true], ["cap", "Mkt cap", true],
    ["pe", "P/E", true], ["dy", "Yield", true], ["beta", "Beta", true], ["m1", "1M", true], ["y1", "1Y", true], ["r52", "52-wk range", false], ["earn", "Earnings", true]
  ];
  var ETF_COLS = [
    ["sym", "Symbol", false], ["kind", "Type", true], ["px", "Price", true], ["chg", "Today", true], ["spark", "", false], ["m1", "1M", true], ["y1", "1Y", true], ["er", "Expense", true], ["yl", "Yield", true], ["r52", "52-wk range", false]
  ];
  var KIND = { index: "Index", lev: "Leveraged", bond: "Bond", commodity: "Commodity", crypto: "Crypto", vol: "Volatility" };

  function key(W, a, k) {
    switch (k) {
      case "px": return a.px;
      case "chg": return U.change(a);
      case "vol": return a.vol * a.px;
      case "cap": return a.px * (a.shares || 0);
      case "pe": return a.eps > 0 ? a.px / a.eps : 1e9;
      case "dy": return a.dps ? a.dps / a.px : 0;
      case "beta": return a.beta;
      case "m1": return ret(a, 21) || 0;
      case "y1": return ret(a, 252) || 0;
      case "earn": return a.nextEarn || 1e9;
      case "kind": return a.kind + (a.lev || "");
      case "er": return a.er;
      case "yl": return fundYield(W, a) || 0;
      default: return a.id;
    }
  }

  function fundYield(W, a) {
    if (a.kind === "bond") return a.yld;
    if (a.kind === "index") { var ix = W.M.assets[a.track]; return ix && ix.q ? ix.q : null; }
    return null;
  }

  function render() {
    var s = st(), W = App.W;
    var secs = BSX.Universe.SECTORS;
    var h = '<div class="section-head"><div><h2>Stocks &amp; ETFs</h2><p>552 listed companies across 11 sectors and 51 exchange-traded funds, including leveraged, inverse, bond, commodity, crypto and volatility funds. Click a row to trade.</p></div>' +
      '<div class="seg"><button type="button" data-tab="stock" aria-pressed="' + (s.tab === "stock") + '">Stocks (' + W.M.lists.stock.length + ')</button><button type="button" data-tab="etf" aria-pressed="' + (s.tab === "etf") + '">ETFs (' + W.M.lists.etf.length + ")</button></div></div>";
    h += '<div class="card flush"><div class="row" style="padding:12px 14px">' +
      '<input type="search" data-f="q" placeholder="Filter by symbol, name or industry" value="' + esc(s.q) + '" style="flex:1 1 220px" aria-label="Filter">';
    if (s.tab === "stock") {
      h += '<select data-f="sector" aria-label="Sector"><option value="">All sectors</option>' + secs.map(function (x) { return '<option value="' + x.id + '"' + (s.sector === x.id ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select>" +
        '<select data-f="index" aria-label="Index"><option value="">Any index</option>' + [["US500", "US 500"], ["TECH100", "Tech 100"], ["IND30", "Industrial 30"], ["SMALL200", "Small Cap 200"], ["DIV50", "Dividend 50"]].map(function (x) { return '<option value="' + x[0] + '"' + (s.index === x[0] ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select>";
    } else {
      h += '<select data-f="etfKind" aria-label="Fund type"><option value="">All fund types</option>' + Object.keys(KIND).map(function (k) { return '<option value="' + k + '"' + (s.etfKind === k ? " selected" : "") + ">" + KIND[k] + "</option>"; }).join("") + "</select>";
    }
    h += '</div><div class="table-wrap" data-region="table"></div><div class="pager" data-region="pager"></div></div>';
    return h;
  }

  function mount(app, el) {
    var s = st();
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-tab],[data-sort],[data-page]");
      if (!b) return;
      if (b.dataset.tab) { s.tab = b.dataset.tab; s.page = 0; s.sort = s.tab === "stock" ? "cap" : "kind"; s.dir = s.tab === "stock" ? -1 : 1; App.refresh(true); }
      else if (b.dataset.sort) { var k = b.dataset.sort; if (s.sort === k) s.dir = -s.dir; else { s.sort = k; s.dir = k === "sym" || k === "earn" || k === "kind" ? 1 : -1; } s.page = 0; update(app, el); }
      else if (b.dataset.page) { s.page = Math.max(0, s.page + (+b.dataset.page)); update(app, el); window.scrollTo(0, 0); }
    });
    U.$$("[data-f]", el).forEach(function (inp) {
      inp.addEventListener(inp.tagName === "SELECT" ? "change" : "input", function () { s[inp.dataset.f] = inp.value; s.page = 0; update(app, el); });
    });
  }

  function update(app, el) {
    var W = App.W, M = W.M, s = st();
    var q = s.q.trim().toLowerCase();
    var list = (s.tab === "stock" ? M.lists.stock : M.lists.etf).map(function (id) { return M.assets[id]; }).filter(function (a) {
      if (q && (a.id + " " + a.name + " " + (a.industry || "")).toLowerCase().indexOf(q) < 0) return false;
      if (s.tab === "stock") {
        if (s.sector && a.sector !== s.sector) return false;
        if (s.index && M.assets[s.index].members.indexOf(a.id) < 0) return false;
      } else if (s.etfKind && a.kind !== s.etfKind) return false;
      return true;
    });
    var sk = s.sort;
    list.sort(function (a, b) { var x = key(W, a, sk), y = key(W, b, sk); return (x < y ? -1 : x > y ? 1 : 0) * s.dir; });
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (s.page >= pages) s.page = pages - 1;
    var rows = list.slice(s.page * PAGE, s.page * PAGE + PAGE);
    var cols = s.tab === "stock" ? STOCK_COLS : ETF_COLS;
    var head = "<thead><tr>" + cols.map(function (c) {
      var num = c[0] !== "sym" && c[0] !== "spark" && c[0] !== "r52" && c[0] !== "kind";
      return "<th" + (c[2] || c[0] === "sym" ? ' data-sort="' + c[0] + '"' : "") + ' class="' + (num ? "num " : "") + (c[2] || c[0] === "sym" ? "sortable " : "") + (s.sort === c[0] ? (s.dir > 0 ? "sorted-asc" : "sorted-desc") : "") + '">' + c[1] + "</th>";
    }).join("") + "</tr></thead>";
    var body = rows.map(function (a) {
      var ch = U.change(a);
      var m1 = ret(a, 21), y1 = ret(a, 252);
      var pos52 = a.hi52 > a.lo52 ? (a.px - a.lo52) / (a.hi52 - a.lo52) : 0.5;
      var r52 = '<div class="meter" title="' + U.assetPx(a, a.lo52) + " – " + U.assetPx(a, a.hi52) + '"><i style="width:' + Math.max(3, Math.min(100, pos52 * 100)).toFixed(0) + '%"></i></div>';
      var spark = U.spark(BSX.UI.sparkSeries(a), { base: a.intra.length > 2 ? a.prev : null });
      var sym = '<td><div class="sym-cell"><span class="sym">' + a.id + (App.isWatched(a.id) ? " ★" : "") + '</span><span class="nm">' + esc(a.name) + "</span></div></td>";
      if (s.tab === "stock") {
        return '<tr class="click" data-trade="' + a.id + '">' + sym +
          '<td class="num">' + U.assetPx(a) + '</td><td class="num ' + U.cls(ch) + '">' + U.pct(ch) + "</td><td>" + spark + "</td>" +
          '<td class="num">' + U.compact(a.vol) + '</td><td class="num">' + U.compact(a.px * a.shares, "$") + '</td>' +
          '<td class="num">' + (a.eps > 0 ? (a.px / a.eps).toFixed(1) : "—") + '</td><td class="num">' + (a.dps > 0 ? U.pctU(a.dps / a.px, 2) : "—") + '</td>' +
          '<td class="num">' + a.beta.toFixed(2) + '</td><td class="num ' + U.cls(m1) + '">' + U.pct(m1, 1) + '</td><td class="num ' + U.cls(y1) + '">' + U.pct(y1, 1) + "</td><td>" + r52 + '</td>' +
          '<td class="num small">' + (a.nextEarn ? Cal.short(a.nextEarn) : "—") + "</td></tr>";
      }
      return '<tr class="click" data-trade="' + a.id + '">' + sym + '<td class="small">' + KIND[a.kind] + (a.kind === "lev" ? " " + a.lev + "×" : "") + "</td>" +
        '<td class="num">' + U.assetPx(a) + '</td><td class="num ' + U.cls(ch) + '">' + U.pct(ch) + "</td><td>" + spark + "</td>" +
        '<td class="num ' + U.cls(m1) + '">' + U.pct(m1, 1) + '</td><td class="num ' + U.cls(y1) + '">' + U.pct(y1, 1) + '</td><td class="num">' + U.pctU(a.er, 2) + '</td><td class="num">' + (fundYield(W, a) != null ? U.pctU(fundYield(W, a), 2) : "—") + "</td><td>" + r52 + "</td></tr>";
    }).join("");
    $('[data-region="table"]', el).innerHTML = "<table>" + head + "<tbody>" + (body || '<tr><td colspan="13" class="empty">No matches.</td></tr>') + "</tbody></table>";
    $('[data-region="pager"]', el).innerHTML = "<span>" + list.length + " results · page " + (s.page + 1) + " of " + pages + '</span><span class="row"><button type="button" data-page="-1"' + (s.page === 0 ? " disabled" : "") + '>← Previous</button><button type="button" data-page="1"' + (s.page >= pages - 1 ? " disabled" : "") + ">Next →</button></span>";
  }

  App.register({ id: "stocks", title: "Stocks & ETFs", render: render, mount: mount, update: update });
})(typeof self !== "undefined" ? self : this);
