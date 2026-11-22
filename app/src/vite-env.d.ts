/// <reference types="vite/client" />

/** The third-party components of the build, written by `build/thirdParty.ts` from the lockfile
 * (the same list as `licenses/THIRD-PARTY-NOTICES.txt`), and the words that name the licence of
 * the app itself (`build/projectLicense.ts`). */
declare module 'virtual:third-party' {
  export interface ThirdPartyComponent {
    name: string;
    /** `null` for a part that has no version of its own. */
    version: string | null;
    /** SPDX identifier. */
    license: string;
    /** What it comes inside (a package with its version, Chroma Lab, the app), if anything. */
    within: string | null;
  }
  export const components: readonly ThirdPartyComponent[];
  export interface ProjectLicense {
    /** Its short name: what Help ▸ About shows. */
    name: string;
    /** Its name in a sentence; the words of a link to its text. */
    title: string;
    /** The first paragraph of Help ▸ Third-party licenses, before and after that link. */
    dialog: { before: string; after: string };
  }
  export const projectLicense: ProjectLicense;
}

/** The engine of an exported page, its licences, its stylesheet and its type files, as text:
 * built from `src/deck/` and `src/model/types.ts` by `build/deckRuntime.ts` when this module is
 * asked for (Export ▸ HTML writes them out as `mfe-runtime.js`, `LICENSES.txt`, `player.css`,
 * `types/mfe.d.ts` and `types/scene.d.ts`). */
declare module 'virtual:mfe-deck-runtime' {
  export const runtime: string;
  export const licenses: string;
  export const css: string;
  export const mfeTypes: string;
  export const sceneTypes: string;
}
