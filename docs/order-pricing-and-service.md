# Order pricing, deliveries and client queries

Open **Orders → order actions → Pricing, deliveries & queries**. The same button is available in the order workspace, including completed orders.

## Pricing and eligibility

Set prices in Order setup or the **Order pricing** section. Rules can charge per student/package, per garment or a fixed order amount. Choose the grouping field and matching values (for example `BV,1-4` and `5-8`), rate, GST rate/HSN where relevant, and package contents. A package is billed once per eligible student; its shirts, trousers and other contents remain separate physical items. Package entries can include interchangeable alternatives, such as Shirt or Kurti and Trousers or Salwar, with the same required quantity. Counts use each student’s assigned products; irrelevant variants are excluded. Garment pricing excludes items already included in a matching package. Overlapping prices for the same package are flagged.

In **People & eligibility**, review the actual people behind the counts. Cancelled, held and incomplete records are excluded. Confirm a standard size or record a reasoned billing override when appropriate. Individual rate exceptions and supplementary-batch references are saved with the person. Use cancellation rather than deleting a person with delivery/query history.

**Supplementary person** adds a new stable person ID without renumbering existing people. Enter their details, garment quantities (0 for variants not required), addition reference, and size, or enter their measurements in the normal workspace later. An incomplete new person remains excluded until ready.

## Partial or complete delivery

In **Deliveries & returns**, record person, garment, quantity, date and received-by/reference. Returns reduce net delivery. Replacement supply must reference an issue and does not create another package charge.

For a complete delivery, leave person/product unselected, enter the reference and choose **Review remaining delivery**. Review the list before confirming. A selected person or product limits that review. Only eligible pending garments are included. Save the order, then print the delivery record. Order-total bulk products use **Whole order / bulk goods**.

## Fitting, missing items, wrong sizes and other queries

Open an issue with the person/product, description, responsible person and promised date. Alterations and replacements default to no additional charge. Record a note when starting, reassigning, reopening or resolving an issue. Query history remains available after completion. Chargeable extra work requires an explicit amount; it enters billing review after resolution.

## Billing review

Save order changes first. Select eligible ordered quantities or actual delivered quantities; packages under the delivered basis are billable only once all their contents are supplied. Choose the tax register for the first invoice; subsequent reviews keep that register.

**Review current differences** shows the included people/items, exclusions, original invoiced value, credits, receipts, outstanding balance and customer credit/refund due. Enter a reason and apply the reviewed changes. The server recalculates from shared storage and rejects stale or concurrent reviews.

- First billing creates an invoice from the agreed rules.
- New students/items or agreed price increases create a linked supplementary invoice for the difference.
- Reductions create immutable linked credit entries against the source invoice. Original invoice lines and receipts remain intact; the adjusted invoice shows the credits and current balance.
- Free alterations/replacements do not create extra charges.
- Existing invoices without person-level links require **Adopt current roster as billed baseline**, followed by another review. This step preserves their original values; it does not automatically apply a credit. Check all historical differences before applying.

Client and signatory details can still be amended in Billing. Financial changes to linked invoices go through order billing review. Reported customer credit/refund due is a balance for follow-up; recording a credit does not send money through a bank or payment service.

## Access and history

Price and person eligibility changes require invoice-management access. Operational staff with order-edit access can record deliveries and queries. Financial values require financial-view access. Order saves retain version conflicts, shared storage, backups and audit history. Delivery history is append-only: correct it with a return/new movement rather than deleting it.

## Correcting a payment receipt
Open Billing → Payments & receipts → open the receipt → Amend receipt. Owners have this access. Other users need both See financial information and Amend payment receipts in their SEIKO access settings.

Correct the received amount, date, payment mode, reference or notes and save. The invoice/order link and original receipt number stay the same. Shared balances refresh immediately. The internal audit record retains original and corrected values, who changed them and when; amendment wording is not printed on the receipt. A stale edit must be reloaded, and an increase cannot exceed an invoice's current balance.


## Order-owned delivery and contextual navigation (2026-10-28)

The saved `SeikoOrder` remains the parent. `commerce.fulfilment` stores immutable request confirmations and prepared delivery snapshots; actual handovers append to the existing `commerce.deliveries` movement ledger. People, product assignments, measurements, specifications and pending quantities are resolved from that same order. A saved snapshot is historical evidence, not another editable roster.

- Preparation reserves unhanded items across open deliveries. Dispatch alone records no delivered quantity.
- Partial handovers record their receiver, date and exact order movement references.
- Acknowledgement is optional and separate: an authorised representative can acknowledge the whole handed-over delivery, selected items/people, or one person. Written confirmation needs its text/reference; signed confirmation needs an attachment. Partial quantities never appear as whole-delivery acknowledgement.
- Evidence is private, order-bound storage with authenticated access, upload type/size checks and a SHA-256 digest. New actions are stamped with the authenticated actor and server time.
- Earlier movements can be linked without adding quantities, fabricating signatures or inventing unknown delivery dates. The linking snapshot explicitly uses current names/sizes; the original movement dates remain intact.
- Cases retain the original person/product/handover reference. Returns and replacements continue through the same movement ledger. No acknowledgement, invoice or charge is created automatically.
- Confirmations, delivery items and action history are append-only. Stable action IDs make retrying a lost response safe; changed payloads with an existing ID are rejected.
- Delivery and case actions save immediately. Other staged eligibility edits still use the page's Save changes control.

App module Back follows the actual navigation path. Order setup, workspace, order management and invoice review have explicit source-owned return contexts. Reviewing an order from an unfinished invoice keeps the editor mounted and restores its draft on Back. Dirty order setup, person entry, billing/receipt, delivery and production drafts guard navigation before the destination clears their state. No DOM-generated Back button is added beside a native control.

Validation includes model tests for immutable history, quantity limits, linked cases, unknown dates and retries; private evidence API tests; browser confirmation/dispatch/partial handover/written and signed acknowledgement/case flows; invoice-draft return and discarded-Back protection; and mobile/tablet/desktop layouts. Tests use synthetic records and do not create historical acknowledgements in live orders.
