/* Glyph view of the applied formula: its glyphs, each with its canonical index. Click selects a
 * glyph, Shift+click a range, Ctrl/⌘+click toggles; the palette colours the selection
 * (`Formula.glyphColors`, canonical indices) and "At the start" hides it from the intro of every
 * clip (`Formula.hiddenGlyphs`), which the view draws in grey. A rectangle dragged over the view
 * selects glyphs too, and a right-click opens a menu with the same actions for the selection.
 * The glyphs are also listed under the drawing as keys with index and label, the way to pick
 * them from the keyboard, when the editor's `glyphList` preference asks for it (the list grows
 * with the formula; `GlyphListToggle`, which the caller places, switches it).
 * The edits go to the project, each one undo step, unless the caller takes them (`edits`: the
 * composition workspace shows the glyphs of a draft, and keeps what is done to them in it). */
import { useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Formula } from '../../model';
import type { ResolvedFormula } from '../../engine';
import { defaultClipState, isBlank } from '../../model';
import { glyphColor } from '../../scene';
import { useRenderStore } from '../../store';
import { usePreferences } from '../preferences';
import { HexColorField } from '../project/HexColorField';
import { SwatchRow } from '../project/SwatchRow';
import { Icon } from '../timeline/icons';
import { clearAllGlyphColors, setGlyphColors, setGlyphsHidden } from './formulaActions';
import { drawnGlyphs } from './glyphPaths';
import { GlyphMenu } from './GlyphMenu';
import { GlyphView } from './GlyphView';
import { glyphsUnavailable, hasGlyphs } from './glyphsUnavailable';
import {
  clampSelection,
  clickGlyph,
  marqueeSelection,
  NO_SELECTION,
  selectAll,
  type GlyphSelection,
} from './glyphSelection';
import { keysText } from '../platform';

const NO_STYLE = defaultClipState();

/** What is done to the glyphs of the view, by canonical index. */
export interface GlyphEdits {
  /** Colour the glyphs; null removes their own colour. */
  color(indices: readonly number[], color: string | null): void;
  /** Hide the glyphs at the start of every clip, or show them again. */
  hidden(indices: readonly number[], hidden: boolean): void;
  /** Remove every glyph's own colour. */
  clearColors(): void;
}

interface GlyphColorsProps {
  formula: Formula;
  resolved: ResolvedFormula | null;
  background: string;
  /** The LaTeX or packages in the editor differ from the applied formula. */
  stale: boolean;
  /** Who takes the edits; by default the project, on the formula of that id. */
  edits?: GlyphEdits;
  /** What to say where there are no glyphs to show; by default what the render of the formula
   * says in the project. */
  emptyHint?: string;
}

/** The edits as changes of the project's formula `id`. */
const projectEdits = (id: string): GlyphEdits => ({
  color: (indices, color) => setGlyphColors(id, indices, color),
  hidden: (indices, hidden) => setGlyphsHidden(id, indices, hidden),
  clearColors: () => clearAllGlyphColors(id),
});

