# A shape that is repainted — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 AShapeThatIsRepainted.py AShapeThatIsRepainted
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 600 frames, like the editor's video export.
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


class AShapeThatIsRepainted(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # formula: E = mc^2
        formula = MathTex(r"E = mc^2", font_size=96)
        formula_g = _glyphs(formula, [
            (-1.671, -0.1069, 0.8179, 0.7588), (-0.518, -0.2073, 0.7431, 0.2611), (0.7159, -0.2454, 0.9328, 0.5062), (1.4644, -0.2465, 0.4415, 0.507),
            (1.9225, 0.2373, 0.3148, 0.5254),
        ])
        formula.move_to([0, 0.2, 0])

        # box: box, built on formula where its clip starts

        # 0 s – 1.2 s: formula write
        self.play(Write(VGroup(*formula_g[:])), run_time=1.2)
        # 1.2 s – 1.6 s
        self.wait(0.4)
        box = SurroundingRectangle(VGroup(*formula_g[2:]), buff=0.15, color="#FFFF00", corner_radius=0.12).set_fill("#FFFF00")
        box.set_z_index(1)
        # 1.6 s – 2.4 s: box create
        self.play(Create(box), run_time=0.8)
        # 2.4 s – 3 s
        self.wait(0.6)
        # 3 s – 4.2 s: box tween
        self.play(box.animate.set_fill(opacity=0.35).set_stroke(width=8), run_time=1.2)
        # 4.2 s – 5.2 s
        self.wait(1)
        # 5.2 s – 6.4 s: box tween
        self.play(box.animate.set_fill(color="#FC6255"), run_time=1.2)
        # 6.4 s – 7.4 s
        self.wait(1)
        # 7.4 s – 8.6 s: box tween
        self.play(
            box.animate.set_fill(opacity=0).set_stroke(color="#83C167", width=4),
            run_time=1.2,
        )
        # 8.6 s – 9.2 s
        self.wait(0.6)
        # 9.2 s – 10 s: box fade_out, formula fade_out
        self.play(FadeOut(box), FadeOut(formula), run_time=0.8)
