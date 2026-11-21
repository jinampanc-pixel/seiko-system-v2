# Document workflow revision — 21 November 2026

This revision supersedes the separate print/saved-list proposal in the earlier workflow audit.

## Saving and printing

Use the existing saved label sets, production handoffs and billing document lists. Document actions expose Save and print; opening print preview does not depend on a successful database save or activity-log request. Pending documents retain an exact local snapshot, stable identifier and original signed-in actor, with retries on reconnect. A pending financial copy is visibly a draft and has no invented official document number. Browser-storage failure warns that the window must remain open.

Shared save retries run only under the originating account. Conflicts remain available for review rather than overwriting newer records. Output activity also retries independently. Opening a print dialog is recorded as an action, never as proof that paper was printed; a user explicitly confirms physical printing.

## Existing lists and navigation

Saved records show the available saved-by identity, save time and print history. Production opens on saved handoffs, with order selection behind New handoff. Archive and Trash preserve issued production allocations; hiding a handoff does not authorize cutting the quantities again. Label Center no longer has the unrelated Orders shortcut. No new main-menu document register is added.

Back returns through the actual preceding views. Confirmed discard restores the saved working copy before returning. Payment selection uses searchable, paginated, consistent rows with aligned monetary information and a narrow-screen layout.

## Validation scope

Regression coverage includes offline save and reconnect, exact retained copies, actor scoping, duplicate-safe retry identifiers, nonblocking output logging, manual print confirmation, production lifecycle quantities, navigation/discard, payment selection, document PDF output and responsive layouts. Existing domain, API, contract, build and browser checks remain required before deployment. Fixture checks supplement live verification; they do not certify every possible workflow or printer.
