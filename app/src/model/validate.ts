/* Semantic validation: cross-references and timing rules the schema cannot express.
 *
 * Errors describe projects the preview and the exporters cannot represent faithfully; the
 * UI must prevent creating them, but a loaded file may still contain them (the user fixes
 * them in the app). Warnings are suspicious but exportable.
 *
 * Glyph lifetime rules enforced here (docs/ARCHITECTURE.md, "Time model"; which glyphs each
 * animation touches comes from clipLifetimes; the pairs of relations and of morph blocks reach
 * them as glyph transfers, `transfers.ts`):
 *   - A target glyph can be brought in by at most one transfer pair (of a relation or a morph),
 *     and never after a pair consumed it (it is part of other glyphs then).
 *   - A source glyph can be consumed (style transform | fade) by at most one pair, and any
 *     copy of it must start no later than the window that consumes it. A source another transfer
 *     is still bringing in when the window starts is an error (adjacent windows may touch).
 *   - A glyph is never on both sides of one morph block (it cannot turn into itself, nor be a
 *     source and a target of the same play).
 *   - An action cannot animate a glyph while anything else animates it (the intro, the outro,
 *     a relation window, another action — a morph block's pairs count as an action here;
 *     `causesConflict`, which the block planner shares). Tweens animate every glyph and stay
 *     between the intro end and the outro start; the other actions stay inside the clip. Two
 *     transfers on one glyph keep apart through the rules above.
 *   - An appear cannot bring back a glyph a transfer consumed. Glyphs an action
 *     lists but leaves out, and actions that animate nothing: warnings (D22).
 *   - A source glyph not fully on screen when its window starts: warning.
 *   - An attached object (`clip.attach`, R4) needs its target glyphs quiet when its clip starts:
 *     Manim measures them then to place it (`attachIssues`).
 */
import {
  actionLike,
  causeKey,
  causesConflict,
  clipLifetimes,
  measuringConflicts,
  startHiddenGlyphs,
  type Cause,
  type ClipLifetime,
  type SkipReason,
  type Span,
} from './lifetime';
import {
  EMPHASIS,
  glyphEnds,
  growsAsArrow,
  introsOf,
  isFittedRule,
  isGlyphEnd,
  KINDS,
  measuresOnly,
  namesArrowPart,
  placementTargets,
} from './kinds';
import { cameraMoveWindow, cameraRegionClashes, movesInOrder, type AnimationOwner } from './camera';
import { coverAt, markName, markStanding } from './slides';
import {
  FRAME_HEIGHT,
  MAX_CAMERA_HEIGHT,
  MAX_SCENE_SECONDS,
  MIN_CAMERA_HEIGHT,
  MIN_DASH_LENGTH,
  PATH_ARC_LIMIT,
} from './defaults';
import { placementUses, type PlacementOwner, type PlacementUse } from './placementRefs';
import { projectIdEntries } from './ids';
import { formulaGroupProblems, formulaGroupsOf } from './formulaGroups';
import { audioSourceEnd } from './audio';
import {
  glyphTransfers,
  isMorphKey,
  missingPrincipal,
  sourceRoles,
  type GlyphTransfer,
} from './transfers';
import {
  actionWindow,
  cameraEnd,
  clipWindow,
  contains,
  introWindow,
  outroWindow,
  overlaps,
  relationWindow,
  sceneDuration,
  TIME_EPSILON,
  type Window,
} from './time';
import type {
  ClipState,
  ActionId,
  CameraFrame,
  Clip,
  ClipAction,
  ClipId,
  Formula,
  GlyphPair,
  PathSpline,
  GlyphTarget,
  LineEnd,
  LineFormula,
  MathFormula,
  Project,
  RelationId,
  TexFormula,
  TextFormula,
} from './types';
import { TextFontSchema, TextGeometryRefSchema, TextSourceSchema } from './text';

export type Severity = 'error' | 'warning';

export type IssueCode =
  | 'duplicate-id'
  | 'color-match-id-repaired'
  | 'animation-group-repaired'
  | 'formula-group-repaired'
  | 'formula-group'
  | 'duplicate-name'
  | 'group-alignment'
  | 'invalid-layout'
  | 'invalid-text'
  | 'dangling-ref'
  | 'clip-length'
  | 'animation-duration'
  | 'clip-animations-overflow'
  | 'track-overlap'
  | 'track-kind'
  | 'audio-source-window'
  | 'audio-volume'
  | 'action-bounds'
  | 'action-overlap'
  | 'action-skips-glyphs'
  | 'action-empty'
  | 'intro-empty'
  | 'starts-empty-kind'
  | 'starts-empty-unused'
  | 'start-hidden-kind'
  | 'start-hidden-unused'
  | 'appear-consumed'
  | 'emphasis-target-busy'
  | 'relation-self'
  | 'relation-window'
  | 'relation-kind'
  | 'pair-empty'
  | 'pair-path'
  | 'path-arc'
  | 'pair-principal'
  | 'morph-both-sides'
  | 'missing-snapshot'
  | 'glyph-range'
  | 'target-conflict'
  | 'target-consumed'
  | 'source-arriving'
  | 'source-consumed-twice'
  | 'source-used-after-consumed'
  | 'source-hidden'
  | 'scene-duration'
  | 'scene-length'
  // The scene's camera (format 34).
  | 'camera-frame'
  | 'camera-move-overlap'
  | 'camera-region'
  // The marks of the Slides mode (format 35).
  | 'slide-mark-busy'
  | 'slide-mark-outside'
  | 'slide-mark-empty'
  | 'slide-mark-twice'
  | 'attach-self'
  | 'attach-empty'
  | 'attach-cycle'
  | 'attach-target-busy'
  | 'attach-target-gone'
  | 'attach-target-hidden'
  | 'attach-rule'
  | 'attach-shape-fit'
  | 'attach-line-ends'
  | 'fit-shape'
  | 'ends-line'
  | 'ends-degrees'
  | 'line-curve'
  | 'line-animation'
  | 'grow-arrow'
  | 'arrow-part'
  | 'line-pose'
  | 'line-dash'
  // Python export (export/codegen): what the generated code cannot guarantee.
  | 'export-positional'
  | 'export-glyph-count'
  | 'export-package'
  | 'export-hidden-track'
  | 'export-other-target'
  | 'export-snapping'
  | 'export-missing-render'
  | 'export-brace-sharpness'
  | 'export-text-other-library'
  | 'export-text-unchecked'
  | 'export-text-unshaped'
  // A mark of the Slides mode the frame grid put inside an animation: written at its nearer edge.
  | 'export-slide-mark'
  // What a scene with a camera cannot have as the preview shows it, or needs of its library.
  | 'export-camera'
  // The export dialog's own: what the editor cannot say of a font text now (ui/export/readiness).
  | 'export-text-fonts'
  // A project file whose `textGeometry` section could not be read as one (model/io.ts).
  | 'text-geometry-section'
  | 'export-empty';

/** Stable owner identity: array positions remain presentation-only issue paths. */
export type IssueSubject =
  | { kind: 'clip'; clipId: ClipId }
  | { kind: 'action'; clipId: ClipId; actionId: ActionId }
  | { kind: 'relation'; relationId: RelationId };

export interface IssueIdentity {
  subject: IssueSubject;
  /** Stable cause/transfer keys, sorted. Repeated keys count separate participating pairs. */
  participants: string[];
  /** Affected canonical glyphs, unique and sorted by clip ID then index. */
  glyphs: { clipId: ClipId; index: number }[];
}

export interface Issue {
  severity: Severity;
  code: IssueCode;
  message: string;
  /** Path to the offending value inside the project, e.g. ['clips', 3, 'end']. */
  path: (string | number)[];
  /** Semantic identity for comparing a candidate edit with existing repairable problems. */
  identity?: IssueIdentity;
}

