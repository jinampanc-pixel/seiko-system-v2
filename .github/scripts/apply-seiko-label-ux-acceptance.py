from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing target: {label}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, lambda _m: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Missing regex target: {label}")
    return updated


# -----------------------------------------------------------------------------
# Labels create route: representation selected here is only the INITIAL value.
# The designer itself remains changeable instead of being locked to "Back to setup".
# -----------------------------------------------------------------------------
path = "app/labels/create/page.tsx"
text = read(path)
text = regex_once(
    text,
    r'function DesignerSourceLock\(\{ sourceMode, displayLabel \}: \{ sourceMode: SourceMode; displayLabel: string \}\) \{.*?\n\}\n\nexport default function CreateLabelsPage',
    'export default function CreateLabelsPage',
    "remove DesignerSourceLock",
)
text = replace_once(
    text,
    '<div className="surface"><header className="labelCreateTopbar"><img className={`labelCreateBrand logo-${businessId}`} src={logo} alt="Business logo"/></header><DesignerSourceLock sourceMode={selectedRepresentation.sourceMode} displayLabel={selectedRepresentation.label}/><LabelDesigner businessId={businessId} order={selectedOrder} initialPurpose={selectedPurpose.behavior} canManageSizes={canManage} onBack={() => setStarted(false)}/></div>',
    '<div className="surface"><header className="labelCreateTopbar"><img className={`labelCreateBrand logo-${businessId}`} src={logo} alt="Business logo"/></header><LabelDesigner businessId={businessId} order={selectedOrder} initialPurpose={selectedPurpose.behavior} initialSourceMode={selectedRepresentation.sourceMode} canManageSizes={canManage} onBack={() => setStarted(false)}/></div>',
    "pass initial source mode",
)
write(path, text)


