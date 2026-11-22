/* "Split…": choose the glyphs of an animation block that go to new blocks running at the same
 * time (the others stay in the block). One new block takes one click: choose its glyphs and
 * split. For several at once, each choice is set aside as a block of its own ("Another block")
 * and the next one chosen; the blocks set aside are listed, tinted like their glyphs, and can be
 * given back. The formula's glyph view, with the glyphs the block does not animate drawn faint and
 * not choosable; click, Shift (range), Ctrl/⌘ (toggle), a marquee and the chips pick as in the
 * glyph picker. The split is one undo step (`splitBlockInto`), its pieces one group, and the
 * first new block is selected. The dialog closes by itself when the block goes (undo, delete).
 * It can be resized from its corner and maximized, its size remembered for the session: the room
 * it gains goes to the glyph view, the words, chips and blocks set aside keeping theirs. */
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { clipLifetimes } from '../../model';
import { useProjectStore, useRenderStore } from '../../store';
import { GlyphChips } from '../creator/GlyphChips';
import { GLYPH_MARK_TINTS, GlyphView } from '../creator/GlyphView';
import {
  clickGlyph,
  marqueeSelection,
  NO_SELECTION,
  type GlyphSelection,
} from '../creator/glyphSelection';
import { glyphsUnavailable } from '../creator/glyphsUnavailable';
import { Modal } from '../project/Modal';
import { reportRefused, splitBlockInto } from './blockActions';
import { blockLabel } from './blockKinds';
import { findBlock } from './blockRange';
import { isGlyphBlock, splittableGlyphs, withPart } from './splitBlock';
import { useSplitDialogStore, type SplitDialogRequest } from './splitDialogStore';

interface SplitBlockDialogProps {
  request: SplitDialogRequest;
  onClose(): void;
}

/** "2, 3 and 5". */
const listed = (glyphs: readonly number[]) =>
  glyphs.length <= 1
    ? glyphs.join('')
    : `${glyphs.slice(0, -1).join(', ')} and ${glyphs[glyphs.length - 1]}`;

