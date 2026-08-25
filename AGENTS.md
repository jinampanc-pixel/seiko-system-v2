# SEIKO System V2 — Agent Working Agreement

This repository is the single source of truth for SEIKO System V2.

## Source of truth

- The canonical repository is `jinampanc-pixel/seiko-system-v2`.
- The canonical branch is `main` unless the user explicitly asks for a different branch/PR workflow.
- Never reconstruct code from chat history when the repository can be read.
- Before making changes, inspect the latest repository state and the relevant files.
- If working locally, fetch/pull the latest `main` before editing and do not overwrite newer remote work.

## Switching between ChatGPT and Codex

- ChatGPT and Codex must treat GitHub as shared persistent state.
- A model must not assume that its previous local preview or chat context is still current.
- Before continuing work started by another model, read the latest commit(s) and relevant files from GitHub.
- After a real code/configuration change, commit it to GitHub before handing the work to another model.
- Do not leave important completed changes only in an uncommitted local workspace.
- When reporting completion, include the resulting Git commit SHA.

## Safety rules

- Preserve working behavior unless the user explicitly asks to change it.
- Prefer complete, coherent fixes over patch layers or temporary UI workarounds.
- Do not replace whole files blindly when a smaller verified change is sufficient.
- Do not modify generated folders such as `.vite-cache`, `.next`, `dist`, or `.wrangler` in Git.
- Do not commit credentials, API tokens, `.env` secrets, local machine paths, or private data.
- Do not hard-code school/order-specific business data into generic application logic.

## Validation

For code/configuration changes, use the repository scripts as the baseline checks:

```bash
npm ci
npm test
```

`npm test` includes the production build. If a change is too narrow to justify the full suite during iteration, run the relevant smaller check first, but the full test/build should pass before a production deployment.

## Deployment

- Production deployment is Cloudflare Workers.
- `main` remains the source branch.
- Deployment must use committed repository state, not uncommitted local files.
- Never put Cloudflare credentials in tracked files.
- GitHub Actions deployment uses repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Local preview cache issue

If Vinext/Vite reports a parse error from a generated `.vite-cache/deps_rsc/...` file (for example a duplicate default export inside `react-server-dom-webpack/server.edge`), treat that as generated-cache state first, not as a SEIKO application-code defect. Stop the dev server, clear generated Vite/Next caches, reinstall from the committed lockfile only if needed, then restart. Do not edit generated cache files.
