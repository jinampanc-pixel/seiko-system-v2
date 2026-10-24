import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function runtime(){let current,failed=false,calls=0,accepted;const exports={};const code=ts.transpileModule(fs.readFileSync('app/lib/order-sheet-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports,require:n=>n==='./order-domain'?{normalizeProductMeasurements:o=>o}:{requestOrders:async()=>({ok:true,data:{orders:[{order:current}]}}),acceptSharedOrder:(_b,e)=>accepted=e.order},fetch:async()=>{calls++;return Response.json(failed?{ok:false,message:'Google unavailable'}:{ok:true},{status:failed?503:200});},Response});return {verify:exports.ensureOrderSheetFreshForOutput,set:o=>current=o,fail:()=>failed=true,calls:()=>calls,accepted:()=>accepted};}
const order=()=>({orderId:'order',fields:[],products:[],measurements:[],records:[{recordId:'one',personId:'P-1',values:{name:'Student'}}],commerce:{people:{}},googleSheet:{id:'sheet'}});
test('printing needs a successful sheet sync and never prints a stale built selection',async()=>{const r=runtime(),source=order();r.set(structuredClone(source));await r.verify(source);assert.equal(r.calls(),1);const fresh=structuredClone(source);fresh.records[0].values.name='Changed';r.set(fresh);await assert.rejects(r.verify(source),/reopen or rebuild/i);assert.equal(r.accepted().records[0].values.name,'Changed');r.fail();await assert.rejects(r.verify(source),/Google unavailable/);});
test('ordinary app orders retain their existing output workflow',async()=>{const r=runtime(),source=order();delete source.googleSheet;await r.verify(source);assert.equal(r.calls(),0);});
