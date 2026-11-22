/* Configuration of MathLive (the `<math-field>` element).
 *
 * Fonts: `mathlive/fonts.css` carries the @font-face rules and `--ML__static-fonts`, which makes
 * MathLive skip its own JavaScript font loader (that one resolves URLs relative to the script and
 * fetches them, which cannot work from file://). The build rewrites the font URLs relative to the
 * script, so the production build opens from disk. Sounds are disabled (no audio assets).
 *
 * Its own on-screen keyboard is not used: the editor has a keypad of its own (`keypad/`), and the
 * field asks for no keyboard (`LatexInput.tsx`).
 *
 * MathLive is imported statically: the production build is a single script (no code-splitting),
 * where a dynamic import would only add Vite's preload helper. Under Node (unit tests) the
 * package resolves to its server-side build, which has no `MathfieldElement`. */
import 'mathlive/fonts.css';
import * as mathlive from 'mathlive';

export type MathLiveModule = typeof import('mathlive');

let configured = false;

/** The MathLive module, ready to use; rejects where it cannot run (no custom elements). */
export function loadMathLive(): Promise<MathLiveModule> {
  if (typeof mathlive.MathfieldElement !== 'function') {
    return Promise.reject(new Error('MathLive is not available in this environment.'));
  }
  if (!configured) {
    mathlive.MathfieldElement.soundsDirectory = null;
    configured = true;
  }
  return Promise.resolve(mathlive);
}
