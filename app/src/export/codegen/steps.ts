/* Second pass of the Python generator: the scene events become operations on the clips' mobjects,
 * snapped to the frame grid and cut into steps (timeline.ts); every step is a `self.wait`, an
 * instant add, remove or placement of an attached object (attach.ts), or a `self.play` of the
 * animations that run in it (animations.ts), whole or in `_Part` slices when they overlap. The
 * marks of the Slides mode go between the steps (marks.ts). */
import { markName, sceneDuration, skippedWait, type SlideMark } from '../../model';
import type { DisappearEvent } from '../../scene';
import { exportIssue } from './issues';
import { fractionLiteral, frameRounding, num, secondsLiteral } from './python';
import {
  placeMarks,
  planSteps,
  snapEvents,
  snapFrame,
  type PartRef,
  type PlacedMark,
  type Step,
} from './timeline';
import { markLines } from './marks';
import { type Codegen, type ClipCtx, type Op, type Generated, INDENT } from './context';
import { applyEnd, emitInstant } from './membership';
import { generate } from './animations';
import { placeOps } from './attach';
import { CAMERA_GROUP, describeCameraMove } from './camera';

function collectOps(gen: Codegen): Op[] {
  // Attached objects are placed first at their frame, before anything else that happens then.
  const ops: Op[] = placeOps(gen);
  for (const event of gen.events) {
    if (event.kind === 'intro' || event.kind === 'outro') {
      const clip = gen.clipCtx.get(event.clipId);
      if (!clip) continue;
      const skip = new Set(event.except);
      const glyphs = Array.from({ length: clip.formula.count }, (_, g) => g).filter(
        (g) => !skip.has(g),
      );
      if (glyphs.length === 0) continue;
      if (event.kind === 'intro') ops.push({ kind: 'intro', event, clip, glyphs });
      else ops.push({ kind: 'outro', event, clip, glyphs });
    } else if (event.kind === 'tween') {
      const clip = gen.clipCtx.get(event.clipId);
      if (!clip || event.end - event.start <= 1e-9) continue;
      if (JSON.stringify(event.from) === JSON.stringify(event.to)) continue;
      ops.push({ kind: 'tween', event, clip });
    } else if (event.kind === 'transfer') {
      const from = gen.clipCtx.get(event.fromClipId);
      const to = gen.clipCtx.get(event.toClipId);
      if (!from || !to || event.end - event.start <= 1e-9) continue;
      const inRange = (list: number[], ctx: ClipCtx) =>
        list.length > 0 &&
        list.every((g) => Number.isInteger(g) && g >= 0 && g < ctx.formula.count);
      const pairs = event.pairs.filter((p) => inRange(p.from, from) && inRange(p.to, to));
      if (pairs.length === 0) continue;
      ops.push({ kind: 'transfer', event, from, to, pairs });
    } else if (event.kind === 'appear' || event.kind === 'disappear') {
      const clip = gen.clipCtx.get(event.clipId);
      if (!clip) continue;
      const glyphs = event.glyphs.filter((g) => g < clip.formula.count);
      if (glyphs.length === 0) continue;
      if (event.kind === 'appear') ops.push({ kind: 'appear', event, clip, glyphs });
      else
        ops.push({ kind: 'disappear', event, clip, glyphs, back: comesBack(gen, event, glyphs) });
    } else if (event.kind === 'transform') {
      const clip = gen.clipCtx.get(event.clipId);
      if (!clip || event.end - event.start <= 1e-9) continue;
      const glyphs = event.glyphs.filter((g) => g < clip.formula.count);
      if (glyphs.length === 0) continue;
      ops.push({ kind: 'transform', event, clip, glyphs });
    } else if (event.kind === 'emphasis') {
      const clip = gen.clipCtx.get(event.clipId);
      if (!clip || event.end - event.start <= 1e-9) continue;
      const glyphs = event.glyphs.filter((g) => g < clip.formula.count);
      if (glyphs.length === 0) continue;
      ops.push({ kind: 'emphasis', event, clip, glyphs });
    }
  }
  for (const clip of gen.clipCtx.values()) {
    const glyphs = [...(gen.lifetimes.get(clip.clip.id)?.stints ?? [])]
      .filter(
        ([g, stints]) => g < clip.formula.count && stints.at(-1)?.exit.cause.kind === 'clip-end',
      )
      .map(([g]) => g)
      .sort((a, b) => a - b);
    if (glyphs.length === 0) continue;
    const end = clip.clip.end;
    ops.push({ kind: 'leave', event: { start: end, end }, clip, glyphs });
  }
  // The camera's moves that go somewhere: the ops of no clip.
  for (const leg of gen.camera?.legs ?? []) {
    ops.push({ kind: 'camera', event: { start: leg.start, end: leg.end }, leg });
  }
  return ops;
}

