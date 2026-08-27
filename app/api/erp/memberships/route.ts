import { env } from "cloudflare:workers";
import { MODULES, type Module } from "../../../lib/foundation";
import { PERMISSIONS, isDelegablePermission, isPermission, permissionsForRole, serializeAccessConfig, type AccessRole, type Permission } from "../../../lib/access-control";
import { authenticateActor, authorizePermission, clearMembershipCache } from "../../../lib/server-erp-auth";

type MembershipInput = {
  email?: string;
  displayName?: string;
  role?: AccessRole;
  modules?: Module[];
  permissions?: Permission[];
  active?: boolean;
};

type RequestBody = {
  operation?: "list" | "upsert" | "deactivate";
  businessId?: string;
  membership?: MembershipInput;
  email?: string;
};

const BUSINESS_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES: AccessRole[] = ["owner", "admin", "operations", "viewer"];

export async function POST(request: Request) {
  let body: RequestBody;
  try { body = await request.json() as RequestBody; }
  catch { return error("INVALID_JSON", "Invalid request.", 400); }

  const businessId = body.businessId?.trim() || "";
  if (!BUSINESS_ID.test(businessId)) return error("BUSINESS_REQUIRED", "Select a valid business.", 400);

  const actor = await authenticateActor(request);
  if (!actor) return error("AUTH_REQUIRED", "Sign in is required.", 401);
  const actorMembership = await authorizePermission(actor, businessId, "users.manage");
  if (!actorMembership) return error("FORBIDDEN", "You do not have permission to manage users for this business.", 403);

  const db = env.DB;
  if (!db) return error("ERP_DB_NOT_CONFIGURED", "Shared ERP storage is not connected.", 503);

  if (body.operation === "list") return listMemberships(db, businessId);
  if (body.operation === "upsert") return upsertMembership(db, businessId, actor, actorMembership.role, body.membership);
  if (body.operation === "deactivate") return deactivateMembership(db, businessId, actor, actorMembership.role, body.email);
  return error("INVALID_OPERATION", "Choose a valid operation.", 400);
}

