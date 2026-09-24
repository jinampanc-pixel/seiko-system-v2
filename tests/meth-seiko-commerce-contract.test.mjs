import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const domain = readFileSync(new URL("../app/lib/meth-commerce.ts", import.meta.url), "utf8");
const meth = readFileSync(new URL("../app/meth-app.tsx", import.meta.url), "utf8");
const methUi = readFileSync(new URL("../app/meth-commerce-ui.tsx", import.meta.url), "utf8");
const routingUi = readFileSync(new URL("../app/meth-fulfilment-routing.tsx", import.meta.url), "utf8");
const fulfilmentServer = readFileSync(new URL("../app/lib/server-meth-fulfilment.ts", import.meta.url), "utf8");
const handoffServer = readFileSync(new URL("../app/lib/server-meth-handoffs.ts", import.meta.url), "utf8");
const routingRoute = readFileSync(new URL("../app/api/erp/meth/order-routing/route.ts", import.meta.url), "utf8");
const shopifyWebhook = readFileSync(new URL("../app/api/erp/meth/channels/shopify/webhook/route.ts", import.meta.url), "utf8");
const seikoSync = readFileSync(new URL("../app/seiko-meth-sync.tsx", import.meta.url), "utf8");
const serverSync = readFileSync(new URL("../app/meth-server-sync.tsx", import.meta.url), "utf8");
const syncRoute = readFileSync(new URL("../app/api/erp/meth/sync/route.ts", import.meta.url), "utf8");
const enhancements = readFileSync(new URL("../app/app-enhancements.tsx", import.meta.url), "utf8");

test("MeTh normalizes all sales channels into one order model", () => {
  assert.match(domain, /SalesChannel = "shopify" \| "amazon" \| "marketplace" \| "manual" \| "b2b"/);
  assert.match(domain, /normalizeChannelOrder/);
  assert.match(domain, /externalOrderId/);
  assert.match(domain, /customerPaymentStatus/);
  assert.match(domain, /settlementStatus/);
  assert.match(meth, /Orders/);
});

test("SKU mapping keeps storefront identifiers separate from SEIKO production specification", () => {
  for (const field of ["methSku", "shopifyVariantId", "amazonSellerSku", "amazonAsin", "seikoProductionSku", "seikoSpecificationRef"]) assert.match(domain, new RegExp(field));
  assert.match(methUi, /SKU mapping/);
});

test("stock allocation sends only the shortage quantity to SEIKO", () => {
  assert.match(domain, /allocateStock/);
  assert.match(domain, /productionRequired: ordered - stock/);
  assert.match(domain, /if \(line\.productionRequired <= 0\) throw new Error/);
  assert.match(methUi, /Only shortage quantities are sent to SEIKO/);
});

test("MeTh fulfilment can default to stock first or require an explicit stock-vs-produce decision", () => {
  assert.match(domain, /MethFulfilmentPolicy = "stock_first" \| "decide"/);
  assert.match(domain, /MethRoutingDecision = "pending" \| "stock_first" \| "produce"/);
  assert.match(routingUi, /Stock first — use stock, produce shortage/);
  assert.match(routingUi, /Decide — choose stock or production per order/);
  assert.match(routingUi, /Use stock first/);
  assert.match(routingUi, /Produce full order/);
  assert.match(fulfilmentServer, /defaultPolicy: row\?\.default_policy === "decide" \? "decide" : DEFAULT_POLICY/);
});

test("decide mode holds the order before stock reservation or production allocation", () => {
  assert.match(domain, /routingDecision === "pending"/);
  assert.match(domain, /finishedStockAllocated: 0, productionRequired: 0/);
  assert.match(domain, /routingDecision === "pending"\s*\? "unfulfilled"/);
  assert.match(handoffServer, /order\.routingDecision === "pending"/);
});

test("MeTh finished stock is authoritative in D1 and reserved atomically", () => {
  assert.match(fulfilmentServer, /jinam_meth_finished_stock/);
  assert.match(fulfilmentServer, /on_hand INTEGER NOT NULL DEFAULT 0/);
  assert.match(fulfilmentServer, /reserved INTEGER NOT NULL DEFAULT 0/);
  assert.match(fulfilmentServer, /available = Math\.max\(0, whole\(current\.on_hand\) - whole\(current\.reserved\)\)/);
  assert.match(fulfilmentServer, /WHERE meth_sku=\? AND on_hand=\? AND reserved=\? RETURNING reserved/);
  assert.match(fulfilmentServer, /STOCK_BELOW_RESERVED/);
  assert.match(fulfilmentServer, /rawOnHand < 0/);
});

test("failed routing claims can be retried without double-reserving stock", () => {
  assert.match(fulfilmentServer, /jinam_meth_order_routing_claims/);
  assert.match(fulfilmentServer, /existing\?\.status === "failed"/);
  assert.match(fulfilmentServer, /status='processing'/);
  assert.match(fulfilmentServer, /WHERE claim_id=\? AND status='failed' RETURNING claim_id/);
  assert.match(fulfilmentServer, /releaseStock/);
});

