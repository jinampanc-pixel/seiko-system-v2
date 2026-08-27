import { env } from "cloudflare:workers";
import { authenticateActor } from "./server-erp-auth";
import { createSession, ensureAuthSchema, recordAuthEvent, type PasswordUser } from "./server-password-auth";

export type OAuthProvider = "google" | "apple";

type AuthChallenge = {
  id: string;
  kind: string;
  provider: string | null;
  user_id: string | null;
  nonce: string | null;
  verifier: string | null;
  rp_id: string | null;
  expires_at: string;
  used_at: string | null;
};

type IdentityToken = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  nonce?: string;
  exp?: number;
};

type PasskeyRow = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key_jwk: string;
  sign_count: number;
  label: string | null;
};

const OAUTH_TTL_MINUTES = 10;
const PASSKEY_TTL_MINUTES = 5;
const jwksCache = new Map<string, { expires: number; keys: JsonWebKey[] }>();

export async function ensureModernAuthSchema(db: NonNullable<typeof env.DB>) {
  await ensureAuthSchema(db);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS erp_auth_identities (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      email_at_link TEXT,
      created_at TEXT NOT NULL,
      last_used_at TEXT
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS erp_auth_identities_provider_subject_uq ON erp_auth_identities(provider,provider_subject)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS erp_auth_identities_user_provider_uq ON erp_auth_identities(user_id,provider)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS erp_auth_identities_user_idx ON erp_auth_identities(user_id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS erp_auth_challenges (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      provider TEXT,
      user_id TEXT,
      nonce TEXT,
      verifier TEXT,
      rp_id TEXT,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS erp_auth_challenges_exp_idx ON erp_auth_challenges(expires_at,used_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS erp_passkeys (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      credential_id TEXT NOT NULL,
      public_key_jwk TEXT NOT NULL,
      sign_count INTEGER DEFAULT 0 NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL,
      last_used_at TEXT
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS erp_passkeys_credential_uq ON erp_passkeys(credential_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS erp_passkeys_user_idx ON erp_passkeys(user_id)`),
  ]);
}

export function providerAvailability() {
  return {
    google: Boolean((process.env.GOOGLE_CLIENT_ID || "").trim() && (process.env.GOOGLE_CLIENT_SECRET || "").trim()),
    apple: Boolean(
      (process.env.APPLE_CLIENT_ID || "").trim()
      && (process.env.APPLE_TEAM_ID || "").trim()
      && (process.env.APPLE_KEY_ID || "").trim()
      && (process.env.APPLE_PRIVATE_KEY || "").trim(),
    ),
    passkey: true,
  };
}

export async function modernAuthMethods(request: Request) {
  const db = env.DB;
  const available = providerAvailability();
  if (!db) return { available, authenticated: false, linked: [], passkeys: [], hasPassword: false };
  await ensureModernAuthSchema(db);
  const actor = await authenticateActor(request);
  if (!actor) return { available, authenticated: false, linked: [], passkeys: [], hasPassword: false };
  const user = await userByEmail(db, actor.email);
  if (!user) return { available, authenticated: true, linked: [], passkeys: [], hasPassword: false };
  const identities = await db.prepare(`SELECT provider,email_at_link,created_at,last_used_at FROM erp_auth_identities WHERE user_id=? ORDER BY provider`)
    .bind(user.id).all<{ provider: string; email_at_link: string | null; created_at: string; last_used_at: string | null }>();
  const passkeys = await db.prepare(`SELECT id,label,created_at,last_used_at FROM erp_passkeys WHERE user_id=? ORDER BY created_at DESC`)
    .bind(user.id).all<{ id: string; label: string | null; created_at: string; last_used_at: string | null }>();
  return {
    available,
    authenticated: true,
    linked: (identities.results || []).map(item => ({ provider: item.provider, email: item.email_at_link, createdAt: item.created_at, lastUsedAt: item.last_used_at })),
    passkeys: (passkeys.results || []).map(item => ({ id: item.id, label: item.label || "Passkey", createdAt: item.created_at, lastUsedAt: item.last_used_at })),
    hasPassword: Boolean(user.passwordHash),
  };
}

export async function beginOAuth(request: Request, provider: OAuthProvider, mode: "login" | "link") {
  const db = env.DB;
  if (!db) throw new ModernAuthError("ERP_DB_NOT_CONFIGURED", "Shared ERP storage is not connected.", 503);
  await ensureModernAuthSchema(db);
  const available = providerAvailability();
  if (!available[provider]) throw new ModernAuthError("PROVIDER_NOT_CONFIGURED", `${providerName(provider)} sign-in is not configured yet.`, 503);

  let userId: string | null = null;
  if (mode === "link") {
    const actor = await authenticateActor(request);
    if (!actor) throw new ModernAuthError("AUTH_REQUIRED", "Sign in before linking another sign-in method.", 401);
    const user = await userByEmail(db, actor.email);
    if (!user) throw new ModernAuthError("USER_NOT_READY", "Set up ERP login for this user before linking another sign-in method.", 409);
    userId = user.id;
  }

  const state = randomToken(32);
  const nonce = randomToken(32);
  const verifier = randomToken(48);
  const expires = new Date(Date.now() + OAUTH_TTL_MINUTES * 60_000).toISOString();
  const kind = `oauth:${provider}:${mode}`;
  await db.prepare(`INSERT INTO erp_auth_challenges (id,kind,provider,user_id,nonce,verifier,rp_id,expires_at,used_at,created_at) VALUES (?,?,?,?,?,?,NULL,?,NULL,?)`)
    .bind(state, kind, provider, userId, nonce, verifier, expires, new Date().toISOString()).run();
  await cleanupChallenges(db);

  const callback = `${new URL(request.url).origin}/api/erp/auth/oauth/${provider}/callback`;
  return provider === "google"
    ? googleAuthorizationUrl(state, nonce, verifier, callback)
    : appleAuthorizationUrl(state, nonce, callback);
}

export async function finishOAuth(request: Request, provider: OAuthProvider, params: { state: string; code: string }) {
  const db = env.DB;
  if (!db) throw new ModernAuthError("ERP_DB_NOT_CONFIGURED", "Shared ERP storage is not connected.", 503);
  await ensureModernAuthSchema(db);
  const challenge = await consumeChallenge(db, params.state, `oauth:${provider}:`);
  const mode = challenge.kind.endsWith(":link") ? "link" : "login";
  const callback = `${new URL(request.url).origin}/api/erp/auth/oauth/${provider}/callback`;
  const token = provider === "google"
    ? await exchangeGoogleCode(params.code, challenge.verifier || "", callback)
    : await exchangeAppleCode(params.code, callback);
  const claims = await verifyProviderIdToken(provider, token.id_token, challenge.nonce || "");
  if (!claims.sub) throw new ModernAuthError("INVALID_IDENTITY", "The identity provider did not return a stable account identifier.", 401);

  let user: PasswordUser | null = null;
  if (mode === "link") {
    if (!challenge.user_id) throw new ModernAuthError("INVALID_LINK", "The link request is no longer valid.", 400);
    user = await userById(db, challenge.user_id);
    if (!user || !user.active) throw new ModernAuthError("ACCOUNT_SUSPENDED", "This ERP account is not active.", 403);
    await linkIdentity(db, user.id, provider, claims.sub, claims.email || null);
    await recordAuthEvent(db, request, { identifier: user.email, userId: user.id, email: user.email, event: `identity.${provider}.linked`, success: true });
    return { mode, user, cookie: null as string | null };
  }

  const existing = await db.prepare(`SELECT user_id FROM erp_auth_identities WHERE provider=? AND provider_subject=?`)
    .bind(provider, claims.sub).first<{ user_id: string }>();
  if (existing) user = await userById(db, existing.user_id);

  if (!user && provider === "google" && isVerifiedEmail(claims) && claims.email) {
    const candidate = await userByEmail(db, claims.email);
    if (candidate && candidate.active && await hasActiveMembership(db, candidate.email)) {
      await linkIdentity(db, candidate.id, provider, claims.sub, claims.email);
      user = candidate;
    }
  }

  if (!user) {
    throw new ModernAuthError(
      provider === "apple" ? "APPLE_LINK_REQUIRED" : "IDENTITY_NOT_ASSIGNED",
      provider === "apple"
        ? "Link your Apple Account once from My access before using it to sign in."
        : "This Google Account is not assigned to an active ERP user.",
      403,
    );
  }
  if (!user.active || !await hasActiveMembership(db, user.email)) throw new ModernAuthError("NO_ACCESS", "This account does not have active ERP access.", 403);

  await db.prepare(`UPDATE erp_auth_identities SET last_used_at=? WHERE provider=? AND provider_subject=?`)
    .bind(new Date().toISOString(), provider, claims.sub).run();

  // If the only password was an administrator-created temporary password, invalidate
  // it after a successful federated login instead of allowing it to become a permanent bypass.
  if (user.mustChangePassword && user.passwordHash) {
    await db.prepare(`UPDATE erp_users SET password_hash=NULL,must_change_password=0,password_updated_at=?,updated_at=?,updated_by_email=? WHERE id=?`)
      .bind(new Date().toISOString(), new Date().toISOString(), user.email, user.id).run();
    user = { ...user, passwordHash: null, mustChangePassword: false };
  }

  const session = await createSession(db, user, request);
  await recordAuthEvent(db, request, { identifier: user.email, userId: user.id, email: user.email, event: `login.${provider}`, success: true });
  return { mode, user, cookie: session.cookie };
}

export async function unlinkIdentity(request: Request, provider: OAuthProvider) {
  const db = env.DB;
  if (!db) throw new ModernAuthError("ERP_DB_NOT_CONFIGURED", "Shared ERP storage is not connected.", 503);
  await ensureModernAuthSchema(db);
  const actor = await authenticateActor(request);
  if (!actor) throw new ModernAuthError("AUTH_REQUIRED", "Sign in first.", 401);
  const user = await userByEmail(db, actor.email);
  if (!user) throw new ModernAuthError("USER_NOT_READY", "ERP login is not configured for this user.", 409);
  const alternatives = await countSignInMethods(db, user.id, user.passwordHash, provider);
  if (alternatives < 1) throw new ModernAuthError("LAST_SIGN_IN_METHOD", "Add another sign-in method before removing this one.", 409);
  await db.prepare(`DELETE FROM erp_auth_identities WHERE user_id=? AND provider=?`).bind(user.id, provider).run();
  await recordAuthEvent(db, request, { identifier: user.email, userId: user.id, email: user.email, event: `identity.${provider}.unlinked`, success: true });
}

export async function passkeyRegistrationOptions(request: Request) {
  const db = env.DB;
  if (!db) throw new ModernAuthError("ERP_DB_NOT_CONFIGURED", "Shared ERP storage is not connected.", 503);
  await ensureModernAuthSchema(db);
  const actor = await authenticateActor(request);
  if (!actor) throw new ModernAuthError("AUTH_REQUIRED", "Sign in before adding a passkey.", 401);
  const user = await userByEmail(db, actor.email);
  if (!user || !user.active) throw new ModernAuthError("USER_NOT_READY", "ERP login is not configured for this user.", 409);
  const origin = new URL(request.url).origin;
  const rpId = new URL(origin).hostname;
  const challenge = randomToken(32);
  const challengeId = randomToken(24);
  const expires = new Date(Date.now() + PASSKEY_TTL_MINUTES * 60_000).toISOString();
  await db.prepare(`INSERT INTO erp_auth_challenges (id,kind,provider,user_id,nonce,verifier,rp_id,expires_at,used_at,created_at) VALUES (?,'passkey:register',NULL,?,?,NULL,?, ?,NULL,?)`)
    .bind(challengeId, user.id, challenge, rpId, expires, new Date().toISOString()).run();
  const existing = await db.prepare(`SELECT credential_id FROM erp_passkeys WHERE user_id=?`).bind(user.id).all<{ credential_id: string }>();
  return {
    challengeId,
    publicKey: {
      challenge,
      rp: { id: rpId, name: "Jinam ERP" },
      user: { id: toBase64Url(new TextEncoder().encode(user.id)), name: user.email, displayName: user.displayName },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      timeout: 60_000,
      attestation: "none",
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
      excludeCredentials: (existing.results || []).map(item => ({ type: "public-key", id: item.credential_id })),
    },
  };
}

export async function verifyPasskeyRegistration(request: Request, input: { challengeId: string; credential: RegistrationCredentialJSON; label?: string }) {
  const db = env.DB;
  if (!db) throw new ModernAuthError("ERP_DB_NOT_CONFIGURED", "Shared ERP storage is not connected.", 503);
  await ensureModernAuthSchema(db);
  const actor = await authenticateActor(request);
  if (!actor) throw new ModernAuthError("AUTH_REQUIRED", "Sign in before adding a passkey.", 401);
  const user = await userByEmail(db, actor.email);
  if (!user) throw new ModernAuthError("USER_NOT_READY", "ERP login is not configured for this user.", 409);
  const challenge = await consumeChallenge(db, input.challengeId, "passkey:register");
  if (challenge.user_id !== user.id) throw new ModernAuthError("INVALID_PASSKEY_CHALLENGE", "This passkey request belongs to another account.", 400);
  const expectedOrigin = new URL(request.url).origin;
  const verified = await verifyRegistration(input.credential, challenge.nonce || "", expectedOrigin, challenge.rp_id || new URL(expectedOrigin).hostname);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO erp_passkeys (id,user_id,credential_id,public_key_jwk,sign_count,label,created_at,last_used_at) VALUES (?,?,?,?,?,?,?,NULL)`)
    .bind(crypto.randomUUID(), user.id, verified.credentialId, JSON.stringify(verified.publicKeyJwk), verified.signCount, (input.label || "").trim().slice(0, 80) || "Passkey", now).run();
  await recordAuthEvent(db, request, { identifier: user.email, userId: user.id, email: user.email, event: "passkey.added", success: true });
}

export async function passkeyLoginOptions(request: Request) {
  const db = env.DB;
  if (!db) throw new ModernAuthError("ERP_DB_NOT_CONFIGURED", "Shared ERP storage is not connected.", 503);
  await ensureModernAuthSchema(db);
  const origin = new URL(request.url).origin;
  const rpId = new URL(origin).hostname;
  const challenge = randomToken(32);
  const challengeId = randomToken(24);
  const expires = new Date(Date.now() + PASSKEY_TTL_MINUTES * 60_000).toISOString();
  await db.prepare(`INSERT INTO erp_auth_challenges (id,kind,provider,user_id,nonce,verifier,rp_id,expires_at,used_at,created_at) VALUES (?,'passkey:login',NULL,NULL,?,NULL,?, ?,NULL,?)`)
    .bind(challengeId, challenge, rpId, expires, new Date().toISOString()).run();
  await cleanupChallenges(db);
  return { challengeId, publicKey: { challenge, rpId, timeout: 60_000, userVerification: "required" } };
}

export async function verifyPasskeyLogin(request: Request, input: { challengeId: string; credential: AuthenticationCredentialJSON }) {
  const db = env.DB;
  if (!db) throw new ModernAuthError("ERP_DB_NOT_CONFIGURED", "Shared ERP storage is not connected.", 503);
  await ensureModernAuthSchema(db);
  const challenge = await consumeChallenge(db, input.challengeId, "passkey:login");
  const row = await db.prepare(`SELECT id,user_id,credential_id,public_key_jwk,sign_count,label FROM erp_passkeys WHERE credential_id=?`)
    .bind(input.credential.id).first<PasskeyRow>();
  if (!row) throw new ModernAuthError("PASSKEY_NOT_RECOGNIZED", "This passkey is not registered with the ERP.", 401);
  const user = await userById(db, row.user_id);
  if (!user || !user.active || !await hasActiveMembership(db, user.email)) throw new ModernAuthError("NO_ACCESS", "This account does not have active ERP access.", 403);
  const expectedOrigin = new URL(request.url).origin;
  const signCount = await verifyAuthentication(input.credential, challenge.nonce || "", expectedOrigin, challenge.rp_id || new URL(expectedOrigin).hostname, JSON.parse(row.public_key_jwk) as JsonWebKey, Number(row.sign_count || 0));
  const now = new Date().toISOString();
  await db.prepare(`UPDATE erp_passkeys SET sign_count=?,last_used_at=? WHERE id=?`).bind(signCount, now, row.id).run();
  const session = await createSession(db, { ...user, mustChangePassword: false }, request);
  await recordAuthEvent(db, request, { identifier: user.email, userId: user.id, email: user.email, event: "login.passkey", success: true });
  return { cookie: session.cookie, user };
}

export async function removePasskey(request: Request, passkeyId: string) {
  const db = env.DB;
  if (!db) throw new ModernAuthError("ERP_DB_NOT_CONFIGURED", "Shared ERP storage is not connected.", 503);
  await ensureModernAuthSchema(db);
  const actor = await authenticateActor(request);
  if (!actor) throw new ModernAuthError("AUTH_REQUIRED", "Sign in first.", 401);
  const user = await userByEmail(db, actor.email);
  if (!user) throw new ModernAuthError("USER_NOT_READY", "ERP login is not configured for this user.", 409);
  const alternatives = await countSignInMethods(db, user.id, user.passwordHash, null, passkeyId);
  if (alternatives < 1) throw new ModernAuthError("LAST_SIGN_IN_METHOD", "Add another sign-in method before removing this passkey.", 409);
  await db.prepare(`DELETE FROM erp_passkeys WHERE id=? AND user_id=?`).bind(passkeyId, user.id).run();
  await recordAuthEvent(db, request, { identifier: user.email, userId: user.id, email: user.email, event: "passkey.removed", success: true });
}

async function googleAuthorizationUrl(state: string, nonce: string, verifier: string, redirectUri: string) {
  const challenge = toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const query = new URLSearchParams({
    client_id: (process.env.GOOGLE_CLIENT_ID || "").trim(), redirect_uri: redirectUri, response_type: "code",
    scope: "openid email profile", state, nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
}

function appleAuthorizationUrl(state: string, nonce: string, redirectUri: string) {
  const query = new URLSearchParams({
    client_id: (process.env.APPLE_CLIENT_ID || "").trim(), redirect_uri: redirectUri, response_type: "code",
    response_mode: "form_post", scope: "name email", state, nonce,
  });
  return `https://appleid.apple.com/auth/authorize?${query.toString()}`;
}

async function exchangeGoogleCode(code: string, verifier: string, redirectUri: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: (process.env.GOOGLE_CLIENT_ID || "").trim(), client_secret: (process.env.GOOGLE_CLIENT_SECRET || "").trim(), redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
  });
  const result = await response.json() as { id_token?: string; error?: string };
  if (!response.ok || !result.id_token) throw new ModernAuthError("OAUTH_EXCHANGE_FAILED", "Google sign-in could not be completed.", 401);
  return { id_token: result.id_token };
}

async function exchangeAppleCode(code: string, redirectUri: string) {
  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: (process.env.APPLE_CLIENT_ID || "").trim(), client_secret: await appleClientSecret(), redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const result = await response.json() as { id_token?: string; error?: string };
  if (!response.ok || !result.id_token) throw new ModernAuthError("OAUTH_EXCHANGE_FAILED", "Apple sign-in could not be completed.", 401);
  return { id_token: result.id_token };
}

async function appleClientSecret() {
  const teamId = (process.env.APPLE_TEAM_ID || "").trim();
  const clientId = (process.env.APPLE_CLIENT_ID || "").trim();
  const keyId = (process.env.APPLE_KEY_ID || "").trim();
  const pem = (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: keyId })));
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ iss: teamId, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: clientId })));
  const key = await crypto.subtle.importKey("pkcs8", pemToBytes(pem), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`)));
  return `${header}.${payload}.${toBase64Url(signature)}`;
}

async function verifyProviderIdToken(provider: OAuthProvider, token: string, expectedNonce: string): Promise<IdentityToken> {
  const clientId = (provider === "google" ? process.env.GOOGLE_CLIENT_ID : process.env.APPLE_CLIENT_ID || "").trim();
  const issuer = provider === "google" ? "https://accounts.google.com" : "https://appleid.apple.com";
  const jwksUri = provider === "google" ? "https://www.googleapis.com/oauth2/v3/certs" : "https://appleid.apple.com/auth/keys";
  const parts = token.split(".");
  if (parts.length !== 3) throw new ModernAuthError("INVALID_ID_TOKEN", "The identity token is invalid.", 401);
  const header = parseJwtPart<{ alg?: string; kid?: string }>(parts[0]);
  const claims = parseJwtPart<IdentityToken>(parts[1]);
  if (!header?.kid || header.alg !== "RS256" || !claims) throw new ModernAuthError("INVALID_ID_TOKEN", "The identity token is invalid.", 401);
  const keys = await providerKeys(jwksUri);
  const jwk = keys.find(item => item.kid === header.kid);
  if (!jwk) throw new ModernAuthError("INVALID_ID_TOKEN", "The identity signing key could not be verified.", 401);
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  const validIssuer = provider === "google" ? claims.iss === issuer || claims.iss === "accounts.google.com" : claims.iss === issuer;
  if (!valid || !validIssuer || !audiences.includes(clientId) || !claims.exp || claims.exp * 1000 <= Date.now() || claims.nonce !== expectedNonce) {
    throw new ModernAuthError("INVALID_ID_TOKEN", "The identity token could not be verified.", 401);
  }
  return claims;
}

async function providerKeys(uri: string) {
  const cached = jwksCache.get(uri);
  if (cached && cached.expires > Date.now()) return cached.keys;
  const response = await fetch(uri, { cache: "no-store" });
  if (!response.ok) return [];
  const result = await response.json() as { keys?: JsonWebKey[] };
  const keys = Array.isArray(result.keys) ? result.keys : [];
  jwksCache.set(uri, { expires: Date.now() + 10 * 60_000, keys });
  return keys;
}

async function linkIdentity(db: NonNullable<typeof env.DB>, userId: string, provider: OAuthProvider, subject: string, email: string | null) {
  const conflict = await db.prepare(`SELECT user_id FROM erp_auth_identities WHERE provider=? AND provider_subject=?`).bind(provider, subject).first<{ user_id: string }>();
  if (conflict && conflict.user_id !== userId) throw new ModernAuthError("IDENTITY_ALREADY_LINKED", `This ${providerName(provider)} account is already linked to another ERP user.`, 409);
  const existing = await db.prepare(`SELECT id FROM erp_auth_identities WHERE user_id=? AND provider=?`).bind(userId, provider).first<{ id: string }>();
  const now = new Date().toISOString();
  if (existing) {
    await db.prepare(`UPDATE erp_auth_identities SET provider_subject=?,email_at_link=?,last_used_at=? WHERE id=?`).bind(subject, email, now, existing.id).run();
  } else {
    await db.prepare(`INSERT INTO erp_auth_identities (id,user_id,provider,provider_subject,email_at_link,created_at,last_used_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), userId, provider, subject, email, now, now).run();
  }
}

