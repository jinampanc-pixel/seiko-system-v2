import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const navigation = readFileSync(new URL("../app/global-navigation.tsx", import.meta.url), "utf8");
const navigationCss = readFileSync(new URL("../app/global-navigation.css", import.meta.url), "utf8");
const stableCss = readFileSync(new URL("../app/seiko-stable.css", import.meta.url), "utf8");
const rootPage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const labelRoute = readFileSync(new URL("../app/labels/create/page.tsx", import.meta.url), "utf8");
const enhancements = readFileSync(new URL("../app/app-enhancements.tsx", import.meta.url), "utf8");

test("global menu uses Home and keeps business switching in the menu", () => {
  assert.match(navigation, /label: "Home"/);
  assert.match(navigationCss, /compactBusinessPicker>select\{display:none!important;pointer-events:none!important\}/);
  assert.match(navigation, /globalBusinessNavigator/);
  assert.match(navigation, /Switch business/);
  assert.doesNotMatch(navigation, /Veyn Health · Read only/);
});

test("stable menu owns the whole viewport and keeps the business selector at the top", () => {
  assert.match(stableCss, /inset: 0 0 0 auto !important/);
  assert.match(stableCss, /height: 100dvh !important/);
  assert.match(stableCss, /> \.globalBusinessNavigator[\s\S]*order: -20 !important/);
  assert.match(stableCss, /z-index: 20000 !important/);
});

test("business selector uses one accessible overlay and one shared chevron", () => {
  assert.match(navigation, /<select aria-label="Switch business"/);
  assert.match(navigation, /globalBusinessChevron/);
  assert.match(navigationCss, /globalBusinessNavigator>select/);
  assert.match(navigationCss, /opacity:0/);
});

test("standalone label setup and designer retain safe global navigation", () => {
  assert.match(navigation, /pathname\.startsWith\("\/labels\/create"\)/);
  assert.match(navigation, /StandaloneNavigation/);
  assert.match(labelRoute, /labelCreateTopbar/);
  assert.match(navigation, /onClick=\{\(\) => goToRoot\(item\.intent\)\}/);
  assert.match(navigation, /sessionStorage\.setItem\(NAV_INTENT_KEY, intent\)/);
  assert.match(navigation, /window\.location\.assign\(rootUrl\(\)\)/);
});

test("module navigation escapes nested screens with one-shot intent and no recursive capture layer", () => {
  assert.match(navigation, /const intent = sessionStorage\.getItem\(NAV_INTENT_KEY\)/);
  assert.match(navigation, /sessionStorage\.removeItem\(NAV_INTENT_KEY\)/);
  assert.match(navigation, /if \(target\) target\.click\(\)/);
  assert.match(navigation, /rootUrl\(businessId = currentBusinessId\(\)\)/);
  assert.match(rootPage, /className="moduleMenu"/);
  assert.doesNotMatch(enhancements, /SeikoMenuClickFix/);
  assert.doesNotMatch(navigation, /addEventListener\("pointerup"[\s\S]*true\)/);
});

test("switching businesses updates the owning React business selector instead of reopening Seiko", () => {
  assert.match(navigation, /setReactSelectValue\(rootSelect, nextBusinessId\)/);
  assert.match(navigation, /localStorage\.setItem\("jinam:selected-business", nextBusinessId\)/);
  assert.match(navigation, /url\.searchParams\.set\("business", nextBusinessId\)/);
  assert.match(navigation, /requestedBusiness/);
});

test("standalone menu closes through its React-owned backdrop", () => {
  assert.match(navigation, /className="menuBackdrop"[\s\S]*onClick=\{\(\) => setOpen\(false\)\}/);
  assert.match(navigation, /aria-label=\{open \? "Close menu" : "Open menu"\}/);
});

test("retired business access stays excluded from global navigation", () => {
  assert.match(navigation, /item\.businessId !== "veyn-view"/);
});