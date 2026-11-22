# Starts empty — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 StartsEmpty.py StartsEmpty
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 750 frames, like the editor's video export.
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


class StartsEmpty(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # source: a=b
        source = MathTex(r"a=b", font_size=144)
        source_g = _glyphs(source, [
            (-1.2614, -0.1787, 0.6709, 0.6397), (0.0525, -0.1298, 0.9447, 0.3319), (1.326, 0, 0.5418, 1),
        ])
        source_g[0].set_color("#F4C867")
        source_g[2].set_color("#58C4DD")
        source.set_z_index(1)

        # target: a^2=b^2
        target = MathTex(r"a^2=b^2", font_size=144)
        target_g = _glyphs(target, [
            (-1.4374, -0.2469, 0.5286, 0.504), (-0.9134, 0.2369, 0.3152, 0.5262), (0.0855, -0.2083, 0.7442, 0.2615), (1.0888, -0.1061, 0.4269, 0.7878),
            (1.5441, 0.2369, 0.3152, 0.5262),
        ])
        target_g[0].set_color("#F4C867")
        target_g[3].set_color("#58C4DD")

        # source: a=b
        source_2 = MathTex(r"a=b", font_size=144)
        source_2_g = _glyphs(source_2, [
            (-1.2614, -0.1787, 0.6709, 0.6397), (0.0525, -0.1298, 0.9447, 0.3319), (1.326, 0, 0.5418, 1),
        ])
        source_2_g[0].set_color("#F4C867")
        source_2_g[2].set_color("#58C4DD")
        source_2.set_z_index(1)

        # target: a^2=b^2
        target_2 = MathTex(r"a^2=b^2", font_size=144)
        target_2_g = _glyphs(target_2, [
            (-1.4374, -0.2469, 0.5286, 0.504), (-0.9134, 0.2369, 0.3152, 0.5262), (0.0855, -0.2083, 0.7442, 0.2615), (1.0888, -0.1061, 0.4269, 0.7878),
            (1.5441, 0.2369, 0.3152, 0.5262),
        ])
        target_2_g[0].set_color("#F4C867")
        target_2_g[3].set_color("#58C4DD")

        # 0 s – 1 s: source write
        self.play(Write(VGroup(*source_g[:]), rate_func=smooth), run_time=1)
        # 1 s – 1.5 s
        self.wait(0.5)
        self.add(target_g[1], target_g[4])
        # 1.5 s – 3 s: source → target
        self.play(
            ReplacementTransform(source_g[0], target_g[0]),
            ReplacementTransform(source_g[1], target_g[2]),
            ReplacementTransform(source_g[2], target_g[3]),
            run_time=1.5,
        )
        # 3 s – 4.4 s
        self.wait(1.4)
        # 4.4 s – 5 s: target fade_out
        self.play(FadeOut(target), run_time=0.6)
        # 5 s – 6 s
        self.wait(1)
        # 6 s – 7 s: source_2 write
        self.play(Write(VGroup(*source_2_g[:]), rate_func=smooth), run_time=1)
        # 7 s – 7.5 s
        self.wait(0.5)
        # 7.5 s – 9 s: source_2 → target_2
        self.play(
            ReplacementTransform(source_2_g[0], target_2_g[0]),
            ReplacementTransform(source_2_g[1], target_2_g[2]),
            ReplacementTransform(source_2_g[2], target_2_g[3]),
            run_time=1.5,
        )
        # 9 s – 9.5 s
        self.wait(0.5)
        # 9.5 s – 10.5 s: target_2 write
        self.play(Write(VGroup(target_2_g[1], target_2_g[4])), run_time=1)
        # 10.5 s – 11.9 s
        self.wait(1.4)
        # 11.9 s – 12.5 s: target_2 fade_out
        self.play(FadeOut(target_2), run_time=0.6)
