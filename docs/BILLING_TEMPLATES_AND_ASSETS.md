# Billing templates and assets

Billing → **Billing settings & assets** stores the business identity, supplier GSTIN, structured bank details, UPI ID, QR and logo, named signatories with signature/stamp images, default payment period, and separate invoice/quotation terms in shared `erp_preferences` storage. It uses the existing backup format and writes attributed, versioned snapshots to `erp_audit_events`. Concurrent saves are rejected rather than overwriting another manager's changes.

Owners manage supplier GSTIN and two access lists: settings managers, and additional users allowed to select saved signatures/stamps. Delegated users must already be active SEIKO members with financial-view permission. Settings managers can maintain business/payment assets and signatories. Invoice management alone does not allow changing account details or forging signatures. Document and receipt APIs enforce these restrictions independently of disabled form controls.

Uploads accept PNG/JPEG/WebP, re-encode to PNG and preserve transparency. Maximum source upload is 5 MB; each stored asset is bounded to approximately 160 KB and requests to 1 MB. Prefer transparent signature/stamp images. QR output has a white quiet margin, square contained dimensions and a labelled UPI section. Verify an uploaded QR points to the intended merchant before issuing documents.

New documents copy settings as a snapshot. Explicit amendments preserve the number, record a revision and can replace the saved details. Subsequent profile edits do not change previously issued invoices or receipts. Receipts support their own appearance snapshots, including advances recorded before an invoice exists.

Invoices offer due on receipt or a specific date. Legacy documents without either display “Not specified” instead of inventing a due date. Terms, signature, stamp and signing date are independently optional. Invoice defaults contain payment acknowledgement, a 10-day alteration window and jurisdiction wording; refund/cancellation policy belongs in quotation terms, which starts blank. No default late-payment charge is inserted.

The cream/navy/gold print theme retains the SEIKO logo, labels Attn and phone details, separates bank-transfer and UPI instructions, and keeps GST fields, receipt history and challan copy requirements. Two-copy printing falls back to separate pages when content does not fit; full copies use natural height with repeating table headers.

Validation: `npm test`; `node tests/stabilization-smoke.cjs --billing-assets` (optionally `BILLING_TEST_QR=/path/to/sample.png`), and existing billing smoke. Browser tests use an isolated SQLite database and synthetic clients/assets; they never write production documents.

GST and Non-GST documents have separate billing registers; new drafts inherit the selected register. Migration 0006 adds indexed database views `seiko_billing_gst_documents` and `seiko_billing_non_gst_documents` over saved tax modes, including existing documents. The API list operation accepts `taxMode` for separate retrieval. Existing numbers, history and payment references remain intact. Payments and unused advances remain shared because a single order advance can fund invoices in both registers; register totals explain this scope. The views are logical storage separation within the backed-up billing database, not separate databases or access permissions.
