# Camera moves — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 960×540, 10 fps:
#     manimgl Pinned.py Pinned -w -r 960x540 --fps 10
# Every play and wait lasts a whole number of frames at 10 fps, so the video has
# exactly 120 frames, like the editor's video export.
from manimlib import *


# Strokes thicken when the camera zooms in, as in ManimCE (ManimGL 1.7.2 or later).
_VMobject_init = VMobject.__init__


def _VMobject_init_scaled(self, *args, **kwargs):
    _VMobject_init(self, *args, **kwargs)
    self.set_scale_stroke_with_zoom(True, recurse=False)


VMobject.__init__ = _VMobject_init_scaled


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

        # The camera: the frame the scene is filmed through.
        cam = self.camera.frame
        cam.save_state()
        # target camera: Close up
        close_up = Rectangle(width=8, height=4.5).move_to([1, 0, 0])

        # sum: a^2+b^2=c^2
        sum = Tex(r"a^2+b^2=c^2")
        sum_g = _glyphs(sum, [
            (-3.0625, 0, 0.6875, 1), (-2.1875, 0, 0.6875, 1), (-1.3125, 0, 0.6875, 1), (-0.4375, 0, 0.6875, 1),
            (0.4375, 0, 0.6875, 1), (1.3125, 0, 0.6875, 1), (2.1875, 0, 0.6875, 1), (3.0625, 0, 0.6875, 1),
        ])
        sum_g[0].set_color("#FFFF00")
        sum.move_to([-1.5, 1, 0])
        sum.set_z_index(1)

        # box: box
        box = Rectangle(width=2, height=1.2, color="#58C4DD", stroke_width=8)
        box.move_to([3, -1, 0])

        # 0 s – 1 s: sum write, box create
        self.play(Write(VGroup(*sum_g[:]), stroke_color="#FFFFFF"), ShowCreation(box), run_time=1)
        # 1 s – 1.5 s
        self.wait(0.5)
        # 1.5 s – 3 s: camera → Close up
        self.play(cam.animate.replace(close_up), run_time=1.5)
        # 3 s – 3.5 s
        self.wait(0.5)
        # 3.5 s – 4.5 s: camera → (-1, 0.5), 67 %
        self.play(
            cam.animate(rate_func=linear).replace(Rectangle(width=21.333333, height=12).move_to([-1, 0.5, 0])),
            run_time=1,
        )
        # 4.5 s – 5.5 s
        self.wait(1)
        # 5.5 s – 6.5 s: sum tween
        self.play(sum.animate.scale(1.3).move_to([-1, 0.5, 0]), run_time=1)
        # 6.5 s – 7 s
        self.wait(0.5)
        # 7 s – 8.2 s: camera → Close up
        self.play(cam.animate(rate_func=there_and_back).replace(close_up), run_time=1.2)
        # 8.2 s – 9 s
        self.wait(0.8)
        # 9 s – 10 s: camera → start
        self.play(Restore(cam, rate_func=rush_from), run_time=1)
        # 10 s – 11 s
        self.wait(1)
        # 11 s – 12 s: sum fade_out
        self.play(FadeOut(sum), run_time=1)
