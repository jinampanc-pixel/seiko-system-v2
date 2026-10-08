# Performance stabilization — 2026-10-08

## Changes

- Home and learned libraries react to changes rather than repeating full reads every three or five seconds.
- Idle order sync compares small server version lists; hidden tabs skip remote checks. Local fallback checks run once a minute and skip parsing unchanged cache contents. Explicit saves retain their server confirmation and conflict checks.
- Missing cached order identities trigger a server refresh even when server versions have not changed. Cache disappearance is never a server deletion command.
- Backup exports use an exclusive process lock. The Windows runner limits Node memory and worker threads; Drive retries reuse verified archives rather than exporting repeatedly.
- Owner-operated Drive setup permits one hour for consent and retains private unattended authorization. Daily PC backups do not require Codex or Jinam to be open.

## Verification

Contract tests cover idle work, hidden tabs, event saves, cross-device changes, cache recovery and overlapping export exclusion. Browser smoke tests use synthetic orders and SQLite; their initialization must not overwrite persisted cache on reload or inside receipt frames.

On October 8 a fresh encrypted PC archive and direct Google Drive copy were verified and reported to the app. Earlier archives were preserved. This verifies the copies, not future scheduler execution.

## Limits

The initial order load and refresh after changes still load complete orders. This change does not establish a performance guarantee for thousands of large orders. Host-wide CPU, memory, disk health and Chrome resource use have not been measured reliably from the development session.

The independent cloud-only workflow remains disabled until dedicated export access and encrypted repository secrets are configured and a complete cloud run is verified. A Mac requires its own configured local backup job. Signing in alone does not configure device backups.
