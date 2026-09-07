import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("../app/seiko-meth-sync.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/seiko-meth.css", import.meta.url), "utf8");

test("SEIKO status changes do not create charges or use browser dialogs", () => {
  assert.match(ui, /const changeStatus = \(handoff: ProductionHandoff, status: SeikoProductionStatus\) =>/);
  assert.match(ui, /statusBlockReason\(handoff, status\)/);
  assert.match(ui, /saveHandoff\(\{ \.\.\.handoff, seikoStatus: status/);
  assert.doesNotMatch(ui, /prompt\(/);
  assert.doesNotMatch(ui, /alert\(/);
});

test("SEIKO quantities use an inline unit editor and show the agreed rate separately", () => {
  assert.match(ui, /seikoMethQuantityEditor/);
  assert.match(ui, /Accepted quantity \(units\)/);
  assert.match(ui, /Completed \/ QC-passed quantity \(units\)/);
  assert.match(ui, /Chargeable quantity \(units\)/);
  assert.match(ui, /Agreed manufacturing rate/);
  assert.match(ui, /Enter quantities only — not rupee amounts/);
  assert.match(ui, /Save quantities/);
  assert.match(css, /\.seikoMethQuantityGrid/);
});

test("Completed and transferred statuses are blocked until production quantities are valid", () => {
  assert.match(ui, /status === "completed" && handoff\.quantityCompleted <= 0/);
  assert.match(ui, /status === "transferred"/);
  assert.match(ui, /handoff\.seikoStatus !== "completed"/);
  assert.match(ui, /disabled=\{statusOptionDisabled\(item, "completed"\)\}/);
  assert.match(ui, /disabled=\{statusOptionDisabled\(item, "transferred"\)\}/);
});

test("MeTh charge cannot be issued before valid completed chargeable output", () => {
  assert.match(ui, /handoff\.quantityChargeable > 0/);
  assert.match(ui, /\["completed", "transferred"\]\.includes\(handoff\.seikoStatus\)/);
  assert.match(ui, /disabled=\{!canIssueCharge\(item\)\}/);
});
