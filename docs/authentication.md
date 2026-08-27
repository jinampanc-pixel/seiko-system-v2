# ERP authentication

The ERP uses one internal user/session/permission model with multiple authentication methods:

- email or phone + password
- Google OpenID Connect
- Sign in with Apple
- WebAuthn passkeys

Authentication proves identity. `erp_memberships` and the granular permission model remain authoritative for business/module/action access.

## Passwords and password managers

The login form uses the standard browser autocomplete values `username`, `current-password`, and `new-password`. Chrome/Google Password Manager, iCloud Keychain/Safari, Edge, 1Password, and compatible managers can therefore generate, save, and autofill credentials normally.

Administrators create an initial password before a new user is activated. The password is stored only as a salted PBKDF2-SHA256 hash. A new user must replace the initial password on first password sign-in. Resetting a password revokes existing sessions.

## Google

Configure these as Cloudflare Worker secrets/variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET` (secret)

Configure the Google OAuth web client with this redirect URI, using the production ERP origin:

`https://<ERP_DOMAIN>/api/erp/auth/oauth/google/callback`

The ERP uses authorization code flow with state, nonce, and PKCE. Google may auto-link only when Google returns a verified email that exactly matches an already-created, active ERP user with active business membership. A Google account by itself never grants ERP access.

## Apple

Configure:

- `APPLE_CLIENT_ID` (Services ID)
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY` (secret PKCS#8 `.p8` contents; escaped newlines are accepted)

Configure this Return URL on the Apple Services ID:

`https://<ERP_DOMAIN>/api/erp/auth/oauth/apple/callback`

Apple identities are never auto-linked by email because users may choose Hide My Email. An authenticated ERP user links Apple once from **My access → Sign-in methods**. Later Apple sign-ins use Apple's stable provider subject.

## Passkeys

Passkeys use WebAuthn with discoverable credentials and required user verification. The RP ID is derived from the production request hostname, so passkeys are bound to the ERP domain. HTTPS is required in production.

Users add passkeys from **My access → Sign-in methods** and can then use **Use a passkey** on the login screen. Device/platform authenticators can use Face ID, Touch ID, Windows Hello, Android biometrics/PIN, or a synced passkey manager depending on the device.

## Account linking and removal

`erp_auth_identities` stores only provider + provider subject + link metadata. It never stores Google or Apple passwords/tokens as user credentials. `erp_passkeys` stores the public credential material and signature counter; the private key remains on the user's authenticator/provider.

The API prevents removing the last available sign-in method from an account.

## Cloudflare Access transition

Cloudflare Access/ChatGPT identity remains a temporary owner/bootstrap path while first-party credentials are rolled out. Once owners have working ERP credentials and normal employee sign-in has been tested, the outer Cloudflare Access gate can be removed from the normal employee URL or restricted to an emergency/admin route. Cloudflare remains the hosting/WAF/runtime layer.