async function userByEmail(db: NonNullable<typeof env.DB>, email: string) {
  return mapUser(await db.prepare(`SELECT id,email,phone_e164,display_name,password_hash,must_change_password,active FROM erp_users WHERE lower(email)=lower(?)`).bind(email).first<UserRow>());
}

async function userById(db: NonNullable<typeof env.DB>, id: string) {
  return mapUser(await db.prepare(`SELECT id,email,phone_e164,display_name,password_hash,must_change_password,active FROM erp_users WHERE id=?`).bind(id).first<UserRow>());
}

type UserRow = { id: string; email: string; phone_e164: string | null; display_name: string | null; password_hash: string | null; must_change_password: number; active: number };
function mapUser(row: UserRow | null): PasswordUser | null {
  return row ? { id: row.id, email: row.email, phone: row.phone_e164, displayName: row.display_name || row.email, passwordHash: row.password_hash, mustChangePassword: Boolean(row.must_change_password), active: Boolean(row.active) } : null;
}

async function hasActiveMembership(db: NonNullable<typeof env.DB>, email: string) {
  return Boolean(await db.prepare(`SELECT 1 AS ok FROM erp_memberships WHERE lower(email)=lower(?) AND active=1 LIMIT 1`).bind(email).first<{ ok: number }>());
}

