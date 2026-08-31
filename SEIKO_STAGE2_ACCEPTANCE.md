# SEIKO Stage 2 acceptance lock

This checklist records the accepted SEIKO order and label behavior carried by `fix/veyn-milestone-one`. It is a regression guard, not a new workflow or business scope.

## Home

- Home has two functional areas only: a configurable operational dashboard and a configurable Quick access area for modules/features.
- Dashboard metric cards are interactive and open their relevant module; they are not decorative statistics.
- Dashboard visibility is user-configurable and persisted, including individual metric cards and the Active orders list.
- Quick access module visibility is user-configurable and persisted independently of the dashboard.
- The Active orders dashboard list must scale beyond 100 orders through search, client-type filtering, context-relevant product filtering and pagination/page-size controls.
- Dashboard order rows are interactive and take the operator into Orders.

## Order Center and Order Setup

- Archive is an explicit order action. Archived orders are viewed through the `Archived orders` control and can be restored there.
- Every Order Center record has a consistent three-dot action menu for its contextual secondary actions; the primary Open order action is not duplicated inside that menu.
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
- Save remains a visible primary action. Labels and other secondary operations belong in the three-dot workspace action menu rather than leaking into the header as duplicate buttons.
- Save gives feedback. Save & close and Close without saving require explicit confirmation.
- Global desktop shortcuts follow familiar spreadsheet/application conventions: Ctrl/Cmd+S saves, Ctrl/Cmd+Shift+S saves and closes, Ctrl/Cmd+P opens Labels, Ctrl/Cmd+F focuses row search, Ctrl/Cmd+Z/Y undo/redo, Ctrl/Cmd+C/V/X handle cell clipboard work, F2 edits a cell and Esc closes transient menus/editing.

## Label Center and shared Label Workspace

- Production, Packing and Inventory use one shared Label Workspace interaction model. Purpose changes only the relevant data/components offered; it never creates a separate editor or a purpose-specific patch layer.
- Every saved label-set record and every label-source record in Label Center has a consistent three-dot contextual action menu.
- `Save layout` and `Save label set` are clear actions. Saved layouts and saved label sets remain accessible from a compact overflow menu rather than occupying permanent large header buttons.
- A Layout is a reusable physical label design: size, chosen components/information, typography, code configuration and placement. A Label set is this order/job's selected records for repeat printing.
- Label representation is changeable in the designer: physical item, person/package, grouped package/group, product/stock group, or whole order. The create route supplies only the initial representation and never locks it.
- Custom selection is explained and exposes explicit Information field, Free text, QR code, Barcode and Sequence components.
- Label information is grouped as Core information, Person details, Product details, and Trace & codes. There is no unexplained Style group and no customer-update control in label information.
- Core information is limited to saved order-level details from Order Setup. Person details contains the actual person/record fields configured for the order. Product details contains product-specific fields, quantities, measurements and specifications. Trace & codes contains generated trace information.
- Generic `Group / label type` is not offered as label information. Generic `Person / workpiece` is shown only where the label purpose/representation genuinely identifies a production workpiece; Packing and Inventory rely on the actual order-defined person/record fields when relevant.
- Classification/grouping uses fields defined in that order's setup and is shown only when grouping is meaningful for the selected representation.
- Each configured product can expose its own Product and Quantity fields plus its configured measurements/specifications, so operators can independently select information for Shirt, Ijar, Kurti, etc.
- Removing a selected information chip with its `×` changes the React editor state itself and removes that information from preview/print immediately. A DOM-only visual removal is never sufficient.
- Information search is collapsed behind a compact magnifier control rather than permanently consuming a full row.
- Preview sample selection is independent from print selection, so mixed orders can inspect the correct person/product label without changing labels queued for print.
- The selected record remains the source of truth for preview values: a product/detail appears only when that record/package actually has it.
- Automatic layout follows the selected-field order. Selected information can be moved up/down to control vertical order. Dragging or exact geometry edits switches to manual layout using the currently visible automatic positions as the starting coordinates.
- A selected canvas field can be replaced with another available information field, moved, resized, and edited with exact X/Y/width/height millimetre controls. Wheel resizing, keyboard nudging and mobile shrink/stretch controls use the same shared mechanics for all label purposes.
- Record search covers all order data. Filter controls support product, package/group, package contents and every configured person/record field; sorting supports order sequence, person, product and group/package. The visible records list must be derived from those filters and sort choices, not merely display controls that do nothing.
- Narrow record cards may stay compact, but hover/focus on desktop provides a subtle detailed summary popup without changing selection.
- Trace fields support physical piece/pair position, package/set position, order position, person position, product position, and numbering within every configured person/record field. `Show of total` is configurable per trace field.
- Preview uses the physical label aspect ratio, a 1 mm grid, point-to-mm typography, 0.25 mm keyboard nudging, deterministic wheel resizing and touch/mobile shrink/stretch controls.
- Authorised users can create and edit custom physical size presets. The calibrated Pixra preset is protected but can be copied and edited. Roll geometry is validated, preview and print continue to use physical millimetres, simple layouts reflow, and advanced elements are clamped inside a changed physical boundary.
- Print copies are requested only after the operator chooses Print; copy count does not permanently occupy the Label Workspace header.
- Print output stays in physical millimetres and preserves the 1.5 mm right-side safety boundary.

## Implementation hygiene

- Superseded UI adapters, split menus, purpose-specific patches and custom selector wrappers must be removed when their accepted shared replacement lands; leaving dead overlapping enhancers in the active source is a regression risk and is not considered complete implementation.
- Temporary one-shot patch workflows/scripts used during an in-chat edit must remove themselves after their source commit; they are never part of the accepted application architecture.
- Acceptance is revalidated only after lint, all contracts, production build, render checks, and the existing branch-preview smoke test are green on the same cleaned source head.

These behaviors must remain additive to the restored Stage 1 label stack unless an explicitly approved replacement supersedes them.
