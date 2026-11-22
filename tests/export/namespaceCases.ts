import {
  createClip,
  createEmptyProject,
  createShapeFormula,
  defaultIntro,
  defaultOutro,
  type Target,
} from "../../app/src/model";
import type { PaintCase } from "./paintCases";

// Independent enumeration of every constructor, animation, rate function and helper used by
// emitted scenes. It is shared with artifact generation, never derived from EMITTED_SYMBOLS.
export const namespaceSymbols =
  `Circle Brace Line Rectangle RoundedRectangle SurroundingRectangle Underline Cross
DashedLine Arrow DoubleArrow StealthTip ArrowCircleFilledTip DashedVMobject get_norm
angle_of_vector integer_interpolate bezier _arrow _spline _dashed _TraceArrow _carried
TexText Tex MathTex TexTemplate Scene Animation VGroup Group VMobject Write Unwrite FadeIn FadeOut
GrowFromCenter GrowArrow ShrinkToCenter DrawBorderThenFill Create ShowCreation Uncreate Transform
ReplacementTransform TransformFromCopy FadeTransform MoveToTarget Indicate Flash FocusOn
ShowPassingFlash linear smooth rush_into rush_from slow_into double_smooth there_and_back
there_and_back_with_pause rotate_vector interpolate wiggle DEGREES TAU ORIGIN UP DOWN LEFT RIGHT
UL UR DL DR WHITE np config self scipy print len list range reversed zip min max abs int float str dict set
tuple isinstance enumerate super _Part _Tween _pose _mix _circle_around _Wiggle _Circumscribe
_spline_path _glyphs _Unwrite _Uncreate _ShrinkToCenter Text tempconfig _cross_line _route_paths
path_along_arc _mfe_text_contours _mfe_verify_text`.split(/\s+/);

export function namespaceCases(target: Target, role: "object" | "scene") {
  return namespaceSymbols.map(
    (symbol): { symbol: string; fixture: PaintCase } => {
      const project = createEmptyProject("Names");
      project.meta.target = target;
      const formula = createShapeFormula({
        name: role === "object" ? symbol : "shape",
        shape: "circle",
        width: 2,
        height: 2,
      });
      const clip = createClip(formula.id, project.tracks[0]!.id, 0, 1, {
        intro: defaultIntro("none"),
        outro: defaultOutro("none"),
      });
      project.formulas.push(formula);
      project.clips.push(clip);
      return {
        symbol,
        fixture: {
          name: `name-${role}-${symbol}`,
          project,
          clipId: clip.id,
          samples: [0.5],
          sceneName: role === "scene" ? symbol : "Names",
          check: "name",
        },
      };
    },
  );
}
