# SEIKO Stage 2 acceptance lock

This checklist records the accepted SEIKO order and label behavior carried by `fix/veyn-milestone-one`. It is a regression guard, not a new workflow or business scope.

## Home

- Home has two functional areas only: a configurable operational dashboard and a configurable Quick access area for modules/features.
- Dashboard metric cards are interactive selectors for the single operational list below them; they do not duplicate module navigation. Active Orders shows active work, Completed Orders shows completed work, and Scan Sync Queue shows the real queued/syncing items.
- Order workflow status changes on Home happen inline and never open the Order Workspace as a side effect.
- Dashboard visibility is user-configurable and persisted. The dashboard registry is designed to accept real Sales, Payments, Production and other statistics as those modules gain trustworthy data; fake placeholder metrics are not shown.
- Quick access module visibility is user-configurable and persisted independently of the dashboard.
- The operational order list scales beyond 100 orders through compact funnel filters, search, client-type filtering, context-relevant product filtering and pagination/page-size controls.
- Dashboard order rows provide a distinct open-order target while status controls remain independent interactive controls.

## Order Center and Order Setup

- Archive is an order action. Archived-only viewing lives inside the compact Filters panel and the underlying React archived state remains the source of truth.
- Every Order Center record has a consistent three-dot action menu for contextual secondary actions; opening an order is accomplished by clicking the row rather than duplicating an Open button inside or beside every record.
- Order Center search is complemented by compact filters for status, client type, context-relevant product and delivery timing, including overdue and next-7-days views. Status filters use the same shared workflow vocabulary as Home and Workspace.
- The shared order workflow statuses are: Draft, Active, Production, QC 1, Packing, QC 2, On Hold, Completed and Cancelled.
- Order status belongs in the operational metadata/action area and must not appear as stray text beneath the client name.
- The Products metadata cell reveals a hover/focus summary with each configured product, resolved total quantity, and colour/pattern specifications when those values are configured in the order.
- Client type choices expand from saved SEIKO order data. Product choices expand from saved order products and narrow automatically to the selected client type; filters do not edit master data.
- Billing and Payments remain first-class SEIKO modules and are not injected into each order row menu.
- Delivery address and billing address share one row on desktop when space permits and stack responsively on smaller screens.
- Person / record fields follow the selected client type and must not hardcode school-only terminology.
- Quantity mode, specification type, and value-assignment mode are fixed workflow choices and stay native selects; they are not owner-editable master data.
- Group quantity rules use one default quantity plus exceptions. An exception may target several values or a numeric range such as `1-7`, and quantity `0` is valid.

## Order Workspace

- Spreadsheet entry supports paste, keyboard movement, cell selection, safe multi-row add, multi-row delete, undo/redo, stable Person IDs, search, column visibility, and one pagination state.
- Add Rows and Rows per page are genuine editable numeric controls. Values are sanitized/clamped only when committed, and a top pager proxy must drive the same underlying React state as the native pager.
- Row selection follows spreadsheet conventions instead of checkbox-list conventions: row-number headers select rows, Shift-click selects a range, Ctrl/Cmd-click adds or removes rows, and the top-left corner selects all visible rows.
- Column headers use the same click/Shift/Ctrl-or-Cmd selection model. Selected rows and selected columns can be dragged to a new position; column widths can be resized from the header edge; order, hidden columns, widths and alignment are persisted in order data rather than merely moving DOM elements.
- The row-number `#` column stays narrow and functional; it is a selection/reorder handle rather than a normal data-width column.
- Spreadsheet commands live behind one compact Tools control instead of a permanent multi-tab toolbar row. Tools includes Undo/Redo, copy/clear/fill, insert rows, column visibility, alignment and sorting.
- Right-clicking a selected row number opens row actions such as insert above/below, hold/resume and delete. Right-clicking a selected column header opens column actions such as hide, reset width, alignment and sorting. These commands change the real React/order state.
- Multi-row add and destructive operations require confirmation.
- The source-owned three-dot workspace menu is order-level only: shared Status, Save now, Labels, Edit setup, Save & close, Archive order, Delete order and Close without saving. Hold/resume exists only through Status or row-level context actions, while Undo/Redo and spreadsheet operations live in the compact Tools control.
- Save gives feedback. Save & close and Close without saving require explicit confirmation.
- Global desktop shortcuts follow familiar spreadsheet/application conventions: Ctrl/Cmd+S saves, Ctrl/Cmd+Shift+S saves and closes, Ctrl/Cmd+P opens Labels, Ctrl/Cmd+F focuses row search, Ctrl/Cmd+Z/Y undo/redo, Ctrl/Cmd+C/V/X handle cell clipboard work, F2 edits a cell and Esc closes transient menus/editing.
- Contextual Back navigation uses one consistent top-left treatment on Order Setup, Order Workspace, Label Creation and Label Workspace wherever a meaningful previous context exists.

## Label Center and shared Label Workspace

