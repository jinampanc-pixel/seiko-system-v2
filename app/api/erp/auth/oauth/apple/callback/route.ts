import { finishOAuth, ModernAuthError } from "../../../../../lib/server-modern-auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const state = String(form.get("state") || "");
  const code = String(form.get("code") || "");
  const providerError = String(form.get("error") || "");
  if (providerError) return redirectError(request, "APPLE_CANCELLED", "Apple sign-in was cancelled.");
  if (!state || !code) return redirectError(request, "APPLE_CALLBACK_INVALID", "Apple sign-in did not return the required information.");
  try {
    const result = await finishOAuth(request, "apple", { state, code });
    const location = new URL("/", request.url);
    if (result.mode === "link") location.searchParams.set("auth_linked", "apple");
    const headers = new Headers({ location: location.toString(), "cache-control": "no-store" });
    if (result.cookie) headers.set("set-cookie", result.cookie);
    return new Response(null, { status: 303, headers });
  } catch (cause) {
    if (cause instanceof ModernAuthError) return redirectError(request, cause.code, cause.message);
    console.error("Apple callback failed", cause);
    return redirectError(request, "APPLE_CALLBACK_FAILED", "Apple sign-in could not be completed.");
  }
}

function redirectError(request: Request, code: string, message: string) {
  const location = new URL("/", request.url);
  location.searchParams.set("auth_error", code);
  location.searchParams.set("auth_message", message);
  return Response.redirect(location.toString(), 303);
}
