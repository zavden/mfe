# Writing the web documentation

This guide is for whoever writes a page of the web documentation of the Manim Formula Editor,
person or agent. It says how a page is made, every component a page can use, how to build and
check the site, and what to verify before committing. The components, live and with their markup,
are on [authoring/components.html](authoring/components.html): open it from disk next to this
file.

The documentation is a set of static pages in `docs/web/`, read by opening `docs/web/index.html`
from disk. There is no server and no build for the reader: classic scripts only, nothing from the
network, data that travels as `.js` files setting globals. The folders, the markup and the data
formats were fixed before the first page was written (the contract of the documentation's first
agents); this guide and the two below are what an author needs of it.

| Part | Its guide |
|---|---|
| The site: design, `site.js`, build, check, the pages | this file |
| Captures of the app: screenshots, clips, tours | [tools/CAPTURES.md](tools/CAPTURES.md) |
| Examples and the player | [tools/EXAMPLES.md](tools/EXAMPLES.md) |

## 1. Principles

**Accuracy first.** Every statement of a page is checked in the app: in its code (`app/src/`,
the labels in `app/src/ui/`), or by seeing it happen in a capture. The README and `docs/*.md` are
good guides, but the app is the truth: when they disagree, write what the app does and report the
difference (section 7). When you are not sure, leave the statement out.

**Nothing the app does not have.** Not as a plan, not as a hint. In particular the app has no
text-to-speech, no `Dot` object and no LaggedStart.

**The reader** wants to make formula animations for Manim: a teacher, a video maker. They may know
a little LaTeX and no Manim at all. Write to them in the second person and the present tense, in
short sentences, one idea per paragraph. Show before you explain: a clip, a tour or a player
first, then the words. No marketing, and no "simply", "just" or "easy".

**English**, and **colour** spelt the British way in prose, as most of the README does. The
app's own labels are quoted exactly as the app shows them, American spelling included: **Match
colors**, never Match colours. Find a label in the code before quoting it
(`grep -rn "'Open…'" app/src/ui`): its words, its capitals, its ellipsis.

**Levels.** Every page has one, planned with the page in `tools/site.config.mjs`:

- `basic`: what everyone needs, in the order a first project meets it;
- `intermediate`: what makes a real animation; assumes the basics;
- `advanced`: the fine control and the corners; assumes a working knowledge;
- `reference`: tables and lists to look things up, not to read in order;
- `tutorial`: a whole animation from start to finish; its `mfe:difficulty` is basic, intermediate
  or advanced.

## 2. A page

A page is `docs/web/<section>/<page>.html`; its id is that path without `.html`
(`basics/timeline`), and every page of the plan exists already as a stub. Its head:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Working with the timeline · Manim Formula Editor</title>
  <meta name="description" content="Tracks, clips, the playhead, zoom and the time step.">
  <meta name="mfe:id" content="basics/timeline">
  <meta name="mfe:level" content="basic">
  <meta name="mfe:short" content="The timeline">
  <link rel="stylesheet" href="../assets/site.css">
  <link rel="stylesheet" href="../widgets/widgets.css">  <!-- only with a widget -->
  <script src="../assets/nav.js" defer></script>
  <script src="../assets/search-index.js" defer></script>
  <script src="../assets/site.js" defer></script>
  <!-- only what the page uses, in this order: the player, examples, widgets, tours -->
  <script src="../assets/player.js" defer></script>
  <script src="../examples/first-transform.data.js" defer></script>
  <script src="../widgets/link-glyphs.js" defer></script>
  <script src="../media/basics/timeline/move-clip.tour.js" defer></script>
  <!-- a <style> of the page's own, if any, comes last -->
</head>
<body>
  <main id="content">
    <article class="doc">
      <h1>Working with the timeline</h1>
      <p class="lead">One or two sentences: what the page is about.</p>
      …
    </article>
  </main>
