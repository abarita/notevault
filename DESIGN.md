# NoteVault — Design & Architecture Document

Single-file, offline-first Progressive Web App (PWA) for storing and rendering multi-format notes (Markdown, JSON, XML, plain text) with folder organization, client-side AES-256-GCM encryption at rest and in transit, DOMPurify XSS protection, in-app modal dialogs, and optional GitHub Gist sync.

---

## File Structure

- `src/index.html` — modular source template for development.
- `index.html` — 100% self-contained, standalone production single-file bundle (no external network dependencies for Markdown or sanitization).
- `build.js` — lightweight Node build script that inlines `marked` & `DOMPurify` into `index.html` & `dist/`.
- `sw.js` — service worker for PWA offline caching.
- `test.js` — cryptographic and pure function unit test suite.
- `browser-test.js` — Playwright end-to-end headless browser test suite.
- `DESIGN.md` — this document.

---

## Features

| Feature | Status |
|---|---|
| Visual layout (sidebar + editor + preview) | Implemented |
| Nested folder tree & Drag-and-Drop | Implemented |
| In-app styled modal dialogs (no native alerts/prompts) | Implemented |
| Auto-format detection (Markdown/JSON/XML/text) | Implemented |
| JSON collapsible tree view (Firefox-style) with filtering & JSONPath | Implemented |
| DOMPurify Markdown XSS sanitization | Implemented |
| 100% Offline Standalone Bundle (inlined Marked + DOMPurify) | Implemented |
| Dark/light theme toggle | Implemented |
| Mobile responsive (hamburger + overlay sidebar) | Implemented |
| IndexedDB encrypted offline storage at rest | Implemented |
| AES-256-GCM encryption (Web Crypto API) | Implemented |
| Vault locking & memory key wiping (`🔒`) | Implemented |
| 12-word BIP39 recovery key | Implemented |
| GitHub Gist sync (encrypted, pull-merge-push) | Implemented |
| Export/Import (Plain JSON + encrypted JSON) | Implemented |
| PWA manifest / service worker (cross-origin caching) | Implemented (sw.js + inline manifest) |
| Auto-sync toggle | Implemented (3s debounce after edits) |

---

## Cryptographic Key Management & Architecture

NoteVault implements a **crypto-wallet key hierarchy**.

```
+===================================================================================+
|                     PASSPHRASE & RECOVERY KEY RELATIONSHIP                        |
+===================================================================================+

 1. ENTITY RELATIONSHIP DIAGRAM
 -----------------------------------------------------------------------------------
  [ User 12 Recovery Words ]                      [ User Passphrase ]
       (12 BIP39 words)                           (User memorable text)
              │                                             │
              ▼                                             ▼
    PBKDF2 (100k iter)                             PBKDF2 (600k iter)
    salt: "notevault-recovery"                     salt: passphrase_salt (random UUID)
              │                                             │
              ▼                                             ▼
     +─────────────────+                           +─────────────────+
     |   RecoveryKey   |                           |  PassphraseKey  |
     | (AES-256 Master)|                           |  (AES-256 Key)  |
     +─────────────────+                           +─────────────────+
              │                                             │
              │             [ 1. KEY WRAPPING ]             │
              │  PassphraseKey wraps / encrypts RecoveryKey │
              ├─────────────────────────────────────────────┘
              ▼
    +───────────────────────────────────────────────────────────────+
    |                     IndexedDB: Settings                       |
    |---------------------------------------------------------------|
    |  • passphrase_salt                                            |
    |  • passphrase_hash (SHA-256 verification hash)                |
    |  • recovery_salt ("notevault-recovery")                       |
    |  • recovery_key_encrypted  <── [Encrypted Envelope (iv + ct)] |
    |  • recovery_verify         <── [Verification string]          |
    |  • github_token_encrypted  <── [Encrypted with RecoveryKey]   |
    +───────────────────────────────────────────────────────────────+
              │
              │             [ 2. DATA ENCRYPTION ]
              │  RecoveryKey encrypts Note payloads at rest & sync
              ▼
    +───────────────────────────────────────────────────────────────+
    |                     IndexedDB: Notes                          |
    |---------------------------------------------------------------|
    |  • id                                                         |
    |  • folderId                                                   |
    |  • encryptedData { iv, ciphertext }                           |
    |  • createdAt, updatedAt                                       |
    +───────────────────────────────────────────────────────────────+
```

### Why Use a Wrapped Master Key?
1. **Zero Re-encryption on Passphrase Change**: If the passphrase directly encrypted every note, changing your passphrase would require decrypting and re-encrypting the entire database. With key wrapping, changing your passphrase only requires re-encrypting the 32-byte master `RecoveryKey` with the new `PassphraseKey`.
2. **Cross-Device Decryption**: Devices can have different local passphrases (e.g. PIN on mobile, long password on laptop) while sharing the same underlying `RecoveryKey`.

---

## The Role of Salts in NoteVault

### What is a Salt?
A salt is a non-secret string added as input to the key derivation function (PBKDF2-SHA256).

### 1. `passphrase_salt` (Random per device / setup)
- **Generation**: `crypto.randomUUID()` generated once during initial setup.
- **Purpose**: Prevents Rainbow Table attacks and precomputed dictionary attacks. If two users choose the exact same passphrase `"secret123"`, their derived `PassphraseKey` will be completely different because each database has a unique `passphrase_salt`.
- **Public**: Stored in plaintext in the `settings` store in IndexedDB.

