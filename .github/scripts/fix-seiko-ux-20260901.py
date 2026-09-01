from pathlib import Path
import re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    (ROOT / path).write_text(text)

def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected 1 occurrence, found {count}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))

def regex_once(path, pattern, repl, flags=0):
    text = read(path)
    new, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{path}: regex expected 1 occurrence, found {count}: {pattern[:120]!r}')
    write(path, new)

# -----------------------------------------------------------------------------
# Orders / Setup: remember the page that opened Setup, make date a normal field,
# and make the Add rows control one compact coherent unit.
# -----------------------------------------------------------------------------
replace_once(
    'app/orders.tsx',
    '  const [view, setView] = useState<View>(initialOrder ? "workspace" : "center");\n  const [current, setCurrent] = useState<SeikoOrder | null>',
    '  const [view, setView] = useState<View>(initialOrder ? "workspace" : "center");\n  const [setupReturnView, setSetupReturnView] = useState<"center" | "workspace">(initialOrder ? "workspace" : "center");\n  const [current, setCurrent] = useState<SeikoOrder | null>',
)
replace_once(
    'app/orders.tsx',
    'return <OrderSetup businessId={businessId} order={current} errors={setupErrors}',
    'return <OrderSetup businessId={businessId} order={current} returnView={setupReturnView} errors={setupErrors}',
)
replace_once(
    'app/orders.tsx',
    'onCancel={() => setView(current.revisions.length ? "workspace" : "center")}',
    'onCancel={() => setView(current.revisions.length ? setupReturnView : "center")}',
)
replace_once(
    'app/orders.tsx',
    'save(current, current.revisions.length ? "Order definition updated" : "Order draft created"); setView("workspace");',
    'const existingOrder = current.revisions.length > 0; save(current, existingOrder ? "Order definition updated" : "Order draft created"); setView(existingOrder ? setupReturnView : "workspace");',
)
replace_once(
    'app/orders.tsx',
    'onEditSetup={() => setView("setup")}',
    'onEditSetup={() => { const originKey = `jinam:${businessId}:order-setup-origin`; const origin = sessionStorage.getItem(originKey) === "center" ? "center" : "workspace"; sessionStorage.removeItem(originKey); setSetupReturnView(origin); setView("setup"); }}',
)
replace_once(
    'app/orders.tsx',
    'setCurrent(newOrder(next)); setView("setup");',
    'setSetupReturnView("center"); setCurrent(newOrder(next)); setView("setup");',
)
replace_once(
    'app/orders.tsx',
    'function OrderSetup({ businessId, order, errors, suggestions, canManageSuggestions, onRemoveSuggestion, onChange, onCancel, onContinue }:',
    'function OrderSetup({ businessId, order, returnView, errors, suggestions, canManageSuggestions, onRemoveSuggestion, onChange, onCancel, onContinue }:',
)
replace_once(
    'app/orders.tsx',
    '{ businessId: string; order: SeikoOrder; errors: string[];',
    '{ businessId: string; order: SeikoOrder; returnView: "center" | "workspace"; errors: string[];',
)
replace_once(
    'app/orders.tsx',
    '{order.revisions.length ? "← Back to Workspace" : "← Back to Orders"}',
    '{order.revisions.length && returnView === "workspace" ? "← Back to Workspace" : "← Back to Orders"}',
)
replace_once(
    'app/orders.tsx',
    '{order.revisions.length ? "Update workspace" : "Create workspace"}',
    '{order.revisions.length ? (returnView === "workspace" ? "Update workspace" : "Save changes") : "Create workspace"}',
)
regex_once(
    'app/orders.tsx',
    r'<div className="autoOrderInfo"><span><b>Order</b> \{order\.details\.orderNo\}</span><label className="orderDateEditor"><b>Date</b><input aria-label="Order date" type="date" value=\{order\.details\.orderDate\} onChange=\{event=>updateDetails\("orderDate",event\.target\.value\)\}/></label></div>',
    '<div className="autoOrderInfo"><span><b>Order</b> {order.details.orderNo}</span></div>',
)
replace_once(
    'app/orders.tsx',
    'onRemove={value => onRemoveSuggestion("clientTypes", value)}/><Field label="Delivery date"',
    'onRemove={value => onRemoveSuggestion("clientTypes", value)}/><Field label="Order date" type="date" value={order.details.orderDate} onChange={value => updateDetails("orderDate", value)}/><Field label="Delivery date"',
)
replace_once(
    'app/orders.tsx',
    '<div className="workspaceAddTools"><label className="rowCountControl"><input aria-label="Number of rows to add" type="text" inputMode="numeric" value={rowCount} onFocus={event=>event.currentTarget.select()} onChange={event => setRowCount(event.target.value.replace(/[^0-9]/g, ""))} onBlur={()=>setRowCount(String(rowsToAdd))}/><button className="primary" onClick={() => { addRecords(rowsToAdd); setRowCount(String(rowsToAdd)); }}>+ Add {rowsToAdd===1?"row":"rows"}</button></label></div><span>{order.records.length} rows</span>',
    '<div className="workspaceAddTools"><label className="rowCountControl"><span className="rowCountLabel">Add rows</span><input aria-label="Number of rows to add" type="text" inputMode="numeric" value={rowCount} onFocus={event=>event.currentTarget.select()} onChange={event => setRowCount(event.target.value.replace(/[^0-9]/g, ""))} onBlur={()=>setRowCount(String(rowsToAdd))}/><button className="primary" onClick={() => { addRecords(rowsToAdd); setRowCount(String(rowsToAdd)); }}>Add</button></label></div><span className="workspaceRowTotal">{order.records.length} rows</span>',
)

