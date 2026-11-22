/* The state of a pair editor in React, on `pairSession.ts`: the relation editor and the Morph
 * block's pair editor hold their pairs here — identified, re-based when a formula is re-rendered
 * underneath (the stores are watched directly: the render sync publishes the transition, then
 * amends the project), selected, suggested, hovered, with a menu — and take from here the
 * handlers of their canvas, pair list and pair menu. What differs between the two editors comes
 * in as options: the holder of the pairs (with its default style), how a link is made, how a
 * pair is described, and the words of the deletion dialog. */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { FormulaId, GlyphPair, Issue, PairExtras, RelationStyle } from '../../model';
import { onProjectLoaded, useProjectStore, useRenderStore } from '../../store';
import { useDocumentStore } from '../project/documentStore';
import { confirmDelete } from '../project/dialogStore';
import {
  contextSelection,
  glyphClick,
  NO_SELECTION,
  pairEmphasis,
  pairsHolding,
  type PairSide,
  type SideGlyph,
} from './pairGestures';
import { linkOffer, type LinkGlyphs, type LinkOffer } from './linkAs';
import type { PairMenuState } from './PairMenu';
import {
  changed,
  identified,
  idsAt,
  indicesOf,
  reconcile,
  stripIds,
  type DraftPair,
  type Revision,
  type Rebaseable,
  type Sides,
} from './pairSession';
import { joinPairs, splitPair } from './pairShare';
import {
  clearPairsPath,
  marqueeSides,
  removePair,
  removePairs,
  setPairExtras,
  setPairStyle,
  setPairsStyle,
  type LinkResult,
  type PairHolder,
  type SideSelection,
} from './relationOps';

export interface PairSessionOptions<H extends PairHolder> {
  /** The pairs as saved: the draft starts from them. */
  start: readonly GlyphPair[];
  /** The formulas whose glyphs the two sides index (the one formula twice for a Morph block). */
  formulaIds: Record<PairSide, FormulaId>;
  /** A Morph block: a glyph never on both sides of a pair, a re-base included. */
  selfPairs?: boolean;
  /** The holder the pair operations act on, around the draft pairs: it gives the default style. */
  holder(pairs: GlyphPair[]): H;
  /** Make the pair `from → to` on the holder (`linkPair`, `linkMorphPair`), with a style of its
   * own or, for null, the holder's; `separate`: as a pair of its own even onto the targets of a
   * pair, which it would otherwise join. */
  link(
    holder: H,
    from: readonly number[],
    to: readonly number[],
    style: RelationStyle | null,
    separate: boolean,
  ): LinkResult<H>;
  /** What validation would say of the draft with these pairs (`draftProblems`, `morphProblems`):
   * «Link as» reads it before a pair is made, to say which styles cannot be. */
  problems?(pairs: GlyphPair[]): readonly Issue[];
  /** One of those problems in the editor's own words, for the glyphs of the link considered —
   * what its canvas says of a glyph that something else takes —; null: the problem's message. */
  explain?(issue: Issue, glyphs: LinkGlyphs): string | null;
  /** Names a pair in the deletion dialog. */
  describe(pair: GlyphPair): string;
  wording: {
    /** What a deleted pair is taken out of: "the relation", "the block". */
    owner: string;
    /** When it is gone from the project: "the relation is saved", "the pairs are saved". */
    saved: string;
    /** Who was re-rendered while the deletion dialog was open: "A formula", "“steps”". */
    rerendered: string;
  };
}

interface Menu {
  ids: number[];
  x: number;
  y: number;
  align: 'start' | 'center';
  /** What the selected glyphs can be linked as, read when the menu opened. */
  link: (LinkOffer & { label: string }) | null;
}

export interface SessionSnapshot extends Rebaseable<DraftPair> {
  keys: Revision;
  stale: string | null;
}

