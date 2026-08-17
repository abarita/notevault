# NoteVault — Design Document

Single-file, offline-first PWA for storing and rendering multi-format notes (Markdown, JSON, XML, plain text) with folder organization, client-side encryption, and optional GitHub Gist sync.

## File

`index.html` — the entire app (HTML + CSS + JS), no build step. Open directly in a browser.
`sw.js` — service worker for offline caching (PWA).
`DESIGN.md` — this document.

## Features

| Feature | Status |
|---|---|
| Visual layout (sidebar + editor + preview) | Implemented |
| Nested folder tree | Implemented |
| Auto-format detection (Markdown/JSON/XML/text) | Implemented |
| JSON collapsible tree view (Firefox-style) | Implemented |
| Dark/light theme toggle | Implemented |
| Mobile responsive (hamburger + overlay sidebar) | Implemented |
| IndexedDB offline storage | Implemented |
| AES-256-GCM encryption (Web Crypto API) | Implemented |
| 12-word BIP39 recovery key | Implemented |
| GitHub Gist sync (encrypted, pull-merge-push) | Implemented |
| Export/Import (JSON + encrypted JSON) | Implemented |
| PWA manifest / service worker | Implemented (sw.js + inline manifest) |
| Auto-sync toggle | Implemented (3s debounce after edits) |

## Data Model (IndexedDB v2)

**Store `notes`** — `{ id, folderId|null, title, content, format: "auto"|"text"|"markdown"|"json"|"xml", createdAt, updatedAt }`

**Store `folders`** — `{ id, name, parentId|null, order, createdAt, updatedAt }`

**Store `settings`** (key/value) — keys:
- `passphrase_salt` — random salt for PBKDF2
- `passphrase_hash` — SHA-256(passphrase + ":" + salt) for verification
- `recovery_salt` — salt for recovery key derivation
- `recovery_key_encrypted` — JSON `{iv, wrapped}` — recovery key wrapped with passphrase key (AES-GCM)
- `recovery_verify` — AES-GCM encrypted string `"notevault-verify"` using recovery key (for verifying recovery words)
- `github_token_encrypted` — GitHub token encrypted with recovery key
- `gist_id` — the sync gist ID
- `theme` — "dark" | "light"
- `last_synced_at`, `auto_sync`, `setup_complete`

## Key Management (crypto-wallet pattern)

```
Recovery Key (12 BIP39 words, 128-bit)  ← master key, encrypts all data
        │  wrapped with passphrase key → stored in recovery_key_encrypted
        │  used directly to encrypt/decrypt vault + token
        ▼
Passphrase (user-memorable) → PBKDF2(600k iter) → passphrase key
        │  wraps/unwraps the recovery key
        ▼
Data (vault JSON, GitHub token) — AES-256-GCM encrypted with recovery key
```

- **Recovery key** = the real encryption key. Never sent to any server. Written on paper during setup.
- **Passphrase** = convenience wrapper. Can be changed without re-encrypting data (only re-wraps the recovery key).
- **Forgot passphrase?** Enter 12 words → verify against `recovery_verify` → set new passphrase.
- **Lose both?** Data unrecoverable (no backdoor), unless an unencrypted JSON export exists.

## Encryption Functions

- `deriveKey(passphrase, salt, iterations=600000)` → PBKDF2-SHA256 → AES-GCM-256 key
- `encryptAES(key, plaintext)` → `{iv, ciphertext}` (AES-GCM, 12-byte random IV)
- `decryptAES(key, data)` → plaintext
- `wrapKey(wrappingKey, key)` → `{iv, wrapped}` (AES-GCM key wrap)
- `unwrapKey(wrappingKey, {iv, wrapped})` → CryptoKey
- `generateRecoveryKey()` → 12 random BIP39 words (Uint16Array % 2048)
- `deriveRecoveryKey(words)` → PBKDF2(words, recovery_salt, 100000) → key

## Sync Flow (GitHub Gist)

1. User sets GitHub token (classic PAT, `gist` scope) in Settings → encrypted with recovery key → stored in `github_token_encrypted`
2. `manualSync()`:
   - No `gist_id` → `firstSync()`: encrypt whole vault → `POST /gists` (private, file `vault.enc`)
   - Has `gist_id` → `syncToGist()`: `GET` latest → decrypt → `mergeVault` (last-write-wins by `updatedAt`) → re-encrypt → `PATCH`
3. Gist stores only AES-GCM ciphertext. Zscaler/GitHub see gibberish.

## Rendering

- **Markdown** → `marked.parse()` (GFM, breaks)
- **JSON** → `renderJSONTree()` custom recursive DOM tree with expand/collapse, type coloring, copy-path (`\u2398` icon), auto-collapse depth > 4
- **XML** → `highlightXML()` syntax coloring (tags/attrs/strings)
- **Text** → escaped `<pre class="text-block">`

`detectFormat()` heuristics: XML (`<?xml` or `<...>` that parses), JSON (`{...}`/`[...]` that parses), Markdown (regex for headers/lists/quotes/code/links/tables), else text.

## UI Structure

- `.sidebar` — header (title + settings + new), search box, `.folder-tree`, stats footer
- `.main` — toolbar (hamburger, format select, sync/export/import, sync indicator, theme toggle), `.content-area` (editor + preview panes)
- Modals rendered into `#modalContainer` (setup, unlock, recovery, settings)
- Context menu rendered into `#contextMenu`

## Keyboard Shortcuts

- `Ctrl/Cmd+S` — save note
- `Ctrl/Cmd+N` — new note
- `Ctrl/Cmd+Shift+F` — new root folder
- `Ctrl/Cmd+K` — focus search

## Mobile

`@media (max-width: 768px)` — sidebar becomes fixed overlay (`translateX(-100%)` → `.open`), hamburger button + `.mobile-backdrop` toggles it, editor/preview stack vertically.

## Known Gaps (future work)

1. Note move between folders via drag-and-drop (move folder currently prompt-based)
2. Passphrase strength meter (visual indicator during setup)
3. Batch operations (select multiple notes, move/delete)

## Security Notes

- GitHub token scoped to `gist` only, stored encrypted at rest, decrypted only in memory
- All sync content is AES-256-GCM encrypted before leaving the browser
- No external crypto library — Web Crypto API only
- Token loss = gist deletable, but local IndexedDB remains source of truth