- Production, Packing and Inventory use one shared Label Workspace interaction model. Purpose changes only the relevant data/components offered; it never creates a separate editor or a purpose-specific patch layer.
- Every saved label-set record and every label-source record in Label Center has a consistent three-dot contextual action menu.
- `Save label set` is a direct blue primary command in the Label Workspace header. Save layout, Saved layouts and Saved label sets remain available through the compact overflow menu.
- Ctrl/Cmd+S in the Label Workspace opens an in-app choice between Save label set and Save layout; it must not invoke the browser Save Page dialog.
- A Layout is a reusable physical label design: size, chosen components/information, typography, code configuration and placement. A Label set is this order/job's selected records for repeat printing.
- Label representation is changeable in the designer: physical item, person/package, grouped package/group, product/stock group, or whole order. The create route supplies only the initial representation and never locks it.
- Custom selection exposes explicit Information field, Free text, QR code, Barcode and Sequence components without explanatory implementation jargon in the workspace.
- Label information is grouped as Core information, Person details, Product details, and Trace & codes. There is no unexplained Style group and no customer-update control in label information.
- Core information is limited to saved order-level details from Order Setup. Person details contains the actual person/record fields configured for the order. Product details contains product-specific fields, quantities, measurements and specifications. Trace & codes contains generated trace information.
- Generic `Group / label type` is not offered as label information. Generic `Person / workpiece` is shown only where the label purpose/representation genuinely identifies a production workpiece; Packing and Inventory rely on the actual order-defined person/record fields when relevant.
- Classification/grouping uses fields defined in that order's setup and is shown only when grouping is meaningful for the selected representation.
- Workspace row data is the authoritative source for person/package applicability. A blank product measurement/specification in that person's workspace row must never be populated by borrowing a value from another product or another ambiguous legacy measurement.
- Person/package layouts use reusable Package product slots (name, quantity and details). Each slot resolves only the current preview/print record's positive, applicable products. Product-specific values from one package item are never merged into another package item.
- One reusable label layout must work across mixed records: empty/inapplicable fields are omitted for each record and automatic layout reflows the remaining fields upward, so a male record can resolve Shirt/Male Pant while a female record can resolve Ijar/Kurti in the same template positions.
- Removing a selected information chip with its `×` changes the React editor state itself and removes that information from preview/print immediately. A DOM-only visual removal is never sufficient.
- Information search is collapsed behind a compact magnifier control rather than permanently consuming a full row.
- Preview sample selection is independent from print selection and identifies the person/record concisely rather than dumping the complete product list into every option.
- Person/package contents and hover details use the same shared `quantityForRecord()` logic as the order system. Products whose resolved quantity is zero or whose required workspace evidence is absent are excluded. The UI never infers gender or product eligibility from a person's name.
- Record hover/focus summaries contain only resolved positive package products and actual configured person fields; irrelevant internal order/group/client values are not shown as if they were label contents.
- Automatic layout follows the selected-field order. Selected information can be moved up/down to control vertical order. Dragging or exact geometry edits switches to manual layout using the currently visible automatic positions as the starting coordinates.
- The label canvas is directly editable: there is no required Arrange / Finish arranging mode. Clicking or dragging a field begins direct physical editing from its current automatic position.
- Manual canvas movement supports free 0.25 mm positioning, Shift axis-lock, Alt bypass of snapping, and edge/centre alignment snapping against the canvas and other label elements. This allows values to share an exact baseline or left/centre/right alignment.
- A selected canvas field can be replaced with another available information field, moved, resized, and edited with exact X/Y/width/height millimetre controls. Wheel resizing, keyboard nudging and mobile shrink/stretch controls use the same shared mechanics for all label purposes.
- Record search covers all order data. Filter controls are derived from actual representation and order data; the Value control is writable/searchable with order-derived suggestions, and visible records are derived from those filters and sort choices rather than merely display controls that do nothing.
- Narrow record cards may stay compact, but hover/focus on desktop provides a subtle detailed summary popup without changing selection.
- Trace fields support physical piece/pair position, package/set position, order position, person position, product position, and numbering within every configured person/record field. `Show of total` is configurable per trace field.
- Preview uses the physical label aspect ratio, a 1 mm grid, point-to-mm typography, 0.25 mm keyboard nudging, deterministic wheel resizing and touch/mobile shrink/stretch controls.
- Authorised users can create and edit custom physical size presets. The calibrated Pixra preset is protected but can be copied and edited. Roll geometry is validated, preview and print continue to use physical millimetres, simple layouts reflow, and advanced elements are clamped inside a changed physical boundary.
- Print copies are requested only after the operator chooses Print; copy count does not permanently occupy the Label Workspace header.
- Print output stays in physical millimetres and preserves the 1.5 mm right-side safety boundary.

## Implementation hygiene

- Superseded UI adapters, split menus, purpose-specific patches and custom selector wrappers must be removed when their accepted shared replacement lands; leaving dead overlapping enhancers in the active source is a regression risk and is not considered complete implementation.
- Temporary one-shot patch workflows/scripts used during an in-chat edit must remove themselves after their source commit; they are never part of the accepted application architecture.
- Spreadsheet row/column selection handlers must remain lint-clean explicit control flow; side-effect-only ternaries are not accepted in interaction code.
- Regression contracts assert the current owning source component or shared state path; they must not force retired enhancement hooks or duplicated controls back into the application.
- Regression maintenance must preserve the full existing audit coverage; obsolete assertions are replaced in place rather than rewriting or shortening the contract file.
- Order Center status remains the native React control; nested module navigation must not be overwritten by bootstrap Home resets; Workspace Back/menu controls are source-owned; automatic label arrangement remains source-owned physical-millimetre logic.
- Runtime contracts verify the native inline Order Center status control rather than requiring retired status badges or static status metadata.
- Label contracts explicitly reject cross-product measurement fallback and product-value merging across person/package items.
- Acceptance is revalidated only after lint, all contracts, production build, render checks, and the existing branch-preview smoke test are green on the same cleaned source head.

These behaviors must remain additive to the restored Stage 1 label stack unless an explicitly approved replacement supersedes them.
