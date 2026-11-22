/* Preferences → Split suffix…: what "Split at playhead" adds to an object's name to name the copy
 * that takes the second half of the clip (D169; `ui/timeline/splitSuffix.ts`). Saved as typed,
 * into the preferences. */
import { useId, useState } from 'react';
import { usePreferences } from '../preferences';
import { splitSuffixError } from '../timeline/splitSuffix';
import { Modal } from './Modal';

export function SplitSuffixDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const [text, setText] = useState(() => usePreferences.getState().splitSuffix);
  const error = splitSuffixError(text);

  const apply = () => {
    if (error !== null) return;
    usePreferences.getState().set({ splitSuffix: text });
    onClose();
  };

  return (
    <Modal
      title="Split suffix"
      onClose={onClose}
      testId="split-suffix-dialog"
      width="440px"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} data-testid="split-suffix-cancel">
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={error !== null}
            onClick={apply}
            data-testid="split-suffix-save"
          >
            Save
          </button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <p className="field-hint da-intro">
          Splitting a clip at the playhead (S) makes its second half a clip of a copy of its
          formula, named after it with this suffix: f1 becomes f1_s — or f1_s1, f1_s2… when that
          name is taken. Letters, digits and &ldquo;_&rdquo;: the name stays a Python variable.
        </p>
        <div className="form-grid">
          <label htmlFor={`${id}-suffix`}>Suffix</label>
          <div className="field-stack">
            <input
              id={`${id}-suffix`}
              type="text"
              value={text}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              data-testid="split-suffix-input"
              onChange={(e) => setText(e.target.value)}
            />
            {error === null ? (
              <span className="field-hint" data-testid="split-suffix-example">
                f1 → f1{text}
              </span>
            ) : (
              <span className="field-error" role="alert" data-testid="split-suffix-error">
                {error}
              </span>
            )}
          </div>
        </div>
        {/* Enter in the field saves (the submit button lives in the footer). */}
        <input type="submit" hidden />
      </form>
    </Modal>
  );
}
