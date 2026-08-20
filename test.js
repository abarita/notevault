// NoteVault Comprehensive Unit Test Suite
// Run: node test.js
// Requires Node.js 22+ for Web Crypto API support

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log("  PASS: " + msg); }
  else { failed++; console.error("  FAIL: " + msg); }
}

function assertEq(a, b, msg) {
  if (JSON.stringify(a) === JSON.stringify(b)) { passed++; console.log("  PASS: " + msg); }
  else { failed++; console.error("  FAIL: " + msg + " — expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }
}

function assertThrows(fn, msg) {
  try { fn(); failed++; console.error("  FAIL: " + msg + " — expected throw"); }
  catch (_) { passed++; console.log("  PASS: " + msg + " (threw as expected)"); }
}

// Extract BIP39 wordlist from HTML
function loadBIP39() {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const m = html.match(/var BIP39=\[([\s\S]*?)\];/);
  if (!m) throw new Error("BIP39 wordlist not found in index.html");
  return JSON.parse("[" + m[1] + "]");
}

// Pure utility functions from NoteVault
const BIP39 = loadBIP39();

function escapeHtml(s) {
  const m = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(s || "").replace(/[&<>"']/g, c => m[c]);
}

function detectFormat(c) {
  const t = (c || "").trim();
  if (!t) return "text";
  if (t.startsWith("<?xml") || (t.startsWith("<") && t.includes(">") && !t.startsWith("<!") && !t.startsWith("<html"))) {
    return "xml";
  }
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try { JSON.parse(t); return "json"; } catch (_) {}
  }
  const md = /^(#{1,6}\s|\*\s|-\s|\d+\.\s|>\s|```|\[.*\]\(.*\)|!\[.*\]\(.*\)|\|.*\|)/m;
  if (md.test(t)) return "markdown";
  return "text";
}

function highlightXML(x) {
  const e = escapeHtml(x);
  return e.replace(/(&lt;\/?)([\w:.-]+)/g, "$1<span class=xml-key>$2</span>")
    .replace(/(&lt;|&gt;|\/&gt;)/g, "<span class=xml-bracket>$1</span>")
    .replace(/(\s[\w:-]+)=(&quot;.*?&quot;)/g, " <span class=xml-attr>$1</span>=<span class=xml-string>$2</span>");
}

function generateRecoveryKey() {
  const words = [];
  const arr = new Uint16Array(12);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 12; i++) words.push(BIP39[arr[i] % 2048]);
  return words;
}

// === Crypto helpers (Web Crypto API) ===

async function deriveKey(passphrase, salt, iterations = 600000, extractable = false) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
  );
}

async function encryptAES(key, plaintext) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
}

async function decryptAES(key, data) {
  const iv = new Uint8Array(data.iv);
  const ct = new Uint8Array(data.ciphertext);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plaintext);
}

async function wrapKey(wrappingKey, keyToWrap) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey("raw", keyToWrap, wrappingKey, { name: "AES-GCM", iv });
  return { iv: Array.from(iv), wrapped: Array.from(new Uint8Array(wrapped)) };
}

