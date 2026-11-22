import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { foldKey, foldSide, usePanels, type FoldablePanel } from './panelsStore';
import { Icon, type IconName } from './timeline/icons';

interface PanelFrameProps {
  title: string;
  /** The panel's own icon, before its title. */
  icon?: IconName;
  testId: string;
  children: ReactNode;
  bodyClassName?: string;
  /** The panel's own tools, at the far end of its title bar: what acts on the whole panel
   * (the Preview's view toolbar) without taking room from its body. */
  tools?: ReactNode;
  /** Pointer down anywhere in the panel (header included), e.g. to clear the selection when
   * empty space is pressed. */
  onPointerDown?: (event: ReactPointerEvent) => void;
  /** A foldable panel (D62): a button in its header, or a double-click on it, folds it to its
   * title bar and back (`panelsStore.ts`); folded, the body is hidden, not unmounted, so the
   * panel keeps its state. The button shows only while the resizable layout is up. */
  fold?: FoldablePanel;
  /** Something covers the panel (the search of formulas, over the Preview): nothing in it takes
   * the focus or a click meanwhile, and it is not read out. */
  inert?: boolean;
}

/** The way the panel moves when its button is pressed: a chevron pointing there. */
function foldDirection(
  side: 'left' | 'right' | 'bottom' | 'top',
  folded: boolean,
): 'left' | 'right' | 'up' | 'down' {
  if (side === 'top') return folded ? 'down' : 'up';
  if (side === 'bottom') return folded ? 'up' : 'down';
  if (side === 'left') return folded ? 'right' : 'left';
  return folded ? 'left' : 'right';
}

/** Common chrome for the four main panels: a title bar plus a scrollable body. */
export function PanelFrame({
  title,
  icon,
  testId,
  children,
  bodyClassName,
  tools,
  onPointerDown,
  fold,
  inert,
}: PanelFrameProps) {
  const foldable = usePanels((state) => fold !== undefined && state.handles[fold] !== undefined);
  const folded = usePanels((state) => (fold !== undefined ? state.collapsed[fold] : false));
  // In Zen mode the timeline is a column on the left, and the Creator and the Animations panel
  // close towards their tabs (D182).
  const side = usePanels((state) => (fold !== undefined ? foldSide(fold, state.strip) : null));
  // The key that folds it too, for the button's tooltip (D191).
  const key = fold ? foldKey(fold) : undefined;
  const toggle = () => {
    if (fold) usePanels.getState().toggle(fold);
  };
  // A double-click on the header folds too, but not one on its button (two clicks already did).
  const onHeaderDoubleClick = (event: ReactMouseEvent) => {
    if (foldable && !(event.target as HTMLElement).closest('button')) toggle();
  };
  return (
    <section
      className={folded ? 'panel-frame is-folded' : 'panel-frame'}
      data-testid={testId}
      data-side={side ?? undefined}
      data-folded={fold ? folded : undefined}
      aria-label={title}
      inert={inert || undefined}
      onPointerDown={onPointerDown}
    >
      <header className="panel-header" onDoubleClick={fold ? onHeaderDoubleClick : undefined}>
        {icon && (
          <span className="panel-icon">
            <Icon name={icon} />
          </span>
        )}
        <h2 className="panel-title">{title}</h2>
        {tools && !folded && (
          <div className="panel-tools" data-testid={`${testId}-tools`}>
            {tools}
          </div>
        )}
        {fold && foldable && (
          <button
            type="button"
            className="panel-fold"
            data-testid={`panel-fold-${fold}`}
            data-direction={foldDirection(side ?? 'left', folded)}
            aria-label={`${folded ? 'Unfold' : 'Fold'} ${title}`}
            aria-expanded={!folded}
            title={
              folded
                ? `Show the ${title} panel again (${key ? `${key}; ` : ''}also View ▸ Panels)`
                : `Fold the ${title} panel to its title bar (${key ? `${key}; ` : ''}View ▸ Panels brings it back)`
            }
            onClick={toggle}
          >
            <Icon name="down" />
          </button>
        )}
      </header>
      <div className={bodyClassName ? `panel-body ${bodyClassName}` : 'panel-body'} hidden={folded}>
        {children}
      </div>
    </section>
  );
}
