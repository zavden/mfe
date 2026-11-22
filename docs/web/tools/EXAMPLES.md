# Examples and the player

An example is a project of the app that a page of the documentation plays, offers for download and
shows as Python. This guide is for the authors of pages and of widgets: how to make an example, how
to put it on a page, and the engine a widget builds on. The tools run the app itself, so what a page
shows is what the app does.

Paths are relative to `docs/web/` unless they start with `app/` or `docs/`. Run the commands from
the repository's root folder.

## 1. What an example is

An example is a few files in `examples/`, all named by its slug (lowercase words joined by hyphens):

| File | Made by | What it is |
|---|---|---|
| `<slug>.mfe.json` | you | The project: a normal file of the app, the current format (`docs/FORMAT.md`). The reader downloads it and opens it with **File ▸ Open…**, then **Other file…**. Its `meta.name` is the example's title. |
| `<slug>.about.json` | you | What the documentation says of it: `{ "description": "One or two sentences." }`, nothing else. |
| `<slug>.data.js` | `examples.mjs build` | What a page loads: the card's data, the Python, and the scene the player draws. |
| `<slug>.ce.py`, `<slug>.gl.py` | `examples.mjs build` | The app's own **Export ▸ Python** for ManimCE and ManimGL, as the dialog gives it. |
| `<slug>.mp4` | `examples.mjs render` | The scene rendered by ManimCE, 854×480 at 15 fps. Only the examples that need one (tutorials). |

Never edit a generated file by hand: change the project, then build again.

**The glyph indices.** A relation pair, a glyph colour or a block names glyphs by their canonical
index: their place in the formula's snapshot. The tools render with MathJax (they never start the
companion), so a formula's indices are the order MathJax gives its glyphs. That is often the reading
order, but not always: MathJax gives `\frac{a}{b}` as a, b, then the bar, and `\sqrt{c}` as c, then
the root. `examples.mjs glyphs` prints them. `build` writes every snapshot into the project file, as
**File ▸ Save** does, so that every reader gets the same indices: one with the companion online too,
whose app carries the references over to its exact render.

**The Python.** Without the companion the app cannot know Manim's own order of the glyphs, so the
exported scene finds them by position when it runs (a helper `_glyphs` at its top, which uses
SciPy, a dependency of both Manim libraries). This is exactly what a reader without the companion
gets from **Export ▸ Python**. The page `manim/python` explains it.

## 2. Making an example

### 2.1 Start from a list of formulas: `new`

Most examples are a derivation: formulas that turn one into the next. `new` makes one:

```sh
node docs/web/tools/examples.mjs new first-transform --title 'First transform' \
  --formula 'x + 3 = 5' --formula 'x = 5 - 3' --formula 'x = 2' \
  --align '=' --font-size 96 --hold 1.2 \
  --description 'An equation solved in two steps.'
```

It writes `<slug>.mfe.json` and `<slug>.about.json`. Each formula is a clip, the clips taking turns
on two tracks. The first writes itself in (Write, 1 s); each formula holds for `--hold` seconds
(default 1), then turns into the next during a window of `--window` seconds (default 1): a relation
whose pairs are what the relation editor's **Suggest links by label** gives (one-to-one links
between glyphs with the same label, in reading order). The glyphs no pair takes fade out of the one
formula and into the next. The last formula stays to the end.

| Option | Default | What it does |
|---|---|---|
| `--formula <tex>` | (at least one) | A formula, in order. Quote it for the shell. |
| `--title <text>` | the slug | The project's name: the example's title. |
| `--description <text>` | a TODO | Written into `<slug>.about.json` when there is none. |
| `--align center\|left\|<glyph>` | `center` | Where each formula stands: centred; every left edge where the last formula's is; or a glyph's label (`=`): that glyph of every formula where the last formula's is (a formula without it is centred). The last formula is centred in each case. |
| `--font-size <pt>` | 48 | Manim's `font_size`. 72 or 96 read well in a player. |
| `--background #RRGGBB` | `#000000` | The scene's background. |
| `--hold <s>`, `--window <s>` | 1, 1 | The timing above. |

Then adjust it by hand (2.3 to 2.6), and build it (2.7).

### 2.2 Or make it in the app

Make the project in the app, save it (**File ▸ Save As…**), copy the file to
`examples/<slug>.mfe.json`, write `<slug>.about.json`, and build. A project made with the companion
online carries exact snapshots, and keeps them: its indices are LaTeX's.

