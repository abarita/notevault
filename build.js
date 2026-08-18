// NoteVault Build Script
// Inlines dependencies (marked & dompurify) into a 100% standalone, offline index.html

const fs = require("fs");
const path = require("path");

function build() {
  console.log("=== Building NoteVault Standalone Bundle ===");
  const srcPath = path.join(__dirname, "src", "index.html");
  const outPath = path.join(__dirname, "index.html");
  const distDir = path.join(__dirname, "dist");
  const distPath = path.join(distDir, "index.html");

  if (!fs.existsSync(srcPath)) {
    console.error("Error: src/index.html not found.");
    process.exit(1);
  }

  let html = fs.readFileSync(srcPath, "utf8");

  // Read vendor scripts
  const markedPath = path.join(__dirname, "node_modules", "marked", "lib", "marked.umd.js");
  const purifyPath = path.join(__dirname, "node_modules", "dompurify", "dist", "purify.min.js");

  if (!fs.existsSync(markedPath)) {
    console.error("Error: marked not found at " + markedPath + ". Run npm install first.");
    process.exit(1);
  }
  if (!fs.existsSync(purifyPath)) {
    console.error("Error: dompurify not found at " + purifyPath + ". Run npm install first.");
    process.exit(1);
  }

  const markedJs = fs.readFileSync(markedPath, "utf8");
  const purifyJs = fs.readFileSync(purifyPath, "utf8");

  const inlinedVendors = [
    "<script>",
    "// === INLINED MARKED (Markdown Parser) ===",
    markedJs,
    "// === INLINED DOMPURIFY (XSS Sanitizer) ===",
    purifyJs,
    "</script>"
  ].join("\n");

  const vendorRegex = /<!-- INLINE_VENDOR_START -->[\s\S]*?<!-- INLINE_VENDOR_END -->/;
  if (!vendorRegex.test(html)) {
    console.error("Error: INLINE_VENDOR markers not found in src/index.html");
    process.exit(1);
  }

  html = html.replace(vendorRegex, inlinedVendors);

  // Write root index.html (for direct double-click usage)
  fs.writeFileSync(outPath, html, "utf8");
  console.log("✔ Created standalone " + outPath + " (" + (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1) + " KB)");

  // Write dist/index.html
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  fs.writeFileSync(distPath, html, "utf8");
  if (fs.existsSync(path.join(__dirname, "sw.js"))) {
    fs.copyFileSync(path.join(__dirname, "sw.js"), path.join(distDir, "sw.js"));
  }
  console.log("✔ Created distribution bundle in " + distDir);
  console.log("Build complete! NoteVault is 100% self-contained and offline-ready.");
}

build();
