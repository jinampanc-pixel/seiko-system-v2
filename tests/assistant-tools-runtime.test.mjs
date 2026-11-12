import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const load=(path,imports={})=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{assert.ok(imports[n],n);return imports[n];},crypto,structuredClone,Response,Request,Headers,Intl});return exports;};
const statuses=load('app/lib/order-statuses.ts');
const domain=load('app/lib/order-domain.ts',{'./order-statuses':statuses});
const assistant=load('app/lib/assistant-domain.ts',{'./order-domain':domain});
const prompt=load('app/lib/assistant-prompt.ts');
test('real edit tool proposes from authoritative order and preserves its version and untouched data',async()=>{
  const order={...structuredClone(prompt.assistantOrderExample),orderId:'test-existing-order',status:'Draft',archived:false,details:{...prompt.assistantOrderExample.details,clientName:'TEST CLIENT',contactNumber:'0000000000',orderNo:'2099-01-001',attnRequired:false},updatedAt:'2099-01-01',records:[{recordId:'r1',personId:'P-0001',values:{'field:f-name':'TEST PERSON'}}]};
  const original=JSON.stringify(order);let writes=0;
  const orders={POST:async request=>{const body=await request.json();if(body.operation==='list')return Response.json({ok:true,data:{orders:[{order,version:7}]}});writes++;assert.equal(body.expectedVersion,7);return Response.json({ok:false,message:'Order changed on another device'},{status:409});}};
  const stub={POST:async()=>Response.json({ok:true})};
  const tools=load('app/lib/server-assistant-tools.ts',{
    'cloudflare:workers':{env:{}},'../api/erp/orders/route':orders,'../api/erp/search/route':stub,'../api/erp/people/route':stub,'../api/erp/production/route':stub,'../api/erp/billing/route':stub,'../api/erp/order-billing/route':stub,'../api/seiko/route':stub,
    './server-erp-auth':{authenticateActor:async()=>({userId:'owner'}),authorizePermission:async()=>({role:'owner'})},'./assistant-prompt':prompt,'./assistant-order-plan':load('app/lib/assistant-order-plan.ts'),'./assistant-domain':assistant,'./order-domain':domain,'./seiko-billing':{},
  });
  const ctx={request:new Request('https://test.invalid'),business:'seiko',userId:'owner'};
  const prepared=await tools.prepareAssistantAction(ctx,'edit_order',{orderId:order.orderId,patches:[{path:'/products/0/specifications/0/defaultValue',value:'Navy blue'}]});
  assert.equal(writes,0);assert.equal(JSON.stringify(order),original);assert.equal(prepared.payload.expectedVersion,7);assert.equal(prepared.payload.order.records[0].values['field:f-name'],'TEST PERSON');
  await assert.rejects(()=>tools.executeAssistantAction(ctx,prepared),/changed on another device/);assert.equal(writes,1);assert.equal(JSON.stringify(order),original);
});
test('fictional class/gender order preserves the agreed package quantities and prices',()=>{
  const order={...structuredClone(prompt.assistantOrderExample),orderId:'test-rules-order',status:'Draft',archived:false,updatedAt:'2099-01-01',details:{...prompt.assistantOrderExample.details,clientName:'TEST CLIENT',contactNumber:'0000000000',orderNo:'2099-01-002',attnRequired:false},fields:[{id:'class',name:'Class',type:'text',options:[],required:false},{id:'gender',name:'Gender',type:'text',options:[],required:false}]};
  const group=(classes,gender,quantity)=>({match:'',quantity,conditionMode:'all',conditions:[{fieldId:'class',match:classes},{fieldId:'gender',match:gender}]});
  const base=order.products[0];
  order.products=[{...base,id:'pants',name:'Pant',defaultQuantity:0,quantityMode:'by_group',quantityGroupRules:[group('BV, 1-7','Male',2),group('8','Male',1)],specifications:[]},{...base,id:'leggings',name:'Long Leggings',defaultQuantity:0,quantityMode:'by_group',quantityGroupRules:[group('BV, 1-4','Female',1)],specifications:[]},{...base,id:'tops',name:'Top',defaultQuantity:0,quantityMode:'by_group',quantityGroupRules:[group('5-7','Female',2),group('8','Female',1)],specifications:[]}];order.measurements=[];
  const record=(c,g)=>({recordId:'test',personId:'P-0001',values:{'field:class':c,'field:gender':g}});
  assert.equal(domain.quantityForRecord(order.products[0],record('4','Male')),2);
  assert.equal(domain.quantityForRecord(order.products[0],record('8','Male')),1);
  assert.equal(domain.quantityForRecord(order.products[1],record('BV','Female')),1);
  assert.equal(domain.quantityForRecord(order.products[1],record('5','Female')),0);
  assert.equal(domain.quantityForRecord(order.products[2],record('8','Female')),1);
  assert.equal(domain.quantityForRecord(order.products[2],record('7','Female')),2);
});
