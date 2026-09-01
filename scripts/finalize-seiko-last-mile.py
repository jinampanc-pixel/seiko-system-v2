from pathlib import Path
import re


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))

# 1) Workspace Add Rows: Enter commits the exact same action as Add.
replace_once(
    "app/orders.tsx",
    'onChange={event => setRowCount(event.target.value.replace(/[^0-9]/g, ""))} onBlur={()=>setRowCount(String(rowsToAdd))}/><button className="primary" onClick={() => { addRecords(rowsToAdd); setRowCount(String(rowsToAdd)); }}>Add</button>',
    'onChange={event => setRowCount(event.target.value.replace(/[^0-9]/g, ""))} onBlur={()=>setRowCount(String(rowsToAdd))} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();addRecords(rowsToAdd);setRowCount(String(rowsToAdd));event.currentTarget.blur();}}}/><button className="primary" onClick={() => { addRecords(rowsToAdd); setRowCount(String(rowsToAdd)); }}>Add</button>',
)

# Give every visible data cell a stable column id so full-column selection can be painted.
replace_once(
    "app/orders.tsx",
    '<td className="personId stickyId">{record.personId}</td>',
    '<td className="personId stickyId" data-column-id="personId">{record.personId}</td>',
)
replace_once(
    "app/orders.tsx",
    '<td className={selected?"gridSelected":undefined} key={column.id} data-align={columnAlignments[column.id] || "left"}',
    '<td className={selected?"gridSelected":undefined} key={column.id} data-column-id={column.id} data-align={columnAlignments[column.id] || "left"}',
)

# 2) Full Excel-style row/column selection painting.
replace_once(
    "app/workspace-structure-interactions.tsx",
    '''function paint() {\n  ordered<HTMLElement>(".workspaceTable tbody tr[data-record-id]").forEach(row => row.classList.toggle("workspaceStructureSelected", selectedRows.has(row.dataset.recordId || "")));\n  ordered<HTMLElement>(".workspaceMovableColumnHeader[data-column-id]").forEach(cell => cell.classList.toggle("workspaceStructureSelected", selectedColumns.has(cell.dataset.columnId || "")));\n}''',
    '''function paint() {\n  ordered<HTMLElement>(".workspaceTable tbody tr[data-record-id]").forEach(row => row.classList.toggle("workspaceStructureSelected", selectedRows.has(row.dataset.recordId || "")));\n  ordered<HTMLElement>(".workspaceTable [data-column-id]").forEach(cell => cell.classList.toggle("workspaceStructureSelectedColumn", selectedColumns.has(cell.dataset.columnId || "")));\n}''',
)

# 3) Label Information: product fields come only from configured products/workspace values.
p = Path("app/label-designer.tsx")
text = p.read_text()
start = text.find("function labelFieldOptions(order?: SeikoOrder | null) {")
end = text.find("\nfunction normalizedMeasurementValues", start)
if start < 0 or end < 0:
    raise SystemExit("app/label-designer.tsx: labelFieldOptions boundary not found")
new_options = '''function labelFieldOptions(order?: SeikoOrder | null) {\n    const base = [\n        { key: "name", label: "Person / workpiece" }, { key: "group", label: "Group / label type" },\n        { key: "product", label: "Product" }, { key: "product_summary", label: "Package contents" },\n        { key: "bundle_summary", label: "Cutting bundle summary" }, { key: "size", label: "Resolved size" },\n        { key: "resolved_quantity", label: "Calculated quantity" }, { key: "people_count", label: "Number of people" },\n        { key: "variation_count", label: "Number of variations" }, { key: "unit_position", label: "Piece / pair number / total" },\n        { key: "package_position", label: "Package / set number / total" }, { key: "trace_order_position", label: "Label number / order total" },\n        { key: "trace_person_position", label: "Person number / total" }, { key: "trace_product_position", label: "Product number / total" },\n        { key: "order", label: "Order number" }, { key: "order_date", label: "Order date" },\n        { key: "delivery_date", label: "Delivery date" }, { key: "client", label: "Client name" },\n        { key: "client_type", label: "Client type" }, { key: "contact_person", label: "Contact person / Attn" },\n        { key: "phone", label: "Phone number" }, { key: "delivery_address", label: "Delivery address" },\n        { key: "billing_address", label: "Billing address" }, { key: "remarks", label: "Remarks" },\n        { key: "token", label: "Trace code" },\n    ];\n    const people = order?.fields.map(field => ({ key: `field:${field.id}`, label: `Person detail · ${field.name}` })) || [];\n    const traceGroups = order?.fields.filter(field => field.name.trim()).map(field => ({ key: `trace_field:${field.id}`, label: `Number within ${field.name}` })) || [];\n    const productBasics = order?.products.filter(product => product.name.trim()).flatMap(product => [\n        { key: `product_name:${product.id}`, label: `${product.name} · Product` },\n        { key: `product_quantity:${product.id}`, label: `${product.name} · Quantity` },\n    ]) || [];\n    const measurements = order?.measurements.flatMap(measurement => order.products.filter(product => measurement.appliesTo.includes(product.id)).map(product => ({ key: `measurement:${measurement.id}:product:${product.id}`, label: `${product.name} · ${measurement.name}` }))) || [];\n    const specifications = order?.products.flatMap(product => product.specifications.filter(spec => spec.name.trim()).map(spec => ({ key: `spec:${spec.id}`, label: `${product.name} · ${spec.name} (resolved)` }))) || [];\n    const values = [...base, ...people, ...traceGroups, ...productBasics, ...measurements, ...specifications];\n    return [...values, ...values.map(option => ({ key: `field_name:${option.key}`, label: `Field name · ${option.label.replace(/ \\(resolved\\)$/, "")}` }))];\n}'''
text = text[:start] + new_options + text[end:]

