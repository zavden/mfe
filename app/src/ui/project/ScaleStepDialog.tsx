/* Preferences → Scale step → Custom…: the step the transform handles' scale snaps to, as a number
 * or a fraction (`ui/preview/scaleStep.ts`). Saved as typed, into the preferences. */
import { useId, useState } from 'react';
import { usePreferences } from '../preferences';
import {
  parseScaleStep,
  SCALE_STEP_RANGE,
  scaleStepValueText,
  formatScaleStep,
} from '../preview/scaleStep';
import { Modal } from './Modal';
import { keysText } from '../platform';

export function ScaleStepDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const [text, setText] = useState(() => usePreferences.getState().scaleStep);
  const value = parseScaleStep(text);
  // "= 0.3333" beside a fraction or a comma decimal; nothing beside a plain number.
  const restated = value !== null && formatScaleStep(text) !== text.trim();

  const apply = () => {
    if (value === null) return;
    usePreferences.getState().set({ scaleStep: text.trim() });
    onClose();
  };

  return (
    <Modal
      title="Scale step"
      onClose={onClose}
      testId="scale-step-dialog"
      width="440px"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} data-testid="scale-step-cancel">
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={value === null}
            onClick={apply}
            data-testid="scale-step-save"
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
          The sizes a corner drag stops at: the step, twice the step, and so on{' '}
          {keysText('(Ctrl/⌘ held frees it)')}. A number or a fraction, like 0.15 or 1/3.
        </p>
        <div className="form-grid">
          <label htmlFor={`${id}-step`}>Step</label>
          <div className="field-stack">
            <span className="inline-fields">
              <input
                id={`${id}-step`}
                type="text"
                inputMode="decimal"
                value={text}
                autoFocus
                data-testid="scale-step-input"
                onChange={(e) => setText(e.target.value)}
              />
              {restated && (
                <span data-testid="scale-step-value">= {scaleStepValueText(value)}</span>
              )}
            </span>
            {value === null && (
              <span className="field-error" role="alert" data-testid="scale-step-error">
                Enter a number or a fraction between {SCALE_STEP_RANGE.min} and{' '}
                {SCALE_STEP_RANGE.max}, like 0.15 or 1/3.
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
