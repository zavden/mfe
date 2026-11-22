/* Export → Video…: encode the scene in the browser (WebCodecs), through the companion (ffmpeg:
 * MP4, WebM, ProRes, GIF), or render the exported Python scene with the companion's Manim. The
 * project's sound goes into the file the browser writes, and the companion's ffmpeg adds it to
 * the ones it encodes and to the one Manim renders. */
import { useEffect, useId, useMemo, useState } from 'react';
import { companionClient, getEngine, pangoState } from '../../engine';
import {
  browserCanEncode,
  codecLabel,
  defaultBitrate,
  estimatedVideoBytes,
  probeCodecs,
  type VideoCodec,
} from '../../export';
import { sceneDuration, soundTail, TARGET_NAMES, visualProject, type Target } from '../../model';
import { useProjectStore, useRenderStore } from '../../store';
import { Modal } from '../project/Modal';
import { useCompanionState } from '../useCompanion';
import { downloadBlob, hasFileSystemAccess } from '../project/files';
import { textHasShape, textVerification, textVerificationNotes, videoReadiness } from './readiness';
import { soundBytesPerSecond, videoAudioEncoding } from '../../export/audio';
import { useAacSupport } from './useAacSupport';
import { useVideoExport } from './useVideoExport';
import type { VideoJob, VideoRun } from './videoExportRun';
import {
  aspectWarning,
  BROWSER_FORMATS,
  companionAudioAvailability,
  companionAudioCodec,
  companionVideoLimit,
  encoderAvailability,
  FFMPEG_FORMATS,
  formatBytes,
  FPS_PRESETS,
  initialDraft,
  manimTargetAvailability,
  MAX_GIF_FPS,
  SIZE_PRESETS,
  sizeOf,
  soundLengthProblem,
  validateDraft,
  type Availability,
  type Draft,
  type EncoderId,
  type ExportValues,
} from './videoExportModel';
import './video-export.css';

/** How often to ask the companion again while it probes its Manim interpreters. */
const PROBE_RECHECK_MS = 2000;

const ENCODER_LABELS: Record<EncoderId, string> = {
  browser: 'Browser',
  ffmpeg: 'Companion · ffmpeg',
  manim: 'Render with Manim',
};
const NO_REASON: Availability = { ok: true, reason: null };
const ENCODER_HELP: Record<EncoderId, string> = {
  browser: 'Encoded here with WebCodecs. No installation needed.',
  ffmpeg: 'The companion encodes the frames with ffmpeg: MP4, WebM, ProRes and GIF.',
  manim: 'The companion renders the exported Python scene with your Manim: the official look.',
};
const ENCODERS: readonly EncoderId[] = ['browser', 'ffmpeg', 'manim'];

/** Above this, a file the browser assembles in memory deserves a warning (R2 of the first
 * Codex audit): with the File System Access API the file is written as it is encoded instead. */
export const IN_MEMORY_WARNING_BYTES = 1024 ** 3;

