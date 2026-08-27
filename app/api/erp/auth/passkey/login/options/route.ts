import { passkeyLoginOptions, ModernAuthError } from "../../../../../../lib/server-modern-auth";

export async function POST(request: Request) {
  try {
    return Response.json({ ok: true, data: await passkeyLoginOptions(request) }, { headers: { "cache-control": "no-store" } });
  } catch (cause) { return authError(cause); }
}

function authError(cause: unknown) {
  if (cause instanceof ModernAuthError) return Response.json({ ok: false, code: cause.code, message: cause.message }, { status: cause.status });
  console.error("Passkey login options failed", cause);
  return Response.json({ ok: false, code: "PASSKEY_OPTIONS_FAILED", message: "Passkey sign-in could not be started." }, { status: 500 });
}
