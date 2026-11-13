export function AssistantReview({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined || value === "") return <span>—</span>;
  if (typeof value !== "object") return <span>{String(value)}</span>;
  // Recipient conditions are leaf values even inside deeply nested garment rules.
  // Keep them visible before applying the generic payload depth limit.
  if (!Array.isArray(value) && Object.keys(value).length === 2 && "detail" in value && "values" in value && typeof value.detail === "string" && typeof value.values === "string") {
    return <span>{value.detail}: {value.values}</span>;
  }
  if (depth > 8) return <span>Expand the order in Seiko for further detail.</span>;
  if (Array.isArray(value)) return value.length ? <ul>{value.map((item, index) => <li key={index}><AssistantReview value={item} depth={depth + 1}/></li>)}</ul> : <span>None</span>;
  return <dl>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, s => s.toUpperCase())}</dt><dd><AssistantReview value={item} depth={depth + 1}/></dd></div>)}</dl>;
}