async function countSignInMethods(db: NonNullable<typeof env.DB>, userId: string, passwordHash: string | null, excludingProvider?: OAuthProvider | null, excludingPasskeyId?: string) {
  const identity = await db.prepare(`SELECT count(*) AS count FROM erp_auth_identities WHERE user_id=? ${excludingProvider ? "AND provider<>?" : ""}`)
    .bind(...(excludingProvider ? [userId, excludingProvider] : [userId])).first<{ count: number }>();
  const passkeys = await db.prepare(`SELECT count(*) AS count FROM erp_passkeys WHERE user_id=? ${excludingPasskeyId ? "AND id<>?" : ""}`)
    .bind(...(excludingPasskeyId ? [userId, excludingPasskeyId] : [userId])).first<{ count: number }>();
  return (passwordHash ? 1 : 0) + Number(identity?.count || 0) + Number(passkeys?.count || 0);
}

async function consumeChallenge(db: NonNullable<typeof env.DB>, id: string, kindPrefix: string) {
  const now = new Date().toISOString();
  const row = await db.prepare(`SELECT id,kind,provider,user_id,nonce,verifier,rp_id,expires_at,used_at FROM erp_auth_challenges WHERE id=? AND used_at IS NULL AND expires_at>?`)
    .bind(id, now).first<AuthChallenge>();
  if (!row || !row.kind.startsWith(kindPrefix)) throw new ModernAuthError("CHALLENGE_EXPIRED", "This sign-in request has expired. Start again.", 400);
  const changed = await db.prepare(`UPDATE erp_auth_challenges SET used_at=? WHERE id=? AND used_at IS NULL`).bind(now, id).run();
  if (!changed.meta.changes) throw new ModernAuthError("CHALLENGE_USED", "This sign-in request has already been used.", 400);
  return row;
}

