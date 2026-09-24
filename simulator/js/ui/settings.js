(function (root) {
  "use strict";
  var BSX = root.BSX, U = BSX.UI.util, Cal = BSX.Cal, Broker = BSX.Broker, Sim = BSX.Sim;
  var esc = U.esc, $ = U.$;

  BSX.UI.openSettings = function (App, focus) {
    var W = App.W, A = W.A, p = App.prefs();
    var inFrame = false;
    try { inFrame = window.top !== window.self; } catch (e) { inFrame = true; }
    var radio = function (name, val, cur, label, note) {
      return '<label class="row" style="align-items:flex-start;gap:8px;margin-bottom:6px;flex-wrap:nowrap"><input type="radio" name="' + name + '" value="' + val + '"' + (cur === val ? " checked" : "") + '><span><b>' + label + '</b><br><span class="small secondary">' + note + "</span></span></label>";
    };
    var check = function (id, on, label) { return '<label class="row" style="gap:8px;flex-wrap:nowrap"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "><span>" + label + "</span></label>"; };
    var html = '<div class="modal-head"><div class="title"><div class="t"><b style="font-family:var(--sans)">Settings</b></div><div class="small muted">Game seed ' + esc(W.seed) + " · started " + Cal.nice(W.startDay) + " · now " + Cal.nice(W.day) + '</div></div><button type="button" class="ghost modal-close" aria-label="Close">✕</button></div>' +
      '<div class="modal-body stack">' +
      '<section class="card" id="set-account"><h3>Account type</h3>' +
        radio("acct", "cash", A.type, "Cash", "No borrowing or shorting. Options limited to buying, covered calls and cash-secured puts. No futures, FX or perpetuals.") +
        radio("acct", "margin", A.type, "Reg T margin", "2:1 on stock, short selling, strategy-based option margin, futures, FX and perpetuals.") +
        radio("acct", "pm", A.type, "Portfolio margin", "Risk-based margin across each underlying's stock and options. Needs $100,000 of equity.") +
        '<div class="row"><button type="button" id="set-type">Change account type</button><span class="small" id="set-type-msg"></span></div>' +
        '<div style="margin-top:10px">' + check("set-drip", A.settings.drip, "Reinvest dividends automatically (DRIP)") + "</div></section>" +
      '<section class="card"><h3>Notifications and display</h3><div class="stack" style="gap:6px">' +
        check("p-toastFills", p.toastFills, "Show a message when an order fills") +
        check("p-pauseFills", p.pauseFills, "Pause the clock when an order fills") +
        check("p-toastNews", p.toastNews, "Show market-moving headlines and news on watched symbols") +
        check("p-pauseNews", p.pauseNews, "Pause the clock on major market events") +
        '<div class="row" style="margin-top:6px"><span class="small">Gains are shown in</span><div class="seg"><button type="button" data-gain="blue" aria-pressed="' + (p.gain === "blue") + '">Blue</button><button type="button" data-gain="green" aria-pressed="' + (p.gain === "green") + '">Green</button></div><span class="small muted">Losses are red.</span></div>' +
        '<p class="small muted" style="margin:6px 0 0">Margin calls, liquidations and price alerts always pause the clock.</p></div></section>' +
      '<section class="card"><h3>New game</h3><p class="small secondary">Builds a fresh market with a year of history. The 552 companies stay the same; the seed decides how prices, the economy and the news play out. Your current game will be replaced.</p>' +
        '<div class="grid g2">' +
          '<label class="field"><span>Starting cash</span><select id="ng-cash">' + [10000, 25000, 100000, 250000, 1000000, 10000000].map(function (x) { return '<option value="' + x + '"' + (x === 100000 ? " selected" : "") + ">" + U.money0(x) + "</option>"; }).join("") + "</select></label>" +
          '<label class="field"><span>Account type</span><select id="ng-acct"><option value="margin" selected>Reg T margin</option><option value="cash">Cash</option><option value="pm">Portfolio margin (needs $100,000+)</option></select></label>' +
          '<label class="field"><span>Start date</span><input id="ng-start" type="date" value="' + Sim.DEFAULT_START + '" min="2000-01-03" max="2090-12-31"></label>' +
          '<label class="field"><span>Seed (optional)</span><input id="ng-seed" type="text" placeholder="Random" autocomplete="off"></label>' +
        '</div><div class="row" style="margin-top:10px"><button type="button" class="primary" id="ng-go">Start new game</button><span class="small" id="ng-msg"></span></div></section>' +
      '<section class="card"><h3>Saved game</h3><p class="small secondary">Your game saves itself in this browser every 30 seconds and when you pause. ' + (inFrame ? "Import a save file below." : "Export a file to back it up or move it to another browser.") + '</p><div class="row">' +
        (inFrame ? "" : '<button type="button" id="sv-export">Export save file</button>') +
        '<label class="btn" style="display:inline-block">Import save file<input type="file" id="sv-import" accept=".json,application/json" hidden></label><span class="small" id="sv-msg"></span></div></section>' +
      "</div>";
    var el = App.openModal(html, { narrow: true, label: "Settings" });
    el.querySelector(".modal-close").addEventListener("click", App.closeModal);
    if (focus === "account") setTimeout(function () { var s = $("#set-account", el); if (s) s.scrollIntoView({ block: "start" }); }, 30);

    $("#set-type", el).addEventListener("click", function () {
      var v = (el.querySelector('input[name="acct"]:checked') || {}).value;
      var r = Broker.setType(W, A, v);
      var m = $("#set-type-msg", el);
      m.className = "small " + (r.ok ? "up" : "down");
      m.textContent = r.ok ? "Account type updated." : r.error;
      App.refresh(true);
    });
    $("#set-drip", el).addEventListener("change", function (e) { A.settings.drip = e.target.checked; });
    ["toastFills", "pauseFills", "toastNews", "pauseNews"].forEach(function (k) {
      $("#p-" + k, el).addEventListener("change", function (e) { App.setPref(k, e.target.checked); });
    });
    U.$$("[data-gain]", el).forEach(function (b) {
      b.addEventListener("click", function () { App.setPref("gain", b.dataset.gain); U.$$("[data-gain]", el).forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); App.refresh(true); });
    });
    var confirmNew = false;
    $("#ng-go", el).addEventListener("click", function () {
      var cash = +$("#ng-cash", el).value, acct = $("#ng-acct", el).value, start = $("#ng-start", el).value, seed = $("#ng-seed", el).value.trim();
      var msg = $("#ng-msg", el);
      if (acct === "pm" && cash < Broker.PM_MIN) { msg.className = "small down"; msg.textContent = "Portfolio margin needs at least $100,000."; return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) { msg.className = "small down"; msg.textContent = "Enter a start date."; return; }
      if (!confirmNew) { confirmNew = true; this.textContent = "Confirm: replace my current game"; msg.className = "small"; msg.textContent = "This can't be undone unless you exported a save."; return; }
      App.newGame({ cash: cash, account: acct, start: start, seed: seed || null });
    });
    var exp = $("#sv-export", el);
    if (exp) exp.addEventListener("click", function () {
      try {
        var blob = new Blob([Sim.toJSON(App.W)], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "broad-street-" + Cal.iso(App.W.day) + ".json";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        $("#sv-msg", el).textContent = "Save file downloaded.";
      } catch (e) { $("#sv-msg", el).textContent = "Export failed: " + e.message; }
    });
    $("#sv-import", el).addEventListener("change", function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          App.W = Sim.fromJSON(rd.result);
          App.searchIndex = null;
          App.closeModal();
          App.refresh(true);
          App.save();
          App.toast("Save loaded: " + Cal.nice(App.W.day) + ".", "info");
        } catch (err) { $("#sv-msg", el).className = "small down"; $("#sv-msg", el).textContent = "That file isn't a Broad Street save (" + err.message + ")."; }
      };
      rd.readAsText(f);
    });
  };
})(typeof self !== "undefined" ? self : this);