export function SplitBlockDialog({ request, onClose }: SplitBlockDialogProps) {
  const project = useProjectStore((s) => s.project);
  const found = findBlock(project, request.clipId, request.actionId);
  const action = found && isGlyphBlock(found.action) ? found.action : null;
  const clip = found?.clip;
  const formula = project.formulas.find((f) => f.id === clip?.formulaId);
  const resolved = useRenderStore((s) => (formula ? s.resolved.get(formula.id) : undefined));
  const entry = useRenderStore((s) => (formula ? s.entries[formula.id] : undefined));
  const [selection, setSelection] = useState<GlyphSelection>(NO_SELECTION);
  /** The new blocks set aside so far: the glyphs of each, in the order they were made. */
  const [parts, setParts] = useState<number[][]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const marqueeBase = useRef<GlyphSelection>(NO_SELECTION);

  const glyphs = useMemo(
    () => (action && clip ? splittableGlyphs(action, clipLifetimes(project).get(clip.id)) : []),
    [project, clip, action],
  );
  const available = useMemo(() => new Set(glyphs), [glyphs]);

  // The block was undone or deleted while the dialog was open: nothing is left to split.
  useEffect(() => {
    if (!action) onClose();
  }, [action, onClose]);
  if (!action || !clip || !formula) return null;

  const count = formula.snapshot?.glyphs.length ?? 0;
  const universe = Array.from({ length: count }, (_, i) => i);
  const dimmed = new Set(universe.filter((g) => !available.has(g)));
  const chosen = glyphs.filter((g) => selection.selected.has(g));
  /** What a split makes now: the blocks set aside, and what is chosen as one more. */
  const planned = withPart(parts, chosen);
  const moved = new Set(planned.flat());
  const kept = glyphs.filter((g) => !moved.has(g));
  const pieces = planned.length + (kept.length > 0 ? 1 : 0);
  const valid = planned.length > 0 && pieces >= 2;
  /** The glyphs of the blocks set aside, each marked with its block's tint. */
  const marks = new Map<number, number>();
  parts.forEach((part, i) => part.forEach((g) => marks.set(g, i)));

  const pick = (index: number, modifiers: { shift: boolean; toggle: boolean }) => {
    if (!available.has(index)) return;
    setSelection(clickGlyph(selection, index, modifiers));
  };
  const onGlyphClick = (index: number, event: MouseEvent) =>
    pick(index, { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey });

  const summary =
    parts.length === 0
      ? chosen.length === 0
        ? `Choose the glyphs that go to the new block (this one animates ${glyphs.length}).`
        : chosen.length === glyphs.length
          ? 'Leave at least one glyph in this block.'
          : `${chosen.length} of ${glyphs.length} glyphs go to the new block: ${chosen.join(', ')}.`
      : !valid
        ? 'Choose the glyphs of another block, or leave some in this one.'
        : kept.length > 0
          ? `${pieces} blocks: this one keeps ${listed(kept)}; ${planned.map((part) => part.join(', ')).join(' · ')} go to new blocks.`
          : `${pieces} blocks: ${planned[0]!.join(', ')} stay in this one; ${planned
              .slice(1)
              .map((part) => part.join(', '))
              .join(' · ')} go to new blocks.`;

  const addPart = () => {
    setParts(planned);
    setSelection(NO_SELECTION);
  };
  const confirm = () => {
    const outcome = splitBlockInto(clip.id, action.id, planned);
    reportRefused(outcome, 'Cannot split this block');
    onClose();
  };

  return (
    <Modal
      title={`Split ${blockLabel(action)}`}
      onClose={onClose}
      testId="split-dialog"
      width="560px"
      resizable
      footer={
        <>
          <button type="button" className="btn" data-testid="split-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="split-confirm"
            disabled={!valid}
            onClick={confirm}
          >
            Split
          </button>
        </>
      }
    >
      <div className="split-dialog">
        <p className="dialog-message">
          The chosen glyphs go to a new block that runs at the same time as this one; the other
          glyphs stay. For several new blocks, choose the glyphs of one, press “Another block” and
          choose those of the next. The pieces are one group on the timeline. Faint glyphs are not
          animated by this block.
        </p>
        {resolved && count > 0 ? (
          <div className="an-glyphs split-glyphs">
            <GlyphView
              formula={formula}
              resolved={resolved}
              background={project.meta.background}
              selected={new Set(chosen)}
              dimmed={dimmed}
              marks={marks}
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
                onChange: (keys, additive) => {
                  const indices = keys.map(Number).filter((g) => available.has(g));
                  setSelection(marqueeSelection(marqueeBase.current, indices, additive));
                },
              }}
              testIdPrefix="split-glyph"
              className="glyph-svg split-glyph-svg"
            />
            <GlyphChips
              glyphs={formula.snapshot!.glyphs}
              selected={new Set(chosen)}
              label={`Glyphs of ${formula.name}`}
              testIdPrefix="split-glyph"
              onPick={(index, event) => pick(index, { shift: event.shiftKey, toggle: true })}
            />
          </div>
        ) : (
          <p className="an-hint" data-testid="split-glyphs-empty">
            {glyphsUnavailable(formula, entry)}
          </p>
        )}
        <div className="split-parts" data-testid="split-parts">
          <button
            type="button"
            className="an-small-button"
            data-testid="split-add-part"
            title="Set the chosen glyphs aside as a new block, and choose those of another"
            disabled={chosen.length === 0}
            onClick={addPart}
          >
            Another block
          </button>
          {parts.map((part, i) => (
            <span
              key={part.join(',')}
              className={`split-part gv-mark-${i % GLYPH_MARK_TINTS}`}
              data-testid={`split-part-${i}`}
            >
              New block {i + 1}: {part.join(', ')}
              <button
                type="button"
                className="split-part-remove"
                data-testid={`split-part-${i}-remove`}
                aria-label={`Give the glyphs of new block ${i + 1} back`}
                title="Give its glyphs back to this block"
                onClick={() => setParts(parts.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <p className="an-hint" data-testid="split-summary">
          {summary}
        </p>
      </div>
    </Modal>
  );
}

/** Mounts the dialog when something asks for it (`openSplitDialog`), into document.body so that
 * no panel's layout can clip it. */
export function SplitBlockHost() {
  const request = useSplitDialogStore((s) => s.request);
  const close = useSplitDialogStore((s) => s.close);
  if (!request) return null;
  return createPortal(
    <SplitBlockDialog key={JSON.stringify(request)} request={request} onClose={close} />,
    document.body,
  );
}
