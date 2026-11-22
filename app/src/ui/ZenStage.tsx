/* Zen mode's stage (D182, D188): the Preview with a thin strip along its top or its bottom. The
 * strip has a button for the Creator and one for the Animations panel, then the tools one
 * reaches for most (`ZenStripTools`), and at its far end the arrow that moves it to the other
 * side of the Preview.
 *
 * Each button opens and closes its panel as a half of a drawer over the Preview, on the strip's
 * side: the Creator on the left, the Animations panel on the right, side by side when both are
 * open, and the Preview seen through the half that is closed. Where the two meet drags, and so
 * does the drawer's free edge, to make it taller or shorter. A half stays open while one works
 * on the timeline; a press on the Preview's scene closes both — and does what it does there —,
 * and so does Escape, from the strip's buttons or from inside a panel. Both panels stay mounted,
 * so each keeps its state while it is closed.
 *
 * The halves fold through the panels store (`panelsStore.ts`), with the handles registered here:
 * the fold button of a panel, View ▸ Panels and whatever unfolds a panel it needs open and close
 * them with the words they have in the usual layout. Which halves are open, the drawer's height
 * and where the halves meet are kept in the browser (`zenDrawer.ts`). */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { foldKey, usePanels, type FoldHandle } from './panelsStore';
import { isMainClick, trackPointer } from './pointer';
import { usePreferences } from './preferences';
import { Icon, type IconName } from './timeline/icons';
import {
  clampHeight,
  clampSplit,
  DRAWER_HEIGHT,
  DRAWER_SPLIT,
  readDrawer,
  writeDrawer,
} from './zenDrawer';
import { ZenStripTools } from './ZenStripTools';

type Half = 'creator' | 'animations';

const HALVES: readonly { id: Half; label: string; icon: IconName }[] = [
  { id: 'creator', label: 'Creator', icon: 'layers' },
  { id: 'animations', label: 'Animations', icon: 'film' },
];

/** Escape closes the drawer, but not from a field that is being typed in: there it is the
 * field's own key. */
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** Close the halves that are open. */
function closeDrawer(): void {
  const panels = usePanels.getState();
  for (const { id } of HALVES) if (!panels.collapsed[id]) panels.toggle(id);
}

interface ZenStageProps {
  preview: ReactNode;
  creator: ReactNode;
  animations: ReactNode;
}

