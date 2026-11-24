# Dialog, Menu and Quick Payment Audit — 24 November 2026

## Dialogs and Options

Reviewed the shared action menus, Billing New Document and filters, billing row actions, saved production/label actions, workspace tools, order actions, column chooser and row menus. Action panels use the browser top layer to avoid clipping and stacking conflicts, clamp to the visible viewport, remain open during pointer departure and scrolling, and dismiss on outside click or Escape. Existing dialog focus containment, busy-save protection, failed-save draft retention and focus return remain in place.

## Payment Slips

Billing New Document → Payment Slip and Record Payment → Quick Payment Slip accept payer, amount, date, payment mode and optional phone/reference/notes without an order or invoice. Slips use the existing shared receipt table and numbering, pending-save recovery and print workflow. They appear in the existing Payments & Receipts list with an Unlinked status, rather than a new menu/list.

Link to Order / Invoice preserves the receipt ID, number, amount and original payer snapshot, records the linking user/time in audit history, and updates allocation through the normal billing model. Server checks reject already linked receipts, stale revisions, invalid dates, unavailable targets and invoice overpayments. Atomic snapshot guards reject concurrent payment or invoice edits. Order linking can retain excess funds as an advance.

## Menu Arrangement

The lower section has its existing divider above MeTh Jobs and a separate divider above Settings. Settings → Menu Layout contains the drag handles; mouse drag, touch hold-and-drag and keyboard Arrow Up/Down reorder items within their main/lower groups. The main menu contains no editing controls. Its height follows the content, with fixed minimum row heights and scrolling only when needed. Preferences are per business on the current device and do not alter permissions. Tab follows visual order; the drawer stays inside the viewport while scrolling.

## Validation

Runtime payment tests cover idempotent creation, duplicate conflicts, linking, receipt-number preservation, audit history, stale revisions, concurrent invoice edits, invoice balance protection and order advances. Browser workflows cover mouse/touch/keyboard reordering, persisted menu order, separate divider, bounded top-layer menus at phone/desktop sizes, focus/pointer persistence, Escape/outside dismissal, quick-slip creation and later linking. Existing dialog, responsive and printing workflows are also checked.
