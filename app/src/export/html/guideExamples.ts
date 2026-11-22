/* The examples of the guide of an exported folder (`AGENTS.md`, `agentGuide.ts`), made for the scene
 * in hand so that they name its clips, its glyphs and its times, and right by construction:
 *
 *   - **edits of `scene.js`**: each a value of the project with where it goes, chosen among
 *     candidates so that the project it makes has no problem the scene did not have
 *     (`validateProject`) — an Indicate on two glyphs, another intro, a pause, a colour;
 *   - **code for `custom.js`**: each a whole script that runs as written in the folder's page,
 *     against `window.MFE` — a pulse, a flash when the result appears, a label beside a clip,
 *     a clip that pulses while the deck stands at a pause (the one an author's comment shares its
 *     instant with, and a clip drawn there) —, and the CSS that goes with it.
 *
 * `__tests__/agentGuide.test.ts` applies every edit and runs every script in the page. Pure. */
import {
  clipLifetimes,
  createEmphasis,
  exportedMarks,
  exportedPauses,
  introsOf,
  markStanding,
  pauseZones,
  sceneDuration,
  TIME_EPSILON,
  validateProject,
  type Clip,
  type ClipId,
  type IntroKind,
  type Project,
} from '../../model';
import { clipNames } from '../../deck/names';
import { readableJson } from './readableJson';
import { seconds } from './timelineWords';

/** An edit of the scene file: a value, where it goes, and the project it makes. */
export interface SceneEdit {
  /** What it does, as a heading says it. */
  title: string;
  /** Where the value goes, in a sentence. */
  where: string;
  /** The value, as JSON the scene file holds. */
  json: string;
  /** The project with the edit made (a copy). */
  apply(project: Project): Project;
}

/** A script for `custom.js`, with what it does, and the CSS it needs when it needs some. */
export interface CodeExample {
  id: 'pulse' | 'flash' | 'label' | 'waiting';
  title: string;
  /** What it shows, in a sentence. */
  about: string;
  code: string;
  css?: string;
  /** The clip it is about, and the instants it acts at, for whoever checks it. */
  clip: string;
  times: number[];
}

/** The clips that have a glyph of their own drawn at `time`: all in by then, and not gone (a glyph
 * in flight between two clips is its transfer's, not a clip's). At an instant where the scene
 * rests — a mark's — what appears or goes at once there has done so already. */
export function clipsDrawnAt(project: Project, time: number): Set<ClipId> {
  const duration = sceneDuration(project);
  const atEnd = time >= duration - TIME_EPSILON;
  const drawn = new Set<ClipId>();
  for (const [id, life] of clipLifetimes(project)) {
    for (const stints of life.stints.values()) {
      const shown = stints.some(
        ({ enter, exit }) =>
          enter.end <= time + TIME_EPSILON &&
          (time < exit.end - TIME_EPSILON || (atEnd && exit.end >= duration - TIME_EPSILON)),
      );
      if (shown) {
        drawn.add(id);
        break;
      }
    }
  }
  return drawn;
}

/** Those of `names` (the clips' names) that the words of `text` name: a name as a word, its `_` as
 * spaces (`quadratic_formula`, “quadratic formula”). A name shorter than three letters is too
 * common a word to tell, and left out. */
export function namesIn(text: string, names: Iterable<string>): string[] {
  const words = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  return [...names].filter(
    (name) => name.length >= 3 && words.includes(` ${name.toLowerCase().replace(/_/g, ' ')} `),
  );
}

/** Times as the examples write them: hundredths. */
const at = (time: number) => Math.round(time * 100) / 100;

/** What `validateProject` says of a project, as words that can be compared. */
const issuesOf = (project: Project) =>
  new Set(
    validateProject(project).map((issue) => `${issue.severity}|${issue.code}|${issue.message}`),
  );

/** Whether `after` has no problem that `before` did not have. */
function noWorse(before: Set<string>, after: Project): boolean {
  for (const issue of issuesOf(after)) if (!before.has(issue)) return false;
  return true;
}

interface Named {
  clip: Clip;
  index: number;
  name: string;
}

