import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/packing-person-label-designer.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/labels/create/page.tsx", import.meta.url), "utf8");

test("packing person labels use a dedicated native designer", () => {
  assert.match(page, /PackingPersonLabelDesigner/);
  assert.match(page, /selectedPurpose\.behavior === "packing" && selectedRepresentation\.sourceMode === "person"/);
});

test("native designer maps applicable products into generic slots", () => {
  assert.match(source, /SLOT_PREFIX/);
  assert.match(source, /Product \$\{index \+ 1\}/);
  assert.match(source, /applicableProducts\(order, record, recordIndex\)/);
  assert.match(source, /resolvedQuantity/);
  assert.match(source, /quantityForRecord/);
});

test("product presentation supports aliases formats quantity and conditional measurements", () => {
  assert.match(source, /Printed product name/);
  assert.match(source, /name_details/);
  assert.match(source, /details_only/);
  assert.match(source, /name_only/);
  assert.match(source, /when_present/);
  assert.match(source, /Never/);
  assert.match(source, /Always/);
  assert.match(source, /measurementAliases/);
  assert.match(source, /primaryMeasurementId/);
});

test("legacy per-product measurement fields are removed from the synthetic packing order", () => {
  assert.match(source, /measurements: \[\]/);
  assert.match(source, /products: \[\{ id: syntheticProductId/);
});

test("preview and printed text auto-fit within user rectangles without changing saved font", () => {
  assert.match(source, /function autoFit/);
  assert.match(source, /\.canvasElement,.printedElement/);
  assert.match(source, /preferredPt/);
  assert.match(source, /Math\.max\(minPx, preferredPx \* scale\)/);
  assert.match(source, /beforeprint/);
});
