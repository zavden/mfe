import { useEffect, useState } from 'react';
import { renderThumb, type ThumbArt, type ThumbSource } from './thumbs';

/** How long a formula being typed rests before it is drawn again, ms. */
export const LIVE_THUMB_DELAY = 150;

export interface LiveThumb {
  /** The last rendering made; undefined before the first. */
  art: ThumbArt | undefined;
  /** `art` is of what the formula was: the one of what it is now is on its way. */
  stale: boolean;
}

/** The rendering of a formula that changes as its LaTeX is typed: made again once the LaTeX has
 * rested for `delay` ms, with what was drawn before kept until then. */
export function useLiveThumb(source: ThumbSource, delay = LIVE_THUMB_DELAY): LiveThumb {
  const key = JSON.stringify([source.latex, source.packages]);
  const [made, setMade] = useState<{ key: string; art: ThumbArt } | undefined>(undefined);

  useEffect(() => {
    let current = true;
    const [latex, packages] = JSON.parse(key) as [string, string[]];
    const timer = setTimeout(() => {
      void renderThumb({ latex, packages }).then((art) => {
        if (current) setMade({ key, art });
      });
    }, delay);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [key, delay]);

  return { art: made?.art, stale: made?.key !== key };
}