# Order Center Edit setup marks its origin before opening the workspace action.
replace_once(
    'app/seiko-list-center-enhancements.tsx',
    '    edit.addEventListener("click", () => {\n      menu.open = false;\n      open.click();\n      waitForWorkspaceAction("Edit setup");\n    });',
    '    edit.addEventListener("click", () => {\n      menu.open = false;\n      sessionStorage.setItem(`jinam:${currentBusiness()}:order-setup-origin`, "center");\n      open.click();\n      waitForWorkspaceAction("Edit setup");\n    });',
)

# -----------------------------------------------------------------------------
# Label navigation: contextual Back belongs outside the workspace header card.
# The header actions are Menu -> Print, with Save label set inside the menu.
# -----------------------------------------------------------------------------
replace_once(
    'app/label-designer.tsx',
    'export function LabelDesigner({ businessId, canManageSizes, order, onBack, initialPurpose = null, initialSourceMode }: {',
    'export function LabelDesigner({ businessId, canManageSizes, order, onBack, backLabel, initialPurpose = null, initialSourceMode }: {',
)
replace_once(
    'app/label-designer.tsx',
    '    onBack?: () => void;\n    initialPurpose?: LabelPurpose | null;',
    '    onBack?: () => void;\n    backLabel?: string;\n    initialPurpose?: LabelPurpose | null;',
)
replace_once(
    'app/label-designer.tsx',
    '{onBack && <button className="secondary contextBackButton" onClick={onBack}>← Back to Order</button>}',
    '{onBack && <button className="secondary contextBackButton" onClick={onBack}>{backLabel || "← Back"}</button>}',
)
replace_once(
    'app/label-designer.tsx',
    'return <div className={`page labelDesignerPage output-${outputMode} ${order ? "" : "noOrder"}`}><section className="labelTopbar panel"><div>{order && onBack && <button className="secondary contextBackButton" onClick={onBack}>← Back to Order</button>}<p className="eyebrow">',
    'return <div className={`page labelDesignerPage output-${outputMode} ${order ? "" : "noOrder"}`}>{order && onBack && <div className="labelWorkspaceBackRow"><button className="secondary contextBackButton" onClick={onBack}>{backLabel || "← Back"}</button></div>}<section className="labelTopbar panel"><div><p className="eyebrow">',
)
regex_once(
    'app/label-designer.tsx',
    r'<div className="labelHeaderCommandBar">\{order && purpose && <button type="button" className="primary labelHeaderSaveSet".*?</div></details>\}<button className="primary" disabled=\{!printRecords\.length\} onClick=\{print\}>Print</button></div></section>',
    '<div className="labelHeaderCommandBar">{order && purpose && <details className="labelHeaderMore" open={labelWorkspaceMoreOpen} onToggle={event => setLabelWorkspaceMoreOpen(event.currentTarget.open)}><summary className="labelHeaderMenuButton" aria-label="Label actions"><span/><span/><span/></summary><div className="labelHeaderMoreMenu"><button type="button" className="labelHeaderMenuPrimary" disabled={!selectedRows.length} onClick={() => { saveLabelTask(); setLabelWorkspaceMoreOpen(false); }}>{activeTaskId ? "Update label set" : "Save label set"}</button><button type="button" onClick={() => { saveTemplate(); setLabelWorkspaceMoreOpen(false); }}>{activeTemplateId ? "Update layout" : "Save layout"}</button><button type="button" onClick={() => { setOpenLibrary("layouts"); setLabelWorkspaceMoreOpen(false); }}>Saved layouts</button><button type="button" onClick={() => { setOpenLibrary("tasks"); setLabelWorkspaceMoreOpen(false); }}>Saved label sets</button></div></details>}<button className="primary" disabled={!printRecords.length} onClick={print}>Print</button></div></section>',
    flags=re.S,
)

