# Labelled braces — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 LabelledBraces.py LabelledBraces
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 660 frames, like the editor's video export.
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


class LabelledBraces(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # series: 1+2+3+4+5+6
        series = MathTex(r"1+2+3+4+5+6", font_size=96)
        series_g = _glyphs(series, [
            (-5.6925, 0.0468, 0.4532, 0.8775), (-4.5644, -0.0619, 0.8775, 0.8762), (-3.4304, 0.0468, 0.5257, 0.8775), (-2.295, -0.0619, 0.8775, 0.8762),
            (-1.161, 0.0316, 0.5468, 0.9051), (-0.0257, -0.0619, 0.8775, 0.8762), (1.1083, 0.054, 0.5837, 0.892), (2.2437, -0.0619, 0.8775, 0.8762),
            (3.3777, 0.0323, 0.5257, 0.9065), (4.513, -0.0619, 0.8775, 0.8762), (5.6459, 0.0323, 0.5463, 0.9065),
        ])
        series.move_to([0, 0.5, 0])

        # b1: brace, built on series where its clip starts

        # f2: 6
        f2 = MathTex(r"6")
        f2_g = _glyphs(f2, [
            (0, 0, 0.6027, 1),
        ])
        f2.set_z_index(6)

        # b2: brace, built on series where its clip starts

        # f3: 15
        f3 = MathTex(r"15")
        f3_g = _glyphs(f3, [
            (-0.3794, 0.016, 0.5, 0.968), (0.3394, 0, 0.5799, 1),
        ])
        f3.set_z_index(4)

        # b3: brace, built on series where its clip starts

        # f4: 21
        f4 = MathTex(r"21")
        f4_g = _glyphs(f4, [
            (-0.3589, 0, 0.5991, 1), (0.4002, 0, 0.5165, 1),
        ])
        f4.set_z_index(2)

        # 0 s – 1.2 s: series write
        self.play(Write(VGroup(*series_g[:])), run_time=1.2)
        # 1.2 s – 2 s
        self.wait(0.8)
        b1 = Brace(VGroup(*series_g[:5]), DOWN, buff=0.2, color="#58C4DD")
        b1.set_z_index(5)
        b1.put_at_tip(f2, buff=0.25)
        # 2 s – 3 s: b1 grow_from_center, f2 fade_in
        self.play(GrowFromCenter(b1), FadeIn(f2), run_time=1)
        # 3 s – 3.4 s
        self.wait(0.4)
        b2 = Brace(VGroup(*series_g[6:]), DOWN, buff=0.2, color="#83C167")
        b2.set_z_index(3)
        b2.put_at_tip(f3, buff=0.25)
        # 3.4 s – 4.4 s: b2 grow_from_center, f3 fade_in
        self.play(GrowFromCenter(b2), FadeIn(f3), run_time=1)
        # 4.4 s – 4.8 s
        self.wait(0.4)
        b3 = Brace(series, UP, buff=0.2, color="#FFFF00")
        b3.set_z_index(1)
        b3.put_at_tip(f4, buff=0.25)
        # 4.8 s – 5.8 s: b3 grow_from_center, f4 fade_in
        self.play(GrowFromCenter(b3), FadeIn(f4), run_time=1)
        # 5.8 s – 10.2 s
        self.wait(4.4)
        # 10.2 s – 11 s: series fade_out
        self.play(FadeOut(series), run_time=0.8)
