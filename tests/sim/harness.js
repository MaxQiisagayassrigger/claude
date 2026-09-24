// Tiny test harness shared by the simulator tests (no dependencies).
const path = require("path");
const core = (m) => require(path.join(__dirname, "../../simulator/js/core", m + ".js"));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.log("  ✗ " + name + "\n    " + (e.stack || e).toString().split("\n").slice(0, 4).join("\n    ")); }
}
function done(file) {
  console.log(file + ": " + passed + " passed, " + failed + " failed");
  if (failed) process.exitCode = 1;
}
function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Error((msg || "values differ") + ": " + a + " vs " + b + " (tol " + tol + ")");
}
module.exports = { core, test, done, near, assert: require("assert") };
