import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

async function text(path) {
  return readFile(join(root, path), "utf8");
}

async function allSourceText(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const chunks = [];
  for (const entry of entries) {
    const relative = join(directory, entry.name);
    if (entry.isDirectory()) chunks.push(await allSourceText(relative));
    else if (/\.(?:ts|tsx|js|jsx|css|mjs)$/.test(entry.name)) chunks.push(await text(relative));
  }
  return chunks.join("\n");
}

test("Veyn milestone one stays commercial and uses the exact logo asset", async () => {
  const catalog = await text("app/lib/business-catalog.ts");
  assert.match(catalog, /businessId:\s*"veyn-health"[\s\S]*?businessName:\s*"véyn health"/);
  assert.match(catalog, /businessId:\s*"veyn-health"[\s\S]*?logoUrl:\s*"\/brands\/veyn-health-logo\.png"/);
  assert.match(catalog, /businessId:\s*"veyn-health"[\s\S]*?allowedModules:\s*\["home",\s*"orders",\s*"billing",\s*"admin"\]/);
  assert.match(catalog, /businessId:\s*"veyn-health"[\s\S]*?defaultModules:\s*\["home",\s*"orders",\s*"billing",\s*"admin"\]/);
});

test("Jinam keeps each business application inside its own module boundary", async () => {
  const catalog = await text("app/lib/business-catalog.ts");
  const session = await text("app/lib/server-session.ts");
  const memberships = await text("app/api/erp/memberships/route.ts");
  const seikoProfile = catalog.match(/businessId:\s*"seiko"[\s\S]*?defaultModules:\s*\[[^\]]+\]/)?.[0] || "";
  assert.match(catalog, /businessId:\s*"seiko"[\s\S]*?allowedModules:\s*\["home",\s*"orders",\s*"labels",\s*"scan",\s*"trace",\s*"production",\s*"billing",\s*"admin"\]/);
  assert.match(catalog, /businessId:\s*"seiko"[\s\S]*?defaultModules:\s*\["home",\s*"orders",\s*"labels",\s*"scan",\s*"trace",\s*"production",\s*"billing",\s*"admin"\]/);
  assert.match(seikoProfile, /"billing"/);
  for (const hiddenUntilReady of ["inventory", "sales", "delivery"]) {
    assert.doesNotMatch(seikoProfile, new RegExp(`"${hiddenUntilReady}"`));
  }
  assert.match(session, /allowedModules = new Set<Module>\(catalog\.allowedModules\)/);
  assert.match(session, /allowedModules\.has\(module as Module\)/);
  assert.match(memberships, /businessCatalogEntry\(businessId\)\.allowedModules/);
  assert.match(memberships, /businessModules\.has\(item\)/);
});

test("Veyn is routed as a real business app instead of a fixed compatibility overlay", async () => {
  const router = await text("app/business-application-router.tsx");
  const enhancements = await text("app/app-enhancements.tsx");
  const veynApp = await text("app/veyn-app.tsx");
  const functionalCss = await text("app/veyn-functional.css");
  assert.match(router, /businessId === "veyn-health"/);
  assert.match(router, /return <VeynApplication\/>/);
  assert.doesNotMatch(enhancements, /VeynApplication/);
  assert.match(veynApp, /<VeynOrders businessId=\{businessId\}/);
  assert.match(veynApp, /<VeynBilling businessId=\{businessId\}/);
  assert.doesNotMatch(veynApp, /import \{ Orders \} from "\.\/orders"/);
  assert.match(functionalCss, /position:relative!important/);
});

test("Veyn requirements and commercial actions are persisted through shared ERP storage", async () => {
  const requirements = await text("app/lib/veyn-requirements.ts");
  const orders = await text("app/veyn-orders.tsx");
  const billing = await text("app/veyn-billing.tsx");
  assert.match(requirements, /listVeynRequirements/);
  assert.match(requirements, /saveVeynRequirement/);
  assert.match(orders, /saveVeynRequirement/);
  assert.match(billing, /saveVeynRequirement/);
});

test("Veyn remains blood-red led with restrained green accent", async () => {
  const foundation = await text("app/lib/foundation.ts");
  assert.match(foundation, /primary:\s*"#a50000"/);
  assert.match(foundation, /accent:\s*"#4f744b"/);
});

test("Veyn milestone one contains the four locked commercial stages", async () => {
  const commercial = await text("app/lib/veyn-commercial.ts");
  for (const type of ["VeynQuotation", "VeynPurchaseOrder", "VeynDeliveryChallan", "VeynInvoice"]) assert.match(commercial, new RegExp(`export type ${type}`));
});

test("retired Veyn division language does not return to the application", async () => {
  const appText = await allSourceText("app");
  assert.doesNotMatch(appText, /MedTech|MedInfra/);
});
