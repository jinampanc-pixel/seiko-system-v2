# Stage 1 — engineering baseline

Source: GitHub main `d5bd1a159ef1795a1df1b5d41263ec4ca5b0de1d` (audit after recovery checkpoint `16afe2e`). This stage preserves the current accepted interface, document wording, saved layouts and payment behavior. It does not undertake the later navigation, storage or stylesheet consolidation.

During publication, main advanced to `63dd350` with additional order-workflow acceptance requirements. That audit correction is preserved. This batch completes the originally requested failing-test/lint baseline and its navigation/payment smoke. The newly added Save & Close, server-authoritative archive/delete, Home status, visible row status and order-context financial actions remain open; Stage 1 as amended by that correction is not complete.

## Classification of the 12 audited failures

All twelve were stale implementation contracts, rather than evidence of a current product regression. The replacements check the current source and are supplemented by executable packing presentation tests and browser checks. Acceptance evidence is the committed physical designer, canvas, print route and billing select at the audited baseline; no former feature is restored solely to satisfy a regex.

| Original failed contract | Current acceptance evidence / replacement |
| --- | --- |
| Billing architecture / Without GST | Explicit `non_gst` option is labelled Non-GST document; retain GST and payment contracts. |
| Native designer maps generic product slots | Physical designer builds actual person packages with packing quantities and AND/ANY eligibility, rather than synthetic numbered slots. |
| Synthetic order removes measurements | Legacy slots and measurement boxes migrate once into the package block; no synthetic order is built. |
| Auto-fit uses DOM font scaling | Preview and print share measured SVG text fitted to the saved rectangle. Preserve the preferred font and wait for fonts before printing. |
| New fields use `currentItems, key` | Information drawer uses `freePlacement(draftItems, field)`; Cancel/Apply remains transactional. |
| Package contents calls `resolvedQuantity` directly | Shared `packingQuantities` supplies record quantities; zero products and absent conditional details are omitted. |
| Saved sets use v3 designer | Current saves use v4; the existing migration reader accepts older fields. |
| Drag-to-trash resides in packing designer | Shared physical canvas removes only `start.item.id`; cancelled and resize gestures do not remove fields. |
| Flow/inline/separate option wording | Current Flow rows, Inline, Separate movable rows options retain all three layouts and configurable delimiter. |
| Placement and text fitting use old loop | Current free placement and measured SVG renderer replace the retired font-decrement loop. |
| Saved set restore uses `task` effect | Current lazy initialization reads `openedTask.presentationRules` and `openedTask.packagePresentation`. |
| Canvas/print renderer uses old class/signature | Both call `renderItem(item, record)` and print uses `physicalPrintSheet`. |

New executable tests exercise the actual presentation builder, quantities, held records, conditional details, aliases, inline separator, legacy migration and free placement. Existing browser regressions cover SVG fitting, shared preview/print output, drag deletion and Undo. The horizontal-resize check now compares the SVG vertical transform and saved height; Chromium glyph bounding rectangles vary with hinting under non-uniform scale even when those values stay fixed. The product geometry is unchanged.

## Lint review: all 28 warnings and one error

The unused receipt-test invoice was removed (the blocking error). Five warnings were eliminated: four obsolete eslint directives in the two generic designers, and an unused row index in the operational adapter. No lint rule was weakened. The remaining 23 warnings are deliberately visible and non-blocking under the existing configuration; lint is not warning-free.

Baseline locations below refer to the audited source, before removal of unused directives.

