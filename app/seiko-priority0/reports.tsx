"use client";

import { useMemo, useState } from "react";
import { quantityForRecord, type OrderField, type ProductPolicy, type SeikoOrder } from "../lib/order-domain";
import { activeProducts, displayOrder, type ReportFilter } from "./model";

type ReportPreset = {
  id: string;
  name: string;
  orderId: string;
  title: string;
  filters: ReportFilter[];
  productIds: string[];
};

const PRESET_KEY = "jinam:seiko:reports:presets:v1";

function readPresets(): ReportPreset[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(PRESET_KEY) || "[]") as ReportPreset[]; }
  catch { return []; }
}

function firstPersonField(order: SeikoOrder) { return order.fields[0]; }
function fieldValue(order: SeikoOrder, record: SeikoOrder["records"][number], field?: OrderField) {
  if (!field) return record.personId;
  return String(record.values[`field:${field.id}`] ?? "").trim() || record.personId;
}
function uniqueValues(order: SeikoOrder | null, fieldId: string) {
  if (!order || !fieldId) return [];
  return [...new Set(order.records.map(record => String(record.values[`field:${fieldId}`] ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
function personQuantity(order: SeikoOrder, product: ProductPolicy, record: SeikoOrder["records"][number]) {
  return quantityForRecord(product, record, order.records[0]?.recordId === record.recordId);
}
function newFilter(): ReportFilter { return { id: crypto.randomUUID(), fieldId: "", value: "" }; }
function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

export function SeikoReportsCenter({ orders }: { orders: SeikoOrder[] }) {
  const initialOrder = orders[0] || null;
  const [orderId, setOrderId] = useState(initialOrder?.orderId || "");
  const order = orders.find(item => item.orderId === orderId) || initialOrder;
  const [filters, setFilters] = useState<ReportFilter[]>([newFilter()]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>(() => initialOrder ? activeProducts(initialOrder).map(product => product.id) : []);
  const [title, setTitle] = useState("Class-wise uniform report");
  const [presets, setPresets] = useState<ReportPreset[]>(readPresets);
  const [presetName, setPresetName] = useState("");

  const changeOrder = (nextOrderId: string) => {
    const nextOrder = orders.find(item => item.orderId === nextOrderId) || null;
    setOrderId(nextOrderId);
    setFilters([newFilter()]);
    setSelectedProducts(nextOrder ? activeProducts(nextOrder).map(product => product.id) : []);
  };

  const filteredRecords = useMemo(() => {
    if (!order) return [];
    return order.records.filter(record => filters.every(filter => {
      if (!filter.fieldId || !filter.value) return true;
      return String(record.values[`field:${filter.fieldId}`] ?? "").trim() === filter.value;
    }));
  }, [filters, order]);

  const products = order ? activeProducts(order).filter(product => selectedProducts.includes(product.id)) : [];
  const personField = order ? firstPersonField(order) : undefined;
  const summary = order ? products.map(product => ({ product, qty: filteredRecords.reduce((sum, record) => sum + personQuantity(order, product, record), 0) })) : [];
  const activeFilters = filters.filter(filter => filter.fieldId && filter.value);
  const filterSummary = activeFilters.map(filter => {
    const field = order?.fields.find(item => item.id === filter.fieldId);
    return `${field?.name || "Field"}: ${filter.value}`;
  }).join(" · ");
  const orderTotalWarnings = products.filter(product => product.quantityMode === "order_total");

  const updateFilter = (id: string, change: Partial<ReportFilter>) => setFilters(current => current.map(filter => filter.id === id ? { ...filter, ...change } : filter));
  const removeFilter = (id: string) => setFilters(current => current.length === 1 ? [newFilter()] : current.filter(filter => filter.id !== id));

  const savePreset = () => {
    if (!order || !presetName.trim()) return;
    const preset: ReportPreset = { id: crypto.randomUUID(), name: presetName.trim(), orderId: order.orderId, title, filters, productIds: selectedProducts };
    const next = [...presets, preset];
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    setPresetName("");
  };

  const loadPreset = (id: string) => {
    const preset = presets.find(item => item.id === id);
    if (!preset) return;
    setOrderId(preset.orderId);
    setTitle(preset.title);
    setFilters(preset.filters.length ? preset.filters : [newFilter()]);
    setSelectedProducts(preset.productIds);
  };

  const exportCsv = () => {
    if (!order) return;
    const header = [personField?.name || "Person", ...products.map(product => product.name), "Total quantity"];
    const rows = filteredRecords.map(record => {
      const quantities = products.map(product => personQuantity(order, product, record));
      return [fieldValue(order, record, personField), ...quantities, quantities.reduce((sum, qty) => sum + qty, 0)];
    });
    const data = [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${order.details.orderNo}-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <section className="seikoP0Page">
    <div className="seikoP0Heading"><div><p className="eyebrow">REPORTS & PDF</p><h1>Order report builder</h1><p>Filter by order-defined fields, choose the products to report, verify totals, then print/save as PDF or export CSV.</p></div></div>
    {!order ? <div className="seikoP0Panel seikoP0Empty"><b>No order is available for reporting.</b><span>Create an order first.</span></div> : <div className="seikoP0TwoCol">
      <section className="seikoP0Panel seikoP0Controls seikoP0NoPrint">
        <label><span>Order</span><select value={order.orderId} onChange={event => changeOrder(event.target.value)}>{orders.map(item => <option key={item.orderId} value={item.orderId}>{displayOrder(item)}</option>)}</select></label>
        <label><span>Report title</span><input value={title} onChange={event => setTitle(event.target.value)}/></label>

        <div className="seikoP0ControlSection">
          <div className="seikoP0ControlSectionHead"><strong>People / record filters</strong><button type="button" className="secondary" onClick={() => setFilters(current => [...current, newFilter()])}>+ Add filter</button></div>
          {filters.map(filter => <div className="seikoP0FilterRow" key={filter.id}>
            <select aria-label="Filter field" value={filter.fieldId} onChange={event => updateFilter(filter.id, { fieldId: event.target.value, value: "" })}><option value="">Any field</option>{order.fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select>
            <select aria-label="Filter value" value={filter.value} disabled={!filter.fieldId} onChange={event => updateFilter(filter.id, { value: event.target.value })}><option value="">All values</option>{uniqueValues(order, filter.fieldId).map(value => <option key={value} value={value}>{value}</option>)}</select>
            <button type="button" className="seikoP0IconButton" onClick={() => removeFilter(filter.id)} aria-label="Remove report filter">×</button>
          </div>)}
        </div>

        <fieldset>
          <legend>Products included</legend>
          <div className="seikoP0InlineActions"><button type="button" className="secondary" onClick={() => setSelectedProducts(activeProducts(order).map(product => product.id))}>Select all</button><button type="button" className="secondary" onClick={() => setSelectedProducts([])}>Clear</button></div>
          {activeProducts(order).map(product => <label className="seikoP0Check" key={product.id}><input type="checkbox" checked={selectedProducts.includes(product.id)} onChange={event => setSelectedProducts(current => event.target.checked ? [...new Set([...current, product.id])] : current.filter(id => id !== product.id))}/><span>{product.name}</span></label>)}
        </fieldset>

        {orderTotalWarnings.length > 0 && <p className="seikoP0Notice">Order-total products are not person-allocated. Person-wise filtered reports will not infer a distribution that is absent from the order.</p>}

        <div className="seikoP0ControlSection">
          <strong>Save this report setup</strong>
          <div className="seikoP0PresetRow"><input value={presetName} onChange={event => setPresetName(event.target.value)} placeholder="Preset name"/><button type="button" onClick={savePreset} disabled={!presetName.trim()}>Save preset</button></div>
          {presets.length > 0 && <select defaultValue="" onChange={event => { loadPreset(event.target.value); event.currentTarget.value = ""; }}><option value="" disabled>Load saved preset…</option>{presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select>}
        </div>

        <div className="seikoP0Actions"><button type="button" onClick={() => window.print()}>Print / Save PDF</button><button type="button" className="secondary" onClick={exportCsv}>Export CSV</button></div>
      </section>

      <section className="seikoP0Panel seikoP0Printable">
        <div className="seikoP0DocHead"><div><h2>{title}</h2><p>{order.details.orderNo} · {order.details.clientName}</p>{filterSummary && <small>{filterSummary}</small>}</div><img src="/brands/seiko-logo-transparent.png" alt="SEIKO"/></div>
        <div className="seikoP0ReportMeta"><strong>{filteredRecords.length} people/records</strong><span>Ordered / planned quantities</span></div>
        {!products.length ? <div className="seikoP0Empty"><b>No products selected.</b><span>Select at least one product to build the report.</span></div> : <div className="seikoP0TableWrap"><table className="seikoP0Table"><thead><tr><th>{personField?.name || "Person"}</th>{products.map(product => <th key={product.id}>{product.name}</th>)}<th>Total</th></tr></thead><tbody>{filteredRecords.map(record => {
          const quantities = products.map(product => personQuantity(order, product, record));
          return <tr key={record.recordId}><td>{fieldValue(order, record, personField)}</td>{quantities.map((qty, index) => <td key={products[index].id}>{qty || "—"}</td>)}<td>{quantities.reduce((sum, qty) => sum + qty, 0)}</td></tr>;
        })}</tbody><tfoot><tr><th>Totals</th>{summary.map(item => <th key={item.product.id}>{item.qty}</th>)}<th>{summary.reduce((sum, item) => sum + item.qty, 0)}</th></tr></tfoot></table></div>}
      </section>
    </div>}
  </section>;
}
