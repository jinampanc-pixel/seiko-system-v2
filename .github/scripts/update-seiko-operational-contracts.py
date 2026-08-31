from pathlib import Path

path = Path('tests/seiko-stage2-audit-contract.test.mjs')
text = path.read_text(encoding='utf-8').replace('\r\n','\n')

# Additional source readers for this acceptance pass.
anchor = 'const labelProductionReady = read("app/label-production-ready.tsx");\n'
addition = '''const labelProductionReady = read("app/label-production-ready.tsx");
const operationalUx = read("app/seiko-operational-ux.tsx");
const listCenter = read("app/seiko-list-center-enhancements.tsx");
const structure = read("app/workspace-structure-interactions.tsx");
const refinement = read("app/label-workspace-refinement.tsx");
'''
if anchor not in text:
    raise RuntimeError('reader anchor missing')
text = text.replace(anchor, addition, 1)

old_home = '''test("Home is a configurable dashboard with one operational order-entry surface", () => {
  assert.match(home, /HOME_KEY = "jinam:seiko:home-config-v3"/);
  assert.match(home, /Customize dashboard/);
  assert.match(home, /showActiveOrders/);
  assert.match(home, /activeOrderPageSize/);
  assert.match(home, /homeWorkFilterToggle/);
  assert.match(home, /Filter active orders/);
  assert.match(home, /All client types/);
  assert.match(home, /All products/);
  assert.match(home, /Clear filters/);
  assert.match(home, /quickAccess/);
  assert.match(home, /seikoMetricReadout/);
  assert.match(home, /openSeikoOrder\\(order\\)/);
  assert.match(home, /seikoDashboardActivityRow/);
  assert.doesNotMatch(home, /PERSON \\/ RECORD ENTRIES/);
  assert.doesNotMatch(home, /quickAccess: \\{ Orders:/);
  assert.doesNotMatch(home, /openSeikoModule\\(metric\\.module\\)/);
  assert.match(homeCss, /\\.seikoDashboardMetrics/);
  assert.match(homeCss, /\\.overview>\\.moduleGrid::before\\{content:"Quick access"/);
});'''
new_home = '''test("Home metrics switch one configurable operational list and status changes do not open orders", () => {
  assert.match(home, /HOME_KEY = "jinam:seiko:home-config-v3"/);
  assert.match(home, /Customize dashboard/);
  assert.match(home, /showActiveOrders/);
  assert.match(home, /activeOrderPageSize/);
  assert.match(home, /workMode/);
  assert.match(home, /setWorkMode\\(metric\\.key\\)/);
  assert.match(home, /changeStatus/);
  assert.match(home, /homeOrderStatus/);
  assert.match(home, /homeOrderOpen/);
  assert.match(home, /SCAN SYNC QUEUE/);
  assert.match(home, /setInterval\\(load,3000\\)/);
  assert.match(home, /All client types/);
  assert.match(home, /All products/);
  assert.match(home, /Clear filters/);
  assert.match(home, /quickAccess/);
  assert.doesNotMatch(home, /PERSON \\/ RECORD ENTRIES/);
  assert.doesNotMatch(home, /quickAccess: \\{ Orders:/);
  assert.match(orderDomain, /ORDER_STATUSES/);
  for (const status of ["Production", "QC 1", "Packing", "QC 2"]) assert.match(orderDomain, new RegExp(status));
});'''
if old_home not in text:
    raise RuntimeError('old home contract missing')
text = text.replace(old_home, new_home, 1)

old_workspace = '''test("workspace row operations are deliberate and pagination has one state source", () => {
  assert.match(enhancements, /<WorkspaceRowMenu \\/>/);
  assert.match(enhancements, /<SeikoCloseConfirm \\/>/);
  assert.match(rowMenu, /workspaceRowMenuTrigger/);
  assert.match(rowMenu, /Row actions/);
  assert.match(rowMenu, /Put on hold/);
  assert.match(rowMenu, /Delete row/);
  assert.match(rowMenu, /role", "menuitem"/);
  assert.match(rowMenu, /event\\.key === "Escape"/);
  assert.match(rowMenu, /pointerdown/);
  assert.match(orders, /Undo last change/);
  assert.match(orders, /Redo last change/);
  assert.match(pager, /realPager/);
  assert.match(pager, /setRealPageSize/);
  assert.match(pager, /dispatchEvent\\(new Event\\("change", \\{ bubbles: true \\}\\)\\)/);
});'''
new_workspace = '''test("workspace row and column operations are state-backed and page size is truly editable", () => {
  assert.match(enhancements, /<WorkspaceRowMenu \\/>/);
  assert.match(enhancements, /<WorkspaceStructureInteractions \\/>/);
  assert.match(enhancements, /<SeikoCloseConfirm \\/>/);
  assert.match(rowMenu, /workspaceRowMenuTrigger/);
  assert.match(rowMenu, /Put on hold/);
  assert.match(rowMenu, /Delete row/);
  assert.match(orders, /Undo last change/);
  assert.match(orders, /Redo last change/);
  assert.match(orders, /seiko:workspace-reorder-rows/);
  assert.match(orders, /seiko:workspace-reorder-columns/);
  assert.match(orderDomain, /columnOrder/);
  assert.match(structure, /workspaceRowHeader/);
  assert.match(structure, /workspaceMovableColumnHeader/);
  assert.match(structure, /event\\.shiftKey/);
  assert.match(structure, /event\\.ctrlKey \\|\\| event\\.metaKey/);
  assert.match(structure, /draggable=true/);
  assert.match(orders, /aria-label="Rows per page"/);
  assert.match(orders, /pageSizeDraft/);
  assert.match(pager, /setInputValue/);
  assert.match(pager, /FocusEvent\\("focusout"/);
  assert.doesNotMatch(pager, /setRealPageSize/);
});'''
if old_workspace not in text:
    raise RuntimeError('old workspace contract missing')
