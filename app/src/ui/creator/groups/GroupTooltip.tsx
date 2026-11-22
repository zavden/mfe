/* The tooltip of a group's block in the block view (FormulaTooltip shows it, beside the block,
 * as it shows a formula's): the renderings of the group's first formulas side by side — a block
 * has none —, its name, how many formulas it has and what a double-click and F2 do there. As
 * large as a formula's, by the size of the block view's previews (D173). */
import { createPortal } from 'react-dom';
import { formulaGroupsOf, kindOf, type FormulaGroupId } from '../../../model';
import { useProjectStore, useRenderStore } from '../../../store';
import type { TipAnchor } from '../blockTip';
import { FormulaThumb } from '../FormulaThumb';
import { useTipFrame } from '../useTipFrame';
import { GROUP_THUMBS } from './FormulaGroupRow';
import { useGroupUi } from './groupUiStore';

export function GroupTooltip({ groupId, anchor }: { groupId: FormulaGroupId; anchor: TipAnchor }) {
  const project = useProjectStore((state) => state.project);
  const entries = useRenderStore((state) => state.entries);
  const open = useGroupUi((state) => state.open.has(groupId));
  const frame = useTipFrame(anchor);
  const group = formulaGroupsOf(project).find((g) => g.id === groupId);
  if (!group) return null;
  const members = group.formulaIds.flatMap((id) => {
    const formula = project.formulas.find((f) => f.id === id);
    return formula && kindOf(formula).listed ? [formula] : [];
  });
  return createPortal(
    <div className="formula-tip" role="tooltip" data-testid="formula-tooltip" style={frame}>
      <div className="formula-tip-thumbs">
        {members.slice(0, GROUP_THUMBS).map((formula) => (
          <FormulaThumb
            key={formula.id}
            formula={formula}
            resolved={entries[formula.id]?.resolved ?? null}
            background={project.meta.background}
          />
        ))}
      </div>
      <div className="formula-tip-caption">
        <span className="formula-tip-name">{group.name}</span>
        <span>Group · {members.length === 1 ? '1 formula' : `${members.length} formulas`}</span>
      </div>
      <div className="formula-tip-keys">
        Double-click to {open ? 'close' : 'open'} · F2 to rename
      </div>
    </div>,
    document.body,
  );
}
