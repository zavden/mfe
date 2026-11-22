# Slide pauses camera — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 960×540, 10 fps:
#     manim -r 960,540 --fps 10 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 10 fps, so the video has
# exactly 60 frames, like the editor's video export.
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


class Pinned(MovingCameraScene):
    def construct(self):
        self.camera.background_color = "#000000"

        # The camera: the frame the scene is filmed through.
        cam = self.camera.frame
        cam.save_state()

        # sum: x+y=z
        sum = MathTex(r"x+y=z")
        sum_g = _glyphs(sum, [
            (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
            (1.75, 0, 0.6875, 1),
        ])
        sum.move_to([-1, 0.5, 0])
        sum.set_z_index(1)

        # box: box
        box = Rectangle(width=1.2, height=0.8, color="#58C4DD")
        box.move_to([2, -1, 0])

        # 0 s – 1 s: sum fade_in
        self.play(FadeIn(sum), run_time=1)

        # PAUSE 1 of 6 (1.00 s)

        # 1 s – 1.2 s
        self.wait(0.2)

        # NOTE (1.20 s): Point at x

        # 1.2 s – 1.5 s
        self.wait(0.300001)

        # PAUSE 2 of 6 (1.50 s)

        # 1.5 s – 3 s: camera → (1, 0), 160 %
        self.play(
            cam.animate.replace(Rectangle(width=8.888889, height=5).move_to([1, 0, 0])),
            run_time=1.5,
        )
        self.add(box)

        # PAUSE 3 of 6 (3.00 s): The box is there

        # 3 s – 3.5 s
        self.wait(0.5)

        # NOTE (3.50 s): Zoom on the box later

        # 3.5 s – 4 s
        self.wait(0.5)

        # PAUSE 4 of 6 (4.00 s)

        # 4 s – 5 s: camera → start
        self.play(Restore(cam, rate_func=linear), run_time=1)
        # 5 s – 5.5 s
        self.wait(0.5)

        # PAUSE 5 of 6 (5.50 s)

        # 5.5 s – 6 s
        self.wait(0.5)

        # PAUSE 6 of 6 (6.00 s)
