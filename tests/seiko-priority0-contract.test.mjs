import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app/seiko-priority0-app.tsx", import.meta.url), "utf8");
const router = readFileSync(new URL("../app/business-application-router.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/seiko-priority0.css", import.meta.url), "utf8");

test("SEIKO rescue uses one clean source-owned application shell", () => {
  assert.match(router, /SeikoPriority0App/);
  assert.match(router, /RESCUE_SEIKO_HOST_PREFIX/);
  assert.doesNotMatch(router, /AppEnhancements/);
  assert.match(layout, /seiko-priority0\.css/);
  assert.match(app, /type Module = "home" \| "orders" \| "labels" \| "reports" \| "billing"/);
});

test("priority-zero navigation exposes orders packing reports and billing", () => {
  for (const label of ["Orders", "Packing labels", "Reports & PDF", "Billing & challans"]) assert.match(app, new RegExp(label.replace("&", "&")));
  assert.match(app, /PackingPersonLabelDesigner/);
  assert.match(app, /onOpenLabelBatches=\{openPacking\}/);
});

test("reports derive from order records and support PDF and CSV", () => {
  assert.match(app, /quantityForRecord/);
  assert.match(app, /Order report builder/);
  assert.match(app, /Print \/ Save PDF/);
  assert.match(app, /Export CSV/);
  assert.match(app, /Products included/);
  assert.match(app, /filters\.every/);
});

test("billing creates invoices and delivery challans from order quantities", () => {
  assert.match(app, /Invoice and delivery challan/);
  assert.match(app, /delivery_challan/);
  assert.match(app, /billingStoreKey/);
  assert.match(app, /documentTotals/);
  assert.match(app, /Save document/);
  assert.match(app, /Customer acknowledgement/);
});

test("priority-zero print styling isolates printable documents", () => {
  assert.match(css, /@media print/);
  assert.match(css, /\.seikoP0Printable/);
  assert.match(css, /\.seikoP0Controls/);
});
