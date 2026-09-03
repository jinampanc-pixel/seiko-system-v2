import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("app/seiko-final-order-routing.tsx", "utf8");
const enhancements = readFileSync("app/app-enhancements.tsx", "utf8");

test("final Home order routing is mounted after the chooser UX", () => {
  assert.match(enhancements, /<SeikoFinalUxPass\s*\/>\s*\n\s*<SeikoFinalOrderRouting\s*\/>/);
});

test("Home chooser routes setup workspace and labels explicitly", () => {
  assert.match(source, /action === "setup"/);
  assert.match(source, /openSetup\(orderNo\)/);
  assert.match(source, /openWorkspace\(orderNo\)/);
  assert.match(source, /openLabels\(orderNo\)/);
  assert.match(source, /Edit setup/);
  assert.match(source, /Create labels/);
  assert.match(source, /\/labels\/create\?business=/);
});

test("setup routing has a workspace fallback instead of silently failing", () => {
  assert.match(source, /\.openOrderButton/);
  assert.match(source, /\.workspacePage \.orderActionMenu button/);
  assert.match(source, /order-setup-origin/);
});
