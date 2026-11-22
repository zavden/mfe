// @vitest-environment node
/* The guide of an exported folder (`AGENTS.md`), as an agent that has never seen the editor reads
 * it: it opens with the author's comments as tasks, names every file of the folder and every kind
 * of the model's catalogue, every member of the API, keeps to what such an agent can read at once,
 * and its examples work — the edits of `scene.js` make projects without a new problem, the
 * scripts run in the folder's own page and do what they say, and type-check against the folder's
 * types. Its README and CLAUDE.md beside it. */
import { beforeAll, describe, expect, it } from 'vitest';
import { packGlyphs } from '../../../deck/glyphFile';
import { DEFAULT_OPTIONS, OPTION_NAMES } from '../../../deck/options';
import { buildDeckScene } from '../../../deck/sceneFile';
import { renderedExample, type Rendered } from '../../../embed/__tests__/fixtures';
import {
  EMPHASIS_KINDS,
  KINDS,
  OUTRO_KINDS,
  validateProject,
  type Project,
  type SlideMark,
} from '../../../model';
import {
  EasingSchema,
  IntroKindSchema,
  PairExtrasSchema,
  ProjectSchema,
  RelationStyleSchema,
} from '../../../model/schema';
import { folderPage, type FolderPage } from '../../../test/folderPage';
import { EXAMPLES } from '../../../test/examples';
import { declaredNames, interfaceMembers, typeCheck } from '../../../test/typeCheck';
import { GUIDE_TYPES, HOVER_BAR_CSS, wrapMarkdown } from '../agentGuide';
import { clipsDrawnAt, codeExamples, cssContract, namesIn, sceneEdits } from '../guideExamples';
import { packDeck, sceneName, type DeckFile } from '../packDeck';
import { RUNTIME_ASSETS } from '../runtimeAssets';

const rendered = new Map<string, Rendered>();
beforeAll(async () => {
  for (const name of EXAMPLES) rendered.set(name, await renderedExample(name));
}, 120_000);

const textOf = (files: readonly DeckFile[], path: string) =>
  files.find((file) => file.path === path)!.text;

/** `hello` with marks: a comment and two pauses where the scene rests (it animates over [0, 1],
 * [2, 3], [3.2, 3.8] and [4, 5]). */
function helloWithMarks(): Project {
  const project = structuredClone(rendered.get('hello.mfe.json')!.project);
  const marks: SlideMark[] = [
    { id: 'p1', time: 1.5, kind: 'pause', text: 'Ask the room' },
    { id: 'c1', time: 1.25, kind: 'comment', text: 'a flash over the m\nand make it gold' },
    { id: 'p2', time: 3.9, kind: 'pause' },
    { id: 'c2', time: 0.5, kind: 'comment', text: 'under the intro: left out' },
  ];
  project.slides = { marks };
  return project;
}

/** `completing-the-square` with the marks of a trial with an agent: three pauses, a comment that
 * shares its instant with the second — and names `equation`, whose clip has gone by then: what
 * shows is `steps` — and one at the end of the last relation. */
function squareWithMarks(): Project {
  const project = structuredClone(rendered.get('completing-the-square.mfe.json')!.project);
  project.slides = {
    marks: [
      { id: 'p1', time: 3.1, kind: 'pause' },
      { id: 'p2', time: 4.6, kind: 'pause', text: 'Say why we add (b/2a)^2 to both sides.' },
      {
        id: 'p3',
        time: 4.6,
        kind: 'comment',
        text: 'While the scene is stopped at this pause, the equation on screen should pulse gently.',
      },
      { id: 'p4', time: 5.3, kind: 'pause' },
      {
        id: 'p5',
        time: 31,
        kind: 'comment',
        text: 'When the final result has appeared, flash a bright frame around it once.',
      },
    ],
  };
  return project;
}

const packedOf = (name: string, project = rendered.get(name)!.project) =>
  packDeck(project, rendered.get(name)!.resolved, RUNTIME_ASSETS);

