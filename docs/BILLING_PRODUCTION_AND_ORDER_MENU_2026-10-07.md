# Billing, production setup and order actions — 7 October 2026

## Billing

Billing uses the existing SEIKO brand asset, a consistent page heading, larger controls and readable document rows. Its navigation control returns to the main module menu. Invoices, quotations and challans have separate list filters; monetary summaries retain the selected source/search scope, which is explained beside them.

Document numbers open their previews. Each row has a viewport-contained action menu for opening/printing, amendment when permitted, invoice payment when an amount remains due, and invoice/receipt browsing. Existing authorization, numbering, payment allocation, audit and amendment rules are unchanged. A zero-total invoice is labelled Zero amount rather than presenting its zero outstanding balance as evidence of a payment. Non-priced non-GST challans show Not priced; their stored values and print behavior are unchanged.

The plain billing Export backup action is replaced by Backup & recovery. Existing browser-only billing documents/payments are not removed or automatically reissued. They can be included in the existing encrypted local recovery copy; a D1 system export does not include browser-only data.

## Production setup

The screen identifies its current scope accurately: business planning preferences stored in this browser. They are not shared D1 settings and do not currently drive order-generated identities or automatic payroll posting. This change does not claim to implement those missing integrations.

Existing policy and operation keys remain readable. New saves write policy and operations together to one :setup snapshot, so a failed storage write cannot leave half the new setup saved. Existing legacy values remain untouched. Unsaved changes and successful saves are reported separately; failed saves preserve the open edits. Operation names and non-negative numeric rates are checked. Blank means not set; zero remains a valid saved rate. Disabled rate controls explain access, payroll preference and Pay selection. Rate units are explicit, including the existing unsupported automatic hourly credit limitation.

## Order actions

The order-row menu names the selected order/client, uses at least 14px action text and 44px controls, and groups order, billing/documents, setup/labels and management actions. Order-specific targets and server-authoritative archive/delete controls are preserved. The viewport-sized panel scrolls on short/mobile screens; permanent deletion remains owner-only with exact order-number confirmation and financial-record protection.

## Verification

Browser tests use isolated real Orders/Billing API handlers and SQLite, including document-type filtering, server-assigned numbers, zero-amount display, scoped payments, preview/menu access, mobile bounds, production save/reopen and forced storage failure. Existing order, payment, archive/delete, labels and recovery checks are included in the final smoke suite. Runtime tests additionally check zero invoices and payroll credit conditions; production planning preferences do not themselves post credit.

Final validation: clean lockfile installation; all 283 contract/runtime tests, production build and three render tests passed. Full lint passed with zero errors and 24 warnings. The complete sequential browser smoke suite passed for Orders, Billing/production, shared labels and recovery. Desktop and mobile screenshots were reviewed; rate-unit text is visible without horizontal overflow.
