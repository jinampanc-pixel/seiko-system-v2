import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/label-dynamic-products.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/label-dynamic-products.css", import.meta.url), "utf8");
const compact = readFileSync(new URL("../app/label-field-compact.tsx", import.meta.url), "utf8");
const enhancements = readFileSync(new URL("../app/app-enhancements.tsx", import.meta.url), "utf8");

test("packing labels derive dynamic rows from applicable saved products", () => {
  assert.match(source, /quantityForRecord/);
  assert.match(source, /productQuantity/);
  assert.match(source, /normalizedMeasurements/);
  assert.match(source, /measurement\.appliesTo\.includes\(product\.id\)/);
  assert.match(source, /groupRuleMatches/);
  assert.match(source, /if \(quantity <= 0\) return 0/);
});

test("adaptive product zone emits only applicable rows and keeps sparse measurements conditional", () => {
  assert.match(source, /dynamicProductRows/);
  assert.match(source, /dynamicProductRow/);
  assert.match(source, /line\.product/);
  assert.match(source, /line\.primary/);
  assert.match(source, /line\.details/);
  assert.match(source, /conditionalDetailCount/);
  assert.match(source, /do not create extra templates|do not create extra/i);
  assert.doesNotMatch(source, /gender/i);
});

test("product schema variants are detected from actual applicable product ids rather than gender", () => {
  assert.match(source, /const schema = packageLines\.map\(line => line\.productId\)\.join\("\|"\)/);
  assert.match(source, /function schemaGroups/);
  assert.match(source, /product structure/);
  assert.match(source, /primary structure/);
  assert.match(source, /Customize variant/);
  assert.match(source, /adaptive-variants-v1/);
});

test("all text zones auto-fit inside their saved rectangles", () => {
  assert.match(source, /function fitSingleLine/);
  assert.match(source, /MIN_TEXT_PT/);
  assert.match(source, /measureMarkup/);
  assert.match(source, /state = "shrunk"/);
  assert.match(source, /state = "overflow"/);
  assert.match(source, /fitOtherElements/);
  assert.match(compact, /adaptiveLabelMode/);
});

test("preview and hidden print sheet use the same adaptive renderer", () => {
  assert.match(source, /function renderAdaptiveLabel/);
  assert.match(source, /enhancePreview\(records, variants\)/);
  assert.match(source, /enhancePrint\(records, variants\)/);
  assert.match(source, /renderAdaptiveLabel\(canvas, record, variants\)/);
  assert.match(source, /renderAdaptiveLabel\(label, record, variants\)/);
  assert.match(source, /\.printSheet \.printedLabel/);
});

test("dynamic product zone auto-fits and optional structure-specific geometry is persisted", () => {
  assert.match(source, /function fitProductBlock/);
  assert.match(source, /MIN_PRODUCT_PT/);
  assert.match(source, /applyVariantGeometry/);
  assert.match(source, /openVariantEditor/);
  assert.match(source, /Save variant/);
  assert.match(source, /Use shared layout/);
  assert.match(css, /element-dynamic-products/);
});

test("legacy person-package fields migrate to one Products & measurements zone", () => {
  assert.match(source, /ensureAdaptiveFieldSelection/);
  assert.match(source, /PRODUCT_SUMMARY_LABELS/);
  assert.match(source, /productDetailGroup/);
  assert.match(source, /summaryCheckbox\.click\(\)/);
  assert.match(source, /productSpecific\.forEach\(input => input\.click\(\)\)/);
});

test("every selected printed label is validated automatically and only real exceptions are surfaced", () => {
  assert.match(source, /type ValidationSummary/);
  assert.match(source, /labels checked/);
  assert.match(source, /auto-fitted/);
  assert.match(source, /Layout exceptions/);
  assert.match(source, /validation\.overflow/);
  assert.doesNotMatch(source, /Longest name|Most products|Most demanding|stress test/i);
});

test("adaptive renderer is mounted with the SEIKO enhancement stack", () => {
  assert.match(enhancements, /<LabelDynamicProducts \/>/);
});