An example that is another one after a few gestures in the app (the "after" of a page that shows a
change) is made by `derive` (2.10), never by hand.

### 2.3 Or write the JSON

The format is `docs/FORMAT.md`; the examples of `examples/` and `docs/web/examples/` show every
field. A few rules matter when you write it by hand:

- `"format": "manim-formula-editor"` and `"version"` the current one (36). A file of an older
  version opens too: the app migrates it, and `build` writes it back in the current one.
- Ids are any strings unique in the project; the app writes `f_…` for formulas, `t_…` tracks, `c_…`
  clips, `r_…` relations and `a_…` animation blocks.
- A new formula has `"snapshot": null`: `build` (and `glyphs`) render it and fill it in.
- **When you change a formula's source, set its snapshot to `null` before you write indices for
  it**, and print its glyphs again. A snapshot of the old source makes the app carry the old
  indices over to the new glyphs by its edit matching, which may not be what you mean.
- Times are seconds, positions scene units (the frame is 8 tall and 14.22 wide at 16:9, the origin
  at its centre, y up), colours `#RRGGBB` in capitals.

### 2.4 The glyphs by index: `glyphs`

```sh
node docs/web/tools/examples.mjs glyphs first-transform --png /tmp/glyphs
node docs/web/tools/examples.mjs glyphs --latex '\frac{a}{b} = \sqrt{c}' --png /tmp/glyphs
```

For every formula it prints each glyph's canonical index, what it is (the character; `—` for a
rule: a fraction bar, a root's line), its centre and its size, and the indices in reading order:

```
step2 (math: x = 5 - 3) — 5 glyphs, canonical order (mathjax snapshot)
    #  glyph      x       y      w      h
    0  x      -0.893  -0.053  0.244  0.227
    1  =      -0.412  -0.036  0.334  0.117
    …
  reading order: 0:x 1:= 2:5 3:− 4:3
```

`--png <dir>` also draws each formula with its indices over its glyphs (`<slug>-<formula>.png`):
look at it before you write pairs. `--latex` takes any formula (`--target gl` for ManimGL's
sizes); `--json` prints the list as JSON.

### 2.5 The pairs of a relation: `pairs`

```sh
node docs/web/tools/examples.mjs pairs first-transform 1            # the first relation
node docs/web/tools/examples.mjs pairs hero step2:step3 --replace   # by its formulas' names
node docs/web/tools/examples.mjs pairs first-transform 2 --mode edit --write
```

It prints the pairs the relation has, the pairs the app suggests beside them, the source glyphs that
no pair takes (they leave with the source clip's outro) and the target glyphs that no pair brings
(they arrive with the target clip's intro), and the suggestion as JSON to paste. A relation is named
by its number (in the file's order), its id, or `<from>:<to>`, the names of its two formulas. Two
clips can have several relations: `<from>:<to>` is then the first of them, and the suggestion does
not know the glyphs the others have taken (the relation editor does, and dims them).

| Option | What it does |
|---|---|
| `--mode label` | The default: the relation editor's **Suggest links by label**. |
| `--mode edit` | The engine's matching of a formula with an edit of it (`matchGlyphs` in edit mode): it also pairs glyphs whose label changed in place. |
| `--replace` | Suggests for the whole relation, the pairs it has set aside. |
| `--write` | Writes the pairs (the ones it has, unless `--replace`, then the suggested ones) into the project, if the result has no errors. |

A pair is `{ "from": [i], "to": [j], "style": null }`. Several sources onto one target, or one
source onto several, are one pair (`"from": [2, 3, 4], "to": [2]`). `"style"` is `null` (the
relation's), `"transform"`, `"copy"` (the source stays), `"fade"` or `"fade_copy"` (the source
stays).

### 2.6 Colours, styles and the rest

The fields an example most often changes after `new`, all in `docs/FORMAT.md`:

- a formula's `glyphColors`: `{ "2": "#F4C867" }`, by canonical index;
- a pair's `style` and, for several sources onto one target, its `extras` (`separate`, `merge`,
  `copies`); a relation's `style`, `easing` and `pathArc` (degrees: a negative arc bends a glyph
  moving to the right over the top);
- a clip's `intro`, `outro`, `initial` state (its position, scale, colour) and `actions` (the
  animation blocks: Appear, Disappear, Transform, Morph, Emphasis);
- a formula's `hiddenGlyphs`, which wait for an Appear block or a relation.

`validate` (below) tells you at once what the app thinks of a change.

### 2.7 Check it and build it: `validate`, `build`