/** The fenced blocks of a Markdown text in a language. */
const blocks = (markdown: string, language: string) =>
  [...markdown.matchAll(new RegExp(`^\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\`$`, 'gm'))].map(
    (match) => match[1]!,
  );

/** The action kinds of the model's schema. */
const ACTION_KINDS = ProjectSchema.shape.clips.element.shape.actions.element.options.map(
  (option) => (option.shape.kind as unknown as { value: string }).value,
);

describe('AGENTS.md', () => {
  it.each(EXAMPLES)('of %s names every file of the folder and every kind of the model', (name) => {
    const files = packedOf(name);
    const guide = textOf(files, 'AGENTS.md');
    for (const file of files) expect(guide, file.path).toContain(`\`${file.path}\``);
    const named = [
      ...IntroKindSchema.options,
      ...OUTRO_KINDS,
      ...EMPHASIS_KINDS,
      ...EasingSchema.options,
      ...RelationStyleSchema.options,
      ...PairExtrasSchema.options,
      ...ACTION_KINDS,
      ...Object.keys(KINDS),
      'pause',
      'comment',
      'skipWait',
      'frame',
      'target',
      'start',
    ];
    for (const word of named) expect(guide, word).toContain(`\`${word}\``);
    for (const option of OPTION_NAMES) {
      expect(guide).toMatch(
        new RegExp(
          `\\| \`data-${option}\` \\|[^\\n]*\\| \`${String(DEFAULT_OPTIONS[option])}\` \\|`,
        ),
      );
    }
  });

  it('names every member of the API, and only types the type files declare', () => {
    const guide = textOf(packedOf('hello.mfe.json'), 'AGENTS.md');
    for (const member of interfaceMembers(RUNTIME_ASSETS.mfeTypes, 'MfeRuntime'))
      expect(guide, member).toMatch(new RegExp(`\`MFE\\.${member}\\b`));
    for (const member of interfaceMembers(RUNTIME_ASSETS.mfeTypes, 'Deck'))
      expect(guide, member).toMatch(new RegExp(`\`${member}\\b`));
    const api = declaredNames(RUNTIME_ASSETS.mfeTypes);
    const model = declaredNames(RUNTIME_ASSETS.sceneTypes);
    for (const type of GUIDE_TYPES.mfe) {
      expect(api.has(type), type).toBe(true);
      expect(guide).toContain(`\`${type}\``);
    }
    for (const type of GUIDE_TYPES.scene) {
      expect(model.has(type), type).toBe(true);
      expect(guide).toContain(`\`${type}\``);
    }
  });

  it.each(EXAMPLES)('of %s is one an agent reads at once, on short lines', (name) => {
    const guide = textOf(packedOf(name), 'AGENTS.md');
    // Well under the 25,000 tokens of a read (about 3.5 characters a token in such a text).
    expect(guide.length).toBeLessThan(36_000);
    const long = guide.split('\n').filter((line) => line.length > 100 && !line.startsWith('|'));
    expect(long).toEqual([]);
    for (const json of blocks(guide, 'json')) expect(() => JSON.parse(json)).not.toThrow();
  });

  it('opens with the author’s comments as tasks, each with what happens around it', () => {
    const guide = textOf(packedOf('hello.mfe.json', helloWithMarks()), 'AGENTS.md');
    const first = guide.slice(guide.indexOf('## 1.'), guide.indexOf('## 2.'));
    expect(first).toContain(
      '1. **1.25 s** (`slides.marks[1]`) — after `a1 write`, before `f2 appears`; on screen: ' +
        '`a1`.\n   > a flash over the m\n   > and make it gold',
    );
    // The comment under an animation is not one the page carries.
    expect(first).not.toContain('left out');
    expect(first).toContain('- Pause 1 at 1.50 s (`slides.marks[0]`) — “Ask the room”;');
    expect(first).toContain('- Pause 2 at 3.90 s (`slides.marks[2]`); after `f2 tween (move)`');
    // Without marks, one line says so.
    const plain = textOf(packedOf('hello.mfe.json'), 'AGENTS.md');
    expect(plain).toContain('The author left no comments in this scene');
    // What to do with a comment once its task is done, with comments only; where to make a
    // change, always, and once.
    const words = first.replace(/\n/g, ' ');
    expect(words).toContain('A task done, take its mark out of `slides.marks`');
    expect(plain).not.toContain('A task done');
    for (const guide of [first, plain]) {
      expect(guide.replace(/\n/g, ' ')).toContain(
        '**Where to make a change**: the next export from the editor writes `scene.js` again',
      );
    }
    expect(plain.match(/is lost/g)).toHaveLength(1);
    expect(plain).toContain('The scene has no pauses');
    expect(plain.indexOf('## 1. What the author wants done next')).toBeLessThan(
      plain.indexOf('## 2.'),
    );
  });

  it('says when a clip the comment names is not on screen then, and when one shows nothing', () => {
    const guide = textOf(
      packedOf('completing-the-square.mfe.json', squareWithMarks()),
      'AGENTS.md',
    );
    const first = guide
      .slice(guide.indexOf('## 1.'), guide.indexOf('## 2.'))
      .replace(/\n\s*/g, ' ');
    expect(first).toContain(
      '1. **4.60 s** (`slides.marks[2]`) — after `equation → steps (transform, 10 pairs)`, before ' +
        '`divide_by_a grow_from_center`; on screen: `title`, `steps`. `equation`, which its words ' +
        'name, is not on screen then (0.50–4.60 s). > While the scene',
    );
    // A clip on screen with none of its glyphs drawn: `steps` before its relation brings them.
    const project = squareWithMarks();
    project.slides!.marks.push({ id: 'p6', time: 3.4, kind: 'comment', text: 'the steps' });
    const empty = textOf(packedOf('completing-the-square.mfe.json', project), 'AGENTS.md');
    expect(empty.replace(/\n\s*/g, ' ')).toContain(
      'on screen: `title`, `equation`, `steps` (none of its glyphs drawn).',
    );
  });

  it('says of a pause that skips its wait where the page goes on, and what that does to code', () => {
    const project = helloWithMarks();
    project.slides!.marks[0]!.skipWait = true;
    const guide = textOf(packedOf('hello.mfe.json', project), 'AGENTS.md');
    const first = guide
      .slice(guide.indexOf('## 1.'), guide.indexOf('## 2.'))
      .replace(/\n\s*/g, ' ');
    expect(first).toContain(
      '- Pause 1 at 1.50 s (`slides.marks[0]`) — “Ask the room”; it skips its wait: going on, the ' +
        'page jumps to 2.00 s; after `a1 write`',
    );
    expect(first).toContain('- Pause 2 at 3.90 s (`slides.marks[2]`); after');
    // The field, the API and the pitfall: the same in every guide.
    const words = guide.replace(/\n\s*/g, ' ');
    expect(words).toContain('`{ id, time, kind, text?, skipWait? }`');
    expect(words).toContain(
      'with `"skipWait": true` going on from it jumps over the wait after it',
    );
    expect(words).toContain('`pauses` (`{ time, note, resume }`: `resume`, where going on');
    expect(words).toContain(
      '**At a pause that skips its wait the time jumps** (`skipWait`): going on from it, the ' +
        'scene goes on from `deck.pauses[i].resume`, so what `animate` does',
    );
    // Its notch, the dashes of its wait and their colour are in the stylesheet's contract.
    expect(words).toContain('`--mfe-skip-wait` (`#b69cff`)');
    expect(words).toContain('`.mfe-timeline-skip`');
  });

  it('says what each effect, intro and outro draws, and turns an author’s words into blocks', () => {
    const guide = textOf(packedOf('hello.mfe.json'), 'AGENTS.md');
    for (const kind of EMPHASIS_KINDS) {
      // effect | Manim | what it draws or does | default | uses
      expect(guide, kind).toMatch(
        new RegExp(`^\\| \`${kind}\` \\| \\w+ \\| [^|]{20,} \\| \\d`, 'm'),
      );
    }
    for (const kind of [...IntroKindSchema.options, ...OUTRO_KINDS].filter((k) => k !== 'none')) {
      expect(guide, kind).toMatch(new RegExp(`^- \`${kind}\`: \`\\w+\`: \\S`, 'm'));
    }
    const words = guide.replace(/\n/g, ' ');
    expect(words).toContain('“a frame”, “a box”, “circle it” → `circumscribe`, whose `timeWidth`');
    expect(words).toContain('“Flash” → Manim’s `flash` is lines bursting from a point');
    // The recipe of an emphasis at a comment's instant: its start counts from its clip's.
    expect(words).toContain('its `start` is the instant less the clip’s `start`');
  });

  it('tells what an embed needs, its tags in order, and what a page for readers adds', () => {
    const files = packedOf('completing-the-square.mfe.json');
    const guide = textOf(files, 'AGENTS.md');
    const section = guide.slice(guide.indexOf('## 7.'), guide.indexOf('## 8.'));
    const words = section.replace(/\n/g, ' ');
    for (const file of ['mfe-runtime.js', 'glyphs.js', 'scene.js', 'player.css', 'custom.js'])
      expect(words, file).toContain(`\`${file}\``);
    expect(words).toContain('`LICENSES.txt` (the engine’s notice)');
    expect(words).toContain('Then six tags');
    const html = blocks(section, 'html')[0]!;
    expect(html.split('\n')).toHaveLength(6);
    expect([...html.matchAll(/<script src="([^"]+)">/g)].map((match) => match[1])).toEqual([
      'mfe-runtime.js',
      'glyphs.js',
      'scene.js',
      'custom.js',
    ]);
    expect(words).toContain('`minimal` keeps the keys and the notes.');
    expect(words).toContain('add `data-notes="off"`');
    // It starts empty (its title is written from 0 s): what helps, and where something shows.
    expect(words).toContain('This scene **starts empty**');
    expect(words).toContain('`data-autoplay`');
    expect(words).toContain('`data-start="1.5"` stands it where something shows');
    // One that shows something at once says nothing of it.
    const shown = structuredClone(rendered.get('completing-the-square.mfe.json')!.project);
    for (const clip of shown.clips)
      if (clip.start === 0) clip.intro = { ...clip.intro, kind: 'none', duration: 0 };
    const other = textOf(packedOf('completing-the-square.mfe.json', shown), 'AGENTS.md');
    expect(other).not.toContain('starts empty');
  });

  it('gives controls that appear on hover as CSS under the host’s selector, balanced', () => {
    const guide = textOf(packedOf('hello.mfe.json'), 'AGENTS.md');
    const look = guide.slice(guide.indexOf('## 8.'), guide.indexOf('## 9.'));
    expect(look).toContain('**Controls that appear on hover**');
    const [css] = blocks(look.slice(look.indexOf('**Controls that appear on hover**')), 'css');
    expect(`${css}\n`).toBe(HOVER_BAR_CSS);
    expect(css!.split('{').length).toBe(css!.split('}').length);
    for (const rule of css!.split('}').filter((part) => part.trim()))
      expect(rule.trim()).toMatch(/^\.my-page \.mfe-deck/);
  });

  it('tells an agent that looks by script to look at instants, not to play', () => {
    const guide = textOf(packedOf('hello.mfe.json'), 'AGENTS.md');
    const look = guide.slice(guide.indexOf('## 3.'), guide.indexOf('## 4.')).replace(/\n\s*/g, ' ');
    expect(look).toContain(
      'Look at instants, with `seek(t)` or `index.html?start=4.5`, not by playing',
    );
    expect(look).toContain('a screenshot shows CSS animations at their start');
  });

  it('says what follows the system, how the controls take a font, where colours are', () => {
    const guide = textOf(packedOf('hello.mfe.json'), 'AGENTS.md');
    const look = guide.slice(guide.indexOf('## 8.'), guide.indexOf('## 9.')).replace(/\n/g, ' ');
    expect(look).toContain('without one, an embedded deck’s controls follow the reader’s system');
    expect(look).toContain('`--mfe-font` goes inside `font:` shorthands');
    expect(look).toContain('`inherit` voids those declarations');
    expect(look).toContain('`formulas[].tag.color` and `colorMatches` are the editor’s own');
    expect(look).toContain('light glyphs cannot be read on a light page');
    for (const field of ['meta.background', 'glyphColors', 'initial.color', 'fillColor'])
      expect(look, field).toContain(`\`${field}\``);
  });

  it('lists the custom properties and the classes of the folder’s own stylesheet', () => {
    const guide = textOf(packedOf('hello.mfe.json'), 'AGENTS.md');
    const contract = cssContract(RUNTIME_ASSETS.css);
    for (const property of contract.properties) expect(guide).toContain(`\`${property.name}\``);
    // The page's own apart, the page's background among them, and not on the deck's list.
    const page = guide.slice(guide.indexOf('For the scene’s own page alone'));
    expect(page).toContain('\n- `--mfe-page-background` (`#0b0d0f`): Around the deck.\n');
    expect(contract.pageProperties.map((property) => property.name)).toEqual([
      '--mfe-page-background',
      '--mfe-page-height',
      '--mfe-page-chrome',
    ]);
    for (const property of contract.pageProperties)
      expect(page.slice(0, 600)).toContain(`- \`${property.name}\``);
    expect(contract.properties.map((property) => property.name)).not.toContain('--mfe-page-chrome');
    // The light set is the deck's, though one of its selectors names the page.
    expect(contract.properties.map((property) => property.name)).toContain('--mfe-accent');
    for (const name of contract.classes) expect(guide).toContain(`\`.${name}\``);
    // And another stylesheet gives another list.
    const files = packDeck(
      rendered.get('hello.mfe.json')!.project,
      rendered.get('hello.mfe.json')!.resolved,
      {
        ...RUNTIME_ASSETS,
        css: '.mfe-deck { --mfe-accent: #f60; }\n.mfe-deck .mfe-bar { color: red; }\n',
      },
    );
    const other = textOf(files, 'AGENTS.md');
    expect(other).toContain('- `--mfe-accent` (`#f60`)');
    expect(other).toContain('Classes it styles: `.mfe-bar`, `.mfe-deck`.');
  });

  it('describes every class and state the stage of a mounted deck has', async () => {
    const files = packedOf('hello.mfe.json');
    const page = await folderPage(textOf(files, 'index.html'), [
      textOf(files, 'mfe-runtime.js'),
      textOf(files, 'glyphs.js'),
      textOf(files, 'scene.js'),
    ]);
    const [deck] = page.mfe.decks;
    deck!.seek(2.5); // a relation in flight
    const guide = textOf(files, 'AGENTS.md');
    const classes = new Set<string>();
    for (const element of deck!.element.querySelectorAll('*')) {
      for (const name of (element.getAttribute('class') ?? '').split(/\s+/))
        if (name.startsWith('mfe-')) classes.add(name);
    }
    expect(classes.size).toBeGreaterThan(5);
    for (const name of classes) expect(guide, name).toContain(name);
    for (const attribute of deck!.element.getAttributeNames()) {
      if (attribute.startsWith('data-')) expect(guide, attribute).toContain(attribute);
    }
    for (const property of ['--mfe-aspect', '--mfe-scene-background']) {
      expect(deck!.element.style.getPropertyValue(property)).not.toBe('');
      expect(guide).toContain(`\`${property}\``);
    }
  });
});

