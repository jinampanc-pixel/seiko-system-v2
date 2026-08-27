import { modernAuthMethods, removePasskey, unlinkIdentity, ModernAuthError, type OAuthProvider } from "../../../../lib/server-modern-auth";

export async function GET(request: Request) {
  try {
    return Response.json({ ok: true, data: await modernAuthMethods(request) }, { headers: { "cache-control": "no-store" } });
  } catch (cause) { return authError(cause); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { operation?: string; provider?: string; passkeyId?: string };
    if (body.operation === "unlink" && (body.provider === "google" || body.provider === "apple")) {
      await unlinkIdentity(request, body.provider as OAuthProvider);
      return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }
    if (body.operation === "remove-passkey" && body.passkeyId) {
      await removePasskey(request, body.passkeyId);
      return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }
    return Response.json({ ok: false, code: "INVALID_OPERATION", message: "Unknown sign-in method operation." }, { status: 400 });
  } catch (cause) { return authError(cause); }
}

function authError(cause: unknown) {
  if (cause instanceof ModernAuthError) return Response.json({ ok: false, code: cause.code, message: cause.message }, { status: cause.status, headers: { "cache-control": "no-store" } });
  console.error("Sign-in method request failed", cause);
  return Response.json({ ok: false, code: "AUTH_METHOD_FAILED", message: "The sign-in method could not be updated." }, { status: 500, headers: { "cache-control": "no-store" } });
}