/** Glyphs of a disappear block that an appear block brings back later in the clip. */
function comesBack(gen: Codegen, event: DisappearEvent, glyphs: number[]): Set<number> {
  const stints = gen.lifetimes.get(event.clipId)?.stints;
  return new Set(
    glyphs.filter((g) => {
      const list = stints?.get(g) ?? [];
      const i = list.findIndex(
        (s) => s.exit.cause.kind === 'action' && s.exit.cause.actionId === event.actionId,
      );
      return i >= 0 && i < list.length - 1;
    }),
  );
}

export function emitTimeline(gen: Codegen): void {
  const duration = sceneDuration(gen.project);
  const total = snapFrame(duration, gen.fps);
  const instant = (op: Op) =>
    op.kind === 'leave' ||
    op.kind === 'place' ||
    ((op.kind === 'intro' || op.kind === 'outro') &&
      (op.event.anim === 'none' || op.event.end - op.event.start <= 1e-9));
  // What an op animates, for the snapping: its clips — and, in a scene with a camera, the one
  // group every op is in, so that nothing is stretched into a camera move it only touched.
  const clipsOf = (op: Op): string[] => {
    if (op.kind === 'camera') return [CAMERA_GROUP];
    const clips = op.kind === 'transfer' ? [op.from.clip.id, op.to.clip.id] : [op.clip.clip.id];
    return gen.camera ? [...clips, CAMERA_GROUP] : clips;
  };
  const snapped = snapEvents(
    collectOps(gen).map((op) => ({ op, start: op.event.start, end: op.event.end })),
    gen.fps,
    (e) => instant(e.op),
    (e) => clipsOf(e.op),
  );
  if (snapped.pushed.length > 0) {
    const names = snapped.pushed.map((e) => describeOp(gen, e.op));
    gen.issues.push(
      exportIssue(
        'warning',
        'export-snapping',
        `Shorter than a frame at ${gen.fps} fps, an animation was stretched to one frame, so ` +
          `${names.join(', ')} start${names.length > 1 ? '' : 's'} later, after it.`,
      ),
    );
  }
  if (snapped.moved.length > 0) {
    gen.issues.push(
      exportIssue(
        'warning',
        'export-snapping',
        `${snapped.moved.length} animation${snapped.moved.length > 1 ? 's' : ''} moved by up to ` +
          `${num(snapped.maxShift * 1000, 1)} ms to fall on the ${gen.fps} fps frame grid.`,
      ),
    );
  }
  const items = snapped.items.map((i) => ({ event: i.event.op, f0: i.f0, f1: i.f1 }));
  const steps = planSteps(items, total);
  const generated = new Map<Op, Generated>();
  const placed = placeMarks(
    steps,
    gen.marks.map((mark) => ({ mark, time: mark.time })),
    gen.fps,
  );
  const pauses = gen.marks.filter((mark) => mark.kind === 'pause');
  // The length of the body just after the last group of marks, its blank line included (-1
  // before any): a mark written then goes on with that group.
  let afterMarks = -1;
  for (const item of placed) {
    if (item.kind === 'mark') afterMarks = emitMark(gen, item, pauses, afterMarks);
    else emitStep(gen, item, generated);
  }
  // A group of marks at the end of the scene needs no blank line after it.
  if (afterMarks === gen.body.length) gen.body.pop();
}

/** One mark of the Slides mode, in a group of the marks written together that stands apart, a
 * blank line before it and one after (`afterMarks`: where the group before ended, -1 for none);
 * gives where this group ends now. */
function emitMark(
  gen: Codegen,
  placed: PlacedMark<Op, SlideMark>,
  pauses: readonly SlideMark[],
  afterMarks: number,
): number {
  const out = gen.body;
  if (afterMarks === out.length) out.pop();
  else if (out.length > 0 && out.at(-1) !== '') out.push('');
  const { mark, frame, movedOutOf } = placed;
  const n = pauses.indexOf(mark);
  // A pause that skips its wait says how long the page skips (D202); the wait itself stays. The
  // project here is the visual one, whose rests before the last animation — the only ones a pause
  // skips — are those of the project with its sound, which the page plays.
  const skipped = skippedWait(gen.project, mark);
  const pause =
    n >= 0
      ? { number: n + 1, of: pauses.length, skipped: skipped && skipped.end - skipped.start }
      : null;
  out.push(...markLines(mark, pause), '');
  if (movedOutOf) {
    const index = gen.project.slides?.marks.findIndex((m) => m.id === mark.id) ?? -1;
    const those = movedOutOf.parts.length > 1 ? 'those animations' : 'that animation';
    gen.issues.push(
      exportIssue(
        'warning',
        'export-slide-mark',
        `${markName(mark)} falls during ${describe(gen, movedOutOf.parts)} once the times are on ` +
          `the ${gen.fps} fps frame grid: the Python has it just ` +
          `${frame === movedOutOf.f0 ? 'before' : 'after'} ${those}, at ${seconds(gen, frame)} s.`,
        index >= 0 ? ['slides', 'marks', index, 'time'] : [],
      ),
    );
  }
  return out.length;
}

function seconds(gen: Codegen, frames: number): string {
  return num(frames / gen.fps, 3);
}

