import { env } from "cloudflare:workers";
import { createSession, findUserByIdentifier, rateLimitStatus, recordAuthEvent, verifyPassword } from "../../../../lib/server-password-auth";

export async function POST(request: Request) {
  const db = env.DB;
  if (!db) return error("ERP_DB_NOT_CONFIGURED", "Shared ERP storage is not connected.", 503);

  let body: { identifier?: string; password?: string };
  try { body = await request.json() as { identifier?: string; password?: string }; }
  catch { return error("INVALID_JSON", "Invalid request.", 400); }

  const identifier = (body.identifier || "").trim();
  const password = body.password || "";
  if (!identifier || !password) return error("CREDENTIALS_REQUIRED", "Enter your email or phone number and password.", 400);

  const isIsolatedShopifyTest = String((env as unknown as { JINAM_ENVIRONMENT?: string }).JINAM_ENVIRONMENT || "") === "shopify-test";
  if (!isIsolatedShopifyTest) {
    const limit = await rateLimitStatus(db, request, identifier);
    if (limit.limited) return error("TOO_MANY_ATTEMPTS", "Too many unsuccessful sign-in attempts. Try again in about 15 minutes.", 429);
  }

  const user = await findUserByIdentifier(db, identifier);
  const valid = await verifyPassword(password, user?.passwordHash || null);
  if (!user || !valid) {
    await recordAuthEvent(db, request, { identifier, userId: user?.id, email: user?.email, event: "login.failed", success: false });
    if (isIsolatedShopifyTest) {
      return !user
        ? error("PREVIEW_USER_NOT_FOUND", "Preview Owner record was not found.", 401)
        : error("PREVIEW_PASSWORD_MISMATCH", "Preview Owner credential did not verify.", 401);
    }
    return error("INVALID_CREDENTIALS", "Email/phone or password is incorrect.", 401);
  }
  if (!user.active) {
    await recordAuthEvent(db, request, { identifier, userId: user.id, email: user.email, event: "login.suspended", success: false });
    return error("ACCOUNT_SUSPENDED", "This ERP account is suspended. Contact your administrator.", 403);
  }

  const membership = await db.prepare(`SELECT 1 AS allowed FROM erp_memberships WHERE lower(email)=lower(?) AND active=1 LIMIT 1`)
    .bind(user.email).first<{ allowed: number }>();
  if (!membership) {
    await recordAuthEvent(db, request, { identifier, userId: user.id, email: user.email, event: "login.no_access", success: false });
    return error("NO_ACCESS", "Your account is valid but has no active business access. Contact your administrator.", 403);
  }

  const session = await createSession(db, user, request);
  const now = new Date().toISOString();
  await db.prepare(`UPDATE erp_users SET last_login_at=?,updated_at=?,updated_by_email=? WHERE id=?`)
    .bind(now, now, user.email, user.id).run();
  await recordAuthEvent(db, request, { identifier, userId: user.id, email: user.email, event: "login.succeeded", success: true });

  return Response.json(
    { ok: true, data: { user: { displayName: user.displayName, email: user.email }, mustChangePassword: user.mustChangePassword } },
    { headers: { "set-cookie": session.cookie, "cache-control": "no-store" } },
  );
}

function error(code: string, message: string, status: number) {
  return Response.json({ ok: false, code, message }, { status, headers: { "cache-control": "no-store" } });
}
