import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";

function load(path, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => name.endsWith("/billing-profile") ? profile : imports[name], crypto, Response, Request, URL, TextEncoder, TextDecoder, Uint8Array });
  return exports;
}
const model = load("../app/lib/seiko-billing.ts");
const profile = load("../app/lib/billing-profile.ts");
const printing = load("../app/lib/seiko-billing-print.ts", { "./seiko-billing": model });
const invoice = (id = "invoice-test-001") => ({ id, kind: "invoice", clientName: "Test Client", clientPhone: "1234567890", supplier: { name: "SEIKO", address: "", phone: "", bank: "", gstin: "" }, orderId: "", orderNo: "", issueDate: "2026-09-26", taxMode: "non_gst", taxTreatment: "intra_state", lines: [{ id: "line", description: "Vest", quantity: 2, unit: "pc", unitRate: 125, taxRate: 0 }], notes: "", status: "issued" });
const payment = (id, amount) => ({ id, invoiceId: "invoice-test-001", amount, date: "2026-09-26", mode: "UPI", reference: "test", notes: "" });

function auditRuntime() {
  const sqlite=new DatabaseSync(":memory:");
  for(const file of fs.readdirSync('migrations').sort())sqlite.exec(fs.readFileSync(`migrations/${file}`,'utf8'));
  let race,permissions,failNextLedgerRead=false;
  const db={withSession(){return this;},prepare(sql){const stmt=sqlite.prepare(sql);let args=[];return {bind(...v){args=v;return this;},async first(){return stmt.get(...args)||null;},async all(){if(failNextLedgerRead&&sql.includes('row_kind')){failNextLedgerRead=false;throw Error('Response read interrupted after commit');}return {results:stmt.all(...args)};},async run(){if(race&&/^(INSERT INTO seiko_billing_payments|UPDATE seiko_billing_payments)/.test(sql)){const act=race;race=null;act();}return {meta:{changes:Number(stmt.run(...args).changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const route=load('../app/api/erp/billing/route.ts',{'cloudflare:workers':{env:{DB:db}},'../../../lib/seiko-billing':model,'../../../lib/server-erp-auth':{authenticateActor:async()=>({userId:'owner',email:'owner'}),authorizePermission:async(_a,_b,p)=>!permissions||permissions.includes(p)?{role:'owner'}:null}});
  const call=body=>route.POST(new Request('https://test.invalid/api/erp/billing',{method:'POST',body:JSON.stringify(body)}));
  const order={details:{orderNo:'ORDER-AUDIT',clientName:'Audit School',contactNumber:'9999999999'}};
  sqlite.prepare("INSERT INTO erp_orders(id,business_id,order_no,status,document_json,version,created_at,created_by_user_id,created_by_email,updated_at,updated_by_user_id,updated_by_email) VALUES('audit-order','seiko','ORDER-AUDIT','Active',?,1,'now','owner','owner','now','owner','owner')").run(JSON.stringify(order));
  const insertAdvance=(id,amount)=>sqlite.prepare('INSERT INTO seiko_billing_payments(id,invoice_id,amount_paise,data,created_by) VALUES(?,?,?,?,?)').run(id,'',Math.round(amount*100),JSON.stringify({...payment(id,amount),invoiceId:'',orderId:'audit-order',receiptNumber:id,createdAt:'now'}),'owner');
  return {sqlite,call,insertAdvance,setRace:action=>race=action,setPermissions:value=>permissions=value,failLedgerRead:()=>failNextLedgerRead=true};
}

test('a response failure after committing money retries the same reference without collecting twice',async()=>{
 const r=auditRuntime();try{
  await r.call({operation:'create',document:invoice()});
  const request={operation:'payment',payment:payment('interrupted-response',50)};
  r.setRace(()=>r.failLedgerRead());const interrupted=await r.call(request);assert.equal(interrupted.status,503);assert.equal((await interrupted.json()).ok,false);
  assert.equal(r.sqlite.prepare('SELECT count(*) n FROM seiko_billing_payments').get().n,1);
  const retry=await r.call(request);assert.equal(retry.status,200);const result=await retry.json();assert.equal(result.payments.length,1);assert.equal(model.invoiceOutstanding(result.documents[0],result.payments),200);
 }finally{r.sqlite.close();}
});

test('document retries are idempotent only for the same submitted document',async()=>{
 const r=auditRuntime();try{
  const request={operation:'create',document:invoice()};
  assert.equal((await r.call(request)).status,200);assert.equal((await r.call(request)).status,200);
  assert.equal((await r.call({...request,document:{...invoice(),lines:[{...invoice().lines[0],unitRate:999}]}})).status,409);
  assert.equal(r.sqlite.prepare('SELECT count(*) n FROM seiko_billing_documents').get().n,1);
  assert.equal(r.sqlite.prepare('SELECT total_paise FROM seiko_billing_documents').get().total_paise,25000);
  assert.equal((await r.call(null)).status,400);
 }finally{r.sqlite.close();}
});

test('an already-saved document retry survives a later client-master archive',async()=>{
 const r=auditRuntime();try{
  const client={id:'client-retry',type:'institutional',name:'Frozen Client',phone:'9999999999',contactPerson:'Office',email:'',billingAddress:'',gstin:''};
  r.sqlite.prepare('INSERT INTO seiko_clients(id,name_key,phone_key,email_key,archived,data,created_by,updated_by) VALUES(?,?,?,?,0,?,?,?)').run(client.id,'frozen','9999999999','',JSON.stringify(client),'owner','owner');
  const request={operation:'create',document:{...invoice(),clientId:client.id}};assert.equal((await r.call(request)).status,200);
  r.sqlite.prepare('UPDATE seiko_clients SET archived=1 WHERE id=?').run(client.id);
  const repeated=await r.call(request);assert.equal(repeated.status,200);assert.equal((await repeated.json()).documents[0].clientName,'Frozen Client');
  assert.equal(r.sqlite.prepare('SELECT count(*) n FROM seiko_billing_documents').get().n,1);
 }finally{r.sqlite.close();}
});

test('quotation and challan permissions do not grant invoice or payment management',async()=>{
 const r=auditRuntime();try{
  r.setPermissions(['financials.view','billing.quotations.manage']);
  let result=await r.call({operation:'create',document:{...invoice('quotation-audit'),kind:'quotation'}});assert.equal(result.status,200);
  const quotation=(await result.json()).documents[0];
  assert.equal((await r.call({operation:'amend',document:{...quotation,clientName:'Revised Quote'}})).status,200);
  assert.equal((await r.call({operation:'create',document:invoice()})).status,403);
  assert.equal((await r.call({operation:'payment',payment:payment('forbidden-payment',50)})).status,403);
  assert.equal((await r.call({operation:'create',document:{...invoice('challan-audit'),kind:'delivery_challan'}})).status,403);
  r.setPermissions(['financials.view','billing.delivery_challans.manage']);
  assert.equal((await r.call({operation:'create',document:{...invoice('challan-audit'),kind:'delivery_challan'}})).status,200);
  assert.equal((await r.call({operation:'amend',document:quotation})).status,403);
 }finally{r.sqlite.close();}
});

test('direct invoice collection respects advances and rejects changed retry details',async()=>{
  const r=auditRuntime();try{
    assert.equal((await r.call({operation:'create',document:{...invoice(),orderId:'audit-order'}})).status,200);
    r.insertAdvance('advance-audit',200);
    assert.equal((await r.call({operation:'payment',payment:payment('direct-audit',51)})).status,409);
    assert.equal((await r.call({operation:'payment',payment:payment('direct-audit',50)})).status,200);
    assert.equal((await r.call({operation:'payment',payment:payment('direct-audit',50)})).status,200);
    assert.equal((await r.call({operation:'payment',payment:payment('direct-audit',49)})).status,409);
    const result=await (await r.call({operation:'list'})).json();
    assert.equal(result.payments.length,2);assert.equal(model.paymentsForInvoice(result.payments,invoice().id),250);
    assert.equal(result.payments.reduce((n,p)=>n+model.unappliedOrderPayment(p),0),0);
    assert.equal(result.payments.find(p=>p.id==='direct-audit').clientName,'Test Client');
  }finally{r.sqlite.close();}
});

test('an advance arriving during direct collection rejects the stale write',async()=>{
  const r=auditRuntime();try{
    await r.call({operation:'create',document:{...invoice(),orderId:'audit-order'}});
    r.setRace(()=>r.insertAdvance('racing-advance',200));
    assert.equal((await r.call({operation:'payment',payment:payment('racing-direct',100)})).status,409);
    assert.equal(r.sqlite.prepare("SELECT count(*) n FROM seiko_billing_payments WHERE id='racing-direct'").get().n,0);
  }finally{r.sqlite.close();}
});

test('an order cancelled during advance collection cannot receive the stale payment',async()=>{
 const r=auditRuntime();try{
  r.setRace(()=>r.sqlite.prepare("UPDATE erp_orders SET status='Cancelled' WHERE id='audit-order'").run());
  assert.equal((await r.call({operation:'payment',payment:{...payment('cancelled-order-pay',100),invoiceId:'',orderId:'audit-order'}})).status,409);
  assert.equal(r.sqlite.prepare('SELECT count(*) n FROM seiko_billing_payments').get().n,0);
 }finally{r.sqlite.close();}
});

test('receipt increases cannot consume money already allocated from an advance',async()=>{
  const r=auditRuntime();try{
    await r.call({operation:'create',document:{...invoice(),orderId:'audit-order'}});
    let result=await (await r.call({operation:'payment',payment:payment('amend-audit',50)})).json();
    const receipt=result.payments.find(p=>p.id==='amend-audit');r.insertAdvance('later-advance',200);
    assert.equal((await r.call({operation:'amend_payment',payment:{...receipt,amount:60}})).status,409);
    assert.equal(r.sqlite.prepare("SELECT amount_paise FROM seiko_billing_payments WHERE id='amend-audit'").get().amount_paise,5000);
  }finally{r.sqlite.close();}
});

test('invoice and receipt numbers survive changing their dates across years',async()=>{
  const r=auditRuntime();try{
    let result=await (await r.call({operation:'create',document:invoice()})).json();const doc=result.documents[0];
    result=await (await r.call({operation:'amend',document:{...doc,issueDate:'2025-09-26'}})).json();
    assert.equal(result.documents[0].number,doc.number);
    result=await (await r.call({operation:'payment',payment:payment('year-receipt',50)})).json();const receipt=result.payments[0];
    result=await (await r.call({operation:'amend_payment',payment:{...receipt,date:'2025-09-26'}})).json();
    assert.equal(result.payments[0].receiptNumber,receipt.receiptNumber);
  }finally{r.sqlite.close();}
});

test('an invoice amendment cannot move its issue date after a directly linked receipt',async()=>{
 const r=auditRuntime();try{
  await r.call({operation:'create',document:invoice()});
  const result=await (await r.call({operation:'payment',payment:payment('dated-receipt',50)})).json();
  assert.equal((await r.call({operation:'amend',document:{...result.documents[0],issueDate:'2026-10-01'}})).status,409);
  assert.equal(JSON.parse(r.sqlite.prepare('SELECT data FROM seiko_billing_documents').get().data).issueDate,'2026-09-26');
 }finally{r.sqlite.close();}
});

test('money words carry rounded paise and invalid overflow cannot be invoiced',()=>{
  assert.equal(model.amountInWords(99.999),'Indian Rupees One Hundred Only');
  assert.match(model.validateBillingDocument({...invoice(),lines:[{...invoice().lines[0],quantity:1e308,unitRate:1e308}]}),/too large/);
  assert.equal(model.invoiceOutstanding({...invoice(),status:'cancelled'},[]),0);
  assert.equal(model.invoiceOutstanding({...invoice(),deletedAt:'now'},[]),0);
});

test('advance allocations conserve every paise and follow issue date even when entered out of sequence',()=>{
  const docs=[{...invoice('newer'),orderId:'order',number:'INV-02',issueDate:'2026-02-01',createdAt:'2026-01-01'},{...invoice('older'),orderId:'order',number:'INV-01',issueDate:'2026-01-01',createdAt:'2026-02-01'}];
  for(let paise=1;paise<=60000;paise++){
    const payment={id:'advance',invoiceId:'',orderId:'order',amount:paise/100,createdAt:'now',receiptNumber:'RCP'};
    const allocated=model.allocateOrderPayments(docs,[payment]);
    const applied=docs.reduce((n,d)=>n+model.paymentsForInvoice(allocated,d.id),0);
    assert.equal(Math.round((applied+model.unappliedOrderPayment(allocated[0]))*100),paise);
    assert.equal(model.paymentsForInvoice(allocated,'older'),Math.min(paise,25000)/100);
    assert.ok(docs.every(d=>model.paymentsForInvoice(allocated,d.id)<=250));
  }
});

test('unused advances refund through a numbered immutable receipt and never change the original payment',async()=>{
 const r=auditRuntime();try{
  await r.call({operation:'create',document:{...invoice(),orderId:'audit-order'}});
  let result=await (await r.call({operation:'payment',payment:{...payment('refund-source',300),invoiceId:'',orderId:'audit-order'}})).json();
  const source=result.payments.find(p=>p.id==='refund-source'),original=r.sqlite.prepare('SELECT data FROM seiko_billing_payments WHERE id=?').get(source.id).data;
  assert.equal(model.refundablePaymentAmount(source,result.documents,result.payments),50);
  const request={operation:'refund',payment:{...payment('refund-audit',20),refundOf:source.id,notes:'Unused advance returned'}};
  result=await (await r.call(request)).json();const refund=result.payments.find(p=>p.id==='refund-audit');
  assert.match(refund.receiptNumber,/^RFD-2026-/);assert.equal(refund.amount,-20);assert.equal(refund.refundReceiptNumber,source.receiptNumber);assert.equal(refund.refundedBy,'owner');
  assert.equal(r.sqlite.prepare('SELECT data FROM seiko_billing_payments WHERE id=?').get(source.id).data,original);
  assert.equal(model.invoiceOutstanding(result.documents[0],result.payments),0);
  const current=result.payments.find(p=>p.id===source.id);assert.equal(model.unappliedOrderPayment(current),30);
  assert.equal((await r.call(request)).status,200);
  assert.equal((await r.call({...request,payment:{...request.payment,amount:21}})).status,409);
  assert.equal((await r.call({...request,payment:{...request.payment,id:'too-large-refund',amount:31}})).status,409);
  assert.equal((await r.call({operation:'amend_payment',payment:{...refund,amount:10}})).status,409);
  assert.equal((await r.call({operation:'amend_payment',payment:{...source,amount:200}})).status,409);
  const html=printing.billingPrintHtml(model.orderReceiptDocument(refund),result.payments,'customer',refund);
  assert.match(html,/Refund Receipt/);assert.match(html,/20.00 refunded/);assert.match(html,/Unused advance returned/);assert.match(html,new RegExp(source.receiptNumber));assert.doesNotMatch(html,/20.00 received|Applied to Invoices/);
 }finally{r.sqlite.close();}
});

test('paid invoice refunds require a credit balance and keep net collections equal to the credited invoice',async()=>{
 const r=auditRuntime();try{
  await r.call({operation:'create',document:invoice()});
  let result=await (await r.call({operation:'payment',payment:payment('credit-source',250)})).json();const source=result.payments[0];
  const request={operation:'refund',payment:{...payment('credit-refund',100),refundOf:source.id,notes:'Approved cancellation credit'}};
  assert.equal((await r.call(request)).status,409);
  const doc=result.documents[0];doc.credits=[{id:'credit',date:'2026-09-26',reason:'Return approved',subtotal:100,tax:0,amount:100,units:[],by:'owner'}];
  r.sqlite.prepare('UPDATE seiko_billing_documents SET data=?,total_paise=? WHERE id=?').run(JSON.stringify(doc),15000,doc.id);
  assert.equal((await r.call({...request,payment:{...request.payment,date:'2026-09-25'}})).status,409);
  result=await (await r.call(request)).json();assert.equal(model.paymentsForInvoice(result.payments,doc.id),150);
  assert.equal(model.invoiceOutstanding(doc,result.payments),0);assert.equal(result.payments.reduce((n,p)=>n+p.amount,0),150);
  assert.equal(model.refundablePaymentAmount(source,result.documents,result.payments),0);
  assert.equal((await r.call({...request,payment:{...request.payment,id:'extra-refund',amount:1}})).status,409);
 }finally{r.sqlite.close();}
});

test('concurrent refunds cannot consume the same credit twice and require refund permission',async()=>{
 const r=auditRuntime();try{
  let result=await (await r.call({operation:'payment',payment:{...payment('cash-source',100),invoiceId:'',orderId:'',clientName:'Payer'}})).json();const source=result.payments[0];
  const request=id=>({operation:'refund',payment:{...payment(id,80),refundOf:source.id,notes:'Returned payment'}});
  const outcomes=await Promise.all([r.call(request('concurrent-refund-a')),r.call(request('concurrent-refund-b'))]);assert.equal(outcomes.filter(r=>r.status===200).length,1);
  result=await (await r.call({operation:'list'})).json();assert.equal(result.payments.reduce((n,p)=>n+p.amount,0),20);
  assert.equal(model.refundablePaymentAmount(source,result.documents,result.payments),20);
  r.setPermissions(['financials.view','billing.invoices.manage']);
  assert.equal((await r.call({...request('unpermitted-refund'),payment:{...request('unpermitted-refund').payment,amount:20}})).status,403);
 }finally{r.sqlite.close();}
});

test('inconsistent stored invoice or receipt paise blocks further financial writes',async()=>{
 const r=auditRuntime();try{
  await r.call({operation:'create',document:invoice()});
  r.sqlite.prepare('UPDATE seiko_billing_documents SET total_paise=1').run();
  const refused=await r.call({operation:'payment',payment:payment('blocked-by-checksum',10)});assert.equal(refused.status,409);assert.match((await refused.json()).message,/integrity check/);
  assert.equal(r.sqlite.prepare('SELECT count(*) n FROM seiko_billing_payments').get().n,0);
  r.sqlite.prepare('UPDATE seiko_billing_documents SET total_paise=25000').run();
  await r.call({operation:'payment',payment:payment('verified-receipt',10)});
  r.sqlite.prepare('UPDATE seiko_billing_payments SET amount_paise=1').run();
  assert.equal((await r.call({operation:'payment',payment:payment('blocked-again',10)})).status,409);
  assert.equal(r.sqlite.prepare('SELECT count(*) n FROM seiko_billing_payments').get().n,1);
 }finally{r.sqlite.close();}
});

test('future orders cannot bypass agreed pricing through an ordinary manual invoice',async()=>{
 const r=auditRuntime();try{
  r.sqlite.prepare("UPDATE erp_orders SET document_json=json_set(document_json,'$.commerce',json(?)) WHERE id='audit-order'").run(JSON.stringify({quantityBasis:'ordered',rules:[],people:{},deliveries:[],issues:[]}));
  const result=await r.call({operation:'create',document:{...invoice(),orderId:'audit-order'}});assert.equal(result.status,409);assert.match((await result.json()).message,/agreed order pricing/);
  assert.equal(r.sqlite.prepare('SELECT count(*) n FROM seiko_billing_documents').get().n,0);
 }finally{r.sqlite.close();}
});

test('future promises do not clear outstanding invoices or become received/refunded money',async()=>{
 const r=auditRuntime();try{
  let result=await (await r.call({operation:'create',document:{...invoice(),dueOnReceipt:false,dueDate:'2099-12-31'}})).json();
  assert.equal(model.invoiceOutstanding(result.documents[0],result.payments),250);
  const future=await r.call({operation:'payment',payment:{...payment('future-promise',250),date:'2099-01-01'}});assert.equal(future.status,400);assert.match((await future.json()).message,/remain pending/);
  assert.equal(r.sqlite.prepare('SELECT count(*) n FROM seiko_billing_payments').get().n,0);
  result=await (await r.call({operation:'payment',payment:payment('actual-part-payment',50)})).json();assert.equal(model.invoiceOutstanding(result.documents[0],result.payments),200);
  assert.equal((await r.call({operation:'amend_payment',payment:{...result.payments[0],date:'2099-01-01'}})).status,400);
 }finally{r.sqlite.close();}
});

test('ledger integrity rejects orphan receipts, excess refunds and mismatched invoice snapshots',()=>{
 const doc={...invoice(),number:'INV-1'},source={...payment('original',250),orderId:'',receiptNumber:'RCP-1'};
 assert.equal(model.billingIntegrityIssues([doc],[source]).length,0);
 assert.ok(model.billingIntegrityIssues([],[source]).some(e=>/link/.test(e)));
 assert.ok(model.billingIntegrityIssues([doc],[source,{...source,id:'refund',refundOf:source.id,amount:-251}]).some(e=>/exceed/.test(e)));
 const damaged={...doc,pricingSnapshot:{units:[{amount:1}],basis:'eligible',orderUpdatedAt:'now'}};
 assert.ok(model.billingIntegrityIssues([damaged],[source]).some(e=>/snapshot/.test(e)));
 const free={...doc,lines:[{...doc.lines[0],unitRate:0}]};assert.match(model.validateBillingDocument(free),/approval reason/);
 free.lines[0].zeroPriceReason='Approved demonstration sample';assert.equal(model.validateBillingDocument(free),'');
});

test("document notes print only when enabled and nonblank, with no automatic explanatory footer", () => {
  const bill={...invoice(),notes:"Keep <this> instruction",showNotes:false};
  assert.doesNotMatch(printing.billingPrintHtml(bill,[],"customer"),/<b>Notes<\/b>|Keep &lt;this&gt;/);
  const enabled=printing.billingPrintHtml({...bill,showNotes:true},[],"customer");
  assert.match(enabled,/<b>Notes<\/b><p>Keep &lt;this&gt; instruction<\/p>/);
  assert.doesNotMatch(printing.billingPrintHtml({...bill,showNotes:true,notes:"  "},[],"customer"),/<b>Notes<\/b>/);
  const receipt={...payment("notes",50),notes:"Receipt-specific note",showNotes:true};
  const html=printing.billingPrintHtml({...bill,showNotes:true},[receipt],"customer",receipt);
  assert.ok(html.includes("Receipt-specific note"));
  assert.doesNotMatch(html,/Keep &lt;this&gt;|Payment acknowledgement only/);
  assert.doesNotMatch(printing.billingPrintHtml(bill,[{...receipt,showNotes:false}],"customer",{...receipt,showNotes:false}),/<b>Notes<\/b>|Receipt-specific note/);
  assert.equal(bill.notes,"Keep <this> instruction");
});

test("printed status labels are capitalized without changing billing codes or entered text", () => {
  const bill = { ...invoice(), clientName: "aBc School", notes: "keep this exact wording" };
  for (const [payments, code, label] of [[[], "issued", "Issued"], [[payment("part", 50)], "part_paid", "Part Paid"], [[payment("full", 250)], "paid", "Paid"]]) {
    const before = JSON.stringify({ bill, payments });
    const html = printing.billingPrintHtml(bill, payments, "customer");
    assert.ok(html.includes(`Payment Status: ${label}`));
    assert.equal(model.billingStatus(bill, payments), code);
    assert.ok(html.includes("aBc School"));
    assert.ok(html.includes("keep this exact wording"));
    assert.equal(JSON.stringify({ bill, payments }), before);
  }
});

test("amendments cannot overwrite a concurrent revision or undercut a concurrent payment", async () => {
  for (const race of ["revision", "payment"]) {
    const sqlite = new DatabaseSync(':memory:');
    try {
      for (const file of fs.readdirSync('migrations').sort()) sqlite.exec(fs.readFileSync(`migrations/${file}`, 'utf8'));
      let raceArmed = false;
      const db = { withSession() { return this; }, prepare(sql) {
        const statement = sqlite.prepare(sql); let args = [];
        return { bind(...values) { args = values; return this; }, async run() {
          if (raceArmed && (sql).toLowerCase().startsWith("update seiko_billing_documents set")) {
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
  assert.match(printing.billingPrintHtml(bill, payments, "customer", payments[0]), /Against invoice <b>INV-2026-00001/i);
});

test("delivery documents support non-GST quantity-only, valued and statutory GST modes", () => {
  const bill = { ...invoice(), number: "DC-2026-00001", kind: "delivery_challan", supplier: { ...invoice().supplier, bank: "Bank A 123", upi: "seiko@upi", paymentQr: "data:image/png;base64,AAAA", showBank: true, showUpi: true, showQr: true } };
  const challan = printing.billingPrintHtml(bill, [], "customer");
  assert.match(challan, /Delivery Challan/i); assert.match(challan, /<th>Qty<\/th><th>Unit<\/th>/);
  assert.doesNotMatch(challan, /<th>Rate<\/th>|<th>Amount<\/th>|Sub Total|Balance Due|Bank A 123|seiko@upi|₹/);
  const invoiceHtml = printing.billingPrintHtml({ ...bill, kind: "invoice", number: "INV-2026-00002" }, [], "customer");
  assert.match(invoiceHtml, /Bank A 123/); assert.match(invoiceHtml, /seiko@upi/); assert.match(invoiceHtml, /Scan to pay/); assert.match(invoiceHtml, /#173c5e/);
  assert.match(challan, /Recipient Copy/); assert.match(printing.billingPrintHtml(bill, [], "supplier"), /Office Copy/);
  assert.match(printing.billingPrintHtml({ ...bill, showMonetaryValues: true }, [], "customer"), /Delivery Challan/i);
  const gst = { ...bill, taxMode: "gst", placeOfSupply: "Maharashtra 27", supplier: { ...bill.supplier, address: "Mumbai", gstin: "27ABCDE1234F1Z5" }, clientAddress: "Pune", lines: bill.lines.map(line => ({ ...line, hsnSac: "6203", taxRate: 5 })) };
  const gstHtml = printing.billingPrintHtml(gst, [], "both");
  assert.match(gstHtml, /GST Delivery Challan/i); assert.match(gstHtml, /Original for Consignee/); assert.match(gstHtml, /Duplicate for Transporter/); assert.match(gstHtml, /Triplicate for Consignor/); assert.match(gstHtml, /HSN\/SAC/); assert.match(gstHtml, /Place of supply/);
});

test("Indian money, amount words and professional receipt wording are printed", () => {
  assert.match(model.formatInr(213000), /2,13,000\.00/); assert.equal(model.amountInWords(213000), "Indian Rupees Two Lakh Thirteen Thousand Only");
  const receipt = { ...payment("payment-01", 213000), invoiceId: "", orderId: "order-1", receiptNumber: "RCP-2026-00001", allocations: [] };
  const html = printing.billingPrintHtml(model.orderReceiptDocument(receipt), [], "customer", receipt);
  assert.match(html, /Advance balance available/i); assert.doesNotMatch(html, /Payment acknowledgement only; this is not a tax invoice/); assert.doesNotMatch(html, /Unapplied order advance/);
});

test("database persists invoices and idempotent payments, rejecting overpayment and unauthorized writes", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const db = { withSession() { return this; }, prepare(sql) {
    let args = []; const statement = sqlite.prepare(sql);
    return { bind(...values) { args = values; return this; }, async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; }, async first() { return statement.get(...args) || null; }, async all() { return { results: statement.all(...args) }; } };
  } };
  let authenticated = true, manage = true;
  const route = load("../app/api/erp/billing/route.ts", { "cloudflare:workers": { env: { DB: db } }, "../../../lib/seiko-billing": model, "../../../lib/server-erp-auth": { authenticateActor: async () => authenticated ? { email: "test@example.invalid" } : null, authorizePermission: async (_, __, permission) => (permission === "financials.view" || manage) ? { role: "owner" } : null } });
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
  const route = load("../app/api/erp/billing/route.ts", { "cloudflare:workers": { env: { DB: db } }, "../../../lib/seiko-billing": model, "../../../lib/server-erp-auth": { authenticateActor: async () => ({ email: "test@example.invalid" }), authorizePermission: async (_, __, permission) => (permission === "financials.view" || manage) ? { role: "owner" } : null } });
  const call = body => route.POST(new Request("https://test.invalid/api/erp/billing", { method: "POST", body: JSON.stringify(body) }));
  const advance = { ...payment("order-payment-01", 300), invoiceId: "", orderId: "order-advance", clientName: "Spoofed name", notes:"Retained hidden receipt note",showNotes:false, allocations: [{ invoiceId: "wrong", amount: 999 }] };
  try {
    assert.equal((await call({ operation: "payment", payment: { ...advance, orderId: "missing" } })).status, 404);
    let result = await (await call({ operation: "payment", payment: advance })).json();
    assert.equal(result.documents.length, 0);
    assert.equal(result.payments[0].clientName, "Advance Client");assert.equal(result.payments[0].showNotes,false);assert.equal(result.payments[0].notes,advance.notes);
    assert.equal(result.payments[0].receiptNumber, "RCP-2026-00001");
    assert.equal(model.unappliedOrderPayment(result.payments[0]), 300);
    const html = printing.billingPrintHtml(model.orderReceiptDocument(result.payments[0]), result.payments, "customer", result.payments[0]);
    assert.doesNotMatch(html,/Retained hidden receipt note/);assert.match(html, /Against order/i); assert.match(html, /ORD-01/); assert.doesNotMatch(html, /Invoice total|Against invoice/i);
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
  const route = load("../app/api/erp/clients/route.ts", { "cloudflare:workers": { env: { DB: db } }, "../../../lib/seiko-clients": clients, "../../../lib/server-erp-auth": { authenticateActor: async () => authenticated ? { email: "test@example.invalid" } : null, authorizePermission: async (_, __, permission) => (permission === "financials.view" || manage) ? { role: "owner" } : null } });
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
  const home = fs.readFileSync(new URL("../app/seiko-phase1.tsx", import.meta.url), "utf8") + fs.readFileSync(new URL("../app/lib/home-preferences.ts", import.meta.url), "utf8");
  const phase2 = fs.readFileSync(new URL("../app/seiko-phase2.tsx", import.meta.url), "utf8");
  const polish = fs.readFileSync(new URL("../app/seiko-billing-polish.css", import.meta.url), "utf8");
  for (const label of ["+ New order", "Record payment", "Create invoice", "Delivery challan", "Quotation", "Packing labels"]) assert.match(home, new RegExp(label.replace("+", "\\+"), "i"));
  assert.match(home, /seiko:open-billing/i); assert.match(phase2, /document\.body\.style\.overflow = "hidden"/); assert.match(polish, /\.seikoPhase2Surface \{ inset: 0 !important/);
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

test('order-filtered billing list returns only its documents and payments and rejects invalid filters', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = { withSession() { return this; }, prepare(sql) { const stmt=sqlite.prepare(sql); let args=[]; return {bind(...values){args=values;return this;},async run(){return {meta:{changes:Number(stmt.run(...args).changes)}};},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};}};}};
    const api=load('../app/api/erp/billing/route.ts',{'cloudflare:workers':{env:{DB:db}},'../../../lib/seiko-billing':model,'../../../lib/server-erp-auth':{authenticateActor:async()=>({email:'owner'}),authorizePermission:async()=>true}});
    const call=body=>api.POST(new Request('https://test.invalid/api/erp/billing',{method:'POST',body:JSON.stringify(body)}));
    await call({operation:'list'});
    for (const id of ['one','two']) {
      const doc={...invoice(`invoice-${id}`),orderId:id};
      sqlite.prepare('INSERT INTO seiko_billing_documents(id,data,total_paise,created_by) VALUES(?,?,?,?)').run(doc.id,JSON.stringify(doc),25000,'owner');
      const pay={...payment(`payment-${id}`,50),invoiceId:doc.id,orderId:id};
      sqlite.prepare('INSERT INTO seiko_billing_payments(id,invoice_id,amount_paise,data,created_by) VALUES(?,?,?,?,?)').run(pay.id,doc.id,5000,JSON.stringify(pay),'owner');
    }
    const result=await (await call({operation:'list',orderId:'one'})).json();
    assert.equal(result.documents.length,1); assert.equal(result.documents[0].orderId,'one');
    assert.equal(result.payments.length,1); assert.equal(result.payments[0].orderId,'one');
    assert.equal((await (await call({operation:'list',orderId:"' OR 1=1 --"})).json()).documents.length,0);
    assert.equal((await call({operation:'list',orderId:12})).status,400);
  } finally {sqlite.close();}
});

test("customer prints omit internal revisions and use clean payment separators", () => {
  const doc = {...invoice(), revision: 3};
  const html = printing.billingPrintHtml(doc, [{...payment("receipt-test", 50), receiptNumber:"RCP-TEST"}], "customer");
  assert.doesNotMatch(html, /Amended|Revision 3|Â/);
  assert.match(html, /Payments received/i);assert.doesNotMatch(html, /&middot; RCP-TEST &middot; UPI/);
  assert.match(html, /class="ackLine">Name:.*<\/span><span class="ackLine">Date:/);
  assert.equal(doc.revision, 3);
});

test('invoice payment summary combines same-day applied amounts without changing receipts or other invoices',()=>{const doc=invoice(),payments=[{...payment('cash',50),mode:'Cash',receiptNumber:'RCP-CASH'},{...payment('upi',70),mode:'UPI',receiptNumber:'RCP-UPI'},{...payment('later',10),date:'2026-09-27',receiptNumber:'RCP-LATER'},{...payment('other',999),invoiceId:'another-invoice',receiptNumber:'RCP-OTHER'}],before=JSON.stringify(payments),html=printing.billingPrintHtml(doc,payments,'customer');const history=html.match(/<section class="history"><b>Payments received<\/b>(.*?)<\/section>/si)[1];assert.equal((history.match(/<div>/g)||[]).length,2);assert.match(history,/120.00/);assert.match(history,/10.00/);assert.doesNotMatch(history,/999.00|RCP-/);assert.equal(JSON.stringify(payments),before);const receipt=printing.billingPrintHtml(doc,payments,'customer',payments[0]);assert.match(receipt,/RCP-CASH/);assert.doesNotMatch(receipt,/<b>Payments received<\/b>/i);});
