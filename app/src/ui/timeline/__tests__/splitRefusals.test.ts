// @vitest-environment node
/* How a split refuses clips (D169): every clip a check of the split project finds at fault is
 * refused in the same round, so that many refused clips cost a few rounds, not one each (audit
 * A2-02). A round builds, validates and draws the whole project: the number of validations counts
 * the rounds. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAppear,
  createAttach,
  createDisappear,
  createTrack,
  createTween,
  defaultIntro,
  defaultOutro,
} from '../../../model';
import { settleAttachments } from '../../../scene';
import { plainClip, sceneWith } from '../../../scene/__tests__/sceneKit';
import { planSplit } from '../splitClips';

const validations = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../../model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../model')>();
  return {
    ...actual,
    validateProject: (...args: Parameters<typeof actual.validateProject>) => {
      validations.count += 1;
      return actual.validateProject(...args);
    },
  };
});

beforeEach(() => {
  validations.count = 0;
});

/** `n` formulas, each moved by a Transform at 2 s, with a label attached to it at 1.5 s (before
 * it moved): the label's second half would be placed by the formula again, where it has moved
 * to, so every label is refused, and every formula then with it. */
async function movedHosts(n: number) {
  const s = await sceneWith({ a: 'x+y=z', b: 'w' });
  while (s.project.tracks.length < 2 * n)
    s.project.tracks.push(createTrack(`T${s.project.tracks.length}`));
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = plainClip(s, 'a', 2 * i, 0, 10, {
      intro: defaultIntro('write'),
      outro: defaultOutro('fade_out'),
    });
    a.actions.push(createAppear(6, 'fade_in', [4]), createTween(2, 1, { position: [0, 1] }));
    const label = plainClip(s, 'b', 2 * i + 1, 1.5, 9, { attach: createAttach(a.id, [0]) });
    ids.push(a.id, label.id);
  }
  s.project = settleAttachments(s.project, s.formulas);
  return { s, ids };
}

describe('a split of many clips that the checks refuse', () => {
  it('refuses them all in a few rounds, not one round each', async () => {
    const n = 12;
    const { s, ids } = await movedHosts(n);
    validations.count = 0;
    const plan = planSplit(s.project, ids, 5, { suffix: '_s', resolved: s.formulas });
    expect(plan.pieces).toEqual([]);
    expect(plan.refused).toHaveLength(2 * n);
    // The project before, and one round that builds the split: the labels are refused together
    // there, and their formulas in the next round, which stops before building anything.
    expect(validations.count).toBeLessThanOrEqual(3);
  });
});

describe('a clip placed by another clip at fault', () => {
  it('waits for the next round, which splits it without that one', async () => {
    // g, moved by a Transform at 2 s; f, a label placed on g at 1.5 s (before g moved); l, a
    // label placed on f at 1.6 s. Split at 5 s, f's second half would be placed on g again, where
    // it has moved to: f is at fault, and l, placed on f, draws otherwise only because of it.
    const s = await sceneWith({ g: 'x+y=z', f: 'w', l: 'v' });
    s.project.tracks.push(createTrack('Track 3'));
    const g = plainClip(s, 'g', 0, 0, 10);
    g.actions.push(createTween(2, 1, { position: [0, 1] }));
    const f = plainClip(s, 'f', 1, 1.5, 9, { attach: createAttach(g.id, [0]) });
    const l = plainClip(s, 'l', 2, 1.6, 9, { attach: createAttach(f.id, [0]) });
    s.project = settleAttachments(s.project, s.formulas);
    const plan = planSplit(s.project, [f.id, l.id], 5, { suffix: '_s', resolved: s.formulas });
    expect(plan.refused.map((r) => r.clipId)).toEqual([f.id]);
    expect(plan.refused[0]!.reason).toMatch(/attached to something that has moved/);
    // l alone hangs on f as it was placed: its second half looks as it does.
    expect(plan.pieces.map((p) => p.clipId)).toEqual([l.id]);
  });
});

describe('the reason given to a clip whose attached object was refused (A2-03)', () => {
  it('does not ask to select an object that was selected: it could not be split', async () => {
    // a, moved by a Transform at 2 s; b, a label placed on it at 1.5 s. Both selected and split
    // at 5 s: b is refused (its target moved since it was placed), and a with it.
    const s = await sceneWith({ a: 'x+y=z', b: 'w' });
    s.project.tracks.push(createTrack('Track 3'));
    const a = plainClip(s, 'a', 0, 0, 10, {
      intro: defaultIntro('write'),
      outro: defaultOutro('fade_out'),
    });
    a.actions.push(createTween(2, 1, { position: [0, 1] }));
    const label = plainClip(s, 'b', 1, 1.5, 9, { attach: createAttach(a.id, [0]) });
    s.project = settleAttachments(s.project, s.formulas);
    const plan = planSplit(s.project, [a.id, label.id], 5, {
      suffix: '_s',
      resolved: s.formulas,
    });
    const reasonOf = (id: string) => plan.refused.find((r) => r.clipId === id)?.reason ?? '';
    // The label's own reason: detach it first.
    expect(reasonOf(label.id)).toMatch(/Detach it first/);
    expect(reasonOf(a.id)).toBe(
      '“b” (1.50–9.00 s), attached to it, crosses the playhead and could not be split.',
    );
    // Not selected, it is asked for.
    const alone = planSplit(s.project, [a.id], 5, { suffix: '_s', resolved: s.formulas });
    expect(alone.refused[0]!.reason).toMatch(/select it too to split both, or trim it/);
  });
});

describe('the reason of a split refused for a new error (A2-04)', () => {
  it('speaks of the split and of its second half, not of a copy that was never made', async () => {
    // Glyph 0 of a fades out over [6, 7]; the label l hangs on it from 5.5 s. Split at 6.5 s,
    // the second half of l would be placed on that glyph while it fades.
    const s = await sceneWith({ a: 'x+y=z', l: 'w' });
    s.project.tracks.push(createTrack('Track 3'));
    const a = plainClip(s, 'a', 0, 0, 10, {
      intro: defaultIntro('write'),
      outro: defaultOutro('fade_out'),
    });
    a.actions.push(createDisappear(6, 'fade_out', [0]));
    const label = plainClip(s, 'l', 1, 5.5, 7.5, { attach: createAttach(a.id, [0]) });
    s.project = settleAttachments(s.project, s.formulas);
    const plan = planSplit(s.project, [label.id], 6.5, { suffix: '_s', resolved: s.formulas });
    expect(plan.pieces).toEqual([]);
    expect(plan.refused).toHaveLength(1);
    const { reason } = plan.refused[0]!;
    expect(reason).not.toMatch(/l_s/);
    expect(reason).toBe(
      'Its second half would be attached to glyph 0 of "a" while the FadeOut block is still animating it (at 6.5 s): Manim would measure a formula half drawn. Split it before that starts, or once it has ended.',
    );
  });
});
