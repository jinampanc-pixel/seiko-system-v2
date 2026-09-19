import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

function load(path, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { if (!imports[name]) throw new Error(`Unexpected import ${name}`); return imports[name]; }, crypto: globalThis.crypto });
  return exports;
}
const domain = load("../app/lib/order-domain.ts");
const model = load("../app/lib/packing-label-model.ts", { "./order-domain": domain });
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/packing-quantity-regression.json", import.meta.url)));
export const order = {
  orderId: "quantity-regression", status: "Active", archived: false,
  details: { orderNo: "test", clientName: "Packing regression", clientType: "School / Institution" },
  products: fixture.products.map(name => ({ id: name, name, quantityMode: "per_person", defaultQuantity: 0, orderTotal: 0, quantityGroupRules: [], specifications: [] })),
  fields: [{ id: "name", name: "Name", type: "text", options: [], required: false }], measurements: [],
  records: fixture.quantities.map((row, index) => ({ recordId: `person-${index}`, personId: `P-${index}`, values: Object.fromEntries([["field:name", `Person ${index + 1}`], ...fixture.products.map((id, i) => [`product:${id}:qty`, row[i]])]) })),
  revisions: [], updatedAt: "",
};
test("390-record regression: totals are pieces, AND eligibility is 63 people", () => {
  const quantities = model.packingQuantities(order);
  assert.equal(quantities.size, 390);
  assert.deepEqual(fixture.products.map(id => [...quantities.values()].reduce((sum, values) => sum + values[id], 0)), [383, 298, 87, 267, 249, 247]);
  const ids = model.eligiblePackingIds(quantities, ["Shirt", "Pant"]);
  assert.equal(ids.length, 63);
  assert.ok(ids.every(id => quantities.get(id).Shirt > 0 && quantities.get(id).Pant > 0));
  assert.equal(model.eligiblePackingIds(quantities, []).length, 0);
});
test("AND excludes single-product people, zero values and held records", () => {
  const copy = structuredClone(order); copy.records = [
    { recordId: "shirt", values: { "product:Shirt:qty": 2, "product:Pant:qty": 0 } },
    { recordId: "pant", values: { "product:Shirt:qty": 0, "product:Pant:qty": 1 } },
    { recordId: "both", values: { "product:Shirt:qty": 2, "product:Pant:qty": 1 } },
    { recordId: "held", held: true, values: { "product:Shirt:qty": 1, "product:Pant:qty": 1 } },
  ];
  const quantities = model.packingQuantities(copy);
  assert.equal(model.eligiblePackingIds(quantities, ["Shirt", "Pant"]).join(), "both");
  assert.equal(model.eligiblePackingIds(quantities, ["Shirt"]).join(), "shirt,both");
  assert.equal(model.eligiblePackingIds(quantities, ["Pant"]).join(), "pant,both");
});
test("physical geometry remains bounded after snap, resize and invalid input", () => {
  const original = { x: 2, y: 3, w: 20, h: 5 };
  const moved = model.moveBox(original, 1.6, 2.2);
  assert.equal(moved.x, 4); assert.equal(moved.y, 5);
  const resized = model.resizeBox(original, 500, 500);
  assert.equal(resized.w, 48); assert.equal(resized.h, 22);
  for (const box of [model.moveBox(original, 500, 500), model.constrainBox({ x: NaN, y: -3, w: 99, h: 90 }), resized]) {
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= 50 && box.y + box.h <= 25);
  }
});
test("font fitting reports dense text and true overflow", () => {
  const normal = model.measureLabelText("Name", 8, 40, 6, (line, pt) => line.length * pt / 2);
  assert.equal(normal.font, 8); assert.equal(normal.overflow, false);
  const dense = model.measureLabelText("W".repeat(200), 8, 10, 2, (line, pt) => line.length * pt);
  assert.equal(dense.small, true); assert.equal(dense.overflow, true);
});