async function cleanupChallenges(db: NonNullable<typeof env.DB>) {
  await db.prepare(`DELETE FROM erp_auth_challenges WHERE expires_at<? OR (used_at IS NOT NULL AND used_at<?)`)
    .bind(new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() - 24 * 60 * 60_000).toISOString()).run();
}

function isVerifiedEmail(claims: IdentityToken) {
  return claims.email_verified === true || claims.email_verified === "true";
}

function providerName(provider: OAuthProvider) { return provider === "google" ? "Google" : "Apple"; }

// ---- WebAuthn verification (ES256 passkeys) ----

type RegistrationCredentialJSON = { id: string; rawId: string; type: string; response: { clientDataJSON: string; attestationObject: string }; };
type AuthenticationCredentialJSON = { id: string; rawId: string; type: string; response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string | null }; };

async function verifyRegistration(credential: RegistrationCredentialJSON, expectedChallenge: string, expectedOrigin: string, rpId: string) {
  if (!credential || credential.type !== "public-key") throw new ModernAuthError("INVALID_PASSKEY", "The passkey response is invalid.", 400);
  const clientBytes = fromBase64Url(credential.response.clientDataJSON);
  const client = JSON.parse(new TextDecoder().decode(clientBytes)) as { type?: string; challenge?: string; origin?: string };
  if (client.type !== "webauthn.create" || client.challenge !== expectedChallenge || client.origin !== expectedOrigin) throw new ModernAuthError("INVALID_PASSKEY", "The passkey request could not be verified.", 400);
  const attestation = decodeCbor(fromBase64Url(credential.response.attestationObject)).value as Map<unknown, unknown>;
  const authData = attestation.get("authData") as Uint8Array;
  const fmt = attestation.get("fmt");
  if (!(authData instanceof Uint8Array) || fmt !== "none") throw new ModernAuthError("UNSUPPORTED_PASSKEY", "This authenticator returned an unsupported attestation format.", 400);
  await verifyRpAndFlags(authData, rpId);
  if (!(authData[32] & 0x40)) throw new ModernAuthError("INVALID_PASSKEY", "The authenticator did not include credential data.", 400);
  let offset = 37 + 16;
  const credentialLength = (authData[offset] << 8) | authData[offset + 1]; offset += 2;
  const credentialIdBytes = authData.slice(offset, offset + credentialLength); offset += credentialLength;
  const decodedKey = decodeCbor(authData, offset).value as Map<unknown, unknown>;
  const kty = decodedKey.get(1); const alg = decodedKey.get(3); const crv = decodedKey.get(-1);
  if (kty !== 2 || alg !== -7 || crv !== 1) throw new ModernAuthError("UNSUPPORTED_PASSKEY", "This passkey uses a key type the ERP does not support yet.", 400);
  const x = decodedKey.get(-2); const y = decodedKey.get(-3);
  if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) throw new ModernAuthError("INVALID_PASSKEY", "The passkey public key is invalid.", 400);
  const credentialId = toBase64Url(credentialIdBytes);
  if (credential.id !== credentialId && credential.rawId !== credentialId) throw new ModernAuthError("INVALID_PASSKEY", "The passkey identifier does not match.", 400);
  return { credentialId, publicKeyJwk: { kty: "EC", crv: "P-256", x: toBase64Url(x), y: toBase64Url(y), ext: true }, signCount: readUint32(authData, 33) };
}

