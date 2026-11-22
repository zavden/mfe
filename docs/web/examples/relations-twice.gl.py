# Two relations between the same clips — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl TwoRelationsBetweenTheSameClips.py TwoRelationsBetweenTheSameClips -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 480 frames, like the editor's video export.
from manimlib import *


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


class TwoRelationsBetweenTheSameClips(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # source: a+b=c
        source = Tex(r"a+b=c", font_size=123.736)
        source_g = _glyphs(source, [
            (-2.215, -0.1166, 0.6095, 0.5812), (-1.093, -0.0715, 0.8582, 0.857), (-0.0076, 0.0457, 0.4923, 0.9085), (1.1068, -0.0722, 0.8582, 0.3015),
            (2.2648, -0.1175, 0.5099, 0.5855),
        ])
        source_g[0].set_color("#F4C867")
        source_g[2].set_color("#58C4DD")
        source_g[4].set_color("#FC6255")
        source.move_to([0, 1.3, 0])
        source.set_z_index(1)

        # target: c-b=a
        target = Tex(r"c-b=a", font_size=123.736)
        target_g = _glyphs(target, [
            (-2.4736, -0.1784, 0.5602, 0.6432), (-1.3235, -0.1286, 0.8636, 0.0566), (-0.1311, 0.0009, 0.5408, 0.9981), (1.0933, -0.1286, 0.9429, 0.3313),
            (2.4188, -0.1774, 0.6697, 0.6385),
        ])
        target_g[0].set_color("#FC6255")
        target_g[2].set_color("#58C4DD")
        target_g[4].set_color("#F4C867")
        target.move_to([0, -1.3, 0])

        # 0 s – 1 s: source write
        self.play(Write(VGroup(*source_g[:]), stroke_color="#FFFFFF", rate_func=smooth), run_time=1)
        # 1 s – 2 s
        self.wait(1)
        # 2 s – 3.2 s: source → target
        self.play(
            ReplacementTransform(source_g[4], target_g[0]),
            ReplacementTransform(source_g[3], target_g[3]),
            run_time=1.2,
        )
        # 3.2 s – 4.3 s
        self.wait(1.1)
        # 4.3 s – 5.5 s: source → target
        self.play(
            ReplacementTransform(source_g[2], target_g[2]),
            ReplacementTransform(source_g[0], target_g[4]),
            ReplacementTransform(source_g[1], target_g[1]),
            run_time=1.2,
        )
        # 5.5 s – 7.4 s
        self.wait(1.9)
        # 7.4 s – 8 s: target fade_out
        self.play(FadeOut(target), run_time=0.6)
