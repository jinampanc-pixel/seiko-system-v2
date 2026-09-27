import { env } from "cloudflare:workers";
import { createSession, findUserByIdentifier, getSessionIdentity, recordAuthEvent, revokeAllUserSessions, setPasswordForUser, validatePassword } from "../../../../lib/server-password-auth";

export async function POST(request: Request) {
  try {
    return await changePassword(request);
  } catch (cause) {
    console.error("Password change failed", cause);
    return error("PASSWORD_CHANGE_FAILED", "Password change could not be completed. Try signing in with your new password; if it was not saved, use your temporary password and try again.", 500);
  }
}

async function changePassword(request: Request) {
  const db = env.DB;
  if (!db) return error("ERP_DB_NOT_CONFIGURED", "Shared ERP storage is not connected.", 503);

  const identity = await getSessionIdentity(request);
  if (!identity) return error("AUTH_REQUIRED", "Sign in is required.", 401);

  let body: { newPassword?: string };
  try { body = await request.json() as { newPassword?: string }; }
  catch { return error("INVALID_JSON", "Invalid request.", 400); }

  const newPassword = body.newPassword || "";
  const validation = validatePassword(newPassword);
  if (validation) return error("WEAK_PASSWORD", validation, 400);

  const user = await findUserByIdentifier(db, identity.email);
  if (!user || user.id !== identity.userId) return error("AUTH_REQUIRED", "Your account could not be verified.", 401);

  await setPasswordForUser(db, identity.userId, newPassword, identity.email, false);
  await revokeAllUserSessions(db, identity.userId);
  const refreshed = { ...user, passwordHash: "updated", mustChangePassword: false };
  const session = await createSession(db, refreshed, request);
  await recordAuthEvent(db, request, { identifier: identity.email, userId: identity.userId, email: identity.email, event: "password.changed", success: true });

  return Response.json({ ok: true }, { headers: { "set-cookie": session.cookie, "cache-control": "no-store" } });
}

function error(code: string, message: string, status: number) {
  return Response.json({ ok: false, code, message }, { status, headers: { "cache-control": "no-store" } });
}