# -----------------------------------------------------------------------------
# Core label designer: purpose-aware information, clear custom components,
# editable calibrated sizes, visible layout meaning and direct representation.
# -----------------------------------------------------------------------------
path = "app/label-designer.tsx"
text = read(path)
text = replace_once(
    text,
    '    initialPurpose?: LabelPurpose | null;\n}) {\n    const [purpose, setPurpose] = useState<LabelPurpose | null>(order ? initialPurpose : "production");\n    const [sourceMode, setSourceModeState] = useState<SourceMode>(initialPurpose === "packing" ? "person" : initialPurpose === "inventory" ? "product" : "person_product");',
    '    initialPurpose?: LabelPurpose | null;\n    initialSourceMode?: SourceMode;\n}) {\n    const [purpose, setPurpose] = useState<LabelPurpose | null>(order ? initialPurpose : "production");\n    const [sourceMode, setSourceModeState] = useState<SourceMode>(initialSourceMode || (initialPurpose === "packing" ? "person" : initialPurpose === "inventory" ? "product" : "person_product"));',
    "initial representation prop",
)
text = replace_once(
    text,
    '    const [presets, setPresets] = useState<Preset[]>(() => [roll, ...stored<Preset[]>(key(businessId, "presets-v1"), [])]), [presetId, setPresetId] = useState(roll.id), [showSizes, setShowSizes] = useState(false), [sizeMenuOpen, setSizeMenuOpen] = useState(false);',
    '    const [presets, setPresets] = useState<Preset[]>(() => [roll, ...stored<Preset[]>(key(businessId, "presets-v1"), [])]), [presetId, setPresetId] = useState(roll.id), [showSizes, setShowSizes] = useState(false), [sizeMenuOpen, setSizeMenuOpen] = useState(false), [editingSizeId, setEditingSizeId] = useState("");',
    "size editing state",
)
text = replace_once(
    text,
    '    const fieldOptions = useMemo(() => labelFieldOptions(order).map(option => option.key === "product_summary" ? { ...option, label: "Package contents" } : option), [order]);',
    '    const fieldOptions = useMemo(() => labelFieldOptions(order).map(option => option.key === "product_summary" ? { ...option, label: "Package contents" } : option).filter(option => fieldRelevantForPurpose(option.key, purpose, sourceMode)), [order, purpose, sourceMode]);',
    "purpose-aware field options",
)
text = replace_once(
    text,
    '    } | null>(null), preset = presets.find(p => p.id === presetId) || roll, selectedRecords = records.filter(record => selectedRows.includes(record.id)), printRecords = selectedRecords, current = records.find(r => r.id === previewId) || printRecords[0] || records.find(r => r.id === selectedRows.at(-1)) || records[0] || emptyRecord, selected = items.find(i => i.id === selectedId), products = useMemo(() => [...new Set(records.map(r => r.product))], [records]);',
    '''    } | null>(null), preset = presets.find(p => p.id === presetId) || roll, selectedRecords = records.filter(record => selectedRows.includes(record.id)), printRecords = selectedRecords, current = records.find(r => r.id === previewId) || printRecords[0] || records.find(r => r.id === selectedRows.at(-1)) || records[0] || emptyRecord, selected = items.find(i => i.id === selectedId), products = useMemo(() => [...new Set(records.map(r => r.product))], [records]);
    useEffect(() => {
        if (!advanced) return;
        setItems(all => all.map(item => {
            const w = Math.min(item.w, preset.labelW);
            const h = Math.min(item.h, preset.labelH);
            return { ...item, w, h, x: clamp(item.x, 0, Math.max(0, preset.labelW - w)), y: clamp(item.y, 0, Math.max(0, preset.labelH - h)) };
        }));
    }, [advanced, preset.labelH, preset.labelW, presetId]);''',
    "advanced size calibration",
)
text = replace_once(
    text,
    '    const createSize = () => { const p: Preset = { id: crypto.randomUUID(), name: newSize.name.trim(), labelW: Number(newSize.labelW), labelH: Number(newSize.labelH), rollW: Number(newSize.rollW), columns: Number(newSize.columns), outer: Number(newSize.outer), gapX: Number(newSize.gapX), gapY: Number(newSize.gapY) }; if (!p.name || [p.labelW, p.labelH, p.rollW, p.columns].some(n => !Number.isFinite(n) || n <= 0))\n        return; savePresets([...presets, p]); setPresetId(p.id); setShowSizes(false); setNewSize({ name: "", labelW: "50", labelH: "25", rollW: "109", columns: "2", outer: "3", gapX: "3", gapY: "3" }); };',
    '''    const resetSizeDraft = () => { setEditingSizeId(""); setNewSize({ name: "", labelW: "50", labelH: "25", rollW: "109", columns: "2", outer: "3", gapX: "3", gapY: "3" }); };
    const editSize = (size: Preset) => { setEditingSizeId(size.locked ? "" : size.id); setNewSize({ name: size.locked ? `${size.name} copy` : size.name, labelW: String(size.labelW), labelH: String(size.labelH), rollW: String(size.rollW), columns: String(size.columns), outer: String(size.outer), gapX: String(size.gapX), gapY: String(size.gapY) }); setShowSizes(true); setSizeMenuOpen(false); };
    const createSize = () => { const p: Preset = { id: editingSizeId || crypto.randomUUID(), name: newSize.name.trim(), labelW: Number(newSize.labelW), labelH: Number(newSize.labelH), rollW: Number(newSize.rollW), columns: Number(newSize.columns), outer: Number(newSize.outer), gapX: Number(newSize.gapX), gapY: Number(newSize.gapY) }; const requiredRoll = p.outer * 2 + p.columns * p.labelW + Math.max(0, p.columns - 1) * p.gapX; if (!p.name || [p.labelW, p.labelH, p.rollW, p.columns].some(n => !Number.isFinite(n) || n <= 0) || p.rollW + .01 < requiredRoll) return; const next = editingSizeId ? presets.map(item => item.id === editingSizeId ? p : item) : [...presets, p]; savePresets(next); setPresetId(p.id); setShowSizes(false); resetSizeDraft(); };''',
    "editable size save",
)
text = replace_once(
    text,
    '<label><span>Label represents</span><select value={sourceMode} disabled={!order} onChange={e => setSourceMode(e.target.value as SourceMode)}><option value="person_product">Each physical item</option><option value="person">Each person / package</option><option value="group">Grouped package / group</option><option value="product">Each product / stock group</option><option value="order">Whole order</option></select></label>',
    '<label><span>Label represents</span><select value={sourceMode} disabled={!order} onChange={e => setSourceMode(e.target.value as SourceMode)}><option value="person_product">Each physical item</option><option value="person">Each person / package</option><option value="group">Grouped package / group</option><option value="product">Each product / stock group</option><option value="order">Whole order</option></select><small className="labelSetupHelp">Choose what one printed label identifies.</small></label>',
    "representation helper",
)
text = replace_once(
    text,
    '<label><span>Label type</span><select value={outputMode} onChange={e => setOutputMode(e.target.value as OutputMode)}><option value="combined">Code + information</option><option value="code">Code only</option><option value="information">Information only</option><option value="custom">Custom selection</option></select><small className="labelTypeHelp">Choose this only when you want to manually control which information and codes appear.</small></label>',
    '<label><span>Label type</span><select value={outputMode} onChange={e => setOutputMode(e.target.value as OutputMode)}><option value="combined">Code + information</option><option value="code">Code only</option><option value="information">Information only</option><option value="custom">Custom selection</option></select><small className="labelSetupHelp">Custom selection lets you add individual fields, text and codes.</small></label>',
    "label type helper",
)
text = replace_once(
    text,
    '{presets.map(option => <div className={`managedSizeOptionRow ${option.id === presetId ? "selected" : ""}`} key={option.id}><button type="button" role="option" aria-selected={option.id === presetId} onClick={() => { setPresetId(option.id); setSizeMenuOpen(false); }}>{option.name}</button>{canManageSizes && !option.locked && <button type="button" className="managedRemove" aria-label={`Remove ${option.name}`} onClick={() => { savePresets(presets.filter(item => item.id !== option.id)); if (presetId === option.id) setPresetId(roll.id); }}>×</button>}</div>)}{canManageSizes && <button type="button" className="managedAdd" onClick={() => { setShowSizes(true); setSizeMenuOpen(false); }}>+ New size</button>}',
    '{presets.map(option => <div className={`managedSizeOptionRow ${option.id === presetId ? "selected" : ""}`} key={option.id}><button type="button" role="option" aria-selected={option.id === presetId} onClick={() => { setPresetId(option.id); setSizeMenuOpen(false); }}>{option.name}</button>{canManageSizes && <button type="button" className="managedEdit" onClick={() => editSize(option)}>{option.locked ? "Copy & edit" : "Edit"}</button>}{canManageSizes && !option.locked && <button type="button" className="managedRemove" aria-label={`Remove ${option.name}`} onClick={() => { savePresets(presets.filter(item => item.id !== option.id)); if (presetId === option.id) setPresetId(roll.id); }}>×</button>}</div>)}{canManageSizes && <button type="button" className="managedAdd" onClick={() => { resetSizeDraft(); setShowSizes(true); setSizeMenuOpen(false); }}>+ New size</button>}',
    "size menu edit controls",
)
text = replace_once(
    text,
    '</div>\n  <div className="rollSummary"><b>{preset.labelW} × {preset.labelH} mm · {preset.columns} across</b><small>{preset.outer} + {preset.labelW} + {preset.gapX} + {preset.labelW} + {preset.outer} = {preset.rollW} mm roll</small></div>',
    '</div><small className="labelSetupHelp">Physical size and roll geometry drive preview and printing in millimetres.</small>\n  <div className="rollSummary"><b>{preset.labelW} × {preset.labelH} mm · {preset.columns} across</b><small>{preset.outer} + {preset.labelW} + {preset.gapX} + {preset.labelW} + {preset.outer} = {preset.rollW} mm roll</small></div>',
    "size helper",
)
text = replace_once(
    text,
    ' </section>\n\n </div>\n {purpose === "packing" && sourceMode === "person"',
    ''' </section>
 {outputMode === "custom" && <section className="labelCustomComponents panel"><div><p className="eyebrow">CUSTOM COMPONENTS</p><h3>Add exactly what this label needs</h3><small>Information fields still come from the order. These controls add free text and machine-readable components to the same preview.</small></div><div className="labelCustomComponentButtons"><button type="button" onClick={() => add("field")}>+ Information field</button><button type="button" onClick={() => add("text")}>+ Free text</button><button type="button" onClick={() => add("qr")}>+ QR code</button><button type="button" onClick={() => add("barcode")}>+ Barcode</button><button type="button" onClick={() => add("sequence")}>+ Sequence</button></div></section>}

 </div>
 {purpose === "packing" && sourceMode === "person"''',
    "custom component panel",
)
text = replace_once(
    text,
    '{showSizes && canManageSizes && <section className="customSize panel" role="dialog" aria-label="New label size"><div><h3>New label size</h3><p>All measurements are millimetres.</p></div>',
    '{showSizes && canManageSizes && <section className="customSize panel" role="dialog" aria-label={editingSizeId ? "Edit label size" : "New label size"}><div><h3>{editingSizeId ? "Edit label size" : "New label size"}</h3><p>All measurements are millimetres. Preview and print calibrate automatically; simple layouts reflow and advanced elements are kept inside the new physical boundary.</p></div>',
    "size editor explanation",
)
# setup-derived order fields
text = replace_once(
    text,
    'function purposeLabel(purpose: LabelPurpose | null) { return purpose === "production" ? "Production" : purpose === "packing" ? "Packing" : purpose === "inventory" ? "Inventory" : "Choose label purpose"; }',
    '''function purposeLabel(purpose: LabelPurpose | null) { return purpose === "production" ? "Production" : purpose === "packing" ? "Packing" : purpose === "inventory" ? "Inventory" : "Choose label purpose"; }
function fieldRelevantForPurpose(key: string, purpose: LabelPurpose | null, source: SourceMode) {
    if (!purpose) return true;
    const personField = key === "name" || key === "group" || key.startsWith("field:") || key.startsWith("trace_field:");
    const packingOnly = key === "product_summary" || key === "people_count" || key === "package_position";
    const productionOnly = key === "bundle_summary" || key === "unit_position";
    if (purpose === "inventory") return !personField && !packingOnly && !productionOnly;
    if (purpose === "packing") return !productionOnly && key !== "variation_count";
    if (purpose === "production") return !packingOnly || source === "order";
    return true;
}''',
    "purpose field relevance",
)
text = replace_once(
    text,
    'function labelFieldOptions(order?: SeikoOrder | null) { const base = [{ key: "name", label: "Person / workpiece" }, { key: "group", label: "Group / label type" }, { key: "product", label: "Product" }, { key: "product_summary", label: "Product and quantity summary" }, { key: "bundle_summary", label: "Cutting bundle summary" }, { key: "size", label: "Resolved size" }, { key: "resolved_quantity", label: "Calculated quantity" }, { key: "people_count", label: "Number of people" }, { key: "variation_count", label: "Number of variations" }, { key: "unit_position", label: "Piece / pair number / total" }, { key: "package_position", label: "Package / set number / total" }, { key: "trace_order_position", label: "Label number / order total" }, { key: "trace_person_position", label: "Person number / total" }, { key: "trace_product_position", label: "Product number / total" }, { key: "order", label: "Order number" }, { key: "client", label: "Client" }, { key: "token", label: "Trace code" }],',
    'function labelFieldOptions(order?: SeikoOrder | null) { const base = [{ key: "name", label: "Person / workpiece" }, { key: "group", label: "Group / label type" }, { key: "product", label: "Product" }, { key: "product_summary", label: "Product and quantity summary" }, { key: "bundle_summary", label: "Cutting bundle summary" }, { key: "size", label: "Resolved size" }, { key: "resolved_quantity", label: "Calculated quantity" }, { key: "people_count", label: "Number of people" }, { key: "variation_count", label: "Number of variations" }, { key: "unit_position", label: "Piece / pair number / total" }, { key: "package_position", label: "Package / set number / total" }, { key: "trace_order_position", label: "Label number / order total" }, { key: "trace_person_position", label: "Person number / total" }, { key: "trace_product_position", label: "Product number / total" }, { key: "order", label: "Order number" }, { key: "order_date", label: "Order date" }, { key: "delivery_date", label: "Delivery date" }, { key: "client", label: "Client name" }, { key: "client_type", label: "Client type" }, { key: "contact_person", label: "Contact person / Attn" }, { key: "phone", label: "Phone number" }, { key: "delivery_address", label: "Delivery address" }, { key: "billing_address", label: "Billing address" }, { key: "remarks", label: "Remarks" }, { key: "token", label: "Trace code" }],',
    "order setup label fields",
)
text = replace_once(
    text,
    '    const commonValues = { order: common.order, client: common.client };',
    '    const commonValues = { order: common.order, order_date: order.details.orderDate, delivery_date: order.details.deliveryDate, client: common.client, client_type: order.details.clientType, contact_person: order.details.contactPerson, phone: order.details.contactNumber, delivery_address: order.details.shipTo, billing_address: order.details.billTo, remarks: order.details.remarks };',
    "order setup label values",
)
write(path, text)


