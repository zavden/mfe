/* JSON for a file a person or an agent reads and edits: what fits on a line stays on one line —
 * `"position": [0, 1.5]`, a glyph of a snapshot, a pair of a relation — and what does not is opened
 * one member per line. So the lines are short (a tool that reads a file by pages of lines can read
 * it) and the file is a fraction of what one member per line would make it. It is JSON all the
 * same: `JSON.parse` reads it back. Pure. */

/** `value` on one line, with a space after each comma and colon; undefined members left out. */
export function compactJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => compactJson(item === undefined ? null : item)).join(', ')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const members = Object.entries(value)
      .filter(([, member]) => member !== undefined)
      .map(([key, member]) => `${JSON.stringify(key)}: ${compactJson(member)}`);
    return members.length === 0 ? '{}' : `{ ${members.join(', ')} }`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** `value` as readable JSON: on one line when that fits in `width` columns after `used` (what
 * the line holds before it: its indent, its key), opened otherwise. */
export function readableJson(
  value: unknown,
  width = 100,
  indent = '',
  used = indent.length,
): string {
  const compact = compactJson(value);
  if (typeof value !== 'object' || value === null) return compact;
  // Room for the comma that follows a member.
  if (used + compact.length + 1 <= width) return compact;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map(
      (item) => inner + readableJson(item === undefined ? null : item, width, inner),
    );
    return `[\n${items.join(',\n')}\n${indent}]`;
  }
  const members = Object.entries(value)
    .filter(([, member]) => member !== undefined)
    .map(([key, member]) => {
      const head = `${inner}${JSON.stringify(key)}: `;
      return head + readableJson(member, width, inner, head.length);
    });
  if (members.length === 0) return '{}';
  return `{\n${members.join(',\n')}\n${indent}}`;
}