### 2. `recovery_salt` (Deterministic Application Salt)
- **Value**: `"notevault-recovery"`.
- **Purpose**: High-entropy 128-bit BIP39 wordlists already have $2^{128}$ possible combinations (immune to rainbow tables). Having a standard application salt ensures that **the exact same 12 words will always derive the exact same Master Recovery Key on any device or fresh browser in the world**, enabling instant cross-device sync and recovery.

---

## Unlock, Recovery & Cross-Device Flows

### Normal Unlock Flow
```
1. User enters Passphrase
       │
       ▼
2. Derive PassphraseKey = PBKDF2(Passphrase, passphrase_salt, 600,000 iter)
       │
       ▼
3. Unwrap `recovery_key_encrypted` from IndexedDB using PassphraseKey
       │
       ▼
4. Master [ RecoveryKey ] loaded into volatile browser memory
       │
       ▼
5. Decrypt notes from IndexedDB into in-memory search cache
```

### Recovery Flow (Forgot Passphrase)
```
1. User enters 12 Recovery Words
       │
       ▼
2. Derive Master [ RecoveryKey ] = PBKDF2(words, "notevault-recovery", 100,000 iter)
       │
       ▼
3. Verify test decrypt against `recovery_verify`
       │
       ▼
4. User sets NEW Passphrase ──> Derive new PassphraseKey ──> Wrap RecoveryKey ──> Save
```

---

## GitHub Gist Viewing & Discovery

### How to View Your Existing Sync Gist
1. **Directly in NoteVault (1-Click)**:
   - Go to **Settings (⚙)** ➔ click the **`https://gist.github.com/<id> ↗`** link on the Gist ID row to open your private Gist directly.
   - Click **`Edit` / `Link`** if you want to paste or change an existing Gist ID from another device.
2. **On GitHub**:
   - Visit [https://gist.github.com/mine](https://gist.github.com/mine) (or your GitHub profile Gists).
   - Find the secret Gist with description `NoteVault encrypted vault` containing `vault.enc` (AES-256-GCM ciphertext payload `{ v: 1, iv: [...], data: [...] }`).
3. **Automatic Gist Auto-Discovery**:
   - When entering a GitHub PAT on a new device, NoteVault automatically queries `GET /gists` to find your existing `vault.enc` Gist and links to it seamlessly without requiring manual ID copying.

---

## Cross-Device Portability & Migration

You can move or share your NoteVault data across browsers and devices using any of the following 4 methods:

### Method A: GitHub Gist Sync (Zero-Knowledge Cloud Sync)
- **Device A**: Enter GitHub PAT (with `gist` scope) ➔ Sync vault. NoteVault uploads `vault.enc` (encrypted with Master Recovery Key).
- **Device B**: Set up with the same 12 Recovery Words ➔ Enter GitHub PAT ➔ NoteVault auto-discovers and pulls the Gist, decrypting all notes seamlessly.

### Method B: Encrypted File Export / Import (`notevault-encrypted-*.json`)
- **Device A**: Click **Export -> Encrypted** to download an encrypted backup file.
- **Device B**: Set up with the same 12 Recovery Words ➔ Click **Import** ➔ Decrypts and merges notes.

### Method C: Plain JSON Export / Import (`notevault-export-*.json`)
- **Device A**: Click **Export -> JSON** for a plaintext backup.
- **Device B**: Click **Import** ➔ Imports all notes and encrypts them locally with Device B's key.

### Method D: Direct Browser Profile / IndexedDB Cloning (Raw DB Migration)
You can directly clone the underlying LevelDB files between machines without needing the 12 recovery words (unlocks immediately with original passphrase):

1. **Fully Close the Browser** on both source and target machines.
2. **Locate the IndexedDB Directory** on Windows (`Win + R`):
   - **Google Chrome**: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\IndexedDB`
   - **Microsoft Edge**: `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\IndexedDB`
   - **Brave Browser**: `%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\IndexedDB`
   - **Mozilla Firefox**: `%APPDATA%\Mozilla\Firefox\Profiles\<profile>\storage\default`
3. **Copy NoteVault Database Folder**:
   - If running via `file:///`: Copy `file__0.indexeddb.leveldb`
   - If running via localhost/web: Copy `http_localhost_<port>.indexeddb.leveldb`
4. **Paste on Target Machine**: Paste into the matching IndexedDB folder.
5. **Open NoteVault**: Enter your original passphrase to unlock immediately.

---

## Data Model (IndexedDB v2)

**Store `notes`** — `{ id, folderId|null, encryptedData: { iv, ciphertext }, createdAt, updatedAt }`  
*(In-memory decrypted cache: `{ id, folderId, title, content, format, customTitle, createdAt, updatedAt }`)*

**Store `folders`** — `{ id, name, parentId|null, order, createdAt, updatedAt }`

**Store `settings`** (key/value) — keys:
- `passphrase_salt` — random salt for PBKDF2
- `passphrase_hash` — SHA-256(passphrase + ":" + salt) for verification
- `recovery_salt` — "notevault-recovery"
- `recovery_key_encrypted` — JSON `{iv, wrapped}` — recovery key wrapped with passphrase key (AES-GCM)
- `recovery_verify` — AES-GCM encrypted string `"notevault-verify"` using recovery key
- `github_token_encrypted` — GitHub token encrypted with recovery key
- `gist_id` — sync gist ID
- `theme` — "dark" | "light"
- `last_synced_at`, `auto_sync`, `setup_complete`

---

## Offline Standalone Build

To build the standalone bundle:
```bash
npm run build
```
This inlines `marked` (Markdown parsing) and `DOMPurify` (XSS sanitization) directly into `index.html`. The compiled file is 100% self-contained and operates completely offline from `file:///` URLs without any external server or network connection required.
