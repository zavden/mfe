// @vitest-environment node
/* The timeline of a scene in words, as the head of its exported `scene.js` gives it: pinned for a
 * few examples (read and found right), and the rules it keeps — the order at one instant, the
 * marks an export carries, the names of the page, a text that cannot end the comment it is in. */
import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderedExample, type Rendered } from '../../../embed/__tests__/fixtures';
import type { Project, SlideMark } from '../../../model';
import { sceneFile } from '../packDeck';
import {
  clipLines,
  glyphLines,
  glyphList,
  shortText,
  timelineEntries,
  timelineWords,
} from '../timelineWords';

const PINNED = [
  'hello.mfe.json',
  'completing-the-square.mfe.json',
  'camera.mfe.json',
  'emphasis.mfe.json',
  'braces.mfe.json',
];

const rendered = new Map<string, Rendered>();
beforeAll(async () => {
  for (const name of PINNED) rendered.set(name, await renderedExample(name));
}, 120_000);

const projectOf = (name: string): Project => structuredClone(rendered.get(name)!.project);

/** The head comment of a scene file: up to the end of its first comment. */
const head = (text: string) => text.slice(0, text.indexOf('*/') + 2) + '\n';

/** `hello` with marks: the scene animates over [0, 1], [2, 3] and [3.2, 3.8] and [4, 5]. */
function helloWithMarks(): Project {
  const project = projectOf('hello.mfe.json');
  const marks: SlideMark[] = [
    { id: 'm1', time: 1.5, kind: 'pause', text: 'Ask the room' },
    { id: 'm2', time: 1.25, kind: 'comment', text: 'a flash over the m' },
    { id: 'm3', time: 0.5, kind: 'pause', text: 'under the intro: left out' },
    { id: 'm4', time: 3, kind: 'pause' },
    { id: 'm5', time: 3, kind: 'comment', text: 'end the comment */ here\nand a second line' },
    { id: 'm6', time: 3, kind: 'pause', text: 'a second pause at 3 s: left out' },
  ];
  project.slides = { marks };
  return project;
}

