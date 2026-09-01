from pathlib import Path
import re


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
    p.write_text(text + "\n" + addition + "\n")

# 1) Workspace: keep the two header bands as one sticky unit so row 1 is never covered.
replace_once(
    "app/workspace-grid.css",
    '''/* Keep both header bands visible while the user works down a long order. */
.workspaceTable.groupedWorkspace thead tr:first-child th {
  position: sticky;
  top: 0 !important;
  z-index: 12;
}

.workspaceTable.groupedWorkspace thead tr:nth-child(2) th {
  position: sticky;
  top: 31px !important;
  z-index: 11;
}

.workspaceTable.groupedWorkspace thead th.stickyId,
.workspaceTable.groupedWorkspace thead tr:first-child th:first-child {
  z-index: 15;
}
''',
    '''/* Keep both header bands visible as one unit. Sticky individual rows can overlap
   the first record after a partial scroll, which made P-0001 look blank. */
.workspaceTable.groupedWorkspace thead {
  position: sticky;
  top: 0;
  z-index: 12;
}
.workspaceTable.groupedWorkspace thead tr:first-child th,
.workspaceTable.groupedWorkspace thead tr:nth-child(2) th {
  position: relative;
  top: auto !important;
  z-index: auto;
}
.workspaceTable.groupedWorkspace thead th.stickyId,
.workspaceTable.groupedWorkspace thead tr:first-child th:first-child {
  z-index: 1;
}
''',
)
replace_once("app/order-enhancements.css", ".workspaceResizableHeader{position:sticky!important}", ".workspaceResizableHeader{position:relative!important}")

# 2) Main navigation: a full-height flex drawer, with access inside Settings rather than below the business switcher.
append_once(
    "app/global-navigation.css",
    "/* precision-pass: stable menu height */",
    '''/* precision-pass: stable menu height */
.app .topbar .moduleMenu,
.globalStandaloneMenu{
  display:flex!important;
  flex-direction:column!important;
  height:calc(100dvh - 64px)!important;
  max-height:calc(100dvh - 64px)!important;
  overflow:auto!important;
  overscroll-behavior:contain;
  padding-bottom:max(14px,env(safe-area-inset-bottom))!important;
}
.app .topbar .moduleMenu .moduleMenuSettings,
.globalStandaloneMenu .moduleMenuSettings{
  display:grid!important;
  gap:4px!important;
  flex:0 0 auto!important;
  margin-top:10px!important;
  padding-top:10px!important;
  border-top:1px solid color-mix(in srgb,var(--line) 78%,transparent)!important;
}
.app .topbar .moduleMenu .globalBusinessNavigator,
.globalStandaloneMenu .globalBusinessNavigator{margin-top:auto!important;flex:0 0 auto!important}
.app .topbar .moduleMenu .moduleMenuSettings .accessMenuEntry,
.globalStandaloneMenu .moduleMenuSettings .accessMenuEntry{width:100%!important;min-height:44px!important}
''',
)
replace_once(
    "app/access-control.tsx",
    '      const host = document.querySelector<HTMLElement>(".moduleMenu");',
    '      const host = document.querySelector<HTMLElement>(".moduleMenu .moduleMenuSettings") || document.querySelector<HTMLElement>(".globalStandaloneMenu .moduleMenuSettings");',
)
replace_once(
    "app/access-control.tsx",
    '''  }, []);

  const membership = session?.businesses.find(item => item.businessId === businessId) || session?.businesses[0];''',
    '''  }, []);

  useEffect(() => {
    const openAccess = () => setPanelOpen(true);
    window.addEventListener("jinam:open-access", openAccess);
    return () => window.removeEventListener("jinam:open-access", openAccess);
  }, []);

  const membership = session?.businesses.find(item => item.businessId === businessId) || session?.businesses[0];''',
)

