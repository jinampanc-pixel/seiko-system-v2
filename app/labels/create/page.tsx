"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LabelDesigner } from "../../label-designer";
import { PackingPersonLabelDesigner } from "../../packing-person-label-designer";
import { orderStoreKey, type SeikoOrder } from "../../lib/order-domain";
import { businessStorageKey, THEME_PRESETS, themeVariables, type BusinessTheme } from "../../lib/foundation";

type LabelBehavior = "production" | "packing" | "inventory";
type SourceMode = "person_product" | "person" | "product" | "group" | "order";
type PurposeDefinition = { id: string; label: string; behavior: LabelBehavior; enabled: boolean; builtin?: boolean };
type RepresentationDefinition = { id: string; purposeId: string; label: string; sourceMode: SourceMode; help: string; enabled: boolean; builtin?: boolean };
type LabelConfiguration = { purposes: PurposeDefinition[]; representations: RepresentationDefinition[] };
type PreferenceResponse = { ok: boolean; data?: { value?: LabelConfiguration | null; canManage?: boolean }; message?: string };

const BUSINESS_LOGOS: Record<string, string> = {
  seiko: "/brands/seiko-logo-transparent.png",
  "veyn-health": "/brands/veyn-health-logo.png",
  meth: "/brands/meth-logo.jpg",
};

const SOURCE_MODES: Array<{ value: SourceMode; label: string; help: string }> = [
  { value: "person_product", label: "Each physical item", help: "One identity for each individual garment, item or workpiece." },
  { value: "person", label: "Each person / package", help: "One identity for each person or that person's package." },
  { value: "product", label: "Each product / stock group", help: "One identity for each product or stock group." },
  { value: "group", label: "Each group / outer package", help: "One identity for a grouped work set or grouped outer package." },
  { value: "order", label: "Whole order", help: "One identity representing the complete order or its outermost package." },
];

const DEFAULT_CONFIG: LabelConfiguration = {
  purposes: [
    { id: "production", label: "Production", behavior: "production", enabled: true, builtin: true },
    { id: "packing", label: "Packing", behavior: "packing", enabled: true, builtin: true },
    { id: "inventory", label: "Inventory", behavior: "inventory", enabled: true, builtin: true },
  ],
  representations: [
    { id: "production-item", purposeId: "production", label: "Each physical item", sourceMode: "person_product", help: SOURCE_MODES[0].help, enabled: true, builtin: true },
    { id: "packing-person", purposeId: "packing", label: "Each person / package", sourceMode: "person", help: SOURCE_MODES[1].help, enabled: true, builtin: true },
    { id: "packing-group", purposeId: "packing", label: "Each group / outer package", sourceMode: "group", help: SOURCE_MODES[3].help, enabled: true, builtin: true },
    { id: "packing-order", purposeId: "packing", label: "Whole order", sourceMode: "order", help: SOURCE_MODES[4].help, enabled: true, builtin: true },
    { id: "inventory-product", purposeId: "inventory", label: "Each product / stock group", sourceMode: "product", help: SOURCE_MODES[2].help, enabled: true, builtin: true },
  ],
};

function defaultThemeFor(businessId: string): BusinessTheme {
  if (businessId === "veyn-health") return THEME_PRESETS.veyn;
  if (businessId === "meth") return THEME_PRESETS.meth;
  return THEME_PRESETS.seiko;
}
function preferenceKey(businessId: string) { return `jinam:${businessId}:label-config-v2`; }
function slug(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || crypto.randomUUID().slice(0, 8); }
function normalizeConfig(value: LabelConfiguration | null | undefined): LabelConfiguration {
  if (!value?.purposes?.length || !value?.representations?.length) return DEFAULT_CONFIG;
  return { purposes: value.purposes, representations: value.representations };
}

