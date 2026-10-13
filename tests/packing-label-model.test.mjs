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
const domain = load("../app/lib/order-domain.ts", { "./order-statuses": load("../app/lib/order-statuses.ts") });
const model = load("../app/lib/packing-label-model.ts", { "./order-domain": domain });
const handover = load("../app/lib/order-handover.ts", { "./order-domain": domain, "./packing-label-model": model, "./seiko-billing": load("../app/lib/seiko-billing.ts") });
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/packing-quantity-regression.json", import.meta.url)));
export const order = {
  orderId: "quantity-regression", status: "Active", archived: false,
  details: { orderNo: "test", clientName: "Packing regression", clientType: "School / Institution" },
  products: fixture.products.map(name => ({ id: name, name, quantityMode: "per_person", defaultQuantity: 0, orderTotal: 0, quantityGroupRules: [], specifications: [] })),
  fields: [{ id: "name", name: "Name", type: "text", options: [], required: false }], measurements: [],
  records: fixture.quantities.map((row, index) => ({ recordId: `person-${index}`, personId: `P-${index}`, values: Object.fromEntries([["field:name", `Person ${index + 1}`], ...fixture.products.map((id, i) => [`product:${id}:qty`, row[i]])]) })),
  revisions: [], updatedAt: "",
};
test("handover contains all 390 records and canonical product totals without measurements by default", () => {
  const copy = structuredClone(order);
  copy.measurements = [{ id: "length", name: "Secret measurement", appliesTo: ["Pant"], type: "number" }];
  copy.records[0].values["measurement:length:product:Pant"] = 44;
  const options = handover.defaultHandoverOptions(copy);
  const report = handover.handoverModel(copy, options);
  assert.equal(report.rows.length, 390);
  assert.equal(report.totals.join(), "383,298,87,267,249,247");
  assert.equal((handover.handoverHtml(copy, options).match(/data-record-id=/g) || []).length, 390);
  assert.doesNotMatch(handover.handoverHtml(copy, options), /Secret measurement/);
  assert.match(handover.handoverHtml(copy, { ...options, sizes: true }), /Secret measurement: 44/);
});
test("handover selection excludes held rows, never assigns order-wide totals to a student, and escapes content", () => {
  const copy = structuredClone(order); copy.records = copy.records.slice(0, 3); copy.records[1].held = true;
  copy.details.clientName = '<script>alert(1)</script>'; copy.products[0].quantityMode = "order_total"; copy.products[0].orderTotal = 300;
  const options = { ...handover.defaultHandoverOptions(copy), productIds: ["Pant"] };
  const report = handover.handoverModel(copy, options);
  assert.equal(report.rows.length, 2); assert.equal(report.totals[0], 0); assert.equal(report.unallocated[0].quantity, 300);
  const html = handover.handoverHtml(copy, options);
  assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/); assert.match(html, /not allocated to students/);
});
test("financial reference only accepts a non-cancelled document belonging to this order", () => {
  const doc = { orderId: order.orderId, status: "issued", number: "INV-TEST", kind: "invoice", issueDate: "2026-10-13", taxMode: "non_gst", taxTreatment: "intra_state", lines: [{ description: "Shirt", quantity: 2, unitRate: 50, taxRate: 0 }] };
  const options = { ...handover.defaultHandoverOptions(order), financialDocument: doc };
  assert.match(handover.handoverHtml(order, options), /Document total: ₹100.00/);
  assert.match(handover.handoverHtml(order, options), /not allocated to individual students/);
  assert.doesNotMatch(handover.handoverHtml(order, { ...options, financialDocument: { ...doc, orderId: "another" } }), /INV-TEST/);
  assert.doesNotMatch(handover.handoverHtml(order, { ...options, financialDocument: { ...doc, status: "cancelled" } }), /INV-TEST/);
});
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

test("ANY includes mixed packages once and excludes zero or unselected products", () => {
 const q = new Map([["a",{Pant:1,Shirt:1,Vest:1}],["b",{Pant:1,Vest:1}],["c",{Kurti:1,Pant:1}],["d",{Kurti:1,Pant:1,Vest:1}],["e",{Vest:2}],["zero",{Vest:0}],["other",{Track:1}]]);
 const products=["Kurti","Pant","Shirt","Vest"];
 assert.equal(model.eligiblePackingIds(q,products).length,0);
 assert.equal(JSON.stringify(model.eligiblePackingIds(q,products,"any")),JSON.stringify(["a","b","c","d","e"]));
 assert.equal(model.eligiblePackingIds(q,[],"any").length,0);
});
