/* Edit path: a mode of the preview that shapes the custom path of one transfer pair (D48) on the
 * real positions — the playhead sits in the middle of the pair's window, the glyph is drawn there
 * by the morph, and the path shows as a curve from the glyph's centre at the start to its centre
 * at the end with its anchors and handles, as a vector editor draws it. Dragging an anchor moves
 * it with its handles; dragging a handle of a smooth node mirrors its partner through the anchor
 * (D176; Shift only turns the partner, keeping its length; Ctrl/⌘ breaks the pair: the node
 * becomes a corner); a click on the curve adds a node; Delete removes the selected one. Each
 * change is one undo step. A pair without a path starts from the arc it
 * follows (its holder's `pathArc`, the plain chord at 0°) turned into nodes, so the curve begins
 * as what the morph plays; a path left as that arc, or as the chord, is dropped on leaving. The
 * store holds the mode; the panel measures the chord (`pathEditFrame`) and feeds the pure
 * helpers below, all in the chord's frame.
 *
 * A pair with two routes or more — source glyphs on their way to target glyphs (D167,
 * `pathRoutes.ts`) — is edited as one path unless «Path per glyph» is on (D175): off, the mode
 * draws the pair's common path once, on the chord of its first route, and nothing chooses a
 * route; on, every route is drawn on its own chord, and the mode edits the common path ("All
 * together") or, once one is chosen (‹ ›, or a click on it unless the other routes are locked),
 * that route's own path, which its first change writes into `pair.routes`. The option opens on
 * when a route the pair plays has a path of its own. A route's own path that is what the route
 * would follow without it is dropped when the mode leaves the route. */
import { create } from 'zustand';
import {
  applyToPoint,
  arcSpline,
  boxCenter,
  chordFrame,
  equalSplines,
  invert,
  nearestPoint,
  pointAtPlace,
  splitSpline,
  unionBox,
  type Mat2D,
  type Vec2,
} from '../../geom';
import {
  glyphTransfers,
  transferKey,
  type FormulaSnapshot,
  type GlyphPair,
  type GlyphTransfer,
  type MorphAction,
  type PairRoute,
  type PathSpline,
  type Project,
  type Relation,
  type RouteRef,
  type SplineNode,
  type TransferOrigin,
} from '../../model';
import type { SceneEvaluator } from '../../scene';
import {
  history,
  type ProjectGesture,
  useProjectStore,
  useRenderStore,
  useUiStore,
} from '../../store';
import { onDocumentReplaced } from '../project/documentStore';
import { morphLock } from '../morph/morphDraft';
import { relationLock } from '../relations/relationOps';
import { transitionFor } from '../relations/pairDraft';
import { reconcile, type Revision, type Sides } from '../relations/pairSession';
import { round6 } from '../time';
import { mainPlayback } from '../transport/mainPlayback';
import { geometryAt } from './geometry';
import {
  commonSpline,
  dropPlainPaths,
  hasPlainPaths,
  opensPerGlyph,
  ownRouteCount,
  ownRoutePath,
  plainRoutePath,
  routeChoices,
  routeSpline,
  sameRoute,
  setRoutePath,
} from './pathRoutes';
import { endPreviewModes, registerPreviewMode } from './previewModes';

/** One pair of a relation or of a Morph block. */
export interface PairRef {
  origin: TransferOrigin;
  index: number;
}

/** What the editor has hold of: an anchor, or one of its handles. */
export interface PathSelection {
  node: number;
  part: 'at' | 'in' | 'out';
}

interface PathEditState {
  target: PairRef | null;
  /** The route whose own path is edited (D167); null = the pair's common path, "All together"
   * — always so on a pair with fewer than two routes (`routeChoices`), and while «Path per glyph»
   * is off. */
  route: RouteRef | null;
  /** «Path per glyph» (D175), on a pair with two routes or more: every route drawn, and one of
   * them edited alone once chosen. Off, the common path is edited, drawn once on the pair's first
   * route, and nothing chooses a route. A flag of the session, set when the mode opens on a pair:
   * on when a route the pair plays has a path of its own (`opensPerGlyph`). */
  perGlyph: boolean;
  /** The routes that are not edited do not answer the pointer (D175): with «Path per glyph» on, a
   * route is then chosen with ‹ › only. Off when the mode opens. */
  lockOthers: boolean;
  selected: PathSelection | null;
  /** Session identity and external revision, separate from the project format. */
  session: number;
  revision: number;
  /** Enter the mode on a pair: the playhead jumps to the middle of its window and its holder
   * (the relation, or the Morph block) is selected. Nothing happens for a pair that is not there. */
  open(target: PairRef, expectedPair?: GlyphPair): void;
  /** Leave the mode. A path that is the chord itself, or the arc the pair would follow without
   * one, is dropped (the pair follows its holder's `pathArc`), and so is a route's own path that
   * is what the route would follow without it (`dropPlainPaths`). */
  close(): void;
  select(selected: PathSelection | null): void;
  /** Edit one route's path, or (null) the common path. The route left keeps its own path only
   * when it says something of its own. Nothing happens for a route the pair does not offer, nor
   * for any route while «Path per glyph» is off. */
  chooseRoute(route: RouteRef | null): void;
  /** Take the selected route's own path away, as one undo step: it follows the common path
   * again, and stays selected. */
  removeRoutePath(): void;
  /** Turn «Path per glyph» on or off. Turned off with a route chosen, the mode goes back to the
   * common path as «All together» does: the routes keep their own paths, and play them. */
  setPerGlyph(on: boolean): void;
  /** Lock the routes that are not edited (or unlock them). */
  setLockOthers(on: boolean): void;
}

