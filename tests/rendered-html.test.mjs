import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function expectApplicationPage(pathname) {
  const response = await render(pathname);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/html/i);
  const html = await response.text();
  assert.match(html, /Jinam/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
  return html;
}

test("renders the Jinam application", async () => {
  await expectApplicationPage("/");
});

test("renders the standalone label creation route", async () => {
  await expectApplicationPage("/labels/create?business=seiko");
});

test("built Orders API cold-starts in Workers without global-scope random values", async () => {
  const root = fileURLToPath(new URL("../dist/server/", import.meta.url));
  const files = fs.readdirSync(root, { recursive: true }).filter(file => file.endsWith(".js") && file !== "index.js");
  // Vinext uses dynamic imports, so register every built module explicitly.
  const modules = ["index.js", ...files].map(file => ({ type: "ESModule", path: path.join(root, file) }));
  const worker = new Miniflare({ modules, compatibilityDate: "2026-05-22", compatibilityFlags: ["nodejs_compat"], d1Databases: { DB: "orders-cold-start-test" } });
  try {
    const response = await worker.dispatchFetch("http://localhost/api/erp/orders", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "list", businessId: "seiko" }),
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, "AUTH_REQUIRED");
  } finally { await worker.dispose(); }
});