# 3) Home/settings: remove repeated SEIKO eyebrow and competing settings DOM injections.
replace_once("app/seiko-phase1.tsx", '      document.querySelectorAll<HTMLElement>(".moduleMenu .accessMenuEntry").forEach(button => { button.style.display = "none"; });\n', "")
settings_block = '''      const settings = document.querySelector<HTMLElement>(".themePanel");
      const settingsIntro = settings?.querySelector<HTMLElement>(".settingsIntro");
      if (settingsIntro) settingsIntro.textContent = "Manage SEIKO appearance and access.";
      if (settings && !settings.querySelector(".seikoAccessSettings")) {
        const card = document.createElement("section");
        card.className = "seikoAccessSettings";
        card.innerHTML = '<div><b>Users & access</b><p>Manage SEIKO users, roles and permissions.</p></div><button type="button" class="secondary">Open users & access</button>';
        card.querySelector("button")?.addEventListener("click", () => document.querySelector<HTMLButtonElement>(".accessMenuEntry")?.click());
        const intro = settings.querySelector(".settingsIntro");
        intro?.insertAdjacentElement("afterend", card);
      }
'''
replace_once("app/seiko-phase1.tsx", settings_block, "")
replace_once("app/seiko-phase1.tsx", '<div><small>SEIKO</small><h1>Home</h1>', '<div><h1>Home</h1>')

p = Path("app/seiko-operational-ux.tsx")
text = p.read_text()
start = text.find("function enhanceSettings(panel: HTMLElement) {")
end = text.find("\n\nfunction enhance()", start)
if start < 0 or end < 0:
    raise SystemExit("app/seiko-operational-ux.tsx: settings enhancer boundary missing")
text = text[:start] + 'function enhanceSettings(_panel: HTMLElement) {\n  // Settings is React-owned. Do not inject overlapping modules into the dialog.\n}\n' + text[end:]
p.write_text(text)

# Replace the base ThemeCustomizer with one React-owned two-module Settings dialog.
p = Path("app/page.tsx")
text = p.read_text()
start = text.find("function ThemeCustomizer(")
if start < 0:
    raise SystemExit("app/page.tsx: ThemeCustomizer missing")
new_theme = r'''function ThemeCustomizer({ businessName, theme, onSave, onClose }: { businessName: string; theme: BusinessTheme; onSave: (theme: BusinessTheme) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(theme);
  const [section, setSection] = useState<"appearance" | "users">("appearance");
  const [message, setMessage] = useState("Choose a preset, edit colours, or analyse a logo.");
  const colourFields: Array<[keyof BusinessTheme, string]> = [["primary", "Primary"], ["primaryAlt", "Secondary"], ["accent", "Accent"], ["background", "Background"], ["surface", "Surface"], ["ink", "Text"]];

  const analyseLogo = async (file?: File) => {
    if (!file) return;
    setMessage("Analysing logo colours…");
    try {
      const derived = await deriveThemeFromLogo(file, businessName);
      setDraft(derived); onSave(derived); setMessage("Logo palette applied. You can fine-tune it below.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The logo could not be analysed."); }
  };
  const openAccess = () => {
    onClose();
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("jinam:open-access")), 0);
  };

  return <div className="themeScrim" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="themePanel" role="dialog" aria-modal="true" aria-labelledby="theme-title">
    <div className="themeHead"><div><p className="eyebrow">SYSTEM SETTINGS</p><h2 id="theme-title">Settings · {businessName}</h2><p className="settingsIntro">Manage appearance, users and access from one settings area.</p></div><button onClick={onClose} aria-label="Close settings">×</button></div>
    <nav className="settingsModuleNav" aria-label="Settings modules">
      <button type="button" className={section === "appearance" ? "active" : ""} onClick={() => setSection("appearance")}><small>1</small><span>Appearance</span></button>
      <button type="button" className={section === "users" ? "active" : ""} onClick={() => setSection("users")}><small>2</small><span>Users & access</span></button>
    </nav>
    {section === "appearance" ? <div className="settingsAppearanceModule">
      <h3 className="settingsSectionTitle">Appearance</h3>
      <label className="themeField"><span>Preset mood</span><select value="" onChange={event => { const preset = THEME_PRESETS[event.target.value]; if (preset) setDraft(preset); }}><option value="">Custom / current</option><option value="seiko">Seiko · operational</option><option value="veyn">Veyn · clinical organic</option><option value="meth">MeTh · retail energy</option></select></label>
      <label className="logoPicker"><span>Automatically derive from company logo</span><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={event => analyseLogo(event.target.files?.[0])}/></label>
      <p className="themeMessage" role="status">{message}</p>
      <div className="colourGrid">{colourFields.map(([key, label]) => <label key={key}><span>{label}</span><input type="color" value={String(draft[key])} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}/><code>{String(draft[key])}</code></label>)}</div>
      <label className="themeField"><span>Heading style</span><select value={draft.headingFont} onChange={event => setDraft(current => ({ ...current, headingFont: event.target.value as BusinessTheme["headingFont"] }))}><option value="serif">Editorial serif</option><option value="sans">Modern sans serif</option></select></label>
      <div className="themePreview" style={themeVariables(draft) as CSSProperties}><span>Live mood preview</span><b>{businessName}</b><button type="button">Primary action</button></div>
      <div className="themeActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => { onSave({ ...draft, name: `${businessName} custom` }); onClose(); }}>Save theme</button></div>
    </div> : <section className="settingsUsersModule">
      <p className="eyebrow">USERS & ACCESS</p><h3>Users, roles and permissions</h3><p>Open the secure access manager to add users, assign roles and control which operational modules each person can use.</p><button type="button" className="primary" onClick={openAccess}>Open users & access</button>
    </section>}
  </section></div>;
}
'''
p.write_text(text[:start] + new_theme + "\n")

