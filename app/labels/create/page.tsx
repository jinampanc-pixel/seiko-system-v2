"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { LabelDesigner } from "../../label-designer";
import { orderStoreKey, type SeikoOrder } from "../../lib/order-domain";
import { businessStorageKey, THEME_PRESETS, themeVariables, type BusinessTheme } from "../../lib/foundation";

type LabelPurpose = "production" | "packing" | "inventory";
type SourceMode = "person_product" | "person" | "product" | "group" | "order";
type Vocabulary = {
  purposes?: Partial<Record<LabelPurpose, string>>;
  representations?: Partial<Record<SourceMode, string>>;
  hiddenPackingRepresentations?: SourceMode[];
};

type PurposeOption = { value: LabelPurpose; label: string };
type RepresentationOption = { value: SourceMode; label: string; help: string };

const BUSINESS_LOGOS: Record<string, string> = {
  seiko: "/brands/seiko-logo-transparent.png",
  "veyn-health": "/brands/veyn-health-logo.png",
  meth: "/brands/meth-logo.jpg",
};

const PURPOSE_OPTIONS: PurposeOption[] = [
  { value: "production", label: "Production" },
  { value: "packing", label: "Packing" },
  { value: "inventory", label: "Inventory" },
];

const REPRESENTATIONS: Record<LabelPurpose, RepresentationOption[]> = {
  production: [
    { value: "person_product", label: "Each physical item", help: "One permanent identity for each garment or individual workpiece." },
  ],
  packing: [
    { value: "person", label: "Each person / package", help: "One label for each person's completed package." },
    { value: "group", label: "Each group / outer package", help: "One label for a grouped outer package or grouped work set." },
    { value: "order", label: "Whole order", help: "One label for the complete order or its outermost package." },
  ],
  inventory: [
    { value: "product", label: "Each product / stock group", help: "One label for a product or stock-group identity." },
  ],
};

function defaultThemeFor(businessId: string): BusinessTheme {
  if (businessId === "veyn-health") return THEME_PRESETS.veyn;
  if (businessId === "meth") return THEME_PRESETS.meth;
  return THEME_PRESETS.seiko;
}

function vocabularyKey(businessId: string) {
  return `jinam:${businessId}:label-vocabulary-v1`;
}

function displayPurpose(option: PurposeOption, vocabulary: Vocabulary) {
  return vocabulary.purposes?.[option.value]?.trim() || option.label;
}

function displayRepresentation(option: RepresentationOption, vocabulary: Vocabulary) {
  return vocabulary.representations?.[option.value]?.trim() || option.label;
}

function ManagedNames({
  title,
  options,
  names,
  onName,
  removable = false,
  hidden = [],
  onToggleHidden,
  onClose,
}: {
  title: string;
  options: Array<{ value: string; label: string }>;
  names: Record<string, string>;
  onName: (value: string, label: string) => void;
  removable?: boolean;
  hidden?: string[];
  onToggleHidden?: (value: string) => void;
  onClose: () => void;
}) {
  return <div className="labelManagedEditor" role="dialog" aria-label={`Manage ${title}`}>
    <div className="labelManagedEditorHead"><b>{title}</b><button type="button" onClick={onClose}>Done</button></div>
    <p>These are system-backed choices. Rename the business wording here; optional choices can also be hidden without breaking their underlying ERP logic.</p>
    <div className="labelManagedRows">
      {options.map(option => {
        const isHidden = hidden.includes(option.value);
        return <div className={`labelManagedRow ${isHidden ? "isHidden" : ""}`} key={option.value}>
          <input value={names[option.value] ?? option.label} onChange={event => onName(option.value, event.target.value)} aria-label={`Name for ${option.label}`}/>
          {removable && onToggleHidden && <button type="button" className="labelManagedRemove" onClick={() => onToggleHidden(option.value)} title={isHidden ? `Restore ${option.label}` : `Hide ${option.label}`}>{isHidden ? "+" : "×"}</button>}
        </div>;
      })}
    </div>
  </div>;
}

