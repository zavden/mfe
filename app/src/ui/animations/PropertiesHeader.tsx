/* The header of each view of the Animations panel (clip, block, relation, formula): what is shown
 * and where (ContextLine), the formula's tag colour, the title and the view's buttons. */
import type { ReactNode } from 'react';
import type { Context } from './context';
import { ContextLine } from './ContextLine';

/** The dot's colour when the formula is missing. */
export const MISSING_TAG_COLOR = '#888888';

export function PropertiesHeader({
  context,
  color,
  title,
  titleTestId,
  sticky = false,
  children,
}: {
  context: Context;
  /** The formula's tag colour; the missing-formula grey when undefined. */
  color: string | undefined;
  title: ReactNode;
  titleTestId: string;
  /** Stay at the top while the view's sections scroll (clip and block views). */
  sticky?: boolean;
  /** The view's buttons, after the title. */
  children?: ReactNode;
}) {
  return (
    <header className={sticky ? 'an-props-header is-sticky' : 'an-props-header'}>
      <ContextLine context={context} />
      <span className="an-dot" style={{ background: color ?? MISSING_TAG_COLOR }} />
      {/* tabIndex -1: the panel moves the focus here when its view changes under it. */}
      <h2 data-testid={titleTestId} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </header>
  );
}
