/* What the two faces of a formula in the Creator list share — the row (FormulaItem) and the
 * block (FormulaBlock, R3): the inline rename (F2, or a double-click on the name), the edit /
 * duplicate / delete buttons, and the start of a drag onto the timeline (FORMULA_MIME). */
import { useEffect, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react';
import type { Formula } from '../../model';
import { FORMULA_MIME } from '../dnd';
import { setFormulaDragImage } from './dragImage';
import { validateFormulaName } from './formulaActions';

/** The name of a formula, renamed in place: F2 — or a double-click on the name, in the row,
 * where the rest of the card edits — opens a field that Enter commits and Escape leaves (the
 * focus going back to the card, `itemRef`); a name that is not valid keeps the field open with
 * the reason under it. `onRename` returns that reason, or null. */
export function useFormulaName(options: {
  formula: Formula;
  formulas: readonly Formula[];
  onRename: (name: string) => string | null;
  itemRef: RefObject<HTMLElement | null>;
  /** The class of the name when it is not being renamed. */
  className: string;
  /** A double-click on the name renames (the row); else it reaches the card, which edits. */
  renameOnDoubleClick: boolean;
}): { renaming: boolean; startRename: () => void; element: ReactNode } {
  const { formula, formulas, onRename, itemRef, className, renameOnDoubleClick } = options;
  const [renaming, setRenaming] = useState(false);
  /** Enter or Escape ended the rename: the focus goes back to the card. */
  const refocus = useRef(false);
  useEffect(() => {
    if (renaming || !refocus.current) return;
    refocus.current = false;
    itemRef.current?.focus();
  }, [renaming, itemRef]);
  const [name, setName] = useState(formula.name);
  const [nameError, setNameError] = useState<string | null>(null);

  const startRename = () => {
    setName(formula.name);
    setNameError(null);
    setRenaming(true);
  };

  const commitRename = () => {
    if (name === formula.name) {
      setRenaming(false);
      return;
    }
    const error = onRename(name);
    if (error) {
      setNameError(error);
      refocus.current = false; // the field stays open
    } else setRenaming(false);
  };

  const element = renaming ? (
    <span className="formula-rename">
      <input
        type="text"
        autoFocus
        aria-label="Rename formula"
        data-testid="formula-rename-input"
        value={name}
        spellCheck={false}
        onChange={(event) => {
          setName(event.target.value);
          setNameError(validateFormulaName(event.target.value, formulas, formula.id));
        }}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onBlur={commitRename}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            refocus.current = true;
            commitRename();
          } else if (event.key === 'Escape') {
            refocus.current = true;
            setRenaming(false);
          }
        }}
      />
      {nameError && (
        <span className="field-error" role="alert" data-testid="formula-rename-error">
          {nameError}
        </span>
      )}
    </span>
  ) : (
    <span
      className={className}
      data-testid="formula-name"
      // The block says what a double-click does in its tooltip (FormulaTooltip), with its
      // rendering: a second tooltip here would come up over that one.
      title={renameOnDoubleClick ? 'Double-click to rename' : undefined}
      onDoubleClick={
        renameOnDoubleClick
          ? (event) => {
              event.stopPropagation();
              startRename();
            }
          : undefined
      }
    >
      {formula.name}
    </span>
  );
  return { renaming, startRename, element };
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** The pictures of the three buttons, line drawings of 16×16 in the stroke of the app's icons
 * (timeline/icons.tsx): a pencil, two sheets, a bin. */
const ACTION_ICONS = {
  edit: (
    <path
      {...STROKE}
      d="M3 13l.6-2.8 7.2-7.2a1.5 1.5 0 0 1 2.1 0l.1.1a1.5 1.5 0 0 1 0 2.1L5.8 12.4zM9.6 4.2l2.2 2.2"
    />
  ),
  duplicate: (
    <>
      <path
        {...STROKE}
        d="M10.5 3.6V3.2a1.2 1.2 0 0 0-1.2-1.2H3.2A1.2 1.2 0 0 0 2 3.2v6.1a1.2 1.2 0 0 0 1.2 1.2h.4"
      />
      <rect {...STROKE} x="5.5" y="5.5" width="8.5" height="8.5" rx="1.2" />
    </>
  ),
  delete: (
    <path
      {...STROKE}
      d="M2.6 4.4h10.8M6.2 4.4V3a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v1.4M4 4.4l.7 8.7a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.7M6.8 7v4.2M9.2 7v4.2"
    />
  ),
};

function ActionIcon({ name }: { name: keyof typeof ACTION_ICONS }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      {ACTION_ICONS[name]}
    </svg>
  );
}

/** The edit, duplicate and delete buttons of a formula. Not tab stops: the card's keys do it. */
export function FormulaActions({
  formula,
  className,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  formula: Formula;
  className?: string;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <span
      className={className ? `formula-actions ${className}` : 'formula-actions'}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        tabIndex={-1}
        className="icon-btn"
        title="Edit formula"
        aria-label={`Edit ${formula.name}`}
        data-testid="formula-edit"
        onClick={onEdit}
      >
        <ActionIcon name="edit" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        className="icon-btn"
        title="Duplicate"
        aria-label={`Duplicate ${formula.name}`}
        data-testid="formula-duplicate"
        onClick={onDuplicate}
      >
        <ActionIcon name="duplicate" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        className="icon-btn icon-danger"
        title="Delete"
        aria-label={`Delete ${formula.name}`}
        data-testid="formula-delete"
        onClick={onDelete}
      >
        <ActionIcon name="delete" />
      </button>
    </span>
  );
}

/** The start of a drag of a formula onto the timeline: its id under FORMULA_MIME, as a copy,
 * with a small chip as the drag image so that the track it lands on stays visible. */
export function startFormulaDrag(event: DragEvent<HTMLElement>, formula: Formula): void {
  event.dataTransfer.setData(FORMULA_MIME, formula.id);
  event.dataTransfer.setData('text/plain', formula.name);
  event.dataTransfer.effectAllowed = 'copy';
  setFormulaDragImage(event.dataTransfer, formula);
}
