// @vitest-environment node
/* The timing of a clip, copied and pasted (`clipTiming.ts`, D150): what a copy takes, what each
 * part does to a clip, and that a paste does what it says or leaves the clip as it is. */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAudioAsset,
  createAudioClip,
  createAudioTrack,
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  createTween,
  defaultIntro,
  defaultOutro,
  validateProject,
  type AudioClip,
  type Clip,
  type Project,
} from '../../../model';
import { loadProject, useProjectStore } from '../../../store';
import { useNoticeStore } from '../../project/noticeStore';
import {
  applyTimingChange,
  copyTiming,
  pasteTiming,
  planTimingPaste,
  planTimingPastes,
  seconds,
  timingOf,
  timingValue,
  useTimingClipboard,
  type ClipTiming,
} from '../clipTiming';

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

/** Track 1 holds `a` over [1, 5) — an intro of 1 s, an outro of 0.5 s — and `c` over [6, 8) with
 * neither; track 2 holds `b` over [2, 4), an intro of 0.5 s and no outro; a sound of 10 s plays
 * its first 3 s from 0 on an audio track. */
function scene(): { project: Project; a: Clip; b: Clip; c: Clip; sound: AudioClip } {
  const project = createEmptyProject();
  const [t2, t1] = project.tracks;
  const formula = (name: string) => {
    const made = createFormula({ name, source: name });
    project.formulas.push(made);
    return made.id;
  };
  const a = createClip(formula('fa'), t1!.id, 1, 5, {
    intro: { ...defaultIntro('write'), duration: 1 },
    outro: { ...defaultOutro('fade_out'), duration: 0.5 },
  });
  const c = createClip(formula('fc'), t1!.id, 6, 8, none);
  const b = createClip(formula('fb'), t2!.id, 2, 4, {
    intro: { ...defaultIntro('fade_in'), duration: 0.5 },
    outro: defaultOutro('none'),
  });
  project.clips.push(a, b, c);
  const audioTrack = createAudioTrack('Audio 1');
  project.tracks.push(audioTrack);
  const asset = createAudioAsset({
    name: 'voice',
    originalName: 'voice.wav',
    mimeType: 'audio/wav',
    byteLength: 1,
    contentHash: 'a'.repeat(64),
    duration: 10,
    sampleRate: 48000,
    channels: 1,
  });
  project.audioAssets.push(asset);
  const sound = createAudioClip(asset.id, audioTrack.id, 0, 3);
  project.audioClips.push(sound);
  return { project, a, b, c, sound };
}

const timing = (fields: Partial<ClipTiming> = {}): ClipTiming => ({
  from: 'ref',
  start: 2,
  end: 4,
  intro: 0.5,
  outro: 0.25,
  ...fields,
});

describe('what a copy takes', () => {
  it('is when the clip starts and ends, and how long its intro and its outro are', () => {
    const { project, a, b, c, sound } = scene();
    expect(timingOf(project, a)).toEqual({ from: 'fa', start: 1, end: 5, intro: 1, outro: 0.5 });
    expect(timingOf(project, b)).toEqual({ from: 'fb', start: 2, end: 4, intro: 0.5, outro: null });
    expect(timingOf(project, c)).toMatchObject({ intro: null, outro: null });
    expect(timingOf(project, sound)).toEqual({
      from: 'voice',
      start: 0,
      end: 3,
      intro: null,
      outro: null,
    });
  });

  it('gives each part its value, the duration from the two ends', () => {
    const copied = timing({ start: 1.25, end: 5 });
    expect(timingValue(copied, 'start')).toBe(1.25);
    expect(timingValue(copied, 'end')).toBe(5);
    expect(timingValue(copied, 'duration')).toBe(3.75);
    expect(timingValue(copied, 'intro')).toBe(0.5);
    expect(timingValue(timing({ outro: null }), 'outro')).toBeNull();
    expect(seconds(1.23456)).toBe('1.235 s');
  });
});

