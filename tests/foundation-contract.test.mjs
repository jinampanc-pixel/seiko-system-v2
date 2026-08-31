import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/seiko/route.ts", import.meta.url), "utf8");
const serverAuth = readFileSync(new URL("../app/lib/server-erp-auth.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/lib/seiko-api.ts", import.meta.url), "utf8");
const foundation = readFileSync(new URL("../app/lib/foundation.ts", import.meta.url), "utf8");
const orders = readFileSync(new URL("../app/orders.tsx", import.meta.url), "utf8");
const labelDesigner = readFileSync(new URL("../app/label-designer.tsx", import.meta.url), "utf8");
const orderDomain = readFileSync(new URL("../app/lib/order-domain.ts", import.meta.url), "utf8");
const productionDomain = readFileSync(new URL("../app/lib/production-domain.ts", import.meta.url), "utf8");
const production = readFileSync(new URL("../app/production.tsx", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

test("operational modules remain present", () => {
  for (const label of ["Labels", "Scan", "Trace", "Production", "Sales", "Delivery"]) assert.match(page, new RegExp(label));
});

test("scanner supports camera, scan gun and offline queue", () => {
  assert.match(page, /getUserMedia/);
  assert.match(page, /BarcodeDetector/);
  assert.match(page, /detector\.detect/);
  assert.match(page, /businessStorageKey\(businessId, "scan-queue"\)/);
  assert.match(page, />Record<\/button>/);
});

test("server bridge protects credentials and bounds latency", () => {
  assert.match(route, /process\.env\.SEIKO_API_KEY/);
  assert.match(route, /TIMEOUT_MS = 8000/);
  assert.doesNotMatch(page, /SEIKO_API_KEY/);
  assert.match(route, /ALLOWED_ACTIONS/);
  assert.match(route, /MAX_BODY_BYTES/);
});

test("installable app and offline shell remain present", () => {
  assert.equal(JSON.parse(manifest).display, "standalone");
  assert.match(page, /serviceWorker\.register/);
  assert.match(serviceWorker, /caches\.open/);
  assert.match(serviceWorker, /pathname\.startsWith\("\/api\/"\)/);
});

test("queued scans synchronize using their original idempotency key", () => {
  assert.match(page, /localStorage\.getItem\(queueKey\)/);
  assert.match(page, /requestKey: item\.id/);
});

test("business context is mandatory and forwarded with authenticated identity", () => {
  assert.match(route, /BUSINESS_REQUIRED/);
  assert.match(route, /authenticateActor\(request\)/);
  assert.match(serverAuth, /oai-authenticated-user-id/);
  assert.match(serverAuth, /oai-authenticated-user-email/);
  assert.match(serverAuth, /cf-access-jwt-assertion/);
  assert.match(route, /actor: \{ userId: actor\.userId, email: actor\.email \}/);
  assert.match(route, /businessId: businessId \|\| null/);
});

test("browser state and caches are partitioned by business", () => {
  assert.match(foundation, /`jinam:\$\{businessId\}:\$\{suffix\}`/);
  assert.match(api, /CACHE_PREFIX\}\$\{businessId \|\| "foundation"\}/);
  assert.match(page, /queueKey=\{queueKey\}/);
});

test("roles are presets while explicit membership grants stay customizable", () => {
  assert.match(foundation, /ROLE_MODULE_PRESETS/);
  assert.match(foundation, /Array\.isArray\(value\.modules\) && value\.modules\.length/);
  assert.doesNotMatch(foundation, /allowedForRole\.has\(module\)/);
  assert.match(page, /canAccess\(membership, "labels"\)/);
  assert.match(page, /canAccess\(membership, "scan"\)/);
  assert.match(page, /canAccess\(membership, "trace"\)/);
});

test("business themes support presets, manual editing and local logo analysis", () => {
  assert.match(foundation, /THEME_PRESETS/);
  assert.match(foundation, /deriveThemeFromLogo/);
  assert.match(foundation, /createImageBitmap/);
  assert.match(page, /Automatically derive from company logo/);
  assert.match(page, /businessStorageKey\(businessId, "theme-v2"\)/);
  assert.match(page, /canAccess\(membership, "admin"\)/);
});

test("Seiko orders preserve flexible client and person-entry behaviour", () => {
  assert.match(orderDomain, /CLIENT_TYPE_PRESETS/);
  assert.match(orderDomain, /attnRequired/);
  assert.match(orders, /Set different values by group/);
  assert.match(orders, /\+ New source field/);
  assert.match(orders, /removeSourceField/);
  assert.match(orders, />\+ Add detail<\/button>/);
  assert.doesNotMatch(orders, />\+ Gender<\/button>/);
  assert.doesNotMatch(orderDomain, /Add at least one product\./);
  assert.doesNotMatch(orderDomain, /Every product needs a name\./);
  for (const mode of ["same_for_all", "per_person", "default_with_exceptions", "order_total", "by_group"]) assert.match(orderDomain, new RegExp(mode));
  assert.match(orderDomain, /workspaceColumns/);
  assert.doesNotMatch(orders, /renumberRecords/);
  assert.match(orders, /Math\.max\(0, \.\.\.order\.records\.map\(record => Number\(record\.personId\.match/);
  assert.match(orders, /Save & close/);
  assert.match(orders, /Close without saving/);
  assert.match(orders, /Archive/);
  assert.doesNotMatch(orders, /<section className="revisionStrip"/);
  assert.doesNotMatch(orders, /label="Size\/header"/);
  assert.doesNotMatch(orders, />Paste rows</);
  assert.match(orders, /Search rows/);
  assert.match(orders, /Same for this product/);
  assert.match(orders, /ArrowDown/);
  assert.match(orders, /event\.key === "Tab"/);
  assert.match(orders, /requiredLabel/);
  assert.match(orders, /order-suggestions-v1/);
  assert.match(orders, /byClientType/);
  assert.match(orders, /suggestionPopup/);
  assert.match(orders, /Remove \$\{item\} suggestion/);
  assert.match(orders, /Select from a list/);
  assert.match(orders, /Open order/);
  assert.match(orders, /Client name is required/);
  assert.match(orderDomain, /groupLabel/);
  assert.match(orderDomain, /measurement:\$\{measurement\.id\}:product:\$\{product\.id\}/);
});

test("desktop navigation stays uncluttered and scanning is device aware", () => {
  assert.match(page, /className={`menuToggle/);
  assert.match(page, /className="moduleMenuSettings"/);
  assert.match(page, /className="menuBackdrop"/);
  assert.match(page, /aria-label="Modules"/);
  assert.doesNotMatch(page, /className="roleBadge"/);
  assert.doesNotMatch(page, /className="avatar"/);
  assert.doesNotMatch(page, /moduleNo/);
  assert.match(page, /navigator\.maxTouchPoints/);
  assert.match(page, /Scan gun or enter label token/);
});

test("order storage is partitioned by business", () => {
  assert.match(orderDomain, /`jinam:\$\{businessId\}:orders-v1`/);
  assert.match(orders, /orderStoreKey\(businessId\)/);
});

test("product artwork and cross-business manufacturing remain traceable", () => {
  assert.match(orders, /jinam-artwork-v1/);
  assert.match(orders, /image\/png,image\/jpeg,image\/webp,image\/svg\+xml,application\/pdf/);
  assert.match(orders, /storageKey = `\$\{businessId\}:\$\{orderId\}:\$\{productId\}:\$\{specificationId\}:\$\{id\}`/);
  assert.match(orderDomain, /type ManufacturingLink/);
  assert.match(orderDomain, /manufacturerBusinessId: string/);
  assert.match(orderDomain, /sourceBusinessId: string/);
  assert.match(orderDomain, /sourceOrderId: string/);
  assert.match(orderDomain, /sourceProductId: string/);
  assert.match(orderDomain, /`jinam:\$\{manufacturerBusinessId\}:production-links-v1`/);
});

test("label designer preserves exact sizing and editable behaviour", () => {
  assert.match(labelDesigner, /rollW:\s*109/);
  assert.match(labelDesigner, /labelW:\s*50/);
  assert.match(labelDesigner, /labelH:\s*25/);
  assert.match(labelDesigner, /outer:\s*3/);
  assert.match(labelDesigner, /gapX:\s*3/);
  assert.match(labelDesigner, /gapY:\s*3/);
  assert.match(labelDesigner, /\[snap, setSnap\] = useState\(true\)/);
  assert.match(labelDesigner, /\[guides, setGuides\] = useState\(true\)/);
  assert.match(labelDesigner, /canvasSizeButton/);
  assert.match(labelDesigner, /sequence/);
  assert.match(labelDesigner, /labelHeaderCommandBar/);
  assert.match(labelDesigner, /More label actions/);
  assert.match(labelDesigner, />Print<\/button>/);
  assert.match(labelDesigner, /presets-v1/);
  assert.match(labelDesigner, /templates-v1/);
});

test("label output can be code only, information only or combined", () => {
  assert.match(labelDesigner, /Code \+ information/);
  assert.match(labelDesigner, /Code only/);
  assert.match(labelDesigner, /Information only/);
  assert.match(labelDesigner, /Custom selection/);
  assert.match(labelDesigner, /Production labels/);
  assert.match(labelDesigner, /Packing labels/);
  assert.match(labelDesigner, /Label represents/);
  assert.match(labelDesigner, /Each physical item/);
  assert.doesNotMatch(labelDesigner, /Derived from the saved order/);
  assert.match(labelDesigner, /flashSaveNotice/);
  assert.doesNotMatch(labelDesigner, /BUILD CUTTING RUNS/);
  assert.match(labelDesigner, /Outer package/);
  assert.match(labelDesigner, /The preview and print records come only from the selected orders and products/);
  assert.match(labelDesigner, /canvasElement\.selected/);
  assert.match(labelDesigner, /item\.kind\s*===\s*"qr"/);
  assert.match(labelDesigner, /preventDefault\(\)/);
  assert.doesNotMatch(orders, /workspaceLabelsButton/);
  assert.doesNotMatch(orders, /workspaceLabelsSplit/);
  assert.match(orders, /aria-label="More order actions"/);
  assert.match(orders, /onOpenLabelBatches\(\);}}>Labels<\/button>/);
  assert.match(page, /onOpenLabelBatches=/);
  assert.doesNotMatch(page, /onCreateLabel=/);
  assert.match(labelDesigner, /Back to order/);
  assert.match(labelDesigner, /labelFieldOptions/);
  assert.match(labelDesigner, /spec:\$\{spec\.id\}/);
  assert.match(labelDesigner, /Find person, product, class, group or any order field/);
  assert.match(labelDesigner, /recordFilterBar/);
  assert.match(labelDesigner, /Select all/);
  assert.match(labelDesigner, /recordList/);
  assert.doesNotMatch(labelDesigner, /Page \{safeRecordPage\} of/);
  assert.match(labelDesigner, /labelValue\(row,\s*item\.field\)/);
  assert.match(page, /onBack=/);
});

test("one garment supports multiple worker operation credits", () => {
  assert.match(productionDomain, /type GarmentIdentity/);
  assert.match(productionDomain, /type WorkerOperationScan/);
  assert.match(productionDomain, /operationId: string/);
  assert.match(productionDomain, /workerId: string/);
  assert.match(productionDomain, /creditedAmount/);
  assert.match(productionDomain, /scans: \[\.\.\.history\.scans, scan\]/);
  assert.match(productionDomain, /parentId\?: string/);
  assert.match(productionDomain, /calculatePayroll\?: boolean/);
  assert.match(production, /Use only the steps you need/);
  assert.match(production, /Turning one off never deletes existing history/);
  assert.match(production, /View history/);
  assert.match(production, /Complete operation/);
});

test("saving an order generates stable workflow identities without starting work", () => {
  assert.match(orders, /generateOrderArtifacts\(businessId, saved\)/);
  assert.match(orders, /loaded\.forEach\(order => generateOrderArtifacts/);
  assert.match(productionDomain, /generated-order-artifacts-v1/);
  assert.match(productionDomain, /garment:\$\{orderId\}:\$\{recordId\}:\$\{productId\}:\$\{unit\}/);
  assert.match(productionDomain, /status: "planned"/);
  assert.match(productionDomain, /productionReport: true; packingPlan: true; invoice: true; labels: true/);
  assert.match(labelDesigner, /garmentScanToken\(orderId,\s*recordId,\s*productId,\s*unit\)/);
});

test("order workspace supports spreadsheet-speed data entry", () => {
  assert.match(orders, /Number of rows to add/);
  assert.match(orders, /onPaste=\{event=>pasteAt/);
  assert.match(orders, /event\.clipboardData\.getData\("text\/plain"\)/);
  assert.match(orders, /event\.shiftKey/);
  assert.match(orders, /fillHandle/);
  assert.match(orders, /event\.key === "Tab"/);
  assert.match(orders, /ArrowUp/);
  assert.match(orders, /ArrowDown/);
  assert.match(orders, /Ctrl\+C, Ctrl\+V/);
  assert.match(orders, /Ctrl\+Z and Ctrl\+Y/);
  assert.match(orders, /hiddenColumns/);
  assert.match(orders, /const suggestions\s*=/);
  assert.match(orders, /navigator\.clipboard\.writeText/);
  assert.match(orders, /onMouseEnter/);
  assert.doesNotMatch(orders, />Undo<\/button>/);
  assert.doesNotMatch(orders, />Redo<\/button>/);
});
