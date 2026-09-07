import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../app/lib/order-domain.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { blankProduct, readinessIssues, quantityForRecord, eligibleOrderQuantity } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
function fixture() {
 const product = {...blankProduct(),id:'shirt',name:'Shirt',quantityMode:'per_person'};
 return {orderId:'test',status:'Draft',archived:false,details:{clientName:'Test',contactPerson:'',attnRequired:false}, fields:[{id:'name',name:'Name',required:true}], products:[product], measurements:[], records:[{recordId:'one',personId:'1',values:{'field:name':'Alpha','product:shirt:qty':2}},{recordId:'two',personId:'2',values:{'field:name':'Beta','product:shirt:qty':3},held:true}], revisions:[]};
}
test('blank required names and per-person quantities prevent readiness',()=>{
 const order=fixture(); order.records[0].values={'field:name':'   ','product:shirt:qty':''};
 const issues=readinessIssues(order);
 assert.ok(issues.some(x=>x.includes('Name')));assert.ok(issues.some(x=>x.includes('quantity')));
 assert.equal(quantityForRecord(order.products[0],order.records[0]),0);
});
test('zero is explicit and valid, while fractional and negative quantities are invalid',()=>{
 const order=fixture(); order.records[0].values['product:shirt:qty']=0;
 assert.deepEqual(readinessIssues(order),[]);
 for(const bad of [-1,1.5,'abc']) {order.records[0].values['product:shirt:qty']=bad;assert.ok(readinessIssues(order).some(x=>x.includes('quantity')));}
});
test('held people are excluded from billing totals and required-field checks',()=>{
 const order=fixture();order.records[1].values={};
 assert.equal(eligibleOrderQuantity(order,order.products[0]),2);assert.deepEqual(readinessIssues(order),[]);
 order.records[1].held=false;order.records[1].values={'field:name':'Beta','product:shirt:qty':3};
 assert.equal(eligibleOrderQuantity(order,order.products[0]),5);
});
test('conditional measurement is required only when a product is present',()=>{
 const order=fixture();order.measurements=[{id:'length',name:'Length',type:'number',appliesTo:['shirt'],requiredMode:'When present'}];
 assert.ok(readinessIssues(order).some(x=>x.includes('Length')));
 order.records[0].values['product:shirt:qty']=0;assert.deepEqual(readinessIssues(order),[]);
});
