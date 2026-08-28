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
  assert.match(catalog, /businessId:\s*"seiko"[\s\S]*?allowedModules:\s*\["home",\s*"orders",\s*"labels",\s*"scan",\s*"trace",\s*"production",\s*"inventory",\s*"sales",\s*"delivery",\s*"admin"\]/);
  assert.doesNotMatch(catalog.match(/businessId:\s*"seiko"[\s\S]*?defaultModules:\s*\[[^\]]+\]/)?.[0] || "", /"billing"/);
  assert.match(session, /allowedModules = new Set<Module>\(catalog\.allowedModules\)/);
  assert.match(session, /allowedModules\.has\(module as Module\)/);
  assert.match(memberships, /businessCatalogEntry\(businessId\)\.allowedModules/);
  assert.match(memberships, /businessModules\.has\(item\)/);
});

test("Veyn is rendered by its own application shell rather than SEIKO Orders", async () => {
  const veynApp = await text("app/veyn-app.tsx");
  const enhancements = await text("app/app-enhancements.tsx");
  assert.match(veynApp, /export function VeynApplication/);
  assert.match(veynApp, /<Billing businessId=\{businessId\} can=\{can\}/);
  assert.match(veynApp, /VÉYN orders describe what a healthcare client needs/);
  assert.doesNotMatch(veynApp, /import \{ Orders \} from "\.\/orders"/);
  assert.match(enhancements, /<VeynApplication \/>/);
});

test("Veyn remains blood-red led with restrained green accent", async () => {
  const foundation = await text("app/lib/foundation.ts");
  assert.match(foundation, /veyn:\s*\{[^}]*primary:\s*"#a50000"[^}]*primaryAlt:\s*"#bc1111"[^}]*accent:\s*"#4f744b"/);
});

test("Veyn milestone one contains the four locked commercial stages", async () => {
  const billing = await text("app/billing.tsx");
  for (const title of ["Quotations", "Purchase orders", "Delivery challans", "Invoices"]) {
    assert.ok(billing.includes(title), `${title} must remain in the billing workspace`);
  }
  const commercial = await text("app/lib/veyn-commercial.ts");
  for (const typeName of ["VeynQuotation", "VeynPurchaseOrder", "VeynDeliveryChallan", "VeynInvoice"]) {
    assert.ok(commercial.includes(`type ${typeName}`), `${typeName} must remain defined`);
  }
});

test("retired Veyn division language does not return to the application", async () => {
  const source = await allSourceText("app");
  for (const forbidden of ["MedTech", "MedInfra"]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} is outside the locked Veyn system scope`);
  }
});
