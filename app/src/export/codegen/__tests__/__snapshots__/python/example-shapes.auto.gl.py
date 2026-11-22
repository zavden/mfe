# Shapes — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl Pinned.py Pinned -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 540 frames, like the editor's video export.
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


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # sum: 1+2+3+4+5+6
        sum = Tex(r"1+2+3+4+5+6", font_size=60)
        sum_g = _glyphs(sum, [
            (-5.6902, 0.0474, 0.4342, 0.8763), (-4.5629, -0.0618, 0.875, 0.8763), (-3.43, 0.0474, 0.525, 0.8763), (-2.2968, -0.0618, 0.875, 0.8763),
            (-1.164, 0.0329, 0.5461, 0.9053), (-0.0308, -0.0618, 0.875, 0.8763), (1.1021, 0.0546, 0.5829, 0.8908), (2.2353, -0.0618, 0.875, 0.8763),
            (3.3682, 0.0329, 0.525, 0.9053), (4.5014, -0.0618, 0.875, 0.8763), (5.6343, 0.0329, 0.5461, 0.9053),
        ])
        sum.move_to([0, 0.6, 0])

        # frame: box, built on sum where its clip starts

        # under: brace, built on frame where its clip starts

        # 0 s – 1.5 s: sum write
        self.play(Write(VGroup(*sum_g[:]), stroke_color="#FFFFFF"), run_time=1.5)
        # 1.5 s – 2 s
        self.wait(0.5)
        frame = SurroundingRectangle(VGroup(*sum_g[:5]), buff=0.15, color="#FFFF00").round_corners(0.12).set_fill("#FFFF00")
        frame_g = _glyphs(frame, [
            (0, 0, 3.489, 1),
        ])
        frame.set_z_index(1)
        # 2 s – 2.6 s: frame create
        self.play(ShowCreation(VGroup(frame_g[0])), run_time=0.6)
        # 2.6 s – 3.5 s
        self.wait(0.9)
        frame_to = SurroundingRectangle(VGroup(*sum_g[6:]), buff=0.15, color="#83C167", stroke_width=6, fill_opacity=0.25).round_corners(0.12).set_fill("#FFFF00")
        # 3.5 s – 4.5 s: frame tween
        self.play(Transform(frame, frame_to), run_time=1)
        # 4.5 s – 5.5 s
        self.wait(1)
        frame_to_2 = SurroundingRectangle(sum, buff=0.15, color="#FFFFFF").round_corners(0.12).set_fill("#FFFF00")
        # 5.5 s – 6.5 s: frame tween
        self.play(Transform(frame, frame_to_2), run_time=1)
        # 6.5 s – 7 s
        self.wait(0.5)
        under = Brace(frame, DOWN, buff=0.2)
        under.set_color("#58C4DD")
        under.set_z_index(2)
        # 7 s – 7.5 s: under grow_from_center
        self.play(GrowFromCenter(under), run_time=0.5)
        # 7.5 s – 8.2 s
        self.wait(0.7)
        # 8.2 s – 9 s: frame fade_out, sum fade_out, under fade_out
        self.play(FadeOut(frame), FadeOut(sum), FadeOut(under), run_time=0.8)
