# SEIKO System V2 — Final System Audit

**Audit date:** 3 October 2026  
**Audited source:** GitHub `main` at `16afe2e04a5532b692ac0187f351d1c67100031d`  
**Scope:** navigation, operating flow, document wording, architecture, code quality, persistence, backup/recovery, access control, security, release readiness, and maintainability.

## Executive conclusion

The current application is a valuable recoverable baseline, but it is **not yet a safe foundation for unrestricted feature development**. Orders, authentication, permissions, billing and clients have real server-backed capability, and the production build completes. The main risks are fragmented navigation, extensive patch-layer UI code, browser-only operational state, incomplete database migrations, partial backup coverage, missing billing audit history, and a failing test/lint baseline.

Do not reset or discard the current app. Preserve commit `16afe2e` as the recovery point, then complete the stabilization stages below before adding major modules.

## Release evidence

| Check | Result | Meaning |
|---|---:|---|
| Production build | Pass | The source compiles into a deployable Worker build. |
| Automated tests | **244 passed / 12 failed / 256 total** | Existing regressions prevent a trustworthy green baseline. |
| Lint | **1 error / 28 warnings** | CI is blocked because lint runs before deployment. |
| GitHub deployment workflow | Manual and test-gated | A deployment cannot pass while `npm test` fails. |
| Database migration journal | Empty | Runtime-created tables are not represented by reproducible migrations. |
| Worker observability | Disabled | Production failures cannot be monitored adequately. |

The 12 failing tests include 11 packing/label designer contracts and one billing architecture contract. Some appear stale relative to the newer implementation, while others identify real drift. Each must be classified and either fixed in the product or deliberately updated with documented acceptance evidence.

## 1. Flow and navigation

### Audit correction — confirmed order workflow defects

The original audit did not test enough end-to-end order interactions. The following are confirmed defects and must be treated as stabilization work:

1. **Save & Close is not trustworthy.** The action passes through the React workspace menu, a capture-phase confirmation layer and additional DOM enhancement listeners. The automated contracts only check that the words exist in source; they do not prove that clicking the action saves to shared storage and returns to Order Center. The reported failure must be reproduced and fixed with a real browser test.
2. **Delete order is not a real shared-data deletion.** The current handler removes the order from browser `localStorage`, but the shared Orders API supports only list, upsert, local import and audit. It has no archive/delete operation. A locally deleted order can therefore return from D1 synchronization.
3. **Completing one order changes the whole Home view.** `changeStatus` explicitly changes `workMode` from `active` to `completed` when an order is marked Completed. This makes the status action behave like a dashboard filter selection and unexpectedly replaces the Active Orders list.
4. **Order Center hides the status that the source component renders.** The enhancement layer sets the native status wrapper to hidden and moves a cloned selector into the three-dot menu. Status must remain visible for every order row, with the menu used for secondary actions.
5. **Order Center actions are incomplete.** The row menu contains Edit setup, Create labels and Archive/Restore only. It needs order-context actions for Open workspace, Record payment, View payments/receipts, Create invoice, Create delivery challan, Create quotation, Edit setup, Create labels, Archive and owner-controlled deletion.
6. **Archive and delete are conflated.** Normal users should archive; permanent deletion should be owner-only, server-authoritative, blocked or specially handled when financial documents/payments exist, confirmed with the order number, and written to an immutable audit log.
7. **Status changes are fragmented.** Home, Order Center and Workspace each implement status changes differently. They must call one server-backed command with the same validation and then update every view from the returned order version.

Required acceptance tests:

- Edit a value → Save & Close → Order Center appears → reopen order → value remains → reload browser → value remains from D1.
- Delete an eligible test order → reload and sign in on another browser session → order remains deleted/tombstoned and an audit event exists.
- Mark one Active order Completed → that row leaves Active Orders while the dashboard remains on Active Orders.
- Every Order Center row visibly shows status without opening the menu.
- Record payment from an Order Center row → the payment is attached to that order and its receipt opens.
- View payments from an Order Center row → only that order's payments and allocations are shown.

### What works

- The app has business-aware permissions and hides inaccessible modules.
- SEIKO, MeTh and VÉYN are routed to separate application surfaces.
- Home exposes useful daily actions, including order, payment and billing actions.
- Standalone label routes retain a global menu and business switcher.

### Problems

1. Most modules are React state inside `/`, while label creation and printing are separate URLs. This produces inconsistent browser Back behavior, weak deep linking and unclear refresh recovery.
2. Navigation between standalone routes and the main app stores a one-time intent in `sessionStorage`, reloads `/`, waits with timers, opens the menu and programmatically clicks a matching button. This is fragile and hard to extend.
3. The same destination is called **Home** in one navigation layer and **Overview** in another.
4. The main application menu and `GlobalNavigation` both participate in navigation. This duplicates ownership and increases the chance of stale highlights or unexpected destinations.
5. Twenty-six enhancement components modify or wrap the main interface, several through DOM queries and mutation observers. Navigation and layout behaviour can therefore depend on mount order.

### Required direction

