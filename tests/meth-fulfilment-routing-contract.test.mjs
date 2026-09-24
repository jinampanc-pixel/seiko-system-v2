import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const meth = readFileSync(new URL("../app/meth-app.tsx", import.meta.url), "utf8");
const orders = readFileSync(new URL("../app/meth-orders-surface.tsx", import.meta.url), "utf8");
const routing = readFileSync(new URL("../app/meth-fulfilment-routing.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../app/lib/server-meth-fulfilment.ts", import.meta.url), "utf8");
const handoffs = readFileSync(new URL("../app/lib/server-meth-handoffs.ts", import.meta.url), "utf8");

test("the live MeTh Orders screen uses the authoritative routing surface", () => {
  assert.match(meth, /import \{ MethOrdersSurface \} from "\.\/meth-orders-surface"/);
  assert.doesNotMatch(meth, /MethOrdersSurface.*from "\.\/meth-commerce-ui"/);
  assert.doesNotMatch(orders, /Finished stock available/);
  assert.match(orders, /authoritative MeTh finished-stock balance/);
});

test("manual orders are stored pending before stock-first routing runs", () => {
  assert.match(orders, /routingDecision: "pending"/);
  assert.match(orders, /operation: "mutate"/);
  assert.match(orders, /expectedVersion: null/);
  assert.match(orders, /\/api\/erp\/meth\/order-routing/);
  assert.match(orders, /decision: "stock_first"/);
});

test("decide orders expose both explicit choices without reserving stock first", () => {
  assert.match(orders, /Decide — choose after order is saved/);
  assert.match(routing, /Use stock first/);
  assert.match(routing, /Produce full order/);
  assert.match(server, /routingDecision: decision/);
});

test("stock-first uses atomic D1 reservations and only shortage crosses to SEIKO", () => {
  assert.match(server, /jinam_meth_finished_stock/);
  assert.match(server, /reserved=reserved\+\?/);
  assert.match(server, /productionRequired: Math\.max\(0, quantity - allocation\)/);
  assert.match(handoffs, /line\.productionRequired <= 0/);
  assert.match(handoffs, /HANDOFF_SCOPE = "seiko-meth"/);
});

test("routing retries are idempotent after a failed concurrency attempt", () => {
  assert.match(server, /existing\?\.status === "failed"/);
  assert.match(server, /WHERE claim_id=\? AND status='failed' RETURNING claim_id/);
  assert.match(server, /releaseStock/);
  assert.match(handoffs, /INSERT OR IGNORE INTO jinam_shared_records/);
});
