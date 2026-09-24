(function (root) {
  "use strict";
  var BSX = root.BSX, U = BSX.UI.util, App = BSX.UI.App, Broker = BSX.Broker;

  function render() {
    var F = Broker.FEES;
    var W = App.W;
    var n = W.M.lists;
    var rows = [
      ["Stocks", n.stock.length + " companies", "9:30 am – 4:00 pm", "Free; SEC and FINRA fees on sales", "50% initial / 25% maintenance long; 150% / 30% short"],
      ["ETFs", n.etf.length + " funds", "9:30 am – 4:00 pm", "Free; SEC and FINRA fees on sales", "As stocks; 2× funds 50% and 3× funds 75% maintenance"],
      ["Options", "Every stock and ETF, plus 3 indices", "9:30 am – 4:00 pm", "$" + F.optContract.toFixed(2) + " per contract", "Long: paid in full. Short: strategy-based (below)"],
      ["Treasuries", "Bills, notes, bonds", "9:30 am – 4:00 pm", "Free", "1–6% of value by maturity"],
      ["Corporate and municipal bonds", "Investment grade to CCC", "9:30 am – 4:00 pm", "$" + F.bondPer1k + " per $1,000 face", "20–40% (IG/HY); munis 15%"],
      ["Futures", n.future.length + " contracts on indices, energy, metals, grains, Treasuries, crypto", "Around the clock", "$" + F.futContract.toFixed(2) + " per contract", "Exchange margin, 2–35% of notional, rising with volatility"],
      ["Spot FX", n.fx.length + " pairs", "Around the clock", "Spread only", "2% (50:1) majors, 5% (20:1) others"],
      ["Crypto", n.crypto.length + " coins", "Around the clock", (F.cryptoSpot * 100).toFixed(2) + "% of value", "Paid in full; no shorting"],
      ["Perpetuals", n.perp.length + " contracts", "Around the clock", (F.perp * 100).toFixed(2) + "% of value", "1 ÷ leverage (up to 20×); half that to maintain"]
    ];
    return '<div class="section-head"><div><h2>How Broad Street works</h2><p>A complete, simulated US market. Every company, coin and issuer is fictional; the mechanics follow real US market rules where it matters.</p></div></div>' +
      '<div class="grid g2 guide">' +
      '<div class="card"><h3 style="margin-top:0">Running the clock</h3><ul>' +
        "<li>Press <kbd>Space</kbd> or ▶ to run the market; pick a speed from 15 minutes to a week of market time per second.</li>" +
        "<li><kbd>.</kbd> advances 15 minutes, <kbd>N</kbd> runs to the next close, and the +1 wk / +1 mo buttons fast-forward five or 21 trading days. Fast-forwarding stops at margin calls, liquidations and price alerts.</li>" +
        "<li>The session runs 9:30 am to 4:00 pm Eastern on NYSE trading days, with real US market holidays. Nights and weekends pass in one step, and crypto, FX and futures keep moving through them.</li>" +
        "<li><kbd>/</kbd> jumps to search. <kbd>Esc</kbd> closes a window.</li>" +
        "<li>Your game saves itself in this browser. Settings can start a new game with a different seed, cash amount or account type, and can export or import a save.</li></ul>" +
      "<h3>Order types</h3><ul>" +
        "<li><b>Market</b> fills now at the ask (buying) or bid (selling), plus a price impact for big orders relative to daily volume.</li>" +
        "<li><b>Limit</b> fills only at your price or better.</li>" +
        "<li><b>Stop</b> becomes a market order once the price touches the stop; it can fill well past it after a gap. <b>Stop limit</b> becomes a limit order instead.</li>" +
        "<li><b>Trailing stop</b> follows the price by a fixed amount or percentage and triggers when it reverses by that much.</li>" +
        "<li><b>Day</b> orders expire at the close; <b>GTC</b> orders last up to 90 days. Orders for stocks, ETFs, bonds and options sent while the market is closed fill at the next open.</li></ul></div>" +
      '<div class="card"><h3 style="margin-top:0">Margin and leverage</h3><ul>' +
        "<li><b>Cash account</b>: no borrowing. You can buy anything paid in full, sell covered calls and sell cash-secured puts.</li>" +
        "<li><b>Reg T margin</b> (the default): borrow up to half the cost of marginable stock. Keep equity above the maintenance requirement or you get a margin call. Debit balances pay the Fed funds rate plus 1–3%; idle cash earns the Fed rate minus 0.5%.</li>" +
        "<li><b>Portfolio margin</b> (needs $100,000): each underlying's stock and options are stress-tested over ±15% (±8% for broad indices) and the worst loss is the requirement. Hedged books need far less margin.</li>" +
        "<li><b>Short selling</b>: you pay a borrow fee (0.25–0.6% a year for most stocks, up to 90% for hard-to-borrow names) and any dividends while short. Short-sale proceeds don't earn interest.</li>" +
        "<li><b>Margin calls</b>: when equity drops below maintenance you have until the next day's close to deposit or reduce positions. If equity falls below half of maintenance, or the deadline passes, the broker liquidates the positions with the biggest requirements.</li>" +
        "<li><b>Short options (Reg T)</b>: covered calls and puts need no extra margin; spreads need their maximum loss; naked options need 20% of the underlying (15% for index options) less the out-of-the-money amount, with a floor of 10%.</li></ul></div>" +
      '<div class="card span-all"><h3 style="margin-top:0">What you can trade</h3><div class="table-wrap"><table><thead><tr><th>Market</th><th>What</th><th>Hours</th><th>Costs</th><th>Margin</th></tr></thead><tbody>' +
        rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td class=\"small\">" + U.esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div></div>" +
      '<div class="card"><h3 style="margin-top:0">Options</h3><ul>' +
        "<li>Stock and ETF options are American (you can exercise any time the market is open) and settle in 100 shares. US 500, Tech 100 and Small Cap 200 options are European and settle in cash.</li>" +
        "<li>Weekly expirations for the next four Fridays, monthlies (third Friday), quarterlies and two January LEAPS.</li>" +
        "<li>At expiration, anything a cent or more in the money is exercised or assigned automatically. If you can't afford the shares, the broker sells the option for its intrinsic value instead.</li>" +
        "<li>Short American calls can be assigned early the day before an ex-dividend date, and deep in-the-money shorts can be assigned any day.</li>" +
        "<li>Implied volatility tracks the stock's real volatility, is higher for short-dated options in a selloff, has a downside skew, and jumps before earnings and collapses after.</li>" +
        "<li>Stock splits adjust strikes and contract counts.</li></ul>" +
      "<h3>Bonds</h3><ul>" +
        "<li>Treasuries are auctioned on a schedule: bills every month, notes and bonds monthly or quarterly. Coupons are paid twice a year into cash and principal comes back at maturity.</li>" +
        "<li>Corporate yields are the Treasury yield plus a spread that widens with the business cycle, with market volatility and when the issuer's stock drops.</li></ul></div>" +
      '<div class="card"><h3 style="margin-top:0">Futures, FX and crypto</h3><ul>' +
        "<li>Futures settle gains and losses into cash at every close, and cash-settle at expiry. Each root lists the next two contracts; roll by closing the front month and opening the next.</li>" +
        "<li>FX positions earn or pay a daily swap: the interest-rate difference between the two currencies, minus a 0.5% broker markup.</li>" +
        "<li>Perpetuals never expire. Every 8 hours longs pay shorts the funding rate (or receive it when negative). Leverage sets how much margin a position reserves; the whole account backs every position.</li>" +
        "<li>Staking coins (AETH, SOLX, LUMA, VOLT) pay their yield daily in extra coins.</li></ul>" +
      "<h3>What moves prices</h3><ul>" +
        "<li>A <b>business cycle</b> sets growth, inflation, unemployment and the expected market return. Stocks usually bottom partway through a recession.</li>" +
        "<li><b>The Fed</b> meets eight times a year and follows a Taylor rule, so rates rise with inflation and fall as unemployment rises. The yield curve prices the expected path.</li>" +
        "<li><b>Data releases</b> (jobs, CPI, GDP, retail sales, ISM, FOMC) move markets by how far they miss the consensus.</li>" +
        "<li><b>Stocks</b> move with the market (by their beta), their sector (which reacts to oil and interest rates), a slowly changing stock-specific trend and news. Expensive stocks and markets tend to earn less, and cheap ones more.</li>" +
        "<li><b>Earnings</b> come out quarterly; the stock jumps on the surprise versus estimates. Dividends go ex on schedule, and very high share prices get split.</li>" +
        "<li><b>Random events</b>: upgrades, lawsuits, FDA decisions, takeovers, short squeezes, OPEC decisions, hurricanes, wars, flash crashes, exchange hacks and more.</li></ul></div>" +
      "</div>";
  }

  App.register({ id: "guide", title: "Guide", render: render });
})(typeof self !== "undefined" ? self : this);
