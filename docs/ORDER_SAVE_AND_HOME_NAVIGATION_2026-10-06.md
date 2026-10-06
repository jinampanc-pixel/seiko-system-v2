# Order save and Home navigation — 2026-10-06

The desktop workspace uses Ctrl+S (Cmd+S on macOS) and Save now in its order menu. The direct Save control is shown at mobile widths up to 720px. Save & close still returns to Order Center only after the shared database acknowledges the save.

A React-owned success status names the saved order after acknowledgment. It clears on the next edit or command. Failed and conflicting saves show an error without a success status and retain the open draft. The acknowledgment does not claim that a separate backup was created.

Order Center has a native Back to Home action. The main menu calls the home module Home. The legacy session-back handler excludes this explicit Home control so history cannot override its destination.

Browser regression coverage uses the actual Orders API against an isolated database: desktop Ctrl+S and menu Save persist distinct record edits, show success, and keep the workspace open; stale saves fail without replacing newer records; Save & close returns to Order Center; Back to Home reaches Home; mobile Save and the menu fit the viewport; failed saves never show success. Billing tests scope their own Back to Home button when billing is displayed over Order Center.

Validation: clean lockfile install succeeded; npm test passed 281 contract/runtime tests, production build and 3 rendered/cold-start tests; all npm run test:smoke workflows passed; full lint reported zero errors and 23 existing warnings. Checks ran sequentially.
