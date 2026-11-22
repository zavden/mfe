# First transform, as a talk: a scene to extend

This folder is the scene `first-transform-as-a-talk` (6.60 s), exported from Manim Formula Editor as
a page that plays it live. You extend it by editing `scene.js` (the animation as data) or by adding
code to `custom.js` (`window.MFE`), and restyle it in `player.css`. Check every change with
`node check.mjs`.

Contents:

- [1. What the author wants done next](#1-what-the-author-wants-done-next)
- [2. The folder](#2-the-folder)
- [3. Look at it, check it](#3-look-at-it-check-it)
- [4. Extend it by editing scene.js](#4-extend-it-by-editing-scenejs)
- [4.1 Edits that work here](#41-edits-that-work-here)
- [5. Extend it with code: custom.js and window.MFE](#5-extend-it-with-code-customjs-and-windowmfe)
- [5.1 Scripts that work here](#51-scripts-that-work-here)
- [6. The stage](#6-the-stage)
- [7. Embedding](#7-embedding)
- [8. Changing the look](#8-changing-the-look)
- [9. Pitfalls](#9-pitfalls)

## 1. What the author wants done next

The author left these comments at instants of the scene for whoever works on it next. Treat each as
a task. Times are seconds of the scene; names are the clips’ (section 4).

1. **5.40 s** (`slides.marks[2]`) — after `step2 → step3 (transform, 3 pairs)`, nothing after; on
   screen: `step3`.
   > Make the 2 of the answer glow once it is in place.

A task done, take its mark out of `slides.marks`: the page’s notes (S) stop showing it, and the
author keeps it in the editor.

Its pauses, where the page stops (their notes are the presenter’s; context for you):

- Pause 1 at 1.00 s (`slides.marks[0]`) — “Ask: what takes the 3 away from the x?”; it skips its
  wait: going on, the page jumps to 2.20 s; after `step1 write`, before `step1 fade_out`; on screen:
  `step1`.
- Pause 2 at 3.20 s (`slides.marks[1]`) — “Work out 5 − 3 together before going on.”; after
  `step1 → step2 (transform, 4 pairs)`, before `step2 fade_out`; on screen: `step2`.

**Where to make a change**: the next export from the editor writes `scene.js` again, and what you
changed there is lost; `custom.js`, `player.css` and `index.html` are kept. Prefer them when the
request allows.

## 2. The folder

The editor’s own engine draws every glyph as an SVG path, frame by frame, from the data in
`scene.js`. Nothing to install, no server, no build step.

| File | What it is | Edit it? |
|---|---|---|
| `index.html` | the page: the scene’s element and the scripts in order | yes |
| `scene.js` | **the animation**, as data; its head comment maps names to it | yes |
| `glyphs.js` | the outlines of the formulas (generated, one glyph a line) | no |
| `custom.js` | your code, run after the scene and before it is mounted | yes |
| `player.css` | the look of the stage and of the controls | yes |
| `embed-example.html` | the scene inside another page, both ways | as a model |
| `check.mjs` | `node check.mjs`: checks the scene without a browser | no: run it |
| `types/mfe.d.ts` | the API of `window.MFE`, with its comments | no: read it |
| `types/scene.d.ts` | every field of `scene.js`, with its comments | no: read it |
| `mfe-runtime.js` | the engine, minified: **do not open it** | no |
| `LICENSES.txt` | the licences of the engine | no |
| `AGENTS.md` | this guide | — |
| `CLAUDE.md` | imports this guide for Claude Code | — |
| `README.md` | one screen for a person | — |

The page loads, as classic scripts and in this order: `mfe-runtime.js` (sets `window.MFE`),
`glyphs.js` and `scene.js` (register the scene by its name, `first-transform-as-a-talk`), then
`custom.js`. Once the page has loaded, the engine mounts every
`<div class="mfe-deck" data-scene="…">`. `mfe-runtime.js` is one minified line of hundreds of
kilobytes: never read it; `types/mfe.d.ts` is its API. `glyphs.js` is the formulas’ outlines,
written by the editor: there is no reason to read it either.

## 3. Look at it, check it

- **Look**: open `index.html` in a browser, from disk (`file://` works). It stops at each pause;
  Space or → goes on, ← goes back. `index.html?start=4.5` opens it at 4.5 s.
- **Check**: `node check.mjs` (Node 18+, nothing to install) runs the scene as the page does and
  prints what is wrong, `scene.js:57 · clips[2].intro.kind: message`, errors and warnings apart.
  Exit code 0: it plays as written; 1: it does not. Run it after every edit of `scene.js`;
  `node check.mjs ../blog/animation` checks the scene’s files in another folder (a copy beside a
  page that embeds it).
- The page says the same: over the scene (`.mfe-problems`) and in the console, as
  `[MFE] <scene>: scene.js · clips[2].intro.kind: message`.
- **Look by script** (a headless browser on `file://…/index.html`): `MFE.decks[0]` is the deck; the
  element’s `data-mfe-state` is `playing`, `paused` or `ended`. Look at instants, with `seek(t)` or
  `index.html?start=4.5`, not by playing: in a headless browser a screenshot shows CSS animations at
  their start, and `play()` hardly moves in its virtual time.

## 4. Extend it by editing scene.js

Read the head comment of `scene.js` first: the clips by name with their place in the file
(`eq1  clips[0]`), the glyphs of each formula by index, and the timeline, each line ending with
where it is (`clips[0].actions[1]`). Every field is in `types/scene.d.ts`, with its comment:
`Project`, `Clip`, `ClipAction`, `IntroSpec`, `Relation`, `GlyphPair`, `SlideMark`.

- **Space**: Manim’s scene units. **y up**, the origin at the centre, the frame 8 tall (14.22 wide
  here).
- **Time**: seconds. `clips[].start`/`end` are the scene’s; a block’s `start` counts from its clip’s
  start; a relation runs from `start of its target clip + offset`, for `duration`.
- **Glyphs**: `glyphs` is `"all"` or indices, ascending, as listed in the head comment.
- **Colours**: `"#RRGGBB"`, upper case. A glyph’s colour, first found: the clip’s `glyphColors`, the
  clip’s `color`, the formula’s `glyphColors`, the formula’s `color`.
- **Ids**: any string unique in the file (`"my-indicate"`). A clip’s name is not its id.
- Two animations may not move the same glyphs at once; `node check.mjs` says when they do.

**Objects** (`formulas[].kind`): what each is made of comes from the editor (see below).

| kind | is | made of | intros |
|---|---|---|---|
| `math` | Formula | source, packages, font size, project preamble, project target | all but `grow_arrow` |
| `tex` | Text (LaTeX) | source, layout, font size, project preamble, project target | all but `grow_arrow` |
| `text` | Text (font) | source, font, font size, project target | all but `grow_arrow` |
| `brace` | Brace | width, sharpness, project target | all but `grow_arrow` |
| `shape` | Shape | shape, width, height, corner radius, style, project target | all but `grow_arrow` |
| `line` | Line | nothing: drawn from its fields | `create`, `write`, `fade_in` |

**Intros** (`clips[].intro.kind`; `anim` of an appear block):

- `none`: appears at once, no animation (`duration` 0)
- `write`: `Write`: outlines traced, then filled, glyph after glyph
- `fade_in`: `FadeIn`: it moves by `shift` [x, y] as it comes in, and grows from `scale`
- `grow_from_center`: `GrowFromCenter`: grows from a point at its centre
- `draw_border_then_fill`: `DrawBorderThenFill`: every outline drawn, then filled
- `create`: `Create`: drawn along its outlines, not filled first
- `grow_arrow`: `GrowArrow`: grows from its start (arrows only)

**Outros** (`clips[].outro.kind`; `anim` of a disappear block):

- `none`: goes at once, no animation (`duration` 0)
- `unwrite`: `Unwrite`: `write` backwards
- `fade_out`: `FadeOut`: it moves by `shift` as it goes, and ends at `scale`
- `shrink_to_center`: `ShrinkToCenter`: shrinks to a point at its centre
- `uncreate`: `Uncreate`: `create` backwards

An intro or an outro is `{ kind, duration, easing, lagRatio, shift, scale }`; `lagRatio` staggers
the glyphs (null: Manim’s default).

**Blocks** (`clips[].actions[]`, by `kind`; each has `id`, `start`, `duration`, `easing`):

- `tween`: animates the whole clip to the state `to` (any of `position`, `scale`, `rotation`,
  `opacity`, `color`, `glyphColors`, `flipX`, `flipY`). Fields: `to`, `fit?`, `ends?`.
- `appear`: brings `glyphs` on screen that are not (hidden, or taken by a disappear) with the intro
  kind `anim`. Fields: `anim`, `glyphs`, `lagRatio`, `shift`, `scale`, `group?`.
- `disappear`: takes `glyphs` off screen with the outro kind `anim`. Fields: `anim`, `glyphs`,
  `lagRatio`, `shift`, `scale`, `group?`.
- `transform`: moves or restyles some `glyphs`: `shift` [x, y], `scale`, `rotation` (degrees),
  `color`, `opacity` (null: unchanged). Fields: `glyphs`, `shift`, `scale`, `rotation`, `color`,
  `opacity`, `group?`.
- `morph`: glyphs of the formula fly onto other glyphs of the same formula: `pairs` of
  `{ from: [i], to: [j] }`, `style`, `pathArc` (degrees). Fields: `style`, `pathArc`, `pairs`.
- `emphasis`: draws attention to `glyphs` for a moment with an `effect` (below), then leaves them.
  Fields: `effect`, `glyphs`, `color`, `scale`, `angle`, `wiggles`, `buff`, `strokeWidth`,
  `timeWidth`, `opacity`, `group?`.

**Emphasis effects** (`effect` of an emphasis block; every block keeps every field):

| effect | Manim | what it draws or does | default | uses |
|---|---|---|---|---|
| `indicate` | Indicate | the glyphs swell and turn `color`, and back: a pulse | 1 s, `there_and_back` | `scale`, `color` |
| `wiggle` | Wiggle | the glyphs swell and rock to and fro | 2 s, `smooth` | `scale`, `angle`, `wiggles` |
| `circumscribe` | Circumscribe | a rectangle round the glyphs, traced and untraced as it runs round | 1 s, `smooth` | `color`, `buff`, `strokeWidth`, `timeWidth` |
| `flash` | Flash | short lines burst out of the glyphs’ centre (no glow) | 1 s, `smooth` | `color` |
| `focus_on` | FocusOn | a disc shrinks from the whole frame onto the glyphs | 2 s, `smooth` | `color`, `opacity` |

An author’s words, as blocks: “a frame”, “a box”, “circle it” → `circumscribe`, whose `timeWidth` is
how much of the frame shows at once as it runs round (0.3: a stroke going round; 1: whole by
mid-way, then undrawn; 2: whole for longer). “Flash” → Manim’s `flash` is lines bursting from a
point; a glyph that lights up is `indicate`, as are “highlight” and “pulse”. “Shake”, “wobble” →
`wiggle`. “Spotlight” → `focus_on`. A colour named (“bright”, “gold”) → `color`.

**An emphasis at a comment’s instant** goes in `actions` of a clip whose glyphs are drawn then, with
a new `id` and every field (as the Indicate in 4.1); its `start` is the instant less the clip’s
`start` (31 s on a clip that starts at 24 s: `"start": 7`).

**Rate functions** (`easing` everywhere; `MFE.rates` in code):

- `smooth`: slow, fast, slow: Manim’s default
- `linear`: even
- `rush_into`: slow start, fast end
- `rush_from`: fast start, slow end
- `slow_into`: eases into the end
- `double_smooth`: smooth in each half
- `there_and_back`: goes and comes back: a pulse (ends where it started)
- `there_and_back_with_pause`: goes, holds a third of the time, comes back

**Relations** (`relations[]`: glyphs of `fromClipId` fly into `toClipId`, by `pairs`; a morph block
does the same within one formula). Their `style`, and a pair’s own:

- `transform`: `ReplacementTransform`: the source glyphs become the target ones (the source goes)
- `copy`: `TransformFromCopy`: a copy flies; the source stays
- `fade`: `FadeTransform`: cross-fades while moving (the source goes)
- `fade_copy`: a copy cross-fades into the target; the source stays

A pair `{ "from": [2], "to": [5], "style": null }` (null: the relation’s style). With several
sources and one target, its `extras`:

- `separate`: each source lands on the target (the default)
- `merge`: Manim’s own: the sources after the first fade as they arrive
- `copies`: the `principal` source moves; the others send copies and stay

**Marks of the Slides mode** (`slides.marks[]`: `{ id, time, kind, text?, skipWait? }`; `slides` is
the last field of the project, absent when the mode is off):

- `pause`: the page stops here until its reader goes on; `text` is the presenter’s note; with
  `"skipWait": true` going on from it jumps over the wait after it, where nothing animates, to where
  the next animation starts (or to the next pause of that wait); played through, in the Python and
  in a video the wait stays
- `comment`: words for whoever works on the scene next (listed first in this guide)

A mark stands where nothing animates (the edge of an animation will do); one that does not is left
out of the page, with a warning.

**Camera** (`camera`, absent without one): `initial` frame, named `targets`, and `moves`
`{ id, start, duration, easing, to }`; nothing else may animate during a move. `to`:

- `frame`: `{ "kind": "frame", "frame": { "center": [x, y], "height": h } }`
- `target`: `{ "kind": "target", "target": "<id of camera.targets[]>" }`
- `start`: `{ "kind": "start" }`: back to `camera.initial`

### 4.1 Edits that work here

**Add an Indicate on glyphs 3 and 4 (“=”, “5”) of `step1` at 1.00 s.** Insert it as
`clips[0].actions[0]` (the blocks are kept in the order of their `start`, which counts from the
clip's start, 0.00 s):

```json
{
  "id": "my-indicate",
  "kind": "emphasis",
  "start": 1,
  "effect": "indicate",
  "glyphs": [3, 4],
  "duration": 1,
  "easing": "there_and_back",
  "color": "#FFFF00",
  "scale": 1.2,
  "angle": 3.6,
  "wiggles": 6,
  "buff": 0.1,
  "strokeWidth": 4,
  "timeWidth": 0.3,
  "opacity": 0.2
}
```

**Bring `step1` in with `fade_in` instead of `write`.** Replace `clips[0].intro` (same duration, so
nothing else moves; it rises by `shift`, half a unit, as it fades in):

```json
{
  "kind": "fade_in",
  "duration": 1,
  "easing": "linear",
  "lagRatio": null,
  "shift": [0, 0.5],
  "scale": 1
}
```

**Move pause 1 from 1.00 s to 1.60 s.** Set `slides.marks[0].time` (a mark must stand where nothing
animates: the head of scene.js lists what runs when):

```json
1.6
```

**Colour glyph 0 of `step1` yellow.** Set `formulas[0].glyphColors` (by glyph index; `step1` and
every other clip of the formula take it):

```json
{ "0": "#FFD166", "2": "#F4C867" }
```

**What `scene.js` cannot change: what a formula is made of** — for `step1`: its source, its
packages, its font size, the project's preamble, the project's target (the table above says it for
each kind). The page typesets no LaTeX: the outlines travel in `glyphs.js`, made by the editor.
Change one of those and the page draws the old outlines and says so (an error of `node check.mjs`).
Everything else is free: times, intros, blocks, relations, colours, positions, sizes, marks, the
camera. Another clip of a formula can be added (a `clips[]` entry with an `id` of its own, the
formula’s `formulaId`, on a track where it overlaps no clip). A **new formula** is the editor’s job
(export again), or yours as SVG or HTML of your own in a layer (section 6).

## 5. Extend it with code: custom.js and window.MFE

Code goes in `custom.js` (or a script of yours after `scene.js`). `types/mfe.d.ts` has every
signature with its comment (`MfeRuntime`, `Deck`, `AnimationSpec`, `StageBox`, `DeckOptions`,
`DeckEvent`); to have it in your editor, start `custom.js` with `// @ts-check` and
`/// <reference path="types/mfe.d.ts" />`.

`window.MFE`:

- `MFE.mount(elementOrSelector, options?)` → the deck of that element (the one the page mounted, if
  it did; mounts it otherwise). `MFE.mountAll(root?)`, `MFE.decks`, `MFE.scenes`.
- `MFE.rates.smooth(0.3)`: Manim’s rate functions by name. `MFE.check(name?)`: the problems of the
  files. `MFE.version`, `MFE.glyphsVersion`.
- `MFE.scene(name, project, assets?)` and `MFE.glyphs(name, data)` are what `scene.js` and
  `glyphs.js` call.

A deck:

- Playing: `play()`, `pause()`, `toggle()`, `next()` (on to the next pause), `previous()`,
  `seek(t)`; `time`, `playing`, `duration`, `fps`; `slide` (from 0) of `slides`; `atPause`: the
  index in `pauses` of the pause it stands at, null while it plays or anywhere else; `speed`,
  `through` (ignore the pauses), `muted`, `hasSound` (settable: `speed`, `through`, `muted`).
- The scene: `pauses` (`{ time, note, resume }`: `resume`, where going on from it goes on from, is
  later than `time` at a pause that skips its wait), `comments` (`{ time, text }`), `project` (read
  only), `problems`, `name`, `options`, `element`, `stage`.
- `on(event, fn)` → a function that stops listening. Events: `'time'` after every frame drawn
  (playing or after a seek), `'play'`, `'pause'`, `'slide'`, `'end'`, and `'change'` after any of
  those or a setting. A listener hears what comes after it is added: no event tells it where the
  deck already stands (opened at `?start=4.5`), so call it once yourself.
- `animate({ from, to, ease?, update(progress, time) })` → a function that removes it. `update` runs
  on every frame drawn, playing or not; `progress` is the eased fraction: 0 before `from`, and after
  `to` what the easing ends at (1; 0 for `there_and_back`). `ease`: a rate function’s name or
  `(t) => …`; linear when absent.
- `clip('eq1')` → the clip’s `<g>` (by name or id; null if absent — the console then names the clips
  there are — or on a canvas); `flights(from?, to?)` → the `<g>`s of glyphs in flight;
  `layer('above' | 'below')` → a free `<g>`.
- `box('eq1', t?)` and `glyphBox('eq1', 3, t?)` → `{ x, y, width, height, cx, cy }` on the **stage
  (y down)**, at time `t` (now when absent), null when not on screen. `redraw()` draws again now;
  `destroy()` gives the element back.

### 5.1 Scripts that work here

Every script below is a whole `custom.js` that works as written in this folder.

**A pulse of `step1` at 1.20 s.** An animation of your own is a function of the scene’s time:
`update` gets the eased progress, here up and back down again (`there_and_back`), and the deck calls
it on every frame it draws, so it is right after a seek too.

```js
document.addEventListener('DOMContentLoaded', () => {
  const deck = MFE.mount('.mfe-deck[data-scene="first-transform-as-a-talk"]');
  const group = deck.clip('step1');
  if (!group) return;
  group.style.transformBox = 'fill-box'; // scale about its own centre
  group.style.transformOrigin = 'center';
  deck.animate({
    from: 1.2,
    to: 2,
    ease: 'there_and_back',
    update(progress) {
      group.style.transform = 'scale(' + (1 + 0.15 * progress) + ')';
    },
  });
});
```

**A flash when `step3` has come in, at 5.40 s.** A circle of your own in the layer above the scene,
placed with `deck.box` (stage units, y down), growing and fading as the progress goes from 0 to 1.

```js
document.addEventListener('DOMContentLoaded', () => {
  const deck = MFE.mount('.mfe-deck[data-scene="first-transform-as-a-talk"]');
  const layer = deck.layer('above');
  const box = deck.box('step3', 5.4);
  if (!layer || !box) return;
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ring.setAttribute('cx', String(box.cx));
  ring.setAttribute('cy', String(box.cy));
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', '#FFD166');
  ring.setAttribute('stroke-width', '0.04');
  layer.append(ring);
  const size = Math.max(box.width, box.height);
  deck.animate({
    from: 5.4,
    to: 6,
    ease: 'rush_from',
    update(progress) {
      ring.setAttribute('r', String(size * (0.4 + 0.5 * progress)));
      const running = progress > 0 && progress < 1; // 0 before, 1 after
      ring.setAttribute('opacity', running ? String(1 - progress) : '0');
    },
  });
});
```

**A label beside `step1`, from 1.00 s.** Text of your own in the layer above, to the right of the
clip’s box as it is at 1.00 s, fading in. Its size is in scene units (the frame is 8 tall). It stays
where it was put: if the clip moves later, measure it again then.

```js
document.addEventListener('DOMContentLoaded', () => {
  const deck = MFE.mount('.mfe-deck[data-scene="first-transform-as-a-talk"]');
  const layer = deck.layer('above');
  const box = deck.box('step1', 1);
  if (!layer || !box) return;
  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.textContent = '← look here';
  label.setAttribute('x', String(box.x + box.width + 0.3));
  label.setAttribute('y', String(box.cy));
  label.setAttribute('dominant-baseline', 'middle');
  label.setAttribute('font-size', '0.4');
  label.setAttribute('fill', '#FFD166');
  layer.append(label);
  deck.animate({
    from: 1,
    to: 1.5,
    update(progress) {
      label.setAttribute('opacity', String(progress));
    },
  });
});
```

**`step1` pulses while the deck stands at pause 1 (1.00 s).** Time stands still at a pause, so what
moves then is a CSS animation on the clip’s group, switched on by a class while `deck.atPause` is 0,
the pause’s index in `deck.pauses`. `step1` is a clip drawn at that instant.

```js
document.addEventListener('DOMContentLoaded', () => {
  const deck = MFE.mount('.mfe-deck[data-scene="first-transform-as-a-talk"]');
  const group = deck.clip('step1');
  if (!group) return;
  const update = () => group.classList.toggle('is-waiting', deck.atPause === 0);
  deck.on('change', update);
  update(); // it may stand there already (index.html?start=1)
});
```

With this in `player.css` (or a stylesheet of yours after it):

```css
@media (prefers-reduced-motion: no-preference) {
  .mfe-deck [data-clip="step1"].is-waiting {
    transform-box: fill-box;
    transform-origin: center;
    animation: my-waiting 0.9s ease-in-out infinite alternate;
  }
}
@keyframes my-waiting {
  to {
    transform: scale(1.06);
  }
}
```

**A CSS animation on a clip, without code**: select its group by its name.

```css
.mfe-deck[data-scene="first-transform-as-a-talk"] [data-clip="step1"] {
  animation: my-blink 1.2s ease-in-out infinite alternate;
}
@keyframes my-blink {
  to {
    opacity: 0.5;
  }
}
```

## 6. The stage

```html
<div class="mfe-deck" data-scene="…" data-mfe-mounted data-mfe-state="paused">
  <div class="mfe-screen">
    <svg class="mfe-stage" viewBox="…">        the camera’s frame, in scene units
      <g class="mfe-below"></g>                free: under the scene
      <g class="mfe-scene">
        <g class="mfe-clip" data-clip="eq1">   a clip, by its name
          <path class="mfe-glyph" data-glyph="3" d="…" fill="…"/>
        </g>
        <g class="mfe-flight" data-from="eq1" data-to="eq2"></g>  glyphs in flight
        <g class="mfe-effects"></g>            an emphasis’s drawings
      </g>
      <g class="mfe-above"></g>                free: over the scene
    </svg>
    <div class="mfe-problems">…</div>          only when the files have errors
    <div class="mfe-blackout" hidden></div>    the stage blacked out (B)
  </div>
  <div class="mfe-bar" role="group">           the controls, built by the engine:
    <button class="mfe-button mfe-play">       and mfe-previous, mfe-next, mfe-through,
      <svg class="mfe-icon">…</svg>            mfe-mute, mfe-notes-button, mfe-fullscreen
    </button>
    <div class="mfe-timeline" role="slider">   mfe-timeline-track, mfe-timeline-played,
      <span class="mfe-pause-mark" data-time="3.2"></span>   mfe-timeline-thumb; a notch per pause
    </div>
    <span class="mfe-slide-count">2 / 3</span> <span class="mfe-time">1.25 / 6.00 s</span>
  </div>
  <div class="mfe-notes" hidden>…</div>        the notes of the pauses and the comments (S)
  <div class="mfe-live"></div>                 what a screen reader is told
</div>
```

- **The `<path>`s are the engine’s**: their `d`, `fill`, `stroke` and opacities are written again on
  every frame, and paths come and go. **The groups are yours**: give `.mfe-clip`, `.mfe-flight` and
  the layers a `transform`, a `filter`, a class, a CSS animation; add elements to the layers. CSS
  `fill` or `opacity` set on `.mfe-glyph` beat the engine’s attributes for good: change colours in
  `scene.js` instead.
- **No ids**: select by class and attribute — `deck.clip('eq1')`, or
  `.mfe-deck[data-scene="…"] [data-clip="eq1"]`. `data-glyph` is the glyph’s index, as in
  `scene.js`. Glyphs in flight between clips are in `.mfe-flight`, not in their clip’s group; what
  an emphasis draws (a frame, lines, a disc) is a `.mfe-effect` in `.mfe-effects`.
- **Coordinates. `scene.js` is Manim’s: y up. The stage is SVG: y down.** Same units, same x; a
  point `[x, y]` of `scene.js` is at `x, -y` on the stage. `deck.box`, `deck.glyphBox` and the
  layers are in stage units: place what you add with them and it is upright, and where the scene is.
  The `viewBox` is the camera’s frame, so the layers move with the camera. Sizes are scene units: a
  frame is 8 tall, a label of `font-size` 0.4 is small.
- Again, because it is the usual mistake: **a y read from `scene.js` changes sign on the stage; a y
  read from `deck.box` changes sign in `scene.js`.**
- The runtime sets `--mfe-aspect` and `--mfe-scene-background` on the deck’s element, and
  `data-mfe-state`: `playing`, `paused`, `ended`.
- **The controls** are built on the deck’s public object alone, the one `custom.js` has: restyle
  them in `player.css`, or mount with `data-controls="none"` — no bar, no notes and no keys then —
  and build your own on the API. What they show is in attributes of the deck’s element, for CSS:
  `data-mfe-controls` (`full`, `minimal`), `data-mfe-notes` (the notes are open),
  `data-mfe-blackout`, `data-mfe-fullscreen` and `data-mfe-idle` (full screen, and the pointer at
  rest: the bar hides). A word only a screen reader reads is `.mfe-visually-hidden`.
- **The keys** (heard where `data-keys` says): → ↓ Space PageDown N Enter go on; ← ↑ PageUp P
  Backspace Shift+Space go back; Home, End; K plays or pauses; F full screen; S the notes; B or `.`
  blacks the stage out; M mutes. Never in a field, never Space or Enter on a button, never with
  Ctrl, ⌘ or Alt. A click on the stage plays or pauses unless a handler of yours called
  `preventDefault()`. Keys of your own should keep off these.

## 7. Embedding

See `embed-example.html`. A page of yours needs, beside it: `mfe-runtime.js`, `glyphs.js`,
`scene.js`, `player.css`, `custom.js` when the scene has code of its own, and `LICENSES.txt` (the
engine’s notice). Then six tags, paths relative to the page: the stylesheet, the element, and the
scripts in this order, `custom.js` last (leave it out when it holds nothing):

```html
<link rel="stylesheet" href="player.css" />
<div class="mfe-deck" data-scene="first-transform-as-a-talk"></div>
<script src="mfe-runtime.js"></script>
<script src="glyphs.js"></script>
<script src="scene.js"></script>
<script src="custom.js"></script>
```

Or the scene’s own page in a frame, for a site that takes no scripts:
`<iframe src="index.html?controls=minimal&autoplay">`.

Options, as `data-` attributes of the element or (on `index.html`) in the address with the same
names; a switch is on when present, off with `off`, `false`, `no` or `0`;
`MFE.mount(element, { … })` takes them too and wins:

| attribute | values | default | what |
|---|---|---|---|
| `data-controls` | `full`, `minimal`, `none` | `full` | which controls show: `minimal`, play and the timeline; `none`, drive it with the API |
| `data-notes` | switch | `true` | `off`: no notes (S, their button) |
| `data-autoplay` | switch | `false` | plays when it comes on screen (never with reduced motion) |
| `data-loop` | switch | `false` | starts again at the end |
| `data-start` | seconds | `0` | where it stands before it plays |
| `data-pauses` | switch | `true` | `off`: plays through the pauses |
| `data-background` | `scene`, `transparent` | `scene` | `transparent`: the host page shows behind the scene |
| `data-renderer` | `svg`, `canvas` | `svg` | `canvas`: one bitmap; `deck.clip` and the groups are gone |
| `data-keys` | `page`, `focus`, `none` | `focus` | where its keys are heard (`page` on its own page) |
| `data-speed` | 0.1 to 4 | `1` | how fast it plays |

`minimal` keeps the keys and the notes. **On a page for readers** (a blog), add `data-notes="off"`
(`&notes=off` in a frame’s address): the notes show the author’s comments, which are tasks for
whoever works on the scene, to anyone who presses S.

This scene **starts empty**: embedded, its stage is blank until it plays. `data-autoplay` plays it
when it comes on screen (but not for a reader who asked for less motion); `data-start="1"` stands it
where something shows, and playing goes on from there (Home goes back to the start; ← to the pause
before it, if one is).

`data-page` makes an element the page’s own scene: it reads the address and hears its keys anywhere
(`index.html` has it). The deck takes its container’s width and keeps the scene’s shape. **Several
scenes in a page**: load `mfe-runtime.js` once, then each scene’s `glyphs.js` and `scene.js` (rename
the files if they share a folder: the name inside them is what counts), and give each element its
`data-scene`. Nothing but `MFE` is global, and nothing has an id.

## 8. Changing the look

The look is `player.css`: plain CSS, every rule under `.mfe-deck`, yours to edit or replace. To
restyle from the host page, give the custom properties other values
(`.my-page .mfe-deck { --mfe-…: … }`). The engine styles nothing itself. **Light or dark**:
`data-theme="light"` or `"dark"` on the element; without one, an embedded deck’s controls follow the
reader’s system setting (the scene’s own page stays dark).

Custom properties `player.css` declares on `.mfe-deck` (with their values there):

- `--mfe-accent` (`#43eeca`)
- `--mfe-bar-background` (`#121619`)
- `--mfe-bar-text` (`#d5dee2`)
- `--mfe-bar-text-muted` (`#93a3ab`)
- `--mfe-bar-height` (`40px`)
- `--mfe-radius` (`6px`)
- `--mfe-font` (`system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif`)
- `--mfe-pause-mark` (`#f4c867`)
- `--mfe-skip-wait` (`#b69cff`)
- `--mfe-timeline-track` (`rgb(255 255 255 / 22%)`)
- `--mfe-focus-ring` (`#8cc8ff`)
- `--mfe-notes-background` (`#171c20`)
- `--mfe-notes-text` (`#e4ebee`)
- `--mfe-notes-text-muted` (`#93a3ab`)
- `--mfe-notes-height` (`140px`)
- `--mfe-fullscreen-background` (`#000`)
- `--mfe-blackout-background` (`#000`)
- `--mfe-stage-background` (`var(--mfe-scene-background, #000)`): The stage's background: the
  scene's own unless you say otherwise.

For the scene’s own page alone (`index.html`, `<body class="mfe-page">`):

- `--mfe-page-background` (`#0b0d0f`): Around the deck.
- `--mfe-page-height` (`100vh`): The window's height, which the deck fits in.
- `--mfe-page-chrome` (`0px`): What the page holds under the stage: the bar, and the notes.

`--mfe-font` goes inside `font:` shorthands: give it family names (`Georgia, serif`), or a variable
of your page that holds them. `inherit` voids those declarations, and the controls take your page’s
size and line height too.

Classes it styles: `.mfe-bar`, `.mfe-blackout`, `.mfe-button`, `.mfe-deck`, `.mfe-icon`,
`.mfe-layers`, `.mfe-live`, `.mfe-note`, `.mfe-note-label`, `.mfe-note-text`, `.mfe-notes`,
`.mfe-notes-button`, `.mfe-notes-empty`, `.mfe-notes-heading`, `.mfe-notes-list`, `.mfe-page`,
`.mfe-pause-mark`, `.mfe-play`, `.mfe-problems`, `.mfe-problems-title`, `.mfe-screen`,
`.mfe-slide-count`, `.mfe-sound`, `.mfe-stage`, `.mfe-through`, `.mfe-time`, `.mfe-timeline`,
`.mfe-timeline-played`, `.mfe-timeline-skip`, `.mfe-timeline-thumb`, `.mfe-timeline-track`,
`.mfe-visually-hidden`.

**The scene’s colours** are data in `scene.js`, not CSS: `meta.background`; a formula’s `color` and
`glyphColors` (a shape’s `fillColor`); a clip’s `initial.color` and `initial.glyphColors`; the
`color` of the blocks that set one (a tween’s `to`, a transform, an emphasis).
`formulas[].tag.color` and `colorMatches` are the editor’s own: they paint nothing.
`data-background="transparent"` shows the host page behind the scene: light glyphs cannot be read on
a light page, so give them dark colours in `scene.js` (or keep the scene’s background).

**Controls that appear on hover**: the bar over the foot of the stage, shown while the pointer is on
the scene or the focus is in it; nothing on the page moves. Under your page’s own selector
(`.my-page` here), after `player.css`, on a deck with `data-notes="off"` (open notes would sit under
the stage, the bar over them):

```css
.my-page .mfe-deck:where(:not([data-mfe-fullscreen])) .mfe-bar {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  opacity: 0;
  pointer-events: none;
}
.my-page .mfe-deck:where(:not([data-mfe-fullscreen])):where(:hover, :focus-within) .mfe-bar {
  opacity: 1;
  pointer-events: auto;
}
```

## 9. Pitfalls

- **Classic scripts, in order.** The page is opened from `file://`: no modules, no `import`, no
  `fetch`, no workers (the browser blocks them there). Data are `.js` files that call
  `MFE.scene`/`MFE.glyphs`.
- **y up in `scene.js`, y down on the stage** (section 6).
- **`update` is a function of progress**, called on every frame drawn and after any seek, in any
  order of times: compute everything from `progress` and `time`, never accumulate state between
  calls. Create elements once, outside it.
- **Time stands still at a pause**: an animation of the scene’s time does not move then. For motion
  while it waits, use CSS (the last examples).
- **At a pause that skips its wait the time jumps** (`skipWait`): going on from it, the scene goes
  on from `deck.pauses[i].resume`, so what `animate` does between the pause and `resume` is never
  seen when presenting (only played through, or after a seek). Start it at `resume`, or make it CSS
  while the deck waits, as the example of a pause does.
- **The page’s clock is continuous**; the editor and its Python and video exports work on frames
  (`meta.fps`). Keep the times you write on that grid (multiples of 1/fps) if the scene may go back
  to the editor.
- **A clip’s name is derived**, not stored: its formula’s name (as an identifier), then `_2`, `_3`…
  for its later clips, by start time. Renaming a formula or moving a clip before another of the same
  formula renames clips: update your selectors.
- **Glyph indices** are the formula’s, as the head comment of `scene.js` lists them — not the order
  of the `<path>`s.
- `deck.project` is the scene as read: do not change it; edit `scene.js` and reload.
