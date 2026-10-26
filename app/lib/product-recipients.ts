import { ruleConditions, type OrderField, type ProductPolicy } from './order-domain';

export type RecipientChoice = { key: string; fieldId: string; value: string; label: string };

/** A presentation of existing quantity rules, not a second assignment model. */
export function recipientChoices(fields: OrderField[]): RecipientChoice[] {
  return fields.flatMap(field => (field.options || []).filter(value => value.trim()).map(value => ({
    key: JSON.stringify([field.id, value]), fieldId: field.id, value, label: `${field.name}: ${value}`,
  })));
}

export function simpleRecipient(product: ProductPolicy, choices: RecipientChoice[]) {
  if (product.quantityMode === 'same_for_all') return { key: 'everyone', label: 'Everyone', quantity: product.defaultQuantity };
  if (product.quantityMode !== 'by_group' || product.defaultQuantity !== 0 || product.quantityGroupRules?.length !== 1) return null;
  const rule = product.quantityGroupRules[0], conditions = ruleConditions(rule, product.quantityGroupFieldId);
  if (conditions.length !== 1) return null;
  const condition = conditions[0];
  const choice = choices.find(item => item.fieldId === condition.fieldId.replace(/^field:/, '') && item.value.trim().toLowerCase() === condition.match.trim().toLowerCase());
  return choice ? { key: choice.key, label: choice.label, quantity: rule.quantity } : null;
}

export function setProductRecipient(product: ProductPolicy, choice: RecipientChoice | null, quantity: number): ProductPolicy {
  return { ...product, quantityMode: choice ? 'by_group' : 'same_for_all', defaultQuantity: choice ? 0 : quantity,
    quantityGroupFieldId: undefined,
    quantityGroupRules: choice ? [{ match: choice.value, quantity, conditionMode: 'all', conditions: [{ fieldId: choice.fieldId, match: choice.value }] }] : [],
  };
}