test("verified Shopify order events normalize into MeTh and obey the routing policy", () => {
  assert.match(fulfilmentServer, /input\.topic !== "orders\/create" && input\.topic !== "orders\/updated"/);
  assert.match(fulfilmentServer, /loadOrderByExternalId\(db, "shopify", externalOrderId\)/);
  assert.match(fulfilmentServer, /shopifyVariantId/);
  assert.match(fulfilmentServer, /policy\.defaultPolicy/);
  assert.match(fulfilmentServer, /routeStoredOrder\(db, saved\.id, "stock_first"/);
  assert.match(fulfilmentServer, /processing_status='processed'/);
  assert.match(fulfilmentServer, /processing_status='failed'/);
  assert.match(shopifyWebhook, /ingestShopifyOrderWebhook/);
});

test("production handoffs are automatic, idempotent, and contain production shortage only", () => {
  assert.match(handoffServer, /line\.productionRequired <= 0/);
  assert.match(handoffServer, /createProductionHandoff\(order, line, mapping, rate\)/);
  assert.match(handoffServer, /INSERT OR IGNORE INTO jinam_shared_records/);
  assert.match(handoffServer, /HANDOFF_SCOPE = "seiko-meth"/);
  assert.match(handoffServer, /blocked\.push/);
  assert.match(routingRoute, /ensureMethOrderHandoffsForRequest/);
  assert.match(shopifyWebhook, /ensureMethOrderHandoffsFromShopify/);
});

test("MeTh customer order remains separate from the SEIKO production handoff", () => {
  assert.match(domain, /type ProductionHandoff/);
  assert.match(domain, /methOrderId/);
  assert.match(domain, /methOrderLineId/);
  assert.match(domain, /traceId/);
  assert.match(seikoSync, /MeTh customer orders stay in MeTh/);
});

test("chargeable quantity cannot exceed accepted and completed output", () => {
  assert.match(domain, /Math\.min\(handoff\.quantityRequested, positive\(accepted\)\)/);
  assert.match(domain, /Math\.min\(quantityAccepted, positive\(completed\)\)/);
  assert.match(domain, /Math\.min\(quantityCompleted, positive\(chargeable\)\)/);
});

test("SEIKO and MeTh are separate legal entities with one intercompany transaction and two financial views", () => {
  assert.match(domain, /sellerBusinessId: "seiko"/);
  assert.match(domain, /buyerBusinessId: "meth"/);
  assert.match(domain, /intercompanyStoreKey/);
  assert.match(domain, /legalProfileStoreKey/);
  assert.match(seikoSync, /SEIKO invoices MeTh as a separate legal entity/);
  assert.match(methUi, /SEIKO and MeTh are separate legal entities/);
});

test("payments and credits settle the same intercompany transaction", () => {
  assert.match(domain, /settleIntercompanyTransaction/);
  assert.match(domain, /transactionId/);
  assert.match(domain, /grossAmount - paidAmount - creditAmount/);
  assert.match(methUi, /Record payment/);
});

test("customer returns do not reverse SEIKO production cost unless an approved manufacturing claim exists", () => {
  assert.match(domain, /productionDefect/);
  assert.match(domain, /approved_credit/);
  assert.match(domain, /approved_remake/);
  assert.match(domain, /returnAffectsSeikoCost/);
});

test("MeTh separates customer payment from marketplace or gateway settlement", () => {
  assert.match(domain, /CustomerPaymentStatus/);
  assert.match(domain, /SettlementStatus/);
  assert.match(domain, /marketplaceFees/);
  assert.match(domain, /paymentGatewayFees/);
  assert.match(domain, /bankReference/);
  assert.match(meth, /Customer payment, marketplace settlement and SEIKO payable remain separate records/);
});

test("SEIKO explicitly mounts the MeTh handoff and receivable adapter", () => {
  assert.match(enhancements, /import \{ SeikoMethSync \}/);
  assert.match(enhancements, /<SeikoMethSync \/>/);
  assert.match(seikoSync, /Create MeTh charge/);
  assert.match(seikoSync, /MeTh payable mirrors this same transaction/);
});

test("MeTh and SEIKO commerce records are server authoritative with optimistic concurrency", () => {
  assert.match(syncRoute, /operation\?: "list" \| "changes" \| "mutate" \| "import-local"/);
  assert.match(syncRoute, /expectedVersion/);
  assert.match(syncRoute, /WHERE scope = \? AND collection = \? AND id = \? AND version = \?/);
  assert.match(syncRoute, /VERSION_CONFLICT/);
  assert.match(syncRoute, /version INTEGER NOT NULL DEFAULT 1/);
  assert.match(syncRoute, /jinam_shared_changes/);
  assert.match(syncRoute, /CREATE TRIGGER IF NOT EXISTS jinam_shared_records_update_audit/);
  assert.match(serverSync, /writeAuthoritative/);
  assert.doesNotMatch(serverSync, /merge\(local, remote\)/);
});

test("commerce synchronization is event-driven first with incremental server changes and polling only as fallback", () => {
  assert.match(serverSync, /window\.addEventListener\("jinam-data-change", localChange\)/);
  assert.match(serverSync, /BroadcastChannel/);
  assert.match(serverSync, /window\.addEventListener\("focus", refresh\)/);
  assert.match(serverSync, /window\.addEventListener\("online", refresh\)/);
  assert.match(serverSync, /operation: "changes"/);
  assert.match(serverSync, /FALLBACK_RECONCILE_MS = 60_000/);
  assert.doesNotMatch(serverSync, /12_000/);
});
