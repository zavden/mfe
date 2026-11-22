/* The guide of an exported folder: `AGENTS.md`, for a coding agent that has never seen the editor
 * and is handed the folder to extend the animation (most agents read `AGENTS.md` by themselves;
 * `CLAUDE.md` imports it for Claude Code), and `README.md`, one screen for a person.
 *
 * `AGENTS.md` opens with the author's comments of the Slides mode as tasks, then says what each
 * file is for, how to look at the result and check it, the two ways to extend the scene — its
 * data (`scene.js`) and code (`custom.js`, `window.MFE`) —, the contract of the stage, embedding,
 * restyling and the pitfalls. What can go stale is generated: the vocabulary of the scene from
 * the model's catalogue and schema (an exhaustive record per enum: a new kind does not compile
 * until it is described), the options from `deck/options.ts`, the custom properties and classes
 * from the folder's own `player.css`, and the examples from the scene in hand (`guideExamples.ts`,
 * right by construction and run by the tests). Plain Markdown, short lines. Pure. */
import {
  createFormulaOfKind,
  EMPHASIS,
  EMPHASIS_DEFAULTS,
  EMPHASIS_KINDS,
  exportedMarks,
  INTRO_KINDS,
  introsOf,
  KINDS,
  onScreenAt,
  OUTRO_KINDS,
  sceneDuration,
  skippedWait,
  type CameraDestination,
  type ClipAction,
  type EmphasisAction,
  type EmphasisKind,
  type Easing,
  type FormulaKind,
  type IntroKind,
  type OutroKind,
  type PairExtras,
  type Project,
  type RelationStyle,
  type SlideMarkKind,
} from '../../model';
import {
  EasingSchema,
  IntroKindSchema,
  PairExtrasSchema,
  ProjectSchema,
  RelationStyleSchema,
} from '../../model/schema';
import { makeup } from '../../embed/engine';
import { DEFAULT_OPTIONS, OPTION_NAMES, type DeckOptions } from '../../deck/options';
import { clipNames } from '../../deck/names';
import {
  clipsDrawnAt,
  codeExamples,
  cssContract,
  namesIn,
  sceneEdits,
  settledAt,
  type CssProperty,
} from './guideExamples';
import { entryTime, seconds, timelineEntries, type TimelineEntry } from './timelineWords';

/** What the guide is written from. */
export interface GuideInput {
  /** The name the scene registers itself by. */
  name: string;
  /** The project as the page gets it. */
  project: Project;
  /** The paths of the folder's files, the guide's own included. */
  files: readonly string[];
  /** The text of the folder's `player.css`. */
  css: string;
}

/** The types the guide sends its reader to, by the file that declares them. */
export const GUIDE_TYPES = {
  mfe: ['MfeRuntime', 'Deck', 'AnimationSpec', 'StageBox', 'DeckOptions', 'DeckEvent'],
  scene: ['Project', 'Clip', 'ClipAction', 'IntroSpec', 'Relation', 'GlyphPair', 'SlideMark'],
} as const;

// --- The vocabulary, one record per enum of the model ---------------------------------

/** What each intro is in Manim. */
const INTRO_WORDS: Readonly<Record<IntroKind, string>> = {
  none: 'appears at once, no animation (`duration` 0)',
  write: '`Write`: outlines traced, then filled, glyph after glyph',
  fade_in: '`FadeIn`: it moves by `shift` [x, y] as it comes in, and grows from `scale`',
  grow_from_center: '`GrowFromCenter`: grows from a point at its centre',
  draw_border_then_fill: '`DrawBorderThenFill`: every outline drawn, then filled',
  create: '`Create`: drawn along its outlines, not filled first',
  grow_arrow: '`GrowArrow`: grows from its start (arrows only)',
};

const OUTRO_WORDS: Readonly<Record<OutroKind, string>> = {
  none: 'goes at once, no animation (`duration` 0)',
  unwrite: '`Unwrite`: `write` backwards',
  fade_out: '`FadeOut`: it moves by `shift` as it goes, and ends at `scale`',
  shrink_to_center: '`ShrinkToCenter`: shrinks to a point at its centre',
  uncreate: '`Uncreate`: `create` backwards',
};

/** What each kind of block does, and its own fields, in words. */
const ACTION_WORDS: Readonly<Record<ClipAction['kind'], string>> = {
  tween:
    'animates the whole clip to the state `to` (any of `position`, `scale`, `rotation`, ' +
    '`opacity`, `color`, `glyphColors`, `flipX`, `flipY`)',
  appear:
    'brings `glyphs` on screen that are not (hidden, or taken by a disappear) with the intro ' +
    'kind `anim`',
  disappear: 'takes `glyphs` off screen with the outro kind `anim`',
  transform:
    'moves or restyles some `glyphs`: `shift` [x, y], `scale`, `rotation` (degrees), ' +
    '`color`, `opacity` (null: unchanged)',
  morph:
    'glyphs of the formula fly onto other glyphs of the same formula: `pairs` of ' +
    '`{ from: [i], to: [j] }`, `style`, `pathArc` (degrees)',
  emphasis: 'draws attention to `glyphs` for a moment with an `effect` (below), then leaves them',
};

/** What each effect draws or does (`model/types.ts`, `EmphasisAction`). */
const EMPHASIS_WORDS: Readonly<Record<EmphasisKind, string>> = {
  indicate: 'the glyphs swell and turn `color`, and back: a pulse',
  wiggle: 'the glyphs swell and rock to and fro',
  circumscribe: 'a rectangle round the glyphs, traced and untraced as it runs round',
  flash: 'short lines burst out of the glyphs’ centre (no glow)',
  focus_on: 'a disc shrinks from the whole frame onto the glyphs',
};

const EMPHASIS_FIELDS: Readonly<Record<EmphasisKind, readonly (keyof EmphasisAction)[]>> = {
  indicate: ['scale', 'color'],
  wiggle: ['scale', 'angle', 'wiggles'],
  circumscribe: ['color', 'buff', 'strokeWidth', 'timeWidth'],
  flash: ['color'],
  focus_on: ['color', 'opacity'],
};