async function verifyAuthentication(credential: AuthenticationCredentialJSON, expectedChallenge: string, expectedOrigin: string, rpId: string, publicKeyJwk: JsonWebKey, previousCount: number) {
  if (!credential || credential.type !== "public-key") throw new ModernAuthError("INVALID_PASSKEY", "The passkey response is invalid.", 400);
  const clientBytes = fromBase64Url(credential.response.clientDataJSON);
  const client = JSON.parse(new TextDecoder().decode(clientBytes)) as { type?: string; challenge?: string; origin?: string };
  if (client.type !== "webauthn.get" || client.challenge !== expectedChallenge || client.origin !== expectedOrigin) throw new ModernAuthError("INVALID_PASSKEY", "The passkey request could not be verified.", 400);
  const authData = fromBase64Url(credential.response.authenticatorData);
  await verifyRpAndFlags(authData, rpId);
  const newCount = readUint32(authData, 33);
  if (previousCount > 0 && newCount > 0 && newCount <= previousCount) throw new ModernAuthError("PASSKEY_COUNTER_INVALID", "The passkey counter is inconsistent. Re-register this passkey before using it again.", 401);
  const clientHash = new Uint8Array(await crypto.subtle.digest("SHA-256", clientBytes));
  const signed = concatBytes(authData, clientHash);
  const signature = derEcdsaToRaw(fromBase64Url(credential.response.signature), 32);
  const key = await crypto.subtle.importKey("jwk", publicKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, signed);
  if (!valid) throw new ModernAuthError("INVALID_PASSKEY", "The passkey signature could not be verified.", 401);
  return newCount;
}