- Give each major module a stable route: `/home`, `/orders`, `/labels`, `/billing`, `/clients`, `/production`, and `/settings`.
- Keep the business in a stable route/query context and preserve it in every link.
- Use one navigation component and one route registry as the source of labels, icons, permissions and active state.
- Use **Home** consistently.
- Give every editor a deterministic return route and unsaved-change guard.

## 2. Wording and generated documents

### What works

- Blank supplier details and most blank customer/dispatch fields are now omitted.
- The duplicate gold SEIKO business name was removed.
- Delivery documents support non-GST quantity-only, non-GST with values, and GST modes.
- Document amendments preserve the document number and show a revision marker.

### Remaining wording defects

1. Every payment receipt prints **Applied to invoices** and **Advance balance available**, including a direct standalone or invoice payment where those concepts are irrelevant and both values are zero.
2. A direct invoice payment should show only amount received, invoice reference, cumulative amount received and balance. An order advance should show order reference and remaining unallocated advance. These must be separate templates.
3. **Bill to / Consignee** is reused across invoices, challans and receipts. Receipts should say **Received from** or **Payer**; invoices should say **Bill to**; challans should say **Consignee / Deliver to**.
4. **Duplicate for Supplier** is awkward for SEIKO's retained invoice copy. Use **Office Copy** unless a statutory copy label is required.
5. **Taxable value** appears on non-GST documents. Use **Subtotal** or **Amount** for non-GST documents and reserve **Taxable value** for GST documents.
6. The billing workspace uses **bill**, **document**, **invoice**, and **standalone bill** interchangeably. Use **document** as the umbrella term and the exact type for actions.
7. **Updated invoice** is visible even when the user is already viewing the invoice and no receipt context requires the action.
8. Document acknowledgements and footer statements are always printed. They should be optional or driven by document type and business policy.

### Required template matrix

Create explicit templates for:

- Tax invoice
- Non-GST invoice
- Retail receipt
- Payment receipt against invoice
- Payment receipt against order/advance
- GST delivery challan
- Non-GST delivery challan with values
- Non-GST delivery challan without values
- Quotation

Each template must declare required, optional and prohibited fields. A prohibited or empty field must consume no space.

## 3. Expandability

### Strengths

- Domain models exist for orders, billing, clients, permissions and multiple businesses.
- Server permissions are role plus explicit-grant based.
- Order storage supports optimistic concurrency and audit events.
- The API and business partitioning provide a useful starting boundary.

### Constraints

1. `app/layout.tsx` imports 43 global stylesheets in order. Later CSS frequently repairs earlier CSS, so additions can cause distant regressions.
2. `AppEnhancements` mounts 26 behaviour layers. Several inspect or mutate DOM owned by other React components.
3. Large files mix data access, domain rules, UI state and rendering. Examples include `label-designer.tsx` (675 lines), `label-designer-v2.tsx` (649), `seiko-final-ux-pass.tsx` (583), and `packing-person-label-designer.tsx` (538).
4. Similar functions exist in legacy and newer label designers, creating parallel sources of truth.
5. Runtime table creation is distributed among request handlers and server libraries instead of migrations.

### Required direction

- Stop adding new patch/enhancement layers.
- Replace each patched surface with one source-owned component, starting with navigation, billing and packing labels.
- Split large files into domain, repository/API, state/controller, view and print modules.
- Introduce a shared design-token layer and module-scoped styles.
- Add formal schema versioning and migrations before adding more persisted entities.

## 4. Code clarity and quality

The code has good domain intent but uneven implementation quality.

Positive examples include integer-paise payment checks, atomic overpayment prevention, order version conflicts, hashed session tokens, server permission checks, login throttling and passkey origin verification.

Current quality debt:

- The full test suite is red.
- Lint is red with one error and 28 warnings.
- Several primary UI files contain compressed multi-component lines that are difficult to review safely.
- DOM-query adapters and mutation observers bypass normal React ownership.
- Contract tests sometimes assert implementation text rather than user-visible outcomes, making intentional refactors look like regressions.
- Billing and client table definitions are duplicated in request handlers.

Before resuming features, make CI green and keep it green on every `main` commit.

## 5. Data storage, backup and recovery

### Current storage map

| Data | Current authority | Local/browser copy | Audit/history |
|---|---|---|---|
| Orders | Cloudflare D1 | Local safety cache | Strong: versioned writes and immutable audit events |
| Users, memberships, sessions, passkeys | Cloudflare D1 | Session cookie only | Authentication events exist |
| Billing documents | Cloudflare D1 JSON rows | Older legacy documents may remain browser-only | Weak: amendments overwrite the stored JSON; no immutable revision table |
| Payments | Cloudflare D1 | Included in billing export | Records are append-only in normal flow, but no complete ledger audit UI |
| Clients | Cloudflare D1 JSON rows | Legacy client import source exists | Weak: no immutable change log or timestamps in table columns |
| Label tasks, layouts and presentation preferences | Browser `localStorage` in several modules | Yes, and often only copy | None |
| Scan/offline state and several UI preferences | Browser storage | Yes | Limited or none |
| MeTh/shared commerce | D1 plus some browser caches | Mixed | Better for synchronized server collections |