text = text.replace(old_workspace, new_workspace, 1)

old_menu = '''test("workspace keeps native Save and status as the state source while the operational menu can proxy them", () => {
  assert.match(orders, /workspaceStatusControl/);
  assert.doesNotMatch(orders, /workspaceLabelsButton/);
  assert.match(orders, /workspaceQuickSave/);
  assert.match(orders, /aria-label="More order actions"/);
  assert.match(orders, /onOpenLabelBatches\\(\\);}}>Labels<\\/button>/);
  assert.match(shortcuts, /key === "s"/);
  assert.match(shortcuts, /clickMenuAction\\(page, "Save & close"\\)/);
  assert.match(shortcuts, /clickMenuAction\\(page, "Labels"\\)/);
  assert.match(shortcuts, /key === "f"/);
  assert.match(shortcuts, /key === "x"/);
  assert.match(shortcuts, /event\\.key === "F2"/);
});'''
new_menu = '''test("workspace menu owns order status, save and secondary order actions", () => {
  assert.match(orders, /workspaceNativeMenuStatus/);
  assert.match(orders, /workspaceMenuSaveNow/);
  assert.match(orders, /Put order on hold/);
  assert.match(orders, /Archive order/);
  assert.match(orders, /Delete order/);
  assert.match(orders, /ORDER_STATUSES\\.map/);
  assert.match(orders, /aria-label="More order actions"/);
  assert.match(shortcuts, /key === "s"/);
  assert.match(shortcuts, /clickMenuAction\\(page, "Save & close"\\)/);
  assert.match(shortcuts, /clickMenuAction\\(page, "Labels"\\)/);
  assert.match(shortcuts, /key === "f"/);
  assert.match(shortcuts, /key === "x"/);
  assert.match(shortcuts, /event\\.key === "F2"/);
  assert.doesNotMatch(operationalUx, /className = "workspaceMenuOperational"/);
});'''
if old_menu not in text:
    raise RuntimeError('old workspace menu contract missing')
text = text.replace(old_menu, new_menu, 1)

insert_before = 'test("editing an existing order returns to and updates its workspace", () => {'
new_contracts = '''test("Order Center keeps status in operational metadata, rich workflow filters and archived state inside filters", () => {
  assert.match(operationalUx, /appendMetaItem\\(meta, "Status", order\\.status\\)/);
  assert.match(operationalUx, /orderProductSummary/);
  assert.match(operationalUx, /quantityForRecord/);
  assert.match(operationalUx, /resolvedSpecification/);
  assert.match(operationalUx, /orderProductHoverCard/);
  assert.match(listCenter, /ORDER_STATUSES/);
  assert.match(listCenter, /Archived only/);
  assert.match(listCenter, /orderArchivedNativeHidden/);
});

test("label manual arrange supports fine free movement and alignment to other elements", () => {
  assert.match(labelDesigner, /Math\\.round\\(x \\* 4\\) \\/ 4/);
  assert.match(labelDesigner, /Math\\.round\\(y \\* 4\\) \\/ 4/);
  assert.match(labelDesigner, /e\\.shiftKey/);
  assert.match(labelDesigner, /e\\.altKey/);
  assert.match(labelDesigner, /other\\.x \\+ other\\.w \\/ 2/);
  assert.match(labelDesigner, /other\\.y \\+ other\\.h \\/ 2/);
  assert.match(labelDesigner, /bestX < \\.36/);
  assert.match(labelDesigner, /bestY < \\.36/);
});

test("label record hover uses resolved package products and actual person fields only", () => {
  assert.match(labelDesigner, /Products: \\${record\\.values\\.product_summary}/);
  assert.match(labelDesigner, /key\\.startsWith\\("field:"\\)/);
  assert.match(labelDesigner, /field_name:\\${key}/);
  assert.doesNotMatch(labelDesigner, /\\[record\\.name, record\\.group, sourceMode === "person"/);
});

test("Save label set is a direct primary action and Ctrl or Cmd S asks what to save", () => {
  assert.match(labelDesigner, /labelHeaderSaveSet/);
  assert.match(labelDesigner, /Save label set/);
  assert.match(refinement, /openLabelSaveChoice/);
  assert.match(refinement, /event\\.ctrlKey \\|\\| event\\.metaKey/);
  assert.match(refinement, /Save label set/);
  assert.match(refinement, /Save layout/);
  assert.match(refinement, /labelHeaderSaveSet/);
  assert.match(refinement, /labelHeaderMore/);
});

'''
if insert_before not in text:
    raise RuntimeError('contract insert anchor missing')
text = text.replace(insert_before, new_contracts + insert_before, 1)

path.write_text(text, encoding='utf-8')
print('SEIKO operational contracts updated.')