# -----------------------------------------------------------------------------
# Information polish: chip X directly owns the real checkbox; compact magnifier
# search; clear Save layout vs Save label set semantics.
# -----------------------------------------------------------------------------
path = "app/label-designer-polish.tsx"
text = read(path)
text = replace_once(
    text,
    '  page.querySelector(".labelSaveMeaning")?.remove();\r\n  const saveBar = page.querySelector<HTMLElement>(".labelSaveBar");',
    '''  const saveBar = page.querySelector<HTMLElement>(".labelSaveBar");
  let meaning = page.querySelector<HTMLElement>(".labelSaveMeaning");
  if (saveBar && !meaning) {
    meaning = document.createElement("p");
    meaning.className = "labelSaveMeaning";
    meaning.innerHTML = '<b>Layout</b> saves the reusable physical design, size, components and placement. <b>Label set</b> saves this order\'s selected records for repeat printing.';
    saveBar.insertAdjacentElement("afterend", meaning);
  }'''.replace("\n", "\r\n"),
    "layout meaning",
)
text = replace_once(
    text,
    '''    const tools = document.createElement("div");
    tools.className = "labelInfoTools";
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Find a field or measurement…";
    search.setAttribute("aria-label", "Find label information");
    tools.appendChild(search);
    checklist.insertAdjacentElement("beforebegin", tools);
    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      checklist.querySelectorAll<HTMLElement>(".fieldChoice").forEach(choice => {
        const text = choice.querySelector("label span")?.textContent?.toLowerCase() || "";
        choice.hidden = !!query && !text.includes(query);
      });
      refreshFieldHeadings(checklist);
    });'''.replace("\n", "\r\n"),
    '''    const tools = document.createElement("div");
    tools.className = "labelInfoTools";
    const searchToggle = document.createElement("button");
    searchToggle.type = "button";
    searchToggle.className = "labelInfoSearchToggle";
    searchToggle.setAttribute("aria-label", "Search label information");
    searchToggle.textContent = "⌕";
    const search = document.createElement("input");
    search.type = "search";
    search.hidden = true;
    search.placeholder = "Search fields…";
    search.setAttribute("aria-label", "Find label information");
    tools.append(searchToggle, search);
    checklist.insertAdjacentElement("beforebegin", tools);
    searchToggle.addEventListener("click", () => {
      search.hidden = !search.hidden;
      searchToggle.classList.toggle("active", !search.hidden);
      if (!search.hidden) search.focus();
      else { search.value = ""; search.dispatchEvent(new Event("input")); }
    });
    search.addEventListener("keydown", event => {
      if (event.key === "Escape") { search.hidden = true; searchToggle.classList.remove("active"); search.value = ""; search.dispatchEvent(new Event("input")); searchToggle.focus(); }
    });
    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      checklist.querySelectorAll<HTMLElement>(".fieldChoice").forEach(choice => {
        const text = choice.querySelector("label span")?.textContent?.toLowerCase() || "";
        choice.hidden = !!query && !text.includes(query);
      });
      refreshFieldHeadings(checklist);
    });'''.replace("\n", "\r\n"),
    "compact information search",
)
text = replace_once(
    text,
    '''      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "labelInfoChip";
      chip.textContent = label;
      chip.title = `Edit ${label}`;
      chip.addEventListener("click", () => {
        section.classList.remove("labelInfoCollapsed");
        const toggle = section.querySelector<HTMLButtonElement>(".labelInfoToggle");
        if (toggle) toggle.textContent = "Done";
        choice.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
      selectedStrip.appendChild(chip);'''.replace("\n", "\r\n"),
    '''      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "labelInfoChip";
      chip.title = `Edit ${label}`;
      const text = document.createElement("span");
      text.className = "labelInfoChipText";
      text.textContent = label;
      const remove = document.createElement("span");
      remove.className = "labelInfoChipRemove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove ${label}`);
      remove.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const checkbox = choice.querySelector<HTMLInputElement>(":scope > label:first-child input[type=\"checkbox\"]");
        checkbox?.click();
      });
      chip.append(text, remove);
      chip.addEventListener("click", () => {
        section.classList.remove("labelInfoCollapsed");
        const toggle = section.querySelector<HTMLButtonElement>(".labelInfoToggle");
        if (toggle) toggle.textContent = "Done";
        choice.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
      selectedStrip.appendChild(chip);'''.replace("\n", "\r\n"),
    "state-owned chip removal",
)
write(path, text)