# Standalone label flow: setup goes back to the source; designer goes back to setup.
replace_once(
    'app/labels/create/page.tsx',
    'canManageSizes={canManage} onBack={() => setStarted(false)}/>',
    'canManageSizes={canManage} backLabel="← Back to label setup" onBack={() => setStarted(false)}/>',
)
replace_once(
    'app/labels/create/page.tsx',
    '>← Back</button><p className="eyebrow">LABEL CREATION</p>',
    '>{selectedOrder ? "← Back to Order" : "← Back to Labels"}</button><p className="eyebrow">LABEL CREATION</p>',
)
# Embedded label workspace uses the same contextual style but returns to Label Center.
replace_once(
    'app/page.tsx',
    'initialPurpose={labelPurpose} onBack={() => { setLabelOrder(null); setLabelPurpose(null); }} canManageSizes=',
    'initialPurpose={labelPurpose} backLabel="← Back to Labels" onBack={() => { setLabelOrder(null); setLabelPurpose(null); }} canManageSizes=',
)

# -----------------------------------------------------------------------------
# Product information: keep reusable record-aware product slots, but make them
# understandable and also expose real order-product fields when relevant.
# -----------------------------------------------------------------------------
replace_once(
    'app/label-designer.tsx',
    'const slotValues = Object.fromEntries(packageItems.flatMap((item, index) => { const slot = index + 1; return [[`package_product:${slot}:name`, item.product], [`package_product:${slot}:quantity`, item.qty], [`package_product:${slot}:details`, packageItemDetails(order, item)]]; })); return {',
    'const slotValues = Object.fromEntries(packageItems.flatMap((item, index) => { const slot = index + 1; return [[`package_product:${slot}:name`, item.product], [`package_product:${slot}:quantity`, item.qty], [`package_product:${slot}:details`, packageItemDetails(order, item)]]; })); const specificProductValues = Object.fromEntries(packageItems.flatMap(item => { const productId = item.values.product_id; const fields: Array<[string, string]> = [[`product_name:${productId}`, item.product], [`product_quantity:${productId}`, item.qty]]; Object.entries(item.values).forEach(([key, value]) => { if (hasLabelValue(value) && ((key.startsWith("measurement:") && key.endsWith(`product:${productId}`)) || key.startsWith("spec:"))) fields.push([key, String(value)]); }); return fields; })); return {',
)
replace_once(
    'app/label-designer.tsx',
    'values: { ...packageBaseValues(first.values), ...slotValues, product:',
    'values: { ...packageBaseValues(first.values), ...specificProductValues, ...slotValues, product:',
)
replace_once(
    'app/label-designer.tsx',
    'if (purpose === "packing") return !genericWorkpiece && !productionOnly && key !== "variation_count" && !(source === "person" && (key === "product" || exactProductField));',
    'if (purpose === "packing") return !genericWorkpiece && !productionOnly && key !== "variation_count" && !(source === "person" && key === "product");',
)
replace_once(
    'app/label-designer.tsx',
    'label: `Package product ${slot} · Product` }, { key: `package_product:${slot}:quantity`, label: `Package product ${slot} · Quantity` }, { key: `package_product:${slot}:details`, label: `Package product ${slot} · Details`',
    'label: `Applicable product ${slot} · Product` }, { key: `package_product:${slot}:quantity`, label: `Applicable product ${slot} · Quantity` }, { key: `package_product:${slot}:details`, label: `Applicable product ${slot} · Details`',
)