| File / baseline line(s) | Count | Review / decision |
| --- | ---: | --- |
| label-designer-v2.tsx:2; label-designer.tsx:2,370,395 | 4 | Removed unused suppressions. |
| seiko-operational-finalize.tsx:245 | 1 | Removed unused index; row selection still uses record ID. |
| channel-connection-settings.tsx:44 | 1 | Effect reads OAuth return URL into notice. Retain return-message behavior; controller extraction belongs with consolidation. |
| label-designer-v2.tsx:466,478 | 2 | Reconciles generated selection and opens stored tasks. Retain current selection/restore timing. |
| label-designer-v2.tsx:638 | 2 | Pointer/keyboard canvas semantics are supplied by the existing accessibility adapter. Move ownership into the source component during consolidation, with keyboard browser tests. |
| label-designer.tsx:186,216,248 | 3 | Clears invalid grouping, bounds fields after preset changes, removes unavailable fields. Preserve these normalization effects until controller extraction. |
| label-designer.tsx:250 | 1 | Compiler cannot preserve manual memoization; runtime calculation remains correct. Compiler adoption is separate from stabilization. |
| label-designer.tsx:373 | 1 | One-shot session intent intentionally follows business/order identity. Adding an unstable restore function to dependencies can replay or cancel restore. Retain warning; replace intent ownership during navigation consolidation. |
| labels/create/page.tsx:169; labels/print/page.tsx:39 | 2 | Loads route/local saved state after browser mount. Preserve SSR/browser separation and saved-task restore. |
| meth-fulfilment-routing.tsx:114 | 1 | Mount loads external settings. Preserve request timing; asynchronous results update state. |
| modern-auth-ui.tsx:46,94 | 2 | Consumes authentication return message and loads account methods. Retain login and passkey behavior. |
| orders.tsx:56 | 1 | Pre-existing unsupported defaultOpen prop. Changing the initial expansion is outside accepted behavior; resolve with the source-owned setup form and an expansion regression test. |
| orders.tsx:219 | 1 | Workspace event subscription depends on current order/columns. Adding recreated command functions would rebind every render; retain warning pending stable controller callbacks and workspace browser coverage. |
| packing-person-label-designer.tsx:418 | 1 | Layout effect measures initial text geometry before paint. Deferring it can expose wrong saved box sizes. Keep visible until measurement state is consolidated. |
| seiko-billing-workspace.tsx:42; seiko-client-directory.tsx:11 | 2 | Initial shared database loads. Preserve busy/loaded and permission states; navigation/payment smoke verifies billing mount. |
| seiko-phase1.tsx:158 | 1 | Resets pagination when filters/mode change. Preserve reset behavior; move into the future Home controller. |
| veyn-billing.tsx:57; veyn-orders.tsx:55 | 2 | Initial server loads for a separate business. No timing changes to VÉYN in SEIKO stabilization. |

## Gates and smoke

`test:contracts` now includes every committed root `*.test.mjs` suite except the post-build render suite. Previously, several packing suites containing the audited failures were absent from the default gate. New suites must be added to this explicit list.

Both CI and the manually triggered production deployment run lint, all contracts, production build, rendered-route checks and the navigation/payment browser smoke before deployment. The smoke runner starts and closes its own Vite fixture server and uses headless Chromium in CI. Locally, `PLAYWRIGHT_CHANNEL=msedge` selects installed Edge. Install Chromium with `npx playwright install --with-deps chromium` when needed.

The smoke mounts the production Home, AccessProvider, BusinessApplicationRouter, all current enhancement layers and ordered styles. It follows Home → Orders → Billing → order payment → receipt → Back → Home, verifies the receipt reference/amount and persisted payment row, and fails on page errors. Real billing/client handlers run against isolated in-memory SQLite; authentication is a fixture. The expanded smoke below also runs the actual order handler. It does not validate production credentials, Cloudflare infrastructure or live data. The Home menu accepts its current Home/Overview naming inconsistency; fixing that is Stage 4. Closing Back to Home currently dismisses the billing overlay, so the smoke explicitly chooses Home afterward.

## Verification

- Locked dependency installation (`npm ci`).
- All root suites: 259 passed, zero failures (257 contracts/runtime tests plus two rendered routes).
- `npm test`: all contracts, production Worker build and rendered routes.
- `npm run lint`: zero errors, 23 reviewed warnings.
- `npm run test:smoke`: payment persisted, receipt rendered, navigation completed, zero page errors.
- Physical packing canvas, packing output and billing browser regressions are run against the isolated fixtures.

