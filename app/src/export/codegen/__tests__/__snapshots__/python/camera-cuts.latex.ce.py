# Camera cuts — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 10 fps:
#     manim -r 480,270 --fps 10 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 10 fps, so the video has
# exactly 80 frames, like the editor's video export.
from manim import *


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


class Pinned(MovingCameraScene):
    def construct(self):
        self.camera.background_color = "#000000"

        # The camera: the frame the scene is filmed through.
        cam = self.camera.frame
        cam.replace(Rectangle(width=10.666667, height=6).move_to([1, 0.5, 0]))
        cam.save_state()

        # line: y=mx+b
        line = MathTex(r"y=mx+b")
        line.set_z_index(2)

        # square: box
        square = Rectangle(width=1, height=1, color="#FC6255")
        square.move_to([2.5, -1, 0])

        # dot: circle
        dot = Circle(radius=0.4, stroke_color="#83C167")
        dot.move_to([-2.5, 1.5, 0])
        dot.set_z_index(1)

        self.add(line)
        self.add(square)
        # 0 s – 1.4 s
        self.wait(1.400001)
        cam_move = cam.animate.replace(Rectangle(width=16, height=9).move_to([-1, 0, 0])).build()
        # 1.4 s – 2 s: camera → (-1, 0), 89 %
        self.play(_Part(cam_move, 0, 0.3), run_time=0.6)
        self.add(dot)
        # 2 s – 2.6 s: camera → (-1, 0), 89 %
        self.play(_Part(cam_move, 0.3, 0.6), run_time=0.6)
        self.remove(square)
        # 2.6 s – 3.4 s: camera → (-1, 0), 89 %
        self.play(_Part(cam_move, 0.6, 1), run_time=0.8)
        # 3.4 s – 4.5 s
        self.wait(1.1)
        line_focus = FocusOn(line.get_center())
        line_focus.mobject.set_z_index(3)
        # 4.5 s – 5.5 s: line focus on
        self.play(line_focus, run_time=1)
        # 5.5 s – 6 s
        self.wait(0.5)
        # 6 s – 7 s: camera → start
        self.play(Restore(cam), run_time=1)
        # 7 s – 8 s
        self.wait(1)