# 4) Label fields: typed data categories and baseline-aware manual snapping.
p = Path("app/label-designer.tsx")
text = p.read_text()
if "type LabelFieldOption" not in text:
    marker = 'type GroupCriterion = "order" | "product" | "size" | "specifications" | "measurements";\n'
    if marker not in text:
        raise SystemExit("app/label-designer.tsx: GroupCriterion marker missing")
    text = text.replace(marker, marker + 'type LabelFieldOption = { key: string; label: string; category?: "Product" | "Quantity" | "Measurements" | "Colour" | "Pattern" | "Attribute" | "Artwork" };\n', 1)
text = text.replace('function labelFieldOptions(order?: SeikoOrder | null) {', 'function labelFieldOptions(order?: SeikoOrder | null): LabelFieldOption[] {', 1)
old_fields = '''    const productBasics = order?.products.filter(product => product.name.trim()).flatMap(product => [
        { key: `product_name:${product.id}`, label: `${product.name} · Product` },
        { key: `product_quantity:${product.id}`, label: `${product.name} · Quantity` },
    ]) || [];
    const measurements = order?.measurements.flatMap(measurement => order.products.filter(product => measurement.appliesTo.includes(product.id)).map(product => ({ key: `measurement:${measurement.id}:product:${product.id}`, label: `${product.name} · ${measurement.name}` }))) || [];
    const specifications = order?.products.flatMap(product => product.specifications.filter(spec => spec.name.trim()).map(spec => ({ key: `spec:${spec.id}`, label: `${product.name} · ${spec.name} (resolved)` }))) || [];
'''
new_fields = '''    const productNames: LabelFieldOption[] = order?.products.filter(product => product.name.trim()).map(product => ({ key: `product_name:${product.id}`, label: `${product.name} · Product`, category: "Product" })) || [];
    const productQuantities: LabelFieldOption[] = order?.products.filter(product => product.name.trim()).map(product => ({ key: `product_quantity:${product.id}`, label: `${product.name} · Quantity`, category: "Quantity" })) || [];
    const measurements: LabelFieldOption[] = order?.measurements.flatMap(measurement => order.products.filter(product => measurement.appliesTo.includes(product.id)).map(product => ({ key: `measurement:${measurement.id}:product:${product.id}`, label: `${product.name} · ${measurement.name}`, category: "Measurements" as const }))) || [];
    const specifications: LabelFieldOption[] = order?.products.flatMap(product => product.specifications.filter(spec => spec.name.trim()).map(spec => ({ key: `spec:${spec.id}`, label: `${product.name} · ${spec.name} (resolved)`, category: (spec.role === "colour" ? "Colour" : spec.role === "pattern" ? "Pattern" : spec.role === "asset" ? "Artwork" : "Attribute") as LabelFieldOption["category"] }))) || [];
'''
if old_fields not in text:
    raise SystemExit("app/label-designer.tsx: product field declarations missing")
text = text.replace(old_fields, new_fields, 1)
if "...productBasics" not in text:
    raise SystemExit("app/label-designer.tsx: productBasics return marker missing")
text = text.replace("...productBasics", "...productNames, ...productQuantities", 1)
old_choice = '<div className={`fieldChoice ${item ? "chosen" : ""}`} key={option.key}>'
new_choice = '<div className={`fieldChoice ${item ? "chosen" : ""}`} data-product-detail-group={option.category || undefined} key={option.key}>'
if text.count(old_choice) != 1:
    raise SystemExit(f"app/label-designer.tsx: fieldChoice marker count {text.count(old_choice)}")
text = text.replace(old_choice, new_choice, 1)

