import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const text = path => readFile(join(root, path), "utf8");

test("Jinam product contract locks the three separate business applications", async () => {
  const spec = await text("JINAM_PRODUCT_ARCHITECTURE.md");
  for (const business of ["SEIKO", "véyn health", "MeTh"]) assert.ok(spec.includes(business));
  assert.match(spec, /not skins or presets of one common workflow/i);
  assert.match(spec, /same email\/phone identity/i);
});

test("MeTh production handoff returns to MeTh for packing and delivery", async () => {
  const spec = await text("JINAM_PRODUCT_ARCHITECTURE.md");
  const architecture = await text("JINAM_ARCHITECTURE.md");
  assert.match(spec, /MeTh creates a linked production request for \*\*SEIKO\*\*/i);
  assert.match(spec, /MeTh handles packing and delivery/i);
  assert.match(architecture, /MeTh order → SEIKO production request → SEIKO production updates → SEIKO ready\/complete → MeTh packing → MeTh delivery/i);
  for (const source of [spec, architecture]) assert.match(source, /VÉYN is not part of the MeTh fulfilment chain/i);
});

test("all three businesses have vendor and expense capabilities without exposing dead modules", async () => {
  const catalog = await text("app/lib/business-catalog.ts");
  assert.match(catalog, /"vendor-library"/);
  assert.match(catalog, /"expenses"/);
  assert.match(catalog, /COMMON_BUSINESS_CAPABILITIES/);
  for (const businessId of ["seiko", "veyn-health", "meth"]) {
    const section = catalog.match(new RegExp(`(?:"${businessId}"|${businessId}):\\s*\\{[\\s\\S]*?capabilities:\\s*COMMON_BUSINESS_CAPABILITIES`));
    assert.ok(section, `${businessId} must receive the common vendor/expense capability contract`);
  }
  assert.doesNotMatch(catalog, /allowedModules:\s*\[[^\]]*"vendors"/);
  assert.doesNotMatch(catalog, /allowedModules:\s*\[[^\]]*"expenses"/);
});

test("vendor and expense financial visibility is permission-controlled", async () => {
  const access = await text("app/lib/access-control.ts");
  for (const permission of ["vendors.view", "vendors.manage", "expenses.view", "expenses.manage"]) {
    assert.ok(access.includes(`"${permission}"`), `${permission} must exist`);
  }
  const operationsPreset = access.match(/operations:\s*\[[\s\S]*?\],\n\s*viewer:/)?.[0] || "";
  const viewerPreset = access.match(/viewer:\s*\[[^\]]*\]/)?.[0] || "";
  for (const restricted of ["vendors.view", "vendors.manage", "expenses.view", "expenses.manage"]) {
    assert.equal(operationsPreset.includes(restricted), false, `${restricted} must not be granted to operations by default`);
    assert.equal(viewerPreset.includes(restricted), false, `${restricted} must not be granted to viewers by default`);
  }
});

test("Jinam events remain channel-neutral while supporting WhatsApp integration", async () => {
  const spec = await text("JINAM_PRODUCT_ARCHITECTURE.md");
  assert.match(spec, /WhatsApp logic must not be hardcoded separately inside every page/i);
  assert.match(spec, /event → recipient → message\/template → enabled\/disabled → channel/);
  assert.match(spec, /WhatsApp is one channel/i);
});
