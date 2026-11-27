# Billing and Financial Audit — 27 November 2026

## Release criteria

Financial mismatches are release blockers. Planned order pricing is independent of production readiness when the order uses entered/setup quantities. Explicit zero assignments are not charges. Issued documents are historical snapshots; additions and reductions use reviewed reconciliation rather than silently rewriting billed quantities.

The user has clarified that the acceptance scope is the future system, using current orders as reference cases. Existing orders are not reconciled, migrated or deleted by this work. New manual and assistant-created orders use ordered quantities; newly added per-person rules are explicit rather than inheriting legacy package semantics.

This audit checks the application's calculations and persistence. It is not a certification that all possible future input or accounting scenarios are defect-free.

## Confirmed defects repaired

| Area | Defect | Correction |
| --- | --- | --- |
| Invoice collection | Direct payments checked direct receipts but ignored allocated order advances. | Calculate outstanding after allocation and reject a stale ledger snapshot atomically during insertion. |
| Receipt amendment | Increasing a direct receipt could consume balance already covered by an advance. | Recalculate the available balance without that receipt; guard both invoice and receipt snapshots in the update. |
| Payment retries | Reusing a direct-payment ID with different amounts/details could report success. | Compare immutable collection fields before and after insertion; require explicit amendment for corrections. |
| Document retries | A duplicate document ID with changed lines could report success. | Persist and compare a SHA-256 fingerprint of the submitted creation request. |
| Document identity | Amending a document's issue date across years changed its generated number. | Preserve the resolved original number on amendment and in subsequent billing reconciliation. |
| Advances | Allocation order followed insertion timestamps rather than invoice issue dates. | Allocate oldest issue date first, retaining deterministic creation/number/ID tie breakers. |
| Access | Quotation and challan actions were controlled by invoice-management permission. | Enforce the document type's own permission in the API and editor actions. Payment management remains separate from those document permissions. |
| Group pricing | A group's zero-quantity report included other groups. | Filter Not Ordered rows with the same group predicate as priced and excluded rows. |
| Balance display | Cancelled or trashed invoices could expose a positive outstanding balance. | Return zero payable balance while retaining the historical invoice and receipts. |
| Validation | Numeric overflow could produce NaN and evade the maximum-total comparison. | Reject nonfinite totals. Reject invalid calendar dates in adjustment requests and null request bodies. |
| Print wording | Rounding paise could print 100 Paise without carrying into rupees. | Derive words from integer paise. |
| Refunds | Credits and excess advances had no explicit refund-receipt flow. | Add permission-controlled refunds linked to original receipts, with numbered RFD receipts, an immutable signed money-out record, saved user identity and atomic credit-balance checks. Original receipt amounts remain unchanged. |
| Payment preview | Unsaved advances could show an allocation different from the saved ledger. | Use the shared allocation model for the live payment preview. |
| Planned pricing | Awaiting measurements could prevent pricing even when ordered quantities were known. | Ordered-quantity pricing includes awaiting measurements while production eligibility remains blocked; held/cancelled records remain excluded. |
| Price coverage | Extra assigned garments without a complete applicable price could disappear from an apparently complete total. | Report uncovered quantities by person and garment, label the pricing check incomplete, and block reviewed invoice application until the selected group's price coverage is complete. Delivery billing checks the same planned coverage. |
| Conflicting prices | Legacy overlapping rules could exclude one group's charges while allowing a partial invoice for the other group. | Block reviewed invoice issuance on conflicting, pending or incomplete pricing conditions. |
| Per-person pricing | Explicit per-person rates were still constrained by fixed package quantities. | In ordered-quantity mode, an explicit person rate covers their actual assigned contents once; delivered billing waits for those assigned quantities. Set pricing retains complete-set counts. Legacy unspecified package modes remain unchanged. |
| Free-price mistakes | A default or overridden zero rate could silently produce free garment lines. | Future ordered pricing requires recorded zero-price approval, including individual zero overrides; manual invoice/quotation zero lines require a reason. Financial approval text is redacted from nonfinancial staff and cannot grant production eligibility. |
| Stored ledger consistency | Damaged JSON amounts, identities, invoice snapshots or integer-paise columns could disagree. | Billing and order-billing check stored identities/totals, invoice links, refund sources and monetary conservation before reading or changing financial records. Failures block further financial mutations rather than manufacturing zero balances. |
| Pricing bypass | A future linked order without agreed pricing could use a manual invoice. | New ordered-quantity orders must use reviewed agreed pricing before invoicing; missing per-person quantities also block finalisation. |
| Pending money | A future-dated promise could be recorded as received cash, reducing today's balance. | Future-dated receipts and refunds are rejected. Invoice due dates can remain in the future while part payments reduce only the amount actually recorded as received. |
| Consistent financial views | Separate invoice/payment reads could mix different moments during a concurrent change. | The integrity gate and billing responses use a single SQLite statement for the ledger snapshot. Saved action retries remain idempotent even if the client master is later archived. |
| Retained garments | Cancellation, operational holds or zeroing an assignment could remove charges while garments remained with the customer. | Ordered pricing retains net supplied quantities until returns are recorded; holds remain operational rather than automatically cancelling financial obligations. |
| Fixed-price coverage | A fixed fee could implicitly cover all garments, including later additions. | Fixed garment coverage is approved against current product totals. Added quantities require renewed coverage approval or their own prices. Scope cannot be fabricated beyond current quantities. |
| Quantity descriptions | Per-person pricing could display default package counts instead of actual assigned quantities. | Descriptions distinguish per-person charges; brief piece totals use actual assigned/retained quantities without inventing a per-set rate. Bulk order-total garments are charged once rather than assigned to the first student too. |
| Handover and deletion | Unpriced garments could be handed over, and an unbilled order with handover history could be deleted. | New ordered-quantity handovers require price coverage; historical handovers remain recordable for recovery. New orders with handover/return history must be archived rather than deleted. |