export function GlyphColors({
  formula,
  resolved,
  background,
  stale,
  edits = projectEdits(formula.id),
  emptyHint,
}: GlyphColorsProps) {
  const count = formula.snapshot?.glyphs.length ?? 0;
  const entry = useRenderStore((s) => s.entries[formula.id]);
  const listed = usePreferences((s) => s.glyphList);
  const [rawSelection, setSelection] = useState<GlyphSelection>(NO_SELECTION);
  /** The glyph under the pointer (in the view or the chip list), whose index the view shows. */
  const [hovered, setHovered] = useState<number | null>(null);
  /** The right-click menu of the selection (colour, hide, show), at a screen position. */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // Dragging a rectangle over the view selects the glyphs it touches (Ctrl/⌘, Shift: adds).
  const marqueeBase = useRef<GlyphSelection>(NO_SELECTION);
  const selection = clampSelection(rawSelection, count);
  const selected = [...selection.selected].sort((a, b) => a - b);

  if (!hasGlyphs(formula, resolved)) {
    return (
      <p className="field-hint" data-testid="glyph-view-empty">
        {emptyHint ??
          (isBlank(formula)
            ? 'Apply some LaTeX to see its glyphs and colour them.'
            : glyphsUnavailable(formula, entry))}
      </p>
    );
  }

  const glyphs = drawnGlyphs(resolved);

  /** A right-click on a glyph (`index`) or the background (null) opens the selection's menu; a
   * glyph outside the selection becomes the selection first. */
  const openMenu = (index: number | null, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    let size = selection.selected.size;
    if (index !== null && !selection.selected.has(index)) {
      setSelection({ selected: new Set([index]), anchor: index });
      size = 1;
    }
    if (size === 0) return;
    setHovered(null);
    setMenu({ x: event.clientX, y: event.clientY });
  };
  const labelOf = (index: number) => glyphs.find((g) => g.canonical === index)?.label ?? '?';

  const onGlyphClick = (index: number, event: MouseEvent) => {
    event.stopPropagation();
    setSelection((current) =>
      clickGlyph(clampSelection(current, count), index, {
        shift: event.shiftKey,
        toggle: event.ctrlKey || event.metaKey,
      }),
    );
  };

  const colorOf = (index: number) => glyphColor(index, NO_STYLE, formula);
  const hasOwnColor = (index: number) => String(index) in formula.glyphColors;
  const anyColor = Object.keys(formula.glyphColors).length > 0;
  const hidden = new Set(formula.hiddenGlyphs);
  const isHidden = (index: number) => hidden.has(index);

  return (
    <div className="glyph-colors" data-testid="glyph-view">
      <GlyphView
        formula={formula}
        resolved={resolved}
        background={background}
        selected={selection.selected}
        hovered={hovered}
        onHover={setHovered}
        onGlyphClick={onGlyphClick}
        onBackgroundClick={() => setSelection(NO_SELECTION)}
        onContextMenu={openMenu}
        marquee={{
          onStart: () => {
            marqueeBase.current = selection;
            setHovered(null);
          },
          onChange: (keys, additive) =>
            setSelection(marqueeSelection(marqueeBase.current, keys.map(Number), additive)),
        }}
      />

      {menu && selected.length > 0 && (
        <GlyphMenu
          x={menu.x}
          y={menu.y}
          header={
            selected.length === 1
              ? `Glyph ${selected[0]}: ${labelOf(selected[0]!)}`
              : `${selected.length} glyphs: ${selected.join(', ')}`
          }
          canClearColor={selected.some(hasOwnColor)}
          canHide={!selected.every(isHidden)}
          canShow={selected.some(isHidden)}
          onColor={(hex) => edits.color(selected, hex)}
          onHidden={(hide) => edits.hidden(selected, hide)}
          onClose={() => setMenu(null)}
        />
      )}

      {listed && (
        <ol className="glyph-chips" data-testid="glyph-chips">
          {glyphs.map((glyph) => {
            const on = selection.selected.has(glyph.canonical);
            const off = isHidden(glyph.canonical);
            return (
              <li key={glyph.canonical}>
                <button
                  type="button"
                  className={`glyph-chip${on ? ' active' : ''}${off ? ' is-hidden' : ''}`}
                  aria-pressed={on}
                  data-testid={`glyph-chip-${glyph.canonical}`}
                  data-label={glyph.label}
                  data-hidden={off}
                  title={`Glyph ${glyph.canonical}: ${glyph.label}${off ? ' (hidden at the start)' : ''}. ${keysText('Shift: range · Ctrl/⌘: toggle')}`}
                  onClick={(event) => onGlyphClick(glyph.canonical, event)}
                  onContextMenu={(event) => openMenu(glyph.canonical, event)}
                  onMouseEnter={() => setHovered(glyph.canonical)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(glyph.canonical)}
                  onBlur={() => setHovered(null)}
                >
                  <span
                    className="glyph-swatch"
                    style={{ background: colorOf(glyph.canonical) }}
                    data-own={hasOwnColor(glyph.canonical)}
                  />
                  <span className="glyph-chip-index">{glyph.canonical}</span>
                  <span className="glyph-chip-label">
                    {glyph.kind === 'rule' ? '—' : glyph.label}
                  </span>
                  {off && (
                    <span className="glyph-chip-hidden" title="Hidden at the start">
                      <Icon name="eye-off" />
                      <span className="visually-hidden">hidden at the start</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="glyph-tools">
        <span className="glyph-selection-label" data-testid="glyph-selection">
          {selected.length === 0
            ? keysText(
                'Click glyphs or drag a box over them to colour or hide them (Shift: range, Ctrl/⌘: toggle or add)',
              )
            : `${selected.length} selected: ${selected.join(', ')}`}
        </span>
        <SwatchRow
          label="Glyph colour"
          testIdPrefix="palette"
          disabled={selected.length === 0}
          onPick={(hex) => edits.color(selected, hex)}
        >
          <HexColorField
            value={selected.length > 0 ? colorOf(selected[0]!) : formula.color}
            label="Custom glyph colour"
            testId="glyph-custom-color"
            disabled={selected.length === 0}
            onCommit={(color) => edits.color(selected, color)}
          />
        </SwatchRow>
        <div className="glyph-actions">
          <button
            type="button"
            className="btn btn-small"
            onClick={() => setSelection(selectAll(count))}
            data-testid="glyph-select-all"
          >
            Select all
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={selected.length === 0 || !selected.some(hasOwnColor)}
            onClick={() => edits.color(selected, null)}
            data-testid="glyph-clear-selected"
          >
            Clear selected
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={!anyColor}
            onClick={() => edits.clearColors()}
            data-testid="glyph-clear-all"
          >
            Clear colours
          </button>
        </div>
        <div className="glyph-visibility" role="group" aria-label="At the start">
          <span className="glyph-row-label">At the start</span>
          <button
            type="button"
            className="btn btn-small"
            disabled={selected.length === 0 || selected.every(isHidden)}
            onClick={() => edits.hidden(selected, true)}
            title="Leave the selected glyphs out of the intro of every clip of this formula"
            data-testid="glyph-hide"
          >
            <Icon name="eye-off" />
            Hide
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={!selected.some(isHidden)}
            onClick={() => edits.hidden(selected, false)}
            data-testid="glyph-show"
          >
            <Icon name="eye" />
            Show
          </button>
          <button
            type="button"
            className="btn btn-small"
            disabled={hidden.size === 0}
            onClick={() => edits.hidden(formula.hiddenGlyphs, false)}
            data-testid="glyph-show-all"
          >
            Show all
          </button>
        </div>
        {hidden.size > 0 && (
          <p className="field-hint" data-testid="glyph-hidden-hint">
            {hidden.size === 1 ? '1 glyph is' : `${hidden.size} glyphs are`} hidden at the start
            (grey): the intro of every clip leaves {hidden.size === 1 ? 'it' : 'them'} out, and only
            a relation brings {hidden.size === 1 ? 'it' : 'them'} in.
          </p>
        )}
        {stale && (
          <p className="field-hint" data-testid="glyph-stale">
            The LaTeX or packages in the editor are not applied yet: these are the glyphs of the
            applied formula.
          </p>
        )}
      </div>
    </div>
  );
}