export function hasErrors(issues: readonly Issue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

export function validateProject(project: Project): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Severity, code: IssueCode, message: string, path: Issue['path']) =>
    issues.push({ severity, code, message, path });

  checkIds(project, add);

  const formulas = new Map(project.formulas.map((f) => [f.id, f]));
  const tracks = new Set(project.tracks.map((t) => t.id));
  const trackKinds = new Map(project.tracks.map((t) => [t.id, t.kind]));
  const clips = new Map(project.clips.map((c) => [c.id, c]));

  // --- Formulas
  const names = new Map<string, number>();
  project.formulas.forEach((formula, fi) => {
    if (
      formula.intro &&
      (formula.intro.kind === 'none') !== formula.intro.duration <= TIME_EPSILON
    ) {
      add(
        'error',
        'animation-duration',
        'The intro duration must be 0 exactly when its kind is "none".',
        ['formulas', fi, 'intro', 'duration'],
      );
    }
    const first = names.get(formula.name);
    if (first !== undefined) {
      add('warning', 'duplicate-name', `Formula name "${formula.name}" is used more than once.`, [
        'formulas',
        fi,
        'name',
      ]);
    } else names.set(formula.name, fi);
    checkGlyphKeys(formula, formula.glyphColors, ['formulas', fi, 'glyphColors'], add);
    checkHiddenGlyphs(formula, ['formulas', fi, 'hiddenGlyphs'], add);
    // The rules of each kind of object (kinds.ts).
    switch (formula.kind) {
      case 'math':
        checkMathFormula(formula, fi, add);
        break;
      case 'tex':
        checkTexFormula(formula, fi, add);
        break;
      case 'text':
        checkTextFormula(formula, fi, add);
        break;
      case 'line':
        checkLineFormula(formula, fi, add);
        break;
      case 'brace':
      case 'shape':
        break; // their own fields are numbers the schema bounds
    }
  });

  checkFormulaGroups(project, add);

  // --- Clips
  project.clips.forEach((clip, ci) => {
    const base = ['clips', ci];
    const formula = formulas.get(clip.formulaId);
    if (!formula)
      add('error', 'dangling-ref', `Unknown formula "${clip.formulaId}".`, [...base, 'formulaId']);
    if (!tracks.has(clip.trackId))
      add('error', 'dangling-ref', `Unknown track "${clip.trackId}".`, [...base, 'trackId']);
    else if (trackKinds.get(clip.trackId) !== 'visual')
      add('error', 'track-kind', 'A visual clip needs a visual track.', [...base, 'trackId']);
    // A brace, a shape or a line is one piece: nothing brings a part of it in later.
    if (clip.startsEmpty && formula && !KINDS[formula.kind].transfers) {
      add(
        'error',
        'starts-empty-kind',
        `"${formula.name}" is a ${KINDS[formula.kind].label.toLowerCase()}: only a formula or a text can start empty.`,
        [...base, 'startsEmpty'],
      );
    }
    if (formula) checkStartHidden(clip, formula, [...base, 'startHidden'], add);

    const length = clip.end - clip.start;
    if (length <= TIME_EPSILON) {
      add('error', 'clip-length', 'A clip must end after it starts.', [...base, 'end']);
      return;
    }
    for (const which of ['intro', 'outro'] as const) {
      const spec = clip[which];
      if ((spec.kind === 'none') !== spec.duration <= TIME_EPSILON) {
        add(
          'error',
          'animation-duration',
          `The ${which} duration must be 0 exactly when its kind is "none".`,
          [...base, which, 'duration'],
        );
      }
    }
    if (clip.intro.duration + clip.outro.duration > length + TIME_EPSILON) {
      add('error', 'clip-animations-overflow', 'Intro and outro do not fit in the clip.', [
        ...base,
      ]);
    }

    const free: Window = { start: introWindow(clip).end, end: outroWindow(clip).start };
    // What places the clip by glyphs of other clips — its attachment, a tween's fit — names
    // another clip each time, with glyphs of its formula: each target of each, when it spans
    // several clips (`also`).
    const uses = placementUses(clip);
    const checkTargets = (use: PlacementUse | undefined): void => {
      for (const spot of use?.spots ?? []) {
        const words = OWNER_WORDS[use!.owner.kind];
        const at = [...base, ...spot.path];
        const { clipId, glyphs } = spot.target;
        const host = clips.get(clipId);
        if (!host) {
          add('error', 'dangling-ref', `Unknown clip "${clipId}".`, [...at, 'clipId']);
        } else if (host.id === clip.id) {
          add('error', 'attach-self', words.self(formula?.name ?? '?'), [...at, 'clipId']);
        }
        if (glyphs === 'all') continue;
        if (glyphs.length === 0) add('error', 'attach-empty', words.empty, [...at, 'glyphs']);
        checkIndices(host && formulas.get(host.formulaId), glyphs, [...at, 'glyphs'], add);
      }
    };
    clip.actions.forEach((action, ai) => {
      const w = actionWindow(clip, action);
      if (action.kind === 'tween' && !contains(free, w)) {
        add(
          'error',
          'action-bounds',
          'A tween must lie between the end of the intro and the start of the outro.',
          [...base, 'actions', ai],
        );
      } else if (action.kind !== 'tween' && !contains(clipWindow(clip), w)) {
        add('error', 'action-bounds', 'An animation block must lie inside its clip.', [
          ...base,
          'actions',
          ai,
        ]);
      }
      if (action.kind === 'tween') {
        if (formula && action.to.glyphColors) {
          checkGlyphKeys(
            formula,
            action.to.glyphColors,
            [...base, 'actions', ai, 'to', 'glyphColors'],
            add,
          );
        }
        // A tween that carries a shape to other glyphs: a shape's alone, and its target — each
        // of them, when it spans several clips — is another clip, with glyphs of its formula.
        if (action.fit) {
          const at = [...base, 'actions', ai, 'fit'];
          if (formula && formula.kind !== 'shape') {
            add(
              'error',
              'fit-shape',
              `"${formula.name}" is not a shape: only a shape's Transform can carry it to other glyphs.`,
              at,
            );
          }
          checkTargets(uses.find((use) => use.owner.kind === 'fit' && use.owner.index === ai));
        }
        // A tween that carries the ends of a line: a line's alone; each end on glyphs is on
        // another clip's; and only an arc has degrees to change — not a dashed one, whose dashes
        // are carried as they are.
        if (action.ends) {
          const at = [...base, 'actions', ai, 'ends'];
          if (formula && formula.kind !== 'line') {
            add(
              'error',
              'ends-line',
              `"${formula.name}" is not a line: only a line's Transform can carry its ends.`,
              at,
            );
          } else if (
            formula?.kind === 'line' &&
            action.ends.degrees !== null &&
            (formula.curve?.shape !== 'arc' || formula.line === 'dashed')
          ) {
            add(
              'error',
              'ends-degrees',
              formula.line === 'dashed'
                ? `"${formula.name}" is a dashed line: a Transform carries its dashes as they are, and cannot change the degrees of its arc.`
                : `"${formula.name}" is not an arc: its Transform has no degrees to change.`,
              [...at, 'degrees'],
            );
          }
          checkTargets(uses.find((use) => use.owner.kind === 'ends' && use.owner.index === ai));
          checkEndHosts(
            clip,
            action.ends,
            at,
            `The Transform of "${formula?.name ?? '?'}" puts an end on`,
            { clips, formulas },
            add,
          );
        }
      } else if (action.kind === 'morph') {
        checkPathArc(action.pathArc, [...base, 'actions', ai, 'pathArc'], add);
        action.pairs.forEach((pair, pi) => {
          const path = [...base, 'actions', ai, 'pairs', pi];
          if (pair.from.length === 0 || pair.to.length === 0) {
            add('error', 'pair-empty', 'Both sides of a glyph pair need at least one glyph.', path);
          }
          checkIndices(formula, pair.from, [...path, 'from'], add);
          checkIndices(formula, pair.to, [...path, 'to'], add);
          checkPath(pair, path, add);
          checkPrincipal(pair, path, add);
        });
        const sources = new Set(action.pairs.flatMap((p) => p.from));
        const both = [...new Set(action.pairs.flatMap((p) => p.to))]
          .filter((g) => sources.has(g))
          .sort((x, y) => x - y);
        if (both.length > 0) {
          add(
            'error',
            'morph-both-sides',
            `The Morph block has ${glyphList(both)} of "${formula?.name ?? '?'}" on both sides: a glyph cannot be a source and a target of the same block.`,
            [...base, 'actions', ai],
          );
        }
      } else if (action.glyphs !== 'all') {
        checkIndices(formula, action.glyphs, [...base, 'actions', ai, 'glyphs'], add);
      }
    });
    if (formula)
      checkGlyphKeys(formula, clip.initial.glyphColors, [...base, 'initial', 'glyphColors'], add);

    // `GrowArrow` grows an arrow from its start: nothing else has one (D145).
    if (formula && !growsAsArrow(formula)) {
      const at =
        clip.intro.kind === 'grow_arrow'
          ? [...base, 'intro', 'kind']
          : clip.actions.flatMap((action, ai) =>
              action.kind === 'appear' && action.anim === 'grow_arrow'
                ? [[...base, 'actions', ai, 'anim']]
                : [],
            )[0];
      if (at && formula.kind !== 'line') {
        add(
          'error',
          'grow-arrow',
          `"${formula.name}" is no arrow: GrowArrow grows an arrow or a double arrow from its start.`,
          at,
        );
      }
    }

    // A line is drawn or faded, never grown or shrunk, and has no scale, turn or flip of its own:
    // its two ends say where it is. ManimCE's `Arrow` keeps the size of its tip when it is scaled,
    // so nothing that scales a line would look alike in the two libraries.
    if (formula?.kind === 'line') {
      const grows = (anim: string) => anim === 'grow_from_center' || anim === 'shrink_to_center';
      for (const which of ['intro', 'outro'] as const) {
        const spec = clip[which];
        const fade = spec.kind === 'fade_in' || spec.kind === 'fade_out';
        const kinds: readonly string[] = which === 'intro' ? introsOf(formula) : KINDS.line.outros;
        if (!kinds.includes(spec.kind) || (fade && spec.scale !== 1)) {
          add(
            'error',
            'line-animation',
            `"${formula.name}" is a line: it is drawn or faded ${which === 'intro' ? 'in' : 'out'} at its own size (Create, Write, Fade without a scale), not grown or shrunk.`,
            [...base, which, 'kind'],
          );
        }
      }
      const posed = (state: Partial<ClipState>) =>
        (state.scale !== undefined && state.scale !== 1) ||
        (state.rotation !== undefined && state.rotation !== 0) ||
        state.flipX === true ||
        state.flipY === true;
      if (posed(clip.initial)) {
        add(
          'error',
          'line-pose',
          `"${formula.name}" is a line: it has no scale, turn or flip of its own. Move its ends instead.`,
          [...base, 'initial'],
        );
      }
      clip.actions.forEach((action, ai) => {
        const at = [...base, 'actions', ai];
        if (action.kind === 'tween' && posed(action.to)) {
          add(
            'error',
            'line-pose',
            `A Transform of "${formula.name}" scales, turns or flips it: a line is moved and repainted only.`,
            [...at, 'to'],
          );
        } else if (
          action.kind === 'transform' ||
          action.kind === 'morph' ||
          ((action.kind === 'appear' || action.kind === 'disappear') && grows(action.anim)) ||
          (action.kind === 'appear' && action.anim === 'grow_arrow' && !growsAsArrow(formula)) ||
          (action.kind === 'emphasis' && EMPHASIS[action.effect].animates)
        ) {
          add(
            'error',
            'line-animation',
            `"${formula.name}" is a line: this block would scale or reshape it, which the two libraries do not do alike.`,
            at,
          );
        }
        // A block animates an arrow whole: the Python names its shaft by the arrow itself, whose
        // family holds its tips, so a part of it would play in the preview and the whole of it in
        // the video (`animatedWhole`, audit A5-07).
        if (action.kind !== 'tween' && action.kind !== 'morph') {
          if (namesArrowPart(formula, action.glyphs)) {
            const noun = formula.line === 'double_arrow' ? 'a double arrow' : 'an arrow';
            add(
              'error',
              'arrow-part',
              `"${formula.name}" is ${noun}: a block animates it whole, its shaft and its tips together, as Manim does, and this one names a part of it. Set its glyphs to all with All glyphs in its panel.`,
              [...at, 'glyphs'],
            );
          }
        }
      });
    }

    // An attached object: its target exists and is another clip, with glyphs of its formula —
    // each of them, when a brace or a shape spans glyphs of several clips (`also`).
    if (clip.attach) {
      checkTargets(uses.find((use) => use.owner.kind === 'attach'));
      // A line's attachment has an end on glyphs — with both ends free it would have nothing to
      // hang on —, and its ends are on formulas and texts: not on what is itself fitted to
      // others (a brace, a shape, another line).
      if (clip.attach.rule === 'ends') {
        if (glyphEnds(clip.attach).length === 0) {
          add('error', 'attach-empty', 'The attachment of a line needs an end on glyphs.', [
            ...base,
            'attach',
          ]);
        }
        checkEndHosts(
          clip,
          clip.attach,
          [...base, 'attach'],
          `"${formula?.name ?? '?'}" has an end on`,
          { clips, formulas },
          add,
        );
      }
      // A brace hangs on its target with the brace rule, a shape with the shape rule, a line by
      // its ends, and nothing else does.
      const fitted = formula && KINDS[formula.kind].fitted;
      if (formula && (fitted ? clip.attach.rule !== fitted : isFittedRule(clip.attach.rule))) {
        const noun = KINDS[formula.kind].label.toLowerCase();
        add(
          'error',
          'attach-rule',
          fitted
            ? `"${formula.name}" is a ${noun}: it attaches with the ${fitted} rule.`
            : `"${formula.name}" is not a ${clip.attach.rule}: it cannot attach with the ${clip.attach.rule} rule.`,
          [...base, 'attach', 'rule'],
        );
      }
      // A label hangs at the tip of a brace: its target is a brace's clip.
      const target = clip.attach.rule === 'tip' ? clips.get(clip.attach.clipId) : undefined;
      const targetFormula = target && formulas.get(target.formulaId);
      if (clip.attach.rule === 'tip' && targetFormula && targetFormula.kind !== 'brace') {
        add(
          'error',
          'attach-rule',
          `"${formula?.name ?? '?'}" hangs at the tip of a brace, but "${targetFormula.name}" is not a brace.`,
          [...base, 'attach', 'clipId'],
        );
      }
    }
  });

  // Clips on one track cannot overlap: one that starts while any other is still on is told so,
  // not only the one after its neighbour (a clip can lie inside another, apart from the next).
  for (const trackId of tracks) {
    const onTrack = project.clips
      .map((clip, ci) => ({ clip, ci }))
      .filter(({ clip }) => clip.trackId === trackId)
      .sort((a, b) => a.clip.start - b.clip.start);
    let occupiedUntil = -Infinity;
    for (const { clip, ci } of onTrack) {
      if (clip.start < occupiedUntil - TIME_EPSILON) {
        add('error', 'track-overlap', 'Clips on the same track cannot overlap.', [
          'clips',
          ci,
          'start',
        ]);
      }
      occupiedUntil = Math.max(occupiedUntil, clip.end);
    }
  }

  // --- Audio: source windows and volume points stay independent of visual animations.
  const assets = new Map(project.audioAssets.map((asset) => [asset.id, asset]));
  project.audioClips.forEach((clip, ci) => {
    const base = ['audioClips', ci];
    const asset = assets.get(clip.assetId);
    if (!asset)
      add('error', 'dangling-ref', `Unknown audio source "${clip.assetId}".`, [...base, 'assetId']);
    if (!tracks.has(clip.trackId))
      add('error', 'dangling-ref', `Unknown track "${clip.trackId}".`, [...base, 'trackId']);
    else if (trackKinds.get(clip.trackId) !== 'audio')
      add('error', 'track-kind', 'An audio clip needs an audio track.', [...base, 'trackId']);
    if (clip.end - clip.start <= TIME_EPSILON)
      add('error', 'clip-length', 'An audio clip must end after it starts.', [...base, 'end']);
    if (asset && audioSourceEnd(clip) > asset.duration + TIME_EPSILON)
      add('error', 'audio-source-window', 'The clip extends beyond its original audio source.', [
        ...base,
        'end',
      ]);
    clip.volume.forEach((point, pi) => {
      if (pi > 0 && point.time <= clip.volume[pi - 1]!.time)
        add('error', 'audio-volume', 'Volume points need unique, increasing source times.', [
          ...base,
          'volume',
          pi,
          'time',
        ]);
      if (asset && point.time > asset.duration + TIME_EPSILON)
        add('error', 'audio-volume', 'A volume point extends beyond its original audio source.', [
          ...base,
          'volume',
          pi,
          'time',
        ]);
    });
  });
  for (const trackId of tracks) {
    const onTrack = project.audioClips
      .map((clip, ci) => ({ clip, ci }))
      .filter(({ clip }) => clip.trackId === trackId)
      .sort((a, b) => a.clip.start - b.clip.start);
    let occupiedUntil = -Infinity;
    for (const { clip, ci } of onTrack) {
      if (clip.start < occupiedUntil - TIME_EPSILON)
        add('error', 'track-overlap', 'Audio clips on the same track cannot overlap.', [
          'audioClips',
          ci,
          'start',
        ]);
      occupiedUntil = Math.max(occupiedUntil, clip.end);
    }
  }

  // --- Relations. Two clips can have several (format 31): what keeps them apart is what each
  // glyph may do, whatever relation it does it through (`transferOwnershipIssues`, below).
  project.relations.forEach((relation, ri) => {
    const base = ['relations', ri];
    const from = clips.get(relation.fromClipId);
    const to = clips.get(relation.toClipId);
    if (!from)
      add('error', 'dangling-ref', `Unknown clip "${relation.fromClipId}".`, [
        ...base,
        'fromClipId',
      ]);
    if (!to)
      add('error', 'dangling-ref', `Unknown clip "${relation.toClipId}".`, [...base, 'toClipId']);
    if (relation.fromClipId === relation.toClipId) {
      add('error', 'relation-self', 'A relation must connect two different clips.', base);
    }
    checkPathArc(relation.pathArc, [...base, 'pathArc'], add);
    if (!from || !to) return;

    const window = relationWindow(relation, to);
    const sourceRange: Window = { start: introWindow(from).end, end: from.end };
    const targetRange: Window = { start: to.start, end: outroWindow(to).start };
    if (!contains(sourceRange, window) || !contains(targetRange, window)) {
      add(
        'error',
        'relation-window',
        'The relation window must fit between the source intro and source end, and between the target start and target outro.',
        [...base, 'offset'],
      );
    }

    const fromFormula = formulas.get(from.formulaId);
    const toFormula = formulas.get(to.formulaId);
    // A brace, a shape or a line is one piece, whose glyphs no relation sends or receives: the
    // editor makes no such relation. One a saved project has keeps playing as it is, as a part
    // Transform or a Morph block of one does (D123): a warning, which says what to do with it.
    const piece = [fromFormula, toFormula].find((f) => f !== undefined && !KINDS[f.kind].transfers);
    if (piece) {
      add(
        'warning',
        'relation-kind',
        `"${piece.name}" is a ${KINDS[piece.kind].label.toLowerCase()}, one piece: a relation is between formulas and texts. This one still plays and exports, but it cannot be edited; delete it with Delete relation in the menu of its band on the timeline.`,
        base,
      );
    }
    relation.pairs.forEach((pair, pi) => {
      const path = [...base, 'pairs', pi];
      if (pair.from.length === 0 || pair.to.length === 0) {
        add('error', 'pair-empty', 'Both sides of a glyph pair need at least one glyph.', path);
      }
      checkIndices(fromFormula, pair.from, [...path, 'from'], add);
      checkIndices(toFormula, pair.to, [...path, 'to'], add);
      checkPath(pair, path, add);
      checkPrincipal(pair, path, add);
    });
  });

  // --- Glyph ownership over every transfer (relations and morph blocks alike).
  const transferList = glyphTransfers(project);
  for (const issue of transferOwnershipIssues(project, transferList)) issues.push(issue);

  // --- Glyph lifetime: what each action animates, and what else animates the same glyphs.
  const lifetimes = clipLifetimes(project);
  const transfers = new Map(transferList.map((t) => [t.key, t]));
  project.clips.forEach((clip, ci) => {
    const life = lifetimes.get(clip.id);
    if (!life) return;
    for (const issue of clipLifetimeIssues(project, ci, life, transfers)) issues.push(issue);
  });
  for (const issue of attachIssues(project, lifetimes, transfers)) issues.push(issue);

  // --- Scene
  const lastEnd = project.audioClips.reduce(
    (end, c) => Math.max(end, c.end),
    project.clips.reduce((end, c) => Math.max(end, c.end), 0),
  );
  if (project.meta.duration !== null && project.meta.duration < lastEnd - TIME_EPSILON) {
    add('warning', 'scene-duration', 'The scene ends before the last clip does.', [
      'meta',
      'duration',
    ]);
  }
  if (project.meta.duration !== null && project.meta.duration < cameraEnd(project) - TIME_EPSILON) {
    add('warning', 'scene-duration', 'The scene ends before the last camera move does.', [
      'meta',
      'duration',
    ]);
  }
  // A scene is a day long at most (`MAX_SCENE_SECONDS`): a time past it is a number of a file,
  // which nothing here should lay out, count or label second by second.
  const tooLong = (seconds: number) => !(seconds <= MAX_SCENE_SECONDS);
  const lengthError = (what: string, seconds: number, path: Issue['path']) =>
    add(
      'error',
      'scene-length',
      `${what} at ${seconds} s: a scene is at most 24 hours (${MAX_SCENE_SECONDS} s) long.`,
      path,
    );
  if (project.meta.duration !== null && tooLong(project.meta.duration)) {
    lengthError('The scene ends', project.meta.duration, ['meta', 'duration']);
  }
  project.clips.forEach((clip, ci) => {
    if (tooLong(clip.end)) lengthError('The clip ends', clip.end, ['clips', ci, 'end']);
  });
  project.audioClips.forEach((clip, ci) => {
    if (tooLong(clip.end)) lengthError('The sound ends', clip.end, ['audioClips', ci, 'end']);
  });
  project.camera?.moves.forEach((move, mi) => {
    const { end } = cameraMoveWindow(move);
    if (tooLong(end)) lengthError('The camera move ends', end, ['camera', 'moves', mi, 'duration']);
  });

  checkCamera(project, add);
  issues.push(...cameraRegionIssues(project));
  issues.push(...slideMarkIssues(project));

  return issues;
}

