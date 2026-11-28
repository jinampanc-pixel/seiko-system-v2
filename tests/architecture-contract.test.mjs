import {inflateSync} from "node:zlib";
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
  assert.match(methApp, /Linked SEIKO production handoffs/i);
  assert.doesNotMatch(methApp, /Business isolated|MeTh owns its orders|SEIKO is a linked manufacturer/);
  assert.doesNotMatch(methApp, /<Orders/);
  assert.doesNotMatch(methApp, /AppEnhancements/);
});

test("business shell shows only active business identity while Jinam remains the system identity", () => {
  assert.match(shell, /jinamBusinessBrand/);
  assert.doesNotMatch(shell, /jinamSystemBrand/);
  assert.doesNotMatch(shell, />Jinam</);
  assert.match(shell, /aria-label="Switch business"/i);
  assert.match(shell, /jinamContextBack/);
  assert.match(shell, /localStorage\.setItem\("jinam:selected-business"/);
  assert.doesNotMatch(enhancements, /JinamLegacyBrand/);
});

test("installed app identity is SEIKO TAILORS with the approved navy and gold collar", () => {
  const installed=JSON.parse(manifest);
  assert.equal(installed.id,"/");assert.equal(installed.scope,"/");
  assert.equal(installed.name,"SEIKO TAILORS");assert.equal(installed.short_name,"SEIKO TAILORS");
  assert.equal(installed.theme_color,"#173c5e");assert.equal(installed.background_color,"#fbf5ed");
  for(const size of ['192x192','512x512'])assert.ok(installed.icons.some(icon=>icon.sizes===size&&icon.type==='image/png'));
  assert.match(favicon,/SEIKO TAILORS Collar/);assert.match(favicon,/#06365f/);assert.match(favicon,/#b78e3b/);
  assert.match(layout,/title: "SEIKO TAILORS"/);assert.match(layout,/icon:.*APP_ICONS.svg/);assert.match(layout,/apple:.*APP_ICONS.apple/);
  for(const file of ["app-icon-192.png","app-icon-512.png","favicon-32.png","apple-touch-icon.png"]){
    const png=readFileSync(new URL("../public/"+file,import.meta.url));assert.equal(png[25],6,"Icon exports include alpha");
    const chunks=[];for(let offset=8;offset<png.length;){const size=png.readUInt32BE(offset);if(png.toString("ascii",offset+4,offset+8)==="IDAT")chunks.push(png.subarray(offset+8,offset+8+size));offset+=size+12;}
    assert.equal(inflateSync(Buffer.concat(chunks))[4],0,"Icon corner is transparent");
  }
  assert.doesNotMatch(favicon,/<rect/);
  assert.match(serviceWorker,/seiko-tailors-shell-v7/);assert.match(serviceWorker,/seiko-collar-gold-v7-512\.png/);
  for(const icon of installed.icons){assert.ok(icon.src.startsWith("/icons/seiko-collar-gold-v7"));assert.ok(!icon.src.includes("?"));assert.ok(readFileSync(new URL("../public"+icon.src,import.meta.url)).length>0);assert.ok(serviceWorker.includes(icon.src));}
  assert.match(layout,/manifest: "\/manifest.webmanifest\?v=5"/);
});

test("Phase 1 removes prototype UI from the visible SEIKO home and menu", () => {
  assert.match(seikoPhase, /hero\.style\.display = "none"/);
  assert.match(seikoPhase, /nextFlow\.style\.display = "none"/);
  assert.match(seikoPhase, /<b>Quick Actions<\/b>/);
  assert.match(seikoPhase, /<b>Orders<\/b>/);
  assert.doesNotMatch(seikoPhase, /className=\{`seikoMetricCard/);
  assert.match(seikoPhase, /Open Production/);
  assert.match(page, /<span>Users & access<\/span>/i);
  assert.match(seikoPhase, /\["Inventory", "Sales", "Delivery"\]/);
  assert.doesNotMatch(seikoPhase, /SEIKO · JINAM/);
  assert.match(catalog, /allowedModules: \["home", "orders", "labels", "scan", "trace", "production", "billing", "admin"\]/i);
});

test("SEIKO Phase 2 exposes real owner/admin libraries and billing without leaking them to other apps", () => {
  assert.match(enhancements, /<SeikoPhase2Gate \/>/);
  assert.match(seikoPhase2Gate, /businessId !== "seiko"/);
  assert.match(seikoPhase2Gate, /\["owner", "admin"\]/);
  assert.match(seikoPhase2, /Client Library/);
  assert.match(seikoPhase2, /GarmentCatalog/);
  assert.match(seikoPhase2, /Billing/);
  assert.match(seikoPhase2, /Document Templates/);
  assert.doesNotMatch(veynApp, /SeikoPhase2/);
  assert.doesNotMatch(methApp, /SeikoPhase2/);
});

test("business libraries stay partitioned and learn from SEIKO orders", () => {
  assert.match(businessLibrary, /jinam:\$\{businessId\}:library:\$\{kind\}:v1/);
  assert.match(businessLibrary, /learnLibrariesFromOrders/);
  assert.match(businessLibrary, /sourceOrderIds/);
  assert.match(autofill, /seiko-client-library-options/);
  assert.match(autofill, /Delivery address/i);
  assert.match(autofill, /Billing address/i);
});

test("SEIKO billing links documents, tax treatment, payments and outstanding balances to orders", () => {
  assert.match(seikoBilling, /orderId: string/);
  assert.match(seikoBilling, /SeikoTaxMode = "gst" \| "non_gst"/);
  assert.match(seikoBilling, /"intra_state" \| "inter_state"/);
  assert.match(seikoBilling, /invoiceOutstanding/);
  assert.match(seikoBilling, /paymentStoreKey/);
  assert.match(seikoBilling, /showCustomerAcknowledgement/);
  const billingWorkspace = readFileSync(new URL("../app/seiko-billing-workspace.tsx", import.meta.url), "utf8");
  assert.match(billingWorkspace, /Record payment/i);
  assert.match(billingWorkspace, /GST document/i);
  assert.match(billingWorkspace, /<option value="non_gst">Non-GST document<\/option>/i);
});

test("Users and access is nested inside business settings rather than exposed as a shell module", () => {
  assert.match(veynApp, /jinamSettingsCard"><h2>Users & access/i);
  assert.match(methApp, /jinamSettingsCard"><h2>Users & access/i);
  assert.doesNotMatch(veynApp, /Templates<\/h2>|Libraries & options<\/h2>/);
  assert.doesNotMatch(methApp, /Business setup<\/h2>/);
});

test("VÉYN green is semantic and commercial summary remains neutral", () => {
  assert.match(veynApp, /data-tone=\{invoiceOutstanding\.length === 0 && paidInvoices > 0 \? "positive"/);
  assert.match(veynApp, /paidInvoices/);
  assert.doesNotMatch(veynApp, /DELIVERED \/ CLOSED/);
});

test("enhancement registry remains explicit and reviewable", () => {
  for (const component of ["ErpOrderSync","OwnerDropdownUx","OrderSetupPolish","OrderSetupFinalize","OrderCompactUx","WorkspaceTopPager","WorkspaceShortcuts","LabelFlowPolish","LabelDesignerPolish","LabelProductionReady","LabelFinalization","LabelDesignerInteractions","GlobalNavigation","SeikoPhase1","SeikoLibraryAutofill","SeikoPhase2Gate"]) {
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
  for (const source of [labelFlow, labelProduction, orderFinalize, orderCompact, workspacePager, ownerDropdown, seikoPhase, autofill, seikoPhase2]) {
    assert.match(source, /startDomEnhancement/);
  }
});
