/** A portable snapshot of the already-rendered production sheet, shared by print and PDF. */
export function productionDocumentHtml(content:string){
 if(!content.trim())throw Error("Prepare a production sheet before printing.");
 return `<!doctype html><html><head><meta charset="utf-8"><title>Production sheet</title><style>
 *{box-sizing:border-box}body{margin:0;background:#fbf5ed;color:#173c5e;font:14px Arial,sans-serif}.copy{width:794px;padding:36px}.productionSheetOrders{border-bottom:2px solid #173c5e;padding-bottom:8px;line-height:1.5}.productionSheetOrders>strong{display:block}h2{font-size:19px}h3{font-size:16px;margin:10px 0 5px}p{line-height:1.4}.productionCuttingGrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.productionProductTable{min-width:0;break-inside:avoid}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:5px;border-bottom:1px solid #c3a06c;vertical-align:top;overflow-wrap:anywhere}th{background:#f2e5d0}.productionPatternNote{display:block;margin-top:3px;font-size:11px}.productionTickets{display:grid;grid-template-columns:1fr 1fr;gap:12px}.productionTickets article{padding:12px;border:1px dashed #173c5e;break-inside:avoid}.productionTickets p{margin:5px 0}.productionTableWrap{overflow:visible}tr{break-inside:avoid}.productionSpecificationHeader th{background:#f2e5d0;border-top:1px solid #c3a06c;font-weight:700}.productionSpecificationHeader th:last-child{font-size:11px}.productionStackDetails{display:block;font-size:11px;font-weight:400;line-height:1.4;margin-top:4px}@page{size:A4;margin:0}@media print{body{background:white}.copy{width:auto}.productionProductTable{break-inside:avoid}}
 .productionPage{width:210mm;height:297mm;padding:28px 32px;display:flex;flex-direction:column;gap:10px;margin:0;background:#fbf5ed;overflow:hidden}.productionPageHeader{flex:none}.productionPageHeader h2{font-size:17px;margin:5px 0}.productionPageHeader p{font-size:11px;line-height:1.35;margin:4px 0}.productionPageHeader .productionSheetOrders{font-size:11px;line-height:1.35;padding-bottom:5px}.productionPageColumns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:16px;flex:1;min-height:0;align-items:start}.productionPageColumn{height:100%;min-width:0}.productionPage .productionProductTable{margin:0 0 10px;break-inside:avoid}.productionPage h3{font-size:14px;line-height:1.3;margin:0 0 5px}.productionPage table{font-size:12px;line-height:1.25}.productionPage th,.productionPage td{padding:2px 4px 6px}.productionPage th:last-child,.productionPage td:last-child{width:90px}.productionPage thead{display:table-header-group}.productionPage tfoot{display:table-row-group}.productionPageFooter{flex:none;font-size:10px;line-height:14px;text-align:right;border-top:1px solid #c3a06c;padding-top:4px}.productionPage .productionPatternNote{font-size:10px;line-height:1.3}.productionPage .productionSpecificationHeader th{font-size:11px}.productionPage .productionSpecificationHeader th:last-child{font-size:10px}.productionContinuationHeader th{font-style:italic}@media print{.productionPage{break-after:page;page-break-after:always;background:white;overflow:visible}.productionPage:last-child{break-after:auto;page-break-after:auto}}
 </style></head><body><main class="copy" data-production-document>${content}</main></body></html>`;
}