async function loadSharedConfiguration(businessId: string): Promise<{ config: LabelConfiguration; canManage: boolean }> {
  try {
    const response = await fetch("/api/erp/preferences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "get", businessId, key: "labels.configuration.v2" }) });
    const result = await response.json() as PreferenceResponse;
    if (result.ok) return { config: normalizeConfig(result.data?.value), canManage: Boolean(result.data?.canManage) };
  } catch { /* safety copy below */ }
  try {
    const local = JSON.parse(localStorage.getItem(preferenceKey(businessId)) || "null") as LabelConfiguration | null;
    return { config: normalizeConfig(local), canManage: false };
  } catch { return { config: DEFAULT_CONFIG, canManage: false }; }
}

async function saveSharedConfiguration(businessId: string, config: LabelConfiguration) {
  localStorage.setItem(preferenceKey(businessId), JSON.stringify(config));
  const response = await fetch("/api/erp/preferences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "set", businessId, key: "labels.configuration.v2", value: config }) });
  const result = await response.json() as PreferenceResponse;
  if (!result.ok) throw new Error(result.message || "Could not save label options.");
}

function ManagedDropdown({ value, options, disabled, canManage, manageLabel, onChange, onManage }: {
  value: string;
  options: Array<{ id: string; label: string }>;
  disabled?: boolean;
  canManage: boolean;
  manageLabel: string;
  onChange: (id: string) => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find(item => item.id === value) || options[0];
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return <div className={`labelEmbeddedSelect ${open ? "open" : ""}`} ref={root}>
    <button type="button" className="labelEmbeddedSelectButton" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      <span>{selected?.label || "Choose…"}</span><span className="labelEmbeddedChevron">⌄</span>
    </button>
    {open && <div className="labelEmbeddedMenu" role="listbox">
      <div className="labelEmbeddedOptions">{options.map(item => <button type="button" role="option" aria-selected={item.id === value} className={item.id === value ? "selected" : ""} key={item.id} onClick={() => { onChange(item.id); setOpen(false); }}><span>{item.label}</span>{item.id === value && <b>✓</b>}</button>)}</div>
      {canManage && <button type="button" className="labelEmbeddedManage" onClick={() => { setOpen(false); onManage(); }}>{manageLabel}</button>}
    </div>}
  </div>;
}

function ConfigurationEditor({ kind, config, purposeId, onChange, onClose }: { kind: "purpose" | "representation"; config: LabelConfiguration; purposeId: string; onChange: (config: LabelConfiguration) => void; onClose: () => void }) {
  const [draftName, setDraftName] = useState("");
  const [draftBehavior, setDraftBehavior] = useState<LabelBehavior>("production");
  const [draftSource, setDraftSource] = useState<SourceMode>("person_product");
  const rows = kind === "purpose" ? config.purposes : config.representations.filter(item => item.purposeId === purposeId);
  const add = () => {
    const label = draftName.trim();
    if (!label) return;
    if (kind === "purpose") {
      const id = `purpose-${slug(label)}-${Date.now().toString(36)}`;
      onChange({ ...config, purposes: [...config.purposes, { id, label, behavior: draftBehavior, enabled: true }] });
    } else {
      const source = SOURCE_MODES.find(item => item.value === draftSource)!;
      const id = `rep-${slug(label)}-${Date.now().toString(36)}`;
      onChange({ ...config, representations: [...config.representations, { id, purposeId, label, sourceMode: draftSource, help: source.help, enabled: true }] });
    }
    setDraftName("");
  };
  const updateLabel = (id: string, label: string) => onChange(kind === "purpose"
    ? { ...config, purposes: config.purposes.map(item => item.id === id ? { ...item, label } : item) }
    : { ...config, representations: config.representations.map(item => item.id === id ? { ...item, label } : item) });
  const remove = (id: string) => onChange(kind === "purpose"
    ? { purposes: config.purposes.filter(item => item.id !== id), representations: config.representations.filter(item => item.purposeId !== id) }
    : { ...config, representations: config.representations.filter(item => item.id !== id) });
  const toggle = (id: string) => onChange(kind === "purpose"
    ? { ...config, purposes: config.purposes.map(item => item.id === id ? { ...item, enabled: !item.enabled } : item) }
    : { ...config, representations: config.representations.map(item => item.id === id ? { ...item, enabled: !item.enabled } : item) });

  return <div className="labelManagedEditor" role="dialog">
    <div className="labelManagedEditorHead"><b>{kind === "purpose" ? "Manage purposes" : "Manage representations"}</b><button type="button" onClick={onClose}>Done</button></div>
    <div className="labelManagedRows">{rows.map(item => <div className={`labelManagedRow ${!item.enabled ? "isHidden" : ""}`} key={item.id}>
      <input value={item.label} onChange={event => updateLabel(item.id, event.target.value)}/>
      <button type="button" className="labelManagedToggle" onClick={() => toggle(item.id)}>{item.enabled ? "Hide" : "Show"}</button>
      <button type="button" className="labelManagedRemove" onClick={() => remove(item.id)} aria-label={`Remove ${item.label}`}>×</button>
    </div>)}</div>
    <div className="labelManagedAdd">
      <input placeholder={kind === "purpose" ? "New purpose" : "New representation"} value={draftName} onChange={event => setDraftName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }}/>
      {kind === "purpose" ? <select value={draftBehavior} onChange={event => setDraftBehavior(event.target.value as LabelBehavior)}><option value="production">Production behaviour</option><option value="packing">Packing behaviour</option><option value="inventory">Inventory behaviour</option></select> : <select value={draftSource} onChange={event => setDraftSource(event.target.value as SourceMode)}>{SOURCE_MODES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>}
      <button type="button" onClick={add}>+ Add</button>
    </div>
  </div>;
}

export default function CreateLabelsPage() {
  const [ready, setReady] = useState(false);
  const [businessId, setBusinessId] = useState("seiko");
  const [theme, setTheme] = useState<BusinessTheme>(THEME_PRESETS.seiko);
  const [config, setConfig] = useState<LabelConfiguration>(DEFAULT_CONFIG);
  const [canManage, setCanManage] = useState(false);
  const [purposeId, setPurposeId] = useState("production");
  const [representationId, setRepresentationId] = useState("production-item");
  const [orderId, setOrderId] = useState("");
  const [orders, setOrders] = useState<SeikoOrder[]>([]);
  const [started, setStarted] = useState(false);
  const [manage, setManage] = useState<"purpose" | "representation" | null>(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const business = params.get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
    const requestedPurpose = params.get("purpose") || "production";
    const requestedOrder = params.get("order") || "";
    const fallbackTheme = defaultThemeFor(business);
    setBusinessId(business); setOrderId(requestedOrder);
    try { const savedTheme = localStorage.getItem(businessStorageKey(business, "theme-v2")); setTheme(savedTheme ? JSON.parse(savedTheme) as BusinessTheme : fallbackTheme); } catch { setTheme(fallbackTheme); }
    try { const saved = JSON.parse(localStorage.getItem(orderStoreKey(business)) || "[]") as SeikoOrder[]; setOrders(saved.filter(order => !order.archived)); } catch { setOrders([]); }
    loadSharedConfiguration(business).then(({ config: loaded, canManage: owner }) => {
      setConfig(loaded); setCanManage(owner);
      const requested = loaded.purposes.find(item => item.id === requestedPurpose && item.enabled) || loaded.purposes.find(item => item.behavior === requestedPurpose && item.enabled) || loaded.purposes.find(item => item.enabled) || loaded.purposes[0];
      if (requested) {
        setPurposeId(requested.id);
        const rep = loaded.representations.find(item => item.purposeId === requested.id && item.enabled) || loaded.representations.find(item => item.purposeId === requested.id);
        if (rep) setRepresentationId(rep.id);
      }
      setReady(true);
    });
  }, []);

  const selectedOrder = useMemo(() => orders.find(order => order.orderId === orderId) || null, [orderId, orders]);
  const purposes = config.purposes.filter(item => item.enabled);
  const selectedPurpose = config.purposes.find(item => item.id === purposeId) || purposes[0] || DEFAULT_CONFIG.purposes[0];
  const representations = config.representations.filter(item => item.purposeId === selectedPurpose.id && item.enabled);
  const selectedRepresentation = config.representations.find(item => item.id === representationId && item.purposeId === selectedPurpose.id) || representations[0] || DEFAULT_CONFIG.representations[0];
  const logo = BUSINESS_LOGOS[businessId] || BUSINESS_LOGOS.seiko;

  const changePurpose = (id: string) => {
    setPurposeId(id); setManage(null);
    const first = config.representations.find(item => item.purposeId === id && item.enabled) || config.representations.find(item => item.purposeId === id);
    if (first) setRepresentationId(first.id);
  };
  const changeConfig = async (next: LabelConfiguration) => {
    setConfig(next); setSaveError("");
    try { await saveSharedConfiguration(businessId, next); } catch (error) { setSaveError(error instanceof Error ? error.message : "Could not save changes."); }
    if (!next.purposes.some(item => item.id === purposeId && item.enabled)) {
      const first = next.purposes.find(item => item.enabled) || next.purposes[0];
      if (first) changePurpose(first.id);
    }
  };

  if (!ready) return <div className="labelCreateApp app" style={themeVariables(theme) as CSSProperties}><main className="labelCreateRoute"><div className="panel">Loading label workspace…</div></main></div>;

  if (started && selectedOrder) {
    const nativePackingPerson = selectedPurpose.behavior === "packing" && selectedRepresentation.sourceMode === "person";
    return <div className="labelCreateApp app" data-label-source={selectedRepresentation.sourceMode} style={themeVariables(theme) as CSSProperties}>
      <div className="surface"><header className="labelCreateTopbar"><img className={`labelCreateBrand logo-${businessId}`} src={logo} alt="Business logo"/></header>{nativePackingPerson ? <PackingPersonLabelDesigner businessId={businessId} order={selectedOrder} canManageSizes={canManage} backLabel="← Back to label setup" onBack={() => setStarted(false)}/> : <LabelDesigner businessId={businessId} order={selectedOrder} initialPurpose={selectedPurpose.behavior} initialSourceMode={selectedRepresentation.sourceMode} canManageSizes={canManage} backLabel="← Back to label setup" onBack={() => setStarted(false)}/>}</div>
    </div>;
  }

  return <div className="labelCreateApp app" style={themeVariables(theme) as CSSProperties}><div className="surface">
    <header className="labelCreateTopbar"><img className={`labelCreateBrand logo-${businessId}`} src={logo} alt="Business logo"/></header>
    <main className="labelCreateRoute">
      <section className="labelCreateRouteHead"><div><button type="button" className="secondary contextBackButton" onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = `/?business=${businessId}`; }}>{selectedOrder ? "← Back to Order" : "← Back to Labels"}</button><p className="eyebrow">LABEL CREATION</p><h1>Create labels</h1><p>Choose the order, choose why the label is needed, then decide what one label represents.</p></div></section>
      <section className="panel labelCreateOrderChoice">
        <div className="labelCreateField"><label><span>1 · Order</span><select value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">Choose an order…</option>{orders.map(order => <option key={order.orderId} value={order.orderId}>{order.details.orderNo} — {order.details.clientName || "Unnamed client"}</option>)}</select></label></div>
        <div className="labelCreateField labelManagedField"><div className="labelCreateFieldTitle"><span>2 · Purpose</span></div><ManagedDropdown value={selectedPurpose.id} options={purposes} disabled={!selectedOrder} canManage={canManage} manageLabel="Manage purposes…" onChange={changePurpose} onManage={() => setManage("purpose")}/>{manage === "purpose" && canManage && <ConfigurationEditor kind="purpose" config={config} purposeId={selectedPurpose.id} onChange={changeConfig} onClose={() => setManage(null)}/>}</div>
        <div className="labelCreateField labelManagedField"><div className="labelCreateFieldTitle"><span>3 · Label represents</span></div><ManagedDropdown value={selectedRepresentation.id} options={representations} disabled={!selectedOrder || !representations.length} canManage={canManage} manageLabel="Manage representations…" onChange={setRepresentationId} onManage={() => setManage("representation")}/>{manage === "representation" && canManage && <ConfigurationEditor kind="representation" config={config} purposeId={selectedPurpose.id} onChange={changeConfig} onClose={() => setManage(null)}/>}</div>
      </section>
      {saveError && <p className="labelConfigurationError">{saveError}</p>}
      <div className="labelCreateRouteActions"><button className="primary" disabled={!selectedOrder || !representations.length} onClick={() => selectedOrder && setStarted(true)}>Continue to designer</button></div>
    </main>
  </div></div>;
}
