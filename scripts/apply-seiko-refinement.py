from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one exact match, found {count}: {old[:90]!r}")
    file.write_text(text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str) -> None:
    file = Path(path)
    text = file.read_text()
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex match, found {count}: {pattern[:90]!r}")
    file.write_text(next_text)


label = "app/label-designer.tsx"

replace_once(
    label,
    '    if (purpose === "packing") return !productionOnly && key !== "variation_count";',
    '    if (purpose === "packing") return !productionOnly && key !== "variation_count" && key !== "name" && key !== "group";',
)

replace_once(
    label,
    'people = order?.fields.map(field => ({ key: `field:${field.id}`, label: `Person detail · ${field.name}` })) || [], traceGroups =',
    'people = order?.fields.map(field => ({ key: `field:${field.id}`, label: `Person detail · ${field.name}` })) || [], productNames = order?.products.filter(product => product.name.trim()).map(product => ({ key: `product_name:${product.id}`, label: `${product.name} · Product` })) || [], traceGroups =',
)
replace_once(
    label,
    'values = [...base, ...people, ...traceGroups, ...measurements, ...specifications];',
    'values = [...base, ...people, ...productNames, ...traceGroups, ...measurements, ...specifications];',
)

replace_once(
    label,
    'const contents = packageItems.map(item => `${item.product} × ${item.qty}`).join(", "), qty =',
    'const contents = packageItems.map(item => `${item.product} × ${item.qty}`).join(", "), productFields = Object.fromEntries(packageItems.map(item => [`product_name:${item.values.product_id}`, item.product])), qty =',
)
replace_once(
    label,
    'values: { ...Object.assign({}, ...packageItems.map(item => item.values)), product: packageItems.map(item => item.product).join(", "), product_summary:',
    'values: { ...Object.assign({}, ...packageItems.map(item => item.values)), ...productFields, product: packageItems.map(item => item.product).join(", "), product_summary:',
)

replace_once(
    label,
    'function uniqueSavedName(base: string, names: string[])',
    '''function preferredClassificationFieldId(order?: SeikoOrder | null) {
    if (!order) return "";
    const referenced = order.products.flatMap(product => [product.quantityGroupFieldId, ...product.specifications.map(specification => specification.groupFieldId)]).filter((fieldId): fieldId is string => !!fieldId && order.fields.some(field => field.id === fieldId));
    return referenced[0] || order.fields.find(field => field.type === "dropdown" && field.name.trim())?.id || order.fields.find(field => field.name.trim())?.id || "";
}
function uniqueSavedName(base: string, names: string[])''',
)
replace_once(
    label,
    'const [classificationFieldId, setClassificationFieldId] = useState(() => stored<string>(classificationKey, ""));',
    'const [classificationFieldId, setClassificationFieldId] = useState(() => stored<string>(classificationKey, "") || preferredClassificationFieldId(order));',
)
replace_once(
    label,
    '''        if (classificationFieldId && !personDetailFields.some(field => field.id === classificationFieldId)) {
            setClassificationFieldId("");
            localStorage.removeItem(classificationKey);
        }''',
    '''        if (!classificationFieldId || !personDetailFields.some(field => field.id === classificationFieldId)) {
            const next = preferredClassificationFieldId(order);
            setClassificationFieldId(next);
            if (next) localStorage.setItem(classificationKey, JSON.stringify(next));
            else localStorage.removeItem(classificationKey);
        }''',
)
replace_once(
    label,
    '    }, [classificationFieldId, classificationKey, personDetailFields]);',
    '    }, [classificationFieldId, classificationKey, order, personDetailFields]);',
)

replace_once(
    label,
    '''    // Simple setup is content-driven: every chosen field must remain visible. Older
    // saved batches can contain stale, overlapping or out-of-bounds coordinates,
    // so only the advanced editor is allowed to honour manual coordinates.
    const displayedItems = useMemo(() => advanced ? items : arrangeLabelItems(items, preset), [advanced, items, preset]);
    const previewItems = useMemo(() => advanced ? items : arrangeLabelItemsForRow(items, preset, current), [advanced, items, preset, current]);''',
    '''    // Packing uses explicit order-defined person details rather than the generic
    // production identity fields. Old saved layouts are sanitized when rendered/saved.
    const purposeItems = useMemo(() => purpose === "packing" ? items.filter(item => item.kind !== "field" || (item.field !== "name" && item.field !== "group")) : items, [items, purpose]);
    // Simple setup is content-driven: every chosen field must remain visible. Older
    // saved batches can contain stale, overlapping or out-of-bounds coordinates,
    // so only the advanced editor is allowed to honour manual coordinates.
    const displayedItems = useMemo(() => advanced ? purposeItems : arrangeLabelItems(purposeItems, preset), [advanced, purposeItems, preset]);
    const previewItems = useMemo(() => advanced ? purposeItems : arrangeLabelItemsForRow(purposeItems, preset, current), [advanced, purposeItems, preset, current]);''',
)

