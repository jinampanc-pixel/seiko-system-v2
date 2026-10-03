import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

function load(path, imports = {}, expose = "") {
  const exports = {};
  const source = fs.readFileSync(new URL(path, import.meta.url), "utf8") + expose;
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    assert.ok(imports[name], `Unexpected import ${name}`); return imports[name];
  }, crypto: globalThis.crypto });
  return exports;
}
const domain = load("../app/lib/order-domain.ts");
const model = load("../app/lib/packing-label-model.ts", { "./order-domain": domain });
const designer = load("../app/packing-person-label-designer.tsx", {
  react: {}, "react-dom": {}, "react/jsx-runtime": {}, "./physical-label-canvas": {},
  "./physical-label-editor.css": {}, "./lib/physical-output": load("../app/lib/physical-output.ts"),
  "./lib/order-domain": domain, "./lib/packing-label-model": model,
}, "\nexports.mergeRules = mergeRules; exports.migrateItems = migrateItems; exports.freePlacement = freePlacement;");

function fixture() {
  return {
    orderId: "packing-runtime", details: { clientName: "Test school", orderNo: "TEST-001" },
    fields: [{ id: "name", name: "Name" }],
    products: ["shirt", "pant"].map(id => ({ ...domain.blankProduct(), id, name: id, quantityMode: "per_person", defaultQuantity: 0 })),
    measurements: [{ id: "size", name: "Size", appliesTo: ["shirt"] }],
    records: [
      { recordId: "both", values: { "field:name": "A", "product:shirt:qty": 2, "product:pant:qty": 1, "measurement:size:product:shirt": "M" } },
      { recordId: "shirt-only", values: { "field:name": "B", "product:shirt:qty": 1, "product:pant:qty": 0 } },
      { recordId: "held", held: true, values: { "product:shirt:qty": 1, "product:pant:qty": 1 } },
    ],
  };
}

test("packing renderer uses actual quantities, excludes held/zero products and preserves conditional details", () => {
  const order = fixture(); const rules = designer.mergeRules(order);
  rules.shirt.alias = "Top"; rules.shirt.showQuantity = true;
  rules.shirt.primaryMeasurementId = "size"; rules.shirt.measurementModes.size = "when_present";
  const all = designer.buildPersonRecords(order, rules, { matchMode: "all", layoutMode: "flow", delimiter: " / " });
  assert.equal(all.length, 1); assert.equal(all[0].id, "both");
  assert.match(all[0].packageText, /Top.*M.*Qty 2/);
  const any = designer.buildPersonRecords(order, rules, { matchMode: "any", layoutMode: "inline", delimiter: " | " });
  assert.equal(any.length, 2); assert.match(any[0].packageText, / \| /);
  assert.equal(any[1].packageLines.length, 1); assert.doesNotMatch(any[1].packageText, /pant|Size|—/);
  rules.pant.included = false;
  assert.equal(designer.buildPersonRecords(order, rules, { matchMode: "all", layoutMode: "separate", delimiter: " / " }).length, 2);
});

test("legacy packing slots and measurement boxes migrate once with bounded saved geometry", () => {
  const order = fixture();
  const migrated = designer.migrateItems(order, [
    { id: "slot", field: "product_name:__packing_product_slot_1", x: 2, y: 3, w: 20, h: 5, font: 9 },
    { id: "measurement", field: "measurement:size" },
    { id: "person", field: "field:name", x: 3, y: 1, w: 20, h: 4, font: 10 },
  ]);
  assert.equal(migrated.length, 2); assert.equal(migrated[0].field, "package_contents");
  assert.equal(migrated[1].field, "field:name"); assert.equal(migrated[0].font, 9);
  assert.equal(migrated[0].x, 2); assert.equal(migrated[0].y, 3);
});

test("new fields occupy a free bounded area when space is available", () => {
  const existing = [{ x: 2, y: 2, w: 22, h: 4.5 }];
  const next = designer.freePlacement(existing, "field:name");
  assert.ok(next.x >= existing[0].x + existing[0].w || next.y >= existing[0].y + existing[0].h);
  assert.ok(next.x + next.w <= 50 && next.y + next.h <= 25);
});
