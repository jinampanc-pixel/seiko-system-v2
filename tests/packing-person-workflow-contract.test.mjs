import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const designer = readFileSync(new URL("../app/packing-person-label-designer.tsx", import.meta.url), "utf8");
const createPage = readFileSync(new URL("../app/labels/create/page.tsx", import.meta.url), "utf8");
const printPage = readFileSync(new URL("../app/labels/print/page.tsx", import.meta.url), "utf8");

test("packing person labels use a dedicated workflow-first designer", () => {
  assert.match(createPage, /PackingPersonLabelDesigner/);
  assert.match(designer, /Information on the label/);
  assert.match(designer, /Package contents/);
  assert.doesNotMatch(designer, /Automatic product slots/);
  assert.doesNotMatch(designer, /Product 1/);
  assert.doesNotMatch(designer, /Person package · Product/);
});

test("new information fields are placed in free non-overlapping areas", () => {
  assert.match(designer, /function freePlacement/);
  assert.match(designer, /rectanglesOverlap/);
  assert.match(designer, /const position = freePlacement\(currentItems, key\)/);
});

test("package contents use actual applicable products and conditional details", () => {
  assert.match(designer, /resolvedQuantity/);
  assert.match(designer, /quantity <= 0/);
  assert.match(designer, /measurementModes/);
  assert.match(designer, /specificationModes/);
  assert.match(designer, /When present/);
  assert.match(designer, /Printed product name/);
  assert.match(designer, /Details only/);
  assert.match(designer, /Name only/);
});

test("preview and print share the same renderer and fitted text", () => {
  assert.match(designer, /const renderItem/);
  assert.match(designer, /renderItem\(item, current/);
  assert.match(designer, /renderItem\(item, record/);
  assert.match(designer, /function FitText/);
  assert.match(printPage, /packingFitText:not\(\[data-fit-ready='true'\]\)/);
});

test("saved packing person sets print through the same dedicated designer", () => {
  assert.match(printPage, /isPackingPerson/);
  assert.match(printPage, /<PackingPersonLabelDesigner/);
  assert.match(designer, /designerKind: "packing-person-v3"/);
  assert.match(designer, /migrateItems/);
});
