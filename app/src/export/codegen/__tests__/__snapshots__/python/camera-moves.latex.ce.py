# Camera moves — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 960×540, 10 fps:
#     manim -r 960,540 --fps 10 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 10 fps, so the video has
# exactly 120 frames, like the editor's video export.
from manim import *


class Pinned(MovingCameraScene):
    def construct(self):
        self.camera.background_color = "#000000"

        # The camera: the frame the scene is filmed through.
        cam = self.camera.frame
        cam.save_state()
        # target camera: Close up
        close_up = Rectangle(width=8, height=4.5).move_to([1, 0, 0])

        # sum: a^2+b^2=c^2
        sum = MathTex(r"a^2+b^2=c^2")
        sum[0][0].set_color("#FFFF00")
        sum.move_to([-1.5, 1, 0])
        sum.set_z_index(1)

        # box: box
        box = Rectangle(width=2, height=1.2, color="#58C4DD", stroke_width=8)
        box.move_to([3, -1, 0])

        # 0 s – 1 s: sum write, box create
        self.play(Write(sum), Create(box), run_time=1)
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