/** The rules of the marks of the Slides mode (format 35, `slides.ts`): a mark stands where nothing
 * animates and within the scene, a comment says something, and the scene stops once at an
 * instant. All of them warnings: the scene is whole without its marks, so a mark out of place
 * holds no export back — the exports leave it out —, and the editor asks about it when the edit
 * that covered it is made (`ui/slides/`). A section of `validateProject` on its own. */
export function slideMarkIssues(project: Project): Issue[] {
  const marks = project.slides?.marks ?? [];
  if (marks.length === 0) return [];
  const issues: Issue[] = [];
  const add = (code: IssueCode, message: string, path: Issue['path']) =>
    issues.push({ severity: 'warning', code, message, path });
  const end = `${+sceneDuration(project).toFixed(3)} s`;
  const pauses: number[] = [];
  marks.forEach((mark, mi) => {
    const path: Issue['path'] = ['slides', 'marks', mi];
    const name = markName(mark);
    const standing = markStanding(project, mark);
    if (standing === 'busy') {
      add(
        'slide-mark-busy',
        `${name} is where ${markCoverName(project, mark.time)} runs: a mark stands where nothing animates, and the exports leave this one out. Move it or delete it.`,
        [...path, 'time'],
      );
    } else if (standing === 'outside') {
      add(
        'slide-mark-outside',
        `${name} is past the end of the scene (${end}): the exports leave it out. Move it or delete it.`,
        [...path, 'time'],
      );
    }
    if (mark.kind === 'comment' && (mark.text ?? '').trim() === '') {
      add('slide-mark-empty', `${name} has no words: write it, or delete it.`, [...path, 'text']);
    }
    if (mark.kind === 'pause') {
      if (pauses.some((time) => Math.abs(time - mark.time) <= TIME_EPSILON)) {
        add(
          'slide-mark-twice',
          `There are two pauses at ${+mark.time.toFixed(3)} s: the scene stops there once. Delete one.`,
          [...path, 'time'],
        );
      }
      pauses.push(mark.time);
    }
  });
  return issues;
}

