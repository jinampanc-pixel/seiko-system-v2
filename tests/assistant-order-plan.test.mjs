import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>imports[n],crypto,structuredClone});return exports;}
const compile=load('app/lib/assistant-order-plan.ts').compileAssistantOrderPlan;
const domain=load('app/lib/order-domain.ts',{'./order-statuses':load('app/lib/order-statuses.ts')});
const guard=load('app/lib/assistant-domain.ts',{'./order-domain':domain});
const when=(classes,gender)=>({class:classes,gender});
function complex(){
  const garment=(key,name,groups,specifications={})=>({key,name,quantity:groups?{default:0,groups}:1,specifications,measurements:['Length / Waist (when required)']});
  const group=(classes,gender,quantity)=>({when:when(classes,gender),quantity});
  return {details:{clientName:'TEST COMPLEX CLIENT',contactNumber:'0000000000',contactPerson:'TEST CONTACT',clientType:'School / Institution'},fields:['Name',{key:'class',name:'Class / Section',required:true},{key:'gender',name:'Gender',required:true},'Reference ID'],products:[
    garment('ts','T Shirt',null,{'Body colour':'Blue','Collar colour':'Navy blue','Sleeve colour':'Navy blue','Sleeve length':'Half sleeve','Cuff colour':'Navy blue','Collar and cuff lining design':'Pending confirmation','Logo':'Required; artwork pending'}),
    garment('tp','Track Pant',null,{'Body colour':'Navy blue','Piping style':'Thin piping','Piping colour':'Pending confirmation'}),
    garment('shirt','Shirt',[group('BV, 1-7','Male',2),group('8','Male',1),group('BV, 1-4','Female',2)],{'Body colour':'Pending confirmation','Shirt style':'Regular'}),
    garment('pant','Male Pant',[group('BV, 1-7','Male',2),group('8','Male',1)],{'Suiting colour':'Light navy blue'}),
    garment('pina','Pinafore',[group('BV, 1-4','Female',2)],{'Suiting colour':'Light navy blue','Belt loops':'Required'}),
    garment('legging','Long Leggings',[group('BV, 1-4','Female',1)],{'Colour':'Pending confirmation'}),
    garment('top','Dress Top',[group('5-7','Female',2),group('8','Female',1)],{'Body colour':'Pending confirmation','Collar style':'Chinese collar','Collar colour':'Navy blue','Sleeve length':'3/4','Cuff colour':'Navy blue'}),
    garment('salwar','Salwar',[group('5-7','Female',2),group('8','Female',1)],{'Colour':'Light navy blue'}),
    garment('dupatta','Dupatta',[group('5-7','Female',2),group('8','Female',1)],{'Colour':'Pending confirmation'})
  ],prices:[
    {name:'BV–4 boys',rate:1000,when:when('BV, 1-4','Male'),contents:{ts:1,tp:1,shirt:2,pant:2}},
    {name:'BV–4 girls, leggings included',rate:1100,when:when('BV, 1-4','Female'),contents:{ts:1,tp:1,shirt:2,pina:2,legging:1}},
    {name:'5–7 boys',rate:1100,when:when('5-7','Male'),contents:{ts:1,tp:1,shirt:2,pant:2}},
    {name:'5–7 girls',rate:1100,when:when('5-7','Female'),contents:{ts:1,tp:1,top:2,salwar:2,dupatta:2}},
    {name:'8 boys',rate:750,when:when('8','Male'),contents:{ts:1,tp:1,shirt:1,pant:1}},
    {name:'8 girls',rate:750,when:when('8','Female'),contents:{ts:1,tp:1,top:1,salwar:1,dupatta:1}}
  ]};
}
test('compact nine-garment plan compiles without inventing people, measurements or dates',()=>{
  const input=complex(),snapshot=JSON.stringify(input),order=compile(input);guard.assertAssistantOrder(order);
  assert.equal(JSON.stringify(input),snapshot);assert.equal(order.products.length,9);assert.equal(order.measurements.length,9);assert.equal(order.records.length,0);assert.equal(order.details.deliveryDate,'');assert.equal(order.measurements.every(m=>m.type==='text'),true);
  assert.equal(order.products[0].specifications.find(s=>s.name==='Sleeve colour').defaultValue,'Navy blue');
  assert.equal(order.products[0].specifications.find(s=>s.name==='Collar and cuff lining design').defaultValue,'Pending confirmation');
  const ids=[...order.fields,...order.products,...order.measurements,...order.products.flatMap(p=>p.specifications)].map(x=>x.id);assert.equal(new Set(ids).size,ids.length);
});
test('all 18 class/gender groups resolve to exactly one correct package, without overlap',()=>{
  const order=compile(complex()),f=Object.fromEntries(order.fields.map(f=>[f.name,f.id]));
  for(const c of ['BV','1','2','3','4','5','6','7','8'])for(const gender of ['Male','Female']){
    const record={recordId:'test-person',personId:'TEST-01',values:{['field:'+f['Class / Section']]:c,['field:'+f.Gender]:gender}};
    const prices=order.commerce.rules.filter(r=>domain.predicateState(r,record,r.fieldId)==='match');assert.equal(prices.length,1,`${c} ${gender}`);
    const expected=c==='8'?750:(gender==='Female'||Number(c)>=5)?1100:1000;assert.equal(prices[0].rate,expected);
    const assignments=Object.fromEntries(order.products.map(p=>[p.id,domain.quantityForRecord(p,record)]));
    for(const item of prices[0].contents)assert.equal(assignments[item.productId],item.quantity,`${c} ${gender} package contents`);
    assert.equal(order.products.filter(p=>assignments[p.id]>0).length,prices[0].contents.length);
  }
});
test('missing recipient quantities, unknown fields, duplicate keys and unknown package garments are rejected',()=>{
  for(const mutate of [p=>delete p.products[0].quantity,p=>p.products[2].quantity.groups[0].when={unknown:'value'},p=>p.products[1].key='ts',p=>p.prices[0].contents={missingGarment:2}]){const p=complex();mutate(p);assert.throws(()=>compile(p));}
});
test('large industrial plan and per-group specifications work without school assumptions',()=>{
  const p={details:{clientName:'TEST FACTORY',contactNumber:'0000000000',clientType:'Corporate / Industrial'},fields:[{key:'department',name:'Department'},{key:'designation',name:'Designation'}],products:Array.from({length:40},(_,i)=>({key:'product'+i,name:'Work garment '+i,quantity:{default:0,groups:[{when:{department:'Assembly',designation:'Operator'},quantity:2}]},specifications:{Colour:{mode:'by_group',groups:[{when:{department:'Assembly'},value:'Blue'},{when:{department:'Warehouse'},value:'Grey'}]}},measurements:[{name:'Length',type:'number'}]})),prices:[]};
  const order=compile(p);guard.assertAssistantOrder(order);assert.equal(order.products.length,40);assert.equal(order.fields.some(f=>/class|gender/i.test(f.name)),false);
});
