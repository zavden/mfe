/* Edit → Apply palette: review a captured palette and exact object counts, then commit once.
 * Library state stays outside this dialog; the host supplies the chosen entry and a live reader. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../store';
import { useDocumentStore } from '../project/documentStore';
import { Modal } from '../project/Modal';
import { PALETTE_SKIP_REASONS } from './applyPalette';
import { PALETTE_ROLES } from './palette';
import { PaletteStrip } from './PaletteSample';
import {
  createApplyPaletteCommand,
  type ApplyPaletteCommand,
  type ApplyPalettePreview,
  type ApplyPaletteSnapshot,
} from './applyPaletteActions';
import './colors.css';

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const REFRESHED = 'The project or palette changed. Review the updated preview before applying.';

export interface ApplyPaletteDialogProps {
  palette: ApplyPaletteSnapshot | null;
  readPalette(): ApplyPaletteSnapshot | null;
  onClose(): void;
}

export function ApplyPaletteDialog({ palette, readPalette, onClose }: ApplyPaletteDialogProps) {
  const project = useProjectStore((state) => state.project);
  const session = useDocumentStore((state) => state.session);
  const callbacks = useRef({ readPalette, onClose });
  const closed = useRef(false);
  const [command, setCommand] = useState<ApplyPaletteCommand | null>(null);
  const [preview, setPreview] = useState<ApplyPalettePreview | null>(null);
  const [includeBackground, setIncludeBackground] = useState(true);
  const [message, setMessage] = useState('');
  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    command?.dispose();
    callbacks.current.onClose();
  }, [command]);

  useEffect(() => {
    callbacks.current = { readPalette, onClose };
  }, [readPalette, onClose]);

  useEffect(() => {
    const owner = createApplyPaletteCommand(() => callbacks.current.readPalette());
    setCommand(owner);
    setPreview(owner.preview());
    return () => owner.dispose();
  }, []);

  useEffect(() => {
    if (command?.isCancelled()) close();
  }, [command, project, session, close]);

  const confirm = () => {
    if (!command) return;
    if (!preview) {
      setPreview(command.preview(includeBackground));
      setMessage(REFRESHED);
      if (command.isCancelled()) close();
      return;
    }
    const result = command.confirm(preview);
    if (result.status === 'stale') {
      setPreview(result.preview);
      setMessage(REFRESHED);
    } else close();
  };
  const plan = preview?.plan;
  const stale = Boolean(preview && (!palette || !command?.isCurrent(preview)));
  const needsPreview = palette !== null && preview === null;
  const status =
    message ||
    (stale ? 'The project or palette changed. Refresh the preview before applying.' : '');

  return (
    <Modal
      title="Apply palette"
      onClose={close}
      testId="apply-palette-dialog"
      width="600px"
      allowHistory={false}
      footer={
        <>
          <button type="button" className="btn" onClick={close} data-testid="apply-palette-cancel">
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={preview ? !plan?.hasChanges && !stale : !needsPreview}
            onClick={confirm}
            data-testid="apply-palette-confirm"
          >
            {stale || needsPreview ? 'Review updated preview' : 'Apply palette'}
          </button>
        </>
      }
    >
      {status && (
        <p role="status" className="ap-status" data-testid="apply-palette-status">
          {status}
        </p>
      )}
      {preview && plan ? (
        <div className="field-stack ap-body">
          <p className="ap-card ap-palette" data-testid="apply-palette-name">
            <span>
              Palette: <strong>{preview.palette.displayName}</strong>
            </span>
            <PaletteStrip colors={PALETTE_ROLES.map((role) => preview.palette.colors[role])} />
          </p>
          <p className="ap-card" data-testid="apply-palette-counts">
            {plural(plan.changes.length, 'object')} will change.{' '}
            {plural(plan.skipped.length, 'object')} skipped. {plural(plan.unchanged, 'object')}{' '}
            already match.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={includeBackground}
              data-testid="apply-palette-background"
              onChange={(event) => {
                const selected = event.target.checked;
                setIncludeBackground(selected);
                setPreview(command?.preview(selected) ?? null);
              }}
            />
            Apply background ({preview.palette.colors.background})
          </label>
          <p className="field-hint" data-testid="apply-palette-background-note">
            The background is global, including behind locked objects.{' '}
            {plan.background.selected
              ? plan.background.changed
                ? 'It will change.'
                : 'It already matches.'
              : 'It will stay unchanged.'}
          </p>
          <p className="field-hint">
            Existing object base colours will be replaced. Glyph colours, clip and animation colour
            overrides, tags, styles and timing are preserved. Explicit overrides may keep a clip
            looking different.
          </p>
          {plan.skipped.length > 0 && (
            <details className="ap-skipped" data-testid="apply-palette-skipped">
              <summary>Skipped objects ({plan.skipped.length})</summary>
              <ul>
                {plan.skipped.map((item) => (
                  <li key={item.id}>
                    {item.name}:{' '}
                    {item.reasons.map((reason) => PALETTE_SKIP_REASONS[reason]).join('; ')}.
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!plan.hasChanges && (
            <p className="ap-card" data-testid="apply-palette-noop">
              No colours would change.
            </p>
          )}
        </div>
      ) : (
        <p data-testid="apply-palette-empty">
          {palette
            ? 'The palette changed. Review its colours before applying.'
            : 'Activate a palette in Preferences → Editor palettes before applying it.'}
        </p>
      )}
    </Modal>
  );
}