describe('pasting a start or an end', () => {
  it('moves the clip, as long as it was, to start or to end with the copied one', () => {
    const { project, b } = scene();
    expect(planTimingPaste(project, b, timing({ start: 1 }), 'start')).toEqual({
      ok: true,
      change: { kind: 'move', start: 1, end: 3 },
    });
    expect(planTimingPaste(project, b, timing({ end: 5 }), 'end')).toEqual({
      ok: true,
      change: { kind: 'move', start: 3, end: 5 },
    });
  });

  it('is nothing to do on a clip that starts or ends there already', () => {
    const { project, b } = scene();
    expect(planTimingPaste(project, b, timing(), 'start')).toEqual({ ok: true, change: null });
    expect(planTimingPaste(project, b, timing(), 'end')).toEqual({ ok: true, change: null });
  });

  it('leaves the clip where another one of its track is in the way, and names it', () => {
    const { project, a, c } = scene();
    // `c` over [6, 8) would start at 4, inside `a` over [1, 5).
    const plan = planTimingPaste(project, c, timing({ start: 4 }), 'start');
    expect(plan).toEqual({
      ok: false,
      reason: '“fa” (1 s–5 s) is in its way on the same track',
    });
    // Right after it there is room.
    expect(planTimingPaste(project, c, timing({ start: 5 }), 'start')).toMatchObject({
      ok: true,
      change: { kind: 'move', start: 5, end: 7 },
    });
    // `a`, four seconds long, cannot end at 3: it would start before the timeline does.
    expect(planTimingPaste(project, a, timing({ end: 3 }), 'end')).toEqual({
      ok: false,
      reason: 'it would start before 0 s (at -1 s)',
    });
  });

  it('leaves a clip of a locked track', () => {
    const { project, b } = scene();
    project.tracks.find((track) => track.id === b.trackId)!.locked = true;
    expect(planTimingPaste(project, b, timing({ start: 0 }), 'start')).toEqual({
      ok: false,
      reason: 'its track, “Track 2”, is locked',
    });
  });

  it('moves a sound too', () => {
    const { project, sound } = scene();
    expect(planTimingPaste(project, sound, timing({ start: 2 }), 'start')).toEqual({
      ok: true,
      change: { kind: 'move', start: 2, end: 5 },
    });
  });

  it('takes the window of a relation along with its target clip', () => {
    const { project, a, b } = scene();
    // From `a` to `b`: a window of 1 s from the start of `b`, at [2, 3).
    project.relations.push(createRelation(a.id, b.id, { offset: 0, duration: 1 }));
    const plan = planTimingPaste(project, b, timing({ start: 2.5 }), 'start');
    expect(plan).toMatchObject({ ok: true, change: { kind: 'move', start: 2.5, end: 4.5 } });
    if (!plan.ok || !plan.change) throw new Error('no change');
    applyTimingChange(project, b.id, plan.change);
    expect(project.clips.find((clip) => clip.id === b.id)).toMatchObject({ start: 2.5, end: 4.5 });
    expect(project.relations[0]).toMatchObject({ offset: 0, duration: 1 });
  });
});

