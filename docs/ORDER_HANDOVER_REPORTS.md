# Student handover reports

Open **Student handover list / PDF** from an Order Center row menu or the order workspace menu. The preview uses the entire order snapshot, independently of workspace search, hidden columns and pagination. Workspace changes must still be saved separately.

The default is a manual checklist: student name/class/reference fields, all named products, resolved quantities, totals and a check column. Choose individual student fields and products, optional sizes/measurements and specifications, and portrait or landscape A4. Printing uses the preview frame; choose **Save as PDF** in the browser print window.

Held records are excluded and disclosed. Zero-quantity rows remain visible. Order-total products are disclosed separately because their quantities have no student allocation. Product applicability and overrides share the packing quantity resolver. Nothing is marked delivered, invoiced or saved by previewing or printing.

For users with SEIKO financial viewing access, **Financial reference** loads only this order's billing documents on demand. Select one non-cancelled document to include its descriptions, quantities, rates, taxes and total. These are explicitly document amounts, not student allocations. Printing is disabled until a document is selected; failed or empty financial loading never produces invented prices. The checklist does not replace the invoice or statutory challan.

Validation: quantity/escaping/selection/financial-isolation unit tests, parameter-bound order-filtered billing API tests, and `node tests/stabilization-smoke.cjs --handover` exercise both menus, complete 101-record output, sizes/specifications, financial selection, desktop/mobile layout, printing and unchanged order storage.