export interface PairSession {
  /** The draft, in order; the indices below are places in it. */
  pairs: DraftPair[];
  /** The draft as the project stores pairs (no ids). */
  plain: GlyphPair[];
  dirty: boolean;
  /** Why Save is held back (a re-render whose step is not known), or null. */
  stale: string | null;
  message: string | null;
  setMessage(message: string | null): void;
  selection: SideSelection;
  setSelection(selection: SideSelection): void;
  clearSelection(): void;
  /** Both sides hold a selection: a link can be made. */
  canLink: boolean;
  /** Something is selected on either side. */
  selected: boolean;
  suggestion: GlyphPair[] | null;
  setSuggestion(suggestion: GlyphPair[] | null): void;
  acceptSuggestion(): void;
  /** The hovered row and glyph, for the emphasis. */
  hoverGlyph: SideGlyph | null;
  /** Replace the draft (new pairs take ids; a suggestion is dropped). */
  setPairs(next: readonly GlyphPair[]): void;
  /** Link the glyphs, with the holder's style or one of the pair's own; `separate`: never
   * joining a pair that brings the targets. */
  link(
    from: readonly number[],
    to: readonly number[],
    style?: RelationStyle | null,
    separate?: boolean,
  ): void;
  /** Delete pairs after a held confirmation; dropped, and said so, when a formula was
   * re-rendered meanwhile (the places would name other pairs). */
  deletePairs(indices: readonly number[]): Promise<void>;
  /** Whether the draft's indices still refer to the snapshots `keys` (the guard of Save). */
  current(keys: Revision, formulaIds?: Record<PairSide, FormulaId>): boolean;
  /** Synchronously reconciled draft for a store-facing command, before React renders. */
  snapshot(): SessionSnapshot;
  /** The props of `GlyphLinkCanvas` the session owns. */
  canvas: {
    selectedFrom: ReadonlySet<number>;
    selectedTo: ReadonlySet<number>;
    suggestion: readonly GlyphPair[] | null;
    focusPairs: ReadonlySet<number>;
    editablePairs: ReadonlySet<number>;
    onGlyph(side: PairSide, glyph: number, event: MouseEvent): void;
    onBackground(): void;
    onMarqueeStart(): void;
    onMarquee(from: number[], to: number[], additive: boolean): void;
    onContextMenu(target: SideGlyph | null, event: MouseEvent): void;
    onHoverGlyph(glyph: SideGlyph | null): void;
    onBadgeClick(index: number, anchor: DOMRect): void;
  };
  /** The props of `PairList` the session owns. */
  list: {
    focusPairs: ReadonlySet<number>;
    onStyle(index: number, style: RelationStyle | null): void;
    onExtras(index: number, extras: PairExtras): void;
    onEdit(index: number): void;
    onDelete(index: number): void;
    onHover(index: number | null): void;
  };
  /** The open pair menu, with the places of its pairs in the draft now, and its handlers. */
  pairMenu: PairMenuState | null;
  menu: {
    onStyle(indices: number[], style: RelationStyle | null): void;
    onDelete(indices: number[]): void;
    onClearPath(indices: number[]): void;
    /** Make the link the menu offers, with this style (null: join the pair it lands on), as a
     * pair of its own when `separate`. */
    onLinkAs(style: RelationStyle | null, separate: boolean): void;
    /** Take pair `index` apart, one pair per source («Split into separate pairs»). */
    onSplit(index: number): void;
    /** Put the pairs that bring the target of pair `index` into one («Join into one pair»). */
    onJoin(index: number): void;
    onClose(): void;
  };
}

/** The snapshot keys of the two formulas as the project has them now. */
function sidesOf(formulaIds: Record<PairSide, FormulaId>): Sides | null {
  const { formulas } = useProjectStore.getState().project;
  const side = (id: FormulaId) => {
    const formula = formulas.find((f) => f.id === id);
    return formula && { id, name: formula.name, key: formula.snapshot?.key ?? null };
  };
  const from = side(formulaIds.from);
  const to = side(formulaIds.to);
  return from && to ? { from, to } : null;
}

