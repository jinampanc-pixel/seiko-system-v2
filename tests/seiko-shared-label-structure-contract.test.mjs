import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const designer = read("app/label-designer.tsx");
const finalization = read("app/label-finalization.tsx");

test("shared label information has one checklist and one valid helper boundary", () => {
  assert.doesNotMatch(designer, /fieldChecklist"><div className="fieldChecklist/);
  assert.doesNotMatch(designer, /function\s+\w+function\s+\w+/);
  assert.doesNotMatch(finalization, /function\s+\w+\([^)]*\)function\s+\w+/);
});

test("Production Packing and Inventory share the same editor mechanics", () => {
  assert.match(designer, /purpose === "production"/);
  assert.match(designer, /purpose === "packing"/);
  assert.match(designer, /purpose === "inventory"/);
  assert.match(designer, /labelInfoSelectedStripReact/);
  assert.match(designer, /moveFieldItem/);
  assert.match(designer, /labelGeometryFields/);
  assert.match(designer, /data-record-preview/);
});
