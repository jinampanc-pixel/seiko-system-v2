import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const modules={};function load(path){if(modules[path])return modules[path];const exports={};modules[path]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>load('app/lib/'+n.replace('./','')+'.ts'),crypto,structuredClone});return exports;}
const queries=load('app/lib/assistant-queries.ts');
const candidate=(client,id='main')=>({orderId:id,orderNo:'2099-01-'+id,client,status:'Active',personCount:391});
test('order identity tolerates spacing, v/w variants and one-letter misspellings without changing saved names',()=>{
 const rows=[candidate('M S Dosvada'),candidate('Other School','other')],before=JSON.stringify(rows);
 for(const query of ['MS Doswada','M.S. DOSVADA','MS Dosvda','MS Dovsada'])assert.equal(queries.findOrderCandidates(rows,query).matchedOrderId,'main',query);
 assert.equal(JSON.stringify(rows),before);
 assert.notEqual(queries.searchKey('કિરણ'),queries.searchKey('કરુણ'),'Gujarati vowel signs remain meaningful');
});
test('ambiguous schools and follow-ups remain choices; unique full names outrank partial matches',()=>{
 const rows=[candidate('M S Dosvada'),candidate('M S Dosvada - Follow-up','followup')];
 assert.equal(queries.findOrderCandidates(rows,'MS Doswada').matchedOrderId,'main');
 const ambiguous=queries.findOrderCandidates(rows,'Doswada');assert.equal(ambiguous.requiresSelection,true);assert.equal(ambiguous.matchedOrderId,undefined);
 assert.equal(queries.findOrderCandidates([candidate('M S Dosvada','a'),candidate('MS Doswada','b')],'MS Dosvada').requiresSelection,true);
 assert.equal(queries.findOrderCandidates(rows,'Unrelated company').candidates.length,0);
});
function fixture(){
 const products=['T-Shirt','Track Pant'].map((name,i)=>({id:'p'+i,name,quantityMode:'per_person',defaultQuantity:0,quantityGroupRules:[],specifications:[]}));
 return {orderId:'test-order',status:'Active',fields:[{id:'name',name:'Name'},{id:'class',name:'Class / Section'}],details:{orderNo:'TEST-001',clientName:'Test school'},products,measurements:[],commerce:{people:{r0:{state:'hold'},r99:{state:'cancelled'}}},records:Array.from({length:391},(_,i)=>({recordId:'r'+i,personId:'P'+i,values:{'field:name':i===98?'':'Test '+i,'field:class':i<10?'6-A':i<100?'6':'7','product:p0:assigned_qty':i<50?2:i<75||i===99?1:0,'product:p1:assigned_qty':i<50||i===99?1:i<90&&i>=75?2:0}}))};
}
test('391-row aggregate counts people, pieces, both and either across the whole class, never a search sample',()=>{
 const o=fixture(),before=JSON.stringify(o),r=queries.countOrderPeople(o,['TS','TP'],[{field:'Std',match:'6'}]);
 assert.equal(r.matchedPeople,98);assert.equal(r.excludedCancelledPeople,1);
 assert.equal(r.products[0].people,75);assert.equal(r.products[0].pieces,125);
 assert.equal(r.products[1].people,65);assert.equal(r.products[1].pieces,80);
 assert.equal(r.allSelectedProductsPeople,50);assert.equal(r.anySelectedProductsPeople,90);assert.equal(r.unresolvedPeople,0);
 assert.equal(JSON.stringify(o),before);assert.match(queries.countAnswer(r,'test-time'),/50 people/);
});
test('unknown garments, duplicate aliases and unknown filters cannot silently produce zero',()=>{
 const o=fixture();assert.throws(()=>queries.countOrderPeople(o,['Unknown']),/Choose one garment/);
 assert.throws(()=>queries.countOrderPeople(o,['TP'],[{field:'Missing detail',match:'6'}]),/Choose one detail/);
 o.products.push({...o.products[0],id:'duplicate',name:'TS'});assert.throws(()=>queries.countOrderPeople(o,['TS']),/Choose one garment/);
});
test('unresolved group quantities are disclosed as lower bounds, and explicit individual exceptions win',()=>{
 const o=fixture();o.fields.push({id:'gender',name:'Gender'});o.products[0]={...o.products[0],quantityMode:'by_group',quantityGroupRules:[{match:'',quantity:1,conditions:[{fieldId:'gender',match:'M'}],conditionMode:'all'}]};
 o.records=o.records.slice(0,2);delete o.records[0].values['product:p0:assigned_qty'];
 const r=queries.countOrderPeople(o,['TS'],[{field:'Class',match:'6'}]);assert.equal(r.unresolvedPeople,1);assert.equal(r.products[0].people,1);assert.equal(r.products[0].pieces,2);assert.match(queries.countAnswer(r,'test-time'),/lower bounds/);
});