describe('the edits of scene.js the guide shows', () => {
  it.each(EXAMPLES)('make of %s a scene that plays, with no problem it did not have', (name) => {
    const { project, resolved } = rendered.get(name)!;
    const guide = textOf(packedOf(name), 'AGENTS.md');
    const glyphs = JSON.parse(JSON.stringify(packGlyphs(project, resolved)));
    const before = new Set(validateProject(project).map((issue) => issue.message));
    const edits = sceneEdits(project);
    expect(edits.length).toBeGreaterThanOrEqual(3);
    for (const edit of edits) {
      expect(guide).toContain(edit.json);
      const after = edit.apply(project);
      const added = validateProject(after).filter((issue) => !before.has(issue.message));
      expect(added, edit.title).toEqual([]);
      const errors = buildDeckScene(JSON.parse(JSON.stringify(after)), glyphs).problems.filter(
        (problem) => problem.severity === 'error',
      );
      expect(errors, edit.title).toEqual([]);
    }
  });

  it('move a pause the scene has, and leave the project it was given alone', () => {
    const project = helloWithMarks();
    const copy = structuredClone(project);
    const edit = sceneEdits(project).find((e) => e.title.startsWith('Move pause 1'))!;
    expect(edit.title).toMatch(/^Move pause 1 from 1\.50 s to \d+\.\d\d s$/);
    const moved = edit.apply(project).slides!.marks[0]!.time;
    expect(moved).not.toBe(1.5);
    expect(project).toEqual(copy);
  });
});

