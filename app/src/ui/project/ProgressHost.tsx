import { Modal } from './Modal';
import { useProgressStore } from './progressStore';

const megabytes = (bytes: number) => {
  const mb = bytes / 1024 ** 2;
  return mb >= 100 ? String(Math.round(mb)) : mb.toFixed(1);
};

/** The dialog of the task that is running, once it has lasted (`progressStore.ts`): the earliest
 * one when there are several. Escape and × cancel it, as its button does. */
export function ProgressHost() {
  const task = useProgressStore((state) => state.tasks.find((item) => item.shown));
  if (!task) return null;
  const known = task.total > 0;
  const fraction = known ? Math.min(1, task.done / task.total) : 0;
  return (
    <Modal
      key={task.key}
      title={task.title}
      onClose={task.cancel}
      testId="progress-dialog"
      level="top"
      width="420px"
      closeOnBackdrop={false}
      footer={
        <button
          type="button"
          className="btn"
          data-testid="progress-cancel"
          disabled={task.cancelling}
          onClick={task.cancel}
        >
          {task.cancelling ? 'Cancelling…' : 'Cancel'}
        </button>
      }
    >
      {task.message && <p className="dialog-message">{task.message}</p>}
      <progress
        className="progress-bar"
        data-testid="progress-bar"
        aria-label={task.title}
        max={1}
        value={known ? fraction : undefined}
      />
      <p className="progress-amount" data-testid="progress-amount">
        {known
          ? `${Math.floor(fraction * 100)}% · ${megabytes(task.done)} of ${megabytes(task.total)} MB`
          : 'Starting…'}
      </p>
    </Modal>
  );
}
