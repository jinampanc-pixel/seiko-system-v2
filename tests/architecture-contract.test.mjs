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

test("root layout routes the active business before mounting legacy compatibility enhancements", () => {
  assert.match(layout, /import \{ BusinessApplicationRouter \} from "\.\/business-application-router"/);
  assert.match(layout, /<BusinessApplicationRouter>\{children\}<\/BusinessApplicationRouter>/);
  assert.match(router, /import \{ AppEnhancements \} from "\.\/app-enhancements"/);
  assert.match(router, /<AppEnhancements\/>/);
  assert.match(router, /businessId === "veyn-health"/);
  for (const legacyImport of [
    "OwnerDropdownUx",
    "OrderSetupPolish",
    "OrderSetupFinalize",
    "WorkspaceTopPager",
    "LabelFlowPolish",
    "LabelDesignerPolish",
    "GlobalNavigation",
  ]) {
    assert.doesNotMatch(layout, new RegExp(`import \\{ ${legacyImport} \\}`));
  }
});

test("enhancement registry remains explicit and reviewable", () => {
  for (const component of [
    "ErpOrderSync",
    "OwnerDropdownUx",
    "OrderSetupPolish",
    "OrderSetupFinalize",
    "OrderCompactUx",
    "WorkspaceTopPager",
    "WorkspaceShortcuts",
    "LabelFlowPolish",
    "LabelDesignerPolish",
    "LabelProductionReady",
    "LabelFinalization",
    "LabelDesignerInteractions",
    "GlobalNavigation",
  ]) {
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
  for (const source of [labelFlow, labelProduction, orderFinalize, orderCompact, workspacePager, ownerDropdown]) {
    assert.match(source, /startDomEnhancement/);
  }
});
