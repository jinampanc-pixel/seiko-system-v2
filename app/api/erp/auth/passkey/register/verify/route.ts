import { verifyPasskeyRegistration, ModernAuthError } from "../../../../../../lib/server-modern-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { challengeId?: string; credential?: unknown; label?: string };
    if (!body.challengeId || !body.credential) return Response.json({ ok: false, code: "PASSKEY_RESPONSE_REQUIRED", message: "Passkey response is missing." }, { status: 400 });
    await verifyPasskeyRegistration(request, { challengeId: body.challengeId, credential: body.credential as never, label: body.label });
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (cause) { return authError(cause); }
}

function authError(cause: unknown) {
  if (cause instanceof ModernAuthError) return Response.json({ ok: false, code: cause.code, message: cause.message }, { status: cause.status });
  console.error("Passkey registration verification failed", cause);
  return Response.json({ ok: false, code: "PASSKEY_REGISTRATION_FAILED", message: "Passkey registration could not be completed." }, { status: 500 });
}
