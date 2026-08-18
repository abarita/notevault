// NoteVault Playwright Master End-to-End Test Runner
// Executes Suites 1-5 covering all user interactions, security, formatting, data portability, and responsiveness.

const { chromium } = require("playwright");
const { runSuite1 } = require("./tests/suite1-auth-lifecycle.test");
const { runSuite2 } = require("./tests/suite2-tree-hierarchy.test");
const { runSuite3 } = require("./tests/suite3-rendering-security.test");
const { runSuite4 } = require("./tests/suite4-portability-sync.test");
const { runSuite5 } = require("./tests/suite5-mobile-theme.test");

async function runAllSuites() {
  console.log("===============================================================");
  console.log("       NOTEVAULT COMPREHENSIVE END-TO-END TEST SUITE           ");
  console.log("===============================================================");
  const startTime = Date.now();

  const browser = await chromium.launch({
    headless: true
  });

  const results = [];

  try {
    // Run all 5 suites sequentially
    results.push(await runSuite1(browser));
    results.push(await runSuite2(browser));
    results.push(await runSuite3(browser));
    results.push(await runSuite4(browser));
    results.push(await runSuite5(browser));
  } catch (err) {
    console.error("\nUnexpected error during test execution:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n===============================================================");
  console.log("                     FINAL TEST SUMMARY                        ");
  console.log("===============================================================");

  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;

  for (const r of results) {
    totalPassed += r.passed;
    totalFailed += r.failed;
    totalTests += r.total;
    const status = r.ok ? "✔ PASSED" : "✖ FAILED";
    console.log(`  ${status} | ${r.suite.padEnd(52)} (${r.passed}/${r.total})`);
  }

  console.log("---------------------------------------------------------------");
  console.log(`  TOTAL TESTS: ${totalTests}`);
  console.log(`  PASSED:      ${totalPassed}`);
  console.log(`  FAILED:      ${totalFailed}`);
  console.log(`  DURATION:    ${durationSec}s`);
  console.log("===============================================================");

  if (totalFailed > 0) {
    console.error(`\n❌ Test run FAILED with ${totalFailed} failure(s).`);
    process.exit(1);
  } else {
    console.log(`\n🎉 All ${totalPassed} assertions PASSED with 100% success rate!`);
    process.exit(0);
  }
}

runAllSuites();