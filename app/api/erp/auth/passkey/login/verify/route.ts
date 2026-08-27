import { verifyPasskeyLogin, ModernAuthError } from "../../../../../../lib/server-modern-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { challengeId?: string; credential?: unknown };
    if (!body.challengeId || !body.credential) return Response.json({ ok: false, code: "PASSKEY_RESPONSE_REQUIRED", message: "Passkey response is missing." }, { status: 400 });
    const result = await verifyPasskeyLogin(request, { challengeId: body.challengeId, credential: body.credential as never });
    return Response.json({ ok: true, data: { user: { email: result.user.email, displayName: result.user.displayName } } }, { headers: { "set-cookie": result.cookie, "cache-control": "no-store" } });
  } catch (cause) { return authError(cause); }
}

function authError(cause: unknown) {
  if (cause instanceof ModernAuthError) return Response.json({ ok: false, code: cause.code, message: cause.message }, { status: cause.status });
  console.error("Passkey login verification failed", cause);
  return Response.json({ ok: false, code: "PASSKEY_LOGIN_FAILED", message: "Passkey sign-in could not be completed." }, { status: 500 });
}
