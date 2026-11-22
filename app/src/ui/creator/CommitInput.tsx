/* A text input that commits on blur / Enter and reverts on Escape (the formula editor's header
 * fields and the layout fields of a source panel). */
import { useState } from 'react';
import { ownEscape } from '../project/modalStack';

export function CommitInput({
  value,
  onCommit,
  validate,
  normalize,
  label,
  testId,
  maxLength,
  placeholder,
  width,
}: {
  value: string;
  onCommit: (value: string) => void;
  /** Error message for a value that cannot be committed. */
  validate?: (value: string) => string | null;
  /** The form a value is kept in (a trimmed name): what is committed, and text that is the
   * value in that form is no edit. */
  normalize?: (value: string) => string;
  label: string;
  testId: string;
  maxLength?: number;
  placeholder?: string;
  width?: string;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  const error = validate && text !== value ? validate(text) : null;
  const commit = () => {
    const next = normalize ? normalize(text) : text;
    // Nothing to keep, or nothing that may be kept: the field shows the value again.
    if (next === value || validate?.(text)) {
      if (text !== value) setText(value);
      return;
    }
    onCommit(next);
  };
  return (
    <span className="commit-input">
      <input
        type="text"
        aria-label={label}
        data-testid={testId}
        maxLength={maxLength}
        placeholder={placeholder}
        spellCheck={false}
        style={{ width }}
        value={text}
        {...ownEscape(text !== value)}
        aria-invalid={error ? true : undefined}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape' && text !== value) {
            event.preventDefault();
            event.stopPropagation();
            setText(value);
          }
        }}
      />
      {error && (
        <span className="field-error" role="alert" data-testid={`${testId}-error`}>
          {error}
        </span>
      )}
    </span>
  );
}
