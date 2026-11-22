/* Edit → Default intro & outro…: which animations "Always add intro / outro" gives new clips.
 * Saved as an editor preference (localStorage), not in the project and not undoable. */
import { useId, useState } from 'react';
import type { Easing } from '../../model';
import { EASINGS, INTRO_ANIMATIONS, OUTRO_ANIMATIONS } from '../animations/catalogue';
import { defaultPreferences, usePreferences } from '../preferences';
import {
  isFade,
  parseDraft,
  phaseForKind,
  toDraft,
  type AnimationsDraft,
  type DraftErrors,
  type PhaseDraft,
} from './defaultAnimations';
import { Modal } from './Modal';

type Phase = 'intro' | 'outro';

function PhaseFields({
  phase,
  draft,
  errors,
  onChange,
}: {
  phase: Phase;
  draft: PhaseDraft;
  errors: DraftErrors;
  onChange(next: PhaseDraft): void;
}) {
  const id = useId();
  const options = phase === 'intro' ? INTRO_ANIMATIONS : OUTRO_ANIMATIONS;
  const test = (field: string) => `default-${phase}-${field}`;
  const patch = (fields: Partial<PhaseDraft>) => onChange({ ...draft, ...fields });
  const error = (field: string) =>
    errors[`${phase}.${field}`] && (
      <span className="field-error" role="alert" data-testid={`${test(field)}-error`}>
        {errors[`${phase}.${field}`]}
      </span>
    );

  return (
    <section className="da-section" data-testid={test('section')}>
      <h3 className="da-heading">{phase === 'intro' ? 'Intro' : 'Outro'}</h3>
      <div className="form-grid">
        <label htmlFor={`${id}-kind`}>Animation</label>
        <select
          id={`${id}-kind`}
          value={draft.kind}
          data-testid={test('kind')}
          // Another animation brings its own duration, easing and so on, as in the clip panel.
          onChange={(e) => onChange(phaseForKind(phase, e.target.value))}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <label htmlFor={`${id}-duration`}>Duration</label>
        <div className="field-stack">
          <span className="inline-fields">
            <input
              id={`${id}-duration`}
              type="text"
              inputMode="decimal"
              value={draft.duration}
              data-testid={test('duration')}
              onChange={(e) => patch({ duration: e.target.value })}
            />
            s
          </span>
          {error('duration')}
        </div>

        <label htmlFor={`${id}-easing`}>Easing</label>
        <select
          id={`${id}-easing`}
          value={draft.easing}
          data-testid={test('easing')}
          onChange={(e) => patch({ easing: e.target.value as Easing })}
        >
          {EASINGS.map((easing) => (
            <option key={easing} value={easing}>
              {easing}
            </option>
          ))}
        </select>

        <label htmlFor={`${id}-lag-mode`}>Lag ratio</label>
        <div className="field-stack">
          <span className="inline-fields">
            <select
              id={`${id}-lag-mode`}
              value={draft.lagMode}
              data-testid={test('lag-mode')}
              onChange={(e) => patch({ lagMode: e.target.value as PhaseDraft['lagMode'] })}
            >
              <option value="auto">Auto (Manim&apos;s default)</option>
              <option value="custom">Custom</option>
            </select>
            <input
              type="text"
              inputMode="decimal"
              aria-label={`${phase === 'intro' ? 'Intro' : 'Outro'} lag ratio`}
              value={draft.lag}
              disabled={draft.lagMode === 'auto'}
              data-testid={test('lag')}
              onChange={(e) => patch({ lag: e.target.value })}
            />
          </span>
          {error('lag')}
        </div>

        {isFade(draft.kind) && (
          <>
            <span className="form-label">Shift</span>
            <div className="field-stack">
              <span className="inline-fields">
                X
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`${phase === 'intro' ? 'Intro' : 'Outro'} shift X`}
                  value={draft.shiftX}
                  data-testid={test('shift-x')}
                  onChange={(e) => patch({ shiftX: e.target.value })}
                />
                Y
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`${phase === 'intro' ? 'Intro' : 'Outro'} shift Y`}
                  value={draft.shiftY}
                  data-testid={test('shift-y')}
                  onChange={(e) => patch({ shiftY: e.target.value })}
                />
              </span>
              {error('shift')}
            </div>

            <label htmlFor={`${id}-scale`}>Scale</label>
            <div className="field-stack">
              <span className="inline-fields">
                <input
                  id={`${id}-scale`}
                  type="text"
                  inputMode="decimal"
                  value={draft.scale}
                  data-testid={test('scale')}
                  onChange={(e) => patch({ scale: e.target.value })}
                />
              </span>
              {error('scale')}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function DefaultAnimationsDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<AnimationsDraft>(() => {
    const { intro, outro } = usePreferences.getState();
    return toDraft(intro, outro);
  });
  const parsed = parseDraft(draft);
  const errors = parsed.ok ? {} : parsed.errors;

  const apply = () => {
    if (!parsed.ok) return;
    usePreferences.getState().set({ intro: parsed.intro, outro: parsed.outro });
    onClose();
  };

  const restore = () => {
    const defaults = defaultPreferences();
    setDraft(toDraft(defaults.intro, defaults.outro));
  };

  return (
    <Modal
      title="Default intro & outro"
      onClose={onClose}
      testId="default-animations-dialog"
      width="520px"
      footer={
        <>
          <button
            type="button"
            className="btn"
            style={{ marginRight: 'auto' }}
            onClick={restore}
            data-testid="default-animations-restore"
          >
            Restore defaults
          </button>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            data-testid="default-animations-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!parsed.ok}
            onClick={apply}
            data-testid="default-animations-save"
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
          Used for clips you add to the timeline from now on, when &ldquo;Always add intro&rdquo; or
          &ldquo;Always add outro&rdquo; (Edit menu) is on. Existing clips keep their animations;
          change them in the Animations panel.
        </p>
        <PhaseFields
          phase="intro"
          draft={draft.intro}
          errors={errors}
          onChange={(intro) => setDraft((current) => ({ ...current, intro }))}
        />
        <PhaseFields
          phase="outro"
          draft={draft.outro}
          errors={errors}
          onChange={(outro) => setDraft((current) => ({ ...current, outro }))}
        />
        {errors.total && (
          <span className="field-error" role="alert" data-testid="default-animations-total-error">
            {errors.total}
          </span>
        )}
        {/* Enter in a field saves (the submit button lives in the footer). */}
        <input type="submit" hidden />
      </form>
    </Modal>
  );
}