function DesignerSourceLock({ sourceMode, displayLabel }: { sourceMode: SourceMode; displayLabel: string }) {
  useEffect(() => {
    let attempts = 0;
    const apply = () => {
      attempts += 1;
      const select = document.querySelector<HTMLSelectElement>(".labelDesignerPage .labelSetup label:first-child select");
      if (!select) {
        if (attempts < 30) window.setTimeout(apply, 40);
        return;
      }
      if (!Array.from(select.options).some(option => option.value === sourceMode)) {
        const option = document.createElement("option");
        option.value = sourceMode;
        option.textContent = displayLabel;
        select.appendChild(option);
      }
      select.disabled = false;
      const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
      descriptor?.set?.call(select, sourceMode);
      select.dispatchEvent(new Event("change", { bubbles: true }));

      const label = select.closest("label");
      if (!label) return;
      label.classList.add("launcherSourceLocked");
      const title = label.querySelector<HTMLElement>(":scope > span");
      if (title) title.textContent = "Label represents";
      let locked = label.querySelector<HTMLElement>(".designerSourceLockedValue");
      if (!locked) {
        locked = document.createElement("div");
        locked.className = "designerSourceLockedValue";
        label.appendChild(locked);
      }
      locked.innerHTML = `<b>${displayLabel}</b><small>Change from Back to setup</small>`;
      select.disabled = true;
    };
    apply();
  }, [displayLabel, sourceMode]);
  return null;
}

