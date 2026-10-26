import { fitBillingCopies, type BillingCopies } from "./seiko-billing-print";
export async function readyDocument(frame:HTMLIFrameElement,copies?:BillingCopies){
 const doc=frame.contentDocument;if(!doc||!doc.body?.textContent?.trim())throw Error("Document is not ready. Wait for the preview and try again.");
 await doc.fonts.ready;
 await Promise.all(Array.from(doc.images).map(async image=>{if(image.complete&&image.naturalWidth>0)return;if(image.decode)await image.decode();else await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error("A document image could not load."));});if(!image.naturalWidth)throw Error("A document image could not load.");}));
 if(doc.querySelector("[data-production-document]")){const {paginateProductionDocument}=await import("./production-document");paginateProductionDocument(doc);}
 if(copies)fitBillingCopies(frame,copies);
 return doc;
}
export async function createDocumentPdf(html:string,copies?:BillingCopies):Promise<Blob>{
 const frame=document.createElement("iframe");frame.title="Preparing PDF";frame.setAttribute("aria-hidden","true");frame.style.cssText="position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;pointer-events:none";
 const loaded=new Promise<void>((resolve,reject)=>{frame.onload=()=>resolve();frame.onerror=()=>reject(Error("PDF preparation failed."));});frame.srcdoc=html;document.body.append(frame);
 try{
 await loaded;const doc=await readyDocument(frame,copies);const [{default:html2canvas},{jsPDF}]=await Promise.all([import("html2canvas"),import("jspdf")]);
 const pdf=new jsPDF({unit:"mm",format:"a4",compress:true});let count=0;
 const elements=doc.body.classList.contains("both")?[doc.body]:Array.from(doc.querySelectorAll<HTMLElement>(".copy"));if(!elements.length)elements.push(doc.body);
 for(const element of elements){const rect=element.getBoundingClientRect(),height=Math.ceil(Math.max(element.scrollHeight,rect.height)),width=Math.round(rect.width),pageHeight=width*297/210;let offset=0;
 while(offset<height-1){let end=Math.min(height,offset+pageHeight);
 // Avoid cutting a row or the closing columns across generated PDF pages.
 if(end<height){const block=Array.from(element.querySelectorAll<HTMLElement>("tr,.closingGrid,.acknowledgement")).map(e=>e.getBoundingClientRect()).find(r=>r.top-rect.top<end&&r.bottom-rect.top>end&&r.height<pageHeight);if(block&&block.top-rect.top>offset+pageHeight*.35)end=block.top-rect.top;}
 if(++count>100)throw Error("This document has more than 100 pages. Print smaller batches.");
 const canvas=await html2canvas(element,{scale:1.5,width,height:Math.ceil(end-offset),y:offset,windowWidth:794,windowHeight:1123,backgroundColor:"#fbf5ed",logging:false,useCORS:true});
 if(!canvas.width||!canvas.height)throw Error("PDF rendering did not produce a page. Retry from the full document.");
 const ctx=canvas.getContext("2d");if(!ctx)throw Error("PDF rendering is unavailable on this device.");const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let ink=false;for(let i=0;i<pixels.length;i+=4*31){if(Math.abs(pixels[i]-251)+Math.abs(pixels[i+1]-245)+Math.abs(pixels[i+2]-237)>80){ink=true;break;}}if(!ink)throw Error("A PDF page rendered blank. No file was saved; use the full document to retry.");
 if(count>1)pdf.addPage();pdf.addImage(canvas,"PNG",0,0,210,(end-offset)*210/width,undefined,"FAST");canvas.width=0;canvas.height=0;offset=end;
 }
 }
 const blob=pdf.output("blob");if(blob.size<1000)throw Error("The PDF is empty. No file was saved.");return blob;
 }finally{frame.remove();}
}
