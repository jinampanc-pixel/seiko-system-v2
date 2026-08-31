# SEIKO Stage 2 acceptance lock

This checklist records the accepted SEIKO order and label behavior carried by `fix/veyn-milestone-one`. It is a regression guard, not a new workflow or business scope.

## Order Center and Order Setup

- Archive is an explicit order-list action. Archived orders are viewed through the `Archived orders` control and can be restored there.
- Billing and Payments remain first-class SEIKO modules and are not injected into each order row menu.
- Delivery address and billing address share one row on desktop when space permits and stack responsively on smaller screens.
- Person / record fields follow the selected client type and must not hardcode school-only terminology.
- Quantity mode, specification type, and value-assignment mode are fixed workflow choices and stay native selects; they are not owner-editable master data.
- Group quantity rules use one default quantity plus exceptions. An exception may target several values or a numeric range such as `1-7`, and quantity `0` is valid.

## Order Workspace

- Spreadsheet entry supports paste, keyboard movement, selection, safe multi-row add, multi-row delete, undo/redo, stable Person IDs, search, column visibility, and one pagination state.
- Multi-row add and destructive operations require confirmation.
- Save gives feedback. Save & close and Close without saving require explicit confirmation.
- Labels is one navigation point from the workspace; label creation and saved label work live in Labels.

## Label workspace

- `Layout Library` is discoverable and `Save label set` is a primary action.
- Label representation is changeable: physical item, person/package, grouped package/group, product/stock group, or whole order.
- Custom selection is explained rather than presented as an unexplained mode.
- Label information is grouped as Core information, Person details, Product details, and Trace & codes. There is no unexplained Style group and no customer-update control in label information.
- Removing a selected information chip must actually deselect the underlying field.
- Preview sample selection is independent from the print selection, so mixed orders can inspect the correct person/product label without changing the labels queued for print.
- Packing cards show package contents and totals rather than misleading garment-size summaries.
- Record search covers all order data. Filter controls support product, package/group, package contents and every configured person/record field; sorting supports order sequence, person, product and group/package.
- Trace fields support physical piece/pair position, package/set position, order position, person position, product position, and numbering within every configured person/record field. `Show of total` is configurable per trace field.
- Preview uses the physical label aspect ratio, a 1 mm grid, point-to-mm typography, 0.25 mm keyboard nudging, deterministic wheel resizing and touch/mobile shrink/stretch controls.
- Print output stays in physical millimetres and preserves the 1.5 mm right-side safety boundary.

## Implementation hygiene

- Superseded UI adapters, split menus and custom selector wrappers must be removed when their accepted replacement lands; leaving dead overlapping enhancers in the active source is a regression risk and is not considered complete implementation.
- Acceptance is revalidated only after lint, all contracts, production build, render checks, and the existing branch-preview smoke test are green on the cleaned source.

These behaviors must remain additive to the restored Stage 1 label stack unless an explicitly approved replacement supersedes them.
