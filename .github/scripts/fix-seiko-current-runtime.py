from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one occurrence, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


def append_once(path: str, marker: str, addition: str) -> None:
    p = Path(path)
    text = p.read_text()
    if marker in text:
        return
    p.write_text(text.rstrip() + "\n\n" + addition.strip() + "\n")


# 1) Native workspace row headers are now authoritative. Stop the legacy enhancer
# from injecting a second row-number column/bulk bar on top of them.
replace_once(
    "app/workspace-row-actions.tsx",
    '  if (!table || !firstHeadRow) return;\n\n  // Remove the old checkbox-based selector if a previously rendered workspace still has it.\n  table.querySelectorAll(".workspaceSelectHead,.workspaceSelectCell").forEach(node => node.remove());',
    '  if (!table || !firstHeadRow) return;\n\n  // The source-owned workspace now renders its own spreadsheet row headers.\n  // Do not inject the retired selector column on top of that structure.\n  if (table.querySelector(".workspaceRowHeaderCorner") && table.querySelector("tbody .workspaceRowHeader")) {\n    table.querySelectorAll(".workspaceRowHeaderHead,.workspaceRowHeaderCell,.workspaceSelectHead,.workspaceSelectCell").forEach(node => node.remove());\n    page.querySelector(".workspaceBulkBar")?.remove();\n    return;\n  }\n\n  // Remove the old checkbox-based selector if a previously rendered workspace still has it.\n  table.querySelectorAll(".workspaceSelectHead,.workspaceSelectCell").forEach(node => node.remove());',
)

# 2) Tools must behave like a transient spreadsheet menu: click/focus/scroll outside closes it.
replace_once(
    "app/workspace-shortcuts.tsx",
    '    const ensure = () => { const page = currentWorkspace(); if (!page) return; ensureShortcutGuide(page); organizeColumnMenu(page); };\n    ensure();\n    const observer = new MutationObserver(ensure);\n    observer.observe(document.body, { childList: true, subtree: true });\n    document.addEventListener("keydown", onKeyDown, true);\n    return () => { observer.disconnect(); document.removeEventListener("keydown", onKeyDown, true); };',
    '    const closeTools = (event?: Event) => {\n      const page = currentWorkspace();\n      const tools = page?.querySelector<HTMLDetailsElement>(".workspaceCompactTools[open]");\n      if (!tools) return;\n      const target = event?.target as Element | null;\n      if (target?.closest?.(".workspaceCompactTools")) return;\n      tools.open = false;\n    };\n    const ensure = () => { const page = currentWorkspace(); if (!page) return; ensureShortcutGuide(page); organizeColumnMenu(page); };\n    ensure();\n    const observer = new MutationObserver(ensure);\n    observer.observe(document.body, { childList: true, subtree: true });\n    document.addEventListener("keydown", onKeyDown, true);\n    document.addEventListener("pointerdown", closeTools, true);\n    document.addEventListener("focusin", closeTools, true);\n    document.addEventListener("scroll", closeTools, true);\n    window.addEventListener("resize", closeTools);\n    return () => {\n      observer.disconnect();\n      document.removeEventListener("keydown", onKeyDown, true);\n      document.removeEventListener("pointerdown", closeTools, true);\n      document.removeEventListener("focusin", closeTools, true);\n      document.removeEventListener("scroll", closeTools, true);\n      window.removeEventListener("resize", closeTools);\n    };',
)

# 3) Right-click workspace menus also close on any outside work, scroll, resize or window blur.
replace_once(
    "app/workspace-structure-interactions.tsx",
    '  window.setTimeout(()=>document.addEventListener("pointerdown",closeContextMenu,{once:true,capture:true}),0);\n',
    '',
)
replace_once(
    "app/workspace-structure-interactions.tsx",
    'export function WorkspaceStructureInteractions(){useEffect(()=>{const controller=startDomEnhancement(enhance,{observer:{childList:true,subtree:true}});const clear=()=>clearDropHints();document.addEventListener("dragend",clear,true);return()=>{document.removeEventListener("dragend",clear,true);clearDropHints();closeContextMenu();controller.stop();};},[]);return null;}',
    'export function WorkspaceStructureInteractions(){useEffect(()=>{\n  const controller=startDomEnhancement(enhance,{observer:{childList:true,subtree:true}});\n  const clear=()=>clearDropHints();\n  const outside=(event:PointerEvent)=>{const target=event.target as Element|null;if(!target?.closest?.(".workspaceContextMenu"))closeContextMenu();};\n  const closeTransient=()=>closeContextMenu();\n  document.addEventListener("dragend",clear,true);\n  document.addEventListener("pointerdown",outside,true);\n  document.addEventListener("scroll",closeTransient,true);\n  window.addEventListener("resize",closeTransient);\n  window.addEventListener("blur",closeTransient);\n  return()=>{document.removeEventListener("dragend",clear,true);document.removeEventListener("pointerdown",outside,true);document.removeEventListener("scroll",closeTransient,true);window.removeEventListener("resize",closeTransient);window.removeEventListener("blur",closeTransient);clearDropHints();closeContextMenu();controller.stop();};\n},[]);return null;}',
)

