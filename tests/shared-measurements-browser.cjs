const assert=require('node:assert/strict');
const fs=require('node:fs');
module.exports=async({page,sqlite,seed,navigate,order})=>{
 const fixture=structuredClone(order);fixture.orderId='shared-measurement-order';fixture.details.orderNo='SHARED-001';fixture.details.clientName='Shared Measurement School';
 const first=fixture.products[0];fixture.products=['Pant','Dress','Track pant'].map((name,i)=>({...structuredClone(first),id:'shared-product-'+i,name,specifications:[],quantityMode:'same_for_all',defaultQuantity:1}));
 fixture.measurements=[{id:'shared-waist',name:'Waist',type:'number',appliesTo:['shared-product-0'],requiredMode:'Optional'}];fixture.records=[{recordId:'shared-person',personId:'S-001',values:{'measurement:shared-waist:product:shared-product-0':30}}];fixture.revisions=[{revision:1,at:'2026-10-22',reason:'Fixture',recordCount:1}];await seed(fixture);
 await page.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='jinam:seiko:orders-v1')throw new DOMException('Storage full','QuotaExceededError');return set.call(this,key,value);};});
 await page.reload();await navigate('Orders');
 const row=page.locator('.orderRow').filter({hasText:'SHARED-001'});await row.locator('.orderCenterOperationalMeta').waitFor();assert.equal(await row.locator('.openOrderButton').isVisible(),false);assert.equal(await page.evaluate(()=>localStorage.getItem('jinam:seiko:orders-v1').includes('shared-measurement-order')),false);await row.locator('.orderCenterInfo').click();await page.locator('.orderSetup').waitFor();
 assert.equal(await page.locator('.workspacePage').count(),0);
 const measurement=page.locator('.productMeasurementRow').first();await measurement.locator('.measurementProductLinks summary').click();
 await measurement.getByRole('checkbox',{name:'Use Waist for Dress',exact:true}).check();
 await measurement.getByRole('checkbox',{name:'Use Waist for Track pant',exact:true}).check();
 await page.getByRole('button',{name:'Open workspace',exact:true}).click();await page.locator('.workspacePage').waitFor();
 assert.equal(await page.locator('th[data-column-id="measurement:shared-waist:shared"]').count(),1);
 const input=page.locator('.workspaceTable tbody tr').first().locator('input[data-grid-column]').last();
 assert.equal(await input.inputValue(),'30');await input.fill('34');
 await page.getByRole('button',{name:'More order actions',exact:true}).click();await page.getByRole('button',{name:'Save now',exact:true}).click();await page.getByRole('status').filter({hasText:'saved successfully to shared storage.'}).waitFor();
 const stored=JSON.parse(sqlite.prepare('SELECT document_json FROM erp_orders WHERE id=?').get(fixture.orderId).document_json);
 assert.equal(stored.measurements.length,1);assert.equal(stored.measurements[0].appliesTo.length,3);
 for(const product of fixture.products)assert.equal(String(stored.records[0].values[`measurement:shared-waist:product:${product.id}`]),'34');
 assert.equal(await page.locator('body').getAttribute('data-seiko-palette'),'true');
 assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(251, 245, 237)');
 if(await page.getByRole('button',{name:'More order actions',exact:true}).getAttribute('aria-expanded')==='true')await page.getByRole('button',{name:'More order actions',exact:true}).click();
 if(process.env.SEIKO_SHARED_SCREENSHOTS){fs.mkdirSync(process.env.SEIKO_SHARED_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.SEIKO_SHARED_SCREENSHOTS+'/shared-waist-workspace.png'});}
 await page.getByRole('button',{name:'More order actions',exact:true}).click();await page.getByRole('button',{name:'Edit setup',exact:true}).click();
 if(process.env.SEIKO_SHARED_SCREENSHOTS)await page.screenshot({path:process.env.SEIKO_SHARED_SCREENSHOTS+'/order-setup-shared-measurements.png'});
 await page.getByRole('button',{name:'Open workspace',exact:true}).click();await page.locator('.workspacePage').waitFor();
 for(const width of [360,390,768]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'workspace fits '+width);await page.getByRole('button',{name:'More order actions',exact:true}).click();await page.getByRole('button',{name:'Edit setup',exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'setup fits '+width);if(process.env.SEIKO_SHARED_SCREENSHOTS)await page.screenshot({path:process.env.SEIKO_SHARED_SCREENSHOTS+'/mobile-setup-'+width+'.png'});await page.getByRole('button',{name:'Open workspace',exact:true}).click();await page.locator('.workspacePage').waitFor();}
 console.log('PASS: order click opens setup, explicit workspace navigation, shared waist entry mirrors all products, save persists and SEIKO palette applies.');
};
