"use client";
import { useState, type ReactNode } from 'react';
import { ruleSourceFields, type ProductPolicy, type SeikoOrder } from './lib/order-domain';
import { recipientChoices, setProductRecipient, simpleRecipient } from './lib/product-recipients';
import { RuleConditions } from './rule-conditions';
import { TrashIcon } from './ui-icons';

export function ProductQuantitySetup({ order, product, onChange, nameControl, removeControl }: {
  order: SeikoOrder; product: ProductPolicy; onChange: (product: ProductPolicy) => void;
  nameControl: ReactNode; removeControl: ReactNode;
}) {
  const [showRules, setShowRules] = useState(false);
  const choices = recipientChoices(order.fields), simple = simpleRecipient(product, choices);
  const advanced = showRules || !simple;
  return <>
    <div className="productPolicyTop" data-react-quantity="true">
      {nameControl}
      <label><span>Who receives it?</span><select aria-label="Who receives it?" value={advanced ? 'rules' : simple.key} onChange={event => {
        const key = event.target.value;
        if (key === 'rules') { setShowRules(true); return; }
        const choice = choices.find(item => item.key === key) || null;
        onChange(setProductRecipient(product, choice, simple?.quantity ?? (product.defaultQuantity || 1)));
        setShowRules(false);
      }}>
        <option value="everyone">Everyone</option>
        {choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
        <option value="rules">Other rules…</option>
      </select></label>
      {advanced ? <label><span>{product.quantityMode === 'order_total' ? 'Order total' : product.quantityMode === 'per_person' ? 'Quantity' : 'Default qty'}</span>{product.quantityMode === 'per_person' ? <span>Per entry</span> : <input aria-label={product.quantityMode === 'order_total' ? 'Order total' : 'Default qty'} type="number" min="0" value={product.quantityMode === 'order_total' ? product.orderTotal : product.defaultQuantity} onChange={event => onChange(product.quantityMode === 'order_total' ? { ...product, orderTotal: Number(event.target.value) } : { ...product, defaultQuantity: Number(event.target.value) })}/>}</label> : <label><span>Quantity each</span><input aria-label="Quantity each" type="number" min="0" step="1" value={simple.quantity} onChange={event => onChange(setProductRecipient(product, choices.find(choice => choice.key === simple.key) || null, Number(event.target.value)))}/></label>}
      {removeControl}
    </div>
    {advanced && <div className="productQuantityRules">
      <label><span>Quantity</span><select aria-label="Quantity rule" value={product.quantityMode} onChange={event => onChange({ ...product, quantityMode: event.target.value as ProductPolicy['quantityMode'] })}>
        <option value="same_for_all">Same quantity for everyone</option><option value="by_group">Different quantity by group</option><option value="per_person">Enter for each person</option><option value="default_with_exceptions">Same normally; allow changes</option><option value="order_total">One total quantity</option>
      </select></label>
      {product.quantityMode === 'by_group' && <details className="groupRules quantityGroupRules" open><summary>Set quantities by group</summary>
        {(product.quantityGroupRules || []).map((rule, index) => <div key={index}>
          <RuleConditions fields={ruleSourceFields(order)} rule={rule} legacyFieldId={product.quantityGroupFieldId} onChange={patch => onChange({ ...product, quantityGroupRules: product.quantityGroupRules.map((item, i) => i === index ? { ...item, ...patch } : item) })}/>
          <input aria-label="Group quantity" type="number" min="0" placeholder="Quantity" value={rule.quantity ?? ''} onChange={event => onChange({ ...product, quantityGroupRules: product.quantityGroupRules.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item) })}/>
          <button type="button" className="iconRemove" aria-label="Remove quantity rule" onClick={() => onChange({ ...product, quantityGroupRules: product.quantityGroupRules.filter((_, i) => i !== index) })}><TrashIcon/></button>
        </div>)}
        <button type="button" className="secondary" onClick={() => onChange({ ...product, quantityGroupRules: [...(product.quantityGroupRules || []), { match: '', quantity: product.defaultQuantity ?? 1 }] })}>+ Add group quantity</button>
      </details>}
    </div>}
  </>;
}