```sh
node docs/web/tools/examples.mjs validate first-transform
node docs/web/tools/examples.mjs build first-transform   # or build: every example
```

`validate` opens the project in the app and prints its length, its objects, its tracks, clips,
relations and blocks, what the app reports (errors and notes), the size of both exports, and the
scene evaluated at 41 instants by the app and by the player from the data it would get: they must
draw the same glyphs, to within a fraction of a pixel.

`build` writes `<slug>.data.js`, `<slug>.ce.py` and `<slug>.gl.py`, and rewrites `<slug>.mfe.json`
as the app saves it when it differs (it says so): the snapshots, the places of attached objects, the
app's order of the fields. It fails, saying why, on a file the app cannot read, on a formula that
does not render (the LaTeX error), on an error the app reports in the project, and on an error of
either export; it builds the other examples and lists the ones it could not. The notes every
example built without the companion gets are said once, in a word.

Build again after every change of the project, of its sidecar or of the video, and commit the
generated files with the project.

### 2.8 The Manim video: `render`

```sh
node docs/web/tools/examples.mjs render first-transform
node docs/web/tools/examples.mjs build first-transform    # so that its card links the video
```

It exports the ManimCE scene from the app and renders it with the ManimCE of the venv beside the
repository (`../manim_ce/venv`), at 854×480 and 15 fps, in a temporary folder that it removes, and
writes `<slug>.mp4`. With ffprobe on the machine it prints the video's size, frame rate, frames and
length. Only tutorials need a video: a page shows the player for everything else.

### 2.9 The commands

| Command | What it does |
|---|---|
| `new <slug> --formula … [options]` | A derivation from a list of formulas (2.1). |
| `glyphs <slug> [--png <dir>] [--json]` | The glyphs of its formulas by index (2.4). |
| `glyphs --latex '<tex>' [--target ce\|gl] [--png <dir>] [--json]` | The glyphs of any formula. |
| `pairs <slug> <relation> [--mode label\|edit] [--write [--replace]]` | The pairs the app suggests (2.5). |
| `validate [slug…]` | What the app says of the examples, and the player against the app (2.7). |
| `build [slug…]` | The data, the Python and the project file of the examples (2.7). |
| `render <slug>` | The ManimCE video (2.8). |
| `check [page.html…] [--shots <dir>]` | The players of pages opened from disk (3.5). |
| `derive <from> <new> --steps <file.mjs> [options]` | Another example after gestures in the app (2.10). |

Every command that starts Chrome, the app's dev server or Manim takes a slot of the machine lock
and waits for a cool CPU (`tools/lib/`): run them as you need them, they take turns with the other
authors' runs. A command prints the highest CPU temperature of its run.

### 2.10 An example made from another: `derive`

```sh
node docs/web/tools/examples.mjs derive first-transform first-transform-earlier \
  --steps /tmp/my-steps.mjs --title 'First transform, the last step earlier' \
  --description 'The same equation, its last step half a second earlier.'
```

It opens the first example in the app, runs the gestures of a steps file on it, waits for the
renders and for the project to settle, and saves the project the app then holds as
`<new>.mfe.json` (with `<new>.about.json` when there is none), then builds it in the same run (2.7).
What a page shows as "after" is then what the app does after those gestures. The steps file is a
module like a capture file's steps, with the same kit (`tools/CAPTURES.md`):

```js
// The clip of step3 dragged half a second earlier on its track.
export const viewport = { width: 1440, height: 900 };   // optional; the default
export default async (page, kit) => {
  await kit.drag({ clip: 'step3' }, { dx: -0.5 * (await kit.pxPerSecond()), dy: 0 });
};
```

`export default` is one function or a list of them, run in turn; the kit runs at once (it is not
recording), and the file is read when the run takes its slot, so an edit made while it waits
counts. Keep the steps file beside your capture files or in a temporary folder: it is not part of
the example.