# 4) Returning from Workspace starts Order Center clean instead of retaining a hidden search/archive state.
replace_once(
    "app/orders.tsx",
    'onOpenLabelBatches={()=>onOpenLabelBatches?.(current)} onBack={() => save(current, "Order saved", true)} onChange={setCurrent}',
    'onOpenLabelBatches={()=>onOpenLabelBatches?.(current)} onBack={() => { setQuery(""); setArchivedOnly(false); save(current, "Order saved", true); }} onChange={setCurrent}',
)

# 5) Order Center enhancer filter state is page-scoped/reset, and Clear all clears native search/archive too.
replace_once(
    "app/seiko-list-center-enhancements.tsx",
    'const filterState: OrderFilters = { status: "", clientType: "", product: "", delivery: "all" };\n',
    'const filterState: OrderFilters = { status: "", clientType: "", product: "", delivery: "all" };\nfunction resetFilterState() { filterState.status = ""; filterState.clientType = ""; filterState.product = ""; filterState.delivery = "all"; }\nfunction setNativeInputValue(input: HTMLInputElement, value: string) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); }\n',
)
replace_once(
    "app/seiko-list-center-enhancements.tsx",
    'function ensureOrderFilters(page: HTMLElement) {\n  if (page.querySelector(".orderAdvancedFilters")) {',
    'function ensureOrderFilters(page: HTMLElement) {\n  if (page.dataset.orderFilterSession !== "ready") { resetFilterState(); page.dataset.orderFilterSession = "ready"; }\n  if (page.querySelector(".orderAdvancedFilters")) {',
)
replace_once(
    "app/seiko-list-center-enhancements.tsx",
    '  clear.addEventListener("click", () => {\n    filterState.status = "";\n    filterState.clientType = "";\n    filterState.product = "";\n    filterState.delivery = "all";\n    bar.querySelectorAll<HTMLSelectElement>("select").forEach(select => { select.selectedIndex = 0; });\n    syncProductSelect(page);\n    applyOrderFilters(page);\n  });',
    '  clear.addEventListener("click", () => {\n    resetFilterState();\n    const nativeSearch = tools.querySelector<HTMLInputElement>(\':scope > input[placeholder*="Search order"]\');\n    if (nativeSearch && nativeSearch.value) setNativeInputValue(nativeSearch, "");\n    if (archivedNative?.checked) archivedNative.click();\n    archivedProxy.checked = false;\n    bar.querySelectorAll<HTMLSelectElement>("select").forEach(select => { select.selectedIndex = 0; });\n    syncProductSelect(page);\n    applyOrderFilters(page);\n  });',
)

