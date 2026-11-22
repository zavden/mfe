/* In-app dialogs that ask one thing: `showDialog()` returns a promise, `<DialogHost />` renders
 * the queue. They replace window.confirm and window.prompt, which block browser automation. */
import { create } from 'zustand';

/** How long the confirm button of a destructive action (deleting a track, a link) is held. */
export const DELETE_HOLD_MS = 700;

export interface DialogButton {
  id: string;
  label: string;
  tone?: 'primary' | 'danger' | 'default';
  /** The button acts only after being held down this long (ms): for destructive actions. */
  holdMs?: number;
}

/** A line of text a dialog asks for (`promptDialog`), or several. */
export interface DialogField {
  label: string;
  /** What the field holds when the dialog opens, selected: typing replaces it. */
  value: string;
  /** Why `text` (trimmed) cannot be given, or null. */
  validate?(text: string): string | null;
  maxLength?: number;
  /** The button that gives the text. It waits for a text that can be given, and Enter in the
   * field presses it — Ctrl/⌘+Enter in a field of several lines. */
  submitId: string;
  /** A field of several lines: Enter starts a new line, and Ctrl/⌘+Enter gives the text. */
  multiline?: boolean;
}

export interface DialogSpec {
  title: string;
  message?: string;
  /** Bullet list under the message (what a deletion will remove, …). */
  details?: string[];
  field?: DialogField;
  buttons: DialogButton[];
  /** Id returned for Escape / backdrop / ×; null when omitted. */
  cancelId?: string;
}

export interface PendingDialog extends DialogSpec {
  key: number;
  resolve: (id: string | null, text: string) => void;
}

interface DialogState {
  queue: PendingDialog[];
  /** Close the dialog `key` with the button `id`; `text` is what its field held, trimmed. */
  settle(key: number, id: string | null, text?: string): void;
}

let nextKey = 1;

export const useDialogStore = create<DialogState>()((set, get) => ({
  queue: [],
  settle: (key, id, text = '') => {
    const pending = get().queue.find((d) => d.key === key);
    if (!pending) return;
    set((state) => ({ queue: state.queue.filter((d) => d.key !== key) }));
    pending.resolve(id, text);
  },
}));

function open(spec: DialogSpec, resolve: PendingDialog['resolve']): void {
  const pending: PendingDialog = { ...spec, key: nextKey++, resolve };
  useDialogStore.setState((state) => ({ queue: [...state.queue, pending] }));
}

/** Show a dialog; resolves with the pressed button's id, or `cancelId` / null on dismissal. */
export function showDialog(spec: DialogSpec): Promise<string | null> {
  return new Promise((resolve) => open(spec, (id) => resolve(id)));
}

/** Ask for a line of text, or several with `multiline`. Resolves with it, trimmed, once it passes
 * `validate`; with null when the dialog is dismissed. */
export function promptDialog(options: {
  title: string;
  message?: string;
  /** The field's label. */
  label: string;
  /** What the field starts with. */
  value: string;
  validate?(text: string): string | null;
  maxLength?: number;
  /** A field of several lines (`DialogField.multiline`). */
  multiline?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) =>
    open(
      {
        title: options.title,
        message: options.message,
        field: {
          label: options.label,
          value: options.value,
          validate: options.validate,
          maxLength: options.maxLength,
          submitId: 'confirm',
          ...(options.multiline ? { multiline: true } : {}),
        },
        cancelId: 'cancel',
        buttons: [
          { id: 'cancel', label: options.cancelLabel ?? 'Cancel' },
          { id: 'confirm', label: options.confirmLabel ?? 'OK', tone: 'primary' },
        ],
      },
      (id, text) => resolve(id === 'confirm' ? text : null),
    ),
  );
}

/** Cancel / confirm dialog; true when confirmed. */
export async function confirmDialog(options: {
  title: string;
  message?: string;
  details?: string[];
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  /** Require holding the confirm button down this long (ms). */
  holdMs?: number;
}): Promise<boolean> {
  const id = await showDialog({
    title: options.title,
    message: options.message,
    details: options.details,
    cancelId: 'cancel',
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      {
        id: 'confirm',
        label: options.confirmLabel ?? 'OK',
        tone: options.tone ?? 'primary',
        holdMs: options.holdMs,
      },
    ],
  });
  return id === 'confirm';
}

/** Confirm a deletion (D24, D27): a danger button that names what goes ("Hold to delete track")
 * and must be held down DELETE_HOLD_MS. True when confirmed. */
export function confirmDelete(options: {
  /** What is deleted, as the button names it: "formula", "track", "links"… */
  what: string;
  title: string;
  message?: string;
  details?: string[];
}): Promise<boolean> {
  return confirmDialog({
    title: options.title,
    message: options.message,
    details: options.details,
    confirmLabel: `Hold to delete ${options.what}`,
    tone: 'danger',
    holdMs: DELETE_HOLD_MS,
  });
}
