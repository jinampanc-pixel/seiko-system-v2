# Business assistant

The assistant is a React UI and authenticated server API at `/api/erp/assistant`. It uses the Cloudflare Workers AI binding, with `@cf/zai-org/glm-4.7-flash`. No model credential is sent to the browser. All business reads and writes delegate to the existing permission-enforcing APIs. No business table is migrated or rewritten by assistant initialization.

## Cost and activation

The account's Workers plan was verified as **Free** in the Cloudflare dashboard on 2026-11-12. Workers AI has 10,000 neurons/day on that plan and stops at the provider limit. The app also atomically reserves 1,000 neurons before each call, with an 8,000/day budget across all users/businesses, no refund after failed calls or missing usage. When the provider reports token usage, unused reservation is released using published model rates plus a 20% margin and 10-neuron floor. Input is capped at 80,000 UTF-8 bytes; output including reasoning is capped at 8,192 tokens. This conservative app limit may stop earlier than the provider allowance. The provider cap remains the authoritative no-billing control. Other AI uses on the account share that allowance.

`ASSISTANT_FREE_PLAN_CONFIRMED=true` enables model calls. Set it to `false` to disable immediately. Recheck this setting and pricing before changing the account plan, model, input/output limits or budget. This flag is an operational assertion, not a provider billing lock: an account administrator upgrading the plan must disable or reconfigure the assistant first. No fallback to a paid provider exists.

References: https://developers.cloudflare.com/workers-ai/platform/pricing/ and https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/

## Business actions and review

Read tools cover app search, orders, person records, production handoffs, physical trace, deterministic invoice balances, billing review and approved memory. Missing/ambiguous records and stale Google Sheets are surfaced rather than treated as current facts. Search metadata is not proof of physical garment completion. The model must use real trace identifiers for individual garment units.

Proposals cover new order setup, explicit edits to existing orders, order stage changes, production actions and memory. Proposals are stored server-side and scoped to the actor, business and conversation. The browser can confirm only a proposal ID, not substitute its payload. Every business change requires a separate review and confirmation. Existing-order edits retain the original version for atomic conflict detection. Metadata, Google Sheet links, fulfilment and whole-order replacement are not patchable. New-order person rows are empty. Artwork uploads use the existing upload workflow.

Confirmation atomically claims the proposal before any mutation. Duplicate requests return the receipt or refuse replay. An ambiguous transport/storage failure is never automatically retried. Proposals expire after 30 minutes; a new chat message supersedes pending proposals in that conversation. Production/billing continue to enforce existing sheet synchronization and readiness rules. Creating an order does not bypass the separate Google Sheet connection workflow.

The registry is deliberately extensible. Unsupported actions are reported as unsupported, not simulated. This release does not expose invoice issuance/payment entry, deletion, access changes or arbitrary SQL to the model.

## Memory and privacy

Conversation history, pending actions and explicitly approved preferences use new `erp_assistant_*` tables. Memory is private to the actor and business, inspectable and removable through review. It is not automatic model training. Only explicitly requested stable terminology/preferences should be saved. Changing facts must be reread from business records. Voice recognition uses the browser's speech service and microphone permission; text can be reviewed before submission. No mic starts on opening the panel.

## Validation and rollout

Tests use in-memory SQLite and fictional clients/persons only. Never confirm test actions against production orders, including Sajipur. Run `npm ci`, `npm run lint`, `npm test`, and browser smoke checks before deployment. The additive migration is `0010_business_assistant.sql`; production release performs its existing verified backup before migrations. Verify a synthetic read/chat and unsaved proposal after release, without confirming it against live business data.

Natural-language accuracy is model-dependent. Tests of action boundaries do not prove model accuracy; evaluate multilingual instructions, omissions, contradictory corrections, ambiguous clients, unit-level tracking and tool failures with synthetic data before claiming dependable production behavior.
