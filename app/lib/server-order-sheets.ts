import { env } from "cloudflare:workers";
import { orderSheetColumns, orderSheetRows, readOrderSheet, sheetInitialRequests, sheetCell, prepareSheetPersonEdit, sheetLayoutRequests, sheetCountRequests, type SheetPersonEdit } from "./order-sheet-model";
import type { SeikoOrder } from "./order-domain";
import type { Actor } from "./server-erp-auth";
type DB=Pick<NonNullable<typeof env.DB>,"prepare"|"batch">;
type Link={people_sheet_id:number;order_id:string;spreadsheet_id:string|null;spreadsheet_url:string|null;status:string;synced_at:string|null;checked_at:string|null;error:string|null;lease_token:string|null;lease_until:string|null;created_by:string};
type Connection={ciphertext:string;iv:string;account_email:string};
type Token={refreshToken:string;subject:string;email:string};
export class SheetError extends Error { constructor(message:string,public status=409,public code?:string){super(message);} }
const scope="https://www.googleapis.com/auth/drive.file openid email";
const callbackPath="/api/erp/order-sheets/callback";
const b64=(b:ArrayBuffer|Uint8Array)=>Buffer.from(b instanceof Uint8Array?b:new Uint8Array(b)).toString("base64url");
function config(){return {clientId:(process.env.GOOGLE_SHEETS_CLIENT_ID||process.env.GOOGLE_CLIENT_ID||"").trim(),clientSecret:(process.env.GOOGLE_SHEETS_CLIENT_SECRET||process.env.GOOGLE_CLIENT_SECRET||"").trim(),secret:(process.env.JINAM_CONNECTOR_ENCRYPTION_KEY||"").trim()};}
function requireConfig(){const c=config();if(!c.clientId||!c.clientSecret||c.secret.length<32)throw new SheetError("Google Sheets needs its server connection configured by the owner. Your saved order records remain available.",503);return c;}
async function cipherKey(){return crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",new TextEncoder().encode(requireConfig().secret)),"AES-GCM",false,["encrypt","decrypt"]);}
async function encrypt(value:Token){const iv=crypto.getRandomValues(new Uint8Array(12));return {ciphertext:b64(await crypto.subtle.encrypt({name:"AES-GCM",iv},await cipherKey(),new TextEncoder().encode(JSON.stringify(value)))),iv:b64(iv)};}
async function decrypt(row:Connection):Promise<Token>{return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:Buffer.from(row.iv,"base64url")},await cipherKey(),Buffer.from(row.ciphertext,"base64url"))));}
export async function sheetConnectionStatus(db:DB){const c=config(),row=await db.prepare("SELECT account_email FROM seiko_google_connections WHERE business_id='seiko'").first<{account_email:string}>();return {configured:Boolean(c.clientId&&c.clientSecret&&c.secret.length>=32),connected:Boolean(row),accountEmail:row?.account_email||""};}
export async function beginSheetConnection(db:DB,actor:Actor,request:Request){
 const c=requireConfig(),state=b64(crypto.getRandomValues(new Uint8Array(32))),verifier=b64(crypto.getRandomValues(new Uint8Array(48)));
 await db.prepare("DELETE FROM seiko_google_oauth_states WHERE expires_at<? OR used_at IS NOT NULL").bind(new Date().toISOString()).run();
 await db.prepare("INSERT INTO seiko_google_oauth_states(state,actor_id,verifier,expires_at) VALUES(?,?,?,?)").bind(state,actor.userId,verifier,new Date(Date.now()+600000).toISOString()).run();
 const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");url.search=new URLSearchParams({client_id:c.clientId,redirect_uri:new URL(callbackPath,request.url).href,response_type:"code",scope,access_type:"offline",prompt:"consent",state,code_challenge:b64(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier))),code_challenge_method:"S256"}).toString();return url.href;
}
export async function finishSheetConnection(db:DB,actor:Actor,request:Request){
 const c=requireConfig(),url=new URL(request.url),state=url.searchParams.get("state"),code=url.searchParams.get("code");if(!state||!code||url.searchParams.get("error"))throw new SheetError("Google Sheets authorization was cancelled or incomplete.");
 const row=await db.prepare("SELECT verifier FROM seiko_google_oauth_states WHERE state=? AND actor_id=? AND used_at IS NULL AND expires_at>?").bind(state,actor.userId,new Date().toISOString()).first<{verifier:string}>();if(!row)throw new SheetError("This Google connection request expired. Start again from the order workspace.");
 const consumed=await db.prepare("UPDATE seiko_google_oauth_states SET used_at=? WHERE state=? AND actor_id=? AND used_at IS NULL").bind(new Date().toISOString(),state,actor.userId).run();if(!consumed.meta.changes)throw new SheetError("This connection request was already used.");
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:new URL(callbackPath,request.url).href,code,code_verifier:row.verifier,grant_type:"authorization_code"}),signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new SheetError("Google did not complete authorization. Reconnect from the order workspace.");
 const token=await response.json() as {access_token?:string;refresh_token?:string;scope?:string};if(!token.access_token||!token.refresh_token||!token.scope?.split(" ").includes("https://www.googleapis.com/auth/drive.file"))throw new SheetError("Approve access to the order sheets and reconnect to enable updates.");
 const identityResponse=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(25000)});if(!identityResponse.ok)throw new SheetError("Google account could not be verified.");
 const identity=await identityResponse.json() as {sub?:string;email?:string};if(!identity.sub||!identity.email)throw new SheetError("Google account identity was missing.");
 const old=await db.prepare("SELECT ciphertext,iv,account_email FROM seiko_google_connections WHERE business_id='seiko'").first<Connection>();if(old&&(await decrypt(old)).subject!==identity.sub)throw new SheetError("Reconnect the same Google account that owns the existing order sheets.");
 const encrypted=await encrypt({refreshToken:token.refresh_token,subject:identity.sub,email:identity.email});await db.prepare("INSERT INTO seiko_google_connections(business_id,ciphertext,iv,account_email,connected_by,updated_at) VALUES('seiko',?,?,?,?,?) ON CONFLICT(business_id) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,account_email=excluded.account_email,connected_by=excluded.connected_by,updated_at=excluded.updated_at").bind(encrypted.ciphertext,encrypted.iv,identity.email,actor.email,new Date().toISOString()).run();
}
async function accessToken(db:DB){const c=requireConfig(),row=await db.prepare("SELECT ciphertext,iv,account_email FROM seiko_google_connections WHERE business_id='seiko'").first<Connection>();if(!row)throw new SheetError("The owner must connect Google Sheets first.");const token=await decrypt(row);const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:token.refreshToken,grant_type:"refresh_token"}),signal:AbortSignal.timeout(25000)});if(!response.ok)throw new SheetError("Google Sheets access expired or was revoked. Ask the owner to reconnect.");const result=await response.json() as {access_token?:string};if(!result.access_token)throw new SheetError("Google Sheets access could not be refreshed.");return result.access_token;}
async function google(token:string,url:string,body?:unknown){const r=await fetch(url,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw new SheetError(r.status===404||r.status===403?"The linked Google Sheet is unavailable. Check its file access and reconnect the owning Google account.":"Google Sheets is temporarily unavailable. Retry sync; the last saved records remain safe.",503);return r.json();}
export async function orderSheetLink(db:DB,id:string){
 let row=await db.prepare("SELECT * FROM seiko_order_sheets WHERE order_id=?").bind(id).first<Link>();if(row)return row;
 // Portable business backups retain the public sheet link with the order. OAuth
 // credentials are reconnected separately; no secret is added to a business export.
 const source=await db.prepare("SELECT document_json FROM erp_orders WHERE id=? AND business_id='seiko'").bind(id).first<{document_json:string}>();const sheet=source?JSON.parse(source.document_json).googleSheet:null;
 if(sheet?.id&&sheet?.url&&/^[a-zA-Z0-9_-]{3,200}$/.test(sheet.id)){
 await db.prepare("INSERT INTO seiko_order_sheets(order_id,spreadsheet_id,spreadsheet_url,people_sheet_id,status,created_by) VALUES(?,?,?,?,'ready','restored-order-link') ON CONFLICT(order_id) DO NOTHING").bind(id,sheet.id,sheet.url,sheet.peopleSheetId||0).run();row=await db.prepare("SELECT * FROM seiko_order_sheets WHERE order_id=?").bind(id).first<Link>();}
 return row;
}
async function claim(db:DB,id:string,actor:Actor){const token=crypto.randomUUID(),now=new Date().toISOString();const r=await db.prepare("INSERT INTO seiko_order_sheets(order_id,status,lease_token,lease_until,created_by) VALUES(?,'creating',?,?,?) ON CONFLICT(order_id) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until WHERE lease_until IS NULL OR lease_until<?").bind(id,token,new Date(Date.now()+300000).toISOString(),actor.email,now).run();if(!r.meta.changes)throw new SheetError("Another sync is using this order. Your entry is retained; retry shortly.",409,"SHEET_BUSY");return token;}
async function release(db:DB,id:string,lease:string,error?:string){await db.prepare("UPDATE seiko_order_sheets SET lease_token=NULL,lease_until=NULL,error=COALESCE(?,error) WHERE order_id=? AND lease_token=?").bind(error||null,id,lease).run();}
async function orderRow(db:DB,id:string){const row=await db.prepare("SELECT document_json,version FROM erp_orders WHERE id=? AND business_id='seiko' AND json_extract(document_json,'$.deletedAt') IS NULL").bind(id).first<{document_json:string;version:number}>();if(!row)throw new SheetError("Order not found.",404);return {...row,order:JSON.parse(row.document_json) as SeikoOrder};}
export async function createOrderSheet(db:DB,actor:Actor,id:string){
 const lease=await claim(db,id,actor);try{
 const source=await orderRow(db,id),token=await accessToken(db);let link=await orderSheetLink(db,id);
 if(link?.status==="ready"&&link.spreadsheet_id)return link;
 // Drive appProperties provides a recoverable create identity after a lost response.
 const query=encodeURIComponent(`trashed=false and appProperties has { key='jinamOrderId' and value='${id.replace(/'/g,"")}' }`);
 const found=await google(token,`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,webViewLink)&pageSize=2`);
 if(found.files?.length>1)throw new SheetError("More than one order sheet was found. The owner must resolve the duplicate before linking.");
 if(!link?.spreadsheet_id){const file=found.files?.[0]||await google(token,"https://www.googleapis.com/drive/v3/files?fields=id,webViewLink",{name:`${source.order.details.orderNo} · ${source.order.details.clientName}`,mimeType:"application/vnd.google-apps.spreadsheet",appProperties:{jinamOrderId:id}});if(!file.id)throw new SheetError("Google did not return the created sheet ID.");await db.prepare("UPDATE seiko_order_sheets SET spreadsheet_id=?,spreadsheet_url=? WHERE order_id=? AND lease_token=?").bind(file.id,file.webViewLink||`https://docs.google.com/spreadsheets/d/${file.id}/edit`,id,lease).run();link=await orderSheetLink(db,id);}
 if(!link?.spreadsheet_id)throw new SheetError("Order sheet was not linked.");
 const base=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(link.spreadsheet_id)}`;
 const metadata=await google(token,`${base}?fields=sheets.properties`);const existing=metadata.sheets||[];
 // A recovered, populated sheet must be read, never reset over user work.
 if(existing.some((s:{properties:{title:string}})=>s.properties.title==="People")){await markSource(db,actor,id,link);await db.prepare("UPDATE seiko_order_sheets SET status='ready' WHERE order_id=? AND lease_token=?").bind(id,lease).run();return link;}
 const built=sheetInitialRequests(source.order);if(JSON.stringify(built.requests).length>8_000_000)throw new SheetError("This order is too large for a single safe sheet migration. Split it into order batches before connecting.");
 const rows=Math.max(1000,source.order.records.length+100),columns=Math.max(26,orderSheetColumns(source.order).length);
 const peopleId=existing[0]?.properties.sheetId??0,usedIds=new Set(existing.map((x:{properties:{sheetId:number}})=>x.properties.sheetId));let summaryId=1;while(usedIds.has(summaryId))summaryId++;
 const remap=(value:unknown):unknown=>Array.isArray(value)?value.map(remap):value&&typeof value==='object'?Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,v])=>[key,key==='sheetId'?(v===0?peopleId:v===1?summaryId:v):remap(v)])):value;
 const requests:unknown[]=[existing.length?{updateSheetProperties:{properties:{sheetId:peopleId,title:"People",gridProperties:{rowCount:rows,columnCount:columns}},fields:"title,gridProperties.rowCount,gridProperties.columnCount"}}:{addSheet:{properties:{sheetId:peopleId,title:"People",gridProperties:{rowCount:rows,columnCount:columns}}}},{addSheet:{properties:{sheetId:summaryId,title:"Order & totals",gridProperties:{rowCount:1000,columnCount:26}}}},...built.requests.map(remap)];
 await db.prepare("UPDATE seiko_order_sheets SET people_sheet_id=? WHERE order_id=? AND lease_token=?").bind(peopleId,id,lease).run();
 await google(token,`${base}:batchUpdate`,{requests});
 await markSource(db,actor,id,link);
 const now=new Date().toISOString();await db.prepare("UPDATE seiko_order_sheets SET status='ready',synced_at=?,checked_at=?,error=NULL WHERE order_id=? AND lease_token=?").bind(now,now,id,lease).run();
 return await orderSheetLink(db,id);
 }catch(e){await release(db,id,lease,(e as Error).message);throw e;}finally{await db.prepare("UPDATE seiko_order_sheets SET lease_token=NULL,lease_until=NULL WHERE order_id=? AND lease_token=?").bind(id,lease).run();}
}
async function markSource(db:DB,actor:Actor,id:string,link:Link){
 const source=await orderRow(db,id);if(source.order.googleSheet?.id===link.spreadsheet_id)return;
 const now=new Date().toISOString(),saved={...source.order,googleSheet:{id:link.spreadsheet_id!,url:link.spreadsheet_url!,peopleSheetId:link.people_sheet_id},updatedAt:now};
 const result=await db.prepare("UPDATE erp_orders SET document_json=?,version=version+1,updated_at=?,updated_by_user_id=?,updated_by_email=? WHERE id=? AND version=?").bind(JSON.stringify(saved),now,actor.userId,actor.email,id,source.version).run();if(!result.meta.changes)throw new SheetError("The order changed while its sheet was linking. Retry to retain the newest order.");
}
/** Bring new rule result/exception columns across once, without repeatedly resetting a user's sheet layout. */
export async function prepareOrderSheet(db:DB,actor:Actor,id:string){const link=await orderSheetLink(db,id);if(!link?.spreadsheet_id)return null;const source=await orderRow(db,id),token=await accessToken(db),base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(link.spreadsheet_id);const header=await google(token,base+'/values/People!1:3?valueRenderOption=UNFORMATTED_VALUE'),keys=(header.values?.[0]||[]).map(String);if(orderSheetColumns(source.order).some((c,i)=>keys[i]!==c.id||header.values?.[2]?.[i]!==c.label))return refreshOrderSheetStructure(db,actor,id);return syncOrderSheet(db,actor,id);}
export async function refreshOrderSheetStructure(db:DB,actor:Actor,id:string){
 const link=await orderSheetLink(db,id);if(!link?.spreadsheet_id)throw new SheetError("Create this order’s Google Sheet first.");
 const lease=await claim(db,id,actor);try{
 const source=await orderRow(db,id),token=await accessToken(db),base=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(link.spreadsheet_id)}`;
 const header=await google(token,`${base}/values/People!1:3?valueRenderOption=UNFORMATTED_VALUE`),keys:string[]=(header.values?.[0]||[]).map(String);
 if(keys[0]!=="_record_id"||keys[1]!=="_person_id"||new Set(keys.filter(Boolean)).size!==keys.filter(Boolean).length)throw new SheetError("Restore the People header and its first two identity columns before updating the sheet structure.");
 const cols=orderSheetColumns(source.order),missing=cols.filter(c=>!keys.includes(c.id)),all=[...cols.map(c=>c.id),...keys.filter(k=>!cols.some(c=>c.id===k))],known=new Map(cols.map(c=>[c.id,c]));
 const metadata=await google(token,`${base}?fields=sheets.properties`),grid=metadata.sheets.find((s:{properties:{sheetId:number}})=>s.properties.sheetId===link.people_sheet_id)?.properties.gridProperties;
 if(!grid)throw new SheetError("The People worksheet could not be found.");
 const requests:unknown[]=[];if(all.length>grid.columnCount)requests.push({updateSheetProperties:{properties:{sheetId:link.people_sheet_id,gridProperties:{columnCount:all.length}},fields:"gridProperties.columnCount"}});
 const rows=[all,all.map(key=>known.get(key)?.groupLabel||header.values?.[1]?.[keys.indexOf(key)]||""),all.map(key=>known.get(key)?.label||header.values?.[2]?.[keys.indexOf(key)]||"")];
 requests.push({unmergeCells:{range:{sheetId:link.people_sheet_id,startRowIndex:1,endRowIndex:2,startColumnIndex:0,endColumnIndex:all.length}}});
 const currentKeys=[...keys,...missing.map(c=>c.id)];for(let target=0;target<all.length;target++){const from=currentKeys.indexOf(all[target]);if(from!==target){requests.push({moveDimension:{source:{sheetId:link.people_sheet_id,dimension:"COLUMNS",startIndex:from,endIndex:from+1},destinationIndex:target}});currentKeys.splice(target,0,currentKeys.splice(from,1)[0]);}}
 requests.push({updateCells:{start:{sheetId:link.people_sheet_id,rowIndex:0,columnIndex:0},rows:rows.map(row=>({values:row.map(sheetCell)})),fields:"userEnteredValue"}});
 requests.push(...sheetLayoutRequests(all.map(id=>known.get(id)||{id,label:id,groupId:id,groupLabel:id,required:false}),link.people_sheet_id,source.order));
 const summary=metadata.sheets.find((s:{properties:{title:string;sheetId:number}})=>s.properties.title==='Order & totals');if(summary)requests.push(...sheetCountRequests(source.order,all.map(id=>known.get(id)||{id,label:id,groupId:id,groupLabel:id,required:false}),summary.properties.sheetId));
 await google(token,`${base}:batchUpdate`,{requests});
 await db.prepare("UPDATE seiko_order_sheets SET error=NULL WHERE order_id=? AND lease_token=?").bind(id,lease).run();
 }catch(e){await release(db,id,lease,(e as Error).message);throw e;}finally{await release(db,id,lease);}
 return syncOrderSheet(db,actor,id);
}
export async function syncOrderSheet(db:DB,actor:Actor,id:string,force=true,existingToken?:string,existingLease?:string){
 const before=await orderSheetLink(db,id);if(!before?.spreadsheet_id)return null;
 if(!force&&before.checked_at&&Date.now()-Date.parse(before.checked_at)<60000){if(before.error)throw new SheetError(before.error);return null;}
 const lease=existingLease||await claim(db,id,actor);try{
 const source=await orderRow(db,id),deleted=new Set((await deletedSheetPeople(db,id)).map(p=>p.recordId));
 const pendingDeletion=source.order.records.filter(r=>deleted.has(r.recordId));
 const productionVersion=pendingDeletion.length?(await db.prepare("SELECT version FROM jinam_shared_records WHERE scope='seiko' AND collection='production-handoffs-v1' AND id='ledger'").first<{version:number}>())?.version||0:null;
 for(const record of pendingDeletion)if(await sheetPersonHasHistory(db,source.order,record.recordId))throw new SheetError("This entry acquired linked history while deletion was in progress. Restore it from Deleted entries to retain that history.");
 const importOrder={...source.order,records:source.order.records.filter(r=>!deleted.has(r.recordId))};
 const token=existingToken||await accessToken(db),base=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(before.spreadsheet_id)}`;
 const result=await google(token,`${base}/values/People?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
 const table:unknown[][]=(result.values||[]).map((row:unknown[],index:number)=>index>=3&&deleted.has(String(row[0]))?[]:row);if(table.some(row=>row.some(v=>typeof v==="string"&&/^#(REF!|VALUE!|DIV\/0!|N\/A|ERROR!|NAME\?|NUM!)/.test(v))))throw new SheetError("Resolve formula errors in People before syncing. No app records were changed.");
 let parsed:ReturnType<typeof readOrderSheet>;try{parsed=readOrderSheet(importOrder,table,()=>crypto.randomUUID());}catch(e){throw new SheetError((e as Error).message);}
 if(parsed.identities.length||parsed.fills.length)await google(token,`${base}:batchUpdate`,{requests:parsed.identities.map(r=>({updateCells:{start:{sheetId:before.people_sheet_id,rowIndex:r.row,columnIndex:0},rows:[{values:[sheetCell(r.recordId),sheetCell(r.personId)]}],fields:"userEnteredValue"}})).concat(parsed.fills.map(f=>({updateCells:{start:{sheetId:before.people_sheet_id,rowIndex:f.row,columnIndex:f.column},rows:[{values:[sheetCell(f.value)]}],fields:"userEnteredValue"}})))});
 const changed=JSON.stringify(parsed.order.records)!==JSON.stringify(source.order.records)||JSON.stringify(parsed.order.commerce?.people)!==JSON.stringify(source.order.commerce?.people);
 const now=new Date().toISOString();if(changed){const saved={...parsed.order,updatedAt:now,revisions:[...(source.order.revisions||[]),{revision:(source.order.revisions?.length||0)+1,at:now,reason:"Person records synchronized from Google Sheets",recordCount:parsed.order.records.length}]};const json=JSON.stringify(saved);const write=await db.prepare("UPDATE erp_orders SET document_json=?,version=version+1,updated_at=?,updated_by_user_id=?,updated_by_email=? WHERE id=? AND version=? AND document_json=? AND EXISTS(SELECT 1 FROM seiko_order_sheets WHERE order_id=? AND lease_token=?) AND (? IS NULL OR COALESCE((SELECT version FROM jinam_shared_records WHERE scope='seiko' AND collection='production-handoffs-v1' AND id='ledger'),0)=?)").bind(json,now,actor.userId,actor.email,id,source.version,source.document_json,id,lease,productionVersion,productionVersion).run();if(!write.meta.changes)throw new SheetError("The order changed while Sheets was syncing. Retry to merge with the latest saved order.");}
 await db.prepare("UPDATE seiko_order_sheets SET status='ready',synced_at=?,checked_at=?,error=NULL WHERE order_id=? AND lease_token=?").bind(now,now,id,lease).run();return await orderRow(db,id);
 }catch(e){await release(db,id,lease,(e as Error).message);throw e;}finally{if(!existingLease)await release(db,id,lease);}
}

export async function saveSheetPerson(db:DB,actor:Actor,id:string,edit:SheetPersonEdit){
 const link=await orderSheetLink(db,id);if(!link?.spreadsheet_id)throw new SheetError("Connect this order’s Google Sheet before entering measurements.");
 const lease=await claim(db,id,actor);try{
  if((await deletedSheetPeople(db,id)).some(p=>p.recordId===edit.recordId))throw new SheetError("This entry was deleted. Restore it from Deleted entries before editing.");
  const source=await orderRow(db,id),token=await accessToken(db),base=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(link.spreadsheet_id)}`;
  const result=await google(token,base+"/values/People?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING");
  let editPlan:ReturnType<typeof prepareSheetPersonEdit>;try{editPlan=prepareSheetPersonEdit(source.order,result.values||[],edit);}catch(e){throw new SheetError((e as Error).message);}
  const requests=editPlan.adding?[{appendCells:{sheetId:link.people_sheet_id,rows:[{values:Array.from(editPlan.values,v=>sheetCell(typeof v==="number"?v:String(v??"")))}],fields:"userEnteredValue"}}]:editPlan.updates.map(u=>({updateCells:{start:{sheetId:link.people_sheet_id,rowIndex:editPlan.row,columnIndex:u.column},rows:[{values:[sheetCell(u.value)]}],fields:"userEnteredValue"}}));
  if(requests.length)await google(token,base+":batchUpdate",{requests});
  // Keep the lease through confirmation. A retry reuses the same person identity
  // if the sheet write succeeded but its confirmation was interrupted.
  return await syncOrderSheet(db,actor,id,true,token,lease);
 }catch(e){await release(db,id,lease,(e as Error).message);throw e;}finally{await release(db,id,lease);}
}


const personTrashCollection="order-person-trash-v1";
type DeletedPerson={orderId:string;recordId:string;name:string;cells:Record<string,string|number>;enteredValues?:Record<string,Record<string,unknown>>;record:SeikoOrder["records"][number];deletedAt:string;deletedBy:string;restoredAt?:string};
export async function deletedSheetPeople(db:DB,id:string){
 const rows=await db.prepare("SELECT document_json FROM jinam_shared_records WHERE scope='seiko' AND collection=? AND json_extract(document_json,'$.orderId')=? AND json_extract(document_json,'$.restoredAt') IS NULL ORDER BY updated_at DESC").bind(personTrashCollection,id).all<{document_json:string}>();return rows.results.map(row=>JSON.parse(row.document_json) as DeletedPerson);
}
async function storeDeletedPerson(db:DB,actor:Actor,person:DeletedPerson){const now=new Date().toISOString();await db.prepare("INSERT INTO jinam_shared_records(scope,collection,id,document_json,version,created_at,updated_at,updated_by_user_id,updated_by_email) VALUES('seiko',?,?,?,1,?,?,?,?) ON CONFLICT(scope,collection,id) DO UPDATE SET document_json=excluded.document_json,version=jinam_shared_records.version+1,updated_at=excluded.updated_at,updated_by_user_id=excluded.updated_by_user_id,updated_by_email=excluded.updated_by_email").bind(personTrashCollection,person.orderId+':'+person.recordId,JSON.stringify(person),now,now,actor.userId,actor.email).run();}
async function sheetPersonHasHistory(db:DB,order:SeikoOrder,recordId:string){const id=order.orderId,commerce=order.commerce,billingTable=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='seiko_billing_documents'").first();return Boolean(commerce?.deliveries.some(d=>d.recordId===recordId)||commerce?.issues.some(i=>i.recordId===recordId)||billingTable&&await db.prepare("SELECT id FROM seiko_billing_documents WHERE json_extract(data,'$.orderId')=? AND EXISTS(SELECT 1 FROM json_tree(data) j WHERE j.key='recordId' AND j.value=?) LIMIT 1").bind(id,recordId).first()||await db.prepare("SELECT id FROM jinam_shared_records WHERE scope='seiko' AND collection='production-handoffs-v1' AND json_extract(document_json,'$.status')!='Cancelled' AND EXISTS(SELECT 1 FROM json_each(document_json,'$.allocations') a WHERE json_extract(a.value,'$.orderId')=? AND EXISTS(SELECT 1 FROM json_tree(a.value) j WHERE j.key='recordId' AND j.value=?)) LIMIT 1").bind(id,recordId).first());}
export async function deleteSheetPerson(db:DB,actor:Actor,id:string,edit:SheetPersonEdit){
 const lease=await claim(db,id,actor);try{
  if(!/^[a-zA-Z0-9:_-]{1,150}$/.test(edit.recordId))throw new SheetError("Choose a person entry.");
  const source=await orderRow(db,id),link=await orderSheetLink(db,id);if(!link?.spreadsheet_id)throw new SheetError("This order has no connected sheet.");
  const token=await accessToken(db),base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(link.spreadsheet_id),result=await google(token,base+'/values/People?valueRenderOption=UNFORMATTED_VALUE'),table:unknown[][]=result.values||[],keys=(table[0]||[]).map(String),row=table.findIndex((r,i)=>i>=3&&r[0]===edit.recordId),archived=(await deletedSheetPeople(db,id)).find(p=>p.recordId===edit.recordId);
  if(keys[0]!=="_record_id"||keys[1]!=="_person_id")throw new SheetError("Restore the sheet identity headers before deleting an entry.");
  if(row<0&&!archived)throw new SheetError("This entry changed or was removed. Refresh and review before deleting.");
  if(row>=0){
   const columns=new Map(orderSheetColumns(source.order).map(c=>[c.id,c]));const emptyRow=!keys.some((key,i)=>columns.has(key)&&!key.startsWith('_')&&String(table[row][i]??'').trim());for(const [key,value] of Object.entries(emptyRow?{}:edit.expected||{})){const c=columns.get(key);if(!c||c.derived||key==='_record_id'||key==='_person_id')continue;if(String(table[row][keys.indexOf(key)]??'')!==String(value??''))throw new SheetError("This person changed after it was opened. Reopen the entry before deleting.");}
   const linkedHistory=await sheetPersonHasHistory(db,source.order,edit.recordId);
   if(linkedHistory)throw new SheetError("This entry has production, delivery, issue or billing history. Use Order management to cancel/remove it while keeping that history.");
   if(!archived){const cellSnapshot=await google(token,base+'?ranges='+encodeURIComponent("'People'!"+(row+1)+':'+(row+1))+'&includeGridData=true&fields=sheets(data(rowData(values(userEnteredValue))))');const entered=cellSnapshot.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values||[];const enteredValues=Object.fromEntries(keys.map((key,i)=>[key,entered[i]||{}]));const record=source.order.records.find(r=>r.recordId===edit.recordId)||{recordId:edit.recordId,personId:String(table[row][1]||''),values:{}};if(emptyRow){const restoreColumns=orderSheetColumns(source.order),restoreRow=orderSheetRows({...source.order,records:[record]},restoreColumns)[0];restoreColumns.forEach((c,i)=>{enteredValues[c.id]=sheetCell(restoreRow[i]??'');});}const nameField=source.order.fields.find(f=>/name/i.test(f.name))||source.order.fields[0];await storeDeletedPerson(db,actor,{orderId:id,recordId:edit.recordId,name:String(table[row][keys.indexOf('field:'+nameField?.id)]||record.personId||'Unnamed entry'),enteredValues,cells:Object.fromEntries(keys.map((key,i)=>[key,(table[row][i]??'') as string|number])),record,deletedAt:new Date().toISOString(),deletedBy:actor.email});}
   await google(token,base+':batchUpdate',{requests:[{deleteDimension:{range:{sheetId:link.people_sheet_id,dimension:'ROWS',startIndex:row,endIndex:row+1}}}]});
  }
  return await syncOrderSheet(db,actor,id,true,token,lease);
 }catch(e){await release(db,id,lease,(e as Error).message);throw e;}finally{await release(db,id,lease);}
}
export async function restoreSheetPerson(db:DB,actor:Actor,id:string,recordId:string){
 const lease=await claim(db,id,actor);try{
  const archived=(await deletedSheetPeople(db,id)).find(p=>p.recordId===recordId);if(!archived)throw new SheetError("This entry is no longer in Deleted entries. Refresh the order.");const link=await orderSheetLink(db,id);if(!link?.spreadsheet_id)throw new SheetError("This order has no connected sheet.");
  const token=await accessToken(db),base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(link.spreadsheet_id),result=await google(token,base+'/values/People?valueRenderOption=UNFORMATTED_VALUE'),table:unknown[][]=result.values||[],keys=(table[0]||[]).map(String);if(keys[0]!=='_record_id'||keys[1]!=='_person_id')throw new SheetError("Restore the sheet identity headers before restoring an entry.");
  if(!table.some((r,i)=>i>=3&&r[0]===recordId))await google(token,base+':batchUpdate',{requests:[{appendCells:{sheetId:link.people_sheet_id,rows:[{values:keys.map(key=>archived.enteredValues?.[key]||sheetCell(archived.cells[key]??''))}],fields:'userEnteredValue'}}]});
  await storeDeletedPerson(db,actor,{...archived,restoredAt:new Date().toISOString()});return await syncOrderSheet(db,actor,id,true,token,lease);
 }catch(e){await release(db,id,lease,(e as Error).message);throw e;}finally{await release(db,id,lease);}
}
