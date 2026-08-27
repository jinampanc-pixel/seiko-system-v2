# ERP sign-in providers

The ERP authorization database remains the source of truth. Google, Apple and passkeys authenticate identity only; a user still needs an active `erp_memberships` record and receives only the modules/permissions assigned there.

## Built-in password and passkeys

Password login continues to work with email or phone. Browser password managers are supported through standard `autocomplete` attributes.

Passkeys require no third-party secrets. They use WebAuthn on the deployed HTTPS origin. A signed-in user can add a passkey from **My access → Sign-in methods**. Passkey login requires device user verification (Face ID, fingerprint, PIN or device password).

Passkeys are scoped to the deployed hostname. Changing the production hostname later requires planning the WebAuthn RP ID before users register large numbers of passkeys.

## Google

Create an OAuth 2.0 Web application in Google Cloud and register this redirect URI exactly:

`https://<production-host>/api/erp/auth/oauth/google/callback`

Configure these Cloudflare Worker secrets/variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

The implementation uses authorization code flow with state, nonce and PKCE. Google may auto-link on first sign-in only when Google returns a verified email that exactly matches an existing active ERP user with active business access.

## Apple

Configure **Sign in with Apple** in the Apple Developer account, including a Services ID and associated primary App ID. Register this return URL exactly:

`https://<production-host>/api/erp/auth/oauth/apple/callback`

Configure these Cloudflare Worker secrets/variables:

- `APPLE_CLIENT_ID` — Services ID
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY` — `.p8` private key; store as a secret and preserve PEM newlines

Apple identities are never auto-linked by email. A user signs in by another approved method once, opens **My access → Sign-in methods**, and explicitly links Apple. This avoids incorrect account matching when the user chooses Hide My Email.

## Cloudflare configuration

Do not commit provider secrets to `wrangler.jsonc` or Git. Store secrets with Cloudflare/Wrangler, for example:

```sh
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put APPLE_PRIVATE_KEY
```

Client IDs are not cryptographic secrets, but they can also be managed as Worker variables/secrets for consistent deployment configuration.

The Google and Apple buttons are feature-gated. If the corresponding configuration is missing, the ERP continues to start normally and simply does not show that provider.

## Account recovery and unlinking

Users can remove linked providers/passkeys from **My access** only if at least one other usable sign-in method remains. Suspending an ERP user still blocks every authentication method because authorization is checked after identity verification.