The local Vinext dev Worker cannot start because its generated configuration repeats `nodejs_compat`; the plain Vite browser fixtures avoid that unrelated runtime startup issue. Production compilation and built Worker render checks are independently verified. Remote GitHub CI remains the release authority; no production deployment is requested by this stage.


## Confirmed order workflow repairs

The expanded audit's Stage 1 order repairs now use explicit, versioned server commands. Save & Close and Back to Orders wait for D1 acknowledgement before updating the local cache and returning to Order Center. Failed writes keep the draft open with an error. React owns the Order Center status control and its complete action menu; legacy adapters no longer hide its status or intercept its deletion as a discard action. Home status changes retain the selected list, filters and pagination.

Archive/restore updates shared storage. Deletion requires owner membership, orders.edit, an exact order-number confirmation and an unchanged version. Orders with linked billing documents or payments must be archived. Deletion retains an audited tombstone in the existing order table; lists exclude it and stale imports/upserts cannot recreate it. Billing creation and direct payments atomically require a live source order, and amendments preserve the source link. No schema migration or production-data operation is part of this change.

Order-specific menu actions open the payment form, payment/receipt history, invoice, challan and quotation drafts with that order selected. Setup and label creation also retain order identity. The default CI/deployment smoke now includes these workflows. Six stale source assertions were updated for the explicitly requested visible statuses, authoritative archive handler and filter reset after a successful save.

Verification: npm ci from the committed lockfile; npm test (258 contract/runtime tests and two rendered routes, all passing); expanded Playwright smoke against the production React components and styles with real order/billing/client handlers and D1-compatible SQLite. Browser coverage includes save/reopen/reload, failed save, unchanged Home list, visible statuses, scoped payments and receipts, all commercial draft types, setup, label-route order identity, archive/restore/reload, protected deletion, exact confirmation, audit tombstone, fresh browser reads and deletion hidden for non-owners. Executable API tests also check version conflicts, business isolation, permission denial and stale-import protection.

The setup browser regression also passes required client/phone validation, product measurements, shared creation and reopen; billing and physical packing browser regressions pass.

Lint remains at zero errors and the same 23 reviewed warnings; no rule was weakened. Failed archive requests also leave the order visible and unchanged.

These isolated checks do not constitute a live production D1 or backup/restore drill. A separate exploratory tsc --noEmit check still reports existing repository type errors (including missing Cloudflare worker declarations); the repository's supported production build and render gate passes. CSS and remaining enhancement consolidation belong to Stage 4, with incremental browser verification rather than combining the application into one file.

The first Linux Chromium CI run exposed a clipped menu: automatic scrolling closed the menu before owner deletion could be clicked. Order Center now positions its source-owned panel within the viewport, and scrolling inside action panels keeps them open. The browser regression exercises deletion in a 500-pixel-high viewport.

## Production Save & Close failure — 4 October

Read-only Cloudflare live logs confirmed that the Orders API failed before entering its request handler: importing order-domain initialized client field presets using crypto.randomUUID(), forbidden during Workers module initialization. The request returned HTTP 500 instead of JSON, which the client reported as a generic network failure. The API now imports the canonical statuses from an inert module; order-domain re-exports them for existing consumers. Client field creation and accepted order behavior are unchanged.

Authentication and D1 session initialization now participate in the API's JSON error boundary. The client distinguishes expired sessions, unreadable HTTP responses and malformed acknowledgements while keeping edits open. Save & Close still waits for a successful shared write before returning to Order Center.

Verification includes a production-build cold-start request in Miniflare/workerd, a module-import test that forbids random generation, and browser checks for HTML gateway failures, expired sessions, malformed success responses and a successful retry of the retained draft. The local workerd binary supports compatibility dates through 22 May 2026, so its regression uses that date while production retains its existing 15 August configuration. Full contracts/build/render and browser workflow checks pass; lint remains zero errors with 23 reviewed warnings.

The follow-up workflow brief is retained in FOLLOW_UP_ORDER_REQUIREMENTS.md as requirements for a later stage, per the user's instruction. It is not implemented during this repair.