baseline_marker = '    const sizeReadout = (item: Item) => ["text", "field", "sequence"].includes(item.kind)\n'
if baseline_marker not in text:
    raise SystemExit("app/label-designer.tsx: sizeReadout marker missing")
text = text.replace(baseline_marker, '''    const visualBaselineOffset = (item: Item) => {
        if (!["text", "field", "sequence"].includes(item.kind)) return item.h / 2;
        const lineHeightMm = Math.max(1, item.font * .352778 * 1.12);
        return Math.min(item.h, lineHeightMm) * .8;
    };
    const sizeReadout = (item: Item) => ["text", "field", "sequence"].includes(item.kind)\n''', 1)
old_snap = '''            let bestY = .36, adjustY = 0; yPoints.forEach(point => targetYs.forEach(target => { const delta = target - point; if (Math.abs(delta) < bestY) { bestY = Math.abs(delta); adjustY = delta; } }));
            if (bestX < .36) { x += adjustX; guideX = true; } if (bestY < .36) { y += adjustY; guideY = true; }
'''
new_snap = '''            let bestY = .36, adjustY = 0; yPoints.forEach(point => targetYs.forEach(target => { const delta = target - point; if (Math.abs(delta) < bestY) { bestY = Math.abs(delta); adjustY = delta; } }));
            let bestBaseline = .6, adjustBaseline = 0;
            if (["text", "field", "sequence"].includes(item.kind)) {
                const baseline = y + visualBaselineOffset(item);
                others.filter(other => ["text", "field", "sequence"].includes(other.kind)).forEach(other => {
                    const delta = other.y + visualBaselineOffset(other) - baseline;
                    if (Math.abs(delta) < bestBaseline) { bestBaseline = Math.abs(delta); adjustBaseline = delta; }
                });
            }
            if (bestX < .36) { x += adjustX; guideX = true; }
            if (bestBaseline < .6) { y += adjustBaseline; guideY = true; }
            else if (bestY < .36) { y += adjustY; guideY = true; }
'''
if old_snap not in text:
    raise SystemExit("app/label-designer.tsx: snap block missing")
text = text.replace(old_snap, new_snap, 1)

old_task_effect = '''    useEffect(() => { if (!order)\n        return; const taskId = sessionStorage.getItem(key(businessId, "open-task")); if (!taskId)\n        return; const task = labelTasks.find(item => item.id === taskId && item.orderId === order.orderId), timer = setTimeout(() => { if (task)\n        loadLabelTask(task); sessionStorage.removeItem(key(businessId, "open-task")); }, 0); return () => clearTimeout(timer); }, [businessId, order]);'''
new_task_effect = '''    useEffect(() => { if (!order)\n        return; const taskId = sessionStorage.getItem(key(businessId, "open-task")); if (!taskId)\n        return; const action = sessionStorage.getItem(key(businessId, "open-task-action")); const task = labelTasks.find(item => item.id === taskId && item.orderId === order.orderId), timer = setTimeout(() => { if (task) { loadLabelTask(task); if (action === "print" || action === "pdf") window.setTimeout(() => window.print(), 260); } sessionStorage.removeItem(key(businessId, "open-task")); sessionStorage.removeItem(key(businessId, "open-task-action")); }, 0); return () => clearTimeout(timer); }, [businessId, order]);'''
if old_task_effect not in text:
    raise SystemExit("app/label-designer.tsx: open-task effect missing")
text = text.replace(old_task_effect, new_task_effect, 1)
p.write_text(text)

# 5) Label information visual grouping by type rather than by individual product.
p = Path("app/label-designer-polish.tsx")
text = p.read_text()
old_group = '''function groupForLabel(label: string) {
  if (label.startsWith("Person detail ·")) return "Person details";
  if (/^(Trace code|Label number|Person number|Product number|Number within|Piece \/ pair|Package \/ set)/i.test(label)) return "Trace & codes";
  if (/^Applicable product \d+ ·/i.test(label)) return "Product details";
  if (label.includes(" · ")) return `Product details · ${label.split(" · ")[0]}`;
  return "Core information";
}
'''
new_group = '''function groupForLabel(label: string) {
  if (label.startsWith("Person detail ·")) return "Person details";
  if (/^(Trace code|Label number|Person number|Product number|Number within|Piece \/ pair|Package \/ set)/i.test(label)) return "Trace & codes";
  if (/^Applicable product \d+ ·/i.test(label) || label.includes(" · ")) return "Product details";
  return "Core information";
}
'''
if old_group not in text:
    raise SystemExit("app/label-designer-polish.tsx: groupForLabel missing")
