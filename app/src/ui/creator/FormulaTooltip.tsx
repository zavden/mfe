/* The tooltip of the block the pointer is on, in the block view of the formula list (R3): the
 * formula's rendering, its name, its kind, where its glyphs come from (exact or MathJax) and
 * what a double-click and F2 do there — the block's name has no tooltip of its own, which would
 * come up over the rendering. When it shows and where it goes is `blockTip.ts`: at once, beside
 * the block. It listens to the list it is given while it is mounted, and keeps which block it is
 * for to itself: the Creator is not drawn again as the pointer goes from block to block. It
 * hangs from the document, as the menus do: the panel it belongs to is a container, which may
 * place and clip what is fixed inside it. The block of a group of formulas has its tooltip the
 * same way (groups/GroupTooltip): the renderings of its first formulas. Both are as large as the
 * size of the block view's previews says (D173, useTipFrame.ts). */
import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { kindOf, type FormulaGroupId, type FormulaId } from '../../model';
import { useProjectStore, useRenderStore } from '../../store';
import { createBlockTip, type TipAnchor } from './blockTip';
import { formulaStatus } from './formulaStatus';
import { FormulaThumb } from './FormulaThumb';
import { GroupTooltip } from './groups/GroupTooltip';
import { useTipFrame } from './useTipFrame';

interface Tip {
  /** The formula of the block it is for, or the group of formulas of a group's block. */
  formulaId: FormulaId | null;
  groupId: FormulaGroupId | null;
  /** The block it is for, where it was when the pointer came onto it. */
  anchor: TipAnchor;
}

interface FormulaTooltipProps {
  /** The list of blocks: each carries its formula in `data-formula-id`, or its group of
   * formulas in `data-group-id`. */
  listRef: RefObject<HTMLElement | null>;
}

export function FormulaTooltip({ listRef }: FormulaTooltipProps) {
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const blockTip = createBlockTip<Element>({
      onShow: (block) => {
        const { left, right, top, bottom } = block.getBoundingClientRect();
        setTip({
          formulaId: block.getAttribute('data-formula-id'),
          groupId: block.getAttribute('data-group-id'),
          anchor: { left, right, top, bottom },
        });
      },
      onHide: () => setTip(null),
    });
    const blockAt = (event: PointerEvent) =>
      (event.target as Element).closest('[data-formula-id], [data-group-id]');
    const move = (event: PointerEvent) => {
      // A drag, or a touch (no hover): nothing to show.
      if (event.buttons !== 0 || event.pointerType === 'touch') blockTip.cancel();
      else blockTip.move(blockAt(event), event.clientX, event.clientY);
    };
    const press = (event: PointerEvent) =>
      blockTip.press(blockAt(event), event.clientX, event.clientY);
    const cancel = () => blockTip.cancel();
    list.addEventListener('pointermove', move);
    list.addEventListener('pointerdown', press, true);
    list.addEventListener('pointerleave', cancel);
    list.addEventListener('wheel', cancel, { capture: true, passive: true });
    list.addEventListener('scroll', cancel, { passive: true });
    return () => {
      list.removeEventListener('pointermove', move);
      list.removeEventListener('pointerdown', press, true);
      list.removeEventListener('pointerleave', cancel);
      list.removeEventListener('wheel', cancel, true);
      list.removeEventListener('scroll', cancel);
    };
  }, [listRef]);
  if (tip?.groupId != null) return <GroupTooltip groupId={tip.groupId} anchor={tip.anchor} />;
  return tip?.formulaId != null && <BlockTooltip formulaId={tip.formulaId} anchor={tip.anchor} />;
}

function BlockTooltip({ formulaId, anchor }: { formulaId: FormulaId; anchor: TipAnchor }) {
  const project = useProjectStore((state) => state.project);
  const formula = project.formulas.find((f) => f.id === formulaId);
  const entry = useRenderStore((state) => state.entries[formulaId]);
  const frame = useTipFrame(anchor);
  if (!formula) return null;
  const status = formulaStatus(entry, formula, project.meta.target);
  return createPortal(
    <div className="formula-tip" role="tooltip" data-testid="formula-tooltip" style={frame}>
      <FormulaThumb
        formula={formula}
        resolved={entry?.resolved ?? null}
        background={project.meta.background}
      />
      <div className="formula-tip-caption">
        <span className="formula-tip-name">{formula.name}</span>
        <span>
          {kindOf(formula).label} · {status.label}
        </span>
      </div>
      <div className="formula-tip-keys">Double-click to edit · F2 to rename</div>
    </div>,
    document.body,
  );
}
