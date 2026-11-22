/* Shared preparation for the unit paint witnesses and the independent native artifact writer.
 * Sampling stays explicit at each caller: ordinary unit tests own every configured sample. */
import { refreshLocalRenders } from "../../app/src/engine";
import { generatePython } from "../../app/src/export/codegen";
import { validateProject, type Target } from "../../app/src/model";
import { createEvaluator, settleScene } from "../../app/src/scene";
import type { PaintCase } from "./paintCases";

export function preparePaintCase(fixture: PaintCase, target: Target) {
  const fresh = refreshLocalRenders(fixture.project, new Map());
  const settled = settleScene(
    fresh.project,
    fresh.formulas,
    refreshLocalRenders,
  );
  return {
    ...settled,
    projectIssues: validateProject(settled.project),
    result: generatePython(settled.project, settled.formulas, {
      target,
      sceneName: fixture.sceneName,
      indexing: "auto",
      comments: false,
    }),
  };
}

export function samplePaintCase(
  fixture: PaintCase,
  prepared: ReturnType<typeof preparePaintCase>,
) {
  const evaluator = createEvaluator(prepared.project, prepared.formulas);
  return fixture.samples.map((time) => ({
    time,
    glyphs: evaluator
      .evaluate(time)
      .filter((d) => d.clipId === fixture.clipId)
      .map((d) => ({ glyph: d.glyph, fill: d.fill, stroke: d.stroke })),
  }));
}

export type PaintSamples = ReturnType<typeof samplePaintCase>;
