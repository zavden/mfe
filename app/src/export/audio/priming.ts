/* The silence an AAC stream needs before its sound.
 *
 * An AAC frame codes 1 024 samples with a window twice as long: a decoder gives each block of
 * 1 024 samples from two overlapping frames, the one before and its own. The first block of a
 * stream has no frame before it and does not decode to what was coded. It is the encoder's
 * priming, which the edit list of the MP4 leaves out (`mp4Timing.ts`): an encoder starts its
 * stream that much before the sound or more (the 1 024 samples of FFmpeg's, the 2 112 of Apple's,
 * the one of Chrome on a Mac), and the timestamp of its first packet says so, before zero
 * (`encoding.ts`). Chrome on Windows encodes AAC through Media Foundation, which starts the stream
 * with the sound: its first packet starts at zero, and the first 640 or so samples of a sound
 * decode as silence that then rises to it. Such an encoder is given the silence it lacks before the
 * sound, and its first packet then starts before zero like any other's. */

/** The samples an AAC frame codes (AAC-LC, the AAC the app encodes). */
export const AAC_FRAME_SAMPLES = 1024;

/** How many samples before zero an encoder starts its stream, from the timestamp (in seconds) of
 * its first packet: none when that packet starts at zero. */
export function leadInSamples(firstTimestamp: number, sampleRate = 48_000): number {
  return Math.max(0, Math.round(-firstTimestamp * sampleRate));
}

/** The samples of silence to encode before the sound, for an AAC encoder whose stream starts
 * `leadIn` samples before it: enough for the first sample of the sound to come after the first
 * frame of the stream, and none when the encoder's own priming already covers that. */
export function aacPriming(leadIn: number): number {
  return Math.max(0, AAC_FRAME_SAMPLES - Math.max(0, leadIn));
}
