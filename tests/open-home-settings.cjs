const uiLabel=require('./ui-label.cjs');
module.exports=async page=>{
 await page.getByRole('button',{name:uiLabel('Open Menu',true),exact:true}).first().click();
 await page.locator('.moduleMenu').getByRole('button',{name:/Settings/i}).click();
 const settings=page.locator('.themePanel');
 await settings.getByRole('button',{name:uiLabel('Home',true),exact:true}).click();
 await settings.getByRole('heading',{name:uiLabel('Home',true),exact:true}).waitFor();
 return settings;
};
