/** Conventional decoded speaker order. Mono duplicates, front L/R retain unity, centre and
 * same-side surrounds use -3 dB, back centre splits equally, and stereo excludes LFE. There
 * is no normalization: the shared peak meter reports sums above unity. */
export function stereoChannelWeights(channels: number, channel: number): readonly [number, number] {
  if (channels === 1) return [1, 1];
  if (channel === 0) return [1, 0];
  if (channel === 1) return [0, 1];
  if (channels === 4) return channel === 2 ? [Math.SQRT1_2, 0] : [0, Math.SQRT1_2];
  if (channel === 2) return [Math.SQRT1_2, Math.SQRT1_2];
  if (channels === 5) return channel === 3 ? [Math.SQRT1_2, 0] : [0, Math.SQRT1_2];
  if (channel === 3) return [0, 0];
  if (channels === 7) {
    if (channel === 4) return [0.5, 0.5];
    return channel === 5 ? [Math.SQRT1_2, 0] : [0, Math.SQRT1_2];
  }
  return channel % 2 === 0 ? [Math.SQRT1_2, 0] : [0, Math.SQRT1_2];
}
