from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing replacement target: {label}")
    return text.replace(old, new, 1)


def replace_regex(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, lambda _m: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Missing regex target: {label}")
    return updated


path = "app/label-designer.tsx"
text = read(path)

text = replace_required(
    text,
    '    valueBold?: boolean;\n    reset?: "order" | "day" | "print" | "never";',
    '    valueBold?: boolean;\n    showTotal?: boolean;\n    reset?: "order" | "day" | "print" | "never";',
    "trace total item property",
)

text = replace_required(
    text,
    '    const [recordQuery, setRecordQuery] = useState("");\n    const [previewId, setPreviewId] = useState("");',
    '''    const [recordQuery, setRecordQuery] = useState("");
    const [previewId, setPreviewId] = useState("");
    const [recordFilterField, setRecordFilterField] = useState("");
    const [recordFilterValue, setRecordFilterValue] = useState("");
    const [recordSort, setRecordSort] = useState<"order" | "person" | "product" | "group">("order");''',
    "record filter state",
)

text = replace_required(
    text,
    '    const visibleRecords = records.filter(record => `${record.name} ${record.product} ${record.group} ${Object.values(record.values).join(" ")}`.toLowerCase().includes(recordQuery.toLowerCase()));',
    '''    const recordFilterOptions = useMemo(() => [
        { key: "product", label: "Product" },
        { key: "group", label: "Group / package" },
        { key: "product_summary", label: "Package contents" },
        ...(order?.fields.filter(field => field.name.trim()).map(field => ({ key: `field:${field.id}`, label: field.name })) || []),
    ], [order]);
    const recordFilterValueFor = (record: RecordRow, filterKey: string) => filterKey === "product" ? record.product : filterKey === "group" ? record.group : String(record.values[filterKey] || "");
    const recordFilterValues = useMemo(() => recordFilterField ? [...new Set(records.map(record => recordFilterValueFor(record, recordFilterField)).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [], [recordFilterField, records]);
    const visibleRecords = records.filter(record =>
        `${record.name} ${record.product} ${record.group} ${Object.values(record.values).join(" ")}`.toLowerCase().includes(recordQuery.toLowerCase()) &&
        (!recordFilterField || !recordFilterValue || recordFilterValueFor(record, recordFilterField) === recordFilterValue)
    ).sort((a, b) => {
        if (recordSort === "person") return a.name.localeCompare(b.name, undefined, { numeric: true }) || a.product.localeCompare(b.product, undefined, { numeric: true });
        if (recordSort === "product") return a.product.localeCompare(b.product, undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true });
        if (recordSort === "group") return a.group.localeCompare(b.group, undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true });
        return records.indexOf(a) - records.indexOf(b);
    });''',
    "record filter and sort logic",
)

text = replace_required(
    text,
    '  <input className="recordSearch" aria-label="Find label records" placeholder="Find person, product, class, group or any order field" value={recordQuery} onChange={event => setRecordQuery(event.target.value)}/>',
    '''  <input className="recordSearch" aria-label="Find label records" placeholder="Find person, product, class, group or any order field" value={recordQuery} onChange={event => setRecordQuery(event.target.value)}/>
  <div className="recordFilterBar" aria-label="Filter and sort label records"><label><span>Filter by</span><select value={recordFilterField} onChange={event => { setRecordFilterField(event.target.value); setRecordFilterValue(""); }}><option value="">All labels</option>{recordFilterOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label><label><span>Value</span><select value={recordFilterValue} disabled={!recordFilterField} onChange={event => setRecordFilterValue(event.target.value)}><option value="">All values</option>{recordFilterValues.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label><span>Sort</span><select value={recordSort} onChange={event => setRecordSort(event.target.value as typeof recordSort)}><option value="order">Order sequence</option><option value="person">Person / record</option><option value="product">Product</option><option value="group">Group / package</option></select></label></div>''',
    "record filter controls",
)

text = replace_required(
    text,
    'return item.value; if (item.kind === "field") {\n    const value = labelValue(row, item.field);',
    'return item.value; if (item.kind === "field") {\n    const rawValue = labelValue(row, item.field);\n    const value = item.showTotal === false && isTracePositionField(item.field) ? String(rawValue).replace(/\\s+of\\s+.*$/i, "") : rawValue;',
    "trace total render behavior",
)

text = replace_required(
    text,
    'function purposeLabel(purpose: LabelPurpose | null)',
    'function isTracePositionField(field?: string) { return !!field && (field === "unit_position" || field === "package_position" || field.startsWith("trace_")); }\nfunction purposeLabel(purpose: LabelPurpose | null)',
    "trace field helper",
)

label_options = '''function labelFieldOptions(order?: SeikoOrder | null) { const base = [{ key: "name", label: "Person / workpiece" }, { key: "group", label: "Group / label type" }, { key: "product", label: "Product" }, { key: "product_summary", label: "Product and quantity summary" }, { key: "bundle_summary", label: "Cutting bundle summary" }, { key: "size", label: "Resolved size" }, { key: "resolved_quantity", label: "Calculated quantity" }, { key: "people_count", label: "Number of people" }, { key: "variation_count", label: "Number of variations" }, { key: "unit_position", label: "Piece / pair number / total" }, { key: "package_position", label: "Package / set number / total" }, { key: "trace_order_position", label: "Label number / order total" }, { key: "trace_person_position", label: "Person number / total" }, { key: "trace_product_position", label: "Product number / total" }, { key: "order", label: "Order number" }, { key: "client", label: "Client" }, { key: "token", label: "Trace code" }], people = order?.fields.map(field => ({ key: `field:${field.id}`, label: `Person detail · ${field.name}` })) || [], traceGroups = order?.fields.filter(field => field.name.trim()).map(field => ({ key: `trace_field:${field.id}`, label: `Number within ${field.name}` })) || [], measurements = order?.measurements.flatMap(measurement => order.products.filter(product => measurement.appliesTo.includes(product.id)).map(product => ({ key: `measurement:${measurement.id}:product:${product.id}`, label: `${product.name} · ${measurement.name}` }))) || [], specifications = order?.products.flatMap(product => product.specifications.filter(spec => spec.name.trim()).map(spec => ({ key: `spec:${spec.id}`, label: `${product.name} · ${spec.name} (resolved)` }))) || [], values = [...base, ...people, ...traceGroups, ...measurements, ...specifications]; return [...values, ...values.map(option => ({ key: `field_name:${option.key}`, label: `Field name · ${option.label.replace(/ \(resolved\)$/, "")}` }))]; }
function normalizedMeasurementValues'''
text = replace_regex(
    text,
    r'function labelFieldOptions\(order\?: SeikoOrder \| null\) \{.*?\nfunction normalizedMeasurementValues',
    label_options,
    "trace field options",
)

text = replace_required(
    text,
    '{item && <><label className="showName"><input type="checkbox" checked={item.showLabel || false} onChange={event => update(item.id, { showLabel: event.target.checked })}/> Show name</label>',
    '{item && <><label className="showName"><input type="checkbox" checked={item.showLabel || false} onChange={event => update(item.id, { showLabel: event.target.checked })}/> Show name</label>{isTracePositionField(option.key) && <label className="traceTotalChoice"><input type="checkbox" checked={item.showTotal ?? true} onChange={event => update(item.id, { showTotal: event.target.checked })}/> Show of total</label>}',
    "trace total checkbox",
)

resolver = '''function resolveLabelRows(order: SeikoOrder, source: SourceMode, packageGroupBy = "product", packageCounts: Record<string, number> = {}, personPackagePlan: PersonPackagePlan = "together", includedProducts: string[] = order.products.map(product => product.id)): RecordRow[] {
    const base = orderLabelRows(order, "person_product");
    const resolved = source === "person_product" ? productionUnitRows(base) : source === "person" ? personPackageRows(base, personPackagePlan, includedProducts) : source === "group" ? groupedPackageRows(base, order, packageGroupBy, packageCounts) : source === "product" ? productSummaryRows(base) : orderPackageRows(base, order);
    return withTracePositions(resolved, order);
}
function withTracePositions(rows: RecordRow[], order: SeikoOrder): RecordRow[] {
    const personKeys = [...new Set(rows.map(row => row.values.record_id || row.name).filter(Boolean))];
    const productKeys = [...new Set(rows.map(row => row.values.product_id || row.product).filter(Boolean))];
    const fieldPositions = new Map<string, { position: number; total: number }>();
    for (const field of order.fields.filter(item => item.name.trim())) {
        const buckets = new Map<string, RecordRow[]>();
        for (const row of rows) {
            const value = String(row.values[`field:${field.id}`] || "").trim();
            if (!value) continue;
            buckets.set(value, [...(buckets.get(value) || []), row]);
        }
        for (const [value, bucket] of buckets) bucket.forEach((row, index) => fieldPositions.set(`${field.id}\\u0000${value}\\u0000${row.id}`, { position: index + 1, total: bucket.length }));
    }
    return rows.map((row, index) => {
        const personKey = row.values.record_id || row.name;
        const productKey = row.values.product_id || row.product;
        const values: Record<string, string> = { ...row.values, trace_order_position: `${index + 1} of ${rows.length}` };
        const personIndex = personKeys.indexOf(personKey);
        if (personIndex >= 0) values.trace_person_position = `${personIndex + 1} of ${personKeys.length}`;
        const productIndex = productKeys.indexOf(productKey);
        if (productIndex >= 0) values.trace_product_position = `${productIndex + 1} of ${productKeys.length}`;
        for (const field of order.fields.filter(item => item.name.trim())) {
            const groupValue = String(row.values[`field:${field.id}`] || "").trim();
            const position = fieldPositions.get(`${field.id}\\u0000${groupValue}\\u0000${row.id}`);
            if (position) values[`trace_field:${field.id}`] = `${position.position} of ${position.total}`;
        }
        return { ...row, values };
    });
}
function productionUnitRows'''
text = replace_regex(
    text,
    r'function resolveLabelRows\(order: SeikoOrder, source: SourceMode, packageGroupBy = "product".*?\nfunction productionUnitRows',
    resolver,
    "trace position resolver",
)

write(path, text)

path = "app/label-production-ready.tsx"
text = read(path)
text = replace_required(
    text,
    '  if (/Trace code|Piece number|sequence|barcode|qr/i.test(text)) return "trace";',
    '  if (/Trace code|Piece \/ pair number|Package \/ set number|Label number \/ order total|Person number \/ total|Product number \/ total|Number within|sequence|barcode|qr/i.test(text)) return "trace";',
    "trace category recognition",
)
write(path, text)

path = "tests/seiko-stage2-audit-contract.test.mjs"
text = read(path)
text = replace_required(
    text,
    '  assert.doesNotMatch(labelProductionReady, /\\["style","Style"\\]/);\n});',
    '  assert.doesNotMatch(labelProductionReady, /\\["style","Style"\\]/);\n  assert.match(labelDesigner, /recordFilterBar/);\n  assert.match(labelDesigner, /recordFilterField/);\n  assert.match(labelDesigner, /recordSort/);\n  assert.match(labelDesigner, /withTracePositions/);\n  assert.match(labelDesigner, /trace_order_position/);\n  assert.match(labelDesigner, /trace_person_position/);\n  assert.match(labelDesigner, /trace_product_position/);\n  assert.match(labelDesigner, /trace_field:/);\n  assert.match(labelDesigner, /Show of total/);\n});',
    "trace and filter contract",
)
write(path, text)

print("Final SEIKO label acceptance behavior applied.")
