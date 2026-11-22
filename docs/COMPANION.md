# Companion (protocol v1)

`companion/mfe_companion.py` is an optional local helper. The web app works without it; with it,
formulas are compiled by real LaTeX exactly as Manim compiles them, so glyph order, shapes and
positions match Manim's (exact mode) — in math mode and, since 1.3, in text mode (`Tex` /
`TexText`). Since 1.1 it also encodes video with ffmpeg and renders the exported Python scene with a
local Manim install ("Video and Manim rendering" below); since 1.5 its ffmpeg adds the project's
sound to either. Since 1.4 it also returns Pango font catalogs and verified native `Text` contours,
using the configured Manim interpreters; since 1.6 nothing of font text starts until a request needs
it (`pango` under `GET /health`). Since 1.7 a video that passes the companion's limit fails and says
so, where before it could come back cut short, and the limit is an option of `serve` (*The limit of
a video*). The service itself still imports only the Python standard library.

TypeScript mirror of this protocol: `app/src/engine/types.ts` (`CompanionHealth`,
`CompanionTexRequest`, `CompanionTexResponse`, `CompanionVideoRequest`, `CompanionManimRequest`,
`CompanionJobStatus`) and its client `app/src/engine/companion.ts`.

## Requirements and running

- Python ≥ 3.10, **standard library only**.
- `latex` and `dvisvgm` (≥ 2.4) on `PATH` (TeX Live; MiKTeX on Windows). Optional: `ffmpeg`.
- Optional Manim interpreters, for "Render with Manim": `--ce-python PATH` / `--gl-python PATH`
  (or `MFE_CE_PYTHON` / `MFE_GL_PYTHON`), plus `--allow-manim-render` (or
  `MFE_ALLOW_MANIM_RENDER=1`) to enable the endpoint. `--manim-timeout SECONDS` (default 600) is the
  time limit of one render; `--sandbox-gpu` (or `MFE_SANDBOX_GPU=1`) lets the sandboxed Manim use
  the GPU (see *Sandbox status*).
- A video is written in the system's temporary folder while it is encoded, so what a long video
  needs is room on that folder's disk, not memory (where `/tmp` is a tmpfs, as on Fedora, that disk
  is memory and swap). `--max-video-gib N` (a whole number from 1 to 64, default 4) is the largest
  video one job may write, and a job is stopped when less than 1 GiB is left free on that disk;
  `TMPDIR` names another folder (1.7, *The limit of a video*).
- Pango text uses those configured interpreters without enabling arbitrary Python rendering.
  In version 1.0 the mapping adapter supports Linux only, with Pango 1.50 or newer, Cairo,
  Fontconfig and ManimPango in the existing environment. Nothing of it is probed when the companion
  starts (1.6): a library is `unused` until a request needs its text worker, and missing native
  symbols or backend support then leave it `failed`, with the reason (`pango` under `GET /health`).
  No Python package or native library is installed.

```bash
python3 companion/mfe_companion.py serve              # http://127.0.0.1:7799
python3 companion/mfe_companion.py serve --port 7800
python3 companion/mfe_companion.py serve --app app/dist   # also serves the built app at /app/
python3 companion/mfe_companion.py serve --ce-python /path/to/ce/bin/python --gl-python /path/to/gl/bin/python \
        --allow-manim-render                          # also "Render with Manim"
python3 companion/mfe_companion.py health             # what this machine gives it (below)
python3 companion/mfe_companion.py health --json      # prints the /health JSON
python3 companion/mfe_companion.py compile --target ce --latex 'mx+y=0' [--packages physics,bm] [--preamble '...']
                                                      [--mode text]  # prints the /tex response JSON
```

- `health` is the place to start when something of the companion does not work. It prints a report
  in plain text, a section per thing the companion does: LaTeX (`latex`, `dvisvgm`, the sandbox) and
  ffmpeg (each video format with the encoder it needs and the encoder of its sound, then the folder
  a video is written in, the room it has and the limit of a video) always; and, for the interpreters
  it is given with `--ce-python` / `--gl-python` (or `MFE_CE_PYTHON` / `MFE_GL_PYTHON`), both or
  either, Manim and font text, whose worker it starts for each library to see that it does. With no
  interpreter it checks LaTeX and ffmpeg only and recalls those options; with one, the other is a
  line saying how to add it. A line is marked `[ok]`, `[--]` (not there) or `[!!]` (there and not
  usable), and under each one that is not `[ok]` come what it costs and how to get it: the install
  command of the system it runs on (apt, dnf, pacman, Homebrew, or where to download on Windows), or
  the command that shows why an interpreter does not answer. It changes nothing and listens on no
  port; `--json` prints what `GET /health` answers instead.
- The app looks for the companion at `http://127.0.0.1:7799`, except when the companion serves
  the app itself: `serve --app DIR` serves the built app (`npm run build` leaves it in `app/dist`)
  at `http://127.0.0.1:<port>/app/`, and a page opened there talks to its own origin, whatever the
  port, with no CORS or `file://` opt-in involved. Otherwise `--port` is for the test harnesses
  that start a companion of their own (the parity harness, the export check).
- `serve -v` logs every request to stderr. `compile` also takes `--no-disk-cache` and
  `--no-sandbox`, and exits with 0 when the formula compiled, 1 when LaTeX failed and 2 for an
  invalid request; `serve` exits with 1 when it cannot listen on the port.

### On Windows

The companion runs on Windows as it does elsewhere (checked on Windows 11 with MiKTeX), started with
the Python of the PATH, which is `python` there:

```bash
python companion/mfe_companion.py serve
python companion/mfe_companion.py serve --ce-python C:/manim/ce/venv/Scripts/python.exe --allow-manim-render
python companion/mfe_companion.py health
```

- `python` has to be a real interpreter. Where no Python is on the PATH, Windows answers that name
  with the alias of the Microsoft Store, which runs nothing: use the launcher of python.org
  (`py companion/mfe_companion.py serve`), `uv run companion/mfe_companion.py serve`, or the full
  name of an interpreter.
- The interpreter of a virtualenv is `venv\Scripts\python.exe`. In Git Bash a Windows path is
  written with `/` or in quotes (`--ce-python C:/manim/ce/venv/Scripts/python.exe`): unquoted, the
  shell takes its backslashes away.
- LaTeX is MiKTeX, which brings `latex` and `dvisvgm`; `health` says where to download what is
  missing.
