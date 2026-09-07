import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("app/seiko-priority0-app.tsx");
const shell = read("app/seiko-priority0/shell.tsx");
const model = read("app/seiko-priority0/model.ts");
const home = read("app/seiko-priority0/home.tsx");
const packingCenter = read("app/seiko-priority0/packing-center.tsx");
const reports = read("app/seiko-priority0/reports.tsx");
const billing = read("app/seiko-priority0/billing.tsx");
const packing = read("app/packing-person-label-designer.tsx");
const orders = read("app/orders.tsx");
const priorityCss = read("app/seiko-priority0.css");
const enhancements = read("app/app-enhancements.tsx");

test("Priority 0 is a clean composition rather than another monolithic patch layer", () => {
  for (const modulePath of [
    "./seiko-priority0/home",
    "./seiko-priority0/packing-center",
    "./seiko-priority0/reports",
    "./seiko-priority0/billing",
    "./seiko-priority0/model",
    "./seiko-priority0/shell",
  ]) assert.match(app, new RegExp(modulePath.replaceAll("/", "\\/")));
  assert.doesNotMatch(app, /function ReportsCenter|function BillingCenter|function PackingCenter|function Home\(/);
  assert.match(model, /SEIKO_BUSINESS_ID = "seiko"/);
});

test("SEIKO shell is the sole Priority 0 navigation owner", () => {
  for (const label of ["Home", "Orders", "Packing labels", "Reports & PDF", "Billing & challans"]) assert.match(shell, new RegExp(label.replace("&", "&")));
  assert.match(shell, /const \[menuOpen, setMenuOpen\] = useState\(false\)/);
  assert.match(shell, /setMenuOpen\(false\); onNavigate\(module\)/);
  for (const retired of ["GlobalNavigation","SeikoOperationalUx","SeikoListCenterEnhancements","SeikoInterfaceFixes","PackingWorkflowRuntimeFixes","LabelDesignerInteractions","LabelFlowPolish","LabelDesignerPolish","LabelProductionReady","LabelFinalization","LabelFieldCompact","LabelWorkspaceRefinement"]) {
    assert.doesNotMatch(enhancements, new RegExp(`<${retired} \\/>`));
  }
});

test("Orders and Workspace remain source-backed while Packing is connected directly", () => {
  assert.match(app, /<Orders businessId=\{SEIKO_BUSINESS_ID\}/);
  assert.match(app, /<PackingPersonLabelDesigner/);
  assert.match(home, /Packing labels/);
  assert.match(packingCenter, /Open packing designer/);
  assert.match(orders, /workspaceNativeMenuStatus/);
  assert.match(orders, /workspaceMenuSaveNow/);
  assert.match(orders, /aria-label="Rows per page"/);
});

test("Packing designer keeps React as sole drag resize and remove owner", () => {
  assert.match(packing, /quantityForRecord/);
  assert.match(packing, /measurementValue/);
  assert.match(packing, /specificationValue/);
  assert.match(packing, /Non-applicable products and missing conditional values take no printed space/);
  assert.match(packing, /const down = \(event: ReactPointerEvent/);
  assert.match(packing, /const move = \(event: ReactPointerEvent/);
  assert.match(packing, /updateItem\(item\.id, \{ x:/);
  assert.match(packing, /const wheel = \(event: ReactWheelEvent/);
  assert.match(packing, /updateItem\(item\.id, \{ font:/);
  assert.doesNotMatch(packing, /updateItem\(item\.id, \{[^}]*font:[^}]*x:/s);
  assert.match(packing, /const removeId = dragging\.current\.id/);
  assert.match(packing, /currentItems\.filter\(item => item\.id !== removeId\)/);
});

test("Reports are order-derived, filterable, reusable and exportable", () => {
  assert.match(reports, /quantityForRecord/);
  assert.match(reports, /People \/ record filters/);
  assert.match(reports, /\+ Add filter/);
  assert.match(reports, /Products included/);
  assert.match(reports, /Save preset/);
  assert.match(reports, /Print \/ Save PDF/);
  assert.match(reports, /Export CSV/);
  assert.match(reports, /Ordered \/ planned quantities/);
  assert.match(reports, /Order-total products are not person-allocated/);
});

test("Billing supports invoices, delivery challans and partial document quantities without changing the order", () => {
  assert.match(billing, /Invoice and delivery challan/);
  assert.match(billing, /delivery_challan/);
  assert.match(billing, /Document qty/);
  assert.match(billing, /Math\.min\(ordered/);
  assert.match(billing, /Tax mode/);
  assert.match(billing, /CGST/);
  assert.match(billing, /SGST/);
  assert.match(billing, /IGST/);
  assert.match(billing, /Save document/);
  assert.match(billing, /Print \/ Save PDF/);
});

test("Priority 0 stylesheet is scoped and owns responsive plus printable behavior", () => {
  assert.match(priorityCss, /\.seikoP0App/);
  assert.match(priorityCss, /\.seikoP0Drawer/);
  assert.match(priorityCss, /\.seikoP0Controls/);
  assert.match(priorityCss, /\.seikoP0TableWrap/);
  assert.match(priorityCss, /@media \(max-width: 900px\)/);
  assert.match(priorityCss, /@media print/);
  assert.match(priorityCss, /\.seikoP0NoPrint/);
  assert.match(priorityCss, /\.packingCanvas/);
});