# Label Center: row is the primary Open affordance; overflow menu is secondary and floats above the list.
replace_once(
    "app/seiko-list-center-enhancements.tsx",
    '  page.querySelectorAll<HTMLElement>(".labelBatchModuleList > article").forEach(row => {\n    if (row.querySelector(".seikoRowActionMenu")) return;\n    const title = row.querySelector<HTMLElement>("b")?.textContent?.trim() || "Saved label set";\n    const open = row.querySelector<HTMLButtonElement>(":scope > button");\n    if (!open) return;\n    const menu = document.createElement("details");',
    '  page.querySelectorAll<HTMLElement>(".labelBatchModuleList > article").forEach(row => {\n    const title = row.querySelector<HTMLElement>("b")?.textContent?.trim() || "Saved label set";\n    const open = row.querySelector<HTMLButtonElement>(":scope > button");\n    if (!open) return;\n    open.hidden = true;\n    row.classList.add("labelBatchRowClickable");\n    if (row.dataset.rowOpenReady !== "true") {\n      row.dataset.rowOpenReady = "true"; row.tabIndex = 0; row.setAttribute("role", "button"); row.setAttribute("aria-label", `Open ${title}`);\n      const shouldOpen = (target: EventTarget | null) => !(target instanceof Element && target.closest("button,input,select,label,details,summary,a"));\n      row.addEventListener("click", event => { if (shouldOpen(event.target)) open.click(); });\n      row.addEventListener("keydown", event => { if ((event.key === "Enter" || event.key === " ") && event.target === row) { event.preventDefault(); open.click(); } });\n    }\n    if (row.querySelector(".seikoRowActionMenu")) return;\n    const menu = document.createElement("details");',
)
replace_once(
    "app/seiko-list-center-enhancements.tsx",
    '    const openAction = document.createElement("button");\n    openAction.type = "button";\n    openAction.textContent = "Open label set";\n    openAction.addEventListener("click", () => { menu.open = false; open.click(); });\n    const remove = document.createElement("button");',
    '    const remove = document.createElement("button");',
)
replace_once(
    "app/seiko-list-center-enhancements.tsx",
    '    panel.append(openAction, remove);\n    menu.append(summary, panel);\n    menu.addEventListener("toggle", () => { if (menu.open) closeOtherMenus(menu); });',
    '    panel.append(remove);\n    menu.append(summary, panel);\n    menu.addEventListener("toggle", () => {\n      row.classList.toggle("labelBatchMenuOpen", menu.open);\n      if (!menu.open) return;\n      closeOtherMenus(menu);\n      requestAnimationFrame(() => {\n        const anchor = summary.getBoundingClientRect(); const box = panel.getBoundingClientRect();\n        panel.classList.add("labelCenterFloatingPanel");\n        panel.style.left = `${Math.max(8, Math.min(window.innerWidth - Math.max(180, box.width) - 8, anchor.right - Math.max(180, box.width)))}px`;\n        panel.style.top = `${Math.max(8, Math.min(window.innerHeight - box.height - 8, anchor.bottom + 5))}px`;\n      });\n    });',
)
replace_once(
    "app/seiko-list-center-enhancements.tsx",
    '    document.addEventListener("pointerdown", outside, true);\n    document.addEventListener("change", controller.schedule, true);\n    return () => {\n      document.removeEventListener("pointerdown", outside, true);\n      document.removeEventListener("change", controller.schedule, true);',
    '    const transient = () => closeOtherMenus();\n    document.addEventListener("pointerdown", outside, true);\n    document.addEventListener("scroll", transient, true);\n    window.addEventListener("resize", transient);\n    document.addEventListener("change", controller.schedule, true);\n    return () => {\n      document.removeEventListener("pointerdown", outside, true);\n      document.removeEventListener("scroll", transient, true);\n      window.removeEventListener("resize", transient);\n      document.removeEventListener("change", controller.schedule, true);',
)

# 6) Header geometry: one source-owned row-number column and fixed two-band alignment.
append_once(
    "app/seiko-operational-ux.css",
    "/* runtime-accuracy: workspace header geometry */",
    '''/* runtime-accuracy: workspace header geometry */
.workspaceTable.groupedWorkspace{table-layout:fixed!important;border-collapse:separate!important;border-spacing:0!important}
.workspaceTable.groupedWorkspace col.workspaceRowNumberCol{width:44px!important;min-width:44px!important;max-width:44px!important}
.workspaceTable.groupedWorkspace col.workspaceActionsCol{width:64px!important;min-width:64px!important;max-width:64px!important}
.workspaceTable.groupedWorkspace th,.workspaceTable.groupedWorkspace td{box-sizing:border-box!important}
.workspaceTable.groupedWorkspace thead tr:first-child{height:30px!important}
.workspaceTable.groupedWorkspace thead tr:first-child>th{height:30px!important;min-height:30px!important;vertical-align:middle!important}
.workspaceTable.groupedWorkspace thead tr:nth-child(2){height:30px!important}
.workspaceTable.groupedWorkspace thead tr:nth-child(2)>th{top:30px!important;height:30px!important;min-height:30px!important;vertical-align:middle!important}
.workspaceTable.groupedWorkspace .workspaceRowHeaderCorner,.workspaceTable.groupedWorkspace .workspaceRowHeader{width:44px!important;min-width:44px!important;max-width:44px!important;padding:0!important;text-align:center!important}
.workspaceTable.groupedWorkspace .productGroup{text-align:center!important;vertical-align:middle!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
.workspaceTable.groupedWorkspace .workspaceMovableColumnHeader{vertical-align:middle!important}
''',
)

