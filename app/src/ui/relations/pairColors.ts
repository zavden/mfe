/* Colours that tell the pairs of a relation apart in the editor (identification only: they never
 * mean a state, and none is close to the UI accent, turquoise, so a pair never reads as
 * selected). */
export const PAIR_COLORS = [
  '#58C4DD',
  '#83C167',
  '#FC6255',
  '#E6C229',
  '#FF862F',
  '#9A72AC',
  '#C55F73',
  '#D147BD',
] as const;

export const pairColor = (index: number): string => PAIR_COLORS[index % PAIR_COLORS.length]!;
