import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
function load(path,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{assert.ok(imports[n],n);return imports[n];},crypto,Request,Response,URL,TextEncoder,TextDecoder,Uint8Array});return exports;}
const workflow=load('app/lib/order-workflow.ts'),statuses=load('app/lib/order-statuses.ts');
const domain=load('app/lib/order-domain.ts',{'./order-statuses':statuses});
const packing=load('app/lib/packing-label-model.ts',{'./order-domain':domain});
const commerce=load('app/lib/order-commerce.ts',{'./order-domain':domain,'./packing-label-model':packing});
const production=load('app/lib/production-handoffs.ts',{'./order-domain':domain,'./packing-label-model':packing});
function runtime(){
  const sqlite=new DatabaseSync(':memory:');for(const file of fs.readdirSync('migrations').sort())sqlite.exec(fs.readFileSync(`migrations/${file}`,'utf8'));
  const db={withSession(){return this;},prepare(sql){const statement=sqlite.prepare(sql);let values=[];return {bind(...args){values=args;return this;},async first(){return statement.get(...values)||null;},async all(){return {results:statement.all(...values)};},async run(){const result=statement.run(...values);return {...result,meta:{changes:Number(result.changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  let email='owner@example.invalid',permissions=null;
  const auth={authenticateActor:async()=>({userId:email,email}),authorizePermission:async(_a,_b,p)=>!permissions||permissions.includes(p)?{role:'owner'}:null,authorizeBusiness:async()=>({role:'owner'})};
  const common={'cloudflare:workers':{env:{DB:db}},'../../../lib/server-erp-auth':auth,'../../../lib/order-workflow':workflow,'../../../lib/order-statuses':statuses,'../../../lib/order-commerce':commerce};
  const routes={tracking:load('app/api/erp/order-workflow/route.ts',common),orders:load('app/api/erp/orders/route.ts',common),catalog:load('app/api/erp/order-actions/route.ts',common),preferences:load('app/api/erp/preferences/route.ts',common),production:load('app/api/erp/production/route.ts',{...common,'../../../lib/production-handoffs':production})};
  const call=async(route,body)=>{const response=await routes[route].POST(new Request(`https://test.invalid/api/erp/${route}`,{method:'POST',body:JSON.stringify({businessId:'seiko',...body})}));return {status:response.status,...await response.json()};};
  const order={orderId:'workflow-order',status:'Active',archived:false,details:{orderNo:'WORKFLOW-001',clientName:'Synthetic Client'},fields:[],products:[],measurements:[],records:[],revisions:[]};
  return {sqlite,call,order,setActor:value=>email=value,setPermissions:value=>permissions=value};
}

const update=(r,command)=>r.call('tracking',{operation:'update',orderId:r.order.orderId,command});
const raw=r=>r.sqlite.prepare('SELECT * FROM erp_orders WHERE id=?').get(r.order.orderId);
test('optional status, notes and actions never mutate order records, demand or pricing',async()=>{
 const r=runtime();try{
 r.order.products=[{...domain.blankProduct(),id:'shirt',name:'Shirt',quantityMode:'order_total',orderTotal:10}];
 const seeded=await r.call('orders',{operation:'upsert',order:r.order});assert.equal(seeded.status,200);
 const before=JSON.stringify(raw(r)),source={order:seeded.data.order,version:seeded.data.version},demand=JSON.stringify(production.productionDemand([source]));
 for(const value of ['Cancelled','Completed','Production'])assert.equal((await update(r,{kind:'status',id:crypto.randomUUID(),value})).status,200);
 let result=await update(r,{kind:'note',id:'note-1',text:'  Logo tomorrow  ',by:'forged',at:'forged'});assert.equal(result.status,200);assert.equal(result.record.workflow.notes[0].text,'Logo tomorrow');assert.equal(result.record.workflow.notes[0].by,'owner@example.invalid');assert.ok(Date.parse(result.record.workflow.notes[0].at));
 const version=result.record.version;result=await update(r,{kind:'note',id:'note-1',text:'Logo tomorrow'});assert.equal(result.record.version,version);
 assert.equal((await update(r,{kind:'note',id:'note-1',text:'Different text'})).status,400);
 r.setActor('staff@example.invalid');await update(r,{kind:'note',id:'note-2',text:'Second note'});
 result=await update(r,{kind:'action',id:'action-1',typeId:'attach-logo',name:'forged'});assert.equal(result.status,200);assert.equal(result.record.workflow.actions[0].name,'Attach Logo');
 assert.equal(JSON.stringify(raw(r)),before,'ERP order row remains byte-for-byte unchanged');
 assert.equal(JSON.stringify(production.productionDemand([{order:JSON.parse(raw(r).document_json),version:seeded.data.version}])),demand);
 const listed=await r.call('tracking',{operation:'list',orderIds:[r.order.orderId]});assert.equal(listed.records[0].workflow.notes.length,2);assert.equal(listed.records[0].workflow.notes[1].by,'staff@example.invalid');
 r.setPermissions(['orders.view']);assert.equal((await update(r,{kind:'status',id:'no',value:'Active'})).status,403);assert.equal((await r.call('tracking',{operation:'list',orderIds:[r.order.orderId]})).status,200);
 }finally{r.sqlite.close();}
});
test('reusable action names retain history and respect library permissions and version checks',async()=>{
 const r=runtime();try{
 await r.call('orders',{operation:'upsert',order:r.order});let library=await r.call('catalog',{operation:'list'});
 library=await r.call('catalog',{operation:'create',name:'  Approve   sample ',expectedVersion:library.version});assert.equal(library.status,200);const type=library.types.find(t=>t.name==='Approve sample');assert.ok(type);
 const duplicate=await r.call('catalog',{operation:'create',name:'approve sample',expectedVersion:0});assert.equal(duplicate.version,library.version);
 assert.equal((await r.call('catalog',{operation:'create',name:'Stale write',expectedVersion:0})).status,409);
 let assigned=await update(r,{kind:'action',id:'sample',typeId:type.id,name:'Forged'});assert.equal(assigned.record.workflow.actions[0].name,'Approve sample');
 library=await r.call('catalog',{operation:'rename',id:type.id,name:'Approve Production Sample',expectedVersion:library.version});assert.equal(library.status,200);
 const replay=await update(r,{kind:'action',id:'sample',typeId:type.id,name:'Old label'});assert.equal(replay.record.version,assigned.record.version);
 assigned=await update(r,{kind:'remove',id:'sample'});assert.ok(assigned.record.workflow.actions[0].removedAt);assert.equal(assigned.record.workflow.actions[0].name,'Approve sample');
 library=await r.call('catalog',{operation:'delete',id:type.id,expectedVersion:library.version});assert.equal(library.status,200);assert.equal((await update(r,{kind:'action',id:'retired',typeId:type.id,name:'Retired'})).status,400);
 library=await r.call('catalog',{operation:'restore',id:type.id,expectedVersion:library.version});assert.equal(library.status,200);
 assert.equal((await r.call('preferences',{operation:'set',key:'order.action-types.v1',value:[]})).status,403);
 r.setPermissions(['orders.view','orders.edit']);assert.equal((await r.call('catalog',{operation:'rename',id:type.id,name:'No',expectedVersion:library.version})).status,403);
 }finally{r.sqlite.close();}
});
test('handoff creation issues once and optional annotations never invalidate production source',async()=>{
 const r=runtime();try{
 r.order.products=[{...domain.blankProduct(),id:'shirt',name:'T-Shirt',quantityMode:'order_total',orderTotal:10,specifications:[{...domain.blankSpecification(),id:'size',name:'Size',defaultValue:'M',required:false}]}];
 let saved=await r.call('orders',{operation:'upsert',order:r.order});assert.equal(saved.status,200);
 const source={order:saved.data.order,version:saved.data.version},rows=production.productionDemand([source]);assert.equal(rows.reduce((n,row)=>n+row.quantity,0),10);
 const handoff={id:'automatic-handoff',number:'New draft',name:'Automatic production',status:'Draft',purpose:'normal',reason:'',allocations:rows.map(row=>({...row,lay:'',stack:''})),lays:[],events:[],history:[],createdAt:'2026-11-27T10:00:00Z'};
 await update(r,{kind:'status',id:'cancel-tracking',value:'Cancelled'});await update(r,{kind:'action',id:'logo',typeId:'attach-logo',name:'Attach Logo'});
 const request={operation:'save',release:true,expectedVersion:0,handoff};let result=await r.call('production',request);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.ledger.handoffs[0].status,'Released');
 await update(r,{kind:'note',id:'note',text:'Optional reminder'});result=await r.call('production',request);assert.equal(result.status,200);assert.equal(result.version,1);assert.equal(result.ledger.handoffs[0].history.length,2);
 assert.equal((await r.call('production',{...request,expectedVersion:1,handoff:{...handoff,id:'duplicate'}})).status,409);
 const current=saved.data.order;current.products[0].orderTotal=12;saved=await r.call('orders',{operation:'upsert',order:current,expectedVersion:saved.data.version});assert.equal(saved.status,200);
 assert.equal((await r.call('production',{...request,expectedVersion:1,handoff:{...handoff,id:'stale'}})).status,409);
 assert.equal((await r.call('production',request)).status,200);
 }finally{r.sqlite.close();}
});
