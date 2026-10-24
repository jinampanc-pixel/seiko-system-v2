import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../lib/server-erp-auth";
import { SheetError, sheetConnectionStatus, beginSheetConnection, createOrderSheet, refreshOrderSheetStructure, orderSheetLink, syncOrderSheet, saveSheetPerson, saveSheetPeople } from "../../../lib/server-order-sheets";
const fail=(message:string,status=400)=>Response.json({ok:false,message},{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:Request){
 if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return fail("Invalid request origin.",403);
 const actor=await authenticateActor(request);if(!actor)return fail("Sign in required.",401);
 if(!await authorizePermission(actor,"seiko","orders.view"))return fail("Order access required.",403);
 const db=env.DB?.withSession("first-primary");if(!db)return fail("Shared storage is unavailable.",503);
 try{
 const text=await request.text();if(text.length>2000000)return fail("Request too large.",413);const body=JSON.parse(text) as {operation?:string;orderId?:string;edits?:import("../../../lib/order-sheet-model").SheetPersonEdit[];edit?:import("../../../lib/order-sheet-model").SheetPersonEdit};
 const membership=await authorizePermission(actor,"seiko","settings.manage"),owner=membership?.role==="owner",canEdit=Boolean(await authorizePermission(actor,"seiko","orders.edit"));
 if(body.operation==="connect"){if(!owner)return fail("The owner must connect the Google account.",403);return Response.json({ok:true,authorizationUrl:await beginSheetConnection(db,actor,request)});}
 if(!["status","create","sync","refresh","save-person","save-people"].includes(body.operation||""))return fail("Choose a sheet action.");
 if(typeof body.orderId!=="string"||!body.orderId||body.orderId.length>128)return fail("Choose an order.");
 const exists=await db.prepare("SELECT id FROM erp_orders WHERE id=? AND business_id='seiko' AND json_extract(document_json,'$.deletedAt') IS NULL").bind(body.orderId).first();if(!exists)return fail("Order not found.",404);
 if(body.operation==="create"){if(!canEdit)return fail("Order edit access is required to create its Google Sheet.",403);await createOrderSheet(db,actor,body.orderId);await syncOrderSheet(db,actor,body.orderId);}
 if(body.operation==="refresh"){if(!canEdit)return fail("Order edit access is required to update sheet columns.",403);await refreshOrderSheetStructure(db,actor,body.orderId);}
 if(body.operation==="save-person"){if(!canEdit)return fail("Order edit access is required to save a person.",403);if(!body.edit||typeof body.edit.changes!=="object"||!body.edit.changes||!body.edit.expected||typeof body.edit.expected!=="object")return fail("Enter person details.");await saveSheetPerson(db,actor,body.orderId,body.edit);}
 if(body.operation==="save-people"){if(!canEdit)return fail("Order edit access is required to import people.",403);if(!Array.isArray(body.edits))return fail("Review the pasted people first.");await saveSheetPeople(db,actor,body.orderId,body.edits);}
 if(body.operation==="sync")await syncOrderSheet(db,actor,body.orderId);
 const link=await orderSheetLink(db,body.orderId),connection=await sheetConnectionStatus(db);
 return Response.json({ok:true,connection,canConnect:owner,canCreate:canEdit,link:link?{id:link.spreadsheet_id,url:link.spreadsheet_url,status:link.status,syncedAt:link.synced_at,error:link.error}:null},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return fail(e instanceof SheetError?e.message:"Google Sheets could not be loaded. Your saved order records remain safe.",e instanceof SheetError?e.status:503);}
}