# Synthetic package-product slots are no longer relevant fields.
text = text.replace('    const packageSlot = key.startsWith("package_product:");\n', '')
text = text.replace('    const packingOnly = key === "product_summary" || key === "people_count" || key === "package_position" || packageSlot;\n', '    const packingOnly = key === "product_summary" || key === "people_count" || key === "package_position";\n')
text = text.replace('    if (packageSlot) return purpose === "packing" && source === "person";\n', '')

# Old saved layouts/sets are migrated on open so retired package-product fields cannot reappear.
old = 'setItems(template.items.map(item => item.field === "product_summary" ? { ...item, value: item.value === "Product and quantity summary" ? "Package contents" : item.value, fieldLabel: item.fieldLabel === "Product and quantity summary" ? "Package contents" : item.fieldLabel } : item));'
new = 'setItems(template.items.filter(item => !item.field?.startsWith("package_product:")).map(item => item.field === "product_summary" ? { ...item, value: item.value === "Product and quantity summary" ? "Package contents" : item.value, fieldLabel: item.fieldLabel === "Product and quantity summary" ? "Package contents" : item.fieldLabel } : item));'
if text.count(old) != 1:
    raise SystemExit("app/label-designer.tsx: loadTemplate item migration marker missing")
text = text.replace(old, new, 1)
old = 'setItems(task.items); setSelectedRows(task.selectedRows);'
new = 'setItems(task.items.filter(item => !item.field?.startsWith("package_product:"))); setSelectedRows(task.selectedRows);'
if text.count(old) != 1:
    raise SystemExit("app/label-designer.tsx: loadLabelTask item migration marker missing")
text = text.replace(old, new, 1)

# Remove the up/down arrow controls from information cards. Canvas movement remains the positioning model.
pattern = re.compile(r'\{item && <><div className="fieldOrderControls" aria-label=\{`Order \$\{option\.label\}`\}><button type="button" aria-label=\{`Move \$\{option\.label\} up`\} onClick=\{\(\) => moveFieldItem\(item\.id, -1\)\}>↑</button><button type="button" aria-label=\{`Move \$\{option\.label\} down`\} onClick=\{\(\) => moveFieldItem\(item\.id, 1\)\}>↓</button></div>')
text, count = pattern.subn('{item && <>', text, count=1)
if count != 1:
    raise SystemExit(f"app/label-designer.tsx: field arrow controls replacement count {count}")
p.write_text(text)

# 4) Workspace presentation: proper header, compact standard add-row group, full-band selection.
p = Path("app/order-enhancements.css")
css = p.read_text()
css += '''\n\n/* Final workspace spreadsheet polish */\n.workspaceTable .workspaceRowHeaderCorner{background:var(--navy)!important;color:#fff!important;border-color:rgba(255,255,255,.22)!important;font-weight:800!important}\n.workspaceTable tbody tr.workspaceStructureSelected>th,.workspaceTable tbody tr.workspaceStructureSelected>td{background:color-mix(in srgb,var(--brand) 13%,var(--paper))!important}\n.workspaceTable .workspaceStructureSelectedColumn{background:color-mix(in srgb,var(--brand) 11%,var(--paper))!important;box-shadow:inset 1px 0 color-mix(in srgb,var(--brand) 42%,transparent),inset -1px 0 color-mix(in srgb,var(--brand) 42%,transparent)}\n.workspaceTable thead .workspaceStructureSelectedColumn{background:color-mix(in srgb,var(--navy) 78%,var(--brand))!important;color:#fff!important}\n.workspaceAddTools{display:flex!important;align-items:center!important}\n.workspaceAddTools .rowCountControl{display:flex!important;align-items:stretch!important;min-height:34px!important;border:1px solid var(--line)!important;border-radius:8px!important;background:var(--paper)!important;overflow:hidden!important}\n.workspaceAddTools .rowCountLabel{display:flex!important;align-items:center!important;padding:0 9px!important;border-right:1px solid var(--line)!important;color:var(--muted)!important;font-size:9px!important;font-weight:800!important;white-space:nowrap!important}\n.workspaceAddTools .rowCountControl input{box-sizing:border-box!important;width:58px!important;min-width:58px!important;height:32px!important;border:0!important;border-radius:0!important;background:transparent!important;padding:0 5px!important;text-align:center!important;font-weight:800!important}\n.workspaceAddTools .rowCountControl button{min-width:52px!important;height:32px!important;min-height:32px!important;border:0!important;border-left:1px solid color-mix(in srgb,var(--navy) 75%,transparent)!important;border-radius:0!important;padding:0 10px!important}\n.workspaceTable thead tr:first-child>th{height:31px!important;vertical-align:middle!important}\n.workspaceTable thead tr:nth-child(2)>th{height:29px!important;vertical-align:middle!important}\n'''
p.write_text(css)

