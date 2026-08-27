import { authenticateActor, clearMembershipCache, getActorMemberships } from "../../../lib/server-erp-auth";
import { ensurePlatformOwnerBusinesses } from "../../../lib/server-platform-access";
import { buildFoundationBootstrap } from "../../../lib/server-session";

export async function GET(request: Request) {
  const actor = await authenticateActor(request);
  if (!actor) {
    return Response.json({ ok: false, code: "AUTH_REQUIRED", message: "Sign in with the credentials provided by your administrator." }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  if (actor.source === "erp-session" && actor.mustChangePassword) {
    return Response.json({
      ok: false,
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "Create your private password before continuing.",
      data: { user: { displayName: actor.displayName, email: actor.email } },
    }, { status: 428, headers: { "cache-control": "no-store" } });
  }

  await ensurePlatformOwnerBusinesses(actor);
  clearMembershipCache();
  const memberships = await getActorMemberships(actor);
  if (!memberships.length) {
    return Response.json({
      ok: false,
      code: "NO_ACCESS",
      message: "Your account is authenticated but has not been given access to a business yet.",
      data: { user: { displayName: actor.displayName, email: actor.email } },
    }, { status: 403, headers: { "cache-control": "no-store" } });
  }

  return Response.json({ ok: true, data: buildFoundationBootstrap(actor, memberships) }, { headers: { "cache-control": "no-store" } });
}
