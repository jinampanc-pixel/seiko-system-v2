const assert=require('node:assert/strict');
module.exports=async({page,seed,navigate,order,sqlite})=>{
 page.setDefaultTimeout(15000);console.log('Sheets browser: starting');
 const fixture=structuredClone(order);fixture.orderId='sheet-browser-order';fixture.details.orderNo='SHEET-001';fixture.details.clientName='Sheets School';await seed(fixture);
 let linked=false,fail=false;
 const source={id:'test-sheet',url:'https://docs.google.com/spreadsheets/d/test-sheet/edit',peopleSheetId:17};
 await page.route('**/api/erp/order-sheets',async route=>{
 const body=route.request().postDataJSON();if(body.orderId!==fixture.orderId)return route.fallback();
 if(fail&&body.operation==='sync')return route.fulfill({status:503,json:{ok:false,message:'Sheet connection unavailable — saved records retained.'}});
 if(body.operation==='create'){linked=true;fixture.googleSheet=source;sqlite.prepare('UPDATE erp_orders SET document_json=?,version=version+1 WHERE id=?').run(JSON.stringify(fixture),fixture.orderId);}
 await route.fulfill({json:{ok:true,connection:{configured:true,connected:true,accountEmail:'owner@example.invalid'},canConnect:true,canCreate:true,link:linked?{...source,status:'ready',syncedAt:new Date().toISOString(),error:null}:null}});
 });
 console.log('Sheets browser: seeded');await page.reload();await navigate('Orders');const row=page.locator('.orderRow').filter({hasText:'SHEET-001'});await row.locator('.orderCenterInfo').click();await page.getByRole('button',{name:'Open workspace',exact:true}).click();
 console.log('Sheets browser: opened workspace');await page.getByRole('link',{name:'Open person records in Google Sheets',exact:true}).waitFor();assert.equal(await page.locator('.workspacePage').count(),0,'linked sheets replace the editable app table');
 fixture.records.push({recordId:'sheet-added',personId:'ADD-002',values:{'field:name':'Sheet supplementary student','product:vest:assigned_qty':3}});sqlite.prepare('UPDATE erp_orders SET document_json=?,version=version+1 WHERE id=?').run(JSON.stringify(fixture),fixture.orderId);
 await page.getByRole('button',{name:'Sync records now',exact:true}).click();await page.getByText('People in the last validated sync:',{exact:false}).filter({hasText:'2'}).waitFor();
 console.log('Sheets browser: synced addition');const before=page.url(),tabs=page.context().pages().length;await page.getByRole('button',{name:'Find person',exact:true}).click();const lookup=page.locator('.personLookupDialog');await lookup.getByRole('textbox').fill('supplementary');await lookup.getByRole('button',{name:'Search people',exact:true}).click();await lookup.getByRole('button').filter({hasText:'Sheet supplementary student'}).click();await lookup.getByRole('heading',{name:'Sheet supplementary student',exact:true}).waitFor();assert.match(await lookup.innerText(),/Vest · 3 active pieces/);assert.equal(page.url(),before);assert.equal(page.context().pages().length,tabs,'person lookup stays inside app');
 if(process.env.BILLING_ASSET_SCREENSHOTS)await page.screenshot({path:process.env.BILLING_ASSET_SCREENSHOTS+'/person-lookup.png'});
 await lookup.getByRole('button',{name:'Close',exact:true}).click();fail=true;await page.getByRole('button',{name:'Sync records now',exact:true}).click();await page.getByRole('alert').filter({hasText:'Sheet connection unavailable'}).waitFor();assert.equal(JSON.parse(sqlite.prepare('SELECT document_json FROM erp_orders WHERE id=?').get(fixture.orderId).document_json).records.length,2);
 await navigate('Billing');await page.locator('.seikoPhase2Surface .phase2BrandHeader').getByRole('button',{name:'Find person',exact:true}).waitFor();await page.locator('.seikoPhase2Surface .phase2BrandHeader').getByRole('button',{name:'Find person',exact:true}).click();await lookup.getByRole('button',{name:'← Back to results',exact:true}).click();await lookup.getByRole('textbox').fill('ADD-002');await lookup.getByRole('button',{name:'Search people',exact:true}).click();await lookup.getByRole('button').filter({hasText:'Sheet supplementary student'}).waitFor();await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('PASS: automatic Sheets workspace migration, synced supplementary lookup in-app, retained records on failure and lookup from Billing.');
};
