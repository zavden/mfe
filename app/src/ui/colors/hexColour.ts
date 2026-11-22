/* A colour typed by hand, as hexadecimal: what the colour sections of the context menus take
 * beside their swatches (`HexColourField.tsx`). Pure. */

/** The colour `text` writes, as the project keeps colours (`#RRGGBB`, upper case): six
 * hexadecimal digits, or three (`#abc` is `#AABBCC`), with or without the `#` and with spaces
 * around; null for anything else. */
export function parseHexColour(text: string): string | null {
  const digits = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim())?.[1];
  if (!digits) return null;
  const six = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
  return `#${six.toUpperCase()}`;
}
