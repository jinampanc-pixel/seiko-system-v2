import { orderSheetColumns, type SheetPersonEdit } from './order-sheet-model';
import { quantityForRecord, type SeikoOrder } from './order-domain';
/** Parse clipboard TSV or CSV, retaining quoted delimiters and line breaks. */
export function parsePersonList(text:string):string[][]{
 if(text.length>1500000)throw Error('Paste at most 1,000 people at a time.');
 text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 const delimiter=text.includes('\t')?'\t':',';const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||!cell)quoted=!quoted;else cell+=c;}else if(!quoted&&(c===delimiter||c==='\n')){row.push(cell.trim());cell='';if(c==='\n'){if(row.some(Boolean))rows.push(row);row=[];}}else cell+=c;}
 if(quoted)throw Error('A quoted cell is incomplete. Copy the complete table again.');row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 if(rows.length>1001)throw Error('Paste at most 1,000 people at a time.');return rows;
}
const canonical=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function matchPersonHeaders(order:SeikoOrder,headers:string[]){const cols=orderSheetColumns(order).filter(c=>!['_record_id','_person_id'].includes(c.id));const used=new Set<string>();return headers.map(h=>{const key=canonical(h),matches=cols.filter(c=>[c.id,c.label,c.groupLabel+' '+c.label].some(s=>canonical(s)===key));const found=matches.length===1&&!used.has(matches[0].id)?matches[0].id:'';if(found)used.add(found);return found;});}
export function personListEdits(order:SeikoOrder,rows:string[][],mapping:string[],makeId:()=>string){
 if(!rows.length||rows.length>1000)throw Error('Import between 1 and 1,000 people.');
 const cols=new Map(orderSheetColumns(order).map(c=>[c.id,c]));const mapped=mapping.filter(Boolean);if(new Set(mapped).size!==mapped.length)throw Error('Map each destination field only once.');if(!mapped.some(k=>k.startsWith('field:')))throw Error('Match at least one person detail column.');
 const name=order.fields.find(f=>/name/i.test(f.name));if(name&&!mapped.includes('field:'+name.id))throw Error('Match the person name column before importing.');
 const identity=(v:Record<string,string|number>)=>(name?[name]:order.fields).map(f=>canonical(String(v['field:'+f.id]??''))).join('|');
 const seen=new Set(order.records.map(r=>identity(r.values)));
 return rows.map((row,i)=>{const changes:Record<string,string|number>={};mapping.forEach((key,n)=>{if(!key)return;const c=cols.get(key);if(!c||key==='_record_id'||key==='_person_id')throw Error('Choose a current order field.');let value=row[n]?.trim()||'';if(c.options?.length&&value){const option=c.options.find(o=>o.toLowerCase()===value.toLowerCase());if(!option)throw Error('Row '+(i+1)+': choose a saved option for '+c.label+'.');value=option;}if(c.numeric&&value&&(!Number.isFinite(Number(value))||(key.endsWith(':assigned_qty')&&(!Number.isInteger(Number(value))||Number(value)<0))))throw Error('Row '+(i+1)+': invalid number for '+c.groupLabel+' / '+c.label+'.');changes[key]=c.numeric&&value?Number(value):value;});
 if(!Object.entries(changes).some(([k,v])=>k.startsWith('field:')&&String(v).trim()))throw Error('Row '+(i+1)+': person details are empty.');if(name&&!String(changes['field:'+name.id]??'').trim())throw Error('Row '+(i+1)+': person name is missing.');
 const recordId=makeId();for(const p of order.products.filter(p=>p.quantityMode!=='order_total')){const key='product:'+p.id+':assigned_qty';if(changes[key]===undefined||changes[key]===''){delete changes[key];changes[key]=quantityForRecord(p,{recordId,personId:'',values:changes});}}
 const key=identity(changes),duplicate=seen.has(key);seen.add(key);return {edit:{recordId,isNew:true,changes,expected:{}} as SheetPersonEdit,duplicate};});
}