text = text.replace(old_group, new_group, 1)
text = text.replace('  checklist.querySelectorAll(".fieldGroupHeading").forEach(node => node.remove());\n  let lastGroup = "";\n', '  checklist.querySelectorAll(".fieldGroupHeading,.fieldSubGroupHeading").forEach(node => node.remove());\n  let lastGroup = "", lastSubGroup = "";\n', 1)
old_loop = '''    if (group !== lastGroup) {
      const heading = document.createElement("div");
      heading.className = "fieldGroupHeading";
      heading.dataset.infoGroup = group;
      heading.textContent = group;
      checklist.insertBefore(heading, choice);
      lastGroup = group;
    }

    /* Selected fields always expose their compact styling controls.'''
new_loop = '''    if (group !== lastGroup) {
      const heading = document.createElement("div");
      heading.className = "fieldGroupHeading";
      heading.dataset.infoGroup = group;
      heading.textContent = group;
      checklist.insertBefore(heading, choice);
      lastGroup = group;
      lastSubGroup = "";
    }
    const subGroup = choice.dataset.productDetailGroup || "";
    if (group === "Product details" && subGroup && subGroup !== lastSubGroup) {
      const subHeading = document.createElement("div");
      subHeading.className = "fieldSubGroupHeading";
      subHeading.textContent = subGroup;
      checklist.insertBefore(subHeading, choice);
      lastSubGroup = subGroup;
    }

    /* Selected fields always expose their compact styling controls.'''
if old_loop not in text:
    raise SystemExit("app/label-designer-polish.tsx: grouping loop marker missing")
text = text.replace(old_loop, new_loop, 1)
p.write_text(text)
append_once(
    "app/label-designer-polish.css",
    "/* precision-pass: product detail subgroups */",
    '''/* precision-pass: product detail subgroups */
.labelDesignerPage .fieldSubGroupHeading{grid-column:1/-1;margin:3px 0 -1px;padding:2px 4px;color:var(--muted);font-size:9px;font-weight:850;letter-spacing:.035em;text-transform:uppercase}
.labelDesignerPage .fieldGroupHeading+.fieldSubGroupHeading{margin-top:0}
''',
)

# 6) Label Center saved-set actions: open/edit, print, calibrated print/PDF, then remove.
p = Path("app/seiko-list-center-enhancements.tsx")
text = p.read_text()
old_menu = '''    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "dangerText";
    remove.textContent = "Remove saved set";
    remove.addEventListener("click", () => {
      if (window.confirm(`Remove saved label set “${title}”? The order itself will not be changed.`)) removeSavedLabelSet(title);
    });
    panel.append(remove);
'''
new_menu = '''    const openSaved = (intent?: "print" | "pdf") => {
      menu.open = false;
      if (intent) sessionStorage.setItem(`jinam:${currentBusiness()}:labels:open-task-action`, intent);
      open.click();
    };
    const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Open / edit"; edit.addEventListener("click", () => openSaved());
    const print = document.createElement("button"); print.type = "button"; print.textContent = "Print"; print.addEventListener("click", () => openSaved("print"));
    const pdf = document.createElement("button"); pdf.type = "button"; pdf.textContent = "Print / save PDF"; pdf.title = "Opens the calibrated print output. Choose Save as PDF in the browser print dialog."; pdf.addEventListener("click", () => openSaved("pdf"));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "dangerText labelSavedSetDanger";
    remove.textContent = "Remove saved set";
    remove.addEventListener("click", () => {
      if (window.confirm(`Remove saved label set “${title}”? The order itself will not be changed.`)) removeSavedLabelSet(title);
    });
    panel.append(edit, print, pdf, remove);
'''
if old_menu not in text:
    raise SystemExit("app/seiko-list-center-enhancements.tsx: saved set menu marker missing")
p.write_text(text.replace(old_menu, new_menu, 1))

