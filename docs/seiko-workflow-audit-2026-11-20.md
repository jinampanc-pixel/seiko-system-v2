# SEIKO workflow audit — 20 November 2026

## Scope and method

Reviewed the SEIKO app, its shared shell, document viewers and operational workflows against the code on main (starting at 98a40fc), live read-only navigation and isolated fixtures. Scope covers the SEIKO business; separate MeTh and Veyn business interiors are not certified by this audit. No production invoices, payments, dispatches, physical print confirmations, user permissions or restoration actions were created as test data.

This is a workflow and interface audit, not a claim that every possible role, data combination, physical printer or device has been exercised. Evidence below distinguishes live inspection, source review and regression checks. Larger redesign work remains explicitly listed rather than being called fixed.

Evaluation principles: consistent identification, sufficient labels and instructions, accurate status feedback, task-oriented actions, separation of saving from issuing, recovery without losing work, progressive disclosure, keyboard-accessible dialogs and narrow-screen usability. Reference material:

- https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html
- https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

## Findings and changes

| ID | Priority | Finding and consequence | Disposition |
|---|---|---|---|
| UX-01 | P1 | Trace renders hard-coded sample students and a fabricated cutting/stitching timeline as operational data. | Replaced with authenticated shared-record search, saved garment details, recorded deliveries and cases. No invented scan events. Removed unused sample label implementation. |
| UX-02 | P1 | A scan clears its code before an offline queue write, and quota errors can leave a tick against an unsaved scan. | Preserve the code on failure, distinguish Saved / Waiting to sync / Not saved, reject permanent server failures, prevent duplicate concurrent submissions, retain retry IDs, and preserve new scans arriving during earlier queue synchronization. |
| UX-03 | P1 | Archiving/removing a label batch immediately reloads the page, interrupting asynchronous persistence on a full-cache device. | Refresh the list in place; no forced reload during save. Immutable history remains. |
| UX-04 | P1 | Product-library state updates before browser persistence and closes its editor even when that persistence fails. | Persist before updating state; retain the editor on failure; clearly disclose the device-only suggestion library. Shared orders remain separate. |
| UX-05 | P2 | Production's Print / Save PDF opens a preview containing Prepare PDF, another Print / Save PDF, Open full document, then Download/Open/Share. | Source actions say Preview document, or Save draft and preview when saving is required. One shared viewer offers Print and one-click Download PDF; secondary fallback options are under More options. |
| UX-06 | P2 | Student handover uses a separate output flow and cannot directly download a generated PDF. | Uses the same viewer with existing financial/product readiness guards. Portrait/landscape exports preserve orientation. |
| UX-07 | P2 | Label Save PDF is actually browser printing and its PDF library implies files were saved. | One calibrated Print action; old history described as earlier requests, not proof of saved files. |
| UX-08 | P2 | No explicit shared record of intended printing, confirmed printing or items to keep. | Added Print & saved list: To print, Printed, Keep for later; per-business permission filtering, team member/time, content identity and immutable status history. Opening print never automatically marks Printed. |
| UX-09 | P2 | Retry label sync and recovery-download controls appear even after successful load/save. | Hide initial healthy status; saved notice is transient; recovery controls appear only when intervention is needed. |
| UX-10 | P2 | New mixed-product packing batches default to requiring every selected product, excluding valid people. | New batches default to Any selected product; existing saved matching choices remain intact. |
| UX-11 | P2 | Delivery confirmation uses the same Save delivery action label for dispatch, handover, acknowledgement and closure. | Labels state the actual action. Preparation, physical handover and acknowledgement remain separate. |
| UX-12 | P2 | Saving a production draft and saving/issuing look equally primary and use abbreviated language. | Save draft is primary; Save and issue to production is an explicit secondary action. |
| UX-13 | P2 | Label Center presents Orders as a second Back destination alongside the actual return path. | Orders is a destination action; only the actual return action is labelled Back. |
| UX-14 | P2 | Many mounted DOM enhancement layers change control wording/placement after React renders. This causes transient menu layout changes and makes future consistency repairs brittle. | Architectural follow-up: move these controls into their React owners, one flow at a time. Existing behaviour is preserved in this release. |
| UX-15 | P2 | Labels mix set, batch, layout and template; reusable layout saving sits beside saving people/selection. | Follow-up: one Batch term for saved selection; Layout for reusable design, grouped under secondary actions. Requires coordinated migration of the existing legacy editors and menus. |
| UX-16 | P2 | Person lists repeat long notes in rows, obscuring name/class and creating very tall entries. | Follow-up: concise identity summary with expandable notes, while preserving all fields in detail and output. |
| UX-17 | P2 | Settings routes users through an extra Open gate for access management and billing assets. | Follow-up: direct settings sections with one dialog owner. No permission/security changes made as part of visual auditing. |
| UX-18 | P2 | Scan infrastructure and production handoff work logs are separate systems; the old Trace screen hid that gap with a demo timeline. | Gap now honest. Unifying scan identities and production work requires a separate data integration; no historical events inferred. |
| UX-19 | P3 | Production uses Sheet, document and handoff for different levels without a consistent hierarchy. | Follow-up: Handoff for saved job; document type for cutting/stitching/allocation/bundles. Keep existing stored identifiers. |

