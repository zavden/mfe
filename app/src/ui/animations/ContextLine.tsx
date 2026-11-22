import type { Context } from './context';

/** The first row of a header in the Animations panel: the kind of object (in capitals) and where
 * it is. */
export function ContextLine({ context }: { context: Context }) {
  return (
    <p className="an-context" data-testid="an-context">
      <span className="an-context-kind">{context.kind}</span>
      {context.details.map((detail) => ` · ${detail}`).join('')}
    </p>
  );
}