</body>
</html>
```

- `<title>` is the `h1` and ` · Manim Formula Editor`. The description is one sentence, under 200
  characters: the search and the sidebar's tooltip show it.
- `mfe:id` is the page's id. `mfe:level` is the level of the plan; a tutorial adds
  `<meta name="mfe:difficulty" content="basic">`. The build fails when they differ from the plan:
  change `tools/site.config.mjs` too when a level really changes.
- `mfe:short` (optional) is the name the sidebar and the previous/next links use, about 30
  characters at most; without it they use the `h1`.
- `mfe:status` with `stub` marks a page not written yet. **When you write the page, remove that
  meta**, the `aside.callout.stub` notice, the `p.stub-todo` paragraphs and the plan comment.
- `site.js` adds everything around `<main>`: the header, the sidebar, the breadcrumbs, the section
  and level above and under the `h1`, the contents of the page, previous/next and the footer.
  Write none of it.

**Headings.** One `h1`. Every `h2` and `h3` has an `id`: short, lowercase, hyphens
(`<h2 id="zoom-step">Zoom and the time step</h2>`). Other pages link to them, so keep an id once
it exists. The contents of the page list the `h2` and `h3` (from two of them on), and each gets a
link that copies its address. Go no deeper than `h4`.

**Prose.** Paragraphs, lists, `strong` for the word a paragraph defines, `code` for what is
typed (LaTeX, a file name, a Python name). Lines of prose stay about 70 characters wide; figures,
tours, players, code and tables may take the whole column. The styles of the prose apply to plain
elements: a list or a link with a class is left to its class.

**Links.** Relative, to a page or a section of it: `<a href="../basics/timeline.html#tracks">`,
with no class. Links to other sites are fine; anything a page *loads* (an image, a script, a font)
is local.

## 3. Components

Each one is live on [authoring/components.html](authoring/components.html), with its markup
under it.

### Interface labels

```html
Choose <span class="ui">File ▸ Open…</span>, then <span class="ui">Apply</span>.
```

A label of the app, word for word; a menu path joins its steps with ▸ (`site.js` dims the ▸ and
tells screen readers the steps).

### Keys

```html
<kbd data-keys="Mod+Shift+Z">Ctrl+Shift+Z</kbd>
```

`data-keys` holds one combination, its keys joined by `+`, and `site.js` writes it for the
reader's system, a cap per key:

- `Mod` is Ctrl, or ⌘ on a Mac; `Alt` is Alt, or ⌥ on a Mac; `Shift` is Shift, or ⇧ on a Mac;
- `Ctrl` is the Control key itself on every system: Ctrl, or ⌃ on a Mac (write it only where the
  app takes Control on a Mac too);
- `ArrowLeft`, `ArrowRight`, `ArrowUp` and `ArrowDown` become arrows; `Plus` is the + key;
  `Escape` is Esc; `Enter` is Enter, or ↩ on a Mac; any other name is written as it is (`Space`,
  `Tab`, `Delete`, `F2`).

On a Mac the caps are written as the app's menus write them there: the modifiers first, in the
order Control, Option, Shift, Command whatever the order you give them in, and no `+` between the
caps (⇧⌘Z). Write the combination as Windows and Linux read it, `Mod+Shift+Z`.

The text inside the `kbd` is what a reader without JavaScript sees: write the Windows and Linux
form. Two combinations are two `kbd`. A plain `<kbd>/</kbd>` is a key cap that never changes.

**A key that is another on a Mac.** A few shortcuts of the app have other keys there, where the
system has taken the usual ones or every app has another: the README lists them under "On macOS",
and the app's sheet has them as the `mac` of a row (`app/src/ui/help/shortcutSheet.ts`). Give the
`kbd` the Mac's combination too, in `data-keys-mac`:

```html
<kbd data-keys="Mod+Alt+S" data-keys-mac="Mod+Shift+S">Ctrl+Alt+S</kbd>
```

Words that are true on one system alone go in a `span.only-mac` or a `span.not-mac`; the
stylesheet shows the one for the reader's system, and the `not-mac` one to a reader without
JavaScript. They are for a few words beside a key (“or the Menu key”, “pinch or”): a paragraph
for one system is a platform callout, below.

### Callouts

```html
<aside class="callout tip"><p>…</p></aside>
<aside class="callout note"><p>…</p></aside>
<aside class="callout warning"><p>…</p></aside>
<aside class="callout platform" data-platform="mac"><p>…</p></aside>
```

`site.js` adds the label (Tip, Note, Warning; On a Mac, On Windows, On Linux); a platform callout
of the reader's own system is marked **Your system**. Use them sparingly: a tip is a shortcut
worth knowing, a note an exception, a warning something that loses work.

### Try it

```html
<aside class="try">
  <ol>
    <li>Press <span class="ui">+ New</span> in the Creator.</li>
    <li>…</li>
  </ol>
