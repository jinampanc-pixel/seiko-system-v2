import { env } from "cloudflare:workers";
import { permissionsForRole, serializeAccessConfig } from "../../../../lib/access-control";
import { ensureAuthSchema, upsertCredentialUser } from "../../../../lib/server-password-auth";
export async function POST(request: Request) {
  try {
    const db = env.DB; if (!db) return fail("ERP_DB_NOT_CONFIGURED", "Shared ERP storage is not connected.", 503);
    let body: { email?: string; displayName?: string; password?: string }; try { body = await request.json(); } catch { return fail("INVALID_JSON", "Invalid request."); }
    const email=(body.email||"").trim().toLowerCase(), password=body.password||"";
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("EMAIL_REQUIRED","Enter a valid email address.");
    if(password.length<12) return fail("PASSWORD_TOO_SHORT","Use at least 12 characters.");
    await ensureAuthSchema(db); const owner=await db.prepare(`SELECT 1 FROM erp_memberships WHERE business_id='seiko' AND role='owner' AND active=1 LIMIT 1`).first();
    if(owner) return fail("BOOTSTRAP_CLOSED","A SEIKO owner already exists. Sign in or ask an owner to add you.",409);
    const now=new Date().toISOString(); const user=await upsertCredentialUser(db,{email,displayName:(body.displayName||"SEIKO Owner").trim(),phone:"",temporaryPassword:password,actorEmail:email});
    const modules=["home","orders","labels","scan","trace","production","billing","admin"];
    await db.prepare(`INSERT INTO erp_memberships (business_id,email,user_id,role,modules_json,permissions_json,active,created_at,created_by_email,updated_at,updated_by_email) VALUES ('seiko',?,?, 'owner', ?, ?, 1, ?, ?, ?, ?) ON CONFLICT(business_id,email) DO UPDATE SET user_id=excluded.user_id,role='owner',permissions_json=excluded.permissions_json,active=1,updated_at=excluded.updated_at,updated_by_email=excluded.updated_by_email`).bind(email,user.userId,JSON.stringify(modules),JSON.stringify(serializeAccessConfig({role:"owner",permissions:permissionsForRole("owner"),modules})),now,email,now,email).run();
    return Response.json({ok:true,message:"SEIKO owner account created. Sign in with your email and password."});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Owner setup failed on the server.";
    return fail("BOOTSTRAP_FAILED", message, 500);
  }
}
function fail(code:string,message:string,status=400){return Response.json({ok:false,code,message},{status,headers:{"cache-control":"no-store"}});}