/** The clips with their names, in the order they start. */
function namedClips(project: Project): Named[] {
  const names = clipNames(project);
  return [...names].map(([id, name]) => {
    const index = project.clips.findIndex((clip) => clip.id === id);
    return { clip: project.clips[index]!, index, name };
  });
}

const glyphCount = (project: Project, clip: Clip) =>
  project.formulas.find((formula) => formula.id === clip.formulaId)?.snapshot?.glyphs.length ?? 0;

/** When a clip is all in: the end of its intro and of the relations that bring glyphs into it at
 * its start, whichever is later. */
export function settledAt(project: Project, clip: Clip): number {
  let time = clip.start + (clip.intro.kind === 'none' ? 0 : clip.intro.duration);
  for (const relation of project.relations) {
    if (relation.toClipId !== clip.id || relation.offset > TIME_EPSILON) continue;
    time = Math.max(time, clip.start + relation.offset + relation.duration);
  }
  return Math.min(time, clip.end);
}

/** When a clip starts to go: its outro, or its end. */
const leavingAt = (clip: Clip) => clip.end - (clip.outro.kind === 'none' ? 0 : clip.outro.duration);

/** The project with a block added to a clip, kept in the order of the blocks' starts. */
function withAction(project: Project, clipIndex: number, action: Clip['actions'][number]): Project {
  const copy = structuredClone(project);
  const actions = copy.clips[clipIndex]!.actions;
  const before = actions.findIndex((other) => other.start > action.start);
  actions.splice(before < 0 ? actions.length : before, 0, structuredClone(action));
  return copy;
}

/** An Indicate on two glyphs of a clip that is on screen, at an instant the scene rests. */
function indicateEdit(project: Project, base: Set<string>): SceneEdit | null {
  const zones = pauseZones(project);
  for (const { clip, index, name } of namedClips(project)) {
    const count = glyphCount(project, clip);
    const formula = project.formulas.find((f) => f.id === clip.formulaId)!;
    if (count < 2 || !['math', 'tex', 'text'].includes(formula.kind)) continue;
    const glyphs = count >= 5 ? [3, 4] : [count - 2, count - 1];
    const from = settledAt(project, clip);
    const to = leavingAt(clip);
    // A whole second where there is one, else the longest stretch there is.
    const candidates = zones
      .map((zone) => {
        const start = at(Math.max(zone.start, from));
        return { start, duration: at(Math.min(1, Math.min(zone.end, to) - start)) };
      })
      .filter((candidate) => candidate.duration >= 0.3)
      .sort((a, b) => b.duration - a.duration || a.start - b.start);
    for (const { start, duration } of candidates) {
      const action = {
        ...createEmphasis(at(start - clip.start), 'indicate', glyphs, { duration }),
        id: 'my-indicate',
      };
      const apply = (p: Project) => withAction(p, index, action);
      if (!noWorse(base, apply(project))) continue;
      const position = apply(project).clips[index]!.actions.findIndex((a) => a.id === action.id);
      const labels = glyphs.map((g) => `“${formula.snapshot?.glyphs[g]?.label ?? '?'}”`);
      return {
        title:
          `Add an Indicate on glyphs ${glyphs.join(' and ')} (${labels.join(', ')}) of ` +
          `\`${name}\` at ${seconds(start)} s`,
        where:
          `Insert it as \`clips[${index}].actions[${position}]\` (the blocks are kept in the order ` +
          `of their \`start\`, which counts from the clip's start, ${seconds(clip.start)} s):`,
        json: readableJson(action),
        apply,
      };
    }
  }
  return null;
}

