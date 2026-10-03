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

The smoke mounts the production Home, AccessProvider, BusinessApplicationRouter, all current enhancement layers and ordered styles. It follows Home → Orders → Billing → order payment → receipt → Back → Home, verifies the receipt reference/amount and persisted payment row, and fails on page errors. Real billing/client handlers run against isolated in-memory SQLite; authentication and order responses are test fixtures. It does not validate production credentials, Cloudflare infrastructure or live data. The Home menu accepts its current Home/Overview naming inconsistency; fixing that is Stage 4. Closing Back to Home currently dismisses the billing overlay, so the smoke explicitly chooses Home afterward.

## Verification

- Locked dependency installation (`npm ci`).
- All root suites: 259 passed, zero failures (257 contracts/runtime tests plus two rendered routes).
- `npm test`: all contracts, production Worker build and rendered routes.
- `npm run lint`: zero errors, 23 reviewed warnings.
- `npm run test:smoke`: payment persisted, receipt rendered, navigation completed, zero page errors.
- Physical packing canvas, packing output and billing browser regressions are run against the isolated fixtures.

The local Vinext dev Worker cannot start because its generated configuration repeats `nodejs_compat`; the plain Vite browser fixtures avoid that unrelated runtime startup issue. Production compilation and built Worker render checks are independently verified. Remote GitHub CI remains the release authority; no production deployment is requested by this stage.
