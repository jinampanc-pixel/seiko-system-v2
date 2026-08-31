from pathlib import Path

path = Path("app/label-designer.tsx")
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one match, found {count}: {old[:120]!r}")
    text = text.replace(old, new, 1)


replace_once(
    'function uniqueSavedName(base: string, names: string[]) {',
    '''function preferredClassificationFieldId(order?: SeikoOrder | null) {
    if (!order) return "";
    const referenced = order.products.flatMap(product => [product.quantityGroupFieldId, ...product.specifications.map(specification => specification.groupFieldId)]).filter((fieldId): fieldId is string => !!fieldId && order.fields.some(field => field.id === fieldId));
    return referenced[0] || order.fields.find(field => field.type === "dropdown" && field.name.trim())?.id || order.fields.find(field => field.name.trim())?.id || "";
}
function uniqueSavedName(base: string, names: string[]) {''',
)

replace_once(
    '''    const classificationKey = key(businessId, `classification:${order?.orderId || "no-order"}`);
    const [classificationFieldId, setClassificationFieldId] = useState(() => stored<string>(classificationKey, ""));
    const personDetailFields = useMemo(() => order?.fields.filter(field => field.name.trim()) || [], [order]);
    useEffect(() => {
        if (classificationFieldId && !personDetailFields.some(field => field.id === classificationFieldId)) {
            setClassificationFieldId("");
            localStorage.removeItem(classificationKey);
        }
    }, [classificationFieldId, classificationKey, personDetailFields]);''',
    '''    const classificationKey = key(businessId, `classification:${order?.orderId || "no-order"}`);
    const [classificationFieldId, setClassificationFieldId] = useState(() => stored<string>(classificationKey, "") || preferredClassificationFieldId(order));
    const personDetailFields = useMemo(() => order?.fields.filter(field => field.name.trim()) || [], [order]);
    useEffect(() => {
        if (!classificationFieldId || !personDetailFields.some(field => field.id === classificationFieldId)) {
            const next = preferredClassificationFieldId(order);
            setClassificationFieldId(next);
            if (next) localStorage.setItem(classificationKey, JSON.stringify(next));
            else localStorage.removeItem(classificationKey);
        }
    }, [classificationFieldId, classificationKey, order, personDetailFields]);''',
)

replace_once(
    '''    // Simple setup is content-driven: every chosen field must remain visible. Older
    // saved batches can contain stale, overlapping or out-of-bounds coordinates,
    // so only the advanced editor is allowed to honour manual coordinates.
    const displayedItems = useMemo(() => advanced ? items : arrangeLabelItems(items, preset), [advanced, items, preset]);
    const previewItems = useMemo(() => advanced ? items : arrangeLabelItemsForRow(items, preset, current), [advanced, items, preset, current]);''',
    '''    const purposeItems = useMemo(() => purpose === "packing" ? items.filter(item => item.kind !== "field" || (item.field !== "name" && item.field !== "group")) : items, [items, purpose]);
    // Simple setup is content-driven: every chosen field must remain visible. Older
    // saved batches can contain stale, overlapping or out-of-bounds coordinates,
    // so only the advanced editor is allowed to honour manual coordinates.
    const displayedItems = useMemo(() => advanced ? purposeItems : arrangeLabelItems(purposeItems, preset), [advanced, purposeItems, preset]);
    const previewItems = useMemo(() => advanced ? purposeItems : arrangeLabelItemsForRow(purposeItems, preset, current), [advanced, purposeItems, preset, current]);''',
)

replace_once(
    '<div className="labelInfoSelectedStrip labelInfoSelectedStripReact">{items.filter(item => item.kind === "field").map(item => {',
    '<div className="labelInfoSelectedStrip labelInfoSelectedStripReact">{displayedItems.filter(item => item.kind === "field").map(item => {',
)

replace_once(
    '<div className="fieldChecklist"><div className="fieldChecklist">{fieldOptions.filter(option => !option.key.startsWith("field_name:")).map(option => {',
    '<div className="fieldChecklist">{fieldOptions.filter(option => !option.key.startsWith("field_name:")).map(option => {',
)

replace_once(
    'const rowItems = advanced ? items : arrangeLabelItemsForRow(items, preset, r);',
    'const rowItems = advanced ? purposeItems : arrangeLabelItemsForRow(purposeItems, preset, r);',
)

path.write_text(text)
print("SEIKO label acceptance refinements applied")
