const assert=require('node:assert/strict');
module.exports=async({page,navigate,billing,base})=>{
 if(!process.argv.includes('--mobile-device'))await page.setViewportSize({width:1280,height:1100});
 await navigate('Home');await page.getByRole('button',{name:'Open Menu',exact:true}).click();
 const mainMenu=page.getByRole('navigation',{name:'Modules',exact:true});const menuBounds=await mainMenu.boundingBox();assert.ok(menuBounds.height<=await page.evaluate(()=>innerHeight-70),'menu fits screen');assert.ok(await mainMenu.locator('.nav').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height>=43)),'menu rows retain their height');if(!process.argv.includes('--mobile-device'))assert.ok(menuBounds.height<950,'menu height follows its contents');assert.equal(await mainMenu.getByRole('button',{name:'Reorder Menu',exact:true}).count(),0);await mainMenu.getByRole('button',{name:/Settings$/,exact:false}).click();
 const settingsDialog=page.getByRole('dialog',{name:/Settings ·/});await settingsDialog.getByRole('button',{name:'Menu Layout',exact:true}).click();const menu=page.locator('.menuLayoutPreview');
 const orders=menu.locator('.nav[data-menu-key="orders"]'),labels=menu.locator('.nav[data-menu-key="labels"]');
 const before=await labels.evaluate(e=>Number(e.style.order));
 await labels.focus();await page.keyboard.press('ArrowUp');assert.equal(await labels.evaluate(e=>Number(e.style.order)),before-1);
 await labels.locator(".menuDragHandle").scrollIntoViewIfNeeded();
 await page.evaluate(()=>{window.touchTrace=[];for(const t of ["pointerdown","pointermove","pointerup","pointercancel"])document.addEventListener(t,e=>window.touchTrace.push([t,e.target.className,e.clientX,e.clientY]),true);});
 const from=await labels.locator('.menuDragHandle').boundingBox(),to=await orders.boundingBox();
 if(process.argv.includes('--mobile-device')){
  const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x+from.width/2,y:from.y+from.height/2}]});await page.waitForTimeout(400);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:to.x+to.width/2,y:to.y+to.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 }else{await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:8});await page.mouse.up();}
 if(await labels.evaluate(e=>Number(e.style.order))!==before)console.log('DRAG TRACE',JSON.stringify({from,to,events:await page.evaluate(()=>window.touchTrace),touch:await labels.locator('.menuDragHandle').evaluate(e=>getComputedStyle(e).touchAction)}));
 assert.equal(await labels.evaluate(e=>Number(e.style.order)),before,'pointer drag moves the item');
 await labels.focus();await page.keyboard.press('ArrowDown');const reordered=await labels.evaluate(e=>Number(e.style.order));

 const settings=menu.locator('.nav[data-menu-key="settings"]');assert.ok(await settings.evaluate(e=>parseFloat(getComputedStyle(e).borderTopWidth)>0),'separate divider above Settings');
 await settingsDialog.getByRole('button',{name:'Close Settings',exact:true}).click();await page.mouse.click(5,5);await page.reload();await page.getByRole('button',{name:'Open Menu',exact:true}).click();assert.equal(await page.locator('.moduleMenu .nav[data-menu-key="labels"]').evaluate(e=>Number(e.style.order)),reordered,'menu arrangement persists');await page.mouse.click(5,5);
 await navigate('Billing');
 const region=page.getByRole('region',{name:/SEIKO Billing/i});
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:844});await region.locator('.billingCreateMenu>summary').click();const panel=region.locator('.billingCreateMenu>div');await panel.waitFor();
  assert.equal(await panel.evaluate(e=>e.matches(':popover-open')),true);
  const box=await panel.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=844,'menu fits viewport');
  await page.mouse.move(5,5);assert.equal(await panel.isVisible(),true,'pointer departure does not close menu');
  await panel.getByRole('button',{name:'+ Quotation',exact:true}).focus();assert.equal(await panel.isVisible(),true,'focus stays in menu');
  await page.keyboard.press('Escape');assert.equal(await panel.isVisible(),false);await region.locator('.billingCreateMenu>summary').click();await page.mouse.click(5,5);assert.equal(await panel.isVisible(),false);
 }
 await region.locator('.billingCreateMenu>summary').click();await region.getByRole('button',{name:'Payment Slip',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Quick Payment Slip',exact:true});await form.waitFor();await form.getByLabel('Payer Name',{exact:true}).fill('Quick payer');await form.getByLabel('Amount Received ₹',{exact:true}).fill('75');
 await form.getByRole('button',{name:'Save and Print',exact:true}).click();await form.waitFor({state:'detached'});
 const response=await billing.POST(new Request(base+'/api/erp/billing',{method:'POST',body:JSON.stringify({operation:'list'})}));let ledger=await response.json();const saved=ledger.payments.find(p=>p.clientName==='Quick payer');assert.ok(saved);assert.equal(saved.orderId,'');
 const preview=page.getByRole('dialog',{name:saved.receiptNumber,exact:true});await preview.waitFor();await preview.locator('.documentMore>summary').first().click();await preview.getByRole('button',{name:'Link to Order / Invoice',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'Choose Order or Invoice for Payment',exact:true});await picker.waitFor();await picker.getByRole('button',{name:/Smoke School.*SMOKE-001/}).click();await picker.waitFor({state:'detached'});
 ledger=await (await billing.POST(new Request(base+'/api/erp/billing',{method:'POST',body:JSON.stringify({operation:'list'})}))).json();assert.equal(ledger.payments.filter(p=>p.id===saved.id).length,1);assert.equal(ledger.payments.find(p=>p.id===saved.id).orderId,'smoke-order');assert.equal(ledger.payments.find(p=>p.id===saved.id).receiptNumber,saved.receiptNumber);
 console.log('PASS: bounded top-layer menus, persistent mouse/touch/keyboard reordering, separate Settings divider, quick payment slip and later order link.');
};