| Option | What it does |
|---|---|
| `--steps <file.mjs>` | The gestures (required). |
| `--title <text>` | The new example's title (`meta.name`); without it, the first example's. |
| `--description <text>` | Written into `<new>.about.json` when there is none. |
| `--viewport <w>x<h>` | The window the gestures run in (default 1440x900, or the file's `viewport`). |
| `--force` | Writes over an existing `<new>.mfe.json` (its `.about.json` is kept). |
| `--no-build` | Saves the project only; `build <new>` later. |

Nothing is written when a step throws (the message names a screenshot of the app as the steps left
it), when the steps changed nothing, or when the app reports an error in the project they left
(a clip dragged so that a relation no longer fits, say): the errors are printed. A dialog or a
menu still open at the end is warned about: what it has not applied is not in the project.

## 3. Putting an example on a page

### 3.1 The scripts

A page that plays an example loads the player and the example's data in its head, the player
first, after the site's scripts:

```html
<script src="../assets/player.js" defer></script>
<script src="../examples/first-transform.data.js" defer></script>
```

The Python tabs and the example card need the data script too; they do not need the player.

### 3.2 The player

```html
<figure class="mfe-player" data-mfe-player="first-transform" data-timeline
        data-caption="x + 3 = 5 solved in two steps."></figure>
```

The player draws the scene as the app's Preview does (the same evaluator, the same canvas renderer;
the clips of hidden tracks are not drawn), crisp on any screen, at the project's aspect, with the
app's transport bar under it: back to the start, Play, Loop, a time bar, the time, the speeds. A
click on the scene plays and pauses; so do Space and K while the player has the focus; ← and → step
a frame (Shift: a second), and so do ↑ and ↓ on the time bar; Home and End go to the start and the
end. It mounts by itself once the page's deferred scripts have run (and `site.js` asks it to as
well).

| Attribute | Value | What it does |
|---|---|---|
| `data-mfe-player` | a slug | The example (required). |
| `data-timeline` | boolean | A small version of the app's timeline under the scene: the tracks, the clips with their formulas' names, their intros and outros, the animation blocks, the relations; a press or a drag on it moves the time (a finger that swipes up or down on it scrolls the page). |
| `data-autoplay` | boolean | Plays by itself while at least half of it is on screen; never when the reader's system asks for reduced motion. It plays from `data-start`: give it one where the scene shows what it is about, since that instant is what the page shows first, and all such a reader sees (`check.mjs` warns of an empty one). |
| `data-loop` | boolean | Starts again at the end (the Loop key shows it on; the reader can turn it off). |
| `data-from`, `data-to` | seconds | Plays and shows only that part of the scene: the time bar and the strip span it. |
| `data-start` | seconds, or `end` | The instant shown before it plays (default: the start of its part). Play at the end starts from the beginning. |
| `data-controls` | `full`, `minimal`, `none` | Every control (the default); Play, the time bar and the time; or none: the scene alone, which a click plays and pauses. |
| `data-speed` | `0.5`, `1`, `2` | The speed it starts at. |
| `data-caption` | text | A caption under it, unless the figure has a `<figcaption>` of its own (which stays). |

A boolean attribute is on when present (`data-loop`), and off with `"false"` or `"0"`. A value the
player cannot read is ignored and named in the console. Anything else inside the figure (a fallback
image, say) is replaced while the player is mounted. Any player that leaves the screen pauses, and
plays again when it comes back if it was playing (with reduced motion it stays paused: nothing
moves by itself then).

An example the page has not loaded shows a notice in the figure that names the script to add, and
the console says it too: the rest of the page goes on.

A mounted figure carries `data-mfe-mounted` and says how it stands in `data-time` (seconds of the
scene), `data-progress` (0 to 1 through its part) and `data-playing` (`true`, `false`): a test of a
page reads them. Its controller is `figure.mfePlayer` (3.6).

### 3.3 The Python, the card and the video

These are the site's components (`AUTHORING.md`), fed by the example's data:

```html
<!-- The Python: ManimCE / ManimGL tabs, copy, download. -->
<div class="mfe-code" data-mfe-python="first-transform"></div>
<!-- The card: title, description, downloads. -->
<div class="mfe-example" data-mfe-example="first-transform"></div>
<!-- The video ManimCE rendered. -->
<video class="mfe-manim" src="../examples/first-transform.mp4" controls preload="metadata"
       playsinline></video>
```

Use the video only for an example that has one (`meta.files.video`, 4).

### 3.4 Links to the files

To link a file of an example in the prose, use its path from the page:
`../examples/first-transform.mfe.json` (the project, to open with **File ▸ Open…**, then **Other file…**),
`../examples/first-transform.ce.py`, `../examples/first-transform.gl.py`.

### 3.5 Checking a page: `check`

```sh
node docs/web/tools/examples.mjs check basics/first-transform.html --shots /tmp/shots
```

