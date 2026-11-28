module.exports=()=>{
 const path='M21 10.543L12.297 17.377L11.703 17.377L3 10.519L3 6.623L12.006 13.833L21 6.623Z',failures=[];
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width&&r.height&&s.visibility!=='hidden'&&s.opacity!=='0';};
 const decode=value=>{try{return decodeURIComponent(value);}catch{return value;}};
 for(const icon of document.querySelectorAll('.appChevron'))if(visible(icon)){const r=icon.getBoundingClientRect();if(icon.querySelector('path')?.getAttribute('d')!==path||Math.abs(r.width-14)>.2||Math.abs(r.height-14)>.2)failures.push({kind:'icon',name:icon.closest('button,summary')?.textContent.trim().slice(0,50),width:r.width,height:r.height});}
 for(const select of document.querySelectorAll('select:not([multiple])'))if(visible(select)&&(!select.size||select.size===1)&&!select.closest('.orderTrackingSelect,.compactBusinessPicker,.globalBusinessNavigator')&&!select.hasAttribute('data-native-list')&&!select.hasAttribute('data-no-chevron'))if(!decode(getComputedStyle(select).backgroundImage).includes(path)||getComputedStyle(select).appearance!=='none')failures.push({kind:'select',name:select.getAttribute('aria-label')||select.value,appearance:getComputedStyle(select).appearance});
 for(const summary of document.querySelectorAll('details>summary'))if(visible(summary)){
  const style=getComputedStyle(summary),details=summary.parentElement,after=getComputedStyle(summary,'::after');
  if(style.listStyleType!=='none')failures.push({kind:'native-marker',name:summary.textContent.trim().slice(0,50)});
  if(details.matches('.seikoRowActionMenu,.billingDocumentMenu,.recordActionMenu,.orderMenu,.labelHeaderMore,.workspaceNativeMenu')||summary.querySelector(':scope>svg'))continue;
  if(!decode(after.maskImage||after.webkitMaskImage).includes(path))failures.push({kind:'disclosure',name:summary.textContent.trim().slice(0,50),mask:after.maskImage});
 }
 for(const icon of document.querySelectorAll('.globalBusinessChevron'))if(visible(icon)&&!decode(getComputedStyle(icon).maskImage).includes(path))failures.push({kind:'business-switcher'});
 return failures;
};
