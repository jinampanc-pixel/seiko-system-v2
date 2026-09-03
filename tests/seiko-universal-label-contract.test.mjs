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
  assert.match(packing, /product\.specifications\.filter\(item => item\.name\.trim\(\) && item\.role !== "asset"\)/);
  assert.match(packing, /measurementAliases/);
  assert.match(packing, /specificationAliases/);
  assert.match(packing, /Never/);
  assert.match(packing, /When present/);
  assert.match(packing, /Always/);
});

test("missing conditional measurements and attributes consume no rendered content", () => {
  assert.match(packing, /if \(!value && mode === "when_present"\) continue/);
  assert.match(packing, /if \(!text\.trim\(\)\) continue/);
  assert.match(packing, /if \(quantity <= 0\) continue/);
});

test("package contents support flow, inline and separately movable rows", () => {
  assert.match(packing, /type PackageLayoutMode = "flow" \| "inline" \| "separate"/);
  assert.match(packing, /Flow rows in one movable block/);
  assert.match(packing, /Compact inline text/);
  assert.match(packing, /Separate movable product rows/);
  assert.match(packing, /`package_row:\$\{index\}`/);
  assert.match(packing, /packagePresentation\.delimiter/);
});

test("label fields auto-place in free canvas areas and text fits per record", () => {
  assert.match(packing, /function freePlacement/);
  assert.match(packing, /rectanglesOverlap/);
  assert.match(packing, /const position = freePlacement\(currentItems/);
  assert.match(packing, /function FitText/);
  assert.match(packing, /while \(pt > minPt\)/);
  assert.match(packing, /context\.measureText/);
});

test("saved sets persist package presentation and per-product rules", () => {
  assert.match(packing, /presentationRules: rules/);
  assert.match(packing, /packagePresentation, designerKind: "packing-person-v4"/);
  assert.match(packing, /if \(task\.presentationRules\) setRules/);
  assert.match(packing, /if \(task\.packagePresentation\) setPackagePresentation/);
});

test("canvas and print use the same field renderer", () => {
  const occurrences = packing.match(/renderItem\(item, /g) || [];
  assert.ok(occurrences.length >= 2, "renderItem should be used by preview and printed labels");
  assert.match(packing, /className="printSheet"/);
  assert.match(packing, /renderItem\(item, record, records\.indexOf\(record\)\)/);
});

test("universal setup retains purpose-driven representations and free generic canvas", () => {
  assert.match(create, /Each physical item/);
  assert.match(create, /Each person \/ package/);
  assert.match(create, /Each product \/ stock group/);
  assert.match(create, /Each group \/ outer package/);
  assert.match(create, /Whole order/);
  assert.match(generic, /Fixed text/);
  assert.match(generic, /QR code/);
  assert.match(generic, /Barcode/);
  assert.match(generic, /Sequence/);
});
