import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/packing-person-label-designer.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/labels/create/page.tsx", import.meta.url), "utf8");

test("packing person labels use a dedicated native designer", () => {
  assert.match(page, /PackingPersonLabelDesigner/);
  assert.match(page, /selectedPurpose\.behavior === "packing" && selectedRepresentation\.sourceMode === "person"/);
});

test("native designer builds eligible person packages from actual quantities", () => {
  assert.match(source, /packingQuantities/);
  assert.match(source, /eligiblePackingIds/);
  assert.match(source, /quantities.get\(record.recordId\)/);
  assert.match(source, /if \(quantity <= 0\) continue/);
  assert.doesNotMatch(source, /SLOT_PREFIX|syntheticProductId/);
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

test("legacy product and measurement fields migrate into a single package block", () => {
  assert.match(source, /field.startsWith\("measurement:"\)/);
  assert.match(source, /field.includes\("__packing_product_slot_"\)/);
  assert.match(source, /mapped = PACKAGE_FIELD/);
  assert.match(source, /mapped === PACKAGE_FIELD && hasPackage/);
});

test("preview and print fit the same measured SVG text without changing saved font", () => {
  assert.match(source, /function FitText/);
  assert.match(source, /context.measureText/);
  assert.match(source, /viewBox=/);
  assert.match(source, /preserveAspectRatio="none"/);
  assert.match(source, /fontSize=\{preferredPt \* 96 \/ 72\}/);
  assert.match(source, /await document.fonts.ready/);
  assert.match(source, /renderItem\(item, current\)/);
  assert.match(source, /renderItem\(item, record\)/);
});