</aside>
```

A short exercise at the end of a section: steps the reader does in the app.

### Code

```html
<pre><code class="language-latex">\frac{a}{b}</code></pre>
```

Highlighted: `language-python` (`py`), `language-latex` (`tex`), `language-json`,
`language-bash` (`sh`, `shell`, `console`), `language-html` and `language-js`. Every `pre` of a
page gets a copy button and its language's name. Escape `<` as `&lt;` and `&` as `&amp;`.

**Quoted code.** An excerpt of a file (the Python the app exports, most often) names that file in
`data-excerpt`, and the build checks that the excerpt is in it; the attribute changes nothing the
reader sees:

```html
<pre data-excerpt="examples/python-scene.ce.py"><code class="language-python">        step1 = MathTex(r"2x + 1 = 7", font_size=96)
    …
        self.play(Write(step1))</code></pre>
<td><code data-excerpt="python-scene.gl.py">Tex(r"2x + 1 = 7", font_size=98.9888)</code></td>
```

- The file is a path from `docs/web/` (`examples/python-scene.ce.py`), the bare name of a file of
  `examples/`, or a path from the repository's root when it starts with `/`
  (`/app/src/export/codegen/__tests__/__snapshots__/python/example-shapes.auto.ce.py`).
- The excerpt is the element's text as the reader sees it (entities decoded). Every run of
  whitespace counts as one space: indentation and line breaks may differ from the file's.
- A `…` (anywhere), or a line that is only `...` or `# ...`, stands for what the excerpt leaves
  out: the parts around it must be in the file in that order.
- Lines of your own in an excerpt (an example of an edit) carry a mark that you name in
  `data-excerpt-ignore="# yours"`: the lines holding it are not looked for.

Mark every excerpt of a file that a build rewrites (the `.ce.py` and `.gl.py` of an example): when
the export changes, the build names the excerpt that no longer matches and where it differs. The
Python tabs (`data-mfe-python`) come from the example's data and need no mark.

### Tables

A plain `<table>` with a `<thead>`. `site.js` puts it in a frame that scrolls sideways when it is
wider than the page. Keep cells short; a table of shortcuts writes its keys as `kbd[data-keys]`,
in a `<td class="keys">` when they must stay on one line. A page of wide tables (the reference of
menus, keys and preferences) writes `<article class="doc wide-tables">`: its tables keep 36rem at
least, and on a phone they scroll sideways instead of squeezing their columns.

### Images

```html
<figure>
  <img src="../media/basics/timeline/tracks.dark.webp" data-themed
       alt="Two tracks of the timeline, each with a clip." width="720" height="240" loading="lazy">
  <figcaption>What the caption adds to the picture.</figcaption>
</figure>
```

A capture exists in both themes of the app. The page names the dark file and marks it
`data-themed`: `site.js` shows the `.light.` file when the reader sees the light theme (and the
dark one when a light file is missing; the build reports it first). `alt` says what the image
shows; `width` and `height` are the CSS size of the capture, in its folder's `manifest.json` (the
build compares them, and `build.mjs --fix-sizes --page <id>` writes them after a capture). A
click enlarges an image in a lightbox; `data-no-zoom` on the `img` turns that off.

**Two figures side by side** (before and after, two states of a panel, two players):

```html
<div class="side-by-side">
  <figure>…</figure>
  <figure>…</figure>
</div>
```

