"use client";
import { useId, useState, type ReactNode } from 'react';
import { ruleSourceFields, type ProductPolicy, type SeikoOrder } from './lib/order-domain';
import { recipientChoices } from './lib/product-recipients';
import { RuleConditions } from './rule-conditions';
import { TrashIcon } from './ui-icons';

export function ProductQuantitySetup({ order, product, onChange, nameControl, removeControl }: {
  order: SeikoOrder; product: ProductPolicy; onChange: (product: ProductPolicy) => void;
  nameControl: ReactNode; removeControl: ReactNode;
}) {
  const [showRules, setShowRules] = useState(false), listId = useId();
  const fields = order.fields.filter(f => f.name.trim()), choices = recipientChoices(fields);
  const conditions = product.recipientWhen?.conditions || [];
  const single = conditions.length === 1 ? fields.find(f => f.id === conditions[0].fieldId) : undefined;
  const quick = single && choices.find(c => c.fieldId === single.id && c.value === conditions[0].match);
  const recipient = !product.recipientWhen ? 'everyone' : single ? quick?.key || 'field:' + single.id : 'rules';
  const advanced = showRules || product.quantityMode !== 'same_for_all';
  return <>
    <div className="productPolicyTop" data-react-quantity="true">
      {nameControl}
      <label><span>Who receives it?</span><select aria-label="Who receives it?" value={recipient} onChange={event => {
        const key = event.target.value;
        if (key === 'everyone') { onChange({ ...product, recipientWhen: undefined }); return; }
        if (key === 'rules') { onChange({ ...product, recipientWhen: { ...product.recipientWhen, conditions: [...conditions, { fieldId: '', match: '' }], conditionMode: product.recipientWhen?.conditionMode || 'all' } }); return; }
        const choice = choices.find(item => item.key === key), fieldId = choice?.fieldId || key.slice(6);
        if (!fields.some(f => f.id === fieldId)) return;
        onChange({ ...product, recipientWhen: { conditionMode: 'all', conditions: [{ fieldId, match: choice?.value || (single?.id === fieldId ? conditions[0].match : '') }] } });
      }}>
        <option value="everyone">Everyone</option>
        {fields.map(field => <option key={field.id} value={'field:' + field.id}>By {field.name}…</option>)}
        {choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
        <option value="rules">Multiple conditions…</option>
      </select></label>
      {advanced ? <label><span>{product.quantityMode === 'order_total' ? 'Order total' : product.quantityMode === 'per_person' ? 'Quantity' : 'Default qty'}</span>{product.quantityMode === 'per_person' ? <span>Per entry</span> : <input aria-label={product.quantityMode === 'order_total' ? 'Order total' : 'Default qty'} type="number" min="0" value={product.quantityMode === 'order_total' ? product.orderTotal : product.defaultQuantity} onChange={event => onChange(product.quantityMode === 'order_total' ? { ...product, orderTotal: Number(event.target.value) } : { ...product, defaultQuantity: Number(event.target.value) })}/>}</label> : <label><span>Quantity each</span><input aria-label="Quantity each" type="number" min="0" step="1" value={product.defaultQuantity} onChange={event => onChange({ ...product, defaultQuantity: Number(event.target.value) })}/></label>}
      {removeControl}
    </div>
    {product.recipientWhen && <div className="productRecipientRules">
      {single ? <label><span>{single.name} values</span><input aria-label="Recipient matching values" list={listId} placeholder="Value, list or range" value={conditions[0].match} onChange={event => onChange({ ...product, recipientWhen: { ...product.recipientWhen, conditions: [{ fieldId: single.id, match: event.target.value }] } })}/><datalist id={listId}>{single.options.map(value => <option key={value} value={value}/>)}</datalist></label> : <RuleConditions fields={fields} rule={product.recipientWhen} onChange={recipientWhen => onChange({ ...product, recipientWhen })}/>}
      <p>Only matching people receive this product. Use the values entered in Person details; commas and ranges are supported.</p>
    </div>}
    {product.quantityMode === "same_for_all" && <button type="button" className="textButton productQuantityOptions" aria-expanded={advanced} onClick={() => setShowRules(value => !value)}>Quantity options</button>}
    {advanced && <div className="productQuantityRules">
      <label><span>Quantity</span><select aria-label="Quantity rule" value={product.quantityMode} onChange={event => onChange({ ...product, quantityMode: event.target.value as ProductPolicy['quantityMode'] })}>
        <option value="same_for_all">Same quantity for recipients</option><option value="by_group">Different quantity by group</option><option value="per_person">Enter for each person</option><option value="default_with_exceptions">Same normally; allow changes</option><option value="order_total">One total quantity</option>
      </select></label>
      {product.quantityMode === 'by_group' && <details className="groupRules quantityGroupRules" open><summary>Set quantities by group</summary>
        <p>Outside these quantity groups: {product.defaultQuantity} each. Recipient conditions above still apply.</p>
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
