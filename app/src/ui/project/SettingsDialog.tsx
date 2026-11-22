/* File → Project settings…: scene name, target, resolution, frame rate, background, LaTeX
 * preamble and duration. Everything is applied together as one undo step.
 *
 * The dialog shows the settings of the document that was open when it opened, and they are that
 * document's: when another one opens while it is on screen (the file chosen in File → Open…
 * arrives; a document with nothing to save is replaced without a question) the dialog goes, and
 * its Apply writes nothing into the new one. */
import { useEffect, useId, useRef, useState } from 'react';
import type { Target } from '../../model';
import { useProjectStore } from '../../store';
import { currentDocumentCheck, onDocumentReplaced } from './documentStore';
import { HexColorField } from './HexColorField';
import { Modal } from './Modal';
import { FPS_PRESETS, parseDraft, RESOLUTION_PRESETS, toDraft, type Draft } from './settingsModel';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const [draft, setDraft] = useState<Draft>(() => toDraft(useProjectStore.getState().project.meta));
  /** Whether the document the draft was taken from is still the open one. */
  const [sameDocument] = useState(currentDocumentCheck);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => onDocumentReplaced(() => onCloseRef.current()), []);
  const parsed = parseDraft(draft);
  const errors = parsed.ok ? {} : parsed.errors;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const apply = () => {
    if (!parsed.ok) return;
    if (!sameDocument()) {
      onClose();
      return;
    }
    const meta = parsed.meta;
    useProjectStore.getState().update((project) => {
      project.meta = meta;
    });
    onClose();
  };

  return (
    <Modal
      title="Project settings"
      onClose={onClose}
      testId="settings-dialog"
      width="560px"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} data-testid="settings-cancel">
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!parsed.ok}
            onClick={apply}
            data-testid="settings-apply"
          >
            Apply
          </button>
        </>
      }
    >
      <form
        className="form-grid settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <label htmlFor={`${id}-name`}>Name</label>
        <input
          id={`${id}-name`}
          type="text"
          value={draft.name}
          data-testid="settings-name"
          onChange={(e) => set('name', e.target.value)}
        />

        <label htmlFor={`${id}-target`}>Manim target</label>
        <select
          id={`${id}-target`}
          value={draft.target}
          data-testid="settings-target"
          onChange={(e) => set('target', e.target.value as Target)}
        >
          <option value="ce">ManimCE (Community Edition)</option>
          <option value="gl">ManimGL (3b1b)</option>
        </select>

        <label htmlFor={`${id}-res`}>Resolution</label>
        <div className="field-stack">
          <select
            id={`${id}-res`}
            value={draft.resolution}
            data-testid="settings-resolution"
            onChange={(e) => {
              const preset = RESOLUTION_PRESETS.find((p) => p.id === e.target.value);
              setDraft((current) => ({
                ...current,
                resolution: e.target.value,
                width: preset ? String(preset.width) : current.width,
                height: preset ? String(preset.height) : current.height,
              }));
            }}
          >
            {RESOLUTION_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          {draft.resolution === 'custom' && (
            <span className="inline-fields">
              <input
                type="text"
                inputMode="numeric"
                aria-label="Width in pixels"
                value={draft.width}
                data-testid="settings-width"
                onChange={(e) => set('width', e.target.value)}
              />
              ×
              <input
                type="text"
                inputMode="numeric"
                aria-label="Height in pixels"
                value={draft.height}
                data-testid="settings-height"
                onChange={(e) => set('height', e.target.value)}
              />
              px
            </span>
          )}
          {(errors.width || errors.height) && (
            <span className="field-error" role="alert">
              {errors.width ?? errors.height}
            </span>
          )}
        </div>

        <label htmlFor={`${id}-fps`}>Frame rate</label>
        <div className="field-stack">
          <select
            id={`${id}-fps`}
            value={draft.fps}
            data-testid="settings-fps"
            onChange={(e) => set('fps', e.target.value)}
          >
            {FPS_PRESETS.map((fps) => (
              <option key={fps} value={String(fps)}>
                {fps} fps
              </option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          {draft.fps === 'custom' && (
            <input
              type="text"
              inputMode="numeric"
              aria-label="Custom frame rate"
              value={draft.customFps}
              data-testid="settings-custom-fps"
              onChange={(e) => set('customFps', e.target.value)}
            />
          )}
          {errors.fps && (
            <span className="field-error" role="alert">
              {errors.fps}
            </span>
          )}
        </div>

        <span className="form-label">Background</span>
        <HexColorField
          value={draft.background}
          label="Background colour"
          testId="settings-background"
          onCommit={(color) => set('background', color)}
        />

        <span className="form-label">Duration</span>
        <div className="field-stack">
          <span className="inline-fields settings-duration">
            <label className="check">
              <input
                type="radio"
                name={`${id}-duration`}
                checked={draft.durationMode === 'auto'}
                data-testid="settings-duration-auto"
                onChange={() => set('durationMode', 'auto')}
              />
              Until the last clip ends
            </label>
            <label className="check">
              <input
                type="radio"
                name={`${id}-duration`}
                checked={draft.durationMode === 'fixed'}
                data-testid="settings-duration-fixed"
                onChange={() => set('durationMode', 'fixed')}
              />
              Fixed
            </label>
            {draft.durationMode === 'fixed' && (
              <>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Duration in seconds"
                  value={draft.duration}
                  data-testid="settings-duration"
                  onChange={(e) => set('duration', e.target.value)}
                />
                s
              </>
            )}
          </span>
          {errors.duration && (
            <span className="field-error" role="alert">
              {errors.duration}
            </span>
          )}
        </div>

        <label htmlFor={`${id}-preamble`}>LaTeX preamble</label>
        <div className="field-stack">
          <textarea
            id={`${id}-preamble`}
            rows={5}
            spellCheck={false}
            value={draft.preamble}
            placeholder={'\\newcommand{\\R}{\\mathbb{R}}'}
            data-testid="settings-preamble"
            onChange={(e) => set('preamble', e.target.value)}
          />
          <span className="field-hint">
            Added after the packages of every formula (exact mode compiles it; MathJax understands
            \newcommand and \DeclareMathOperator).
          </span>
        </div>
      </form>
    </Modal>
  );
}