describe('the scripts the guide shows', () => {
  /** The scenes the scripts are run in: with pauses, long, with a camera, with braces. */
  const cases: [string, () => Project][] = [
    ['hello.mfe.json', helloWithMarks],
    [
      'completing-the-square.mfe.json',
      () => rendered.get('completing-the-square.mfe.json')!.project,
    ],
    ['completing-the-square.mfe.json', squareWithMarks],
    ['camera.mfe.json', () => rendered.get('camera.mfe.json')!.project],
    ['braces.mfe.json', () => rendered.get('braces.mfe.json')!.project],
  ];

  it.each(cases)(
    'run in the page of %s as written, and do what they say',
    async (name, make) => {
      const project = make();
      const files = packedOf(name, project);
      const guide = textOf(files, 'AGENTS.md');
      const examples = codeExamples(project, sceneName(project));
      // The pause's own only when the scene has pauses.
      expect(examples.map((example) => example.id)).toEqual(
        project.slides ? ['pulse', 'flash', 'label', 'waiting'] : ['pulse', 'flash', 'label'],
      );
      // Every script of the guide is one of these, word for word.
      expect(blocks(guide, 'js')).toEqual(
        examples.map((example) => example.code.replace(/\n$/, '')),
      );
      for (const example of examples) {
        const page: FolderPage = await folderPage(textOf(files, 'index.html'), [
          textOf(files, 'mfe-runtime.js'),
          textOf(files, 'glyphs.js'),
          textOf(files, 'scene.js'),
          example.code,
        ]);
        expect(page.errors, example.id).toEqual([]);
        const deck = page.mfe.decks[0]!;
        const above = deck.layer('above')!;
        const [from, to] = example.times as [number, number];
        if (example.id === 'pulse') {
          const group = deck.clip(example.clip)!;
          const scale = () => Number(/scale\(([\d.]+)\)/.exec(group.style.transform)?.[1]);
          deck.seek((from + to) / 2);
          expect(scale()).toBeCloseTo(1.15, 6);
          deck.seek(to + 0.5);
          expect(scale()).toBe(1);
          deck.seek(from - 0.1);
          expect(scale()).toBe(1);
        } else if (example.id === 'flash') {
          const ring = above.querySelector('circle')!;
          deck.seek(from + 0.1);
          const opacity = Number(ring.getAttribute('opacity'));
          expect(opacity).toBeGreaterThan(0);
          expect(opacity).toBeLessThan(1);
          expect(Number(ring.getAttribute('r'))).toBeGreaterThan(0);
          deck.seek(from - 0.2);
          expect(ring.getAttribute('opacity')).toBe('0');
          deck.seek(to + 0.2);
          expect(ring.getAttribute('opacity')).toBe('0');
        } else if (example.id === 'label') {
          const label = above.querySelector('text')!;
          deck.seek(to + 0.1);
          expect(label.getAttribute('opacity')).toBe('1');
          const box = deck.box(example.clip, from)!;
          expect(Number(label.getAttribute('x'))).toBeGreaterThan(box.x + box.width);
          deck.seek(Math.max(0, from - 0.3));
          expect(label.getAttribute('opacity')).toBe('0');
        } else {
          const group = deck.clip(example.clip)!;
          const waiting = () => group.classList.contains('is-waiting');
          // At its pause, and at no other; not just after it, nor on the way through it.
          const [time] = example.times as [number];
          for (const pause of deck.pauses) {
            deck.seek(pause.time);
            expect(waiting(), `${pause.time}`).toBe(Math.abs(pause.time - time) < 1e-6);
          }
          deck.seek(time + 0.3);
          expect(waiting()).toBe(false);
          // Drawn there: the clip has glyphs of its own on screen at that instant.
          expect(
            clipsDrawnAt(project, time).has(
              project.clips.find((clip) => deck.clip(clip.id) === group)!.id,
            ),
          ).toBe(true);
          expect(example.css).toContain(`[data-clip="${example.clip}"].is-waiting`);
          // Opened at the pause, before anything happens.
          const opened = await folderPage(
            textOf(files, 'index.html'),
            [
              textOf(files, 'mfe-runtime.js'),
              textOf(files, 'glyphs.js'),
              textOf(files, 'scene.js'),
              example.code,
            ],
            `?start=${time}`,
          );
          expect(opened.errors).toEqual([]);
          expect(opened.mfe.decks[0]!.clip(example.clip)!.classList.contains('is-waiting')).toBe(
            true,
          );
        }
      }
    },
    60_000,
  );

  it('type-check against the folder’s own types', () => {
    const files = packedOf('hello.mfe.json', helloWithMarks());
    const guide = textOf(files, 'AGENTS.md');
    const scripts = blocks(guide, 'js');
    expect(scripts).toHaveLength(4);
    const sources: Record<string, string> = {
      'types/mfe.d.ts': textOf(files, 'types/mfe.d.ts'),
      'types/scene.d.ts': textOf(files, 'types/scene.d.ts'),
    };
    scripts.forEach((script, k) => {
      sources[`custom${k}.js`] =
        `// @ts-check\n/// <reference path="types/mfe.d.ts" />\n${script}\n`;
    });
    expect(typeCheck(sources)).toEqual([]);
  });

  it('style a clip the scene has, by its name', () => {
    const guide = textOf(packedOf('braces.mfe.json'), 'AGENTS.md');
    const scripts = guide.slice(guide.indexOf('### 5.1'), guide.indexOf('## 6.'));
    const css = blocks(scripts, 'css');
    expect(css.length).toBeGreaterThanOrEqual(1);
    for (const block of css) {
      expect(block.split('{').length).toBe(block.split('}').length);
      expect(block).toMatch(/\[data-clip="sum"\]/);
    }
  });
});

