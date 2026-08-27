import { env } from "cloudflare:workers";

const SESSION_COOKIE = "jinam_erp_session";
const PASSWORD_ALGORITHM = "PBKDF2-SHA256";
const PASSWORD_ITERATIONS = 600_000;
const PASSWORD_MIN_LENGTH = 12;
const SESSION_HOURS = 12;
const IDENTITY_FAILURE_LIMIT = 6;
const IP_FAILURE_LIMIT = 24;
const RATE_WINDOW_MINUTES = 15;

export type PasswordUser = {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  passwordHash: string | null;
  mustChangePassword: boolean;
  active: boolean;
};

export type SessionIdentity = {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
};

export async function ensureAuthSchema(db: NonNullable<typeof env.DB>) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS erp_users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      phone_e164 TEXT,
      display_name TEXT,
      password_hash TEXT,
      must_change_password INTEGER DEFAULT 1 NOT NULL,
      active INTEGER DEFAULT 1 NOT NULL,
      password_updated_at TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      created_by_email TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by_email TEXT NOT NULL
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS erp_users_email_uq ON erp_users(email)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS erp_users_phone_uq ON erp_users(phone_e164)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS erp_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      user_agent TEXT
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS erp_sessions_token_uq ON erp_sessions(token_hash)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS erp_sessions_user_active_idx ON erp_sessions(user_id,revoked_at,expires_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS erp_auth_events (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,
      email TEXT,
      identifier_hash TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      event TEXT NOT NULL,
      success INTEGER DEFAULT 0 NOT NULL,
      at TEXT NOT NULL,
      details_json TEXT
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS erp_auth_events_identifier_idx ON erp_auth_events(identifier_hash,at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS erp_auth_events_ip_idx ON erp_auth_events(ip_hash,at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS erp_auth_events_user_idx ON erp_auth_events(user_id,at)`),
  ]);
}

export function normalizePhone(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  const compact = raw.replace(/[\s().-]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  if (/^[6-9]\d{9}$/.test(compact)) return `+91${compact}`;
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const validation = validatePassword(password);
  if (validation) throw new Error(validation);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `${PASSWORD_ALGORITHM}$${PASSWORD_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  if (!encoded) {
    // Keep unknown/non-credentialled accounts close to the same computational cost.
    await derivePassword(password || "invalid", new TextEncoder().encode("jinam-dummy-salt"), PASSWORD_ITERATIONS);
    return false;
  }
  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== PASSWORD_ALGORITHM) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 2_000_000) return false;
  try {
    const salt = fromBase64Url(parts[2]);
    const expected = fromBase64Url(parts[3]);
    const actual = await derivePassword(password, salt, iterations);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function findUserByIdentifier(db: NonNullable<typeof env.DB>, identifier: string): Promise<PasswordUser | null> {
  await ensureAuthSchema(db);
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) return null;
  const row = await db.prepare(
    normalized.kind === "email"
      ? `SELECT id,email,phone_e164,display_name,password_hash,must_change_password,active FROM erp_users WHERE lower(email)=lower(?)`
      : `SELECT id,email,phone_e164,display_name,password_hash,must_change_password,active FROM erp_users WHERE phone_e164=?`,
  ).bind(normalized.value).first<{
    id: string; email: string; phone_e164: string | null; display_name: string | null;
    password_hash: string | null; must_change_password: number; active: number;
  }>();
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    phone: row.phone_e164,
    displayName: row.display_name || row.email,
    passwordHash: row.password_hash,
    mustChangePassword: Boolean(row.must_change_password),
    active: Boolean(row.active),
  };
}

export async function rateLimitStatus(db: NonNullable<typeof env.DB>, request: Request, identifier: string) {
  await ensureAuthSchema(db);
  const identifierHash = await sha256(normalizeIdentifier(identifier)?.value || identifier.trim().toLowerCase());
  const ipHash = await requestIpHash(request);
  const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString();
  const [identity, ip] = await Promise.all([
    db.prepare(`SELECT count(*) AS count FROM erp_auth_events WHERE identifier_hash=? AND success=0 AND at>=?`).bind(identifierHash, since).first<{ count: number }>(),
    db.prepare(`SELECT count(*) AS count FROM erp_auth_events WHERE ip_hash=? AND success=0 AND at>=?`).bind(ipHash, since).first<{ count: number }>(),
  ]);
  return {
    limited: Number(identity?.count || 0) >= IDENTITY_FAILURE_LIMIT || Number(ip?.count || 0) >= IP_FAILURE_LIMIT,
    identifierHash,
    ipHash,
  };
}

export async function recordAuthEvent(
  db: NonNullable<typeof env.DB>,
  request: Request,
  input: { identifier: string; userId?: string | null; email?: string | null; event: string; success: boolean; details?: unknown },
) {
  await ensureAuthSchema(db);
  const normalized = normalizeIdentifier(input.identifier)?.value || input.identifier.trim().toLowerCase();
  const identifierHash = await sha256(normalized);
  const ipHash = await requestIpHash(request);
  await db.prepare(`INSERT INTO erp_auth_events (id,user_id,email,identifier_hash,ip_hash,event,success,at,details_json) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(
      crypto.randomUUID(), input.userId || null, input.email || null, identifierHash, ipHash,
      input.event, input.success ? 1 : 0, new Date().toISOString(), input.details === undefined ? null : JSON.stringify(input.details),
    ).run();
}

export async function createSession(db: NonNullable<typeof env.DB>, user: PasswordUser, request: Request) {
  await ensureAuthSchema(db);
  const rawToken = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(rawToken);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_HOURS * 60 * 60_000);
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO erp_sessions (id,user_id,token_hash,created_at,last_seen_at,expires_at,revoked_at,user_agent) VALUES (?,?,?,?,?,?,NULL,?)`)
    .bind(id, user.id, tokenHash, now.toISOString(), now.toISOString(), expires.toISOString(), (request.headers.get("user-agent") || "").slice(0, 300) || null)
    .run();
  return { id, rawToken, cookie: sessionCookie(rawToken, Math.floor((expires.getTime() - now.getTime()) / 1000)) };
}

export async function getSessionIdentity(request: Request): Promise<SessionIdentity | null> {
  const db = env.DB;
  if (!db) return null;
  await ensureAuthSchema(db);
  const raw = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!raw) return null;
  const tokenHash = await sha256(raw);
  const now = new Date().toISOString();
  const row = await db.prepare(`
    SELECT s.id AS session_id,u.id AS user_id,u.email,u.display_name,u.must_change_password,u.active,s.last_seen_at
      FROM erp_sessions s
      JOIN erp_users u ON u.id=s.user_id
     WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.active=1
  `).bind(tokenHash, now).first<{
    session_id: string; user_id: string; email: string; display_name: string | null;
    must_change_password: number; active: number; last_seen_at: string;
  }>();
  if (!row) return null;

  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
    await db.prepare(`UPDATE erp_sessions SET last_seen_at=? WHERE id=?`).bind(now, row.session_id).run();
  }
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name || row.email,
    mustChangePassword: Boolean(row.must_change_password),
  };
}

