/* Flatten a project into timed events — the shared timing truth for preview and export. */
import {
  actionWindow,
  clipLifetimes,
  glyphTransfers,
  introWindow,
  outroWindow,
  type ClipId,
  type ClipLifetime,
  type Project,
} from '../model';
import { actionStates } from './state';
import type {
  AppearEvent,
  DisappearEvent,
  EmphasisEvent,
  IntroEvent,
  OutroEvent,
  PartTransformEvent,
  SceneEvent,
  TransferEvent,
  TweenEvent,
} from './types';

const KIND_ORDER: Record<SceneEvent['kind'], number> = {
  outro: 0,
  disappear: 1,
  transfer: 2,
  tween: 3,
  transform: 4,
  emphasis: 5,
  intro: 6,
  appear: 7,
};

/** Events sorted by start, then kind (outro, disappear, transfer, tween, transform, emphasis,
 * intro, appear), then id. Which glyphs an intro, outro, appear, disappear or emphasis animates
 * comes from `clipLifetimes`; appear, disappear, transform and emphasis events that would animate
 * no glyph are left out. Clips on hidden tracks are included: hiding is a preview toggle, not an edit. Assumes a
 * project without validation errors; with errors the events are still produced but may conflict.
 * Callers that also need lifetimes can pass their map from this same project value, within the
 * current operation. The map is only read; it must be rebuilt after editing the project. */
export function buildEvents(
  project: Project,
  lifetimes: ReadonlyMap<ClipId, ClipLifetime> = clipLifetimes(project),
): SceneEvent[] {
  const events: SceneEvent[] = [];

  for (const transfer of glyphTransfers(project)) {
    const event: TransferEvent = {
      kind: 'transfer',
      id: transfer.key,
      start: transfer.start,
      end: transfer.end,
      easing: transfer.easing,
      key: transfer.key,
      origin: transfer.origin,
      fromClipId: transfer.fromClipId,
      toClipId: transfer.toClipId,
      pathArc: transfer.pathArc,
      pairs: transfer.pairs.map((p) => ({
        from: [...p.from],
        to: [...p.to],
        style: p.style,
        extras: p.extras,
        path: p.path,
        routes: p.routes,
        ...(p.principal === undefined ? {} : { principal: p.principal }),
      })),
    };
    events.push(event);
  }

  for (const clip of project.clips) {
    const life = lifetimes.get(clip.id)!;
    const without = (animated: number[]) => {
      const set = new Set(animated);
      return life.glyphs.filter((g) => !set.has(g));
    };
    const iw = introWindow(clip);
    const intro: IntroEvent = {
      kind: 'intro',
      id: `intro:${clip.id}`,
      start: iw.start,
      end: iw.end,
      easing: clip.intro.easing,
      clipId: clip.id,
      anim: clip.intro.kind,
      except: without(life.intro),
      lagRatio: clip.intro.lagRatio,
      shift: [...clip.intro.shift],
      scale: clip.intro.scale,
    };
    const ow = outroWindow(clip);
    const outro: OutroEvent = {
      kind: 'outro',
      id: `outro:${clip.id}`,
      start: ow.start,
      end: ow.end,
      easing: clip.outro.easing,
      clipId: clip.id,
      anim: clip.outro.kind,
      except: without(life.outro),
      lagRatio: clip.outro.lagRatio,
      shift: [...clip.outro.shift],
      scale: clip.outro.scale,
    };
    events.push(intro, outro);
    for (const { action, from, to, fit, ends } of actionStates(clip)) {
      const tween: TweenEvent = {
        kind: 'tween',
        id: `tween:${action.id}`,
        start: clip.start + action.start,
        end: clip.start + action.start + action.duration,
        easing: action.easing,
        clipId: clip.id,
        actionId: action.id,
        from,
        to,
        ...(fit ? { fit } : {}),
        ...(ends ? { ends } : {}),
      };
      events.push(tween);
    }
    for (const action of clip.actions) {
      // A tween has its event above; a morph plays as the transfer event of its pairs.
      if (action.kind === 'tween' || action.kind === 'morph') continue;
      const glyphs = life.actions.get(action.id)?.glyphs ?? [];
      if (glyphs.length === 0) continue;
      const w = actionWindow(clip, action);
      const base = {
        id: `${action.kind}:${action.id}`,
        start: w.start,
        end: w.end,
        easing: action.easing,
        clipId: clip.id,
        actionId: action.id,
        glyphs: [...glyphs],
      };
      if (action.kind === 'emphasis') {
        const event: EmphasisEvent = {
          ...base,
          kind: 'emphasis',
          effect: action.effect,
          color: action.color,
          scale: action.scale,
          angle: action.angle,
          wiggles: action.wiggles,
          buff: action.buff,
          strokeWidth: action.strokeWidth,
          timeWidth: action.timeWidth,
          opacity: action.opacity,
        };
        events.push(event);
      } else if (action.kind === 'transform') {
        const event: PartTransformEvent = {
          ...base,
          kind: 'transform',
          shift: [...action.shift],
          scale: action.scale,
          rotation: action.rotation,
          color: action.color,
          opacity: action.opacity,
        };
        events.push(event);
      } else {
        const anim = { lagRatio: action.lagRatio, shift: [...action.shift] as [number, number] };
        const event: AppearEvent | DisappearEvent =
          action.kind === 'appear'
            ? { ...base, ...anim, kind: 'appear', anim: action.anim, scale: action.scale }
            : { ...base, ...anim, kind: 'disappear', anim: action.anim, scale: action.scale };
        events.push(event);
      }
    }
  }

  return events.sort(
    (a, b) =>
      a.start - b.start || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id),
  );
}
