# Intros side by side — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl IntrosSideBySide.py IntrosSideBySide -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 270 frames, like the editor's video export.
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


class _Part(Animation):
    """Plays the stretch [a0, a1] of `anim` (fractions of its run time) inside one
    self.play, so that animations that overlap in time can start and end between plays.
    The animation begins in its part with a0 == 0 and finishes (and leaves or enters the
    scene) in its part with a1 == 1; it keeps its own rate function and lag throughout."""

    def __init__(self, anim, a0, a1):
        self.anim, self.a0, self.a1 = anim, a0, a1
        super().__init__(anim.mobject, rate_func=linear)

    def begin(self):
        if self.a0 == 0:
            self.anim.begin()

    def _setup_scene(self, scene):  # ManimCE: introducers add their mobject here
        if self.a0 == 0:
            self.anim._setup_scene(scene)

    def is_introducer(self):  # ManimCE
        return self.anim.is_introducer()

    def interpolate(self, alpha):
        self.anim.interpolate(self.a0 + (self.a1 - self.a0) * alpha)

    def update_mobjects(self, dt):  # ManimCE
        self.anim.update_mobjects(dt)

    def update_reference_mobjects(self, dt, **kwargs):  # ManimGL
        self.anim.update_reference_mobjects(dt, **kwargs)

    def finish(self):
        if self.a1 == 1:
            self.anim.finish()
        else:
            self.anim.interpolate(self.a1)

    def clean_up_from_scene(self, scene):
        if self.a1 == 1:
            self.anim.clean_up_from_scene(scene)


