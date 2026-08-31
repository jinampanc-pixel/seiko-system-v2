const fs = require('node:fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, text) { fs.writeFileSync(path, text); }
function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing replacement target: ${label}`);
  return text.replace(from, to);
}
function replaceRegex(text, pattern, to, label) {
  if (!pattern.test(text)) throw new Error(`Missing regex target: ${label}`);
  pattern.lastIndex = 0;
  return text.replace(pattern, to);
}

// 1) Order Setup: do not rebuild the wrong custom source-field combobox.
{
  const path = 'app/order-setup-polish.tsx';
  let text = read(path);
  text = replaceRequired(
    text,
    '        document.querySelectorAll<HTMLElement>(".orderSetup .sourceFieldPicker").forEach(manageSourcePicker);',
    '        // Group source fields stay as native order-field selectors. OrderSetupFinalize removes legacy wrappers.',
    'native group source selector',
  );
  write(path, text);
}

// 2) Order Center: Billing is already its own module; do not inject Billing/Payments into each row menu.
{
  const path = 'app/seiko-phase2.tsx';
  let text = read(path);
  text = replaceRegex(
    text,
    /\n\s*document\.querySelectorAll<HTMLElement>\("\.ordersPage \.orderRow"\)\.forEach\(row => \{[\s\S]*?actionMenu\.insertBefore\(group, actionMenu\.querySelector\("button"\)\);\n\s*\}\);\n/,
    '\n',
    'remove per-order phase2 actions',
  );
  write(path, text);
}

// 3) Order Center + Workspace: archive is explicit, and Labels is one navigation point as specified in the PDF.
{
  const path = 'app/orders.tsx';
  let text = read(path);
  text = replaceRequired(text, ' Archived only</label>', ' Archived orders</label>', 'archived view label');
  text = replaceRegex(
    text,
    /<details className="orderMenu"><summary aria-label=\{`More actions for \$\{order\.details\.orderNo\}`\}>•••<\/summary><button onClick=\{\(\) => persist\(orders\.map\(item => item\.orderId === order\.orderId \? \{ \.\.\.item, archived: !item\.archived \} : item\)\)\}>\{order\.archived \? "Restore order" : "Archive order"\}<\/button><\/details>/,
    '<button type="button" className="orderArchiveButton" onClick={() => persist(orders.map(item => item.orderId === order.orderId ? { ...item, archived: !item.archived } : item))}>{order.archived ? "Restore" : "Archive"}</button>',
    'explicit archive action',
  );
  text = replaceRegex(
    text,
    /<div className="workspaceLabelsSplit" ref=\{labelMenuRef\}>[\s\S]*?<\/div><button type="button" className="primary workspaceQuickSave"/,
    '<button type="button" className="secondary workspaceLabelsButton" onClick={onOpenLabelBatches}>Labels</button><button type="button" className="primary workspaceQuickSave"',
    'single labels navigation',
  );
  write(path, text);
}

// 4) Label information categories must follow the order: core/order, person, product, trace. Remove Style.
{
  const path = 'app/label-production-ready.tsx';
  let text = read(path);
  text = replaceRegex(
    text,
    /function categoryFor\(choice: HTMLElement\) \{[\s\S]*?\n\}/,
    `function categoryFor(choice: HTMLElement) {
  const text = choice.querySelector("label span")?.textContent?.trim() || "";
  if (/^(Person \/ workpiece|Group \/ label type)$/i.test(text) || /^Person detail\\s*·/i.test(text)) return "person";
  if (/Trace code|Piece number|sequence|barcode|qr/i.test(text)) return "trace";
  if (/^(Order number|Client)$/i.test(text)) return "core";
  return "product";
}`,
    'label category rules',
  );
  text = replaceRequired(
    text,
    'const categories = [["core","Core information"],["person","Person details"],["product","Product details"],["trace","Trace & codes"],["style","Style"]] as const;',
    'const categories = [["core","Core information"],["person","Person details"],["product","Product details"],["trace","Trace & codes"]] as const;',
    'remove Style category',
  );
  write(path, text);
}

// 5) Label designer: representation is changeable, custom mode explained, preview sample independent from print selection,
//    packing record cards are accurate, search includes every order field, and customer messaging is removed from this card.
{
  const path = 'app/label-designer.tsx';
  let text = read(path);
  text = replaceRequired(
    text,
    '    const [recordQuery, setRecordQuery] = useState("");',
    '    const [recordQuery, setRecordQuery] = useState("");\n    const [previewId, setPreviewId] = useState("");',
    'preview sample state',
  );
  text = replaceRequired(
    text,
    'current = printRecords[0] || records.find(r => r.id === selectedRows.at(-1)) || records[0] || emptyRecord',
    'current = records.find(r => r.id === previewId) || printRecords[0] || records.find(r => r.id === selectedRows.at(-1)) || records[0] || emptyRecord',
    'preview sample current record',
  );
  text = replaceRequired(
    text,
    'const visibleRecords = records.filter(record => `${record.name} ${record.product} ${record.group}`.toLowerCase().includes(recordQuery.toLowerCase()));',
    'const visibleRecords = records.filter(record => `${record.name} ${record.product} ${record.group} ${Object.values(record.values).join(" ")}`.toLowerCase().includes(recordQuery.toLowerCase()));',
    'record search all order fields',
  );
  text = replaceRegex(
    text,
    /<label><span>\{purpose === "production" \? "Production identity" : purpose === "packing" \? "Packing label for" : "Inventory label for"\}<\/span><select value=\{sourceMode\} disabled=\{!order \|\| purpose === "inventory" \|\| purpose === "production"\} onChange=\{e => setSourceMode\(e\.target\.value as SourceMode\)\}>[\s\S]*?<\/select><\/label>/,
    '<label><span>Label represents</span><select value={sourceMode} disabled={!order} onChange={e => setSourceMode(e.target.value as SourceMode)}><option value="person_product">Each physical item</option><option value="person">Each person / package</option><option value="group">Grouped package / group</option><option value="product">Each product / stock group</option><option value="order">Whole order</option></select></label>',
    'changeable label representation',
  );
  text = replaceRequired(
    text,
    '<option value="custom">Choose myself</option></select></label>',
    '<option value="custom">Custom selection</option></select><small className="labelTypeHelp">Choose this only when you want to manually control which information and codes appear.</small></label>',
    'custom selection explanation',
  );
  text = replaceRegex(
    text,
    /\{purpose === "production" && <label className="customerUpdateChoice">[\s\S]*?<\/label>\}<p className="purposeBoundary">/,
    '<p className="purposeBoundary">',
    'remove customer update choice',
  );
  text = replaceRequired(
    text,
    '<input className="recordSearch" aria-label="Find label records" placeholder="Find person or product" value={recordQuery}',
    '<input className="recordSearch" aria-label="Find label records" placeholder="Find person, product, class, group or any order field" value={recordQuery}',
    'record search placeholder',
  );
  text = replaceRequired(
    text,
    '<button className={`record ${selectedRows.includes(record.id) ? "selected" : ""}`} key={record.id} onClick={() => setSelectedRows(currentRows => currentRows.includes(record.id) ? currentRows.filter(id => id !== record.id) : [...currentRows, record.id])}><span className="check">{selectedRows.includes(record.id) ? "✓" : ""}</span><span><b>{record.name}{record.product ? ` — ${record.product}` : ""}</b><small>{[record.group, record.size && `Size ${record.size}`, record.qty && `Qty ${record.qty}`].filter(Boolean).join(" · ") || "Order package"}</small></span></button>',
    '<button className={`record ${selectedRows.includes(record.id) ? "selected" : ""}`} key={record.id} onClick={() => { setPreviewId(record.id); setSelectedRows(currentRows => currentRows.includes(record.id) ? currentRows.filter(id => id !== record.id) : [...currentRows, record.id]); }}><span className="check">{selectedRows.includes(record.id) ? "✓" : ""}</span><span><b>{sourceMode === "person" ? record.name : `${record.name}${record.product ? ` — ${record.product}` : ""}`}</b><small>{sourceMode === "person" ? [record.group, record.values.product_summary, record.qty && `Total ${record.qty}`].filter(Boolean).join(" · ") : [record.group, record.size && `Size ${record.size}`, record.qty && `Qty ${record.qty}`].filter(Boolean).join(" · ") || "Order package"}</small></span></button>',
    'accurate record cards and preview selection',
  );
  text = replaceRequired(
    text,
    '<main className="labelCanvasPanel panel"><div className="canvasToolbar"><div><b>{preset.labelW} × {preset.labelH} mm label</b><span>Select text or code, then use the wheel to resize it</span></div><button className="canvasSizeButton"',
    '<main className="labelCanvasPanel panel"><div className="canvasToolbar"><div><b>{preset.labelW} × {preset.labelH} mm label</b><span>Select text or code, then use the wheel to resize it</span></div><label className="labelPreviewSample"><span>Preview sample</span><select value={current.id} onChange={event => setPreviewId(event.target.value)}>{records.map(record => <option key={record.id} value={record.id}>{record.name}{record.product ? ` — ${record.product}` : ""}</option>)}</select></label><button className="canvasSizeButton"',
    'preview sample selector',
  );
  write(path, text);
}

// 6) Label save bar wording and hierarchy: make Layout Library discoverable and Save label set primary.
{
  const path = 'app/label-designer-polish.tsx';
  let text = read(path);
  text = replaceRequired(
    text,
    '      if (text.startsWith("Save batch")) button.textContent = "Save label set";\r\n      if (text.startsWith("Update batch")) button.textContent = "Update label set";\r\n      if (text.startsWith("Batches")) button.childNodes[0].textContent = "Saved sets ";\r\n      if (text.startsWith("Layouts")) button.childNodes[0].textContent = "Saved layouts ";',
    '      if (text.startsWith("Save batch")) { button.textContent = "Save label set"; button.classList.remove("textButton"); button.classList.add("primary", "labelSetSave"); }\r\n      if (text.startsWith("Update batch")) { button.textContent = "Update label set"; button.classList.remove("textButton"); button.classList.add("primary", "labelSetSave"); }\r\n      if (text.startsWith("Batches")) button.childNodes[0].textContent = "Saved sets ";\r\n      if (text.startsWith("Layouts")) button.childNodes[0].textContent = "Layout Library ";',
    'label save hierarchy',
  );
  write(path, text);
}

// 7) Update contracts so they lock the PDF acceptance behaviour instead of the superseded split-label menu.
{
  const path = 'tests/foundation-contract.test.mjs';
  let text = read(path);
  text = replaceRequired(text, '  assert.match(labelDesigner, /Choose myself/);', '  assert.match(labelDesigner, /Custom selection/);', 'foundation custom mode wording');
  write(path, text);
}
{
  const path = 'tests/seiko-stage2-audit-contract.test.mjs';
  let text = read(path);
  text = replaceRequired(
    text,
    '  assert.match(orders, /workspaceLabelsSplit/);\n  assert.match(orders, /workspaceQuickSave/);\n  assert.match(orders, /aria-label="More order actions"/);\n  assert.match(orders, /New production label/);\n  assert.match(orders, /New packing label/);\n  assert.match(orders, /New inventory label/);',
    '  assert.match(orders, /workspaceLabelsButton/);\n  assert.doesNotMatch(orders, /workspaceLabelsSplit/);\n  assert.match(orders, /workspaceQuickSave/);\n  assert.match(orders, /aria-label="More order actions"/);\n  assert.match(orders, />Labels<\\/button>/);',
    'single labels navigation contract',
  );
  text = replaceRequired(
    text,
    'test("label creation stays simple by default while advanced placement remains precise", () => {',
    'test("PDF acceptance keeps archive, setup policy controls and group rules explicit", () => {\n  assert.match(orders, /Archived orders/);\n  assert.match(orders, /orderArchiveButton/);\n  assert.match(setupFinalize, /Group values or range, e.g. 1-7/);\n  assert.match(orderDomain, /range = value\\.match/);\n  assert.doesNotMatch(ownerDropdown, /enhanceEditableSelect/);\n});\n\ntest("label creation stays simple by default while advanced placement remains precise", () => {',
    'acceptance contract insertion',
  );
  text = replaceRequired(
    text,
    'test("label wheel resizing uses deterministic fine physical steps and touch has explicit size buttons", () => {',
    'test("label information and preview follow the PDF acceptance model", () => {\n  assert.match(labelDesigner, /Label represents/);\n  assert.match(labelDesigner, /Each physical item/);\n  assert.match(labelDesigner, /Custom selection/);\n  assert.match(labelDesigner, /labelPreviewSample/);\n  assert.match(labelDesigner, /Object\\.values\\(record\\.values\\)\\.join/);\n  assert.doesNotMatch(labelDesigner, /customerUpdateChoice/);\n  assert.match(labelPolish, /Layout Library/);\n  assert.match(labelPolish, /labelSetSave/);\n  assert.doesNotMatch(labelProductionReady, /\\["style","Style"\\]/);\n});\n\ntest("label wheel resizing uses deterministic fine physical steps and touch has explicit size buttons", () => {',
    'label acceptance contract insertion',
  );
  // Add missing source readers used by the new acceptance assertions.
  text = replaceRequired(
    text,
    'const finalUx = read("app/seiko-workspace-label-final.css");',
    'const finalUx = read("app/seiko-workspace-label-final.css");\nconst orderDomain = read("app/lib/order-domain.ts");\nconst ownerDropdown = read("app/owner-dropdown-ux.tsx");\nconst labelProductionReady = read("app/label-production-ready.tsx");',
    'acceptance source readers',
  );
  write(path, text);
}

console.log('SEIKO PDF acceptance source updates applied.');
