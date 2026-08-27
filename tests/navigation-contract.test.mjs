import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const navigation = readFileSync(new URL("../app/global-navigation.tsx", import.meta.url), "utf8");
const navigationCss = readFileSync(new URL("../app/global-navigation.css", import.meta.url), "utf8");
const rootPage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const labelRoute = readFileSync(new URL("../app/labels/create/page.tsx", import.meta.url), "utf8");

test("global menu uses Home and keeps business switching out of the header", () => {
  assert.match(navigation, /label: "Home"/);
  assert.match(navigationCss, /compactBusinessPicker>select\{display:none!important;pointer-events:none!important\}/);
  assert.match(navigation, /globalBusinessNavigator/);
  assert.match(navigation, /Switch business/);
  assert.doesNotMatch(navigation, /Veyn Health · Read only/);
});

test("settings and business navigator stay in the normal menu stack", () => {
  assert.match(navigationCss, /moduleMenuSettings[\s\S]*margin-top:8px!important/);
  assert.doesNotMatch(navigationCss, /globalStandaloneMenu \.moduleMenuSettings\{margin-top:auto/);
  assert.match(navigation, /<BusinessNavigator businesses=\{businesses\}/);
});

test("business selector uses one accessible overlay and one shared chevron", () => {
  assert.match(navigation, /<select aria-label="Switch business"/);
  assert.match(navigation, /globalBusinessChevron/);
  assert.match(navigationCss, /globalBusinessNavigator>select/);
  assert.match(navigationCss, /opacity:0/);
});

test("standalone label setup and designer retain global navigation", () => {
  assert.match(navigation, /pathname\.startsWith\("\/labels\/create"\)/);
  assert.match(navigation, /StandaloneNavigation/);
  assert.match(labelRoute, /labelCreateTopbar/);
  assert.match(navigation, /navigateToRoot\(item\.module\)/);
});

test("module-center navigation can escape nested Orders and Labels screens without losing business context", () => {
  assert.match(navigation, /label === "Orders" \|\| label === "Labels"/);
  assert.match(navigation, /sessionStorage\.setItem\(NAV_INTENT_KEY, target\)/);
  assert.match(navigation, /rootUrl\(businessId = currentBusinessId\(\)\)/);
  assert.match(navigation, /window\.location\.assign\(rootUrl\(\)\)/);
  assert.match(rootPage, /className="moduleMenu"/);
});

test("switching businesses updates the owning React business selector instead of reopening Seiko", () => {
  assert.match(navigation, /setReactSelectValue\(rootSelect, nextBusinessId\)/);
  assert.match(navigation, /localStorage\.setItem\("jinam:selected-business", nextBusinessId\)/);
  assert.match(navigation, /url\.searchParams\.set\("business", nextBusinessId\)/);
  assert.match(navigation, /requestedBusiness/);
});

test("open menus close on an outside pointer interaction", () => {
  assert.match(navigation, /closeOnOutsidePointer/);
  assert.match(navigation, /target\.closest\("\.moduleMenu"\)/);
  assert.match(navigation, /menuToggle\[aria-expanded="true"\]/);
});

test("retired business access stays excluded from global navigation", () => {
  assert.match(navigation, /item\.businessId !== "veyn-view"/);
});
