import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/seiko/route.ts", import.meta.url), "utf8");

test("operational modules remain present", () => {
  for (const label of ["Labels", "Scan", "Trace", "Production", "Sales", "Delivery"]) assert.match(page, new RegExp(label));
});

test("scanner supports camera, scan gun and offline queue", () => {
  assert.match(page, /getUserMedia/);
  assert.match(page, /seiko-scan-queue/);
  assert.match(page, />Record<\/button>/);
});

test("server bridge protects credentials and bounds latency", () => {
  assert.match(route, /process\.env\.SEIKO_API_KEY/);
  assert.match(route, /TIMEOUT_MS = 8000/);
  assert.doesNotMatch(page, /SEIKO_API_KEY/);
});
