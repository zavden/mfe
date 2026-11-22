/* The multi-formula editor (modal): the glyphs of several formulas, to colour, hide or show
 * glyphs of all of them at once. Two views: a grid of cards (all at once) and big cards, one per
 * screen, that the wheel scrolls through (the choice is kept for the session). What is selected,
 * the view and the tools sit in a bar that stays at the top while the formulas scroll. A rectangle
 * dragged over the grid (or the cards) selects glyphs of every formula it touches. Glyphs are selected as in the formula editor — click,
 * Shift+click, Ctrl/⌘+click, a rectangle, a right-click for the menu — in any formula; each
 * action applies to every selected glyph as one undo step, and Ctrl/⌘+Z works while it is open.
 * Two tools act on the whole formulas (D155): one Scale for all of them (the formula editor's
 * field; empty, "mixed", while they differ) and Match colors, a menu of the project's lists, as
 * the menu of the selected formulas applies them. There is no draft: edits act on the project
 * immediately. */
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { DEFAULT_COLOR, type Formula, type FormulaId } from '../../model';
import { useProjectStore, useRenderStore } from '../../store';
import { applyColorMatch, matchColorsBlocker } from '../colors/applyColorMatch';
import { useColorMatchDialog } from '../colors/colorMatchDialogStore';
import { ColorMatchLabel } from '../colors/ColorMatchLabel';
import { ContextMenu, MenuItem } from '../ContextMenu';
import { HexColorField } from '../project/HexColorField';
import { Modal } from '../project/Modal';
import { SwatchRow } from '../project/SwatchRow';
import { SegmentedControl } from '../SegmentedControl';
import { Icon } from '../timeline/icons';
import { useMarquee } from '../useMarquee';
import { CommitInput } from './CommitInput';
import { setGlyphColorsOf, setGlyphsHiddenOf, setScaleOf } from './formulaActions';
import { GlyphMenu } from './GlyphMenu';
import { GlyphView } from './GlyphView';
import { GlyphChips } from './GlyphChips';
import { glyphsUnavailable } from './glyphsUnavailable';
import {
  clampMulti,
  clickMulti,
  marqueeMulti,
  NO_MULTI,
  selectAllMulti,
  targetsOf,
  type MultiSelection,
} from './multiSelection';
import { parseStandardScale, scaleFieldError, sharedScale, unscaledNote } from './standardScale';
import { keysText } from '../platform';

