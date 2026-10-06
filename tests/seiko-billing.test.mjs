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

test("amendments cannot overwrite a concurrent revision or undercut a concurrent payment", async () => {
  for (const race of ["revision", "payment"]) {
    const sqlite = new DatabaseSync(':memory:');
    try {
      for (const file of fs.readdirSync('migrations').sort()) sqlite.exec(fs.readFileSync(`migrations/${file}`, 'utf8'));
      let raceArmed = false;
      const db = { withSession() { return this; }, prepare(sql) {
        const statement = sqlite.prepare(sql); let args = [];
        return { bind(...values) { args = values; return this; }, async run() {
          if (raceArmed && sql.startsWith('UPDATE seiko_billing_documents SET')) {
            raceArmed = false;
            if (race === 'revision') sqlite.prepare('UPDATE seiko_billing_documents SET data=? WHERE id=?').run(JSON.stringify({ ...invoice(), clientName: 'Concurrent winner', revision: 1, amendedBy: 'other-owner' }), invoice().id);
            else sqlite.prepare('INSERT INTO seiko_billing_payments(id,invoice_id,amount_paise,data,created_by) VALUES(?,?,?,?,?)').run('racing-payment', invoice().id, 20000, JSON.stringify(payment('racing-payment', 200)), 'cashier');
          }
          return { meta: { changes: Number(statement.run(...args).changes) } };
        }, async first() { return statement.get(...args) || null; }, async all() { return { results: statement.all(...args) }; } };
      } };
      const api = load('../app/api/erp/billing/route.ts', { 'cloudflare:workers': { env: { DB: db } }, '../../../lib/seiko-billing': model, '../../../lib/server-erp-auth': { authenticateActor: async () => ({ email: 'owner' }), authorizePermission: async () => ({ role: 'owner' }) } });
      const call = body => api.POST(new Request('https://test.invalid/api/erp/billing', { method: 'POST', body: JSON.stringify(body) }));
      assert.equal((await call({ operation: 'create', document: invoice() })).status, 200);
      raceArmed = true;
      const amended = { ...invoice(), lines: [{ ...invoice().lines[0], unitRate: 50 }] };
      assert.equal((await call({ operation: 'amend', document: amended })).status, 409);
      const saved = sqlite.prepare('SELECT data,total_paise FROM seiko_billing_documents').get();
      assert.equal(saved.total_paise, 25000);
      if (race === 'revision') assert.equal(JSON.parse(saved.data).clientName, 'Concurrent winner');
      else assert.equal(sqlite.prepare('SELECT sum(amount_paise) AS n FROM seiko_billing_payments').get().n, 20000);
    } finally { sqlite.close(); }
  }
});

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
  assert.equal((html.match(/<article class="copy /g) || []).length, 2);
  assert.match(html, /size:A4 portrait/); assert.match(html, /Original for Recipient/); assert.match(html, /Duplicate for Supplier/);
  assert.match(html, /₹150.00/); assert.doesNotMatch(html, /<script>/);
  assert.equal((printing.billingPrintHtml(bill, payments, "customer").match(/<article/g) || []).length, 1);
  assert.match(printing.billingPrintHtml(bill, payments, "separate"), /body class="separate"/);
  assert.match(printing.billingPrintHtml(bill, payments, "customer", payments[0]), /Against invoice <b>INV-2026-00001/);
});

test("delivery documents support non-GST quantity-only, valued and statutory GST modes", () => {
  const bill = { ...invoice(), number: "DC-2026-00001", kind: "delivery_challan", supplier: { ...invoice().supplier, bank: "Bank A 123", upi: "seiko@upi", paymentQr: "data:image/png;base64,AAAA", showBank: true, showUpi: true, showQr: true } };
  const challan = printing.billingPrintHtml(bill, [], "customer");
  assert.match(challan, /Delivery Challan/); assert.match(challan, /<th>Qty<\/th><th>Unit<\/th>/);
  assert.doesNotMatch(challan, /<th>Rate<\/th>|<th>Amount<\/th>|Sub Total|Balance Due|Bank A 123|seiko@upi|₹/);
  const invoiceHtml = printing.billingPrintHtml({ ...bill, kind: "invoice", number: "INV-2026-00002" }, [], "customer");
  assert.match(invoiceHtml, /Bank A 123/); assert.match(invoiceHtml, /seiko@upi/); assert.match(invoiceHtml, /Scan to pay/); assert.match(invoiceHtml, /#153e63/);
  assert.match(challan, /Recipient Copy/); assert.match(printing.billingPrintHtml(bill, [], "supplier"), /Office Copy/);
  assert.match(printing.billingPrintHtml({ ...bill, showMonetaryValues: true }, [], "customer"), /Delivery Challan/);
  const gst = { ...bill, taxMode: "gst", placeOfSupply: "Maharashtra 27", supplier: { ...bill.supplier, address: "Mumbai", gstin: "27ABCDE1234F1Z5" }, clientAddress: "Pune", lines: bill.lines.map(line => ({ ...line, hsnSac: "6203", taxRate: 5 })) };
  const gstHtml = printing.billingPrintHtml(gst, [], "both");
  assert.match(gstHtml, /GST Delivery Challan/); assert.match(gstHtml, /Original for Consignee/); assert.match(gstHtml, /Duplicate for Transporter/); assert.match(gstHtml, /Triplicate for Consignor/); assert.match(gstHtml, /HSN\/SAC/); assert.match(gstHtml, /Place of supply/);
});

test("Indian money, amount words and professional receipt wording are printed", () => {
  assert.match(model.formatInr(213000), /2,13,000\.00/); assert.equal(model.amountInWords(213000), "Indian Rupees Two Lakh Thirteen Thousand Only");
  const receipt = { ...payment("payment-01", 213000), invoiceId: "", orderId: "order-1", receiptNumber: "RCP-2026-00001", allocations: [] };
  const html = printing.billingPrintHtml(model.orderReceiptDocument(receipt), [], "customer", receipt);
  assert.match(html, /Advance balance available/); assert.match(html, /Payment acknowledgement only; this is not a tax invoice/); assert.doesNotMatch(html, /Unapplied order advance/);
});

test("database persists invoices and idempotent payments, rejecting overpayment and unauthorized writes", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const db = { withSession() { return this; }, prepare(sql) {
    let args = []; const statement = sqlite.prepare(sql);
    return { bind(...values) { args = values; return this; }, async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; }, async first() { return statement.get(...args) || null; }, async all() { return { results: statement.all(...args) }; } };
  } };
  let authenticated = true, manage = true;
  const route = load("../app/api/erp/billing/route.ts", { "cloudflare:workers": { env: { DB: db } }, "../../../lib/seiko-billing": model, "../../../lib/server-erp-auth": { authenticateActor: async () => authenticated ? { email: "test@example.invalid" } : null, authorizePermission: async (_, __, permission) => permission === "financials.view" || manage } });
  const call = async body => route.POST(new Request("https://test.invalid/api/erp/billing", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", origin: "https://test.invalid" } }));
  try {
    let result = await (await call({ operation: "create", document: invoice() })).json();
    assert.equal(result.documents[0].number, "INV-2026-00001");
    await call({ operation: "create", document: invoice() });
    result = await (await call({ operation: "amend", document: { ...result.documents[0], clientName: "Amended Client" } })).json();
    assert.equal(result.documents[0].number, "INV-2026-00001"); assert.equal(result.documents[0].clientName, "Amended Client"); assert.equal(result.documents[0].revision, 1);
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

test("order advances create receipts before invoices and allocate once across multiple invoices", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE erp_orders(id TEXT, business_id TEXT, status TEXT, document_json TEXT)");
  sqlite.prepare("INSERT INTO erp_orders VALUES(?,?,?,?)").run("order-advance", "seiko", "Active", JSON.stringify({ details: { orderNo: "ORD-01", clientName: "Advance Client", contactNumber: "1234567890" } }));
  const db = { withSession() { return this; }, prepare(sql) { let args = []; const statement = sqlite.prepare(sql); return { bind(...values) { args = values; return this; }, async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; }, async first() { return statement.get(...args) || null; }, async all() { return { results: statement.all(...args) }; } }; } };
  let manage = true;
  const route = load("../app/api/erp/billing/route.ts", { "cloudflare:workers": { env: { DB: db } }, "../../../lib/seiko-billing": model, "../../../lib/server-erp-auth": { authenticateActor: async () => ({ email: "test@example.invalid" }), authorizePermission: async (_, __, permission) => permission === "financials.view" || manage } });
  const call = body => route.POST(new Request("https://test.invalid/api/erp/billing", { method: "POST", body: JSON.stringify(body) }));
  const advance = { ...payment("order-payment-01", 300), invoiceId: "", orderId: "order-advance", clientName: "Spoofed name", allocations: [{ invoiceId: "wrong", amount: 999 }] };
  try {
    assert.equal((await call({ operation: "payment", payment: { ...advance, orderId: "missing" } })).status, 404);
    let result = await (await call({ operation: "payment", payment: advance })).json();
    assert.equal(result.documents.length, 0);
    assert.equal(result.payments[0].clientName, "Advance Client");
    assert.equal(result.payments[0].receiptNumber, "RCP-2026-00001");
    assert.equal(model.unappliedOrderPayment(result.payments[0]), 300);
    const html = printing.billingPrintHtml(model.orderReceiptDocument(result.payments[0]), result.payments, "customer", result.payments[0]);
    assert.match(html, /Against order/); assert.match(html, /ORD-01/); assert.doesNotMatch(html, /Invoice total|Against invoice/);
    await call({ operation: "payment", payment: advance });
    assert.equal((await call({ operation: "payment", payment: { ...advance, amount: 400 } })).status, 409);
    result = await (await call({ operation: "create", document: { ...invoice("advance-invoice-01"), orderId: "order-advance", issueDate: "2026-09-30" } })).json();
    assert.equal(model.invoiceOutstanding(result.documents[0], result.payments), 0);
    assert.equal(model.unappliedOrderPayment(result.payments[0]), 50);
    result = await (await call({ operation: "create", document: { ...invoice("advance-invoice-02"), orderId: "order-advance", issueDate: "2026-09-30" } })).json();
    assert.equal(result.payments.length, 1);
    assert.equal(model.paymentsForInvoice(result.payments, "advance-invoice-01"), 250);
    assert.equal(model.paymentsForInvoice(result.payments, "advance-invoice-02"), 50);
    assert.equal(result.documents.reduce((sum,d) => sum + model.paymentsForInvoice(result.payments, d.id), 0), 300);
    result = await (await call({ operation: "payment", payment: { ...advance, id: "order-payment-02", amount: 100, date: "2026-10-01" } })).json();
    assert.equal(model.paymentsForInvoice(result.payments, "advance-invoice-02"), 150);
    const refreshed = await (await call({ operation: "list" })).json();
    assert.deepEqual(refreshed.payments, result.payments);
    manage = false;
    assert.equal((await call({ operation: "payment", payment: { ...advance, id: "order-payment-03" } })).status, 403);
  } finally { sqlite.close(); }
});

test("order allocations respect direct payments, other orders, cancelled invoices and paise", () => {
  const docs = [{ ...invoice("invoice-1"), orderId: "order-1", number: "INV-01", createdAt: "2026-01-01" }, { ...invoice("invoice-2"), orderId: "other", number: "INV-02", createdAt: "2026-01-02" }];
  const direct = { ...payment("direct", 100), invoiceId: "invoice-1", orderId: "order-1" };
  const advance = { ...payment("advance", 150.01), invoiceId: "", orderId: "order-1", receiptNumber: "RCP-01" };
  let allocated = model.allocateOrderPayments(docs, [direct, advance]);
  assert.equal(model.paymentsForInvoice(allocated, "invoice-1"), 250);
  assert.equal(model.paymentsForInvoice(allocated, "invoice-2"), 0);
  assert.equal(model.unappliedOrderPayment(allocated[1]), 0.01);
  allocated = model.allocateOrderPayments([{ ...docs[0], status: "cancelled" }], [advance]);
  assert.equal(model.unappliedOrderPayment(allocated[0]), 150.01);
});

test("shared client directory saves typed clients, merges duplicate phones and enforces access", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const db = { withSession() { return this; }, prepare(sql) { let args = []; const statement = sqlite.prepare(sql); return { bind(...values) { args = values; return this; }, async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; }, async first() { return statement.get(...args) || null; }, async all() { return { results: statement.all(...args) }; } }; } };
  let authenticated = true, manage = true;
  const clients = load("../app/lib/seiko-clients.ts");
  const route = load("../app/api/erp/clients/route.ts", { "cloudflare:workers": { env: { DB: db } }, "../../../lib/seiko-clients": clients, "../../../lib/server-erp-auth": { authenticateActor: async () => authenticated ? { email: "test@example.invalid" } : null, authorizePermission: async (_, __, permission) => permission === "financials.view" || manage } });
  const call = body => route.POST(new Request("https://test.invalid/api/erp/clients", { method: "POST", body: JSON.stringify(body) }));
  const base = { id: "client-test-001", name: "A S School", type: "School / Institution", contactPerson: "Principal", phone: "99999 99999", email: "OFFICE@EXAMPLE.INVALID", billingAddress: "Main Road", deliveryAddress: "Campus", gstin: "gst123", archived: false, sourceOrderIds: [], createdAt: "", updatedAt: "" };
  try {
    let result = await (await call({ operation: "save", client: base })).json();
    assert.equal(result.clients[0].type, "institutional"); assert.equal(result.clients[0].email, "office@example.invalid"); assert.equal(result.clients[0].gstin, "GST123");
    result = await (await call({ operation: "save", client: { ...base, id: "client-test-002", name: "A S School Updated" } })).json();
    assert.equal(result.clients.length, 1); assert.equal(result.clients[0].id, "client-test-001"); assert.equal(result.clients[0].name, "A S School Updated");
    assert.equal((await call({ operation: "save", client: { ...base, phone: "" } })).status, 400);
    manage = false; assert.equal((await call({ operation: "save", client: base })).status, 403); assert.equal((await call({ operation: "list" })).status, 200);
    authenticated = false; assert.equal((await call({ operation: "list" })).status, 401);
  } finally { sqlite.close(); }
});

test("Home exposes daily billing actions and the billing surface locks background scrolling", () => {
  const home = fs.readFileSync(new URL("../app/seiko-phase1.tsx", import.meta.url), "utf8");
  const phase2 = fs.readFileSync(new URL("../app/seiko-phase2.tsx", import.meta.url), "utf8");
  const polish = fs.readFileSync(new URL("../app/seiko-billing-polish.css", import.meta.url), "utf8");
  for (const label of ["+ New order", "Record payment", "Create invoice", "Delivery challan", "Quotation", "Packing labels"]) assert.match(home, new RegExp(label.replace("+", "\\+")));
  assert.match(home, /seiko:open-billing/); assert.match(phase2, /document\.body\.style\.overflow = "hidden"/); assert.match(polish, /\.seikoPhase2Surface \{ inset: 0 !important/);
});


test("zero invoices have no outstanding balance while cancellation and non-invoice statuses remain distinct",()=>{
 const zero={...invoice(),lines:[{...invoice().lines[0],unitRate:0}]};
 assert.equal(model.documentTotals(zero).total,0);assert.equal(model.invoiceOutstanding(zero,[]),0);
 assert.equal(model.billingStatus({...zero,status:"cancelled"},[]),"cancelled");
 assert.equal(model.billingStatus({...zero,kind:"quotation"},[]),"issued");
 assert.equal(model.billingStatus({...zero,kind:"delivery_challan"},[]),"issued");
});
test("payroll credits require enabled completion and supported rates; viewing, starting and hourly work create none",()=>{
 const production=load("../app/lib/production-domain.ts",{"./order-domain":{quantityForRecord:()=>0}});
 const scan={id:"scan",businessId:"seiko",garmentId:"garment",workerId:"worker",operationId:"finish",action:"complete"};
 assert.equal(production.payrollCredit(scan,{unit:"per_garment",amount:12.5},true),12.5);
 assert.equal(production.payrollCredit(scan,{unit:"per_garment",amount:0},true),0);
 assert.equal(production.payrollCredit(scan,{unit:"per_garment",amount:12.5},false),0);
 assert.equal(production.payrollCredit({...scan,action:"start"},{unit:"per_garment",amount:12.5},true),0);
 assert.equal(production.payrollCredit(scan,{unit:"per_hour",amount:12.5},true),0);
 assert.equal(production.payrollCredit(scan,undefined,true),0);
});
