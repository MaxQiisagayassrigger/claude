/*
 * Views. Each function takes the app state and returns an HTML string.
 * Buttons carry data-act (and optional data-arg); app.js handles them with one delegated listener.
 */
(function (root, factory) {
  var HL = (root.HL = root.HL || {});
  factory(HL);
  if (typeof module === "object" && module.exports) module.exports = HL;
})(typeof globalThis !== "undefined" ? globalThis : this, function (HL) {
  "use strict";
  var D = HL.data, P = HL.player, Lg = HL.league, Sm = HL.sim;

  // ---- Helpers --------------------------------------------------------------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function tier(v) { return v >= 90 ? "elite" : v >= 80 ? "great" : v >= 70 ? "good" : v >= 60 ? "avg" : "poor"; }
  function rt(v, extra) { return '<span class="rt t-' + tier(v) + (extra ? " " + extra : "") + '">' + v + "</span>"; }
  function f1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  function pct(x) { return (x * 100).toFixed(1); }
  function money(m) { return "$" + m.toFixed(1) + "M"; }
  function compact(n) { return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n)); }
  function num(n) { return Math.round(n).toLocaleString("en-US"); }
  function teamVars(t) { return t ? "--c1:" + t.c1 + ";--c2:" + t.c2 : ""; }
  function full(p) { return esc(p.first + " " + p.last); }
  function btn(act, label, cls, arg, extra) {
    return '<button type="button" class="btn ' + (cls || "") + '" data-act="' + act + '"' + (arg != null ? ' data-arg="' + esc(arg) + '"' : "") +
      (extra || "") + "><span>" + label + "</span></button>";
  }
  function gradeClass(g) { return g ? "g-" + g.charAt(0).toLowerCase() : ""; }
  function badgeChip(lv) { return lv ? '<span class="tierchip tc-' + lv + '">' + D.BADGE_TIERS[lv] + "</span>" : '<span class="tierchip tc-0">Locked</span>'; }

  // ---- Court (half court, 10 SVG units per foot, baseline at the top) -----------------
  function courtSVG(shots, opts) {
    opts = opts || {};
    var dots = (shots || []).map(function (s, i) {
      var x = (s.spot.x * 10).toFixed(1), y = (s.spot.y * 10).toFixed(1), last = opts.highlightLast && i === shots.length - 1;
      return s.made
        ? '<circle class="shot-make' + (last ? " shot-last" : "") + '" cx="' + x + '" cy="' + y + '" r="' + (last ? 9 : 6.5) + '"/>'
        : '<path class="shot-miss' + (last ? " shot-last" : "") + '" d="M' + (x - 6) + " " + (y - 6) + "l12 12M" + (x - 6) + " " + (+y + 6) + 'l12 -12"/>';
    }).join("");
    return '<svg class="court' + (opts.cls ? " " + opts.cls : "") + '" viewBox="0 0 500 470" role="img" aria-label="' + esc(opts.label || "Half court") + '">' +
      '<defs><pattern id="planks" width="25" height="470" patternUnits="userSpaceOnUse"><rect width="25" height="470" class="court-wood"/>' +
      '<rect x="24" width="1" height="470" class="court-seam"/></pattern></defs>' +
      '<rect width="500" height="470" fill="url(#planks)"/>' +
      '<rect x="170" y="0" width="160" height="190" class="court-paint"/>' +
      '<g class="court-lines" fill="none">' +
      '<rect x="1" y="1" width="498" height="468"/>' +
      '<rect x="170" y="0" width="160" height="190"/>' +
      '<circle cx="250" cy="190" r="60"/>' +
      '<path d="M30 0V142A237.5 237.5 0 0 0 470 142V0"/>' +
      '<path d="M210 52.5A40 40 0 0 0 290 52.5"/>' +
      '<path d="M190 470A60 60 0 0 1 310 470"/>' +
      '<line x1="220" y1="40" x2="280" y2="40" class="court-board"/>' +
      '<circle cx="250" cy="52.5" r="7.5" class="court-rim"/>' +
      "</g>" + dots + "</svg>";
  }

  function zoneSplits(shots) {
    var z = { rim: [0, 0], post: [0, 0], mid: [0, 0], three: [0, 0] };
    shots.forEach(function (s) { z[s.type][1]++; if (s.made) z[s.type][0]++; });
    return z;
  }

  // ---- Title -------------------------------------------------------------------------
  function title(S) {
    var sv = S.savedSummary;
    return '<div class="title-screen">' +
      '<div class="title-court" aria-hidden="true">' + courtSVG([], { cls: "court-ghost" }) + "</div>" +
      '<div class="wrap title-inner">' +
      '<p class="eyebrow">Basketball career simulator</p>' +
      '<h1 class="wordmark">Hardwood<span>Legacy</span></h1>' +
      '<p class="lede">Build your player, survive draft night, earn your minutes and chase a ring. Every possession is simulated from 21 ratings, 16 badges and the matchup in front of you.</p>' +
      '<div class="title-actions">' +
      (sv ? '<button type="button" class="continue-card" data-act="continueCareer" style="' + sv.vars + '">' +
        '<span class="label">Continue career</span><span class="cc-name">' + esc(sv.name) + "</span>" +
        '<span class="cc-meta">' + esc(sv.meta) + '</span><span class="cc-ovr">' + sv.ovr + "</span></button>" : "") +
      btn("newCareer", "New career", "btn-primary") + btn("toggleImport", S.importOpen ? "Close import" : "Import save code", "btn-ghost") +
      "</div>" +
      (S.importOpen ? '<div class="import-box panel"><label class="label" for="importText">Paste a save code</label>' +
        '<textarea id="importText" rows="4" placeholder="Paste the code you copied from Settings"></textarea>' +
        '<div class="row">' + btn("importSave", "Load save", "btn-primary") + (S.importError ? '<span class="err">' + esc(S.importError) + "</span>" : "") + "</div></div>" : "") +
      '<dl class="title-facts">' +
      "<div><dt>21</dt><dd>ratings in six categories, each with a build cap</dd></div>" +
      "<div><dt>16</dt><dd>badges from Bronze to Hall of Fame</dd></div>" +
      "<div><dt>30</dt><dd>teams, 82-game seasons and four playoff rounds</dd></div>" +
      "<div><dt>1</dt><dd>shot meter. Green releases almost always drop.</dd></div>" +
      "</dl></div></div>";
  }

  // ---- Builder -------------------------------------------------------------------------
  function builder(S) {
    var b = S.builder, Pm = D.POSITIONS[b.pos];
    var archs = Object.keys(D.ARCHETYPES).filter(function (k) { return D.ARCHETYPES[k].pos.indexOf(b.pos) >= 0; });
    var st = S.settings;
    return '<div class="screen builder">' + topbar(S, "Create your player") +
      '<div class="wrap builder-grid">' +
      '<form class="builder-form" id="builderForm" autocomplete="off">' +
      '<section class="bsec"><h2 class="sec-h">Identity</h2><div class="field-grid">' +
      field("First name", '<input id="bFirst" data-bind="first" maxlength="16" value="' + esc(b.first) + '">') +
      field("Last name", '<input id="bLast" data-bind="last" maxlength="18" value="' + esc(b.last) + '">') +
      field("Jersey", '<input id="bJersey" data-bind="jersey" type="number" min="0" max="99" value="' + esc(b.jersey) + '">') +
      field("Hometown", '<input id="bHome" data-bind="hometown" maxlength="28" value="' + esc(b.hometown) + '">') +
      field("College / Pro route", '<select id="bCollege" data-bind="college">' + D.COLLEGES.map(function (c) {
        return '<option' + (c === b.college ? " selected" : "") + ">" + esc(c) + "</option>";
      }).join("") + "</select>", "wide") +
      "</div></section>" +
      '<section class="bsec"><h2 class="sec-h">Position</h2><div class="seg" role="group" aria-label="Position">' +
      D.POS_ORDER.map(function (k) {
        return '<button type="button" id="pos' + k + '" class="seg-btn' + (k === b.pos ? " on" : "") + '" data-act="setPos" data-arg="' + k + '" aria-pressed="' + (k === b.pos) + '"><b>' + k + "</b><small>" + D.POSITIONS[k].name + "</small></button>";
      }).join("") + "</div></section>" +
      '<section class="bsec"><h2 class="sec-h">Build</h2><div class="arch-grid">' +
      archs.map(function (k) {
        var A = D.ARCHETYPES[k];
        return '<button type="button" id="arch' + k + '" class="arch' + (k === b.arch ? " on" : "") + '" data-act="setArch" data-arg="' + k + '" aria-pressed="' + (k === b.arch) + '">' +
          "<b>" + esc(A.name) + "</b><small>" + esc(A.blurb) + "</small></button>";
      }).join("") + "</div></section>" +
      '<section class="bsec"><h2 class="sec-h">Body</h2><div class="sliders">' +
      slider("Height", "bHeight", "height", Pm.h[0], Pm.h[1], b.height, P.heightStr(b.height), "Taller: more blocks, rebounds and post. Slower, looser handle.") +
      slider("Weight", "bWeight", "weight", Pm.w[0], Pm.w[1], b.weight, b.weight + " lbs", "Heavier: more strength and post. Less speed, vertical and stamina.") +
      slider("Wingspan", "bWing", "wingspan", b.height - 2, b.height + 9, b.wingspan, P.heightStr(b.wingspan), "Longer: more steals, blocks and contests. Costs jump-shot touch.") +
      "</div></section>" +
      '<section class="bsec"><h2 class="sec-h">Career settings</h2><div class="field-grid">' +
      field("Season length", '<select id="sLen" data-set="seasonLength">' + D.SEASON_LENGTHS.map(function (n) {
        return "<option value=\"" + n + "\"" + (n === st.seasonLength ? " selected" : "") + ">" + n + " games</option>";
      }).join("") + "</select>") +
      field("Difficulty", '<select id="sDiff" data-set="difficulty">' + Object.keys(D.DIFFICULTY).map(function (k) {
        return '<option value="' + k + '"' + (k === st.difficulty ? " selected" : "") + ">" + D.DIFFICULTY[k].name + "</option>";
      }).join("") + "</select>") +
      toggle("Injuries", "sInj", "injuries", st.injuries) + toggle("Shot meter", "sMeter", "meter", st.meter) +
      "</div></section>" +
      "</form>" +
      '<aside class="builder-preview" id="builderPreview">' + builderPreview(S) + "</aside>" +
      "</div></div>";
  }
  function field(label, control, cls) {
    var id = (control.match(/id="([^"]+)"/) || [])[1];
    return '<div class="field ' + (cls || "") + '"><label class="label" for="' + id + '">' + label + "</label>" + control + "</div>";
  }
  function slider(label, id, bind, min, max, v, shown, hint) {
    return '<div class="slider"><div class="slider-top"><label class="label" for="' + id + '">' + label + '</label><output id="' + id + 'Out">' + esc(shown) + "</output></div>" +
      '<input type="range" id="' + id + '" data-bind="' + bind + '" min="' + min + '" max="' + max + '" value="' + v + '"><p class="hint">' + hint + "</p></div>";
  }
  function toggle(label, id, key, on) {
    return '<div class="field"><span class="label">' + label + '</span><button type="button" id="' + id + '" class="toggle' + (on ? " on" : "") + '" data-act="toggleSetting" data-arg="' + key + '" aria-pressed="' + on + '">' + (on ? "On" : "Off") + "</button></div>";
  }

  function builderPreview(S) {
    var b = S.builder;
    var caps = P.builderCaps(b.pos, b.arch, b.height, b.weight, b.wingspan);
    var start = P.builderStart(b.pos, caps, 60);
    var pot = P.ovrFrom(caps, b.pos), bd = P.badgeLevels(caps), counts = [0, 0, 0, 0, 0];
    Object.keys(bd).forEach(function (k) { counts[bd[k]]++; });
    var top = D.ATTRS.slice().sort(function (x, y) { return caps[y] - caps[x]; }).slice(0, 6);
    return '<div class="pcard">' +
      '<div class="pcard-num" aria-hidden="true">' + esc(b.jersey) + "</div>" +
      '<div class="pcard-body"><span class="label">' + esc(D.POSITIONS[b.pos].name) + " · " + P.heightStr(b.height) + " · " + b.weight + " lbs</span>" +
      '<div class="pcard-name">' + esc(b.first || "First") + "<b>" + esc(b.last || "Last") + "</b></div>" +
      '<div class="pcard-arch">' + esc(D.ARCHETYPES[b.arch].name) + "</div></div>" +
      '<div class="pcard-ovrs"><div><span class="label">Start</span><b>60</b></div><div class="max"><span class="label">Max OVR</span><b>' + pot + "</b></div></div></div>" +
      '<div class="panel pv-cats"><h3 class="mini-h">Attribute caps by category</h3>' +
      D.ATTR_GROUPS.map(function (g) {
        var avgCap = g.attrs.reduce(function (s, a) { return s + caps[a[0]]; }, 0) / g.attrs.length;
        var avgStart = g.attrs.reduce(function (s, a) { return s + start[a[0]]; }, 0) / g.attrs.length;
        return '<div class="catbar"><span>' + g.label + '</span><div class="bar"><i class="bar-start" style="width:' + avgStart.toFixed(0) + '%"></i><i class="bar-cap" style="width:' + avgCap.toFixed(0) + '%"></i></div><b class="num">' + Math.round(avgCap) + "</b></div>";
      }).join("") + '<p class="hint">Solid bar: rookie rating. Faded bar: the ceiling you can upgrade to.</p></div>' +
      '<div class="panel pv-top"><h3 class="mini-h">Best skills</h3><ul class="toplist">' +
      top.map(function (a) { return "<li><span>" + D.ATTR_LABEL[a] + "</span>" + rt(caps[a]) + "</li>"; }).join("") + "</ul>" +
      '<h3 class="mini-h">Badge ceiling</h3><div class="badge-counts">' +
      [4, 3, 2, 1].map(function (lv) { return '<span class="tierchip tc-' + lv + '">' + counts[lv] + " " + D.BADGE_TIERS[lv] + "</span>"; }).join("") + "</div></div>" +
      btn("toCombine", "Enter the draft combine", "btn-primary btn-block");
  }

  // ---- Combine -------------------------------------------------------------------------------
  function combine(S) {
    var u = S.draftee, C = S.combine;
    var vert = (26 + (u.r.vertical - 50) * 0.36).toFixed(1), lane = (11.9 - (u.r.speed - 50) * 0.03).toFixed(2),
      sprint = (3.5 - (u.r.speed - 50) * 0.007).toFixed(2), reach = Math.round(u.height * 1.31 + (u.wingspan - u.height) * 0.5);
    var dots = "";
    for (var i = 0; i < 10; i++) {
      var r = C.results[i];
      dots += '<span class="cshot ' + (r == null ? "" : r ? "hit" : "miss") + '" aria-label="' + (r == null ? "Shot " + (i + 1) : r ? "Make" : "Miss") + '"></span>';
    }
    var made = C.results.filter(Boolean).length, done = C.results.length >= 10;
    return '<div class="screen combine">' + topbar(S, "Draft combine") +
      '<div class="wrap combine-grid">' +
      '<section class="panel"><h2 class="sec-h">Measurements</h2><dl class="measure">' +
      "<div><dt>Height w/o shoes</dt><dd>" + P.heightStr(u.height - 1) + "</dd></div>" +
      "<div><dt>Wingspan</dt><dd>" + P.heightStr(u.wingspan) + "</dd></div>" +
      "<div><dt>Standing reach</dt><dd>" + P.heightStr(reach) + "</dd></div>" +
      "<div><dt>Weight</dt><dd>" + u.weight + " lbs</dd></div>" +
      "<div><dt>Max vertical</dt><dd>" + vert + '"</dd></div>' +
      "<div><dt>Lane agility</dt><dd>" + lane + " s</dd></div>" +
      "<div><dt>3/4 court sprint</dt><dd>" + sprint + " s</dd></div>" +
      "<div><dt>Projected ceiling</dt><dd>" + u.pot + " OVR</dd></div>" +
      "</dl></section>" +
      '<section class="panel combine-shoot"><h2 class="sec-h">Spot-up shooting</h2>' +
      '<p class="sub">Ten catch-and-shoot threes from five spots. Scouts care about the makes. ' + (S.settings.meter ? "Release in the green window." : "The shot meter is off, so your rating decides.") + "</p>" +
      '<div class="cshots">' + dots + '<b class="num cshot-count">' + made + "/10</b></div>" +
      (done ? '<div class="combine-done"><p>' + (made >= 8 ? "Scouts are buzzing. Your stock is climbing." : made >= 5 ? "A solid showing. Teams took notes." : "A rough day from deep. The tape will have to speak for you.") + "</p>" +
        btn("toDraft", "Go to draft night", "btn-primary") + "</div>" :
        '<div id="meterSlot">' + (C.active ? meterHTML(S.meterState) : '<div class="row">' + btn("combineShot", "Shoot " + (C.results.length ? "next" : "first") + " shot", "btn-primary") +
          btn("combineSkip", "Auto-shoot the rest", "btn-ghost") + "</div>") + "</div>") +
      "</section></div></div>";
  }

  function meterHTML(M) {
    if (!M) return "";
    var lo = (M.center - M.width / 2) * 100, h = M.width * 100;
    return '<div class="meter" id="meter"><div class="meter-bar" aria-hidden="true"><i class="meter-win" style="bottom:' + lo.toFixed(1) + "%;height:" + h.toFixed(1) +
      '%"></i><i class="meter-fill" id="meterFill"></i><i class="meter-mark" id="meterMark"></i></div>' +
      '<div class="meter-side"><span class="label">' + esc(M.label) + '</span><p class="meter-fb" id="meterFb" aria-live="polite">' + esc(M.feedback || "Tap Release or press Space as the bar crosses the green window.") + "</p>" +
      '<button type="button" id="releaseBtn" class="btn btn-primary btn-release" data-act="release"><span>Release</span></button></div></div>';
  }

  // ---- Draft ---------------------------------------------------------------------------------
  function draft(S) {
    var L = S.league, d = L.user.draft, u = Lg.user(L), t = L.teams[d.teamId], shown = S.draftShown;
    var board = d.order.slice(0, Math.min(30, Math.max(d.pick, 12))).map(function (tid, i) {
      var pickNo = i + 1, isU = pickNo === d.pick, name = isU ? u.first + " " + u.last : S.draftNames[i];
      return '<li class="' + (isU ? "you" : "") + (pickNo > shown ? " hidden-pick" : "") + '" style="' + teamVars(L.teams[tid]) + '"><span class="pk num">' + pickNo +
        '</span><span class="abbr">' + L.teams[tid].abbr + "</span><span class=\"nm\">" + (pickNo <= shown ? esc(name) : "On the clock") + "</span></li>";
    }).join("");
    var revealed = shown >= d.pick;
    var c = L.user.contract;
    return '<div class="screen draft">' + topbar(S, "Draft night " + d.year) +
      '<div class="wrap draft-grid">' +
      '<section class="draft-stage" style="' + teamVars(t) + '">' +
      (revealed ? '<p class="eyebrow">With the ' + Lg.ordinal(d.pick) + " pick in the " + d.year + " draft</p>" +
        '<h2 class="draft-team">The ' + esc(Lg.teamName(t)) + " select</h2>" +
        '<div class="draft-name">' + esc(u.first) + " <b>" + esc(u.last) + "</b></div>" +
        '<p class="draft-meta">' + esc(D.POSITIONS[u.pos].name) + " · " + esc(u.college) + " · " + P.heightStr(u.height) + "</p>" +
        '<div class="draft-contract"><span class="label">Rookie contract</span><b>' + c.years + " years · " + money(c.salary) + ' per year</b><span class="sub">Round ' + d.round + ". Starting OVR " + u.ovr + ".</span></div>" +
        btn("startCareer", "Report to training camp", "btn-primary") :
        '<p class="eyebrow">Draft night</p><h2 class="draft-team">The picks are coming in</h2><p class="sub">Your agent says you will go somewhere in the first ' + Math.min(45, d.pick + 4) + " picks.</p>" + btn("skipDraft", "Skip to my pick", "btn-ghost")) +
      "</section>" +
      '<ol class="draft-board">' + board + "</ol></div></div>";
  }

  // ---- Top bar ---------------------------------------------------------------------------------
  function topbar(S, crumb) {
    return '<div class="topbar"><div class="wrap topbar-inner"><button type="button" class="wm-small" data-act="goTitle" aria-label="Main menu">Hardwood <b>Legacy</b></button>' +
      '<span class="crumb">' + esc(crumb || "") + "</span>" +
      (S.saveStatus ? '<span class="save-status">' + esc(S.saveStatus) + "</span>" : "") + "</div></div>";
  }

  // ---- Hub -------------------------------------------------------------------------------------
  var TABS = [["home", "Home"], ["attributes", "Attributes"], ["badges", "Badges"], ["stats", "Stats"], ["schedule", "Schedule"],
    ["standings", "Standings"], ["team", "Team"], ["league", "League"], ["legacy", "Legacy"], ["settings", "Settings"]];

  function hub(S) {
    var L = S.league, u = Lg.user(L), t = Lg.userTeam(L);
    return '<div class="screen hub" style="' + teamVars(t) + '">' + topbar(S, Lg.seasonLabel(L.year) + " season") + hubHead(S) +
      '<nav class="tabs" aria-label="Career sections"><div class="wrap tabs-inner">' +
      TABS.map(function (x) {
        return '<button type="button" id="tab-' + x[0] + '" class="tab' + (S.tab === x[0] ? " on" : "") + '" data-act="tab" data-arg="' + x[0] + '"' + (S.tab === x[0] ? ' aria-current="page"' : "") + ">" + x[1] +
          (x[0] === "attributes" && cheapestUpgrade(L) <= L.user.vc ? '<i class="dot" aria-label="upgrades available"></i>' : "") + "</button>";
      }).join("") + "</div></nav>" +
      '<main class="wrap hub-main">' + (TAB_VIEWS[S.tab] || homeTab)(S, L, u, t) + "</main></div>";
  }
  function cheapestUpgrade(L) {
    var u = Lg.user(L), m = Infinity;
    D.ATTRS.forEach(function (a) { if (u.r[a] < u.caps[a]) m = Math.min(m, P.upgradeCost(u.r[a])); });
    return m;
  }

  function hubHead(S) {
    var L = S.league, u = Lg.user(L), t = Lg.userTeam(L), role = Lg.userRole(L), U = L.user;
    var conf = Lg.standings(L, t.conf), seed = conf.indexOf(t) + 1;
    var phaseTxt = L.phase === "regular" ? "Day " + Math.min(L.day + 1, L.schedule.length) + " of " + L.schedule.length :
      L.phase === "playoffs" ? Lg.ROUND_NAMES[L.po.round - 1] : L.phase === "awards" ? "Season complete" : L.phase === "champion" ? "Finals complete" : "Offseason";
    return '<header class="hub-head">' +
      '<div class="wrap hh-inner">' +
      '<div class="hh-jersey" aria-hidden="true">' + esc(u.jersey) + "</div>" +
      '<div class="hh-id"><span class="label hh-team">' + esc(Lg.teamName(t)) + "</span>" +
      '<h1 class="hh-name">' + esc(u.first) + " <b>" + esc(u.last) + "</b></h1>" +
      '<p class="hh-meta">' + u.pos + " · " + P.heightStr(u.height) + " · " + u.weight + " lbs · Age " + u.age + " · " + esc(D.ARCHETYPES[u.arch].name) + (u.inj ? ' · <span class="inj">Injured: ' + esc(u.injName) + " (" + u.inj + " g)</span>" : "") + "</p></div>" +
      '<div class="hh-ovr"><span class="label">Overall</span><b class="num">' + u.ovr + '</b><span class="hh-max">Max ' + u.pot + "</span></div>" +
      "</div>" +
      '<div class="wrap hh-strip">' +
      chip("Season", phaseTxt) + chip("Record", t.w + "-" + t.l + " · " + Lg.ordinal(seed) + " " + (t.conf === "E" ? "East" : "West")) +
      chip("Role", role.label + " · ~" + role.mins + " min") +
      '<div class="hchip trust"><span class="label">Coach trust</span><span class="meterline"><i style="width:' + U.trust.toFixed(0) + '%"></i></span><b class="num">' + U.trust.toFixed(0) + "</b></div>" +
      chip("VC", num(U.vc)) + chip("Fans", compact(U.fans)) +
      "</div></header>";
  }
  function chip(label, value) { return '<div class="hchip"><span class="label">' + label + '</span><b class="num">' + value + "</b></div>"; }

  // ---- Home tab -------------------------------------------------------------------------------
  function homeTab(S, L, u, t) {
    return '<div class="home-grid"><div class="col">' + nextGameCard(S, L, u, t) + lastGameCard(L) + goalsCard(L) + "</div>" +
      '<div class="col">' + averagesCard(L, u) + trainingCard(L) + newsCard(L) + miniStandings(L, t) + "</div></div>";
  }

  function nextGameCard(S, L, u, t) {
    var phase = L.phase, body = "";
    if (phase === "awards") {
      return '<section class="panel next-card"><span class="label">Regular season complete</span><h2 class="card-h">Awards night</h2><p class="sub">The votes are in. See who took home the hardware.</p>' + btn("showAwards", "View season awards", "btn-primary") + "</section>";
    }
    if (phase === "champion") {
      return '<section class="panel next-card"><span class="label">Season over</span><h2 class="card-h">' + esc(Lg.teamName(L.teams[L.po.champion])) + " win the title</h2>" + btn("showChampion", "Finals recap", "btn-primary") + "</section>";
    }
    if (phase === "offseason") {
      return '<section class="panel next-card"><span class="label">Offseason</span><h2 class="card-h">Summer workouts</h2>' + btn("showOffseason", "Open the offseason", "btn-primary") + "</section>";
    }
    var g = Lg.nextUserGame(L);
    if (!g) {
      body = '<span class="label">' + (phase === "playoffs" ? Lg.ROUND_NAMES[L.po.round - 1] : "") + "</span>" +
        '<h2 class="card-h">' + (Lg.userSeries(L) || (phase === "playoffs" && playedPlayoffs(L)) ? "Your season is over" : "You missed the playoffs") + "</h2>" +
        '<p class="sub">The rest of the playoffs will be simulated.</p><div class="row">' + btn("simPlayoffs", "Sim the rest of the playoffs", "btn-primary") + "</div>";
      return '<section class="panel next-card">' + body + "</section>";
    }
    var home = g.h === t.id, opp = L.teams[home ? g.a : g.h];
    var oppStar = opp.roster.map(function (id) { return L.players[id]; }).sort(function (a, b) { return b.ovr - a.ovr; })[0];
    var matchup = opp.roster.map(function (id) { return L.players[id]; }).filter(function (p) { return p.pos === u.pos; }).sort(function (a, b) { return b.ovr - a.ovr; })[0];
    var ctx = g.playoff ? seriesLine(L, g.series) : "Day " + (L.day + 1) + " of " + L.schedule.length;
    body = '<span class="label">' + esc(ctx) + "</span>" +
      '<div class="matchup">' +
      teamBlock(t, t.w + "-" + t.l, home ? "Home" : "Away") + '<span class="vs">' + (home ? "vs" : "at") + "</span>" + teamBlock(opp, opp.w + "-" + opp.l, home ? "Away" : "Home") +
      "</div>" +
      '<dl class="scout"><div><dt>Their best player</dt><dd>' + full(oppStar) + " · " + oppStar.pos + " " + rt(oppStar.ovr) + "</dd></div>" +
      (matchup ? "<div><dt>Your likely matchup</dt><dd>" + full(matchup) + " · " + matchup.pos + " " + rt(matchup.ovr) + "</dd></div>" : "") + "</dl>" +
      (u.inj ? '<p class="warn">You are injured (' + esc(u.injName) + ", about " + u.inj + " game" + (u.inj > 1 ? "s" : "") + "). Sim until you are cleared.</p>" : "") +
      '<div class="row actions">' +
      (u.inj ? "" : btn("playGame", "Play game", "btn-primary")) + btn("simGame", u.inj ? "Sim game" : "Sim game", u.inj ? "btn-primary" : "") +
      (phase === "regular" ? btn("simDays", "Sim 7 days", "btn-ghost", 7) +
        (L.day < Math.floor(L.settings.seasonLength / 2) ? btn("simToAllStar", "Sim to All-Star break", "btn-ghost") : btn("simToEnd", "Sim to end of season", "btn-ghost")) :
        btn("simSeries", "Sim this series", "btn-ghost")) +
      "</div>";
    return '<section class="panel next-card">' + body + "</section>";
  }
  function playedPlayoffs(L) {
    var tid = Lg.user(L).teamId;
    return L.po && L.po.series.some(function (s) { return s.hi === tid || s.lo === tid; });
  }
  function seriesLine(L, s) {
    var u = Lg.user(L), mine = s.hi === u.teamId ? s.hw : s.lw, theirs = s.hi === u.teamId ? s.lw : s.hw;
    var status = mine === theirs ? "Series tied " + mine + "-" + theirs : (mine > theirs ? "You lead " : "You trail ") + Math.max(mine, theirs) + "-" + Math.min(mine, theirs);
    return Lg.ROUND_NAMES[s.round - 1] + " · Game " + (s.hw + s.lw + 1) + " · " + status;
  }
  function teamBlock(t, rec, tag) {
    return '<div class="tblock" style="' + teamVars(t) + '"><span class="tlogo" aria-hidden="true">' + t.abbr + '</span><div><b>' + esc(t.city) + "</b><span>" + esc(t.name) + '</span><small class="num">' + rec + " · " + tag + "</small></div></div>";
  }

  function lastGameCard(L) {
    var lg = L.user.lastGame;
    if (!lg) return "";
    var e = lg.entry;
    if (e.dnp) return '<section class="panel"><span class="label">Last game</span><p>' + (e.won ? "W" : "L") + " " + e.score + " vs " + e.opp + ". You did not play.</p></section>";
    var l = e.line;
    return '<section class="panel last-card"><span class="label">Last game · ' + (e.home ? "vs " : "at ") + e.opp + "</span>" +
      '<div class="lg-row"><div class="lg-res ' + (e.won ? "w" : "l") + '"><b>' + (e.won ? "W" : "L") + '</b><span class="num">' + e.score + "</span></div>" +
      '<div class="lg-line num"><b>' + l.pts + "</b> pts <b>" + l.reb + "</b> reb <b>" + l.ast + "</b> ast<span>" + l.fgm + "-" + l.fga + " FG · " + l.tpm + "-" + l.tpa + " 3PT · " + l.min + " min</span></div>" +
      '<div class="grade ' + gradeClass(e.grade) + '" title="Teammate grade">' + e.grade + "</div></div>" +
      '<p class="sub">+' + num(e.vc) + " VC" + (lg.highs && lg.highs.length ? " · New career high: " + lg.highs.join(", ").toUpperCase() : "") + "</p></section>";
  }

  function goalsCard(L) {
    var gs = L.user.goals || [];
    if (!gs.length) return "";
    var u = Lg.user(L), t = Lg.userTeam(L), s = Lg.perGame(u.stats);
    var logs = L.user.gameLog.filter(function (g) { return !g.playoff && g.grade; });
    var avgG = logs.length ? logs.reduce(function (x, g) { return x + Lg.gradeIndex(g.grade); }, 0) / logs.length : 0;
    return '<section class="panel"><h2 class="card-h sm">Season goals</h2><ul class="goals">' + gs.map(function (g) {
      var cur = g.value != null ? g.value : g.id === "ppg" ? s.pts : g.id === "wins" ? t.w : g.id === "grade" ? avgG - 2 : g.id === "allstar" ?
        (L.allStars && L.allStars.E.concat(L.allStars.W).indexOf(u.id) >= 0 ? 1 : 0) : u.stats.gp / L.settings.seasonLength;
      var frac = Math.max(0, Math.min(1, cur / g.target));
      var shown = g.id === "ppg" ? f1(cur) + " / " + g.target : g.id === "wins" ? cur + " / " + g.target : g.id === "grade" ? (logs.length ? Lg.GRADES[Lg.GRADES.length - 1 - Math.round(avgG)] : "-") + " avg" :
        g.id === "allstar" ? (cur ? "Selected" : L.allStars ? "Not selected" : "Voting at midseason") : Math.round(cur * 100) + "%";
      return '<li class="' + (g.done ? "done" : "") + '"><div><span>' + esc(g.label) + '</span><small class="num">' + shown + " · " + num(g.vc) + ' VC</small></div><span class="meterline"><i style="width:' + (frac * 100).toFixed(0) + '%"></i></span></li>';
    }).join("") + "</ul></section>";
  }

  function averagesCard(L, u) {
    var s = Lg.perGame(u.stats), has = u.stats.gp > 0;
    var tiles = [["PTS", f1(s.pts)], ["REB", f1(s.reb)], ["AST", f1(s.ast)], ["FG%", pct(s.fg)], ["3P%", pct(s.tp)], ["MIN", f1(s.min)]];
    return '<section class="panel"><h2 class="card-h sm">' + Lg.seasonLabel(L.year) + " averages <small>" + u.stats.gp + " GP</small></h2>" +
      '<div class="tiles">' + tiles.map(function (x) { return '<div class="tile"><span class="label">' + x[0] + '</span><b class="num">' + (has ? x[1] : "-") + "</b></div>"; }).join("") + "</div></section>";
  }

  function trainingCard(L) {
    var U = L.user;
    var next = Math.ceil((8 - U.trainXP) / (82 / L.settings.seasonLength));
    return '<section class="panel"><h2 class="card-h sm">Training focus</h2><p class="sub">Practice between games adds free attribute points to one category. Good grades speed it up.</p>' +
      '<div class="seg small" role="group" aria-label="Training focus">' + D.ATTR_GROUPS.map(function (g) {
        return '<button type="button" id="tf-' + g.key + '" class="seg-btn' + (U.trainFocus === g.key ? " on" : "") + '" data-act="setFocus" data-arg="' + g.key + '" aria-pressed="' + (U.trainFocus === g.key) + '">' + g.label + "</button>";
      }).join("") + '</div><div class="xp"><span class="meterline"><i style="width:' + (U.trainXP / 8 * 100).toFixed(0) + '%"></i></span><small>Next +1 in about ' + Math.max(1, next) + " game" + (next > 1 ? "s" : "") + "</small></div></section>";
  }

  function newsCard(L) {
    var items = L.news.slice(0, 8);
    return '<section class="panel"><h2 class="card-h sm">News</h2><ul class="news">' + items.map(function (n) {
      return '<li class="k-' + n.kind + '">' + esc(n.text) + "</li>";
    }).join("") + "</ul></section>";
  }

  function miniStandings(L, t) {
    var st = Lg.standings(L, t.conf);
    return '<section class="panel"><h2 class="card-h sm">' + (t.conf === "E" ? "East" : "West") + ' standings</h2><div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>#</th><th class="l">Team</th><th>W</th><th>L</th><th>GB</th></tr></thead><tbody>' +
      st.map(function (x, i) {
        var gb = ((st[0].w - x.w) + (x.l - st[0].l)) / 2;
        return '<tr class="' + (x === t ? "me" : "") + (i === 7 ? " cut" : "") + '"><td>' + (i + 1) + '</td><td class="l">' + x.abbr + " " + esc(x.name) + "</td><td>" + x.w + "</td><td>" + x.l + "</td><td>" + (gb ? gb.toFixed(1) : "-") + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }

  // ---- Attributes tab ---------------------------------------------------------------------------
  function attributesTab(S, L, u) {
    var U = L.user;
    return '<div class="attr-head panel"><div><h2 class="card-h">Upgrade attributes</h2><p class="sub">Spend VC to raise ratings up to your build caps. Costs climb as a rating gets higher. Overall is weighted toward the skills your position uses most.</p></div>' +
      '<div class="attr-bank"><span class="label">VC balance</span><b class="num">' + num(U.vc) + '</b><span class="label">OVR ' + u.ovr + " / " + u.pot + "</span></div></div>" +
      '<div class="attr-grid">' + D.ATTR_GROUPS.map(function (g) {
        return '<section class="panel attr-group"><h3 class="mini-h">' + g.label + "</h3>" + g.attrs.map(function (a) {
          var k = a[0], v = u.r[k], cap = u.caps[k], cost = P.upgradeCost(v), maxed = v >= cap;
          var w8 = D.POSITIONS[u.pos].w8[k];
          return '<div class="attr-row">' +
            '<div class="attr-name"><span>' + a[1] + "</span>" + (w8 >= 1 ? '<small class="key">Key</small>' : "") + (U.progress && U.progress[k] ? '<small class="gain">+' + U.progress[k] + " trained</small>" : "") + '<small class="cap num">cap ' + cap + "</small></div>" +
            rt(v) +
            '<div class="attr-buy">' + (maxed ? '<span class="maxed">Maxed</span>' :
              '<button type="button" id="up1-' + k + '" class="mini-btn" data-act="upgrade" data-arg="' + k + ':1"' + (U.vc < cost ? " disabled" : "") + ">+1 <small>" + num(cost) + "</small></button>" +
              '<button type="button" id="up5-' + k + '" class="mini-btn" data-act="upgrade" data-arg="' + k + ':5"' + (U.vc < cost ? " disabled" : "") + ">+5</button>") + "</div>" +
            '<div class="attr-bar" aria-hidden="true"><i class="ab-val" style="width:' + v + '%"></i><i class="ab-cap" style="left:' + cap + '%"></i></div></div>';
        }).join("") + "</section>";
      }).join("") + "</div>";
  }

  // ---- Badges tab ------------------------------------------------------------------------------
  function badgesTab(S, L, u) {
    return '<div class="panel intro"><h2 class="card-h">Badges</h2><p class="sub">Badges unlock automatically when the ratings behind them reach each threshold. They change the math on every possession: make percentages, blocks, steals, fatigue and the size of your green window.</p></div>' +
      '<div class="badge-grid">' + D.BADGES.map(function (b) {
        var v = P.badgeValue(u.r, b), cap = P.badgeValue(u.caps, b), lv = u.bdg[b.id], next = lv < 4 ? b.t[lv] : null;
        var capLv = 0;
        b.t.forEach(function (x, i) { if (cap >= x) capLv = i + 1; });
        return '<article class="badge-card lv' + lv + '"><div class="bc-top"><span class="label">' + D.ATTR_GROUPS.filter(function (g) { return g.key === b.cat; })[0].label + "</span>" + badgeChip(lv) + "</div>" +
          '<h3 class="bc-name">' + esc(b.name) + '</h3><p class="bc-desc">' + esc(b.desc) + "</p>" +
          '<div class="bc-prog"><span class="meterline"><i style="width:' + Math.min(100, next ? (v / next) * 100 : 100).toFixed(0) + '%"></i></span>' +
          '<small>' + (next ? "Next: " + D.BADGE_TIERS[lv + 1] + " at " + next + " (you: " + Math.floor(v) + ")" : "Maxed out") + " · Build ceiling: " + (capLv ? D.BADGE_TIERS[capLv] : "none") + "</small></div>" +
          '<small class="bc-attrs">From ' + b.attrs.map(function (a) { return D.ATTR_LABEL[a]; }).join(" + ") + "</small></article>";
      }).join("") + "</div>";
  }

  // ---- Stats tab -------------------------------------------------------------------------------
  var LINE_COLS = ["GP", "GS", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG%", "3P%", "FT%", "TS%"];
  function lineCells(st) {
    var s = Lg.perGame(st);
    return [st.gp, st.gs, f1(s.min), f1(s.pts), f1(s.reb), f1(s.ast), f1(s.stl), f1(s.blk), f1(s.tov), pct(s.fg), pct(s.tp), pct(s.ft), pct(s.ts)];
  }
  function statsTab(S, L, u) {
    var U = L.user, rows = U.seasons.map(function (s) {
      return "<tr><td class=\"l\">" + Lg.seasonLabel(s.year) + "</td><td>" + s.team + "</td><td>" + s.ovr + "</td>" + lineCells(s.stats).map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>";
    });
    if (u.stats.gp) rows.push('<tr class="me"><td class="l">' + Lg.seasonLabel(L.year) + "</td><td>" + Lg.userTeam(L).abbr + "</td><td>" + u.ovr + "</td>" + lineCells(u.stats).map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>");
    var car = P.newStats();
    Object.keys(car).forEach(function (k) { car[k] = u.career[k] + u.stats[k]; });
    var po = P.newStats(), hasPo = false;
    U.seasons.forEach(function (s) { Object.keys(po).forEach(function (k) { po[k] += s.po[k]; }); });
    Object.keys(po).forEach(function (k) { po[k] += u.po[k]; });
    hasPo = po.gp > 0;
    var shots = U.shots || [], z = zoneSplits(shots);
    var log = U.gameLog.slice().reverse().slice(0, 30);
    var H = U.highs;
    return '<div class="stats-grid">' +
      '<section class="panel span2"><h2 class="card-h sm">Per-game averages</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">Season</th><th>Team</th><th>OVR</th>' + LINE_COLS.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" +
      (rows.length ? rows.join("") : '<tr><td class="l" colspan="16">No games yet.</td></tr>') +
      (car.gp ? '<tr class="total"><td class="l">Career</td><td></td><td></td>' + lineCells(car).map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>" : "") +
      (hasPo ? '<tr class="total"><td class="l">Playoffs</td><td></td><td></td>' + lineCells(po).map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>" : "") +
      "</tbody></table></div></section>" +
      '<section class="panel"><h2 class="card-h sm">Shot chart <small>last ' + shots.length + " shots</small></h2>" + courtSVG(shots, { label: "Your shot chart" }) +
      '<div class="zones">' + [["rim", "At the rim"], ["post", "Post"], ["mid", "Mid-range"], ["three", "Three"]].map(function (x) {
        var v = z[x[0]];
        return '<div><span class="label">' + x[1] + '</span><b class="num">' + (v[1] ? pct(v[0] / v[1]) + "%" : "-") + '</b><small class="num">' + v[0] + "/" + v[1] + "</small></div>";
      }).join("") + '</div><p class="hint legend"><i class="lg-make"></i> Make <i class="lg-miss"></i> Miss</p></section>' +
      '<section class="panel"><h2 class="card-h sm">Career highs</h2><dl class="highs">' + [["pts", "Points"], ["reb", "Rebounds"], ["ast", "Assists"], ["stl", "Steals"], ["blk", "Blocks"], ["tpm", "Threes made"]].map(function (x) {
        var h = H[x[0]];
        return "<div><dt>" + x[1] + '</dt><dd class="num">' + (h ? "<b>" + h.v + "</b> vs " + h.opp + " (" + Lg.seasonLabel(h.year) + ")" : "-") + "</dd></div>";
      }).join("") + "</dl></section>" +
      '<section class="panel span2"><h2 class="card-h sm">Game log <small>this season</small></h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">Game</th><th class="l">Opp</th><th>Result</th><th>Grade</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG</th><th>3PT</th><th>FT</th><th>+/-</th></tr></thead><tbody>' +
      (log.length ? log.map(function (g) {
        var l = g.line;
        return "<tr><td class=\"l\">" + (g.playoff ? "PO" : "G" + (g.day + 1)) + '</td><td class="l">' + (g.home ? "vs " : "@ ") + g.opp + '</td><td class="' + (g.won ? "res-w" : "res-l") + '">' + (g.won ? "W " : "L ") + g.score + "</td>" +
          (g.dnp ? '<td colspan="12">Did not play</td>' : '<td><span class="grade sm ' + gradeClass(g.grade) + '">' + g.grade + "</span></td><td>" + l.min + "</td><td><b>" + l.pts + "</b></td><td>" + l.reb + "</td><td>" + l.ast + "</td><td>" + l.stl + "</td><td>" + l.blk + "</td><td>" + l.tov + "</td><td>" + l.fgm + "-" + l.fga + "</td><td>" + l.tpm + "-" + l.tpa + "</td><td>" + l.ftm + "-" + l.fta + "</td><td>" + (l.pm > 0 ? "+" : "") + l.pm + "</td>") + "</tr>";
      }).join("") : '<tr><td class="l" colspan="15">No games yet.</td></tr>') + "</tbody></table></div></section></div>";
  }

  // ---- Schedule tab ---------------------------------------------------------------------------
  function scheduleTab(S, L, u, t) {
    if (!L.schedule.length) return '<section class="panel">No schedule yet.</section>';
    var cells = L.schedule.map(function (day, i) {
      var g = Lg.findGame(day, t.id);
      if (!g) return "";
      var home = g.h === t.id, opp = L.teams[home ? g.a : g.h], played = g.hs != null;
      var my = home ? g.hs : g.as, their = home ? g.as : g.hs;
      return '<li class="' + (played ? (my > their ? "w" : "l") : i === L.day ? "next" : "") + '"><span class="gd num">G' + (i + 1) + '</span><span class="op">' + (home ? "vs " : "@ ") + opp.abbr + "</span>" +
        '<span class="rs num">' + (played ? (my > their ? "W " : "L ") + my + "-" + their + (g.ot ? " OT" : "") : i === L.day ? "Next" : "") + "</span></li>";
    }).join("");
    return '<section class="panel"><h2 class="card-h sm">' + Lg.seasonLabel(L.year) + " schedule · " + esc(Lg.teamName(t)) + " (" + t.w + "-" + t.l + ')</h2><ol class="sched">' + cells + "</ol></section>";
  }

  // ---- Standings tab --------------------------------------------------------------------------
  function standingsTab(S, L, u, t) {
    return '<div class="two">' + ["E", "W"].map(function (c) {
      var st = Lg.standings(L, c);
      return '<section class="panel"><h2 class="card-h sm">' + (c === "E" ? "Eastern" : "Western") + ' Conference</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="l">Team</th><th>W</th><th>L</th><th>PCT</th><th>GB</th><th>PF</th><th>PA</th><th>DIFF</th></tr></thead><tbody>' +
        st.map(function (x, i) {
          var gp = Math.max(1, x.w + x.l), gb = ((st[0].w - x.w) + (x.l - st[0].l)) / 2, diff = (x.pf - x.pa) / gp;
          return '<tr class="' + (x === t ? "me" : "") + (i === 7 ? " cut" : "") + '"><td>' + (i + 1) + '</td><td class="l"><span class="swatch" style="' + teamVars(x) + '"></span>' + esc(x.city + " " + x.name) + "</td><td>" + x.w + "</td><td>" + x.l + "</td><td>" + Lg.winPct(x).toFixed(3).replace(/^0/, "") + "</td><td>" + (gb ? gb.toFixed(1) : "-") + "</td><td>" + f1(x.pf / gp) + "</td><td>" + f1(x.pa / gp) + '</td><td class="' + (diff >= 0 ? "res-w" : "res-l") + '">' + (diff > 0 ? "+" : "") + f1(diff) + "</td></tr>";
        }).join("") + '</tbody></table></div><p class="hint">Top eight in each conference make the playoffs.</p></section>';
    }).join("") + "</div>" + (L.po ? bracket(L) : "");
  }

  function bracket(L) {
    var u = Lg.user(L);
    return '<section class="panel"><h2 class="card-h sm">' + L.year + " playoffs</h2><div class=\"bracket\">" + L.po.rounds.map(function (r, i) {
      return '<div class="bround"><span class="label">' + Lg.ROUND_NAMES[i] + "</span>" + r.map(function (s) {
        var mine = s.hi === u.teamId || s.lo === u.teamId;
        return '<div class="bseries' + (mine ? " me" : "") + '"><div class="' + (s.done && s.winner === s.hi ? "win" : "") + '"><small>' + s.hiSeed + "</small>" + L.teams[s.hi].abbr + '<b class="num">' + s.hw + "</b></div>" +
          '<div class="' + (s.done && s.winner === s.lo ? "win" : "") + '"><small>' + s.loSeed + "</small>" + L.teams[s.lo].abbr + '<b class="num">' + s.lw + "</b></div></div>";
      }).join("") + "</div>";
    }).join("") + (L.po.champion != null ? '<div class="bround champ"><span class="label">Champion</span><div class="bseries"><div class="win">' + L.teams[L.po.champion].abbr + "</div></div></div>" : "") + "</div></section>";
  }

  // ---- Team tab ---------------------------------------------------------------------------------
  function teamTab(S, L, u, t) {
    var U = L.user, c = U.contract;
    var roster = t.roster.map(function (id) { return L.players[id]; }).sort(function (a, b) { return b.ovr - a.ovr; });
    return '<div class="team-top">' +
      '<section class="panel"><h2 class="card-h sm">Contract</h2><dl class="kv"><div><dt>Salary</dt><dd>' + money(c.salary) + " per year</dd></div><div><dt>Years left</dt><dd>" + c.years + " of " + c.total + "</dd></div><div><dt>Deal</dt><dd>" + (c.rookie ? "Rookie scale" : "Veteran contract") + "</dd></div><div><dt>Market value</dt><dd>" + money(Lg.marketSalary(u.ovr)) + "</dd></div></dl></section>" +
      '<section class="panel"><h2 class="card-h sm">Front office</h2><p class="sub">Unhappy with your role? You can ask for a trade once per season. Your new coach will start you at 45 trust.</p>' +
      (L.phase === "regular" && !U.tradeUsed ? btn("askTrade", "Request a trade", "btn-ghost") : '<p class="hint">' + (U.tradeUsed ? "You already requested a trade this season." : "Trade requests open during the regular season.") + "</p>") + "</section></div>" +
      '<section class="panel"><h2 class="card-h sm">' + esc(Lg.teamName(t)) + ' roster</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">Player</th><th>POS</th><th>AGE</th><th>HT</th><th>OVR</th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>FG%</th><th>3P%</th><th class="l">Status</th></tr></thead><tbody>' +
      roster.map(function (p) {
        var s = Lg.perGame(p.stats);
        return '<tr class="' + (p.isUser ? "me" : "") + '"><td class="l">' + full(p) + " <small>" + esc(D.ARCHETYPES[p.arch].name) + "</small></td><td>" + p.pos + "</td><td>" + p.age + "</td><td>" + P.heightStr(p.height) + "</td><td>" + rt(p.ovr) + "</td><td>" + p.stats.gp + "</td><td>" + f1(s.min) + "</td><td>" + f1(s.pts) + "</td><td>" + f1(s.reb) + "</td><td>" + f1(s.ast) + "</td><td>" + pct(s.fg) + "</td><td>" + pct(s.tp) + '</td><td class="l">' + (p.inj ? '<span class="inj">' + esc(p.injName) + " (" + p.inj + ")</span>" : "Active") + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }

  // ---- League tab ------------------------------------------------------------------------------
  function leagueTab(S, L, u) {
    var cats = [["pts", "Points"], ["reb", "Rebounds"], ["ast", "Assists"], ["stl", "Steals"], ["blk", "Blocks"], ["tp", "3P%"]];
    var hasStats = L.day > 3 || L.phase !== "regular";
    var top = Object.keys(L.players).map(function (id) { return L.players[id]; }).filter(function (p) { return p.teamId >= 0; })
      .sort(function (a, b) { return b.ovr - a.ovr; }).slice(0, 25);
    return '<div class="leaders">' + (hasStats ? cats.map(function (c) {
      var list = c[0] === "tp" ? leadersTp(L) : Lg.leaders(L, c[0], 5);
      return '<section class="panel"><h3 class="mini-h">' + c[1] + '</h3><ol class="lead">' + list.map(function (x) {
        return '<li class="' + (x.p.isUser ? "me" : "") + '"><span>' + full(x.p) + " <small>" + L.teams[x.p.teamId].abbr + '</small></span><b class="num">' + (c[0] === "tp" ? pct(x.v) : f1(x.v)) + "</b></li>";
      }).join("") + "</ol></section>";
    }).join("") : '<section class="panel"><p class="sub">League leaders appear after a few games.</p></section>') + "</div>" +
      (L.allStars ? '<section class="panel"><h2 class="card-h sm">All-Stars</h2><div class="two">' + ["E", "W"].map(function (c) {
        return '<div><span class="label">' + (c === "E" ? "East" : "West") + '</span><ul class="plain">' + L.allStars[c].map(function (id) {
          var p = L.players[id];
          return p ? '<li class="' + (p.isUser ? "me" : "") + '">' + full(p) + " <small>" + p.pos + " · " + L.teams[p.teamId].abbr + "</small></li>" : "";
        }).join("") + "</ul></div>";
      }).join("") + "</div></section>" : "") +
      '<section class="panel"><h2 class="card-h sm">Top players by overall</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="l">Player</th><th>Team</th><th>POS</th><th>AGE</th><th>OVR</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody>' +
      top.map(function (p, i) {
        var s = Lg.perGame(p.stats);
        return '<tr class="' + (p.isUser ? "me" : "") + '"><td>' + (i + 1) + '</td><td class="l">' + full(p) + "</td><td>" + L.teams[p.teamId].abbr + "</td><td>" + p.pos + "</td><td>" + p.age + "</td><td>" + rt(p.ovr) + "</td><td>" + f1(s.pts) + "</td><td>" + f1(s.reb) + "</td><td>" + f1(s.ast) + "</td></tr>";
      }).join("") + "</tbody></table></div></section>" +
      (L.history.length ? '<section class="panel"><h2 class="card-h sm">History</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">Season</th><th>Champion</th><th class="l">Finals MVP</th><th class="l">MVP</th><th class="l">DPOY</th><th class="l">ROY</th></tr></thead><tbody>' +
        L.history.slice().reverse().map(function (h) {
          return '<tr><td class="l">' + Lg.seasonLabel(h.year) + "</td><td>" + h.champ + '</td><td class="l">' + esc(h.fmvp) + '</td><td class="l">' + esc(h.mvp) + '</td><td class="l">' + esc(h.dpoy) + '</td><td class="l">' + esc(h.roy) + "</td></tr>";
        }).join("") + "</tbody></table></div></section>" : "") +
      (L.po ? bracket(L) : "");
  }
  function leadersTp(L) {
    return Object.keys(L.players).map(function (id) { return L.players[id]; })
      .filter(function (p) { return p.teamId >= 0 && p.stats.tpa >= Math.max(10, L.day * 2.5); })
      .map(function (p) { return { p: p, v: p.stats.tpm / p.stats.tpa }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 5);
  }

  // ---- Legacy tab ------------------------------------------------------------------------------
  function legacyTab(S, L, u) {
    var U = L.user, lg = Lg.legacy(L), counts = {};
    U.awards.forEach(function (a) { counts[a.name] = (counts[a.name] || 0) + 1; });
    var order = ["Champion", "MVP", "Finals MVP", "Defensive Player of the Year", "Rookie of the Year", "Sixth Man of the Year", "Scoring Champion",
      "All-NBA 1st Team", "All-NBA 2nd Team", "All-NBA 3rd Team", "All-Star", "All-Defensive 1st Team", "All-Defensive 2nd Team"];
    var trophies = order.filter(function (k) { return counts[k]; });
    var car = P.newStats();
    Object.keys(car).forEach(function (k) { car[k] = u.career[k] + u.stats[k] + u.po[k]; });
    var e = Lg.endorsement(U.fans), d = U.draft;
    return '<div class="legacy-grid">' +
      '<section class="panel legacy-score"><span class="label">Legacy score</span><b class="num">' + lg.score + '</b><p class="verdict">' + esc(lg.verdict) + "</p>" +
      '<p class="hint">Built from awards, rings and career totals. 45 and up is a Hall of Fame lock.</p></section>' +
      '<section class="panel"><h2 class="card-h sm">Trophy case</h2>' + (trophies.length ? '<ul class="trophies">' + trophies.map(function (k) {
        return '<li><b class="num">' + counts[k] + "×</b><span>" + esc(k) + "</span><small>" + U.awards.filter(function (a) { return a.name === k; }).map(function (a) { return a.year; }).join(", ") + "</small></li>";
      }).join("") + "</ul>" : '<p class="sub">Empty for now. All-Star voting happens at the midpoint of the season.</p>') + "</section>" +
      '<section class="panel"><h2 class="card-h sm">Career totals</h2><dl class="kv">' +
      [["Games", car.gp], ["Points", num(car.pts)], ["Rebounds", num(car.orb + car.drb)], ["Assists", num(car.ast)], ["Steals", num(car.stl)], ["Blocks", num(car.blk)], ["Threes", num(car.tpm)], ["Rings", U.rings]].map(function (x) {
        return "<div><dt>" + x[0] + '</dt><dd class="num">' + x[1] + "</dd></div>";
      }).join("") + "</dl></section>" +
      '<section class="panel"><h2 class="card-h sm">Off the court</h2><dl class="kv"><div><dt>Drafted</dt><dd>' + (d ? d.year + ", " + Lg.ordinal(d.pick) + " pick by " + L.teams[d.teamId].abbr : "-") + "</dd></div>" +
      "<div><dt>Fans</dt><dd>" + num(U.fans) + "</dd></div><div><dt>Endorsement</dt><dd>" + esc(e.name) + (e.vc ? " · " + num(e.vc) + " VC per season" : "") + "</dd></div>" +
      "<div><dt>Hometown</dt><dd>" + esc(u.hometown || "-") + "</dd></div><div><dt>College</dt><dd>" + esc(u.college) + "</dd></div></dl></section></div>";
  }

  // ---- Settings tab ---------------------------------------------------------------------------
  function settingsTab(S, L) {
    var st = L.settings;
    return '<div class="two"><section class="panel"><h2 class="card-h sm">Gameplay</h2><div class="field-grid">' +
      field("Difficulty", '<select id="setDiff" data-lset="difficulty">' + Object.keys(D.DIFFICULTY).map(function (k) {
        return '<option value="' + k + '"' + (k === st.difficulty ? " selected" : "") + ">" + D.DIFFICULTY[k].name + "</option>";
      }).join("") + "</select>") +
      '<div class="field"><span class="label">Season length</span><b>' + st.seasonLength + " games</b></div>" +
      '<div class="field"><span class="label">Injuries</span><button type="button" id="setInj" class="toggle' + (st.injuries ? " on" : "") + '" data-act="toggleLeagueSetting" data-arg="injuries" aria-pressed="' + st.injuries + '">' + (st.injuries ? "On" : "Off") + "</button></div>" +
      '<div class="field"><span class="label">Shot meter</span><button type="button" id="setMeter" class="toggle' + (st.meter ? " on" : "") + '" data-act="toggleLeagueSetting" data-arg="meter" aria-pressed="' + st.meter + '">' + (st.meter ? "On" : "Off") + "</button></div>" +
      '</div><p class="hint">Harder difficulties lower your shooting percentages and shrink the green window, and pay more VC.</p></section>' +
      '<section class="panel"><h2 class="card-h sm">Save</h2><p class="sub">Your career saves in this browser after every game. Copy a save code to back it up or move it to another device.</p>' +
      '<div class="row">' + btn("copySave", "Copy save code", "") + btn("confirmReset", "Delete career", "btn-danger") + "</div>" +
      (S.copyFallback ? '<label class="label" for="saveCode">Save code (select all and copy)</label><textarea id="saveCode" rows="4" readonly>' + esc(S.copyFallback) + "</textarea>" : "") +
      "</section></div>";
  }

  var TAB_VIEWS = { home: homeTab, attributes: attributesTab, badges: badgesTab, stats: statsTab, schedule: scheduleTab,
    standings: standingsTab, team: teamTab, league: leagueTab, legacy: legacyTab, settings: settingsTab };

  // ---- Game ------------------------------------------------------------------------------------
  function scorebug(G, L) {
    var sim = G.sim, h = sim.sides[0], a = sim.sides[1], u = Lg.user(L);
    var mySide = h.tid === u.teamId ? h : a, b = mySide.box[u.id];
    var period = sim.done ? "Final" + (sim.q > 4 ? (sim.q === 5 ? "/OT" : "/" + (sim.q - 4) + "OT") : "") : (sim.q <= 4 ? "Q" + sim.q : "OT" + (sim.q > 5 ? sim.q - 4 : ""));
    var line = b ? b.pts + " PTS · " + (b.orb + b.drb) + " REB · " + b.ast + " AST · " + b.fgm + "-" + b.fga + " FG" : "Inactive";
    var on = b && mySide.on.indexOf(u.id) >= 0;
    return '<div class="scorebug" role="status" aria-live="off">' +
      '<div class="sb-team" style="' + teamVars(a.team) + '"><span>' + a.team.abbr + '</span><b class="num">' + a.score + "</b></div>" +
      '<div class="sb-team" style="' + teamVars(h.team) + '"><span>' + h.team.abbr + '</span><b class="num">' + h.score + "</b></div>" +
      '<div class="sb-clock"><b>' + period + '</b><span class="num">' + (sim.done ? "" : Sm.fmtClock(sim.clock)) + "</span></div>" +
      '<div class="sb-me"><span class="label">' + esc(u.last) + (on ? ' <i class="oncourt">On court</i>' : b ? " · Bench" : "") + '</span><b class="num">' + line + "</b></div></div>";
  }

  function gameScreen(S) {
    var G = S.game, L = S.league, sim = G.sim, u = Lg.user(L);
    var mySide = sim.sides[0].tid === u.teamId ? sim.sides[0] : sim.sides[1];
    var pd = sim.pending;
    var energy = mySide.energy[u.id];
    return '<div class="screen game" style="' + teamVars(mySide.team) + '">' + topbar(S, (G.playoff ? "Playoffs · " : "") + sim.sides[1].team.abbr + " at " + sim.sides[0].team.abbr) +
      '<div class="wrap">' + scorebug(G, L) + "</div>" +
      '<div class="wrap game-grid">' +
      '<div class="game-main">' +
      '<section class="panel decision" id="decision">' + decisionHTML(S, pd, mySide, energy) + "</section>" +
      '<section class="panel court-panel"><div class="court-head"><span class="label">Your shots this game</span><small class="num">' + (energy != null ? "Energy " + Math.round(energy * 100) + "%" : "") + "</small></div>" +
      courtSVG(sim.userShots, { highlightLast: true, label: "Your shots this game" }) + "</section>" +
      "</div>" +
      '<div class="game-side">' +
      '<div class="game-controls panel"><span class="label">Speed</span><div class="seg small" role="group" aria-label="Game speed">' +
      [["watch", "Watch"], ["fast", "Fast"], ["skip", "Skip to my plays"]].map(function (x) {
        return '<button type="button" id="spd-' + x[0] + '" class="seg-btn' + (G.speed === x[0] ? " on" : "") + '" data-act="speed" data-arg="' + x[0] + '" aria-pressed="' + (G.speed === x[0]) + '">' + x[1] + "</button>";
      }).join("") + '</div><div class="row">' + (sim.done ? "" : btn("simRest", "Sim to final", "btn-ghost")) + btn("toggleBox", G.showBox ? "Play-by-play" : "Box score", "btn-ghost") + "</div></div>" +
      (G.showBox ? boxScore(sim, L) : '<section class="panel pbp"><h2 class="card-h sm">Play-by-play</h2><ol class="feed" aria-live="polite">' + feedHTML(sim, L) + "</ol></section>") +
      "</div></div></div>";
  }

  function feedHTML(sim, L) {
    var start = Math.max(0, sim.log.length - 70);
    return sim.log.slice(start).reverse().map(function (e) {
      var t = e.tid >= 0 ? L.teams[e.tid] : null;
      return '<li class="ev-' + e.type + (e.user ? " you" : "") + '"' + (t ? ' style="' + teamVars(t) + '"' : "") + '><span class="ev-time num">' + (e.type === "period" || e.type === "final" ? "" : (e.q <= 4 ? "Q" + e.q : "OT") + " " + e.clock) + "</span>" +
        (t ? '<span class="ev-tm">' + t.abbr + "</span>" : "") + '<span class="ev-txt">' + esc(e.text) + '</span><span class="ev-sc num">' + e.score[1] + "-" + e.score[0] + "</span></li>";
    }).join("");
  }

  function decisionHTML(S, pd, mySide, energy) {
    var G = S.game, sim = G.sim, u = Lg.user(S.league);
    if (S.meterState && G.meterFor) {
      return '<div class="dec-head"><span class="label">' + (G.meterFor === "ft" ? "Free throw" : "Shot") + "</span><h2 class=\"card-h\">" + esc(S.meterState.title) + "</h2></div>" + meterHTML(S.meterState);
    }
    if (G.flash) {
      return '<div class="dec-head"><span class="label">Result</span></div><p class="flash ' + (G.flash.good ? "good" : "bad") + '">' + esc(G.flash.text) + "</p>";
    }
    if (sim.done) {
      return '<div class="dec-head"><span class="label">Final</span><h2 class="card-h">Game over</h2></div>' + btn("finishGame", "See your grade", "btn-primary");
    }
    if (!pd) {
      var onCourt = mySide.on.indexOf(u.id) >= 0;
      return '<div class="dec-head"><span class="label">' + (onCourt ? "On the court" : "On the bench") + "</span><h2 class=\"card-h\">" + (onCourt ? "Running the offense" : "Catching your breath") + "</h2></div>" +
        '<p class="sub">' + (onCourt ? "The play will come to you. Decisions pop up here when you have the ball or your man attacks." : "Coach will call your number soon. Energy " + Math.round((energy || 1) * 100) + "%.") + "</p>" +
        '<div class="row">' + btn("stepNow", G.running ? "Pause" : "Resume", "btn-ghost") + "</div>";
    }
    if (pd.kind === "ft") {
      return '<div class="dec-head"><span class="label">Free throws</span><h2 class="card-h">At the line: ' + (pd.i + 1) + " of " + pd.n + "</h2></div>" + btn("shootFT", "Step to the line", "btn-primary");
    }
    var isO = pd.kind === "offense";
    return '<div class="dec-head"><span class="label">' + (isO ? "Your ball · Shot clock " + pd.shotClock : "On defense") + '</span><h2 class="card-h">' + (isO ? "Make a play" : "Get a stop") + "</h2></div>" +
      '<p class="look">' + esc(pd.look) + "</p>" +
      '<ol class="opts">' + pd.options.map(function (o, i) {
        var estTxt = o.est == null ? "" : o.isMove ? Math.round(o.est * 100) + "% to beat him" : o.id === "gamble" ? Math.round(o.est * 100) + "% steal chance" : Math.round(o.est * 100) + "% shot";
        var opCls = o.open == null ? "" : "op" + o.open;
        return '<li><button type="button" id="opt-' + o.id + '" class="opt" data-act="choose" data-arg="' + o.id + '"><kbd>' + (i + 1) + "</kbd>" +
          '<span class="opt-main"><b>' + esc(o.label) + "</b>" + (o.sub ? "<small>" + esc(o.sub) + "</small>" : "") + "</span>" +
          (o.openLabel && o.id !== "pass" ? '<span class="openchip ' + opCls + '">' + o.openLabel + "</span>" : "") +
          (estTxt ? '<span class="opt-est"><span class="meterline"><i style="width:' + Math.round(o.est * 100) + '%"></i></span><small class="num">' + estTxt + "</small></span>" : "") +
          "</button></li>";
      }).join("") + "</ol>";
  }

  function boxScore(sim, L) {
    return '<section class="panel box">' + [1, 0].map(function (si) {
      var side = sim.sides[si];
      var rows = side.players.filter(function (p) { return side.box[p.id].sec > 0; }).sort(function (a, b) { return side.box[b.id].gs - side.box[a.id].gs || side.box[b.id].sec - side.box[a.id].sec; });
      return '<h3 class="mini-h">' + esc(Lg.teamName(side.team)) + ' <b class="num">' + side.score + '</b></h3><div class="tbl-wrap"><table class="tbl compact"><thead><tr><th class="l">Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG</th><th>3PT</th><th>FT</th><th>PF</th><th>+/-</th></tr></thead><tbody>' +
        rows.map(function (p) {
          var b = side.box[p.id];
          return '<tr class="' + (p.isUser ? "me" : "") + '"><td class="l">' + esc(Sm.nm(p)) + (b.gs ? "" : " <small>bench</small>") + "</td><td>" + Math.round(b.sec / 60) + "</td><td><b>" + b.pts + "</b></td><td>" + (b.orb + b.drb) + "</td><td>" + b.ast + "</td><td>" + b.stl + "</td><td>" + b.blk + "</td><td>" + b.tov + "</td><td>" + b.fgm + "-" + b.fga + "</td><td>" + b.tpm + "-" + b.tpa + "</td><td>" + b.ftm + "-" + b.fta + "</td><td>" + b.pf + "</td><td>" + (b.pm > 0 ? "+" : "") + b.pm + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }).join("") + "</section>";
  }

  // ---- Post-game -----------------------------------------------------------------------------------
  function postgame(S) {
    var L = S.league, lg = L.user.lastGame, e = lg.entry, res = lg.res, u = Lg.user(L);
    var me = L.teams[u.teamId], opp = L.teams[lg.sideIdx === 0 ? res.away : res.home];
    var h = L.teams[res.home], a = L.teams[res.away];
    var qs = res.qScores;
    var fakeSim = { sides: [{ team: h, score: res.hs, box: res.boxes[0], players: playersOf(L, res.boxes[0]) }, { team: a, score: res.as, box: res.boxes[1], players: playersOf(L, res.boxes[1]) }] };
    return '<div class="screen postgame" style="' + teamVars(me) + '">' + topbar(S, "Postgame") +
      '<div class="wrap pg-grid">' +
      '<section class="pg-hero ' + (e.won ? "w" : "l") + '"><span class="label">' + (e.playoff ? "Playoffs · " : "") + "Final" + (res.ot ? " · " + (res.ot === 1 ? "OT" : res.ot + "OT") : "") + "</span>" +
      '<div class="pg-score"><span>' + a.abbr + ' <b class="num">' + res.as + "</b></span><span>" + h.abbr + ' <b class="num">' + res.hs + "</b></span></div>" +
      '<h2 class="pg-result">' + (e.won ? "Win" : "Loss") + " " + (e.home ? "vs" : "at") + " " + esc(opp.city) + "</h2>" +
      '<div class="tbl-wrap"><table class="tbl compact qtbl"><thead><tr><th class="l"></th>' + qs[0].map(function (_, i) { return "<th>" + (i < 4 ? i + 1 : "OT" + (i > 4 ? i - 3 : "")) + "</th>"; }).join("") + "<th>T</th></tr></thead><tbody>" +
      [[a, qs[1], res.as], [h, qs[0], res.hs]].map(function (r) { return '<tr><td class="l">' + r[0].abbr + "</td>" + r[1].map(function (x) { return "<td>" + x + "</td>"; }).join("") + "<td><b>" + r[2] + "</b></td></tr>"; }).join("") + "</tbody></table></div>" +
      "</section>" +
      (e.dnp ? '<section class="panel"><p>You did not play in this game.</p></section>' :
        '<section class="panel pg-me"><div class="pg-grade"><span class="label">Teammate grade</span><div class="grade xl ' + gradeClass(e.grade) + '">' + e.grade + "</div></div>" +
        '<div class="pg-line"><span class="label">Your line</span><div class="pg-nums num"><div><b>' + e.line.pts + "</b><small>PTS</small></div><div><b>" + e.line.reb + "</b><small>REB</small></div><div><b>" + e.line.ast + "</b><small>AST</small></div><div><b>" + e.line.stl + "</b><small>STL</small></div><div><b>" + e.line.blk + "</b><small>BLK</small></div></div>" +
        '<p class="sub num">' + e.line.fgm + "-" + e.line.fga + " FG · " + e.line.tpm + "-" + e.line.tpa + " 3PT · " + e.line.ftm + "-" + e.line.fta + " FT · " + e.line.min + " min · " + (e.line.pm > 0 ? "+" : "") + e.line.pm + "</p></div>" +
        '<dl class="pg-earn"><div><dt>VC earned</dt><dd class="num">+' + num(e.vc) + "</dd></div><div><dt>Coach trust</dt><dd class=\"num\">" + (lg.trust >= 0 ? "+" : "") + lg.trust.toFixed(1) + " → " + L.user.trust.toFixed(0) + "</dd></div>" +
        (lg.highs && lg.highs.length ? "<div><dt>Career high</dt><dd>" + lg.highs.join(", ").toUpperCase() + "</dd></div>" : "") + "</dl></section>") +
      '<div class="pg-actions">' + btn("closePostgame", "Continue", "btn-primary") + "</div>" +
      '<div class="pg-box">' + boxScore(fakeSim, L) + "</div>" +
      "</div></div>";
  }
  function playersOf(L, box) {
    return Object.keys(box).map(function (id) { return L.players[id]; }).filter(Boolean);
  }

  // ---- Season-end screens -------------------------------------------------------------------------
  function awards(S) {
    var L = S.league, A = L.seasonAwards, u = Lg.user(L);
    function nm(id) { var p = L.players[id]; return p ? full(p) + " <small>" + L.teams[p.teamId].abbr + "</small>" : "-"; }
    function line(id) { var p = L.players[id]; if (!p) return ""; var s = Lg.perGame(p.stats); return f1(s.pts) + " / " + f1(s.reb) + " / " + f1(s.ast); }
    var single = ["Defensive Player of the Year", "Rookie of the Year", "Sixth Man of the Year", "Scoring Champion"];
    return '<div class="screen awards">' + topbar(S, Lg.seasonLabel(L.year) + " awards") +
      '<div class="wrap">' +
      '<section class="awards-hero"><p class="eyebrow">' + Lg.seasonLabel(L.year) + ' regular season</p><h1 class="big-h">Awards night</h1>' +
      (A.mine.length ? '<div class="my-awards">' + A.mine.map(function (m) { return '<div class="my-award"><b>' + esc(m.name) + "</b><small>+" + num(m.vc) + " VC</small></div>"; }).join("") + "</div>" :
        '<p class="sub">No hardware for you this year. The work continues this summer.</p>') + "</section>" +
      '<div class="awards-grid">' +
      '<section class="panel mvp"><h2 class="card-h sm">MVP voting</h2><ol class="vote">' + A.MVP.map(function (id, i) {
        return '<li class="' + (id === u.id ? "me" : "") + '"><span class="num rank">' + (i + 1) + "</span><span>" + nm(id) + '</span><small class="num">' + line(id) + "</small></li>";
      }).join("") + "</ol></section>" +
      single.map(function (k) {
        return '<section class="panel"><h2 class="card-h sm">' + k + "</h2>" + (A[k] && A[k].length ? '<p class="winner' + (A[k][0] === u.id ? " me" : "") + '">' + nm(A[k][0]) + '</p><small class="num">' + line(A[k][0]) + "</small>" : "<p>-</p>") + "</section>";
      }).join("") +
      '<section class="panel span2"><h2 class="card-h sm">All-NBA</h2><div class="three">' + A.allNBA.map(function (t, i) {
        return '<div><span class="label">' + ["First", "Second", "Third"][i] + ' team</span><ul class="plain">' + t.map(function (id) { return '<li class="' + (id === u.id ? "me" : "") + '">' + nm(id) + "</li>"; }).join("") + "</ul></div>";
      }).join("") + "</div></section>" +
      '<section class="panel"><h2 class="card-h sm">All-Defensive</h2>' + A.allDef.map(function (t, i) {
        return '<span class="label">' + ["First", "Second"][i] + ' team</span><ul class="plain">' + t.map(function (id) { return '<li class="' + (id === u.id ? "me" : "") + '">' + nm(id) + "</li>"; }).join("") + "</ul>";
      }).join("") + "</section>" +
      '<section class="panel"><h2 class="card-h sm">Your season goals</h2><ul class="goals">' + L.user.goals.map(function (g) {
        return '<li class="' + (g.done ? "done" : "") + '"><div><span>' + esc(g.label) + "</span><small>" + (g.done ? "Complete · +" + num(g.vc) + " VC" : "Missed") + "</small></div></li>";
      }).join("") + "</ul></section>" +
      "</div>" +
      '<div class="row center">' + btn("startPlayoffs", "Start the playoffs", "btn-primary") + "</div></div></div>";
  }

  function champion(S) {
    var L = S.league, po = L.po, f = po.series.filter(function (s) { return s.round === 4; })[0], u = Lg.user(L), t = L.teams[po.champion];
    var won = po.champion === u.teamId, fm = L.players[po.fmvp];
    var loser = L.teams[f.winner === f.hi ? f.lo : f.hi];
    return '<div class="screen champion" style="' + teamVars(t) + '">' + topbar(S, "Finals") +
      '<div class="wrap"><section class="champ-hero"><p class="eyebrow">' + Lg.seasonLabel(L.year) + " NBA Finals</p>" +
      '<h1 class="big-h">' + esc(Lg.teamName(t)) + "</h1><p class=\"champ-sub\">def. " + esc(Lg.teamName(loser)) + ", " + Math.max(f.hw, f.lw) + "-" + Math.min(f.hw, f.lw) + "</p>" +
      (won ? '<p class="ring">You are a champion.' + (fm && fm.isUser ? " And the Finals MVP." : "") + "</p>" : "") +
      '<p class="sub">Finals MVP: ' + (fm ? full(fm) : "-") + "</p></section>" + bracket(L) +
      '<div class="row center">' + btn("toOffseason", "Head into the offseason", "btn-primary") + "</div></div></div>";
  }

  function offseason(S) {
    var L = S.league, R = L.offseason, u = Lg.user(L), U = L.user, last = U.seasons[U.seasons.length - 1];
    var changes = Object.keys(R.userChanges || {});
    var st = last ? Lg.perGame(last.stats) : null;
    return '<div class="screen offseason">' + topbar(S, "Offseason " + (L.year + 1)) +
      '<div class="wrap"><section class="off-hero"><p class="eyebrow">Summer ' + (L.year + 1) + '</p><h1 class="big-h">Offseason</h1>' +
      (st ? '<p class="sub">' + Lg.seasonLabel(last.year) + ": " + f1(st.pts) + " PPG, " + f1(st.reb) + " RPG, " + f1(st.ast) + " APG for " + last.team + " (" + last.record + ")" + (last.awards.length ? ". " + esc(last.awards.join(", ")) : "") + ".</p>" : "") + "</section>" +
      '<div class="off-grid">' +
      '<section class="panel"><h2 class="card-h sm">Summer development <small>age ' + u.age + "</small></h2>" +
      (changes.length ? '<ul class="chg">' + changes.map(function (a) { var d = R.userChanges[a]; return '<li class="' + (d > 0 ? "up" : "down") + '"><span>' + D.ATTR_LABEL[a] + '</span><b class="num">' + (d > 0 ? "+" : "") + d + "</b></li>"; }).join("") + "</ul>" : '<p class="sub">No natural changes this summer. Your growth is in your hands now: spend VC.</p>') +
      '<p class="sub">Overall now ' + u.ovr + ".</p></section>" +
      '<section class="panel"><h2 class="card-h sm">Business</h2><dl class="kv"><div><dt>Endorsement</dt><dd>' + esc(R.endorsement.name) + "</dd></div><div><dt>Endorsement VC</dt><dd>+" + num(R.endorsement.vc) + "</dd></div><div><dt>Fans</dt><dd>" + num(U.fans) + "</dd></div><div><dt>Legacy</dt><dd>" + R.legacy.score + " · " + esc(R.legacy.verdict) + "</dd></div></dl></section>" +
      '<section class="panel"><h2 class="card-h sm">Around the league</h2><ul class="news">' +
      (R.trades.length ? R.trades.slice(0, 4).map(function (x) { return "<li>Trade: " + esc(x) + "</li>"; }).join("") : "") +
      "<li>" + R.retired.length + " players retired" + (R.retired.length ? ", including " + esc(R.retired.slice(0, 3).join("; ")) : "") + ".</li><li>" + R.rookies + " rookies joined the league in the draft.</li></ul></section>" +
      '<section class="panel span2"><h2 class="card-h sm">Contract</h2>' +
      (L.offers ? '<p class="sub">Your deal is up. You are an unrestricted free agent. Pick your next home.</p><div class="offers">' + L.offers.map(function (o, i) {
        var t = L.teams[o.teamId];
        return '<article class="offer" style="' + teamVars(t) + '"><div class="tblock"><span class="tlogo" aria-hidden="true">' + t.abbr + "</span><div><b>" + esc(t.city) + "</b><span>" + esc(t.name) + '</span><small class="num">Last season ' + o.record + "</small></div></div>" +
          '<dl class="kv"><div><dt>Salary</dt><dd>' + money(o.salary) + "/yr</dd></div><div><dt>Length</dt><dd>" + o.years + " yr" + (o.years > 1 ? "s" : "") + "</dd></div><div><dt>Total</dt><dd>" + money(o.salary * o.years) + "</dd></div><div><dt>Projected role</dt><dd>" + o.role + "</dd></div></dl>" +
          btn("acceptOffer", o.resign ? "Re-sign" : "Sign", o.resign ? "btn-primary" : "", i) + "</article>";
      }).join("") + "</div>" :
        '<p class="sub">' + U.contract.years + " year" + (U.contract.years > 1 ? "s" : "") + " left at " + money(U.contract.salary) + " per year with the " + esc(Lg.teamName(Lg.userTeam(L))) + ".</p>") +
      "</section></div>" +
      '<div class="row center">' + (L.offers ? "" : btn("nextSeason", "Start the " + Lg.seasonLabel(L.year + 1) + " season", "btn-primary")) + btn("confirmRetire", "Retire", "btn-ghost") + "</div></div></div>";
  }

  function retired(S) {
    var L = S.league, u = Lg.user(L), lg = Lg.legacy(L), U = L.user;
    var car = P.newStats();
    Object.keys(car).forEach(function (k) { car[k] = u.career[k]; });
    var s = Lg.perGame(car);
    return '<div class="screen retired">' + topbar(S, "Career complete") +
      '<div class="wrap"><section class="champ-hero"><p class="eyebrow">' + U.seasons.length + " seasons · " + U.rings + " ring" + (U.rings === 1 ? "" : "s") + "</p>" +
      '<h1 class="big-h">' + esc(u.first + " " + u.last) + '</h1><p class="champ-sub">' + esc(lg.verdict) + " · Legacy " + lg.score + "</p>" +
      '<p class="sub num">' + f1(s.pts) + " PPG · " + f1(s.reb) + " RPG · " + f1(s.ast) + " APG over " + car.gp + " games. " + num(car.pts) + " career points.</p></section>" +
      legacyTab(S, L, u) + '<div class="row center">' + btn("newCareer", "Start a new career", "btn-primary") + "</div></div></div>";
  }

  // ---- Overlays ---------------------------------------------------------------------------------
  function overlay(S) {
    var out = "";
    if (S.busy) {
      out += '<div class="overlay"><div class="panel busy" role="status"><span class="label">Simulating</span><h2 class="card-h">' + esc(S.busy.label) + '</h2><span class="meterline wide"><i style="width:' + Math.round(S.busy.frac * 100) + '%"></i></span></div></div>';
    }
    if (S.confirm) {
      out += '<div class="overlay"><div class="panel confirm" role="dialog" aria-modal="true" aria-labelledby="confirmH"><h2 class="card-h" id="confirmH">' + esc(S.confirm.title) + '</h2><p class="sub">' + esc(S.confirm.text) + '</p><div class="row">' +
        btn("confirmYes", S.confirm.yes, S.confirm.danger ? "btn-danger" : "btn-primary") + btn("confirmNo", "Cancel", "btn-ghost") + "</div></div></div>";
    }
    if (S.toast) out += '<div class="toast" role="status">' + esc(S.toast) + "</div>";
    return out;
  }

  HL.ui = {
    esc: esc, tier: tier, rt: rt, courtSVG: courtSVG, title: title, builder: builder, builderPreview: builderPreview,
    combine: combine, meterHTML: meterHTML, draft: draft, hub: hub, gameScreen: gameScreen, scorebug: scorebug, feedHTML: feedHTML,
    decisionHTML: decisionHTML, postgame: postgame, awards: awards, champion: champion, offseason: offseason, retired: retired,
    overlay: overlay
  };
});
