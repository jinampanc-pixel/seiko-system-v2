"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  blankRequirementLine,
  blankVeynRequirement,
  listVeynRequirements,
  saveVeynRequirement,
  type VeynRequirement,
  type VeynRequirementEnvelope,
  type VeynRequirementStatus,
} from "./lib/veyn-requirements";

const STATUS_OPTIONS: VeynRequirementStatus[] = [
  "Draft",
  "Ready to quote",
  "Quoted",
  "Confirmed",
  "Part delivered",
  "Delivered",
  "Invoiced",
  "Closed",
];

export function VeynOrders({
  businessId,
  canCreate,
  canEdit,
  onOpenBilling,
}: {
  businessId: string;
  canCreate: boolean;
  canEdit: boolean;
  onOpenBilling: (orderId: string) => void;
}) {
  const [records, setRecords] = useState<VeynRequirementEnvelope[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ order: VeynRequirement; version: number | null } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRecords(await listVeynRequirements(businessId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Requirements could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records.filter(record => !record.order.archived);
    return records.filter(record => {
      if (record.order.archived) return false;
      const order = record.order;
      return [
        order.details.orderNo,
        order.details.institutionName,
        order.details.institutionType,
        order.details.contactPerson,
        order.details.reference,
        order.status,
        ...order.lines.map(line => `${line.description} ${line.specification}`),
      ].join(" ").toLowerCase().includes(needle);
    });
  }, [records, query]);

  const save = async () => {
    if (!editing) return;
    if (!editing.order.details.institutionName.trim()) {
      setError("Institution name is required.");
      return;
    }
    if (!editing.order.lines.some(line => line.description.trim() && line.quantity > 0)) {
      setError("Add at least one requirement line with a description and quantity.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveVeynRequirement(businessId, editing.order, editing.version);
      setEditing(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Requirement could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return <section className="page veynOrdersPage">
    <div className="veynPageHead">
      <div>
        <p className="eyebrow">ORDERS</p>
        <h1>Requirements</h1>
      </div>
      <button type="button" className="primary" disabled={!canCreate} onClick={() => setEditing({ order: blankVeynRequirement(), version: null })}>
        {canCreate ? "+ New requirement" : "No create access"}
      </button>
    </div>

    <div className="panel veynToolbar">
      <label className="veynSearch"><span>Search</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Institution, order no., item or reference"/></label>
      <button type="button" className="secondary" onClick={() => void load()}>Refresh</button>
    </div>

    {error && <div className="accessError" role="alert">{error}</div>}

    <div className="panel veynRegister">
      <div className="veynRegisterHead"><span>Requirement</span><span>Items</span><span>Status</span><span>Updated</span><span>Actions</span></div>
      {loading ? <div className="veynEmptyState">Loading requirements…</div> : visible.length === 0 ? <div className="veynEmptyState">No requirements yet.</div> : visible.map(record => {
        const order = record.order;
        return <div className="veynRegisterRow" key={order.orderId}>
          <div><strong>{order.details.orderNo}</strong><span>{order.details.institutionName}</span><small>{order.details.institutionType}{order.details.reference ? ` · ${order.details.reference}` : ""}</small></div>
          <div><strong>{order.lines.filter(line => line.description.trim()).length}</strong><small>{order.lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)} total qty</small></div>
          <div><span className="veynStatusBadge">{order.status}</span></div>
          <div><span>{record.updatedAt ? new Date(record.updatedAt).toLocaleDateString("en-IN") : "—"}</span><small>{record.updatedBy}</small></div>
          <div className="veynRowActions">
            <button type="button" className="secondary" onClick={() => setEditing({ order: structuredClone(order), version: record.version })}>{canEdit ? "Edit" : "View"}</button>
            <button type="button" className="secondary" onClick={() => onOpenBilling(order.orderId)}>Commercial</button>
          </div>
        </div>;
      })}
    </div>

    {editing && <RequirementEditor
      order={editing.order}
      readOnly={editing.version !== null && !canEdit}
      saving={saving}
      onChange={order => setEditing(current => current ? { ...current, order } : current)}
      onCancel={() => setEditing(null)}
      onSave={() => void save()}
    />}
  </section>;
}

function RequirementEditor({
  order,
  readOnly,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  order: VeynRequirement;
  readOnly: boolean;
  saving: boolean;
  onChange: (order: VeynRequirement) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const detail = <K extends keyof VeynRequirement["details"]>(key: K, value: VeynRequirement["details"][K]) => {
    onChange({ ...order, details: { ...order.details, [key]: value } });
  };

  const updateLine = (index: number, change: Partial<VeynRequirement["lines"][number]>) => {
    onChange({ ...order, lines: order.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...change } : line) });
  };

  return <div className="veynModalBackdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="veynEditor" role="dialog" aria-modal="true" aria-label="VÉYN requirement editor">
      <header className="veynEditorHead">
        <div><p className="eyebrow">{order.details.orderNo}</p><h2>{order.details.institutionName || "New requirement"}</h2></div>
        <button type="button" className="iconButton" onClick={onCancel} aria-label="Close">×</button>
      </header>

      <div className="veynEditorBody">
        <section className="veynFormSection">
          <h3>Institution</h3>
          <div className="veynFormGrid">
            <Field label="Institution name *" value={order.details.institutionName} disabled={readOnly} onChange={value => detail("institutionName", value)}/>
            <label><span>Institution type</span><select value={order.details.institutionType} disabled={readOnly} onChange={event => detail("institutionType", event.target.value)}><option>Hospital</option><option>CHC</option><option>PHC</option><option>UPHC</option><option>Diagnostic centre</option><option>Medical college</option><option>Other</option></select></label>
            <Field label="Contact person" value={order.details.contactPerson} disabled={readOnly} onChange={value => detail("contactPerson", value)}/>
            <Field label="Phone" value={order.details.phone} disabled={readOnly} onChange={value => detail("phone", value)}/>
            <Field label="Email" type="email" value={order.details.email} disabled={readOnly} onChange={value => detail("email", value)}/>
            <Field label="GSTIN" value={order.details.gstin} disabled={readOnly} onChange={value => detail("gstin", value)}/>
            <Field label="Reference / tender / enquiry" value={order.details.reference} disabled={readOnly} onChange={value => detail("reference", value)}/>
            <Field label="Required by" type="date" value={order.details.requiredBy} disabled={readOnly} onChange={value => detail("requiredBy", value)}/>
            <label><span>Status</span><select value={order.status} disabled={readOnly} onChange={event => onChange({ ...order, status: event.target.value as VeynRequirementStatus })}>{STATUS_OPTIONS.map(status => <option key={status}>{status}</option>)}</select></label>
          </div>
          <div className="veynAddressGrid">
            <label><span>Billing address</span><textarea rows={3} value={order.details.billTo} disabled={readOnly} onChange={event => detail("billTo", event.target.value)}/></label>
            <label><span>Delivery address</span><textarea rows={3} value={order.details.deliverTo} disabled={readOnly} onChange={event => detail("deliverTo", event.target.value)}/></label>
          </div>
        </section>

        <section className="veynFormSection">
          <div className="veynSectionHead"><h3>Products & services</h3>{!readOnly && <button type="button" className="secondary" onClick={() => onChange({ ...order, lines: [...order.lines, blankRequirementLine()] })}>+ Add line</button>}</div>
          <div className="veynLineTable">
            <div className="veynLineHead"><span>Description</span><span>Qty</span><span>Unit</span><span>Specification</span><span>Est. rate</span><span/></div>
            {order.lines.map((line, index) => <div className="veynLineRow" key={line.id}>
              <input aria-label={`Line ${index + 1} description`} value={line.description} disabled={readOnly} onChange={event => updateLine(index, { description: event.target.value })}/>
              <input aria-label={`Line ${index + 1} quantity`} type="number" min="0" step="0.001" value={line.quantity} disabled={readOnly} onChange={event => updateLine(index, { quantity: Number(event.target.value) })}/>
              <input aria-label={`Line ${index + 1} unit`} value={line.unit} disabled={readOnly} onChange={event => updateLine(index, { unit: event.target.value })}/>
              <input aria-label={`Line ${index + 1} specification`} value={line.specification} disabled={readOnly} onChange={event => updateLine(index, { specification: event.target.value })}/>
              <input aria-label={`Line ${index + 1} estimated rate`} type="number" min="0" step="0.01" value={line.estimatedRate} disabled={readOnly} onChange={event => updateLine(index, { estimatedRate: Number(event.target.value) })}/>
              {!readOnly && <button type="button" className="dangerText" disabled={order.lines.length === 1} onClick={() => onChange({ ...order, lines: order.lines.filter((_, lineIndex) => lineIndex !== index) })}>Remove</button>}
            </div>)}
          </div>
        </section>

        <section className="veynFormSection">
          <label><span>Remarks</span><textarea rows={3} value={order.details.remarks} disabled={readOnly} onChange={event => detail("remarks", event.target.value)}/></label>
        </section>
      </div>

      <footer className="veynEditorActions"><button type="button" className="secondary" onClick={onCancel}>{readOnly ? "Close" : "Cancel"}</button>{!readOnly && <button type="button" className="primary" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save requirement"}</button>}</footer>
    </section>
  </div>;
}

function Field({ label, value, type = "text", disabled, onChange }: { label: string; value: string; type?: string; disabled?: boolean; onChange: (value: string) => void }) {
  return <label><span>{label}</span><input type={type} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}/></label>;
}