Each takes half the column, a picture narrower than its half keeps its own size, and under 720px
they stand one under the other.

**The numbers of a picture.** When a capture numbers its boxes 1, 2, 3 …, the list that explains
them is an `<ol class="map-list">` under it: each item wears the number of its box, in the same
order.

### Clips

```html
<figure>
  <video class="mfe-clip" data-themed src="../media/basics/timeline/move-clip.dark.webm"
         poster="../media/basics/timeline/move-clip.dark.webp" width="720" height="400"
         muted loop playsinline preload="none"></video>
  <figcaption>Dragging a clip along its track.</figcaption>
</figure>
```

A few seconds of the app, silent, with the pointer and the keys pressed shown on it. It plays
while at least half of it is on screen and pauses when it leaves. `site.js` puts a slim bar under
the picture, never over it: a button that pauses and plays it, a line of how far the loop is, and
a button that plays it again — so the corners of a capture are free, and nothing needs to be left
blank for the buttons. With reduced motion it waits for a click (a start button in its middle,
gone once it plays) and plays once. Never `autoplay` or `controls`.

### Tours

```html
<script src="../media/start/interface/panels.tour.js" defer></script>
…
<div class="mfe-tour" data-mfe-tour="start/interface/panels" data-title="The four panels"></div>
```

Steps over the app: an image each, a caption, and boxes around what the step is about (the rest
is dimmed). The reader moves with the buttons, the step keys, or the arrow keys, Home and End once
the tour has the focus. While it is on screen it goes on by itself, longer on a longer caption,
until the reader touches it, and stops at the last step; never with reduced motion. Options:

- `data-title`: what the tour is, for screen readers;
- `data-autoplay="off"`: it does not go on by itself;
- `data-start="2"`: the step it opens at.

The data file is made by the capture tool (`tools/CAPTURES.md`): `MFE_TOURS["<page-id>/<tour>"]`
with `width`, `height` and `steps` of `{ image, caption, boxes }`; the images are
`media/<page-id>/<image>.dark.webp` and `.light.webp`. Two optional fields serve samples:
`base` (the folder of the images, from `docs/web/`) and `ext` (their extension instead of
`webp`). A caption may hold `b`, `i`, `em`, `strong`, `code`, `kbd` (with `data-keys`) and
`span class="ui"`; anything else is reduced to its text.

### Players

```html
<script src="../assets/player.js" defer></script>
<script src="../examples/first-transform.data.js" defer></script>
…
<figure class="mfe-player" data-mfe-player="first-transform"></figure>
```

The scene of an example, played in the page by the app's own renderer. Its options (timeline,
loop, a range, the controls) are in [tools/EXAMPLES.md](tools/EXAMPLES.md) and on
[authoring/player.html](authoring/player.html). `site.js` calls `MFEPlayer.mountAll(document)`
once the page is loaded, and shows a notice where the player script is missing.

### The Python of an example

```html
<div class="mfe-code" data-mfe-python="first-transform"></div>
```

The ManimCE and ManimGL Python the app exports for the example, in two tabs, with a copy and a
download button. The tab the reader picks is remembered, and every such block follows it;
`data-tab="gl"` fixes the tab of one block. Needs the example's `.data.js` on the page.

### Example cards

```html
<div class="mfe-example" data-mfe-example="first-transform"></div>
```

The example's title, description, length and frame rate, and its files: the project (the main
button: the reader opens it with **File ▸ Open…**, then **Other file…**), the two Pythons and,
for a tutorial, the video Manim rendered. Needs the example's `.data.js`. A path in `meta.files`
is from `docs/web/` (`examples/x.mfe.json`), or the bare name of a file in `examples/`.

### Manim videos

```html
<video class="mfe-manim" src="../examples/quadratic-formula.mp4" controls preload="metadata"
       playsinline></video>
```

The scene as ManimCE rendered it, with the browser's own controls.

### Widgets