interface MultiEditorProps {
  ids: readonly FormulaId[];
  onClose(): void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

type View = 'grid' | 'cards';
const VIEWS = [
  { value: 'grid', label: 'Grid' },
  { value: 'cards', label: 'Cards' },
] as const;
/** The view last chosen, kept for the session. */
let rememberedView: View = 'grid';
/** After a wheel gesture moved a card, the wheel waits this long before moving another. */
const WHEEL_LOCK_MS = 350;

const cardsOf = (list: HTMLElement) => [
  ...list.querySelectorAll<HTMLElement>(':scope > .multi-card'),
];

/** The card of a cards list nearest to its top. */
function cardIndex(list: HTMLElement): number {
  const cards = cardsOf(list);
  const offset = (card: HTMLElement) => Math.abs(card.offsetTop - list.offsetTop - list.scrollTop);
  let best = 0;
  cards.forEach((card, i) => {
    if (offset(card) < offset(cards[best]!)) best = i;
  });
  return best;
}

export function MultiEditor({ ids, onClose }: MultiEditorProps) {
  const project = useProjectStore((s) => s.project);
  const resolved = useRenderStore((s) => s.resolved);
  const entries = useRenderStore((s) => s.entries);
  const formulas = useMemo(
    () =>
      ids.flatMap((id) => project.formulas.find((f) => f.id === id) ?? []) as readonly Formula[],
    [ids, project.formulas],
  );
  const counts = useMemo(
    () => new Map(formulas.map((f) => [f.id, f.snapshot?.glyphs.length ?? 0])),
    [formulas],
  );
  const order = formulas.map((f) => f.id);

  const [rawSelection, setSelection] = useState<MultiSelection>(NO_MULTI);
  const selection = clampMulti(rawSelection, counts);
  const [hovered, setHovered] = useState<{ id: FormulaId; index: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const marqueeBase = useRef<MultiSelection>(NO_MULTI);
  const [view, setViewState] = useState<View>(rememberedView);
  const setView = (next: View) => {
    rememberedView = next;
    setViewState(next);
  };
  /** In the cards view: the card scrolled into view. */
  const [current, setCurrent] = useState(0);
  /** The grid, or the cards list: where a rectangle selects glyphs of any formula. */
  const areaRef = useRef<HTMLDivElement>(null);
  const marquee = useMarquee({
    containerRef: areaRef,
    onStart: () => {
      marqueeBase.current = selection;
      setHovered(null);
    },
    onChange: (keys, additive) => {
      // Keys are `<formula id>:<glyph>`.
      const touched = new Map<FormulaId, number[]>();
      for (const key of keys) {
        const at = key.lastIndexOf(':');
        const id = key.slice(0, at);
        touched.set(id, [...(touched.get(id) ?? []), Number(key.slice(at + 1))]);
      }
      setSelection(marqueeMulti(marqueeBase.current, touched, additive));
    },
  });

  // One wheel gesture moves exactly one card (a short wheel step would snap back to the same
  // card); the scroll bar and the keyboard scroll natively, with snapping.
  useEffect(() => {
    const list = areaRef.current;
    if (view !== 'cards' || !list) return;
    let lockedUntil = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      const now = performance.now();
      if (now < lockedUntil) return;
      lockedUntil = now + WHEEL_LOCK_MS;
      const cards = cardsOf(list);
      const next = cardIndex(list) + (event.deltaY > 0 ? 1 : -1);
      cards[Math.max(0, Math.min(cards.length - 1, next))]?.scrollIntoView({
        block: 'start',
        behavior: 'smooth',
      });
    };
    list.addEventListener('wheel', onWheel, { passive: false });
    return () => list.removeEventListener('wheel', onWheel);
  }, [view]);

  // Close when every formula is gone (an undo of their creation, a deletion).
  useEffect(() => {
    if (formulas.length === 0) onClose();
  }, [formulas.length, onClose]);

  const targets = targetsOf(selection, order);
  const glyphCount = targets.reduce((n, t) => n + t.glyphs.length, 0);
  const formulaOf = (id: FormulaId) => formulas.find((f) => f.id === id)!;
  const someTarget = (test: (f: Formula, glyph: number) => boolean) =>
    targets.some((t) => t.glyphs.some((g) => test(formulaOf(t.id), g)));
  const hasOwnColor = (f: Formula, g: number) => String(g) in f.glyphColors;
  const isHidden = (f: Formula, g: number) => f.hiddenGlyphs.includes(g);
  const canClearColor = someTarget(hasOwnColor);
  const canHide = someTarget((f, g) => !isHidden(f, g));
  const canShow = someTarget(isHidden);
  const summary =
    glyphCount === 0
      ? keysText(
          'Click glyphs in any formula, or drag a box over them (Shift: range, Ctrl/⌘: toggle or add)',
        )
      : `${plural(glyphCount, 'glyph')} in ${plural(targets.length, 'formula')}`;

  const colour = (hex: string | null) => setGlyphColorsOf(targets, hex);
  const hide = (hidden: boolean) => setGlyphsHiddenOf(targets, hidden);

  // The tools of the whole formulas: one scale for all, and a list of match colours.
  const scale = sharedScale(formulas);
  const scaleNote = unscaledNote(scale);
  /** Why the lists cannot colour all of them (a font text, a brace…): the button is off. */
  const matchBlocker = matchColorsBlocker(formulas);
  const matchButton = useRef<HTMLButtonElement>(null);
  /** The menu of the lists, under its button. */
  const [matchMenu, setMatchMenu] = useState<{ x: number; y: number } | null>(null);
  const openMatchMenu = () => {
    const rect = matchButton.current!.getBoundingClientRect();
    setMatchMenu({ x: rect.left, y: rect.bottom + 2 });
  };

  const openMenu = (id: FormulaId, index: number | null, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    let count = glyphCount;
    if (index !== null && !selection.get(id)?.selected.has(index)) {
      setSelection(clickMulti(NO_MULTI, id, index, { shift: false, toggle: false }));
      count = 1;
    }
    if (count === 0) return;
    setHovered(null);
    setMenu({ x: event.clientX, y: event.clientY });
  };

  const renderCard = (formula: Formula) => {
    const own = selection.get(formula.id);
    const render = resolved.get(formula.id);
    const pick = (index: number, event: MouseEvent) =>
      setSelection((prev) =>
        clickMulti(clampMulti(prev, counts), formula.id, index, {
          shift: event.shiftKey,
          toggle: event.ctrlKey || event.metaKey,
        }),
      );
    return (
      <section
        key={formula.id}
        className="multi-card"
        data-testid={`multi-card-${formula.id}`}
        aria-label={`Formula ${formula.name}`}
      >
        <header className="multi-card-header">
          <span className="multi-card-tag" style={{ background: formula.tag.color }} />
          <span className="multi-card-name">{formula.name}</span>
          <span className="field-hint">
            {plural(counts.get(formula.id) ?? 0, 'glyph')}
            {own ? ` · ${own.selected.size} selected` : ''}
          </span>
        </header>
        {render && formula.snapshot ? (
          <>
            <GlyphView
              formula={formula}
              resolved={render}
              background={project.meta.background}
              selected={own?.selected ?? NO_MULTI_GLYPHS}
              hovered={hovered?.id === formula.id ? hovered.index : null}
              onHover={(index) => setHovered(index === null ? null : { id: formula.id, index })}
              onGlyphClick={pick}
              onBackgroundClick={() => setSelection(NO_MULTI)}
              onContextMenu={(index, event) => openMenu(formula.id, index, event)}
              marqueePrefix={`${formula.id}:`}
              testIdPrefix={`multi-${formula.id}`}
              className="glyph-svg multi-svg"
            />
            <GlyphChips
              glyphs={formula.snapshot.glyphs}
              selected={own?.selected ?? NO_MULTI_GLYPHS}
              onPick={pick}
              label={`Select glyphs of ${formula.name}`}
              testIdPrefix={`multi-${formula.id}`}
            />
          </>
        ) : (
          <p className="field-hint" data-testid={`multi-${formula.id}-empty`}>
            {glyphsUnavailable(formula, entries[formula.id])}
          </p>
        )}
      </section>
    );
  };

  const marqueeBox = marquee.rect && (
    <div
      className="marquee-box"
      data-testid="multi-marquee"
      style={{
        left: marquee.rect.x,
        top: marquee.rect.y,
        width: marquee.rect.width,
        height: marquee.rect.height,
      }}
    />
  );

  return (
    <Modal
      title={`Edit ${plural(formulas.length, 'formula')} together`}
      onClose={onClose}
      testId="multi-editor"
      width="min(1180px, calc(100vw - 32px))"
      resizable
      // Its edits are project edits, each an undo step.
      allowHistory
      footer={
        <button type="button" className="btn" onClick={onClose} data-testid="multi-editor-done">
          Close
        </button>
      }
    >
      <div className="multi-editor">
        <div className="multi-bar" data-testid="multi-bar">
          <div className="multi-bar-row">
            <span className="glyph-selection-label" data-testid="multi-summary">
              {summary}
            </span>
            {view === 'cards' && (
              <span className="field-hint" data-testid="multi-card-position">
                {formulas[Math.min(current, formulas.length - 1)]?.name} ·{' '}
                {Math.min(current, formulas.length - 1) + 1} / {formulas.length} — scroll for the
                next one
              </span>
            )}
            <div className="multi-view">
              <SegmentedControl
                label="View"
                value={view}
                options={VIEWS}
                onChange={setView}
                testId="multi-view"
              />
            </div>
          </div>
          <div className="multi-bar-row">
            <SwatchRow
              label="Glyph colour"
              testIdPrefix="multi-palette"
              disabled={glyphCount === 0}
              onPick={colour}
            >
              <HexColorField
                value={formulas[0]?.color ?? DEFAULT_COLOR}
                label="Custom glyph colour"
                testId="multi-custom-color"
                disabled={glyphCount === 0}
                onCommit={(hex) => colour(hex)}
              />
            </SwatchRow>
            <div className="glyph-actions">
              <button
                type="button"
                className="btn btn-small"
                disabled={!canClearColor}
                onClick={() => colour(null)}
                data-testid="multi-clear-color"
              >
                Clear colour
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={!canHide}
                onClick={() => hide(true)}
                data-testid="multi-hide"
              >
                Hide at the start
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={!canShow}
                onClick={() => hide(false)}
                data-testid="multi-show"
              >
                Show at the start
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setSelection(selectAllMulti(counts))}
                data-testid="multi-select-all"
              >
                Select all
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={glyphCount === 0}
                onClick={() => setSelection(NO_MULTI)}
                data-testid="multi-clear-selection"
              >
                Clear selection
              </button>
            </div>
          </div>
          {/* Of the whole formulas, whatever glyphs are selected. */}
          <div className="multi-bar-row multi-formula-tools" data-testid="multi-formula-tools">
            {scale.scaled > 0 && (
              <span className="inline-fields">
                <span className="glyph-row-label" aria-hidden="true">
                  Scale
                </span>
                {/* The formula editor's Scale (48 × scale = font_size), one value for all. */}
                <CommitInput
                  value={scale.text}
                  label="Scale"
                  testId="multi-scale"
                  width="64px"
                  placeholder="mixed"
                  validate={scaleFieldError}
                  onCommit={(text) => setScaleOf(order, parseStandardScale(text) ?? 1)}
                />
              </span>
            )}
            {scaleNote && (
              <span className="field-hint" data-testid="multi-scale-note">
                {scaleNote}
              </span>
            )}
            <button
              ref={matchButton}
              type="button"
              className="btn btn-small multi-match"
              data-testid="multi-match"
              aria-haspopup="menu"
              aria-expanded={matchMenu !== null}
              disabled={matchBlocker !== null}
              title={matchBlocker ?? `Colour the ${plural(formulas.length, 'formula')} with a list`}
              onClick={openMatchMenu}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  openMatchMenu();
                }
              }}
            >
              Match colors
              <Icon name="chevron-down" />
            </button>
          </div>
        </div>

        {view === 'grid' ? (
          <div
            className="multi-grid"
            data-testid="multi-grid"
            ref={areaRef}
            onPointerDown={(event) => {
              if (!(event.target as Element).closest('.glyph-chips')) marquee.onPointerDown(event);
            }}
          >
            {formulas.map(renderCard)}
            {marqueeBox}
          </div>
        ) : (
          <div
            className="multi-cards"
            data-testid="multi-cards"
            ref={areaRef}
            onPointerDown={(event) => {
              if (!(event.target as Element).closest('.glyph-chips')) marquee.onPointerDown(event);
            }}
            onScroll={(event) => setCurrent(cardIndex(event.currentTarget))}
          >
            {formulas.map(renderCard)}
            {marqueeBox}
          </div>
        )}
      </div>

      {matchMenu && (
        // The «Apply match colors» of the menu of the selected formulas, on these.
        <ContextMenu
          x={matchMenu.x}
          y={matchMenu.y}
          label="Match colors"
          testId="multi-match-menu"
          onClose={() => setMatchMenu(null)}
        >
          {project.colorMatches.length === 0 ? (
            <MenuItem
              testId="multi-match-create"
              onClick={() => {
                // The lists' dialog is a dialog of the menu bar, which would open under this one:
                // this one closes first (its edits are in the project already).
                setMatchMenu(null);
                onClose();
                useColorMatchDialog.getState().openNew();
              }}
            >
              Create match colors…
            </MenuItem>
          ) : (
            project.colorMatches.map((match) => (
              <MenuItem
                key={match.id}
                testId={`multi-match-${match.id}`}
                onClick={() => {
                  setMatchMenu(null);
                  void applyColorMatch(order, match.id);
                }}
              >
                <ColorMatchLabel match={match} />
              </MenuItem>
            ))
          )}
        </ContextMenu>
      )}
      {menu && glyphCount > 0 && (
        <GlyphMenu
          x={menu.x}
          y={menu.y}
          header={summary}
          canClearColor={canClearColor}
          canHide={canHide}
          canShow={canShow}
          onColor={colour}
          onHidden={hide}
          onClose={() => setMenu(null)}
        />
      )}
    </Modal>
  );
}

const NO_MULTI_GLYPHS: ReadonlySet<number> = new Set();