const EASING_WORDS: Readonly<Record<Easing, string>> = {
  smooth: 'slow, fast, slow: Manim’s default',
  linear: 'even',
  rush_into: 'slow start, fast end',
  rush_from: 'fast start, slow end',
  slow_into: 'eases into the end',
  double_smooth: 'smooth in each half',
  there_and_back: 'goes and comes back: a pulse (ends where it started)',
  there_and_back_with_pause: 'goes, holds a third of the time, comes back',
};

const STYLE_WORDS: Readonly<Record<RelationStyle, string>> = {
  transform: '`ReplacementTransform`: the source glyphs become the target ones (the source goes)',
  copy: '`TransformFromCopy`: a copy flies; the source stays',
  fade: '`FadeTransform`: cross-fades while moving (the source goes)',
  fade_copy: 'a copy cross-fades into the target; the source stays',
};

const EXTRAS_WORDS: Readonly<Record<PairExtras, string>> = {
  separate: 'each source lands on the target (the default)',
  merge: 'Manim’s own: the sources after the first fade as they arrive',
  copies: 'the `principal` source moves; the others send copies and stay',
};

const MARK_WORDS: Readonly<Record<SlideMarkKind, string>> = {
  pause:
    'the page stops here until its reader goes on; `text` is the presenter’s note; with ' +
    '`"skipWait": true` going on from it jumps over the wait after it, where nothing animates, to ' +
    'where the next animation starts (or to the next pause of that wait); played through, in the ' +
    'Python and in a video the wait stays',
  comment: 'words for whoever works on the scene next (listed first in this guide)',
};

const CAMERA_WORDS: Readonly<Record<CameraDestination['kind'], string>> = {
  frame: '`{ "kind": "frame", "frame": { "center": [x, y], "height": h } }`',
  target: '`{ "kind": "target", "target": "<id of camera.targets[]>" }`',
  start: '`{ "kind": "start" }`: back to `camera.initial`',
};

/** The options of a deck: what each takes and does. */
const OPTION_WORDS: Readonly<Record<keyof DeckOptions, [values: string, what: string]>> = {
  controls: [
    '`full`, `minimal`, `none`',
    'which controls show: `minimal`, play and the timeline; `none`, drive it with the API',
  ],
  notes: ['switch', '`off`: no notes (S, their button)'],
  autoplay: ['switch', 'plays when it comes on screen (never with reduced motion)'],
  loop: ['switch', 'starts again at the end'],
  start: ['seconds', 'where it stands before it plays'],
  pauses: ['switch', '`off`: plays through the pauses'],
  background: ['`scene`, `transparent`', '`transparent`: the host page shows behind the scene'],
  renderer: ['`svg`, `canvas`', '`canvas`: one bitmap; `deck.clip` and the groups are gone'],
  keys: ['`page`, `focus`, `none`', 'where its keys are heard (`page` on its own page)'],
  speed: ['0.1 to 4', 'how fast it plays'],
};

/** What a file of the folder is, and whether to change it. */
const FILE_WORDS: Readonly<Record<string, [what: string, edit: string]>> = {
  'index.html': ['the page: the scene’s element and the scripts in order', 'yes'],
  'scene.js': ['**the animation**, as data; its head comment maps names to it', 'yes'],
  'custom.js': ['your code, run after the scene and before it is mounted', 'yes'],
  'player.css': ['the look of the stage and of the controls', 'yes'],
  'embed-example.html': ['the scene inside another page, both ways', 'as a model'],
  'check.mjs': ['`node check.mjs`: checks the scene without a browser', 'no: run it'],
  'types/mfe.d.ts': ['the API of `window.MFE`, with its comments', 'no: read it'],
  'types/scene.d.ts': ['every field of `scene.js`, with its comments', 'no: read it'],
  'glyphs.js': ['the outlines of the formulas (generated, one glyph a line)', 'no'],
  'mfe-runtime.js': ['the engine, minified: **do not open it**', 'no'],
  'LICENSES.txt': ['the licences of the engine', 'no'],
  'AGENTS.md': ['this guide', '—'],
  'CLAUDE.md': ['imports this guide for Claude Code', '—'],
  'README.md': ['one screen for a person', '—'],
};

// --- Helpers ------------------------------------------------------------------------

const code = (text: string) => `\`${text}\``;
const list = (items: readonly string[]) => items.map(code).join(', ');
const FENCE = '```';
const fence = (language: string, text: string) =>
  `${FENCE}${language}\n${text.replace(/\n$/, '')}\n${FENCE}`;

/** A GitHub anchor of a heading. */
const slug = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

/** What happens around an instant, in words: what ended last, what starts next, what is on
 * screen — and of a clip on screen with none of its glyphs drawn, that it has none; with the words
 * of a comment, the clips they name that are not on screen then. */
function aroundWords(
  project: Project,
  entries: readonly TimelineEntry[],
  time: number,
  text = '',
): string {
  const moving = entries.filter((entry) => entry.end !== null || entry.kind === 'appears');
  const done = moving
    .filter((entry) => (entry.end ?? entry.start) <= time + 1e-6)
    .sort((a, b) => (a.end ?? a.start) - (b.end ?? b.start))
    .at(-1);
  const next = moving.find((entry) => entry.start >= time - 1e-6 && entry !== done);
  const names = clipNames(project);
  const duration = sceneDuration(project);
  const drawn = clipsDrawnAt(project, time);
  const shown = project.clips.filter(
    (clip) => names.has(clip.id) && onScreenAt(clip, time, duration),
  );
  const parts = [
    done ? `after ${code(done.text.replace(/\s{2,}/g, ' '))}` : 'at the start',
    next ? `before ${code(next.text.replace(/\s{2,}/g, ' '))}` : 'nothing after',
  ];
  const screen = shown.map(
    (clip) => code(names.get(clip.id)!) + (drawn.has(clip.id) ? '' : ' (none of its glyphs drawn)'),
  );
  const away = namesIn(text, names.values())
    .filter((name) => !shown.some((clip) => names.get(clip.id) === name))
    .map((name) => {
      const clip = project.clips.find((c) => names.get(c.id) === name)!;
      return `. ${code(name)}, which its words name, is not on screen then (${entryTime(clip)})`;
    });
  return `${parts.join(', ')}; on screen: ${screen.length ? screen.join(', ') : 'nothing'}${away.join('')}`;
}

