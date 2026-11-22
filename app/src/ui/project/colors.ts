/* Colour helpers shared by the settings dialog and the Creator. */

/** `#RRGGBB` upper case from user input ("ff8800", "#F80", "#ff8800"), or null if invalid. */
export function normalizeColor(text: string): string | null {
  let value = text.trim();
  if (value.startsWith('#')) value = value.slice(1);
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    value = [...value].map((c) => c + c).join('');
  }
  return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toUpperCase()}` : null;
}

/** Manim's named colours (constants.colors), used as one-click choices. */
export const MANIM_COLORS: readonly { name: string; hex: string }[] = [
  { name: 'WHITE', hex: '#FFFFFF' },
  { name: 'GRAY', hex: '#888888' },
  { name: 'BLUE', hex: '#58C4DD' },
  { name: 'TEAL', hex: '#5CD0B3' },
  { name: 'GREEN', hex: '#83C167' },
  { name: 'YELLOW', hex: '#FFFF00' },
  { name: 'GOLD', hex: '#F0AC5F' },
  { name: 'ORANGE', hex: '#FF862F' },
  { name: 'RED', hex: '#FC6255' },
  { name: 'MAROON', hex: '#C55F73' },
  { name: 'PINK', hex: '#D147BD' },
  { name: 'PURPLE', hex: '#9A72AC' },
];
