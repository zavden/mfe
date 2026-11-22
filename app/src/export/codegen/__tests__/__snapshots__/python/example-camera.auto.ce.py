# Camera — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 30 fps:
#     manim -r 1920,1080 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 315 frames, like the editor's video export.
from manim import *


class Pinned(MovingCameraScene):
    def construct(self):
        self.camera.background_color = "#000000"

        # The camera: the frame the scene is filmed through.
        cam = self.camera.frame
        cam.save_state()
        # target camera: Result
        result = Rectangle(width=8, height=4.5).move_to([10, -2, 0])
        # target camera: Wide
        wide = Rectangle(width=22.222222, height=12.5).move_to([3.5, -1.5, 0])

        # theorem: a^2+b^2=c^2
        theorem = MathTex(r"a^2+b^2=c^2", font_size=72)
        theorem.move_to([-2.5, 1, 0])

        # root: c=\sqrt{a^2+b^2}
        root = MathTex(r"c=\sqrt{a^2+b^2}", font_size=72, color="#58C4DD")
        root.move_to([10, -2, 0])
        root.set_z_index(1)

        # 0 s – 1 s: theorem write
        self.play(Write(theorem), run_time=1)
        # 1 s – 1.5 s
        self.wait(0.5)
        # 1.5 s – 2.5 s: camera → (-0.85, 1), 267 %
        self.play(
            cam.animate.replace(Rectangle(width=5.333333, height=3).move_to([-0.85, 1, 0])),
            run_time=1,
        )
        # 2.5 s – 2.8 s
        self.wait(0.3)
        # 2.8 s – 3.6 s: theorem indicate
        self.play(Indicate(theorem[0][6:]), run_time=0.8)
        # 3.6 s – 3.9 s
        self.wait(0.3)
        # 3.9 s – 5.1 s: camera → Result
        self.play(cam.animate.replace(result), run_time=1.2)
        # 5.1 s – 5.4 s
        self.wait(0.3)
        # 5.4 s – 6.4 s: root write
        self.play(Write(root), run_time=1)
        # 6.4 s – 6.9 s
        self.wait(0.5)
        # 6.9 s – 8.1 s: camera → Wide
        self.play(cam.animate.replace(wide), run_time=1.2)
        # 8.1 s – 8.7 s
        self.wait(0.6)
        # 8.7 s – 9.9 s: camera → start
        self.play(Restore(cam), run_time=1.2)
        # 9.9 s – 10.5 s
        self.wait(0.6)