describe('the timeline in words', () => {
  it.each(PINNED)('of %s, at the head of its scene file', async (name) => {
    const { project } = rendered.get(name)!;
    await expect(head(sceneFile('x', project))).toMatchFileSnapshot(
      `__snapshots__/timeline/${name.replace('.mfe.json', '')}.txt`,
    );
  });

  it('of a scene with marks: the pauses numbered, the comments as notes, in their place', async () => {
    const project = helloWithMarks();
    await expect(head(sceneFile('x', project))).toMatchFileSnapshot(
      '__snapshots__/timeline/hello-marks.txt',
    );
    const lines = timelineWords(project);
    // At 3 s: f2's tween was before; a1's fade-out and the relation end there; the comment comes
    // before the pause, and the pause written twice is there once.
    const at3 = lines.filter((line) => line.startsWith('3.00 s'));
    expect(at3).toEqual([
      expect.stringContaining('NOTE · “end the comment */ here…”  slides.marks[4]'),
      expect.stringContaining('PAUSE 2  slides.marks[3]'),
    ]);
    expect(lines.join('\n')).not.toContain('left out');
    expect(lines).toContainEqual(expect.stringMatching(/^1\.25 s +NOTE · “a flash over the m”/));
    expect(lines).toContainEqual(expect.stringMatching(/^1\.50 s +PAUSE 1 · “Ask the room”/));
  });

  it('of a scene whose pauses skip their waits: each says where the page goes on from it', async () => {
    const project = projectOf('hello.mfe.json');
    // The rests: [1, 2], [3, 3.2], [3.8, 4] and the end, 5 s.
    project.slides = {
      marks: [
        { id: 's1', time: 1.5, kind: 'pause', text: 'Ask the room', skipWait: true },
        // Where the next animation starts: nothing to skip.
        { id: 's2', time: 3.2, kind: 'pause', skipWait: true },
        // Up to the next pause of its rest.
        { id: 's3', time: 3.85, kind: 'pause', skipWait: true },
        { id: 's4', time: 3.95, kind: 'pause' },
      ],
    };
    await expect(head(sceneFile('x', project))).toMatchFileSnapshot(
      '__snapshots__/timeline/hello-skip.txt',
    );
    const pauses = timelineWords(project).filter((line) => line.includes('PAUSE'));
    expect(pauses.map((line) => line.replace(/^\S+ s +/, ''))).toEqual([
      'PAUSE 1 (skips its wait to 2.00 s) · “Ask the room”  slides.marks[0]',
      'PAUSE 2  slides.marks[1]',
      'PAUSE 3 (skips its wait to 3.95 s)  slides.marks[2]',
      'PAUSE 4  slides.marks[3]',
    ]);
  });

  it('cannot be ended by a text it carries, and keeps its lines short', () => {
    const project = helloWithMarks();
    project.formulas[0]!.source = 'x */ y';
    project.formulas[0]!.name = 'a */ b';
    const text = sceneFile('x', project);
    expect(text.slice(0, text.indexOf('*/'))).toContain('AGENTS.md tells what each part means.');
    const seen: unknown[][] = [];
    runInNewContext(text, { MFE: { scene: (...args: unknown[]) => seen.push(args) } });
    expect(seen).toHaveLength(1);
    for (const line of head(text).split('\n')) expect(line.length).toBeLessThanOrEqual(100);
  });

  it('says what appears or goes without an animation, and moves of the camera', () => {
    const lines = timelineWords(projectOf('hello.mfe.json'));
    expect(lines).toContainEqual(expect.stringMatching(/^2\.00 s +f2 {2}appears {2}clips\[1\]$/));
    // a1 fades out and f2 lasts to the end: neither goes at once.
    expect(lines.join('\n')).not.toContain('goes');
    const camera = timelineEntries(projectOf('camera.mfe.json')).filter(
      (entry) => entry.kind === 'camera',
    );
    expect(camera.length).toBeGreaterThan(0);
    expect(camera.every((entry) => /^camera → /.test(entry.text))).toBe(true);
    expect(camera.every((entry) => /^camera\.moves\[\d+\]$/.test(entry.path))).toBe(true);
  });

  it('names a clip as the page does, and a second clip of a formula with a number', () => {
    const project = projectOf('hello.mfe.json');
    const copy = structuredClone(project.clips[0]!);
    copy.id = 'c_again';
    copy.start = 4;
    copy.end = 5;
    project.clips.push(copy);
    const lines = clipLines(project);
    expect(lines.map((line) => line.split(/\s+/)[0])).toEqual(['a1', 'f2', 'a1_2']);
    expect(lines[2]).toMatch(/^a1_2 +clips\[2\] +4\.00–5\.00 s +formulas\[0\] math “mx\+y=0”$/);
    expect(timelineWords(project)).toContainEqual(expect.stringMatching(/a1_2 {2}write/));
  });

  it('lists the glyphs of the formulas on screen by their indices', () => {
    const lines = glyphLines(projectOf('hello.mfe.json'));
    expect(lines[0]).toMatch(/^a1: {2}0 m {2}1 x {2}2 \+ {2}3 y {2}4 = {2}5 0$/);
    expect(glyphLines(projectOf('completing-the-square.mfe.json')).length).toBeGreaterThan(8);
    for (const line of glyphLines(projectOf('completing-the-square.mfe.json')))
      expect(line.length).toBeLessThanOrEqual(92);
  });
});

describe('the words of the timeline', () => {
  it('writes a list of glyphs short', () => {
    expect(glyphList('all')).toBe('all');
    expect(glyphList([])).toBe('[]');
    expect(glyphList([3, 4])).toBe('[3, 4]');
    expect(glyphList([0, 1, 2, 3, 5, 7, 8])).toBe('[0–3, 5, 7, 8]');
  });

  it('puts a text on one short line', () => {
    expect(shortText('Ask the room')).toBe('Ask the room');
    expect(shortText('  two   spaces ')).toBe('two spaces');
    expect(shortText('first\nsecond')).toBe('first…');
    expect(shortText('x'.repeat(70))).toBe(`${'x'.repeat(60)}…`);
    expect(shortText('')).toBe('');
  });
});
