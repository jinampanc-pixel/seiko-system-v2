# SEIKO Stage 2 acceptance lock

This checklist records the accepted SEIKO order and label behavior carried by `fix/veyn-milestone-one`. It is a regression guard, not a new workflow or business scope.

## Order Center and Order Setup

- Archive is an explicit order action. Archived orders are viewed through the `Archived orders` control and can be restored there.
- Every Order Center record has a consistent three-dot action menu for its contextual actions.
- Order Center search is complemented by compact filters for status, client type, context-relevant product and delivery timing, including overdue and next-7-days views. The weak records-present/absent filter is not part of the main filter set.
- Client type choices expand from saved SEIKO order data. Product choices expand from saved order products and narrow automatically to the selected client type; filters do not edit master data.
- Billing and Payments remain first-class SEIKO modules and are not injected into each order row menu.
- Delivery address and billing address share one row on desktop when space permits and stack responsively on smaller screens.
- Person / record fields follow the selected client type and must not hardcode school-only terminology.
- Quantity mode, specification type, and value-assignment mode are fixed workflow choices and stay native selects; they are not owner-editable master data.
- Group quantity rules use one default quantity plus exceptions. An exception may target several values or a numeric range such as `1-7`, and quantity `0` is valid.

## Order Workspace

- Spreadsheet entry supports paste, keyboard movement, selection, safe multi-row add, multi-row delete, undo/redo, stable Person IDs, search, column visibility, and one pagination state.
- Row selection follows spreadsheet conventions instead of checkbox-list conventions: row-number headers select rows, Shift-click selects a range, Ctrl/Cmd-click adds or removes rows, and the top-left corner selects all visible rows.
- Multi-row add and destructive operations require confirmation.
- Save gives feedback. Save & close and Close without saving require explicit confirmation.
- Labels is one navigation point from the workspace; label creation and saved label work live in Labels.

## Label Center and label workspace

- Every saved label-set record and every label-source record in Label Center has a consistent three-dot contextual action menu.
- `Layout Library` is discoverable and `Save label set` is a primary action.
- A Layout is a reusable physical label design: size, chosen components/information, typography, code configuration and placement. A Label set is this order/job's selected records for repeat printing.
- Label representation is changeable in the designer: physical item, person/package, grouped package/group, product/stock group, or whole order. The create route supplies only the initial representation and never locks it.
- Custom selection is explained and exposes explicit Information field, Free text, QR code, Barcode and Sequence components.
- Label information is grouped as Core information, Person details, Product details, and Trace & codes. There is no unexplained Style group and no customer-update control in label information.
- Core information is limited to saved order-level details from Order Setup. Person details contains person/record fields, Product details contains product data, and Trace & codes contains generated trace information. Classification/group belongs to Person details.
- Available label information is purpose-aware for Production, Packing and Inventory while `Person / workpiece` remains a valid person identity field for packing where relevant.
- Removing a selected information chip with its `×` must click the React-owned field checkbox, actually deselect the underlying field, and remove it from preview/print state immediately; visually removing only the chip is never sufficient.
- Information search is collapsed behind a compact magnifier control rather than permanently consuming a full row.
- Preview sample selection is independent from the print selection, so mixed orders can inspect the correct person/product label without changing the labels queued for print.
- Packing cards show package contents and totals rather than misleading garment-size summaries.
- Record search covers all order data. Filter controls support product, package/group, package contents and every configured person/record field; sorting supports order sequence, person, product and group/package. The visible records list must be derived from those filters and sort choices, not merely display controls that do nothing.
- Trace fields support physical piece/pair position, package/set position, order position, person position, product position, and numbering within every configured person/record field. `Show of total` is configurable per trace field.
- Preview uses the physical label aspect ratio, a 1 mm grid, point-to-mm typography, 0.25 mm keyboard nudging, deterministic wheel resizing and touch/mobile shrink/stretch controls.
- Authorised users can create and edit custom physical size presets. The calibrated Pixra preset is protected but can be copied and edited. Roll geometry is validated, preview and print continue to use physical millimetres, simple layouts reflow, and advanced elements are clamped inside a changed physical boundary.
- Print output stays in physical millimetres and preserves the 1.5 mm right-side safety boundary.

## Implementation hygiene

- Superseded UI adapters, split menus and custom selector wrappers must be removed when their accepted replacement lands; leaving dead overlapping enhancers in the active source is a regression risk and is not considered complete implementation.
- Temporary one-shot patch workflows/scripts used during an in-chat edit must remove themselves after their source commit; they are never part of the accepted application architecture.
- Acceptance is revalidated only after lint, all contracts, production build, render checks, and the existing branch-preview smoke test are green on the same cleaned source head.

These behaviors must remain additive to the restored Stage 1 label stack unless an explicitly approved replacement supersedes them.
