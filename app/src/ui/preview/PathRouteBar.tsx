/* The bar of the Edit-path mode on a pair with two routes or more (D167), in the preview's
 * top-left corner where the other bars of the preview say what they act on. It starts with
 * «Path per glyph» (D175), the toggle that shows the routes. Off, the bar says that the one curve
 * is the path of all the glyphs — the common path, and how many routes have a path of their own
 * when some have, since they still play it. On, the lock of the other routes follows (D175: they
 * then do not answer the pointer), then what is edited — all the routes, or which one, "Route 2
 * of 3: a → x", named by its glyphs as the pair editors name them —, ‹ and › to step through them
 * (All together, then each route), «All together» to edit the common path again, and «Remove own
 * path» to take the edited route's own path away. A route is chosen on the canvas too, unless the
 * others are locked: a click on its curve or on its glyph (`usePathGestures`). It is one of the
 * modes' own bars (`data-mode-bar`): Enter presses its buttons, which the mode leaves to them
 * (`pressesModeBar`). */
import { useProjectStore } from '../../store';
import { EditedPathDot } from '../relations/EditedPathDot';
import { Icon } from '../timeline/icons';
import { findPair, pairSnapshots, pathLock, usePathEdit, type PairRef } from './pathEdit';
import {
  commonTitle,
  ownRouteCount,
  ownRoutePath,
  ownRoutesText,
  routeChoices,
  routeTitle,
  stepRoute,
} from './pathRoutes';

export function PathRouteBar({ target }: { target: PairRef }) {
  const project = useProjectStore((state) => state.project);
  const route = usePathEdit((state) => state.route);
  const perGlyph = usePathEdit((state) => state.perGlyph);
  const lockOthers = usePathEdit((state) => state.lockOthers);
  const found = findPair(project, target);
  const choices = found ? routeChoices(found.pair, found.holder) : [];
  if (!found || choices.length === 0) return null;
  const store = usePathEdit.getState;
  const toggle = (
    <button
      type="button"
      className={`preview-tool path-edit-action${perGlyph ? ' is-on' : ''}`}
      aria-pressed={perGlyph}
      title={
        perGlyph
          ? 'Back to one path for all the glyphs: the routes keep the paths of their own'
          : 'Show every route of the pair, to give one glyph a path of its own'
      }
      data-testid="path-edit-per-glyph"
      onClick={() => store().setPerGlyph(!perGlyph)}
    >
      Path per glyph
    </button>
  );
  if (!perGlyph) {
    const own = ownRouteCount(found.pair, choices);
    return (
      <div
        className="preview-actions path-edit-routes"
        role="toolbar"
        aria-label="Routes of the pair"
        data-testid="path-edit-routes"
        data-mode-bar=""
      >
        {toggle}
        <span className="preview-tools-sep" aria-hidden="true" />
        <span className="preview-actions-count" data-testid="path-edit-route" aria-live="polite">
          {commonTitle(own)}
        </span>
        {own > 0 && (
          <>
            <EditedPathDot decorative />
            <span className="preview-actions-count" data-testid="path-edit-own-count">
              {ownRoutesText(own)}
            </span>
          </>
        )}
      </div>
    );
  }
  const { from, to } = pairSnapshots(project, target);
  const own = route !== null && ownRoutePath(found.pair, route) !== null;
  const locked = pathLock(project, target) !== null;
  const step = (delta: 1 | -1) => store().chooseRoute(stepRoute(choices, route, delta));
  return (
    <div
      className="preview-actions path-edit-routes"
      role="toolbar"
      aria-label="Routes of the pair"
      data-testid="path-edit-routes"
      data-mode-bar=""
    >
      {toggle}
      <button
        type="button"
        className={`preview-tool${lockOthers ? ' is-on' : ''}`}
        aria-label="Lock the other routes"
        aria-pressed={lockOthers}
        title={
          lockOthers
            ? 'Unlock the other routes: a click on one, or on its glyph, chooses it'
            : 'Lock the other routes: they do not answer the pointer, and ‹ › choose the route'
        }
        data-testid="path-edit-lock-others"
        onClick={() => store().setLockOthers(!lockOthers)}
      >
        <Icon name={lockOthers ? 'lock' : 'unlock'} />
      </button>
      <span className="preview-tools-sep" aria-hidden="true" />
      <button
        type="button"
        className="preview-tool"
        aria-label="Previous route"
        title="Previous route"
        data-testid="path-edit-prev"
        onClick={() => step(-1)}
      >
        ‹
      </button>
      <span className="preview-actions-count" data-testid="path-edit-route" aria-live="polite">
        {routeTitle(choices, route, from, to)}
      </span>
      {own && <EditedPathDot testId="path-edit-route-own" />}
      <button
        type="button"
        className="preview-tool"
        aria-label="Next route"
        title="Next route"
        data-testid="path-edit-next"
        onClick={() => step(1)}
      >
        ›
      </button>
      <span className="preview-tools-sep" aria-hidden="true" />
      <button
        type="button"
        className={`preview-tool path-edit-action${route ? '' : ' is-on'}`}
        aria-pressed={route === null}
        title="Edit the path the routes share: those without a path of their own follow it"
        data-testid="path-edit-all"
        onClick={() => store().chooseRoute(null)}
      >
        All together
      </button>
      {route && (
        <button
          type="button"
          className="preview-tool path-edit-action"
          title={
            locked
              ? 'A track of the pair is locked'
              : own
                ? 'Take this route’s own path away: it follows the common path again'
                : 'This route follows the common path: it has no path of its own'
          }
          disabled={!own || locked}
          data-testid="path-edit-remove-own"
          onClick={() => store().removeRoutePath()}
        >
          Remove own path
        </button>
      )}
    </div>
  );
}
