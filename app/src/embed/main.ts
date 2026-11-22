/* The entry of `docs/web/assets/player.js` (docs/web/tools/build-player.mjs): sets
 * `window.MFEPlayer` and mounts the page's players when its deferred scripts have run (the site's
 * own script calls `mountAll` too; a figure mounted already is left as it is). */
import { autoMount, MFEPlayer } from './index';

window.MFEPlayer = MFEPlayer;
autoMount(document);