const quoted = (text: string) =>
  text
    .trim()
    .split('\n')
    .map((line) => `   > ${line.trim()}`)
    .join('\n');

/** The words of a line of Markdown, a code span one word whatever its spaces. */
function words(text: string): string[] {
  const out: string[] = [];
  let word = '';
  let inCode = false;
  for (const c of text) {
    if (c === '`') inCode = !inCode;
    if (c === ' ' && !inCode) {
      if (word) out.push(word);
      word = '';
    } else word += c;
  }
  if (word) out.push(word);
  return out;
}

/** Markdown with its paragraphs and list items wrapped at `width` columns (a list item's lines
 * under its text, a quote's with its marker); code blocks, tables and headings as they are. One
 * text, ending with a new line. */
export function wrapMarkdown(lines: readonly string[], width = 100): string {
  const out: string[] = [];
  let inFence = false;
  for (const line of lines.flatMap((text) => text.split('\n'))) {
    if (line.startsWith(FENCE)) inFence = !inFence;
    if (inFence || line.startsWith(FENCE) || line.length <= width || /^\s*(\||#)/.test(line)) {
      out.push(line);
      continue;
    }
    const marker = /^(\s*(?:[-*] |\d+\. |> )*)/.exec(line)![1]!;
    const hanging = marker.endsWith('> ') ? marker : ' '.repeat(marker.length);
    let current = marker;
    let empty = true;
    for (const word of words(line.slice(marker.length))) {
      if (!empty && current.length + 1 + word.length > width) {
        out.push(current);
        current = hanging + word;
      } else {
        current += (empty ? '' : ' ') + word;
      }
      empty = false;
    }
    out.push(current);
  }
  return `${out.join('\n')}\n`;
}

// --- The sections -------------------------------------------------------------------

function tasks(project: Project): string[] {
  const marks = exportedMarks(project);
  const entries = timelineEntries(project);
  const comments = marks.filter((mark) => mark.kind === 'comment' && mark.text?.trim());
  const pauses = marks.filter((mark) => mark.kind === 'pause');
  const out: string[] = [];
  if (comments.length === 0) {
    out.push(
      'The author left no comments in this scene (a comment is a mark of the editor’s Slides ' +
        'mode, words for whoever works on the scene next): no task from them here. Do what you ' +
        'were asked.',
    );
  } else {
    out.push(
      'The author left these comments at instants of the scene for whoever works on it next. ' +
        'Treat each as a task. Times are seconds of the scene; names are the clips’ (section 4).',
      '',
      ...comments.map((mark, k) => {
        const index = project.slides!.marks.indexOf(mark);
        return (
          `${k + 1}. **${seconds(mark.time)} s** (${code(`slides.marks[${index}]`)}) — ` +
          `${aroundWords(project, entries, mark.time, mark.text)}.\n${quoted(mark.text ?? '')}`
        );
      }),
      '',
      'A task done, take its mark out of `slides.marks`: the page’s notes (S) stop showing it, ' +
        'and the author keeps it in the editor.',
    );
  }
  out.push('');
  if (pauses.length === 0) {
    out.push('The scene has no pauses: the page plays it through.');
  } else {
    out.push(
      'Its pauses, where the page stops (their notes are the presenter’s; context for you):',
      '',
      ...pauses.map((mark, k) => {
        const index = project.slides!.marks.indexOf(mark);
        const note = mark.text?.trim() ? ` — “${mark.text.trim().replace(/\s+/g, ' ')}”` : '';
        const skipped = skippedWait(project, mark);
        const skip = skipped
          ? `; it skips its wait: going on, the page jumps to ${seconds(skipped.end)} s`
          : '';
        return (
          `- Pause ${k + 1} at ${seconds(mark.time)} s (${code(`slides.marks[${index}]`)})` +
          `${note}${skip}; ${aroundWords(project, entries, mark.time)}.`
        );
      }),
    );
  }
  out.push(
    '',
    '**Where to make a change**: the next export from the editor writes `scene.js` again, and ' +
      'what you changed there is lost; `custom.js`, `player.css` and `index.html` are kept. ' +
      'Prefer them when the request allows.',
  );
  return out;
}

function folder(input: GuideInput): string[] {
  const rows = input.files.map((path) => {
    const known = FILE_WORDS[path];
    if (known) return `| ${code(path)} | ${known[0]} | ${known[1]} |`;
    if (/^audio\.\w+$/.test(path)) return `| ${code(path)} | the scene’s sound | no |`;
    return `| ${code(path)} | — | — |`;
  });
  return [
    'The editor’s own engine draws every glyph as an SVG path, frame by frame, from the data in ' +
      '`scene.js`. Nothing to install, no server, no build step.',
    '',
    '| File | What it is | Edit it? |',
    '|---|---|---|',
    ...rows,
    '',
    'The page loads, as classic scripts and in this order: `mfe-runtime.js` (sets `window.MFE`), ' +
      '`glyphs.js` and `scene.js` (register the scene by its name, ' +
      `${code(input.name)}), then \`custom.js\`. Once the page has loaded, the engine mounts every ` +
      '`<div class="mfe-deck" data-scene="…">`. `mfe-runtime.js` is one minified line of ' +
      'hundreds of kilobytes: never read it; `types/mfe.d.ts` is its API. `glyphs.js` is the ' +
      'formulas’ outlines, written by the editor: there is no reason to read it either.',
  ];
}

function lookAndCheck(): string[] {
  return [
    '- **Look**: open `index.html` in a browser, from disk (`file://` works). It stops at each ' +
      'pause; Space or → goes on, ← goes back. `index.html?start=4.5` opens it at 4.5 s.',
    '- **Check**: `node check.mjs` (Node 18+, nothing to install) runs the scene as the page ' +
      'does and prints what is wrong, `scene.js:57 · clips[2].intro.kind: message`, errors and ' +
      'warnings apart. Exit code 0: it plays as written; 1: it does not. Run it after every edit ' +
      'of `scene.js`; `node check.mjs ../blog/animation` checks the scene’s files in another ' +
      'folder (a copy beside a page that embeds it).',
    '- The page says the same: over the scene (`.mfe-problems`) and in the console, as ' +
      '`[MFE] <scene>: scene.js · clips[2].intro.kind: message`.',
    '- **Look by script** (a headless browser on `file://…/index.html`): `MFE.decks[0]` is the ' +
      'deck; the element’s `data-mfe-state` is `playing`, `paused` or `ended`. Look at ' +
      'instants, with `seek(t)` or `index.html?start=4.5`, not by playing: in a headless ' +
      'browser a screenshot shows CSS animations at their start, and `play()` hardly moves in ' +
      'its virtual time.',
  ];
}

function sceneVocabulary(project: Project): string[] {
  const indicate = sceneEdits(project).some((edit) => edit.json.includes('"indicate"'));
  const kinds = Object.keys(KINDS) as FormulaKind[];
  const meta = project.meta;
  const objectRows = kinds.map((kind) => {
    const info = KINDS[kind];
    const made = makeup(createFormulaOfKind(kind), meta).map(([words]) =>
      words
        .replace(/^its /, '')
        .replace(/^the project’s /, 'project ')
        .replace('’', "'"),
    );
    const intros =
      info.intros.length === INTRO_KINDS.length
        ? 'all' + (kind === 'line' ? '' : ' but `grow_arrow`')
        : list(introsOf(createFormulaOfKind(kind)).filter((k) => k !== 'none'));
    const fields = made.length ? made.join(', ') : 'nothing: drawn from its fields';
    return `| ${code(kind)} | ${info.label} | ${fields} | ${intros} |`;
  });
  const actions = ProjectSchema.shape.clips.element.shape.actions.element.options.map((option) => {
    const shape = option.shape as unknown as Record<
      string,
      { safeParse(value: unknown): { success: boolean } }
    >;
    const kind = (option.shape.kind as unknown as { value: ClipAction['kind'] }).value;
    const own = Object.entries(shape)
      .filter(([key]) => !['id', 'kind', 'start', 'duration', 'easing'].includes(key))
      .map(([key, field]) => (field.safeParse(undefined).success ? `${key}?` : key));
    return { kind, own };
  });
  return [
    'Read the head comment of `scene.js` first: the clips by name with their place in the file ' +
      '(`eq1  clips[0]`), the glyphs of each formula by index, and the timeline, each line ending ' +
      'with where it is (`clips[0].actions[1]`). Every field is in `types/scene.d.ts`, with ' +
      `its comment: ${list(GUIDE_TYPES.scene)}.`,
    '',
    '- **Space**: Manim’s scene units. **y up**, the origin at the centre, the frame 8 tall ' +
      `(${(8 * (meta.width / meta.height)).toFixed(2)} wide here).`,
    '- **Time**: seconds. `clips[].start`/`end` are the scene’s; a block’s `start` counts from ' +
      'its clip’s start; a relation runs from `start of its target clip + offset`, for ' +
      '`duration`.',
    '- **Glyphs**: `glyphs` is `"all"` or indices, ascending, as listed in the head comment.',
    '- **Colours**: `"#RRGGBB"`, upper case. A glyph’s colour, first found: the clip’s ' +
      '`glyphColors`, the clip’s `color`, the formula’s `glyphColors`, the formula’s `color`.',
    '- **Ids**: any string unique in the file (`"my-indicate"`). A clip’s name is not its id.',
    '- Two animations may not move the same glyphs at once; `node check.mjs` says when they do.',
    '',
    '**Objects** (`formulas[].kind`): what each is made of comes from the editor (see below).',
    '',
    '| kind | is | made of | intros |',
    '|---|---|---|---|',
    ...objectRows,
    '',
    '**Intros** (`clips[].intro.kind`; `anim` of an appear block):',
    '',
    ...IntroKindSchema.options.map((kind) => `- ${code(kind)}: ${INTRO_WORDS[kind]}`),
    '',
    '**Outros** (`clips[].outro.kind`; `anim` of a disappear block):',
    '',
    ...OUTRO_KINDS.map((kind) => `- ${code(kind)}: ${OUTRO_WORDS[kind]}`),
    '',
    'An intro or an outro is `{ kind, duration, easing, lagRatio, shift, scale }`; `lagRatio` ' +
      'staggers the glyphs (null: Manim’s default).',
    '',
    '**Blocks** (`clips[].actions[]`, by `kind`; each has `id`, `start`, `duration`, `easing`):',
    '',
    ...actions.map(
      ({ kind, own }) => `- ${code(kind)}: ${ACTION_WORDS[kind]}. Fields: ${list(own)}.`,
    ),
    '',
    '**Emphasis effects** (`effect` of an emphasis block; every block keeps every field):',
    '',
    '| effect | Manim | what it draws or does | default | uses |',
    '|---|---|---|---|---|',
    ...EMPHASIS_KINDS.map((kind) => {
      const fallback = EMPHASIS_DEFAULTS[kind];
      return (
        `| ${code(kind)} | ${EMPHASIS[kind].label} | ${EMPHASIS_WORDS[kind]} | ` +
        `${fallback.duration} s, ${code(fallback.easing)} | ${list(EMPHASIS_FIELDS[kind])} |`
      );
    }),
    '',
    'An author’s words, as blocks: “a frame”, “a box”, “circle it” → `circumscribe`, whose ' +
      '`timeWidth` is how much of the frame shows at once as it runs round (0.3: a stroke ' +
      'going round; 1: whole by mid-way, then undrawn; 2: whole for longer). “Flash” → Manim’s ' +
      '`flash` is lines bursting from a point; a glyph that lights up is `indicate`, as are ' +
      '“highlight” and “pulse”. “Shake”, “wobble” → `wiggle`. “Spotlight” → `focus_on`. A ' +
      'colour named (“bright”, “gold”) → `color`.',
    '',
    '**An emphasis at a comment’s instant** goes in `actions` of a clip whose glyphs are ' +
      `drawn then, with a new \`id\` and every field (${indicate ? 'as the Indicate in 4.1' : '`EmphasisAction`'}); ` +
      'its `start` is the instant less the clip’s `start` (31 s on a clip that starts at 24 s: ' +
      '`"start": 7`).',
    '',
    '**Rate functions** (`easing` everywhere; `MFE.rates` in code):',
    '',
    ...EasingSchema.options.map((easing) => `- ${code(easing)}: ${EASING_WORDS[easing]}`),
    '',
    '**Relations** (`relations[]`: glyphs of `fromClipId` fly into `toClipId`, by `pairs`; ' +
      'a morph block does the same within one formula). Their `style`, and a pair’s own:',
    '',
    ...RelationStyleSchema.options.map((style) => `- ${code(style)}: ${STYLE_WORDS[style]}`),
    '',
    'A pair `{ "from": [2], "to": [5], "style": null }` (null: the relation’s style). With ' +
      'several sources and one target, its `extras`:',
    '',
    ...PairExtrasSchema.options.map((extras) => `- ${code(extras)}: ${EXTRAS_WORDS[extras]}`),
    '',
    '**Marks of the Slides mode** (`slides.marks[]`: `{ id, time, kind, text?, skipWait? }`; ' +
      '`slides` is the last field of the project, absent when the mode is off):',
    '',
    ...(Object.keys(MARK_WORDS) as SlideMarkKind[]).map(
      (kind) => `- ${code(kind)}: ${MARK_WORDS[kind]}`,
    ),
    '',
    'A mark stands where nothing animates (the edge of an animation will do); one that does not ' +
      'is left out of the page, with a warning.',
    '',
    '**Camera** (`camera`, absent without one): `initial` frame, named `targets`, and `moves` ' +
      '`{ id, start, duration, easing, to }`; nothing else may animate during a move. `to`:',
    '',
    ...(Object.keys(CAMERA_WORDS) as CameraDestination['kind'][]).map(
      (kind) => `- ${code(kind)}: ${CAMERA_WORDS[kind]}`,
    ),
  ];
}

function sceneExamples(project: Project): string[] {
  const out: string[] = [];
  for (const edit of sceneEdits(project)) {
    out.push(`**${edit.title}.** ${edit.where}`, '', fence('json', edit.json), '');
  }
  const formula = project.formulas.find((f) => KINDS[f.kind].latex) ?? project.formulas[0];
  const words = formula
    ? makeup(formula, project.meta).map(([w]) => w.replace('’', "'"))
    : ['its source', 'its font size'];
  out.push(
    '**What `scene.js` cannot change: what a formula is made of** — for ' +
      `${formula ? code(formula.name) : 'a formula'}: ${words.join(', ')} (the table above ` +
      'says it for each kind). The page typesets no LaTeX: the outlines travel in `glyphs.js`, ' +
      'made by the editor. Change one of those and the page draws the old outlines and says so ' +
      '(an error of `node check.mjs`). Everything else is free: times, intros, blocks, ' +
      'relations, colours, positions, sizes, marks, the camera. Another clip of a formula can ' +
      'be added (a `clips[]` entry with an `id` of its own, the formula’s `formulaId`, on a ' +
      'track where it overlaps no clip). A **new formula** is the editor’s job (export again), ' +
      'or yours as SVG or HTML of your own in a layer (section 6).',
  );
  return out;
}

function api(): string[] {
  return [
    'Code goes in `custom.js` (or a script of yours after `scene.js`). `types/mfe.d.ts` has ' +
      `every signature with its comment (${list(GUIDE_TYPES.mfe)}); to have it in your ` +
      'editor, start `custom.js` with `// @ts-check` and `/// <reference path="types/mfe.d.ts" />`.',
    '',
    '`window.MFE`:',
    '',
    '- `MFE.mount(elementOrSelector, options?)` → the deck of that element (the one the page ' +
      'mounted, if it did; mounts it otherwise). `MFE.mountAll(root?)`, `MFE.decks`, ' +
      '`MFE.scenes`.',
    '- `MFE.rates.smooth(0.3)`: Manim’s rate functions by name. `MFE.check(name?)`: the ' +
      'problems of the files. `MFE.version`, `MFE.glyphsVersion`.',
    '- `MFE.scene(name, project, assets?)` and `MFE.glyphs(name, data)` are what `scene.js` and ' +
      '`glyphs.js` call.',
    '',
    'A deck:',
    '',
    '- Playing: `play()`, `pause()`, `toggle()`, `next()` (on to the next pause), `previous()`, ' +
      '`seek(t)`; `time`, `playing`, `duration`, `fps`; `slide` (from 0) of `slides`; ' +
      '`atPause`: the index in `pauses` of the pause it stands at, null while it plays or ' +
      'anywhere else; `speed`, ' +
      '`through` (ignore the pauses), `muted`, `hasSound` (settable: `speed`, `through`, ' +
      '`muted`).',
    '- The scene: `pauses` (`{ time, note, resume }`: `resume`, where going on from it goes on ' +
      'from, is later than `time` at a pause that skips its wait), `comments` (`{ time, text }`), ' +
      '`project` (read only), `problems`, `name`, `options`, `element`, `stage`.',
    "- `on(event, fn)` → a function that stops listening. Events: `'time'` after every frame " +
      "drawn (playing or after a seek), `'play'`, `'pause'`, `'slide'`, `'end'`, and `'change'` " +
      'after any of those or a setting. A listener hears what comes after it is added: no event ' +
      'tells it where the deck already stands (opened at `?start=4.5`), so call it once yourself.',
    '- `animate({ from, to, ease?, update(progress, time) })` → a function that removes it. ' +
      '`update` runs on every frame drawn, playing or not; `progress` is the eased fraction: 0 ' +
      'before `from`, and after `to` what the easing ends at (1; 0 for `there_and_back`). `ease`: ' +
      'a rate function’s name or `(t) => …`; linear when absent.',
    "- `clip('eq1')` → the clip’s `<g>` (by name or id; null if absent — the console then " +
      'names the clips there are — or on a canvas); ' +
      "`flights(from?, to?)` → the `<g>`s of glyphs in flight; `layer('above' | 'below')` → a " +
      'free `<g>`.',
    "- `box('eq1', t?)` and `glyphBox('eq1', 3, t?)` → `{ x, y, width, height, cx, cy }` on the " +
      '**stage (y down)**, at time `t` (now when absent), null when not on screen. `redraw()` ' +
      'draws again now; `destroy()` gives the element back.',
  ];
}

function codeSection(project: Project, name: string): string[] {
  const out: string[] = [
    'Every script below is a whole `custom.js` that works as written in this folder.',
    '',
  ];
  for (const example of codeExamples(project, name)) {
    out.push(`**${example.title}.** ${example.about}`, '', fence('js', example.code), '');
    if (example.css) {
      out.push('With this in `player.css` (or a stylesheet of yours after it):', '');
      out.push(fence('css', example.css), '');
    }
  }
  const clip = codeExamples(project, name)[0]?.clip ?? 'eq1';
  out.push(
    '**A CSS animation on a clip, without code**: select its group by its name.',
    '',
    fence(
      'css',
      `.mfe-deck[data-scene="${name}"] [data-clip="${clip}"] {\n` +
        '  animation: my-blink 1.2s ease-in-out infinite alternate;\n' +
        '}\n' +
        '@keyframes my-blink {\n' +
        '  to {\n' +
        '    opacity: 0.5;\n' +
        '  }\n' +
        '}\n',
    ),
  );
  return out;
}

function stage(): string[] {
  return [
    fence(
      'html',
      '<div class="mfe-deck" data-scene="…" data-mfe-mounted data-mfe-state="paused">\n' +
        '  <div class="mfe-screen">\n' +
        '    <svg class="mfe-stage" viewBox="…">        the camera’s frame, in scene units\n' +
        '      <g class="mfe-below"></g>                free: under the scene\n' +
        '      <g class="mfe-scene">\n' +
        '        <g class="mfe-clip" data-clip="eq1">   a clip, by its name\n' +
        '          <path class="mfe-glyph" data-glyph="3" d="…" fill="…"/>\n' +
        '        </g>\n' +
        '        <g class="mfe-flight" data-from="eq1" data-to="eq2"></g>  glyphs in flight\n' +
        '        <g class="mfe-effects"></g>            an emphasis’s drawings\n' +
        '      </g>\n' +
        '      <g class="mfe-above"></g>                free: over the scene\n' +
        '    </svg>\n' +
        '    <div class="mfe-problems">…</div>          only when the files have errors\n' +
        '    <div class="mfe-blackout" hidden></div>    the stage blacked out (B)\n' +
        '  </div>\n' +
        '  <div class="mfe-bar" role="group">           the controls, built by the engine:\n' +
        '    <button class="mfe-button mfe-play">       and mfe-previous, mfe-next, mfe-through,\n' +
        '      <svg class="mfe-icon">…</svg>            mfe-mute, mfe-notes-button, mfe-fullscreen\n' +
        '    </button>\n' +
        '    <div class="mfe-timeline" role="slider">   mfe-timeline-track, mfe-timeline-played,\n' +
        '      <span class="mfe-pause-mark" data-time="3.2"></span>   mfe-timeline-thumb; a notch per pause\n' +
        '    </div>\n' +
        '    <span class="mfe-slide-count">2 / 3</span> <span class="mfe-time">1.25 / 6.00 s</span>\n' +
        '  </div>\n' +
        '  <div class="mfe-notes" hidden>…</div>        the notes of the pauses and the comments (S)\n' +
        '  <div class="mfe-live"></div>                 what a screen reader is told\n' +
        '</div>',
    ),
    '',
    '- **The `<path>`s are the engine’s**: their `d`, `fill`, `stroke` and opacities are ' +
      'written again on every frame, and paths come and go. **The groups are yours**: give ' +
      '`.mfe-clip`, `.mfe-flight` and the layers a `transform`, a `filter`, a class, a CSS ' +
      'animation; add elements to the layers. CSS `fill` or `opacity` set on `.mfe-glyph` beat ' +
      'the engine’s attributes for good: change colours in `scene.js` instead.',
    "- **No ids**: select by class and attribute — `deck.clip('eq1')`, or " +
      '`.mfe-deck[data-scene="…"] [data-clip="eq1"]`. `data-glyph` is the glyph’s index, as in ' +
      '`scene.js`. Glyphs in flight between clips are in `.mfe-flight`, not in their clip’s group; ' +
      'what an emphasis draws (a frame, lines, a disc) is a `.mfe-effect` in `.mfe-effects`.',
    '- **Coordinates. `scene.js` is Manim’s: y up. The stage is SVG: y down.** Same units, same ' +
      'x; a point `[x, y]` of `scene.js` is at `x, -y` on the stage. `deck.box`, `deck.glyphBox` ' +
      'and the layers are in stage units: place what you add with them and it is upright, and ' +
      'where the scene is. The `viewBox` is the camera’s frame, so the layers move with the ' +
      'camera. Sizes are scene units: a frame is 8 tall, a label of `font-size` 0.4 is small.',
    '- Again, because it is the usual mistake: **a y read from `scene.js` changes sign on the ' +
      'stage; a y read from `deck.box` changes sign in `scene.js`.**',
    '- The runtime sets `--mfe-aspect` and `--mfe-scene-background` on the deck’s element, and ' +
      '`data-mfe-state`: `playing`, `paused`, `ended`.',
    '- **The controls** are built on the deck’s public object alone, the one `custom.js` has: ' +
      'restyle them in `player.css`, or mount with `data-controls="none"` — no bar, no notes ' +
      'and no keys then — and build your own on the API. What they show is in attributes of the ' +
      'deck’s element, for CSS: ' +
      '`data-mfe-controls` (`full`, `minimal`), `data-mfe-notes` (the notes are open), ' +
      '`data-mfe-blackout`, `data-mfe-fullscreen` and `data-mfe-idle` (full screen, and the ' +
      'pointer at rest: the bar hides). A word only a screen reader reads is ' +
      '`.mfe-visually-hidden`.',
    '- **The keys** (heard where `data-keys` says): → ↓ Space PageDown N Enter go on; ← ↑ PageUp ' +
      'P Backspace Shift+Space go back; Home, End; K plays or pauses; F full screen; S the ' +
      'notes; B or `.` blacks the stage out; M mutes. Never in a field, never Space or Enter on ' +
      'a button, never with Ctrl, ⌘ or Alt. A click on the stage plays or pauses unless a ' +
      'handler of yours called `preventDefault()`. Keys of your own should keep off these.',
  ];
}

function embedding(input: GuideInput): string[] {
  const { project, name } = input;
  const optionRows = OPTION_NAMES.map((option) => {
    const [values, what] = OPTION_WORDS[option];
    return `| ${code(`data-${option}`)} | ${values} | ${code(String(DEFAULT_OPTIONS[option]))} | ${what} |`;
  });
  const sound = input.files.find((path) => /^audio\.\w+$/.test(path));
  // A scene that starts empty: the instant its first clip is in, where something shows.
  const shows = (time: number) => clipsDrawnAt(project, time).size > 0;
  const firstIn = shows(0)
    ? null
    : (project.clips
        .map((clip) => Math.round(settledAt(project, clip) * 100) / 100)
        .filter(shows)
        .sort((a, b) => a - b)[0] ?? Number.NaN);
  return [
    'See `embed-example.html`. A page of yours needs, beside it: `mfe-runtime.js`, `glyphs.js`, ' +
      '`scene.js`, `player.css`, `custom.js` when the scene has code of its own' +
      (sound ? `, ${code(sound)} (its sound)` : '') +
      ', and `LICENSES.txt` (the engine’s notice). Then six tags, paths relative to the page: ' +
      'the stylesheet, the element, and the scripts in this order, `custom.js` last (leave it ' +
      'out when it holds nothing):',
    '',
    fence(
      'html',
      '<link rel="stylesheet" href="player.css" />\n' +
        `<div class="mfe-deck" data-scene="${name}"></div>\n` +
        '<script src="mfe-runtime.js"></script>\n' +
        '<script src="glyphs.js"></script>\n' +
        '<script src="scene.js"></script>\n' +
        '<script src="custom.js"></script>',
    ),
    '',
    'Or the scene’s own page in a frame, for a site that takes no scripts: ' +
      '`<iframe src="index.html?controls=minimal&autoplay">`.',
    '',
    'Options, as `data-` attributes of the element or (on `index.html`) in the address with the ' +
      'same names; a switch is on when present, off with `off`, `false`, `no` or `0`; ' +
      '`MFE.mount(element, { … })` takes them too and wins:',
    '',
    '| attribute | values | default | what |',
    '|---|---|---|---|',
    ...optionRows,
    '',
    '`minimal` keeps the keys and the notes. **On a page for readers** (a blog), add ' +
      '`data-notes="off"` (`&notes=off` in a frame’s address): the notes show the author’s ' +
      'comments, which are tasks for whoever works on the scene, to anyone who presses S.',
    ...(firstIn === null
      ? []
      : [
          '',
          'This scene **starts empty**: embedded, its stage is blank until it plays. ' +
            '`data-autoplay` plays it when it comes on screen (but not for a reader who asked ' +
            'for less motion)' +
            (Number.isFinite(firstIn)
              ? `; \`data-start="${firstIn}"\` stands it where something shows, and playing ` +
                'goes on from there (Home goes back to the start; ← to the pause before it, if ' +
                'one is)'
              : '') +
            '.',
        ]),
    '',
    '`data-page` makes an element the page’s own scene: it reads the address and hears its keys ' +
      'anywhere (`index.html` has it). The deck takes its container’s width and keeps the ' +
      'scene’s shape. **Several scenes in a page**: load `mfe-runtime.js` once, then each ' +
      'scene’s `glyphs.js` and `scene.js` (rename the files if they share a folder: the name ' +
      'inside them is what counts), and give each element its `data-scene`. Nothing but `MFE` ' +
      'is global, and nothing has an id.',
  ];
}

/** Controls that appear on hover, for a page that hosts a deck: the bar laid over the foot of the
 * stage, out of the flow — so that showing it moves nothing —, hidden until the pointer is on the
 * deck or the focus in it, and left to `player.css` in full screen, where it has a bar of its own
 * that hides by itself. Under the host's selector: three classes, so it wins over the stylesheet's
 * two wherever it is written. `e2e/deckControls.spec.ts` embeds a deck with this text as the
 * export wrote it. */
export const HOVER_BAR_CSS =
  '.my-page .mfe-deck:where(:not([data-mfe-fullscreen])) .mfe-bar {\n' +
  '  position: absolute;\n' +
  '  right: 0;\n' +
  '  bottom: 0;\n' +
  '  left: 0;\n' +
  '  z-index: 2;\n' +
  '  opacity: 0;\n' +
  '  pointer-events: none;\n' +
  '}\n' +
  '.my-page .mfe-deck:where(:not([data-mfe-fullscreen])):where(:hover, :focus-within) .mfe-bar {\n' +
  '  opacity: 1;\n' +
  '  pointer-events: auto;\n' +
  '}\n';

function look(css: string): string[] {
  const contract = cssContract(css);
  const item = (property: CssProperty) =>
    `${code(property.name)} (${code(property.value)})` +
    (property.note ? `: ${property.note}` : '');
  const properties = contract.properties.length
    ? contract.properties.map((property) => `- ${item(property)}`)
    : ['- (this `player.css` declares none)'];
  return [
    'The look is `player.css`: plain CSS, every rule under `.mfe-deck`, yours to edit or ' +
      'replace. To restyle from the host page, give the custom properties other values ' +
      '(`.my-page .mfe-deck { --mfe-…: … }`). The engine styles nothing itself. **Light or ' +
      'dark**: `data-theme="light"` or `"dark"` on the element; without one, an embedded deck’s ' +
      'controls follow the reader’s system setting (the scene’s own page stays dark).',
    '',
    'Custom properties `player.css` declares on `.mfe-deck` (with their values there):',
    '',
    ...properties,
    ...(contract.pageProperties.length
      ? [
          '',
          'For the scene’s own page alone (`index.html`, `<body class="mfe-page">`):',
          '',
          ...contract.pageProperties.map((property) => `- ${item(property)}`),
        ]
      : []),
    '',
    '`--mfe-font` goes inside `font:` shorthands: give it family names (`Georgia, serif`), or a ' +
      'variable of your page that holds them. `inherit` voids those declarations, and the ' +
      'controls take your page’s size and line height too.',
    '',
    `Classes it styles: ${contract.classes.length ? list(contract.classes.map((c) => `.${c}`)) : 'none'}.`,
    '',
    '**The scene’s colours** are data in `scene.js`, not CSS: `meta.background`; a formula’s ' +
      '`color` and `glyphColors` (a shape’s `fillColor`); a clip’s `initial.color` and ' +
      '`initial.glyphColors`; the `color` of the blocks that set one (a tween’s `to`, a ' +
      'transform, an emphasis). `formulas[].tag.color` and `colorMatches` are the editor’s own: ' +
      'they paint nothing. `data-background="transparent"` shows the host page behind the scene: ' +
      'light glyphs cannot be read on a light page, so give them dark colours in `scene.js` (or ' +
      'keep the scene’s background).',
    '',
    '**Controls that appear on hover**: the bar over the foot of the stage, shown while the ' +
      'pointer is on the scene or the focus is in it; nothing on the page moves. Under your ' +
      'page’s own selector (`.my-page` here), after `player.css`, on a deck with ' +
      '`data-notes="off"` (open notes would sit under the stage, the bar over them):',
    '',
    fence('css', HOVER_BAR_CSS),
  ];
}

function pitfalls(): string[] {
  return [
    '- **Classic scripts, in order.** The page is opened from `file://`: no modules, no `import`, ' +
      'no `fetch`, no workers (the browser blocks them there). Data are `.js` files that call ' +
      '`MFE.scene`/`MFE.glyphs`.',
    '- **y up in `scene.js`, y down on the stage** (section 6).',
    '- **`update` is a function of progress**, called on every frame drawn and after any seek, ' +
      'in any order of times: compute everything from `progress` and `time`, never accumulate ' +
      'state between calls. Create elements once, outside it.',
    '- **Time stands still at a pause**: an animation of the scene’s time does not move then. ' +
      'For motion while it waits, use CSS (the last examples).',
    '- **At a pause that skips its wait the time jumps** (`skipWait`): going on from it, the ' +
      'scene goes on from `deck.pauses[i].resume`, so what `animate` does between the pause and ' +
      '`resume` is never seen when presenting (only played through, or after a seek). Start it ' +
      'at `resume`, or make it CSS while the deck waits, as the example of a pause does.',
    '- **The page’s clock is continuous**; the editor and its Python and video exports work on ' +
      'frames (`meta.fps`). Keep the times you write on that grid (multiples of 1/fps) if the ' +
      'scene may go back to the editor.',
    '- **A clip’s name is derived**, not stored: its formula’s name (as an identifier), then ' +
      '`_2`, `_3`… for its later clips, by start time. Renaming a formula or moving a clip ' +
      'before another of the same formula renames clips: update your selectors.',
    '- **Glyph indices** are the formula’s, as the head comment of `scene.js` lists them — not ' +
      'the order of the `<path>`s.',
    '- `deck.project` is the scene as read: do not change it; edit `scene.js` and reload.',
  ];
}

/** `AGENTS.md`. */
export function agentsFile(input: GuideInput): string {
  const { project, name } = input;
  const title = project.meta.name.replace(/\s+/g, ' ').trim() || name;
  const sections: [string, string[]][] = [
    ['1. What the author wants done next', tasks(project)],
    ['2. The folder', folder(input)],
    ['3. Look at it, check it', lookAndCheck()],
    ['4. Extend it by editing scene.js', sceneVocabulary(project)],
    ['4.1 Edits that work here', sceneExamples(project)],
    ['5. Extend it with code: custom.js and window.MFE', api()],
    ['5.1 Scripts that work here', codeSection(project, name)],
    ['6. The stage', stage()],
    ['7. Embedding', embedding(input)],
    ['8. Changing the look', look(input.css)],
    ['9. Pitfalls', pitfalls()],
  ];
  return wrapMarkdown([
    `# ${title}: a scene to extend`,
    '',
    `This folder is the scene ${code(name)} (${seconds(sceneDuration(project))} s), exported ` +
      'from Manim Formula Editor as a page that plays it live. You extend it by editing ' +
      '`scene.js` (the animation as data) or by adding code to `custom.js` (`window.MFE`), and ' +
      'restyle it in `player.css`. Check every change with `node check.mjs`.',
    '',
    'Contents:',
    '',
    ...sections.map(([heading]) => `- [${heading}](#${slug(heading)})`),
    ...sections.flatMap(([heading, body]) => [
      '',
      `${/^\d+\.\d/.test(heading) ? '###' : '##'} ${heading}`,
      '',
      ...body,
    ]),
  ]);
}

/** `CLAUDE.md`: Claude Code reads it, and it imports the guide every other agent reads. */
export function claudeFile(): string {
  return '@AGENTS.md\n';
}

/** `README.md`: the folder for a person, on one screen. */
export function readmeFile(input: GuideInput): string {
  const { project, name } = input;
  const title = project.meta.name.replace(/\s+/g, ' ').trim() || name;
  return wrapMarkdown([
    `# ${title}`,
    '',
    'An animation made with Manim Formula Editor, exported as a web page that plays it live.',
    '',
    '- **Open it**: double-click `index.html`. No internet, no server, nothing to install.',
    '- **Present with it**: it stops at each pause. → Space PageDown or a clicker go on; ← ' +
      'PageUp go back; Home / End; F full screen; S your notes; B a black screen. Or press ' +
      'play and let it run.',
    '- **Put it in a page of yours**: see `embed-example.html` — a stylesheet, an element and ' +
      'three scripts (four with `custom.js`), or an `<iframe src="index.html">`. On a page for ' +
      'readers, `data-notes="off"` keeps your notes and comments off it.',
    '- **Change its look**: edit `player.css` (its custom properties, `--mfe-…`, are the ' +
      'quick way).',
    '- **Change the animation, or add to it**: hand the folder to a coding agent (Claude Code, ' +
      'Codex, Cursor…). `AGENTS.md` is written for it: what each file is, how to extend the ' +
      'scene and check it. To check by hand: `node check.mjs`.',
    '- **The scene itself** is `scene.js`; the formulas’ shapes are `glyphs.js`: to change what ' +
      'a formula says, export it again from the editor.',
    '',
    'The engine (`mfe-runtime.js`) is MIT licensed, with the components listed in ' +
      '`LICENSES.txt`. The scene is yours.',
  ]);
}