interface PathBinding {
  session: number;
  pair: GlyphPair;
  keys: Revision;
  sides: Sides;
  arc: number;
  lock: string | null;
}

let binding: PathBinding | null = null;
let nextSession = 0;
let ownWrite = false;
let settling = false;

/** What the store holds with no session. */
const NO_SESSION = {
  target: null,
  route: null,
  perGlyph: false,
  lockOthers: false,
  selected: null,
} as const satisfies Partial<PathEditState>;

/** The formulas a pair's two sides index the glyphs of: the relation's two clips', or the Morph
 * block's clip's on both sides. */
function pairFormulas(project: Project, ref: PairRef) {
  const holder = holderOf(project, ref.origin);
  if (!holder) return null;
  const clips =
    'fromClipId' in holder
      ? [holder.fromClipId, holder.toClipId]
      : ref.origin.kind === 'morph'
        ? [ref.origin.clipId, ref.origin.clipId]
        : [];
  const side = (clipId: string | undefined) => {
    const clip = project.clips.find((c) => c.id === clipId);
    return project.formulas.find((f) => f.id === clip?.formulaId);
  };
  const from = side(clips[0]);
  const to = side(clips[1]);
  return from && to ? { from, to } : null;
}

function sidesFor(project: Project, ref: PairRef): Sides | null {
  const formulas = pairFormulas(project, ref);
  if (!formulas) return null;
  const side = (formula: Project['formulas'][number]) => ({
    id: formula.id,
    name: formula.name,
    key: formula.snapshot?.key ?? null,
  });
  return { from: side(formulas.from), to: side(formulas.to) };
}

/** The glyph snapshots a pair's sides index, to name its glyphs (null where there is none). */
export function pairSnapshots(
  project: Project,
  ref: PairRef,
): { from: FormulaSnapshot | null; to: FormulaSnapshot | null } {
  const formulas = pairFormulas(project, ref);
  return { from: formulas?.from.snapshot ?? null, to: formulas?.to.snapshot ?? null };
}

/** The route `route` (glyph indices of the snapshots `keys`) on the snapshots `sides` has now,
 * through the render store's last transition of each side that changed; null when a side's
 * step is not known or its glyph is gone. As `reconcile` takes the pair. */
function rebaseRoute(route: RouteRef, keys: Revision, sides: Sides): RouteRef | null {
  const transitions = useRenderStore.getState().transitions;
  let next = route;
  for (const side of ['from', 'to'] as const) {
    const { id, key } = sides[side];
    const known = keys[side];
    if (known === key || known === null) continue;
    const mapped = transitionFor(transitions, id, known, key)?.map[next[side]] ?? null;
    if (mapped === null) return null;
    next = { ...next, [side]: mapped };
  }
  return next;
}

