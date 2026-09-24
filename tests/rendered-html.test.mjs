import assert from "node:assert/strict";
import test from "node:test";

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
