import { env } from "cloudflare:workers";
import { parseAccessConfig, permissionsForRole, type AccessRole, type Permission } from "./access-control";

export type Actor = {
  userId: string;
  email: string;
  displayName: string;
  source: "chatgpt" | "cloudflare-access";
};

export type Membership = {
  businessId: string;
  role: AccessRole;
  modules?: string[];
  permissions?: Permission[];
};

type AccessPayload = {
  aud?: string | string[];
  email?: string;
  sub?: string;
  name?: string;
  exp?: number;
  iss?: string;
};

type JwkSet = { keys?: JsonWebKey[] };

const membershipCache = new Map<string, { expires: number; memberships: Membership[] }>();
const keyCache = new Map<string, { expires: number; keys: JsonWebKey[] }>();

export async function authenticateActor(request: Request): Promise<Actor | null> {
  const chatGptUserId = request.headers.get("oai-authenticated-user-id")?.trim();
  const chatGptEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (chatGptUserId && chatGptEmail) {
    const encodedName = request.headers.get("oai-authenticated-user-full-name")?.trim();
    return {
      userId: chatGptUserId,
      email: chatGptEmail,
      displayName: encodedName ? safeDecode(encodedName) : chatGptEmail,
      source: "chatgpt",
    };
  }

  return authenticateCloudflareAccess(request);
}

export async function getActorMemberships(actor: Actor): Promise<Membership[]> {
  const cacheKey = `${actor.userId}:${actor.email}`;
  const cached = membershipCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.memberships;

  const memberships = await membershipsFromD1(actor);
  membershipCache.set(cacheKey, { expires: Date.now() + 15_000, memberships });
  return memberships;
}

export function clearMembershipCache() {
  membershipCache.clear();
}

export async function authorizeBusiness(
  actor: Actor,
  businessId: string,
  required: "read" | "write" | "admin" = "read",
): Promise<Membership | null> {
  const memberships = await getActorMemberships(actor);
  const membership = memberships.find(item => item.businessId === businessId);
  if (!membership) return null;

  if (required === "admin" && !hasPermission(membership, "settings.manage") && !hasPermission(membership, "users.manage")) return null;
  if (required === "write" && membership.role === "viewer") return null;
  return membership;
}

export async function authorizePermission(actor: Actor, businessId: string, permission: Permission): Promise<Membership | null> {
  const memberships = await getActorMemberships(actor);
  const membership = memberships.find(item => item.businessId === businessId);
  return membership && hasPermission(membership, permission) ? membership : null;
}

export function hasPermission(membership: Membership, permission: Permission): boolean {
  return permissionsForRole(membership.role, membership.permissions).includes(permission);
}

async function membershipsFromD1(actor: Actor): Promise<Membership[]> {
  const db = env.DB;
  if (!db) return [];

  try {
    const result = await db.prepare(
      `SELECT business_id, role, modules_json
         FROM erp_memberships
        WHERE lower(email) = lower(?) AND active = 1
        ORDER BY business_id`,
    ).bind(actor.email).all<{ business_id: string; role: string; modules_json: string | null }>();

    const memberships: Membership[] = [];
    for (const row of result.results || []) {
      if (!isRole(row.role)) continue;
      const config = parseAccessConfig(row.modules_json);
      memberships.push({
        businessId: row.business_id,
        role: row.role,
        modules: config.modules,
        permissions: config.permissions,
      });
    }
    return memberships;
  } catch (cause) {
    console.error("D1 membership lookup failed", cause);
    return [];
  }
}

async function authenticateCloudflareAccess(request: Request): Promise<Actor | null> {
  const token = request.headers.get("cf-access-jwt-assertion")?.trim();
  const teamDomain = normalizeTeamDomain(process.env.CF_ACCESS_TEAM_DOMAIN || "");
  const audience = (process.env.CF_ACCESS_AUD || "").trim();
  if (!token || !teamDomain || !audience) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const header = parseJwtPart<{ alg?: string; kid?: string }>(parts[0]);
  const payload = parseJwtPart<AccessPayload>(parts[1]);
  if (!header || !payload || header.alg !== "RS256" || !header.kid) return null;
  if (!payload.email || !payload.sub || !payload.exp || payload.exp * 1000 <= Date.now()) return null;

  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audiences.includes(audience)) return null;
  if (payload.iss && payload.iss.replace(/\/$/, "") !== teamDomain.replace(/\/$/, "")) return null;

  const keys = await accessKeys(teamDomain);
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) return null;

  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signature = base64UrlBytes(parts[2]);
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed);
    if (!valid) return null;
  } catch {
    return null;
  }

  return {
    userId: payload.sub,
    email: payload.email.toLowerCase(),
    displayName: payload.name || payload.email,
    source: "cloudflare-access",
  };
}

async function accessKeys(teamDomain: string): Promise<JsonWebKey[]> {
  const cached = keyCache.get(teamDomain);
  if (cached && cached.expires > Date.now()) return cached.keys;

  const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`, { cache: "no-store" });
  if (!response.ok) return [];
  const result = await response.json() as JwkSet;
  const keys = Array.isArray(result.keys) ? result.keys : [];
  keyCache.set(teamDomain, { expires: Date.now() + 10 * 60_000, keys });
  return keys;
}

function normalizeTeamDomain(value: string): string {
  const clean = value.trim().replace(/\/$/, "");
  if (!clean) return "";
  return clean.startsWith("https://") ? clean : `https://${clean}`;
}

function parseJwtPart<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlBytes(value))) as T;
  } catch {
    return null;
  }
}

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function safeDecode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function isRole(value: string): value is AccessRole {
  return value === "owner" || value === "admin" || value === "operations" || value === "viewer";
}
