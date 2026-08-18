// NoteVault Test Helpers for Playwright
const path = require("path");

const HTML_PATH = "file:///" + path.resolve(__dirname, "..", "index.html").replace(/\\/g, "/");

/**
 * Creates a clean test environment for a test run
 */
async function setupPage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1280, height: 800 },
    permissions: ["clipboard-read", "clipboard-write"]
  });
  const page = await context.newPage();

  await page.goto(HTML_PATH, { waitUntil: "domcontentloaded" });

  // Reset NoteVault IndexedDB once before starting test
  if (options.clearDb !== false) {
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const req = indexedDB.deleteDatabase("NoteVaultDB");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    });
    await page.reload({ waitUntil: "domcontentloaded" });
  }

  await page.waitForTimeout(options.waitMs || 800);

  return { context, page };
}

/**
 * Completes the onboarding flow with a passphrase and returns the 12 recovery words
 */
async function completeSetup(page, passphrase = "test-passphrase-12345678") {
  await page.waitForSelector("#setupPassphrase", { state: "visible", timeout: 5000 });
  await page.fill("#setupPassphrase", passphrase);
  await page.fill("#setupPassphraseConfirm", passphrase);
  await page.click("#setupNextBtn");
  await page.waitForSelector(".recovery-word", { state: "visible", timeout: 5000 });

  const words = await page.$$eval(".recovery-word", els => els.map(e => {
    // Clone and remove index span to get pure word
    const clone = e.cloneNode(true);
    const idx = clone.querySelector(".index");
    if (idx) idx.remove();
    return clone.textContent.trim();
  }));

  await page.click("#confirmRecoveryBtn", { force: true });
  await page.waitForSelector("button:has-text('Skip')", { state: "visible", timeout: 5000 });
  await page.click("button:has-text('Skip')", { force: true });
  await page.waitForTimeout(600);

  return words;
}

/**
 * Creates a note directly and types content into the editor
 */
async function createNote(page, content = "", format = "auto") {
  await page.click("button:has-text('+ New')");
  await page.waitForTimeout(300);
  if (content) {
    await page.fill("#editor", content);
    await page.waitForTimeout(600); // allow debounce
  }
  if (format && format !== "auto") {
    await page.selectOption("#formatSelect", format);
    await page.waitForTimeout(300);
  }
}

/**
 * Creates a root folder
 */
async function createFolder(page, folderName) {
  await page.click("button[title='New folder']");
  await page.waitForSelector("#modalPromptInput", { state: "visible", timeout: 3000 });
  await page.fill("#modalPromptInput", folderName);
  await page.click("#modalConfirmBtn");
  await page.waitForTimeout(400);
}

/**
 * Reads all records from an IndexedDB store directly in browser context
 */
async function getIndexedDbStore(page, storeName) {
  return page.evaluate(async (store) => {
    return new Promise((resolve) => {
      const req = indexedDB.open("NoteVaultDB", 2);
      req.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(store)) {
          resolve([]);
          return;
        }
        const tx = db.transaction(store, "readonly");
        const getAll = tx.objectStore(store).getAll();
        getAll.onsuccess = () => resolve(getAll.result || []);
        getAll.onerror = () => resolve([]);
      };
      req.onerror = () => resolve([]);
    });
  }, storeName);
}

/**
 * Assertion tracker
 */
class TestRunner {
  constructor(suiteName) {
    this.suiteName = suiteName;
    this.passed = 0;
    this.failed = 0;
    this.tests = [];
  }

  assert(condition, message) {
    if (condition) {
      this.passed++;
      console.log(`    PASS: ${message}`);
      this.tests.push({ pass: true, msg: message });
    } else {
      this.failed++;
      console.error(`    FAIL: ${message}`);
      this.tests.push({ pass: false, msg: message });
    }
  }

  assertEq(actual, expected, message) {
    const isEq = JSON.stringify(actual) === JSON.stringify(expected);
    if (isEq) {
      this.passed++;
      console.log(`    PASS: ${message}`);
      this.tests.push({ pass: true, msg: message });
    } else {
      this.failed++;
      console.error(`    FAIL: ${message} (Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)})`);
      this.tests.push({ pass: false, msg: message });
    }
  }

  summary() {
    console.log(`\n  --- ${this.suiteName} Summary ---`);
    console.log(`  Passed: ${this.passed} | Failed: ${this.failed} | Total: ${this.passed + this.failed}`);
    return {
      suite: this.suiteName,
      passed: this.passed,
      failed: this.failed,
      total: this.passed + this.failed,
      ok: this.failed === 0
    };
  }
}

module.exports = {
  HTML_PATH,
  setupPage,
  completeSetup,
  createNote,
  createFolder,
  getIndexedDbStore,
  TestRunner
};
