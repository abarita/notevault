// Suite 5: Mobile Viewport & Theme
const { setupPage, completeSetup, getIndexedDbStore, TestRunner } = require("./test-helpers");

async function runSuite5(browser) {
  const runner = new TestRunner("Suite 5: Mobile Viewport & Theme");
  console.log("\n=======================================================");
  console.log("  RUNNING SUITE 5: Mobile Viewport & Theme");
  console.log("=======================================================");

  // === PART 1: MOBILE VIEWPORT & RESPONSIVE DRAWER ===
  {
    console.log("\n  [Test 5.1 - 5.3] Mobile Viewport & Hamburger Drawer");
    const { context, page } = await setupPage(browser, {
      viewport: { width: 375, height: 667 } // iPhone SE dimensions
    });

    await completeSetup(page, "mobile-test-passphrase-2026");

    // Create a test note
    await page.evaluate(() => createNote());
    await page.waitForTimeout(300);
    await page.fill("#editor", "# Mobile Responsive Note\nTested on mobile viewport.");
    await page.waitForTimeout(600);

    // 1. Check hamburger is visible on mobile
    const hamburger = await page.$(".hamburger");
    const isHamburgerVisible = await hamburger.isVisible();
    runner.assert(isHamburgerVisible, "Hamburger menu button is visible on mobile viewport");

    // 2. Check content area flex direction is column (stacked layout)
    const contentAreaFlex = await page.$eval(".content-area", el => window.getComputedStyle(el).flexDirection);
    runner.assertEq(contentAreaFlex, "column", "Content area stacks editor and preview vertically in column layout");

    // 3. Open sidebar via hamburger
    await page.click(".hamburger");
    await page.waitForTimeout(300);

    const isSidebarOpen = await page.$eval("#sidebar", el => el.classList.contains("open"));
    const isBackdropOpen = await page.$eval("#mobileBackdrop", el => el.classList.contains("open"));
    runner.assert(isSidebarOpen, "Sidebar receives .open class upon clicking hamburger");
    runner.assert(isBackdropOpen, "Mobile backdrop is displayed (.open)");

    // 4. Close sidebar via clicking backdrop
    await page.evaluate(() => closeSidebar());
    await page.waitForTimeout(300);

    const isSidebarClosed = await page.$eval("#sidebar", el => !el.classList.contains("open"));
    const isBackdropClosed = await page.$eval("#mobileBackdrop", el => !el.classList.contains("open"));
    runner.assert(isSidebarClosed, "Sidebar closes upon backdrop click");
    runner.assert(isBackdropClosed, "Mobile backdrop hides upon backdrop click");

    // 5. Mobile View Mode Switching (Edit / Preview / Split)
    const mobileTabsVisible = await page.$eval("#mobileViewTabs", el => window.getComputedStyle(el).display !== "none");
    runner.assert(mobileTabsVisible, "Mobile view tabs [Edit | Preview | Split] are visible on mobile");

    // Fill long content to test mobile preview scrolling
    const longContent = Array.from({ length: 40 }, (_, i) => `### Heading ${i + 1}\nMobile paragraph content line ${i + 1}.`).join("\n\n");
    await page.fill("#editor", longContent);
    await page.waitForTimeout(300);

    // Switch to Full Preview Mode
    await page.click("#tabPreviewBtn");
    await page.waitForTimeout(200);
    const isEditorHidden = await page.$eval("#editorPane", el => el.style.display === "none");
    const isPreviewFull = await page.$eval("#previewPane", el => el.style.display !== "none" && el.style.height === "100%");
    runner.assert(isEditorHidden, "Editor pane is hidden in Full Preview mode");
    runner.assert(isPreviewFull, "Preview pane expands to 100% full screen in Preview mode");

    // Verify preview can scroll
    const previewScrollable = await page.$eval("#preview", el => el.scrollHeight > el.clientHeight);
    runner.assert(previewScrollable, "Preview content has active scrollable height in mobile mode");

    await page.$eval("#preview", el => { el.scrollTop = 300; });
    const mobileScrollTop = await page.$eval("#preview", el => el.scrollTop);
    runner.assert(mobileScrollTop > 50, "Preview scrolls smoothly in mobile view (scrollTop: " + Math.round(mobileScrollTop) + ")");

    // Switch back to Split Mode
    await page.click("#tabSplitBtn");
    await page.waitForTimeout(200);
    const isEditorSplit = await page.$eval("#editorPane", el => el.style.display !== "none");
    const isPreviewSplit = await page.$eval("#previewPane", el => el.style.display !== "none");
    runner.assert(isEditorSplit && isPreviewSplit, "Split mode displays both editor and preview panes on mobile");

    await context.close();
  }

  // === PART 2: THEME SWITCHING & INDEXEDDB PERSISTENCE ===
  {
    console.log("\n  [Test 5.4 - 5.6] Theme Switching & Persistence");
    const { context, page } = await setupPage(browser);
    await completeSetup(page, "theme-test-passphrase-2026");

    // 1. Initial theme check
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    runner.assert(initialTheme === "dark" || initialTheme === "light", "Initial theme attribute is valid: " + initialTheme);

    // 2. Toggle theme
    await page.click("#themeBtn");
    await page.waitForTimeout(300);

    const toggledTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    runner.assert(toggledTheme !== initialTheme, `Theme toggled from ${initialTheme} to ${toggledTheme}`);

    // Verify button icon changed
    const themeBtnIcon = await page.$eval("#themeBtn", el => el.textContent.trim());
    if (toggledTheme === "light") {
      runner.assert(themeBtnIcon === "☽" || themeBtnIcon === "\u263d", "Theme button displays moon icon in light mode");
    } else {
      runner.assert(themeBtnIcon === "☼" || themeBtnIcon === "☀" || themeBtnIcon === "\u263c", "Theme button displays sun icon in dark mode");
    }

    // 3. Verify theme is stored in IndexedDB settings store
    const settingsStore = await getIndexedDbStore(page, "settings");
    const themeSetting = settingsStore.find(s => s.key === "theme");
    runner.assert(themeSetting && themeSetting.value === toggledTheme, "Theme setting persisted in IndexedDB");

    // 4. Reload page and verify theme persists
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);

    const reloadedTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    runner.assertEq(reloadedTheme, toggledTheme, `Theme ${toggledTheme} persists after full page reload`);

    await context.close();
  }

  return runner.summary();
}

module.exports = { runSuite5 };
