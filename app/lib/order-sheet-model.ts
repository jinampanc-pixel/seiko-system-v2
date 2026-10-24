import { normalizeProductMeasurements, workspaceColumns, type SeikoOrder, type WorkspaceColumn, type OrderRecord } from "./order-domain";
import { packingQuantities } from "./packing-label-model";

export const PEOPLE_SHEET = "People";
export type SheetColumn = WorkspaceColumn & { numeric?: boolean; options?: string[] };
export const RECORD_KEY = "_record_id", PERSON_KEY = "_person_id";
const meta=(id:string,label:string):SheetColumn=>({id,label,groupId:"identity",groupLabel:"Person / record",required:false});
export function orderSheetColumns(order:SeikoOrder):SheetColumn[]{
 const o=normalizeProductMeasurements(order), source=workspaceColumns(o), cols:SheetColumn[]=[meta(RECORD_KEY,"Record ID — leave blank for a new person"),meta(PERSON_KEY,"Person ID"),{...meta("_state","Status"),options:["Active","Awaiting","Hold","Cancelled"]},meta("_batch","Addition / batch"),meta("_size","Confirmed size")];
 for(const c of source){
   if(c.id.includes(":qty")||c.id.includes(":assigned_qty"))continue;
   const f=o.fields.find(f=>`field:${f.id}`===c.id),m=o.measurements.find(m=>c.id.startsWith(`measurement:${m.id}:`));
   cols.push({...c,numeric:f?.type==="number"||m?.type==="number",options:f?.type==="dropdown"?f.options:undefined});
 }
 // All variants have explicit quantity cells. A blank new row uses order defaults;
 // existing assignments are exported from the same resolver used by packing.
 for(const p of o.products.filter(p=>p.quantityMode!=="order_total")){
   const col:SheetColumn={id:`product:${p.id}:assigned_qty`,label:"Quantity (pieces)",groupId:`product:${p.id}`,groupLabel:p.name,required:false,numeric:true};
   const at=cols.findIndex(c=>c.groupId===col.groupId);if(at<0)cols.push(col);else cols.splice(at,0,col);
 }
 return cols;
}
export function orderSheetRows(order:SeikoOrder,columns=orderSheetColumns(order)):(string|number)[][]{
 const q=packingQuantities({...order,records:order.records.map(r=>({...r,held:false})),commerce:{rules:order.commerce?.rules||[],deliveries:order.commerce?.deliveries||[],issues:order.commerce?.issues||[],people:Object.fromEntries(Object.entries(order.commerce?.people||{}).map(([id,p])=>[id,{...p,state:"active"}]))}}), states={active:"Active",awaiting:"Awaiting",hold:"Hold",cancelled:"Cancelled"};
 return order.records.map(r=>columns.map(c=>{
   const p=order.commerce?.people[r.recordId];
   if(c.id===RECORD_KEY)return r.recordId;if(c.id===PERSON_KEY)return r.personId;
   if(c.id==="_state")return r.held?"Hold":order.fields.some(f=>/status|cancel/i.test(f.name)&&/^(cancelled|canceled|removed)$/i.test(String(r.values[`field:${f.id}`]||"")))?"Cancelled":states[p?.state||"active"];
   if(c.id==="_batch")return p?.batch||"";if(c.id==="_size")return p?.readySize||"";
   const match=c.id.match(/^product:(.+):assigned_qty$/);if(match)return q.get(r.recordId)?.[match[1]]||0;
   return r.values[c.id]??"";
 }));
}
export function readOrderSheet(order:SeikoOrder,table:unknown[][],makeId:()=>string){
 if(table.length<3)throw Error("The People sheet headers are missing. Restore the three header rows before syncing.");
 const keys=table[0].map(String);if(new Set(keys.filter(Boolean)).size!==keys.filter(Boolean).length)throw Error("The People sheet contains duplicate column IDs.");
 for(const id of [RECORD_KEY,PERSON_KEY,"_state",...orderSheetColumns(order).filter(c=>c.required).map(c=>c.id)])if(!keys.includes(id))throw Error("A required sheet column is missing. Refresh the sheet structure from order setup.");
 if(keys[0]!==RECORD_KEY||keys[1]!==PERSON_KEY)throw Error("Keep Record ID and Person ID as the first two columns. Their cells preserve each person’s history.");
 const columns=new Map(orderSheetColumns(order).map(c=>[c.id,c])), old=new Map(order.records.map(r=>[r.recordId,r])), seen=new Set<string>(),positions=new Map<string,number>();
 const records:OrderRecord[]=[], people={...(order.commerce?.people||{})}, identities:{row:number;recordId:string;personId:string}[]=[];
 for(let i=3;i<table.length;i++){
   const row=table[i];if(!row.some(v=>v!==null&&v!==undefined&&String(v).trim()))continue;
   if(!keys.some((k,n)=>columns.has(k)&&!k.startsWith("_")&&String(row[n]??"").trim()))throw Error(`Row ${i+1}: enter person details or remove the empty row.`);
   const read=(k:string)=>String(row[keys.indexOf(k)]??"").trim();
   const id=read(RECORD_KEY)||makeId();if(!/^[a-zA-Z0-9:_-]{1,150}$/.test(id)||seen.has(id))throw Error(`Row ${i+1}: duplicate or invalid Record ID. Do not copy hidden IDs when adding a person.`);seen.add(id);
   const prior=old.get(id);if(!prior&&!keys.some((k,n)=>k.startsWith("field:")&&String(row[n]??"").trim()))throw Error(`Row ${i+1}: enter person details before adding quantities or measurements.`);const personId=read(PERSON_KEY)||prior?.personId||`ADD-${id.slice(0,8)}`;
   const state=read("_state").toLowerCase()||"active";if(!["active","awaiting","hold","cancelled"].includes(state))throw Error(`Row ${i+1}: choose Active, Awaiting, Hold or Cancelled.`);
   const values={...(prior?.values||{})};
   keys.forEach((key,n)=>{const c=columns.get(key);if(!c||key.startsWith("_"))return;const raw=row[n]??"";if(typeof raw!=="string"&&typeof raw!=="number"&&raw!==null)throw Error(`Row ${i+1}: invalid cell value.`);const text=String(raw).trim();if(c.numeric&&text!==""&&(!Number.isFinite(Number(text))||(key.endsWith(":assigned_qty")&&(!Number.isInteger(Number(text))||Number(text)<0))))throw Error(`Row ${i+1}: ${c.groupLabel} / ${c.label} must be a valid ${key.endsWith(":assigned_qty")?"whole quantity of zero or more":"number"}.`);if(c.options?.length&&text&&!c.options.includes(text))throw Error(`Row ${i+1}: choose a saved option for ${c.label}.`);if(key.endsWith(":assigned_qty")){delete values[key.replace(":assigned_qty",":qty")];delete values[key.replace(":assigned_qty",":qty_override")];}if(text==="")delete values[key];else values[key]=c.numeric?Number(text):String(raw);});
   for(const f of order.fields.filter(f=>/status|cancel/i.test(f.name)))if(/^(cancelled|canceled|removed)$/i.test(String(values[`field:${f.id}`]||""))&&state==="active")values[`field:${f.id}`]="Active";
   positions.set(id,i);records.push({recordId:id,personId,values,held:state==="hold"});
   people[id]={...people[id],state:state as "active"|"awaiting"|"hold"|"cancelled",reason:people[id]?.reason||(["hold","cancelled"].includes(state)?"Updated in Google Sheets":""),batch:read("_batch"),readySize:read("_size")};
   if(!read(RECORD_KEY)||!read(PERSON_KEY))identities.push({row:i,recordId:id,personId});
 }
 // A deleted spreadsheet row is ambiguous and must never silently remove a charge
 // or delivered person. Explicit cancellation retains their history and ID.
 for(const record of order.records)if(!seen.has(record.recordId))throw Error(`Person ${record.personId} is missing from the sheet. Restore that row and set Status to Cancelled to remove them from active work.`);
 if(new Set(records.map(r=>r.personId.toLowerCase())).size!==records.length)throw Error("Person IDs must be unique. Clear the ID on a new row to let the app assign one.");
 const normalized=normalizeProductMeasurements({...order,records,commerce:{rules:order.commerce?.rules||[],deliveries:order.commerce?.deliveries||[],issues:order.commerce?.issues||[],people}}),defaults=packingQuantities({...normalized,records:records.map(r=>({...r,held:false})),commerce:{...normalized.commerce!,people:Object.fromEntries(Object.entries(people).map(([id,p])=>[id,{...p,state:"active"}]))}}),fills:{row:number;column:number;value:string|number}[]=[];
 for(const r of normalized.records){const row=positions.get(r.recordId)!;for(const c of columns.values()){if(c.id.endsWith(":assigned_qty")&&r.values[c.id]===undefined){const id=c.id.slice(8,-13);const qty=defaults.get(r.recordId)?.[id]||0;r.values[c.id]=qty;fills.push({row,column:keys.indexOf(c.id),value:qty});}}if(!String(table[row]?.[keys.indexOf("_state")]||"").trim())fills.push({row,column:keys.indexOf("_state"),value:"Active"});}
 return {order:normalized,identities,fills};
}