It opens each page from disk (without the dev server), in the dark and the light theme, at a
desktop width and at a phone's (360 px), and for every player checks that it mounted, that Play
plays (its time moves 0.1 s forward and it goes on playing, the strip's playhead too), that its
canvas has ink and is crisp (its bitmap on device pixels), that the page does not scroll sideways
and that nothing writes an error to the console. A heavy scene in a Chrome without a GPU draws a
frame in more than 250 ms, and the player's clock moves at most 0.1 s a frame: the check waits for
the clock up to 8 s (the line says `played true (in 1.4 s)` when it took more than a second), and
fails a player whose time does not move by then. A player with `data-autoplay` is given a moment to start by itself once it is on screen
(the line says `autoplay started` or `did not start`), and Play is pressed only on a player that is
not playing. A figure with `data-expect="missing"` must show its notice instead. Without a page it
checks `authoring/player.html`, the player's showcase. `--shots` saves a full-page screenshot of
each case, its images decoded first (a tour's picture paints too); a page without players gets its
screenshots and nothing else.

### 3.6 Players from a script

`window.MFEPlayer` is there once `player.js` has run:

| Member | What it does |
|---|---|
| `MFEPlayer.mountAll(root = document)` | Mounts every `[data-mfe-player]` figure under `root` not mounted yet; returns the new players. Mounting twice is a no-op. |
| `MFEPlayer.mount(figure, options?)` | Mounts one figure; `options` are the attributes' options by name (`{ loop: true, from: 2, controls: 'minimal' }`), over its attributes, and `project`: a modified copy of the example's project to play instead (5). Returns the player, or `null` (and a notice in the figure). |
| `MFEPlayer.engine` | The engine (5). |
| `MFEPlayer.injectStyles(document)` | Puts the player's stylesheet in the page once (a player does it when it mounts): for a widget that builds the player's transport bar or its strip without a player. |
| `MFEPlayer.version` | The player's version (`1.1.0`). |

A player (`figure.mfePlayer`, or what `mount` returns) has `play()`, `pause()`, `toggle()`,
`seek(seconds)`, `setLoop(boolean)`, `setSpeed(0.5 | 1 | 2)`, `destroy()` (it gives the figure back
as it was), and reads `time`, `playing`, `range` (`{ start, end }`), `options`, `example` and
`scene`.

## 4. The data of an example

`<slug>.data.js` assigns `window.MFE_EXAMPLES[slug]`:

| Field | What it holds |
|---|---|
| `meta.slug`, `meta.title`, `meta.description` | The slug, the project's name and the sidecar's description. |
| `meta.duration`, `meta.fps` | The scene's length in seconds, and its frame rate. |
| `meta.width`, `meta.height`, `meta.background`, `meta.target` | The project's video size (its frame's aspect), the scene's background and its library (`ce` or `gl`). |
| `meta.files` | `{ project, ce, gl, video? }`: the paths of its files **from `docs/web/`** (`examples/first-transform.mfe.json`), so that a component makes a link with `MFEDocs.root + path`. `video` is there only when the example has one. |
| `python.ce`, `python.gl` | The text of `<slug>.ce.py` and `<slug>.gl.py`. |
| `player` | What the player draws: `version` (1), `project` (the project as the app holds it once rendered, without sound) and `renders` (each formula's glyphs as outlines, packed: `app/src/embed/data.ts`). Read it through the engine, not directly. |

## 5. The engine, for widgets

`MFEPlayer.engine` gives a widget the example the page has loaded, its formulas and glyphs, scenes
of modified copies of its project, and the drawing — the same code that draws the players. A
widget's page loads `player.js` and the data of its examples like any page (3.1); the widget's own
script comes after them, and mounts once the document is loaded.

### 5.1 An example

```js
const example = MFEPlayer.engine.example('hero');   // null when the page has not loaded it
```

| Member | What it gives |
|---|---|
| `slug`, `meta`, `python` | As in the data (4). |
| `project` | The example's project. Shared by every player of the page: never change it; copy it. |
| `cloneProject()` | A deep copy of the project, to change. |
| `formulas()` | `[{ id, name, kind, source, glyphs, clips }]`: each object, its glyph count and the ids of its clips. |
| `formula(idOrName)` | The formula object, or `null`. |
| `glyphs(idOrName)` | Its glyphs in canonical order: `[{ index, label, kind, box, center, size, contours }]`, in the formula's own scene units (centred on it, at its font size, before a clip places it; `box` includes control points, as Manim's; `contours` are cubic outlines `[x0, y0, c1x, c1y, c2x, c2y, x1, y1, …]`, or `null` for a glyph the render lacks). |
| `render(idOrName)` | The app's render of it (`FormulaRender`, `app/src/engine/types.ts`). |
| `scene(project?, { includeHidden }?)` | A scene of the example's project (made once and shared), or of `project`. |
| `formulaScene(idOrName)` | A scene of the formula alone at the centre of the frame, still: draw it at time 0. Its `clip` is the id of its one clip. |
| `validate(project?)` | The app's checks of a project (`validateProject`): `[{ severity, code, message, path }]`. |
| `placeLines(project)` | `project` with every line whose ends are on glyphs placed where the app's attach sync puts it — after an end was put at another anchor or on other glyphs: its vector, its clip's position, its snapshot. Braces, shapes and labels keep their places. |

`MFEPlayer.engine.load(slug, data)` revives data held elsewhere (the same object gives the same
example), and `MFEPlayer.engine.revive(slug, data)` a fresh one each time.

**What a modified project may change.** The renders travel with the data, and the player typesets
nothing: a project may change the pairs of relations and Morph blocks, timing, clips and tracks,
colours, intros and outros, blocks, positions. It may not change what an object is made of, which
the app derives by rendering — a formula's source, packages or font size, a brace's or a shape's
size and style, the project's target or preamble: a scene of such a project throws, saying what
changed —, nor add a formula the example has not (a new one is not drawn). Attached objects (braces,
shapes, labels) keep the places the example gave them. A line is the exception: its glyphs are
geometry the app builds in the browser, so the engine builds them again when a line's fields change,
and `placeLines` places a line whose ends were put elsewhere (another anchor, other glyphs) as the
app's attach sync does. Run `validate` on a project a reader made before you play it, and show its
errors instead: the app would not let such a project be made, and its scene is not what the reader
means.

### 5.2 A scene

| Member | What it gives |
|---|---|
| `project`, `duration`, `fps`, `background` | Its project, its length in seconds, its frame rate and background. |
| `frame` | The Manim frame in scene units: `{ minX, minY, maxX, maxY }` (8 tall, centred). |
| `evaluate(t)` | The drawables at `t` (clamped to the scene): `[{ key, clipId, glyph, path, fill, stroke, z, role, partial }]` (`app/src/scene/types.ts`). Never change them. |
| `geometry(t)` | Where each clip on screen at `t` is: `[{ clipId, box, glyphs }]`, `glyphs` a `Map` from canonical index to the glyph's placed box, drawn or not, in scene units. |
| `contentBox(t)` | The box of everything on screen at `t`, or `null`. |
| `draw(canvas, t, { region, adjust }?)` | Draws the scene at `t` into the canvas's whole bitmap and returns the view (5.3). `region` is the part of the scene to show (default the frame), fitted whole and centred; `adjust(drawables)` returns the drawables to draw instead (fewer, recoloured copies, more). |
| `view(canvas, { region }?)` | The view `draw` would use. |
| `evaluator` | The app's evaluator itself. |

Size the canvas's bitmap before you draw: `MFEPlayer.engine.sizeCanvas(canvas)` gives it its CSS
size times the screen's pixel ratio (call it again when the canvas is resized).

### 5.3 A view: from the scene to the canvas

| Member | What it does |
|---|---|
| `toCss([x, y])`, `fromCss([px, py])` | A scene point to CSS pixels from the canvas's top left corner (what `offsetX`, `offsetY` of a pointer event on it say), and back. |
| `boxToCss(box)` | A scene box to `{ left, top, width, height }` in CSS pixels. |
| `toPixel`, `toScene` | The same with the bitmap's device pixels. |
| `scale`, `dpr`, `camera`, `surface` | Device pixels per scene unit, device pixels per CSS pixel, and what the renderer drew with. |

`MFEPlayer.engine.fitView(meta, surface, dpr, region)`, `frameBox(meta)`, `padBox(box, margin)` and
`bitmapSize(width, height, dpr)` are the same calculations, for a widget that draws on its own.

### 5.4 Two widgets in a few lines

A formula drawn large, each glyph's index over it (`authoring/player.html` runs this):

```js
const scene = example.formulaScene('step4');
MFEPlayer.engine.sizeCanvas(canvas);
const view = scene.draw(canvas, 0, { region: MFEPlayer.engine.padBox(scene.contentBox(0), 0.3) });
for (const [index, box] of scene.geometry(0)[0].glyphs) {
  const { left, top, width } = view.boxToCss(box);   // place a label at (left + width / 2, top)
}
```

A pick of a glyph is the same mapping the other way: the glyph whose box holds
`view.fromCss([event.offsetX, event.offsetY])`.

The reader's pairs, played in a player under the widget (here the second relation of
first-transform, x = 5 − 3 into x = 2):