/** What animates at `t`, inside a sentence: «the intro of "a"», «the relation "a" → "b"», «a
 * camera move»; «an animation» where nothing does (`coverAt`). */
export function markCoverName(project: Project, t: number): string {
  const cover = coverAt(project, t);
  if (!cover) return 'an animation';
  if (cover.kind === 'camera') return 'a camera move';
  return animationOwnerName(project, cover.owner).replace(/^(The|A) /, (m) => m.toLowerCase());
}

/** The locked region of the scene's camera (D190, `cameraRegionClashes`): an animation that runs
 * while the camera moves is an error, on the animation. A section of `validateProject` on its own
 * because the planner of blocks asks it of a candidate position (`timingIssues`, `conflicts.ts`):
 * with `clipIds`, of the animations of those clips alone. */
export function cameraRegionIssues(project: Project, clipIds?: ReadonlySet<ClipId>): Issue[] {
  const clashes = cameraRegionClashes(project, clipIds);
  if (clashes.length === 0) return [];
  const seconds = (t: number) => `${+t.toFixed(3)} s`;
  return clashes.map(({ animation, move }): Issue => {
    const { owner } = animation;
    let subject: IssueSubject;
    const participants = [`camera:${move.id}`];
    if (owner.kind === 'relation') {
      subject = { kind: 'relation', relationId: owner.relationId };
    } else if (owner.kind === 'action') {
      subject = { kind: 'action', clipId: owner.clipId, actionId: owner.actionId };
    } else {
      subject = { kind: 'clip', clipId: owner.clipId };
      participants.push(owner.kind);
    }
    const { start, end } = cameraMoveWindow(move);
    return {
      severity: 'error',
      code: 'camera-region',
      message: `${animationOwnerName(project, owner)} runs while the camera moves (${seconds(start)} – ${seconds(end)}): nothing else animates during a camera move. Move one of the two, or make it shorter.`,
      path: animation.path,
      identity: { subject, participants: participants.sort(), glyphs: [] },
    };
  });
}

/** A `camera-region` issue in the words of an edit that runs into it — a block or an intro that
 * stops there, a menu that asks before going on —: when the camera moves, not the rule in full.
 * Null for any other issue, and for one whose move is not in `project`. */
export function cameraClashSentence(project: Pick<Project, 'camera'>, issue: Issue): string | null {
  if (issue.code !== 'camera-region') return null;
  const id = issue.identity?.participants
    .find((participant) => participant.startsWith('camera:'))
    ?.slice('camera:'.length);
  const move = project.camera?.moves.find((m) => m.id === id);
  if (!move) return null;
  const seconds = (t: number) => `${t.toFixed(2)} s`;
  return `The camera moves from ${seconds(move.start)} to ${seconds(move.start + move.duration)}, and nothing else animates while it does.`;
}

/** What animates in a window of time, as the subject of a sentence: «The relation "a" → "b"»,
 * «The Write block of "a"», «The intro of "a"». */
export function animationOwnerName(project: Project, owner: AnimationOwner): string {
  const clips = new Map(project.clips.map((clip) => [clip.id, clip]));
  const formulas = new Map(project.formulas.map((formula) => [formula.id, formula]));
  const nameOf = (clipId: ClipId) =>
    `"${formulas.get(clips.get(clipId)?.formulaId ?? '')?.name ?? clipId}"`;
  if (owner.kind === 'relation') {
    const relation = project.relations.find((r) => r.id === owner.relationId);
    return relation
      ? `The relation ${nameOf(relation.fromClipId)} → ${nameOf(relation.toClipId)}`
      : 'A relation';
  }
  if (owner.kind === 'action') {
    const action = clips.get(owner.clipId)?.actions.find((a) => a.id === owner.actionId);
    return `${action ? blockName(action) : 'A block'} of ${nameOf(owner.clipId)}`;
  }
  return `The ${owner.kind} of ${nameOf(owner.clipId)}`;
}

/** The rules of the scene's camera (format 34): every frame of it within the bounds of a camera,
 * a move's target camera one of the project's, and no two moves at once (they may touch). */
function checkCamera(project: Project, add: Add): void {
  const camera = project.camera;
  if (!camera) return;
  const checkFrame = (frame: CameraFrame, path: Issue['path']) => {
    if (frame.height >= MIN_CAMERA_HEIGHT && frame.height <= MAX_CAMERA_HEIGHT) return;
    add(
      'error',
      'camera-frame',
      `A camera’s frame is ${MIN_CAMERA_HEIGHT} to ${MAX_CAMERA_HEIGHT} units tall (a zoom of ${zoomPercent(MIN_CAMERA_HEIGHT)} % to ${zoomPercent(MAX_CAMERA_HEIGHT)} %); this one is ${frame.height}.`,
      [...path, 'height'],
    );
  };
  checkFrame(camera.initial, ['camera', 'initial']);
  const names = new Set<string>();
  camera.targets.forEach((target, ti) => {
    checkFrame(target, ['camera', 'targets', ti]);
    if (names.has(target.name)) {
      add(
        'warning',
        'duplicate-name',
        `Target camera name "${target.name}" is used more than once.`,
        ['camera', 'targets', ti, 'name'],
      );
    }
    names.add(target.name);
  });
  const targets = new Set(camera.targets.map((target) => target.id));
  camera.moves.forEach((move, mi) => {
    const path: Issue['path'] = ['camera', 'moves', mi, 'to'];
    if (move.to.kind === 'frame') checkFrame(move.to.frame, [...path, 'frame']);
    if (move.to.kind === 'target' && !targets.has(move.to.target)) {
      add('error', 'dangling-ref', `Unknown target camera "${move.to.target}".`, [
        ...path,
        'target',
      ]);
    }
  });
  // In the order they run: a move that starts before the ones before it have ended.
  let busyUntil = -Infinity;
  for (const move of movesInOrder(camera)) {
    const window = cameraMoveWindow(move);
    if (window.start < busyUntil - TIME_EPSILON) {
      add('error', 'camera-move-overlap', 'Camera moves cannot overlap.', [
        'camera',
        'moves',
        camera.moves.indexOf(move),
        'start',
      ]);
    }
    busyUntil = Math.max(busyUntil, window.end);
  }
}

/** The zoom the app shows for a frame `height` units tall, in per cent. */
function zoomPercent(height: number): number {
  return Math.round((FRAME_HEIGHT / height) * 100);
}

/** The glyph-ownership rules over every transfer (relations and morph blocks alike): a target
 * arrives through one pair — or through several of one transfer that bring exactly the same
 * targets (a join taken apart, D167) —, and never after a pair consumed it; a source is consumed
 * once, and copied only before that. Messages name the Morph block when the pair is one of its. A section of
 * `validateProject` on its own because these rules depend on when the transfers play: the timing
 * planner (`actionConflicts`, `conflicts.ts`) asks it of a candidate position of a block. */