describe('what the guide reads off a comment', () => {
  it('names the clips its words name, whole', () => {
    const names = ['equation', 'quadratic_formula', 'eq', 'steps_2', 'title'];
    expect(namesIn('Pulse the equation, then the quadratic formula.', names)).toEqual([
      'equation',
      'quadratic_formula',
    ]);
    expect(namesIn('the equations; eq; subtitle; Steps 2', names)).toEqual(['steps_2']);
  });

  it('for the trial’s scene, pulses `steps` at the pause the comment shares, not `equation`', () => {
    const project = squareWithMarks();
    const waiting = codeExamples(project, sceneName(project)).find(
      (example) => example.id === 'waiting',
    )!;
    expect(waiting.clip).toBe('steps');
    expect(waiting.times).toEqual([4.6]);
    expect(waiting.code).toContain('deck.atPause === 1);\n');
    expect(waiting.title).toBe('`steps` pulses while the deck stands at pause 2 (4.60 s)');
    // A comment that names a clip drawn there has it.
    project.slides!.marks[2]!.text = 'make the title pulse';
    const named = codeExamples(project, sceneName(project)).find(
      (example) => example.id === 'waiting',
    )!;
    expect(named.clip).toBe('title');
  });
});

describe('the stylesheet’s contract, read off its text', () => {
  it('takes the custom properties of the deck’s element, with their comments, and the classes', () => {
    const css = `/* Head: .mfe-not-a-class in a comment. */
.mfe-deck {
  /* The accent: buttons and the timeline. */
  --mfe-accent: #4ad6a0;
  --mfe-radius:
    8px;
  color: red;
}
.mfe-deck[data-theme="dark"], .other .mfe-deck {
  --mfe-accent: #2b8;
  --mfe-bar-background: rgb(0 0 0 / 60%);
}
.mfe-deck .mfe-bar { --mfe-local: 1px; content: "a; b { c }"; }
@media (prefers-color-scheme: dark) {
  .mfe-deck:not([data-theme="light"]) { --mfe-dark-only: #000; }
}
@container (width < 400px) { .mfe-deck .mfe-time { display: none } }
@keyframes mfe-spin { from { opacity: 0 } to { opacity: 1 } }
.mfe-deck .mfe-play:focus-visible, .mfe-deck .mfe-next { outline: 2px solid var(--mfe-accent) }
.mfe-page {
  /* Around the deck. */
  --mfe-page-background: #111;
}
.mfe-page .mfe-deck { --mfe-page-chrome: 0px; --mfe-accent: #f00; }
.mfe-deck:where(:not([data-theme], .mfe-page > *)) { --mfe-system: #fff; }
`;
    const contract = cssContract(css);
    expect(contract.properties).toEqual([
      { name: '--mfe-accent', value: '#4ad6a0', note: 'The accent: buttons and the timeline.' },
      { name: '--mfe-radius', value: '8px', note: '' },
      { name: '--mfe-bar-background', value: 'rgb(0 0 0 / 60%)', note: '' },
      { name: '--mfe-dark-only', value: '#000', note: '' },
      { name: '--mfe-system', value: '#fff', note: '' },
    ]);
    // The scene's own page's, apart: on .mfe-page, and on its deck.
    expect(contract.pageProperties).toEqual([
      { name: '--mfe-page-background', value: '#111', note: 'Around the deck.' },
      { name: '--mfe-page-chrome', value: '0px', note: '' },
      { name: '--mfe-accent', value: '#f00', note: '' },
    ]);
    expect(contract.classes).toEqual([
      'mfe-bar',
      'mfe-deck',
      'mfe-next',
      'mfe-page',
      'mfe-play',
      'mfe-time',
    ]);
    expect(cssContract('')).toEqual({ properties: [], pageProperties: [], classes: [] });
  });
});

