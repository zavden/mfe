# Architecture §11 (6 of 6): Media, packages, audio

[Index](../ARCHITECTURE.md) · Previous:
[§11 Chroma Lab and editor palettes](11e-chroma-lab-palettes.md) · Next:
[§12 The scene's camera](12-scene-camera.md)

Holds §11's subsections *Durable original media and portable projects* (`media/`: originals and
their owners, packages, Save, the collection) and *Audio plan, clocks and exports* (`audio/`,
`export/audio`, the sound of a video).

See also: [What the browser keeps](11b-ui-history-state.md#what-the-browser-keeps) ·
[§8 Video](08b-export-video.md#video-exportvideo) · [Pango text and durable
appearance](04-formula-engine.md#pango-text-and-durable-appearance) · [docs/FORMAT.md, the portable
package](../FORMAT.md#portable-package-mfe-container-version-1)

---

### Durable original media and portable projects

`media/` owns immutable source bytes and portable project containers; its public entry point is
`media/index.ts`, and it depends on `model`, never on `ui`. `IndexedDbMediaRepository` uses the
separate `mfe-original-media` database, with `originals` keyed by lowercase SHA-256 and `owners`
keyed by an explicit operation/document owner ID. Original Blobs work in HTTP and `file://` mode;
OPFS is not required. Decode windows and waveforms remain discardable data in `audio/`.

`hashBlob` computes SHA-256 incrementally with at most one 1 MiB source slice plus a small hash
state. `storeOriginal` atomically inserts the original and its import owner, deduplicating shared
bytes without changing an existing original. It resolves only after the IndexedDB transaction
completes. Blocked, unavailable, quota, transaction, corruption and missing-original failures are
observable `MediaStorageError`s; the older handle-storage helpers that swallow errors are never
used for original audio. No source bytes enter the undoable project store or localStorage, and
none are encoded as base64.

`pinOwner` verifies every requested original and replaces the owner set in one transaction with the
original store. `pinAvailable` does the same for a project that may lack originals: the owner holds
the ones that are stored, and the hashes of the others are returned. `collectUnowned` reads all
owners and deletes only unreferenced originals in that same cross-tab transaction domain. Within one
repository, mutations reserve their order before opening a connection, so a pending Save pin cannot
be overtaken by a later history change. An owner has no expiry of its own: the collection described
below releases the owners of pages that are gone.

`importAudioOriginal` accepts an audio-inspection callback and returns metadata plus a durable
import lease. The Creator commits metadata only after that succeeds, then awaits
`ui/project/mediaOwnership.ts` before releasing the import lease. Its history owner covers the
current project, both temporal stacks and a gesture's cancellation baseline. Synchronization is
serialized, so a delayed old set cannot replace a newer one. The same handoff applies to package
Open, and a failure retains the import owner. A long import cannot replace a document whose session
changed while it was running. The Audio tab (`ui/creator/AudioTab.tsx`) imports the files of its
picker and the files dropped on it (`useFileDrop`; any drag of files, since a browser may not tell a
file's type before the drop: what is not audio is refused by name once dropped) one after another:
files given while an import is under way wait for their turn, and Cancel or another document drops
the ones still waiting. A file whose content the project has adds nothing: it repairs a missing
original, or a notice names the recording it already is. A file whose name another recording has
(`creator/audioNames.ts`) is stored and then asks for a name of its own, in a dialog that asks for
one line of text (`promptDialog` in `ui/project/dialogStore.ts`: the field starts selected, and its
button and Enter wait for a text that passes the caller's check); declined, its import lease is
discarded and nothing of it is kept. Missing originals remain represented by their metadata and are
reported for repair instead of being silently removed. The history owner is written only when its
set of hashes changes: most edits leave it as it was, and a drag sends one per frame. A project's
metadata outlives its originals, so the owner holds the ones that are stored (`pinAvailable`). The
same file imported again brings an original back without changing the project, and the store can be
emptied under an open page: a hand-over (`syncCurrentMediaOwnership`) therefore always writes the
owner, whatever it held. `onMediaArrival` tells the autosave, which pins its recovery owner anew at
its next write.

Failed or abandoned imports release their temporary owner and collect only hashes touched by that
import, checking all remaining owners atomically. Another tab's source and unrelated unowned bytes
are left alone. If cleanup itself fails, the bytes are retained and the original failure is still
reported; a cleanup error never replaces the corruption, cancellation or storage error.

`preparePackage` captures and pins every project-owned original, including unused and muted Audio
entries. `writeTo` waits for each bounded write and never closes the real destination: the existing
Save transaction owns close/abort, same-file ordering and the captured revision's clean baseline.
Edits during Save remain dirty, and a completed Save from a replaced document cannot claim the
replacement. A JSON document gains a new `.mfe` destination when audio is present; a selected `.mfe`
destination always contains a package. The fallback composes original Blob references and publishes
a download once the package is prepared. Browser backing-store memory and disk cost still matter for
large outputs even though no whole-output JavaScript buffer is assembled.

<a id="a-project-without-recordings-is-one-mfejson"></a>
**A project without recordings is one `.mfe.json`.** `prepareProjectFile`
(`media/embeddedGeometry.ts`) is to that file what `preparePackage` is to a package: it pins the
geometry of the captured project, reads each one as a payload is read (`readTextGeometryPayload`)
and gives the text of the file, with the values in its `textGeometry` section. It carries at most
`MAX_EMBEDDED_GEOMETRY_BYTES` (64 MiB) of geometry, by the sizes the references state, and refuses
more before anything is read. Save chooses between the two by the captured project (`runSave` in
`ui/project/actions.ts`): a package when it has recordings, when its texts state more geometry than
a `.mfe.json` carries (`fitsProjectFile`), or when plain Save writes a document whose file already
is a `.mfe` (Save As decides anew); a `.mfe.json` otherwise. The rest of the transaction is one
for both: the wait for the destination, what the destination can give back, the question about
missing media, the write and the clean baseline. They differ in one thing.
A stored geometry that is damaged, or is not the render its text names, fails a package; a
`.mfe.json` is written without it, as missing, because a project is not held back for data that can
be derived again.

<a id="saving-without-missing-media"></a>
**Saving without missing media.** A payload that is not stored fails `preparePackage`, unless the
caller passes `allowMissing`: then the package is written without it and lists its hash under
`missing`. Save (`ui/project/actions.ts`) prepares its package that way. If something is missing, it
first reads the file it is about to replace (`recoverOriginals` for a package,
`recoverEmbeddedTextGeometry` for a `.mfe.json`): the file a project was opened from still holds
what the browser lost, so those originals are stored again, handed to the history owner and written
into the new file, without a question. Replacing that file otherwise would destroy their last copy:
a file that still holds a lost original which could not be read back (the store refused it, or its
copy in the file does not pass its checks: bytes that do not match, a member changed by hand or
written again by another program, a later format), and a file that cannot be read or understood at
all (offline, locked, a package of a later version, a `.mfe.json` that is not valid JSON any more),
is not replaced while originals are missing, and the error points to Save As. Neither is a file
whose copy came back and is still not what the browser gives: the browser's own copy is then the
damaged one. Only a file that is no longer there, or that is no project, counts as holding nothing.
For what is still missing, a dialog names each original and the file it came from. "Save without the
missing media" writes the file, Cancel writes nothing and leaves the document unsaved; the answer is
asked once per command, and the download fallback asks the same. `ui/audio/missingMedia.ts` keeps
the set of recordings without an original: one read of the store when the project's recordings
change, when media is imported and when a document opens, reported once per document with the files
to import again. The timeline, the Audio panel and the Audio tab mark their clips from it. A repair
by import marks a document that has a file as unsaved (`documentStore.mediaReturned`, by content
hash), whatever the project says: its file may lack the recording, and the next Save writes it. A
save takes out the hashes its file carries, so a recording that comes back while a file without it
is being written keeps the document unsaved. A text geometry the store had lost, shaped again by a
companion to the same bytes, is marked the same way: the render sync stores it and puts the
reference back as it was, which is no edit, so it announces the return
(`store/mediaOwnership.ts`, `onMediaReturned`) and the document tracking takes note. A known gap
remains on the other side: a geometry the store loses under a page that still draws it from
memory is not stored again by that page. The text stays exact on screen and is missing for Save,
which takes it back from the file it is about to replace, or asks.

`media/package.ts` implements the independent container version described in
[FORMAT.md](../FORMAT.md#portable-package-mfe-container-version-1): a fixed 16-byte header, a
bounded UTF-8 manifest and hash-sorted original payloads, at most `MAX_PACKAGE_PAYLOADS` (4,096) of
them, carried and missing together: the reader checks that before it parses the project, and the
writer refuses the same. A project the app does not open inside a whole container — a newer
format, a field out of place — is an `UnopenedProjectError` with the reason `parseProject` gives,
not a `corrupt` package. Imports check exact contiguous ranges, original sizes and incremental
SHA-256 before publishing project metadata. That takes time with hundreds of megabytes, so File →
Open runs it as a task (`withProgress` in `ui/project/progressStore.ts`): `importPackage` reports
the bytes that are in and takes the signal of Cancel, and `ProgressHost` shows the dialog once the
task has lasted 400 ms, so that a small file opens without one. A cancelled opening lets go of what
it copied, opens nothing and reports nothing. One file is opened at a time: a request that arrives
while one is on its way (a double click on a project of the list, before any dialog shows) is
ignored, so that the task the user watches and may cancel is the only one; the store keeps
overlapping tasks apart all the same, each with its own Cancel. Project-library listings read only
the header/manifest; live entries reopen their file handle, while fallback snapshots retain the
package Blob without decoding its payload. Legacy JSON listings and migrations remain valid.

Audio autosave uses record version 4: the ordinary metadata record additionally carries a durable
`mediaOwner` token. `ui/project/autosave.ts` serializes media pins before publishing that record;
generation and document-session checks discard obsolete completions. An original that is not stored
does not hold the record back: the record says what the project is, and its owner holds what there
is of it (`pinAvailable`). Once every original of a write is settled, held or known to be absent,
metadata-only changes still flush synchronously on page hide; a hand-over of media
(`onMediaArrival`) unsettles everything, so that the next write pins the owner anew. A failing media
store keeps the preceding recovery record, and failed sets do not poison later writes.
Copy-before-delete recovery preserves the owner token in both copies, including a suspended tab's
retained source. Backup records preserve it too.

<a id="who-owns-what-and-for-how-long"></a>
**Who owns what, and for how long.** Every owner id is `kind:page:number`, and the page is the
autosave session of the page that made it (`setMediaPage`, called by `ui/project/autosave.ts`): the
session's alive mark is what lets another page ask whether the owner's page still exists.

| Owner | Holds | Released |
|---|---|---|
| `history:<session>:n` | the open project, both undo stacks, a gesture's baseline | when its page leaves for good (`pagehide` without `persisted`, after the autosave's last write); otherwise by the collection |
| `recovery:<record key>:<document>` | every original the document's autosave records referenced | by the collection, once no stored record names it |
| `import`, `package-import`, `text-geometry` | what an import stored, until the history owner has it | by the import; otherwise by the collection |
| `pending`, `save` | the project a save captured (`pending`), then what its file is written from (`save`) | when it ends; otherwise by the collection |
| `export` | the recordings an audio or video export mixes, and no other | when it ends; otherwise by the collection |

While its page is open the history owner is written again every `OWNER_TOUCH_MS` (4 min), and when
the page comes back from the back/forward cache or is resumed (`reassertMediaOwnership`).

<a id="collection"></a>
**Collection** (`media/collection.ts`, `ui/project/mediaCollection.ts`). Pages close, crash and are
discarded without releasing what they own, so a later page does it for them. A pass runs a few
seconds after startup and after the autosave pruned a record: it lists the owners, asks the autosave
(`autosaveClaims`), releases the abandoned ones and then removes the originals without any owner
(`collectUnowned`). An owner is abandoned when all of this holds:

- it was last written more than `OWNER_GRACE_MS` (10 min) ago;
- its id is one this app names (any other is never judged);
- it is not a recovery owner that a stored record names: listed, hidden (`taken`), legacy, or the
  backup of an unreadable record;
- its page will not come back: it has no alive mark (it left in order) and no away mark younger
  than a day (it is not in the back/forward cache), or its mark is stale or taken, it has no
  autosave record and the mark is more than a day old. A page behind a stale mark that has a
  record may be suspended or discarded: it keeps everything until the record is pruned.

An owner whose page name is not a session of this app was written by an earlier version, whose
tabs may still be open and which no mark speaks for: it is not judged this way, and goes when
nobody wrote it for a week (`OWNER_FORGOTTEN_MS`).

The release is conditional on the owner still being as it was listed (`releaseUnchanged`): a page
that wrote its owner meanwhile keeps it. A page that cannot read its own alive mark judges nobody. A
page whose record was pruned or taken while it was away pins its recovery owner again before it
publishes the record again. Being wrong here loses a recording and being slow only keeps bytes
longer, so every doubt keeps; a recovery owner even holds every original its document ever had,
because copies of its record in other tabs name it too. Three cases are knowingly left out. A page
frozen for more than a day that has no autosave record: as a rule it changed nothing since it opened
its file, but a page whose autosave could not be written (the user was told) is in the same case
with unsaved work. A page suspended until its record was pruned (a week, or more than five newer
records taken): it resumes with its project and finds gone the originals that nothing else held. And
a page that could write neither mark (no room in `localStorage`): only the rewrite of its history
owner speaks for it, so it must not stay frozen or cached for more than about six minutes (the grace
less one rewrite), and a save or an export it runs for a document that was replaced loses its lease
after the grace.

`navigator.storage.persist()` is requested once per page, at the first audio import or package open
that stores an original (`media/persistence.ts`): browser storage is "best effort" by default and
may be evicted under disk pressure. Nothing depends on the answer, and a complete portable `.mfe`
file remains the transferable saved project.

<a id="where-the-browser-has-no-database"></a>
**Where the browser has no database** (its storage is blocked by a setting or a policy, a sandboxed
frame). `mediaRepository` is the database with the page's memory beside it
(`media/sessionRepository.ts`). A store marked `derived` — the geometry of a font text, whether it
comes from the companion, from a `.mfe.json` or from a package — that the database refuses as
unavailable is kept in memory instead, under the same rules of ownership, for as long as the page
lives. Nothing else is: a recording is refused as before, because until a package is saved its bytes
would exist nowhere else. Reads look in memory first; pins, releases and collection go to each side
for what it holds (without a database the collection pass lists no owners and frees what memory
holds unowned; that is little in practice, since the page's own recovery owner keeps every
geometry its document had, so memory there is bounded by what the page shaped or opened, and goes
with the page). Whoever pins a project's media says which of its hashes are derived data
(`derivedMediaHashes`: the document's owner, the autosave's and a save's). Without a database, a
derived payload that memory does not hold is answered as missing, which loses nothing: the text is
one whose geometry is missing, and Save asks about it. A pin that names anything else memory does
not hold (a recording) fails as before, since nobody can tell whether it is stored. A project with
text thus opens, draws, autosaves and saves from its file alone in such a browser. A reload there
loses the memory: the text is then one whose geometry is missing, until its file is opened again.

### Audio plan, clocks and exports

Format 16 keeps `audioAssets` and `audioClips` separate from visual formulas and clips. Tracks are
explicitly visual or audio. `model/audio.ts` owns source-time mapping, sample-boundary rounding,
linear-amplitude volume interpolation, trims, split, duplication and fades. A source window is
`sourceStart + timelineTime - clip.start`; its end derives from `clip.end - clip.start`. Points
outside a trim remain authored data. Split copies the entire curve to each independent clip,
renews the right-hand IDs, and creates no fade at the cut. Fade commands replace point records in
the selected source interval. Their default is half the clip length, capped at 0.5 seconds; an
untouched editor default follows trims while an explicitly entered duration remains unchanged.
Muting affects playback/export; locking affects edits only.

`temporalClips` provides shared spans; timeline editors use `Clip | AudioClip` only for movement,
selection and navigation, narrowing before visual or audio-specific edits. Visual placement,
attachment, glyph operations and animation blocks never accept audio rows. Track depth counts
only visual rows. `visualProject` is the common Manim projection, applied before native duration,
frame totals, validation and code generation. Explicit scene duration survives projection; an
automatic duration uses only visual clip ends. The original captured document still owns export
cancellation and publication. Stable visual selectors keep curve-only edits from rebuilding
formula geometry while allowing browser preview duration to follow the audio tail.

`audio/engine.ts` decodes native-rate stereo windows through Mediabunny's incremental sample sink.
A global 32 MiB PCM cache and four cursors serve playback, export and waveform work. Each cursor
has a 1 MiB compressed source cache; individual decoded packets are capped at 2 MiB. Reads are
serialized with foreground priority, so background waveform scans cannot build an unbounded
queue. Multiple cursors can address one recording at distant positions. Original bytes remain in
`media/`; decoder pages may be discarded at any time. Cache budgets do not describe total browser
RAM: codec internals, garbage collection, document metadata and input/output indices have separate
costs measured by the duration probes.

`audio/channels.ts` folds the decoded channels to stereo with fixed weights, in the conventional
speaker order. Mono is duplicated at unity and front left/right keep unity; the centre and each
same-side surround enter at −3 dB (√½); the back centre of a 7-channel layout is split 0.5/0.5; the
LFE channel is left out. Nothing is normalized, so the shared peak meter can report sums above
unity.

`audio/plan.ts` captures audible clips and mixes bounded 4,096-frame stereo blocks at 48 kHz.
Absolute source and output sample indices avoid cumulative rounding across chunks. Resampling uses a
phase-indexed Blackman-windowed sinc filter and shared source halos; seek and block boundaries do
not reset its phase. The resampler filter cache is capped at 8 MiB. Volume is linear amplitude, with
zero as silence and gain one as 100%; mixing reports peak/clipped samples rather than silently
normalizing. Source codec priming remains separate from timeline trim. Participating clips require
an audio row and a source window within the asset duration (using the model time epsilon); malformed
unmuted clips fail preparation/export instead of becoming silence. Valid muted rows and clips
outside the selected export range remain excluded. `unavailable` names the originals, by content
hash, that are known to be missing: their clips are left out and the range stays as it was. The
editor's playback passes it; an export does not, because there a missing original is an error, not
silence.

`audio/playback.ts` schedules Web Audio nodes ahead of the device clock, with at most six current
nodes and a 300 ms lookahead, plus nodes retiring during a 5 ms edit transition. Preparation
establishes the clock anchor only once the first block is ready. Loops are scheduled ahead;
requestAnimationFrame only follows audible time. The main transport reads the output timestamp,
cancels stale preparation/frame callbacks on seek or replacement, and updates the audible plan
during curve edits. Interactive edits replace future samples at one quantized boundary with a short
5 ms transition; these transitions are absent from authored split boundaries and exports. Late
production reports underruns and skips late samples to preserve synchronization. Visual-only
documents retain the lightweight playback controller. The main transport plays without the clips
whose original is missing (`ui/audio/missingMedia.ts`), with one notice per document. If the loss
shows up under the open page (`MissingOriginalError` from the engine), it looks at the store again
and goes on from where it stopped, unless the user did something else meanwhile.

Waveforms use per-source min/max pyramids, at most 65,536 base bins and a global 16 MiB summary
cache. The UI serializes background scans and shares them between clip instances. Completed
promises do not retain evicted summaries. Each visible graph has a bounded pixel span; points and
clips outside the visible time band remain in the model for keyboard navigation and undo. Audio
rows draw the curve on the clip, with separate caption/trim handles and numeric properties. The
curve is edited there only for the clips whose line button is on (`volumeLines` in `Timeline.tsx`: a
view state by clip id, emptied when a project loads, never saved; `lineEditable` in
`AudioClipBlock.tsx`): then the graph keeps the presses for the segments and points, and the caption
moves the clip. For the others the line and its points are a drawing with no handler, so a press
anywhere on the clip is the clip's (`startMove`) and a double-click opens its editor. The minimum
timeline zoom follows duration and viewport width, allowing an hour to fit. The volume axis is
percentage amplitude, with 100% at mid-height (`ui/timeline/volumeScale.ts`): 0–100% takes the lower
half of the graph and 100–400% the upper half, each linear, so a segment is drawn straight, with a
corner where it crosses 100%, and pointer drags read gains off the same scale. Segment drags shift
their enclosing authored point gains by one shared clamped delta, retaining times and slope;
adjacent segments follow their shared endpoints. Point and segment gestures have distinct hit areas
and one history owner. Numeric Add point and Enter insert at the existing interpolated gain without
changing the sound.

`export/audio` writes PCM16 WAV directly or continuously encodes Opus or AAC. The app carries no AAC
encoder: `canEncodeAac()` asks the browser's WebCodecs once, M4A is offered only where the answer is
yes, and `videoAudioEncoding()` gives an MP4 AAC there and Opus elsewhere (Chrome on Linux), which
the video dialog announces as a compatibility warning, with a button that switches to the
companion's ffmpeg and MP4 when that ffmpeg can add AAC sound. An earlier build embedded FFmpeg's
AAC encoder as WebAssembly; FFmpeg is LGPL, and `build/distributionCheck.ts` now fails a build
whose scripts carry FFmpeg's marks. The custom small WebM writer preserves CodecDelay,
BlockDuration, DiscardPadding and video frame duration, interleaves bounded packet queues, and
writes seek cues.
MP4 forwards encoded packets with explicit final presentation duration, and the encoder's lead-in (a
negative first timestamp) becomes the edit list of the track, for Opus as for AAC. Tests distinguish
native presentation length from the codec-frame padding returned by some decoder APIs. Installed
third-party license notices accompany builds under `licenses/`.

The end of the last packet of an MP4 is stated by `mp4TrackEnd()` (`export/audio/mp4Timing.ts`).
The muxer counts the edit list in the movie's clock, 1.2 ticks a sample, as the rounded span of the
track plus the rounded lead-in: two roundings that can add up to 0.8 of a tick, when 0.6 is already
half a sample. For some lead-ins and lengths the file would then present a sample more, or less,
than the sound has (48 001 samples after the 2 112 of Apple's AAC encoder, the one of a browser on
a Mac, read as 48 002). Only the rounded values of that end reach the file: stated a fraction of a
sample away from the true end where it has to be, it makes both roundings land on the nearest
tick, and the sample tables keep the true count. `mp4Timing.test.ts` muxes packets with eight
lead-ins and ten lengths and reads the boxes of each file.

That lead-in is the encoder's priming. An AAC decoder gives each 1 024 samples from two overlapping
frames, so the first frame of a stream never decodes to the sound, and the edit list leaves it out.
Chrome on Windows encodes AAC through Media Foundation, which starts its stream with the sound (the
first packet at zero): the first 640 or so samples of every export decoded as silence rising to the
sound. `createAudioEncoder()` learns the lead-in of the browser's AAC encoder once per page, from
two frames of silence, and encodes before zero the silence that completes it to one frame
(`export/audio/priming.ts`). An encoder that primes a frame or more itself (FFmpeg's 1 024, Apple's
2 112 on a Mac) gets nothing, nor does one that could not be asked, and Opus states its own priming,
the pre-skip. `encodingPriming.test.ts` plays the encoder, with each of these lead-ins.

Browser video with audio reuses the existing canvas renderer, codec selection and frame schedule.
For range start `r0`, `N = round((r1-r0)*fps)` video frames define output duration `D = N/fps`, and
audio uses `round(D*48000)` samples starting at `r0`. Both streams start at output timestamp zero.
Production lead and mux/output queues are bounded; the final video iteration always consumes the
complete quantized audio range, including at one or two frames per second. The existing video
exporter remains the path
for visual-only browser output. Standalone audio requires neither an evaluator nor visual size,
frame-rate or formula-render readiness.

The companion's ffmpeg video takes the same mix of the same range (`planSound` in
`videoExportRun.ts` builds it for both): the companion encodes it, AAC in MP4 and MOV and Opus in
WebM, so an MP4 with AAC does not depend on the browser. The dialog offers it for the formats the
companion lists in `capabilities.videoAudio` (`companionAudioAvailability`, which also says why
not: a GIF, an older companion, an ffmpeg without the encoder). Render with Manim takes it too,
for `mp4`: the Python stays the visual project's (`exportProject`), and the mix is that of the
captured project from zero to the end of the visual scene, `frames / fps` of the request. What the
sound goes on after the last animation (`soundTail`) is left out, and the dialog says how much
before the export. The exported Python omits audio: `generatePython` works on the visual project,
and the header of the file (`assemble.ts`) gives the frames of that scene, "like the editor's video
export" only when the editor's video has as many; when the project's sound makes it longer, the
header gives both counts instead.

`runVideoExport` captures the project and holds the recordings its mix reads until it ends
(`holdRecordings` in `ui/export/soundSources.ts`: an owner of its own in the media store, only for
the unmuted clips of the range), then runs the selected browser A/V, companion or audio-only
exporter. A recording the browser no longer holds stops the export before anything is encoded, with
a `MissingRecordingsError` that names it and says what brings it back, and the page looks at its
media again so that the clips get their marks. File writes remain guarded by document ownership, and
only the run owner closes or aborts the actual destination. Encoder bridge finalization drains
writes without publishing the file. Cancellation before publication discards partial output; once
close starts, late cancellation cannot claim that publication was undone. Without a writable
destination the file is assembled in memory: the A/V and audio writers share
`export/video/memoryFile.ts` (pages written by position, one Blob at the end), which has no size
limit of its own. The video dialog estimates the size, sound included, and warns above 1 GB
(`IN_MEMORY_WARNING_BYTES`); when the browser refuses the memory (`isOutOfMemory`), `runVideoExport`
reports it in the app's words, with the engine's own in them. Portable project packages compose
original Blob references instead of decoding or base64-encoding recordings.

The first audio placement/export limit is 60 minutes, optimized for normal projects below 15
minutes. Longer sources remain importable through selected intervals. This limit is an audio
workflow constraint, not a new cap on legacy visual project metadata: a scene can be longer.
`createAudioPlan` plans a range of any length, and the main transport plays the whole scene with its
audio. What goes into a file is the export's to check (`AUDIO_EXPORT_SECONDS`, `soundLengthProblem`
in `videoExportModel.ts`): the video dialog leaves the sound out of a longer video and says why, the
audio dialog asks for a shorter range, and `runVideoExport` refuses. Audio processing time and video
frame-rendering time are separate performance measurements.
