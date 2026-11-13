module.exports=()=>{
 const contrastFailures=[],clippedLabels=[],iconGeometry=[];
 const rgb=value=>{const n=value.match(/[\d.]+/g)?.map(Number);return n&&n.length>=3?[n[0],n[1],n[2],n[3]??1]:[255,255,255,0];};
 const background=element=>{let result=[255,255,255],layers=[];for(let e=element;e;e=e.parentElement){const c=rgb(getComputedStyle(e).backgroundColor);layers.push(c);if(c[3]===1)break;}for(const c of layers.reverse())result=result.map((v,i)=>c[i]*c[3]+v*(1-c[3]));return result;};
 const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
 for(const button of document.querySelectorAll('button')){
  const bounds=button.getBoundingClientRect(),style=getComputedStyle(button);if(!bounds.width||!bounds.height||button.disabled||style.visibility==='hidden'||button.closest('[inert],[aria-hidden="true"]'))continue;
  const name=(button.getAttribute('aria-label')||button.textContent||'').trim().slice(0,70);
  if(button.classList.contains('uiIconButton')){const icon=button.querySelector('svg');if(icon){const box=icon.getBoundingClientRect();if(Math.abs((box.left+box.right-bounds.left-bounds.right)/2)>1.5||Math.abs((box.top+box.bottom-bounds.top-bounds.bottom)/2)>1.5)iconGeometry.push(name);}}
  const walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){
   if(!node.textContent.trim())continue;const parent=node.parentElement,s=getComputedStyle(parent);if(s.visibility==='hidden'||s.display==='none')continue;const range=document.createRange();range.selectNodeContents(node);const rects=[...range.getClientRects()].filter(r=>r.width&&r.height);if(!rects.length)continue;
   if(s.textOverflow!=='ellipsis'&&style.textOverflow!=='ellipsis'&&rects.some(r=>r.left<bounds.left-2||r.right>bounds.right+2||r.top<bounds.top-2||r.bottom>bounds.bottom+2))clippedLabels.push(name);
   const fg=rgb(s.color),bg=background(parent),actual=fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3])),a=luminance(actual),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),large=parseFloat(s.fontSize)>=24||parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700;
   if(ratio<(large?2.95:4.45))contrastFailures.push({name,text:node.textContent.trim().slice(0,45),ratio:Number(ratio.toFixed(2))});
  }
 }
 return {contrastFailures,clippedLabels:[...new Set(clippedLabels)],iconGeometry:[...new Set(iconGeometry)]};
};
