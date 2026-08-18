// Suite 4: Data Portability & Sync Settings
const { setupPage, completeSetup, getIndexedDbStore, TestRunner } = require("./test-helpers");

async function runSuite4(browser) {
  const runner = new TestRunner("Suite 4: Data Portability & Sync Settings");
  console.log("\n=======================================================");
  console.log("  RUNNING SUITE 4: Data Portability & Sync Settings");
  console.log("=======================================================");

  const { context, page } = await setupPage(browser);
  await completeSetup(page, "portability-passphrase-2026");

  // Create test folder and notes
  await page.click("button[title='New folder']");
  await page.waitForSelector("#modalPromptInput", { state: "visible", timeout: 3000 });
  await page.fill("#modalPromptInput", "Financial Documents");
  await page.click("#modalConfirmBtn");
  await page.waitForTimeout(400);

  const folderEl = await page.$("[data-folder]:has-text('Financial Documents')");
  const folderId = await folderEl.getAttribute("data-folder");

  await page.click("button:has-text('+ New')");
  await page.waitForTimeout(300);
  await page.fill("#editor", "# Q4 Budget Plan\nProjected revenue and expenses.");
  await page.waitForTimeout(700);

  // === TEST 4.1: Plain JSON Export Data Structure ===
  console.log("\n  [Test 4.1] Plain JSON Export");
  const vaultPlain = await page.evaluate(async () => {
    return getVaultJSON();
  });

  runner.assertEq(vaultPlain.version, 2, "Export schema version is 2");
  runner.assert(Array.isArray(vaultPlain.folders) && vaultPlain.folders.length === 1, "Export contains created folders");
  runner.assert(Array.isArray(vaultPlain.notes) && vaultPlain.notes.length === 1, "Export contains decrypted notes");
  runner.assertEq(vaultPlain.notes[0].title, "Q4 Budget Plan", "Notes are exported as readable plaintext");

  // === TEST 4.2: Plain JSON Import Roundtrip & Merge ===
  console.log("\n  [Test 4.2] Plain JSON Import Roundtrip & Merge");
  const importPayload = {
    version: 2,
    folders: [
      { id: "imp-f1", name: "Imported Folder", parentId: null, createdAt: Date.now(), updatedAt: Date.now() }
    ],
    notes: [
      { id: "imp-n1", folderId: "imp-f1", title: "Imported Architecture Note", content: "Imported note body", format: "markdown", customTitle: true, createdAt: Date.now(), updatedAt: Date.now() }
    ]
  };

  await page.evaluate(async (data) => {
    await mergeVault(data);
  }, importPayload);
  await page.waitForTimeout(500);

  const importedFolder = await page.$("[data-folder]:has-text('Imported Folder')");
  runner.assert(!!importedFolder, "Imported folder rendered in tree");

  const importedNote = await page.$("[data-note]:has-text('Imported Architecture Note')");
  runner.assert(!!importedNote, "Imported note rendered in tree");

  // === TEST 4.3: Encrypted JSON Export Structure ===
  console.log("\n  [Test 4.3] Encrypted JSON Export");
  const encExport = await page.evaluate(async () => {
    const vault = await getVaultJSON();
    const plaintext = JSON.stringify(vault);
    const encrypted = await encryptAES(recoveryKey, plaintext);
    return { v: 1, iv: encrypted.iv, data: encrypted.ciphertext };
  });

  runner.assertEq(encExport.v, 1, "Encrypted export has version 1 wrapper");
  runner.assert(Array.isArray(encExport.iv) && encExport.iv.length === 12, "Encrypted export includes 12-byte AES-GCM IV");
  runner.assert(Array.isArray(encExport.data) && encExport.data.length > 0, "Encrypted export includes ciphertext data");

  // Verify that raw export string does NOT contain plain text note titles
  const encExportJsonStr = JSON.stringify(encExport);
  runner.assert(!encExportJsonStr.includes("Q4 Budget Plan"), "Encrypted export contains ZERO plaintext strings");

  // === TEST 4.4: Encrypted JSON Import Roundtrip ===
  console.log("\n  [Test 4.4] Encrypted JSON Import Roundtrip");
  // Decrypt and merge using active recoveryKey
  const encImportSuccess = await page.evaluate(async (encData) => {
    try {
      const decryptedStr = await decryptAES(recoveryKey, { iv: encData.iv, ciphertext: encData.data });
      const parsedVault = JSON.parse(decryptedStr);
      await mergeVault(parsedVault);
      return true;
    } catch (e) {
      return false;
    }
  }, encExport);

  runner.assert(encImportSuccess, "Encrypted backup successfully decrypted and merged with recovery key");

  // === TEST 4.5: Settings Modal Inspection ===
  console.log("\n  [Test 4.5] Settings Modal Inspection");
  await page.click("button[title='Settings']");
  await page.waitForSelector(".settings-row", { state: "visible", timeout: 3000 });

  const rows = await page.$$eval(".settings-row label", els => els.map(e => e.textContent.trim()));
  runner.assert(rows.includes("GitHub Token"), "Settings contains 'GitHub Token' row");
  runner.assert(rows.includes("Gist ID"), "Settings contains 'Gist ID' row");
  runner.assert(rows.includes("Auto-sync"), "Settings contains 'Auto-sync' row");
  runner.assert(rows.includes("Export vault"), "Settings contains 'Export vault' row");
  runner.assert(rows.includes("Import vault"), "Settings contains 'Import vault' row");
  runner.assert(rows.includes("Change passphrase"), "Settings contains 'Change passphrase' row");

  // === TEST 4.6: GitHub Personal Access Token Modal ===
  console.log("\n  [Test 4.6] GitHub Token Management");
  await page.click(".settings-row:has-text('GitHub Token') button");
  await page.waitForSelector("#githubTokenInput", { state: "visible", timeout: 3000 });

  await page.fill("#githubTokenInput", "ghp_MockPersonalAccessTokenSecret12345");
  await page.click("button:has-text('Save Token')");
  await page.waitForTimeout(500);

  // Check token is encrypted at rest in IndexedDB
  const settingsStore = await getIndexedDbStore(page, "settings");
  const encTokRecord = settingsStore.find(s => s.key === "github_token_encrypted");
  runner.assert(!!encTokRecord, "GitHub token is stored in settings object store");
  runner.assert(!encTokRecord.value.includes("ghp_MockPersonalAccessTokenSecret12345"), "GitHub token is AES-GCM encrypted (never plaintext at rest)");

  // Re-open settings and remove token
  await page.click("button[title='Settings']");
  await page.waitForSelector(".settings-row", { state: "visible", timeout: 3000 });
  await page.click(".settings-row:has-text('GitHub Token') button");
  await page.waitForSelector("button:has-text('Remove')", { state: "visible", timeout: 3000 });
  await page.click("button:has-text('Remove')");
  await page.waitForTimeout(400);

  const updatedSettingsStore = await getIndexedDbStore(page, "settings");
  const removedTokRecord = updatedSettingsStore.find(s => s.key === "github_token_encrypted");
  runner.assert(!removedTokRecord, "GitHub token removed cleanly from IndexedDB");

  // === TEST 4.7: Gist ID Linking Modal ===
  console.log("\n  [Test 4.7] Gist ID Linking Modal");
  await page.click("button[title='Settings']");
  await page.waitForSelector(".settings-row", { state: "visible", timeout: 3000 });

  await page.click(".settings-row:has-text('Gist ID') button");
  await page.waitForSelector("#modalPromptInput", { state: "visible", timeout: 3000 });

  await page.fill("#modalPromptInput", "a1b2c3d4e5f6789012345678abcdef01");
  await page.click("#modalConfirmBtn");
  await page.waitForTimeout(500);

  const settingsStoreAfterGist = await getIndexedDbStore(page, "settings");
  const gistRecord = settingsStoreAfterGist.find(s => s.key === "gist_id");
  runner.assert(gistRecord && gistRecord.value === "a1b2c3d4e5f6789012345678abcdef01", "Gist ID linked and persisted in IndexedDB");

  // === TEST 4.8: Auto-Sync Toggle ===
  console.log("\n  [Test 4.8] Auto-Sync Toggle");
  const autoSyncBtn = await page.$(".settings-row:has-text('Auto-sync') button");
  const initialAutoSyncState = await autoSyncBtn.textContent();
  
  await autoSyncBtn.click();
  await page.waitForTimeout(400);

  const newAutoSyncState = await page.$eval(".settings-row:has-text('Auto-sync') button", el => el.textContent);
  runner.assert(initialAutoSyncState !== newAutoSyncState, "Auto-sync toggle changes state between On and Off");

  await page.click(".modal-actions button:has-text('Close')");
  await page.waitForTimeout(300);

  // === TEST 4.9: Sync Status Indicator ===
  console.log("\n  [Test 4.9] Sync Status Indicator");
  const indicator = await page.$("#syncIndicator");
  runner.assert(!!indicator, "Sync status indicator exists in toolbar");

  const syncLabel = await page.$eval("#syncLabel", el => el.textContent);
  runner.assert(syncLabel.length > 0, "Sync indicator displays readable status: " + syncLabel);

  await context.close();
  return runner.summary();
}

module.exports = { runSuite4 };