replace_once(
    label,
    '<div className="managedSizeControl"><span>Label size</span><button type="button" className="managedSizeTrigger" aria-haspopup="listbox" aria-expanded={sizeMenuOpen} onClick={() => setSizeMenuOpen(open => !open)}><span>{preset.name}</span><i aria-hidden="true"/></button>{sizeMenuOpen && <div className="managedSizeMenu" role="listbox" aria-label="Label sizes">{presets.map(option => <div className={`managedSizeOptionRow ${option.id === presetId ? "selected" : ""}`} key={option.id}><button type="button" role="option" aria-selected={option.id === presetId} onClick={() => { setPresetId(option.id); setSizeMenuOpen(false); }}>{option.name}</button>{canManageSizes && <button type="button" className="managedEdit" onClick={() => editSize(option)}>{option.locked ? "Copy & edit" : "Edit"}</button>}{canManageSizes && !option.locked && <button type="button" className="managedRemove" aria-label={`Remove ${option.name}`} onClick={() => { savePresets(presets.filter(item => item.id !== option.id)); if (presetId === option.id) setPresetId(roll.id); }}>×</button>}</div>)}{canManageSizes && <button type="button" className="managedAdd" onClick={() => { resetSizeDraft(); setShowSizes(true); setSizeMenuOpen(false); }}>+ New size</button>}</div>}</div><small className="labelSetupHelp">Physical size and roll geometry drive preview and printing in millimetres.</small>',
    '<div className="managedSizeControl"><span>Label size</span><button type="button" className="managedSizeTrigger" aria-haspopup="listbox" aria-expanded={sizeMenuOpen} onClick={() => setSizeMenuOpen(open => !open)}><span>{preset.name}</span><i aria-hidden="true"/></button>{sizeMenuOpen && <div className="managedSizeMenu" role="listbox" aria-label="Label sizes">{presets.map(option => <div className={`managedSizeOptionRow ${option.id === presetId ? "selected" : ""}`} key={option.id}><button type="button" role="option" aria-selected={option.id === presetId} onClick={() => { setPresetId(option.id); setSizeMenuOpen(false); }}>{option.name}</button>{canManageSizes && <button type="button" className="managedEdit" onClick={() => editSize(option)}>{option.locked ? "Copy & edit" : "Edit"}</button>}{canManageSizes && !option.locked && <button type="button" className="managedRemove" aria-label={`Remove ${option.name}`} onClick={() => { savePresets(presets.filter(item => item.id !== option.id)); if (presetId === option.id) setPresetId(roll.id); }}>×</button>}</div>)}{canManageSizes && <button type="button" className="managedAdd" onClick={() => { resetSizeDraft(); setShowSizes(true); setSizeMenuOpen(false); }}>+ New size</button>}</div>}</div>',
)

final = "app/label-finalization.tsx"
regex_once(
    final,
    r'\nfunction syncPrintCopies\(\) \{.*?\n\}\n\nfunction labelOnlyPrint\(\) \{',
    r'''
function requestPrintCopies(onConfirm: (copies: number) => void) {
  if (document.querySelector(".labelCopiesLayer")) return;
  const page = document.querySelector<HTMLElement>(".labelDesignerPage");
  if (!page) return;
  const selectedText = page.querySelector<HTMLElement>(".labelSidebar .panelHead h3")?.textContent || "";
  const selected = Number(selectedText.match(/(\d+)/)?.[1]) || 0;
  if (!selected) { showPrintNotice("Select at least one label to print."); return; }
  const key = `jinam:${activeBusiness()}:labels:print-copies`;
  const layer = document.createElement("div");
  layer.className = "labelCopiesLayer";
  const dialog = document.createElement("form");
  dialog.className = "labelCopiesDialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "labelCopiesTitle");
  dialog.innerHTML = `<h3 id="labelCopiesTitle">Print labels</h3><p>${selected} selected label${selected === 1 ? "" : "s"}. Choose how many copies of each label to print.</p><label>Copies per label<input type="number" min="1" max="50" step="1" value="${localStorage.getItem(key) || "1"}" aria-label="Copies per selected label"></label><div class="labelCopiesActions"><button type="button" class="secondary">Cancel</button><button type="submit" class="primary">Print labels</button></div>`;
  layer.appendChild(dialog);
  document.body.appendChild(layer);
  const input = dialog.querySelector<HTMLInputElement>("input")!;
  const close = () => layer.remove();
  dialog.querySelector<HTMLButtonElement>("button[type='button']")?.addEventListener("click", close);
  layer.addEventListener("pointerdown", event => { if (event.target === layer) close(); });
  layer.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  dialog.addEventListener("submit", event => {
    event.preventDefault();
    const copies = Math.max(1, Math.min(50, Math.floor(Number(input.value) || 1)));
    localStorage.setItem(key, String(copies));
    close();
    onConfirm(copies);
  });
  window.setTimeout(() => { input.focus(); input.select(); }, 0);
}

function labelOnlyPrint(copies: number) {''',
)
replace_once(
    final,
    '    const copies = Math.max(1, Math.min(50, Math.floor(Number(document.querySelector<HTMLInputElement>(".labelPrintCopies input")?.value) || 1)));\n',
    '',
)
replace_once(final, '      syncPrintCopies();\n', '')
replace_once(final, '      labelOnlyPrint();', '      requestPrintCopies(labelOnlyPrint);')

print("SEIKO refinement patch applied")