### Critical findings

1. D1 is both the live database and the cloud copy. It is one storage authority, not two independent copies.
2. The **Export backup** button exports billing data only. It does not export orders, clients, labels, settings or the complete operational history, and there is no matching restore workflow.
3. There is no scheduled second-cloud snapshot configured in this repository.
4. There is no verified encrypted hard-drive backup workflow.
5. The Drizzle migration journal is empty, while production tables are created dynamically from APIs. A fresh environment cannot be reproduced confidently from committed migrations.
6. The deployment workflow does not apply database migrations.
7. Billing amendments overwrite the previous document snapshot. A revision number is shown, but the former revision cannot be reconstructed from billing storage.
8. Label templates and tasks can disappear when browser storage is cleared or another device is used.

### Required three-copy design

1. **Live operational database:** D1 with all authoritative business entities and formal migrations.
2. **Independent cloud backup:** scheduled encrypted database export plus object/file assets to a versioned backup bucket. Keep daily, weekly and monthly retention and record checksums.
3. **Offline hard-drive copy:** owner-triggered encrypted full-business export with a manifest, schema version, checksums and restore instructions.

The business export should include orders, clients, products, billing documents, receipts, payments, challans, quotations, label templates, settings and audit metadata. Routine business exports should exclude password hashes, passkey public-key records, session tokens and connector secrets. Those require a separate security-admin recovery policy.

### Restore requirements

- Validate schema version and checksum before import.
- Offer a dry-run summary of new, changed, duplicate and rejected records.
- Never overwrite newer records silently.
- Require owner permission and recent re-authentication.
- Log every export and restore.
- Perform and record a real restore drill before calling the backup system complete.

## 6. Security and privacy

### Existing strengths

- Server-side permission checks protect orders, billing and clients.
- Passwords use salted PBKDF2; session tokens are stored as hashes.
- Sessions are secure, HTTP-only and revocable.
- Login failures are rate-limited.
- Passkeys verify challenge, origin, RP ID and signature counters.
- Connector secrets are designed for encrypted server storage rather than browser storage.

### Gaps

1. Worker observability is disabled, leaving security and storage failures hard to investigate.
2. No application-level security-header policy was found for CSP, frame restrictions, content-type sniffing or referrer policy.
3. General cookie-authenticated write APIs do not consistently perform explicit Origin/CSRF validation.
4. Billing/client change events are not written to immutable audit tables.
5. Customer PII exports are not encrypted or access-logged by the application.
6. Session and authentication event retention/cleanup is not defined.
7. Client duplicate merging by shared phone/email can combine the wrong people without an owner review screen.

## 7. Operational reliability

- Production build: healthy.
- Release gate: unhealthy because lint and tests fail.
- Observability: insufficient.
- Disaster recovery: unproven.
- Data migration repeatability: insufficient.
- Concurrency protection: strong for orders and invoice overpayment; incomplete for general billing/client history.
- Offline behaviour: useful but too much state can remain browser-only indefinitely.

## Stabilization plan before new feature development

### Stage 0 — Preserve the baseline

- Keep GitHub commit `16afe2e` as the named recovery checkpoint.
- Export the current live D1 database before any schema work.
- Record the current Cloudflare Worker, D1 database ID and production URL in an owner-only operations record.

### Stage 1 — Restore engineering trust

- Classify and resolve all 12 failing tests.
- Remove the lint error and review all 28 warnings.
- Require green CI before deployment.
- Add a smoke test for Home → Orders → Billing → payment → receipt → Back/Home.
- Repair and browser-test Save & Close, server-authoritative archive/delete, non-navigating Home status changes, visible Order Center statuses and order-context financial actions.

### Stage 2 — Make storage reproducible

- Add committed migrations for every runtime-created table.
- Add a migration step to deployment.
- Add immutable billing/client audit tables.
- Move label tasks, templates and presentation rules from browser-only storage to D1.

### Stage 3 — Implement backup and restore

- Build one complete owner export and validated restore path.
- Add encrypted scheduled cloud snapshots.
- Add encrypted offline export and document a restore drill.

### Stage 4 — Simplify navigation and code ownership

- Introduce stable module routes and one navigation registry.
- Retire session-storage click-routing.
- Consolidate enhancement layers into source-owned components.
- Consolidate global CSS into tokens and module styles.

### Stage 5 — Finalize professional documents

- Implement the document template matrix.
- Remove zero/irrelevant allocation and advance wording.
- Make acknowledgements, payment details and footer statements document-specific and optional.
- Add visual PDF snapshots for every template and long/multi-page cases.

## Development gate

Major new development should resume only when:

- tests and lint pass;
- migrations can create a fresh database;
- a full export can be restored into a clean database;
- navigation has one source of truth;
- browser-only business data has a server-backed migration path; and
- billing/client amendments have immutable history.

Small corrections required to reach those conditions are stabilization work and should begin next.