# 7) Settings/menu stability styling owned by current React structure.
append_once(
    "app/seiko-operational-ux.css",
    "/* precision-pass: React-owned settings */",
    '''/* precision-pass: React-owned settings */
.themeScrim{z-index:1800!important;display:grid!important;place-items:center!important;padding:18px!important;overflow:auto!important}
.themePanel{position:relative!important;width:min(780px,calc(100vw - 30px))!important;max-height:calc(100dvh - 36px)!important;margin:auto!important;padding:18px!important;overflow:auto!important;border-radius:14px!important}
.themePanel .themeHead{position:sticky!important;top:-18px!important;margin:-18px -18px 12px!important;padding:18px!important}
.themePanel .settingsModuleNav{grid-template-columns:repeat(2,minmax(0,1fr))!important;max-width:520px!important}
.themePanel .settingsAppearanceModule{min-width:0!important}
.themePanel .settingsUsersModule{min-height:220px!important}
.labelCenterActionMenu .labelSavedSetDanger{margin-top:4px!important;padding-top:9px!important;border-top:1px solid var(--line)!important}
''',
)

# 8) Regression contracts for the exact defects from screenshots.
p = Path("tests/seiko-runtime-preview-contract.test.mjs")
text = p.read_text()
if 'const workspaceGrid = read("app/workspace-grid.css");' not in text:
    text = text.replace('const structure = read("app/workspace-structure-interactions.tsx");\n', 'const structure = read("app/workspace-structure-interactions.tsx");\nconst workspaceGrid = read("app/workspace-grid.css");\nconst orderEnhancements = read("app/order-enhancements.css");\nconst navigationCss = read("app/global-navigation.css");\nconst access = read("app/access-control.tsx");\nconst page = read("app/page.tsx");\nconst labelPolish = read("app/label-designer-polish.tsx");\n', 1)
old_header_test = '''test("workspace has one authoritative header system", () => {
  assert.match(rowActions, /source-owned workspace now renders its own spreadsheet row headers/);
  assert.match(rowActions, /workspaceRowHeaderCorner/);
  assert.match(operationalCss, /table-layout:fixed!important/);
  assert.match(operationalCss, /workspaceRowNumberCol\\{width:44px!important/);
  assert.match(operationalCss, /thead tr:nth-child\\(2\\)>th\\{top:30px!important/);
});'''
new_header_test = '''test("workspace keeps its two header bands together without covering row one", () => {
  assert.match(rowActions, /source-owned workspace now renders its own spreadsheet row headers/);
  assert.match(rowActions, /workspaceRowHeaderCorner/);
  assert.match(workspaceGrid, /groupedWorkspace thead \\{[\\s\\S]*position: sticky/);
  assert.match(workspaceGrid, /thead tr:nth-child\\(2\\) th \\{[\\s\\S]*position: relative/);
  assert.doesNotMatch(orderEnhancements, /workspaceResizableHeader\\{position:sticky/);
});'''
if old_header_test not in text:
    raise SystemExit("tests/seiko-runtime-preview-contract.test.mjs: header test marker missing")
text = text.replace(old_header_test, new_header_test, 1)
extra = r'''

test("label movement supports visual baseline alignment across font sizes", () => {
  assert.match(labels, /visualBaselineOffset/);
  assert.match(labels, /bestBaseline = \.6/);
  assert.match(labels, /other\.y \+ visualBaselineOffset\(other\)/);
});

test("Product details are divided by data type and specification role", () => {
  assert.match(labels, /category: "Product"/);
  assert.match(labels, /category: "Quantity"/);
  assert.match(labels, /category: "Measurements"/);
  assert.match(labels, /spec\.role === "colour" \? "Colour"/);
  assert.match(labels, /spec\.role === "pattern" \? "Pattern"/);
  assert.match(labels, /spec\.role === "asset" \? "Artwork"/);
  assert.match(labelPolish, /fieldSubGroupHeading/);
});

test("main menu and settings keep access inside a stable full-height structure", () => {
  assert.match(navigationCss, /display:flex!important;[\s\S]*flex-direction:column!important;[\s\S]*100dvh/);
  assert.match(access, /moduleMenu \.moduleMenuSettings/);
  assert.match(access, /jinam:open-access/);
  assert.match(page, /settingsModuleNav/);
  assert.match(page, /Users & access/);
  assert.doesNotMatch(home, /<div><small>SEIKO<\/small><h1>Home<\/h1>/);
});

test("saved label sets expose print and calibrated PDF actions", () => {
  assert.match(listCenter, /Open \/ edit/);
  assert.match(listCenter, /Print \/ save PDF/);
  assert.match(listCenter, /open-task-action/);
  assert.match(labels, /open-task-action/);
});
'''
if 'label movement supports visual baseline alignment' not in text:
    text += extra
p.write_text(text)