# 7) Label Center menu is a viewport popover; row opening is visually obvious and not clipped.
append_once(
    "app/seiko-list-center-enhancements.css",
    "/* runtime-accuracy: label center rows and menus */",
    '''/* runtime-accuracy: label center rows and menus */
.labelBatchModuleList>article.labelBatchRowClickable{cursor:pointer!important;overflow:visible!important}
.labelBatchModuleList>article.labelBatchRowClickable:hover{background:color-mix(in srgb,var(--brand) 4%,var(--paper))!important}
.labelBatchModuleList>article.labelBatchRowClickable:focus-visible{outline:2px solid color-mix(in srgb,var(--brand) 60%,var(--navy))!important;outline-offset:2px!important}
.labelBatchModuleList>article.labelBatchMenuOpen{z-index:350!important}
.labelBatchModuleList>article.labelBatchRowClickable>:scope>button[hidden]{display:none!important}
.labelCenterActionMenu{z-index:360!important}
.labelCenterActionMenu .labelCenterFloatingPanel{position:fixed!important;z-index:1200!important;top:auto;right:auto}
''',
)

# 8) Correct label applicability: group/default quantity cannot bypass record-level product evidence.
replace_once(
    "app/label-designer.tsx",
    '    if (product.quantityMode === "by_group" && product.quantityGroupFieldId) {\n        const sourceValue = String(record.values[`field:${product.quantityGroupFieldId}`] || "");\n        if ((product.quantityGroupRules || []).some(rule => groupRuleMatches(rule.match, sourceValue))) return quantity;\n    }\n',
    '',
)

# Regression checks for the exact runtime problems from preview review.
p = Path("tests/seiko-workspace-label-accuracy-contract.test.mjs")
text = p.read_text()
addition = r'''

test("native workspace headers do not get a duplicate legacy row-number column", () => {
  const rowActions = read("app/workspace-row-actions.tsx");
  assert.match(rowActions, /workspaceRowHeaderCorner/);
  assert.match(rowActions, /workspaceRowHeaderHead,\.workspaceRowHeaderCell/);
  assert.match(rowActions, /page\.querySelector\("\.workspaceBulkBar"\)\?\.remove\(\)/);
});

test("workspace transient tools and context menus dismiss outside their interaction", () => {
  const structure = read("app/workspace-structure-interactions.tsx");
  assert.match(shortcuts, /workspaceCompactTools\[open\]/);
  assert.match(shortcuts, /document\.addEventListener\("pointerdown", closeTools, true\)/);
  assert.match(shortcuts, /document\.addEventListener\("scroll", closeTools, true\)/);
  assert.match(structure, /document\.addEventListener\("pointerdown",outside,true\)/);
  assert.match(structure, /document\.addEventListener\("scroll",closeTransient,true\)/);
});

test("returning to Order Center and Clear all cannot retain invisible filters", () => {
  const listCenter = read("app/seiko-list-center-enhancements.tsx");
  assert.match(orders, /setQuery\(""\); setArchivedOnly\(false\); save\(current, "Order saved", true\)/);
  assert.match(listCenter, /resetFilterState\(\)/);
  assert.match(listCenter, /setNativeInputValue\(nativeSearch, ""\)/);
  assert.match(listCenter, /if \(archivedNative\?\.checked\) archivedNative\.click\(\)/);
});

test("Label Center uses clickable rows and floating secondary menus", () => {
  const listCenter = read("app/seiko-list-center-enhancements.tsx");
  const listCss = read("app/seiko-list-center-enhancements.css");
  assert.match(listCenter, /labelBatchRowClickable/);
  assert.match(listCenter, /open\.hidden = true/);
  assert.doesNotMatch(listCenter, /openAction\.textContent = "Open label set"/);
  assert.match(listCenter, /labelCenterFloatingPanel/);
  assert.match(listCss, /position:fixed!important;z-index:1200!important/);
});

test("group/default quantities cannot bypass record-level product applicability", () => {
  const start = labels.indexOf("function labelQuantityForRecord");
  const end = labels.indexOf("function orderLabelRows", start);
  const resolver = labels.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(resolver, /orderUsesProductEvidence/);
  assert.match(resolver, /evidenceColumns\.some\(column => hasLabelValue\(recordValues\[column\.id\]\)\) \? quantity : 0/);
  assert.doesNotMatch(resolver, /quantityMode === "by_group"[\s\S]{0,240}return quantity/);
});
'''
if 'test("native workspace headers do not get a duplicate legacy row-number column"' not in text:
    p.write_text(text.rstrip() + addition + "\n")
