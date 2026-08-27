import { env } from "cloudflare:workers";
import { clearSessionCookie, getSessionIdentity, recordAuthEvent, revokeAllUserSessions, revokeCurrentSession } from "../../../../lib/server-password-auth";

export async function POST(request: Request) {
  const db = env.DB;
  if (!db) return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie(), "cache-control": "no-store" } });

  let all = false;
  try {
    const body = await request.json() as { all?: boolean };
    all = body.all === true;
  } catch {
    // An empty body is a normal single-session logout.
  }

  const identity = await getSessionIdentity(request);
  if (identity) {
    if (all) await revokeAllUserSessions(db, identity.userId);
    else await revokeCurrentSession(db, request);
    await recordAuthEvent(db, request, {
      identifier: identity.email,
      userId: identity.userId,
      email: identity.email,
      event: all ? "logout.all" : "logout",
      success: true,
    });
  }

  return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie(), "cache-control": "no-store" } });
}
