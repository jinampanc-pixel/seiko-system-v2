import { env } from "cloudflare:workers";
import { knownBusinesses } from "./business-catalog";
import type { Actor } from "./server-erp-auth";

const PLATFORM_OWNER_ROLE = "platform-owner";

/**
 * The ERP is one platform containing separate business systems.
 * Business memberships remain the authorization boundary, while this table
 * identifies the founding platform owner who may administer every known business.
 */
export async function ensurePlatformOwnerBusinesses(actor: Actor) {
  const db = env.DB;
  if (!db) return;

  await db.prepare(`CREATE TABLE IF NOT EXISTS erp_platform_roles (
    user_email TEXT PRIMARY KEY NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();

  const existingPlatformOwner = await db.prepare(
    `SELECT user_email FROM erp_platform_roles WHERE role=? LIMIT 1`,
  ).bind(PLATFORM_OWNER_ROLE).first<{ user_email: string }>();

  if (!existingPlatformOwner) {
    const foundingOwner = await db.prepare(
      `SELECT email
         FROM erp_memberships
        WHERE role='owner' AND active=1
        ORDER BY created_at ASC, email ASC
        LIMIT 1`,
    ).first<{ email: string }>();

    if (foundingOwner && foundingOwner.email.toLowerCase() === actor.email.toLowerCase()) {
      const now = new Date().toISOString();
      await db.prepare(
        `INSERT OR IGNORE INTO erp_platform_roles (user_email,role,created_at,updated_at) VALUES (?,?,?,?)`,
      ).bind(actor.email.toLowerCase(), PLATFORM_OWNER_ROLE, now, now).run();
    }
  }

  const platformRole = await db.prepare(
    `SELECT role FROM erp_platform_roles WHERE lower(user_email)=lower(?) LIMIT 1`,
  ).bind(actor.email).first<{ role: string }>();
  if (platformRole?.role !== PLATFORM_OWNER_ROLE) return;

  const now = new Date().toISOString();
  for (const business of knownBusinesses()) {
    const modulesJson = JSON.stringify({ modules: business.defaultModules, permissions: [] });
    await db.prepare(
      `INSERT INTO erp_memberships (
         id,business_id,user_id,email,display_name,role,modules_json,active,
         created_at,created_by_email,updated_at,updated_by_email
       ) VALUES (?,?,?,?,?,'owner',?,1,?,?,?,?)
       ON CONFLICT(business_id,email) DO NOTHING`,
    ).bind(
      crypto.randomUUID(),
      business.businessId,
      actor.userId || null,
      actor.email.toLowerCase(),
      actor.displayName || actor.email,
      modulesJson,
      now,
      actor.email,
      now,
      actor.email,
    ).run();
  }
}
