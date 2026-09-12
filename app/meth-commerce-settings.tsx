"use client";

import { useEffect, useState } from "react";
import {
  legalProfileStoreKey,
  methStoreKey,
  type BusinessLegalProfile,
  type ManufacturingRate,
  type SkuMapping,
} from "./lib/meth-commerce";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("jinam-data-change"));
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
}

const EMPTY_PROFILE: BusinessLegalProfile = {
  businessId: "meth",
  legalName: "",
  gstin: "",
  registeredAddress: "",
  stateCode: "",
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  ifsc: "",
  invoicePrefix: "MTH",
  gstRegistered: false,
  updatedAt: "",
};

export function MethCommerceSettings() {
  const [mappings, setMappings] = useState(() => read<SkuMapping[]>(methStoreKey("sku-mappings"), []));
  const [rates, setRates] = useState(() => read<ManufacturingRate[]>(methStoreKey("rates"), []));
  const [profile, setProfile] = useState<BusinessLegalProfile>(() => read(legalProfileStoreKey("meth"), { ...EMPTY_PROFILE, updatedAt: new Date().toISOString() }));
  const [mappingOpen, setMappingOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [mappingMessage, setMappingMessage] = useState("");
  const [rateMessage, setRateMessage] = useState("");

  useEffect(() => {
    const refresh = () => {
      setMappings(read<SkuMapping[]>(methStoreKey("sku-mappings"), []));
      setRates(read<ManufacturingRate[]>(methStoreKey("rates"), []));
      setProfile(read<BusinessLegalProfile>(legalProfileStoreKey("meth"), { ...EMPTY_PROFILE, updatedAt: new Date().toISOString() }));
    };
    const serverChange = (event: Event) => {
      const collection = (event as CustomEvent<{ collection?: string }>).detail?.collection;
      if (!collection || ["sku-mappings", "rates", "legal-profiles"].includes(collection)) refresh();
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("jinam-server-change", serverChange);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("jinam-server-change", serverChange);
    };
  }, []);

  const saveProfile = (next: BusinessLegalProfile) => {
    const updated = { ...next, businessId: "meth" as const, updatedAt: new Date().toISOString() };
    setProfile(updated);
    write(legalProfileStoreKey("meth"), updated);
  };

  const saveMapping = (form: FormData) => {
    const methSku = String(form.get("methSku") || "").trim();
    const seikoProductionSku = String(form.get("seikoProductionSku") || "").trim();
    const productName = String(form.get("productName") || "").trim() || methSku;
    if (!methSku || !seikoProductionSku) {
      setMappingMessage("MeTh SKU and SEIKO production SKU are required.");
      return;
    }

    const existing = mappings.find(item => item.methSku.toLowerCase() === methSku.toLowerCase());
    const now = new Date().toISOString();
    const record: SkuMapping = {
      ...existing,
      id: existing?.id || crypto.randomUUID(),
      methSku,
      productName,
      size: String(form.get("size") || "").trim() || existing?.size || "",
      colour: String(form.get("colour") || "").trim() || existing?.colour || "",
      shopifyVariantId: String(form.get("shopifyVariantId") || "").trim() || existing?.shopifyVariantId || "",
      amazonSellerSku: existing?.amazonSellerSku || "",
      amazonAsin: existing?.amazonAsin || "",
      seikoProductionSku,
      seikoSpecificationRef: String(form.get("seikoSpecificationRef") || "").trim() || existing?.seikoSpecificationRef || "",
      active: true,
      updatedAt: now,
    };
    const next = [record, ...mappings.filter(item => item.id !== record.id)];
    setMappings(next);
    write(methStoreKey("sku-mappings"), next);
    setMappingMessage(existing ? `Updated ${methSku}.` : `Mapped ${methSku} to ${seikoProductionSku}.`);
    setMappingOpen(false);
  };

  const saveRate = (form: FormData) => {
    const methSku = String(form.get("methSku") || "").trim();
    const mapping = mappings.find(item => item.active && item.methSku === methSku);
    const rate = Number(form.get("rate"));
    const taxRate = Number(form.get("taxRate") || 0);
    const effectiveFrom = String(form.get("effectiveFrom") || "").trim() || new Date().toISOString().slice(0, 10);

    if (!mapping) {
      setRateMessage("Select a MeTh SKU that has an active SKU mapping first.");
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      setRateMessage("Manufacturing rate must be greater than zero.");
      return;
    }
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      setRateMessage("GST rate must be between 0 and 100.");
      return;
    }

    const sameSkuRates = rates.filter(item => item.methSku === methSku);
    const version = Math.max(0, ...sameSkuRates.map(item => item.version)) + 1;
    const record: ManufacturingRate = {
      id: crypto.randomUUID(),
      methSku,
      seikoProductionSku: mapping.seikoProductionSku,
      rate,
      taxRate,
      unit: "pc",
      effectiveFrom,
      version,
      active: true,
    };
    const next = [record, ...rates];
    setRates(next);
    write(methStoreKey("rates"), next);
    setRateMessage(`Saved ${methSku} manufacturing rate ${money(rate)} / pc as v${version}.`);
    setRateOpen(false);
  };

  return <>
    <section className="jinamSettingsCard">
      <h2>Legal entity</h2>
      <p>MeTh keeps its own GST, banking and invoice identity, separate from SEIKO.</p>
      <div className="methCommerceForm methCommerceFormStatic">
        <label>Legal name<input value={profile.legalName} onChange={event => saveProfile({ ...profile, legalName: event.target.value })}/></label>
        <label>GSTIN<input value={profile.gstin} onChange={event => saveProfile({ ...profile, gstin: event.target.value, gstRegistered: Boolean(event.target.value) })}/></label>
        <label>Registered address<input value={profile.registeredAddress} onChange={event => saveProfile({ ...profile, registeredAddress: event.target.value })}/></label>
        <label>State code<input value={profile.stateCode} onChange={event => saveProfile({ ...profile, stateCode: event.target.value })}/></label>
      </div>
    </section>

    <section className="jinamSettingsCard">
      <h2>SKU mapping</h2>
      <p>Map each MeTh selling SKU to the SEIKO production SKU. Shopify can match by its SKU directly; variant ID is optional.</p>
      <button type="button" className="primary" onClick={() => { setMappingOpen(value => !value); setMappingMessage(""); }}>{mappingOpen ? "Close mapping form" : "Add SKU mapping"}</button>
      {mappingOpen && <form action={saveMapping} className="methCommerceForm">
        <label>MeTh SKU<input name="methSku" required placeholder="METH-TEST-001" autoComplete="off"/></label>
        <label>SEIKO production SKU<input name="seikoProductionSku" required placeholder="SEIKO-TEST-001" autoComplete="off"/></label>
        <label className="methCommerceWide">Product name<input name="productName" placeholder="MeTh Test Scrub Top" autoComplete="off"/></label>
        <label>Size (optional)<input name="size" autoComplete="off"/></label>
        <label>Colour (optional)<input name="colour" autoComplete="off"/></label>
        <label>Shopify variant ID (optional)<input name="shopifyVariantId" placeholder="Not required when Shopify SKU matches" autoComplete="off"/></label>
        <label>SEIKO specification ref (optional)<input name="seikoSpecificationRef" autoComplete="off"/></label>
        <footer><button type="button" className="secondary" onClick={() => setMappingOpen(false)}>Cancel</button><button type="submit" className="primary">Save mapping</button></footer>
      </form>}
      {mappingMessage && <p className="methCommerceNotice" role="status">{mappingMessage}</p>}
      <div className="methCommerceList">{mappings.map(item => <div className="jinamDashboardRow" key={item.id}><div><strong>{item.methSku}</strong><span>{item.productName}</span></div><span>SEIKO {item.seikoProductionSku}</span></div>)}{!mappings.length && <div className="jinamDashboardRow"><strong>No SKU mappings yet</strong><span>Add one before testing a Shopify production shortage.</span></div>}</div>
    </section>

    <section className="jinamSettingsCard">
      <h2>SEIKO manufacturing rates</h2>
      <p>Versioned agreed rates are frozen into each handoff so historical costs never change when today&apos;s price changes.</p>
      <button type="button" className="primary" disabled={!mappings.some(item => item.active)} onClick={() => { setRateOpen(value => !value); setRateMessage(""); }}>{rateOpen ? "Close rate form" : "Add rate"}</button>
      {!mappings.some(item => item.active) && <p className="methCommerceNotice">Create an active SKU mapping before adding a manufacturing rate.</p>}
      {rateOpen && <form action={saveRate} className="methCommerceForm">
        <label className="methCommerceWide">MeTh SKU<select name="methSku" required defaultValue=""><option value="" disabled>Select mapped SKU</option>{mappings.filter(item => item.active).map(item => <option key={item.id} value={item.methSku}>{item.methSku} — SEIKO {item.seikoProductionSku}</option>)}</select></label>
        <label>Manufacturing rate / pc<input name="rate" type="number" min="0.01" step="0.01" required placeholder="300"/></label>
        <label>GST rate %<input name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue="0"/></label>
        <label className="methCommerceWide">Effective from<input name="effectiveFrom" type="date" defaultValue={new Date().toISOString().slice(0, 10)}/></label>
        <footer><button type="button" className="secondary" onClick={() => setRateOpen(false)}>Cancel</button><button type="submit" className="primary">Save rate</button></footer>
      </form>}
      {rateMessage && <p className="methCommerceNotice" role="status">{rateMessage}</p>}
      <div className="methCommerceList">{rates.map(item => <div className="jinamDashboardRow" key={item.id}><div><strong>{item.methSku} · {money(item.rate)}</strong><span>SEIKO {item.seikoProductionSku}</span></div><span>v{item.version} · GST {item.taxRate}% · from {item.effectiveFrom}</span></div>)}{!rates.length && <div className="jinamDashboardRow"><strong>No manufacturing rates yet</strong><span>Add a rate after mapping the SKU.</span></div>}</div>
    </section>

    <section className="jinamSettingsCard">
      <h2>Channel integrations</h2>
      <p>Shopify and future adapters use external order, payment, fulfilment and settlement IDs. Real credentials remain encrypted on the server.</p>
    </section>
  </>;
}
