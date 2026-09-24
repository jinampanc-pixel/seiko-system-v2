import { quantityForRecord, workspaceColumns, type SeikoOrder } from "./order-domain";

export type LabelBox = { x: number; y: number; w: number; h: number };
export const LABEL_WIDTH = 50;
export const LABEL_HEIGHT = 25;
export const MM_PX = 96 / 25.4;
export const bound = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
export function constrainBox<T extends LabelBox>(box: T): T {
  const w = bound(box.w, 1, LABEL_WIDTH), h = bound(box.h, 1, LABEL_HEIGHT);
  return { ...box, w, h, x: bound(box.x, 0, LABEL_WIDTH - w), y: bound(box.y, 0, LABEL_HEIGHT - h) };
}
export function moveBox<T extends LabelBox>(box: T, dx: number, dy: number, snap = true): T {
  return constrainBox({ ...box, x: snap ? Math.round(box.x + dx) : box.x + dx, y: snap ? Math.round(box.y + dy) : box.y + dy });
}
export function resizeBox<T extends LabelBox>(box: T, dx: number, dy: number, snap = true): T {
  return { ...box, w: bound(snap ? Math.round(box.w + dx) : box.w + dx, 1, LABEL_WIDTH - box.x), h: bound(snap ? Math.round(box.h + dy) : box.h + dy, 1, LABEL_HEIGHT - box.y) };
}
export const outsideSafeArea = (box: LabelBox) => box.x < 1 || box.y < 1 || box.x + box.w > 49 || box.y + box.h > 24;

// Opposite edges stay anchored. Text and its box share this geometry.
export function stretchTextBox<T extends LabelBox & { font: number }>(box: T, edge: string, dx: number, dy: number): T {
  let left = box.x, right = box.x + box.w, top = box.y, bottom = box.y + box.h;
  if (edge.includes("w")) left = bound(left + dx, 0, right - 1);
  if (edge.includes("e")) right = bound(right + dx, left + 1, LABEL_WIDTH);
  if (edge.includes("n")) top = bound(top + dy, 0, bottom - 1);
  if (edge.includes("s")) bottom = bound(bottom + dy, top + 1, LABEL_HEIGHT);
  return { ...box, x: left, y: top, w: right - left, h: bottom - top, font: box.font * (bottom - top) / box.h };
}
export function scaleTextBox<T extends LabelBox & { font: number }>(box: T, factor: number): T {
  const scale = bound(factor, Math.max(1 / box.w, 1 / box.h), Math.min((LABEL_WIDTH - box.x) / box.w, (LABEL_HEIGHT - box.y) / box.h));
  return { ...box, w: box.w * scale, h: box.h * scale, font: box.font * scale };
}

// Resolve once per order, independently of presentation choices. Avoid rescanning
// the complete order for each product of each person on every pointer movement.
export function packingQuantities(order: SeikoOrder) {
  const present = (value: unknown) => value != null && String(value).trim() !== "";
  const columns = workspaceColumns(order);
  const evidence = new Map(order.products.map(product => {
    const ids = columns.filter(column => column.groupId === `product:${product.id}` && /^(measurement:|spec:)/.test(column.id)).map(column => column.id);
    return [product.id, { ids, used: order.records.some(record => ids.some(id => present(record.values[id]))) }];
  }));
  return new Map(order.records.filter(record => !record.held).map((record, index) => [record.recordId, Object.fromEntries(order.products.map(product => {
    const qty = quantityForRecord(product, record, index === 0);
    const explicit = [`product:${product.id}:qty_override`, `product:${product.id}:qty`].some(id => present(record.values[id]));
    const info = evidence.get(product.id)!;
    const applies = explicit || !info.used || info.ids.some(id => present(record.values[id]));
    return [product.id, applies && Number.isFinite(qty) && qty > 0 ? qty : 0];
  }))]));
}
export function eligiblePackingIds(quantities: Map<string, Record<string, number>>, products: string[], matchMode: "all" | "any" = "all"): string[] {
  if (!products.length) return [];
  return [...quantities].filter(([, values]) => (matchMode === "any" ? products.some(id => values[id] > 0) : products.every(id => values[id] > 0))).map(([id]) => id);
}

export function measureLabelText(text: string, preferredPt: number, widthMm: number, heightMm: number, measure: (line: string, pt: number) => number) {
  const lines = text.split("\n");
  let font = bound(preferredPt, 1, 40);
  const fits = (pt: number) => lines.every(line => measure(line, pt) <= widthMm * MM_PX) && lines.length * pt * 96 / 72 * 1.08 <= heightMm * MM_PX;
  while (font > 1 && !fits(font)) font = Math.max(1, font - .25);
  return { lines, font, overflow: !fits(font), small: font < 4 };
}
