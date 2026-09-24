/*
 * Static game data: attributes, positions, archetypes, badges, teams, names.
 * Every file in js/ attaches to one shared namespace, window.HL (globalThis.HL in Node).
 */
(function (root, factory) {
  var HL = (root.HL = root.HL || {});
  factory(HL);
  if (typeof module === "object" && module.exports) module.exports = HL;
})(typeof globalThis !== "undefined" ? globalThis : this, function (HL) {
  "use strict";

  // ---- Attributes -------------------------------------------------------
  var ATTR_GROUPS = [
    { key: "finishing", label: "Finishing", attrs: [
      ["closeShot", "Close Shot"], ["layup", "Driving Layup"], ["dunk", "Driving Dunk"],
      ["standDunk", "Standing Dunk"], ["post", "Post Control"]] },
    { key: "shooting", label: "Shooting", attrs: [
      ["mid", "Mid-Range Shot"], ["three", "Three-Point Shot"], ["ft", "Free Throw"]] },
    { key: "playmaking", label: "Playmaking", attrs: [
      ["pass", "Pass Accuracy"], ["handle", "Ball Handle"], ["speedBall", "Speed with Ball"]] },
    { key: "defense", label: "Defense", attrs: [
      ["intD", "Interior Defense"], ["perD", "Perimeter Defense"], ["steal", "Steal"], ["block", "Block"]] },
    { key: "rebounding", label: "Rebounding", attrs: [
      ["oreb", "Offensive Rebound"], ["dreb", "Defensive Rebound"]] },
    { key: "physicals", label: "Physicals", attrs: [
      ["speed", "Speed"], ["strength", "Strength"], ["vertical", "Vertical"], ["stamina", "Stamina"]] }
  ];
  var ATTRS = [];
  var ATTR_LABEL = {};
  var ATTR_GROUP = {};
  ATTR_GROUPS.forEach(function (g) {
    g.attrs.forEach(function (a) { ATTRS.push(a[0]); ATTR_LABEL[a[0]] = a[1]; ATTR_GROUP[a[0]] = g.key; });
  });

  // ---- Positions ----------------------------------------------------------
  // Heights in inches. `tpl` is the attribute shape of an average rotation player at the position.
  var POSITIONS = {
    PG: { name: "Point Guard", h: [72, 78], hMid: 75, w: [170, 215], wMid: 190,
      tpl: { closeShot: 62, layup: 74, dunk: 45, standDunk: 25, post: 35, mid: 70, three: 74, ft: 80,
        pass: 78, handle: 80, speedBall: 78, intD: 38, perD: 70, steal: 65, block: 30, oreb: 30, dreb: 42,
        speed: 80, strength: 45, vertical: 68, stamina: 82 },
      w8: { closeShot: .6, layup: 1, dunk: .3, standDunk: .1, post: .1, mid: .9, three: 1.3, ft: .5,
        pass: 1.5, handle: 1.5, speedBall: 1, intD: .2, perD: 1, steal: .7, block: .1, oreb: .1, dreb: .3,
        speed: 1, strength: .2, vertical: .3, stamina: .4 } },
    SG: { name: "Shooting Guard", h: [75, 80], hMid: 77, w: [180, 225], wMid: 200,
      tpl: { closeShot: 64, layup: 74, dunk: 60, standDunk: 30, post: 40, mid: 72, three: 76, ft: 80,
        pass: 64, handle: 72, speedBall: 72, intD: 42, perD: 70, steal: 62, block: 38, oreb: 34, dreb: 46,
        speed: 76, strength: 50, vertical: 72, stamina: 82 },
      w8: { closeShot: .6, layup: 1, dunk: .5, standDunk: .1, post: .2, mid: 1.1, three: 1.5, ft: .6,
        pass: .8, handle: 1.1, speedBall: .8, intD: .2, perD: 1.1, steal: .7, block: .2, oreb: .15, dreb: .35,
        speed: .9, strength: .3, vertical: .4, stamina: .4 } },
    SF: { name: "Small Forward", h: [77, 82], hMid: 79, w: [195, 240], wMid: 220,
      tpl: { closeShot: 66, layup: 70, dunk: 68, standDunk: 45, post: 50, mid: 68, three: 70, ft: 76,
        pass: 58, handle: 62, speedBall: 64, intD: 55, perD: 70, steal: 58, block: 50, oreb: 42, dreb: 58,
        speed: 72, strength: 60, vertical: 72, stamina: 82 },
      w8: { closeShot: .8, layup: 1, dunk: .8, standDunk: .3, post: .4, mid: 1, three: 1.2, ft: .5,
        pass: .7, handle: .8, speedBall: .6, intD: .5, perD: 1.1, steal: .6, block: .4, oreb: .3, dreb: .6,
        speed: .8, strength: .5, vertical: .5, stamina: .4 } },
    PF: { name: "Power Forward", h: [79, 84], hMid: 81, w: [215, 260], wMid: 235,
      tpl: { closeShot: 72, layup: 64, dunk: 68, standDunk: 68, post: 60, mid: 62, three: 62, ft: 70,
        pass: 52, handle: 50, speedBall: 52, intD: 68, perD: 58, steal: 50, block: 62, oreb: 62, dreb: 72,
        speed: 62, strength: 72, vertical: 68, stamina: 80 },
      w8: { closeShot: 1.1, layup: .7, dunk: .8, standDunk: .9, post: .9, mid: .8, three: .7, ft: .4,
        pass: .5, handle: .4, speedBall: .3, intD: 1.1, perD: .6, steal: .4, block: .9, oreb: .8, dreb: 1.1,
        speed: .5, strength: .8, vertical: .6, stamina: .4 } },
    C: { name: "Center", h: [81, 88], hMid: 84, w: [230, 290], wMid: 255,
      tpl: { closeShot: 76, layup: 58, dunk: 62, standDunk: 78, post: 62, mid: 52, three: 45, ft: 64,
        pass: 50, handle: 38, speedBall: 40, intD: 76, perD: 46, steal: 45, block: 74, oreb: 74, dreb: 80,
        speed: 52, strength: 80, vertical: 64, stamina: 78 },
      w8: { closeShot: 1.2, layup: .5, dunk: .6, standDunk: 1.2, post: 1, mid: .5, three: .4, ft: .3,
        pass: .4, handle: .2, speedBall: .15, intD: 1.4, perD: .4, steal: .3, block: 1.3, oreb: 1.1, dreb: 1.4,
        speed: .3, strength: 1, vertical: .6, stamina: .4 } }
  };
  var POS_ORDER = ["PG", "SG", "SF", "PF", "C"];

  // ---- Archetypes (builds) --------------------------------------------------
  // `mod` shifts the position template. For a created player it also shifts the attribute caps.
  var ARCHETYPES = {
    shotCreator: { name: "Playmaking Shot Creator", blurb: "Creates his own look off the dribble and sets up teammates.",
      pos: ["PG", "SG"], mod: { handle: 10, mid: 8, three: 6, pass: 6, speedBall: 6, perD: -6, intD: -6, block: -8, strength: -6 } },
    sharpshooter: { name: "Sharpshooter", blurb: "Lives beyond the arc. Defenses have to pick him up at half court.",
      pos: ["PG", "SG", "SF"], mod: { three: 14, mid: 10, ft: 10, layup: -6, dunk: -10, intD: -6, perD: -4, strength: -6, pass: -2 } },
    slasher: { name: "Slasher", blurb: "Explosive downhill driver who finishes above the rim.",
      pos: ["PG", "SG", "SF"], mod: { layup: 10, dunk: 14, speedBall: 6, vertical: 10, speed: 4, three: -10, mid: -4, ft: -4 } },
    playmaker: { name: "Floor General", blurb: "Pass-first engine who makes everyone around him better.",
      pos: ["PG"], mod: { pass: 16, handle: 10, speedBall: 4, three: -4, mid: -2, dunk: -8 } },
    threeAndD: { name: "3-and-D Wing", blurb: "Spaces the floor and takes the other team's best scorer.",
      pos: ["SG", "SF", "PF"], mod: { three: 10, perD: 12, steal: 6, handle: -8, pass: -6, layup: -4, post: -6 } },
    twoWay: { name: "Two-Way Slasher", blurb: "Attacks the rim on one end and hounds ball handlers on the other.",
      pos: ["SG", "SF"], mod: { layup: 6, dunk: 8, perD: 10, steal: 6, three: -6, pass: -4, handle: -2 } },
    lockdown: { name: "Lockdown Defender", blurb: "A perimeter stopper who lives in passing lanes.",
      pos: ["PG", "SG", "SF"], mod: { perD: 16, steal: 12, intD: 4, three: -8, mid: -6, layup: -4, handle: -4, pass: -2 } },
    pointForward: { name: "Point Forward", blurb: "A big wing who runs the offense and grabs boards.",
      pos: ["SF", "PF"], mod: { pass: 12, handle: 8, speedBall: 6, closeShot: 2, three: -6, intD: -4, block: -6 } },
    stretchBig: { name: "Stretch Big", blurb: "Pulls rim protectors out to the three-point line.",
      pos: ["PF", "C"], mod: { three: 18, mid: 10, ft: 8, post: -8, standDunk: -10, intD: -6, block: -6, oreb: -8, strength: -6 } },
    paintBeast: { name: "Paint Beast", blurb: "Bully in the post. Punishes switches and crashes the glass.",
      pos: ["PF", "C"], mod: { closeShot: 10, standDunk: 10, dunk: 8, post: 8, strength: 8, oreb: 8, three: -16, mid: -8, ft: -8 } },
    rimProtector: { name: "Rim Protector", blurb: "Anchors the defense and owns the defensive glass.",
      pos: ["PF", "C"], mod: { block: 16, intD: 14, dreb: 8, oreb: 4, three: -14, mid: -8, pass: -6, handle: -6, post: -6 } },
    postScorer: { name: "Post Scorer", blurb: "Footwork, fadeaways and a soft touch around the block.",
      pos: ["PF", "C"], mod: { post: 16, closeShot: 8, mid: 6, strength: 6, three: -10, speed: -4, perD: -6 } },
    allAround: { name: "All-Around", blurb: "No glaring weakness. Lower ceiling on any single skill.",
      pos: ["PG", "SG", "SF", "PF", "C"], mod: {} }
  };

  // ---- Badges ---------------------------------------------------------------
  // A badge unlocks from the average of `attrs`. `t` = Bronze, Silver, Gold, Hall of Fame thresholds.
  var BADGES = [
    { id: "rimWrecker", name: "Rim Wrecker", cat: "finishing", attrs: ["dunk"], t: [70, 80, 88, 95], desc: "Better dunk finishing and more and-ones." },
    { id: "acrobat", name: "Acrobat", cat: "finishing", attrs: ["layup"], t: [70, 79, 87, 94], desc: "Converts contested layups and avoids blocks." },
    { id: "postTech", name: "Post Technician", cat: "finishing", attrs: ["post"], t: [65, 75, 84, 92], desc: "Raises post-up efficiency." },
    { id: "putback", name: "Putback King", cat: "finishing", attrs: ["oreb", "standDunk"], t: [65, 75, 84, 92], desc: "Finishes offensive rebounds at the rim." },
    { id: "sniper", name: "Sniper", cat: "shooting", attrs: ["three"], t: [70, 78, 86, 93], desc: "Raises three-point percentage." },
    { id: "midMaestro", name: "Mid-Range Maestro", cat: "shooting", attrs: ["mid"], t: [70, 78, 86, 93], desc: "Raises mid-range percentage." },
    { id: "iceVeins", name: "Ice Veins", cat: "shooting", attrs: ["ft"], t: [75, 83, 89, 95], desc: "Better free throws and a wider shot meter window." },
    { id: "clutch", name: "Clutch Gene", cat: "shooting", attrs: ["mid", "three", "layup"], t: [72, 80, 87, 93], desc: "Shoots better in the last three minutes of close games." },
    { id: "floorGeneral", name: "Floor General", cat: "playmaking", attrs: ["pass"], t: [70, 79, 87, 94], desc: "More assists; teammates shoot better on his passes." },
    { id: "tightHandles", name: "Tight Handles", cat: "playmaking", attrs: ["handle"], t: [70, 79, 87, 94], desc: "Fewer turnovers and more successful size-ups." },
    { id: "blurStep", name: "Blur Step", cat: "playmaking", attrs: ["speedBall", "speed"], t: [72, 80, 87, 93], desc: "Beats defenders off the dribble on drives." },
    { id: "lockdown", name: "Lockdown", cat: "defense", attrs: ["perD"], t: [70, 79, 87, 94], desc: "Lowers the shooting percentage of his matchup." },
    { id: "rimProtector", name: "Rim Protector", cat: "defense", attrs: ["block", "intD"], t: [68, 77, 86, 93], desc: "More blocks and tougher shots at the rim." },
    { id: "pickpocket", name: "Pickpocket", cat: "defense", attrs: ["steal"], t: [68, 77, 86, 93], desc: "More steals and deflections." },
    { id: "glassCleaner", name: "Glass Cleaner", cat: "rebounding", attrs: ["dreb", "oreb"], t: [70, 79, 87, 94], desc: "Wins more rebounds." },
    { id: "tireless", name: "Tireless", cat: "physicals", attrs: ["stamina"], t: [80, 86, 91, 96], desc: "Tires more slowly." }
  ];
  var BADGE_TIERS = ["", "Bronze", "Silver", "Gold", "Hall of Fame"];

  // ---- Teams (real cities, fictional nicknames) -----------------------------
  var TEAMS = [
    ["ATL", "Atlanta", "Firebirds", "E", "#C8312B", "#F2B84B"],
    ["BOS", "Boston", "Minutemen", "E", "#1E7A4C", "#E9E4D4"],
    ["BKN", "Brooklyn", "Bridges", "E", "#2B2F36", "#C9CED6"],
    ["CHA", "Charlotte", "Monarchs", "E", "#3A2E8C", "#2FB5A8"],
    ["CHI", "Chicago", "Wind", "E", "#B3202E", "#E6E1D8"],
    ["CLE", "Cleveland", "Ironmen", "E", "#6E1F36", "#D9A441"],
    ["DET", "Detroit", "Motors", "E", "#1F4FA3", "#D8413A"],
    ["IND", "Indiana", "Racers", "E", "#193C74", "#F0C23B"],
    ["MIA", "Miami", "Tides", "E", "#D13C6B", "#2EC4C7"],
    ["MIL", "Milwaukee", "Stags", "E", "#27553A", "#E8D8AE"],
    ["NYE", "New York", "Empire", "E", "#1D4FB8", "#F28A2E"],
    ["ORL", "Orlando", "Sun", "E", "#2667C9", "#F3D34A"],
    ["PHI", "Philadelphia", "Liberty", "E", "#2451A6", "#E2453C"],
    ["TOR", "Toronto", "Huskies", "E", "#8E1B2C", "#C7CCD4"],
    ["WAS", "Washington", "Eagles", "E", "#1B3569", "#D7363D"],
    ["DAL", "Dallas", "Outlaws", "W", "#1F5FB0", "#A9B6C6"],
    ["DEN", "Denver", "Peaks", "W", "#23456E", "#F2B23A"],
    ["HOU", "Houston", "Orbit", "W", "#C8202F", "#C4CBD3"],
    ["LAS", "Los Angeles", "Stars", "W", "#5B2C8F", "#F1C23E"],
    ["LAW", "Los Angeles", "Waves", "W", "#1566C0", "#E54B4B"],
    ["MEM", "Memphis", "Blues", "W", "#3F5E8C", "#8EB7E6"],
    ["MIN", "Minnesota", "Timber", "W", "#1D4C3B", "#79B94E"],
    ["NOK", "New Orleans", "Krewe", "W", "#27335F", "#C6A55A"],
    ["OKC", "Oklahoma City", "Twisters", "W", "#1E7FC9", "#F0653A"],
    ["PHX", "Phoenix", "Scorpions", "W", "#E0632A", "#4A2C82"],
    ["POR", "Portland", "Pioneers", "W", "#C9283E", "#262A30"],
    ["SAC", "Sacramento", "Gold", "W", "#5A3F96", "#D4AF4A"],
    ["SAN", "San Antonio", "Vaqueros", "W", "#3C4148", "#C9CDD2"],
    ["SFO", "San Francisco", "Fog", "W", "#1C4B8F", "#F6C343"],
    ["UTA", "Utah", "Summit", "W", "#2B4C7E", "#E8A33D"]
  ].map(function (t, i) {
    return { id: i, abbr: t[0], city: t[1], name: t[2], conf: t[3], c1: t[4], c2: t[5] };
  });

  // ---- Names (fictional players) ------------------------------------------------
  var FIRST = ("Aaron Adrian Alonzo Andre Anthony Armand Austin Bennett Bryce Caleb Calvin Cam Carter Cedric Chris Cole " +
    "Colin Corey Damon Dante Darius Darnell David Deandre Derek Desmond Devin Dominic Donovan Drew Dwayne Eli Elijah Emeka " +
    "Evan Felix Gabe Gavin Grant Hakeem Isaiah Ivan Jabari Jalen Jamal Jaylen Jerome Joel Jonah Jordan Josh Julian " +
    "Justin Kai Kareem Keenan Keon Khalil Kobe Lamar Lance Lawrence Luca Luka Malik Marcus Mario Marquis Mason Miles " +
    "Moses Nate Nico Noah Olu Omar Oscar Pascal Quentin Rafael Rasheed Reggie Rico Robin Roman Rudy Sam Santiago Sekou " +
    "Shane Simon Stefan Tariq Terrence Theo Tobias Trey Tristan Tyrell Tyson Victor Wade Xavier Zach Zion Andrius Bojan " +
    "Dario Goran Ilias Jonas Kristaps Mateo Milos Rui Taj Thiago Yuki").split(" ");
  var LAST = ("Adams Akande Alvarez Anderson Bailey Banks Barnes Bell Bennett Blake Booker Bowman Bradley Brooks Bryant " +
    "Burke Caldwell Carter Chambers Coleman Collins Cross Dawson Diallo Dixon Donovan Douglas Drummond Duncan Ellis Evans " +
    "Fields Fleming Ford Foster Franklin Gaines Garrett Gibson Grant Graves Greer Hale Hamilton Harper Hawkins Hayes Holloway " +
    "Hughes Ingram Jackson Jefferson Jenkins Kane Keller Knight Lawson Lucas Mack Marsh Mason Mathis McBride Mendez Mercer " +
    "Mitchell Monroe Moss Nash Nwosu Okafor Oliver Owens Palmer Parrish Patton Payne Perry Pierce Porter Quinn Ramsey Reed " +
    "Reeves Rhodes Riley Rivers Robinson Rollins Russell Sampson Santos Sharpe Simmons Sims Stafford Stokes Sutton Tate " +
    "Thornton Townsend Tucker Vance Vaughn Wallace Walsh Ware Watts Webb Whitfield Wilder Wilkins Wright Yates Young " +
    "Petrovic Novak Kovac Sato Silva Moreau Lindqvist Adeyemi Mensah Kuznetsov").split(" ");

  var COLLEGES = ["Kentucky", "Duke", "Kansas", "North Carolina", "UCLA", "Gonzaga", "Villanova", "Michigan State",
    "Arizona", "Baylor", "Houston", "Texas", "Connecticut", "Memphis", "Alabama", "Auburn", "Purdue", "Indiana",
    "Syracuse", "Florida", "G League Ignite", "Overtime Elite", "Real Madrid (Spain)", "Partizan (Serbia)",
    "Adelaide 36ers (Australia)"];

  // ---- Settings -------------------------------------------------------------------
  var DIFFICULTY = {
    rookie: { name: "Rookie", shot: 0.05, win: 1.4, vc: 0.8 },
    pro: { name: "Pro", shot: 0.025, win: 1.2, vc: 0.9 },
    allstar: { name: "All-Star", shot: 0, win: 1.0, vc: 1.0 },
    superstar: { name: "Superstar", shot: -0.02, win: 0.85, vc: 1.15 },
    hof: { name: "Hall of Fame", shot: -0.04, win: 0.7, vc: 1.3 }
  };
  var SEASON_LENGTHS = [29, 41, 58, 82];

  HL.data = {
    ATTR_GROUPS: ATTR_GROUPS, ATTRS: ATTRS, ATTR_LABEL: ATTR_LABEL, ATTR_GROUP: ATTR_GROUP,
    POSITIONS: POSITIONS, POS_ORDER: POS_ORDER, ARCHETYPES: ARCHETYPES,
    BADGES: BADGES, BADGE_TIERS: BADGE_TIERS, TEAMS: TEAMS, FIRST: FIRST, LAST: LAST,
    COLLEGES: COLLEGES, DIFFICULTY: DIFFICULTY, SEASON_LENGTHS: SEASON_LENGTHS
  };
});
