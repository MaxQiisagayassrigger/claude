// Run: node tests/sim/calendar.test.js
const { core, test, done, assert } = require("./harness");
const Cal = core("calendar");

test("NYSE holidays for 2026 and 2027", () => {
  const h26 = Object.keys(Cal.holidays(2026)).map(Number).map(Cal.iso).sort();
  assert.deepStrictEqual(h26, ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"]);
  const h27 = Object.keys(Cal.holidays(2027)).map(Number).map(Cal.iso).sort();
  assert.deepStrictEqual(h27, ["2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"]);
});

test("New Year's Day on a Saturday is not observed (2022)", () => {
  assert(Cal.isTradingDay(Cal.parse("2021-12-31")));
});

test("weekday and trading-day arithmetic", () => {
  assert.strictEqual(Cal.weekday(Cal.parse("2026-09-24")), 4); // Thursday
  assert.strictEqual(Cal.iso(Cal.nextTradingDay(Cal.parse("2026-09-04"))), "2026-09-08"); // Labor Day weekend
  assert.strictEqual(Cal.iso(Cal.addTradingDays(Cal.parse("2026-12-23"), 2)), "2026-12-28");
  let n = 0; for (let d = Cal.parse("2026-01-01"); d <= Cal.parse("2026-12-31"); d++) if (Cal.isTradingDay(d)) n++;
  assert.strictEqual(n, 251);
});

test("monthly option expiry is the third Friday, Thursday when Friday is a holiday", () => {
  assert.strictEqual(Cal.iso(Cal.thirdFriday(2026, 10)), "2026-10-16");
  assert.strictEqual(Cal.iso(Cal.thirdFriday(2027, 6)), "2027-06-17"); // Juneteenth observed Fri Jun 18
});

test("option expirations are sorted, unique and start today or later", () => {
  const from = Cal.parse("2026-09-28");
  const ex = Cal.optionExpiries(from, 4, 6).map((e) => e.day);
  assert(ex.length >= 12);
  for (let i = 1; i < ex.length; i++) assert(ex[i] > ex[i - 1]);
  assert(ex[0] >= from && ex.every(Cal.isTradingDay));
});

test("eight FOMC meetings a year on trading-day Wednesdays", () => {
  const f = Cal.fomcDates(2027);
  assert.strictEqual(f.length, 8);
  f.forEach((d) => assert.strictEqual(Cal.weekday(d), 3));
});

test("session clock runs 9:30 am to 4:00 pm in 26 steps", () => {
  assert.strictEqual(Cal.tickTime(0), "9:30 am");
  assert.strictEqual(Cal.tickTime(18), "2:00 pm");
  assert.strictEqual(Cal.tickTime(Cal.TICKS_PER_DAY), "4:00 pm");
});

done("calendar");