describe('pasting a duration', () => {
  it('moves the end of the clip, which starts where it did', () => {
    const { project, b, c } = scene();
    expect(planTimingPaste(project, b, timing({ start: 0, end: 3.5 }), 'duration')).toEqual({
      ok: true,
      change: { kind: 'length', end: 5.5 },
    });
    expect(planTimingPaste(project, c, timing({ start: 0, end: 0.5 }), 'duration')).toEqual({
      ok: true,
      change: { kind: 'length', end: 6.5 },
    });
    expect(planTimingPaste(project, b, timing(), 'duration')).toEqual({ ok: true, change: null });
  });

  it('leaves a clip the next one of its track gives no room to, or shorter than its animations', () => {
    const { project, a } = scene();
    // `a` starts at 1 and `c` at 6: five seconds at most.
    expect(planTimingPaste(project, a, timing({ start: 0, end: 5.5 }), 'duration')).toEqual({
      ok: false,
      reason: '“fc” (6 s–8 s) is in its way on the same track',
    });
    expect(planTimingPaste(project, a, timing({ start: 0, end: 5 }), 'duration')).toMatchObject({
      ok: true,
      change: { kind: 'length', end: 6 },
    });
    // Its intro and its outro take a second and a half.
    expect(planTimingPaste(project, a, timing({ start: 0, end: 1 }), 'duration')).toEqual({
      ok: false,
      reason: 'its intro and its outro take 1.5 s',
    });
  });

  it('cuts nothing: a clip stays when its blocks or a relation of it reach further', () => {
    const { project, a, b } = scene();
    // A Transform of `a` over [3, 4) of the timeline: the outro of a clip of 3 s would run on it.
    a.actions.push(createTween(2, 1, { position: [1, 0] }));
    expect(planTimingPaste(project, a, timing({ start: 0, end: 3 }), 'duration')).toEqual({
      ok: false,
      reason: 'its animation blocks would be cut: it would end at 4 s',
    });
    // 3.5 s leave it whole: it ends at 4, where the outro then starts.
    expect(planTimingPaste(project, a, timing({ start: 0, end: 3.5 }), 'duration')).toMatchObject({
      ok: true,
    });
    // A relation from `a` into `b` over [3, 4): `b` cannot end before it does.
    project.relations.push(createRelation(a.id, b.id, { offset: 1, duration: 1 }));
    expect(planTimingPaste(project, b, timing({ start: 0, end: 1.5 }), 'duration')).toEqual({
      ok: false,
      reason: 'a relation of it would be cut: it would end at 3.5 s',
    });
  });

  it('makes a sound longer as far as its samples go, and no further', () => {
    const { project, sound } = scene();
    expect(planTimingPaste(project, sound, timing({ start: 0, end: 4.5 }), 'duration')).toEqual({
      ok: true,
      change: { kind: 'length', end: 4.5 },
    });
    expect(planTimingPaste(project, sound, timing({ start: 0, end: 12 }), 'duration')).toEqual({
      ok: false,
      reason: 'its sound has 10 s left from where it starts',
    });
  });
});

describe('pasting the time of an intro or of an outro', () => {
  it('makes the intro, or the outro, of the clip last that long', () => {
    const { project, a } = scene();
    expect(planTimingPaste(project, a, timing({ intro: 2 }), 'intro')).toEqual({
      ok: true,
      change: { kind: 'phase', phase: 'intro', duration: 2 },
    });
    expect(planTimingPaste(project, a, timing({ outro: 0.25 }), 'outro')).toEqual({
      ok: true,
      change: { kind: 'phase', phase: 'outro', duration: 0.25 },
    });
    expect(planTimingPaste(project, a, timing({ intro: 1 }), 'intro')).toEqual({
      ok: true,
      change: null,
    });
  });

  it('leaves a clip that has none, and says when the copied clip had none', () => {
    const { project, b, c, sound } = scene();
    expect(planTimingPaste(project, c, timing(), 'intro')).toEqual({
      ok: false,
      reason: 'it has no intro',
    });
    expect(planTimingPaste(project, b, timing(), 'outro')).toEqual({
      ok: false,
      reason: 'it has no outro',
    });
    expect(planTimingPaste(project, sound, timing(), 'intro')).toEqual({
      ok: false,
      reason: 'a sound has no intro',
    });
    expect(planTimingPaste(project, b, timing({ intro: null }), 'intro')).toEqual({
      ok: false,
      reason: '“ref” has no intro',
    });
  });

  it('leaves an intro that would run into the outro, or into a Transform', () => {
    const { project, a } = scene();
    // Four seconds, half a second of outro: three and a half at most.
    expect(planTimingPaste(project, a, timing({ intro: 3.75 }), 'intro')).toEqual({
      ok: false,
      reason: 'its intro can last 3.5 s at most, beside its outro and its Transforms',
    });
    a.actions.push(createTween(2, 1, { position: [1, 0] }));
    expect(planTimingPaste(project, a, timing({ intro: 2.5 }), 'intro')).toEqual({
      ok: false,
      reason: 'its intro can last 2 s at most, beside its outro and its Transforms',
    });
    expect(planTimingPaste(project, a, timing({ intro: 2 }), 'intro')).toMatchObject({ ok: true });
    // The outro, from the other side: the Transform ends a second before the clip does.
    expect(planTimingPaste(project, a, timing({ outro: 1.25 }), 'outro')).toEqual({
      ok: false,
      reason: 'its outro can last 1 s at most, beside its intro and its Transforms',
    });
  });

  it('leaves the intro of a source whose relation starts before it would end', () => {
    const { project, a, b } = scene();
    // From `a` into `b` over [2, 3): the intro of `a`, until 2 now, cannot reach 2.5.
    project.relations.push(createRelation(a.id, b.id, { offset: 0, duration: 1 }));
    expect(planTimingPaste(project, a, timing({ intro: 1.5 }), 'intro')).toEqual({
      ok: false,
      reason: 'a relation of it would be cut by an intro of 1.5 s',
    });
  });
});

