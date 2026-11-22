/* The key of the Creator's toolbar that switches its formula list between the two views (R3):
 * rows with their rendering, or blocks in a grid — the editor preference `creatorView`. One key
 * since D179, where there were two: it shows the icon of the view a press switches to, and its
 * name and tooltip say so. Pure: the other view, its icon and the words. */
import type { CreatorView } from '../preferences';
import type { IconName } from '../timeline/icons';

/** What the key shows and says while `view` is shown. */
export interface ViewToggle {
  /** The view a press switches to: the other one. */
  next: CreatorView;
  /** That view's icon. */
  icon: IconName;
  /** The key's accessible name: what a press does. */
  label: string;
  /** Its tooltip: what a press does, and what that view is. */
  title: string;
}

const VIEWS: Record<CreatorView, { icon: IconName; name: string; what: string }> = {
  list: { icon: 'view-list', name: 'list view', what: 'a row per formula, with its rendering' },
  grid: {
    icon: 'view-grid',
    name: 'block view',
    what: 'a square per formula; point at one for its rendering',
  },
};

/** The view that is not `view`. */
export const otherView = (view: CreatorView): CreatorView => (view === 'grid' ? 'list' : 'grid');

export function viewToggle(view: CreatorView): ViewToggle {
  const next = otherView(view);
  const { icon, name, what } = VIEWS[next];
  const label = `Switch to ${name}`;
  return { next, icon, label, title: `${label}: ${what}` };
}