```js
const example = MFEPlayer.engine.example('first-transform');
const project = example.cloneProject();
project.relations[1].pairs = [
  { from: [0], to: [0], style: null },
  { from: [1], to: [1], style: null },
  { from: [2, 3, 4], to: [2], style: 'fade' },
];
const problems = example.validate(project).filter((issue) => issue.severity === 'error');
if (problems.length === 0) {
  figure.mfePlayer?.destroy();
  MFEPlayer.mount(figure, { project, loop: true });   // figure: <figure data-mfe-player="slug">
}
```

### 5.5 The app's rules, for widgets

A widget never writes the app's logic again: what it needs of the app's rules is in the engine,
each a copy of the app's own function (the player cannot import `app/src/ui/`) held to the
original by a unit test of `app/src/embed/__tests__/`, which fails when the app changes until the
copy follows.

| Member | What it gives |
|---|---|
| `engine.rates.names` | The rate functions the app's editors offer, by Manim's names (`smooth`, `linear` …). |
| `engine.rates.curve(name, 'ce' \| 'gl')` | The rate function of either library: `(t) => progress`, `t` clamped to 0–1 (`scene/easing.ts`). |
| `engine.rates.pulses` | The ones that come back to where they started (an Indicate takes only these). |
| `engine.animationLabel(kind)` | Manim's name of an intro or outro kind: `fade_out` → `FadeOut`. |
| `engine.relations.click(selection, side, glyph, additive)` | What a click on a glyph does in the relation editor: `{ kind: 'select', selection }` or `{ kind: 'link', from, to }`. A selection is `{ from: Set, to: Set }`. |
| `engine.relations.link(relation, from, to, style?, labels?)` | The editor's Link: `{ ok, relation, joined?, message? }` (the relation with the new pair, or with a pair it joined) or `{ ok: false, message }`, with the editor's own messages. |
| `engine.relations.remove`, `setStyle`, `setExtras` | The pair list's Delete, style and extras: `(relation, indices, …)` → a new relation. |
| `engine.relations.suggest(fromSnapshot, toSnapshot, pairs, taken?)` | The editor's Suggest links by label. `taken` (`{ from, to }`, glyph indices) is what another relation or a Morph block keeps from this one, which it leaves out: the editor works it out, a widget names it (the engine does not). |
| `engine.relations.unpaired(project, relation, fromCount, toCount)` | `{ leaving, entering }`: the glyphs no pair takes (they run the source's outro) and that no pair brings (the target's intro). |
| `engine.relations.holding(pairs, selection)` | The pairs that hold a selected glyph. |
| `engine.relations.readingOrder`, `glyphLabel`, `describe`, `summary` | Reading order, a glyph's label, `"x + → x +"`, `"4 linked pairs · 1 glyph leaves · 0 glyphs arrive"` (`summary(pairs, leaving, arriving, staysOut?)`: "stay out" for a target that starts empty). |
| `engine.relations.linkFrame(sourceBox, targetBox, text, layout?)`, `textSize(boxes)` | Where the editor's drawing puts the two formulas, spaced by `text`, the size of their text (`textSize` of the boxes of the glyphs of both: the median of their longer sides): `'stacked'` (the default), the source above a gap and the target below, or `'side'`, the source at the left. |
| `engine.relations.styles`, `extras`, `styleLabel`, `badge`, `colors`, `color(i)` | The editor's names of the styles and extras, a pair's badge, the colours that tell pairs apart. |
| `engine.relations.windowRange(fromClip, toClip)`, `minWindow` | Where a window may lie (absolute seconds), and its least length (0.05 s). |
| `engine.relations.clampWindow(project, relationId, { start, end }, 'move' \| 'start' \| 'end')` | Where an edit of a window lands (`{ offset, duration }`), as the timeline's drag and the relation panel's fields clamp it. |
| `engine.relations.windowSpan`, `span`, `framedTimes`, `band`, `progress`, `pad` | The relation editor's Preview: the window in scene seconds, the loop around it, the instants its camera frames, where the window lies on its bar. |
| `engine.lines.anchors`, `compass`, `labels`, `arrows`, `autoHint` | The anchors of a line's end (`auto` and the nine points), as the Preview's compass names and draws them. |
| `engine.lines.anchorPoints(project, evaluator, end, t)` | Where each of the nine points is on the glyphs an end is on, at `t`. |
| `engine.lines.ends(project, evaluator, clip)` | `{ raw, drawn }`: the two points a line clip runs between, before and after its gap. |
| `engine.lines.render(lineFormula, target)` | A line's glyphs, as the app builds them. |
| `engine.palettes.roles`, `uses`, `roleOfKind(kind, shape?)` | The eleven roles of a palette, what the editor does with each, and the role a new object of each kind takes. |
| `engine.palettes.builtIn`, `editor` | The palettes the app comes with: `{ id, name, mode, colors, origin }`, the editor's own colours first, then Chroma Lab's themes. |

