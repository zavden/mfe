/* UI reporting for the core document/history payload owner, and its place in the page's life. */
import {
  reassertMediaOwnership,
  startMediaOwnership as startOwnership,
} from '../../store/mediaOwnership';
import { notify } from './noticeStore';

export { mediaOwnershipSettled, syncCurrentMediaOwnership } from '../../store/mediaOwnership';

export function startMediaOwnership(): () => void {
  let lastError = '';
  const report = (error: unknown) => {
    const message = String(error);
    if (message === lastError) return;
    lastError = message;
    notify({ kind: 'error', title: 'Project source data is unavailable', message });
  };
  const stop = startOwnership(report);
  // Back from the back/forward cache, or resumed after the browser froze the page: another page
  // may have taken this one for gone meanwhile. (The owner is released when the page leaves for
  // good, by the autosave, after its last write: `autosave.ts`.)
  const back = () => void reassertMediaOwnership().catch(report);
  const onShow = (event: PageTransitionEvent) => {
    if (event.persisted) back();
  };
  window.addEventListener('pageshow', onShow);
  document.addEventListener('resume', back);
  return () => {
    stop();
    window.removeEventListener('pageshow', onShow);
    document.removeEventListener('resume', back);
  };
}