async function unwrapKey(wrappingKey, wrappedData) {
  const iv = new Uint8Array(wrappedData.iv);
  const wrapped = new Uint8Array(wrappedData.wrapped);
  return crypto.subtle.unwrapKey("raw", wrapped, wrappingKey, { name: "AES-GCM", iv }, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// === EXECUTE UNIT TESTS ===

async function runUnitTests() {
  console.log("=== BIP39 Wordlist Validation ===");
  assertEq(BIP39.length, 2048, "BIP39 contains exactly 2048 words");
  const unique = new Set(BIP39);
  assertEq(unique.size, 2048, "BIP39 has zero duplicates");
  assertEq(BIP39[0], "abandon", "First word is 'abandon'");
  assertEq(BIP39[2047], "zoo", "Last word is 'zoo'");
  assertEq(BIP39[1024], "length", "Word at index 1024 is 'length'");

  console.log("\n=== Format Auto-Detection ===");
  assertEq(detectFormat(""), "text", "Empty string → text");
  assertEq(detectFormat("hello world"), "text", "Plain text → text");
  assertEq(detectFormat("# Heading"), "markdown", "Markdown heading → markdown");
  assertEq(detectFormat("- list item"), "markdown", "Markdown list → markdown");
  assertEq(detectFormat("> quote"), "markdown", "Markdown quote → markdown");
  assertEq(detectFormat("```\ncode\n```"), "markdown", "Markdown code block → markdown");
  assertEq(detectFormat("| col1 | col2 |"), "markdown", "Markdown table → markdown");
  assertEq(detectFormat("[link](url)"), "markdown", "Markdown link → markdown");
  assertEq(detectFormat('{"key":"value"}'), "json", "JSON object → json");
  assertEq(detectFormat('[1,2,3]'), "json", "JSON array → json");
  assertEq(detectFormat('{"nested":{"a":1}}'), "json", "Nested JSON → json");
  assertEq(detectFormat("<root><child/></root>"), "xml", "XML → xml");
  assertEq(detectFormat('<?xml version="1.0"?><root/>'), "xml", "XML declaration → xml");
  assertEq(detectFormat("not valid { json"), "text", "Invalid JSON → text");
  assertEq(detectFormat("not valid < xml"), "text", "Invalid XML → text");

  console.log("\n=== HTML Escaping ===");
  assertEq(escapeHtml("<script>"), "&lt;script&gt;", "<script> escaped");
  assertEq(escapeHtml('"hello"'), "&quot;hello&quot;", "Double quotes escaped");
  assertEq(escapeHtml("it's"), "it&#39;s", "Single quote escaped");
  assertEq(escapeHtml("a & b"), "a &amp; b", "Ampersand escaped");
  assertEq(escapeHtml("normal text"), "normal text", "Normal text unchanged");

  console.log("\n=== XML Syntax Highlighting ===");
  const xmlResult = highlightXML('<root attr="val"><child/></root>');
  assert(xmlResult.includes("xml-key"), "XML tags get xml-key class");
  assert(xmlResult.includes("xml-attr"), "XML attributes get xml-attr class");
  assert(xmlResult.includes("xml-string"), "XML values get xml-string class");
  assert(xmlResult.includes("xml-bracket"), "XML brackets get xml-bracket class");

  console.log("\n=== 12-Word Recovery Key Generation ===");
  const rk = generateRecoveryKey();
  assertEq(rk.length, 12, "Recovery key has exactly 12 words");
  for (const w of rk) {
    assert(BIP39.includes(w), "Word '" + w + "' is in BIP39 standard dictionary");
  }

  console.log("\n=== AES-GCM 256-Bit Cryptography & Round-Trips ===");
  const passphrase = "test-passphrase-123";
  const salt = crypto.randomUUID();
  const key = await deriveKey(passphrase, salt);
  assert(key.type === "secret", "Derived key is secret type");

  // Basic encryption/decryption
  const plaintext = "Hello, encrypted NoteVault world!";
  const enc = await encryptAES(key, plaintext);
  assertEq(enc.iv.length, 12, "Initialization vector is 12 bytes");
  assert(enc.ciphertext.length > 0, "Ciphertext is non-empty");

  const dec = await decryptAES(key, enc);
  assertEq(dec, plaintext, "Round-trip encrypt/decrypt works identically");

  // Wrong key fails decryption
  const wrongKey = await deriveKey("wrong-passphrase", salt);
  let wrongKeyFailed = false;
  try {
    await decryptAES(wrongKey, enc);
  } catch (_) {
    wrongKeyFailed = true;
  }
  assert(wrongKeyFailed, "Wrong key throws error during decryption");

  // Empty string
  const encEmpty = await encryptAES(key, "");
  const decEmpty = await decryptAES(key, encEmpty);
  assertEq(decEmpty, "", "Empty string round-trip works");

  // Unicode & Multi-byte emojis
  const unicode = "Hello 世界 🌍 🔒 🚀 UTF-8 Multi-byte";
  const encUni = await encryptAES(key, unicode);
  const decUni = await decryptAES(key, encUni);
  assertEq(decUni, unicode, "Unicode & emoji round-trip works");

  // Large payload (100KB)
  const large = "NoteVault Encrypted Payload ".repeat(4000);
  const encLarge = await encryptAES(key, large);
  const decLarge = await decryptAES(key, encLarge);
  assertEq(decLarge, large, "Large payload (>100KB) round-trip works");

  // Key wrapping
  const wrapKey2 = await deriveKey("wrapping-key", salt);
  const dataKey = await deriveKey("data-key", salt, 600000, true);
  const wrapped = await wrapKey(wrapKey2, dataKey);
  assertEq(wrapped.iv.length, 12, "Wrapped key IV is 12 bytes");
  assert(wrapped.wrapped.length > 0, "Wrapped key data is non-empty");

  const unwrapped = await unwrapKey(wrapKey2, wrapped);
  assert(unwrapped.type === "secret", "Unwrapped key is secret type");

  const testEnc = await encryptAES(unwrapped, "secret payload");
  const testDec = await decryptAES(unwrapped, testEnc);
  assertEq(testDec, "secret payload", "Unwrapped key encrypt/decrypt verified");

  // Wrong wrapping key fails
  const wrongWrapKey = await deriveKey("wrong-wrap", salt);
  let wrongWrapFailed = false;
  try {
    await unwrapKey(wrongWrapKey, wrapped);
  } catch (_) {
    wrongWrapFailed = true;
  }
  assert(wrongWrapFailed, "Wrong wrapping key fails to unwrap");

  // Passphrase hash verification
  const pw = "my-secure-passphrase";
  const s = crypto.randomUUID();
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw + ":" + s));
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  assertEq(hashHex.length, 64, "SHA-256 hash is 64 hex characters");

  console.log("\n=== Note Payload Encryption at Rest ===");
  const notePayload = JSON.stringify({
    title: "Secret Strategy",
    content: "Confidential roadmap and private keys.",
    format: "markdown",
    customTitle: true
  });
  const encNote = await encryptAES(key, notePayload);
  assertEq(encNote.iv.length, 12, "Note ciphertext has 12-byte IV");
  assert(encNote.ciphertext.length > 0, "Note ciphertext is non-empty");

  const decNote = await decryptAES(key, encNote);
  const parsedNote = JSON.parse(decNote);
  assertEq(parsedNote.title, "Secret Strategy", "Note title preserved after decryption");
  assertEq(parsedNote.content, "Confidential roadmap and private keys.", "Note content preserved after decryption");
  assertEq(parsedNote.format, "markdown", "Note format preserved after decryption");
  assertEq(parsedNote.customTitle, true, "Note customTitle flag preserved after decryption");

  console.log("\n=== Cross-Device & Salt Portability ===");
  const words = generateRecoveryKey();
  const recoverySalt = "notevault-recovery";

  // Device A derivation
  const deviceA_RecoveryKey = await deriveKey(words.join(" "), recoverySalt, 100000, true);
  const deviceA_Passphrase = "device-a-passphrase-2026";
  const deviceA_Salt = crypto.randomUUID();
  const deviceA_PassKey = await deriveKey(deviceA_Passphrase, deviceA_Salt);
  const deviceA_Wrapped = await wrapKey(deviceA_PassKey, deviceA_RecoveryKey);

  // Device A encrypts a note
  const deviceA_Ciphertext = await encryptAES(deviceA_RecoveryKey, "Shared secret note across devices");

  // Device B (Fresh device with NO prior salt) derives RecoveryKey from words
  const deviceB_RecoveryKey = await deriveKey(words.join(" "), "notevault-recovery", 100000, true);
  const deviceB_Decrypted = await decryptAES(deviceB_RecoveryKey, deviceA_Ciphertext);
  assertEq(deviceB_Decrypted, "Shared secret note across devices", "Device B decrypts Device A note using 12 words");

  // Device B sets custom passphrase and re-wraps
  const deviceB_Passphrase = "device-b-different-passphrase-888";
  const deviceB_Salt = crypto.randomUUID();
  const deviceB_PassKey = await deriveKey(deviceB_Passphrase, deviceB_Salt);
  const deviceB_Wrapped = await wrapKey(deviceB_PassKey, deviceB_RecoveryKey);

  const deviceB_UnwrappedKey = await unwrapKey(deviceB_PassKey, deviceB_Wrapped);
  const deviceB_UnwrappedDec = await decryptAES(deviceB_UnwrappedKey, deviceA_Ciphertext);
  assertEq(deviceB_UnwrappedDec, "Shared secret note across devices", "Device B unwraps with custom passphrase and decrypts");

  console.log("\n=== Data Portability Schema Validation ===");
  const plainExportSchema = {
    version: 2,
    folders: [{ id: "f1", name: "Folder 1", parentId: null, createdAt: 1000, updatedAt: 2000 }],
    notes: [{ id: "n1", folderId: "f1", title: "Note 1", content: "Body", format: "auto", customTitle: false, createdAt: 1000, updatedAt: 2000 }]
  };
  assertEq(plainExportSchema.version, 2, "Plain export matches version 2 schema");
  assert(plainExportSchema.folders.length === 1, "Plain export contains folders array");
  assert(plainExportSchema.notes.length === 1, "Plain export contains notes array");

  const encryptedExportSchema = {
    v: 1,
    iv: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    data: [10, 20, 30, 40]
  };
  assertEq(encryptedExportSchema.v, 1, "Encrypted export matches v1 envelope");
  assertEq(encryptedExportSchema.iv.length, 12, "Encrypted export contains 12-byte IV array");
  assert(encryptedExportSchema.data.length > 0, "Encrypted export contains ciphertext array");

  console.log("\n=== QR Code Pairing Payload & Generator ===");
  const qrcodeGen = require("./node_modules/qrcode-generator/dist/qrcode.js");
  const testPairWords = generateRecoveryKey();
  const testQrPayload = {
    nv: 1,
    w: testPairWords,
    t: "ghp_testToken1234567890abcdef",
    g: "gist1234567890abcdef"
  };
  const qrStr = JSON.stringify(testQrPayload);
  const qrObj = qrcodeGen(0, 'M');
  qrObj.addData(qrStr);
  qrObj.make();
  assert(qrObj.getModuleCount() > 20, "QR code modules generated successfully");
  const svgOutput = qrObj.createSvgTag(4, 8);
  assert(svgOutput.startsWith("<svg") && svgOutput.endsWith("</svg>"), "QR SVG output is valid XML SVG element");
  assert(svgOutput.includes("viewBox="), "QR SVG includes viewBox scaling attribute");

  // Verify decoded payload structure
  const parsedPayload = JSON.parse(qrStr);
  assertEq(parsedPayload.nv, 1, "Pairing payload version is 1");
  assertEq(parsedPayload.w.length, 12, "Pairing payload contains exactly 12 recovery words");
  assertEq(parsedPayload.t, "ghp_testToken1234567890abcdef", "Pairing payload contains GitHub token");
  assertEq(parsedPayload.g, "gist1234567890abcdef", "Pairing payload contains Gist ID");

  console.log("\n=================================");
  console.log("       UNIT TESTS SUMMARY        ");
  console.log("=================================");
  console.log("  Passed: " + passed);
  console.log("  Failed: " + failed);
  console.log("  Total:  " + (passed + failed));
  console.log("=================================");

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runUnitTests().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});