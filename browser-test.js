const { chromium } = require("playwright");
const path = require("path");

const HTML_PATH = "file:///" + path.resolve(__dirname, "index.html").replace(/\\/g, "/");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  let passed = 0, failed = 0;
  function ok(cond, msg) {
    if (cond) { passed++; console.log("  PASS: " + msg); }
    else { failed++; console.error("  FAIL: " + msg); }
  }

  // Set up dialog auto-accept for all prompts
  page.on("dialog", async (d) => { await d.accept("Test"); });

  // Clear IndexedDB
  await page.addInitScript(() => {
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("NoteVaultDB");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });

  console.log("=== Loading app ===");
  await page.goto(HTML_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  console.log("=== Setup flow ===");
  await page.fill("#setupPassphrase", "test-passphrase-12345678");
  await page.fill("#setupPassphraseConfirm", "test-passphrase-12345678");
  await page.click("#setupNextBtn");
  await page.waitForTimeout(800);

  const recoveryWords = await page.$$eval(".recovery-word", els => els.map(e => e.textContent.trim()));
  ok(recoveryWords.length === 12, "12 recovery words displayed");

  await page.click("#confirmRecoveryBtn");
  await page.waitForTimeout(500);
  await page.click("button:has-text('Skip')");
  await page.waitForTimeout(1000);
  ok(true, "setup complete");

  // Create a root-level note directly
  console.log("\n=== Creating note ===");
  await page.evaluate(() => createNote());
  await page.waitForTimeout(500);
  await page.fill("#editor", "# Test Note\n\nSome content here.");
  await page.waitForTimeout(800);

  const noteEl = await page.$("[data-note]");
  ok(!!noteEl, "note created in tree");

  // === CONTEXT MENU TEST ===
  console.log("\n=== Context menu test ===");

  // Right-click the note
  await noteEl.click({ button: "right" });
  await page.waitForTimeout(500);

  const menuVisible = await page.$eval("#contextMenu", el => el.style.display === "block");
  ok(menuVisible, "context menu visible after right-click");

  const menuItems = await page.$$eval("#contextMenu .context-menu-item", els => els.map(e => e.textContent));
  console.log("  Menu items: " + JSON.stringify(menuItems));
  ok(menuItems.includes("Rename"), "Rename option present");
  ok(menuItems.includes("Move to folder"), "Move to folder present");
  ok(menuItems.includes("Delete note"), "Delete note present");

  // Click the first menu item (Rename)
  await page.click("#contextMenu .context-menu-item");
  await page.waitForTimeout(800);

  const menuClosed = await page.$eval("#contextMenu", el => el.style.display !== "block");
  ok(menuClosed, "menu closed after click");

  // === SELF-TEST ===
  console.log("\n=== Self-test ===");
  const selfTestResult = await page.evaluate(() => {
    if (typeof _testContextMenu !== "function") return "function not found";
    return _testContextMenu();
  });
  ok(selfTestResult === true, "_testContextMenu() all passed");

  // === JSON RENDERING ===
  console.log("\n=== JSON rendering ===");
  await page.fill("#editor", '{"name":"test","items":[1,2,3],"nested":{"key":"value"}}');
  await page.waitForTimeout(500);
  await page.selectOption("#formatSelect", "json");
  await page.waitForTimeout(500);

  const jsonTree = await page.$("#jsonTreeContainer");
  ok(!!jsonTree, "JSON tree container rendered");

  const jsonFilter = await page.$("#jsonFilter");
  ok(!!jsonFilter, "JSON filter input rendered");

  await page.fill("#jsonFilter", "name");
  await page.waitForTimeout(300);
  const filterCount = await page.$eval("#filterCount", el => el.textContent);
  ok(filterCount.length > 0, "filter count shows results: " + filterCount);

  // === MARKDOWN RENDERING ===
  console.log("\n=== Markdown ===");
  await page.fill("#editor", "# Hello\n\n**bold** and *italic*");
  await page.waitForTimeout(500);
  await page.selectOption("#formatSelect", "markdown");
  await page.waitForTimeout(500);

  const h1 = await page.$(".preview-content h1");
  ok(!!h1, "markdown h1 rendered");
  const bold = await page.$(".preview-content strong");
  ok(!!bold, "markdown bold rendered");

  // === DARK/LIGHT THEME ===
  console.log("\n=== Theme toggle ===");
  const initialTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  ok(initialTheme === "dark" || initialTheme === "light", "initial theme is valid: " + initialTheme);
  await page.click("#themeBtn");
  await page.waitForTimeout(300);
  const newTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  ok(newTheme !== initialTheme, "theme toggled from " + initialTheme + " to " + newTheme);

  // === RESULTS ===
  console.log("\n=== RESULTS ===");
  console.log("  Passed: " + passed);
  console.log("  Failed: " + failed);
  console.log("  Total:  " + (passed + failed));

  await browser.close();
  if (failed > 0) process.exit(1);
}

run().catch(e => {
  console.error("Test error:", e.message);
  process.exit(1);
});