import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../../lib/server-erp-auth";
import { finishSheetConnection, SheetError } from "../../../../lib/server-order-sheets";
export async function GET(request:Request){
 const actor=await authenticateActor(request);if(!actor)return Response.json({ok:false,message:"Sign in before connecting Google Sheets."},{status:401});
 const member=await authorizePermission(actor,"seiko","settings.manage");if(member?.role!=="owner")return Response.json({ok:false,message:"Only the owner can connect Google Sheets."},{status:403});
 const db=env.DB?.withSession("first-primary");if(!db)return Response.json({ok:false,message:"Shared storage unavailable."},{status:503});
 try{await finishSheetConnection(db,actor,request);return Response.redirect(new URL("/?business=seiko&order_sheets=connected",request.url).href,302);}
 catch(e){return Response.json({ok:false,message:e instanceof SheetError?e.message:"Google Sheets connection could not be completed. Return to the app and retry."},{status:e instanceof SheetError?e.status:503,headers:{"Cache-Control":"no-store"}});}
}
