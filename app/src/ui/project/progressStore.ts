/* A task of the project that the user waits for: opening a large .mfe, whose recordings are
 * checked and copied into the browser's storage before the project shows. `<ProgressHost />`
 * shows it as a dialog with a bar and Cancel, but only once it has lasted a moment: a small file
 * opens without a dialog flashing by. The dialog is modal, so a second task can only start in
 * that first moment (a double click): each task keeps its own Cancel, and the dialog shows the
 * earliest one, then the next. */
import { create } from 'zustand';

/** How long a task runs before its dialog shows. */
export const PROGRESS_DELAY_MS = 400;

export interface ProjectTask {
  key: number;
  title: string;
  /** What is being done, under the title. */
  message?: string;
  done: number;
  /** In the unit of `done` (bytes); 0 until the first report. */
  total: number;
  /** It has lasted long enough to be shown. */
  shown: boolean;
  /** Cancel was asked for: the work stops at its next step. */
  cancelling: boolean;
  cancel(): void;
}

/** The tasks that are running, in the order they started. */
export const useProgressStore = create<{ tasks: ProjectTask[] }>(() => ({ tasks: [] }));

let nextKey = 1;

/** Run `work` as a task the user can watch and cancel. `report` moves the bar (how much is done,
 * out of how much) and `signal` is aborted by Cancel: the work is expected to reject then, and
 * what it rejects with is the caller's to tell from a failure. */
export async function withProgress<T>(
  task: Pick<ProjectTask, 'title' | 'message'>,
  work: (report: (done: number, total: number) => void, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const key = nextKey++;
  const patch = (fields: Partial<ProjectTask>) =>
    useProgressStore.setState(({ tasks }) => ({
      tasks: tasks.map((item) => (item.key === key ? { ...item, ...fields } : item)),
    }));
  const started: ProjectTask = {
    key,
    ...task,
    done: 0,
    total: 0,
    shown: false,
    cancelling: false,
    cancel() {
      controller.abort();
      patch({ cancelling: true });
    },
  };
  useProgressStore.setState(({ tasks }) => ({ tasks: [...tasks, started] }));
  const timer = setTimeout(() => patch({ shown: true }), PROGRESS_DELAY_MS);
  try {
    return await work((done, total) => patch({ done, total }), controller.signal);
  } finally {
    clearTimeout(timer);
    useProgressStore.setState(({ tasks }) => ({
      tasks: tasks.filter((item) => item.key !== key),
    }));
  }
}