describe('pasting onto several clips', () => {
  it('plans each where the ones before it left the timeline, in its order', () => {
    const { project, a, b, c } = scene();
    // The three start at 0: `a` goes there, `b` on its own track too, and `c`, of the track of
    // `a`, finds it in its way.
    const plan = planTimingPastes(project, [c.id, b.id, a.id], timing({ start: 0 }), 'start');
    expect(plan.changes).toEqual([
      { clipId: a.id, change: { kind: 'move', start: 0, end: 4 } },
      { clipId: b.id, change: { kind: 'move', start: 0, end: 2 } },
    ]);
    expect(plan.stayed).toEqual([
      { name: 'fc', reason: '“fa” (0 s–4 s) is in its way on the same track' },
    ]);
  });
});

describe('the clipboard and its commands', () => {
  const project = () => useProjectStore.getState().project;
  const undoSteps = () => useProjectStore.temporal.getState().pastStates.length;
  const clipOf = (name: string) => {
    const formula = project().formulas.find((f) => f.name === name)!;
    return project().clips.find((clip) => clip.formulaId === formula.id)!;
  };

  beforeEach(() => {
    loadProject(scene().project);
    useTimingClipboard.getState().set(null);
    useNoticeStore.getState().clear();
  });

  it('pastes nothing before a copy', () => {
    const steps = undoSteps();
    expect(pasteTiming([clipOf('fb').id], 'start')).toBe(0);
    expect(copyTiming('nothing')).toBe(false);
    expect(undoSteps()).toBe(steps);
  });

  it('copies a clip and pastes parts of it onto others, one undo step each', () => {
    expect(copyTiming(clipOf('fa').id)).toBe(true);
    expect(useTimingClipboard.getState().timing).toEqual({
      from: 'fa',
      start: 1,
      end: 5,
      intro: 1,
      outro: 0.5,
    });
    const steps = undoSteps();
    expect(pasteTiming([clipOf('fb').id], 'start')).toBe(1);
    expect(clipOf('fb')).toMatchObject({ start: 1, end: 3 });
    expect(pasteTiming([clipOf('fb').id], 'duration')).toBe(1);
    expect(clipOf('fb')).toMatchObject({ start: 1, end: 5 });
    expect(pasteTiming([clipOf('fb').id], 'intro')).toBe(1);
    expect(clipOf('fb').intro.duration).toBe(1);
    expect(undoSteps()).toBe(steps + 3);
    expect(useNoticeStore.getState().notices).toEqual([]);
    expect(validateProject(project()).filter((issue) => issue.severity === 'error')).toEqual([]);
    // Once more: it has them already — nothing to undo, nothing to say.
    expect(pasteTiming([clipOf('fb').id], 'start')).toBe(0);
    expect(undoSteps()).toBe(steps + 3);
    expect(useNoticeStore.getState().notices).toEqual([]);
    useProjectStore.temporal.getState().undo();
    expect(clipOf('fb').intro.duration).toBe(0.5);
  });

  it('changes the clips it fits and names the ones that stay, in one undo step', () => {
    copyTiming(clipOf('fb').id);
    const steps = undoSteps();
    // Starting at 2: the sound and `c` (which `a`, over [1, 5), stops) — `a` moves to [2, 6),
    // where `c` is then in nobody's way but its own.
    const ids = [clipOf('fa').id, clipOf('fc').id, project().audioClips[0]!.id];
    expect(pasteTiming(ids, 'start')).toBe(2);
    expect(undoSteps()).toBe(steps + 1);
    expect(clipOf('fa')).toMatchObject({ start: 2, end: 6 });
    expect(project().audioClips[0]).toMatchObject({ start: 2, end: 5 });
    expect(clipOf('fc')).toMatchObject({ start: 6, end: 8 });
    const [notice] = useNoticeStore.getState().notices;
    expect(notice).toMatchObject({
      kind: 'info',
      title: '“fc” keeps its start',
      details: ['“fc”: “fa” (2 s–6 s) is in its way on the same track.'],
    });
  });
});
