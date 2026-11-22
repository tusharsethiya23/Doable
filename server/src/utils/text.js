// Small text helpers used for searching.

// Makes user input safe to use inside a RegExp (so "c++" or "(test)" don't break or inject patterns)
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Short excerpt around the first match, e.g. "…the demo moved to Friday at 4…"
export function snippetAround(text, query, before = 40, after = 80) {
  const flat = text.replace(/\s+/g, ' ');
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  if (at === -1) return flat.slice(0, before + after);
  const start = Math.max(0, at - before);
  const end = Math.min(flat.length, at + query.length + after);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}