async function verifyRpAndFlags(authData: Uint8Array, rpId: string) {
  if (authData.length < 37) throw new ModernAuthError("INVALID_PASSKEY", "The authenticator response is incomplete.", 400);
  const expectedRp = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rpId)));
  if (!constantBytes(authData.slice(0, 32), expectedRp)) throw new ModernAuthError("INVALID_PASSKEY", "The passkey belongs to another site.", 400);
  const flags = authData[32];
  if (!(flags & 0x01) || !(flags & 0x04)) throw new ModernAuthError("PASSKEY_VERIFICATION_REQUIRED", "Unlock the device with Face ID, fingerprint, PIN, or device password to use this passkey.", 401);
}

function decodeCbor(bytes: Uint8Array, start = 0): { value: unknown; offset: number } {
  const initial = bytes[start];
  if (initial === undefined) throw new ModernAuthError("INVALID_CBOR", "The authenticator response is malformed.", 400);
  const major = initial >> 5; const info = initial & 31;
  const lengthInfo = cborLength(bytes, start + 1, info); let offset = lengthInfo.offset; const length = lengthInfo.value;
  if (major === 0) return { value: length, offset };
  if (major === 1) return { value: -1 - length, offset };
  if (major === 2) { const value = bytes.slice(offset, offset + length); return { value, offset: offset + length }; }
  if (major === 3) { const value = new TextDecoder().decode(bytes.slice(offset, offset + length)); return { value, offset: offset + length }; }
  if (major === 4) { const value: unknown[] = []; for (let i = 0; i < length; i += 1) { const item = decodeCbor(bytes, offset); value.push(item.value); offset = item.offset; } return { value, offset }; }
  if (major === 5) { const value = new Map<unknown, unknown>(); for (let i = 0; i < length; i += 1) { const key = decodeCbor(bytes, offset); offset = key.offset; const item = decodeCbor(bytes, offset); offset = item.offset; value.set(key.value, item.value); } return { value, offset }; }
  if (major === 7 && info === 20) return { value: false, offset };
  if (major === 7 && info === 21) return { value: true, offset };
  if (major === 7 && info === 22) return { value: null, offset };
  throw new ModernAuthError("UNSUPPORTED_CBOR", "The authenticator returned an unsupported data type.", 400);
}