/** Use the same measured A4 pages for browser printing and client-side PDF export. */
export function paginateProductionDocument(doc:Document){
 const source=doc.querySelector<HTMLElement>('[data-production-document]');
 if(!source||!source.querySelector('.productionCuttingGrid'))return;
 const grid=source.querySelector('.productionCuttingGrid')!,header=doc.createElement('header');
 header.className='productionPageHeader';
 for(const child of Array.from(source.children)){if(child===grid)break;header.append(child.cloneNode(true));}
 const pages:HTMLElement[]=[],footers:HTMLElement[]=[];let column:HTMLElement;
 function page(){
  if(pages.length>=100)throw Error('This production document exceeds 100 pages. Select fewer orders.');
  const copy=doc.createElement('main');copy.className='copy productionPage';copy.dataset.productionPage=String(pages.length+1);copy.append(header.cloneNode(true));
  const columns=doc.createElement('div');columns.className='productionPageColumns';
  for(let i=0;i<2;i++){const col=doc.createElement('div');col.className='productionPageColumn';columns.append(col);}
  const footer=doc.createElement('footer');footer.className='productionPageFooter';footer.textContent='Page 1';copy.append(columns,footer);doc.body.append(copy);pages.push(copy);footers.push(footer);column=columns.firstElementChild as HTMLElement;
  const available=columns.getBoundingClientRect().height;for(const col of Array.from(columns.children)) (col as HTMLElement).style.height=available+'px';
  if(column.clientHeight<100)throw Error('The production heading leaves too little room for A4 rows. Select fewer orders.');
 }
 function nextColumn(){const next=column.nextElementSibling as HTMLElement|null;if(next)column=next;else page();}
 try{
  page();
  for(const [productIndex,product] of Array.from(grid.querySelectorAll<HTMLElement>('.productionProductTable')).entries()){
   const table=product.querySelector('table');if(!table)continue;
   const rows=Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody>tr,tfoot>tr')),heading=product.querySelector('h3');
   let body:HTMLTableSectionElement,section:HTMLElement,sectionHasRows=false,context:HTMLTableRowElement|null=null,continued=false;
   function start(){
    section=doc.createElement('section');section.className='productionProductTable';
    const title=heading?.cloneNode(true) as HTMLElement||doc.createElement('h3');if(continued)title.append(' (continued)');section.append(title);
    const nextTable=doc.createElement('table');if(table!.tHead)nextTable.append(table!.tHead.cloneNode(true));body=doc.createElement('tbody');nextTable.append(body);section.append(nextTable);column.append(section);sectionHasRows=false;
   }
   function continuation(){if(!context)return;const row=context.cloneNode(true) as HTMLTableRowElement;row.classList.add('productionContinuationHeader');row.cells[0]?.append(' (continued)');body.append(row);}
   start();
   for(let index=0;index<rows.length;){
    const first=rows[index],isHeader=first.classList.contains('productionSpecificationHeader');if(isHeader)context=first;
    const batch=[first];let count=1;
    // Keep a specification heading with its first size, and a final total with its last size.
    if(isHeader){while(count<=2&&rows[index+count]&&rows[index+count].parentElement?.tagName!=='TFOOT'&&!rows[index+count].classList.contains('productionSpecificationHeader')){batch.push(rows[index+count]);count++;}}
    if(rows[index+count]?.parentElement?.tagName==='TFOOT'){batch.push(rows[index+count]);count++;}
    const clones=batch.map((row,offset)=>{const clone=row.cloneNode(true) as HTMLTableRowElement;clone.dataset.productionSourceRow=productIndex+':'+(index+offset);if(row.parentElement?.tagName==='TFOOT')clone.dataset.productionTotal='true';return clone;});
    body.append(...clones);
    const fits=()=>section.getBoundingClientRect().bottom<=column.getBoundingClientRect().top+column.clientHeight+.5;
    if(!fits()){
     clones.forEach(row=>row.remove());if(!sectionHasRows)section.remove();
     if(!column.children.length)throw Error('A production row is too tall for A4. Shorten its specification text.');
     nextColumn();continued=true;start();if(!isHeader)continuation();body.append(...clones);
     if(!fits())throw Error('A production row is too tall for A4. Shorten its specification text.');
    }
    sectionHasRows=true;index+=count;
   }
  }
  // Keep small handoffs compact without leaving the second column unnecessarily empty.
  for(const page of pages){const [left,right]=Array.from(page.querySelectorAll<HTMLElement>('.productionPageColumn'));if(right.children.length||left.children.length<2)continue;const sections=Array.from(left.children) as HTMLElement[],top=left.getBoundingClientRect().top,total=sections[sections.length-1].getBoundingClientRect().bottom-top;let split=1,distance=Infinity;for(let i=1;i<sections.length;i++){const height=sections[i-1].getBoundingClientRect().bottom-top,delta=Math.abs(total/2-height);if(delta<distance){distance=delta;split=i;}}sections.slice(split).forEach(section=>right.append(section));}
  footers.forEach((footer,index)=>{footer.textContent=`Page ${index+1} of ${pages.length}`;});source.remove();
 }catch(error){pages.forEach(page=>page.remove());throw error;}
}
