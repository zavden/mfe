// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createAttach,
  createClip,
  createEmphasis,
  createPartTransform,
  createRelation,
  defaultIntro,
  defaultOutro,
  validateProject,
  type Issue,
  type IssueCode,
  type Project,
} from '../index';
import { smallProject } from './fixtures';

function issue(project: Project, code: IssueCode) {
  const found = validateProject(project).find((i) => i.code === code);
  expect(found, code).toBeDefined();
  return found! as Issue & { identity?: unknown };
}

describe('stable diagnostic identity', () => {
  it('includes every target owner and keeps same-transfer multiplicity', () => {
    const p = smallProject();
    const r = p.relations[0]!;
    // Pairs of one relation that share a target without bringing the same glyphs (D167).
    r.pairs.push({ from: [1], to: [2, 3], style: null });
    const before = issue(p, 'target-conflict');
    expect(before.identity).toEqual({
      subject: { kind: 'clip', clipId: p.clips[1]!.id },
      participants: [`relation:${r.id}`, `relation:${r.id}`],
      glyphs: [{ clipId: p.clips[1]!.id, index: 3 }],
    });
    r.pairs.push({ from: [2], to: [1, 3], style: null });
    const after = issue(p, 'target-conflict');
    expect(after.path).toEqual(before.path);
    expect(after.message).toBe(before.message);
    expect(after.identity).toMatchObject({ participants: Array(3).fill(`relation:${r.id}`) });
    p.clips.reverse();
    p.formulas.reverse();
    r.pairs.reverse();
    expect(issue(p, 'target-conflict').identity).toEqual(after.identity);
  });

  it('includes all consuming owners instead of only the second reported pair', () => {
    const p = smallProject();
    const r = p.relations[0]!;
    r.pairs.push({ from: [0], to: [1], style: null }, { from: [0], to: [2], style: null });
    expect(issue(p, 'source-consumed-twice').identity).toEqual({
      subject: { kind: 'clip', clipId: p.clips[0]!.id },
      participants: Array(3).fill(`relation:${r.id}`),
      glyphs: [{ clipId: p.clips[0]!.id, index: 0 }],
    });
  });

  it('identifies action overlaps by stable causes and affected canonical glyphs', () => {
    const p = smallProject();
    const clip = p.clips[0]!;
    const action = createPartTransform(2.2, [0, 1], { duration: 0.5 });
    clip.actions.push(action);
    const before = issue(p, 'action-overlap');
    expect(before.identity).toEqual({
      subject: { kind: 'clip', clipId: clip.id },
      participants: [`action:${clip.id}:${action.id}`, `relation:${p.relations[0]!.id}`].sort(),
      glyphs: [{ clipId: clip.id, index: 0 }],
    });
    clip.actions.unshift(createPartTransform(1.1, [4], { duration: 0.2 }));
    p.clips.reverse();
    expect(issue(p, 'action-overlap').identity).toEqual(before.identity);
  });

  it('identifies a consumed Appear and a measuring-only effect by their action IDs', () => {
    const p = smallProject();
    const clip = p.clips[0]!;
    const appear = createAppear(3.1, 'fade_in', [0], { duration: 0.2 });
    const flash = createEmphasis(0.5, 'flash', [1, 2]);
    clip.actions.push(appear, flash);
    expect(issue(p, 'appear-consumed').identity).toEqual({
      subject: { kind: 'action', clipId: clip.id, actionId: appear.id },
      participants: [`action:${clip.id}:${appear.id}`, `relation:${p.relations[0]!.id}`].sort(),
      glyphs: [{ clipId: clip.id, index: 0 }],
    });
    expect(issue(p, 'emphasis-target-busy').identity).toEqual({
      subject: { kind: 'action', clipId: clip.id, actionId: flash.id },
      participants: [`action:${clip.id}:${flash.id}`, `intro:${clip.id}`].sort(),
      glyphs: [1, 2].map((index) => ({ clipId: clip.id, index })),
    });
  });

  it('identifies late source uses, arriving sources and consumed destinations', () => {
    const p = smallProject();
    const [a, b] = p.clips;
    const later = createRelation(a!.id, b!.id, {
      offset: 1.1,
      duration: 0.2,
      style: 'copy',
      pairs: [{ from: [0], to: [1], style: null }],
    });
    p.relations.push(later);
    expect(issue(p, 'source-used-after-consumed').identity).toMatchObject({
      subject: { kind: 'relation', relationId: later.id },
      participants: [`relation:${p.relations[0]!.id}`, `relation:${later.id}`].sort(),
      glyphs: [{ clipId: a!.id, index: 0 }],
    });
    const returner = createRelation(b!.id, a!.id, {
      offset: 2.5,
      duration: 0.2,
      pairs: [{ from: [3], to: [0], style: null }],
    });
    p.relations.push(returner);
    expect(issue(p, 'source-arriving').identity).toMatchObject({
      participants: [`relation:${p.relations[0]!.id}`, `relation:${returner.id}`].sort(),
      glyphs: [{ clipId: b!.id, index: 3 }],
    });
    expect(issue(p, 'target-consumed').identity).toMatchObject({
      participants: [`relation:${p.relations[0]!.id}`, `relation:${returner.id}`].sort(),
      glyphs: [{ clipId: a!.id, index: 0 }],
    });
  });

  it('identifies attachment consumers and the causes making their target busy or gone', () => {
    const p = smallProject();
    const target = p.clips[0]!;
    const attached = createClip(p.formulas[1]!.id, p.tracks[1]!.id, 0.5, 1.5, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
      attach: createAttach(target.id, [0]),
    });
    p.clips.push(attached);
    expect(issue(p, 'attach-target-busy').identity).toEqual({
      subject: { kind: 'clip', clipId: attached.id },
      participants: [`attach:${attached.id}`, `intro:${target.id}`].sort(),
      glyphs: [{ clipId: target.id, index: 0 }],
    });
    attached.start = 3.2;
    attached.end = 4;
    expect(issue(p, 'attach-target-gone').identity).toEqual({
      subject: { kind: 'clip', clipId: attached.id },
      participants: [`attach:${attached.id}`, `relation:${p.relations[0]!.id}`].sort(),
      glyphs: [{ clipId: target.id, index: 0 }],
    });
  });
});