export function transferOwnershipIssues(
  project: Project,
  transferList: readonly GlyphTransfer[] = glyphTransfers(project),
): Issue[] {
  const issues: Issue[] = [];
  const add: Add = (severity, code, message, path, identity) =>
    issues.push({ severity, code, message, path, ...(identity ? { identity } : {}) });
  const formulas = new Map(project.formulas.map((f) => [f.id, f]));
  const clips = new Map(project.clips.map((c) => [c.id, c]));
  const formulaOf = (clipId: string) => formulas.get(clips.get(clipId)?.formulaId ?? '')?.name;
  const glyphOf = (clipId: string, g: number) => {
    const name = formulaOf(clipId);
    return name === undefined ? `glyph ${g}` : `glyph ${g} of "${name}"`;
  };
  const isMorph = (transfer: GlyphTransfer) => transfer.origin.kind === 'morph';
  /** clipId:glyph → every incoming owner, including repeated pairs of one transfer. */
  const incoming = new Map<
    string,
    { transfer: GlyphTransfer; path: Issue['path']; glyph: number; targets: string }[]
  >();
  /** clipId:glyph → uses as a source, in transfer order */
  const sourceUses = new Map<
    string,
    { transfer: GlyphTransfer; window: Window; consumes: boolean; path: Issue['path'] }[]
  >();
  for (const transfer of transferList) {
    const window: Window = { start: transfer.start, end: transfer.end };
    transfer.pairs.forEach((pair, pi) => {
      const path = [...transfer.path, 'pairs', pi];
      const targets = [...new Set(pair.to)].sort((a, b) => a - b).join(',');
      for (const g of new Set(pair.to)) {
        const k = `${transfer.toClipId}:${g}`;
        const owners = incoming.get(k) ?? [];
        owners.push({ transfer, path: [...path, 'to'], glyph: g, targets });
        incoming.set(k, owners);
      }
      const roles = sourceRoles(pair, pair.style);
      for (const g of new Set(pair.from)) {
        const k = `${transfer.fromClipId}:${g}`;
        const uses = sourceUses.get(k) ?? [];
        uses.push({
          transfer,
          window,
          consumes: roles.consumed.includes(g),
          path: [...path, 'from'],
        });
        sourceUses.set(k, uses);
      }
    });
  }

  for (const owners of incoming.values()) {
    if (owners.length < 2) continue;
    // Pairs of one transfer with the same targets bring them together: the first to play
    // brings the glyphs, the others arrive onto them.
    const first = owners[0]!;
    const other = owners.find((o) => o.transfer !== first.transfer || o.targets !== first.targets);
    if (!other) continue;
    const { transfer, path, glyph } = other;
    const apart = other.transfer === first.transfer;
    add(
      'error',
      'target-conflict',
      apart
        ? `${isMorph(transfer) ? 'The Morph block' : 'The relation'} brings in ${glyphOf(transfer.toClipId, glyph)} through pairs with different targets: pairs that share a target must bring the same glyphs.`
        : isMorph(transfer)
          ? `The Morph block brings in ${glyphOf(transfer.toClipId, glyph)}, which another pair brings in too.`
          : `Target ${glyphOf(transfer.toClipId, glyph)} is brought in by more than one pair.`,
      path,
      diagnosticIdentity(
        { kind: 'clip', clipId: transfer.toClipId },
        owners.map((o) => o.transfer.key),
        transfer.toClipId,
        [glyph],
      ),
    );
  }

  /** clipId:glyph → when the pair that consumes the glyph starts. */
  const consumedAt = new Map<string, number>();
  for (const [key, uses] of sourceUses) {
    const clipId = key.slice(0, key.lastIndexOf(':'));
    const glyph = Number(key.slice(key.lastIndexOf(':') + 1));
    const who = glyphOf(clipId, glyph);
    // The pair that consumes later in time is the one to blame.
    const consuming = uses
      .filter((u) => u.consumes)
      .sort((a, b) => a.window.start - b.window.start);
    if (consuming.length > 1) {
      const late = consuming[1]!;
      add(
        'error',
        'source-consumed-twice',
        isMorph(late.transfer)
          ? `The Morph block consumes ${who}, which another pair consumes too.`
          : `Source ${who} is consumed by more than one pair.`,
        late.path,
        diagnosticIdentity(
          { kind: 'clip', clipId },
          consuming.map((u) => u.transfer.key),
          clipId,
          [glyph],
        ),
      );
    }
    const consumer = consuming[0];
    if (!consumer) continue;
    consumedAt.set(key, consumer.window.start);
    for (const use of uses) {
      if (!use.consumes && use.window.start > consumer.window.start + TIME_EPSILON) {
        add(
          'error',
          'source-used-after-consumed',
          isMorph(use.transfer)
            ? `The Morph block copies ${who} after it was consumed.`
            : `Source ${who} is copied after it was consumed.`,
          use.path,
          diagnosticIdentity(
            transferSubject(use.transfer),
            [
              use.transfer.key,
              ...consuming
                .filter((u) => u.window.start < use.window.start - TIME_EPSILON)
                .map((u) => u.transfer.key),
            ],
            clipId,
            [glyph],
          ),
        );
      }
    }
  }
  // A consumed glyph is part of other glyphs now: no pair brings it back.
  for (const transfer of transferList) {
    transfer.pairs.forEach((pair, pi) => {
      for (const g of new Set(pair.to)) {
        const when = consumedAt.get(`${transfer.toClipId}:${g}`);
        if (when === undefined || when > transfer.start + TIME_EPSILON) continue;
        add(
          'error',
          'target-consumed',
          `${isMorph(transfer) ? 'The Morph block' : 'The relation'} cannot bring back ${glyphOf(transfer.toClipId, g)}: a relation or a Morph block turned it into other glyphs.`,
          [...transfer.path, 'pairs', pi, 'to'],
          diagnosticIdentity(
            transferSubject(transfer),
            [
              transfer.key,
              ...consumingParticipants(transferList, transfer.toClipId, [g], transfer.start),
            ],
            transfer.toClipId,
            [g],
          ),
        );
      }
    });
  }
  return issues;
}

/** What the lifetime of one clip (`life`, its entry of `clipLifetimes`) says of its blocks and
 * transfer pairs: glyphs an action leaves out or cannot bring back, an intro left with nothing to
 * do, two animations on one glyph at the same time, a source not on screen or still arriving when
 * its pair starts. `transfers` is every transfer of the project by key (the paths and names of
 * Morph blocks). A section of `validateProject` on its own for the timing planner, which
 * simulates the clip's lifetime at a candidate position itself. */
