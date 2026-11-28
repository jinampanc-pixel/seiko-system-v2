const assert=require('node:assert/strict');
module.exports=async(page,kind)=>{
 const active=page.locator('.orderActionDialog');if(await active.count()){await active.getByRole('button',{name:/^Close$/i,exact:true}).click();await active.waitFor({state:'hidden'});}
 const names={queries:'Cases',deliveries:'Prepare Delivery',movements:'Record Movement','delivery-history':'Delivery History',returns:'Record Return',billing:'Review Order Billing',people:'Review Eligibility'};
 const menu=page.locator('.orderOverviewActions .orderCenterActionMenu');await menu.locator(':scope>summary').scrollIntoViewIfNeeded();await menu.locator(':scope>summary').click();const section=menu.locator('.orderMenuSection').filter({hasText:/Order Actions/});
 await section.locator(':scope>summary').click();await section.getByRole('button',{name:names[kind],exact:true}).click();await page.locator('.orderActionDialog').waitFor();assert.equal(await page.locator('.orderWorkspaceManagement').count(),0,'operations open in focused dialogs, never an embedded management page');
};
