// Suite 1: Vault Onboarding, Setup & Auth Lifecycle
const { setupPage, completeSetup, getIndexedDbStore, TestRunner } = require("./test-helpers");

async function runSuite1(browser) {
  const runner = new TestRunner("Suite 1: Vault Onboarding, Setup & Auth Lifecycle");
  console.log("\n=======================================================");
  console.log("  RUNNING SUITE 1: Vault Onboarding, Setup & Auth Lifecycle");
  console.log("=======================================================");

  // === TEST 1.1: Setup Passphrase Validation (< 8 chars) ===
  {
    console.log("\n  [Test 1.1] Setup Passphrase Validation (< 8 chars)");
    const { context, page } = await setupPage(browser);
    await page.fill("#setupPassphrase", "short");
    await page.fill("#setupPassphraseConfirm", "short");
    await page.click("#setupNextBtn");
    await page.waitForTimeout(300);

    const errorVisible = await page.$eval("#setupError", el => el.style.display !== "none");
    const errorText = await page.$eval("#setupError", el => el.textContent);
    runner.assert(errorVisible, "Error message is displayed for short passphrase");
    runner.assert(errorText.includes("at least 8 characters"), "Error specifies minimum 8 characters");
    await context.close();
  }

  // === TEST 1.2: Setup Passphrase Mismatch Validation ===
  {
    console.log("\n  [Test 1.2] Setup Passphrase Mismatch Validation");
    const { context, page } = await setupPage(browser);
    await page.fill("#setupPassphrase", "valid-passphrase-1");
    await page.fill("#setupPassphraseConfirm", "valid-passphrase-2-different");
    await page.click("#setupNextBtn");
    await page.waitForTimeout(300);

    const errorText = await page.$eval("#setupError", el => el.textContent);
    runner.assert(errorText.includes("do not match"), "Error specifies passphrases do not match");
    await context.close();
  }

  // === TEST 1.3: 12 Recovery Words Generation & Structure ===
  let recoveryWords = [];
  {
    console.log("\n  [Test 1.3] 12 Recovery Words Generation");
    const { context, page } = await setupPage(browser);
    await page.fill("#setupPassphrase", "my-secure-vault-pass-2026");
    await page.fill("#setupPassphraseConfirm", "my-secure-vault-pass-2026");
    await page.click("#setupNextBtn");
    await page.waitForSelector(".recovery-word", { state: "visible", timeout: 5000 });

    const words = await page.$$eval(".recovery-word", els => els.map(e => {
      const clone = e.cloneNode(true);
      const idx = clone.querySelector(".index");
      if (idx) idx.remove();
      return clone.textContent.trim();
    }));

    recoveryWords = words;
    runner.assertEq(words.length, 12, "Exactly 12 recovery words are generated");
    runner.assert(words.every(w => w.length > 2 && /^[a-z]+$/.test(w)), "All recovery words are valid lowercase alphabetic tokens");

    // Test verify modal validation with wrong words
    await page.click("#confirmRecoveryBtn");
    await page.waitForSelector("#verifyWords", { state: "visible", timeout: 3000 });
    
    // === TEST 1.4: Recovery Words Verification with wrong/insufficient words ===
    console.log("\n  [Test 1.4] Recovery Words Verification Failure Handling");
    await page.fill("#verifyWords", "word1 word2 word3");
    await page.click("button:has-text('Verify')");
    await page.waitForTimeout(300);
    const verifyErr1 = await page.$eval("#verifyError", el => el.textContent);
    runner.assert(verifyErr1.includes("exactly 12 words"), "Rejects input with fewer than 12 words");

    await page.fill("#verifyWords", "abandon ability able about above absent absorb abstract absurd abuse access access");
    await page.click("button:has-text('Verify')");
    await page.waitForTimeout(400);
    const verifyErr2 = await page.$eval("#verifyError", el => el.textContent);
    runner.assert(verifyErr2.includes("not match"), "Rejects incorrect 12 words");

    // === TEST 1.5: Recovery Words Verification - Success with exact words ===
    console.log("\n  [Test 1.5] Recovery Words Verification - Exact match success");
    await page.fill("#verifyWords", recoveryWords.join(" "));
    await page.click("button:has-text('Verify')");
    await page.waitForTimeout(600);

    const modalContainer = await page.$eval("#modalContainer", el => el.innerHTML.trim());
    runner.assertEq(modalContainer, "", "Modal closes upon successful recovery verification");

    const toastText = await page.$eval("#toast", el => el.textContent);
    runner.assert(toastText.includes("Setup complete"), "Setup complete toast is shown");

    await context.close();
  }

  // === TEST 1.6: Setup Flow with Skip Verify ===
  {
    console.log("\n  [Test 1.6] Setup Flow with Skip Verify option");
    const { context, page } = await setupPage(browser);
    const words = await completeSetup(page, "skip-verify-passphrase-888");
    runner.assertEq(words.length, 12, "Setup completes cleanly with Skip option");
    
    const settings = await getIndexedDbStore(page, "settings");
    const isSetupComplete = settings.some(s => s.key === "setup_complete" && s.value === true);
    runner.assert(isSetupComplete, "setup_complete flag is persisted in IndexedDB");
    await context.close();
  }

  // === TEST 1.7, 1.8, 1.9: Vault Locking, Unlock Errors, and Unlock Success ===
  {
    console.log("\n  [Test 1.7 - 1.9] Vault Locking & Unlock Flow");
    const { context, page } = await setupPage(browser);
    const words = await completeSetup(page, "vault-lock-test-passphrase");

    // Create a confidential note
    await page.click("button:has-text('+ New')");
    await page.waitForTimeout(300);
    await page.fill("#editor", "# Top Secret Note\nThis note is confidential.");
    await page.waitForTimeout(600);

    // Lock the vault
    await page.click("#lockBtn");
    await page.waitForTimeout(500);

    // Check UI is locked
    const statsText = await page.$eval("#stats", el => el.textContent);
    runner.assert(statsText.includes("Vault locked"), "Sidebar indicates Vault locked");
    const editorVal = await page.$eval("#editor", el => el.value);
    runner.assertEq(editorVal, "", "Editor content is cleared upon lock");

    const unlockInput = await page.$("#unlockPassphrase");
    runner.assert(!!unlockInput, "Unlock modal is presented to the user");

    // Attempt incorrect passphrase
    await page.fill("#unlockPassphrase", "wrong-passphrase-attempt");
    await page.click("button:has-text('Unlock')");
    await page.waitForTimeout(400);

    const unlockError = await page.$eval("#unlockError", el => el.textContent);
    runner.assert(unlockError.includes("Incorrect passphrase"), "Incorrect passphrase error is shown");

    // Attempt correct passphrase
    await page.fill("#unlockPassphrase", "vault-lock-test-passphrase");
    await page.click("button:has-text('Unlock')");
    await page.waitForTimeout(800);

    const unlockedNotes = await page.$$("[data-note]");
    runner.assert(unlockedNotes.length > 0, "Vault unlocks and restores notes tree");
    const restoredTitle = await page.$eval("[data-note] .tree-name", el => el.textContent);
    runner.assert(restoredTitle.includes("Top Secret Note"), "Decrypted note title is restored in sidebar");

    await context.close();
  }

  // === TEST 1.10 - 1.12: Forgot Passphrase Recovery Flow & Setting New Passphrase ===
  {
    console.log("\n  [Test 1.10 - 1.12] Forgot Passphrase Recovery Lifecycle");
    const { context, page } = await setupPage(browser);
    const initialPassphrase = "initial-passphrase-2026";
    const words = await completeSetup(page, initialPassphrase);

    // Create a note that must survive recovery
    await page.click("button:has-text('+ New')");
    await page.waitForTimeout(300);
    await page.fill("#editor", "# Persistent Data\nThis data survives passphrase reset.");
    await page.waitForTimeout(600);

    // Lock vault
    await page.click("#lockBtn");
    await page.waitForTimeout(500);

    // Click 'Forgot passphrase?'
    await page.click("button:has-text('Forgot passphrase?')");
    await page.waitForSelector("#recoveryInput", { state: "visible", timeout: 3000 });

    // Test invalid recovery words (12 valid words that do not match the vault key)
    await page.fill("#recoveryInput", "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon");
    await page.click("button:has-text('Recover')");
    await page.waitForTimeout(400);

    const recError = await page.$eval("#recoveryError", el => el.textContent);
    runner.assert(recError.includes("Invalid recovery words") || recError.includes("Words do not match"), "Invalid recovery words rejected with clear error");

    // Test valid recovery words
    await page.fill("#recoveryInput", words.join(" "));
    await page.click("button:has-text('Recover')");
    await page.waitForSelector("#newPassphrase", { state: "visible", timeout: 4000 });

    runner.assert(true, "Valid recovery key advances to 'Set New Passphrase' modal");

    // Test new passphrase validation
    await page.fill("#newPassphrase", "short");
    await page.fill("#newPassphraseConfirm", "short");
    await page.click("button:has-text('Save')");
    await page.waitForTimeout(300);
    const newPassErr1 = await page.$eval("#newPassError", el => el.textContent);
    runner.assert(newPassErr1.includes("at least 8 characters"), "New passphrase requires at least 8 characters");

    await page.fill("#newPassphrase", "brand-new-passphrase-999");
    await page.fill("#newPassphraseConfirm", "brand-new-passphrase-mismatch");
    await page.click("button:has-text('Save')");
    await page.waitForTimeout(300);
    const newPassErr2 = await page.$eval("#newPassError", el => el.textContent);
    runner.assert(newPassErr2.includes("do not match"), "New passphrase confirmation mismatch detected");

    // Set valid new passphrase
    await page.fill("#newPassphrase", "brand-new-passphrase-999");
    await page.fill("#newPassphraseConfirm", "brand-new-passphrase-999");
    await page.click("button:has-text('Save')");
    await page.waitForTimeout(800);

    // Verify vault is unlocked and data is intact
    const noteEl = await page.$("[data-note]");
    runner.assert(!!noteEl, "Vault unlocked successfully after recovery");
    const noteTitle = await page.$eval("[data-note] .tree-name", el => el.textContent);
    runner.assert(noteTitle.includes("Persistent Data"), "Note data decrypted successfully with recovered key");

    // Lock again and verify unlock with the NEW passphrase works
    await page.click("#lockBtn");
    await page.waitForTimeout(500);

    // Old passphrase should now fail
    await page.fill("#unlockPassphrase", initialPassphrase);
    await page.click("button:has-text('Unlock')");
    await page.waitForTimeout(400);
    const oldPassError = await page.$eval("#unlockError", el => el.textContent);
    runner.assert(oldPassError.includes("Incorrect passphrase"), "Old passphrase is now invalid");

    // New passphrase succeeds
    await page.fill("#unlockPassphrase", "brand-new-passphrase-999");
    await page.click("button:has-text('Unlock')");
    await page.waitForTimeout(800);
    const unlockedAgain = await page.$("[data-note]");
    runner.assert(!!unlockedAgain, "Vault unlocks with the newly set passphrase");

    await context.close();
  }

  // === TEST 1.13: Change Passphrase Modal (via Settings) ===
  {
    console.log("\n  [Test 1.13] Change Passphrase Modal via Settings");
    const { context, page } = await setupPage(browser);
    const oldPass = "change-pass-test-1234";
    await completeSetup(page, oldPass);

    // Open Settings
    await page.click("button[title='Settings']");
    await page.waitForSelector(".settings-row", { state: "visible", timeout: 3000 });

    // Click Change passphrase
    await page.click("button:has-text('Change')");
    await page.waitForSelector("#changeCurrentPass", { state: "visible", timeout: 3000 });

    // Validation: Empty current passphrase
    await page.click("#saveNewPassBtn");
    await page.waitForTimeout(200);
    let cpErr = await page.$eval("#changePassError", el => el.textContent);
    runner.assert(cpErr.includes("current passphrase"), "Requires current passphrase");

    // Validation: New passphrase < 8 chars
    await page.fill("#changeCurrentPass", oldPass);
    await page.fill("#changeNewPass", "12345");
    await page.fill("#changeConfirmPass", "12345");
    await page.click("#saveNewPassBtn");
    await page.waitForTimeout(200);
    cpErr = await page.$eval("#changePassError", el => el.textContent);
    runner.assert(cpErr.includes("at least 8 characters"), "New passphrase min 8 chars validated");

    // Validation: Passphrase mismatch
    await page.fill("#changeCurrentPass", oldPass);
    await page.fill("#changeNewPass", "new-strong-password-111");
    await page.fill("#changeConfirmPass", "new-strong-password-222");
    await page.click("#saveNewPassBtn");
    await page.waitForTimeout(200);
    cpErr = await page.$eval("#changePassError", el => el.textContent);
    runner.assert(cpErr.includes("do not match"), "New passphrase mismatch validated");

    // Validation: Wrong current passphrase
    await page.fill("#changeCurrentPass", "wrong-current-pass");
    await page.fill("#changeNewPass", "new-strong-password-111");
    await page.fill("#changeConfirmPass", "new-strong-password-111");
    await page.click("#saveNewPassBtn");
    await page.waitForTimeout(400);
    cpErr = await page.$eval("#changePassError", el => el.textContent);
    runner.assert(cpErr.includes("Current passphrase is incorrect"), "Wrong current passphrase rejected");

    // Success: Change passphrase
    await page.fill("#changeCurrentPass", oldPass);
    await page.fill("#changeNewPass", "new-strong-password-111");
    await page.fill("#changeConfirmPass", "new-strong-password-111");
    await page.click("#saveNewPassBtn");
    await page.waitForTimeout(800);

    const toastMsg = await page.$eval("#toast", el => el.textContent);
    runner.assert(toastMsg.includes("Passphrase updated"), "Passphrase updated toast shown");

    // Lock and verify new passphrase unlocks
    await page.click("#lockBtn");
    await page.waitForTimeout(500);

    await page.fill("#unlockPassphrase", "new-strong-password-111");
    await page.click("button:has-text('Unlock')");
    await page.waitForTimeout(800);

    const unlockedSettings = await page.$eval("#stats", el => el.textContent);
    runner.assert(!unlockedSettings.includes("locked"), "Unlocked with new passphrase after change in settings");

    await context.close();
  }

  // === TEST 1.14: QR Code Mobile Pairing Modal & Setup Options ===
  {
    console.log("\n  [Test 1.14] QR Code Mobile Pairing Modal & Setup Options");
    const { context, page } = await setupPage(browser);

    // 1. Verify Setup screen has QR scan and 12 words buttons
    const scanQrBtnVisible = await page.$eval("button:has-text('Scan QR to Pair')", el => el !== null);
    const restoreWordsBtnVisible = await page.$eval("button:has-text('12 Words')", el => el !== null);
    runner.assert(scanQrBtnVisible, "Setup screen displays '📷 Scan QR to Pair' button");
    runner.assert(restoreWordsBtnVisible, "Setup screen displays '🔄 12 Words' restore button");

    // 2. Complete setup and open QR Pairing Modal
    await completeSetup(page, "qr-test-passphrase-2026");
    await page.evaluate(() => showPairDeviceModal());
    await page.waitForTimeout(400);

    const qrSvgExists = await page.$eval("#modalContainer svg", el => el !== null);
    const qrModalTitle = await page.$eval("#modalContainer h2", el => el.textContent);
    runner.assert(qrSvgExists, "Pairing QR Code SVG generated and rendered in modal");
    runner.assert(qrModalTitle.includes("Pair Mobile Device"), "Pair Mobile Device modal is displayed");

    await context.close();
  }

  return runner.summary();
}

module.exports = { runSuite1 };