/** The routes' own paths are the same entries (glyphs and the very path objects). */
function sameRouteEntries(
  a: readonly PairRoute[] | undefined,
  b: readonly PairRoute[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((r, i) => r.from === b[i]!.from && r.to === b[i]!.to && r.path === b[i]!.path);
}

/** The existing either-endpoint lock policy, checked again at every path command. */
export function pathLock(project: Project, ref: PairRef): string | null {
  const holder = holderOf(project, ref.origin);
  if (!holder) return 'This pair no longer exists.';
  return 'fromClipId' in holder
    ? relationLock(project, holder)
    : ref.origin.kind === 'morph'
      ? morphLock(project, ref.origin.clipId)
      : null;
}

const sameEndpoints = (a: GlyphPair, b: GlyphPair) =>
  a.from.length === b.from.length &&
  a.to.length === b.to.length &&
  a.from.every((g) => b.from.includes(g)) &&
  a.to.every((g) => b.to.includes(g));

/** Reconcile a session synchronously. Unknown identities close it without cleanup writes. */
function syncPath(): void {
  if (settling) return;
  const state = usePathEdit.getState();
  const target = state.target;
  if (!target || !binding) {
    binding = null;
    return;
  }
  const cancel = () => {
    binding = null;
    usePathEdit.setState({
      ...NO_SESSION,
      revision: state.revision + 1,
    });
  };
  const project = useProjectStore.getState().project;
  const holder = holderOf(project, target.origin);
  const sides = sidesFor(project, target);
  if (
    !holder ||
    !sides ||
    sides.from.id !== binding.sides.from.id ||
    sides.to.id !== binding.sides.to.id
  ) {
    cancel();
    return;
  }
  const result = reconcile(
    {
      keys: binding.keys,
      pairs: [binding.pair],
      base: [],
      selection: { from: new Set(), to: new Set() },
      suggestion: null,
    },
    sides,
    useRenderStore.getState().transitions,
    target.origin.kind === 'morph',
  );
  const expected = result.pairs[0];
  if (result.stale || !expected) {
    cancel();
    return;
  }
  let index = holder.pairs.indexOf(binding.pair);
  if (
    index < 0 &&
    ownWrite &&
    !result.rebased &&
    holder.pairs[target.index] &&
    sameEndpoints(holder.pairs[target.index]!, expected)
  )
    index = target.index;
  if (index < 0 || result.rebased) {
    const matches = holder.pairs.flatMap((pair, i) =>
      sameEndpoints(pair, expected) &&
      (result.rebased || (pair.from === expected.from && pair.to === expected.to))
        ? [i]
        : [],
    );
    if (matches.length !== 1) {
      cancel();
      return;
    }
    index = matches[0]!;
  }
  const pair = holder.pairs[index]!;
  const lock = pathLock(project, target);
  // The route under edit follows its glyphs through a renumbering. When it is no route the pair
  // offers any more — a glyph gone, a style or an arrival changed elsewhere — the mode goes back
  // to the common path, writing nothing.
  let route = state.route;
  if (route && result.rebased) route = rebaseRoute(route, binding.keys, sides);
  const offered = route && routeChoices(pair, holder).find((r) => sameRoute(r, route));
  route = offered ? (sameRoute(offered, state.route) ? state.route : offered) : null;
  const external =
    result.rebased ||
    index !== target.index ||
    lock !== binding.lock ||
    route !== state.route ||
    (!ownWrite &&
      (pair.path !== binding.pair.path ||
        !sameRouteEntries(pair.routes, binding.pair.routes) ||
        holder.pathArc !== binding.arc));
  binding = { ...binding, pair, keys: result.keys, sides, arc: holder.pathArc, lock };
  if (external) {
    usePathEdit.setState({
      target: result.rebased || index !== target.index ? { ...target, index } : target,
      route,
      selected: null,
      revision: state.revision + 1,
    });
  }
}

export const usePathEdit = create<PathEditState>()((set, get) => ({
  ...NO_SESSION,
  session: 0,
  revision: 0,
  open: (target, expectedPair) => {
    const { project } = useProjectStore.getState();
    const found = findPair(project, target);
    const transfer = transferOf(project, target);
    const sides = sidesFor(project, target);
    if (
      !found ||
      !transfer ||
      !sides ||
      pathLock(project, target) ||
      (expectedPair && found.pair !== expectedPair)
    )
      return;
    endPreviewModes('path');
    const ui = useUiStore.getState();
    mainPlayback.seek(round6((transfer.start + transfer.end) / 2));
    ui.select(
      target.origin.kind === 'relation'
        ? { kind: 'relation', id: target.origin.relationId }
        : { kind: 'action', clipId: target.origin.clipId, actionId: target.origin.actionId },
    );
    const session = ++nextSession;
    binding = {
      session,
      pair: found.pair,
      keys: { from: sides.from.key, to: sides.to.key },
      sides,
      arc: found.holder.pathArc,
      lock: null,
    };
    set({
      ...NO_SESSION,
      target,
      perGlyph: opensPerGlyph(found.pair, found.holder),
      session,
      revision: 0,
    });
  },
  close: () => {
    syncPath();
    const { target } = get();
    binding = null;
    set(NO_SESSION);
    if (!target) return;
    /** Whether a path says nothing of its own: the pair's, the chord itself or the holder's arc
     * (`hasEditedPath`, which the marks of an edited path read too); a route's, what the route
     * would follow without it. */
    const plain = () => {
      const project = useProjectStore.getState().project;
      const found = pathLock(project, target) ? null : findPair(project, target);
      return found != null && hasPlainPaths(found.pair, found.holder);
    };
    if (!plain()) return;
    // Such paths are dropped — but only those. Another mode can end this one while a node is
    // being dragged, and what that drag shows goes with the drag: the write below would cancel
    // it anyway, after the path it had restored was judged by the one it showed.
    history.cancelForeignGesture();
    if (!plain()) return;
    useProjectStore.getState().update((draft) => {
      const found = pathLock(draft, target) ? null : findPair(draft, target);
      if (found) dropPlainPaths(found.pair, found.holder);
    });
  },
  select: (selected) => {
    syncPath();
    const { target, route } = get();
    const found = target && findPair(useProjectStore.getState().project, target);
    const spline = found && editedSpline(found, route);
    set({ selected: selected && spline?.nodes[selected.node] ? selected : null });
  },
  chooseRoute: (route) => {
    syncPath();
    const { target, route: current, perGlyph } = get();
    if (!target || !binding || sameRoute(route, current) || (route && !perGlyph)) return;
    const found = findPair(useProjectStore.getState().project, target);
    const next =
      route && found && routeChoices(found.pair, found.holder).find((r) => sameRoute(r, route));
    if (!found || (route && !next)) return;
    if (current) dropPlainRoute(target, current);
    // Dropping its path gives up a drag held under it first, which can end the session.
    if (get().target !== target) return;
    set({ route: next ?? null, selected: null, revision: get().revision + 1 });
  },
  removeRoutePath: () => {
    syncPath();
    // A command that plans with the project: a drag held elsewhere goes first.
    history.cancelForeignGesture();
    const { target, route } = get();
    if (!target || !route || !binding) return;
    const project = useProjectStore.getState().project;
    const found = pathLock(project, target) ? null : findPair(project, target);
    if (!found || !ownRoutePath(found.pair, route)) return;
    ownWrite = true;
    try {
      useProjectStore.getState().update((draft) => writeRoutePath(draft, target, route, null));
    } finally {
      ownWrite = false;
    }
    set({ selected: null, revision: get().revision + 1 });
  },
  setPerGlyph: (on) => {
    syncPath();
    const { target, perGlyph } = get();
    if (!target || !binding || on === perGlyph) return;
    if (!on) {
      // Back to the common path, as «All together» goes: the route left drops its own path only
      // when that says nothing of its own.
      get().chooseRoute(null);
      if (get().target !== target) return;
    }
    // The curve is drawn on another chord now: a drag held on the old one is given up.
    set({ perGlyph: on, selected: null, revision: get().revision + 1 });
  },
  setLockOthers: (on) => {
    if (!get().target || on === get().lockOthers) return;
    set({ lockOthers: on });
  },
}));

/** The path being edited, as nodes: the route's (its own, else the common one), or the common. */
function editedSpline(
  found: { holder: Relation | MorphAction; pair: GlyphPair },
  route: RouteRef | null,
) {
  return route
    ? routeSpline(found.pair, found.holder, route)
    : (found.pair.path ?? arcSpline(found.holder.pathArc));
}

/** The field the edit writes: the route's own path, or the pair's. */
function editedOwn(pair: GlyphPair, route: RouteRef | null): PathSpline | undefined {
  return route ? (ownRoutePath(pair, route) ?? undefined) : pair.path;
}

/** Leaving a route: its own path goes when it is what the route would follow without it — with
 * the same care for a drag held under it as `close` takes. */
function dropPlainRoute(target: PairRef, route: RouteRef): void {
  const plain = () => {
    const project = useProjectStore.getState().project;
    const found = pathLock(project, target) ? null : findPair(project, target);
    return found != null && plainRoutePath(found.pair, found.holder, route);
  };
  if (!plain()) return;
  history.cancelForeignGesture();
  if (!plain()) return;
  ownWrite = true;
  try {
    useProjectStore.getState().update((draft) => writeRoutePath(draft, target, route, null));
  } finally {
    ownWrite = false;
  }
}

registerPreviewMode(
  'path',
  () => {
    if (usePathEdit.getState().target) usePathEdit.getState().close();
  },
  () => usePathEdit.getState().target !== null,
);

/** Refuse a stale render's pair, lock, or path before touching history. `route` is the route
 * being edited (null: the common path) and `own` the field an edit writes, as it is now. */
export function currentPath(target: PairRef, expected?: PathSpline) {
  syncPath();
  const state = usePathEdit.getState();
  const project = useProjectStore.getState().project;
  if (state.target !== target || !binding || pathLock(project, target)) return null;
  const found = findPair(project, target);
  if (!found) return null;
  const spline = editedSpline(found, state.route);
  if (expected && !equalSplines(expected, spline)) return null;
  return {
    ...found,
    spline,
    route: state.route,
    own: editedOwn(found.pair, state.route),
    session: state.session,
    revision: state.revision,
  };
}

/** Write `path` as the path being edited — the route's own, or the pair's — when it is still
 * `expected`, and, when `route` is given, still that route's (null: the common path). */
export function changePath(
  target: PairRef,
  expected: PathSpline,
  path: PathSpline,
  route?: RouteRef | null,
): boolean {
  const now = currentPath(target, expected);
  if (!now || (route !== undefined && !sameRoute(route, now.route))) return false;
  ownWrite = true;
  try {
    useProjectStore
      .getState()
      .update((draft) =>
        now.route ? writeRoutePath(draft, target, now.route, path) : writePath(draft, target, path),
      );
  } finally {
    ownWrite = false;
  }
  return true;
}

/** Cancel only this gesture's last path value — the pair's, or `route`'s own —: a newer lock or
 * unrelated amendment survives. False when the path cannot be given back — the session ended
 * under the drag, or the pair no longer holds what the drag wrote —: the gesture is then to be
 * cancelled whole. */
export function restoreGesturePath(
  session: number,
  written: PathSpline | undefined,
  original: PathSpline | undefined,
  route: RouteRef | null = null,
): boolean {
  syncPath();
  // Nothing of this gesture is in the project.
  if (written === original) return true;
  const target = usePathEdit.getState().target;
  const found = target && findPair(useProjectStore.getState().project, target);
  if (!target || binding?.session !== session || !found || editedOwn(found.pair, route) !== written)
    return false;
  ownWrite = true;
  try {
    useProjectStore.getState().update((draft) => {
      const pair = findPair(draft, target)?.pair;
      if (!pair) return;
      if (route) setRoutePath(pair, route, original ?? null);
      else if (original) pair.path = original;
      else delete pair.path;
    });
  } finally {
    ownWrite = false;
  }
  return true;
}

/** End the gesture of a path drag: as one undo `'step'`; as a `'rollback'`, cancelled after
 * `restoreGesturePath` gave the path back (the store then keeps what else is newer,
 * `finishCancellation`); or as a plain `'cancel'` when it could not. History rewinds and replays
 * to form the step: those states in between are not external edits. */
export function finishPathGesture(
  owner: ProjectGesture,
  how: 'step' | 'rollback' | 'cancel' = 'step',
): void {
  settling = true;
  try {
    if (how === 'step') owner.end();
    else if (how === 'rollback') owner.finishCancellation();
    // Already cancelling (its `onCancel` brought us here): the store finishes it the same way.
    else owner.cancel();
  } finally {
    settling = false;
    syncPath();
  }
}

/** Keep the session on its pair as the project and the renders change — its own writes too:
 * without this the next command would take them for foreign edits —, and forget it with its
 * document, without the writes of `close` (one of the app's services, `useAppServices`). Returns
 * the function that stops it. */
export function startPathEditTracking(): () => void {
  const stops = [
    useProjectStore.subscribe(syncPath),
    useRenderStore.subscribe(syncPath),
    onDocumentReplaced(() => {
      binding = null;
      usePathEdit.setState(NO_SESSION);
    }),
  ];
  syncPath();
  return () => stops.forEach((stop) => stop());
}

/** The holder and the pair a reference names, or null when either is gone. */
export function findPair(
  project: Project,
  ref: PairRef,
): { holder: Relation | MorphAction; pair: GlyphPair } | null {
  const holder = holderOf(project, ref.origin);
  const pair = holder?.pairs[ref.index];
  return holder && pair ? { holder, pair } : null;
}

function holderOf(project: Project, origin: TransferOrigin): Relation | MorphAction | null {
  if (origin.kind === 'relation') {
    return project.relations.find((r) => r.id === origin.relationId) ?? null;
  }
  const clip = project.clips.find((c) => c.id === origin.clipId);
  const action = clip?.actions.find((a) => a.id === origin.actionId);
  return action?.kind === 'morph' ? action : null;
}

/** The transfer a reference's pair belongs to (its window, its clips), or null. */
export function transferOf(project: Project, ref: PairRef): GlyphTransfer | null {
  if (!findPair(project, ref)) return null;
  const key = transferKey(ref.origin);
  return glyphTransfers(project).find((t) => t.key === key) ?? null;
}

/** Write the pair's path on a draft of the project (`null` removes it). */
export function writePath(draft: Project, ref: PairRef, path: PathSpline | null): void {
  const found = findPair(draft, ref);
  if (!found || pathLock(draft, ref)) return;
  if (path) found.pair.path = path;
  else delete found.pair.path;
}

/** Write a route's own path on a draft of the project (`null` removes it, D167). */
export function writeRoutePath(
  draft: Project,
  ref: PairRef,
  route: RouteRef,
  path: PathSpline | null,
): void {
  const found = findPair(draft, ref);
  if (!found || pathLock(draft, ref)) return;
  setRoutePath(found.pair, route, path);
}

/** One route of the pair on screen (D167): the path it follows laid on its own chord. */
export interface RouteFrame {
  route: RouteRef;
  /** Its place among the pair's routes (`routeChoices`), from 0. */
  index: number;
  /** The path it follows: its own, else the common one (the holder's arc as nodes). */
  spline: PathSpline;
  /** It has a path of its own. */
  own: boolean;
  /** Centre of its source glyph at the window start, of its target glyph at the end. */
  from: Vec2;
  to: Vec2;
  matrix: Mat2D | null;
}

/** The chord of a pair on screen, and the path on it. */
export interface PathFrame {
  transfer: GlyphTransfer;
  pair: GlyphPair;
  /** The route whose path is edited (D167); null = the pair's common path. */
  route: RouteRef | null;
  /** The path being edited: the pair's, or its holder's arc as nodes (the chord at 0°); for a
   * route, the path it follows. */
  spline: PathSpline;
  /** Centre of the pair's source glyphs at the window start, of its targets at the end — of the
   * route's one source and one target when a route is edited, and of the first route's while
   * «Path per glyph» is off. */
  from: Vec2;
  to: Vec2;
  /** Chord coordinates → scene (`chordFrame`), null when the two centres coincide. */
  matrix: Mat2D | null;
  /** The routes the mode offers on the pair (`routeChoices`): none below two. */
  choices: RouteRef[];
  /** «Path per glyph» is on for a pair that offers routes (D175): they are drawn, and one can be
   * edited alone. False on a pair without routes. */
  perGlyph: boolean;
  /** Those of them on screen, each on its own chord — none while «Path per glyph» is off. */
  routes: RouteFrame[];
  /** A click on another route's curve, or on the glyph of one route alone, chooses it: «Path per
   * glyph» on, and the other routes not locked (D175). */
  choosable: boolean;
}

/** The session's choices a frame is measured for (D175): «Path per glyph», on unless said, and
 * the other routes locked, off unless said. */
export interface PathView {
  perGlyph?: boolean;
  lockOthers?: boolean;
}

/** Measure a pair's chord where the formulas are: the union box of its source glyphs as the
 * window starts and of its target glyphs as it ends (`geometry.ts`) — for `route`, its source
 * glyph's box and its target glyph's. With «Path per glyph» off on a pair that offers routes, the
 * common path is laid on the chord of its first route instead (`routeChoices(…)[0]`), or of the
 * first that can carry it when that one cannot: one that follows the common path and moves before
 * one that has a path of its own (which a glyph would not be seen to follow) or stays still. Null
 * when the pair, its transfer or a side (or the route) is not on screen then. */
export function pathEditFrame(
  project: Project,
  evaluator: SceneEvaluator,
  ref: PairRef,
  route: RouteRef | null = null,
  { perGlyph = true, lockOthers = false }: PathView = {},
): PathFrame | null {
  const found = findPair(project, ref);
  const transfer = transferOf(project, ref);
  if (!found || !transfer) return null;
  const { pair, holder } = found;
  const end = Math.max(transfer.start, transfer.end - 1e-6);
  const atStart = geometryAt(evaluator, transfer.start).get(transfer.fromClipId);
  const atEnd = geometryAt(evaluator, end).get(transfer.toClipId);
  const centre = (geometry: typeof atStart, glyphs: readonly number[]) => {
    const boxes = glyphs.flatMap((g) => geometry?.glyphs.get(g) ?? []);
    return boxes.length > 0 ? boxCenter(unionBox(boxes)) : null;
  };
  const choices = routeChoices(pair, holder);
  const onScreen = choices.flatMap((r, index): RouteFrame[] => {
    const from = centre(atStart, [r.from]);
    const to = centre(atEnd, [r.to]);
    if (!from || !to) return [];
    const spline = routeSpline(pair, holder, r);
    const own = ownRoutePath(pair, r) !== null;
    return [{ route: r, index, spline, own, from, to, matrix: chordFrame(from, to) }];
  });
  const shown = choices.length > 0 && perGlyph;
  const routes = shown ? onScreen : [];
  const base = {
    transfer,
    pair,
    choices,
    perGlyph: shown,
    routes,
    choosable: shown && !lockOthers,
  };
  if (route && shown) {
    const edited = routes.find((f) => sameRoute(f.route, route));
    if (!edited) return null;
    const { spline, from, to, matrix } = edited;
    return { ...base, route: edited.route, spline, from, to, matrix };
  }
  const spline = commonSpline(pair, holder);
  if (choices.length > 0 && !shown) {
    const carrier =
      onScreen.find((f) => !f.own && f.matrix) ?? onScreen.find((f) => f.matrix) ?? onScreen[0];
    if (!carrier) return null;
    const { from, to, matrix } = carrier;
    return { ...base, route: null, spline, from, to, matrix };
  }
  const from = centre(atStart, pair.from);
  const to = centre(atEnd, pair.to);
  if (!from || !to) return null;
  return { ...base, route: null, spline, from, to, matrix: chordFrame(from, to) };
}

// --- The curve on screen ---------------------------------------------------------------------

/** The nodes in the scene's frame, for drawing and hit-testing. */
export function nodesInScene(spline: PathSpline, matrix: Mat2D): SplineNode[] {
  const map = (p: Vec2 | null): Vec2 | null => (p ? applyToPoint(matrix, p) : null);
  return spline.nodes.map((n) => ({
    at: applyToPoint(matrix, n.at),
    in: map(n.in),
    out: map(n.out),
    smooth: n.smooth,
  }));
}

/** The curve as a polyline in the scene's frame, `perSegment` steps per segment. */
export function samplePath(spline: PathSpline, matrix: Mat2D, perSegment = 24): Vec2[] {
  const out: Vec2[] = [];
  const count = spline.nodes.length - 1;
  for (let k = 0; k < count; k++) {
    for (let i = k === 0 ? 0 : 1; i <= perSegment; i++) {
      out.push(applyToPoint(matrix, pointAtPlace(spline, { segment: k, t: i / perSegment })));
    }
  }
  return out;
}

/** What a press at `point` (scene) takes hold of: a handle or an anchor within `reach` (scene
 * units; handles first, as they sit on top), else the curve within `reach` (where a node would be
 * added), else nothing. The first and last anchors are fixed: a press on one takes nothing. */
export type PathHit =
  | { kind: 'node'; selection: PathSelection }
  | { kind: 'curve'; place: { segment: number; t: number } };

export function hitPath(
  spline: PathSpline,
  matrix: Mat2D,
  point: Vec2,
  reach: number,
): PathHit | null {
  const nodes = nodesInScene(spline, matrix);
  const near = (p: Vec2 | null) =>
    p !== null && Math.hypot(p[0] - point[0], p[1] - point[1]) <= reach;
  for (const part of ['out', 'in'] as const) {
    for (let i = 0; i < nodes.length; i++) {
      if (near(nodes[i]![part])) return { kind: 'node', selection: { node: i, part } };
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    if (!near(nodes[i]!.at)) continue;
    // The ends are fixed: a press on one takes nothing (and adds no node there).
    if (i === 0 || i === nodes.length - 1) return null;
    return { kind: 'node', selection: { node: i, part: 'at' } };
  }
  // The curve, in the chord's frame: distances scale with the chord's length.
  const length = Math.hypot(matrix[0], matrix[1]);
  if (length <= 0) return null;
  const local = applyToPoint(invert(matrix), point);
  const nearest = nearestPoint(spline, local);
  if (nearest.distance * length > reach) return null;
  return { kind: 'curve', place: { segment: nearest.segment, t: nearest.t } };
}

// --- Edits, in the chord's frame --------------------------------------------------------------

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const rounded = (p: Vec2): Vec2 => [round6(p[0]), round6(p[1])];

function withNode(spline: PathSpline, index: number, node: SplineNode): PathSpline {
  return { nodes: spline.nodes.map((n, i) => (i === index ? node : n)) };
}

/** The anchor moved by `delta`, its handles with it (the ends never move). */
export function moveAnchor(spline: PathSpline, index: number, delta: Vec2): PathSpline {
  const node = spline.nodes[index];
  if (!node || index === 0 || index === spline.nodes.length - 1) return spline;
  const shift = (p: Vec2 | null) => (p ? rounded(add(p, delta)) : null);
  return withNode(spline, index, {
    ...node,
    at: rounded(add(node.at, delta)),
    in: shift(node.in),
    out: shift(node.out),
  });
}

/** What the other handle of a smooth node does when one is moved (D176): `mirror`, the default,
 * reflects the moved one through the anchor — the same line, the same length; `align` turns it to
 * stay opposite, keeping its own length (Shift held in the mode); `free` leaves it where it is and
 * makes the node a corner (Ctrl/⌘ held). */
export type HandleLink = 'mirror' | 'align' | 'free';

/** The handle `part` of a node put at `to`, the other handle following as `link` says on a smooth
 * node; a corner's handles move alone. A handle dropped on its anchor is retracted (null), and a
 * retracted partner — as the unused handles of the two ends are — stays so. */
export function moveHandle(
  spline: PathSpline,
  index: number,
  part: 'in' | 'out',
  to: Vec2,
  link: HandleLink = 'mirror',
): PathSpline {
  const node = spline.nodes[index];
  if (!node) return spline;
  const other = part === 'in' ? 'out' : 'in';
  const vector = sub(to, node.at);
  const length = Math.hypot(vector[0], vector[1]);
  const handle = length <= 1e-9 ? null : rounded(to);
  const next: SplineNode = { ...node, [part]: handle };
  if (link === 'free') {
    next.smooth = false;
  } else if (node.smooth && handle) {
    const partner = node[other];
    const partnerLength = partner
      ? Math.hypot(partner[0] - node.at[0], partner[1] - node.at[1])
      : 0;
    if (partnerLength > 1e-9) {
      const k = link === 'mirror' ? 1 : partnerLength / length;
      next[other] = rounded(sub(node.at, [vector[0] * k, vector[1] * k]));
    }
  }
  return withNode(spline, index, next);
}

/** How the other handle follows a drag, from the keys held at that move (D176): Ctrl/⌘ moves the
 * handle alone, Shift keeps the other's length, and with neither it mirrors the dragged one. */
export function handleLink(keys: {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): HandleLink {
  return keys.ctrlKey || keys.metaKey ? 'free' : keys.shiftKey ? 'align' : 'mirror';
}

/** A corner made smooth (its handles set opposite each other: the one it has is mirrored, both
 * are made from the chord's direction when it has none), or a smooth node made a corner (the
 * handles stay). The ends keep their kind. */
export function toggleSmooth(spline: PathSpline, index: number): PathSpline {
  const node = spline.nodes[index];
  if (!node || index === 0 || index === spline.nodes.length - 1) return spline;
  if (node.smooth) return withNode(spline, index, { ...node, smooth: false });
  const mirror = (p: Vec2): Vec2 => rounded(sub(node.at, sub(p, node.at)));
  if (node.in && node.out) {
    return withNode(spline, index, { ...node, smooth: true, out: mirror(node.in) });
  }
  if (node.in) return withNode(spline, index, { ...node, smooth: true, out: mirror(node.in) });
  if (node.out) return withNode(spline, index, { ...node, smooth: true, in: mirror(node.out) });
  // No handles: a third of the way towards each neighbour, along the line between them.
  const before = spline.nodes[index - 1]!.at;
  const after = spline.nodes[index + 1]!.at;
  const direction = sub(after, before);
  const third: Vec2 = [direction[0] / 6, direction[1] / 6];
  return withNode(spline, index, {
    ...node,
    smooth: true,
    in: rounded(sub(node.at, third)),
    out: rounded(add(node.at, third)),
  });
}

/** The spline without the node at `index` (never an end): its neighbours keep their handles. */
export function removeNode(spline: PathSpline, index: number): PathSpline {
  if (index <= 0 || index >= spline.nodes.length - 1) return spline;
  return { nodes: spline.nodes.filter((_, i) => i !== index) };
}

/** A node added where a press on the curve landed (`hitPath`), the curve unchanged. */
export function addNode(spline: PathSpline, place: { segment: number; t: number }): PathSpline {
  const split = splitSpline(spline, place);
  return {
    nodes: split.nodes.map((n) => ({
      ...n,
      at: rounded(n.at),
      in: n.in && rounded(n.in),
      out: n.out && rounded(n.out),
    })),
  };
}

/** The handle a drag starts from, so that a press on a retracted handle has a position. */
export function handlePosition(spline: PathSpline, selection: PathSelection): Vec2 | null {
  const node = spline.nodes[selection.node];
  if (!node) return null;
  return (selection.part === 'at' ? null : node[selection.part]) ?? node.at;
}

/** Whether `point` (scene) is within `reach` of one of the curve's two ends, which are fixed: a
 * press there belongs to the edited curve and takes nothing (`hitPath` gives null). */
export function onFixedEnd(spline: PathSpline, matrix: Mat2D, point: Vec2, reach: number): boolean {
  const ends = [spline.nodes[0], spline.nodes[spline.nodes.length - 1]];
  return ends.some((node) => {
    if (!node) return false;
    const [x, y] = applyToPoint(matrix, node.at);
    return Math.hypot(x - point[0], y - point[1]) <= reach;
  });
}

/** What the preview's hint says in the mode: the keys of a handle's drag (D176) and, on a pair
 * with routes (D167), what is edited and how another route is chosen in each state of «Path per
 * glyph» and of the lock (D175). */
export function pathEditHint(frame: PathFrame | null): string {
  if (!frame) return 'Edit path: the pair is not on screen at the playhead · Esc leaves';
  const routes = frame.choices.length >= 2;
  // How another route is chosen: by a click, or (the others locked) with the bar's arrows.
  const another = !frame.perGlyph
    ? ''
    : frame.choosable
      ? ' · click another route'
      : ' · ‹ › choose another route (the others are locked)';
  if (!frame.matrix) {
    return `Edit path: the glyph does not move (its start and end coincide), so it has no path${another} · Esc leaves`;
  }
  const what = !routes
    ? 'Edit path'
    : !frame.perGlyph
      ? ownRouteCount(frame.pair, frame.choices) > 0
        ? 'Edit the common path'
        : 'Edit path of all the glyphs'
      : frame.route
        ? 'Edit path of one route'
        : 'Edit path of all the routes';
  const choose = !routes
    ? ''
    : !frame.perGlyph
      ? ' · turn on Path per glyph to shape one glyph alone'
      : !frame.choosable
        ? another
        : frame.route
          ? ' · click another route to switch'
          : ' · click a route or its glyph to shape it alone';
  // A smooth anchor's handles mirror each other unless a key says otherwise (D176).
  const handles = 'Shift: keep the other handle’s length · Ctrl/⌘: move a handle alone';
  return `${what}: drag anchors and handles · ${handles} · click the curve to add one${choose} · Delete removes · double-click: smooth or corner · Esc finishes`;
}
