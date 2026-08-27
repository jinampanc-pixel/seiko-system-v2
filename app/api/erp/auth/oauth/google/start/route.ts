import { beginOAuth, ModernAuthError } from "../../../../../../lib/server-modern-auth";

export async function GET(request: Request) {
  try {
    const mode = new URL(request.url).searchParams.get("mode") === "link" ? "link" : "login";
    return Response.redirect(await beginOAuth(request, "google", mode), 302);
  } catch (cause) { return authError(cause); }
}

function authError(cause: unknown) {
  if (cause instanceof ModernAuthError) return Response.json({ ok: false, code: cause.code, message: cause.message }, { status: cause.status, headers: { "cache-control": "no-store" } });
  console.error("Google sign-in start failed", cause);
  return Response.json({ ok: false, code: "GOOGLE_START_FAILED", message: "Google sign-in could not be started." }, { status: 500 });
}
