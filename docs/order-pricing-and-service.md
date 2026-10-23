# Order pricing, deliveries and client queries

Open **Orders → order actions → Pricing, deliveries & queries**. The same button is available in the order workspace, including completed orders.

## Pricing and eligibility

Set prices in Order setup or the **Order pricing** section. Rules can charge per student/package, per garment or a fixed order amount. Choose the grouping field and matching values (for example `BV,1-4` and `5-8`), rate, GST rate/HSN where relevant, and package contents. A package is billed once per eligible student; its shirts, trousers and other contents remain separate physical items. Garment pricing excludes items already included in a matching package. Overlapping prices for the same package are flagged.

In **People & eligibility**, review the actual people behind the counts. Cancelled, held and incomplete records are excluded. Confirm a standard size or record a reasoned billing override when appropriate. Individual rate exceptions and supplementary-batch references are saved with the person. Use cancellation rather than deleting a person with delivery/query history.

**Supplementary person** adds a new stable person ID without renumbering existing people. Enter their details, quantities, addition reference, and size, or enter their measurements in the normal workspace later. An incomplete new person remains excluded until ready.

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
