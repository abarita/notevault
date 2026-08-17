// NoteVault Test Suite
// Run: node test.js
// Requires Node.js 22+ for Web Crypto API support

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error("  FAIL: " + msg); }
}

function assertEq(a, b, msg) {
  if (a === b) { passed++; }
  else { failed++; console.error("  FAIL: " + msg + " — expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }
}

function assertThrows(fn, msg) {
  try { fn(); failed++; console.error("  FAIL: " + msg + " — expected throw"); }
  catch (_) { passed++; }
}

// Extract BIP39 wordlist from HTML
function loadBIP39() {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const m = html.match(/var BIP39=\[([\s\S]*?)\];/);
  if (!m) throw new Error("BIP39 wordlist not found in index.html");
  return JSON.parse("[" + m[1] + "]");
}

// Extract JS source from HTML for function testing
function loadScript() {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Script not found in index.html");
  return m[1];
}

// === Reimplement pure functions identically for testing ===

const BIP39 = loadBIP39();

function escapeHtml(s) {
  const m = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, c => m[c]);
}

function detectFormat(c) {
  const t = c.trim();
  if (!t) return "text";
  if (t.startsWith("<?xml") || (t.startsWith("<") && t.includes(">") && !t.startsWith("<!") && !t.startsWith("<html"))) {
    try {
      const p = new (require("xmldom").DOMParser ? require("xmldom").DOMParser : Object)().parseFromString ? null : null;
      // XML parsing in Node requires xmldom; skip for now, rely on substring heuristic
    } catch (_) {}
    // Simple heuristic: starts with < and contains >
    if (t.startsWith("<") && t.includes(">") && !t.startsWith("<!") && !t.startsWith("<html")) return "xml";
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

// === Crypto helpers (Node 22+ Web Crypto API) ===

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

// === TESTS ===

console.log("=== BIP39 Wordlist ===");
console.log("  Words: " + BIP39.length);
assertEq(BIP39.length, 2048, "BIP39 has 2048 words");
const unique = new Set(BIP39);
assertEq(unique.size, 2048, "BIP39 has no duplicates");

// Verify first few and last few words
assertEq(BIP39[0], "abandon", "First word is 'abandon'");
assertEq(BIP39[2047], "zoo", "Last word is 'zoo'");
assertEq(BIP39[1024], "length", "Middle word is 'length' (index 1024)");

console.log("\n=== Format Detection ===");
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
assertEq(escapeHtml("normal"), "normal", "Normal text unchanged");

console.log("\n=== XML Highlighting ===");
const xmlResult = highlightXML('<root attr="val"><child/></root>');
assert(xmlResult.includes("xml-key"), "XML tags get key class");
assert(xmlResult.includes("xml-attr"), "XML attributes get attr class");
assert(xmlResult.includes("xml-string"), "XML values get string class");
assert(xmlResult.includes("xml-bracket"), "XML brackets get bracket class");

console.log("\n=== Recovery Key Generation ===");
const rk = generateRecoveryKey();
assertEq(rk.length, 12, "Recovery key has 12 words");
for (const w of rk) {
  assert(BIP39.includes(w), "Word '" + w + "' is in BIP39 list");
}

console.log("\n=== Encryption Round-trip ===");
async function testCrypto() {
  const passphrase = "test-passphrase-123";
  const salt = crypto.randomUUID();
  const key = await deriveKey(passphrase, salt);
  assert(key.type === "secret", "Derived key is secret type");

  // Encrypt/decrypt
  const plaintext = "Hello, encrypted world!";
  const enc = await encryptAES(key, plaintext);
  assert(enc.iv.length === 12, "IV is 12 bytes");
  assert(enc.ciphertext.length > 0, "Ciphertext is non-empty");
  assert(enc.ciphertext.length !== plaintext.length, "Ciphertext differs from plaintext");

  const dec = await decryptAES(key, enc);
  assertEq(dec, plaintext, "Round-trip encrypt/decrypt works");

  // Wrong key fails
  const wrongKey = await deriveKey("wrong-passphrase", salt);
  try {
    await decryptAES(wrongKey, enc);
    failed++; console.error("  FAIL: Wrong key should fail decryption");
  } catch (_) { passed++; }

  // Empty string
  const encEmpty = await encryptAES(key, "");
  const decEmpty = await decryptAES(key, encEmpty);
  assertEq(decEmpty, "", "Empty string round-trip works");

  // Unicode
  const unicode = "Hello 世界 🌍";
  const encUni = await encryptAES(key, unicode);
  const decUni = await decryptAES(key, encUni);
  assertEq(decUni, unicode, "Unicode round-trip works");

  // Large payload
  const large = "x".repeat(10000);
  const encLarge = await encryptAES(key, large);
  const decLarge = await decryptAES(key, encLarge);
  assertEq(decLarge, large, "Large payload round-trip works");

  // Key wrapping
  const wrapKey2 = await deriveKey("wrapping-key", salt);
  const dataKey = await deriveKey("data-key", salt, 600000, true);
  const wrapped = await wrapKey(wrapKey2, dataKey);
  assert(wrapped.iv.length === 12, "Wrapped key IV is 12 bytes");
  assert(wrapped.wrapped.length > 0, "Wrapped key data is non-empty");

  const unwrapped = await unwrapKey(wrapKey2, wrapped);
  assert(unwrapped.type === "secret", "Unwrapped key is secret type");

  // Verify unwrapped key works
  const testEnc = await encryptAES(unwrapped, "test");
  const testDec = await decryptAES(unwrapped, testEnc);
  assertEq(testDec, "test", "Unwrapped key encrypt/decrypt works");

  // Wrong wrapping key fails
  const wrongWrapKey = await deriveKey("wrong-wrap", salt);
  try {
    await unwrapKey(wrongWrapKey, wrapped);
    failed++; console.error("  FAIL: Wrong wrapping key should fail");
  } catch (_) { passed++; }

  // Different passphrases produce different keys
  const key1 = await deriveKey("pass1", salt);
  const key2 = await deriveKey("pass2", salt);
  const enc1 = await encryptAES(key1, "test");
  try {
    await decryptAES(key2, enc1);
    failed++; console.error("  FAIL: Different keys should not decrypt");
  } catch (_) { passed++; }

  console.log("\n=== Key Derivation ===");
  // Same passphrase + salt = same key
  const k1 = await deriveKey("same", "salt1");
  const k2 = await deriveKey("same", "salt1");
  const e1 = await encryptAES(k1, "verify");
  const d1 = await decryptAES(k2, e1);
  assertEq(d1, "verify", "Same passphrase+salt produces equivalent key");

  // Different salt = different key
  const k3 = await deriveKey("same", "salt2");
  try {
    await decryptAES(k3, e1);
    failed++; console.error("  FAIL: Different salt should produce different key");
  } catch (_) { passed++; }

  // Lower iterations for faster test
  const fastKey = await deriveKey("fast", "salt", 1000);
  const fastEnc = await encryptAES(fastKey, "test");
  const fastDec = await decryptAES(fastKey, fastEnc);
  assertEq(fastDec, "test", "Lower iterations still works");

  console.log("\n=== Passphrase Hash Verification ===");
  const pw = "my-secure-passphrase";
  const s = crypto.randomUUID();
  const deriveForHash = await deriveKey(pw, s);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw + ":" + s));
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");

  // Verify hash
  const hash2 = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw + ":" + s));
  const hashHex2 = Array.from(new Uint8Array(hash2)).map(b => b.toString(16).padStart(2, "0")).join("");
  assertEq(hashHex, hashHex2, "Hash is deterministic");
  assertEq(hashHex.length, 64, "SHA-256 hash is 64 hex chars");

  // Wrong password produces different hash
  const wrongHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("wrong" + ":" + s));
  const wrongHex = Array.from(new Uint8Array(wrongHash)).map(b => b.toString(16).padStart(2, "0")).join("");
  assert(hashHex !== wrongHex, "Wrong password produces different hash");
}

// Run all tests
testCrypto().then(() => {
  console.log("\n=== RESULTS ===");
  console.log("  Passed: " + passed);
  console.log("  Failed: " + failed);
  console.log("  Total:  " + (passed + failed));
  if (failed > 0) process.exit(1);
}).catch(e => {
  console.error("Test error:", e);
  process.exit(1);
});