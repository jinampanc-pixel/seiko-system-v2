import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';

function runtime(){
 const sqlite=new DatabaseSync(':memory:');for(const file of fs.readdirSync('migrations').sort())sqlite.exec(fs.readFileSync('migrations/'+file,'utf8'));
 const source={orderId:'order',details:{orderNo:'ORDER-1'},records:[]};
 sqlite.prepare("INSERT INTO erp_orders VALUES('order','seiko','ORDER-1','Active',0,?,3,'2026-10-30T10:00:00Z','owner','owner@example.invalid','2026-10-30T10:00:00Z','owner','owner@example.invalid')").run(JSON.stringify(source));
 let allowed=true,signedIn=true;
 const db={withSession(){return this;},prepare(sql){const s=sqlite.prepare(sql);let args=[];return {bind(...v){args=v;return this;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return s.run(...args);}};}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/erp/activity/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Response,URL,TextDecoder,require:n=>n==='cloudflare:workers'?{env:{DB:db}}:{authenticateActor:async()=>signedIn?{userId:'real-user',email:'real@example.invalid',displayName:'Real user'}:null,authorizePermission:async()=>allowed}});
 const call=async(body,headers={})=>{const r=await exports.POST(new Request('https://erp.invalid/api/erp/activity',{method:'POST',headers,body:JSON.stringify(body)}));return {status:r.status,...await r.json()};};
 return {sqlite,api:exports,call,allow:v=>allowed=v,signIn:v=>signedIn=v};
}
test('output activity uses authenticated actor and source version, is immutable and retry safe',async()=>{const r=runtime();try{
 const event={businessId:'seiko',kind:'order',id:'order',action:'print-requested',eventId:crypto.randomUUID(),digest:'a'.repeat(64),actor:'forged@example.invalid',version:999};
 assert.equal((await r.call(event)).status,200);assert.equal((await r.call(event)).status,200);
 const rows=r.sqlite.prepare("SELECT * FROM erp_audit_events WHERE entity_type='output-order'").all();assert.equal(rows.length,1);assert.equal(rows[0].actor_email,'real@example.invalid');assert.equal(rows[0].version,3);assert.equal(JSON.parse(rows[0].snapshot_json).reference,'ORDER-1');
 assert.throws(()=>r.sqlite.prepare('DELETE FROM erp_audit_events WHERE id=?').run(event.eventId),/immutable/);
 assert.throws(()=>r.sqlite.prepare("UPDATE erp_audit_events SET action='completed' WHERE id=?").run(event.eventId),/immutable/);
 const response=await r.api.GET(new Request('https://erp.invalid/api/erp/activity?businessId=seiko'));const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.events.filter(e=>e.action==='print-requested').length,1);assert.ok(result.events.some(e=>e.action==='created'));assert.ok(result.events.every(e=>!('snapshot_json' in e)));
 }finally{r.sqlite.close();}});
test('output activity rejects foreign origins, missing records, unsupported events and denied users',async()=>{const r=runtime();try{
 const event={businessId:'seiko',kind:'production',id:'missing',action:'pdf-prepared',eventId:crypto.randomUUID()};assert.equal((await r.call(event)).status,409);assert.equal((await r.call({...event,action:'physically-printed'})).status,400);assert.equal((await r.call(event,{origin:'https://other.invalid'})).status,403);r.allow(false);assert.equal((await r.call(event)).status,403);assert.equal((await r.api.GET(new Request('https://erp.invalid/api/erp/activity'))).status,403);r.signIn(false);assert.equal((await r.call(event)).status,401);
 }finally{r.sqlite.close();}});
