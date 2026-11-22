# Formula and glyph colours — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 FormulaAndGlyphColours.py FormulaAndGlyphColours
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 648 frames, like the editor's video export.
from manim import *


def _glyphs(tex, layout):
    """The glyphs of `tex` in the editor's order. That order (MathJax's, or another
    template's) can differ from Manim's, so the glyphs are matched by position: `layout`
    holds each glyph's (x, y, width, height) relative to the formula centre, divided by the
    formula height, and every real glyph is assigned to one entry with the least total
    distance. Entries without a counterpart get an empty VMobject."""
    from scipy.optimize import linear_sum_assignment

    real = tex.family_members_with_points()
    glyphs = [VMobject() for _ in layout]
    if len(real) != len(layout):
        print(f"Warning: Manim made {len(real)} glyphs of a formula the editor split into "
              f"{len(layout)}; unmatched glyphs are not animated.")
    if not real or not layout:
        return glyphs  # nothing to match (a formula without ink, such as \quad)
    centre, height = tex.get_center(), tex.get_height()
    if height < 1e-6:
        height = 1.0  # a flat mobject (a rule): the editor's layout is divided by 1 then too
    have = np.array([
        [*((g.get_center() - centre)[:2] / height), g.get_width() / height, g.get_height() / height]
        for g in real
    ])
    want = np.array(layout, dtype=float)
    cost = np.linalg.norm(want[:, None, :] - have[None, :, :], axis=2)
    for i, j in zip(*linear_sum_assignment(cost)):
        glyphs[i] = real[j]
    return glyphs


class FormulaAndGlyphColours(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # whole: a + b = c
        whole = MathTex(r"a + b = c", font_size=96, color="#58C4DD")
        whole_g = _glyphs(whole, [
            (-2.215, -0.1166, 0.6095, 0.5812), (-1.093, -0.0715, 0.8582, 0.857), (-0.0076, 0.0457, 0.4923, 0.9085), (1.1068, -0.0722, 0.8582, 0.3015),
            (2.2648, -0.1175, 0.5099, 0.5855),
        ])

        # parts: a + b = c
        parts = MathTex(r"a + b = c", font_size=96)
        parts_g = _glyphs(parts, [
            (-2.215, -0.1166, 0.6095, 0.5812), (-1.093, -0.0715, 0.8582, 0.857), (-0.0076, 0.0457, 0.4923, 0.9085), (1.1068, -0.0722, 0.8582, 0.3015),
            (2.2648, -0.1175, 0.5099, 0.5855),
        ])
        parts_g[0].set_color("#FFD166")
        parts_g[2].set_color("#EF476F")
        parts_g[4].set_color("#06D6A0")

        # both: a + b = c
        both = MathTex(r"a + b = c", font_size=96, color="#58C4DD")
        both_g = _glyphs(both, [
            (-2.215, -0.1166, 0.6095, 0.5812), (-1.093, -0.0715, 0.8582, 0.857), (-0.0076, 0.0457, 0.4923, 0.9085), (1.1068, -0.0722, 0.8582, 0.3015),
            (2.2648, -0.1175, 0.5099, 0.5855),
        ])
        both_g[4].set_color("#FFD166")

        # 0 s – 1 s: whole fade_in
        self.play(FadeIn(whole), run_time=1)
        # 1 s – 3 s
        self.wait(2)
        # 3 s – 3.6 s: whole fade_out
        self.play(FadeOut(whole), run_time=0.6)
        # 3.6 s – 4.6 s: parts fade_in
        self.play(FadeIn(parts), run_time=1)
        # 4.6 s – 6.6 s
        self.wait(2)
        # 6.6 s – 7.2 s: parts fade_out
        self.play(FadeOut(parts), run_time=0.6)
        # 7.2 s – 8.2 s: both fade_in
        self.play(FadeIn(both), run_time=1)
        # 8.2 s – 10.2 s
        self.wait(2)
        # 10.2 s – 10.8 s: both fade_out
        self.play(FadeOut(both), run_time=0.6)
