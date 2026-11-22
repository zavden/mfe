/* MathJax renders of the projects in the library, for the thumbnails of the Projects dialog.
 * One render per distinct request (latex, packages, preamble, target, font size) is kept for
 * the session: the same formula in several projects, or the dialog opened again, renders once.
 * Each entry's formula is then resolved against its own snapshot, as the Creator does. A font
 * text is drawn from the geometry its file carries: a listed project is not open, so nothing
 * of it is stored, and nobody would own it. One without geometry at hand is drawn as its
 * placeholder boxes, as the open project would draw it (`engine/textBoxes.ts`). */
import { useEffect, useState } from 'react';
import {
  getEngine,
  producerOf,
  renderRequestFor,
  resolveFormula,
  savedBoxesRender,
  textArtifactRender,
  textBoxesKey,
  textSavedBoxesKey,
  textShapedFor,
  type FormulaEngine,
  type FormulaRender,
  type ResolvedFormula,
} from '../../engine';
import {
  isBlank,
  type EmbeddedTextGeometry,
  type Formula,
  type Project,
  type ProjectMeta,
  type TextFormula,
  type TextGeometryArtifact,
  type TextGeometryRef,
} from '../../model';
import { loadTextGeometry, readEmbeddedTextGeometry } from '../../media';

const renders = new Map<string, Promise<FormulaRender | null>>();
/** The geometry of font texts that passed its checks, as a render, by what the text names of it
 * (hash and render identity): the list opened again does not check it again. */
const textRenders = new Map<string, FormulaRender>();

/** Forget the renders kept so far (tests). */
export function clearThumbRenders(): void {
  renders.clear();
  textRenders.clear();
}

/** The geometry of a text of a listed project: the member its file carries, checked as when the
 * file is opened, or else what the browser holds (a package is listed by its manifest, without
 * its payloads; an older file carries none). */
function listedGeometry(
  reference: TextGeometryRef,
  embedded: EmbeddedTextGeometry,
): Promise<TextGeometryArtifact> {
  return Object.hasOwn(embedded, reference.contentHash)
    ? readEmbeddedTextGeometry(embedded[reference.contentHash], reference)
    : loadTextGeometry(reference);
}

/** A font text without geometry at hand, as the open project draws it: boxes where the glyphs
 * of its snapshot were when the snapshot is the one of its shape, else the boxes of its source. */
function textBoxes(
  formula: TextFormula,
  meta: Pick<ProjectMeta, 'preamble' | 'target'>,
): ResolvedFormula | null {
  const request = renderRequestFor(formula, meta, 'auto');
  if (request.kind !== 'text') return null;
  const { snapshot } = formula;
  if (snapshot && formula.geometry?.key === snapshot.key && textShapedFor(formula) !== null) {
    const render = savedBoxesRender(snapshot, request, textSavedBoxesKey(request, snapshot.key));
    return {
      formula,
      render,
      canonToRender: render.glyphs.map((glyph) => glyph.index),
      confidence: 1,
    };
  }
  const boxes = producerOf('text').free(request, textBoxesKey(request));
  return boxes.ok ? resolveFormula(formula, boxes.render) : null;
}

/** The render of `formula` under `meta`, resolved for `formula`: MathJax's, or for a font text
 * its saved geometry, from `embedded` (what the project's file carries) or the browser's
 * storage, and its placeholder boxes without one. Null for an empty formula or one MathJax
 * cannot render. */
export async function thumbRender(
  formula: Formula,
  meta: Pick<ProjectMeta, 'preamble' | 'target'>,
  engine: FormulaEngine = getEngine(),
  embedded: EmbeddedTextGeometry = {},
): Promise<ResolvedFormula | null> {
  if (isBlank(formula)) return null;
  if (formula.kind === 'text') {
    if (!formula.geometry) return textBoxes(formula, meta);
    const { contentHash, key, basisKey } = formula.geometry;
    const named = [contentHash, key, basisKey].join('\n');
    try {
      let render = textRenders.get(named);
      if (!render) {
        render = textArtifactRender(await listedGeometry(formula.geometry, embedded));
        textRenders.set(named, render);
      }
      return resolveFormula(formula, render);
    } catch {
      return textBoxes(formula, meta);
    }
  }
  const request = renderRequestFor(formula, meta, 'mathjax');
  const key = JSON.stringify([engine.version, request]);
  let pending = renders.get(key);
  if (!pending) {
    pending = engine.render(request).then(
      (result) => (result.ok ? result.render : null),
      () => null,
    );
    renders.set(key, pending);
  }
  const render = await pending;
  return render ? resolveFormula(formula, render) : null;
}

/** The thumbnails of the first `count` formulas of `project`: null while a render is on its
 * way, or when a formula cannot be rendered. `embedded`: the geometry its file carries. */
export function useThumbs(
  project: Project,
  count: number,
  embedded?: EmbeddedTextGeometry,
): (ResolvedFormula | null)[] {
  const [thumbs, setThumbs] = useState<(ResolvedFormula | null)[]>([]);
  useEffect(() => {
    let live = true;
    const formulas = project.formulas.slice(0, count);
    void Promise.all(
      formulas.map((formula) => thumbRender(formula, project.meta, undefined, embedded)),
    ).then((resolved) => {
      if (live) setThumbs(resolved);
    });
    return () => {
      live = false;
    };
  }, [project, count, embedded]);
  return thumbs;
}
