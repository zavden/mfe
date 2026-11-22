/* Export ▸ Image…: the frame at the playhead as a PNG picture — the frame a video shows there —,
 * at the project's size or twice it, with the scene's background or without it. The picture is
 * drawn at once: there is no encoder to choose and nothing to wait for but the formulas. The size
 * and the background are kept from one picture to the next, while the page lives: the frames of a
 * session are chosen for once. */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { IMAGE_SCALES, imageSize, type ImageScale } from '../../export';
import { history, useProjectStore, useRenderStore, useUiStore } from '../../store';
import { Modal } from '../project/Modal';
import { currentDocumentCheck } from '../project/documentStore';
import { downloadBlob } from '../project/files';
import { mainPlayback } from '../transport/mainPlayback';
import { formatTimecode } from '../transport/playback';
import { frameInstant, imageReadiness } from './imageExportModel';
import { runImageExport, type ImageRun } from './imageExportRun';
import { formatBytes } from './videoExportModel';
import './video-export.css';

const names = (formulas: readonly { name: string }[]) =>
  formulas.map((formula) => formula.name).join(', ');

/** What the dialog was left at: what it opens with the next time, until the page is loaded again
 * (it is no preference: nothing of it is stored). */
let left: { scale: ImageScale; transparent: boolean } = { scale: 1, transparent: false };

const leave = (choice: Partial<typeof left>): void => {
  left = { ...left, ...choice };
};

