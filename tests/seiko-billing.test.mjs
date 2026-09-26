import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";

function load(path, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => imports[name], crypto, Response, Request, URL, TextDecoder, Uint8Array });
  return exports;
}
const model = load("../app/lib/seiko-billing.ts");
const printing = load("../app/lib/seiko-billing-print.ts", { "./seiko-billing": model });
const invoice = (id = "invoice-test-001") => ({ id, kind: "invoice", clientName: "Test Client", clientPhone: "1234567890", supplier: { name: "SEIKO", address: "", phone: "", bank: "", gstin: "" }, orderId: "", orderNo: "", issueDate: "2026-09-26", taxMode: "non_gst", taxTreatment: "intra_state", lines: [{ id: "line", description: "Vest", quantity: 2, unit: "pc", unitRate: 125, taxRate: 0 }], notes: "", status: "issued" });
const payment = (id, amount) => ({ id, invoiceId: "invoice-test-001", amount, date: "2026-09-26", mode: "UPI", reference: "test", notes: "" });

test("billing totals and refreshed invoice status use payment history without replacing invoice identity", () => {
  const bill = invoice();
  assert.equal(model.validateBillingDocument(bill), "");
  assert.equal(model.documentTotals(bill).total, 250);
  const gst = model.documentTotals({ ...bill, taxMode: "gst", lines: [{ ...bill.lines[0], quantity: 1, unitRate: 1, taxRate: 5 }] });
  assert.equal(model.roundMoney(gst.cgst + gst.sgst), gst.tax);
  const payments = [payment("payment-01", 100)];
  assert.equal(model.invoiceOutstanding(bill, payments), 150);
  assert.equal(model.billingStatus(bill, payments), "part_paid");
  payments.push(payment("payment-02", 150));
  assert.equal(model.billingStatus(bill, payments), "paid");
  assert.equal(model.validateBillingDocument({ ...bill, clientPhone: "" }), "Client name and phone are required.");
  assert.ok(model.validateBillingDocument({ ...bill, lines: [{ ...bill.lines[0], quantity: -1 }] }));
});

test("A4 output has named copies, updated balance, escaped content and receipt references", () => {
  const bill = { ...invoice(), number: "INV-2026-00001", clientName: '<script>alert("x")</script>' };
  const payments = [{ ...payment("payment-01", 100), receiptNumber: "RCP-2026-00001" }];
  const html = printing.billingPrintHtml(bill, payments, "both");
  assert.equal((html.match(/<article class="copy">/g) || []).length, 2);
  assert.match(html, /size:A4 portrait/); assert.match(html, /Customer \/ Client Copy/); assert.match(html, /Supplier Copy/);
  assert.match(html, /₹150.00/); assert.doesNotMatch(html, /<script>/);
  assert.equal((printing.billingPrintHtml(bill, payments, "customer").match(/<article/g) || []).length, 1);
  assert.match(printing.billingPrintHtml(bill, payments, "separate"), /body class="separate"/);
  assert.match(printing.billingPrintHtml(bill, payments, "customer", payments[0]), /Against invoice <b>INV-2026-00001/);
});

test("database persists invoices and idempotent payments, rejecting overpayment and unauthorized writes", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const db = { withSession() { return this; }, prepare(sql) {
    let args = []; const statement = sqlite.prepare(sql);
    return { bind(...values) { args = values; return this; }, async run() { return statement.run(...args); }, async first() { return statement.get(...args) || null; }, async all() { return { results: statement.all(...args) }; } };
  } };
  let authenticated = true, manage = true;
  const route = load("../app/api/erp/billing/route.ts", { "cloudflare:workers": { env: { DB: db } }, "../../../lib/seiko-billing": model, "../../../lib/server-erp-auth": { authenticateActor: async () => authenticated ? { email: "test@example.invalid" } : null, authorizePermission: async (_, __, permission) => permission === "financials.view" || manage } });
  const call = async body => route.POST(new Request("https://test.invalid/api/erp/billing", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", origin: "https://test.invalid" } }));
  try {
    let result = await (await call({ operation: "create", document: invoice() })).json();
    assert.equal(result.documents[0].number, "INV-2026-00001");
    await call({ operation: "create", document: invoice() });
    result = await (await call({ operation: "payment", payment: payment("payment-test-001", 100) })).json();
    assert.equal(result.payments[0].receiptNumber, "RCP-2026-00001");
    await call({ operation: "payment", payment: payment("payment-test-001", 100) });
    assert.equal((await call({ operation: "payment", payment: payment("payment-test-002", 151) })).status, 409);
    const outcomes = await Promise.all([call({ operation: "payment", payment: payment("payment-test-003", 100) }), call({ operation: "payment", payment: payment("payment-test-004", 100) })]);
    assert.equal(outcomes.filter(result => result.ok).length, 1);
    result = await (await call({ operation: "list" })).json();
    assert.equal(result.documents.length, 1); assert.equal(result.payments.length, 2);
    assert.equal(model.invoiceOutstanding(result.documents[0], result.payments), 50);
    manage = false; assert.equal((await call({ operation: "create", document: invoice("invoice-test-002") })).status, 403);
    authenticated = false; assert.equal((await call({ operation: "list" })).status, 401);
  } finally { sqlite.close(); }
});