function emitStep(gen: Codegen, step: Step<Op>, generated: Map<Op, Generated>): void {
  const out = gen.body;
  if (step.kind === 'instant') {
    for (const item of step.items) emitInstant(gen, item.event);
    return;
  }
  const frames = step.f1 - step.f0;
  if (step.kind === 'wait') {
    if (gen.options.comments) out.push(`# ${seconds(gen, step.f0)} s – ${seconds(gen, step.f1)} s`);
    out.push(`self.wait(${secondsLiteral(frames, gen.fps, frameRounding(gen.target, 'wait'))})`);
    return;
  }

  // Animations that start here are created now (from the scene as it is at this moment).
  for (const part of step.parts) {
    if (!part.first) continue;
    const op = part.item.event;
    const made = generate(gen, op, !part.whole);
    generated.set(op, made);
    out.push(...made.pre);
    if (!part.whole && made.anims.length > 0 && !made.variable) {
      made.variable = gen.names.take(variableName(op));
      out.push(
        made.anims.length === 1
          ? `${made.variable} = ${made.anims[0]}`
          : `${made.variable} = [\n${made.anims.map((a) => `    ${a},`).join('\n')}\n]`,
      );
    }
  }

  const args: string[] = [];
  for (const part of step.parts) {
    const made = generated.get(part.item.event)!;
    if (made.anims.length === 0) continue;
    if (part.whole) {
      args.push(...made.anims);
      continue;
    }
    const length = part.item.f1 - part.item.f0;
    const a0 = fractionLiteral(part.from, length);
    const a1 = fractionLiteral(part.to, length);
    args.push(
      made.anims.length === 1
        ? `_Part(${made.variable}, ${a0}, ${a1})`
        : `*(_Part(a, ${a0}, ${a1}) for a in ${made.variable})`,
    );
    gen.helpers.add('part');
  }
  if (gen.options.comments) {
    out.push(
      `# ${seconds(gen, step.f0)} s – ${seconds(gen, step.f1)} s: ${describe(gen, step.parts)}`,
    );
  }
  if (args.length === 0) {
    // Nothing on screen to animate (e.g. a tween of glyphs that have not arrived yet).
    out.push(`self.wait(${secondsLiteral(frames, gen.fps, frameRounding(gen.target, 'wait'))})`);
  } else {
    const runTime = `run_time=${secondsLiteral(frames, gen.fps, frameRounding(gen.target, 'play'))}`;
    const oneLine = `self.play(${[...args, runTime].join(', ')})`;
    if (oneLine.length + INDENT.length <= 100 && !oneLine.includes('\n')) out.push(oneLine);
    else {
      out.push(
        'self.play(',
        ...[...args, runTime].map((a) => `    ${a.replace(/\n/g, '\n    ')},`),
        ')',
      );
    }
  }

  for (const part of step.parts) {
    if (!part.last) continue;
    const op = part.item.event;
    applyEnd(op);
    out.push(...generated.get(op)!.post);
  }
}

function describe(gen: Codegen, parts: PartRef<Op>[]): string {
  return parts.map(({ item }) => describeOp(gen, item.event)).join(', ');
}

function describeOp(gen: Codegen, op: Op): string {
  if (op.kind === 'camera') return describeCameraMove(gen, op.leg);
  if (op.kind === 'transfer') {
    return op.event.origin.kind === 'morph'
      ? `${op.from.naming.name} morph`
      : `${op.from.naming.name} → ${op.to.naming.name}`;
  }
  if (op.kind === 'leave') return `${op.clip.naming.name} ends`;
  if (op.kind === 'place') {
    const how =
      op.attach.rule === 'brace' || op.attach.rule === 'shape'
        ? 'built'
        : op.attach.rule === 'tip'
          ? 'put at the tip'
          : 'placed';
    return `${op.clip.naming.name} ${how}`;
  }
  if (op.kind === 'transform') return `${op.clip.naming.name} part`;
  if (op.kind === 'emphasis') return `${op.clip.naming.name} ${op.event.effect.replace('_', ' ')}`;
  return `${op.clip.naming.name} ${op.kind === 'tween' ? 'tween' : op.event.anim}`;
}

function variableName(op: Op): string {
  switch (op.kind) {
    case 'camera':
      return 'cam_move';
    case 'intro':
      return `${op.clip.naming.name}_in`;
    case 'outro':
      return `${op.clip.naming.name}_out`;
    case 'appear':
      return `${op.clip.naming.name}_appear`;
    case 'disappear':
      return `${op.clip.naming.name}_disappear`;
    case 'leave':
      return `${op.clip.naming.name}_end`;
    case 'place':
      return `${op.clip.naming.name}_place`;
    case 'tween':
      return `${op.clip.naming.name}_move`;
    case 'transform':
      return `${op.clip.naming.name}_part`;
    case 'emphasis':
      return `${op.clip.naming.name}_${op.event.effect}`;
    case 'transfer':
      // A relation's: `a_to_b`; a Morph block's: `a_morph` (`a_morph_2` for the next one).
      return op.event.origin.kind === 'morph'
        ? `${op.from.naming.name}_morph`
        : `${op.from.naming.name}_to_${op.to.naming.name}`;
  }
}
