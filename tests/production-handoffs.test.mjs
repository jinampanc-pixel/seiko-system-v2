import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
function load(path,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{assert.ok(imports[name],name);return imports[name];},crypto,Response,Request,URL,TextDecoder,TextEncoder,Uint8Array});return exports;}
const orderDomain=load('app/lib/order-domain.ts',{'./order-statuses':load('app/lib/order-statuses.ts')});
const packing=load('app/lib/packing-label-model.ts',{'./order-domain':orderDomain});
const domain=load('app/lib/production-handoffs.ts',{'./order-domain':orderDomain,'./packing-label-model':packing});
export function makeOrder(id='one',colour='Blue'){
 return {orderId:id,status:'Active',archived:false,details:{orderNo:id,clientName:'Fixture '+id},fields:[],products:[{...orderDomain.blankProduct(),id:'shirt',name:'Collared T Shirt',defaultQuantity:2,specifications:[{id:'colour',name:'Colour',role:'colour',mode:'same_for_all',defaultValue:colour,required:true,groupRules:[]}]}],measurements:[{id:'length',name:'Length',type:'number',appliesTo:['shirt'],requiredMode:'Always'},{id:'waist',name:'Waist',type:'number',appliesTo:['shirt'],requiredMode:'Optional'}],records:[{recordId:'a',personId:'a',values:{'measurement:length:product:shirt':28}},{recordId:'b',personId:'b',values:{'measurement:length:product:shirt':28,'measurement:waist:product:shirt':36}},{recordId:'held',personId:'held',held:true,values:{'measurement:length:product:shirt':28}}],updatedAt:'2026-10-07',revisions:[]};
}
const allocation=row=>({...row,lay:'',stack:''});
function handoff(rows,id='h1'){return {id,number:id,name:'Combined handoff',status:'Draft',purpose:'normal',reason:'',allocations:rows.map(allocation),lays:[],events:[],history:[],createdAt:'2026-10-07'};}
test('production combines matching sizes across orders while preserving colours, waists and exact order quantities',()=>{
 const orders=[{order:makeOrder(),version:1},{order:makeOrder('two','Red'),version:3}];const demand=domain.productionDemand(orders);
 assert.equal(demand.length,4);assert.equal(demand.reduce((n,r)=>n+r.quantity,0),8);assert.equal(demand.filter(r=>r.unresolved).length,0);
 assert.equal(demand.filter(r=>r.variant.includes('Waist: 36')).length,2);
 const groups=domain.cuttingGroups(demand.map(allocation));assert.equal(groups.length,2);assert.equal(groups[0].allocations.length,2);assert.equal(groups[0].quantity,4);
 assert.ok(groups[0].allocations.some(r=>r.specifications.includes('Blue')));assert.ok(groups[0].allocations.some(r=>r.specifications.includes('Red')));
 const different=makeOrder('pattern');different.products[0].specifications.push({...different.products[0].specifications[0],id:'pattern',name:'Pattern',role:'pattern',defaultValue:'Different panels'});assert.equal(domain.cuttingGroups(domain.productionDemand([{order:makeOrder(),version:1},{order:different,version:1}]).map(allocation)).length,4);
 const empty=makeOrder('blank');empty.records[0].values={};assert.ok(domain.productionDemand([{order:empty,version:1}]).some(r=>r.unresolved));
 const total=makeOrder('total');total.products[0].quantityMode='order_total';total.products[0].orderTotal=13;assert.equal(domain.productionDemand([{order:total,version:1}]).reduce((n,r)=>n+r.quantity,0),13);
});
test('release checks partial claims, source revisions, explicit rework and lay compatibility',()=>{
 const demand=domain.productionDemand([{order:makeOrder(),version:1}]);const h=handoff(demand);h.allocations[0].quantity=1;
 domain.validateRelease(h,{handoffs:[]},demand);h.status='Released';const ledger={handoffs:[h]};
 const next=handoff(demand,'h2');assert.throws(()=>domain.validateRelease(next,ledger,demand),/already been issued/);
 next.allocations=[{...demand[0],quantity:1,lay:'',stack:''}];domain.validateRelease(next,ledger,demand);
 const corrected=makeOrder();corrected.records[0].values['measurement:length:product:shirt']=30;const correctedDemand=domain.productionDemand([{order:corrected,version:2}]);const correctedHandoff=handoff([correctedDemand.find(row=>row.variant==='Length: 30')],'correction');assert.throws(()=>domain.validateRelease(correctedHandoff,ledger,correctedDemand),/already been issued/,'Changing a size must not make already-issued person/product quantities available again');
 next.allocations[0].sourceVersion=0;assert.throws(()=>domain.validateRelease(next,ledger,demand),/source order changed/);next.allocations[0].sourceVersion=1;
 next.purpose='rework';assert.throws(()=>domain.validateRelease(next,ledger,demand),/Explain/);next.reason='Approved replacement';domain.validateRelease(next,ledger,demand);
 next.lays=[{id:'L1',pattern:'T28',fabric:'Cotton',width:'60 inches',stretch:'None',grain:'Lengthwise',direction:'None',checks:'None',confirmed:false}];next.allocations[0].lay='L1';next.allocations[0].stack='Blue';assert.throws(()=>domain.validateRelease(next,ledger,demand),/Confirm pattern/);next.lays[0].confirmed=true;domain.validateRelease(next,ledger,demand);
});
test('shared production API protects business permissions, fixed releases, duplicate claims, stale writes and actual work',async()=>{
 const sqlite=new DatabaseSync(':memory:');try{
  for(const file of fs.readdirSync('migrations').sort())sqlite.exec(fs.readFileSync('migrations/'+file,'utf8'));
  let race=false;
  const db={withSession(){return this;},async batch(statements){if(race){race=false;sqlite.prepare("UPDATE erp_orders SET version=version+1 WHERE id='four'").run();}sqlite.exec("BEGIN");try{const results=statements.map(stmt=>stmt.runSync());sqlite.exec("COMMIT");return results;}catch(error){sqlite.exec("ROLLBACK");throw error;}},prepare(sql){
    const stmt=sqlite.prepare(sql);let args=[];
    return {bind(...a){args=a;return this;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},runSync(){return {meta:{changes:Number(stmt.run(...args).changes)}};},async run(){return this.runSync();}};
  }};
  let role='owner';const api=load('app/api/erp/production/route.ts',{'cloudflare:workers':{env:{DB:db}},'../../../lib/server-erp-auth':{authenticateActor:async()=>role?{userId:'owner',email:'owner@example.invalid'}:null,authorizePermission:async(_actor,business,permission)=>business==='seiko'&&(role==='owner'||permission.endsWith('.view'))?{role}:null},'../../../lib/production-handoffs':domain});
  const order=makeOrder();sqlite.prepare("INSERT INTO erp_orders(id,business_id,order_no,status,archived,document_json,version,created_at,created_by_user_id,created_by_email,updated_at,updated_by_user_id,updated_by_email) VALUES(?,'seiko',?,'Active',0,?,1,'now','owner','owner@example.invalid','now','owner','owner@example.invalid')").run(order.orderId,order.details.orderNo,JSON.stringify(order));
  const call=async body=>{const response=await api.POST(new Request('https://test.invalid/api/erp/production',{method:'POST',body:JSON.stringify({businessId:'seiko',...body})}));return {status:response.status,...await response.json()};};
  const insert=sqlite.prepare("INSERT INTO erp_orders SELECT ?,business_id,?,status,archived,?,1,created_at,created_by_user_id,created_by_email,updated_at,updated_by_user_id,updated_by_email FROM erp_orders WHERE id=?");
  sqlite.exec('BEGIN');for(let i=0;i<1005;i++){const bulk=makeOrder('bulk-'+String(i).padStart(4,'0'));bulk.details.clientName='Scale client '+i;bulk.products[0].name=i===1004?'Unique collared shirt':'Scale shirt';bulk.details.deliveryDate='2026-11-20';insert.run(bulk.orderId,bulk.details.orderNo,JSON.stringify(bulk),order.orderId);}sqlite.exec('COMMIT');
  const firstPage=await call({operation:'list'});assert.equal(firstPage.total,1006);assert.equal(firstPage.choices.length,25);assert.equal(firstPage.orders.length,0);assert.equal(firstPage.ledger.handoffs.length,0);assert.ok(JSON.stringify(firstPage).length<12000,'List contains summaries, not person records');
  const secondPage=await call({operation:'list',page:2});assert.equal(secondPage.choices.length,25);assert.ok(secondPage.choices.every(row=>!firstPage.choices.some(first=>first.orderId===row.orderId)));
  const searched=await call({operation:'list',search:'Unique collared'});assert.equal(searched.total,1);assert.equal(searched.choices[0].orderId,'bulk-1004');
  assert.equal((await call({operation:'list',deliveryFrom:'2026-12-01'})).total,0);
  const selectedPage=await call({operation:'list',page:30,orderIds:[order.orderId,'bulk-1004']});assert.equal(selectedPage.orders.length,2);assert.equal(selectedPage.choices.length,25);
  assert.equal((await call({operation:'list',orderIds:Array.from({length:26},(_,i)=>'bulk-'+i)})).status,400);
  const listed=await call({operation:'list',orderIds:[order.orderId]});assert.equal(listed.version,0);const h=handoff(domain.productionDemand(listed.orders));
  role='viewer';assert.equal((await call({operation:'save',expectedVersion:0,handoff:h})).status,403);role='owner';assert.equal((await call({operation:'list',orderIds:[order.orderId],businessId:'meth'})).status,403);
  let saved=await call({operation:'save',expectedVersion:0,handoff:h});assert.equal(saved.status,200);assert.equal(saved.version,1);
  assert.equal((await call({operation:'save',expectedVersion:0,handoff:h})).status,409);
  saved=await call({operation:'release',expectedVersion:1,id:h.id});assert.equal(saved.ledger.handoffs[0].status,'Released');
  assert.equal((await call({operation:'save',expectedVersion:2,handoff:h})).status,409);
  const other={...h,id:'h2'};saved=await call({operation:'save',expectedVersion:2,handoff:other});assert.equal(saved.version,3);
  assert.equal((await call({operation:'release',expectedVersion:3,id:'h2'})).status,409);
  const event={allocationKey:h.allocations[0].key,operation:'Cutting',quantity:1,rejects:0,extras:0,reason:''};saved=await call({operation:'event',expectedVersion:3,id:'h1',event});assert.equal(saved.version,4);
  assert.equal((await call({operation:'event',expectedVersion:4,id:'h1',event:{...event,quantity:2}})).status,400);
  assert.equal((await call({operation:'event',expectedVersion:4,id:'h1',event:{...event,quantity:0,extras:1}})).status,400);
  assert.equal((await call({operation:'cancel',expectedVersion:4,id:'h1',reason:'No longer needed'})).status,400);
  saved=await call({operation:'close',expectedVersion:4,id:'h1',reason:'Partial batch closed, team informed'});assert.equal(saved.version,5);
  assert.equal(domain.issuedQuantity(saved.ledger,h.allocations[0].key),2);
  sqlite.prepare('UPDATE erp_orders SET version=2 WHERE id=?').run(order.orderId);
  assert.equal((await call({operation:'release',expectedVersion:5,id:'h2'})).status,409);
  const fresh=await call({operation:'list',orderIds:[order.orderId],id:'h1'});assert.equal(fresh.ledger.handoffs.find(h=>h.id==='h1').events.length,1);assert.equal(fresh.ledger.handoffs.find(h=>h.id==='h1').status,'Closed');
  const third=makeOrder('three');sqlite.prepare("INSERT INTO erp_orders SELECT ?,business_id,?,status,archived,?,1,created_at,created_by_user_id,created_by_email,updated_at,updated_by_user_id,updated_by_email FROM erp_orders WHERE id=?").run(third.orderId,third.details.orderNo,JSON.stringify(third),order.orderId);
  const thirdDemand=domain.productionDemand([{order:third,version:1}]);const h3=handoff([thirdDemand[0]],'h3');h3.allocations[0].quantity=1;const h4={...h3,id:'h4'};
  assert.equal((await call({operation:'save',expectedVersion:5,handoff:h3})).version,6);assert.equal((await call({operation:'save',expectedVersion:6,handoff:h4})).version,7);
  const concurrent=await Promise.all(['h3','h4'].map(id=>call({operation:'release',expectedVersion:7,id})));assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  const current=await call({operation:'list',orderIds:[third.orderId]});assert.equal(domain.issuedQuantity(current.ledger,thirdDemand[0].key),1);const pending=current.ledger.handoffs.find(h=>['h3','h4'].includes(h.id)&&h.status==='Draft');assert.equal((await call({operation:'release',expectedVersion:8,id:pending.id})).version,9);
  const fourth=makeOrder('four');sqlite.prepare("INSERT INTO erp_orders SELECT ?,business_id,?,status,archived,?,1,created_at,created_by_user_id,created_by_email,updated_at,updated_by_user_id,updated_by_email FROM erp_orders WHERE id=?").run(fourth.orderId,fourth.details.orderNo,JSON.stringify(fourth),order.orderId);
  const h5=handoff(domain.productionDemand([{order:fourth,version:1}]),'h5');assert.equal((await call({operation:'save',expectedVersion:9,handoff:h5})).version,10);
  race=true;assert.equal((await call({operation:'release',expectedVersion:10,id:'h5'})).status,409,'Source edit racing release must invalidate the atomic write');
  const afterRace=await call({operation:'list',orderIds:[fourth.orderId]});assert.equal(afterRace.version,10);assert.equal(afterRace.ledger.handoffs.find(h=>h.id==='h5').status,'Draft');
  const historyInsert=sqlite.prepare("INSERT INTO jinam_shared_records(scope,collection,id,document_json,version,created_at,updated_at,updated_by_user_id,updated_by_email) VALUES('seiko','production-handoffs-v1',?,?,1,'now','now','owner','owner@example.invalid')");
  for(let i=0;i<55;i++)historyInsert.run('archive-'+i,JSON.stringify({...h,id:'archive-'+i,number:'ARCH-'+i,name:'Archived batch '+i,status:'Closed',allocations:[],events:[]}));
  const history=await call({operation:'list',handoffStatus:'History'});assert.equal(history.handoffTotal,56);assert.equal(history.handoffs.length,25);assert.equal(history.ledger.handoffs.length,0);
  const nextHistory=await call({operation:'list',handoffStatus:'History',handoffPage:2});assert.equal(nextHistory.handoffs.length,25);assert.ok(nextHistory.handoffs.every(row=>!history.handoffs.some(first=>first.id===row.id)));
  const oneHistory=await call({operation:'list',handoffStatus:'History',handoffSearch:'ARCH-54'});assert.equal(oneHistory.handoffs.length,1);assert.equal(oneHistory.handoffs[0].id,'archive-54');
  role=null;assert.equal((await call({operation:'list',orderIds:[order.orderId]})).status,401);
 }finally{sqlite.close();}
});