export async function setPasswordForUser(
  db: NonNullable<typeof env.DB>,
  userId: string,
  password: string,
  actorEmail: string,
  mustChangePassword: boolean,
) {
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  await db.prepare(`UPDATE erp_users SET password_hash=?,must_change_password=?,password_updated_at=?,updated_at=?,updated_by_email=? WHERE id=?`)
    .bind(passwordHash, mustChangePassword ? 1 : 0, now, now, actorEmail, userId).run();
}

export async function upsertCredentialUser(
  db: NonNullable<typeof env.DB>,
  input: { email: string; displayName?: string | null; phone?: string | null; temporaryPassword?: string | null; actorEmail: string },
) {
  await ensureAuthSchema(db);
  const email = input.email.trim().toLowerCase();
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.phone && !phone) throw new Error("Enter a valid phone number with country code, or a 10-digit Indian mobile number.");
  const current = await db.prepare(`SELECT id,password_hash FROM erp_users WHERE lower(email)=lower(?)`).bind(email).first<{ id: string; password_hash: string | null }>();
  const now = new Date().toISOString();
  const userId = current?.id || crypto.randomUUID();

  if (!current && !input.temporaryPassword) throw new Error("Set a temporary password for a new user.");
  if (input.temporaryPassword) {
    const validation = validatePassword(input.temporaryPassword);
    if (validation) throw new Error(validation);
  }

  if (current) {
    await db.prepare(`UPDATE erp_users SET display_name=?,phone_e164=?,active=1,updated_at=?,updated_by_email=? WHERE id=?`)
      .bind((input.displayName || "").trim() || null, phone, now, input.actorEmail, userId).run();
  } else {
    await db.prepare(`INSERT INTO erp_users (id,email,phone_e164,display_name,password_hash,must_change_password,active,password_updated_at,last_login_at,created_at,created_by_email,updated_at,updated_by_email) VALUES (?,?,?,?,NULL,1,1,NULL,NULL,?,?,?,?)`)
      .bind(userId, email, phone, (input.displayName || "").trim() || null, now, input.actorEmail, now, input.actorEmail).run();
  }

  if (input.temporaryPassword) {
    await setPasswordForUser(db, userId, input.temporaryPassword, input.actorEmail, true);
    await revokeAllUserSessions(db, userId);
  }
  await db.prepare(`UPDATE erp_memberships SET user_id=? WHERE lower(email)=lower(?)`).bind(userId, email).run();
  return { userId, hasCredentials: Boolean(input.temporaryPassword || current?.password_hash), phone };
}

export async function revokeCurrentSession(db: NonNullable<typeof env.DB>, request: Request) {
  await ensureAuthSchema(db);
  const raw = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!raw) return;
  const tokenHash = await sha256(raw);
  await db.prepare(`UPDATE erp_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL`).bind(new Date().toISOString(), tokenHash).run();
}

export async function revokeAllUserSessions(db: NonNullable<typeof env.DB>, userId: string, exceptSessionId?: string) {
  await ensureAuthSchema(db);
  const now = new Date().toISOString();
  if (exceptSessionId) {
    await db.prepare(`UPDATE erp_sessions SET revoked_at=? WHERE user_id=? AND id<>? AND revoked_at IS NULL`).bind(now, userId, exceptSessionId).run();
  } else {
    await db.prepare(`UPDATE erp_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL`).bind(now, userId).run();
  }
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function normalizeIdentifier(identifier: string): { kind: "email" | "phone"; value: string } | null {
  const raw = identifier.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return { kind: "email", value: raw.toLowerCase() };
  const phone = normalizePhone(raw);
  return phone ? { kind: "phone", value: phone } : null;
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const passwordKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, passwordKey, 256);
  return new Uint8Array(bits);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}

async function requestIpHash(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return sha256(`ip:${ip}`);
}

function cookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return "";
  for (const item of cookieHeader.split(";")) {
    const [key, ...rest] = item.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function sessionCookie(token: string, maxAge: number) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, maxAge)}`;
}

function toBase64Url(value: Uint8Array) {
  let binary = "";
  value.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
