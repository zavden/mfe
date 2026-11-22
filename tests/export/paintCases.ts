/* Small exact-shape projects shared by the unit paint witnesses and paintArtifacts.ts.
 * Native artifacts come from current source, independently of running the unit assertions. */
import {
  createAppear,
  createClip,
  createDisappear,
  createEmptyProject,
  createPartTransform,
  createShapeAttach,
  createShapeFormula,
  createTween,
  defaultIntro,
  defaultOutro,
  type Easing,
  type GlyphStyle,
  type Project,
  type Target,
} from "../../app/src/model";

export interface PaintCase {
  name: string;
  project: Project;
  clipId: string;
  samples: number[];
  sceneName: string;
  check: "reset" | "color" | "lines" | "membership" | "width" | "name";
}

export function paintCases(target: Target): PaintCase[] {
  const cases: PaintCase[] = [];
  const make = (name: string, cross = false): PaintCase => {
    const project = createEmptyProject(name);
    project.meta.target = target;
    project.meta.fps = 30;
    const formula = createShapeFormula({
      name: "shape",
      shape: cross ? "cross" : "box",
      width: 2,
      height: 1,
      color: "#FF0000",
    });
    const clip = createClip(formula.id, project.tracks[0]!.id, 0, 4, {
      intro: defaultIntro("none"),
      outro: defaultOutro("none"),
    });
    project.formulas.push(formula);
    project.clips.push(clip);
    const fixture: PaintCase = {
      name,
      project,
      clipId: clip.id,
      samples: [3.5],
      sceneName: "PaintScene",
      check: "reset",
    };
    cases.push(fixture);
    return fixture;
  };
  const slice = (fixture: PaintCase, time: number) => {
    const { project } = fixture;
    const f = createShapeFormula({ name: "other", width: 0.2, height: 0.2 });
    project.formulas.push(f);
    const c = createClip(f.id, project.tracks[1]!.id, time, 5, {
      intro: defaultIntro("none"),
      outro: defaultOutro("none"),
    });
    c.initial.position = [4, 2];
    project.clips.push(c);
  };
  const styles: [string, GlyphStyle][] = [
    ["hollow", { fillOpacity: 0, strokeWidth: 4, strokeOpacity: 1 }],
    ["mixed", { fillOpacity: 0.4, strokeWidth: 4, strokeOpacity: 0.7 }],
    ["filled", { fillOpacity: 0.6, strokeWidth: 0, strokeOpacity: 0 }],
  ];
  for (const [styleName, style] of styles) {
    for (const opacity of [null, 0.5]) {
      const fixture = make(`${styleName}-tween-color-flip-${opacity}`);
      fixture.check = "color";
      Object.assign(fixture.project.formulas[0]!, { style });
      fixture.project.clips[0]!.actions = [
        createTween(
          0.5,
          1,
          {
            flipX: true,
            color: "#00FF00",
            ...(opacity === null ? {} : { opacity }),
          },
          "linear",
        ),
      ];
      fixture.samples = [0.5, 0.75, 1, 1.5, 3.5];
    }
    for (const future of [false, true]) {
      const fixture = make(`${styleName}-${future ? "future" : "reset"}`);
      Object.assign(fixture.project.formulas[0]!, { style });
      fixture.project.clips[0]!.actions = future
        ? [
            createTween(0.5, 0.5, { opacity: 0.5 }, "linear"),
            createAppear(2, "fade_in", [0], {
              duration: 0.5,
              easing: "linear",
            }),
          ]
        : [
            createPartTransform(0.5, [0], {
              duration: 0.5,
              opacity: 0.2,
              easing: "linear",
            }),
            createTween(1.5, 0.5, { opacity: 0.5 }, "linear"),
          ];
      fixture.samples = future ? [2.5, 3.5] : [0.5, 0.75, 1, 1.5, 1.75, 2, 3.5];
    }
    for (const part of [false, true]) {
      for (const rotation of [0, 90]) {
        for (const opacity of [null, 0.5]) {
          const fixture = make(
            `${styleName}-${part ? "part" : "tween"}-color-${rotation}-${opacity}`,
          );
          fixture.check = "color";
          Object.assign(fixture.project.formulas[0]!, { style });
          fixture.project.clips[0]!.actions = [
            part
              ? createPartTransform(0.5, [0], {
                  duration: 1,
                  rotation,
                  color: "#00FF00",
                  opacity,
                  easing: "linear",
                })
              : createTween(
                  0.5,
                  1,
                  {
                    rotation,
                    color: "#00FF00",
                    ...(opacity === null ? {} : { opacity }),
                  },
                  "linear",
                ),
          ];
          fixture.samples = [0.5, 0.75, 1, 1.5, 3.5];
        }
      }
    }
  }
  for (const prior of [0, 1]) {
    for (const rotation of [0, 90]) {
      for (const easing of [
        "linear",
        "there_and_back",
      ] as const satisfies readonly Easing[]) {
        for (const sliced of [false, true]) {
          const fixture = make(
            `cross-lines-${prior}-${rotation}-${easing}-${sliced}`,
            true,
          );
          fixture.check = "lines";
          fixture.project.clips[0]!.actions = [
            createPartTransform(0.5, [prior], {
              duration: 0.5,
              opacity: 0.2,
              easing: "linear",
            }),
            createPartTransform(1.5, [0, 1], {
              duration: 1,
              opacity: 0.6,
              rotation,
              easing,
            }),
          ];
          fixture.samples = [1, 1.5, 1.75, 2, 2.5, 3.5];
          if (sliced) slice(fixture, 2);
        }
      }
    }
  }
  for (const returning of [false, true]) {
    for (const easing of ["linear", "there_and_back"] as const) {
      for (const sliced of [false, true]) {
        const fixture = make(
          `cross-unwrite-${returning}-${easing}-${sliced}`,
          true,
        );
        fixture.check = "membership";
        const clip = fixture.project.clips[0]!;
        clip.end = 5;
        if (returning) {
          clip.actions = [
            createDisappear(1, "unwrite", [0, 1], { duration: 1, easing }),
            createAppear(3, "fade_in", [0, 1], {
              duration: 0.5,
              easing: "linear",
            }),
          ];
          fixture.samples = [0.5, 1.25, 1.75, 2.5, 3.5, 4.5];
        } else {
          clip.end = 3;
          clip.outro = defaultOutro("unwrite");
          clip.outro.easing = easing;
          fixture.samples = [0.5, 2.25, 2.75, 3.5, 4.5];
        }
        // Even the unsliced control needs a later clip to observe post-removal membership.
        slice(fixture, sliced ? (returning ? 1.5 : 2.5) : 4);
      }
    }
  }
  for (const width of [6, 2]) {
    for (const attached of [false, true]) {
      const fixture = make(`cross-width-${width}-${attached}`, true);
      fixture.check = "width";
      const formula = fixture.project.formulas[0]!;
      if (formula.kind !== "shape") throw new Error("shape fixture");
      formula.style.strokeWidth = width;
      if (attached) {
        const targetShape = createShapeFormula({
          name: "anchor",
          width: 2,
          height: 1,
        });
        const c = createClip(
          targetShape.id,
          fixture.project.tracks[1]!.id,
          0,
          4,
          {
            intro: defaultIntro("none"),
            outro: defaultOutro("none"),
          },
        );
        fixture.project.formulas.push(targetShape);
        fixture.project.clips.push(c);
        fixture.project.clips[0]!.attach = createShapeAttach(c.id, "all", 0);
      }
    }
  }
  return cases;
}