class IntrosSideBySide(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # label_none: \text{None (appear)}
        label_none = Tex(r"\text{None (appear)}", font_size=41.2453)
        label_none.set_color("#BBBBBB")
        label_none_g = _glyphs(label_none, [
            (-2.7035, 0.0915, 0.699, 0.683), (-2.0785, -0.031, 0.443, 0.458), (-1.5445, -0.0287, 0.517, 0.4427), (-1.0505, -0.0315, 0.387, 0.459),
            (-0.3645, 0, 0.239, 1), (0.0745, -0.0315, 0.459, 0.459), (0.582, -0.1257, 0.502, 0.6367), (1.138, -0.1257, 0.502, 0.6367),
            (1.6445, -0.0315, 0.387, 0.459), (2.1305, -0.0315, 0.459, 0.459), (2.559, -0.0287, 0.344, 0.4427), (2.9335, 0, 0.239, 1),
        ])
        label_none.move_to([-4.75, 0.55, 0])
        label_none.set_z_index(10)

        # label_write: \text{Write}
        label_write = Tex(r"\text{Write}", font_size=41.2453)
        label_write.set_color("#BBBBBB")
        label_write_g = _glyphs(label_write, [
            (-1.0589, 0, 1.4057, 1), (-0.0567, -0.1548, 0.4879, 0.6279), (0.4262, 0.0057, 0.3248, 0.9489), (0.8702, -0.0397, 0.4468, 0.8865),
            (1.4872, -0.1589, 0.5489, 0.6511),
        ])
        label_write.move_to([0, 0.55, 0])
        label_write.set_z_index(8)

        # label_fadein: \text{FadeIn}
        label_fadein = Tex(r"\text{FadeIn}", font_size=41.2453)
        label_fadein.set_color("#BBBBBB")
        label_fadein_g = _glyphs(label_fadein, [
            (-1.7331, -0.0026, 0.829, 0.9636), (-0.8843, -0.1748, 0.6504, 0.6504), (-0.146, 0, 0.71, 1), (0.5527, -0.1748, 0.5484, 0.6504),
            (1.1231, -0.0005, 0.4506, 0.9679), (1.7813, -0.1708, 0.7326, 0.6273),
        ])
        label_fadein.move_to([4.75, 0.55, 0])
        label_fadein.set_z_index(6)

        # label_growfromcenter: \text{GrowFromCenter}
        label_growfromcenter = Tex(r"\text{GrowFromCenter}", font_size=41.2453)
        label_growfromcenter.set_color("#BBBBBB")
        label_growfromcenter_g = _glyphs(label_growfromcenter, [
            (-4.7875, 0, 0.934, 1), (-3.9876, -0.1653, 0.4732, 0.6089), (-3.3693, -0.1685, 0.6094, 0.63), (-2.5289, -0.1809, 0.9422, 0.608),
            (-1.5949, -0.0021, 0.8047, 0.9354), (-0.8693, -0.1653, 0.4732, 0.6089), (-0.251, -0.1685, 0.6094, 0.63), (0.674, -0.1653, 1.0922, 0.6089),
            (1.7359, 0.0007, 0.8391, 0.9986), (2.5371, -0.1692, 0.5323, 0.6314), (3.2331, -0.1653, 0.7111, 0.6089), (3.8494, -0.0536, 0.4333, 0.8597),
            (4.4477, -0.1692, 0.5323, 0.6314), (5.0179, -0.1653, 0.4732, 0.6089),
        ])
        label_growfromcenter.move_to([-4.75, -2.85, 0])
        label_growfromcenter.set_z_index(4)

        # label_drawborderthenfill: \text{DrawBorderThenFill}
        label_drawborderthenfill = Tex(r"\text{DrawBorderThenFill}", font_size=41.2453)
        label_drawborderthenfill.set_color("#BBBBBB")
        label_drawborderthenfill_g = _glyphs(label_drawborderthenfill, [
            (-5.9603, -0.0005, 0.965, 0.9679), (-5.1264, -0.1708, 0.4875, 0.6273), (-4.4695, -0.1748, 0.6504, 0.6504), (-3.6235, -0.1868, 0.9707, 0.6264),
            (-2.6301, -0.0005, 0.8829, 0.9679), (-1.7544, -0.1741, 0.6278, 0.649), (-1.1273, -0.1708, 0.4875, 0.6273), (-0.4407, 0, 0.71, 1),
            (0.2579, -0.1748, 0.5484, 0.6504), (0.8453, -0.1708, 0.4875, 0.6273), (1.6396, -0.0047, 0.9197, 0.9594), (2.5536, 0.0078, 0.7326, 0.9844),
            (3.2537, -0.1748, 0.5484, 0.6504), (3.9707, -0.1708, 0.7326, 0.6273), (4.8068, -0.0026, 0.829, 0.9636), (5.4813, -0.0104, 0.3245, 0.948),
            (5.881, 0.0078, 0.3359, 0.9844), (6.2749, 0.0078, 0.3359, 0.9844),
        ])
        label_drawborderthenfill.move_to([0, -2.85, 0])
        label_drawborderthenfill.set_z_index(2)

        # label_create: \text{Create}
        label_create = Tex(r"\text{Create}", font_size=41.2453)
        label_create.set_color("#BBBBBB")
        label_create_g = _glyphs(label_create, [
            (-1.5124, 0, 0.8402, 1), (-0.7507, -0.1662, 0.4738, 0.6097), (-0.1701, -0.1701, 0.5331, 0.6322), (0.4993, -0.1701, 0.6322, 0.6322),
            (1.0668, -0.0544, 0.4339, 0.8609), (1.666, -0.1701, 0.5331, 0.6322),
        ])
        label_create.move_to([4.75, -2.85, 0])

        # formula_none: a^2 + b^2 = c^2
        formula_none = Tex(r"a^2 + b^2 = c^2", font_size=78.3661)
        formula_none_g = _glyphs(formula_none, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        formula_none.move_to([-4.75, 1.8, 0])
        formula_none.set_z_index(11)

        # formula_write: a^2 + b^2 = c^2
        formula_write = Tex(r"a^2 + b^2 = c^2", font_size=78.3661)
        formula_write_g = _glyphs(formula_write, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        formula_write.move_to([0, 1.8, 0])
        formula_write.set_z_index(9)

        # formula_fade_in: a^2 + b^2 = c^2
        formula_fade_in = Tex(r"a^2 + b^2 = c^2", font_size=78.3661)
        formula_fade_in_g = _glyphs(formula_fade_in, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        formula_fade_in.move_to([4.75, 1.8, 0])
        formula_fade_in.set_z_index(7)

        # formula_grow_from_center: a^2 + b^2 = c^2
        formula_grow_from_center = Tex(r"a^2 + b^2 = c^2", font_size=78.3661)
        formula_grow_from_center_g = _glyphs(formula_grow_from_center, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        formula_grow_from_center.move_to([-4.75, -1.6, 0])
        formula_grow_from_center.set_z_index(5)

        # formula_draw_border_then_fill: a^2 + b^2 = c^2
        formula_draw_border_then_fill = Tex(r"a^2 + b^2 = c^2", font_size=78.3661)
        formula_draw_border_then_fill_g = _glyphs(formula_draw_border_then_fill, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        formula_draw_border_then_fill.move_to([0, -1.6, 0])
        formula_draw_border_then_fill.set_z_index(3)

        # formula_create: a^2 + b^2 = c^2
        formula_create = Tex(r"a^2 + b^2 = c^2", font_size=78.3661)
        formula_create_g = _glyphs(formula_create, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        formula_create.move_to([4.75, -1.6, 0])
        formula_create.set_z_index(1)

        self.add(label_none)
        self.add(label_drawborderthenfill)
        self.add(label_create)
        self.add(label_fadein)
        self.add(label_write)
        self.add(label_growfromcenter)
        # 0 s – 0.5 s
        self.wait(0.5)
        self.add(formula_none)
        formula_draw_border_then_fill_in = DrawBorderThenFill(formula_draw_border_then_fill)
        # 0.5 s – 1.5 s: formula_write write, formula_draw_border_then_fill draw_border_then_fill, formula_fade_in fade_in, formula_grow_from_center grow_from_center, formula_create create
        self.play(
            Write(VGroup(*formula_write_g[:]), stroke_color="#FFFFFF"),
            _Part(formula_draw_border_then_fill_in, 0, 0.5),
            FadeIn(formula_fade_in),
            GrowFromCenter(formula_grow_from_center),
            ShowCreation(VGroup(*formula_create_g[:])),
            run_time=1,
        )
        # 1.5 s – 2.5 s: formula_draw_border_then_fill draw_border_then_fill
        self.play(_Part(formula_draw_border_then_fill_in, 0.5, 1), run_time=1)
        # 2.5 s – 4.5 s
        self.wait(2)
