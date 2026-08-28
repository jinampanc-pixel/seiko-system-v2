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
  assert.match(catalog, /businessId:\s*"veyn-health"[\s\S]*?logoUrl:\s*"\/brands\/veyn-health-logo\.png"/);
  assert.match(catalog, /businessId:\s*"veyn-health"[\s\S]*?defaultModules:\s*\["home",\s*"orders",\s*"billing",\s*"admin"\]/);
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
