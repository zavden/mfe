// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  actionConflicts,
  clipLifetimeOf,
  createClip,
  createDisappear,
  createEmphasis,
  createMorph,
  createRelation,
  createTrack,
  issueKey,
  timingErrorKeys,
  timingErrors,
} from '../index';
import {
  attachmentConsumer,
  noPhases,
  timingErrorsOf,
  timingScene,
  withActionTiming,
} from './timingFixtures';

describe('incremental timing validation', () => {
  it('retains full-project paths, stable identities and diagnostic text for attachment consumers', () => {
    const fade = createDisappear(4.5, 'fade_out', [0]);
    const { project, clip } = timingScene([fade]);
    const label = attachmentConsumer(project, clip);
    const unrelatedTrack = createTrack('Unrelated');
    project.tracks.push(unrelatedTrack);
    project.clips.unshift(createClip(clip.formulaId, unrelatedTrack.id, 0, 10, noPhases()));
    const full = timingErrorsOf(project);
    expect(full).toHaveLength(1);
    expect(full[0]).toMatchObject({
      code: 'attach-target-busy',
      path: ['clips', 2, 'attach'],
      identity: { subject: { kind: 'clip', clipId: label.id } },
    });
    const incremental = timingErrors(project, clip, clipLifetimeOf(project, clip));
    expect(incremental).toEqual(full);
    expect(timingErrorKeys(project, [clip.id])).toEqual(new Set(full.map(issueKey)));
  });

  it('keeps an already-invalid attachment editable when only message times or array positions change', () => {
    const fade = createDisappear(4, 'fade_out', [0], { duration: 2 });
    const { project, clip } = timingScene([fade]);
    const label = attachmentConsumer(project, clip);
    const before = timingErrorsOf(project)[0]!;
    const after = withActionTiming(project, clip, fade.id, { start: 4.25, duration: 2 });
    after.clips = after.clips.map((c) => (c.id === label.id ? { ...c, start: 5.25 } : c)).reverse();
    const later = timingErrorsOf(after)[0]!;
    expect(before.path).not.toEqual(later.path);
    expect(before.message).not.toEqual(later.message);
    expect(issueKey(later)).toBe(issueKey(before));
    expect(
      actionConflicts(
        project,
        after.clips.find((c) => c.id === clip.id)!,
        fade.id,
      ),
    ).toBeNull();
  });

  it('allows fewer affected glyphs in an existing issue but refuses an added participant', () => {
    const fade = createDisappear(4, 'fade_out', [0, 1], { duration: 2 });
    const { project, clip } = timingScene([fade]);
    attachmentConsumer(project, clip, 5, [0, 1]);
    expect(timingErrorsOf(project)).toHaveLength(1);
    const reduced = { ...clip, actions: [{ ...fade, glyphs: [0] }] };
    expect(actionConflicts(project, reduced, fade.id)).toBeNull();
    const other = createDisappear(4, 'fade_out', [0], { duration: 2 });
    const replaced = { ...clip, actions: [other] };
    expect(actionConflicts(project, replaced, other.id)).toMatchObject({
      kind: 'issue',
      issue: { code: 'attach-target-busy' },
    });
  });

  it('agrees with full validation over small block and relation schedules with both sides attached', () => {
    const morph = createMorph(2, { pairs: [{ from: [0], to: [1], style: 'copy' }] });
    const focus = createEmphasis(5, 'focus_on', [1]);
    const { project, clip } = timingScene([morph, focus]);
    const to = createClip(clip.formulaId, project.tracks[1]!.id, 0, 10, noPhases());
    project.clips.push(to);
    const relation = createRelation(clip.id, to.id, {
      offset: 6,
      duration: 1,
      style: 'copy',
      pairs: [{ from: [1], to: [0], style: null }],
    });
    project.relations.push(relation);
    attachmentConsumer(project, clip, 5, [0, 1]);
    attachmentConsumer(project, to, 7, [0]);
    for (const start of [0, 2, 4, 4.5, 5, 5.5, 6, 7, 8]) {
      for (const duration of [0.5, 1, 2]) {
        const block = withActionTiming(project, clip, morph.id, { start, duration });
        expect(timingErrorKeys(block, [clip.id])).toEqual(
          new Set(timingErrorsOf(block).map(issueKey)),
        );
        const window = { ...project, relations: [{ ...relation, offset: start, duration }] };
        expect(timingErrorKeys(window, [clip.id, to.id])).toEqual(
          new Set(timingErrorsOf(window).map(issueKey)),
        );
      }
    }
  });
});