# 5) Regression contracts: lock the user's final cleanup rules.
p = Path("tests/seiko-stage2-audit-contract.test.mjs")
t = p.read_text()
old = '''  assert.match(structure, /draggable=true/);\n  assert.match(orders, /aria-label="Rows per page"/);'''
new = '''  assert.match(structure, /draggable=true/);\n  assert.match(structure, /workspaceStructureSelectedColumn/);\n  assert.match(orders, /data-column-id=\{column\.id\}/);\n  assert.match(orders, /event\.key==="Enter"/);\n  assert.match(orders, /aria-label="Rows per page"/);'''
if t.count(old) != 1:
    raise SystemExit("tests/seiko-stage2-audit-contract.test.mjs: workspace contract marker missing")
t = t.replace(old, new, 1)
old = '''test("label elements can be reordered, replaced, moved and resized in the shared editor", () => {\n  assert.match(labelDesigner, /moveFieldItem/);\n  assert.match(labelDesigner, /Move \\$\\{option\\.label\\} up/);\n  assert.match(labelDesigner, /Move \\$\\{option\\.label\\} down/);'''
new = '''test("label elements can be replaced, moved and resized without redundant arrow controls", () => {\n  assert.doesNotMatch(labelDesigner, /fieldOrderControls/);\n  assert.doesNotMatch(labelDesigner, />↑<\\/button>/);\n  assert.doesNotMatch(labelDesigner, />↓<\\/button>/);'''
if t.count(old) != 1:
    raise SystemExit("tests/seiko-stage2-audit-contract.test.mjs: label arrow contract marker missing")
t = t.replace(old, new, 1)
insert_marker = '''test("label package contents use the shared order quantity resolver and exclude zero quantities", () => {'''
addition = '''test("Label Information exposes only configured order/workspace product fields", () => {\n  assert.doesNotMatch(labelDesigner, /Applicable product/);\n  assert.doesNotMatch(labelDesigner, /packageSlots/);\n  assert.match(labelDesigner, /product_name:\\$\\{product\\.id\\}/);\n  assert.match(labelDesigner, /product_quantity:\\$\\{product\\.id\\}/);\n  assert.match(labelDesigner, /filter\\(item => !item\\.field\\?\\.startsWith\\("package_product:"\\)\\)/);\n});\n\n'''
if t.count(insert_marker) != 1:
    raise SystemExit("tests/seiko-stage2-audit-contract.test.mjs: label product contract insertion marker missing")
t = t.replace(insert_marker, addition + insert_marker, 1)
p.write_text(t)

# Acceptance doc: supersede the old synthetic Applicable product requirement and arrow wording.
p = Path("SEIKO_STAGE2_ACCEPTANCE.md")
a = p.read_text()
a = a.replace('- Person/package layouts use reusable Applicable product slots (Product, Quantity and Details). Each slot resolves only the current preview/print record\'s positive applicable products. The same Product details area also exposes configured product-specific fields; those values exist only for products actually present in that person\'s resolved package.\n', '- Label Information exposes only product fields that exist in Order Setup and the Workspace: configured product name/quantity, measurements and specifications. Synthetic Applicable product slots are not part of the operator-facing field model. Product-specific values remain blank/omitted whenever that product is not applicable to the current record.\n')
a = a.replace('- Automatic layout follows the selected-field order. Selected information can be moved up/down to control vertical order. Dragging or exact geometry edits switches to manual layout using the currently visible automatic positions as the starting coordinates.\n', '- Automatic layout follows the selected information set and omits blank/inapplicable values per record. Redundant up/down arrow controls are not shown in Label Information; direct canvas placement and exact geometry controls own positioning.\n')
a += '\n- Final workspace cleanup: Add Rows and Rows per page both commit on Enter; clicking a row-number header paints the full row and clicking a data-column header paints the full column, matching spreadsheet selection feedback. The # corner stays narrow and visually belongs to the table header.\n'
p.write_text(a)

print("SEIKO last-mile source and contracts updated successfully")
