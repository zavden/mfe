/* The step a corner drag's scale snaps to (`handles.ts`, `snappedScale`), as the Preferences menu
 * offers it: four presets, or any number or fraction the user types ("1/3", "0.3/0.2", "0,15").
 * The preference keeps the text the user chose, so that the menu shows it back as typed;
 * `parseScaleStep` gives its value. Pure. */

/** The presets of the menu; the first one is the default. */
export const SCALE_STEPS = ['0.05', '0.1', '0.15', '0.2'] as const;
export const DEFAULT_SCALE_STEP = '0.05';

/** What a custom step may be: finer than 0.01 would be below what the readout shows; above 2 a
 * formula could hardly be scaled at all (the first step is the smallest scale). */
export const SCALE_STEP_RANGE = { min: 0.01, max: 2 };

const NUMBER = String.raw`(\d+(?:[.,]\d*)?|[.,]\d+)`;
const STEP_TEXT = new RegExp(`^\\s*${NUMBER}\\s*(?:/\\s*${NUMBER}\\s*)?$`);
/** A plain decimal with a dot (or none): its value needs no restating. */
const PLAIN = /^\s*(\d+(?:\.\d*)?|\.\d+)\s*$/;

/** The value of a text as typed — a number, or a fraction of two numbers, with a dot or a comma
 * for the decimals and spaces allowed — or null when the text is not one (the standard scale of
 * new objects, `creator/standardScale.ts`, reads its values the same way). */
export function parseNumberOrFraction(text: string): number | null {
  const m = STEP_TEXT.exec(text);
  if (!m) return null;
  const num = (s: string) => Number(s.replace(',', '.'));
  const value = m[2] === undefined ? num(m[1]!) : num(m[1]!) / num(m[2]!);
  return Number.isFinite(value) ? value : null;
}

/** The value of a step as typed, or null when the text is not a number or a fraction, or the
 * value is outside `SCALE_STEP_RANGE`. */
export function parseScaleStep(text: string): number | null {
  const value = parseNumberOrFraction(text);
  if (value === null) return null;
  if (value < SCALE_STEP_RANGE.min - 1e-12 || value > SCALE_STEP_RANGE.max + 1e-12) return null;
  return value;
}

export function isScaleStepText(x: unknown): x is string {
  return typeof x === 'string' && parseScaleStep(x) !== null;
}

/** The value, rounded to four decimals, as a short string ("0.3333", "1.5"). */
export function scaleStepValueText(value: number): string {
  return String(+value.toFixed(4));
}

/** The step as chosen, with its value after it when the text does not say it plainly: "0.2",
 * "1/3 = 0.3333", "0,15 = 0.15". Text that is not a step comes back as it is. */
export function formatScaleStep(text: string): string {
  const value = parseScaleStep(text);
  if (value === null) return text;
  return PLAIN.test(text) ? text.trim() : `${text.trim()} = ${scaleStepValueText(value)}`;
}
