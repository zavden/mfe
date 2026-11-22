/* What every exported folder carries besides its scene, as the app holds it: the engine, its
 * licences, its stylesheet and its type files, built from the sources into this module's import
 * (`build/deckRuntime.ts`). */
import { css, licenses, mfeTypes, runtime, sceneTypes } from 'virtual:mfe-deck-runtime';
import type { RuntimeAssets } from './packDeck';

export const RUNTIME_ASSETS: RuntimeAssets = { runtime, licenses, css, mfeTypes, sceneTypes };
