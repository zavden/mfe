/* Browser A/V export keeps the existing frame renderer/timing and destination ownership.
 * Audio normally leads each video frame by 400 ms; the final frame includes the complete
 * remaining soundtrack. The muxer interleaves bounded packet queues. */
import { mixAudioBlock, type AudioPlan } from '../../audio/plan';
import { AUDIO_BLOCK_FRAMES, type AudioReader } from '../../audio/types';
import { createCanvasRenderer } from '../../render';
import type { SceneEvaluator } from '../../scene';
import type { VideoOptions, VideoProgress } from '../types';
import { canEncodeAac, createAudioEncoder, videoAudioEncoding } from '../audio/encoding';
import { chooseEncoderConfig, defaultIsConfigSupported } from './codecs';
import { VideoUnsupportedError } from './exporter';
import { frameDrawer, offscreen2d, planFrames } from './frames';
import { frameDurationUs, keyFrameInterval, timestampUs } from './timing';

export async function exportVideoWithAudio(
  evaluator: SceneEvaluator,
  options: VideoOptions,
  audioPlan: AudioPlan,
  reader: AudioReader,
  onProgress: (progress: VideoProgress) => void,
  signal: AbortSignal,
): Promise<Blob | null> {
  const { width, height, fps, codec, container } = options;
  if (![width, height, fps].every((value) => Number.isInteger(value) && value > 0))
    throw new Error('Width, height and frame rate must be positive whole numbers.');
  if ((codec === 'avc' || container === 'mp4') && (width % 2 || height % 2))
    throw new Error('Width and height must be even for MP4 and H.264.');
  if (container === 'webm' && codec === 'avc')
    throw new Error('WebM cannot hold H.264. Use MP4, VP9 or AV1.');
  signal.throwIfAborted();
  const support = defaultIsConfigSupported();
  if (!support) throw new VideoUnsupportedError('This browser cannot encode video with WebCodecs.');
  const { start, total } = planFrames(evaluator.duration, options.range, fps);
  if (
    audioPlan.frameCount !== Math.round((total / fps) * 48_000) ||
    Math.abs(audioPlan.start - start) > 1e-8
  )
    throw new Error('Audio and video must use the same frame-quantized output range.');
  const config = await chooseEncoderConfig(
    { codec, width, height, fps, bitrate: options.bitrate },
    support,
  );
  if (!config)
    throw new VideoUnsupportedError('The selected browser video codec or size is unsupported.');
  signal.throwIfAborted();
  const muxer = await createAudioEncoder(videoAudioEncoding(container, await canEncodeAac()), {
    sink: options.sink,
    signal,
    video: { codec, width, height, fps },
  });
  const { canvas, ctx } = offscreen2d(width, height);
  const draw = frameDrawer(createCanvasRenderer(), evaluator, options, start);
  let failed = false;
  let failure: unknown;
  let writes = Promise.resolve();
  const fail = (error: unknown) => {
    failed = true;
    failure = error;
  };
  const check = () => {
    signal.throwIfAborted();
    if (failed) throw failure;
  };
  const encoder = new VideoEncoder({
    output(chunk, meta) {
      writes = writes.then(() => muxer.addVideo(chunk, meta)).catch(fail);
    },
    error: fail,
  });
  const abort = () => {
    if (encoder.state !== 'closed') encoder.close();
    void muxer.cancel(signal.reason);
  };
  signal.addEventListener('abort', abort, { once: true });
  let audioFrame = 0;
  let audioPeak = 0;
  let clippedSamples = 0;
  try {
    encoder.configure(config);
    for (let k = 0; k < total; k++) {
      check();
      const until =
        k === total - 1
          ? audioPlan.frameCount
          : Math.min(audioPlan.frameCount, Math.ceil((k / fps + 0.4) * 48_000));
      while (audioFrame < until) {
        const block = await mixAudioBlock(
          audioPlan,
          reader,
          audioFrame,
          Math.min(AUDIO_BLOCK_FRAMES, until - audioFrame),
          { signal },
        );
        await muxer.add(block);
        audioPeak = Math.max(audioPeak, block.peak);
        clippedSamples += block.clippedSamples;
        audioFrame += block.channels[0].length;
      }
      if (audioFrame === audioPlan.frameCount) await muxer.finishAudio();
      check();
      draw(ctx, k);
      const frame = new VideoFrame(canvas, {
        timestamp: timestampUs(k, fps),
        duration: frameDurationUs(k, fps),
      });
      try {
        encoder.encode(frame, { keyFrame: k % keyFrameInterval(fps) === 0 });
      } finally {
        frame.close();
      }
      // Video flushing is safe; audio remains one continuous encoder with one final flush.
      if ((k + 1) % 4 === 0) {
        await encoder.flush();
        await writes;
        check();
      }
      onProgress({ frame: k + 1, totalFrames: total, audioPeak, clippedSamples });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    await encoder.flush();
    await writes;
    check();
    const blob = await muxer.finalize();
    check();
    return blob;
  } catch (error) {
    await muxer.cancel(error);
    if (signal.aborted) throw signal.reason ?? error;
    throw failed ? failure : error;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
    await writes;
    signal.removeEventListener('abort', abort);
  }
}
