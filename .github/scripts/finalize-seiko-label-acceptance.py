from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# The canvas is directly editable. Remove the DOM-created Arrange / Finish arranging mode control.
p = Path("app/label-workspace-refinement.tsx")
text = p.read_text()
text, count = re.subn(
    r"\nfunction addArrangeControl\(page: HTMLElement\) \{.*?\n\}\n\nfunction fullRecordText",
    "\nfunction fullRecordText",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"label-workspace-refinement: arrange block count={count}")
if text.count("  addArrangeControl(page);\n") != 1:
    raise SystemExit("label-workspace-refinement: arrange call missing")
p.write_text(text.replace("  addArrangeControl(page);\n", "", 1))

# Remove the native Manual/Automatic toggle too. Pointer-down already freezes the current
# automatic positions into physical coordinates and immediately enables drag/resize.
replace_once(
    "app/label-designer.tsx",
    '</small></div><button className="secondary" onClick={() => { if (advanced) setAdvanced(false); else { setItems(arrangeLabelItems(items, preset)); setAdvanced(true); } }}>{advanced ? "Automatic layout" : "Manual layout"}</button></div>',
    '</small></div></div>',
)

# Legacy restored orders can store measurement values under pre-normalization keys. Product
# applicability must inspect normalized product-specific values before falling back to default qty.
replace_once(
    "app/label-designer.tsx",
    '''    const evidenceColumns = workspaceColumns(order).filter(column => column.groupId === `product:${product.id}` && (column.id.startsWith("measurement:") || column.id.startsWith("spec:")));
    if (!evidenceColumns.length) return quantity;
    const orderUsesProductEvidence = order.records.some(candidate => evidenceColumns.some(column => hasLabelValue(candidate.values[column.id])));
    if (!orderUsesProductEvidence) return quantity;
    return evidenceColumns.some(column => hasLabelValue(record.values[column.id])) ? quantity : 0;''',
    '''    const evidenceColumns = workspaceColumns(order).filter(column => column.groupId === `product:${product.id}` && (column.id.startsWith("measurement:") || column.id.startsWith("spec:")));
    if (!evidenceColumns.length) return quantity;
    const valuesWithNormalizedMeasurements = (candidate: SeikoOrder["records"][number]) => ({
        ...candidate.values,
        ...normalizedMeasurementValues(order, candidate.values),
    });
    const orderUsesProductEvidence = order.records.some(candidate => {
        const candidateValues = valuesWithNormalizedMeasurements(candidate);
        return evidenceColumns.some(column => hasLabelValue(candidateValues[column.id]));
    });
    if (!orderUsesProductEvidence) return quantity;
    const recordValues = valuesWithNormalizedMeasurements(record);
    return evidenceColumns.some(column => hasLabelValue(recordValues[column.id])) ? quantity : 0;''',
)

# Lock both defects in regression coverage.
replace_once(
    "tests/seiko-workspace-label-accuracy-contract.test.mjs",
    'const labels = read("app/label-designer.tsx");\nconst orderCss = read("app/order-enhancements.css");',
    'const labels = read("app/label-designer.tsx");\nconst labelRefinement = read("app/label-workspace-refinement.tsx");\nconst orderCss = read("app/order-enhancements.css");',
)
replace_once(
    "tests/seiko-workspace-label-accuracy-contract.test.mjs",
    '  assert.match(labels, /orderUsesProductEvidence/);\n',
    '  assert.match(labels, /orderUsesProductEvidence/);\n  assert.match(labels, /valuesWithNormalizedMeasurements/);\n  assert.match(labels, /normalizedMeasurementValues\\(order, candidate\\.values\\)/);\n',
)
p = Path("tests/seiko-workspace-label-accuracy-contract.test.mjs")
text = p.read_text()
if "label canvas is directly editable without an Arrange or Finish arranging mode" in text:
    raise SystemExit("direct-edit regression test already present")
text += '''\n\ntest("label canvas is directly editable without an Arrange or Finish arranging mode", () => {
  assert.doesNotMatch(labelRefinement, /addArrangeControl/);
  assert.doesNotMatch(labelRefinement, /Finish arranging|Arrange label/);
  assert.doesNotMatch(labels, /Automatic layout|Manual layout/);
  assert.match(labels, /if \\(!advanced\\) \\{ setItems\\(arranged\\); setAdvanced\\(true\\); \\}/);
  assert.match(labels, /const down = \\(e: ReactPointerEvent, item: Item\\)/);
});
'''
p.write_text(text)

# Acceptance text explicitly rejects a mode-switch button for normal canvas editing.
p = Path("SEIKO_STAGE2_ACCEPTANCE.md")
text = p.read_text()
needle = "- Manual canvas movement supports free 0.25 mm positioning, Shift axis-lock, Alt bypass of snapping, and edge/centre alignment snapping against the canvas and other label elements. This allows values to share an exact baseline or left/centre/right alignment."
replacement = "- The label canvas is directly editable: there is no required Arrange / Finish arranging mode. Clicking or dragging a field begins direct physical editing from its current automatic position.\n" + needle
if text.count(needle) != 1:
    raise SystemExit("acceptance direct-edit insertion marker missing")
p.write_text(text.replace(needle, replacement, 1))

print("Final direct-edit and record-applicability patch applied")
