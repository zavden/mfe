// @vitest-environment node
/* The type files of an exported page's folder, made from the sources: they type-check as a
 * folder of their own, with code written against them; they hold the API and the model an
 * extender reads; and they refuse, saying why, what they could not say right. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mfeTypes, sceneTypes } from 'virtual:mfe-deck-runtime';
import { declaredNames, interfaceMembers, typeCheck } from '../../src/test/typeCheck';
import { DECK_INDEX, deckTypeFiles, MODEL_TYPES } from '../deckTypes';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
const source = (path: string) => readFileSync(`${SRC}${path}`, 'utf8');

/** `custom.js` as an extender writes it, checked against the types. */
const CLIENT = `// @ts-check
/// <reference path="types/mfe.d.ts" />
document.addEventListener('DOMContentLoaded', () => {
  const deck = MFE.mount('.mfe-deck');
  const group = deck.clip('eq1');
  if (group) group.classList.add('mine');
  const box = deck.box('eq1', 2);
  const layer = deck.layer('above');
  if (box && layer) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', String(box.cx));
    layer.append(dot);
  }
  const stop = deck.animate({
    from: 1,
    to: 2,
    ease: 'there_and_back',
    update(progress, time) {
      if (group) group.style.opacity = String(1 - progress / 2 + time * 0);
    },
  });
  deck.on('slide', () => console.log(deck.slide, deck.pauses.length, deck.comments));
  stop();
  window.MFE.rates.smooth(0.5);
  for (const report of MFE.check()) console.log(report.scene, report.problems[0]?.where);
});
`;

/** Code that reads the project with the scene's types. */
const SCENE_CLIENT = `import type { Clip, EmphasisAction, Project, SlideMark } from './types/scene';
import type { Deck } from './types/mfe';
export function marks(project: Project): SlideMark[] {
  return project.slides?.marks ?? [];
}
export function emphases(clip: Clip): EmphasisAction[] {
  return clip.actions.filter((a): a is EmphasisAction => a.kind === 'emphasis');
}
export const project = (deck: Deck): Project | null => deck.project;
`;

describe('the type files of the exported folder', () => {
  const made = deckTypeFiles();

  it('are what the app carries', () => {
    expect(mfeTypes).toBe(made.mfe);
    expect(sceneTypes).toBe(made.scene);
    expect(made.sources).toEqual(expect.arrayContaining([MODEL_TYPES, DECK_INDEX, 'deck/deck.ts']));
  });

  it('type-check as a folder of their own, and so does code written against them', () => {
    expect(
      typeCheck({
        'types/mfe.d.ts': mfeTypes,
        'types/scene.d.ts': sceneTypes,
        'custom.js': CLIENT,
        'client.ts': SCENE_CLIENT,
      }),
    ).toEqual([]);
  });

  it('see a mistake in code written against them', () => {
    const wrong = CLIENT.replace("deck.layer('above')", "deck.layer('top')").replace(
      'deck.animate({',
      'deck.animates({',
    );
    const problems = typeCheck({
      'types/mfe.d.ts': mfeTypes,
      'types/scene.d.ts': sceneTypes,
      'custom.js': wrong,
    });
    // The two mistakes, first; then what follows from the second (an update of no known type).
    expect(problems.slice(0, 2)).toEqual([
      expect.stringMatching(/^custom\.js:8: .*'"top"' is not assignable/),
      expect.stringMatching(/^custom\.js:14: .*'animates' does not exist/),
    ]);
  });

  it('hold the API of the runtime and the model, with their comments', () => {
    const api = declaredNames(mfeTypes);
    for (const name of [
      'MfeRuntime',
      'Deck',
      'DeckOptions',
      'DeckEvent',
      'AnimationSpec',
      'StageBox',
      'DeckPause',
      'DeckComment',
      'DeckProblem',
      'LayerName',
      'SceneCheck',
    ]) {
      expect(api.has(name), name).toBe(true);
    }
    // Every member of the runtime's object is declared, and only the API is there.
    expect(interfaceMembers(mfeTypes, 'MfeRuntime').sort()).toEqual(
      [
        'check',
        'decks',
        'glyphs',
        'glyphsVersion',
        'mount',
        'mountAll',
        'rates',
        'scene',
        'scenes',
        'version',
      ].sort(),
    );
    expect(api.has('DeckSource')).toBe(false);
    expect(api.has('SvgStage')).toBe(false);
    expect(mfeTypes).toContain('/** Go on: play to the next pause (as `play`, over the wait');
    expect(mfeTypes).toMatch(/`resume > time` tells such a pause\. \*\/\n\s+resume: number;/);
    expect(mfeTypes).toContain('version: 1;'); // typeof GLYPHS_VERSION, as its literal
    expect(mfeTypes).toMatch(/^import type \{[^}]*\bProject\b[^}]*\} from '\.\/scene';$/m);
    expect(mfeTypes).not.toMatch(/^import (?!type)/m);
    // The model as it is, with its comments, after a head of its own.
    expect(sceneTypes.startsWith('/* types/scene.d.ts')).toBe(true);
    // Its comments name files of the editor's source, which the folder has not: the head says so.
    expect(source(MODEL_TYPES)).toMatch(/`\w+\.ts`/);
    const head = sceneTypes.slice(0, sceneTypes.indexOf('*/')).replace(/\n \* ?/g, ' ');
    expect(head).toContain("name files of the editor's source");
    expect(head).toContain('which are not in this folder');
    expect(sceneTypes).toContain(source(MODEL_TYPES));
    const model = declaredNames(sceneTypes);
    for (const name of ['Project', 'Clip', 'ClipAction', 'EmphasisAction', 'SlideMark', 'Relation'])
      expect(model.has(name), name).toBe(true);
    for (const text of [mfeTypes, sceneTypes]) {
      expect(text.endsWith('\n')).toBe(true);
      expect(text.length).toBeLessThan(256 * 1024);
    }
  });

  it('refuse what they cannot say right, and say why', () => {
    const edited = (path: string, from: string, to: string) => (read: string) =>
      read === path ? source(path).replace(from, to) : source(read);
    expect(() =>
      deckTypeFiles(
        edited(MODEL_TYPES, 'export type Target', 'export const x = 1;\nexport type Target'),
      ),
    ).toThrow('must stay a file of declarations alone');
    expect(() =>
      deckTypeFiles(edited('deck/glyphFile.ts', 'typeof GLYPHS_VERSION', 'typeof packGlyphs')),
    ).toThrow('typeof packGlyphs, which is not a constant with a literal value');
    // A type of the model that is not in model/types.ts.
    const deckWith = (text: string) => (read: string) =>
      read === 'deck/deck.ts'
        ? source(read)
            .replace(/type Project,?\s*\} from/, 'type Project, type CoveredMark } from')
            .replace('readonly project: Project | null;', text)
        : source(read);
    expect(() => deckTypeFiles(deckWith('readonly covered: CoveredMark[];'))).toThrow(
      'uses CoveredMark of the model, which model/types.ts does not declare',
    );
    // A name nobody declares is taken for a global: the type-check is what sees it is not one.
    const unknown = deckTypeFiles(deckWith('readonly covered: Nowhere[];'));
    expect(typeCheck({ 'types/mfe.d.ts': unknown.mfe, 'types/scene.d.ts': unknown.scene })).toEqual(
      [expect.stringContaining("Cannot find name 'Nowhere'")],
    );
  });
});
