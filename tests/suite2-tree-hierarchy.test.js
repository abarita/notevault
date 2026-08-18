// Suite 2: Notes & Folder Tree Hierarchy
const { setupPage, completeSetup, getIndexedDbStore, TestRunner } = require("./test-helpers");

async function runSuite2(browser) {
  const runner = new TestRunner("Suite 2: Notes & Folder Tree Hierarchy");
  console.log("\n=======================================================");
  console.log("  RUNNING SUITE 2: Notes & Folder Tree Hierarchy");
  console.log("=======================================================");

  const { context, page } = await setupPage(browser);
  await completeSetup(page, "tree-hierarchy-passphrase-2026");

  // === TEST 2.1: Create Note via + New Button & Auto-titling ===
  console.log("\n  [Test 2.1] Create Note & Auto-titling");
  await page.click("button:has-text('+ New')");
  await page.waitForTimeout(300);

  let notes = await page.$$("[data-note]");
  runner.assertEq(notes.length, 1, "One note created in sidebar");

  await page.fill("#editor", "# Engineering Specs\nSystem architecture details.");
  await page.waitForTimeout(700); // allow debounced save

  let noteTitle = await page.$eval("[data-note] .tree-name", el => el.textContent);
  runner.assert(noteTitle.includes("Engineering Specs"), "Note title automatically derived from first header line");

  // === TEST 2.2: Custom Renaming via Context Menu & In-App Modal ===
  console.log("\n  [Test 2.2] Custom Renaming via Context Menu");
  const firstNote = await page.$("[data-note]");
  await firstNote.click({ button: "right" });
  await page.waitForSelector("#contextMenu", { state: "visible", timeout: 3000 });

  await page.click("#contextMenu .context-menu-item:has-text('Rename')");
  await page.waitForSelector("#modalPromptInput", { state: "visible", timeout: 3000 });

  await page.fill("#modalPromptInput", "Custom Architectural Blueprint");
  await page.click("#modalConfirmBtn");
  await page.waitForTimeout(400);

  noteTitle = await page.$eval("[data-note] .tree-name", el => el.textContent);
  runner.assert(noteTitle.includes("Custom Architectural Blueprint"), "Note custom title updated in tree");

  // Change content and ensure custom title is preserved
  await page.fill("#editor", "# Changed Header\nContent updated here.");
  await page.waitForTimeout(700);
  noteTitle = await page.$eval("[data-note] .tree-name", el => el.textContent);
  runner.assert(noteTitle.includes("Custom Architectural Blueprint"), "Custom title preserved even when content changes");

  // === TEST 2.3: Nested Folders 3 Levels Deep ===
  console.log("\n  [Test 2.3] Nested Folders 3 Levels Deep");
  // 1. Create Root Folder "Project A"
  await page.click("button[title='New folder']");
  await page.waitForSelector("#modalPromptInput", { state: "visible", timeout: 3000 });
  await page.fill("#modalPromptInput", "Project Alpha");
  await page.click("#modalConfirmBtn");
  await page.waitForTimeout(500);

  let folderAlpha = await page.$("[data-folder]");
  runner.assert(!!folderAlpha, "Root Folder 'Project Alpha' created");
  const alphaId = await folderAlpha.getAttribute("data-folder");

  // 2. Create Subfolder Level 2 inside Project Alpha
  await folderAlpha.click({ button: "right" });
  await page.waitForSelector("#contextMenu", { state: "visible", timeout: 3000 });
  await page.click("#contextMenu .context-menu-item:has-text('New subfolder')");
  await page.waitForSelector("#modalPromptInput", { state: "visible", timeout: 3000 });
  await page.fill("#modalPromptInput", "Backend Services");
  await page.click("#modalConfirmBtn");
  await page.waitForTimeout(500);

  // Expand parent if needed
  let folderBackend = await page.$("[data-folder]:has-text('Backend Services')");
  runner.assert(!!folderBackend, "Subfolder Level 2 'Backend Services' created");
  const backendId = await folderBackend.getAttribute("data-folder");

  // 3. Create Subfolder Level 3 inside Backend Services
  await folderBackend.click({ button: "right" });
  await page.waitForSelector("#contextMenu", { state: "visible", timeout: 3000 });
  await page.click("#contextMenu .context-menu-item:has-text('New subfolder')");
  await page.waitForSelector("#modalPromptInput", { state: "visible", timeout: 3000 });
  await page.fill("#modalPromptInput", "Database Layer");
  await page.click("#modalConfirmBtn");
  await page.waitForTimeout(500);

  let folderDb = await page.$("[data-folder]:has-text('Database Layer')");
  runner.assert(!!folderDb, "Subfolder Level 3 'Database Layer' created 3 levels deep");

  // === TEST 2.4: Create Note in Specific Subfolder via Folder Action Button ===
  await folderDb.hover();
  await folderDb.$eval("button[title='Add note']", btn => btn.click());
  await page.waitForTimeout(500);
  await page.fill("#editor", "# Postgres Configuration\nHost: localhost:5432");
  await page.waitForTimeout(700);

  const notesInDb = await page.$$("[data-note]:has-text('Postgres Configuration')");
  runner.assert(notesInDb.length > 0, "Note created directly inside Level 3 subfolder");

  // === TEST 2.5: Rename Folder via Context Menu ===
  console.log("\n  [Test 2.5] Rename Folder via Context Menu");
  folderBackend = await page.$("[data-folder]:has-text('Backend Services')");
  await folderBackend.click({ button: "right" });
  await page.waitForSelector("#contextMenu", { state: "visible", timeout: 3000 });
  await page.click("#contextMenu .context-menu-item:has-text('Rename')");
  await page.waitForSelector("#modalPromptInput", { state: "visible", timeout: 3000 });

  await page.fill("#modalPromptInput", "Microservices Architecture");
  await page.click("#modalConfirmBtn");
  await page.waitForTimeout(500);

  const renamedFolder = await page.$("[data-folder]:has-text('Microservices Architecture')");
  runner.assert(!!renamedFolder, "Folder renamed to 'Microservices Architecture'");

  // === TEST 2.6: Folder Expand / Collapse Toggling ===
  console.log("\n  [Test 2.6] Folder Expand / Collapse Toggling");
  
  // Collapse
  await page.click(`#tree-folder-${alphaId} .tree-arrow`);
  await page.waitForTimeout(300);
  let isCollapsed = await page.$eval(`#tree-children-${alphaId}`, el => el.className);
  runner.assert(isCollapsed.includes("collapsed"), "Folder children collapsed upon clicking arrow");

  // Expand
  await page.click(`#tree-folder-${alphaId} .tree-arrow`);
  await page.waitForTimeout(300);
  let isExpanded = await page.$eval(`#tree-children-${alphaId}`, el => el.className);
  runner.assert(!isExpanded.includes("collapsed"), "Folder children expanded upon clicking arrow again");

  // === TEST 2.7: Keyboard Shortcuts (Ctrl+S, Ctrl+N, Ctrl+Shift+F, Ctrl+K) ===
  console.log("\n  [Test 2.7] Keyboard Shortcuts");
  // 1. Ctrl+K (focus search)
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(200);
  const searchFocused = await page.evaluate(() => document.activeElement.id === "searchInput");
  runner.assert(searchFocused, "Ctrl+K successfully focuses #searchInput");

  // 2. Ctrl+Shift+F (create root folder)
  await page.keyboard.press("Control+Shift+KeyF");
  await page.waitForTimeout(300);
  let promptVisible = await page.$eval("#modalContainer", el => el.innerHTML.includes("New Root Folder"));
  runner.assert(promptVisible, "Ctrl+Shift+F opens New Root Folder modal");
  await page.click("#modalCancelBtn");
  await page.waitForTimeout(300);

  // 3. Ctrl+N (create new note)
  await page.keyboard.press("Control+KeyN");
  await page.waitForTimeout(500);
  await page.fill("#editor", "# Hotkey Created Note\nCreated via Ctrl+N.");
  
  // 4. Ctrl+S (save current note immediately)
  await page.keyboard.press("Control+KeyS");
  await page.waitForTimeout(300);
  const hotkeyNote = await page.$("[data-note]:has-text('Hotkey Created Note')");
  runner.assert(!!hotkeyNote, "Ctrl+N created note and Ctrl+S triggered immediate save");

  // === TEST 2.8: Real-Time Search Filtering ===
  console.log("\n  [Test 2.8] Search Filtering in Tree Hierarchy");
  await page.fill("#searchInput", "Postgres");
  await page.waitForTimeout(400);

  let visibleNotes = await page.$$("[data-note]");
  runner.assertEq(visibleNotes.length, 1, "Search filtered list down to 1 matching note");
  let matchName = await visibleNotes[0].$eval(".tree-name", el => el.textContent);
  runner.assert(matchName.includes("Postgres Configuration"), "Search matches note title");

  // Search by note content
  await page.fill("#searchInput", "localhost:5432");
  await page.waitForTimeout(400);
  visibleNotes = await page.$$("[data-note]");
  runner.assertEq(visibleNotes.length, 1, "Search matches text in note body");

  // Clear search
  await page.fill("#searchInput", "");
  await page.waitForTimeout(400);
  visibleNotes = await page.$$("[data-note]");
  runner.assert(visibleNotes.length >= 3, "Clearing search restores all notes");

  // === TEST 2.9: Move Folder with Circular Prevention ===
  console.log("\n  [Test 2.9] Move Folder & Circular Prevention");
  folderAlpha = await page.$("[data-folder]:has-text('Project Alpha')");
  await folderAlpha.click({ button: "right" });
  await page.waitForSelector("#contextMenu", { state: "visible", timeout: 3000 });
  await page.click("#contextMenu .context-menu-item:has-text('Move')");
  await page.waitForSelector(".modal h2:has-text('Move folder to')", { state: "visible", timeout: 3000 });

  // Verify that Project Alpha and its descendants (Microservices, Database Layer) are NOT listed as valid targets
  const modalTargets = await page.$$eval(".modal .context-menu-item", els => els.map(e => e.textContent.trim()));
  runner.assert(!modalTargets.some(t => t.includes("Microservices Architecture") || t.includes("Database Layer")), 
    "Circular prevention: Descendants are excluded from move folder target list");
  await page.click(".modal-actions button:has-text('Cancel')");
  await page.waitForTimeout(300);

  // === TEST 2.10: Move Note via Modal (Root -> Folder & Folder -> Root) ===
  console.log("\n  [Test 2.10] Move Note via Modal (Root -> Folder & Folder -> Root)");
  const noteToMove = await page.$("[data-note]:has-text('Hotkey Created Note')");
  await noteToMove.click({ button: "right" });
  await page.waitForSelector("#contextMenu", { state: "visible", timeout: 3000 });
  await page.click("#contextMenu .context-menu-item:has-text('Move to folder')");
  await page.waitForSelector(".modal h2:has-text('Move note to')", { state: "visible", timeout: 3000 });

  // 1. Move from Root to Project Alpha
  await page.click(".modal .context-menu-item:has-text('Project Alpha')");
  await page.waitForTimeout(500);

  let movedNoteInAlpha = await page.$(`#tree-children-${alphaId} [data-note]:has-text('Hotkey Created Note')`);
  runner.assert(!!movedNoteInAlpha, "Note successfully moved from Root into Project Alpha folder via Modal");

  // 2. Move from Project Alpha back to Root (uncategorized)
  movedNoteInAlpha = await page.$(`#tree-children-${alphaId} [data-note]:has-text('Hotkey Created Note')`);
  await movedNoteInAlpha.click({ button: "right" });
  await page.waitForSelector("#contextMenu", { state: "visible", timeout: 3000 });
  await page.click("#contextMenu .context-menu-item:has-text('Move to folder')");
  await page.waitForSelector(".modal h2:has-text('Move note to')", { state: "visible", timeout: 3000 });

  await page.click(".modal .context-menu-item:has-text('Root (uncategorized)')");
  await page.waitForTimeout(500);

  const noteBackAtRoot = await page.$(`[data-note]:has-text('Hotkey Created Note')`);
  const notInAlpha = await page.$(`#tree-children-${alphaId} [data-note]:has-text('Hotkey Created Note')`);
  runner.assert(!!noteBackAtRoot && !notInAlpha, "Note successfully moved back from folder to Root via Modal");

  // === TEST 2.11: Move Note via HTML5 Drag and Drop (Root -> Folder & Folder -> Root) ===
  console.log("\n  [Test 2.11] Move Note via Drag and Drop (Root -> Folder & Folder -> Root)");
  const noteDrag = await page.$("[data-note]:has-text('Custom Architectural Blueprint')");
  const noteId = await noteDrag.getAttribute("data-note");

  // 1. Drag & Drop from Root into Project Alpha folder
  await page.evaluate(({ nid, fid }) => {
    const noteEl = document.querySelector(`[data-note="${nid}"]`);
    const folderEl = document.querySelector(`[data-folder="${fid}"]`);
    const dt = new DataTransfer();
    noteEl.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true }));
    folderEl.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true }));
    folderEl.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true }));
  }, { nid: noteId, fid: alphaId });
  await page.waitForTimeout(600);

  const noteInAlphaAfterDrag = await page.$(`#tree-children-${alphaId} [data-note="${noteId}"]`);
  runner.assert(!!noteInAlphaAfterDrag, "Note successfully moved from Root into folder via Drag and Drop");

  // 2. Drag & Drop from Project Alpha folder back to Root container (#folderTree)
  await page.evaluate(({ nid }) => {
    const noteEl = document.querySelector(`[data-note="${nid}"]`);
    const treeEl = document.querySelector("#folderTree");
    const dt = new DataTransfer();
    noteEl.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true }));
    treeEl.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true }));
    treeEl.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true }));
  }, { nid: noteId });
  await page.waitForTimeout(600);

  const dragNoteBackAtRoot = await page.$(`[data-note="${noteId}"]`);
  const dragNotInAlpha = await page.$(`#tree-children-${alphaId} [data-note="${noteId}"]`);
  runner.assert(!!dragNoteBackAtRoot && !dragNotInAlpha, "Note successfully moved back from folder to Root via Drag and Drop");

  // === TEST 2.12: Delete Note with Confirm Modal ===
  console.log("\n  [Test 2.12] Delete Note with Confirm Modal");
  const noteToDelete = await page.$("[data-note]:has-text('Hotkey Created Note')");
  await noteToDelete.click({ button: "right" });
  await page.waitForSelector("#contextMenu", { state: "visible", timeout: 3000 });
  await page.click("#contextMenu .context-menu-item:has-text('Delete note')");
  await page.waitForSelector("#confirmModalOverlay", { state: "visible", timeout: 3000 });

  await page.click("#modalConfirmBtn");
  await page.waitForTimeout(500);

  const deletedCheck = await page.$("[data-note]:has-text('Hotkey Created Note')");
  runner.assert(!deletedCheck, "Note deleted permanently after modal confirmation");

  // === TEST 2.13: Delete Folder Cascades Recursively ===
  console.log("\n  [Test 2.13] Delete Folder Cascades Recursively");
  folderAlpha = await page.$("[data-folder]:has-text('Project Alpha')");
  await folderAlpha.click({ button: "right" });
  await page.waitForSelector("#contextMenu", { state: "visible", timeout: 3000 });
  await page.click("#contextMenu .context-menu-item:has-text('Delete')");
  await page.waitForSelector("#confirmModalOverlay", { state: "visible", timeout: 3000 });

  const confirmMsg = await page.$eval("#confirmModalOverlay p", el => el.textContent);
  runner.assert(confirmMsg.includes("Delete folder"), "Delete folder confirmation dialog displays cascade warning");

  await page.click("#modalConfirmBtn");
  await page.waitForTimeout(600);

  const alphaCheck = await page.$("[data-folder]:has-text('Project Alpha')");
  runner.assert(!alphaCheck, "Project Alpha and all nested children deleted cleanly");

  const nestedNoteCheck = await page.$("[data-note]:has-text('Postgres Configuration')");
  runner.assert(!nestedNoteCheck, "Nested notes inside deleted subfolders are removed");

  const rootNoteCheck = await page.$(`[data-note="${noteId}"]`);
  runner.assert(!!rootNoteCheck, "Root notes outside deleted folder hierarchy are safely preserved");

  // === TEST 2.14: Full Name Hover Tooltips on Long Titles ===
  console.log("\n  [Test 2.14] Full Name Hover Tooltips on Long Titles");
  await page.click("button:has-text('+ New')");
  await page.waitForTimeout(300);
  const longTitle = "A Very Long Project Specification Document That Exceeds Normal Bounds";
  await page.fill("#editor", "# " + longTitle + "\nDetailed specifications.");
  await page.keyboard.press("Control+KeyS");
  await page.waitForTimeout(500);

  const longNoteEl = await page.waitForSelector("[data-note]:has-text('A Very Long')", { state: "visible", timeout: 3000 });
  const itemTitleAttr = await longNoteEl.getAttribute("title");
  const nameTitleAttr = await longNoteEl.$eval(".tree-name", el => el.getAttribute("title"));
  runner.assert(itemTitleAttr === longTitle, "Note item has full name tooltip title attribute");
  runner.assert(nameTitleAttr === longTitle, "Note .tree-name has full name tooltip title attribute");

  // === TEST 2.15: Resizable Navigator / Explorer Splitter ===
  console.log("\n  [Test 2.15] Resizable Navigator / Explorer Splitter");
  const sidebarResizer = await page.waitForSelector("#sidebarResizer", { state: "attached", timeout: 3000 });
  runner.assert(!!sidebarResizer, "#sidebarResizer DOM element exists");

  // Drag sidebar resizer to 380px
  const resizerBox = await sidebarResizer.boundingBox();
  await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(380, resizerBox.y + 100);
  await page.mouse.up();
  await page.waitForTimeout(300);

  let sidebarWidth = await page.$eval("#sidebar", el => parseInt(window.getComputedStyle(el).width, 10));
  runner.assert(sidebarWidth >= 370 && sidebarWidth <= 390, "Sidebar width resized via drag (Current: " + sidebarWidth + "px)");

  // Double click sidebar resizer to reset to 300px
  await sidebarResizer.dblclick();
  await page.waitForTimeout(300);
  sidebarWidth = await page.$eval("#sidebar", el => parseInt(window.getComputedStyle(el).width, 10));
  runner.assert(sidebarWidth >= 290 && sidebarWidth <= 310, "Sidebar width reset to default 300px on double-click");

  // === TEST 2.16: Resizable Editor vs Preview Splitter ===
  console.log("\n  [Test 2.16] Resizable Editor vs Preview Splitter");
  const contentResizer = await page.waitForSelector("#contentResizer", { state: "attached", timeout: 3000 });
  runner.assert(!!contentResizer, "#contentResizer DOM element exists");

  // Drag content resizer
  const contentResizerBox = await contentResizer.boundingBox();
  await page.mouse.move(contentResizerBox.x + contentResizerBox.width / 2, contentResizerBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(contentResizerBox.x + 80, contentResizerBox.y + 100);
  await page.mouse.up();
  await page.waitForTimeout(300);

  let editorWidthPct = await page.$eval("#editorPane", el => parseFloat(el.style.width));
  runner.assert(editorWidthPct > 52, "Editor pane ratio resized via drag (Current: " + editorWidthPct + "%)");

  // Double click content resizer to reset to 50%
  await contentResizer.dblclick();
  await page.waitForTimeout(300);
  editorWidthPct = await page.$eval("#editorPane", el => parseFloat(el.style.width));
  runner.assert(editorWidthPct === 50, "Editor pane split reset to 50% on double-click");

  await context.close();
  return runner.summary();
}

module.exports = { runSuite2 };