export function ZenStage({ preview, creator, animations }: ZenStageProps) {
  const creatorOpen = usePanels((state) => !state.collapsed.creator);
  const animationsOpen = usePanels((state) => !state.collapsed.animations);
  const open: Record<Half, boolean> = { creator: creatorOpen, animations: animationsOpen };
  const strip = usePreferences((state) => state.zenStrip);
  const [height, setHeight] = useState(() => readDrawer().height);
  const [split, setSplit] = useState(() => readDrawer().split);
  const stage = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<Half, HTMLButtonElement>());
  const drawerId = useId();

  // Each half folds through a handle of its own in the panels store; they start as they were
  // left.
  useEffect(() => {
    const panels = usePanels.getState();
    const kept = readDrawer();
    for (const { id } of HALVES) {
      const handle: FoldHandle = {
        collapse: () => usePanels.getState().report(id, true),
        expand: () => usePanels.getState().report(id, false),
        isCollapsed: () => usePanels.getState().collapsed[id],
      };
      panels.report(id, !kept[id]);
      panels.register(id, handle);
    }
    return () => {
      const { register } = usePanels.getState();
      for (const { id } of HALVES) register(id, null);
    };
  }, []);

  // Kept as it is left: what the store says now, not what was drawn — at first the drawer is
  // drawn before the effect above has told the store how it was left.
  useEffect(() => {
    const { collapsed } = usePanels.getState();
    writeDrawer({
      creator: !collapsed.creator,
      animations: !collapsed.animations,
      height,
      split,
    });
  }, [creatorOpen, animationsOpen, height, split]);

  // Escape closes the drawer, from the strip or from inside a panel. The panels are drawn in
  // nodes of their own (AppLayout), so a key pressed in one does not come up through this
  // component: it is heard on the document, after whatever inside took it for itself.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const from = event.target instanceof Element ? event.target : null;
      if (!from || !stage.current?.contains(from)) return;
      const half = from.closest<HTMLElement>('.zen-drawer')?.dataset.half as Half | undefined;
      if (!half && !from.closest('.zen-strip')) return;
      const { collapsed } = usePanels.getState();
      if ((collapsed.creator && collapsed.animations) || typing(from)) return;
      event.preventDefault();
      event.stopPropagation();
      // The focus goes to the button of the half the key came from, which is about to hide.
      if (half) buttons.current.get(half)?.focus();
      closeDrawer();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // A press on the Preview's scene closes the drawer, and goes on to do what it does there: it
  // is heard on its way down, before the scene takes it.
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    const onPointerDown = (event: PointerEvent) => {
      const from = event.target instanceof Element ? event.target : null;
      if (from?.closest('[data-testid="preview-frame"]')) closeDrawer();
    };
    element.addEventListener('pointerdown', onPointerDown, true);
    return () => element.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  /** The free edge of the drawer follows the pointer; Escape puts the height back. */
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMainClick(event) || !body.current) return;
    event.preventDefault();
    const room = Math.max(1, body.current.clientHeight);
    const from = height;
    const start = event.clientY;
    const sign = strip === 'top' ? 1 : -1;
    trackPointer(event.pointerId, {
      move: (e) => setHeight(clampHeight(from + (sign * (e.clientY - start)) / room)),
      end: (_, cancelled) => {
        if (cancelled) setHeight(from);
      },
    });
  };

  const onEdgeKey = (event: KeyboardEvent) => {
    // The arrow that points away from the strip makes the drawer taller.
    const taller = strip === 'top' ? 'ArrowDown' : 'ArrowUp';
    const shorter = strip === 'top' ? 'ArrowUp' : 'ArrowDown';
    if (event.key !== taller && event.key !== shorter) return;
    event.preventDefault();
    setHeight((now) =>
      clampHeight(now + (event.key === taller ? DRAWER_HEIGHT.step : -DRAWER_HEIGHT.step)),
    );
  };

  /** Where the halves meet follows the pointer; Escape puts it back. */
  const startSplit = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMainClick(event) || !body.current) return;
    event.preventDefault();
    const room = Math.max(1, body.current.clientWidth);
    const from = split;
    const start = event.clientX;
    trackPointer(event.pointerId, {
      move: (e) => setSplit(clampSplit(from + (e.clientX - start) / room)),
      end: (_, cancelled) => {
        if (cancelled) setSplit(from);
      },
    });
  };

  const onSplitKey = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setSplit((now) =>
      clampSplit(now + (event.key === 'ArrowRight' ? DRAWER_SPLIT.step : -DRAWER_SPLIT.step)),
    );
  };

  const tall = `${Math.round(height * 1000) / 10}%`;
  const wide = `${Math.round(split * 1000) / 10}%`;
  const content: Record<Half, ReactNode> = { creator, animations };
  const widths: Record<Half, string> = {
    creator: wide,
    animations: `${Math.round((1 - split) * 1000) / 10}%`,
  };
  const other = strip === 'top' ? 'bottom' : 'top';

  return (
    <div className="zen-stage" data-strip={strip} data-testid="zen-stage" ref={stage}>
      <div
        className="zen-strip"
        role="toolbar"
        aria-label="Panels and tools"
        data-testid="zen-strip"
      >
        {HALVES.map((half) => (
          <button
            key={half.id}
            ref={(el) => {
              if (el) buttons.current.set(half.id, el);
              else buttons.current.delete(half.id);
            }}
            type="button"
            className={open[half.id] ? 'zen-strip-tab is-active' : 'zen-strip-tab'}
            aria-expanded={open[half.id]}
            aria-controls={`${drawerId}-${half.id}`}
            data-testid={`zen-tab-${half.id}`}
            title={
              open[half.id]
                ? `Close the ${half.label} panel (${foldKey(half.id)}, Esc, or a press on the Preview)`
                : `Open the ${half.label} panel over the Preview (${foldKey(half.id)})`
            }
            onClick={() => usePanels.getState().toggle(half.id)}
          >
            <Icon name={half.icon} />
            <span>{half.label}</span>
          </button>
        ))}
        <span className="zen-strip-sep" aria-hidden="true" />
        <ZenStripTools />
        <span className="zen-strip-room" />
        <button
          type="button"
          className="zen-strip-tool zen-strip-move"
          data-testid="zen-strip-move"
          aria-label={`Move this strip to the ${other} of the Preview`}
          title={`Move this strip to the ${other} of the Preview`}
          onClick={() => usePreferences.getState().set({ zenStrip: other })}
        >
          <Icon name={strip === 'top' ? 'down' : 'up'} />
        </button>
      </div>
      {/* The Preview's place: the search of formulas covers it, and the drawer with it. */}
      <div className="zen-stage-body panel-inner preview-slot" ref={body}>
        {preview}
        {HALVES.map((half) => (
          <div
            key={half.id}
            className={`zen-drawer is-${half.id}`}
            id={`${drawerId}-${half.id}`}
            data-testid={`zen-drawer-${half.id}`}
            data-half={half.id}
            hidden={!open[half.id]}
            style={{ height: tall, width: widths[half.id] }}
          >
            <div className="zen-drawer-panel">{content[half.id]}</div>
            <div
              className="zen-drawer-edge"
              role="separator"
              aria-orientation="horizontal"
              aria-label={`Height of the ${half.label} panel`}
              aria-valuemin={Math.round(DRAWER_HEIGHT.min * 100)}
              aria-valuemax={Math.round(DRAWER_HEIGHT.max * 100)}
              aria-valuenow={Math.round(height * 100)}
              tabIndex={0}
              data-testid={`zen-drawer-edge-${half.id}`}
              onPointerDown={startResize}
              onKeyDown={onEdgeKey}
            />
          </div>
        ))}
        {(creatorOpen || animationsOpen) && (
          <div
            className="zen-drawer-split"
            role="separator"
            aria-orientation="vertical"
            aria-label="Where the Creator and the Animations panel meet"
            aria-valuemin={Math.round(DRAWER_SPLIT.min * 100)}
            aria-valuemax={Math.round(DRAWER_SPLIT.max * 100)}
            aria-valuenow={Math.round(split * 100)}
            tabIndex={0}
            data-testid="zen-drawer-split"
            style={{ left: wide, height: tall }}
            onPointerDown={startSplit}
            onKeyDown={onSplitKey}
          />
        )}
      </div>
    </div>
  );
}