export function usePairSession<H extends PairHolder>(options: PairSessionOptions<H>): PairSession {
  const { formulaIds, selfPairs = false } = options;
  // The handlers read the options as they are now, without being made again on every render.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const [initial] = useState(() => identified(options.start, 1));
  const [opened] = useState(() => useDocumentStore.getState().session);
  const [initialIds] = useState(formulaIds);
  const replaced = useRef(false);
  const nextId = useRef(initial.next);
  const [state, setState] = useState<SessionSnapshot>(() => {
    const sides = sidesOf(formulaIds);
    return {
      pairs: initial.pairs,
      base: initial.pairs,
      selection: NO_SELECTION,
      suggestion: null,
      keys: { from: sides?.from.key ?? null, to: sides?.to.key ?? null },
      stale: null,
    };
  });
  // This snapshot is authoritative. Publish data and its revision together before notifying
  // React: render-sync can publish several transitions during one batched render.
  const live = useRef(state);
  const publish = useCallback((next: SessionSnapshot) => {
    live.current = next;
    setState(next);
  }, []);
  const setSelection = useCallback(
    (selection: SideSelection) => {
      publish({ ...live.current, selection });
    },
    [publish],
  );
  const setSuggestion = useCallback(
    (suggestion: GlyphPair[] | null) => {
      publish({ ...live.current, suggestion });
    },
    [publish],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [hoverGlyph, setHoverGlyph] = useState<SideGlyph | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const marqueeBase = useRef<SideSelection>(NO_SELECTION);

  const sync = useCallback(() => {
    const sides = sidesOf(initialIds);
    let stale: string | null = null;
    if (replaced.current || useDocumentStore.getState().session !== opened) {
      stale = 'The document changed: close the editor and open it again.';
    } else if (!sides || initialIds.from !== formulaIds.from || initialIds.to !== formulaIds.to) {
      stale = 'A formula changed: close the editor and open it again.';
    }
    if (stale || !sides) {
      if (stale !== live.current.stale) publish({ ...live.current, stale });
      return live.current;
    }
    const out = reconcile(live.current, sides, useRenderStore.getState().transitions, selfPairs);
    const old = live.current;
    if (out.keys !== old.keys || out.pairs !== old.pairs || out.stale !== old.stale) {
      publish({
        keys: out.keys,
        pairs: out.pairs,
        base: out.base,
        selection: out.selection,
        suggestion: out.suggestion,
        stale: out.stale,
      });
    }
    if (out.rebased) {
      marqueeBase.current = out.selection;
      setMenu(null);
      setHoverId(null);
      setHoverGlyph(null);
      if (out.dropped) setMessage(out.dropped);
    }
    return live.current;
  }, [formulaIds.from, formulaIds.to, initialIds, opened, publish, selfPairs]);

  useEffect(() => {
    const offProject = useProjectStore.subscribe(sync);
    const offRender = useRenderStore.subscribe(sync);
    const offDocument = useDocumentStore.subscribe(sync);
    const offLoad = onProjectLoaded(() => {
      replaced.current = true;
      sync();
    });
    sync();
    return () => {
      offProject();
      offRender();
      offDocument();
      offLoad();
    };
  }, [sync]);

  const { selection, suggestion, stale } = state;
  const { pairs } = state;
  const plain = useMemo(() => stripIds(pairs), [pairs]);
  const dirty = changed(pairs, state.base);

  const setPairs = useCallback(
    (next: readonly GlyphPair[]) => {
      const given = identified(next, nextId.current);
      nextId.current = given.next;
      publish({ ...live.current, pairs: given.pairs, suggestion: null });
    },
    [publish],
  );
  const holder = () => latest.current.holder(live.current.pairs);
  const currentIndices = (indices: readonly number[]) =>
    indicesOf(live.current.pairs, idsAt(pairs, indices));
  const clearSelection = () => setSelection(NO_SELECTION);

  const link = (
    from: readonly number[],
    to: readonly number[],
    style: RelationStyle | null = null,
    separate = false,
  ) => {
    const result = latest.current.link(holder(), from, to, style, separate);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setMessage(result.message ?? null); // a link that joined a pair says so
    setPairs(result.relation.pairs);
    clearSelection();
  };

  const onGlyph = (side: PairSide, glyph: number, event: MouseEvent) => {
    setMessage(null);
    const click = glyphClick(
      live.current.selection,
      side,
      glyph,
      event.shiftKey || event.ctrlKey || event.metaKey,
    );
    if (click.kind === 'link') link(click.from, click.to);
    else setSelection(click.selection);
  };

  const openMenu = (
    ids: number[],
    x: number,
    y: number,
    align: Menu['align'],
    link: Menu['link'] = null,
  ) => setMenu({ ids, x, y, align, link });

  /** A right-click on the canvas: the menu of the selected glyphs — what they can be linked as,
   * when both sides hold some, and the pairs that hold them. On a glyph outside the selection,
   * the selection changes first (`contextSelection`). */
  const openContextMenu = (target: SideGlyph | null, event: MouseEvent) => {
    const { selection: sel, changed: moved } = contextSelection(live.current.selection, target);
    if (moved) {
      setSelection(sel);
      setMessage(null);
    }
    if (sel.from.size + sel.to.size === 0) return;
    const { link: make, problems, explain, describe } = latest.current;
    const offer = linkOffer(holder(), sel.from, sel.to, make, problems ?? (() => []), explain);
    openMenu(
      idsAt(pairs, pairsHolding(pairs, sel)),
      event.clientX,
      event.clientY,
      'start',
      offer && { ...offer, label: describe({ from: offer.from, to: offer.to, style: null }) },
    );
  };

  const deletePairs = async (indices: readonly number[]) => {
    setMenu(null);
    const doomed = indices.filter((i) => pairs[i]);
    if (doomed.length === 0) return;
    const { describe, wording } = latest.current;
    const one = doomed.length === 1;
    const revision = live.current.keys;
    const ids = idsAt(pairs, doomed);
    const ok = await confirmDelete({
      what: one ? 'link' : 'links',
      title: one ? 'Delete this link?' : `Delete these ${doomed.length} links?`,
      message: one
        ? `${describe(pairs[doomed[0]!]!)} will be taken out of ${wording.owner} (it is gone from the project once ${wording.saved}).`
        : `They will be taken out of ${wording.owner} (they are gone from the project once ${wording.saved}):`,
      details: one ? undefined : doomed.map((i) => describe(pairs[i]!)),
    });
    if (!ok) return;
    sync();
    if (live.current.keys !== revision || live.current.stale) {
      setMessage(
        `${latest.current.wording.rerendered} was re-rendered while the dialog was open: nothing was deleted. Delete the links again.`,
      );
      return;
    }
    setPairs(removePairs(holder(), indicesOf(live.current.pairs, ids)).pairs);
    setHoverId(null);
  };

  const hoverPair = hoverId === null ? null : (indicesOf(pairs, [hoverId])[0] ?? null);
  const { selected: selectedPairs, focus: focusPairs } = pairEmphasis(
    pairs,
    selection,
    hoverPair,
    hoverGlyph,
  );

  return {
    pairs,
    plain,
    dirty,
    stale,
    message,
    setMessage,
    selection,
    setSelection,
    clearSelection,
    canLink: selection.from.size > 0 && selection.to.size > 0,
    selected: selection.from.size + selection.to.size > 0,
    suggestion,
    setSuggestion,
    acceptSuggestion: () => {
      const current = live.current;
      if (!current.suggestion) return;
      setPairs([...current.pairs, ...current.suggestion]);
      setMessage(null);
    },
    hoverGlyph,
    setPairs,
    link,
    deletePairs,
    current: (snapshots, ids = initialIds) => {
      const current = sync();
      return (
        !current.stale &&
        ids.from === initialIds.from &&
        ids.to === initialIds.to &&
        current.keys.from === snapshots.from &&
        current.keys.to === snapshots.to
      );
    },
    snapshot: sync,
    canvas: {
      selectedFrom: selection.from,
      selectedTo: selection.to,
      suggestion,
      focusPairs,
      editablePairs: selectedPairs,
      onGlyph,
      onBackground: () => {
        clearSelection();
        setMessage(null);
      },
      onMarqueeStart: () => {
        marqueeBase.current = live.current.selection;
        setMessage(null);
      },
      onMarquee: (from, to, additive) =>
        setSelection(marqueeSides(marqueeBase.current, { from, to }, additive)),
      onContextMenu: openContextMenu,
      onHoverGlyph: setHoverGlyph,
      onBadgeClick: (index, anchor) =>
        openMenu(
          idsAt(pairs, [index]),
          anchor.left + anchor.width / 2,
          anchor.bottom + 6,
          'center',
        ),
    },
    list: {
      focusPairs,
      onStyle: (i, style) =>
        setPairs(setPairStyle(holder(), currentIndices([i])[0] ?? -1, style).pairs),
      onExtras: (i, extras) =>
        setPairs(setPairExtras(holder(), currentIndices([i])[0] ?? -1, extras).pairs),
      onEdit: (i) => {
        const index = currentIndices([i])[0];
        const pair = index === undefined ? undefined : live.current.pairs[index];
        if (!pair) return;
        setPairs(removePair(holder(), currentIndices([i])[0] ?? -1).pairs);
        setSelection({ from: new Set(pair.from), to: new Set(pair.to) });
      },
      onDelete: (i) => setPairs(removePair(holder(), currentIndices([i])[0] ?? -1).pairs),
      onHover: (i) => setHoverId(i === null ? null : (pairs[i]?.id ?? null)),
    },
    pairMenu: menu && {
      indices: indicesOf(pairs, menu.ids),
      x: menu.x,
      y: menu.y,
      align: menu.align,
      link: menu.link,
    },
    menu: {
      onStyle: (indices, style) => {
        setPairs(setPairsStyle(holder(), currentIndices(indices), style).pairs);
        setMenu(null);
      },
      onDelete: (indices) => void deletePairs(indices),
      onClearPath: (indices) => {
        setPairs(clearPairsPath(holder(), currentIndices(indices)).pairs);
        setMenu(null);
      },
      onLinkAs: (style, separate) => {
        const offer = menu?.link;
        setMenu(null);
        if (offer) link(offer.from, offer.to, style, separate);
      },
      onSplit: (index) => {
        const at = currentIndices([index])[0];
        setMenu(null);
        if (at === undefined) return;
        const before = live.current.pairs[at];
        const next = splitPair(holder(), at);
        if (!before || next.pairs.length === live.current.pairs.length) return;
        setPairs(next.pairs);
        setMessage(
          `Pair ${at + 1} is ${new Set(before.from).size} pairs now, one per source: each can have its own style and path.`,
        );
      },
      onJoin: (index) => {
        const at = currentIndices([index])[0];
        setMenu(null);
        const joined = at === undefined ? null : joinPairs(holder(), at);
        if (!joined) return;
        setPairs(joined.holder.pairs);
        setMessage(
          `Pairs ${joined.from.map((i) => i + 1).join(', ')} are pair ${joined.index + 1} now.`,
        );
      },
      onClose: () => setMenu(null),
    },
  };
}