- There is no sandbox there (bubblewrap is Linux's): LaTeX and Render with Manim run with the
  permissions of the user, and `serve` says so when it starts. Use the companion with pages you
  trust.
- Font text is not shaped there yet: the worker of a library answers that native text mapping needs
  the Linux Pango/Fontconfig backend, without starting, and `GET /health` then gives that reason
  under `pango`.
- The disk cache is `.cache\mfe-companion` in the user's folder, as on the other systems
  (`XDG_CACHE_HOME` moves it); the temporary files are in `%TEMP%`.
- Stop the companion with Ctrl+C (or Ctrl+Break), or close its console window: either way it stops
  in order, and its temporary directory (`mfe-jobs-*` in `%TEMP%`) goes with it. A window closed
  while a video is encoded takes 5 s more for each such video (Windows asks ffmpeg first). A log-off
  or a shutdown with the companion still running may leave the directory.

### On macOS

The companion runs on macOS as it does on Linux, less the sandbox and font text (checked on macOS 26
on Apple silicon, with MacTeX and the Python and ffmpeg of Homebrew), started with `python3`:

- `python3` has to be 3.10 or newer. The one macOS itself brings (the Command Line Tools',
  `/usr/bin/python3`) is 3.9: use Homebrew's or python.org's. The second line of `health` says which
  interpreter runs the companion.
- LaTeX is MacTeX, which brings `latex` and `dvisvgm` in `/Library/TeX/texbin` and puts that folder
  on the PATH of the terminals opened after its install. ffmpeg is Homebrew's (`brew install
  ffmpeg`), whose build has every encoder the companion uses. `health` gives the `brew` command for
  what is missing.
- There is no sandbox there (bubblewrap is Linux's): LaTeX and Render with Manim run with the
  permissions of the user, and `serve` says so when it starts. Use the companion with pages you
  trust.
- Font text is not shaped there yet: the worker of a library answers that native text mapping needs
  the Linux Pango/Fontconfig backend, without starting, and `GET /health` then gives that reason
  under `pango`.
- The temporary files are in the user's own temporary folder (the one `TMPDIR` names, under
  `/var/folders`), where a video is written while it is encoded; the disk cache is
  `~/.cache/mfe-companion`, as on Linux (`XDG_CACHE_HOME` moves it).
- Stop the companion with Ctrl+C, or close its Terminal window: either way it stops in order, and
  its temporary directory (`mfe-jobs-*`) goes with it. A terminal that closes hangs up twice, the
  system and then the shell: the second time is ignored, so the clean-up ends.

## HTTP API

Base URL `http://127.0.0.1:7799`. JSON in and out (`Content-Type: application/json`).

### `GET /health` → 200

```json
{
  "name": "mfe-companion",
  "version": "1.7.0",
  "protocol": 1,
  "capabilities": {
    "latex": true, "dvisvgm": true, "ffmpeg": true,
    "videoAudio": ["mp4", "mov", "webm"],
    "manimCE": { "python": "/path/to/python", "version": "0.22.1" },
    "manimGL": null,
    "manimProbing": false,
    "manimRender": false,
    "manimSandbox": false,
    "textMode": true,
    "pango": {
      "ce": { "state": "ready", "adapterVersion": "native-text-1", "environmentKey": "<sha256>" },
      "gl": null
    }
  },
  "limits": { "videoBytes": 4294967296 }
}
```

`limits.videoBytes` (1.7) is the largest video a `/video` job writes, in bytes: 4 GiB, or what
`serve --max-video-gib` gave (*The limit of a video*). Companions older than 1.7 send no `limits`:
their ffmpeg stopped at 4 GiB and ended as if all were well, so the app warns that a video over that
size may come back cut short.

`manimRender` is true only when started with `--allow-manim-render`; `manimSandbox` says whether
those renders run inside the bubblewrap sandbox (false whenever `manimRender` is false). Companions
older than 1.1 send neither field (the app treats `manimRender` as false). `manimProbing` is true
while the Manim interpreters are still being probed after start, so `manimCE`/`manimGL` may still
appear (1.2; the app asks again twice a second meanwhile). `ffmpeg` is true when `ffmpeg` is on
`PATH`.
`videoAudio` (1.5) lists the `/video` formats whose file can carry a soundtrack: `mp4` and `mov`
when that ffmpeg has the `aac` encoder, `webm` when it has `libopus` (asked once, with
`ffmpeg -encoders`); empty without ffmpeg. Older companions do not send it and take no sound.
`textMode` (1.3) says `POST /tex` takes `"mode": "text"`; companions older than 1.3 send nothing and
the app treats it as false.
`pango` says where font text stands for each library; it is unrelated to LaTeX `textMode`, and
a companion without font text omits it. A library whose interpreter the companion does not have
is `null`. Otherwise the entry has a `state` (1.6; the app shapes font text only with a companion
that sends it, and reads an entry without it, as 1.4 and 1.5 sent, as no font text):

| `state` | Meaning |
|---|---|
| `unused` | The interpreter is there and nothing of text has started. **The companion starts no text worker by itself:** the first `GET /fonts` or `POST /text` that names the library does. A session without font text imports no Manim into a worker and reads no font file. |
| `preparing` | The worker is starting: Manim's import, the font catalog and the digest of the font files. The app asks `/health` again twice a second meanwhile. |
| `ready` | The worker answers. `adapterVersion` and `environmentKey` name the font environment it shapes in, the one of the catalog and of every text response. |
| `failed` | The last start did not work; `message` says why (no Pango of the supported kind, a library that does not import). The next request that names the library tries again. Off Linux, where version 1.0 shapes no font text, the companion says so by itself at once: no worker is started to import Manim and refuse. |

A worker that was ready and went away (a cancelled request, a changed font, a time-out) is
started again in the background by the next `/health`, and says `preparing` until it answers:
a session that uses text finds it ready again without asking. `/health` never starts a worker
that was not used, nor one whose last start `failed`: that one waits for a request.

### `GET /fonts?target=ce|gl`

Returns `{ ok: true, target, adapterVersion, environmentKey, fonts, limits }`. Each font entry
is `{ family, variable, faces: [{ name, weight, slant, synthetic }] }`; face weights are numeric
Pango weights encoded as strings, and slants are `normal`, `italic` or `oblique`. A catalog face
does not promise that every requested weight/slant is available without synthesis or fallback.
The first-release text request itself exposes only normal/bold and normal/italic.

This is also the request that starts the library's text worker when nothing has: the answer
comes when the worker is ready (see `pango` above). The app sends it when a project with font text
is open, to have the worker ready and to learn the font environment of this machine, and from the
text editor, for its font list.

The catalog is produced inside the target worker. Family names are requests; actual resolved
font identities belong to the text response. Its environment key includes native implementation
and version information, target calibration, catalog metadata, font content hashes and effective
Fontconfig rules. Machine paths/stat values are used only for local invalidation, never as the
portable environment fingerprint. Locale, direction, DPI and font-position rounding are recorded.
When the font environment changes, the worker rejects stale work and stops; the next `/health`
brings it back, or the next request does. A stored artifact keeps its own provenance and remains
usable for browser playback
and for the exports: an export to Python or a render with Manim of a text shaped in another
environment says so and goes on.

### `POST /text`

```json
{
  "source": "office café\nsecond line",
  "target": "ce",
  "font": { "family": "Noto Serif", "weight": "normal", "slant": "normal" },
  "fontSize": 48,
  "requestId": "editor-session_12"
}
```

Source is literal Unicode, with LF line endings and no normalization of combining sequences.
NUL, CR and unpaired surrogates are rejected. `fontSize` is finite, from 1 through 512. The
optional request ID contains 1–80 ASCII letters, digits, underscores or hyphens. IDs must be
unique among active requests. Font family is required and must appear in the target catalog.

Success returns the following fields in an HTTP 200 response:

| Field | Meaning |
|---|---|
| `ok`, `target`, `adapterVersion`, `environmentKey` | `true` and the actual native target/environment. |
| `requestKey` | `pango-` plus a SHA-256 of the authored request, native environment, resolved fonts and geometry signature. |
| `glyphs` | Ordered `{ index, label, kind: "char", contours, bbox, sourceRanges }` entries. |
| `contours` | Per-glyph cubic subpaths in scene coordinates: `[x0,y0,c1x,c1y,c2x,c2y,x1,y1,…]`. GL quadratics are elevated exactly. |
| `bbox`, `logicalBBox` | Visible control-point bounds and independent logical layout bounds; boxes contain `minX`, `minY`, `maxX`, `maxY`. |
| `lines` | `{ start, end, baseline, bbox }` records, including blank lines with logical extent. |
| `provenance` | `{ environmentKey, adapterVersion, versions, calibration, resolvedFonts, geometrySignature }`. |
| `diagnostics`, `warnings` | Structured source diagnostics and explanatory messages. Successful exact results have no unresolved unsupported glyphs. |
| `cached`, `ms` | Whether an unchanged result was reused, and native operation time; cached results report zero. |

Every source range is a half-open `{ start, end }` pair in UTF-16 code units of the exact input
source. Shaping clusters can span multiple codepoints, produce multiple drawables, or occur in
reverse visual order. Source ranges and drawable indices are separate spaces. Whitespace can
have logical extent without a drawable. The adapter verifies the mapped Pango SVG outlines and
positions against the actual native constructor before accepting source correspondence.

`resolvedFonts` contains `{ family, face, weight, slant, fontHash, faceIndex, ranges }`. Font hashes
identify the resolved file contents; paths are not portable identifiers and are not returned.
`geometrySignature` hashes every ordered cubic contour after integer quantization at 1e-6 scene
units (`floor(coordinate * 1000000 + 0.5)`), preserving glyph/subpath topology. Generated Python
checks actual constructor geometry with it before applying glyph colors or placement transforms; a
difference is a warning on stderr, not an error.

Both targets construct `Text` with explicit `disable_ligatures=False`, whole-object typography,
manual newlines and native default spacing. GL also receives `alignment="LEFT"`. CE constructs
inside a fixed 1920 × 1080 pixel configuration; exported Python must use the same temporary
configuration because CE's internal Pango width otherwise depends on render resolution. A CE
source line that wraps implicitly is rejected with a request to insert an explicit line break.
Tabs follow native behavior: four spaces in CE, Pango tab stops in GL. Glyph paint is applied
after construction; CE `t2c` is never used to recover identity or paint existing glyphs.

Missing families, missing/bitmap/color glyphs, unsupported output and unverified correspondence
return `{ ok: false, error: { message, log }, diagnostics: [{ code, message, ranges }] }` with
HTTP 200. Source is never rewritten to substitute a font or discard unsupported characters.
Other statuses include 400 for malformed requests, 413 for input limits, 409 for duplicate IDs
or cancellation, 429 for a full/busy queue, 503 for unavailable workers, and 504 for timeout. A
504, and the 503 of a text that took its worker down, come back at once for the same text for
ten minutes (*Native text resource and font isolation*).

### `DELETE /text/<requestId>`

Cancels only the matching active or queued request and returns
`{ ok: true, requestId, state: "cancelled" }`, including when that request already finished.
Canceling active native work retires its worker; the next `/health` starts a fresh one in the
background, or the next request does. Cancelling the request that needed a worker's start does
not stop that start. Clients
that share one pending request must retain subscriber ownership and cancel only after its last
subscriber releases it. Stale replies must still be rejected by the application.
Cancellation retains at most 128 short-lived ID tombstones for 30 seconds, so a DELETE arriving
before its POST prevents that late request from beginning work.

### Native text resource and font isolation

There is one persistent worker per target, at most two globally, each started by the first
request that names its library. Four requests, including active work, may be admitted globally;
overload is explicit. A request waits at most five seconds for a worker that is busy with other
requests (then 429, and the client asks again), and has five seconds of its own once the worker
takes it: its time is not spent in the queue. The start of a worker has thirty seconds of its
own, and neither that start nor the wait for a start another request began is taken from a
request's five. A start is nobody's request: cancelling the request that needed it does not stop
it (only the companion's shutdown does), and when it fails every request that waited for it gets
the reason, none of them starting another. Whatever starts other requests began, a request waits
for them at most a start, ten seconds and its own five. Native stdout is isolated from the JSON
protocol, logs are retained only as bounded tails, and shutdown/cancellation kills the owned
process group and removes its temporary files.

A text whose own work passes its five seconds, or takes the worker down (Pango falling over, the
memory limit), stops that worker: it gets a 504 or a 503 that says so. The same text (target,
source, font and size, whoever asks) then gets that answer at once for ten minutes, without a
worker being asked or started: the worker `/health` brings back serves the other texts, and does
not meet again, at every change the app sees, the one text that stops it. A cancelled request, a
full queue and a worker that cannot be reached refuse nothing. At most 64 such texts are
remembered per library, and none across a restart of the companion.

What a worker answers is checked before the companion keeps it: its answer to `fonts` must be a
catalog (the environment key, a list of fonts), or the start fails and says so, since `/health`
reads the key off it for every client.

A worker names its font environment by the content of every font file of the machine; a file
that cannot be read (gone since Fontconfig listed it, or a name that is not UTF-8) counts as a
font of unknown content, and a text that resolves to it fails by itself. The
companion keeps, for each library, the digests its worker has taken, hands them to the worker it
starts and gets the table of that start with the worker's first catalog: a worker reads only the
files that are new or changed, and a font that went away leaves the table. A file counts as
unchanged by its path, size, modification time, inode and change time (the last cannot be set by
hand, so another font put in place with the same size and date is read again). The tables live in
the cache directory (`font-hashes.v1`, next to the `/tex` results and outside their limit), or for
the run alone with `--no-disk-cache`. They hold paths and digests, nothing of the fonts themselves.
A worker is sandboxed and the companion is not, so what a worker reports is checked for its shape
before it is kept, comes over the same bounded channel as its answers, never from a file it
wrote, and is handed back only to the worker of the same library.

Requests permit at most 32 KiB UTF-8 source and 512 lines. Results permit 8,192 drawables,
500,000 native points and 16 MiB JSON. Each worker retains at most 16 result entries and 32 MiB
of cached response data, periodically clears native geometry/disk caches, limits additional
address space after imports to 512 MiB, and limits individual temporary files to 64 MiB.
These are resource ceilings, not latency guarantees. Full native construction runs once per
uncached request; its imports persist across requests. No unverified raw-Pango fast path is
advertised as matching Manim.

Catalogs, text workers and companion native video share explicit read-only font visibility:
system Fontconfig plus the user's `.fonts`, XDG data `fonts`, and XDG `fontconfig` directories.
HOME and caches remain private job directories. The helper receives only fixed code and JSON
data; it does not enable the arbitrary-code `/manim-render` endpoint. Existing Host, Origin and
file/null-origin restrictions apply unchanged to these routes.

### `POST /tex`

Request:

```json
{ "latex": "mx+y=0", "packages": ["physics"], "preamble": "", "target": "ce", "mode": "math" }
```

`mode` (1.3) is optional and defaults to `"math"`: the source is a formula (ManimCE `MathTex`,
ManimGL `Tex`). With `"text"` it is text — ManimCE `Tex` (`tex_environment="center"` and an empty
`arg_separator`), ManimGL `TexText` (no `align*`, `\centering` alone) — for the editor's text
objects. A companion older than 1.3 ignores the field and typesets math, so the app looks at
`capabilities.textMode` first.

Success (200):

```json
{
  "ok": true,
  "svg": "<?xml version='1.0' encoding='UTF-8'?>\n<svg …>…</svg>",
  "glyphs": [
    { "label": "m", "kind": "char", "font": "cmmi10", "code": 109 },
    { "label": "—", "kind": "rule", "font": null, "code": null }
  ],
  "cached": false,
  "ms": 231,
  "warnings": []
}
```

- `svg` is the unmodified `dvisvgm --no-fonts` output.
- `glyphs` has exactly one entry per **shape element of the SVG in document order, outside
  `<defs>`** (`<use>`, `<rect>`, `<path>`…), skipping elements whose geometry is empty — the
  same elements, in the same order, that become Manim submobjects. If the companion cannot
  align its labels with the SVG it returns `"label": "?"` entries and a warning; it never
  returns a list of a different length.
- Labels come from the DVI: font name + character code mapped to Unicode through the TeX
  encodings (OT1, OML, OMS, OMX, T1, AMS symbol fonts). Unknown characters get `"?"`.

LaTeX error (also 200):

```json
{ "ok": false, "error": { "message": "Undefined control sequence.", "line": 1, "log": "…" } }
```

`line` is relative to the user's `latex` (1-based) when the error lies inside it, else `null`.

Other statuses: `400` malformed request (bad JSON, unknown target or mode, invalid package name),
`403` host or origin not allowed, `404` unknown path, `413` body too large.

### CORS

Allowed origins: `http://localhost:<any port>` and `http://127.0.0.1:<any port>`. The companion
answers `OPTIONS` preflights and echoes the allowed origin in `Access-Control-Allow-Origin`;
other origins get `403`.

The `null` origin (the built app opened from `file://`, but also sandboxed iframes on any web
page) is rejected unless the companion is started with `--allow-file-origin`
(`MFE_ALLOW_FILE_ORIGIN=1`), which prints a warning — see *Security*.

## The app's client

`app/src/engine/companion.ts` (`createCompanionClient()`; the app's one client is
`companionClient()` of `engine/instance.ts`) keeps the app's view of the companion:

- It asks `/health` every 5 s while the companion is offline and every 15 s while it is online,
  with a 1.5 s timeout that covers the body too, and again whenever the window gains the focus. A
  server counts as the companion only when `/health` says `"name": "mfe-companion"` and `"protocol":
  1`. While the companion says something is still coming (`manimProbing`, or a text worker
  `preparing`) it asks twice a second.
- It asks for the text worker of the project's library when the project has a font text and the
  companion says `unused` (`store/textPreparation.ts`, through `GET /fonts`), and from the text
  editor. A worker that `failed` is tried again only when the author asks (*Try again* or
  *Refresh appearance* in the text editor); the export dialogs never start one that failed.
  Until a worker is `ready` a text nothing has shaped is drawn as placeholder boxes ([ARCHITECTURE
  §4](architecture/04-formula-engine.md#placeholder-boxes-a-font-text-nothing-has-shaped)).
- `/tex` has 20 s; job requests 30 s, a batch of frames or a piece of a soundtrack 5 min, waiting
  for a job to finish 45 min (the two passes of a video with sound). A request that cannot reach
  the companion, or times out, marks it offline (the formulas fall back to MathJax) and triggers a
  new health check; an HTTP error shows the companion's own message (`error.message`).
- The top bar's renderer label and its tooltip show the result
  ([ARCHITECTURE §11](architecture/11b-ui-history-state.md#the-renderer-label)).

## TeX documents

The companion builds the same document Manim builds for a single-string formula.

**target `ce`** (ManimCE 0.22 `MathTex(latex)`, default `TexTemplate`, compiler `latex`):

```latex
\documentclass[preview]{standalone}
\usepackage[english]{babel}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{<package>}          % one line per requested package, in order
<preamble>                      % omitted when empty
\begin{document}
\begin{align*}
\special{dvisvgm:raw <g id='unique000'>}<latex>\special{dvisvgm:raw </g>}
\end{align*}
\end{document}
```

`<latex>` first goes through the same normalisation as
`SingleStringMathTex._get_modified_expression` (strip; empty → `\quad`; unbalanced `\left`/`\right`
→ `\big`; stray braces balanced…). In text mode (ManimCE `Tex(latex)`) the environment is `center`
and the `{{ }}` pieces are joined without the separating space (`arg_separator=""`); the
normalisation is the same.

**target `gl`** (ManimGL 1.7 `Tex(latex)`, template `default` of `manimlib/tex_templates.yml`,
compiler `latex`), as assembled by `get_full_tex` (blocks joined with blank lines):

```latex
\documentclass[preview]{standalone}

<default template preamble>
<\usepackage lines for packages>
<preamble>

\begin{document}

\centering
\begin{align*}
<latex>
\end{align*}

\end{document}
```

In text mode (ManimGL `TexText(latex)`) the two `align*` lines are left out: `\centering`, then
`<latex>`.

Both are compiled with `latex -interaction=batchmode -halt-on-error -no-shell-escape` and
converted with `dvisvgm --no-fonts --verbosity=0 --output=doc.svg`. The companion reads the fresh
SVG file with a byte limit and validates its XML before caching it. Converter stdout can contain
Ghostscript diagnostics and is never returned as SVG; the protocol's `svg` value remains the
unmodified SVG artifact. A missing, stale, oversized or malformed artifact is a conversion error.

## Size calibration (done by the app, not the companion)

Scene units per SVG unit at `font_size = s`:

- CE: `s / 960`.
- GL: `s / (144 · h₀)`, where `h₀` is the exact height (curve extrema, not control points) of
  ManimGL's calibration glyph: `get_tex_mob_scale_factor` typesets `latex_to_svg("0")`, a
  **text-mode** "0" with the GL template (a math-mode `0` is ≈ 0.3 % shorter). The app obtains it by
  compiling `\text{0}` for target `gl` once per session. Measured on the reference machine:
  `h₀ = 6.874222` (fallback when the companion is offline).

## Security

The companion runs LaTeX on text sent over HTTP, so it is locked down:

- Listens on `127.0.0.1` only; rejects requests whose `Host` is not `127.0.0.1:<port>` or
  `localhost:<port>` (DNS-rebinding protection) and origins outside the CORS list. Only pages
  served from the local machine can read responses.
- `latex` runs with `-no-shell-escape` and `openout_any=p` (no writing outside the working
  directory, no dot files), in a fresh temporary directory, with a 15 s timeout.
- **Reading files**: since TeX Live 2026, `openin_any` has no effect, so `\input{/abs/path}` can
  read any file the user can read and its text would come back as glyph labels. On Linux with
  `bwrap` (bubblewrap) the companion therefore runs `latex` and `dvisvgm` in a sandbox: the file
  system is read-only and `/home`, `/var/home`, `/root`, `/tmp`, `/var/tmp`, `/mnt`, `/media`,
  `/srv`, `/run` are empty, with no network. Without bubblewrap (macOS, Windows, Linux without it)
  there is no read confinement; the origin rules above are then the only protection, which is why
  `null` is opt-in. `serve` prints the sandbox status at start-up.
- Limits: request body 64 KB, `latex` 8 KB, `preamble` 8 KB, at most 32 packages, package names
  of at most 64 characters matching `^[A-Za-z0-9_-]+$`.
- `--app DIR` serves regular files under DIR only, with GET and HEAD, under the same Host and
  Origin rules as the API: symbolic links are resolved before the check, and a path that leaves
  DIR, a hidden file, a missing file or a directory without `index.html` is a 404 (nothing is
  listed); `/` and `/app` send to `/app/`. Files go out with `nosniff` and `no-cache`, each with the
  type of its extension from a table of the companion's own (the system is not asked: on Windows any
  program can register another type for `.js`, and the browser then refuses the script). It is a
  convenience for the local machine, not a web server: the companion still listens on `127.0.0.1`
  only.
- The job routes (`/video…`, `/manim-render…`) are subject to the same Host and Origin checks, only
  accept ids the companion created, and never put request data into a file name or a command line
  beyond the validated enums and integers of their requests and, for `/manim-render`, the name of
  the scene (an identifier, checked as one). The scene's `code` becomes the content of a file with
  a fixed name. `/manim-render` additionally needs `--allow-manim-render` and is sandboxed as
  described in *Sandbox status for Manim*.
- A soundtrack is stored under a fixed name in a directory the companion creates (mode 700, under
  the jobs' private directory), never larger than the length its job announces (at most 60
  minutes, 691 MB), and only after its header was found to be exactly the 44 bytes of a 16-bit
  stereo 48 kHz PCM file of that length. ffmpeg reads it as WAV and the video as MP4/MOV or
  Matroska because it is told so, not because it looked at the files.
- A result is served from the file the job wrote, opened without following a symbolic link, and
  only plain files are results: `result.mp4` of a Manim job and the file of a second pass are
  checked with `lstat` (a regular file with a single link). A scene, or an ffmpeg that a crafted
  video took over inside the sandbox, cannot make the companion read another file by leaving a link
  where a result is expected. Windows cannot refuse a link at the open itself (it has no
  `O_NOFOLLOW`): there the path is looked at first, and a link or any other reparse point is
  refused.

## Caching

Results are cached by SHA-256 of (cache revision, target, full TeX document, latex/dvisvgm
versions) in memory (LRU, 256 entries) and on disk under `~/.cache/mfe-companion/`
(at most 4000 files: past that,
the oldest go until three quarters are left, at start-up and as results are written;
`--no-disk-cache` disables it).

## Video and Manim rendering (companion 1.1, still protocol 1)

Both are **jobs**, because they take from seconds to minutes: the app creates a job, feeds or polls
it, downloads the result and deletes the job. `/health` reports what is available:
`capabilities.ffmpeg` for `/video`, `capabilities.manimRender` (true only when the companion was
started with `--allow-manim-render`) plus `manimCE` / `manimGL` for `/manim-render`. Older
companions do not send `manimRender`; the app treats that as false.

Job ids are 32 random hex digits. Job directories live under one private temporary directory
(`mfe-jobs-*` in the system temp directory), and are removed when the job is deleted, when a
finished job has not been touched for 10 minutes (at most 8 finished jobs are kept), when the
companion stops (`Ctrl+C`, `SIGTERM`, on Windows `Ctrl+Break`, or its terminal closing: `SIGHUP`,
unless the caller had it ignored, as `nohup` does, and one of these signals that comes again while
it stops is ignored, since a terminal that closes hangs up more than once; on Windows its console
window closing, for which the system waits up to 5 s, while a log-off or a shutdown there may still
end it at once, and the directory then stays), and when a job fails, however it does: a frame that
is no PNG, ffmpeg or Manim, the second pass, or the companion giving up on a job that waits for
data, one whose client sent no frames and no piece of its soundtrack for 120 s (asking for the
status of a job is not sending to it). A failed job's process is killed and its files go within a
couple of seconds; its status stays, to say why, until it is deleted or expires. A job with sound
has a second directory there (`sound-*`) for its soundtrack and for the file with sound, removed
with it. All routes apply the same Host and Origin checks as `/tex`, and answer errors in the same
shape: `{ "ok": false, "error": { "message": "…", "line": null, "log": "…" } }` (`log` is the end of
ffmpeg's or Manim's output, else empty).

### `POST /video` — create an ffmpeg job

```json
{ "format": "mp4", "quality": "medium", "width": 1920, "height": 1080, "fps": 60, "frames": 300 }
```

| field | rule |
|---|---|
| `format` | `"mp4"` (H.264, yuv420p, `+faststart`), `"webm"` (VP9), `"mov"` (ProRes 422 HQ, 10-bit), `"gif"` (palette, endless loop) |
| `quality` | `"low"`, `"medium"` (default), `"high"`: x264 CRF 28 / 23 / 18, VP9 CRF 40 / 32 / 24; ignored by mov and gif |
| `width`, `height` | whole numbers 16–8192, at most 8192 × 4608 pixels; even, except for gif |
| `fps` | whole number 1–240 (gif: at most 50, GIF delays are whole centiseconds) |
| gif limits | ffmpeg's palette generation keeps every frame in memory, so a gif is at most 1920 pixels wide or tall and `frames × width × height × 3` is at most 2 GiB (`400` otherwise) |
| `frames` | whole number 1–1 000 000: exactly how many PNG frames will be sent |
| `audio` | optional (1.5), `true` or `false` (default): a soundtrack will be sent to `…/audio` (below). Not for gif; the video then lasts at most 60 minutes (`frames` ≤ 3600 × `fps`) |

Answer `201`: the job status (below) plus `maxRequestBytes` (134 217 728), `maxFrameBytes`
(67 108 864) and, since 1.7, `maxVideoBytes` (the limit of the job's video, 4 294 967 296 by
default), and with `audio` also `maxAudioRequestBytes` (16 777 216). Errors: `400` invalid field,
`413` body over 64 KB, `429` two video jobs are already unfinished, `503` ffmpeg is not installed,
or it lacks the audio encoder of the format (see `videoAudio`), `507` the disk of the temporary
folder is nearly full (below). RGB frames are converted to BT.709 limited-range YUV and tagged so;
the output is constant frame rate and lasts exactly `frames / fps`.

ffmpeg's command line is built only from the values above (a fixed list of options per format, the
numbers, and the job's own paths); the frames are read from its standard input (`image2pipe`, PNG)
and never kept by the companion; its output has a limit:

#### The limit of a video (1.7)

The video is written in the job's directory while it is encoded. One job writes 4 GiB at most, or
what `serve --max-video-gib N` says, a whole number of GiB from 1 to 64; `limits.videoBytes` of
`/health` and `maxVideoBytes` of the answer above say it in bytes. The companion looks at the file
as frames arrive and, four times a second, while ffmpeg finishes (a GIF is written whole then). When
the file is past the limit the job **fails**: ffmpeg is killed, the files go, and the answer (`507`
to the frames request, or the status `finish` returns) says the limit and what can be done, a
shorter range, a smaller size, a lower quality or a higher limit. **Nothing cut short is ever
delivered.**

ffmpeg's own stop (`-fs`) judges nothing. It is loose, and it ends ffmpeg with status 0 as if all
were well, leaving a video cut short: before 1.7 it was set at 4 GiB, and that file was the job's
result when the stop came as ffmpeg finished (when it came while frames were still being sent, the
job failed with "ffmpeg stopped unexpectedly"). It is now set 64 MiB past the limit, where it only
bounds what is written between two looks at the file; a file it stopped is over the limit and fails
for it, with the same message.

The disk is watched the same way, so that the companion is never what fills it. A job is not begun
(`507`), and one that writes is stopped and fails, when the disk of the temporary folder has less
than 1 GiB free. That covers the two passes of a video job, a Manim render, whose video has no limit
of its own, and the soundtrack of either while it arrives: a request that finds the disk that low
fails the job with `507` before the piece it holds is written. The message names the folder and says
what gives it room: `TMPDIR` naming a folder on another disk when the companion is started (Python
reads `TMPDIR`, `TEMP` and `TMP`, in that order, on every system). A video that was finished is
delivered whatever the disk has left, and a disk that cannot be asked for its room stops nothing.
Started with a limit that is not the default, `serve` says it and where the videos are written, and
warns when that disk cannot hold a video of that size with the 1 GiB the jobs leave free. Windows
gives the temporary folder by its short name (`C:\Users\NAME~1\AppData\Local\Temp`) to a user whose
own name is not a short one, with a space in it or more than eight characters: these messages and
`health` say its long name.

### `POST /video/<id>/frames?first=<k>` — send frames

Body: one or more **concatenated PNG files** (`Content-Type: application/octet-stream`; a
`Content-Length` is required, chunked bodies are refused). `first` is the index of the first frame in
the body and must equal the number of frames already received (frames are strictly in order, so a
retried request is refused, not duplicated). The body is streamed into ffmpeg while it is read; the
companion only checks the PNG structure (signature, chunk layout, `IHDR` first and equal to the
job's `width` × `height`, end of each file). Limits: 128 MiB per request, 64 MiB per file, no more
than `frames` files in total; one request at a time per job.

Answer `200`: the job status plus `accepted` (frames in this body). Errors: `400` (not PNG, wrong
size, ends mid-file, no frame, `first` missing; the job then **fails**, because part of the body has
already reached ffmpeg), `404` unknown job, `409` out of order or another request is running,
`410` the job is cancelled or failed, `413` request over the limit, `500` ffmpeg stopped while the
body was written to it, `507` the video passed its limit or the disk is nearly full (*The limit of a
video*; in both the job fails, and the message says why). For those two the companion reads the rest
of the body before it answers: answered with the body half read, a client that is still sending
finds its connection broken and never reads the reason.

### `POST /video/<id>/audio?offset=<n>` — send the soundtrack (1.5)

Only for a job created with `"audio": true` (`409` otherwise). The soundtrack is **one WAV file,
16-bit PCM, stereo, 48 000 Hz, that lasts what the video lasts**: `round(frames × 48000 / fps)`
sample frames after the canonical 44-byte header (`RIFF`, `WAVE`, a 16-byte `fmt ` chunk, `data`).
It is sent in one or more requests, in order: the body is a piece of the file
(`Content-Type: application/octet-stream`; `Content-Length` required, chunked bodies refused) and
`offset` its position in the file, which must equal the bytes received so far (a retried request
is refused, not stored twice). At most 16 MiB per request; one request at a time per job; before,
between or after the frames requests, but before `finish`.

The first request must hold the whole header, and the header must be byte for byte the one such a
file of that length has: any other format, sample rate, channel count, length or extra chunk is a
`400` and nothing is stored (the job goes on). Nothing after the header is interpreted: it is
samples, stored as they come. A body that ends early, or stops arriving for 30 s, keeps what
arrived; `audioReceived` in the status says where to continue.

Answer `200`: the job status, with `audioBytes` (the size of the whole file, header included) and
`audioReceived`. Errors: `400` (`offset` missing, no body, a wrong header, a body that goes past
the end of the file or ends early), `404` unknown job, `408` the body stopped arriving, `409` out
of order, another audio request is running, the job has no `audio`, or it is no longer receiving
its soundtrack (a video job that is encoding, a Manim job that runs), `410` the job is cancelled,
failed or done, `413` request over the limit, `500` the file cannot be stored (the job then fails),
`507` the disk of the temporary folder is nearly full (the job then fails too; the companion reads
the rest of the body first, so that the answer is read).

### `POST /video/<id>/finish` — wait for the file

No body needed. Closes ffmpeg's input and waits for it (at most 30 minutes), looking at what it
writes. Answer `200` with the final status: `state` is `"done"` (with `bytes` and `mime`) or
`"failed"` (with `error`: what ffmpeg said last, or that the video passed its limit or the disk is
nearly full, *The limit of a video*). `409` when fewer than `frames` frames were received, or when
the job has `audio` and its soundtrack is not whole (the job stays usable).

With a soundtrack, a **second pass** of ffmpeg follows the first (at most 10 more minutes): it
copies the video stream as it is and encodes the sound next to it, AAC at 192 kbit/s in MP4 and
MOV, Opus at 128 kbit/s in WebM (`-c:v copy -c:a aac|libopus`, each input read with a fixed
demuxer). The result lasts what the video lasts and the sound keeps its place to the sample: the
encoder's lead-in is hidden by the container (an edit list, or WebM's `CodecDelay`). ffmpeg's WebM
header then announces up to 8 ms more than the video lasts; the streams do not. While the second
pass runs, the two directories of the job hold the video twice and the soundtrack; the first
pass's file and the WAV file are deleted as soon as the result exists.

What the second pass leaves is the result only when it is a plain file with one name (a symbolic
link is not followed, a second link to another file is not taken) and no larger than the limit of a
video (4 GiB by default) plus 128 MiB, room for an hour of sound next to the largest video of the
first pass. A video larger than that first pass writes (the one Manim renders has no limit of its
own) takes what it has over the limit along. The pass is killed when its file grows past that, or
when the disk is nearly full, and the job fails: ffmpeg's own `-fs` is not used here, because it
stops loosely and exits as if the file were whole.

### `GET /video/<id>` · `GET /video/<id>/result` · `DELETE /video/<id>`

`GET /video/<id>` answers the status (`200`):

```json
{ "ok": true, "id": "…", "kind": "video", "state": "receiving", "elapsedS": 3.2,
  "frames": 300, "received": 120, "encoded": 96 }
```

`state` is `receiving`, `encoding` (after `finish`), `done`, `failed` or `cancelled`. `received` counts
frames accepted, `encoded` frames ffmpeg reports done. A job with `audio` also has `audioBytes` and
`audioReceived`. `GET …/result` streams the file with its
`Content-Type` (`video/mp4`, `video/webm`, `video/quicktime`, `image/gif`) and
`Content-Disposition: attachment; filename="video.<ext>"`; `409` until the state is `done`.
`DELETE` cancels (ffmpeg is killed), removes the job's files and answers `200`; any later request for
the id is `404`. Deleting a finished job is how the app tells the companion it has the file.

### `POST /manim-render` — render the exported scene with Manim

**This endpoint runs the Python code it receives**, so it is off unless the companion was started
with `--allow-manim-render`: otherwise `403`.

```json
{ "target": "ce", "code": "from manim import *\n…", "scene": "MyScene",
  "width": 1920, "height": 1080, "fps": 60, "frames": 300 }
```

| field | rule |
|---|---|
| `target` | `"ce"` or `"gl"`: which interpreter runs it (`--ce-python` / `--gl-python`) |
| `code` | the whole `.py` file, 1 byte – 512 KiB, no NUL |
| `scene` | the Scene class to render, `^[A-Za-z_][A-Za-z0-9_]{0,63}$` |
| `width`, `height`, `fps` | all three or none; same ranges as `/video` (8192 × 4608 pixels at most). CE: `-r W,H --fps N`; GL: `-r WxH --fps N` |
| `quality` | `"low"` (default), `"medium"`, `"high"`: used only when no size is given (CE `-ql/-qm/-qh`, GL `-l/-m/--hd`) |
| `frames` | optional, 1–1 000 000: the frames the app expects, only to scale the progress |
| `audio` | optional (1.5), `true` or `false` (default): a soundtrack will be sent to `…/audio`. Needs `width`, `height`, `fps` and `frames`: the soundtrack lasts `frames / fps`, at most 60 minutes |

Answer `201`: the job status (with `maxAudioRequestBytes` when the job has `audio`). Errors: `400`
invalid field, `403` disabled, `413` body over 512 KiB plus 4 KiB, `429` a render is already
running or waiting for its soundtrack (one at a time), `503` no interpreter configured for the
target, or `audio` and no ffmpeg with an AAC encoder (see `videoAudio`), `507` the disk of the
temporary folder is nearly full (*The limit of a video*). The result is always an MP4.

How it runs: `scene.py` is written to a fresh job directory, which is also the working directory
and `HOME`, and Manim is started there (CE `python -m manim render --silent … -o result --media_dir
media --disable_caching scene.py Scene`; GL `python -m manimlib scene.py Scene -w … --video_dir out
--file_name result`) with a minimal environment (`PATH`, `LANG`, `HOME`, `TMPDIR` and a few terminal
variables; none of the user's other variables), in its own process group, inside the sandbox when
available (below), with a time limit (`--manim-timeout`, default 600 s: then the job fails with
"Manim did not finish within N s." and the process group is killed). While it renders, the disk of
the temporary folder is looked at every second, and the job fails when less than 1 GiB is left free
there (1.7). The result is the `result.mp4`
Manim wrote: a regular file of the job directory (a symbolic link the scene left there is not
taken). `--silent` keeps ManimCE from asking PyPI for its newest release once the video is
written: it ends only with the answer, so where no sandbox keeps the network away the question
went out at every render and the job waited for it (40 s a render, measured on a Mac whose network
resolves PyPI to IPv6 addresses that do not answer). On Windows the environment says the same under
the names Windows reads: the job directory is also `USERPROFILE` (Python takes `~` from it and not
from `HOME`; ManimCE asks for it as soon as it is imported), `TEMP` and `TMP` are the job's
temporary folder (a program that is not Python never reads `TMPDIR`), and the folders of the system
and of the applications' data are kept (`SYSTEMROOT`, `APPDATA`, `LOCALAPPDATA`, `PROGRAMDATA` and
the like: places, not secrets, and neither Python nor a TeX distribution starts without them). On
every system a Python child reads and writes UTF-8 (`PYTHONUTF8=1`): the companion reads its output
as UTF-8, and on Windows the default would be the ANSI code page. Windows has no process group to
signal either: there each child starts suspended in a Job Object of its own, which takes every
process it starts and theirs, and only then runs. Ending the child ends its job: the whole tree at
once, and also what lives on under a child that has died (a virtualenv's `python.exe` is a launcher
with the real interpreter under it, and Manim's `latex`, `dvisvgm` and `ffmpeg` run under that
one). The companion holds a job for as long as it holds the child: when the companion itself ends,
however it ends, Windows ends what its children left running. A child that cannot be put in a job
runs without one and is ended with `taskkill /T`, which finds a tree by the parents' ids and so
finds nothing under a child that has died. And the job's folder is the home only of what reads the
environment: a library that asks Windows itself for the user's folders, as ManimGL does for its
cache, still uses the user's.

**With `audio`** the job starts in the state `receiving` and Manim does not run yet. The soundtrack
goes to `POST /manim-render/<id>/audio?offset=<n>`, which is `POST /video/<id>/audio` in every
detail (the same WAV file, as long as `frames / fps`; the same limits and errors). The request that
brings its last byte starts Manim and answers with the state `running`. A job whose soundtrack
stops arriving for 120 s fails, as a video job without frames does, and so does one whose
soundtrack is not whole 30 minutes after the job was created (Manim's own time limit only starts
with Manim). When Manim has written its video, the state is `encoding` while ffmpeg copies that
video and adds the sound (AAC, as for an MP4 of `/video`; at most 10 minutes), and the result is
the file with sound. The soundtrack is cut by nobody: the app sends exactly the length of the video
it asks for.

`GET /manim-render/<id>` answers the status; `GET …/result` the MP4 (`409` unless `done`);
`DELETE` kills a running render (or the pass that adds the sound) and removes the files (`200`,
then `404`):

```json
{ "ok": true, "id": "…", "kind": "manim", "state": "running", "elapsedS": 7.4,
  "frame": 120, "frames": 300, "animation": 2, "sandboxed": true }
```

`state` is `running`, `done` (with `bytes`, `mime`; `frame` equals `frames`), `failed` or `cancelled`;
with `audio` also `receiving` before and `encoding` after `running`, and the status has `audioBytes`
and `audioReceived`.
Progress is parsed from Manim's progress bars (stderr): `animation` is the index of the animation
being rendered and `frame` the sum of the frames rendered in all animations so far; it is best effort
(ManimGL reports rarely, so it may lag) and `frames` is the request's `frames` or null. A failed
render (non-zero exit, no video written, time limit) answers `state: "failed"` with
`error.message` = the last line of Manim's output (`NameError: …`) and `error.log` = the end of the
log (about 6000 characters, progress bars removed).

### Sandbox status for Manim

When `bwrap` works (Linux; the same helper as for LaTeX, checked by a smoke compile at start-up,
`--no-sandbox` turns it off), Manim runs with: the whole file system read-only; `/home /var/home
/root /mnt /media /srv /run /tmp /var/tmp` replaced by empty tmpfs; the directories the interpreter
needs (`sys.prefix`, `sys.path` and the Manim package's directory, found when the interpreter is
probed) mounted back read-only if they live under one of those; TeX trees likewise; no network, own
PID, IPC and UTS namespaces; the job directory as the only persistent writable place (writes under
`/tmp` and `~` go to the throw-away tmpfs); the whole sandbox dies with the companion. `/health`
reports `manimSandbox: true`, job statuses `sandboxed: true`. Without bubblewrap (macOS, Windows, no
`bwrap`, `--no-sandbox`) the render runs **unsandboxed with all the user's permissions**: the
start-up banner and `manimSandbox: false` say so and the dialog warns; `--allow-manim-render` is the
only gate, so use it only with pages you trust.

The directory of all the jobs is emptied in the sandbox as well, wherever the system keeps its
temporary files (`TMPDIR` may point outside the directories listed above), and the job's own
directory is mounted back: a scene sees no other job's files.

The pass that adds the sound reads a video the scene's code wrote, so it runs in the same kind of
sandbox whenever Manim did: the job directory is mounted read-only, and the only writable place is
the directory of the soundtrack, where the result goes. That directory is a sibling of the job
directory, not inside it: the scene never sees the soundtrack, and cannot leave a file or a link
where the result will be written or read. ffmpeg is run by its resolved path; when it lives below
a hidden directory (`~/bin/ffmpeg`), that one file is mounted back, not its directory. An ffmpeg
that also needs libraries from there (a conda environment in the home directory) cannot start in
the sandbox: the job fails with its message, although `videoAudio` lists `mp4`.

Measured on the reference machine (Fedora, bubblewrap 0.12, Python 3.14, Manim CE 0.22.1 and
ManimGL 1.7.2):

- **ManimCE** renders sandboxed (MathTex through the sandbox's LaTeX, Cairo, ffmpeg).
- **ManimGL** also renders sandboxed. This ManimGL (a recent checkout, wgpu based) needs no window when
  writing a file (`-w`), and without `/dev/dri` in the sandbox it renders in software (Mesa's lavapipe is installed on the
  reference machine), a little slower than on the GPU. `--sandbox-gpu` (`MFE_SANDBOX_GPU=1`) additionally
  binds `/dev/dri` into the sandbox for hardware rendering; that exposes the GPU driver to the
  untrusted code, so it is opt-in. A GL setup that cannot render in software needs `--sandbox-gpu` or
  `--no-sandbox`; the companion never falls back to unsandboxed silently.
- The code can still use the CPU until the time limit, and the disk of the job directory until 1 GiB
  is left free on it, where the companion stops the job (1.7); it can fill the `/tmp` of its tmpfs.
  The sandbox protects the user's files and network, not the machine's load.

### Limits at a glance

`/tex` body 64 KB (unchanged); a text request 5 s on a ready worker, the start of a worker 30 s;
`/video` body 64 KB; frames request 128 MiB, one PNG 64 MiB; a video 4 GiB, or what
`--max-video-gib` says (1 to 64), and 1 GiB kept free on the disk of the temporary folder;
audio request 16 MiB, a soundtrack 60 minutes (691 MB of WAV); `/manim-render` body 512 KiB code;
two unfinished video jobs, one Manim job; a job that waits for data idle 120 s, a render 30 min at
most for its soundtrack; finish wait 30 min, plus 10 min for the second pass of a job with sound (a
file of the video's limit + 128 MiB at most); Manim time limit 600 s by default.

## Implementation notes

`companion/mfe_companion.py` implements protocol v1: one file, Python standard library only
(Python >= 3.10; the test-suite was run on 3.12, 3.13 and 3.14). Tests live in `companion/tests/`
and run from the repository root with `python3 -m unittest discover -s companion/tests`
(about 5 minutes, most of it the two Manim fidelity runs; those need the Manim virtualenvs next
to the repository, or `MFE_CE_PYTHON` / `MFE_GL_PYTHON`, and are skipped when they are missing).
The repository's check before a commit (`.claude/skills/mfe-change/verify.sh`) runs them whenever
something under `companion/` changed.

### Fidelity with Manim

For every corpus formula plus about 40 extra formulas (`companion/tests/support.py`: fonts,
`{{ }}` groups, fillers, empty input, packages, preamble ...) the TeX document **and** the SVG
text are compared with what Manim itself writes: CE through `MathTex(latex, tex_template=...)`
(the SVG that `tex_to_svg_file` returns), GL through `Tex(latex, additional_preamble=...)` (the SVG
returned by `full_tex_to_svg`, whose disk cache is bypassed). The rendering content must match
exactly. Some converter versions reorder independent font-path definitions in `<defs>`; the
comparison permits only that permutation, with unchanged definition contents and exact bytes
outside the block. Geometry, paint, references and painted-node order are never reordered or
relaxed. Raw byte equality is reported separately. An earlier reference run was byte-identical
for every compiling formula (CE 99/99, GL 98/98). The companion must fail where Manim fails, and
the glyph count must equal the number of native mobjects with points.

### Where the implementation refines or deviates from the text above

- **CE normalisation runs on the joined string.** `MathTex` wraps the formula in the
  `\special{dvisvgm:raw <g id='unique000'>}` ... `</g>` pair *before* `_get_modified_expression`
  runs, so the "fillers" for a trailing `_`, `^`, `dot`, `\over`, `\sqrt` never fire (the string
  ends with `\special`) and such input fails in LaTeX exactly as it does in Manim. An empty formula
  becomes a bare `\quad` (no wrapper). `{{ ... }}` groups are split into several `uniqueNNN` groups.
- **GL `Tex`** rejects unbalanced braces *before* LaTeX runs (`Missing '{' inserted` /
  `Missing '}' inserted`, returned as `ok: false`), and colour-labels every `{{ ... }}` group
  (`{{\color[RGB]{0, 0, 1} ... }}`) in the document, as `get_content(True)` does. Layout detail:
  `additional_preamble` is always joined with `"\n"`, so the template preamble is followed by an
  empty line plus the packages/preamble, and the document ends with a newline; the TeX document in
  the "TeX documents" section is a simplification of this.
- **`line` of a LaTeX error.** The formula sits inside `align*`, which LaTeX reads as one macro
  argument, so *every* error is reported at `\end{align*}` (`l.8`), never inside the formula. A
  plain `l.<n>` mapping would therefore always give `null`. The companion first tries `l.<n>`, then
  locates the error through the `<argument> ...text read so far` context line of the log (matched
  against the formula ignoring whitespace; the first match wins because LaTeX halts at the first
  error). Errors that cannot be located (unclosed groups, problems in the preamble or packages) have
  `line: null`. In text mode the source is read line by line (`center`, or no environment at all),
  so `l.<n>` points into it directly.
- **Status codes.** `latex` / `preamble` above their limit answer `413` (as for the body); also
  `400` for a missing/invalid `Content-Length` or a chunked body, `405` for a wrong method on a known
  path. A missing `target` is `400`. Missing `latex`/`dvisvgm` or a timeout are `200` with `ok: false`.
  `OPTIONS` answers `204`. Preflights echo the requested header names; `Access-Control-Allow-Private-Network`
  is added when asked for. No CORS headers on a `Host` rejection.
- **Cache key** also contains a schema number (`CACHE_SCHEMA`) so entries from an older label
  table are never reused. Only successful results are cached. Identical concurrent requests compile once.
- **`health`**: `dvisvgm` is reported `true` only when its version is >= 2.4. Manim interpreters are
  probed once in a background thread (`health` shows `null` with `manimProbing: true` for a few
  seconds after start; the CLI `health` waits for the probes). Interpreter paths are returned
  absolute.

### Security: what `openin_any=p` does (and does not) do

- `latex` runs with `-no-shell-escape`, `openin_any=p`, `openout_any=p`, a fresh temp directory,
  a 15 s budget for `latex` + `dvisvgm` together (process group killed on expiry) and at most 2
  concurrent compiles. Verified: shell escape and writes outside the directory / to dot files fail,
  `..` reads fail, and the standard packages (babel, amsmath, amssymb, physics, bm ...) still load.
- **`openin_any` is a no-op since TeX Live 2026** (see `texmf.cnf`: "as of 2026, openin_any no longer
  has any effect"): `\input{/etc/passwd}` / `\openin` read any file the user can read, and the text
  comes back as glyph labels. If the CORS list contained `null` (sandboxed iframes and `file://`), any
  web page could exploit this while the companion runs. Mitigations implemented here:
  - `null` is refused by default (403 on GET, POST and preflight); `--allow-file-origin` /
    `MFE_ALLOW_FILE_ORIGIN=1` re-enables it and `serve` prints a warning (a stronger one when no
    sandbox is active).
  - On Linux with `bubblewrap` installed, `latex` and `dvisvgm` run inside `bwrap`: file system
    read-only, `/home /var/home /root /tmp /var/tmp /mnt /media /srv /run` replaced by empty tmpfs
    (TeX trees below them are mounted back read-only), no network, own PID namespace, only the work
    directory writable. It is enabled automatically after a smoke compile succeeds; `--no-sandbox`
    or `MFE_NO_SANDBOX=1` turn it off, for everything it confines: LaTeX, Render with Manim and the
    sound of its video, and the text workers. `serve` prints the sandbox status and a warning when
    there is none: on Linux it says to install bubblewrap; on macOS and Windows, which have none to
    install, it says what is not confined there and that the pages must be trusted.
  - Without it (macOS, Windows, no `bwrap`) there is **no** read confinement; only pages served from
    `localhost` / `127.0.0.1` can read responses. The companion can serve the built app itself
    (`serve --app app/dist`, same origin), so `file://` and the `null` opt-in are not needed then.

### Glyph labels

- The DVI of page 1 gives the sequence of characters (`set_char`, `set1-4`, `put1-4`) and rules
  (`set_rule`, `put_rule`; both dimensions must be positive, like dvisvgm, so `\strut`s paint
  nothing). It is aligned 1:1 with the SVG shapes (`<use>` of a non-empty path, followed through
  another `<use>` where dvisvgm draws a glyph it already has at a second size, `<path>`, `<rect>`
  ... outside `<defs>`); a `<rect>` must meet a rule and anything else a character. On any mismatch
  every character becomes `?` (rules stay `—`) plus a warning; the list length always equals the shape count.
- Encodings (from the AFM / `.enc` files of TeX Live, reviewed by hand): OT1 (cmr, cmbx, cmsl, cmti,
  cmss, ...), OT1 typewriter, OML, OMS (capitals = calligraphic `𝒜`), OMX (delimiter pieces report the
  delimiter, big operators their symbol, brace tips `⏟ ⏞`), T1/EC, TS1, msam, msbm (capitals =
  blackboard bold `ℝ`), rsfs (script), eufm (fraktur), dsrom, lasy, wasy, line/circle (`╱`, `○`).
  Conventions follow MathJax where it has an opinion: `\epsilon` `ϵ` (U+03F5), `\varepsilon` `ε`,
  `\phi` `ϕ`, `\varphi` `φ`, `\vec` `→`, `\hat` `^`, `\tilde` `~`, minus `−` (U+2212), `\cdot` `⋅`,
  ligatures spelled out (`ffi`). Fonts without a table (tipa, pifont, virtual fonts such as Times) give
  `?` with a warning naming the font.
- Corpus coverage: 837 CE and 846 GL glyphs over 99 / 98 formulas, 0 unknown labels.
