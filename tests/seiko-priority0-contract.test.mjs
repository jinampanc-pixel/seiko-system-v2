import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("app/seiko-priority0-app.tsx");
const shell = read("app/seiko-priority0/shell.tsx");
const model = read("app/seiko-priority0/model.ts");
const reports = read("app/seiko-priority0/reports.tsx");
const billing = read("app/seiko-priority0/billing.tsx");
const router = read("app/business-application-router.tsx");
const layout = read("app/layout.tsx");
const css = read("app/seiko-priority0.css");

test("SEIKO rescue uses one clean source-owned application shell", () => {
  assert.match(router, /SeikoPriority0App/);
  assert.match(router, /RESCUE_SEIKO_HOST_PREFIX/);
  assert.doesNotMatch(router, /AppEnhancements/);
  assert.match(layout, /seiko-priority0\.css/);
  assert.match(model, /SeikoPriorityModule = "home" \| "orders" \| "labels" \| "reports" \| "billing"/);
  assert.match(app, /<SeikoPriorityShell/);
});

test("priority-zero navigation exposes orders packing reports and billing", () => {
  for (const label of ["Orders", "Packing labels", "Reports & PDF", "Billing & challans"]) assert.match(shell, new RegExp(label));
  assert.match(app, /PackingPersonLabelDesigner/);
  assert.match(app, /onOpenLabelBatches=\{openPacking\}/);
});

test("reports derive from order records and support PDF CSV filters and saved setups", () => {
  assert.match(reports, /quantityForRecord/);
  assert.match(reports, /Order report builder/);
  assert.match(reports, /Print \/ Save PDF/);
  assert.match(reports, /Export CSV/);
  assert.match(reports, /Products included/);
  assert.match(reports, /filters\.every/);
  assert.match(reports, /Save preset/);
  assert.match(reports, /Ordered \/ planned quantities/);
});

test("billing creates invoices and delivery challans from order quantities", () => {
  assert.match(billing, /Invoice and delivery challan/);
  assert.match(billing, /delivery_challan/);
  assert.match(billing, /billingStoreKey/);
  assert.match(billing, /documentTotals/);
  assert.match(billing, /Save document/);
  assert.match(billing, /Customer acknowledgement/);
  assert.match(billing, /Math\.min\(ordered/);
});

test("priority-zero print styling isolates printable documents", () => {
  assert.match(css, /@media print/);
  assert.match(css, /\.seikoP0Printable/);
  assert.match(css, /\.seikoP0NoPrint/);
});