export function sheetCell(value:string|number){return {userEnteredValue:typeof value==="number"?{numberValue:value}:{stringValue:value}};}
export function sheetInitialRequests(order:SeikoOrder){
 const cols=orderSheetColumns(order),rows=[cols.map(c=>c.id),cols.map(c=>c.groupLabel),cols.map(c=>c.label),...orderSheetRows(order,cols)];
 const navy={red:0.09,green:0.23,blue:0.37},gold={red:0.77,green:0.63,blue:0.4};
 const requests:Record<string,unknown>[]=[{updateCells:{start:{sheetId:0,rowIndex:0,columnIndex:0},rows:rows.map(row=>({values:row.map(sheetCell)})),fields:"userEnteredValue"}},{updateSheetProperties:{properties:{sheetId:0,gridProperties:{frozenRowCount:3,frozenColumnCount:2}},fields:"gridProperties.frozenRowCount,gridProperties.frozenColumnCount"}},{updateDimensionProperties:{range:{sheetId:0,dimension:"ROWS",startIndex:0,endIndex:1},properties:{hiddenByUser:true},fields:"hiddenByUser"}},{updateDimensionProperties:{range:{sheetId:0,dimension:"COLUMNS",startIndex:0,endIndex:1},properties:{hiddenByUser:true},fields:"hiddenByUser"}},{repeatCell:{range:{sheetId:0,startRowIndex:1,endRowIndex:3,endColumnIndex:cols.length},cell:{userEnteredFormat:{backgroundColor:navy,textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}},wrapStrategy:"WRAP"}},fields:"userEnteredFormat"}},{repeatCell:{range:{sheetId:0,startRowIndex:3,endColumnIndex:cols.length},cell:{userEnteredFormat:{textFormat:{fontSize:10},verticalAlignment:"MIDDLE"}},fields:"userEnteredFormat"}},{setBasicFilter:{filter:{range:{sheetId:0,startRowIndex:2,endColumnIndex:cols.length}}}},{updateDimensionProperties:{range:{sheetId:0,dimension:"COLUMNS",startIndex:0,endIndex:cols.length},properties:{pixelSize:140},fields:"pixelSize"}},{addProtectedRange:{protectedRange:{range:{sheetId:0,startRowIndex:0,endRowIndex:3},description:"Order structure — change fields and products in the app",warningOnly:true}}},{addProtectedRange:{protectedRange:{range:{sheetId:0,startColumnIndex:0,endColumnIndex:2},description:"Stable record identities — leave blank for new people",warningOnly:true}}}];
 cols.forEach((c,i)=>{if(c.options?.length)requests.push({setDataValidation:{range:{sheetId:0,startRowIndex:3,startColumnIndex:i,endColumnIndex:i+1},rule:{condition:{type:"ONE_OF_LIST",values:c.options.map(userEnteredValue=>({userEnteredValue}))},showCustomUi:true,strict:true}}});});
 const summary=[["Order",order.details.orderNo],["Client",order.details.clientName],["How to use","Edit person records on People. Leave Record ID and Person ID blank for additions. Mark removed people Cancelled; retain their row."],["Sync","Use Sync records in the app before production or billing. The app validates measurement readiness and saved pricing."],["Units","Product quantities are individual pieces: one shirt = 1, one trouser = 1. Package prices are defined separately in the app."],["People listed",order.records.length]];
 requests.push({updateCells:{start:{sheetId:1,rowIndex:0,columnIndex:0},rows:summary.map(row=>({values:row.map(sheetCell)})),fields:"userEnteredValue"}},{repeatCell:{range:{sheetId:1,startColumnIndex:0,endColumnIndex:1},cell:{userEnteredFormat:{backgroundColor:gold,textFormat:{bold:true}}},fields:"userEnteredFormat"}},{updateDimensionProperties:{range:{sheetId:1,dimension:"COLUMNS",startIndex:1,endIndex:2},properties:{pixelSize:650},fields:"pixelSize"}});
 const letter=(index:number)=>{let name="";for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
 const nameCol=letter(Math.max(5,cols.findIndex(c=>c.id.startsWith("field:")))),range=(i:number)=>`'People'!${letter(i)}4:${letter(i)}`,names=`'People'!${nameCol}4:${nameCol}`,statuses=range(cols.findIndex(c=>c.id==="_state"));
 const calculated=[{label:"People listed",formula:`=COUNTIF(${names},"<>")`},{label:"Active people (not a billing count)",formula:`=COUNTIFS(${names},"<>",${statuses},"<>Cancelled",${statuses},"<>Hold",${statuses},"<>Awaiting")`},...cols.map((c,i)=>({c,i})).filter(({c})=>c.id.endsWith(":assigned_qty")).map(({c,i})=>({label:`${c.groupLabel} — active pieces`,formula:`=SUMIFS(${range(i)},${names},"<>",${statuses},"<>Cancelled",${statuses},"<>Hold",${statuses},"<>Awaiting")`}))];
 requests.push({updateCells:{start:{sheetId:1,rowIndex:5,columnIndex:0},rows:calculated.map(row=>({values:[sheetCell(row.label),{userEnteredValue:{formulaValue:row.formula}}]})),fields:"userEnteredValue"}});
 return {requests,columns:cols,rows};
}
