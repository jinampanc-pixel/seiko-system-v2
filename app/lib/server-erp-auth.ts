import { env } from "cloudflare:workers";

type Actor = {
  userId: string;
  email: string;
  displayName: string;
  source: "chatgpt" | "cloudflare-access";
};

type Membership = {
  businessId: string;
  role: "owner" | "admin" | "operations" | "viewer";
  modules?: string[];
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

export async function authorizeBusiness(
  actor: Actor,
  businessId: string,
  required: "read" | "write" | "admin" = "read",
): Promise<Membership | null> {
  const memberships = await membershipsForActor(actor);
  const membership = memberships.find(item => item.businessId === businessId);
  if (!membership) return null;

  if (required === "admin" && membership.role !== "owner" && membership.role !== "admin") return null;
  if (required === "write" && membership.role === "viewer") return null;
  return membership;
}

async function membershipsForActor(actor: Actor): Promise<Membership[]> {
  const cacheKey = `${actor.userId}:${actor.email}`;
  const cached = membershipCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.memberships;

  const fromD1 = await membershipsFromD1(actor);
  if (fromD1.length) {
    membershipCache.set(cacheKey, { expires: Date.now() + 60_000, memberships: fromD1 });
    return fromD1;
  }

  // Temporary compatibility fallback while existing businesses are migrated.
  // Once all memberships are confirmed in D1 this can be removed cleanly.
  const upstream = process.env.SEIKO_APPS_SCRIPT_URL;
  const apiKey = process.env.SEIKO_API_KEY;
  if (!upstream || !apiKey) return [];

  const response = await fetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "foundationBootstrap",
      businessId: null,
      payload: {},
      actor: { userId: actor.userId, email: actor.email },
      apiKey,
    }),
    cache: "no-store",
  });
  if (!response.ok) return [];

  const result = await response.json() as { ok?: boolean; data?: { businesses?: Membership[] } };
  const memberships = result.ok && Array.isArray(result.data?.businesses) ? result.data!.businesses! : [];
  membershipCache.set(cacheKey, { expires: Date.now() + 60_000, memberships });
  return memberships;
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
      memberships.push({
        businessId: row.business_id,
        role: row.role,
        modules: parseModules(row.modules_json),
      });
    }
    return memberships;
  } catch (cause) {
    // During staged rollout the membership table may not exist yet. Fallback below.
    console.warn("D1 membership lookup unavailable", cause);
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

function isRole(value: string): value is Membership["role"] {
  return value === "owner" || value === "admin" || value === "operations" || value === "viewer";
}

function parseModules(value: string | null): string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : undefined;
  } catch {
    return undefined;
  }
}
