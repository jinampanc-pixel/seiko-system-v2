import { workspaceColumns, type SeikoOrder } from "./order-domain";

/** A read-only label schema. Output checks and audit events always use the original sources. */
export function labelSources(input: SeikoOrder[]) {
  const sources = [...new Map(input.map(order => [order.orderId, order])).values()];
  if (!sources.length) throw new Error("Choose at least one source order.");
  const multiple = sources.length > 1;
  const scoped = (order: SeikoOrder, id: string) => multiple ? `${encodeURIComponent(order.orderId)}~${id}` : id;
  const fields = new Map<string, SeikoOrder["fields"][number]>();
  const fieldIds = new Map<string, string>();
  for (const source of sources) for (const field of source.fields) {
    const name = `${field.name.trim().toLowerCase()}|${field.type}`;
    if (!fields.has(name)) fields.set(name, { ...field, id: scoped(source,field.id), options: [...(field.options || [])] });
    const target = fields.get(name)!;
    target.options = [...new Set([...target.options, ...(field.options || [])])];
    fieldIds.set(`${source.orderId}\n${field.id}`, target.id);
  }
  const fieldId = (source: SeikoOrder, id: string) => fieldIds.get(`${source.orderId}\n${id}`) || id;
  const productId = scoped, measurementId = scoped, specificationId = scoped;
  const maps = new Map(sources.map(source => {
    const keys = new Map<string,string>();
    for (const field of source.fields) {
      keys.set(`field:${field.id}`, `field:${fieldId(source, field.id)}`);
      keys.set(`trace_field:${field.id}`, `trace_field:${fieldId(source, field.id)}`);
    }
    for (const product of source.products) {
      for (const suffix of ["qty", "qty_override", "assigned_qty"]) keys.set(`product:${product.id}:${suffix}`, `product:${productId(source,product.id)}:${suffix}`);
      for (const prefix of ["product_name", "product_quantity"]) keys.set(`${prefix}:${product.id}`, `${prefix}:${productId(source,product.id)}`);
      for (const spec of product.specifications) keys.set(`spec:${spec.id}`, `spec:${specificationId(source,spec.id)}`);
    }
    for (const measurement of source.measurements) {
      keys.set(`measurement:${measurement.id}:shared`, `measurement:${measurementId(source,measurement.id)}:shared`);
      for (const id of measurement.appliesTo) keys.set(`measurement:${measurement.id}:product:${id}`, `measurement:${measurementId(source,measurement.id)}:product:${productId(source,id)}`);
    }
    return [source.orderId, keys];
  }));
  function values<T extends string | number>(source: SeikoOrder, original: Record<string,T>) {
    const keys = maps.get(source.orderId)!;
    return Object.fromEntries(Object.entries(original).map(([key,value]) => [key.startsWith("field_name:") ? `field_name:${keys.get(key.slice(11)) || key.slice(11)}` : keys.get(key) || key, value])) as Record<string,T>;
  }
  const schema: SeikoOrder = multiple ? {
    ...sources[0], googleSheet: undefined, commerce: undefined,
    details: { ...sources[0].details, orderNo: `${sources.length} orders`, clientName: `${sources.length} selected orders` },
    fields: [...fields.values()],
    products: sources.flatMap(source => source.products.map(product => ({ ...product, id: productId(source,product.id), specifications: product.specifications.map(spec => ({ ...spec, id: specificationId(source,spec.id) })) }))),
    measurements: sources.flatMap(source => source.measurements.map(measurement => ({ ...measurement, id: measurementId(source,measurement.id), appliesTo: measurement.appliesTo.map(id => productId(source,id)) }))),
    records: sources.flatMap(source => source.records.map(record => ({ ...record, recordId: scoped(source,record.recordId), values: values(source,record.values) }))),
  } : sources[0];
  return { schema, sources, multiple, scoped, fieldId, productId, measurementId, specificationId, values,
    columns: sources.flatMap(source => workspaceColumns(source).map(column => ({ ...column, id: maps.get(source.orderId)!.get(column.id) || column.id }))),
  };
}
