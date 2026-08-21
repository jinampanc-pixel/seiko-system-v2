import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/seiko/route.ts", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

test("operational modules remain present", () => {
  for (const label of ["Labels", "Scan", "Trace", "Production", "Sales", "Delivery"]) assert.match(page, new RegExp(label));
});

test("scanner supports camera, scan gun and offline queue", () => {
  assert.match(page, /getUserMedia/);
  assert.match(page, /BarcodeDetector/);
  assert.match(page, /detector\.detect/);
  assert.match(page, /seiko-scan-queue/);
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
  assert.match(serviceWorker, /pathname\.startsWith\(\"\/api\/\"\)/);
});

test("queued scans synchronize using their original idempotency key", () => {
  assert.match(page, /seiko-scan-queue/);
  assert.match(page, /requestKey: item\.id/);
});
