# SEIKO System V2

Operational web application for SEIKO Uniforms / SEIKO Tailors.

## Source of truth

The canonical codebase is this GitHub repository on the `main` branch. ChatGPT, Codex, local development, and deployment must all read from and write back to this repository rather than relying on chat history or an old local preview.

See `AGENTS.md` for the required handoff and synchronization rules.

## Technology

- React 19
- Vinext
- Vite 8
- Cloudflare Workers / Wrangler
- Node.js `>=22.13.0`

## Local development

Install exactly from the committed lockfile and start the development server:

```bash
npm ci
npm run dev
```

If a generated Vite RSC cache file under `.vite-cache/deps_rsc/` fails to parse, stop the dev server and clear generated caches before changing application source. Do not edit generated cache files.

## Validation

```bash
npm test
```

The test script runs the repository contract tests, performs the production build, and validates rendered HTML.

GitHub Actions also runs this validation automatically for pushes and pull requests targeting `main` using `.github/workflows/ci.yml`.

## Cloudflare deployment

The Cloudflare Worker configuration is in `wrangler.jsonc` and the application provides:

```bash
npm run deploy:cloudflare
```

A manual GitHub Actions production workflow is available at `.github/workflows/deploy-cloudflare.yml`.

The workflow requires these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Once those secrets exist, run the **Deploy SEIKO to Cloudflare** workflow from GitHub Actions. It installs from the lockfile, runs the full test/build suite, and only then invokes Wrangler.

Do not commit Cloudflare credentials or local `.env` values.

## ChatGPT Sites project

The repository also carries `.openai/hosting.json` for the linked ChatGPT Sites project. That project metadata is separate from the Cloudflare Worker production deployment and should not be treated as a replacement for GitHub `main` as the source of truth.

## Important files

- `app/` — application UI and behavior
- `worker/` — Cloudflare Worker entry
- `vite.config.ts` — Vinext/Vite and local Cloudflare integration
- `wrangler.jsonc` — Cloudflare Worker deployment configuration
- `package.json` / `package-lock.json` — pinned application and toolchain dependencies
- `AGENTS.md` — cross-model development and handoff rules
- `.github/workflows/ci.yml` — automatic build/test validation
- `.github/workflows/deploy-cloudflare.yml` — manual production deployment
