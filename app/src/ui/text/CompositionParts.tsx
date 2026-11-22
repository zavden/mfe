/* What the composition workspace of every kind of text shares: the dialog with Cancel and Apply,
 * the stage wired to the session's placement, the buttons of the session (an independent copy,
 * the recovery of an unapplied draft) and the line that says why Apply would be refused. The
 * editor of each kind puts its form and its render around them. */
import type { ReactNode } from 'react';
import type { FormulaRender } from '../../engine';
import { useProjectStore } from '../../store';
import { Modal } from '../project/Modal';
import { ownEscape } from '../project/modalStack';
import { libraryPlacementNote } from './textCompositionModel';
import { TextCompositionStage } from './TextCompositionStage';
import {
  blockTextCompositionCommand,
  useTextComposition,
  type TextCompositionSession,
} from './textCompositionStore';

/** The dialog of a session: its title, Cancel and Apply, and the keys of the workspace (Ctrl/⌘+S,
 * O and N wait for Apply or Cancel; Ctrl/⌘+Enter applies). */
export function CompositionFrame({
  session,
  title,
  uses,
  applyDisabled,
  onApply,
  children,
}: {
  session: TextCompositionSession;
  title: string;
  uses: number;
  applyDisabled: boolean;
  onApply(): void;
  children: ReactNode;
}) {
  const { cancel } = useTextComposition.getState();
  return (
    <Modal
      title={title}
      testId="text-composition"
      width="1180px"
      resizable
      closeOnBackdrop={false}
      onClose={() => {
        if (!session.composing) cancel();
      }}
      footer={
        <>
          <span className="field-hint">
            {session.isNew
              ? 'New library object · no clip will be added'
              : `${uses} timeline use${uses === 1 ? '' : 's'}`}
          </span>
          <button type="button" className="btn" data-testid="text-cancel" onClick={cancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="text-apply"
            disabled={applyDisabled}
            onClick={onApply}
          >
            {session.applying ? 'Applying…' : 'Apply'}
          </button>
        </>
      }
    >
      <div
        className="text-composition-layout"
        data-kind={session.original.kind}
        {...ownEscape(session.composing)}
        onKeyDownCapture={(event) => {
          const command =
            (event.ctrlKey || event.metaKey) &&
            !event.altKey &&
            !event.getModifierState('AltGraph') &&
            !event.nativeEvent.isComposing &&
            !session.composing;
          if (command && ['s', 'o', 'n'].includes(event.key.toLowerCase())) {
            event.preventDefault();
            event.stopPropagation();
            blockTextCompositionCommand();
            return;
          }
          if (command && event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            onApply();
          }
        }}
      >
        {children}
      </div>
    </Modal>
  );
}

/** The buttons of a session under its form: the selected occurrence made independent on Apply,
 * and the draft a closed tab left unapplied. */
export function SessionActions({
  session,
  uses,
  selectedLocked,
}: {
  session: TextCompositionSession;
  uses: number;
  selectedLocked: boolean;
}) {
  const { makeIndependent, recover } = useTextComposition.getState();
  return (
    <>
      {session.clipId && !session.independent && !selectedLocked && uses > 1 && (
        <button
          type="button"
          className="btn"
          data-testid="text-independent"
          onClick={makeIndependent}
        >
          Make independent on Apply
        </button>
      )}
      {session.independent && (
        <p className="field-hint">Apply creates an independent text for this occurrence.</p>
      )}
      {session.recovery && (
        <button type="button" className="btn" data-testid="text-recover" onClick={recover}>
          Recover unapplied draft
        </button>
      )}
    </>
  );
}

/** The stage of a session: the render it is given at the session's placement, moved by the
 * session's own gestures (never the project's). A library session — one without a clip — places
 * where the object's new clips start, and has the box that says whether Apply keeps it. */
export function SessionStage({
  session,
  render,
  color,
  glyphColors,
  current,
  movable,
}: {
  session: TextCompositionSession;
  render: FormulaRender | null;
  color: string;
  glyphColors: Record<string, string>;
  /** `render` is the draft's as it stands: guides and centring need its geometry. */
  current: boolean;
  movable: boolean;
}) {
  const meta = useProjectStore((state) => state.project.meta);
  const { setPosition, setKeepPosition, recordPosition, undoPosition } =
    useTextComposition.getState();
  const mine = () => useTextComposition.getState().session?.token === session.token;
  const positionLabel = !session.clipId
    ? libraryPlacementNote(session.keepPosition)
    : (session.placementReason ??
      (session.placement?.ref.kind === 'action'
        ? 'Placement: selected transformation end state. The main timeline stays paused.'
        : 'Placement: clip initial state. Changes apply only to this occurrence.'));
  return (
    <TextCompositionStage
      render={render}
      meta={meta}
      placement={{ ...session.pose, position: session.position }}
      color={color}
      glyphColors={glyphColors}
      current={current}
      movable={movable}
      positionLabel={positionLabel}
      keepPosition={session.clipId ? undefined : session.keepPosition}
      onKeepPosition={(keep) => {
        if (mine()) setKeepPosition(keep);
      }}
      onPosition={(position, record) => {
        if (mine()) setPosition(position, record);
      }}
      onRecordPosition={(before) => {
        if (mine()) recordPosition(before);
      }}
      onUndo={(redo) => {
        if (mine()) undoPosition(redo);
      }}
    />
  );
}

/** What the render of the draft is doing, as the colour of a dot: nothing to draw, being rendered
 * (the last appearance stays on the stage meanwhile), current, or refused. */
export type RenderState = 'idle' | 'busy' | 'ok' | 'error';

/** The one line over the stage that says what is drawn there. It never changes height, and while
 * the draft is rendered again only its dot changes: text coming and going with every key would
 * push the stage about. */
export function RenderStatus({ state, children }: { state: RenderState; children: ReactNode }) {
  return (
    <div
      className="text-render-status"
      data-testid="text-render-status"
      data-state={state}
      role="status"
      title={state === 'busy' ? 'Rendering…' : undefined}
    >
      <span className="text-render-dot" aria-hidden="true" />
      <span className="text-render-text">{children}</span>
      {state === 'busy' && <span className="visually-hidden">Rendering…</span>}
    </div>
  );
}

/** What the workspace has to say about the draft — what the renderer refused, what it warns of,
 * why Apply waits — in a strip of a fixed height under the stage, scrolled when it is long: none
 * of it moves the stage as it comes and goes. */
export function SessionMessages({ children }: { children: ReactNode }) {
  return (
    <div className="text-messages" data-testid="text-messages">
      {children}
    </div>
  );
}

/** Why Apply is, or was, refused. */
export function SessionConflict({
  session,
  conflict,
}: {
  session: TextCompositionSession;
  conflict: string | null;
}) {
  const message = session.error ?? conflict;
  return message ? (
    <p className="field-error" role="alert" data-testid="text-conflict">
      {message}
    </p>
  ) : null;
}
