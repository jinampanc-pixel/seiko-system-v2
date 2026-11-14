export type LabelCreationContext = { businessId: string; orderId?: string; purpose?: string };

/** One entry point keeps label creation in the current business and order context. */
export function openLabelCreation(context: LabelCreationContext) {
  window.dispatchEvent(new CustomEvent<LabelCreationContext>("jinam:create-labels", { detail: context }));
}