export function ImageExportDialog({ onClose }: { onClose(): void }) {
  const id = useId();
  const project = useProjectStore((state) => state.project);
  const resolved = useRenderStore((state) => state.resolved);
  const entries = useRenderStore((state) => state.entries);
  const playhead = useUiStore((state) => state.time);
  const [scale, setScale] = useState<ImageScale>(left.scale);
  const [transparent, setTransparent] = useState(left.transparent);
  const chooseScale = (next: ImageScale) => {
    leave({ scale: next });
    setScale(next);
  };
  const chooseTransparent = (next: boolean) => {
    leave({ transparent: next });
    setTransparent(next);
  };
  const [run, setRun] = useState<ImageRun>({ status: 'idle' });
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    // The picture is of the playhead's instant: it stays there while the dialog is open.
    mainPlayback.pause();
    return () => {
      open.current = false;
    };
  }, []);

  const instant = frameInstant(project, playhead);
  const readiness = useMemo(
    () => imageReadiness(project, entries, resolved, instant),
    [project, entries, resolved, instant],
  );
  const { waiting, failing, missing, empty, boxes, blocked } = readiness;
  const busy = run.status === 'running';
  const ready = waiting.length === 0 && blocked.length === 0 && !busy;

  const start = () => {
    if (!ready) return;
    // What a drag still held has moved is not the project yet: it is put back before the project
    // is read. The project, its renders and the instant are the ones of this click, whatever
    // happens while the browser asks where the file goes.
    history.cancelForeignGesture();
    const sameDocument = currentDocumentCheck();
    const current = useProjectStore.getState().project;
    void runImageExport(
      {
        project: current,
        resolved: useRenderStore.getState().resolved,
        options: {
          time: frameInstant(current, useUiStore.getState().time),
          scale,
          transparent,
        },
      },
      (next) => {
        if (open.current) setRun(next);
      },
      undefined,
      () => open.current && sameDocument(),
    );
  };

  const one = (formulas: readonly unknown[]) => formulas.length === 1;

  return (
    <Modal
      title="Export image"
      onClose={onClose}
      testId="export-image"
      width="520px"
      closeOnBackdrop={!busy}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} data-testid="image-close">
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready}
            onClick={start}
            data-testid="image-start"
          >
            Export
          </button>
        </>
      }
    >
      <div className="video-export image-export form-grid">
        <span className="form-label">Frame</span>
        <div className="field-stack">
          <span data-testid="image-instant">
            At {Math.round(instant * 1000) / 1000} s ({formatTimecode(instant, project.meta.fps)})
          </span>
          <span className="field-hint">
            The playhead’s frame, as a video shows it: through the scene’s camera, and with the
            tracks hidden in the Preview drawn too. A PNG file.
          </span>
        </div>

        <span className="form-label">Size</span>
        <div className="field-stack" role="radiogroup" aria-label="Size">
          {IMAGE_SCALES.map((option) => {
            const size = imageSize(project.meta, option);
            return (
              <label className="check" key={option}>
                <input
                  type="radio"
                  name={`${id}-scale`}
                  checked={scale === option}
                  disabled={busy}
                  onChange={() => chooseScale(option)}
                  data-testid={`image-scale-${option}`}
                />
                {option}× · {size.width} × {size.height}
                {option === 1 ? ' (the project’s size)' : ''}
              </label>
            );
          })}
        </div>

        <span className="form-label">Background</span>
        <div className="field-stack">
          <label className="check">
            <input
              type="checkbox"
              checked={transparent}
              disabled={busy}
              onChange={(event) => chooseTransparent(event.currentTarget.checked)}
              data-testid="image-transparent"
            />
            Transparent
          </label>
          <span className="field-hint">
            {transparent
              ? 'Only what is drawn, over nothing: to lay the picture over another.'
              : 'Over the scene’s background.'}
          </span>
        </div>

        {blocked.length > 0 && (
          <p className="video-summary field-error" role="alert" data-testid="image-text-blocked">
            {names(blocked)}: font text with no appearance of {one(blocked) ? 'its' : 'their'}{' '}
            current source and font. Refresh appearance, in {one(blocked) ? 'its' : 'their'} editor,
            shapes {one(blocked) ? 'it' : 'them'}, which needs the companion.
          </p>
        )}
        {boxes.length > 0 && (
          <p className="video-summary field-warning" data-testid="image-text-boxes">
            {names(boxes)}: font text nothing has shaped. The picture shows{' '}
            {one(boxes) ? 'it' : 'them'} as the preview does, as placeholder boxes. The companion
            draws {one(boxes) ? 'its' : 'their'} real glyphs.
          </p>
        )}
        {waiting.length > 0 && (
          <p className="video-summary field-warning" data-testid="image-waiting-formulas">
            Waiting for {one(waiting) ? 'a formula' : `${waiting.length} formulas`} to render (
            {names(waiting)})…
          </p>
        )}
        {failing.length > 0 && (
          <p className="video-summary field-warning" data-testid="image-stale-formulas">
            {names(failing)} {one(failing) ? 'does' : 'do'} not render with{' '}
            {one(failing) ? 'its' : 'their'} current LaTeX: the picture draws{' '}
            {one(failing) ? 'its' : 'their'} last good render.
          </p>
        )}
        {missing.length > 0 && (
          <p className="video-summary field-warning" data-testid="image-missing-formulas">
            {names(missing)} {one(missing) ? 'does' : 'do'} not render with{' '}
            {one(missing) ? 'its' : 'their'} current LaTeX and never did: the picture leaves{' '}
            {one(missing) ? 'it' : 'them'} out.
          </p>
        )}
        {empty.length > 0 && (
          <p className="video-summary field-warning" data-testid="image-empty-formulas">
            {names(empty)} {one(empty) ? 'is' : 'are'} empty and will be missing from the picture.
          </p>
        )}

        {run.status !== 'idle' && <RunPanel run={run} />}
      </div>
    </Modal>
  );
}

function RunPanel({ run }: { run: Exclude<ImageRun, { status: 'idle' }> }) {
  if (run.status === 'running') {
    return (
      <div className="video-run" data-testid="image-run">
        <span role="status" data-testid="image-drawing">
          Drawing the picture…
        </span>
      </div>
    );
  }
  if (run.status === 'done') {
    const { blob } = run;
    return (
      <div className="video-run" data-testid="image-run">
        <span className="video-done" role="status" data-testid="image-done">
          {blob ? 'Saved' : 'Written to'} {run.fileName} ({run.width} × {run.height},{' '}
          {formatBytes(run.size)}).
        </span>
        {blob && (
          <span>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => downloadBlob(run.fileName, blob)}
              data-testid="image-download"
            >
              Download again
            </button>
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="video-run" data-testid="image-run">
      <span className="video-error" role="alert" data-testid="image-error">
        {run.message}
      </span>
    </div>
  );
}
