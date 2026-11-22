import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { HoldButton } from '../HoldButton';
import { isMac, keyHint, keysText } from '../platform';
import { useDialogStore, type PendingDialog } from './dialogStore';
import { Modal } from './Modal';

export function DialogHost() {
  const current = useDialogStore((state) => state.queue[0]);
  if (!current) return null;
  return <Dialog key={current.key} current={current} />;
}

function Dialog({ current }: { current: PendingDialog }) {
  const settle = useDialogStore((state) => state.settle);
  const fieldId = useId();
  const noteId = useId();
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const { field } = current;
  const [text, setText] = useState(field?.value ?? '');
  // The text the dialog opens with is selected: typing replaces it.
  useEffect(() => input.current?.select(), []);
  const given = text.trim();
  const error = field?.validate?.(given) ?? null;
  const press = (id: string | null) => {
    if (id === field?.submitId && error) return;
    settle(current.key, id, given);
  };
  /** Enter gives the text of a line; in a field of several lines it starts a new one, and
   * Ctrl/⌘+Enter gives the text. */
  const onFieldKeyDown = (event: KeyboardEvent) => {
    if (!field || event.key !== 'Enter') return;
    if (field.multiline && !(isMac() ? event.metaKey : event.ctrlKey)) return;
    event.preventDefault();
    press(field.submitId);
  };
  return (
    <Modal
      title={current.title}
      onClose={() => press(current.cancelId ?? null)}
      testId="dialog"
      level="top"
      footer={current.buttons.map((button) => {
        const className = `btn ${button.tone === 'primary' ? 'btn-primary' : button.tone === 'danger' ? 'btn-danger' : ''}`;
        return button.holdMs ? (
          <HoldButton
            key={button.id}
            holdMs={button.holdMs}
            className={className}
            testId={`dialog-${button.id}`}
            onActivate={() => press(button.id)}
          >
            {button.label}
          </HoldButton>
        ) : (
          <button
            key={button.id}
            type="button"
            className={className}
            data-testid={`dialog-${button.id}`}
            disabled={button.id === field?.submitId && error !== null}
            onClick={() => press(button.id)}
          >
            {button.label}
          </button>
        );
      })}
    >
      {current.message && <p className="dialog-message">{current.message}</p>}
      {current.details && current.details.length > 0 && (
        <ul className="dialog-details" data-testid="dialog-details">
          {current.details.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {field && (
        <div className="dialog-field">
          <label htmlFor={fieldId}>{field.label}</label>
          {field.multiline ? (
            <textarea
              id={fieldId}
              ref={input}
              rows={5}
              maxLength={field.maxLength}
              value={text}
              data-testid="dialog-field"
              aria-invalid={error ? true : undefined}
              aria-describedby={noteId}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onFieldKeyDown}
            />
          ) : (
            <input
              id={fieldId}
              ref={input}
              type="text"
              spellCheck={false}
              maxLength={field.maxLength}
              value={text}
              data-testid="dialog-field"
              aria-invalid={error ? true : undefined}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onFieldKeyDown}
            />
          )}
          {/* The line is there from the start: a reason that appears does not move the dialog. */}
          <span className="dialog-field-note" id={noteId}>
            {error ? (
              <span className="field-error" role="alert" data-testid="dialog-field-error">
                {error}
              </span>
            ) : (
              field.multiline && (
                <span className="dialog-field-hint" data-testid="dialog-field-hint">
                  {/* The command key as the system writes it, as a menu does: Ctrl+Enter, ⌘↩. */}
                  {keysText(`${keyHint('Mod+Enter')} gives the text; Enter starts a new line.`)}
                </span>
              )
            )}
          </span>
        </div>
      )}
    </Modal>
  );
}
