// @vitest-environment node
/* The window of a relation in the player (`window.ts`) moves as the editor's does: every copy
 * gives what its original gives (`ui/relations/relationOps.ts`, `windowRange.ts`,
 * `relationPreview.ts`, `ui/time.ts`), for every relation of the repository's examples and many
 * edits of each — the limits of the clips, the shortest window, the timing errors an edit must not
 * add. */
import { describe, expect, it } from 'vitest';
import { parseProject, relationWindow, type Project } from '../../model';
import { EXAMPLES, readExample } from '../../test/examples';
import { MIN_WINDOW as APP_MIN, windowRange as appRange } from '../../ui/relations/relationOps';
import * as appPreview from '../../ui/relations/relationPreview';
import { clampWindow as appClamp } from '../../ui/relations/windowRange';
import { round6 as appRound6 } from '../../ui/time';
import * as own from '../window';

function project(name: string): Project {
  const parsed = parseProject(readExample(name));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.project;
}

describe('the window of a relation in the player', () => {
  it('has the editor’s shortest window and rounding', () => {
    expect(own.MIN_WINDOW).toBe(APP_MIN);
    for (const x of [0, -0, 1 / 3, -2.0000004, 1e-7, 12.3456789]) {
      expect(Object.is(own.round6(x), appRound6(x))).toBe(true);
    }
  });

  it('clamps every edit of every relation of the examples as the editor does', () => {
    let relations = 0;
    let edits = 0;
    let stopped = 0;
    for (const name of EXAMPLES) {
      const p = project(name);
      for (const relation of p.relations) {
        const from = p.clips.find((c) => c.id === relation.fromClipId)!;
        const to = p.clips.find((c) => c.id === relation.toClipId)!;
        expect(own.windowRange(from, to)).toEqual(appRange(from, to));
        relations++;
        const window = relationWindow(relation, to);
        const span = Math.max(from.end, to.end) - Math.min(from.start, to.start);
        for (const edit of ['move', 'start', 'end'] as const) {
          for (let k = -12; k <= 12; k++) {
            const shift = (k / 12) * span;
            const wanted =
              edit === 'move'
                ? { start: window.start + shift, end: window.end + shift }
                : edit === 'start'
                  ? { start: window.start + shift, end: window.end }
                  : { start: window.start, end: window.end + shift };
            const want = appClamp(p, relation.id, wanted, edit);
            expect(own.clampWindow(p, relation.id, wanted, edit), `${name} ${edit} ${k}`).toEqual(
              want,
            );
            edits++;
            if (want && (want.offset !== relation.offset || want.duration !== relation.duration)) {
              stopped++;
            }
          }
        }
      }
    }
    expect(relations).toBeGreaterThan(10);
    expect(edits).toBeGreaterThan(500);
    expect(stopped).toBeGreaterThan(100);
    const p = project('hello.mfe.json');
    expect(own.clampWindow(p, 'no-such', { start: 0, end: 1 }, 'move')).toBeNull();
  });

  it('loops the editor’s preview over the same span, frames and band', () => {
    for (const name of EXAMPLES) {
      const p = project(name);
      for (const relation of p.relations) {
        const from = p.clips.find((c) => c.id === relation.fromClipId)!;
        const to = p.clips.find((c) => c.id === relation.toClipId)!;
        const window = own.windowSpan(to, relation);
        expect(window).toEqual(appPreview.relationWindow(to, relation));
        const span = own.relationSpan(from, to, relation);
        expect(span).toEqual(appPreview.relationSpan(from, to, relation));
        expect(own.relationSpan(from, to, relation, 0.2)).toEqual(
          appPreview.relationSpan(from, to, relation, 0.2),
        );
        expect(own.framedTimes(span, window)).toEqual(appPreview.framedTimes(span, window));
        expect(own.windowBand(span, window)).toEqual(appPreview.windowBand(span, window));
        for (const t of [span.start, window.start, (window.start + window.end) / 2, span.end]) {
          expect(own.windowProgress(t, window)).toBe(appPreview.windowProgress(t, window));
        }
      }
    }
    expect(own.WINDOW_PAD).toBe(appPreview.WINDOW_PAD);
  });
});