export function clipLifetimeIssues(
  project: Project,
  clipIndex: number,
  life: ClipLifetime,
  transfers: ReadonlyMap<string, GlyphTransfer>,
): Issue[] {
  const clip = project.clips[clipIndex];
  const formula = clip && project.formulas.find((f) => f.id === clip.formulaId);
  if (!clip || !formula) return [];
  const ci = clipIndex;
  const issues: Issue[] = [];
  const add: Add = (severity, code, message, path, identity) =>
    issues.push({ severity, code, message, path, ...(identity ? { identity } : {}) });
  const actionIndex = new Map(clip.actions.map((a, ai) => [a.id, ai]));
  const pathOf = (cause: Cause): Issue['path'] => {
    if (cause.kind === 'action') return ['clips', ci, 'actions', actionIndex.get(cause.actionId)!];
    if (cause.kind === 'transfer' && isMorphKey(cause.key)) {
      return transfers.get(cause.key)?.path ?? ['clips', ci];
    }
    return ['clips', ci];
  };

  clip.actions.forEach((action, ai) => {
    if (action.kind === 'tween') return;
    const result = life.actions.get(action.id);
    if (!result) return;
    const path = ['clips', ci, 'actions', ai];
    const name = blockName(action);
    const consumed = result.skipped.filter((s) => s.reason === 'consumed').map((s) => s.glyph);
    if (consumed.length > 0) {
      add(
        'error',
        'appear-consumed',
        `${name} cannot bring back ${glyphList(consumed)} of "${formula.name}": a relation or a Morph block turned ${consumed.length === 1 ? 'it' : 'them'} into other glyphs.`,
        path,
        diagnosticIdentity(
          { kind: 'action', clipId: clip.id, actionId: action.id },
          [
            `action:${clip.id}:${action.id}`,
            ...consumingParticipants(
              transfers.values(),
              clip.id,
              consumed,
              actionWindow(clip, action).start,
            ),
          ],
          clip.id,
          consumed,
        ),
      );
    }
    for (const reason of ['on-screen', 'off-screen', 'arrives-later'] as const) {
      const skipped = result.skipped.filter((s) => s.reason === reason).map((s) => s.glyph);
      if (skipped.length === 0) continue;
      add(
        'warning',
        'action-skips-glyphs',
        `${name} leaves out ${glyphList(skipped)} of "${formula.name}": ${SKIP_TEXT[reason](skipped.length === 1)}.`,
        path,
      );
    }
    if (result.glyphs.length === 0) {
      add('warning', 'action-empty', `${name} animates no glyph of "${formula.name}".`, path);
    }
    // An effect that only measures its glyphs when it starts (a Circumscribe's frame, the centre
    // a Flash or a FocusOn aims at) must not find them half drawn then, like an attached object.
    if (measuresOnly(action)) {
      const start = actionWindow(clip, action).start;
      for (const { cause, glyphs } of measuringConflicts(clip, life, result.glyphs, start)) {
        add(
          'error',
          'emphasis-target-busy',
          `${name} starts while ${describeCause(cause, clip, transfers)} is still animating ${glyphList(glyphs)} of "${formula.name}" (at ${+start.toFixed(3)} s): Manim would measure ${glyphs.length === 1 ? 'it' : 'them'} half drawn. Start it once that has ended, or before it starts.`,
          path,
          diagnosticIdentity(
            { kind: 'action', clipId: clip.id, actionId: action.id },
            [`action:${clip.id}:${action.id}`, participantKey(cause, clip.id)],
            clip.id,
            glyphs,
          ),
        );
      }
    }
  });

  // A clip that starts empty and that nothing ever fills never shows.
  if (clip.startsEmpty && life.glyphs.length > 0 && life.stints.size === 0) {
    add(
      'warning',
      'starts-empty-unused',
      `"${formula.name}" starts empty and nothing brings its glyphs in (a relation, a Morph block or an Appear block): this clip never shows.`,
      ['clips', ci, 'startsEmpty'],
    );
  } else if (
    (clip.startHidden?.length ?? 0) > 0 &&
    life.glyphs.length > 0 &&
    life.stints.size === 0
  ) {
    // So does one that leaves glyphs out of its intro itself, when no glyph of it ever comes.
    add(
      'warning',
      'start-hidden-unused',
      `"${formula.name}" leaves its glyphs out of its intro and nothing brings one in (a relation, a Morph block or an Appear block): this clip never shows.`,
      ['clips', ci, 'startHidden'],
    );
  }

  // An intro with nothing to animate because its glyphs wait for Appear blocks: those do its
  // job now, so it is probably a leftover (hidden glyphs, those the clip leaves out itself and
  // relation targets skip it too). A clip that starts empty has such an intro by what it is.
  if (
    clip.intro.kind !== 'none' &&
    !clip.startsEmpty &&
    life.intro.length === 0 &&
    life.waiting.length > 0
  ) {
    const waiting = new Set(life.waiting);
    const hidden = new Set(startHiddenGlyphs(clip, formula));
    const rest = life.glyphs.filter((g) => !waiting.has(g));
    const why = ['wait for Appear blocks'];
    if (rest.some((g) => hidden.has(g))) why.push('are hidden at the start');
    if (rest.some((g) => !hidden.has(g))) why.push('arrive by a relation or a Morph block');
    const listed = why.length === 1 ? why[0] : `${why.slice(0, -1).join(', ')} or ${why.at(-1)}`;
    add(
      'warning',
      'intro-empty',
      `The ${ANIM_NAMES[clip.intro.kind] ?? clip.intro.kind} intro of "${formula.name}" animates no glyph: its glyphs ${listed}.`,
      ['clips', ci, 'intro'],
    );
  }

  // Manim cannot run two animations on one glyph at once (`causesConflict`): intro, outro and
  // relation windows keep apart through their own rules (a tween's bounds keep it out of the
  // intro and outro), and so do two transfers (ownership, consumption); a morph block's pairs,
  // which can sit anywhere in the clip, are checked like an action against everything else.
  const conflicts = new Map<string, { a: Span; b: Span; glyphs: number[] }>();
  for (const [glyph, spans] of life.busy) {
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        const a = spans[i]!;
        const b = spans[j]!;
        if (!overlaps(a, b) || !causesConflict(clip, a.cause, b.cause)) continue;
        const key = `${causeKey(a.cause)}|${causeKey(b.cause)}`;
        const known = conflicts.get(key);
        if (known) known.glyphs.push(glyph);
        else conflicts.set(key, { a, b, glyphs: [glyph] });
      }
    }
  }
  for (const { a, b, glyphs } of conflicts.values()) {
    // Report on the action (or morph) that starts later, or the only one.
    const [first, second] = actionLike(b.cause) ? [a, b] : [b, a];
    const describe = (cause: Cause) => describeCause(cause, clip, transfers);
    add(
      'error',
      'action-overlap',
      `${capitalise(describe(second.cause))} and ${describe(first.cause)} animate ${glyphList(glyphs.sort((x, y) => x - y))} of "${formula.name}" at the same time; Manim cannot run both on one glyph.`,
      pathOf(second.cause),
      diagnosticIdentity(
        { kind: 'clip', clipId: clip.id },
        [participantKey(a.cause, clip.id), participantKey(b.cause, clip.id)],
        clip.id,
        glyphs,
      ),
    );
  }

  // A pair whose source is not on screen makes it appear out of nowhere (as Manim adds an
  // animated mobject to the scene).
  for (const absent of life.absentSources) {
    const transfer = transfers.get(absent.key);
    if (!transfer) continue;
    const one = absent.glyphs.length === 1;
    const what = transfer.origin.kind === 'morph' ? 'the Morph block' : 'the relation';
    add(
      'warning',
      'source-hidden',
      `Source glyph${one ? '' : 's'} ${absent.glyphs.join(', ')} of "${formula.name}" ${one ? 'is' : 'are'} not on screen when ${what} starts, so ${one ? 'it appears' : 'they appear'} out of nowhere.`,
      [...transfer.path, 'pairs', absent.pair, 'from'],
    );
  }
  // A source another transfer is still bringing in: two animations on one glyph, and the
  // arrival lands on a half-morphed shape in Manim.
  for (const arriving of life.arrivingSources) {
    const transfer = transfers.get(arriving.key);
    const through = transfers.get(arriving.through);
    if (!transfer || !through) continue;
    const one = arriving.glyphs.length === 1;
    const what = transfer.origin.kind === 'morph' ? 'the Morph block' : 'the relation';
    const by = through.origin.kind === 'morph' ? 'another Morph block' : 'a relation';
    add(
      'error',
      'source-arriving',
      `Source glyph${one ? '' : 's'} ${arriving.glyphs.join(', ')} of "${formula.name}" ${one ? 'is' : 'are'} still arriving through ${by} when ${what} starts.`,
      [...transfer.path, 'pairs', arriving.pair, 'from'],
      diagnosticIdentity(
        transferSubject(transfer),
        [transfer.key, through.key],
        clip.id,
        arriving.glyphs,
      ),
    );
  }
  return issues;
}

/** What an attached object (`clip.attach`, R4) needs of its target when its clip starts, since
 * Manim measures the target glyphs at that instant to place it (ARCHITECTURE §5, "Attached
 * objects"): the chain of attachments must not go round; none of those glyphs may still be
 * animated — strictly inside an intro, an outro, an Appear or Disappear block or a transfer
 * window (a tween or a part Transform is fine: Manim measures the interpolated glyph, as the
 * preview does) —; and all of them must still be there (a glyph a transfer turned into others, or
 * an outro took, is not where the preview measures it). A glyph not on screen yet is measured
 * where it would be, by both: a warning. A brace or a shape that spans glyphs of several clips
 * needs all of this of each of them. `targetIds` restricts timing checks to consumers of edited
 * lifetimes; full validation omits it. Diagnostic paths always refer to `project`. */
export function attachIssues(
  project: Project,
  lifetimes: ReadonlyMap<ClipId, ClipLifetime>,
  transfers: ReadonlyMap<string, GlyphTransfer>,
  targetIds?: ReadonlySet<ClipId>,
): Issue[] {
  const issues: Issue[] = [];
  const add: Add = (severity, code, message, path, identity) =>
    issues.push({ severity, code, message, path, ...(identity ? { identity } : {}) });
  const clips = new Map(project.clips.map((c) => [c.id, c]));
  const nameOf = (clip: Clip) => project.formulas.find((f) => f.id === clip.formulaId)?.name ?? '?';
  /** What `target`'s glyphs `named` are doing when `clip`, attached to them, starts — or, with
   * `fit`, when that tween of `clip` starts to carry its shape to them (the same rules: Manim
   * measures them then, to build the new shape). */
  const targetIssues = (
    clip: Clip,
    target: Clip,
    named: GlyphTarget,
    path: Issue['path'],
    use: PlacementUse,
  ) => {
    const life = lifetimes.get(target.id);
    if (!life) return;
    const t = use.at;
    const glyphs = named === 'all' ? life.glyphs : named.filter((g) => life.glyphs.includes(g));
    const targetName = nameOf(target);
    const when = `at ${+t.toFixed(3)} s`;
    const them = (list: number[]) => (list.length === 1 ? 'it' : 'them');
    // "b1" is attached to / attaches to …; the Transform of "s1" goes to …
    const { attaches, meets, fix } = OWNER_WORDS[use.owner.kind];
    const who = OWNER_WORDS[use.owner.kind].who(nameOf(clip));
    const whoInside = OWNER_WORDS[use.owner.kind].inside(nameOf(clip));
    const owner =
      use.owner.kind === 'attach' ? `attach:${clip.id}` : `${use.owner.kind}:${use.owner.tween.id}`;

    // Still animated: Manim would measure glyphs half drawn, half gone or half morphed.
    for (const { cause, glyphs: list } of measuringConflicts(target, life, glyphs, t)) {
      add(
        'error',
        'attach-target-busy',
        `${who} ${attaches} ${glyphList(list)} of "${targetName}" while ${describeCause(cause, target, transfers)} is still animating ${them(list)} (${when}): Manim would measure a formula half drawn. ${fix} once that has ended, or before it starts.`,
        path,
        diagnosticIdentity(
          { kind: 'clip', clipId: clip.id },
          [owner, participantKey(cause, target.id)],
          target.id,
          list,
        ),
      );
    }

    // Gone for good, or not there yet.
    const gone: number[] = [];
    const hidden: number[] = [];
    for (const g of glyphs) {
      const stints = life.stints.get(g) ?? [];
      const covered = stints.some(
        (s) => t >= s.enter.start - TIME_EPSILON && t < s.exit.end - TIME_EPSILON,
      );
      if (covered) continue;
      if (stints.some((s) => t >= s.exit.end - TIME_EPSILON)) gone.push(g);
      else hidden.push(g);
    }
    if (gone.length > 0) {
      add(
        'error',
        'attach-target-gone',
        `${capitalise(glyphList(gone))} of "${targetName}" ${gone.length === 1 ? 'has' : 'have'} left the screen when ${whoInside} ${meets} ${them(gone)} (${when}): a glyph a transfer turned into others, or an outro took, is not where the preview measures it.`,
        path,
        diagnosticIdentity(
          { kind: 'clip', clipId: clip.id },
          [
            owner,
            ...uniqueCauseParticipants(
              gone.flatMap((g) =>
                (life.stints.get(g) ?? [])
                  .filter((s) => t >= s.exit.end - TIME_EPSILON)
                  .map((s) => s.exit.cause),
              ),
              target.id,
            ),
          ],
          target.id,
          gone,
        ),
      );
    }
    if (hidden.length > 0) {
      add(
        'warning',
        'attach-target-hidden',
        `${capitalise(glyphList(hidden))} of "${targetName}" ${hidden.length === 1 ? 'is' : 'are'} not on screen when ${whoInside} ${meets} ${them(hidden)} (${when}): Manim and the preview measure ${them(hidden)} where ${hidden.length === 1 ? 'it' : 'they'} would be.`,
        path,
      );
    }
  };

  project.clips.forEach((clip, ci) => {
    const uses = placementUses(clip);
    if (uses.length === 0) return;
    const spots = uses.flatMap((use) => use.spots.map((spot) => spot.target));
    if (targetIds && !spots.some((spot) => targetIds.has(spot.clipId))) return;
    // A target that is missing, or the clip itself, is reported with the clip's fields.
    if (spots.some((spot) => !clips.has(spot.clipId) || spot.clipId === clip.id)) return;
    // The first of them: the attachment, when the clip has one.
    const path = ['clips', ci, ...uses[0]!.path];

    // The chain of attachments must end somewhere: none of its objects can be placed otherwise.
    const round = attachLoop(clip, clips);
    if (round) {
      const names = round.map((c) => `"${nameOf(c)}"`).join(' → ');
      add(
        'error',
        'attach-cycle',
        `"${nameOf(clip)}" hangs on a chain of attachments that goes round (${names}): none of them can be placed.`,
        path,
      );
      return;
    }
    // Each target of each use, reported at the use: the attachment, or the tween's fit.
    for (const use of uses) {
      for (const { target } of use.spots) {
        if (targetIds && !targetIds.has(target.clipId)) continue;
        const at = ['clips', ci, ...use.path];
        targetIssues(clip, clips.get(target.clipId)!, target.glyphs, at, use);
      }
    }
  });
  return issues;
}

