import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const auth = read("app/lib/server-password-auth.ts");
const serverAuth = read("app/lib/server-erp-auth.ts");
const session = read("app/api/erp/session/route.ts");
const memberships = read("app/api/erp/memberships/route.ts");
const accessUi = read("app/access-control.tsx");
const migration = read("drizzle/0003_erp_first_party_auth.sql");
const platformAccess = read("app/lib/server-platform-access.ts");
const businessCatalog = read("app/lib/business-catalog.ts");
const foundation = read("app/lib/foundation.ts");
const accessControl = read("app/lib/access-control.ts");
const billing = read("app/billing.tsx");

test("passwords use salted PBKDF2 and are never stored as plaintext", () => {
  assert.match(auth, /PBKDF2-SHA256/);
  assert.match(auth, /600_000/);
  assert.match(auth, /crypto\.getRandomValues\(new Uint8Array\(16\)\)/);
  assert.match(auth, /password_hash/);
  assert.doesNotMatch(migration, /password_plain|plain_password/i);
});

test("browser sessions are server-side, hashed, secure and revocable", () => {
  assert.match(auth, /token_hash/);
  assert.match(auth, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(auth, /revokeAllUserSessions/);
  assert.match(migration, /CREATE TABLE `erp_sessions`/);
});

test("ERP session identity is checked before external bootstrap identity", () => {
  const sessionIndex = serverAuth.indexOf("getSessionIdentity(request)");
  const chatGptIndex = serverAuth.indexOf("oai-authenticated-user-id");
  assert.ok(sessionIndex >= 0 && chatGptIndex > sessionIndex);
});

test("first login requires a password change before ERP authorization", () => {
  assert.match(session, /PASSWORD_CHANGE_REQUIRED/);
  assert.match(serverAuth, /if \(actor\.mustChangePassword\) return null/);
});

test("new users require administrator-created credentials", () => {
  assert.match(memberships, /CREDENTIAL_REQUIRED/);
  assert.match(memberships, /temporaryPassword/);
  assert.match(accessUi, /Initial password \*/);
  assert.match(accessUi, /Set or generate a temporary password now/);
  assert.match(accessUi, /Generate/);
  assert.match(accessUi, /Copy/);
});

test("login accepts email or phone and rate limits failures", () => {
  assert.match(auth, /normalizePhone/);
  assert.match(auth, /IDENTITY_FAILURE_LIMIT/);
  assert.match(auth, /IP_FAILURE_LIMIT/);
  assert.match(accessUi, /Email or phone/);
});

test("administrator password reset revokes existing sessions", () => {
  assert.match(memberships, /upsertCredentialUser/);
  assert.match(auth, /if \(input\.temporaryPassword\)[\s\S]*revokeAllUserSessions/);
});

test("founding platform owner is provisioned across the three business systems", () => {
  assert.match(session, /ensurePlatformOwnerBusinesses/);
  assert.match(platformAccess, /erp_platform_roles/);
  assert.match(platformAccess, /role='owner'/);
  assert.match(businessCatalog, /businessId: "seiko"/);
  assert.match(businessCatalog, /businessId: "veyn-health"/);
  assert.match(businessCatalog, /businessId: "meth"/);
});

test("billing is a first-class module with shared commercial document flow", () => {
  assert.match(foundation, /"billing"/);
  assert.match(accessControl, /billing\.quotations\.manage/);
  assert.match(accessControl, /billing\.purchase_orders\.manage/);
  assert.match(accessControl, /billing\.delivery_challans\.manage/);
  assert.match(accessControl, /billing\.invoices\.manage/);
  assert.match(accessControl, /catalog\.manage/);
  assert.match(billing, /Quotation → PO → Delivery Challan → Invoice/);
  assert.match(billing, /same customer, item\/service and pricing source/);
});
