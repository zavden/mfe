# Architecture §8 (2 of 2): Export, video

[Index](../ARCHITECTURE.md) · Previous: [§8 Export: Python](08a-export-python.md) · Next:
[§9–§10 Testing, working rules](09-10-testing-working-rules.md)

Holds §8's subsection *Video (`export/video`)*: the browser's encoder, the companion's ffmpeg,
Render with Manim, the video dialog and what it waits for; and *The frame as an image
(`export/image`)*, the picture of one frame.

See also: [§7 Rendering](06-07-catalogue-rendering.md#7-rendering) ·
[§8 Python](08a-export-python.md#python-exportcodegen) ·
[Audio plan, clocks and exports](11f-media-audio.md#audio-plan-clocks-and-exports) ·
[docs/COMPANION.md](../COMPANION.md)

---

### Video (`export/video`)

- **Browser** (`exportVideo`): frames `t_k = r0 + k / fps`, `k < round((r1 − r0) · fps)`, drawn by the
  same `Renderer` as the preview on an `OffscreenCanvas` of the output size (camera: whole frame,
  centre `[0, 0]`, zoom 1; the frame is 8 units tall and `8 · width / height` wide, so an output
  whose aspect differs from the project's shows more or less at the sides, and the scene is
  evaluated in that frame: `exportEvaluator`'s `frame`; a scene whose camera moves is filmed through
  the camera's frame of each instant instead — the option `framing`, `sceneFraming`, which the
  ffmpeg route takes too: [§12](12-scene-camera.md#through-the-camera)), encoded with WebCodecs and
  muxed (`mp4-muxer`: MP4 with H.264 or AV1; `webm-muxer`: WebM with VP9 or AV1) in memory,
  or, with a `sink` in the options (`VideoSink`: writes at byte positions, a
  `FileSystemWritableFileStream` behind it), written as it goes through the muxers' stream targets
  — the MP4 `moov` box then comes last and the WebM duration is patched through the sink — so a
  long video never sits whole in memory (first Codex audit, R2); the companion's result streams to
  the same sink (`jobResult`).
  The codec string comes from `isConfigSupported` (H.264: High, Main, Baseline at the smallest level
  that fits the picture and the macroblock rate; VP9 and AV1 by picture size), the bitrate defaults
  to 0.15 / 0.10 / 0.08 bits per pixel per frame (H.264 / VP9 / AV1, 0.5–80 Mbit/s), a keyframe is
  forced about every 2 s, and the exporter pauses while the encoder's queue is longer than 8 frames
  (3 above 1440p). Chrome's software H.264 encoder (OpenH264, in its camera mode) leaves specks
  behind what moves: a macroblock in which only a few pixels of the object are left is judged
  unchanged and skipped, whatever the bitrate (its P-frames are at QP 12), and the 2×2 remains stay
  at macroblock corners until the next keyframe. `contentHint: "text"` in the configuration would
  switch it to its screen-content mode, which nearly ends them and quantizes at 26 instead (about
  1.4 dB less, a faint ringing at edges); it is not set (owner's choice, 2026-11-11: the companion's
  x264 is the clean way and VP9 leaves far fewer, and [the README](../../README.md) says so).
  `outputWriter.ts` additionally bounds queued sink copies at 16 MiB, applies backpressure from 4
  MiB, and uses 256 KiB muxer chunks. Write failures stop encoding promptly; drain is cancellable.
  These bounds do not cover codec internals, muxer metadata or Blob fallback. Timestamps are
  `round(k · 10⁶ / fps)` µs and each frame lasts until the next timestamp, so the file lasts exactly
  `frames / fps` (the WebM Segment duration, which webm-muxer sets to the start of the last frame,
  is rewritten). `AbortSignal` closes the encoder and rejects with the signal's reason. Without
  WebCodecs there is no fallback: `MediaRecorder` cannot be driven frame by frame and writes
  variable-rate files whose duration is not `frames / fps`, so the exporter fails with
  `VideoUnsupportedError` and the dialog points to the companion. The logic is
  `createVideoExporter(env)`, run in tests with fake encoders, canvases and muxers.
- **Companion, ffmpeg** (`exportVideoViaCompanion`, `POST /video`,
  [docs/COMPANION.md](../COMPANION.md)): the same frames drawn the same way, saved as PNG and sent
  in order, up to 32 frames per request with one request in flight while the next batch is drawn;
  ffmpeg encodes (more formats: ProRes, GIF). The job is always deleted at the end. A job the
  companion refuses or stops (its video passed the limit of that companion, or the disk of its
  temporary folder is nearly full) fails with the message of the companion, which the dialog shows
  as it is. With a soundtrack (`export/video/soundtrack.ts`) the job is created with `audio` and the
  mix goes first, before any frame: one WAV file (16-bit PCM, stereo, 48 kHz, exactly `round(frames
  · 48000 / fps)` samples) sent in order in requests of at most 4 MiB while it is mixed, which the
  companion's ffmpeg encodes next to the video in a second pass.
- **Companion, Render with Manim** (`renderWithManim`, `POST /manim-render`): the exported `.py`
  (`generatePython(exportProject(project, values), resolved, { target, sceneName, indexing: 'auto',
  comments: true })`: the project with the dialog's size and frame rate in its metadata, so that the
  frame-safe durations and the frame width of the Python describe the very video the companion
  renders with those values) rendered by the configured Manim interpreter; disabled unless the
  companion was started with `--allow-manim-render`, because it runs Python code it receives. With
  a soundtrack the request carries `audio`, the mix is sent before the first status request (Manim
  starts when the companion has it whole), and the job passes through `encoding` while ffmpeg adds
  the sound to Manim's video.
- **Dialog** (`ui/export/VideoExportDialog.tsx`, rules in `videoExportModel.ts`): size (project
  size, 720p–2160p, custom; a warning when the aspect differs from the project's), frame rate, range
  (whole scene only for Render with Manim: the Python exporter has no range), and the encoder. An
  encoder that is unavailable stays visible, disabled, with the reason (no WebCodecs, companion
  offline or older than 1.1, no ffmpeg, Manim rendering off, no interpreter for the chosen Manim).
  With Companion · ffmpeg a line says how large a video that companion writes
  (`companionVideoLimit`: `limits.videoBytes` of `/health`, with the option that gives another
  limit; a warning with a companion older than 1.7, which sends none and may return a video cut
  short at 4 GiB). Browser formats are filtered by `probeCodecs` for the chosen size, and the
  Browser format says about how large the file comes out (`estimatedVideoBytes`: the default bitrate
  over the length), with a warning above 1 GB when the file would be assembled in memory. With the
  File System Access API the dialog asks where to save the file before encoding (the picker needs
  the click) and the file is written as it goes, thrown away on failure or cancel; without it the
  file is downloaded at the end. Progress shows the frame counter. Cancellation or document/job
  supersession is checked after cleanup and final drain, before publication; cancellation aborts the
  owned file immediately and deletes the companion job. Once irreversible file close starts, the
  phase is **Saving**: cancellation is disabled and closing only dismisses the dialog. The component
  is the form; one export is `videoExportRun.ts` (`runVideoExport`: the destination, the encoder,
  its progress put into words, how it ends — what it touches of the world comes in as `deps`, so its
  tests run it with fakes), driven by the hook `useVideoExport.ts` (one export at a time; `start`,
  `cancel`; unmount cancels before commitment). Export waits while a formula on the timeline renders
  or has only a render of an earlier LaTeX (`videoReadiness`, as the Python dialog does); one whose
  LaTeX fails is drawn as its last good render by Browser and ffmpeg (left out when it never had
  one) and blocks Render with Manim, which gets the LaTeX. A font text with nothing to draw it,
  neither a saved shape of its current source, font and size nor boxes, holds every video back
  (`textHasShape`). One drawn as placeholder boxes
  ([§4](04-formula-engine.md#placeholder-boxes-a-font-text-nothing-has-shaped)) is filmed by Browser
  and ffmpeg as the preview shows it, and Render with Manim draws its real glyphs, counted one per
  character or, where the boxes stand where the glyphs of a saved shape were, as that shape had them
  (`VideoReadiness.boxes`, `savedBoxes`): the dialog says which, and holds nothing back. But boxes
  whose glyphs nothing counts (`uncounted`, the generator's own rule) are a text the Python would
  leave out: Render with Manim, which gets that Python, is off for it, as Copy and Download are in
  the Python dialog. One that only failed to be shaped again, for the project's new library say, is
  drawn from the shape it has, as the preview draws it, and Render with Manim writes it from that
  shape ([§8, "Font text"](08a-export-python.md#font-text)). One whose fonts or versions changed
  since it was shaped, or that the companion cannot compare, is a note under Render with Manim and
  no more (`textVerification`, D82): the render goes on. On success the file `<project name>.<ext>`
  is downloaded.

The companion client's result reader distinguishes transport failures from destination I/O errors.
A failed local sink keeps its original error and does not mark the companion offline. Unfinished
readers are cancelled and their locks released on every owned exit path.

### The frame as an image (`export/image`)

**Export ▸ Image…** writes one frame of the scene, the playhead's, as a PNG file. `frameImage`
(`export/image/frameImage.ts`) is the first frame of a video that starts at that instant: it calls
`frameDrawer` (`export/video/frames.ts`) with `start = t` and draws frame 0, so what a video shows
at an instant and the picture of it are the same code — `exportEvaluator` (the tracks hidden in
the Preview are drawn) and, for a scene whose camera does something, `sceneFraming`
([§12](12-scene-camera.md#through-the-camera)). The evaluator keeps the instant within the scene:
past its end, the picture is the end's.

- **Size.** The picture has the project's pixels times `scale` (`IMAGE_SCALES`: 1 or 2;
  `imageSize`). The scene is evaluated in the frame of those pixels, which has the project's shape:
  the same scene through the same camera, on more pixels.
- **Transparent.** The canvas is made with an alpha channel (`browserPngCanvas(width, height,
  alpha)`, `offscreen2d`: the canvases of a video are opaque) and the frame is drawn with the
  background `'transparent'`, a colour that paints nothing: the renderer needs no other way of
  drawing, and the canvas keeps the nothing it started as wherever nothing is drawn.
- **What it is drawn with** comes in as `FrameImageDeps` (the canvas and the `Renderer`), as the
  companion's video takes its own: Node has no canvas, and the unit tests record what the renderer
  is asked and compare it with what `frameDrawer` asks for the frame of a video at the same instant.

The dialog is `ui/export/ImageExportDialog.tsx` (the request `{ kind: 'image' }` of
`ui/export/exportStore.ts`, mounted by `ExportHost`). Mounted, it pauses the main playback: the
instant it shows is the one it draws (`frameInstant`, the playhead within the scene). What it waits
for and tells of is `imageReadiness` (`ui/export/imageExportModel.ts`), built on `videoReadiness`:
it waits for a formula that is rendering wherever it is on the timeline (what is on screen can hang
on one that is not: a brace on its formula, a line on its ends), and tells only of the formulas on
screen at the instant (`onScreenAt`, the evaluator's own test) — a LaTeX that fails, a font text
drawn as boxes, an empty formula —, holding the picture back for a font text that nothing can draw,
as every video is. One export is `runImageExport` (`ui/export/imageExportRun.ts`; the world comes
in as `deps`): the file picker first, where the browser has one (it needs the click), then the
picture, then the write, to the file chosen or as a download. The project, its renders and the
instant are captured at the click, after `history.cancelForeignGesture()` has put back what a drag
still held had moved; `ownsRun` (the dialog still open, on the same document:
`currentDocumentCheck`) is asked after each wait, and nothing is written once it says no. A picture
the browser cannot make (a canvas has a largest size) is told with its pixels and the browser's own
words. The file is `<project> <instant>s.png` (`imageFileName`: the instant to the hundredth of a
second, so the frames of a project have each a name). The dialog keeps the size and the background
it was left at in a variable of its module: the next picture of the session starts from them, and
nothing of it is stored.
