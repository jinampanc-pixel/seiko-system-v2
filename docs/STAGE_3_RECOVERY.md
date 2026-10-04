# Stage 3: free-plan backup and recovery

D1 remains the live authority. This implementation requires no paid Cloudflare product. The owner's selected alternative to a paid cloud backup bucket is a dated encrypted PC copy plus a private Google Drive copy. Google Drive connection and remote upload verification must be completed before claiming three independent copies. A synchronized folder is a transport; never propagate deletions from D1 into dated backup files.

## Coverage and encryption

The versioned business archive includes 14 operational tables: orders and order history; preferences; clients; billing documents (including invoices, challans, quotations and receipts represented by these documents); payments and their history; label tasks, templates, layouts, presets and history; shared product/commerce collections and their changes; MeTh stock, fulfilment policy and routing claims. IDs, numbering, JSON fields, archived states, tombstones and original histories are preserved. Passwords, memberships, sessions, passkeys, OAuth state, connector secrets and security events are excluded. Rebuild accounts and reconnect integrations through a separate security-admin recovery process. Application code and repository assets are recovered from GitHub. Unsaved browser drafts and offline scan queues are not D1 records and are not included in scheduled exports.

Files use AES-256-GCM with a random salt and nonce, PBKDF2-SHA256 (100,000 iterations), an authenticated format marker and an internal SHA-256 manifest. Backup passphrases never go to the application's server. Keep the recovery key separately from the encrypted backups and from Google Drive. Losing every copy of the key makes encrypted backups unrecoverable. The local scheduled runner reads a private owner-controlled key file; do not commit that file or configuration.

## Owner download and restore

Open Settings → Backup & recovery, or `/backups`. Whole-system export requires fresh server-checked owner membership in all three businesses. The browser encrypts the returned archive, then prepares a download. A prepared download is not proof the owner saved the file.

Select a backup to authenticate encryption and checksum, verify the migration version and compare new, duplicate and changed records. No business records change during this dry run. The initial restore path intentionally accepts only an empty operational database; it never merges or overwrites existing/newer records. Restoring requires an ERP login less than ten minutes old and the exact confirmation `RESTORE EMPTY SYSTEM`. A D1 transaction checks emptiness again, imports history before entities and appends a restore event. Constraint errors and concurrent inserts roll the entire restore back. Existing accounts are retained; security credentials are never imported. History contains the original archived events plus new insertion events from recovery. Reload open devices after recovery.

Large archives exceeding the 16 MB request limit, 1.8 MB row/chunk bound or 20-statement free-plan transaction budget require isolated recovery with the local tool. These limits are refusals, not partial import.

## Periodic PC copy

Create an owner-only private configuration outside the repository:

```json
{
  "directory": "<absolute backup folder>",
  "keyFile": "<absolute private recovery key file>",
  "xdgConfigHome": "<authorized Wrangler configuration directory>",
  "driveDirectory": "<optional verified Google Drive desktop sync folder>"
}
```

Run `node scripts/business-backup.mjs export <private-config.json>`. Wrangler must already be authorized to read/export the database. An expired login or disconnected drive causes a visible failure; it does not replace the prior successful backup. Wrangler's signed raw-export URLs are captured and never logged. The raw full SQL exists only in a temporary directory during export, is processed in memory, and is removed in a checked cleanup path. Only the sanitized encrypted archive is retained or sent to Drive.

Every successful backup is decrypted and restored into a fresh in-memory SQLite database, with exact table/row comparisons and `PRAGMA integrity_check`. Only then is the `.partial` file renamed into the dated final archive and a metadata-only manifest/operations log recorded. No retention deletion is automatic. Monitor disk and Google Drive capacity; preserve at least daily, weekly and monthly copies manually until a retention policy is explicitly selected. The optional Drive folder copy verifies local file bytes; it does not prove Google's remote synchronization completed.

Daily execution is a local Codex automation. It requires this PC, Codex, the drive, Internet and valid Wrangler authorization to be available. It cannot back up while the PC is off. Configure the backup job to remain quiet on verified success and report failures. A failed daily run increases the possible data-loss interval. Free D1 Time Travel remains an additional seven-day recovery option, not the independent disk/Drive backup.

## Restore drill

Run `node scripts/business-backup.mjs drill <private-config.json> <archive.seiko-backup> <new-local.sqlite>`. It refuses an existing target file and never connects a restore to production D1. It creates the committed schema, replays exact business records and histories in an isolated transaction and reinstalls audit triggers. The report records archive checksum, record count and integrity result. Keep this report with the archive manifest. After a future schema change, run a new drill before relying on older archives; migration compatibility must be reviewed rather than silently guessed.

Production recovery must first preserve the current D1 database and accounts, rehearse the chosen archive locally, review its date/counts, and use the authenticated empty-system restore. Do not delete live tables to make the restore button available. Recovery to the latest backup excludes changes made after that backup and unsynced browser changes.

## Recorded drill: 4 October 2026

A production D1 business export was encrypted and restored into a new local SQLite file on the owner's computer. All 14 operational tables and 189 rows compared exactly with the source archive, including original audit history. Integrity check returned `ok`. Archive payload checksum: `ad8b28e2e9b7f9828cd9ddc986c3d35f3fc591b622a9db4ef39b4116b7441772`. Private data, the recovery key and the SQLite drill file remain outside Git. This drill proves recovery of that snapshot; it does not prove recovery of later updates or security credentials.