# -----------------------------------------------------------------------------
# Interaction layer: stop intercepting chip-X now that the chip is wired directly
# to its React-owned checkbox; strengthen size geometry validation.
# -----------------------------------------------------------------------------
path = "app/label-designer-interactions.tsx"
text = read(path)
text = regex_once(
    text,
    r'\n\s*const selectedStrip = section\.querySelector<HTMLElement>\("\.labelInfoSelectedStrip"\);\n\s*selectedStrip\?\.querySelectorAll<HTMLButtonElement>\("\.labelInfoChip"\)\.forEach\(chip => \{.*?\n\s*\}\);',
    '',
    "remove duplicate chip repackaging",
)
text = regex_once(
    text,
    r'\n\s*const removeSelectedChip = \(removeControl: HTMLElement\) => \{.*?\n\s*\};',
    '',
    "remove duplicate chip remover",
)
text = regex_once(
    text,
    r'\n\s*const chipRemove = target\.closest<HTMLElement>\("\.labelDesignerPage \.labelInfoChipRemove"\);\n\s*if \(chipRemove\) \{.*?\n\s*\}',
    '',
    "remove chip click interception",
)
text = replace_once(
    text,
    '      else if (numeric.slice(0, 4).some(input => Number(input.value) <= 0)) message = "Width, height, roll width and Across must be greater than zero.";',
    '''      else if (numeric.slice(0, 4).some(input => Number(input.value) <= 0)) message = "Width, height, roll width and Across must be greater than zero.";
      else if (numeric.length >= 7) {
        const [labelW, _labelH, rollW, columns, outer, gapX] = numeric.map(input => Number(input.value));
        const required = outer * 2 + columns * labelW + Math.max(0, columns - 1) * gapX;
        if (required > rollW + .01) message = `This layout needs at least ${required.toFixed(1)} mm roll width. Increase the roll width or reduce label width, columns, margin or gap.`;
      }''',
    "roll geometry validation",
)
write(path, text)