/** Another intro for a clip that comes in with one. */
function introEdit(project: Project, base: Set<string>): SceneEdit | null {
  for (const { clip, index, name } of namedClips(project)) {
    if (clip.intro.kind === 'none' || clip.intro.duration <= TIME_EPSILON) continue;
    const formula = project.formulas.find((f) => f.id === clip.formulaId)!;
    const choices: IntroKind[] = ['fade_in', 'grow_from_center', 'write', 'create'];
    for (const kind of choices.filter((k) => k !== clip.intro.kind)) {
      if (!introsOf(formula).includes(kind)) continue;
      const intro = { ...clip.intro, kind, ...(kind === 'fade_in' ? { shift: [0, 0.5] } : {}) };
      const apply = (p: Project) => {
        const copy = structuredClone(p);
        copy.clips[index]!.intro = structuredClone(intro) as Clip['intro'];
        return copy;
      };
      if (!noWorse(base, apply(project))) continue;
      return {
        title: `Bring \`${name}\` in with \`${kind}\` instead of \`${clip.intro.kind}\``,
        where:
          `Replace \`clips[${index}].intro\` (same duration, so nothing else moves` +
          (kind === 'fade_in' ? '; it rises by `shift`, half a unit, as it fades in' : '') +
          '):',
        json: readableJson(intro),
        apply,
      };
    }
  }
  return null;
}

/** The middle of the longest stretch at which the scene rests, past its first animation. */
function restingTime(project: Project, not: readonly number[] = []): number | null {
  const duration = sceneDuration(project);
  const zones = pauseZones(project)
    .filter((zone) => zone.start > TIME_EPSILON && zone.end < duration - TIME_EPSILON)
    .filter((zone) => zone.end - zone.start > 0.1)
    .sort((a, b) => b.end - b.start - (a.end - a.start));
  for (const zone of zones) {
    const time = at((zone.start + zone.end) / 2);
    if (markStanding(project, { time }) !== 'standing') continue;
    if (not.some((other) => Math.abs(other - time) < 0.05)) continue;
    return time;
  }
  return null;
}

/** A pause added — or, when the scene has some, one moved. */
function pauseEdit(project: Project, base: Set<string>): SceneEdit | null {
  const pauses = exportedPauses(project);
  const time = restingTime(
    project,
    pauses.map((pause) => pause.time),
  );
  if (time === null) return null;
  const first = pauses[0];
  if (first) {
    const index = project.slides!.marks.indexOf(first);
    const apply = (p: Project) => {
      const copy = structuredClone(p);
      copy.slides!.marks[index]!.time = time;
      return copy;
    };
    if (!noWorse(base, apply(project))) return null;
    return {
      title: `Move pause 1 from ${seconds(first.time)} s to ${seconds(time)} s`,
      where:
        `Set \`slides.marks[${index}].time\` (a mark must stand where nothing animates: ` +
        'the head of scene.js lists what runs when):',
      json: readableJson(time),
      apply,
    };
  }
  const mark = { id: 'my-pause', time, kind: 'pause' as const, text: 'Ask the room' };
  const apply = (p: Project) => {
    const copy = structuredClone(p);
    copy.slides = { marks: [...(copy.slides?.marks ?? []), structuredClone(mark)] };
    return copy;
  };
  if (!noWorse(base, apply(project))) return null;
  return {
    title: `Add a pause at ${seconds(time)} s, with a note for the presenter`,
    where: project.slides
      ? `Append it to \`slides.marks\` (a mark must stand where nothing animates):`
      : 'Add `"slides"` as the last field of the project, with the mark in its list (a mark ' +
        'must stand where nothing animates):',
    json: project.slides ? readableJson(mark) : readableJson({ slides: { marks: [mark] } }),
    apply,
  };
}

/** A glyph of a formula given a colour of its own. */
function colourEdit(project: Project, base: Set<string>): SceneEdit | null {
  for (const { clip, name } of namedClips(project)) {
    const fi = project.formulas.findIndex((f) => f.id === clip.formulaId);
    const formula = project.formulas[fi]!;
    if (!['math', 'tex', 'text'].includes(formula.kind) || glyphCount(project, clip) < 1) continue;
    const glyphColors = { ...formula.glyphColors, '0': '#FFD166' };
    const apply = (p: Project) => {
      const copy = structuredClone(p);
      copy.formulas[fi]!.glyphColors = { ...glyphColors };
      return copy;
    };
    if (!noWorse(base, apply(project))) continue;
    return {
      title: `Colour glyph 0 of \`${formula.name}\` yellow`,
      where:
        `Set \`formulas[${fi}].glyphColors\` (by glyph index; \`${name}\` and every other clip ` +
        'of the formula take it):',
      json: readableJson(glyphColors),
      apply,
    };
  }
  return null;
}

