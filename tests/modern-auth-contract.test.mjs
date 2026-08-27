import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const server = read("app/lib/server-modern-auth.ts");
const ui = read("app/modern-auth-ui.tsx");
const access = read("app/access-control.tsx");
const accessCss = read("app/access-control.css");
const migration = read("drizzle/0004_erp_modern_auth.sql");

test("Google sign-in uses OIDC state nonce and PKCE and only auto-links verified exact emails", () => {
  assert.match(server, /code_challenge_method: "S256"/);
  assert.match(server, /state, nonce/);
  assert.match(server, /provider === "google" && isVerifiedEmail\(claims\) && claims\.email/);
  assert.match(server, /userByEmail\(db, claims\.email\)/);
});

test("Apple requires explicit identity linking rather than email auto-link", () => {
  assert.match(server, /APPLE_LINK_REQUIRED/);
  assert.match(server, /mode === "link"/);
  assert.doesNotMatch(server, /provider === "apple" && isVerifiedEmail/);
});

test("provider tokens validate issuer audience expiry nonce and signature", () => {
  assert.match(server, /RSASSA-PKCS1-v1_5/);
  assert.match(server, /audiences\.includes\(clientId\)/);
  assert.match(server, /claims\.exp \* 1000 <= Date\.now\(\)/);
  assert.match(server, /claims\.nonce !== expectedNonce/);
});

test("passkeys require discoverable credentials and device user verification", () => {
  assert.match(server, /residentKey: "required"/);
  assert.match(server, /userVerification: "required"/);
  assert.match(server, /flags & 0x04/);
  assert.match(server, /login\.passkey/);
});

test("external methods create the same server session used by password login", () => {
  assert.match(server, /createSession\(db, user, request\)/);
  assert.match(server, /createSession\(db, \{ \.\.\.user, mustChangePassword: false \}, request\)/);
});

test("modern auth database stores provider subjects and public keys, not provider passwords", () => {
  assert.match(migration, /erp_auth_identities/);
  assert.match(migration, /provider_subject/);
  assert.match(migration, /erp_passkeys/);
  assert.match(migration, /public_key_jwk/);
  assert.doesNotMatch(migration, /google_password|apple_password/i);
});

test("login and My access expose Google Apple and passkey interfaces", () => {
  assert.match(ui, /Continue with Google/);
  assert.match(ui, /Continue with Apple/);
  assert.match(ui, /Use a passkey/);
  assert.match(ui, /\+ Add passkey/);
  assert.match(access, /ModernLoginOptions/);
  assert.match(access, /ModernAccountMethods/);
});

test("password-manager autocomplete remains enabled", () => {
  assert.match(access, /autoComplete="username"/);
  assert.match(access, /autoComplete="current-password"/);
  assert.match(access, /autoComplete="new-password"/);
});

test("user editor can make login ready before first sign-in and reset it later", () => {
  assert.match(access, /Initial password \*/);
  assert.match(access, /Reset password \(optional\)/);
  assert.match(access, /Ready to sign in after save/);
  assert.match(access, /sign this user out on every device/);
  assert.match(access, /Copy\/share this temporary password/);
});

test("user editor keeps header and actions outside the scrolling permission body", () => {
  assert.match(access, /membershipEditorBody/);
  assert.match(access, /membershipEditorFooter/);
  assert.match(accessCss, /grid-template-rows:auto minmax\(0,1fr\) auto/);
  assert.match(accessCss, /\.membershipEditorBody\{min-height:0;overflow:auto/);
});