async function listMemberships(db: NonNullable<typeof env.DB>, businessId: string) {
  const result = await db.prepare(
    `SELECT email, display_name, role, modules_json, active, created_at, updated_at, updated_by_email
       FROM erp_memberships WHERE business_id = ?
       ORDER BY active DESC, lower(display_name), lower(email)`,
  ).bind(businessId).all<{
    email: string; display_name: string | null; role: string; modules_json: string | null;
    active: number; created_at: string; updated_at: string; updated_by_email: string;
  }>();

  const users = (result.results || []).map(row => {
    const config = parseConfig(row.modules_json);
    const role = isRole(row.role) ? row.role : "viewer";
    return {
      email: row.email,
      displayName: row.display_name || row.email,
      role,
      modules: config.modules.length ? config.modules : defaultModulesForRole(role),
      permissions: permissionsForRole(role, config.permissions),
      customPermissions: Boolean(config.permissions),
      active: Boolean(row.active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by_email,
    };
  });
  return Response.json({ ok: true, data: { users, permissionKeys: PERMISSIONS, moduleKeys: MODULES } });
}

async function upsertMembership(
  db: NonNullable<typeof env.DB>,
  businessId: string,
  actor: { userId: string; email: string },
  actorRole: AccessRole,
  candidate?: MembershipInput,
) {
  const email = candidate?.email?.trim().toLowerCase() || "";
  const role = candidate?.role;
  if (!EMAIL.test(email) || email.length > 254) return error("INVALID_EMAIL", "Enter a valid email address.", 400);
  if (!role || !ROLES.includes(role)) return error("INVALID_ROLE", "Choose a valid role.", 400);
  if (role === "owner" && actorRole !== "owner") return error("OWNER_REQUIRED", "Only an Owner can grant Owner access.", 403);

  const current = await db.prepare(
    `SELECT role, active FROM erp_memberships WHERE business_id = ? AND lower(email) = lower(?)`,
  ).bind(businessId, email).first<{ role: string; active: number }>();
  if (current?.role === "owner" && actorRole !== "owner") return error("OWNER_REQUIRED", "Only an Owner can change an Owner account.", 403);

  const modules = sanitizeModules(candidate?.modules, role);
  const permissions = role === "owner" ? permissionsForRole("owner") : sanitizePermissions(candidate?.permissions, role);
  const accessConfig = serializeAccessConfig({ modules, permissions });
  const now = new Date().toISOString();
  const displayName = (candidate?.displayName || "").trim().slice(0, 120) || null;
  const active = candidate?.active === false ? 0 : 1;

  if (current?.role === "owner" && active === 0 && await activeOwnerCount(db, businessId) <= 1) {
    return error("LAST_OWNER", "A business must always have at least one active Owner.", 409);
  }

  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO erp_memberships (
       id,business_id,user_id,email,display_name,role,modules_json,active,
       created_at,created_by_email,updated_at,updated_by_email
     ) VALUES (?,?,NULL,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(business_id,email) DO UPDATE SET
       display_name=excluded.display_name,
       role=excluded.role,
       modules_json=excluded.modules_json,
       active=excluded.active,
       updated_at=excluded.updated_at,
       updated_by_email=excluded.updated_by_email`,
  ).bind(
    id, businessId, email, displayName, role, accessConfig, active,
    now, actor.email, now, actor.email,
  ).run();

  await auditMembership(db, businessId, actor, email, current ? "membership.updated" : "membership.created", { email, displayName, role, modules, permissions, active: Boolean(active) });
  clearMembershipCache();
  return Response.json({ ok: true, data: { email } });
}

async function deactivateMembership(
  db: NonNullable<typeof env.DB>,
  businessId: string,
  actor: { userId: string; email: string },
  actorRole: AccessRole,
  rawEmail?: string,
) {
  const email = rawEmail?.trim().toLowerCase() || "";
  if (!EMAIL.test(email)) return error("INVALID_EMAIL", "Choose a valid user.", 400);
  const current = await db.prepare(
    `SELECT role, active FROM erp_memberships WHERE business_id = ? AND lower(email) = lower(?)`,
  ).bind(businessId, email).first<{ role: string; active: number }>();
  if (!current) return error("NOT_FOUND", "This user does not exist.", 404);
  if (current.role === "owner" && actorRole !== "owner") return error("OWNER_REQUIRED", "Only an Owner can deactivate an Owner.", 403);
  if (current.role === "owner" && current.active && await activeOwnerCount(db, businessId) <= 1) {
    return error("LAST_OWNER", "A business must always have at least one active Owner.", 409);
  }

  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE erp_memberships SET active = 0, updated_at = ?, updated_by_email = ?
      WHERE business_id = ? AND lower(email) = lower(?)`,
  ).bind(now, actor.email, businessId, email).run();
  await auditMembership(db, businessId, actor, email, "membership.deactivated", { email, active: false });
  clearMembershipCache();
  return Response.json({ ok: true, data: { email } });
}

async function activeOwnerCount(db: NonNullable<typeof env.DB>, businessId: string) {
  const row = await db.prepare(
    `SELECT count(*) AS count FROM erp_memberships WHERE business_id = ? AND role = 'owner' AND active = 1`,
  ).bind(businessId).first<{ count: number }>();
  return Number(row?.count || 0);
}

async function auditMembership(
  db: NonNullable<typeof env.DB>,
  businessId: string,
  actor: { userId: string; email: string },
  email: string,
  action: string,
  snapshot: unknown,
) {
  await db.prepare(
    `INSERT INTO erp_audit_events (
       id,business_id,entity_type,entity_id,action,version,actor_user_id,actor_email,at,snapshot_json
     ) VALUES (?,?,?,?,?,1,?,?,?,?)`,
  ).bind(crypto.randomUUID(), businessId, "membership", email, action, actor.userId, actor.email, new Date().toISOString(), JSON.stringify(snapshot)).run();
}

function sanitizeModules(value: Module[] | undefined, role: AccessRole): Module[] {
  if (role === "owner") return [...MODULES];
  const source = Array.isArray(value) ? value : defaultModulesForRole(role);
  const modules = source.filter((item): item is Module => (MODULES as readonly string[]).includes(item));
  return [...new Set(["home" as Module, ...modules])];
}

function sanitizePermissions(value: Permission[] | undefined, role: AccessRole): Permission[] {
  if (!Array.isArray(value)) return permissionsForRole(role);
  return [...new Set(value.filter(isPermission).filter(isDelegablePermission))];
}

function defaultModulesForRole(role: AccessRole): Module[] {
  if (role === "owner" || role === "admin") return [...MODULES];
  if (role === "operations") return ["home", "orders", "labels", "scan", "trace", "production", "inventory", "delivery"];
  return ["home", "orders", "labels", "trace"];
}

function parseConfig(raw: string | null): { modules: Module[]; permissions?: Permission[] } {
  if (!raw) return { modules: [] };
  try {
    const value = JSON.parse(raw) as unknown;
    if (Array.isArray(value)) return { modules: value.filter((item): item is Module => (MODULES as readonly string[]).includes(item)) };
    if (!value || typeof value !== "object") return { modules: [] };
    const config = value as { modules?: unknown; permissions?: unknown };
    return {
      modules: Array.isArray(config.modules) ? config.modules.filter((item): item is Module => (MODULES as readonly string[]).includes(item)) : [],
      permissions: Array.isArray(config.permissions) ? config.permissions.filter(isPermission) : undefined,
    };
  } catch { return { modules: [] }; }
}

function isRole(value: string): value is AccessRole {
  return ROLES.includes(value as AccessRole);
}

function error(code: string, message: string, status: number) {
  return Response.json({ ok: false, code, message }, { status });
}