/** How an issue names what measures the glyphs, by the owner of the reference: an attached
 * object, or the tween that carries a shape to them — at the start of a sentence (`who`) and
 * inside one. */
const OWNER_WORDS: Record<
  PlacementOwner['kind'],
  {
    who(name: string): string;
    inside(name: string): string;
    attaches: string;
    meets: string;
    fix: string;
    self(name: string): string;
    empty: string;
  }
> = {
  attach: {
    who: (name) => `"${name}"`,
    inside: (name) => `"${name}"`,
    attaches: 'is attached to',
    meets: 'attaches to',
    fix: 'Start the clip',
    self: (name) => `"${name}" cannot be attached to itself.`,
    empty: 'An attached object needs at least one glyph of its target.',
  },
  fit: {
    who: (name) => `The Transform of "${name}"`,
    inside: (name) => `the Transform of "${name}"`,
    attaches: 'goes to',
    meets: 'goes to',
    fix: 'Start it',
    self: (name) => `"${name}" cannot be carried to surround itself.`,
    empty: 'A Transform to other glyphs needs at least one glyph.',
  },
  ends: {
    who: (name) => `The Transform of "${name}"`,
    inside: (name) => `the Transform of "${name}"`,
    attaches: 'puts an end on',
    meets: 'puts an end on',
    fix: 'Start it',
    self: (name) => `An end of "${name}" cannot be on the line itself.`,
    empty: 'An end of a line on glyphs needs at least one glyph.',
  },
};

/** The chain of attachments from `clip` that comes back to a clip it went through — the clips in
 * order, the one met again last — or null when every chain from it ends. */
function attachLoop(clip: Clip, clips: ReadonlyMap<ClipId, Clip>): Clip[] | null {
  const ending = new Set<ClipId>();
  const walk = (at: Clip, chain: readonly Clip[]): Clip[] | null => {
    if (chain.includes(at)) return [...chain, at];
    if (ending.has(at.id)) return null;
    // What it hangs on, and what the fits of its tweens carry it to.
    for (const spot of placementTargets(at)) {
      const next = clips.get(spot.clipId);
      const found = next && walk(next, [...chain, at]);
      if (found) return found;
    }
    ending.add(at.id);
    return null;
  };
  return walk(clip, []);
}

type Add = (
  severity: Severity,
  code: IssueCode,
  message: string,
  path: Issue['path'],
  identity?: IssueIdentity,
) => void;

function diagnosticIdentity(
  subject: IssueSubject,
  participants: string[],
  clipId: ClipId,
  glyphs: number[],
): IssueIdentity {
  return {
    subject,
    participants: [...participants].sort(),
    glyphs: [...new Set(glyphs)].sort((a, b) => a - b).map((index) => ({ clipId, index })),
  };
}

function transferSubject(transfer: GlyphTransfer): IssueSubject {
  const origin = transfer.origin;
  return origin.kind === 'relation' ? origin : { ...origin, kind: 'action' };
}

/** The pair ordinal is deliberately omitted; its multiplicity lives in the participant list. */
function participantKey(cause: Cause, clipId: ClipId): string {
  if (cause.kind === 'transfer') return cause.key;
  if (cause.kind === 'action') return `action:${clipId}:${cause.actionId}`;
  return `${cause.kind}:${clipId}`;
}

function uniqueCauseParticipants(causes: Cause[], clipId: ClipId): string[] {
  return [...new Map(causes.map((cause) => [causeKey(cause), cause])).values()].map((cause) =>
    participantKey(cause, clipId),
  );
}

function consumingParticipants(
  transfers: Iterable<GlyphTransfer>,
  clipId: ClipId,
  glyphs: number[],
  when: number,
): string[] {
  const affected = new Set(glyphs);
  const participants: string[] = [];
  for (const transfer of transfers) {
    if (transfer.fromClipId !== clipId || transfer.start > when + TIME_EPSILON) continue;
    for (const pair of transfer.pairs) {
      if (sourceRoles(pair, pair.style).consumed.some((g) => affected.has(g)))
        participants.push(transfer.key);
    }
  }
  return participants;
}

const ANIM_NAMES: Record<string, string> = {
  write: 'Write',
  create: 'Create',
  fade_in: 'FadeIn',
  grow_from_center: 'GrowFromCenter',
  draw_border_then_fill: 'DrawBorderThenFill',
  grow_arrow: 'GrowArrow',
  unwrite: 'Unwrite',
  uncreate: 'Uncreate',
  fade_out: 'FadeOut',
  shrink_to_center: 'ShrinkToCenter',
};

const SKIP_TEXT: Record<Exclude<SkipReason, 'consumed'>, (one: boolean) => string> = {
  'on-screen': (one) => (one ? 'it is on screen already' : 'they are on screen already'),
  'off-screen': (one) => (one ? 'it is not on screen' : 'they are not on screen'),
  'arrives-later': (one) => `a relation or a Morph block brings ${one ? 'it' : 'them'} in later`,
};

/** "The Write block", "A tween", … as the subject of a sentence. */
function blockName(action: ClipAction): string {
  if (action.kind === 'tween') return 'A tween';
  if (action.kind === 'transform') return 'The Transform block';
  if (action.kind === 'morph') return 'The Morph block';
  if (action.kind === 'emphasis') return `The ${EMPHASIS[action.effect].label} block`;
  return `The ${ANIM_NAMES[action.anim] ?? action.anim} block`;
}

function describeCause(
  cause: Cause,
  clip: Clip,
  transfers: ReadonlyMap<string, GlyphTransfer>,
): string {
  switch (cause.kind) {
    case 'intro':
      return 'the intro';
    case 'outro':
    case 'clip-end':
      return 'the outro';
    case 'transfer':
      return transfers.get(cause.key)?.origin.kind === 'morph'
        ? 'the Morph block'
        : 'a relation window';
    case 'action': {
      const action = clip.actions.find((a) => a.id === cause.actionId);
      return action ? blockName(action).replace(/^(The|A) /, (m) => m.toLowerCase()) : 'an action';
    }
  }
}

