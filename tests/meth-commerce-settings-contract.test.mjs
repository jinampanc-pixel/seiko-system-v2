import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const methApp = readFileSync(new URL("../app/meth-app.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../app/meth-commerce-settings.tsx", import.meta.url), "utf8");
const serverSync = readFileSync(new URL("../app/meth-server-sync.tsx", import.meta.url), "utf8");

test("live MeTh settings use the dedicated commerce settings component", () => {
  assert.match(methApp, /import \{ MethCommerceSettings \} from "\.\/meth-commerce-settings"/);
  assert.doesNotMatch(methApp, /MethCommerceSettings, MethFinanceSurface/);
});

test("SKU mapping and manufacturing rates use inline forms instead of browser prompts", () => {
  assert.match(settings, /name="methSku"/);
  assert.match(settings, /name="seikoProductionSku"/);
  assert.match(settings, /Save mapping/i);
  assert.match(settings, /Manufacturing rate \/ pc/i);
  assert.match(settings, /Save rate/i);
  assert.doesNotMatch(settings, /\bprompt\s*\(/);
  assert.doesNotMatch(settings, /\balert\s*\(/);
});

test("new settings preserve the existing D1 synchronization collections", () => {
  assert.match(settings, /write\(methStoreKey\("sku-mappings"\), next\)/i);
  assert.match(settings, /write\(methStoreKey\("rates"\), next\)/);
  assert.match(serverSync, /collection: "sku-mappings"/i);
  assert.match(serverSync, /collection: "rates"/);
  assert.match(serverSync, /window\.addEventListener\("jinam-data-change", localChange\)/);
});
