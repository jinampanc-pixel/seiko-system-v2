const assert = require('node:assert/strict');
module.exports = async ({page,sqlite,navigate,ordersApi,base})=>{
 const read=()=>JSON.parse(sqlite.prepare('SELECT document_json FROM erp_orders WHERE id=?').get('second-order').document_json);
 const row=page.locator('.orderRow').filter({hasText:'SECOND-002'}),setup=page.locator('.orderSetup');
 const open=async()=>{await navigate('Orders');await row.locator('.orderCenterInfo').click();await setup.waitFor();};
 const cell=setup.getByLabel('Contact person / Attn',{exact:true});
 const save=()=>setup.getByRole('button',{name:'Save changes',exact:true}).first().click();
 await open();await cell.fill('Older setup draft');
 const before=sqlite.prepare('SELECT document_json,version FROM erp_orders WHERE id=?').get('second-order'),remote=JSON.parse(before.document_json);remote.details.contactPerson='Newer device details';
 const response=await ordersApi.POST(new Request(`${base}/api/erp/orders`,{method:'POST',body:JSON.stringify({operation:'upsert',businessId:'seiko',order:remote,expectedVersion:before.version})}));assert.equal(response.status,200);
 await save();await page.getByRole('alert').filter({hasText:'changed in another window or device'}).waitFor();assert.equal(await cell.inputValue(),'Older setup draft');assert.equal(read().details.contactPerson,'Newer device details');
 await page.reload();await open();assert.equal(await cell.inputValue(),'Newer device details');await cell.fill('Saved using direct action');await save();await row.waitFor();assert.equal(read().details.contactPerson,'Saved using direct action');
 await open();await cell.fill('Saved using setup');await save();await row.waitFor();assert.equal(read().details.contactPerson,'Saved using setup');
 await navigate('Home');await page.evaluate(()=>{localStorage.setItem('quota-test-recovery-draft','retain this draft');const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='jinam:seiko:orders-v1'||key==='jinam:seiko:generated-order-artifacts-v1')throw new DOMException('Quota exhausted','QuotaExceededError');return original.call(this,key,value);};});
 await open();for(const size of [{width:390,height:844},{width:360,height:640}]){await page.setViewportSize(size);const control=setup.getByRole('button',{name:'Save changes',exact:true}).first();await control.scrollIntoViewIfNeeded();const bounds=await control.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=size.width,'setup save remains inside the mobile viewport');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await cell.fill('Saved despite full device cache');await save();await row.waitFor();await page.getByRole('status').filter({hasText:'cannot keep an offline order copy'}).waitFor();assert.equal(read().details.contactPerson,'Saved despite full device cache');assert.equal(await page.evaluate(()=>localStorage.getItem('quota-test-recovery-draft')),'retain this draft');
 await row.locator('.orderCenterInfo').click();await setup.waitFor();assert.equal(await cell.inputValue(),'Saved despite full device cache');await page.setViewportSize({width:1365,height:900});await navigate('Home');
 console.log('PASS: stale setup cannot overwrite newer device details; confirmed shared saves survive full device cache; mobile Save fits; recovery drafts remain retained.');
};