/** The edits of the guide for `project`, those that could be made right. */
export function sceneEdits(project: Project): SceneEdit[] {
  const base = issuesOf(project);
  return [
    indicateEdit(project, base),
    introEdit(project, base),
    pauseEdit(project, base),
    colourEdit(project, base),
  ].filter((edit): edit is SceneEdit => edit !== null);
}

/** The opening of every script: the deck of the scene, once the page has mounted it. */
const opening = (scene: string) =>
  "document.addEventListener('DOMContentLoaded', () => {\n" +
  `  const deck = MFE.mount('.mfe-deck[data-scene="${scene}"]');\n`;

/** The scripts of the guide for the scene registered as `scene`. */
export function codeExamples(project: Project, scene: string): CodeExample[] {
  const clips = namedClips(project);
  if (clips.length === 0) return [];
  const first = clips[0]!;
  const last = [...clips].sort((a, b) => a.clip.start - b.clip.start).at(-1)!;
  const examples: CodeExample[] = [];

  // A pulse of the first clip once it is in.
  const pulseAt = at(settledAt(project, first.clip) + 0.2);
  examples.push({
    id: 'pulse',
    title: `A pulse of \`${first.name}\` at ${seconds(pulseAt)} s`,
    about:
      'An animation of your own is a function of the scene’s time: `update` gets the eased ' +
      'progress, here up and back down again (`there_and_back`), and the deck calls it on every ' +
      'frame it draws, so it is right after a seek too.',
    code:
      opening(scene) +
      `  const group = deck.clip('${first.name}');\n` +
      '  if (!group) return;\n' +
      "  group.style.transformBox = 'fill-box'; // scale about its own centre\n" +
      "  group.style.transformOrigin = 'center';\n" +
      '  deck.animate({\n' +
      `    from: ${pulseAt},\n` +
      `    to: ${at(pulseAt + 0.8)},\n` +
      "    ease: 'there_and_back',\n" +
      '    update(progress) {\n' +
      "      group.style.transform = 'scale(' + (1 + 0.15 * progress) + ')';\n" +
      '    },\n' +
      '  });\n' +
      '});\n',
    clip: first.name,
    times: [pulseAt, at(pulseAt + 0.8)],
  });

  // A flash when the last clip has come in.
  const flashAt = at(settledAt(project, last.clip));
  examples.push({
    id: 'flash',
    title: `A flash when \`${last.name}\` has come in, at ${seconds(flashAt)} s`,
    about:
      'A circle of your own in the layer above the scene, placed with `deck.box` (stage units, ' +
      'y down), growing and fading as the progress goes from 0 to 1.',
    code:
      opening(scene) +
      "  const layer = deck.layer('above');\n" +
      `  const box = deck.box('${last.name}', ${flashAt});\n` +
      '  if (!layer || !box) return;\n' +
      "  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');\n" +
      "  ring.setAttribute('cx', String(box.cx));\n" +
      "  ring.setAttribute('cy', String(box.cy));\n" +
      "  ring.setAttribute('fill', 'none');\n" +
      "  ring.setAttribute('stroke', '#FFD166');\n" +
      "  ring.setAttribute('stroke-width', '0.04');\n" +
      '  layer.append(ring);\n' +
      '  const size = Math.max(box.width, box.height);\n' +
      '  deck.animate({\n' +
      `    from: ${flashAt},\n` +
      `    to: ${at(flashAt + 0.6)},\n` +
      "    ease: 'rush_from',\n" +
      '    update(progress) {\n' +
      "      ring.setAttribute('r', String(size * (0.4 + 0.5 * progress)));\n" +
      '      const running = progress > 0 && progress < 1; // 0 before, 1 after\n' +
      "      ring.setAttribute('opacity', running ? String(1 - progress) : '0');\n" +
      '    },\n' +
      '  });\n' +
      '});\n',
    clip: last.name,
    times: [flashAt, at(flashAt + 0.6)],
  });

  // A label beside the first clip, from when it is in.
  const labelAt = at(settledAt(project, first.clip));
  examples.push({
    id: 'label',
    title: `A label beside \`${first.name}\`, from ${seconds(labelAt)} s`,
    about:
      'Text of your own in the layer above, to the right of the clip’s box as it is at ' +
      `${seconds(labelAt)} s, fading in. Its size is in scene units (the frame is 8 tall). It stays ` +
      'where it was put: if the clip moves later, measure it again then.',
    code:
      opening(scene) +
      "  const layer = deck.layer('above');\n" +
      `  const box = deck.box('${first.name}', ${labelAt});\n` +
      '  if (!layer || !box) return;\n' +
      "  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');\n" +
      "  label.textContent = '← look here';\n" +
      "  label.setAttribute('x', String(box.x + box.width + 0.3));\n" +
      "  label.setAttribute('y', String(box.cy));\n" +
      "  label.setAttribute('dominant-baseline', 'middle');\n" +
      "  label.setAttribute('font-size', '0.4');\n" +
      "  label.setAttribute('fill', '#FFD166');\n" +
      '  layer.append(label);\n' +
      '  deck.animate({\n' +
      `    from: ${labelAt},\n` +
      `    to: ${at(labelAt + 0.5)},\n` +
      '    update(progress) {\n' +
      "      label.setAttribute('opacity', String(progress));\n" +
      '    },\n' +
      '  });\n' +
      '});\n',
    clip: first.name,
    times: [labelAt, at(labelAt + 0.5)],
  });

  // A clip that pulses while the deck stands at a pause: CSS, switched on by a class. The pause
  // an author's comment shares its instant with, else the first; a clip drawn there, the one the
  // comment's words name if one is, else the last to start.
  const pauses = exportedPauses(project);
  const comments = exportedMarks(project).filter(
    (mark) => mark.kind === 'comment' && mark.text?.trim(),
  );
  const near = (a: number, b: number) => Math.abs(a - b) <= TIME_EPSILON;
  const pause = pauses.find((p) => comments.some((c) => near(c.time, p.time))) ?? pauses[0];
  if (pause) {
    const drawn = clipsDrawnAt(project, pause.time);
    const candidates = [...clips].reverse().filter(({ clip }) => drawn.has(clip.id));
    const named = comments
      .filter((comment) => near(comment.time, pause.time))
      .flatMap((comment) =>
        namesIn(
          comment.text!,
          candidates.map(({ name }) => name),
        ),
      );
    const waiting = candidates.find(({ name }) => named.includes(name)) ?? candidates[0];
    const index = pauses.indexOf(pause);
    if (waiting) {
      examples.push({
        id: 'waiting',
        title:
          `\`${waiting.name}\` pulses while the deck stands at pause ${index + 1} ` +
          `(${seconds(pause.time)} s)`,
        about:
          'Time stands still at a pause, so what moves then is a CSS animation on the clip’s ' +
          `group, switched on by a class while \`deck.atPause\` is ${index}, the pause’s index in ` +
          `\`deck.pauses\`. \`${waiting.name}\` is a clip drawn at that instant.`,
        code:
          opening(scene) +
          `  const group = deck.clip('${waiting.name}');\n` +
          '  if (!group) return;\n' +
          `  const update = () => group.classList.toggle('is-waiting', deck.atPause === ${index});\n` +
          "  deck.on('change', update);\n" +
          `  update(); // it may stand there already (index.html?start=${at(pause.time)})\n` +
          '});\n',
        css:
          '@media (prefers-reduced-motion: no-preference) {\n' +
          `  .mfe-deck [data-clip="${waiting.name}"].is-waiting {\n` +
          '    transform-box: fill-box;\n' +
          '    transform-origin: center;\n' +
          '    animation: my-waiting 0.9s ease-in-out infinite alternate;\n' +
          '  }\n' +
          '}\n' +
          '@keyframes my-waiting {\n' +
          '  to {\n' +
          '    transform: scale(1.06);\n' +
          '  }\n' +
          '}\n',
        clip: waiting.name,
        times: [pause.time],
      });
    }
  }
  return examples;
}