```html
<link rel="stylesheet" href="../widgets/widgets.css">
<script src="../examples/widget-link.data.js" defer></script>
<script src="../widgets/link-glyphs.js" defer></script>
…
<div class="mfe-widget" data-mfe-widget="link-glyphs" data-options='{"example": "widget-link"}'></div>
```

An interactive explanation of a concept; the widgets that exist, and their options, are in
[widgets/README.md](widgets/README.md). `widgets/<name>.js` registers it:

```js
(window.MFE_WIDGETS ||= {})['link-glyphs'] = {
  mount(element, options, context) {
    // build inside element; options is the JSON of data-options
  },
};
```

`site.js` calls `mount` once the page is loaded and marks the element mounted; an exception shows a
notice in its place. The `context`:

- `root`, `url(path)`: the address of `docs/web/`, and of a file in it;
- `theme()`, `onTheme(fn)`: the theme the reader sees, and a call after each change (it returns
  the function that stops it);
- `platform`, `formatKeys(keys)`: `mac`, `windows`, `linux` or `other`, and a combination as this
  system writes it;
- `reducedMotion()`: whether the reader asked for less motion (then nothing moves by itself);
- `examples`, `data`: `window.MFE_EXAMPLES` and `window.MFE_DATA`;
- `notice(message)`: shows a small notice in the widget's place;
- `mount(element)`: mounts the components inside markup the widget added.

A widget styles itself with the `--doc-*` tokens (section 4), in both themes.

### Icons and buttons

`<span data-icon="sigma"></span>` holds one of the app's own drawings (the list is on the
components page); `span.icon-tile` gives it the glass tile of the cards. For the rare page that
needs a button: `a.btn`, `a.btn.btn-primary` (the mint one, one per place) and `a.btn.btn-ghost`.

### `data-inline`

Only on `authoring/components.html`: a component whose sample data is defined in the page itself.
A real page never writes it.

## 4. For players, widgets and page styles

`window.MFEDocs`, set before the page is shown:

- `root`, `url(path)`, `page` (`{ id, level, difficulty, status }`), `platform`;
- `theme()`, `setTheme('dark' | 'light' | 'system')`, `onTheme(fn)`;
- `reducedMotion()`, `formatKeys(keys)`;
- `mount(element)`: mounts the components inside markup added later;
- `notice(element, message)`: the small notice of a component whose data is missing.

The theme is on `<html data-theme="dark|light">`: the system's, unless the reader chose one (the
toggle of the header; the footer's **System** forgets the choice). A change dispatches
`mfe-docs:theme` on `document`, with `detail.theme`.

