/* Preferences → Standard scale…: the scale new formulas and new texts are born with — 1 is
 * Manim's font size 48 — as a number or a fraction each (`ui/creator/standardScale.ts`). Saved as
 * typed, into the preferences; saving leaves the objects that exist as they are (R4, D75). Beside
 * each field, «Apply to all formulas» («… texts») gives the scale typed there to every object of
 * the kind the project has, whatever its own, after a question that says how many change — one
 * undo step, whether the dialog is then saved or cancelled. */
import { useId, useState } from 'react';
import { useProjectStore } from '../../store';
import { applyStandardScale } from '../creator/formulaActions';
import {
  applyScaleBlocker,
  applyScaleQuestion,
  countOfKind,
  formatStandardScale,
  parseStandardScale,
  planStandardScale,
  SCALE_KIND_NOUNS,
  STANDARD_SCALE_RANGE,
  type ScaleKind,
  type StandardScale,
} from '../creator/standardScale';
import { usePreferences } from '../preferences';
import { confirmDialog } from './dialogStore';
import { currentDocumentCheck } from './documentStore';
import { Modal } from './Modal';

const FIELDS: { kind: ScaleKind; label: string; hint: string; apply: string }[] = [
  { kind: 'math', label: 'Formulas', hint: 'New formulas', apply: 'Apply to all formulas' },
  { kind: 'tex', label: 'Texts', hint: 'New LaTeX texts', apply: 'Apply to all texts' },
];

export function StandardScaleDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const [scale, setScale] = useState<StandardScale>(() => usePreferences.getState().standardScale);
  /** What the last «Apply to all» did, said under the fields (the app is behind the dialog). */
  const [applied, setApplied] = useState<string | null>(null);
  const formulas = useProjectStore((s) => s.project.formulas);
  const values = { math: parseStandardScale(scale.math), tex: parseStandardScale(scale.tex) };
  const valid = values.math !== null && values.tex !== null;

  const apply = () => {
    if (!valid) return;
    usePreferences
      .getState()
      .set({ standardScale: { math: scale.math.trim(), tex: scale.tex.trim() } });
    onClose();
  };

  /** Give the scale typed for `kind` to every object of the kind, once the user says so: to
   * those of the document the question was about, not of one that opened while it was asked. */
  const applyToAll = async (kind: ScaleKind) => {
    const value = values[kind];
    if (value === null) return;
    const plan = planStandardScale(formulas, kind, value);
    if (applyScaleBlocker(kind, plan)) return;
    const sameDocument = currentDocumentCheck();
    if (!(await confirmDialog(applyScaleQuestion(plan))) || !sameDocument()) return;
    const changed = applyStandardScale(kind, value);
    if (changed > 0) {
      setApplied(
        `${countOfKind(kind, changed)} now ${changed === 1 ? 'has' : 'have'} scale ` +
          `${String(+value.toFixed(4))}.`,
      );
    }
  };

  return (
    <Modal
      title="Standard scale"
      onClose={onClose}
      testId="standard-scale-dialog"
      width="580px"
      footer={
        <>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            data-testid="standard-scale-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid}
            onClick={apply}
            data-testid="standard-scale-save"
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
          The size new formulas and new texts are born with: 1 is Manim&apos;s font size 48, 1.5 is
          72. A number or a fraction each, like 1.5 or 3/2. Saving leaves the objects that exist as
          they are; &ldquo;Apply to all&rdquo; gives the scale typed to every formula, or every
          LaTeX text, of the project now (one undo step). A formula&apos;s own Scale is in its
          editor.
        </p>
        <div className="form-grid">
          {FIELDS.map(({ kind, label, hint, apply: applyLabel }) => {
            const value = values[kind];
            const text = scale[kind];
            const restated = value !== null && formatStandardScale(text) !== text.trim();
            const blocker = applyScaleBlocker(
              kind,
              value === null ? null : planStandardScale(formulas, kind, value),
            );
            return (
              <FieldRow key={kind} id={`${id}-${kind}`} label={label}>
                <div className="standard-scale-row">
                  <span className="inline-fields">
                    <input
                      id={`${id}-${kind}`}
                      type="text"
                      inputMode="decimal"
                      value={text}
                      autoFocus={kind === 'math'}
                      data-testid={`standard-scale-${kind}`}
                      title={hint}
                      onChange={(e) => setScale({ ...scale, [kind]: e.target.value })}
                    />
                    {restated && (
                      <span data-testid={`standard-scale-${kind}-value`}>
                        = {String(+value.toFixed(4))}
                      </span>
                    )}
                    {value !== null && (
                      <span className="field-hint" data-testid={`standard-scale-${kind}-size`}>
                        font_size {+(value * 48).toFixed(4)}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn btn-small"
                    data-testid={`standard-scale-${kind}-apply`}
                    disabled={blocker !== null}
                    title={
                      blocker ??
                      `Give this scale to every ${SCALE_KIND_NOUNS[kind].one} of the project now`
                    }
                    onClick={() => void applyToAll(kind)}
                  >
                    {applyLabel}
                  </button>
                </div>
                {value === null && (
                  <span
                    className="field-error"
                    role="alert"
                    data-testid={`standard-scale-${kind}-error`}
                  >
                    Enter a number or a fraction between {STANDARD_SCALE_RANGE.min} and{' '}
                    {STANDARD_SCALE_RANGE.max}, like 1.5 or 3/2.
                  </span>
                )}
              </FieldRow>
            );
          })}
        </div>
        <p
          className="field-hint standard-scale-applied"
          role="status"
          data-testid="standard-scale-applied"
        >
          {applied}
        </p>
        {/* Enter in a field saves (the submit button lives in the footer). */}
        <input type="submit" hidden />
      </form>
    </Modal>
  );
}

function FieldRow({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <div className="field-stack">{children}</div>
    </>
  );
}
