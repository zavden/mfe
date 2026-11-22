/* «Add brace ▸ On some glyphs…» (D66) and «Add shape ▸ On some glyphs…» (D71): the glyphs of the
 * clip's object to put the brace or the shape on — every one to begin with, or those picked in
 * the preview (D74); click, Shift for a range, Ctrl/⌘ to toggle, a box, or the chips by keyboard
 * — and the side the brace goes on, or which shape it is. Add makes it (`addBrace`, `addShape`). Closes by itself when the clip goes.
 * Test ids start with `brace-glyphs` or `shape-glyphs`. */
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { BRACE_SIDE_DEGREES, type AttachSide, type ClipId } from '../../model';
import { useProjectStore, useRenderStore } from '../../store';
import { GlyphChips } from '../creator/GlyphChips';
import { GlyphView } from '../creator/GlyphView';
import {
  clickGlyph,
  marqueeSelection,
  selectAll,
  type GlyphSelection,
} from '../creator/glyphSelection';
import { glyphsUnavailable } from '../creator/glyphsUnavailable';
import { Modal } from '../project/Modal';
import { SegmentedControl } from '../SegmentedControl';
import { addBrace, BRACE_SIDES, SIDE_LABELS } from './braceActions';
import { useGlyphsDialog, type GlyphsDialogWhat } from './glyphsDialogStore';
import { addShape, SHAPE_CHOICE_LABELS, SHAPE_CHOICES, type ShapeChoice } from './shapeActions';
import { keysText } from '../platform';

interface GlyphsDialogProps {
  clipId: ClipId;
  what: GlyphsDialogWhat;
  /** The glyphs picked to begin with; null: every one. */
  glyphs: readonly number[] | null;
  onClose(): void;
}

export function GlyphsDialog({ clipId, what, glyphs, onClose }: GlyphsDialogProps) {
  const project = useProjectStore((s) => s.project);
  const clip = project.clips.find((c) => c.id === clipId);
  const formula = project.formulas.find((f) => f.id === clip?.formulaId);
  const resolved = useRenderStore((s) => (formula ? s.resolved.get(formula.id) : undefined));
  const entry = useRenderStore((s) => (formula ? s.entries[formula.id] : undefined));
  const count = formula?.snapshot?.glyphs.length ?? 0;
  const [selection, setSelection] = useState<GlyphSelection>(() =>
    glyphs && glyphs.length > 0
      ? { selected: new Set(glyphs), anchor: glyphs[0]! }
      : selectAll(count),
  );
  const [side, setSide] = useState<AttachSide>('down');
  const [shape, setShape] = useState<ShapeChoice>('box');
  const [hovered, setHovered] = useState<number | null>(null);
  const marqueeBase = useRef<GlyphSelection>(selection);
  // The clip was undone or deleted while the dialog was open.
  useEffect(() => {
    if (!clip || !formula) onClose();
  }, [clip, formula, onClose]);
  if (!clip || !formula) return null;

  const noun = what === 'brace' ? 'brace' : 'shape';
  const ids = `${noun}-glyphs`;
  const onGlyphClick = (index: number, event: MouseEvent) =>
    setSelection((current) =>
      clickGlyph(current, index, {
        shift: event.shiftKey,
        toggle: event.ctrlKey || event.metaKey,
      }),
    );
  const chosen = [...selection.selected].sort((a, b) => a - b);
  const add = () => {
    if (chosen.length === 0) return;
    const glyphs = chosen.length === count ? 'all' : chosen;
    if (what === 'brace') addBrace(clipId, glyphs, BRACE_SIDE_DEGREES[side]);
    else addShape(clipId, glyphs, shape);
    onClose();
  };

  return (
    <Modal
      title={`Add ${noun} on glyphs of ${formula.name}`}
      onClose={onClose}
      testId={`${ids}-dialog`}
      width="560px"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} data-testid={`${ids}-cancel`}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={chosen.length === 0}
            onClick={add}
            data-testid={`${ids}-add`}
          >
            Add {noun}
          </button>
        </>
      }
    >
      <div className="an-glyphs">
        {resolved && count > 0 ? (
          <>
            <GlyphView
              formula={formula}
              resolved={resolved}
              background={project.meta.background}
              selected={selection.selected}
              hovered={hovered}
              onHover={setHovered}
              onGlyphClick={onGlyphClick}
              onBackgroundClick={() => {}}
              onContextMenu={(_, event) => event.preventDefault()}
              marquee={{
                onStart: () => {
                  marqueeBase.current = selection;
                  setHovered(null);
                },
                onChange: (keys, additive) =>
                  setSelection(marqueeSelection(marqueeBase.current, keys.map(Number), additive)),
              }}
              testIdPrefix={`${noun}-glyph`}
              className="glyph-svg an-glyph-svg"
            />
            <GlyphChips
              glyphs={formula.snapshot!.glyphs}
              selected={selection.selected}
              label={`Glyphs of ${formula.name}`}
              testIdPrefix={`${noun}-glyph`}
              onPick={(index, event) =>
                onGlyphClick(index, {
                  shiftKey: event.shiftKey,
                  ctrlKey: true,
                  metaKey: false,
                } as MouseEvent)
              }
            />
          </>
        ) : (
          <p className="an-hint" data-testid={`${ids}-empty`}>
            {glyphsUnavailable(formula, entry)}
          </p>
        )}
        <p className="an-hint" data-testid={`${ids}-summary`}>
          {chosen.length === 0
            ? 'No glyphs selected'
            : chosen.length === count
              ? 'All glyphs'
              : `${chosen.length} glyph${chosen.length === 1 ? '' : 's'}: ${chosen.join(', ')}`}
        </p>
        {what === 'brace' ? (
          <SegmentedControl<AttachSide>
            label="Side of the brace"
            testId={`${ids}-side`}
            value={side}
            options={BRACE_SIDES.map((s) => ({ value: s, label: SIDE_LABELS[s] }))}
            onChange={setSide}
          />
        ) : (
          <SegmentedControl<ShapeChoice>
            label="Shape"
            testId={`${ids}-shape`}
            value={shape}
            options={SHAPE_CHOICES.map((s) => ({ value: s, label: SHAPE_CHOICE_LABELS[s] }))}
            onChange={setShape}
          />
        )}
        <p className="an-hint">
          {keysText('Click, Shift for a range, Ctrl/⌘ to toggle, or drag a box.')} The {noun} runs
          from the playhead to the end of the clip, on the nearest free track.
        </p>
      </div>
    </Modal>
  );
}

/** Mounts the dialog when something asks for it (`openBraceDialog`, `openShapeDialog`), into
 * document.body so that it sits over every panel. */
export function GlyphsDialogHost() {
  const clipId = useGlyphsDialog((s) => s.clipId);
  const what = useGlyphsDialog((s) => s.what);
  const glyphs = useGlyphsDialog((s) => s.glyphs);
  const close = useGlyphsDialog((s) => s.close);
  if (!clipId) return null;
  return createPortal(
    <GlyphsDialog
      key={`${what}:${clipId}`}
      clipId={clipId}
      what={what}
      glyphs={glyphs}
      onClose={close}
    />,
    document.body,
  );
}