# Stop the polish layer from renaming source-owned Back controls.
regex_once(
    'app/label-designer-polish.tsx',
    r'\s*const back = Array\.from\(page\.querySelectorAll<HTMLButtonElement>\("\.labelTopbar button\.secondary"\)\)\n\s*\.find\(item => item\.textContent\?\.includes\("Back to order"\) \|\| item\.textContent\?\.includes\("Back to setup"\)\);\n\s*if \(back\) back\.textContent = "← Back to setup";\n',
    '\n',
)
replace_once(
    'app/label-designer-polish.tsx',
    '  if (label.includes(" · ")) return `Product details · ${label.split(" · ")[0]}`;',
    '  if (/^Applicable product \\d+ ·/i.test(label)) return "Product details";\n  if (label.includes(" · ")) return `Product details · ${label.split(" · ")[0]}`;',
)

# -----------------------------------------------------------------------------
# Late-loaded visual rules: compact workspace controls, consistent Setup date,
# source-owned Back row, 3-line label menu, and genuinely compact field cards.
# -----------------------------------------------------------------------------
css_path = 'app/seiko-workspace-label-final.css'
css = read(css_path)
marker = '/* 2026-09-01 final origin-aware setup + label workspace refinement */'
if marker not in css:
    css += f'''\n\n{marker}\n.workspacePage>.workspaceTools{{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important;padding:5px 0!important}}\n.workspacePage .workspaceCompactTools{{flex:0 0 auto!important;margin:0!important}}\n.workspacePage .workspaceAddTools{{display:flex!important;align-items:center!important;flex:0 0 auto!important}}\n.workspacePage .rowCountControl{{display:grid!important;grid-template-columns:auto 48px 52px!important;align-items:center!important;gap:0!important;height:34px!important;padding:0!important;border:1px solid var(--line)!important;border-radius:8px!important;overflow:hidden!important;background:var(--paper)!important}}\n.workspacePage .rowCountLabel{{padding:0 8px!important;color:var(--muted)!important;font-size:9px!important;font-weight:800!important;white-space:nowrap!important}}\n.workspacePage .rowCountControl input{{box-sizing:border-box!important;width:48px!important;height:32px!important;border:0!important;border-left:1px solid var(--line)!important;border-right:1px solid var(--line)!important;border-radius:0!important;text-align:center!important;font-weight:800!important}}\n.workspacePage .rowCountControl button{{box-sizing:border-box!important;width:52px!important;height:32px!important;min-height:32px!important;border:0!important;border-radius:0!important;padding:0!important}}\n.workspacePage .workspaceRowTotal{{flex:0 0 auto!important;color:var(--muted)!important;font-size:9px!important;white-space:nowrap!important}}\n.workspacePage>.workspaceTools>input[aria-label="Search rows"]{{flex:1 1 240px!important;min-width:180px!important;max-width:360px!important;margin-left:auto!important}}\n.workspacePage .workspacePagerTop{{flex:0 0 auto!important;margin-left:0!important}}\n.orderSetup .autoOrderInfo{{display:flex!important;align-items:center!important;gap:6px!important}}\n.orderSetup .autoOrderInfo>span{{display:inline-flex!important;align-items:center!important;gap:5px!important;min-height:30px!important;padding:0 9px!important;border:1px solid var(--line)!important;border-radius:7px!important;background:var(--pale)!important;font-size:10px!important}}\n.orderSetup .autoOrderInfo>span>b{{font-size:9px!important;color:var(--navy)!important}}\n.labelDesignerPage>.labelWorkspaceBackRow{{display:flex!important;align-items:center!important;margin:0 0 6px!important;padding:0 2px!important}}\n.labelDesignerPage>.labelWorkspaceBackRow .contextBackButton{{margin:0!important}}\n.labelDesignerPage .labelHeaderCommandBar{{display:flex!important;align-items:center!important;gap:7px!important}}\n.labelDesignerPage .labelHeaderMore{{position:relative!important}}\n.labelDesignerPage .labelHeaderMenuButton{{display:grid!important;place-content:center!important;gap:4px!important;width:38px!important;height:38px!important;min-height:38px!important;padding:0!important;border:1px solid var(--line)!important;border-radius:8px!important;background:var(--paper)!important;cursor:pointer!important;list-style:none!important}}\n.labelDesignerPage .labelHeaderMenuButton::-webkit-details-marker{{display:none!important}}\n.labelDesignerPage .labelHeaderMenuButton>span{{display:block!important;width:18px!important;height:2px!important;border-radius:2px!important;background:var(--navy)!important}}\n.labelDesignerPage .labelHeaderMenuButton:hover,.labelDesignerPage .labelHeaderMore[open]>.labelHeaderMenuButton{{background:var(--pale)!important}}\n.labelDesignerPage .labelHeaderMoreMenu{{right:0!important;min-width:205px!important}}\n.labelDesignerPage .labelHeaderMoreMenu .labelHeaderMenuPrimary{{background:var(--navy)!important;color:#fff!important;font-weight:850!important}}\n.labelDesignerPage .fieldChecklist{{align-items:start!important;grid-auto-rows:min-content!important;gap:6px!important}}\n.labelDesignerPage .fieldChoice{{box-sizing:border-box!important;min-height:42px!important;height:auto!important;padding:7px 9px!important;align-content:start!important}}\n.labelDesignerPage .fieldChoice.chosen.fieldChoiceExpanded{{display:grid!important;grid-template-columns:minmax(150px,1fr) auto auto!important;grid-auto-rows:min-content!important;align-items:center!important;gap:5px 7px!important;min-height:0!important;padding:7px 9px!important}}\n.labelDesignerPage .fieldChoice.chosen.fieldChoiceExpanded>label:first-child{{grid-column:1!important;grid-row:1!important;margin:0!important}}\n.labelDesignerPage .fieldChoice.chosen.fieldChoiceExpanded>.fieldOrderControls{{grid-column:2!important;grid-row:1!important;display:flex!important;gap:3px!important}}\n.labelDesignerPage .fieldChoice.chosen.fieldChoiceExpanded>.showName{{grid-column:3!important;grid-row:1!important;margin:0!important;white-space:nowrap!important}}\n.labelDesignerPage .fieldChoice.chosen.fieldChoiceExpanded>.traceTotalChoice{{grid-column:3!important;margin:0!important;white-space:nowrap!important}}\n.labelDesignerPage .fieldChoice.chosen.fieldChoiceExpanded>input[aria-label^="Printed name for"]{{grid-column:1/-1!important;width:100%!important;height:29px!important;min-height:29px!important;margin:0!important}}\n.labelDesignerPage .fieldChoice.chosen.fieldChoiceExpanded>.fieldEmphasis{{grid-column:1/-1!important;display:flex!important;align-items:center!important;gap:12px!important;margin:0!important;padding:4px 0 0!important;border-top:1px solid color-mix(in srgb,var(--line) 68%,transparent)!important}}\n.labelDesignerPage .fieldChoice.chosen.fieldChoiceExpanded>.fieldEmphasis label{{margin:0!important;font-size:9px!important;white-space:nowrap!important}}\n@media(max-width:900px){{.workspacePage>.workspaceTools>input[aria-label="Search rows"]{{order:4!important;flex-basis:100%!important;max-width:none!important;margin-left:0!important}}.workspacePage .workspacePagerTop{{margin-left:auto!important}}}}\n'''