/** A custom property the stylesheet declares on the deck's element. */
export interface CssProperty {
  name: string;
  /** Its value where it is first declared. */
  value: string;
  /** The comment just before it, on one line; empty when there is none. */
  note: string;
}

export interface CssContract {
  /** Those declared on the deck's element, wherever it is. */
  properties: CssProperty[];
  /** Those declared for the scene's own page (`index.html`): on `.mfe-page`, or on its deck. */
  pageProperties: CssProperty[];
  /** Every class of the `mfe-` prefix the stylesheet's selectors name, sorted. */
  classes: string[];
}

/** What a stylesheet offers whoever restyles a deck, read off its text: the custom properties of
 * the `--mfe-` prefix declared on the deck's element itself (a selector whose last part is
 * `.mfe-deck`, themed or not, in an at-rule or not) and, apart, those declared for the scene's own
 * page (a selector that starts with `.mfe-page`), each with the comment before it, and the classes
 * its selectors name. Any stylesheet: what it does not have is not listed. */
export function cssContract(css: string): CssContract {
  const properties = new Map<string, CssProperty>();
  const pageProperties = new Map<string, CssProperty>();
  const classes = new Set<string>();
  const stack: string[] = [];
  let buffer = '';
  let note = '';
  /** The selectors of a rule's prelude, what is in parentheses (`:where(…)`) left out. */
  const selectors = (prelude: string): string[] => {
    if (prelude.startsWith('@')) return [];
    let bare = prelude;
    while (/\([^()]*\)/.test(bare)) bare = bare.replace(/\([^()]*\)/g, '');
    return bare.split(',').map((selector) => selector.trim());
  };
  const onPage = (prelude: string) =>
    selectors(prelude).some((selector) => /^\.mfe-page(?![\w-])/.test(selector));
  const onDeck = (prelude: string) =>
    selectors(prelude).some((selector) => {
      const parts = selector.split(/\s*[\s>+~]\s*/);
      return /\.mfe-deck(?![\w-])/.test(parts.at(-1) ?? '');
    });
  const declaration = (text: string) => {
    const prelude = stack.at(-1);
    const match = /^(--mfe-[\w-]+)\s*:\s*([\s\S]*)$/.exec(text.trim());
    const into =
      prelude === undefined || !match
        ? null
        : onPage(prelude)
          ? pageProperties
          : onDeck(prelude)
            ? properties
            : null;
    if (into && match && !into.has(match[1]!)) {
      into.set(match[1]!, {
        name: match[1]!,
        value: match[2]!
          .replace(/\s+/g, ' ')
          .replace(/\s*!important$/, '')
          .trim(),
        note,
      });
    }
    note = '';
  };
  let i = 0;
  while (i < css.length) {
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? css.length : end + 2;
      note = css
        .slice(i + 2, stop - 2)
        .replace(/\s*\n\s*\*?\s*/g, ' ')
        .trim();
      i = stop;
      continue;
    }
    const c = css[i]!;
    if (c === '"' || c === "'") {
      const end = css.indexOf(c, i + 1);
      const stop = end < 0 ? css.length : end + 1;
      buffer += css.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '{') {
      const prelude = buffer.trim().replace(/\s+/g, ' ');
      const inKeyframes = stack.some((open) => open.startsWith('@keyframes'));
      if (!prelude.startsWith('@') && !inKeyframes) {
        for (const match of prelude.matchAll(/\.(mfe-[\w-]+)/g)) classes.add(match[1]!);
      }
      stack.push(prelude);
      buffer = '';
      note = '';
    } else if (c === '}') {
      if (buffer.trim()) declaration(buffer);
      stack.pop();
      buffer = '';
      note = '';
    } else if (c === ';') {
      declaration(buffer);
      buffer = '';
    } else buffer += c;
    i++;
  }
  return {
    properties: [...properties.values()],
    pageProperties: [...pageProperties.values()],
    classes: [...classes].sort(),
  };
}