export default function CreateLabelsPage() {
  const [ready, setReady] = useState(false);
  const [businessId, setBusinessId] = useState("seiko");
  const [theme, setTheme] = useState<BusinessTheme>(THEME_PRESETS.seiko);
  const [purpose, setPurpose] = useState<LabelPurpose>("production");
  const [sourceMode, setSourceMode] = useState<SourceMode>("person_product");
  const [orderId, setOrderId] = useState("");
  const [orders, setOrders] = useState<SeikoOrder[]>([]);
  const [started, setStarted] = useState(false);
  const [vocabulary, setVocabulary] = useState<Vocabulary>({});
  const [manage, setManage] = useState<"purpose" | "representation" | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const business = params.get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
    const requestedPurpose = params.get("purpose");
    const requestedOrder = params.get("order") || "";
    const resolvedPurpose: LabelPurpose = requestedPurpose === "packing" || requestedPurpose === "inventory" ? requestedPurpose : "production";
    const fallbackTheme = defaultThemeFor(business);

    setBusinessId(business);
    setPurpose(resolvedPurpose);
    setSourceMode(REPRESENTATIONS[resolvedPurpose][0].value);
    setOrderId(requestedOrder);

    try {
      const savedTheme = localStorage.getItem(businessStorageKey(business, "theme-v2"));
      setTheme(savedTheme ? JSON.parse(savedTheme) as BusinessTheme : fallbackTheme);
    } catch {
      setTheme(fallbackTheme);
    }
    try {
      const savedVocabulary = localStorage.getItem(vocabularyKey(business));
      setVocabulary(savedVocabulary ? JSON.parse(savedVocabulary) as Vocabulary : {});
    } catch {
      setVocabulary({});
    }
    try {
      const saved = JSON.parse(localStorage.getItem(orderStoreKey(business)) || "[]") as SeikoOrder[];
      setOrders(saved.filter(order => !order.archived));
    } catch {
      setOrders([]);
    }
    setReady(true);
  }, []);

  const saveVocabulary = (next: Vocabulary) => {
    setVocabulary(next);
    if (businessId) localStorage.setItem(vocabularyKey(businessId), JSON.stringify(next));
  };

  const selectedOrder = useMemo(() => orders.find(order => order.orderId === orderId) || null, [orderId, orders]);
  const availableRepresentations = useMemo(() => {
    const all = REPRESENTATIONS[purpose];
    if (purpose !== "packing") return all;
    const hidden = new Set(vocabulary.hiddenPackingRepresentations || []);
    const visible = all.filter(option => !hidden.has(option.value));
    return visible.length ? visible : all.slice(0, 1);
  }, [purpose, vocabulary.hiddenPackingRepresentations]);
  const selectedRepresentation = REPRESENTATIONS[purpose].find(option => option.value === sourceMode) || availableRepresentations[0];
  const logo = BUSINESS_LOGOS[businessId] || BUSINESS_LOGOS.seiko;

  const changePurpose = (next: LabelPurpose) => {
    setPurpose(next);
    const candidates = next === "packing"
      ? REPRESENTATIONS[next].filter(option => !(vocabulary.hiddenPackingRepresentations || []).includes(option.value))
      : REPRESENTATIONS[next];
    setSourceMode((candidates[0] || REPRESENTATIONS[next][0]).value);
    setManage(null);
  };

  const updatePurposeName = (value: string, label: string) => saveVocabulary({
    ...vocabulary,
    purposes: { ...vocabulary.purposes, [value]: label },
  });
  const updateRepresentationName = (value: string, label: string) => saveVocabulary({
    ...vocabulary,
    representations: { ...vocabulary.representations, [value]: label },
  });
  const togglePackingRepresentation = (value: string) => {
    const mode = value as SourceMode;
    const current = new Set(vocabulary.hiddenPackingRepresentations || []);
    if (current.has(mode)) current.delete(mode); else current.add(mode);
    const next = { ...vocabulary, hiddenPackingRepresentations: [...current] };
    saveVocabulary(next);
    if (sourceMode === mode && current.has(mode)) {
      const nextVisible = REPRESENTATIONS.packing.find(option => !current.has(option.value));
      if (nextVisible) setSourceMode(nextVisible.value);
    }
  };

  if (!ready) {
    return <div className="labelCreateApp app" style={themeVariables(theme) as CSSProperties}><main className="labelCreateRoute"><div className="panel">Loading label workspace…</div></main></div>;
  }

  const representationLabel = displayRepresentation(selectedRepresentation, vocabulary);

  if (started && selectedOrder) {
    return <div className="labelCreateApp app" data-label-source={sourceMode} style={themeVariables(theme) as CSSProperties}>
      <div className="surface">
        <header className="labelCreateTopbar"><img className={`labelCreateBrand logo-${businessId}`} src={logo} alt="Business logo"/></header>
        <DesignerSourceLock sourceMode={sourceMode} displayLabel={representationLabel}/>
        <LabelDesigner businessId={businessId} order={selectedOrder} initialPurpose={purpose} canManageSizes onBack={() => setStarted(false)} />
      </div>
    </div>;
  }

  return <div className="labelCreateApp app" style={themeVariables(theme) as CSSProperties}>
    <div className="surface">
      <header className="labelCreateTopbar"><img className={`labelCreateBrand logo-${businessId}`} src={logo} alt="Business logo"/></header>
      <main className="labelCreateRoute">
        <section className="labelCreateRouteHead">
          <div><p className="eyebrow">LABEL CREATION</p><h1>Create labels</h1><p>Choose the order, choose why the label is needed, then decide what one label represents.</p></div>
        </section>
        <section className="panel labelCreateOrderChoice">
          <label><span>1 · Order</span><select value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">Choose an order…</option>{orders.map(order => <option key={order.orderId} value={order.orderId}>{order.details.orderNo} — {order.details.clientName || "Unnamed client"}</option>)}</select></label>
          <div className="labelManagedField">
            <label><span>2 · Purpose</span><select value={purpose} disabled={!selectedOrder} onChange={event => changePurpose(event.target.value as LabelPurpose)}>{PURPOSE_OPTIONS.map(option => <option key={option.value} value={option.value}>{displayPurpose(option, vocabulary)}</option>)}</select></label>
            <button type="button" className="labelManageButton" onClick={() => setManage(manage === "purpose" ? null : "purpose")}>Manage</button>
            {manage === "purpose" && <ManagedNames title="purpose names" options={PURPOSE_OPTIONS} names={Object.fromEntries(PURPOSE_OPTIONS.map(option => [option.value, displayPurpose(option, vocabulary)]))} onName={updatePurposeName} onClose={() => setManage(null)}/>} 
          </div>
          <div className="labelManagedField">
            <label><span>3 · Label represents</span><select value={sourceMode} disabled={!selectedOrder} onChange={event => setSourceMode(event.target.value as SourceMode)}>{availableRepresentations.map(option => <option key={option.value} value={option.value}>{displayRepresentation(option, vocabulary)}</option>)}</select><small className="labelCreateFieldHelp">{selectedOrder ? selectedRepresentation.help : "Choose an order first."}</small></label>
            <button type="button" className="labelManageButton" disabled={!selectedOrder} onClick={() => setManage(manage === "representation" ? null : "representation")}>Manage</button>
            {manage === "representation" && <ManagedNames title={`${displayPurpose(PURPOSE_OPTIONS.find(option => option.value === purpose)!, vocabulary)} representation names`} options={REPRESENTATIONS[purpose]} names={Object.fromEntries(REPRESENTATIONS[purpose].map(option => [option.value, displayRepresentation(option, vocabulary)]))} onName={updateRepresentationName} removable={purpose === "packing"} hidden={vocabulary.hiddenPackingRepresentations || []} onToggleHidden={purpose === "packing" ? togglePackingRepresentation : undefined} onClose={() => setManage(null)}/>} 
          </div>
        </section>
        <div className="labelCreateRouteActions"><button className="primary" disabled={!selectedOrder} onClick={() => selectedOrder && setStarted(true)}>Continue to designer</button></div>
      </main>
    </div>
  </div>;
}
