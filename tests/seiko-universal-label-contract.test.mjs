import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const packing = read("app/packing-person-label-designer.tsx");
const create = read("app/labels/create/page.tsx");
const generic = read("app/label-designer.tsx");

test("packing labels expose every order-defined person field without hardcoding", () => {
  assert.match(packing, /\.\.\.order\.fields\.filter\(field => field\.name\.trim\(\)\)\.map/);
  assert.match(packing, /`field:\$\{field\.id\}`/);
  assert.match(packing, /field\?\.name \|\| "Order detail"/);
});

test("package presentation is schema driven for arbitrary measurements and specifications", () => {
  assert.match(packing, /order\.measurements\.filter\(item => item\.appliesTo\.includes\(product\.id\)/);
  assert.match(packing, /product\.specifications\.filter\(item => item\.name\.trim\(\) && item\.role !== "asset"\)/i);
  assert.match(packing, /measurementAliases/);
  assert.match(packing, /specificationAliases/);
  assert.match(packing, /Never/);
  assert.match(packing, /When present/i);
  assert.match(packing, /Always/);
});

test("missing conditional measurements and attributes consume no rendered content", () => {
  assert.match(packing, /if \(!value && mode === "when_present"\) continue/i);
  assert.match(packing, /if \(!text\.trim\(\)\) continue/);
  assert.match(packing, /if \(quantity <= 0\) continue/);
});

test("package contents support flow, inline and separately movable rows", () => {
  assert.match(packing, /type PackageLayoutMode = "flow" \| "inline" \| "separate"/);
  assert.match(packing, /<option value="flow">Flow rows<\/option>/i);
  assert.match(packing, /<option value="inline">Inline<\/option>/);
  assert.match(packing, /<option value="separate">Separate movable rows<\/option>/i);
  assert.match(packing, /`package_row:\$\{index\}`/);
  assert.match(packing, /packagePresentation\.delimiter/);
});

test("label fields auto-place in free canvas areas and text fits per record", () => {
  assert.match(packing, /function freePlacement/);
  assert.match(packing, /rectanglesOverlap/);
  assert.match(packing, /freePlacement\(draftItems, field\)/);
  assert.match(packing, /function FitText/);
  assert.match(packing, /preserveAspectRatio="none"/);
  assert.match(packing, /context\.measureText/);
});

test("saved sets persist package presentation and per-product rules", () => {
  assert.match(packing, /presentationRules: rules/);
  assert.match(packing, /packagePresentation, designerKind: "packing-person-v4"/);
  assert.match(packing, /openedTask\?\.presentationRules \? mergeRules\(order, openedTask.presentationRules\)/);
  assert.match(packing, /openedTask\?\.packagePresentation \|\| loadPackagePresentation/);
});

test("canvas and print use the same field renderer", () => {
  const occurrences = packing.match(/renderItem\(item, /g) || [];
  assert.ok(occurrences.length >= 2, "renderItem should be used by preview and printed labels");
  assert.match(packing, /className="physicalPrintSheet"/);
  assert.match(packing, /renderItem\(item, record\)/);
});

test("universal setup retains purpose-driven representations and free generic canvas", () => {
  assert.match(create, /Each physical item/i);
  assert.match(create, /Each person \/ package/i);
  assert.match(create, /Each product \/ stock group/i);
  assert.match(create, /Each group \/ outer package/i);
  assert.match(create, /Whole order/i);
  assert.match(generic, /Fixed text/i);
  assert.match(generic, /QR code/i);
  assert.match(generic, /Barcode/);
  assert.match(generic, /Sequence/);
});
