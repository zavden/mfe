import { mixAudioBlock, type AudioPlan } from './plan';
import { AUDIO_BLOCK_FRAMES, AUDIO_MIX_RATE, type AudioMixBlock, type AudioReader } from './types';

const LOOKAHEAD_SECONDS = 0.3;
const START_LEAD_SECONDS = 0.06;
const EDIT_LEAD_SECONDS = 0.025;
const EDIT_TRANSITION_SECONDS = 0.005;
const nextSample = (seconds: number) => Math.ceil(seconds * AUDIO_MIX_RATE - 1e-7);

export interface AudioPlayback {
  start(plan: AudioPlan, time: number, options?: { loop?: boolean }): Promise<void>;
  pause(): number;
  currentTime(): number;
  update(plan: AudioPlan): void;
  setLoop(loop: boolean): void;
  readonly running: boolean;
  readonly stats: { underruns: number; queuedNodes: number; peak: number };
  dispose(): Promise<void>;
}

/** Web Audio owns time. Rendering reads currentTime(); requestAnimationFrame never schedules
 * sound. Loop boundaries and live edits are scheduled before they reach the audio device. */
export function createAudioPlayback(
  reader: AudioReader,
  options: {
    createContext?: () => AudioContext;
    onError?: (error: unknown) => void;
    onUnderrun?: (count: number) => void;
    onPeak?: (peak: number, clippedSamples: number) => void;
  } = {},
): AudioPlayback {
  let context: AudioContext | null = null;
  let plan: AudioPlan | null = null;
  let generation = 0;
  let aborter: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let anchor = 0;
  let nextFrame = 0;
  let pausedTime = 0;
  let startedAt = 0;
  let active = false;
  let loop = false;
  let pumping = false;
  let underruns = 0;
  let peak = 0;
  type ScheduledNode = { start: number; end: number; gain: GainNode };
  const nodes = new Map<AudioBufferSourceNode, ScheduledNode>();
  const retiring = new Map<AudioBufferSourceNode, ScheduledNode>();
  let editTransition: { start: number; end: number } | null = null;

  const outputTime = () => {
    if (!context) return 0;
    const timestamp = context.getOutputTimestamp?.();
    if (
      timestamp &&
      typeof timestamp.contextTime === 'number' &&
      timestamp.contextTime > 0 &&
      typeof timestamp.performanceTime === 'number' &&
      timestamp.performanceTime > 0
    ) {
      return Math.min(
        context.currentTime,
        timestamp.contextTime + (performance.now() - timestamp.performanceTime) / 1000,
      );
    }
    return Math.max(0, context.currentTime - (context.baseLatency || 0));
  };
  const currentTime = () => {
    if (!active || !context || !plan) return pausedTime;
    const heard = outputTime();
    if (heard < startedAt) return pausedTime;
    const elapsed = Math.max(0, heard - anchor);
    const position =
      loop && plan.duration > 0 ? elapsed % plan.duration : Math.min(plan.duration, elapsed);
    return plan.start + position;
  };
  const invalidate = (cut: number, transition = 0) => {
    generation++;
    aborter?.abort(new DOMException('Playback scheduling replaced.', 'AbortError'));
    aborter = new AbortController();
    if (timer !== null) clearTimeout(timer);
    timer = null;
    for (const [node, item] of [...nodes, ...(transition ? [] : retiring)]) {
      if (item.end <= cut) continue;
      const stop = Math.max(cut, context?.currentTime ?? 0);
      if (transition && item.start < stop + transition) {
        const param = item.gain.gain;
        if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(stop);
        else {
          param.cancelScheduledValues(stop);
          param.setValueAtTime(param.value, stop);
        }
        param.linearRampToValueAtTime(0, stop + transition);
        node.stop(stop + transition);
        retiring.set(node, item);
      } else {
        node.stop(stop);
        item.gain.disconnect();
        retiring.delete(node);
      }
      nodes.delete(node);
    }
    editTransition = transition ? { start: cut, end: cut + transition } : null;
  };
  const schedule = (block: AudioMixBlock, at: number) => {
    const buffer = context!.createBuffer(2, block.channels[0].length, AUDIO_MIX_RATE);
    buffer.copyToChannel(block.channels[0] as Float32Array<ArrayBuffer>, 0);
    buffer.copyToChannel(block.channels[1] as Float32Array<ArrayBuffer>, 1);
    const node = context!.createBufferSource();
    node.buffer = buffer;
    const gain = context!.createGain();
    node.connect(gain);
    gain.connect(context!.destination);
    if (editTransition && at < editTransition.end) {
      const level = Math.max(
        0,
        (at - editTransition.start) / (editTransition.end - editTransition.start),
      );
      gain.gain.setValueAtTime(level, at);
      gain.gain.linearRampToValueAtTime(1, editTransition.end);
    }
    nodes.set(node, { start: at, end: at + buffer.duration, gain });
    node.onended = () => {
      nodes.delete(node);
      retiring.delete(node);
      node.disconnect();
      gain.disconnect();
    };
    node.start(at);
    peak = block.peak;
    options.onPeak?.(block.peak, block.clippedSamples);
  };
  const pump = async () => {
    if (pumping || !active || !plan || !context) return;
    pumping = true;
    const own = generation;
    const signal = aborter!.signal;
    try {
      while (active && own === generation && nodes.size < 6) {
        if (!loop && nextFrame >= plan.frameCount) break;
        let at = anchor + nextFrame / AUDIO_MIX_RATE;
        if (at >= context.currentTime + LOOKAHEAD_SECONDS) break;
        if (at < context.currentTime + 0.005) {
          nextFrame = nextSample(context.currentTime + EDIT_LEAD_SECONDS - anchor);
          underruns++;
          options.onUnderrun?.(underruns);
          at = anchor + nextFrame / AUDIO_MIX_RATE;
        }
        const frame = loop ? nextFrame % plan.frameCount : nextFrame;
        const count = Math.min(AUDIO_BLOCK_FRAMES, plan.frameCount - frame);
        if (count <= 0) break;
        const block = await mixAudioBlock(plan, reader, frame, count, { signal });
        if (own !== generation || !active) break;
        if (at < context.currentTime) continue;
        schedule(block, at);
        nextFrame += count;
      }
    } catch (error) {
      if (own === generation && !signal.aborted) {
        active = false;
        invalidate(context.currentTime);
        options.onError?.(error);
      }
    } finally {
      pumping = false;
      if (active)
        timer = setTimeout(() => {
          timer = null;
          void pump();
        }, 25);
    }
  };
  const pause = () => {
    pausedTime = currentTime();
    active = false;
    invalidate(context?.currentTime ?? 0);
    void context?.suspend().catch(() => undefined);
    return pausedTime;
  };
  return {
    async start(nextPlan, time, settings = {}) {
      active = false;
      invalidate(context?.currentTime ?? 0);
      context ??=
        options.createContext?.() ??
        new AudioContext({ sampleRate: AUDIO_MIX_RATE, latencyHint: 'interactive' });
      // Call resume before the first await so the user's activation is retained.
      const resumed = context.resume();
      plan = nextPlan;
      loop = settings.loop ?? false;
      underruns = 0;
      peak = 0;
      pausedTime = Math.max(plan.start, Math.min(plan.start + plan.duration, time));
      nextFrame = Math.round((pausedTime - plan.start) * AUDIO_MIX_RATE);
      if (nextFrame >= plan.frameCount) {
        nextFrame = 0;
        pausedTime = plan.start;
      }
      if (!plan.frameCount) return;
      const own = generation;
      const [block] = await Promise.all([
        mixAudioBlock(
          plan,
          reader,
          nextFrame,
          Math.min(AUDIO_BLOCK_FRAMES, plan.frameCount - nextFrame),
          { signal: aborter!.signal },
        ),
        resumed,
      ]);
      if (own !== generation) return;
      anchor = context.currentTime + START_LEAD_SECONDS - nextFrame / AUDIO_MIX_RATE;
      startedAt = context.currentTime + START_LEAD_SECONDS;
      active = true;
      schedule(block, anchor + nextFrame / AUDIO_MIX_RATE);
      nextFrame += block.channels[0].length;
      void pump();
    },
    pause,
    currentTime,
    update(nextPlan) {
      if (!active || !context || !plan) {
        plan = nextPlan;
        return;
      }
      if (!nextPlan.frameCount) {
        pause();
        plan = nextPlan;
        pausedTime = nextPlan.start;
        return;
      }
      const requestedCut = context.currentTime + EDIT_LEAD_SECONDS;
      const oldStart = plan.start;
      const oldDuration = plan.duration;
      const position =
        loop && oldDuration > 0 ? (requestedCut - anchor) % oldDuration : requestedCut - anchor;
      plan = nextPlan;
      // Gain/mute edits retain the exact anchor and sample phase, including during loops.
      if (nextPlan.start !== oldStart || nextPlan.duration !== oldDuration) {
        anchor = requestedCut - Math.max(0, oldStart + position - nextPlan.start);
      }
      nextFrame = Math.max(0, nextSample(requestedCut - anchor));
      const cut = anchor + nextFrame / AUDIO_MIX_RATE;
      invalidate(cut, EDIT_TRANSITION_SECONDS);
      void pump();
    },
    setLoop(value) {
      if (value === loop) return;
      if (!value && active && context && plan && plan.duration > 0) {
        const requestedCut = context.currentTime + EDIT_LEAD_SECONDS;
        anchor += Math.max(0, Math.floor((requestedCut - anchor) / plan.duration)) * plan.duration;
        nextFrame = Math.max(0, nextSample(requestedCut - anchor));
        const cut = anchor + nextFrame / AUDIO_MIX_RATE;
        invalidate(cut);
      }
      loop = value;
      if (active) void pump();
    },
    get running() {
      return active;
    },
    get stats() {
      return { underruns, queuedNodes: nodes.size + retiring.size, peak };
    },
    async dispose() {
      pause();
      await context?.close();
      context = null;
    },
  };
}