# -----------------------------------------------------------------------------
# Information taxonomy: Core = Order Setup details; classification is a Person
# detail, not Core. Generated trace information remains separate.
# -----------------------------------------------------------------------------
path = "app/label-production-ready.tsx"
text = read(path)
text = replace_once(
    text,
    '  if (/^(Order number|Client)$/i.test(text)) return "core";',
    '  if (/^(Order number|Order date|Delivery date|Client name|Client type|Contact person \/ Attn|Phone number|Delivery address|Billing address|Remarks)$/i.test(text)) return "core";',
    "core setup fields",
)
text = replace_once(
    text,
    '        if (classification) classification.hidden = id !== "core";',
    '        if (classification) classification.hidden = id !== "person";',
    "classification belongs to person details",
)
write(path, text)


# -----------------------------------------------------------------------------
# Tests: current acceptance explicitly locks compact filters, no Records filter,
# direct representation, custom components, layout meaning and state-owned chip X.
# -----------------------------------------------------------------------------
path = "tests/seiko-list-centers-contract.test.mjs"
text = read(path)
text = replace_once(
    text,
    '  for (const field of ["Status", "Client type", "Product", "Records", "Delivery"]) assert.match(centers, new RegExp(field));',
    '  for (const field of ["Status", "Client type", "Product", "Delivery"]) assert.match(centers, new RegExp(field));\n  assert.doesNotMatch(centers, /Records", "records/);\n  assert.match(centers, /orderFilterToggle/);\n  assert.match(centers, /orderFilterGlyph/);\n  assert.match(centers, /matchingProducts/);\n  assert.match(centers, /filterState\.clientType/);',
    "compact contextual filter contract",
)
text = replace_once(
    text,
    '  assert.match(centers, /Create labels/);',
    '  assert.match(centers, /Edit setup/);\n  assert.match(centers, /Create labels/);\n  assert.doesNotMatch(centers, /openAction\.textContent = "Open order"/);',
    "secondary order action contract",
)
text = replace_once(
    text,
    '''test("selected label-information chip x deselects the underlying field", () => {
  assert.match(centers, /labelInfoChipRemove/);
  assert.match(centers, /deselectChip/);
  assert.match(centers, /checkbox\.click\(\)/);
  assert.match(labels, /const toggleField/);
  assert.match(labels, /setItems\(all => all\.filter/);
});''',
    '''test("selected label-information chip x deselects the underlying React field", () => {
  const polish = read("app/label-designer-polish.tsx");
  const interactions = read("app/label-designer-interactions.tsx");
  assert.match(polish, /labelInfoChipRemove/);
  assert.match(polish, /checkbox\?\.click\(\)/);
  assert.doesNotMatch(interactions, /removeSelectedChip/);
  assert.match(labels, /const toggleField/);
  assert.match(labels, /setItems\(all => all\.filter/);
});''',
    "chip X contract",
)
write(path, text)