`widgets/README.md` tells how the widgets of the documentation use them.

## 6. The player itself

The player is the app's code: `app/src/embed/` (the engine, the DOM player, the strip, its
stylesheet), drawing with the app's core (`model`, `geom`, `scene`, `render`), never with `ui/`.
`docs/web/tools/build-player.mjs` builds it into `assets/player.js`, one classic script (an IIFE,
minified, its stylesheet inside), and writes `assets/player-licenses.txt` beside it:

```sh
node docs/web/tools/build-player.mjs           # build; prints the size and the packages inside
node docs/web/tools/build-player.mjs --check   # fails if player.js is not what the sources make
```

Build it again after any change of `app/src/embed/` or of the core it draws with, and commit it
with the change. It is about 255 KiB: the app's evaluator and renderer, the player, and zod (which
the model's lists of animations are made from). Only the packages the tool allows may be inside;
MathJax never is (nothing in the player typesets LaTeX), and a test of `app/src/embed/` walks its
imports to keep it so.

The player's look is the app's Mint style: the transport bar and the timeline of the app
(`app/src/ui/transport/`, `app/src/ui/timeline/`), coloured with the site's tokens (`--doc-*`) and,
where the site's stylesheet is not loaded, with the app's own values, dark or light as the page is.
The colours the contract has no token for (the amber of the time, the Play key's gradient, the
colours of the blocks) are the app's, per theme. The scene keeps its own background.

