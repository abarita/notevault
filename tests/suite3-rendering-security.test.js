// Suite 3: Multi-Format Rendering, JSON Interactive Tree & Security
const { setupPage, completeSetup, TestRunner } = require("./test-helpers");

async function runSuite3(browser) {
  const runner = new TestRunner("Suite 3: Multi-Format Rendering, JSON Tree & Security");
  console.log("\n=======================================================");
  console.log("  RUNNING SUITE 3: Multi-Format Rendering, JSON Tree & Security");
  console.log("=======================================================");

  const { context, page } = await setupPage(browser);
  await completeSetup(page, "rendering-security-passphrase-2026");

  // Create test note
  await page.click("button:has-text('+ New')");
  await page.waitForTimeout(300);

  // === TEST 3.1: Format Auto-Detection ===
  console.log("\n  [Test 3.1] Format Auto-Detection");
  // 1. Markdown auto-detection
  await page.fill("#editor", "# Markdown Title\n- bullet point\n> quote block");
  await page.waitForTimeout(300);
  let detectedText = await page.$eval("#detectedFormat", el => el.textContent);
  runner.assert(detectedText.includes("markdown"), "Auto-detects Markdown syntax");

  // 2. JSON auto-detection
  await page.fill("#editor", '{"service":"notevault","version":2.0,"active":true}');
  await page.waitForTimeout(300);
  detectedText = await page.$eval("#detectedFormat", el => el.textContent);
  runner.assert(detectedText.includes("json"), "Auto-detects JSON object syntax");

  // 3. XML auto-detection
  await page.fill("#editor", '<?xml version="1.0"?><note><to>User</to><from>NoteVault</from></note>');
  await page.waitForTimeout(300);
  detectedText = await page.$eval("#detectedFormat", el => el.textContent);
  runner.assert(detectedText.includes("xml"), "Auto-detects XML syntax");

  // 4. Plain Text auto-detection
  await page.fill("#editor", "Just a plain everyday note without special formatting.");
  await page.waitForTimeout(300);
  detectedText = await page.$eval("#detectedFormat", el => el.textContent);
  runner.assert(detectedText.includes("text"), "Auto-detects Plain Text");

  // === TEST 3.2: Format Selector Manual Override ===
  console.log("\n  [Test 3.2] Format Selector Manual Override");
  await page.selectOption("#formatSelect", "markdown");
  await page.waitForTimeout(300);
  detectedText = await page.$eval("#detectedFormat", el => el.textContent);
  runner.assert(detectedText.includes("markdown"), "Manual override to Markdown respected");

  // === TEST 3.3: Markdown GFM Comprehensive Rendering ===
  console.log("\n  [Test 3.3] Markdown GFM Rendering Features");
  const markdownSample = `
# Main Header H1
## Sub Header H2
### Section H3

This is **bold text**, *italic text*, and \`inline code\`.

> Security is not an afterthought.

| Feature | Status | Grade |
| :--- | :--- | :--- |
| End-to-End Encryption | Active | A+ |
| Zero-Knowledge | Active | A+ |

\`\`\`javascript
function calculateEntropy(passphrase) {
  return passphrase.length * 4;
}
\`\`\`

- [x] Passphrase validation
- [x] Recovery words verification
- [ ] Cross-device sync

[Visit GitHub](https://github.com/abarita/notevault)
`;
  await page.fill("#editor", markdownSample);
  await page.waitForTimeout(500);

  const h1 = await page.$(".preview-content h1");
  const h2 = await page.$(".preview-content h2");
  const h3 = await page.$(".preview-content h3");
  const bold = await page.$(".preview-content strong");
  const italic = await page.$(".preview-content em");
  const inlineCode = await page.$(".preview-content code");
  const blockquote = await page.$(".preview-content blockquote");
  const table = await page.$(".preview-content table");
  const preCode = await page.$(".preview-content pre code");
  const link = await page.$(".preview-content a[href='https://github.com/abarita/notevault']");

  runner.assert(!!h1 && !!h2 && !!h3, "Renders H1, H2, and H3 headers");
  runner.assert(!!bold && !!italic && !!inlineCode, "Renders Bold, Italic, and Inline Code");
  runner.assert(!!blockquote, "Renders Blockquotes");
  runner.assert(!!table, "Renders GFM Markdown Tables");
  runner.assert(!!preCode, "Renders Syntax Code Blocks");
  runner.assert(!!link, "Renders standard Links");

  // === TEST 3.4: DOMPurify XSS Defense & Security Vectors ===
  console.log("\n  [Test 3.4] DOMPurify XSS Defense");
  const xssPayload = `
# XSS Security Test
<script>window.XSS_DETECTED_SCRIPT = true;</script>
<img src="invalid-image-url.jpg" onerror="window.XSS_DETECTED_IMG = true;" />
<svg onload="window.XSS_DETECTED_SVG = true;"><circle r="10"/></svg>
<iframe src="javascript:window.XSS_DETECTED_IFRAME = true;"></iframe>
<a href="javascript:window.XSS_DETECTED_A = true;">Malicious Link</a>
`;
  await page.fill("#editor", xssPayload);
  await page.waitForTimeout(600);

  // Inspect DOM in preview
  const scriptTagInPreview = await page.$(".preview-content script");
  runner.assert(!scriptTagInPreview, "DOMPurify stripped malicious <script> tag");

  const xssExecuted = await page.evaluate(() => {
    return !!(window.XSS_DETECTED_SCRIPT || window.XSS_DETECTED_IMG || window.XSS_DETECTED_SVG || window.XSS_DETECTED_IFRAME || window.XSS_DETECTED_A);
  });
  runner.assert(!xssExecuted, "Zero XSS vectors executed; application security boundary intact");

  // === TEST 3.5: JSON Interactive Tree Rendering ===
  console.log("\n  [Test 3.5] JSON Interactive Tree Rendering & Syntax Highlighting");
  const jsonSample = JSON.stringify({
    appName: "NoteVault",
    version: 2.1,
    isEncrypted: true,
    metadata: null,
    settings: {
      theme: "dark",
      iterations: 600000,
      tags: ["security", "crypto", "privacy"]
    },
    users: [
      { id: "u1", name: "Alice", role: "admin" },
      { id: "u2", name: "Bob", role: "auditor" }
    ]
  }, null, 2);

  await page.fill("#editor", jsonSample);
  await page.selectOption("#formatSelect", "json");
  await page.waitForTimeout(500);

  const jsonTree = await page.$("#jsonTreeContainer .json-tree");
  runner.assert(!!jsonTree, "JSON Tree container rendered");

  const keyElements = await page.$$(".json-key-name");
  const stringElements = await page.$$(".json-val-string");
  const numberElements = await page.$$(".json-val-number");
  const boolElements = await page.$$(".json-val-bool");
  const nullElements = await page.$$(".json-val-null");

  runner.assert(keyElements.length > 0, "Color-coded JSON keys rendered (.json-key-name)");
  runner.assert(stringElements.length > 0, "Color-coded JSON strings rendered (.json-val-string)");
  runner.assert(numberElements.length > 0, "Color-coded JSON numbers rendered (.json-val-number)");
  runner.assert(boolElements.length > 0, "Color-coded JSON booleans rendered (.json-val-bool)");
  runner.assert(nullElements.length > 0, "Color-coded JSON null values rendered (.json-val-null)");

  // === TEST 3.6: JSON Interactive Expand / Collapse ===
  console.log("\n  [Test 3.6] JSON Expand / Collapse Interaction");
  const toggleBtn = await page.$(".json-toggle");
  runner.assert(!!toggleBtn, "JSON nodes have interactive expand/collapse toggles");

  // Toggle first object collapse
  await page.click(".json-toggle");
  await page.waitForTimeout(300);
  let toggleText = await page.$eval(".json-toggle", el => el.textContent);
  runner.assert(toggleText.includes("▶"), "Toggle arrow changes to collapsed state (▶)");

  // Toggle back to expand
  await page.click(".json-toggle");
  await page.waitForTimeout(300);
  toggleText = await page.$eval(".json-toggle", el => el.textContent);
  runner.assert(toggleText.includes("▼"), "Toggle arrow changes to expanded state (▼)");

  // === TEST 3.7: JSON Filter Search & Mark Highlighting ===
  console.log("\n  [Test 3.7] JSON Filter Search & Mark Highlighting");
  const jsonFilterInput = await page.$("#jsonFilter");
  runner.assert(!!jsonFilterInput, "JSON filter search input rendered");

  await page.fill("#jsonFilter", "Alice");
  await page.waitForTimeout(300);

  const filterCountText = await page.$eval("#filterCount", el => el.textContent);
  runner.assert(filterCountText.includes("of"), "Filter result counter displays matching count");

  const markEls = await page.$$(".json-tree mark");
  runner.assert(markEls.length > 0, "Search query highlighted with <mark> tags");
  const markContent = await markEls[0].textContent();
  runner.assertEq(markContent, "Alice", "<mark> contains matching text");

  // Clear filter
  await page.fill("#jsonFilter", "");
  await page.waitForTimeout(300);
  const markElsAfterClear = await page.$$(".json-tree mark");
  runner.assertEq(markElsAfterClear.length, 0, "Clearing filter removes all <mark> highlights");

  // === TEST 3.8: JSON Copy Path ===
  console.log("\n  [Test 3.8] JSON Copy Path Interaction");
  await page.evaluate(() => {
    const cp = document.querySelector(".json-copy-path");
    if (cp) cp.click();
  });
  await page.waitForTimeout(300);
  const toastMsg = await page.$eval("#toast", el => el.textContent);
  runner.assert(toastMsg.includes("Path copied"), "Clicking copy path displays 'Path copied' toast");

  // === TEST 3.9: XML Syntax Highlighting ===
  console.log("\n  [Test 3.9] XML Syntax Highlighting");
  const xmlSample = `<?xml version="1.0" encoding="UTF-8"?>
<vault name="NoteVault" status="secure">
  <entry id="101" format="markdown">
    <title>Secure Entry</title>
  </entry>
</vault>`;
  await page.fill("#editor", xmlSample);
  await page.selectOption("#formatSelect", "xml");
  await page.waitForTimeout(400);

  const xmlKeys = await page.$$(".preview-content .xml-key");
  const xmlAttrs = await page.$$(".preview-content .xml-attr");
  const xmlStrings = await page.$$(".preview-content .xml-string");
  const xmlBrackets = await page.$$(".preview-content .xml-bracket");

  runner.assert(xmlKeys.length > 0, "XML tags highlighted with .xml-key");
  runner.assert(xmlAttrs.length > 0, "XML attributes highlighted with .xml-attr");
  runner.assert(xmlStrings.length > 0, "XML attribute values highlighted with .xml-string");
  runner.assert(xmlBrackets.length > 0, "XML brackets highlighted with .xml-bracket");

  // === TEST 3.11: Synchronized Scrolling (Editor & Preview) & Toggle Option ===
  console.log("\n  [Test 3.11] Synchronized Scrolling (Real Mouse Wheel & Dual-Directional)");
  const longMarkdown = Array.from({ length: 80 }, (_, i) => `## Section ${i + 1}\nParagraph content line for section ${i + 1}.\n`).join("\n");
  await page.fill("#editor", longMarkdown);
  await page.selectOption("#formatSelect", "markdown");
  await page.waitForTimeout(400);

  // 1. Verify sync scroll button exists in toolbar
  const syncScrollBtn = await page.waitForSelector("#syncScrollBtn");
  runner.assert(!!syncScrollBtn, "#syncScrollBtn exists in toolbar");

  const editorBox = await page.$eval("#editor", el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const previewBox = await page.$eval("#preview", el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });

  // 2. Real Mouse Wheel Scroll on Editor
  const initialEditorScroll = await page.$eval("#editor", el => el.scrollTop);
  await page.mouse.move(editorBox.x, editorBox.y);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(400);

  let editorScrollAfter = await page.$eval("#editor", el => el.scrollTop);
  let previewScrollTop = await page.$eval("#preview", el => el.scrollTop);
  runner.assert(editorScrollAfter > initialEditorScroll, "Editor scrolled down via mouse wheel (Editor scrollTop: " + Math.round(editorScrollAfter) + ")");
  runner.assert(previewScrollTop > 50, "Preview scrolled synchronously with Editor (Preview scrollTop: " + Math.round(previewScrollTop) + ")");

  // 3. Real Mouse Wheel Scroll on Preview (Reverse Sync)
  const prevPreviewScroll = previewScrollTop;
  await page.mouse.move(previewBox.x, previewBox.y);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(400);

  let previewScrollUp = await page.$eval("#preview", el => el.scrollTop);
  let editorScrollUp = await page.$eval("#editor", el => el.scrollTop);
  runner.assert(previewScrollUp < prevPreviewScroll, "Preview scrolled up via mouse wheel (Preview scrollTop: " + Math.round(previewScrollUp) + ")");
  runner.assert(editorScrollUp < editorScrollAfter, "Editor scrolled back in sync with Preview (Editor scrollTop: " + Math.round(editorScrollUp) + ")");

  // 4. Toggle sync scroll OFF
  await page.click("#syncScrollBtn");
  await page.waitForTimeout(300);

  const prevScrollBefore = await page.$eval("#preview", el => el.scrollTop);
  await page.mouse.move(editorBox.x, editorBox.y);
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(400);

  let previewScrollAfter = await page.$eval("#preview", el => el.scrollTop);
  runner.assert(previewScrollAfter === prevScrollBefore, "Preview scroll remains locked when sync scroll is toggled OFF");

  // 5. Toggle sync scroll back ON
  await page.click("#syncScrollBtn");
  await page.waitForTimeout(300);
  await page.mouse.move(editorBox.x, editorBox.y);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(400);

  previewScrollTop = await page.$eval("#preview", el => el.scrollTop);
  runner.assert(previewScrollTop < prevScrollBefore, "Preview scrolls synchronously again when sync scroll is turned back ON");

  await context.close();
  return runner.summary();
}

module.exports = { runSuite3 };