path = "tests/seiko-stage2-audit-contract.test.mjs"
text = read(path)
insert = '''

test("label workspace exposes direct representation, custom components, layout meaning and calibrated size management", () => {
  const createRoute = read("app/labels/create/page.tsx");
  const polish = read("app/label-designer-polish.tsx");
  assert.doesNotMatch(createRoute, /DesignerSourceLock/);
  assert.match(createRoute, /initialSourceMode=\{selectedRepresentation\.sourceMode\}/);
  assert.match(labelDesigner, /Label represents/);
  assert.match(labelDesigner, /labelCustomComponents/);
  for (const component of ["Information field", "Free text", "QR code", "Barcode", "Sequence"]) assert.match(labelDesigner, new RegExp(component));
  assert.match(labelDesigner, /editingSizeId/);
  assert.match(labelDesigner, /Copy & edit/);
  assert.match(labelDesigner, /requiredRoll/);
  assert.match(labelDesigner, /fieldRelevantForPurpose/);
  assert.match(polish, /labelSaveMeaning/);
  assert.match(polish, /Layout.*reusable physical design/);
  assert.match(polish, /labelInfoSearchToggle/);
});
'''
if 'label workspace exposes direct representation, custom components' not in text:
    text += insert
write(path, text)

print("SEIKO label UX acceptance updates applied.")
