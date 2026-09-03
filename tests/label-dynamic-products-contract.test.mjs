import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/label-dynamic-products.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/label-dynamic-products.css", import.meta.url), "utf8");
const enhancements = readFileSync(new URL("../app/app-enhancements.tsx", import.meta.url), "utf8");

test("packing labels derive dynamic rows from applicable saved products", () => {
  assert.match(source, /quantityForRecord/);
  assert.match(source, /productQuantity/);
  assert.match(source, /normalizedMeasurements/);
  assert.match(source, /measurement\.appliesTo\.includes\(product\.id\)/);
  assert.match(source, /groupRuleMatches/);
  assert.match(source, /if \(quantity <= 0\) return 0/);
});

test("dynamic region emits only applicable product rows with product-specific measurements", () => {
  assert.match(source, /dynamicProductRows/);
  assert.match(source, /dynamicProductRow/);
  assert.match(source, /line\.product/);
  assert.match(source, /line\.primary/);
  assert.match(source, /line\.details/);
  assert.match(source, /line\.quantity > 1/);
  assert.doesNotMatch(source, /visibility:\s*hidden/);
});

test("preview and hidden print sheet use the same dynamic record renderer", () => {
  assert.match(source, /function transformField\(element: HTMLElement, record: DynamicRecord\)/);
  assert.match(source, /enhancePreview\(records\)/);
  assert.match(source, /enhancePrint\(records\)/);
  assert.match(source, /transformField\(target, record\)/g);
  assert.match(source, /\.printSheet \.printedLabel/);
});

test("dynamic product block auto-fits inside the saved rectangle", () => {
  assert.match(source, /function fitBlock/);
  assert.match(source, /byHeight/);
  assert.match(source, /byWidth/);
  assert.match(css, /overflow:hidden!important/);
  assert.match(css, /font-size:var\(--dynamic-product-font-px/);
  assert.match(css, /font-size:var\(--dynamic-product-font-pt/);
});

test("designer exposes stress-test samples and mounts the dynamic renderer", () => {
  assert.match(source, /Longest name/);
  assert.match(source, /Most products/);
  assert.match(source, /Most demanding/);
  assert.match(enhancements, /<LabelDynamicProducts \/>/);
});
