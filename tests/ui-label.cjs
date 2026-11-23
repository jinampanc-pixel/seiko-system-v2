// Behavioral selectors ignore capitalization; copy-policy checks assert the displayed wording separately.
module.exports = function uiLabel(value, exact = false) {
  if (value instanceof RegExp) return new RegExp(value.source, value.flags.includes('i') ? value.flags : value.flags + 'i');
  if (typeof value !== 'string') return value;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(exact ? '^\\s*' + escaped.replace(/\s+/g, '\\s+') + '\\s*$' : escaped, 'i');
};