export function VideoExportDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const companion = useCompanionState();
  // While the companion probes its Manim interpreters, ask again soon instead of at the next
  // poll (15 s while online).
  const probing = companion.status === 'online' && !!companion.health.capabilities.manimProbing;
  useEffect(() => {
    if (!probing) return;
    const timer = setInterval(() => void companionClient().check(), PROBE_RECHECK_MS);
    return () => clearInterval(timer);
  }, [probing]);
  const meta = useProjectStore((s) => s.project.meta);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [draft, setDraft] = useState<Draft>(() => {
    const { project } = useProjectStore.getState();
    const duration = sceneDuration(project);
    return initialDraft(project.meta, duration);
  });
  const exporter = useVideoExport();
  const { run, running } = exporter;
  const aac = useAacSupport();
  const [support, setSupport] = useState<Record<VideoCodec, boolean> | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  // The scene length follows the project (it is only used to validate the range).
  const project = useProjectStore((s) => s.project);
  const resolved = useRenderStore((s) => s.resolved);
  const entries = useRenderStore((s) => s.entries);

  const canEncodeHere = useMemo(() => browserCanEncode(), []);
  const availability = encoderAvailability(companion, canEncodeHere);
  // An encoder that stopped being available (the companion went away) hands over to one that is.
  const encoder: EncoderId = availability[draft.encoder].ok
    ? draft.encoder
    : (ENCODERS.find((e) => availability[e].ok) ?? draft.encoder);
  const effective: Draft = encoder === draft.encoder ? draft : { ...draft, encoder };
  const renderedProject = useMemo(
    () => (encoder === 'manim' ? visualProject(project) : project),
    [encoder, project],
  );
  const duration = sceneDuration(renderedProject);

  const result = validateDraft(effective, { meta, duration });
  const values = result.values;

  // Which codecs this browser can encode at the chosen size.
  const probeKey = values ? `${values.width}x${values.height}@${values.fps}` : null;
  useEffect(() => {
    if (!canEncodeHere || !values) return;
    let cancelled = false;
    void probeCodecs(values.width, values.height, values.fps).then((found) => {
      if (!cancelled) setSupport(found);
    });
    return () => {
      cancelled = true;
    };
    // `values` changes identity on every render; the key is what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEncodeHere, probeKey]);

  const browserFormat =
    BROWSER_FORMATS.find((f) => f.id === draft.browserFormat && (!support || support[f.codec])) ??
    BROWSER_FORMATS.find((f) => !support || support[f.codec]) ??
    BROWSER_FORMATS[0]!;
  const noBrowserCodec = !!support && BROWSER_FORMATS.every((f) => !support[f.codec]);
  // The sound: the browser writes it itself; the companion's ffmpeg adds it where it has the
  // encoder of the format. The checkbox keeps what the user chose while a format cannot take it.
  const hasAudio = project.audioClips.length > 0;
  const encoderAudio =
    encoder === 'ffmpeg'
      ? companionAudioAvailability(companion, draft.ffmpegFormat)
      : encoder === 'manim'
        ? companionAudioAvailability(companion, 'mp4') // what Manim renders is an MP4
        : NO_REASON;
  // An export mixes an hour of sound at most: a longer video goes without it, and says so here.
  const tooLong = hasAudio && values ? soundLengthProblem(values.frames / values.fps) : null;
  const audio: Availability =
    encoderAudio.ok && tooLong
      ? {
          ok: false,
          reason: `${tooLong} The video goes without it${
            encoder === 'manim' ? '' : ', unless you export a shorter range'
          }.`,
        }
      : encoderAudio;
  const withAudio = hasAudio && includeAudio && audio.ok;
  const audioNote =
    audio.reason ??
    (!withAudio || encoder === 'browser'
      ? null
      : encoder === 'ffmpeg'
        ? `ffmpeg encodes the sound as ${companionAudioCodec(draft.ffmpegFormat)}.`
        : 'The companion’s ffmpeg adds the sound to the video Manim renders, as AAC.');
  // Render with Manim ends with the last animation; the editor's scene, with the last sound.
  // (Less than the hundredth of a second the notice shows is not worth one.)
  const tail = encoder === 'manim' && withAudio ? soundTail(project) : 0;
  const soundCut = tail >= 0.01 ? tail : 0;
  // The sound of an MP4 is AAC where the browser encodes it. Elsewhere it is Opus, which is a
  // valid MP4 track but not one every player reads: say so before the export, not after.
  const opusInMp4 =
    encoder === 'browser' && browserFormat.container === 'mp4' && withAudio && aac === false;
  // The companion's ffmpeg may have the AAC encoder the browser lacks: its MP4 is one click away.
  const aacThroughFfmpeg =
    opusInMp4 && availability.ffmpeg.ok && companionAudioAvailability(companion, 'mp4').ok;

  // How large a video the companion's ffmpeg may write: its limit, said before the export.
  const videoLimit = encoder === 'ffmpeg' ? companionVideoLimit(companion) : null;

  const manimTarget = manimTargetAvailability(companion, draft.manimTarget);
  // Formulas on the timeline the video cannot draw as they are: Export waits for the ones
  // rendering (an export of the earlier render would be stale, see F9 of the Codex audit); the
  // ones whose LaTeX fails are drawn as their last good render, or left out when they never had
  // one (Manim gets the LaTeX: they block it); empty ones are left out.
  const readiness = useMemo(
    () => videoReadiness(renderedProject, entries, resolved),
    [renderedProject, entries, resolved],
  );
  const names = (formulas: { name: string }[]) => formulas.map((f) => f.name);
  const waitingFormulas = names(readiness.waiting);
  const failingFormulas = names(readiness.failing.filter((formula) => formula.kind !== 'text'));
  const missingFormulas = names(readiness.missing.filter((formula) => formula.kind !== 'text'));
  const emptyFormulas = names(readiness.empty);
  const unrenderable = [...failingFormulas, ...missingFormulas];
  // A font text is drawn from its saved shape. One that has none of its current source (never
  // shaped, or edited where nothing could shape it) holds every video back; one that only failed
  // to be shaped again (for the project's new library, say) is drawn as the preview shows it.
  const blockedText = [...readiness.failing, ...readiness.missing].filter(
    (formula) =>
      formula.kind === 'text' &&
      !textHasShape(formula, resolved) &&
      !readiness.boxes.includes(formula),
  );
  // A text nothing has shaped is on screen as placeholder boxes: Browser and ffmpeg film what
  // the preview shows, boxes and all; Manim draws the text itself. Said, not held back (D82).
  // But Manim gets the Python scene, and the generator leaves out a boxed text whose glyphs
  // nothing counts (its references count by a geometry that is not at hand, and its source moved
  // on): that one holds Render with Manim back, as it does Export → Python.
  const uncountedText = encoder === 'manim' ? readiness.uncounted : [];
  const boxed = readiness.boxes.filter((formula) => !uncountedText.includes(formula));
  const boxedText = names(boxed);
  /** For Manim's note: counted one per character, or by the shape they had. */
  const savedBoxedText = names(boxed.filter((formula) => readiness.savedBoxes.includes(formula)));
  const countedBoxedText = names(
    boxed.filter((formula) => !readiness.savedBoxes.includes(formula)),
  );
  // Font texts Manim may draw differently from the preview (their fonts changed here, or the
  // companion cannot compare them): Render with Manim says so and goes on (D82).
  const textWorker = pangoState(companion, draft.manimTarget);
  const verification =
    encoder === 'manim'
      ? textVerification(renderedProject, resolved, companion, draft.manimTarget)
      : null;
  const textNotes = verification
    ? textVerificationNotes(verification, draft.manimTarget, false, textWorker)
    : [];
  // The comparison needs the companion's text worker of the library Manim renders with, which
  // may not be the project's: asked for when there is a text to compare and nothing started it.
  const comparable = (verification?.unknown.length ?? 0) > 0;
  const manimLibrary = draft.manimTarget;
  useEffect(() => {
    if (comparable && textWorker === 'unused') getEngine().prepareText(manimLibrary);
  }, [comparable, textWorker, manimLibrary]);

  const ready =
    result.ok &&
    availability[encoder].ok &&
    !(encoder === 'browser' && noBrowserCodec) &&
    !(encoder === 'manim' && !manimTarget.ok) &&
    waitingFormulas.length === 0 &&
    blockedText.length === 0 &&
    uncountedText.length === 0 &&
    !(encoder === 'manim' && unrenderable.length > 0);

  const start = () => {
    if (!values || !ready) return;
    const job: VideoJob =
      encoder === 'browser'
        ? {
            encoder,
            codec: browserFormat.codec,
            container: browserFormat.container,
            ...(hasAudio ? { includeAudio: withAudio } : {}),
          }
        : encoder === 'ffmpeg'
          ? {
              encoder,
              format: draft.ffmpegFormat,
              quality: draft.quality,
              ...(withAudio ? { includeAudio: true } : {}),
            }
          : {
              encoder,
              target: draft.manimTarget,
              quality: draft.quality,
              ...(withAudio ? { includeAudio: true } : {}),
            };
    // The project and its renders as they are now (a render may finish while the dialog is open).
    void exporter.start({
      job,
      values,
      project: useProjectStore.getState().project,
      resolved: useRenderStore.getState().resolved,
    });
  };
  const close = () => {
    exporter.cancel();
    onClose();
  };

  const size = sizeOf(effective, meta);
  const aspect = values ? aspectWarning(values.width, values.height, meta) : null;
  // About how large the browser's file comes out, its sound included, and whether it would sit
  // whole in memory.
  const estimate =
    encoder === 'browser' && values
      ? {
          bytes:
            estimatedVideoBytes(
              browserFormat.codec,
              values.width,
              values.height,
              values.fps,
              values.seconds,
            ) +
            (withAudio
              ? Math.round(
                  values.seconds *
                    soundBytesPerSecond(videoAudioEncoding(browserFormat.container, aac !== false)),
                )
              : 0),
          bitrate: defaultBitrate(browserFormat.codec, values.width, values.height, values.fps),
        }
      : null;
  const inMemory = !hasFileSystemAccess();
  const errors = result.errors as Record<string, string>;
  const gif = encoder === 'ffmpeg' && draft.ffmpegFormat === 'gif';
  /** The Python exporter has no range: Manim renders the whole scene. */
  const wholeOnly = encoder === 'manim';

  return (
    <Modal
      title="Export video"
      onClose={close}
      testId="export-video"
      width="620px"
      closeOnBackdrop={!running}
      footer={
        <>
          <button type="button" className="btn" onClick={close} data-testid="video-close">
            {run.status === 'running' ? 'Cancel and close' : 'Close'}
          </button>
          {running ? (
            <button
              type="button"
              className={run.status === 'committing' ? 'btn btn-primary' : 'btn btn-danger'}
              onClick={exporter.cancel}
              disabled={run.status === 'committing'}
              data-testid="video-cancel"
            >
              {run.status === 'committing' ? 'Saving…' : 'Cancel export'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!ready}
              onClick={start}
              data-testid="video-start"
            >
              Export
            </button>
          )}
        </>
      }
    >
      <div className="video-export form-grid">
        {hasAudio && (
          <div className="video-audio-option">
            <label className="check">
              <input
                type="checkbox"
                data-testid="video-include-audio"
                checked={includeAudio && audio.ok}
                disabled={running || !audio.ok}
                onChange={(event) => setIncludeAudio(event.currentTarget.checked)}
              />{' '}
              Include audio · volume curves and track mute
            </label>
            {audioNote && (
              <span className="field-hint" data-testid="video-audio-note">
                {audioNote}
              </span>
            )}
            {soundCut > 0 && (
              <span className="field-warning" data-testid="video-audio-cut">
                The sound goes on for {Math.round(soundCut * 100) / 100} s after the last animation:
                Render with Manim ends there, and the sound is cut with it.
              </span>
            )}
          </div>
        )}
        <span className="form-label">Encoder</span>
        <div className="encoder-options" role="radiogroup" aria-label="Encoder">
          {ENCODERS.map((option) => {
            const info = availability[option];
            return (
              <div
                key={option}
                className="encoder-option"
                data-selected={encoder === option}
                data-disabled={!info.ok}
              >
                <label className="check">
                  <input
                    type="radio"
                    name={`${id}-encoder`}
                    checked={encoder === option}
                    disabled={!info.ok || running}
                    data-testid={`video-encoder-${option}`}
                    onChange={() => set('encoder', option)}
                  />
                  {ENCODER_LABELS[option]}
                </label>
                <span
                  className={info.ok && info.reason ? 'field-warning' : 'field-hint'}
                  data-testid={`video-encoder-hint-${option}`}
                >
                  {info.reason ?? ENCODER_HELP[option]}
                </span>
              </div>
            );
          })}
        </div>

        {encoder === 'browser' && (
          <>
            <label htmlFor={`${id}-bformat`}>Format</label>
            <div className="field-stack">
              <select
                id={`${id}-bformat`}
                value={browserFormat.id}
                disabled={running}
                data-testid="video-format"
                onChange={(e) => set('browserFormat', e.target.value as Draft['browserFormat'])}
              >
                {BROWSER_FORMATS.map((f) => {
                  const unsupported = !!support && !support[f.codec];
                  return (
                    <option key={f.id} value={f.id} disabled={unsupported}>
                      {f.label}
                      {unsupported ? ' (not supported by this browser at this size)' : ''}
                    </option>
                  );
                })}
              </select>
              {noBrowserCodec && (
                <span className="field-error" role="alert">
                  This browser cannot encode any format at this size. Try a smaller size, or use the
                  companion.
                </span>
              )}
              {estimate && !noBrowserCodec && (
                <span className="field-hint" data-testid="video-estimate">
                  About {formatBytes(estimate.bytes)} ({codecLabel(browserFormat.codec)} at{' '}
                  {(estimate.bitrate / 1_000_000).toFixed(1)} Mbit/s
                  {withAudio ? ' plus the sound' : ''}
                  {inMemory
                    ? ', assembled in memory, then downloaded'
                    : ', written to a file as it is encoded'}
                  ).
                </span>
              )}
              {estimate &&
                !noBrowserCodec &&
                inMemory &&
                estimate.bytes > IN_MEMORY_WARNING_BYTES && (
                  <span className="field-warning" data-testid="video-estimate-warning">
                    A file this size may exhaust the browser’s memory: export a shorter range, a
                    smaller size or a lower frame rate, or use the companion.
                  </span>
                )}
              {opusInMp4 && !noBrowserCodec && (
                <span className="field-warning" data-testid="video-audio-opus">
                  The sound of this MP4 will be Opus: this browser has no AAC encoder. Browsers and
                  players such as VLC play it; some players and video editors do not.
                </span>
              )}
              {aacThroughFfmpeg && !noBrowserCodec && (
                <span>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={running}
                    data-testid="video-audio-use-ffmpeg"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        encoder: 'ffmpeg',
                        ffmpegFormat: 'mp4',
                      }))
                    }
                  >
                    Use Companion · ffmpeg for AAC (MP4 · H.264)
                  </button>
                </span>
              )}
            </div>
          </>
        )}

        {encoder === 'ffmpeg' && (
          <>
            <label htmlFor={`${id}-fformat`}>Format</label>
            <select
              id={`${id}-fformat`}
              value={draft.ffmpegFormat}
              disabled={running}
              data-testid="video-format"
              onChange={(e) => set('ffmpegFormat', e.target.value as Draft['ffmpegFormat'])}
            >
              {FFMPEG_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <label htmlFor={`${id}-quality`}>Quality</label>
            <div className="field-stack">
              <select
                id={`${id}-quality`}
                value={draft.quality}
                disabled={running || draft.ffmpegFormat === 'mov' || draft.ffmpegFormat === 'gif'}
                data-testid="video-quality"
                onChange={(e) => set('quality', e.target.value as Draft['quality'])}
              >
                <option value="low">Low (small file)</option>
                <option value="medium">Medium</option>
                <option value="high">High (large file)</option>
              </select>
              {videoLimit && (
                <span
                  className={videoLimit.caution ? 'field-warning' : 'field-hint'}
                  data-testid="video-size-limit"
                >
                  {videoLimit.text}
                </span>
              )}
            </div>
          </>
        )}

        {encoder === 'manim' && (
          <>
            <label htmlFor={`${id}-mtarget`}>Manim</label>
            <div className="field-stack">
              <select
                id={`${id}-mtarget`}
                value={draft.manimTarget}
                disabled={running}
                data-testid="video-manim-target"
                onChange={(e) => set('manimTarget', e.target.value as Target)}
              >
                <option value="ce">ManimCE (Community Edition)</option>
                <option value="gl">ManimGL (3b1b)</option>
              </select>
              {!manimTarget.ok && (
                <span className="field-error" role="alert" data-testid="video-manim-target-hint">
                  {manimTarget.reason}
                </span>
              )}
              {draft.manimTarget !== meta.target && (
                <span className="field-hint">
                  The project targets {TARGET_NAMES[meta.target]}; the exported scene is converted.
                </span>
              )}
            </div>
          </>
        )}

        <label htmlFor={`${id}-size`}>Size</label>
        <div className="field-stack">
          <select
            id={`${id}-size`}
            value={draft.sizePreset}
            disabled={running}
            data-testid="video-size-preset"
            onChange={(e) => {
              const preset = e.target.value;
              const next = sizeOf({ ...draft, sizePreset: preset }, meta);
              setDraft((current) => ({
                ...current,
                sizePreset: preset,
                width: preset === 'custom' ? current.width : next.width,
                height: preset === 'custom' ? current.height : next.height,
              }));
            }}
          >
            <option value="project">
              Project ({meta.width} × {meta.height})
            </option>
            {SIZE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          {draft.sizePreset === 'custom' && (
            <span className="inline-fields">
              <input
                type="text"
                inputMode="numeric"
                aria-label="Width in pixels"
                value={draft.width}
                disabled={running}
                data-testid="video-width"
                onChange={(e) => set('width', e.target.value)}
              />
              ×
              <input
                type="text"
                inputMode="numeric"
                aria-label="Height in pixels"
                value={draft.height}
                disabled={running}
                data-testid="video-height"
                onChange={(e) => set('height', e.target.value)}
              />
              px
            </span>
          )}
          {(errors.width || errors.height) && (
            <span className="field-error" role="alert" data-testid="video-size-error">
              {errors.width ?? errors.height}
            </span>
          )}
          {aspect && (
            <span className="field-warning" data-testid="video-aspect-warning">
              {aspect}
            </span>
          )}
          {draft.sizePreset !== 'custom' && (
            <span className="field-hint">
              {size.width} × {size.height} px
            </span>
          )}
        </div>

        <label htmlFor={`${id}-fps`}>Frame rate</label>
        <div className="field-stack">
          <select
            id={`${id}-fps`}
            value={draft.fps}
            disabled={running}
            data-testid="video-fps"
            onChange={(e) => set('fps', e.target.value)}
          >
            <option value="project">Project ({meta.fps} fps)</option>
            {FPS_PRESETS.map((fps) => (
              <option key={fps} value={String(fps)}>
                {fps} fps
              </option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          {draft.fps === 'custom' && (
            <input
              type="text"
              inputMode="numeric"
              aria-label="Custom frame rate"
              value={draft.customFps}
              disabled={running}
              data-testid="video-custom-fps"
              onChange={(e) => set('customFps', e.target.value)}
            />
          )}
          {errors.fps && (
            <span className="field-error" role="alert" data-testid="video-fps-error">
              {errors.fps}
            </span>
          )}
          {gif && !errors.fps && (
            <span className="field-hint">GIF frame rates are limited to {MAX_GIF_FPS} fps.</span>
          )}
        </div>

        <span className="form-label">Range</span>
        <div className="field-stack">
          <span className="inline-fields">
            <label className="check">
              <input
                type="radio"
                name={`${id}-range`}
                checked={wholeOnly || draft.rangeMode === 'whole'}
                disabled={running}
                data-testid="video-range-whole"
                onChange={() => set('rangeMode', 'whole')}
              />
              Whole scene ({Math.round(duration * 1000) / 1000} s)
            </label>
            <label className="check">
              <input
                type="radio"
                name={`${id}-range`}
                checked={!wholeOnly && draft.rangeMode === 'custom'}
                disabled={running || wholeOnly}
                data-testid="video-range-custom"
                onChange={() => set('rangeMode', 'custom')}
              />
              Custom
            </label>
          </span>
          {wholeOnly && (
            <span className="field-hint" data-testid="video-range-hint">
              Render with Manim always renders the whole scene.
            </span>
          )}
          {!wholeOnly && draft.rangeMode === 'custom' && (
            <span className="inline-fields">
              <input
                type="text"
                inputMode="decimal"
                aria-label="Start in seconds"
                value={draft.start}
                disabled={running}
                data-testid="video-range-start"
                onChange={(e) => set('start', e.target.value)}
              />
              to
              <input
                type="text"
                inputMode="decimal"
                aria-label="End in seconds"
                value={draft.end}
                disabled={running}
                data-testid="video-range-end"
                onChange={(e) => set('end', e.target.value)}
              />
              s
            </span>
          )}
          {(errors.start || errors.end || errors.range) && (
            <span className="field-error" role="alert" data-testid="video-range-error">
              {errors.start ?? errors.end ?? errors.range}
            </span>
          )}
        </div>

        {values && (
          <p className="video-summary" data-testid="video-summary">
            {summary(values)}
          </p>
        )}
        {blockedText.length > 0 && (
          <p className="video-summary field-error" role="alert" data-testid="video-text-problems">
            {names(blockedText).join(', ')}: font text with no shape of{' '}
            {blockedText.length === 1 ? 'its' : 'their'} current source and font. The companion
            shapes {blockedText.length === 1 ? 'it' : 'them'}.
          </p>
        )}
        {uncountedText.length > 0 && (
          <p className="video-summary field-error" role="alert" data-testid="video-text-uncounted">
            {names(uncountedText).join(', ')}: font text whose glyphs nothing counts as{' '}
            {uncountedText.length === 1 ? 'it stands' : 'they stand'}, so the scene for Manim would
            leave {uncountedText.length === 1 ? 'it' : 'them'} out. Refresh appearance, in{' '}
            {uncountedText.length === 1 ? 'its' : 'their'} editor, shapes{' '}
            {uncountedText.length === 1 ? 'it' : 'them'} again, which needs the companion.
          </p>
        )}
        {boxedText.length > 0 && encoder !== 'manim' && (
          <p className="video-summary field-warning" data-testid="video-text-boxes">
            {boxedText.join(', ')}: font text nothing has shaped. The video shows{' '}
            {boxedText.length === 1 ? 'it' : 'them'} as the preview does, as placeholder boxes. The
            companion draws {boxedText.length === 1 ? 'its' : 'their'} real glyphs.
          </p>
        )}
        {boxedText.length > 0 && encoder === 'manim' && (
          <p className="video-summary field-warning" data-testid="video-text-boxes">
            {countedBoxedText.length > 0 &&
              `${countedBoxedText.join(', ')}: font text nothing has shaped. Manim draws ${countedBoxedText.length === 1 ? 'its' : 'their'} real glyphs; they are counted one per character here, so colours and animations of single glyphs can land on other glyphs where the font joins letters.`}
            {countedBoxedText.length > 0 && savedBoxedText.length > 0 && ' '}
            {savedBoxedText.length > 0 &&
              `${savedBoxedText.join(', ')}: font text whose saved appearance is not at hand. Manim draws ${savedBoxedText.length === 1 ? 'its' : 'their'} real glyphs, counted as that appearance had them.`}
          </p>
        )}
        {textNotes.length > 0 && (
          <p className="video-summary field-warning" data-testid="video-text-notes">
            {textNotes.join(' ')}
          </p>
        )}
        {waitingFormulas.length > 0 && (
          <p className="video-summary field-warning" data-testid="video-waiting-formulas">
            Waiting for{' '}
            {waitingFormulas.length === 1 ? 'a formula' : `${waitingFormulas.length} formulas`} to
            render ({waitingFormulas.join(', ')})…
          </p>
        )}
        {encoder === 'manim' && unrenderable.length > 0 ? (
          <p className="video-summary field-warning" data-testid="video-stale-formulas">
            Render with Manim needs {unrenderable.join(', ')} to render: fix{' '}
            {unrenderable.length === 1 ? 'it' : 'them'} in the Creator.
          </p>
        ) : (
          <>
            {failingFormulas.length > 0 && (
              <p className="video-summary field-warning" data-testid="video-stale-formulas">
                {failingFormulas.join(', ')} {failingFormulas.length === 1 ? 'does' : 'do'} not
                render with {failingFormulas.length === 1 ? 'its' : 'their'} current LaTeX: the
                video draws {failingFormulas.length === 1 ? 'its' : 'their'} last good render.
              </p>
            )}
            {missingFormulas.length > 0 && (
              <p className="video-summary field-warning" data-testid="video-missing-formulas">
                {missingFormulas.join(', ')} {missingFormulas.length === 1 ? 'does' : 'do'} not
                render with {missingFormulas.length === 1 ? 'its' : 'their'} current LaTeX and never
                did: the video leaves {missingFormulas.length === 1 ? 'it' : 'them'} out.
              </p>
            )}
          </>
        )}
        {emptyFormulas.length > 0 && (
          <p className="video-summary field-warning" data-testid="video-empty-formulas">
            {emptyFormulas.join(', ')} {emptyFormulas.length === 1 ? 'is' : 'are'} empty and will be
            missing from the video.
          </p>
        )}

        {run.status !== 'idle' && <RunPanel run={run} />}
      </div>
    </Modal>
  );
}

function summary(values: ExportValues): string {
  const seconds = Math.round(values.seconds * 100) / 100;
  return `${values.frames} frames · ${seconds} s · ${values.width} × ${values.height} at ${values.fps} fps`;
}

function RunPanel({ run }: { run: Exclude<VideoRun, { status: 'idle' }> }) {
  if (run.status === 'committing') {
    return (
      <div className="video-run" data-testid="video-run">
        <span role="status" data-testid="video-committing">
          Saving the video…
        </span>
      </div>
    );
  }
  if (run.status === 'running') {
    const known = run.total !== null && run.total > 0;
    return (
      <div className="video-run" data-testid="video-run">
        <span data-testid="video-progress-text">
          {run.label}
          {known ? ` — frame ${run.frame} of ${run.total}` : ''}
        </span>
        <progress
          value={known ? run.frame : undefined}
          max={known ? run.total! : undefined}
          aria-label="Export progress"
          data-testid="video-progress"
        />
      </div>
    );
  }
  if (run.status === 'done') {
    const { blob } = run;
    return (
      <div className="video-run" data-testid="video-run">
        <span className="video-done" role="status" data-testid="video-done">
          {blob ? 'Saved' : 'Written to'} {run.fileName} ({formatBytes(run.size)}).
        </span>
        {blob && (
          <span>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => downloadBlob(run.fileName, blob)}
              data-testid="video-download"
            >
              Download again
            </button>
          </span>
        )}
      </div>
    );
  }
  if (run.status === 'cancelled') {
    return (
      <div className="video-run" data-testid="video-run">
        <span role="status" data-testid="video-cancelled">
          Export cancelled.
        </span>
      </div>
    );
  }
  return (
    <div className="video-run" data-testid="video-run">
      <span className="video-error" role="alert" data-testid="video-error">
        {run.message}
      </span>
      {run.log && (
        <pre className="video-log" data-testid="video-log">
          {run.log}
        </pre>
      )}
    </div>
  );
}
