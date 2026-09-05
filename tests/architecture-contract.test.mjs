import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const router = readFileSync(new URL("../app/business-application-router.tsx", import.meta.url), "utf8");
const enhancements = readFileSync(new URL("../app/app-enhancements.tsx", import.meta.url), "utf8");
const scheduler = readFileSync(new URL("../app/lib/dom-enhancement.ts", import.meta.url), "utf8");
const labelFlow = readFileSync(new URL("../app/label-flow-polish.tsx", import.meta.url), "utf8");
const labelProduction = readFileSync(new URL("../app/label-production-ready.tsx", import.meta.url), "utf8");
const orderFinalize = readFileSync(new URL("../app/order-setup-finalize.tsx", import.meta.url), "utf8");
const orderCompact = readFileSync(new URL("../app/order-compact-ux.tsx", import.meta.url), "utf8");
const workspacePager = readFileSync(new URL("../app/workspace-top-pager.tsx", import.meta.url), "utf8");
const ownerDropdown = readFileSync(new URL("../app/owner-dropdown-ux.tsx", import.meta.url), "utf8");
const methApp = readFileSync(new URL("../app/meth-app.tsx", import.meta.url), "utf8");
const veynApp = readFileSync(new URL("../app/veyn-app.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../app/jinam-business-shell.tsx", import.meta.url), "utf8");
const seikoPhase = readFileSync(new URL("../app/seiko-phase1.tsx", import.meta.url), "utf8");
const seikoPhase2 = readFileSync(new URL("../app/seiko-phase2.tsx", import.meta.url), "utf8");
const seikoPhase2Gate = readFileSync(new URL("../app/seiko-phase2-gate.tsx", import.meta.url), "utf8");
const autofill = readFileSync(new URL("../app/seiko-library-autofill.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../app/lib/business-catalog.ts", import.meta.url), "utf8");
const businessLibrary = readFileSync(new URL("../app/lib/business-library.ts", import.meta.url), "utf8");
const seikoBilling = readFileSync(new URL("../app/lib/seiko-billing.ts", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
const favicon = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

test("root layout routes each first-class business and SEIKO has a clean application owner", () => {
  assert.match(layout, /import \{ BusinessApplicationRouter \} from "\.\/business-application-router"/);
  assert.match(layout, /<BusinessApplicationRouter>\{children\}<\/BusinessApplicationRouter>/);
  assert.match(router, /SeikoPriority0App/);
  assert.match(router, /forceSeiko \|\| businessId === "seiko"/);
  assert.match(router, /businessId === "veyn-health"/);
  assert.match(router, /return <VeynApplication\/>/);
  assert.match(router, /businessId === "meth"/);
  assert.match(router, /return <MethApplication\/>/);
  assert.doesNotMatch(router, /AppEnhancements/);
});

test("MeTh never falls through to the SEIKO compatibility application", () => {
  assert.match(methApp, /JinamBusinessShell/);
  assert.match(methApp, /businessId !== "meth"/);
  assert.match(methApp, /READY TO PACK/);
  assert.match(methApp, /Linked SEIKO production handoffs/);
  assert.doesNotMatch(methApp, /Business isolated|MeTh owns its orders|SEIKO is a linked manufacturer/);
  assert.doesNotMatch(methApp, /<Orders/);
  assert.doesNotMatch(methApp, /AppEnhancements/);
});

test("business shell shows only active business identity while Jinam remains the system identity", () => {
  assert.match(shell, /jinamBusinessBrand/);
  assert.doesNotMatch(shell, /jinamSystemBrand/);
  assert.doesNotMatch(shell, />Jinam</);
  assert.match(shell, /aria-label="Switch business"/);
  assert.match(shell, /jinamContextBack/);
  assert.match(shell, /localStorage\.setItem\("jinam:selected-business"/);
  assert.doesNotMatch(enhancements, /JinamLegacyBrand/);
});

test("installed system identity is Jinam with the S and integrated J money mark", () => {
  assert.match(manifest, /"name": "Jinam"/);
  assert.match(manifest, /"short_name": "Jinam"/);
  assert.match(manifest, /"theme_color": "#050505"/);
  assert.match(favicon, /fill="#050505"/);
  assert.match(favicon, /M45\.5 17\.5/);
  assert.match(favicon, /M33 9\.5V42\.3/);
  assert.match(layout, /favicon\.svg\?v=4/);
  assert.match(serviceWorker, /jinam-shell-v4/);
  assert.match(serviceWorker, /favicon\.svg\?v=4/);
});

test("Phase 1 remains available as retained reference while clean SEIKO runtime owns the live shell", () => {
  assert.match(seikoPhase, /hero\.style\.display = "none"/);
  assert.match(seikoPhase, /nextFlow\.style\.display = "none"/);
  assert.match(seikoPhase, /ACTIVE ORDERS/);
  assert.match(page, /<span>Users & access<\/span>/);
  assert.match(catalog, /allowedModules: \["home", "orders", "labels", "scan", "trace", "production", "billing", "admin"\]/);
});

test("SEIKO Phase 2 reference keeps libraries and commercial logic isolated from other apps", () => {
  assert.match(enhancements, /<SeikoPhase2Gate \/>/);
  assert.match(seikoPhase2Gate, /businessId !== "seiko"/);
  assert.match(seikoPhase2, /Client Library/);
  assert.match(seikoPhase2, /Product Library/);
  assert.match(seikoPhase2, /Billing/);
  assert.doesNotMatch(veynApp, /SeikoPhase2/);
  assert.doesNotMatch(methApp, /SeikoPhase2/);
});

test("business libraries stay partitioned and learn from SEIKO orders", () => {
  assert.match(businessLibrary, /jinam:\$\{businessId\}:library:\$\{kind\}:v1/);
  assert.match(businessLibrary, /learnLibrariesFromOrders/);
  assert.match(businessLibrary, /sourceOrderIds/);
  assert.match(autofill, /seiko-client-library-options/);
  assert.match(autofill, /Delivery address/);
  assert.match(autofill, /Billing address/);
});

test("SEIKO billing links documents, tax treatment, payments and outstanding balances to orders", () => {
  assert.match(seikoBilling, /orderId: string/);
  assert.match(seikoBilling, /SeikoTaxMode = "gst" \| "non_gst"/);
  assert.match(seikoBilling, /"intra_state" \| "inter_state"/);
  assert.match(seikoBilling, /invoiceOutstanding/);
  assert.match(seikoBilling, /paymentStoreKey/);
  assert.match(seikoBilling, /showCustomerAcknowledgement/);
});

test("Users and access is nested inside business settings rather than exposed as a shell module", () => {
  assert.match(veynApp, /jinamSettingsCard"><h2>Users & access/);
  assert.match(methApp, /jinamSettingsCard"><h2>Users & access/);
});

test("VÉYN green is semantic and commercial summary remains neutral", () => {
  assert.match(veynApp, /data-tone=\{invoiceOutstanding\.length === 0 && paidInvoices > 0 \? "positive"/);
  assert.match(veynApp, /paidInvoices/);
  assert.doesNotMatch(veynApp, /DELIVERED \/ CLOSED/);
});

test("rescue enhancement registry keeps overlapping UI owners quarantined", () => {
  for (const retired of ["LabelFlowPolish","LabelDesignerPolish","LabelProductionReady","LabelFinalization","LabelDesignerInteractions","LabelFieldCompact","LabelWorkspaceRefinement","PackingWorkflowRuntimeFixes","SeikoListCenterEnhancements","SeikoOperationalUx","SeikoInterfaceFixes","GlobalNavigation"]) {
    assert.doesNotMatch(enhancements, new RegExp(`<${retired} \\/>`));
  }
  assert.match(layout, /seiko-rescue\.css/);
  assert.match(layout, /seiko-priority0\.css/);
});

test("shared DOM scheduler remains available to retained adapters", () => {
  assert.match(scheduler, /export function startDomEnhancement/);
  assert.match(scheduler, /new MutationObserver/);
  assert.match(scheduler, /requestAnimationFrame/);
  assert.match(scheduler, /cancelAnimationFrame/);
  for (const source of [labelFlow, labelProduction, orderFinalize, orderCompact, workspacePager, ownerDropdown, seikoPhase, autofill, seikoPhase2]) assert.match(source, /startDomEnhancement/);
});
