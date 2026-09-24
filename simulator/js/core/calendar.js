/*
 * Trading calendar. Dates are handled as integer day numbers (days since
 * 1970-01-01 UTC) so arithmetic is exact and time zones never matter.
 *
 * - NYSE full-day holidays with the exchange's observance rules
 *   (Saturday holidays move to Friday, Sunday holidays to Monday, except
 *   New Year's Day on a Saturday, which is not observed).
 * - Option expirations: Fridays, and the third Friday of each month for
 *   standard monthlies. A Friday holiday moves expiry to Thursday.
 * - FOMC meetings: eight per year on a fixed pattern of Wednesdays that
 *   approximates the Fed's published schedule.
 * - The session runs 9:30–16:00 ET in 26 steps of 15 minutes.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.BSX = root.BSX || {}; root.BSX.Cal = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TICKS_PER_DAY = 26;
  var MINUTES_PER_TICK = 15;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var FUT_CODES = "FGHJKMNQUVXZ";

  function dayNum(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
  function parse(str) { var p = str.split("-"); return dayNum(+p[0], +p[1], +p[2]); }
  function parts(n) {
    var dt = new Date(n * 86400000);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function iso(n) { var p = parts(n); return p.y + "-" + pad(p.m) + "-" + pad(p.d); }
  function weekday(n) { return ((n % 7) + 11) % 7; } // 1970-01-01 was a Thursday (4)
  function nice(n) { var p = parts(n); return MONTHS[p.m - 1] + " " + p.d + ", " + p.y; }
  function short(n) { var p = parts(n); return MONTHS[p.m - 1] + " " + p.d; }
  function shortY(n) { var p = parts(n); return p.d + " " + MONTHS[p.m - 1] + " " + String(p.y).slice(2); }

  // n-th given weekday of a month (nth = -1 for the last one).
  function nthWeekday(y, m, wd, nth) {
    if (nth > 0) {
      var first = dayNum(y, m, 1);
      return first + ((wd - weekday(first) + 7) % 7) + (nth - 1) * 7;
    }
    var last = dayNum(y, m + 1, 1) - 1; // Date.UTC rolls month 13 into January
    return last - ((weekday(last) - wd + 7) % 7);
  }

  // Anonymous Gregorian algorithm.
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return dayNum(y, month, day);
  }

  function observed(n, skipSaturday) {
    var wd = weekday(n);
    if (wd === 6) return skipSaturday ? null : n - 1;
    if (wd === 0) return n + 1;
    return n;
  }

  var holidayCache = {};
  function holidays(y) {
    if (holidayCache[y]) return holidayCache[y];
    var list = [
      ["New Year's Day", observed(dayNum(y, 1, 1), true)],
      ["Martin Luther King Jr. Day", nthWeekday(y, 1, 1, 3)],
      ["Washington's Birthday", nthWeekday(y, 2, 1, 3)],
      ["Good Friday", easter(y) - 2],
      ["Memorial Day", nthWeekday(y, 5, 1, -1)],
      ["Juneteenth", observed(dayNum(y, 6, 19))],
      ["Independence Day", observed(dayNum(y, 7, 4))],
      ["Labor Day", nthWeekday(y, 9, 1, 1)],
      ["Thanksgiving Day", nthWeekday(y, 11, 4, 4)],
      ["Christmas Day", observed(dayNum(y, 12, 25))]
    ];
    var map = {};
    list.forEach(function (h) { if (h[1] != null) map[h[1]] = h[0]; });
    // New Year's of the following year observed on Dec 31 is not a NYSE holiday.
    holidayCache[y] = map;
    return map;
  }

  function holidayName(n) { return holidays(parts(n).y)[n] || null; }
  function isTradingDay(n) { var wd = weekday(n); return wd !== 0 && wd !== 6 && !holidayName(n); }
  function nextTradingDay(n) { do { n++; } while (!isTradingDay(n)); return n; }
  function prevTradingDay(n) { do { n--; } while (!isTradingDay(n)); return n; }
  function onOrAfter(n) { while (!isTradingDay(n)) n++; return n; }
  function onOrBefore(n) { while (!isTradingDay(n)) n--; return n; }
  function addTradingDays(n, k) {
    var step = k >= 0 ? 1 : -1;
    for (var i = 0; i < Math.abs(k); i++) n = step > 0 ? nextTradingDay(n) : prevTradingDay(n);
    return n;
  }
  function tradingDaysBetween(a, b) { // (a, b]
    var c = 0;
    for (var n = a + 1; n <= b; n++) if (isTradingDay(n)) c++;
    return c;
  }

  function thirdFriday(y, m) { return onOrBefore(nthWeekday(y, m, 5, 3)); }
  function isMonthlyExpiry(n) { var p = parts(n); return thirdFriday(p.y, p.m) === n; }

  // Option expirations from day `from`: the next `weeks` Friday expiries,
  // monthlies for the next `months`, quarterlies to one year, and two
  // January LEAPS.
  function optionExpiries(from, weeks, months) {
    var set = {};
    var n = from - 1, found = 0;
    while (found < weeks) {
      n++;
      if (weekday(n) === 5) {
        var e = onOrBefore(n);
        if (e >= from) { set[e] = "W"; found++; }
      }
    }
    var p = parts(from);
    for (var k = 0; k <= 14; k++) {
      var y = p.y + Math.floor((p.m - 1 + k) / 12), m = ((p.m - 1 + k) % 12) + 1;
      var tf = thirdFriday(y, m);
      if (tf < from) continue;
      if (k <= months || (m % 3 === 0 && k <= 12)) set[tf] = "M";
    }
    set[thirdFriday(p.y + 1, 1)] = "M";
    set[thirdFriday(p.y + 2, 1)] = "M";
    return Object.keys(set).map(Number).filter(function (d) { return d >= from; }).sort(function (a, b) { return a - b; })
      .map(function (d) { return { day: d, kind: set[d] }; });
  }

  // FOMC: [month, weekday-of-month (−1 = last)] on Wednesdays; the decision
  // lands at 2:00 pm on the second day, which is the date used here.
  var FOMC_PATTERN = [[1, -1], [3, 3], [5, 1], [6, 3], [7, -1], [9, 3], [11, 1], [12, 2]];
  function fomcDates(y) {
    return FOMC_PATTERN.map(function (p) { return onOrAfter(nthWeekday(y, p[0], 3, p[1])); });
  }
  function isFomcDay(n) { return fomcDates(parts(n).y).indexOf(n) >= 0; }

  // First Friday (jobs report), mid-month CPI, first business day (PMI),
  // retail sales, and the GDP advance estimate near the end of the month
  // after each quarter.
  function releaseDates(y, m) {
    return {
      jobs: onOrAfter(nthWeekday(y, m, 5, 1)),
      cpi: onOrAfter(dayNum(y, m, 12) + ((2 - weekday(dayNum(y, m, 12)) + 7) % 7)), // Tuesday on/after the 12th
      pmi: onOrAfter(dayNum(y, m, 1)),
      retail: onOrAfter(dayNum(y, m, 15) + ((3 - weekday(dayNum(y, m, 15)) + 7) % 7)), // Wednesday on/after the 15th
      gdp: (m % 3 === 1) ? onOrBefore(nthWeekday(y, m, 4, -1)) : null // last Thursday of Jan/Apr/Jul/Oct
    };
  }

  // Futures contract month code, e.g. (2026, 12) -> "Z26".
  function futCode(y, m) { return FUT_CODES[m - 1] + String(y).slice(2); }

  // Clock label for a tick within the session.
  function tickTime(tick) {
    var mins = 9 * 60 + 30 + tick * MINUTES_PER_TICK;
    var h = Math.floor(mins / 60), mm = mins % 60;
    var ap = h >= 12 ? "pm" : "am";
    var h12 = h > 12 ? h - 12 : h;
    return h12 + ":" + pad(mm) + " " + ap;
  }
  // Fraction of a calendar day at this tick (for option time to expiry).
  function tickDayFrac(tick) { return (9.5 + tick * MINUTES_PER_TICK / 60) / 24; }

  return {
    TICKS_PER_DAY: TICKS_PER_DAY,
    MINUTES_PER_TICK: MINUTES_PER_TICK,
    MONTHS: MONTHS,
    WEEKDAYS: WEEKDAYS,
    dayNum: dayNum, parse: parse, parts: parts, iso: iso, nice: nice, short: short, shortY: shortY,
    weekday: weekday, nthWeekday: nthWeekday, easter: easter,
    holidays: holidays, holidayName: holidayName,
    isTradingDay: isTradingDay, nextTradingDay: nextTradingDay, prevTradingDay: prevTradingDay,
    onOrAfter: onOrAfter, onOrBefore: onOrBefore, addTradingDays: addTradingDays, tradingDaysBetween: tradingDaysBetween,
    thirdFriday: thirdFriday, isMonthlyExpiry: isMonthlyExpiry, optionExpiries: optionExpiries,
    fomcDates: fomcDates, isFomcDay: isFomcDay, releaseDates: releaseDates,
    futCode: futCode, tickTime: tickTime, tickDayFrac: tickDayFrac
  };
});
