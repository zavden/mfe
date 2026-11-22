/* How long an MP4 says its sound lasts.
 *
 * An encoder begins with a lead-in: its first packet starts before zero (`encoding.ts`), and the
 * muxer writes an edit list that presents the media from zero on. The edit is counted in the
 * movie's clock, which is not the samples' (57 600 against 48 000 ticks a second: 1.2 a sample),
 * and the muxer gets it as the rounded span of the track plus the rounded start, two roundings
 * that can add up to 0.8 of a tick. A reader brings the edit back to samples by rounding it, and
 * 0.6 of a tick is already half a sample: for some lead-ins and lengths the file then presents a
 * sample more, or less, than the sound has (48 001 samples after the 2 112 of Apple's AAC encoder
 * read as 48 002; after the 1 024 of FFmpeg's they read right).
 *
 * The end of the last packet is ours to state, and only its rounded values reach the file. Stated
 * a fraction of a sample away from the true end, where it has to be, it makes the two roundings
 * land on the nearest tick, and the sample tables still say the true count. */

/** The clock of the movie in the MP4 files mediabunny writes (its `GLOBAL_TIMESCALE`). */
export const MP4_MOVIE_TIMESCALE = 57_600;

/** Leave the true end alone when it is at least this far, in ticks, inside what works. */
const MARGIN = 0.05;

/** The time, in seconds, to give as the end of the last packet of an MP4 audio track whose first
 * packet starts at `start` (zero, or negative: the encoder's lead-in), for the file to present
 * exactly `frames` samples. Always within half a sample of `frames / sampleRate`. */
export function mp4TrackEnd(start: number, frames: number, sampleRate = 48_000): number {
  const ticksPerSample = MP4_MOVIE_TIMESCALE / sampleRate;
  const trueEnd = frames * ticksPerSample; // in ticks, as everything below
  // A start at zero has no edit list: the durations come from the span alone. (One after zero,
  // which no encoder gives, gets an edit list of another form, and is left as it is.)
  if (start >= 0) return frames / sampleRate;
  const lead = start * MP4_MOVIE_TIMESCALE;
  // The muxer writes round(end − lead) + round(lead); it should be round(trueEnd). With
  // end = trueEnd + shift that holds while shift is in [off − 0.5, off + 0.5):
  const off = lead - Math.round(lead) + (Math.round(trueEnd) - trueEnd);
  // and the sample tables keep the true count while the end is within half a sample of it.
  const low = Math.max(off - 0.5, -ticksPerSample / 2);
  const high = Math.min(off + 0.5, ticksPerSample / 2);
  const shift = low < -MARGIN && high > MARGIN ? 0 : (low + high) / 2;
  return shift === 0 ? frames / sampleRate : (trueEnd + shift) / MP4_MOVIE_TIMESCALE;
}
