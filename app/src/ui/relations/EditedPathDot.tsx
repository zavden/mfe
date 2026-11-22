/* The mark of a pair whose path was edited (D48, `hasEditedPath`): a dot in the colour the path
 * picker draws a path with, beside the pair wherever pairs are listed next to an «Edit path…»
 * entry — the path picker, the menu of a relation's band, the pair menu, the panels of a relation
 * and of a Morph block. It says "Edited path" as its tooltip and to assistive technology, unless
 * words beside it say so already (`decorative`: the count of a relation's row). */
import './relations.css';

export function EditedPathDot({
  testId,
  decorative = false,
}: {
  testId?: string;
  decorative?: boolean;
}) {
  return decorative ? (
    <span className="path-dot" aria-hidden="true" title="Edited path" data-testid={testId} />
  ) : (
    <span
      className="path-dot"
      role="img"
      aria-label="Edited path"
      title="Edited path"
      data-testid={testId}
    />
  );
}