## Verification matrix

For new ordered-quantity orders, free replacements require an original supply and a recorded return. Replacement quantities cannot exceed returned quantities or the current assignment. Retained replacements remain included in financial quantities after cancellation; returning a replacement permits a subsequent replacement without double charging. Legacy replacement behavior is preserved.

| Flow | Required evidence |
| --- | --- |
| Planned pricing | Pair/set quantity, extra garments, assigned zero quantities and missing measurements remain independent of production. |
| Partial delivery | Manual expected totals across 216 garment/delivery combinations; delivered charges never exceed the planned charge in those cases. |
| Reconciliation | Existing tests cover first issue, added people, supplementary invoices, appended invoice sections, cancellation credits, immutable original lines and no repeated charges. |
| Payment allocation | Hundreds of paise-level amounts conserve receipt value: applied money plus unallocated advance equals received money. |
| Concurrent collection | A newly arriving advance invalidates the direct-payment write; the stale receipt is not saved. |
| Retry safety | Same request succeeds once; changed request under the same ID conflicts without changing money or creating a second record. |
| Identity and permissions | Cross-year amendments preserve document/receipt numbers; quotation/challan grants do not authorize invoices or collections. |
| Print and UI | Existing billing print, profile/assets, desktop billing and mobile payment workflows remain release checks. |

## Operational limits

- No live invoices, receipts, prices, person quantities or student measurements are altered by the automated audit fixtures.
- A saved document does not imply successful physical printing. Browser print completion cannot establish printer success.
- Refund disbursement is recorded explicitly through Record Refund on a receipt. The app records money returned; it does not initiate a bank transfer. Refund limits use the source receipt's unused advance/unlinked amount or the linked invoice's overpaid credit. Refunds and source-receipt amounts/dates cannot be rewritten after money is refunded. Duplicate and concurrent refunds cannot spend the same balance twice. Refund receipts share the existing Payments & Receipts list, print workflow, pending-save recovery and backup/audit tables.
- Tax calculations are tested as software arithmetic; this audit does not change tax policy or supply legal/tax advice.
- Supplier/fabric purchasing, production cost allocation and ready-made procurement are explicitly deferred by the user. This release does not introduce purchasing, stock valuation or cost-entry workload, and does not claim those future modules are implemented.
- The concurrency guard currently reads the shared billing ledger. It prioritizes correctness; larger ledgers warrant an indexed per-order ledger revision and scoped allocation query rather than removing the guard.
- Independent backup activation and R2 provisioning are outside this audit and remain subject to the previously recorded configuration constraints.
- Existing orders retain their legacy measurement-inference mode until their saved quantities are reviewed and the order is switched to Order Setup / Entered Quantities. The audit does not silently migrate historical orders or replace deliberate zero exceptions. Entirely ineligible legacy records remain shown as excluded; they are not invented as new billable quantities.
- The optional repository-wide standalone TypeScript check still reports existing missing Cloudflare type declarations and errors in other modules; it is not a clean project-wide type check. The required runtime tests, production build, lint and relevant browser workflows are separate release checks.

## Dependency audit

Final local validation passed: 506 contract tests, 4 document-outbox tests, the production build and 4 rendered-output tests. Lint across tracked source reported zero errors and 49 warnings, including two explicitly ignored-file notices. The broad local lint command also traverses ignored scratch scripts; those scripts are excluded from the committed release. The complete browser workflow suite passed during this audit; the guarded release repeats validation against committed source.

The locked dependency audit identified GHSA-xqc2-xf4c-x3h3 affecting the installed React Server Components package. React, React DOM and react-server-dom-webpack were updated together from 19.2.6 to the compatible patched 19.2.9 release. A subsequent registry audit reported zero critical advisories; 33 lower-severity dependency advisories remain (17 high, 15 moderate, 1 low), including build/development dependencies. This is not a claim that dependency remediation is complete. Upgrading the build stack is separate compatibility work and must not be replaced with an unreviewed force update.

Allocation tests iterate every paise amount from ₹0.01 through ₹600.00 across two invoices and assert conservation and oldest-invoice-first allocation. Allocation groups/direct sums and refund validation use indexed maps rather than rescanning every receipt for each invoice. Monetary sums used for invoice applications and unused advances use integer paise; unsafe aggregate currency ranges fail the integrity check.

Validation completed during this pass includes contract/outbox tests, production builds, render tests and the complete repository browser workflow suite. Targeted finance tests additionally cover corrupted stored totals, zero-price approvals, future promises, archived-client retries and financial metadata redaction. One earlier mobile run timed out in the existing menu-layout setup step during concurrent checks; its isolated rerun and the subsequent full suite passed. Target lint has no errors and three existing warnings. Final test counts and the committed-state guarded release result must be reported from their actual completed runs.
