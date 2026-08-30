import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("../app/seiko-meth-sync.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/seiko-meth.css", import.meta.url), "utf8");

test("SEIKO status changes do not create charges or use browser dialogs", () => {
  assert.match(ui, /const changeStatus = \(handoff: ProductionHandoff, status: SeikoProductionStatus\) =>/);
  assert.match(ui, /saveHandoff\(\{ \.\.\.handoff, seikoStatus: status/);
  assert.doesNotMatch(ui, /prompt\(/);
  assert.doesNotMatch(ui, /alert\(/);
});

test("SEIKO quantities use an inline editor", () => {
  assert.match(ui, /seikoMethQuantityEditor/);
  assert.match(ui, /Accepted quantity/);
  assert.match(ui, /Completed \/ QC-passed/);
  assert.match(ui, /Chargeable to MeTh/);
  assert.match(ui, /Save quantities/);
  assert.match(css, /\.seikoMethQuantityGrid/);
});

test("MeTh charge cannot be issued before valid completed chargeable output", () => {
  assert.match(ui, /handoff\.quantityChargeable > 0/);
  assert.match(ui, /\["completed", "transferred"\]\.includes\(handoff\.seikoStatus\)/);
  assert.match(ui, /disabled=\{!canIssueCharge\(item\)\}/);
});
