const assert=require('node:assert/strict');
module.exports=async({page,seed,navigate,order,sqlite,domain})=>{
 const fixture=structuredClone(order);fixture.orderId='artwork-order';fixture.details.orderNo='ART-001';fixture.details.clientName='Artwork Test';fixture.revisions=[{revision:1,at:'2026-10-22',reason:'Fixture',recordCount:1}];
 fixture.products[0].specifications=[{...domain.blankSpecification('asset'),name:'School logo'}];await seed(fixture);
 await page.reload();await navigate('Orders');await page.locator('.orderRow').filter({hasText:'ART-001'}).locator('.orderCenterInfo').click();
 const artwork=page.locator('.artworkFiles').first();await artwork.waitFor();
 const bytes=Buffer.alloc(11*1024*1024,65);Buffer.from('%PDF-1.4\n% Synthetic artwork storage fixture\n').copy(bytes);
 await artwork.locator('input[type=file]').setInputFiles({name:'large-artwork.pdf',mimeType:'application/pdf',buffer:bytes});
 await artwork.getByText('large-artwork.pdf',{exact:true}).waitFor({timeout:30000});assert.equal(await artwork.locator('[role=alert]').count(),0);
 await page.getByRole('button',{name:'Save changes',exact:true}).first().click();await page.getByRole('heading',{name:'Orders',exact:true}).waitFor();
 const saved=JSON.parse(sqlite.prepare('SELECT document_json FROM erp_orders WHERE id=?').get(fixture.orderId).document_json);const file=saved.products[0].specifications[0].attachments[0];assert.match(file.storageKey,/^shared:/);assert.equal(file.size,bytes.length);
 await page.reload();await navigate('Orders');await page.locator('.orderRow').filter({hasText:'ART-001'}).locator('.orderCenterInfo').click();await artwork.getByRole('link',{name:'Open',exact:true}).waitFor();assert.match(await artwork.getByRole('link',{name:'Open',exact:true}).getAttribute('href'),/api\/erp\/artwork/);
 await page.route('**/api/erp/artwork?*',async(route)=>{if(route.request().method()==='POST')return route.fulfill({status:503,json:{ok:false,message:'Synthetic upload failure'}});return route.fallback();});
 await artwork.locator('input[type=file]').setInputFiles({name:'retry.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4')});await artwork.getByRole('alert').filter({hasText:'Synthetic upload failure'}).waitFor();assert.equal(await artwork.locator('.artworkCard').count(),1);
 console.log('PASS: 11 MB artwork uploads to shared storage, saves and reopens; failed uploads retain existing attachments.');
};
