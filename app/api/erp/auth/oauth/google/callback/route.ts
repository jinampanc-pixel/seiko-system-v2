import { finishOAuth, ModernAuthError } from "../../../../../lib/server-modern-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const providerError = url.searchParams.get("error");
  if (providerError) return redirectError(request, "GOOGLE_CANCELLED", "Google sign-in was cancelled.");
  if (!state || !code) return redirectError(request, "GOOGLE_CALLBACK_INVALID", "Google sign-in did not return the required information.");
  try {
    const result = await finishOAuth(request, "google", { state, code });
    const location = new URL("/", request.url);
    if (result.mode === "link") location.searchParams.set("auth_linked", "google");
    const headers = new Headers({ location: location.toString(), "cache-control": "no-store" });
    if (result.cookie) headers.set("set-cookie", result.cookie);
    return new Response(null, { status: 302, headers });
  } catch (cause) {
    if (cause instanceof ModernAuthError) return redirectError(request, cause.code, cause.message);
    console.error("Google callback failed", cause);
    return redirectError(request, "GOOGLE_CALLBACK_FAILED", "Google sign-in could not be completed.");
  }
}

function redirectError(request: Request, code: string, message: string) {
  const location = new URL("/", request.url);
  location.searchParams.set("auth_error", code);
  location.searchParams.set("auth_message", message);
  return Response.redirect(location.toString(), 302);
}