function glyphList(glyphs: number[]): string {
  return `glyph${glyphs.length === 1 ? '' : 's'} ${glyphs.join(', ')}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Whether a `{{ … }}` group of the LaTeX holds an alignment tab. ManimCE compiles such a group
 * (it strips the braces into parts); ManimGL keeps the braces, and `&` inside them is a LaTeX
 * error ("Misplaced alignment tab character &"). */
export function groupSpansAlignment(latex: string): boolean {
  for (let i = latex.indexOf('{{'); i >= 0; i = latex.indexOf('{{', i + 1)) {
    let depth = 0;
    for (let j = i; j < latex.length; j++) {
      const c = latex[j];
      if (c === '\\') {
        j++;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) break;
      } else if (c === '&' && depth >= 2) return true;
    }
  }
  return false;
}

/** A `math` formula: its LaTeX has to compile with both libraries. */
function checkMathFormula(formula: MathFormula, fi: number, add: Add): void {
  if (groupSpansAlignment(formula.source)) {
    add(
      'warning',
      'group-alignment',
      `A {{ }} group of "${formula.name}" spans an alignment tab (&): ManimGL cannot compile it. Keep {{ }} inside one cell of the line.`,
      ['formulas', fi, 'source'],
    );
  }
}

/** A text's layout: a width of scene units or none, a positive line spacing (the schema already
 * keeps both positive; a project built in memory may not have gone through it). */
function checkTexFormula(formula: TexFormula, fi: number, add: Add): void {
  const { width, lineSpacing } = formula.layout;
  if (width !== null && !(Number.isFinite(width) && width > 0)) {
    add(
      'error',
      'invalid-layout',
      `The width of "${formula.name}" must be a positive number of scene units, or null.`,
      ['formulas', fi, 'layout', 'width'],
    );
  }
  if (!(Number.isFinite(lineSpacing) && lineSpacing > 0)) {
    add(
      'error',
      'invalid-layout',
      `The line spacing of "${formula.name}" must be a positive factor.`,
      ['formulas', fi, 'layout', 'lineSpacing'],
    );
  }
}

function checkTextFormula(formula: TextFormula, fi: number, add: Add): void {
  for (const [field, result] of [
    ['source', TextSourceSchema.safeParse(formula.source)],
    ['font', TextFontSchema.safeParse(formula.font)],
    ['geometry', TextGeometryRefSchema.nullable().safeParse(formula.geometry)],
  ] as const) {
    if (!result.success) {
      add('error', 'invalid-text', result.error.issues[0]?.message ?? 'Invalid text.', [
        'formulas',
        fi,
        field,
      ]);
    }
  }
  if (formula.geometry && formula.snapshot && formula.geometry.key !== formula.snapshot.key) {
    add('warning', 'invalid-text', 'The saved text geometry and canonical snapshot differ.', [
      'formulas',
      fi,
      'geometry',
    ]);
  }
}

/** A dashed line is drawn dash by dash, so its dash has a least length (`MIN_DASH_LENGTH`): the
 * fields stop there, and a file that brings a shorter one says so here. The drawing itself stops
 * counting at `MAX_DASHES` (geom/lines.ts), whatever the number. */
function checkLineDash(formula: LineFormula, fi: number, add: Add): void {
  if (formula.line === 'dashed' && !(formula.dashLength >= MIN_DASH_LENGTH)) {
    add(
      'error',
      'line-dash',
      `"${formula.name}" has dashes ${formula.dashLength} long: a dash is at least ${MIN_DASH_LENGTH} long.`,
      ['formulas', fi, 'dashLength'],
    );
  }
}

function checkHiddenGlyphs(formula: Formula, path: Issue['path'], add: Add): void {
  if (formula.hiddenGlyphs.length === 0) return;
  if (!formula.snapshot) {
    add(
      'warning',
      'missing-snapshot',
      `Formula "${formula.name}" has hidden glyphs but was never rendered.`,
      path,
    );
    return;
  }
  const n = formula.snapshot.glyphs.length;
  const bad = formula.hiddenGlyphs.filter((g) => g >= n);
  if (bad.length) {
    add(
      'warning',
      'glyph-range',
      `Hidden glyphs ${bad.join(', ')} of "${formula.name}" do not exist.`,
      path,
    );
  }
}

/** The ends of a line go on a formula or a text, not on what is itself fitted to others — a
 * brace, a shape, another line (`attach-rule`) —: those of its clip's attachment (`at` is
 * `attach`) and those a Transform carries it to (`at` is that tween's `ends`), whose ends follow
 * the rules of an attachment's. `puts` begins the sentence that names what puts an end there. */
function checkEndHosts(
  clip: Clip,
  ends: { start: LineEnd; end: LineEnd },
  at: Issue['path'],
  puts: string,
  project: { clips: ReadonlyMap<ClipId, Clip>; formulas: ReadonlyMap<string, Formula> },
  add: Add,
): void {
  for (const side of ['start', 'end'] as const) {
    const end = ends[side];
    const host = isGlyphEnd(end) ? project.clips.get(end.clipId) : undefined;
    const formula = host && project.formulas.get(host.formulaId);
    if (!formula || host === clip || KINDS[formula.kind].fitted === null) continue;
    add(
      'error',
      'attach-rule',
      `${puts} "${formula.name}", a ${KINDS[formula.kind].label.toLowerCase()}: the end of a line goes on a formula or a text.`,
      [...at, side, 'clipId'],
    );
  }
}

/** The glyphs a clip leaves out of its intro itself (`Clip.startHidden`): only a clip of a formula
 * or a text has them — a brace, a shape or a line is one piece —, and they are glyphs of it. */
function checkStartHidden(clip: Clip, formula: Formula, path: Issue['path'], add: Add): void {
  const listed = clip.startHidden ?? [];
  if (listed.length === 0) return;
  if (!KINDS[formula.kind].transfers) {
    add(
      'error',
      'start-hidden-kind',
      `"${formula.name}" is a ${KINDS[formula.kind].label.toLowerCase()}: only a formula or a text can leave glyphs out of its intro.`,
      path,
    );
    return;
  }
  if (!formula.snapshot) {
    add(
      'warning',
      'missing-snapshot',
      `Formula "${formula.name}" has glyphs left out of an intro but was never rendered.`,
      path,
    );
    return;
  }
  const n = formula.snapshot.glyphs.length;
  const bad = listed.filter((g) => g >= n);
  if (bad.length) {
    add(
      'warning',
      'glyph-range',
      `Glyphs ${bad.join(', ')} that a clip of "${formula.name}" leaves out of its intro do not exist.`,
      path,
    );
  }
}

/** The groups of formulas of the Creator (`formulaGroups.ts`): the store and the loader keep
 * their rule, so these say what a project made some other way still holds. Two groups with one
 * id are reported with the ids (`checkIds`). */
function checkFormulaGroups(project: Project, add: Add): void {
  const groups = formulaGroupsOf(project);
  for (const { fault, group: gi, member } of formulaGroupProblems(project)) {
    const group = groups[gi]!;
    const path: Issue['path'] = ['formulaGroups', gi];
    const id = member === undefined ? '' : group.formulaIds[member]!;
    const at: Issue['path'] = member === undefined ? path : [...path, 'formulaIds', member];
    const name = project.formulas.find((f) => f.id === id)?.name ?? id;
    switch (fault) {
      case 'unknown':
        add('error', 'dangling-ref', `Unknown formula "${id}".`, at);
        break;
      case 'unlisted':
        add(
          'error',
          'formula-group',
          `"${name}" cannot be in the group "${group.name}": the Creator does not list it.`,
          at,
        );
        break;
      case 'repeated':
        add(
          'error',
          'formula-group',
          `"${name}" is in a group already: a formula is in one group at most.`,
          at,
        );
        break;
      case 'unnamed':
        add('error', 'formula-group', 'A group of formulas needs a name.', [...path, 'name']);
        break;
      case 'empty':
        add('error', 'formula-group', `The group "${group.name}" has no formulas.`, [
          ...path,
          'formulaIds',
        ]);
        break;
      case 'same-id':
        break;
    }
  }
}

function checkIds(project: Project, add: Add): void {
  const seen = new Set<string>();
  const visit = (id: string, path: Issue['path']) => {
    if (seen.has(id)) add('error', 'duplicate-id', `Id "${id}" is used more than once.`, path);
    seen.add(id);
  };
  for (const { id, path } of projectIdEntries(project)) visit(id, path);
}

/** The arc of a relation or of a Morph block turns a full turn at most, either way, as its fields
 * do (`PATH_ARC_LIMIT`): a wider one is a number only a file made by hand brings. */
function checkPathArc(pathArc: number, path: Issue['path'], add: Add): void {
  if (!(Math.abs(pathArc) <= PATH_ARC_LIMIT)) {
    add(
      'error',
      'path-arc',
      `A path arc of ${pathArc}° is past a full turn: it is between −${PATH_ARC_LIMIT}° and ${PATH_ARC_LIMIT}°.`,
      path,
    );
  }
}

function checkPrincipal(pair: GlyphPair, path: Issue['path'], add: Add): void {
  if (!missingPrincipal(pair)) return;
  add(
    'error',
    'pair-principal',
    'The consuming source of this Copies pair is missing. Edit the pair to choose its sources again, or change how the sources arrive.',
    [...path, 'principal'],
  );
}

function checkIndices(
  formula: Formula | undefined,
  indices: number[],
  path: Issue['path'],
  add: Add,
): void {
  if (!formula || indices.length === 0) return;
  if (!formula.snapshot) {
    add(
      'warning',
      'missing-snapshot',
      `Formula "${formula.name}" has glyph references but was never rendered.`,
      path,
    );
    return;
  }
  const n = formula.snapshot.glyphs.length;
  const bad = indices.filter((i) => i >= n);
  if (bad.length) {
    add(
      'error',
      'glyph-range',
      `Glyph ${bad.join(', ')} does not exist in "${formula.name}" (${n} glyphs).`,
      path,
    );
  }
}

/** Whether a spline in the frame of the two points it runs between — a custom path, a line's
 * curve — starts at the first and ends at the second: its first node at (0, 0) and its last at
 * (1, 0) (the schema asks for at least two nodes). None at all is a straight way: anchored. */
function anchored(spline: PathSpline | undefined): boolean {
  const nodes = spline?.nodes;
  if (!nodes) return true;
  const first = nodes[0]!.at;
  const last = nodes[nodes.length - 1]!.at;
  return first[0] === 0 && first[1] === 0 && last[0] === 1 && last[1] === 0;
}

/** The rules of a line object: its dash (`checkLineDash`), and its curve — a line bent as a
 * spline runs from its start to its end, as a pair's path runs from glyph to glyph (`anchored`):
 * else the line drawn would not end at its end (`line-curve`). */
function checkLineFormula(formula: LineFormula, fi: number, add: Add): void {
  checkLineDash(formula, fi, add);
  if (formula.curve?.shape !== 'spline' || anchored(formula.curve)) return;
  add(
    'error',
    'line-curve',
    `The curve of "${formula.name}" must start at its start and end at its end: its first node at (0, 0) and its last at (1, 0).`,
    ['formulas', fi, 'curve', 'nodes'],
  );
}

/** A pair's custom path must run from the glyph at the start to the glyph at the end: its first
 * node anchored at (0, 0) of the chord's frame and its last at (1, 0) (`anchored`). */
function checkPath(pair: GlyphPair, path: Issue['path'], add: Add): void {
  if (!anchored(pair.path)) {
    add(
      'error',
      'pair-path',
      'The path of a pair must start at its source glyph and end at its target: its first node at (0, 0) and its last at (1, 0).',
      [...path, 'path'],
    );
  }
  // The path of a route (D167) is laid on a chord as the pair's is.
  (pair.routes ?? []).forEach((route, i) => {
    if (anchored(route.path)) return;
    add(
      'error',
      'pair-path',
      'The path of a route of a pair must start at its source glyph and end at its target: its first node at (0, 0) and its last at (1, 0).',
      [...path, 'routes', i, 'path'],
    );
  });
}

function checkGlyphKeys(
  formula: Formula,
  colors: Record<string, string>,
  path: Issue['path'],
  add: Add,
): void {
  const keys = Object.keys(colors);
  if (keys.length === 0) return;
  if (!formula.snapshot) {
    add(
      'warning',
      'missing-snapshot',
      `Formula "${formula.name}" has glyph colours but was never rendered.`,
      path,
    );
    return;
  }
  const n = formula.snapshot.glyphs.length;
  const bad = keys.filter((k) => Number(k) >= n);
  if (bad.length) {
    add(
      'warning',
      'glyph-range',
      `Colours for missing glyphs ${bad.join(', ')} of "${formula.name}".`,
      path,
    );
  }
}
