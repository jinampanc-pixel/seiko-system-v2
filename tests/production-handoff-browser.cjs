const assert=require('node:assert/strict');
module.exports=async({page,seed,navigate,base,production})=>{
 const fixture=id=>({orderId:`production-order-${id}`,status:'Active',archived:false,details:{orderNo:`PROD-${id}`,clientName:`Production school ${id}`,contactNumber:'9999999999',orderDate:'2026-10-07',deliveryDate:'2026-10-20',clientType:'School / Institution',billTo:'',shipTo:'',contactPerson:'',attnRequired:false,remarks:''},fields:[],products:[{id:'shirt',name:'Collared T Shirt',sizeHeader:'Size',quantityMode:'same_for_all',defaultQuantity:2,orderTotal:0,quantityGroupRules:[],specifications:[{id:'colour',name:'Colour',role:'colour',mode:'same_for_all',defaultValue:id%2?'Blue':'Red',required:true,groupRules:[],attachments:[]}]},{id:'track',name:'Track Pant',sizeHeader:'Size',quantityMode:'same_for_all',defaultQuantity:1,orderTotal:0,quantityGroupRules:[],specifications:[]}],measurements:[{id:'length',name:'Length',type:'number',appliesTo:['shirt'],requiredMode:'Always'},{id:'waist',name:'Waist',type:'number',appliesTo:['shirt'],requiredMode:'Optional'},{id:'track-length',name:'Length',type:'number',appliesTo:['track'],requiredMode:'Always'}],records:[{recordId:'one',personId:'one',values:{'measurement:length:product:shirt':28,'measurement:track-length:product:track':30}},{recordId:'two',personId:'two',values:{'measurement:length:product:shirt':28,'measurement:waist:product:shirt':36,'measurement:track-length:product:track':32}},{recordId:'held',personId:'held',held:true,values:{'measurement:length:product:shirt':28}}],updatedAt:'2026-10-07T00:00:00Z',revisions:[]});
 for(let id=1;id<=5;id++)await seed(fixture(id));
 await navigate('Home');await navigate('Production');await page.getByRole('heading',{name:'Production handoffs',exact:true}).waitFor();
 const ui=page.locator('.productionWorkspace');
 await ui.getByText('PROD-5 · Production school 5',{exact:true}).waitFor();
 for(let id=1;id<=5;id++)await ui.getByRole("checkbox",{name:new RegExp(`PROD-${id} · Production school ${id}`)}).check();
 assert.equal(await ui.getByRole('spinbutton',{name:/^Include /}).count(),20);
 const partial=ui.getByRole('spinbutton',{name:'Include PROD-1 Collared T Shirt Length: 28',exact:true});await partial.fill('1');
 await ui.getByRole('button',{name:'Create handoff draft',exact:true}).click();
 await ui.getByLabel('Handoff name',{exact:true}).fill('Five schools combined');
 const included=ui.getByRole('spinbutton',{name:/^Handoff quantity/});assert.equal(await included.count(),20);
 const two=ui.getByRole('spinbutton',{name:'Handoff quantity PROD-2 Collared T Shirt Length: 28',exact:true});await two.fill('1');
 await ui.getByText('Optional cutting lays and fabric stacks',{exact:true}).click();await ui.getByRole('button',{name:'Add cutting lay',exact:true}).click();
 for(const [key,value] of Object.entries({pattern:'T28 standard',fabric:'Cotton jersey',width:'60 inches',stretch:'Low',grain:'Lengthwise',direction:'None',checks:'None'}))await ui.getByRole('textbox',{name:`Lay 1 ${key}`,exact:true}).fill(value);
 for(let id=1;id<=2;id++){await ui.getByRole('combobox',{name:`Lay PROD-${id} Collared T Shirt Length: 28`,exact:true}).selectOption('Lay 1');await ui.getByRole('textbox',{name:`Stack PROD-${id} Collared T Shirt Length: 28`,exact:true}).fill(id===1?'Blue stack':'Red stack');}
 await ui.getByLabel('Cutting master confirmed compatibility for all assigned stacks',{exact:true}).check();
 await page.route('**/api/erp/production',route=>route.abort('internetdisconnected'),{times:1});
 await ui.getByRole('button',{name:'Save handoff draft',exact:true}).click();await ui.getByRole('alert').waitFor();assert.equal(await ui.getByLabel('Handoff name',{exact:true}).inputValue(),'Five schools combined');
 await ui.getByRole('button',{name:'Save handoff draft',exact:true}).click();await ui.getByText('Draft saved to shared storage. Quantities are reserved only when released.',{exact:true}).waitFor();
 await ui.getByRole('button',{name:'Release handoff',exact:true}).click();await ui.getByText('Handoff released. Quantities are now allocated.',{exact:true}).waitFor();
 const sheet=ui.locator('.productionPrintSheet');assert.ok((await sheet.innerText()).includes('28 pieces'));
 await sheet.getByText('Trace quantity',{exact:true}).first().click();await sheet.getByText('PROD-1 · Production school 1: 1',{exact:true}).first().waitFor();assert.equal(await sheet.getByRole('heading',{name:'Collared T Shirt',exact:true}).count(),1);
 await ui.getByLabel('Sheet',{exact:true}).selectOption('allocation');assert.equal(await sheet.locator('tbody tr').count(),20);
 await ui.getByLabel('Sheet',{exact:true}).selectOption('bundles');await ui.getByLabel('Pieces per bundle',{exact:true}).fill('2');assert.equal(await sheet.locator('.productionTickets article').count(),20);
 await ui.getByLabel('Sheet',{exact:true}).selectOption('cutting');
 if(process.env.PRODUCTION_SCREENSHOTS){const fs=require('node:fs'),path=require('node:path');fs.mkdirSync(process.env.PRODUCTION_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.PRODUCTION_SCREENSHOTS,'production-handoff-desktop.png'),fullPage:true});await page.emulateMedia({media:'print'});assert.equal(await sheet.evaluate(el=>getComputedStyle(el).visibility),'visible');assert.ok((await sheet.boundingBox())?.height>100,'Print sheet has visible layout');assert.equal(await ui.getByRole('button',{name:'Refresh',exact:true}).isVisible(),false);await page.pdf({path:path.join(process.env.PRODUCTION_SCREENSHOTS,'production-handoff.pdf'),format:'A4',printBackground:true});await page.screenshot({path:path.join(process.env.PRODUCTION_SCREENSHOTS,'production-print.png'),fullPage:true});await page.emulateMedia({media:'screen'});}
 await ui.getByLabel('Work allocation',{exact:true}).selectOption({index:1});await ui.getByLabel('Good pieces',{exact:true}).fill('1');await ui.getByRole('button',{name:'Record work',exact:true}).click();await ui.getByText('Production saved to shared storage.',{exact:true}).waitFor();
 assert.equal(await ui.getByRole('button',{name:'Cancel unused handoff',exact:true}).count(),0);
 for(const size of [{width:390,height:844},{width:360,height:640}]){await page.setViewportSize(size);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Production does not overflow mobile');}
 await ui.getByRole('button',{name:'← Handoffs',exact:true}).click();await ui.getByText('PH-00001 · Five schools combined',{exact:true}).waitFor();
 await navigate('Home');await navigate('Production');await ui.getByText('PH-00001 · Five schools combined',{exact:true}).click();await ui.getByText('In progress',{exact:false}).first().waitFor();
 const response=await production.POST(new Request(`${base}/api/erp/production`,{method:'POST',body:JSON.stringify({businessId:'seiko',operation:'list'})}));const stored=await response.json();assert.equal(stored.ledger.handoffs[0].events.length,1);assert.equal(stored.ledger.handoffs[0].allocations.reduce((n,row)=>n+row.quantity,0),28);
 await page.setViewportSize({width:1365,height:900});await navigate('Home');
 console.log('PASS: five-order partial handoff, colours and waist variants, shared save failure retention, release, combined quantities, allocations, bundles, print/PDF, actual work, mobile and reopen.');
};
