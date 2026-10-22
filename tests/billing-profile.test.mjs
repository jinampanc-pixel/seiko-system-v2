import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
function load(path,imports={}) {
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>imports[n],Request,Response,URL,TextDecoder,Uint8Array,crypto});return exports;
}
const profiles=load('app/lib/billing-profile.ts');
const model=load('app/lib/seiko-billing.ts');
const print=load('app/lib/seiko-billing-print.ts',{'./seiko-billing':model});
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync('migrations').sort())sql.exec(fs.readFileSync('migrations/'+file,'utf8'));let role='owner',email='owner@example.com';
 const db={withSession(){return this;},async batch(stmts){sql.exec('BEGIN');try{const result=stmts.map(s=>s.runSync());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}},prepare(query){const stmt=sql.prepare(query);let args=[];return {bind(...v){args=v;return this;},runSync(){return {meta:{changes:Number(stmt.run(...args).changes)}};},async run(){return this.runSync();},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};}};}};
 const auth={authenticateActor:async()=>({email,userId:email}),authorizePermission:async()=>({role})};
 const imports={'cloudflare:workers':{env:{DB:db}},'../../../lib/server-erp-auth':auth,'../../../lib/billing-profile':profiles,'../../../lib/seiko-billing':model};
 const api=load('app/api/erp/billing-profile/route.ts',imports), billing=load('app/api/erp/billing/route.ts',imports);
 const call=(body,route=api)=>route.POST(new Request('https://test.invalid/api/erp/billing-profile',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify(body)}));
 return {sql,call,billing,actor:(r,e)=>{role=r;email=e;}};
}
test('profile ownership, delegated access, version conflicts and audit history are enforced server-side',async()=>{
 const f=fixture();try{
  let result=await (await f.call({operation:'get'})).json();assert.equal(result.canManage,true);
  const profile=profiles.emptyBillingProfile();profile.managerEmails=['manager@example.com'];profile.supplier.gstin='24TESTGST';profile.supplier.accountNumber='123456';
  assert.equal((await f.call({operation:'save',profile,version:0})).status,200);
  assert.equal((await f.call({operation:'save',profile,version:0})).status,409);
  f.actor('operations','clerk@example.com');assert.equal((await f.call({operation:'save',profile,version:1})).status,403);
  f.actor('operations','manager@example.com');result=await (await f.call({operation:'get'})).json();assert.equal(result.canManage,true);assert.equal(result.isOwner,false);
  assert.equal((await f.call({operation:'save',profile:{...profile,supplier:{...profile.supplier,gstin:'FORGED'}},version:1})).status,403);
  assert.equal((await f.call({operation:'save',profile:{...profile,managerEmails:['clerk@example.com']},version:1})).status,403);
  assert.equal((await f.call({operation:'save',profile:{...profile,supplier:{...profile.supplier,upi:'merchant@upi'}},version:1})).status,200);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM erp_audit_events WHERE entity_type='billing-profile'").get().n,2);
 }finally{f.sql.close();}
});
test('billing clerks cannot forge payment accounts, GST details or signatory images',async()=>{
 const f=fixture();try{
  const profile=profiles.emptyBillingProfile();profile.signatoryEmails=['clerk@example.com'];profile.supplier.accountNumber='123456';profile.signatories=[{id:'signatory-001',name:'Manager',designation:'Owner',signature:'data:image/png;base64,AAAA'}];
  await f.call({operation:'save',profile,version:0});f.actor('operations','clerk@example.com');
  const document={id:'invoice-profile-001',kind:'invoice',orderId:'',orderNo:'',clientName:'School',clientPhone:'1234567890',issueDate:'2026-10-22',dueOnReceipt:true,taxMode:'non_gst',taxTreatment:'intra_state',lines:[{id:'line',description:'Uniforms',quantity:1,unit:'pc',unitRate:100,taxRate:0}],notes:'',supplier:profile.supplier,signatory:profile.signatories[0]};
  assert.equal((await f.call({operation:'create',document},f.billing)).status,200);
  f.actor('operations','other@example.com');
  assert.equal((await f.call({operation:'create',document:{...document,id:'invoice-denied-sign'}},f.billing)).status,403);
  f.actor('operations','clerk@example.com');
  assert.equal((await f.call({operation:'create',document:{...document,id:'invoice-profile-002',supplier:{...profile.supplier,accountNumber:'ATTACK'}}},f.billing)).status,403);
  assert.equal((await f.call({operation:'create',document:{...document,id:'invoice-profile-003',signatory:{...document.signatory,name:'Forged'}}},f.billing)).status,403);
  await f.call({operation:'create',document:{...document,id:'invoice-profile-004',supplier:{...profile.supplier,showQr:true}}},f.billing);
  const saved=JSON.parse(f.sql.prepare('SELECT data FROM seiko_billing_documents WHERE id=?').get(document.id).data);
  f.actor('owner','owner@example.com');await f.call({operation:'save',version:1,profile:{...profile,supplier:{...profile.supplier,accountNumber:'654321'}}});
  assert.equal(JSON.parse(f.sql.prepare('SELECT data FROM seiko_billing_documents WHERE id=?').get(document.id).data).supplier.accountNumber,saved.supplier.accountNumber);
 }finally{f.sql.close();}
});
test('invoice print uses cream theme, precise payment labels, due date and optional saved signature',()=>{
 const image='data:image/png;base64,AAAA';const d={id:'test-invoice',kind:'invoice',number:'INV-1',clientName:'School',clientContactPerson:'Person <One>',issueDate:'2026-10-22',dueDate:'2026-11-01',taxMode:'non_gst',taxTreatment:'intra_state',lines:[],supplier:{name:'SEIKO Tailors',phone:'1234567890',bank:'',showBank:true,accountName:'SEIKO',accountNumber:'123',ifsc:'BANK001',showUpi:true,upi:'test@upi',showQr:true,paymentQr:image},signatory:{id:'sign-001',name:'Authorised Person',designation:'Owner',signature:image,stamp:image},showSignature:true,showStamp:true,showSigningDate:true,signingDate:'2026-10-22',showTerms:true,terms:'Payment due as stated.'};
 const html=print.billingPrintHtml(d,[],'customer');assert.match(html,/#fbf5ed/);assert.match(html,/Attn: Person &lt;One&gt;/);assert.match(html,/Payment due/);assert.match(html,/01 Nov 2026/);assert.match(html,/For bank transfer/);assert.match(html,/For UPI payment/);assert.match(html,/UPI ID: test@upi/);assert.match(html,/object-fit:contain/);assert.match(html,/Phone: 1234567890/);assert.match(html,/alt="Authorised signature"/);assert.match(html,/Authorised Person/);assert.match(html,/Payment due as stated/);
 const hidden=print.billingPrintHtml({...d,showSignatory:false,showTerms:false},[],'customer');assert.doesNotMatch(hidden,/alt="Authorised signature"|Authorised Person|Payment due as stated/);
 assert.match(print.billingPrintHtml({...d,dueOnReceipt:true},[],'customer'),/Due on receipt/);
 assert.ok(profiles.validateBillingProfile({...profiles.emptyBillingProfile(),supplier:{...profiles.emptyBillingProfile().supplier,paymentQr:'data:image/svg+xml;base64,AAAA'}}));
});

