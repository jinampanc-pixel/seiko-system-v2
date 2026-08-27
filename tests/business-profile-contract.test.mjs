import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const catalog = read("app/lib/business-catalog.ts");
const session = read("app/lib/server-session.ts");

test("VÉYN starts as billing software, not a copy of the SEIKO ERP", () => {
  assert.match(catalog, /businessId: "veyn-health"/);
  assert.match(catalog, /businessName: "véyn health"/);
  assert.match(catalog, /product: "billing"/);
  assert.match(catalog, /allowedModules: \["home", "sales", "admin"\]/);
  assert.match(catalog, /moduleLabels: \{ sales: "Billing" \}/);
});

test("business profiles are authoritative upper bounds on membership modules", () => {
  assert.match(session, /allowedModules = new Set<Module>\(catalog\.allowedModules\)/);
  assert.match(session, /allowedModules\.has\(module as Module\)/);
  assert.match(session, /can never enable another business's workflow/);
});

test("SEIKO retains the full operations ERP surface", () => {
  assert.match(catalog, /product: "operations-erp"/);
  assert.match(catalog, /"orders", "labels", "scan", "trace", "production", "inventory", "sales", "delivery"/);
});