function cborLength(bytes: Uint8Array, offset: number, info: number) {
  if (info < 24) return { value: info, offset };
  if (info === 24) return { value: bytes[offset], offset: offset + 1 };
  if (info === 25) return { value: (bytes[offset] << 8) | bytes[offset + 1], offset: offset + 2 };
  if (info === 26) return { value: readUint32(bytes, offset), offset: offset + 4 };
  throw new ModernAuthError("UNSUPPORTED_CBOR", "The authenticator response is too large or unsupported.", 400);
}

function derEcdsaToRaw(der: Uint8Array, size: number) {
  if (der[0] !== 0x30) throw new ModernAuthError("INVALID_PASSKEY_SIGNATURE", "The passkey signature is malformed.", 400);
  let offset = der[1] & 0x80 ? 2 + (der[1] & 0x7f) : 2;
  if (der[offset++] !== 0x02) throw new ModernAuthError("INVALID_PASSKEY_SIGNATURE", "The passkey signature is malformed.", 400);
  const rLength = der[offset++]; const r = der.slice(offset, offset + rLength); offset += rLength;
  if (der[offset++] !== 0x02) throw new ModernAuthError("INVALID_PASSKEY_SIGNATURE", "The passkey signature is malformed.", 400);
  const sLength = der[offset++]; const s = der.slice(offset, offset + sLength);
  const raw = new Uint8Array(size * 2); raw.set(trimAndPad(r, size), 0); raw.set(trimAndPad(s, size), size); return raw;
}

function trimAndPad(value: Uint8Array, size: number) {
  let clean = value; while (clean.length > 1 && clean[0] === 0) clean = clean.slice(1);
  if (clean.length > size) throw new ModernAuthError("INVALID_PASSKEY_SIGNATURE", "The passkey signature is malformed.", 400);
  const out = new Uint8Array(size); out.set(clean, size - clean.length); return out;
}

function readUint32(bytes: Uint8Array, offset: number) { return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0; }
function concatBytes(a: Uint8Array, b: Uint8Array) { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; }
function constantBytes(a: Uint8Array, b: Uint8Array) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]; return diff === 0; }
function randomToken(bytes: number) { return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes))); }
function toBase64Url(bytes: Uint8Array) { let binary = ""; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function fromBase64Url(value: string) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="); const binary = atob(normalized); return Uint8Array.from(binary, char => char.charCodeAt(0)); }
function parseJwtPart<T>(value: string): T | null { try { return JSON.parse(new TextDecoder().decode(fromBase64Url(value))) as T; } catch { return null; } }
function pemToBytes(pem: string) { const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ""); const binary = atob(base64); return Uint8Array.from(binary, char => char.charCodeAt(0)); }

export class ModernAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