write(css_path, css)

# -----------------------------------------------------------------------------
# Regression contract: encode these exact requirements and update superseded
# product-slot assertions.
# -----------------------------------------------------------------------------
test_path = 'tests/seiko-workspace-label-accuracy-contract.test.mjs'
tests = read(test_path)
tests = tests.replace('  assert.match(labels, /Package product \\$\\{slot\\}/);\n  assert.match(labels, /source === "person" && \\(key === "product" \\|\\| exactProductField\\)/);', '  assert.match(labels, /Applicable product \\$\\{slot\\}/);\n  assert.doesNotMatch(labels, /source === "person" && \\(key === "product" \\|\\| exactProductField\\)/);\n  assert.match(labels, /specificProductValues/);\n  assert.match(labels, /product_name:\\$\\{productId\\}/);\n  assert.match(labels, /product_quantity:\\$\\{productId\\}/);')
append_marker = 'test("Order Setup return path and label workspace header are source-owned", () => {'
if append_marker not in tests:
    tests += r'''

test("Order Setup return path and label workspace header are source-owned", () => {
  const listCenter = read("app/seiko-list-center-enhancements.tsx");
  const create = read("app/labels/create/page.tsx");
  assert.match(orders, /setupReturnView/);
  assert.match(listCenter, /order-setup-origin/);
  assert.match(orders, /returnView === "workspace" \? "← Back to Workspace" : "← Back to Orders"/);
  assert.match(orders, /<Field label="Order date" type="date"/);
  assert.doesNotMatch(orders, /className="orderDateEditor"/);
  assert.match(create, /backLabel="← Back to label setup"/);
  assert.match(labels, /labelWorkspaceBackRow/);
  assert.match(labels, /className="labelHeaderMenuButton"/);
  assert.match(labels, /labelHeaderMenuPrimary/);
  assert.doesNotMatch(labels, /className="primary labelHeaderSaveSet"/);
});

test("workspace add rows and expanded label information stay compact", () => {
  const finalCss = read("app/seiko-workspace-label-final.css");
  assert.match(orders, /rowCountLabel">Add rows/);
  assert.match(orders, /className="workspaceRowTotal"/);
  assert.match(finalCss, /grid-template-columns:auto 48px 52px/);
  assert.match(finalCss, /fieldChoice\.chosen\.fieldChoiceExpanded/);
  assert.match(finalCss, /grid-template-columns:minmax\(150px,1fr\) auto auto/);
});
'''
write(test_path, tests)

# Guard against accidental omission.
checks = {
    'app/orders.tsx': ['setupReturnView', 'rowCountLabel', '<Field label="Order date" type="date"'],
    'app/label-designer.tsx': ['labelWorkspaceBackRow', 'labelHeaderMenuButton', 'Applicable product ${slot}', 'specificProductValues'],
    'app/labels/create/page.tsx': ['backLabel="← Back to label setup"', '← Back to Order'],
}
for path, needles in checks.items():
    text = read(path)
    for needle in needles:
        if needle not in text:
            raise SystemExit(f'{path}: post-patch check missing {needle!r}')

print('SEIKO UX finalizer applied successfully')
