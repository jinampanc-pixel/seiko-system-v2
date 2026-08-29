import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
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
const catalog = readFileSync(new URL("../app/lib/business-catalog.ts", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
const favicon = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

test("root layout routes each first-class business before mounting legacy SEIKO enhancements", () => {
  assert.match(layout, /import \{ BusinessApplicationRouter \} from "\.\/business-application-router"/);
  assert.match(layout, /<BusinessApplicationRouter>\{children\}<\/BusinessApplicationRouter>/);
  assert.match(router, /import \{ AppEnhancements \} from "\.\/app-enhancements"/);
  assert.match(router, /businessId === "veyn-health"/);
  assert.match(router, /return <VeynApplication\/>/);
  assert.match(router, /businessId === "meth"/);
  assert.match(router, /return <MethApplication\/>/);
  assert.match(router, /<AppEnhancements\/>/);
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

test("Phase 1 removes prototype UI from the visible SEIKO home and menu", () => {
  assert.match(seikoPhase, /hero\.style\.display = "none"/);
  assert.match(seikoPhase, /nextFlow\.style\.display = "none"/);
  assert.match(seikoPhase, /ACTIVE ORDERS/);
  assert.match(seikoPhase, /Open production/);
  assert.match(seikoPhase, /Users & access/);
  assert.match(seikoPhase, /\["Inventory", "Sales", "Delivery"\]/);
  assert.doesNotMatch(seikoPhase, /SEIKO · JINAM/);
  assert.match(catalog, /allowedModules: \["home", "orders", "labels", "scan", "trace", "production", "admin"\]/);
});

test("Users and access is nested inside business settings rather than exposed as a shell module", () => {
  assert.match(veynApp, /jinamSettingsCard"><h2>Users & access/);
  assert.match(methApp, /jinamSettingsCard"><h2>Users & access/);
  assert.doesNotMatch(veynApp, /Templates<\/h2>|Libraries & options<\/h2>/);
  assert.doesNotMatch(methApp, /Business setup<\/h2>/);
});

test("VÉYN green is semantic and commercial summary remains neutral", () => {
  assert.match(veynApp, /data-tone=\{invoiceOutstanding\.length === 0 && paidInvoices > 0 \? "positive"/);
  assert.match(veynApp, /paidInvoices/);
  assert.doesNotMatch(veynApp, /DELIVERED \/ CLOSED/);
});

test("enhancement registry remains explicit and reviewable", () => {
  for (const component of ["ErpOrderSync","OwnerDropdownUx","OrderSetupPolish","OrderSetupFinalize","OrderCompactUx","WorkspaceTopPager","WorkspaceShortcuts","LabelFlowPolish","LabelDesignerPolish","LabelProductionReady","LabelFinalization","LabelDesignerInteractions","GlobalNavigation","SeikoPhase1"]) {
    assert.match(enhancements, new RegExp(`<${component} \\/>`));
  }
});

test("shared DOM scheduler owns observer and animation-frame lifecycle", () => {
  assert.match(scheduler, /export function startDomEnhancement/);
  assert.match(scheduler, /new MutationObserver/);
  assert.match(scheduler, /requestAnimationFrame/);
  assert.match(scheduler, /cancelAnimationFrame/);
});

test("consolidated adapters use the shared scheduler", () => {
  for (const source of [labelFlow, labelProduction, orderFinalize, orderCompact, workspacePager, ownerDropdown, seikoPhase]) {
    assert.match(source, /startDomEnhancement/);
  }
});