**Design tokens**, on `:root` for each theme, from the owner's style guide (the Mint theme of the
app, `../guia_estilos/`) as `app/src/ui/styles.css` applies it: `--doc-bg`, `--doc-surface`,
`--doc-surface-2`, `--doc-border`, `--doc-text`, `--doc-text-muted`, `--doc-accent`,
`--doc-accent-strong`, `--doc-on-accent`, `--doc-focus`, `--doc-code-bg`, `--doc-radius`,
`--doc-font`, `--doc-font-mono`, `--doc-shadow`. Also there: `--doc-surface-header`,
`--doc-well`, `--doc-input-bg`, `--doc-hover`, `--doc-border-strong`, `--doc-text-faint`
(metadata only), `--doc-link`, `--doc-canvas` (the Preview's dark canvas, in both themes),
`--doc-time` (times and durations), `--doc-warning`, `--doc-danger`, `--doc-ok`, `--doc-info`,
`--doc-primary-gradient` with `--doc-primary-text`, `--doc-selection-gradient`,
`--doc-panel-gradient`, `--doc-edge-light`, the radii `--doc-radius-control` (8px) and
`--doc-radius-panel` (14px), and the spacing `--doc-space-1`, `-2`, `-3`, `-4`, `-6` and `-8` (4,
8, 12, 16, 24 and 32px; there is no `-5` nor `-7`, as in the guide: a `var()` of a token that does
not exist makes its whole declaration void). A component several pages use belongs in `site.css`
(and here, and on the components page); a page's `<style>` holds only what is of that page alone.
Follow the guide's rules: one mint primary per place, a glow only on what has the focus or is the
main action, the teal selection gradient for what is chosen.

`localStorage` (each use in `try`): `mfe-docs:theme`, `mfe-docs:visited` (the pages read, for the
marks of the sidebar and the bars of the home page), `mfe-docs:nav-open`, `mfe-docs:python-tab`.
Two query parameters help checking a page and are never stored: `?theme=dark|light` and
`?platform=mac|windows|linux`.

## 5. Build and check

From the repository's root:

```bash
node docs/web/tools/build.mjs                     # validate every page; write nav and search
node docs/web/tools/build.mjs --page basics/timeline   # report one page
node docs/web/tools/check.mjs --page basics/timeline --shots /tmp/shots
```

**The build** (Node only, a second) writes `assets/nav.js` and `assets/search-index.js` from
`tools/site.config.mjs` and the pages. Those two are generated: never edit them and never commit
them (whoever merges the documentation regenerates them). It checks every page and exits with 1
on an error: the head and its metas, the level against the plan, one `h1`, an id on every `h2`
and `h3` and no id twice, every relative `href` and `src` (and `#anchor`, on other pages too), no
file from the network, `alt`, `width` and `height` of images (against the capture's manifest), the
`.light.` twin of every themed file, the data script of every example, tour and widget on the
page, that the data has what the component needs (a tour's images, an example's files), and
that every quoted excerpt (`data-excerpt`) is in its file. `--check` writes nothing, `--strict`
makes warnings errors, `--quiet` shows only errors. `--page` (repeat it, or a comma list) reports
those pages and counts only their problems: the rest of the site is one line. An `#anchor` into a
page that is still a stub in your checkout (another author writes it) is a warning until that
page is written, then an error. `--fix-sizes` first sets the `width` and `height` of every image
and clip whose file is in its folder's `manifest.json` to the manifest's (only those two
attributes; with `--page`, of those pages): run it after a capture.

**The check** builds first: the build's errors of the pages it checks fail it, their warnings
are shown. With `--page`, the build's problems of the other pages and of the site (another
author's draft) are one line and fail nothing; a run of every page fails on all of them. Then it
opens every page from disk in Chrome, dark and light, at 1280×800 and 375×740. It fails on a
console or page error, a file that does not load, an image drawn stretched or larger than its
picture (its `width` and `height` against the picture itself), a page wider than the window (it
names what sticks out), a missing header, sidebar or footer, or a component that did not mount
(with the notice it showed). It warns, failing nothing, of a player with `data-autoplay` whose
stage is empty at the instant it plays from: give it a `data-start` (`tools/EXAMPLES.md`, 3.2).
Once per run it also tries the theme toggle and the search, and, when the components page is in the
run, the keys of a Mac (its symbols and their order, a `data-keys-mac`, the words for one system).
`--shots <dir>` writes a screenshot of every page, theme and width, `--full` the whole page (every
image is loaded and decoded first, as a reader scrolling to it gets it: a tour paints in a
whole-page shot too); `--theme dark`, `--viewport 375` narrow the run; `--no-build` skips the build.
Look at the screenshots yourself, both themes and the phone width: the check finds what breaks, not
what looks wrong.

The check runs Chrome through the shared library (`tools/lib/`): it takes the machine lock (one
heavy run at a time on the machine; it waits for the others), does not start while the CPU is at
85 °C or more (it waits until it is under 80 °C), and stops everything at 95 °C. It starts no
server. Never start Chrome, Vite or Manim another way.

**The project's page**, `docs/index.html`, is not a page of the documentation: it is the front
page of the website (`docs/` as it is), and the header and the footer of every page link to it as
**Home**. It borrows the documentation's components (players, widgets, the Python tabs, an exported
page) through `site.js`, with `<body data-docs-bare>`: the theme and the components, and none of
the documentation around them. Its own layout is in `docs/landing/`. The build does not read it:
`node docs/web/tools/check-landing.mjs` checks it (its links and anchors, nothing from the network,
the data of its examples, and in Chrome every component mounted, both themes, both widths). Run it
too when a page it links to or an example it plays changes.

**A new page** goes in `tools/site.config.mjs`, in its section, at its place in the reading
order, with its level; the build reports a page that is missing there, and a page of the config
that does not exist. Pages under `authoring/` are for authors: built and checked, never listed.

## 6. Captures and examples

- **Captures of the app** (screenshots, clips, tours, data read out of the app) are made by
  `tools/capture.mjs` from a capture file per page, `tools/captures/<page-id>.mjs`, into
  `media/<page-id>/`, always in both themes, with a `manifest.json` that gives each file's size.
  How to write a capture file and embed its media: [tools/CAPTURES.md](tools/CAPTURES.md).
- **Examples** are projects of the app, `examples/<slug>.mfe.json`, that a reader can download
  and open; `tools/examples.mjs` makes their `.data.js` (for the player, the Python tabs and the
  cards), their Python and, for tutorials, the video Manim renders. How to make one and embed it:
  [tools/EXAMPLES.md](tools/EXAMPLES.md).
- **Exported pages**: what Export ▸ HTML writes for an example, live in a page with its own tags,
  are made by `tools/build-deck.mjs` into `decks/` ([tools/EXAMPLES.md](tools/EXAMPLES.md), 7).
- **Size.** All of `docs/web/` stays about 35–45 MB in all (the build prints its size and warns
  above 45 MB). A screenshot is cropped to what it shows, usually well under 200 KB; a clip of a
  few seconds, under 1 MB. `node docs/web/tools/sizes.mjs` says where the bytes are: by folder,
  by page folder of `media/`, by page (its media in both themes, its examples' files, its
  widgets; the site's shared files apart), the twenty heaviest files (`--top 40` for more), and
  the media and examples no page uses; `--page <id>` lists one page's files by weight.

## 7. Bugs and oddities of the app

Writing documentation means using the app closely. When something looks wrong (a bug, an oddity,
the README saying what the app does not do, a corner that is hard to use), **do not change the
app**, and do not document the broken behaviour as if it were right: write what the app does
today, or leave that part out, and record the finding where your brief says. Reproduce it at
least twice first, and make sure it is not a timing artifact of a capture (the app eases its
colours when the theme changes; a render takes a moment). A finding reads:

```
## <your name>-<n>: <one-line title>
- Kind: bug | oddity | mismatch (docs/README say X, the app does Y) | ux
- Severity: high | medium | low
- Where: the panel or menu; the code (file:line) when you found it
- Steps: 1. … 2. …
- Expected: …
- Actual: …
- Reproduced: how many times, how (by hand in a capture, by a script…)
- Evidence: path of a screenshot, if any
```

## 8. Before you commit a page

- [ ] Every statement was checked in the app's code or seen in a capture; nothing describes what
      the app does not have.
- [ ] Labels are word for word, in `span.ui`; menu paths use ▸; keys are `kbd[data-keys]` with
      `Mod` for Ctrl/⌘, and a shortcut that has other keys on a Mac names them in `data-keys-mac`.
- [ ] The stub is gone: no `mfe:status`, no `aside.callout.stub`, no `p.stub-todo`.
- [ ] The title, the description and the level are right (the level as in the plan).
- [ ] Every `h2` and `h3` has a lasting id; links are relative and their anchors exist.
- [ ] Images have `alt`, the manifest's `width` and `height`, both themes; clips are small.
- [ ] `node docs/web/tools/build.mjs` reports no error for the page.
- [ ] The files the tools generate are what the sources make: `build-player.mjs --check`,
      `build-deck.mjs --check` and `reference-tables.mjs --check` pass.
- [ ] `node docs/web/tools/check.mjs --page <id> --shots <dir>` passes, and you looked at the
      screenshots: dark and light, 1280 and 375 wide.
- [ ] Only your own paths are staged (`git add <paths>`, never `-A`), never `assets/nav.js` or
      `assets/search-index.js`; the subject reads `Web docs: …`.