## 7. Exported pages: `build-deck.mjs`

A page can also show what **Export ▸ HTML** writes for an example: the live page itself, with its
bar, its keys and its notes, embedded with its own tags as a reader embeds it in a page of theirs
(`basics/slides` does). It is not the player: it is the app's exported page, its own runtime
(`app/src/deck/`), its own look (`player.css`) and its own options.

```sh
node docs/web/tools/build-deck.mjs           # write docs/web/decks/; prints each file and its size
node docs/web/tools/build-deck.mjs --check   # fails if a file of decks/ is not what the sources make
```

The tool writes `decks/mfe-runtime.js`, `decks/player.css` and `decks/LICENSES.txt`, shared by
every deck of the site, and for each example of its `DECKS` list `decks/<slug>/scene.js`,
`glyphs.js` and `AGENTS.md`. Every file comes from the app: the engine, its licences and its
stylesheet from the app's own Vite plugin (`app/build/deckRuntime.ts`), the scene's files from the
export itself (`exportedFolder` of `app/src/export/html/exportHtml.ts`) of the example's project
with the renders of its `<slug>.data.js`. It runs in Node with Vite's module runner, in about a
second: no browser, no lock. So the order after a change is: `examples.mjs build <slug>`, then
`build-deck.mjs`; and after a change of `app/src/deck/` or `app/src/export/html/`, `build-deck.mjs`
alone. Commit what it writes.

A deck takes the marks of the Slides mode from its project (`slides.marks`); they must stand where
the scene rests, or the export leaves them out. To show another example, add its slug to `DECKS`.
A page embeds it with the stylesheet and three scripts, the engine first:

```html
<link rel="stylesheet" href="../decks/player.css">
<script src="../decks/mfe-runtime.js" defer></script>
<script src="../decks/slides-talk/glyphs.js" defer></script>
<script src="../decks/slides-talk/scene.js" defer></script>
…
<div class="mfe-deck" data-scene="first-transform-as-a-talk"></div>
```

`data-scene` is the scene's name: the project's name in small letters and hyphens. The runtime
mounts the deck once the page is loaded; its options are its `data-` attributes (`basics/slides`
lists them). `check.mjs` fails a deck that did not mount or that shows the panel of what is wrong
with its scene. A page may quote the scene's files with `data-excerpt` (`decks/<slug>/AGENTS.md`):
the build checks the quote against what the tool wrote.
