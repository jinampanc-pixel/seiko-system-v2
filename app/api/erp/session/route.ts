import { authenticateActor, getActorMemberships } from "../../../lib/server-erp-auth";
import { buildFoundationBootstrap } from "../../../lib/server-session";

export async function GET(request: Request) {
  const actor = await authenticateActor(request);
  if (!actor) {
    return Response.json({ ok: false, code: "AUTH_REQUIRED", message: "Sign in is required." }, { status: 401 });
  }

  const memberships = await getActorMemberships(actor);
  if (!memberships.length) {
    return Response.json({
      ok: false,
      code: "NO_ACCESS",
      message: "Your account is authenticated but has not been given access to a business yet.",
      data: { user: { displayName: actor.displayName, email: actor.email } },
    }, { status: 403 });
  }

  return Response.json({ ok: true, data: buildFoundationBootstrap(actor, memberships) });
}