describe('the Markdown of the guide', () => {
  it('wraps paragraphs and list items, a code span whole, and leaves code and tables alone', () => {
    const long = `${'word '.repeat(30)}\`a code span with spaces\` end`;
    const text = wrapMarkdown(
      [long, `- ${long}`, `1. ${long}`, `   > ${long}`, `| ${long} |`, '```js', long, '```'],
      60,
    );
    const lines = text.split('\n');
    expect(
      lines.filter((line) => line.length > 60 && !line.startsWith('|') && line !== long),
    ).toEqual([]);
    expect(text).toContain('`a code span with spaces`');
    expect(lines).toContain(long); // in the code block
    expect(lines.some((line) => line.startsWith('  word'))).toBe(true); // a list item's lines
    expect(lines.some((line) => line.startsWith('   word'))).toBe(true); // a numbered item's
    expect(lines.filter((line) => line.startsWith('   > ')).length).toBeGreaterThan(1);
  });
});

describe('README.md and CLAUDE.md', () => {
  it('give a person the folder on one screen, and Claude Code the guide', () => {
    const files = packedOf('hello.mfe.json');
    const readme = textOf(files, 'README.md');
    expect(readme.startsWith('# Hello: one-to-one\n')).toBe(true);
    for (const name of [
      'index.html',
      'embed-example.html',
      'player.css',
      'AGENTS.md',
      'node check.mjs',
      'LICENSES.txt',
      'custom.js',
      'data-notes="off"',
    ])
      expect(readme).toContain(`\`${name}\``);
    expect(readme).not.toContain('four tags');
    expect(readme.split('\n').length).toBeLessThanOrEqual(40);
    expect(readme.split('\n').every((line) => line.length <= 100)).toBe(true);
    expect(textOf(files, 'CLAUDE.md')).toBe('@AGENTS.md\n');
  });
});
