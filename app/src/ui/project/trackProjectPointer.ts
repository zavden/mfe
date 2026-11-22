/* A project pointer owns its history handle and listener disposal together. Pending presses
 * also expire on document replacement; a late release cannot finish a newer gesture. */
import type { PointerEvent as ReactPointerEvent } from 'react';
import { history, onProjectLoaded, type ProjectGesture } from '../../store';
import { trackPointer } from '../pointer';

export function trackProjectPointer(
  event: ReactPointerEvent,
  handlers: {
    move(event: PointerEvent, begin: () => ProjectGesture): void;
    end?(event: PointerEvent | null, cancelled: boolean): void;
  },
  lifecycleTarget: Element | null = event.currentTarget,
): () => void {
  let owner: ProjectGesture | null = null;
  let finished = false;
  const begin = () => (owner ??= history.beginGesture(() => dispose()));
  const offLoad = onProjectLoaded(() => dispose());
  const dispose = trackPointer(
    event.pointerId,
    {
      move: (e) => {
        if (!finished) handlers.move(e, begin);
      },
      end: (e, cancelled) => {
        if (finished) return;
        finished = true;
        offLoad();
        handlers.end?.(e, cancelled);
        if (cancelled) owner?.cancel();
        else owner?.end();
      },
    },
    { target: lifecycleTarget ?? event.currentTarget },
  );
  return dispose;
}