P1 means potential operational misinformation or loss of unsaved work; P2 means a meaningful task-completion or clarity problem; P3 is lower-priority terminology consistency.

## Coverage map

| Area | Evidence and boundary |
|---|---|
| Sign-in / account / access roles | Source and authentication regressions. No live password/access changes. |
| Home / filters / customization / shortcuts | Live inspected and existing Home browser regression suite. |
| Menu / business switch / return navigation | Live inspected; source review; navigation regressions. Other businesses not audited internally. |
| Order list / search / archive / status | Live inspected; order/browser and server regressions. No real status/archive changes. |
| New/edit setup, recipient rules, quantities, pricing | Source review; existing order-rule workflows and failure-retention checks. No live setup edits. |
| Workspace / person entry / measurements / batches | Live inspected; Sheets, compound measurements, row identity and save-conflict regressions. |
| Order management / cases / eligibility | Live inspected; service model/browser regressions. No live case changes. |
| Delivery preparation / dispatch / handover / acknowledgement / evidence | Live inspected; delivery regression path with isolated fixture. No real movements. |
| Billing / invoice / quotation / challan / payments / receipts / amendments | Live navigation and source review; isolated billing browser/API regressions. No real financial transactions. |
| Production selection / draft / issue / lifecycle / work logs | Live inspected and source review; isolated multi-order and paginated production tests. No real release/closure. |
| All shared document previews / download / browser print / copies / orientation | Shared viewer exercised with isolated fixture; binary PDF validation; production/billing page-count checks in browser suite. |
| Label creation / individual and package editors / matching / saved batches / archive | Live inspected and source/model/browser regression coverage; existing layout behaviour retained. |
| Print & saved list | New API tests cover explicit state, transitions, deletion/history, search, permissions and business scope; viewer/list fixture exercises UI. Stores references, not uploaded PDF files. |
| Scan / queue / camera entry points | Live initial state inspected; source failure handling reviewed. Physical scanner/camera hardware not exercised. |
| Trace / global search | Live old Trace confirmed false demo; new view uses existing authenticated people endpoints and tests. |
| Client / product libraries | Live navigation/source reviewed; product cache failure and local/shared distinction fixed. |
| Settings / appearance / billing assets / user administration | Live read-only sections and source reviewed. No live theme or access changes. |
| Backups / recovery / activity | Source and existing runtime/browser regressions. No production restore/export or credential changes. |
| Jinam assistant | Entry point and source/tool boundaries reviewed; no claim of exhaustive model-quality testing. |
| Responsive / dialogs / keyboard / failure states | Existing responsive audit traverses 228 screen/viewport combinations; new viewer/list checks include 360–1366px. Physical print output remains device dependent. |

## Output workflow contract

- Preview document opens an in-app preview; it does not imply printing or downloading.
- Print requests the browser print dialog. Download PDF creates and downloads the file in one action.
- Save to list keeps a reference in shared storage, not a copy of the PDF file.
- To print and Keep for later are explicit team choices. Printed is explicitly marked by a person.
- Status changes keep their actor/time and history. Removing a list reference does not delete its underlying order/handoff/invoice or historical actions.
- Printing, downloading or bookmarking does not issue production work, mark delivery, charge a client or mark an order complete.

## Validation log

Local unit/API, build, rendered-route, lint and guarded CI/browser results are recorded in the implementation commit and release workflow. Headless Edge could not launch in the Windows sandbox; the installed Chrome channel supports the isolated browser checks. Local Chrome UI inspection and real downloaded PDF verification were also used. CI runs the browser suite on Linux.


### Verified release checks

- 453 unit, API and contract tests passed.
- Production build and rendered-route checks; lint has no errors (existing warnings remain).
- Isolated browser checks passed for multi-order production, 209-person pagination, delivery/acknowledgement, billing assets and amendments, student handover, dialog interactions and 228 screen/viewport combinations.
- New output browser checks passed for one-click download, portrait/landscape PDF geometry, iframe printing, explicit printed status, shared-list transitions, save failures, scan retry identity and menu bounds at 360, 390, 768 and 1366px.
- Seiko primary action verified as #173c5e with #fbf5ed text; menus use #c3a06c borders and ivory surfaces. Functional fixtures are isolated test pages and are not user-facing production screens.
