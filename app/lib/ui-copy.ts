/** Human-readable enum labels only; never use this to change stored values or entered text. */
export function uiStatusLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b[a-z]/g, letter => letter.toUpperCase());
}
