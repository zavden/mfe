/* Video encoding of the scene in the browser (docs/ARCHITECTURE.md §8, "Video"). */
import type { ExportVideo } from '../types';
import { browserEnv, createVideoExporter } from './exporter';

/** Encode the scene with WebCodecs and mux it to MP4 / WebM. Rejects with the signal's reason when
 * aborted, and with `VideoUnsupportedError` when the browser lacks WebCodecs or the codec. */
export const exportVideo: ExportVideo = (evaluator, options, onProgress, signal) =>
  createVideoExporter(browserEnv())(evaluator, options, onProgress, signal);

export {
  browserCanEncode,
  codecLabel,
  defaultBitrate,
  estimatedVideoBytes,
  probeCodecs,
} from './codecs';
export type { VideoCodec } from './codecs';
export { VideoUnsupportedError } from './exporter';
export { totalFrames } from './timing';
export {
  CompanionJobError,
  exportVideoViaCompanion,
  renderWithManim,
  type CompanionVideoOptions,
  type JobPhase,
  type JobProgress,
  type ManimProgress,
} from './companion';
