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

Before a change is considered ready:

```bash
npm run lint
npm test
```

Linting enforces TypeScript, React, React Hooks, accessibility and Next.js rules. The test script runs repository contract tests, performs the production build, and then validates rendered HTML routes.

GitHub Actions runs both linting and the full test/build validation automatically for pushes and pull requests targeting `main` using `.github/workflows/ci.yml`.

## Architecture discipline

Application state and business rules belong in the owning React/domain module. Small DOM enhancement adapters are mounted centrally by `app/app-enhancements.tsx`; shared mutation scheduling lives in `app/lib/dom-enhancement.ts`. New business logic should not be added as another global DOM patch.

Browser state that belongs to one business must remain partitioned by business. Existing helpers such as `businessStorageKey()` and `orderStoreKey()` are preferred over ad-hoc local-storage keys.

The existing layered CSS around Orders and Labels should only be consolidated when equivalent visual-regression coverage exists. Functional refactors must not silently change label geometry, printing dimensions, workspace behavior, or navigation.

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
- `app/app-enhancements.tsx` — deliberate registry of compatibility UI adapters
- `app/lib/dom-enhancement.ts` — shared DOM enhancement lifecycle/scheduler
- `worker/` — Cloudflare Worker entry
- `vite.config.ts` — Vinext/Vite and local Cloudflare integration
- `wrangler.jsonc` — Cloudflare Worker deployment configuration
- `package.json` / `package-lock.json` — pinned application and toolchain dependencies
- `AGENTS.md` — cross-model development and handoff rules
- `.github/workflows/ci.yml` — automatic lint/build/test validation
- `.github/workflows/deploy-cloudflare.yml` — manual production deployment
