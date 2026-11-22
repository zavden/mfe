/* Fixed names referenced by the generated module and its construct method. Keep constructors,
 * animation classes, helper globals and Python builtins here when adding an emitter/helper.
 * Both scene and object names use this namespace; generated locals share NameAllocator. */
import type { Easing } from '../../model';

const RATES = {
  linear: true,
  smooth: true,
  rush_into: true,
  rush_from: true,
  slow_into: true,
  double_smooth: true,
  there_and_back: true,
  there_and_back_with_pause: true,
} satisfies Record<Easing, true>;

export const EMITTED_SYMBOLS: ReadonlySet<string> = new Set([
  ...(
    'self np config scipy print len list range reversed zip min max abs int float str dict set ' +
    'tuple isinstance enumerate super ' +
    'VGroup Group VMobject MathTex Tex TexText Text TexTemplate tempconfig Scene Brace Line Rectangle ' +
    'RoundedRectangle SurroundingRectangle Circle Underline Cross DashedLine Arrow DoubleArrow ' +
    'StealthTip ArrowCircleFilledTip DashedVMobject get_norm angle_of_vector ' +
    'integer_interpolate bezier ' +
    'Animation Write Unwrite FadeIn FadeOut GrowFromCenter GrowArrow ShrinkToCenter ' +
    'DrawBorderThenFill ' +
    'Create ShowCreation Uncreate Transform ReplacementTransform TransformFromCopy ' +
    'FadeTransform MoveToTarget Indicate Flash FocusOn ShowPassingFlash ' +
    'rotate_vector interpolate wiggle DEGREES TAU ORIGIN UP DOWN LEFT RIGHT UL UR DL DR WHITE ' +
    '_Part _Tween _pose _mix _circle_around _cross_line _arrow _spline _dashed _Wiggle ' +
    '_TraceArrow _carried ' +
    '_Circumscribe ' +
    '_spline_path _route_paths path_along_arc _glyphs ' +
    '_Unwrite _Uncreate _ShrinkToCenter _mfe_text_contours _mfe_verify_text'
  ).split(' '),
  ...Object.keys(RATES),
]);
