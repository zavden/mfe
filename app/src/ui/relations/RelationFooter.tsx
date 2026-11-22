/* The relation editor's footer: Delete relation, Cancel (or Close) and Save, or, while a question
 * is open (useFooterConfirmation), that question with its two answers. */
import type { FooterConfirmation } from './useFooterConfirmation';

interface RelationFooterProps {
  confirmation: FooterConfirmation;
  /** The relation is in the project already (it can be deleted). */
  existed: boolean;
  dirty: boolean;
  pairCount: number;
  errorCount: number;
  /** Why Save is held back regardless of the draft (a formula re-rendered underneath), or null. */
  blocked?: string | null;
  /** Close without saving. */
  onDiscard(): void;
  onDelete(): void;
  /** Cancel (or Close): what Escape does. */
  onCancel(): void;
  onSave(): void;
}

export function RelationFooter({
  confirmation,
  existed,
  dirty,
  pairCount,
  errorCount,
  blocked = null,
  onDiscard,
  onDelete,
  onCancel,
  onSave,
}: RelationFooterProps) {
  const { confirming, labelId, keepRef, ask, dismiss } = confirmation;
  if (confirming) {
    return (
      <div
        className="rel-confirm"
        role="alertdialog"
        aria-labelledby={labelId}
        data-testid="rel-confirm"
      >
        <span id={labelId}>
          {confirming === 'discard'
            ? 'Discard the changes to this relation?'
            : 'Delete this relation and all its pairs?'}
        </span>
        <button
          type="button"
          ref={keepRef}
          className="btn"
          data-testid="rel-confirm-keep"
          onClick={dismiss}
        >
          {confirming === 'discard' ? 'Keep editing' : 'Cancel'}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          data-testid="rel-confirm-yes"
          onClick={confirming === 'discard' ? onDiscard : onDelete}
        >
          {confirming === 'discard' ? 'Discard' : 'Delete'}
        </button>
      </div>
    );
  }
  const saveDisabled = pairCount === 0 || errorCount > 0 || (!dirty && existed) || blocked !== null;
  return (
    <>
      {existed && (
        <button
          type="button"
          className="btn btn-danger rel-delete"
          data-testid="rel-delete"
          onClick={() => ask('delete')}
        >
          Delete relation
        </button>
      )}
      <button type="button" className="btn" data-testid="rel-cancel" onClick={onCancel}>
        {dirty ? 'Cancel' : 'Close'}
      </button>
      <button
        type="button"
        className="btn btn-primary"
        data-testid="rel-save"
        disabled={saveDisabled}
        title={
          blocked !== null
            ? blocked
            : pairCount === 0
              ? 'Link at least one pair of glyphs'
              : errorCount > 0
                ? 'Fix the problems listed first'
                : undefined
        }
        onClick={onSave}
      >
        Save relation
      </button>
    </>
  );
}
