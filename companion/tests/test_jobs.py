"""Companion 1.1 jobs: POST /video (ffmpeg) and POST /manim-render, their validation, limits,
lifecycle, cancellation and clean-up."""
import ast
import gc
import http.client
import inspect
import io
import json
import os
import re
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock
import zlib

import test_http
from support import (COMPANION_DIR, make_companion, mfe_companion, posix_only, python_program, temporary_file,
                     venv_python)

m = mfe_companion
HAVE_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))
requires_ffmpeg = unittest.skipUnless(HAVE_FFMPEG, "ffmpeg and ffprobe are required")


def png(width: int, height: int, rgb=(40, 90, 200)) -> bytes:
    """A valid solid-colour PNG (the real thing: ffmpeg decodes it)."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return m._PNG_SIGNATURE + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def large_png(width: int, height: int, size: int) -> bytes:
    """A file with the layout of a PNG of ``width`` x ``height`` and about ``size`` bytes: zeros
    where its compressed pixels would be. The companion reads the layout of what it is sent, not
    the pixels; no decoder would take it."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return m._PNG_SIGNATURE + chunk(b"IHDR", ihdr) + chunk(b"IDAT", bytes(size)) + chunk(b"IEND", b"")


def probe(path: str) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-count_packets", "-show_entries",
         "stream=codec_name,width,height,nb_read_packets:format=duration", "-of", "json", path],
        capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    return {"duration": float(data["format"]["duration"]), **data["streams"][0]}


class PngStreamTests(unittest.TestCase):
    def test_counts_concatenated_files_fed_in_any_slicing(self):
        data = png(8, 6) + png(8, 6, (1, 2, 3)) + png(8, 6)
        for step in (1, 3, 7, 64, len(data)):
            stream = m.PngStream(8, 6)
            for i in range(0, len(data), step):
                stream.feed(data[i:i + step])
            self.assertEqual(stream.frames, 3, step)
            self.assertTrue(stream.at_boundary)

    def test_partial_file_is_not_a_boundary(self):
        stream = m.PngStream(8, 6)
        stream.feed(png(8, 6)[:-3])
        self.assertFalse(stream.at_boundary)
        self.assertEqual(stream.frames, 0)

    def test_rejects_garbage_wrong_size_and_oversize(self):
        with self.assertRaises(m.PngStreamError):
            m.PngStream(8, 6).feed(b"GIF89a" + b"\0" * 32)
        with self.assertRaises(m.PngStreamError):
            m.PngStream(8, 6).feed(png(9, 6))
        with self.assertRaises(m.PngStreamError):
            m.PngStream(8, 6, max_frame_bytes=40).feed(png(8, 6))
        # not starting with IHDR
        bad = m._PNG_SIGNATURE + struct.pack(">I", 0) + b"IEND" + b"\0\0\0\0"
        with self.assertRaises(m.PngStreamError):
            m.PngStream(8, 6).feed(bad)


class Validation(unittest.TestCase):
    ok = {"format": "mp4", "quality": "high", "width": 640, "height": 360, "fps": 30, "frames": 90}

    def check(self, **changes):
        return m.validate_video_request({**self.ok, **changes})

    def test_accepts_valid_requests(self):
        spec = self.check()
        self.assertEqual(spec, m.VideoSpec("mp4", "high", 640, 360, 30, 90))
        self.assertEqual(self.check(quality=None) if False else self.check().quality, "high")
        self.assertEqual(m.validate_video_request({**self.ok, "format": "gif", "width": 101, "fps": 25}).width, 101)
        # just inside the GIF memory cap: 1920 x 1080 x 3 x 320 frames
        gif = m.validate_video_request({**self.ok, "format": "gif", "width": 1920, "height": 1080, "fps": 25,
                                        "frames": 320})
        self.assertEqual(gif.frames, 320)

    def test_rejects_invalid_fields(self):
        bad = [
            {"format": "avi"}, {"format": None}, {"quality": "ultra"}, {"width": 0}, {"width": 15},
            {"width": 8193}, {"width": 641}, {"height": 361}, {"width": "640"}, {"width": 640.5},
            {"width": True}, {"fps": 0}, {"fps": 241}, {"fps": 29.97}, {"frames": 0},
            {"frames": m.MAX_VIDEO_FRAMES + 1}, {"frames": None}, {"width": 8192, "height": 8192},
            {"format": "gif", "fps": 60},
            {"format": "gif", "width": 1922, "height": 100},  # wider than a GIF may be
            {"format": "gif", "width": 1920, "height": 1080, "frames": 400},  # 2.3 GiB of raw frames
        ]
        for changes in bad:
            with self.assertRaises(m.JobError, msg=str(changes)) as ctx:
                self.check(**changes)
            self.assertEqual(ctx.exception.status, 400)
        with self.assertRaises(m.JobError):
            m.validate_video_request([])

    def test_manim_requests(self):
        ok = {"target": "ce", "code": "from manim import *", "scene": "Demo"}
        spec = m.validate_manim_request(ok)
        self.assertEqual((spec.quality, spec.width, spec.frames), ("low", None, None))
        spec = m.validate_manim_request({**ok, "width": 320, "height": 180, "fps": 10, "frames": 5})
        self.assertEqual((spec.width, spec.height, spec.fps, spec.frames), (320, 180, 10, 5))
        for changes in ({"target": "x"}, {"code": ""}, {"code": 3}, {"code": "a\0b"}, {"scene": "a b"},
                        {"scene": "1A"}, {"scene": "A;rm"}, {"scene": "../x"}, {"quality": "ultra"},
                        {"width": 320}, {"width": 320, "height": 180}, {"fps": 10},
                        {"width": 320, "height": 180, "fps": 0}, {"frames": 0}):
            with self.assertRaises(m.JobError, msg=str(changes)):
                m.validate_manim_request({**ok, **changes})
        with self.assertRaises(m.JobError) as ctx:
            m.validate_manim_request({**ok, "code": "x" * (m.MAX_CODE_BYTES + 1)})
        self.assertEqual(ctx.exception.status, 413)


class CommandLines(unittest.TestCase):
    def test_ffmpeg_arguments_come_from_the_spec_only(self):
        for fmt in m.VIDEO_FORMATS:
            spec = m.VideoSpec(fmt, "medium", 640, 360, 24, 48)
            cmd = m.build_ffmpeg_command("/usr/bin/ffmpeg", spec, "/work/out." + fmt)
            self.assertEqual(cmd[0], "/usr/bin/ffmpeg")
            self.assertEqual(cmd[-1], "/work/out." + fmt)
            self.assertIn("pipe:0", cmd)
            self.assertEqual(cmd[cmd.index("-frames:v") + 1], "48")
            self.assertEqual(cmd[cmd.index("-framerate") + 1], "24")
        self.assertIn("libx264", m.build_ffmpeg_command("f", m.VideoSpec("mp4", "low", 64, 64, 1, 1), "o"))
        self.assertIn("libvpx-vp9", m.build_ffmpeg_command("f", m.VideoSpec("webm", "low", 64, 64, 1, 1), "o"))
        self.assertIn("prores_ks", m.build_ffmpeg_command("f", m.VideoSpec("mov", "low", 64, 64, 1, 1), "o"))

    def test_ffmpeg_is_told_to_stop_past_the_limit_never_at_it(self):
        # ffmpeg's own stop ends it as if all were well, with a file cut short: it is set past the
        # limit, where the companion has already failed the job, and what it leaves there is over
        # the limit and fails for it.
        spec = m.VideoSpec("mp4", "low", 64, 64, 1, 1)
        for limit in (m.MAX_OUTPUT_BYTES, 8 * m.GIB, 2_000):
            cmd = m.build_ffmpeg_command("f", spec, "o", limit)
            self.assertEqual(cmd[-3:], ["-fs", str(limit + m.OUTPUT_STOP_MARGIN_BYTES), "o"])
        self.assertEqual(m.build_ffmpeg_command("f", spec, "o")[-2],
                         str(4 * 1024 ** 3 + m.OUTPUT_STOP_MARGIN_BYTES))

    def test_messages_say_sizes_as_people_read_them(self):
        self.assertEqual([m._size_text(n) for n in (2_000, 128 * 1024 ** 2, 4 * m.GIB, 6 * m.GIB + m.GIB // 2)],
                         ["2000 bytes", "128 MiB", "4 GiB", "6.5 GiB"])
        self.assertEqual(
            m.video_too_large(4 * m.GIB),
            "The video is larger than 4 GiB, the most this companion writes for one video, so it was stopped. "
            "Export a shorter range, a smaller size or a lower quality, or start the companion with a higher "
            "limit: serve --max-video-gib N (up to 64).")
        # at the highest limit there is none higher to offer
        self.assertNotIn("--max-video-gib", m.video_too_large(m.MAX_VIDEO_GIB * m.GIB))
        self.assertEqual(
            m.disk_nearly_full("/tmp", m.MIN_FREE_BYTES),
            "The disk of the companion's temporary folder (/tmp) is nearly full: less than 1 GiB is free there, "
            "so the job was stopped. Free some room, or start the companion with the environment variable "
            "TMPDIR naming a folder on a disk with more room.")

    def test_a_message_names_a_folder_of_windows_by_its_long_name(self):
        # What Windows gives as TEMP to a user whose name has a space in it.
        short, long = "C:\\Users\\LONGNA~1\\AppData\\Local\\Temp", "C:\\Users\\Long Name\\AppData\\Local\\Temp"
        asked = []

        def long_name(folder):
            asked.append(folder)
            return long

        def gone(folder):
            raise OSError("no such folder")

        self.assertEqual(m.folder_as_said(short, windows=True, long_name=long_name), long)
        # a folder with no short name in it is said as it was given, and so is any folder elsewhere
        self.assertEqual(m.folder_as_said("D:\\tmp", windows=True, long_name=long_name), "D:\\tmp")
        self.assertEqual(m.folder_as_said("/home/a~b/tmp", windows=False, long_name=long_name), "/home/a~b/tmp")
        self.assertEqual(asked, [short])
        # a name that cannot be asked stays as it is
        self.assertEqual(m.folder_as_said(short, windows=True, long_name=gone), short)

    def test_manim_commands(self):
        ce = m.build_manim_command("/py", m.ManimSpec("ce", "", "Demo", "medium", None, None, None, None))
        self.assertEqual(ce[:4], ["/py", "-m", "manim", "render"])
        self.assertIn("-qm", ce)
        self.assertEqual(ce[-2:], ["scene.py", "Demo"])
        # ManimCE would ask PyPI for its newest release once the video is written, and the job
        # would wait for the answer: where no sandbox keeps the network away, --silent does.
        self.assertIn("--silent", ce)
        ce = m.build_manim_command("/py", m.ManimSpec("ce", "", "Demo", "low", 1280, 720, 30, None))
        self.assertEqual(ce[ce.index("-r") + 1], "1280,720")
        self.assertNotIn("-ql", ce)
        gl = m.build_manim_command("/py", m.ManimSpec("gl", "", "Demo", "high", None, None, None, None))
        self.assertEqual(gl[:5], ["/py", "-m", "manimlib", "scene.py", "Demo"])
        self.assertIn("--hd", gl)
        gl = m.build_manim_command("/py", m.ManimSpec("gl", "", "Demo", "low", 1280, 720, 30, None))
        self.assertEqual(gl[gl.index("-r") + 1], "1280x720")
        self.assertEqual(gl[gl.index("--fps") + 1], "30")

    def test_progress_lines(self):
        parse = m.parse_manim_progress
        self.assertEqual(parse("Animation 3: Write(MathTex('x')):  40%|████      | 12/30 [00:00<00:01, 25.3it/s]"), (3, 12))
        self.assertEqual(parse("Waiting 4: 100%|██████████| 15/15 [00:00<00:00, 90.1it/s]"), (4, 15))
        self.assertEqual(parse("result.mp4 2 WriteTex                     : : 12it [00:00, 25.3it/s]"), (2, 12))
        self.assertIsNone(parse("result.mp4                                : : 0it [00:00, ?it/s]"))
        self.assertIsNone(parse("NameError: name 'x' is not defined"))


class ChildEnvironment(unittest.TestCase):
    """What the programs of a job are given of the companion's own environment."""

    def test_keeps_where_the_programs_are_and_none_of_the_users_variables(self):
        env = m._clean_env("/job", {"TMPDIR": "/job/tmp"}, windows=False,
                           environ={"PATH": "/usr/bin", "LANG": "es_MX.UTF-8", "HOME": "/home/ana",
                                    "GITHUB_TOKEN": "secret"})
        self.assertEqual(env, {"HOME": "/job", "PATH": "/usr/bin", "LANG": "es_MX.UTF-8",
                               "TMPDIR": "/job/tmp", "PYTHONUTF8": "1"})

    def test_on_windows_the_home_is_the_jobs_folder_under_the_names_windows_reads(self):
        home = "C:\\Users\\ana\\AppData\\Local\\Temp\\mfe-jobs-x\\1"
        real = {"PATH": "C:\\Windows\\system32", "SYSTEMROOT": "C:\\Windows", "WINDIR": "C:\\Windows",
                "COMSPEC": "C:\\Windows\\system32\\cmd.exe", "PATHEXT": ".COM;.EXE",
                "USERPROFILE": "C:\\Users\\ana", "HOMEDRIVE": "C:", "HOMEPATH": "\\Users\\ana",
                "APPDATA": "C:\\Users\\ana\\AppData\\Roaming",
                "LOCALAPPDATA": "C:\\Users\\ana\\AppData\\Local", "PROGRAMDATA": "C:\\ProgramData",
                "TEMP": "C:\\Users\\ana\\AppData\\Local\\Temp", "GITHUB_TOKEN": "secret"}
        env = m._clean_env(home, {"TMPDIR": home + "\\tmp"}, windows=True, environ=real)
        # The profile is the job's folder, as HOME is on the other systems: Python takes "~" from
        # USERPROFILE there, and older programs from the drive and the path.
        self.assertEqual(env["HOME"], home)
        self.assertEqual(env["USERPROFILE"], home)
        self.assertEqual((env["HOMEDRIVE"], env["HOMEPATH"]),
                         ("C:", "\\Users\\ana\\AppData\\Local\\Temp\\mfe-jobs-x\\1"))
        # A program that is not Python asks Windows for the temporary folder, which reads TMP and
        # TEMP: the job's own, not the user's.
        self.assertEqual((env["TMPDIR"], env["TEMP"], env["TMP"]), (home + "\\tmp",) * 3)
        # What Windows, its programs and a TeX distribution need to start at all.
        for name in ("PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA",
                     "PROGRAMDATA"):
            self.assertEqual(env[name], real[name], name)
        self.assertNotIn("GITHUB_TOKEN", env)
        self.assertEqual(env["PYTHONUTF8"], "1")

    def test_on_windows_a_job_without_a_temporary_folder_writes_in_its_own(self):
        env = m._clean_env("D:\\jobs\\7", windows=True,
                           environ={"TEMP": "C:\\Users\\ana\\AppData\\Local\\Temp"})
        self.assertEqual((env["TEMP"], env["TMP"]), ("D:\\jobs\\7", "D:\\jobs\\7"))
        self.assertEqual((env["HOMEDRIVE"], env["HOMEPATH"]), ("D:", "\\jobs\\7"))

    def test_python_finds_its_home_on_windows(self):
        """ManimCE asks for the home folder as soon as it is imported (``Path.home()``), and on
        Windows Python takes it from USERPROFILE, not from HOME: without it, no render started."""
        import ntpath
        home = "C:\\Temp\\mfe-jobs-x\\1"
        env = m._clean_env(home, windows=True,
                           environ={"PATH": "C:\\Windows\\system32", "SYSTEMROOT": "C:\\Windows"})
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertEqual(ntpath.expanduser("~"), home)
            self.assertEqual(ntpath.expanduser("~\\AppData\\Roaming\\Manim\\manim.cfg"),
                             home + "\\AppData\\Roaming\\Manim\\manim.cfg")


class ProcessTrees(unittest.TestCase):
    """A child is ended with everything it started, on any system."""

    class Child:
        pid = 4242

        def __init__(self):
            self.killed = 0

        def kill(self):
            self.killed += 1

    def test_a_child_starts_in_a_group_of_its_own(self):
        self.assertEqual(m._own_group(windows=False), {"start_new_session": True})
        # Windows: a process group of its own, so that the Ctrl+C of the companion's console does
        # not reach the child before the companion has ended it itself.
        self.assertEqual(m._own_group(windows=True), {"creationflags": 0x00000200})

    def test_on_windows_the_whole_tree_is_ended(self):
        child, calls = self.Child(), []
        m._kill_tree_windows(child, run=lambda cmd, **options: calls.append((cmd, options)),
                             environ={"SYSTEMROOT": "C:\\Windows"})
        (cmd, options), = calls
        self.assertEqual(cmd, ["C:\\Windows\\System32\\taskkill.exe", "/F", "/T", "/PID", "4242"])
        self.assertEqual(options["stdin"], subprocess.DEVNULL)
        self.assertGreater(options["timeout"], 0)
        # The child itself is ended whatever taskkill did.
        self.assertEqual(child.killed, 1)

    def test_on_windows_a_taskkill_that_fails_still_ends_the_child(self):
        for failure in (FileNotFoundError("taskkill"), subprocess.TimeoutExpired("taskkill", 10)):
            child = self.Child()

            def run(cmd, failure=failure, **options):
                raise failure

            m._kill_tree_windows(child, run=run, environ={})
            self.assertEqual(child.killed, 1)

    def test_kill_takes_the_way_of_the_system(self):
        child = self.Child()
        with mock.patch.object(m.os, "name", "nt"), mock.patch.object(m, "_kill_tree_windows") as tree:
            m._kill(child)
        tree.assert_called_once_with(child)
        if os.name == "posix":  # Windows has neither os.killpg nor SIGKILL to stand in for
            with mock.patch.object(m.os, "killpg") as killpg:
                m._kill(child)
            killpg.assert_called_once_with(4242, m.signal.SIGKILL)

    def test_every_child_is_started_in_its_own_group(self):
        with open(m.__file__, encoding="utf-8") as fh:
            source = fh.read()
        # Nothing starts a process but `_spawn`: one that did would outlive a cancel on Windows.
        spawn = inspect.getsource(m._spawn)
        self.assertIs(inspect.signature(m._spawn).parameters["popen"].default, subprocess.Popen)
        self.assertEqual(re.findall(r"\bPopen\(|\bsubprocess\.(?:run|call|check_call|check_output)\("
                                    r"|\bos\.(?:system|popen|startfile|spawn\w*|exec\w*|posix_spawn\w*)\(", source), [])
        self.assertNotIn("popen(", source.replace(spawn, ""))
        self.assertIn("_own_group(windows)", spawn)
        self.assertNotIn("creationflags=", source.replace(spawn, ""))
        self.assertNotIn("start_new_session=", source.replace('{"start_new_session": True}', ""))
        # And none of its callers says which system this is, or how a process is started there:
        # `_spawn` knows (a test gives it another system; the companion never does).
        calls = [node for node in ast.walk(ast.parse(source))
                 if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "_spawn"]
        self.assertEqual(len(calls), 5)  # LaTeX and the like, the two ffmpeg, Manim, the text worker
        self.assertEqual([word.arg for call in calls for word in call.keywords
                          if word.arg in ("windows", "api", "popen") or word.arg is None], [])

    # ----- Windows: a Job Object for each child, played on any system ---------------------------

    class Started(Child):
        """What ``_spawn`` gets from ``Popen``: a child, its start recorded in ``calls``."""
        _handle = 77  # the handle of the process, which Popen keeps

        def __init__(self, calls, cmd, **options):
            super().__init__()
            self.cmd, self.options, self.waited = cmd, options, False
            self.stdin, self.stdout, self.stderr = io.BytesIO(), io.BytesIO(), io.BytesIO()
            calls.append(("start", options.get("creationflags")))

        def wait(self, timeout=None):
            self.waited = True
            return 1

    class JobObjects:
        """The calls of Windows behind a Job Object (``_JobObjectAPI``), played: each is recorded
        in ``calls``, and answers as the test says."""

        def __init__(self, job=91, assign=True, resume=True, terminate=None):
            self.job, self.assigned, self.resumed, self.failure = job, assign, resume, terminate
            self.calls = []

        def create(self, limits):
            self.calls.append(("create", limits))
            return self.job

        def assign(self, job, process):
            self.calls.append(("assign", job, process))
            return self.assigned

        def resume(self, process, pid):
            self.calls.append(("resume", process, pid))
            return self.resumed

        def terminate(self, job):
            self.calls.append(("terminate", job))
            if isinstance(self.failure, Exception):
                raise self.failure
            return self.failure is None

        def close(self, handle):
            self.calls.append(("close", handle))

    def spawn(self, windows, started=None):
        """``_spawn`` on Windows, as ``windows`` plays it; ``started`` gets the child too."""
        def popen(cmd, **options):
            child = self.Started(windows.calls, cmd, **options)
            if started is not None:
                started.append(child)
            return child
        return m._spawn(["ffmpeg", "-y"], windows=True, api=windows, popen=popen, cwd="C:\\job",
                        stdin=subprocess.DEVNULL)

    def test_elsewhere_a_child_starts_in_its_session_and_nothing_else(self):
        windows = self.JobObjects()
        child = m._spawn(["ffmpeg"], windows=False, api=windows, cwd="/job", stdin=subprocess.DEVNULL,
                         popen=lambda cmd, **options: self.Started(windows.calls, cmd, **options))
        self.assertEqual(child.options, {"cwd": "/job", "stdin": subprocess.DEVNULL, "start_new_session": True})
        self.assertEqual(windows.calls, [("start", None)])

    def test_on_windows_a_child_starts_suspended_and_runs_once_in_its_job(self):
        windows = self.JobObjects()
        child = self.spawn(windows)
        # In its group and suspended (0x200 | 0x4): nothing it starts runs before it is in the job,
        # which ends what it holds when it is closed.
        self.assertEqual(windows.calls, [("create", 0x2000), ("start", 0x204), ("assign", 91, 77),
                                         ("resume", 77, 4242)])
        self.assertEqual((child.cmd, child.options["cwd"]), (["ffmpeg", "-y"], "C:\\job"))
        self.assertEqual(child._mfe_job, (windows, 91))

    def test_on_windows_a_job_that_cannot_be_made_leaves_the_child_in_its_group(self):
        windows = self.JobObjects(job=0)
        child = self.spawn(windows)
        self.assertEqual(windows.calls, [("create", 0x2000), ("start", 0x200)])  # as before there were jobs
        self.assertFalse(hasattr(child, "_mfe_job"))

    def test_on_windows_a_child_that_cannot_join_its_job_runs_without_it(self):
        windows = self.JobObjects(assign=False)
        child = self.spawn(windows)
        self.assertEqual(windows.calls, [("create", 0x2000), ("start", 0x204), ("assign", 91, 77),
                                         ("close", 91), ("resume", 77, 4242)])
        self.assertFalse(hasattr(child, "_mfe_job"))
        with mock.patch.object(m.os, "name", "nt"), mock.patch.object(m, "_kill_tree_windows") as tree:
            m._kill(child)
        tree.assert_called_once_with(child)  # taskkill ends it, as before there were jobs
        del tree, child
        gc.collect()
        self.assertEqual(windows.calls.count(("close", 91)), 1)  # not once more with the child

    def test_on_windows_a_child_that_cannot_be_resumed_is_ended_and_its_start_fails(self):
        windows, started = self.JobObjects(resume=False), []
        with self.assertRaises(OSError):
            self.spawn(windows, started)
        child, = started
        self.assertEqual(child.killed, 1)
        self.assertTrue(child.waited)
        self.assertTrue(all(pipe.closed for pipe in (child.stdin, child.stdout, child.stderr)))
        self.assertEqual(windows.calls[-1], ("close", 91))  # the job too, which ends what it holds
        del started, child
        gc.collect()
        self.assertEqual(windows.calls.count(("close", 91)), 1)

    def test_on_windows_a_start_cut_short_leaves_no_child_suspended(self):
        # Ctrl+C while `health` or `compile` starts a program: between its creation and its
        # resume the child does not run, and nothing else would ever end it.
        for step in ("assign", "resume"):
            with self.subTest(cut_at=step):
                windows, started = self.JobObjects(), []

                def cut(*args):
                    raise KeyboardInterrupt()

                setattr(windows, step, cut)
                with self.assertRaises(KeyboardInterrupt):
                    self.spawn(windows, started)
                child, = started
                self.assertEqual(child.killed, 1)
                self.assertEqual(windows.calls.count(("close", 91)), 1)  # and what its job held
                del started, child
                gc.collect()
                self.assertEqual(windows.calls.count(("close", 91)), 1)

    def test_on_windows_a_start_that_fails_leaves_no_job_open(self):
        windows = self.JobObjects()

        def popen(cmd, **options):
            raise FileNotFoundError(cmd[0])

        with self.assertRaises(FileNotFoundError):
            m._spawn(["ffmpeg"], windows=True, api=windows, popen=popen)
        self.assertEqual(windows.calls, [("create", 0x2000), ("close", 91)])

    def test_on_windows_the_job_is_closed_once_when_its_child_goes(self):
        windows = self.JobObjects()
        child = self.spawn(windows)
        with mock.patch.object(m.os, "name", "nt"):
            m._kill(child)
        # Open for as long as the child's Popen object is: what ends the tree needs it.
        self.assertNotIn(("close", 91), windows.calls)
        del child
        gc.collect()
        self.assertEqual(windows.calls.count(("close", 91)), 1)

    def test_on_windows_kill_ends_the_job_then_the_child(self):
        for failure in (None, False, OSError("TerminateJobObject")):
            with self.subTest(failure=failure):
                windows = self.JobObjects(terminate=failure)
                child = self.spawn(windows)
                with mock.patch.object(m.os, "name", "nt"), mock.patch.object(m, "_kill_tree_windows") as tree:
                    m._kill(child)
                # Not taskkill, which finds nothing under a child that has died.
                tree.assert_not_called()
                self.assertEqual(windows.calls[-1], ("terminate", 91))
                # Ended by its job, it is waited for: its folder is free once it is gone.
                self.assertIs(child.waited, failure is None)
                self.assertEqual(child.killed, 1)  # whatever the job did, the child itself is ended

    def test_what_a_child_that_has_gone_left_is_ended_where_it_has_a_job(self):
        # A virtualenv's launcher that died by itself, the interpreter under it alive in the job's
        # folder: the job still holds it. Elsewhere a child that has gone is left alone, as before:
        # its id names its group, and may be another process's by now.
        class Gone(self.Child):
            def poll(self):
                return 1

            def wait(self, timeout=None):
                return 1

        gone, in_a_job, running = Gone(), Gone(), Gone()
        in_a_job._mfe_job = m._JobObject(self.JobObjects(), 91)
        running.poll = lambda: None
        self.assertEqual([m._has_to_end(child) for child in (gone, in_a_job, running)], [False, True, True])
        # A job that is cancelled, or cleaned up, ends it so; and so does the companion that stops.
        companion = m.Companion(disk_cache=False, sandbox=False)
        companion._probes.extend([gone, in_a_job, running])
        ended = []
        with mock.patch.object(m, "_kill", ended.append):
            for child in (gone, in_a_job, running):
                child.stdin = None
                m._Job._kill_process(mock.Mock(proc=child))
            companion.shutdown()
        self.assertEqual(ended, [in_a_job, running] * 2)


@unittest.skipUnless(os.name == "nt", "a Job Object is a thing of Windows")
class JobObjectsOnWindows(unittest.TestCase):
    """The tree of a child started by ``_spawn`` ends with its Job Object: when ``_kill`` ends the
    child, even one that has died, and when the companion itself is ended at once."""

    # A launcher, as a virtualenv's python.exe is: it starts a Python that lives for a minute,
    # says its id, then waits for it ("wait") or leaves it there ("leave").
    LAUNCHER = "\n".join((
        "import subprocess, sys",
        "child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'],",
        "                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)",
        "print(child.pid, flush=True)",
        "if sys.argv[1] == 'wait':",
        "    child.wait()",
    ))

    def process(self, pid):
        """A handle on the process ``pid``, kept so that its id goes to no other; ended with the
        test, whatever the test found."""
        import _winapi
        handle = _winapi.OpenProcess(_winapi.SYNCHRONIZE | 0x0001, False, pid)  # PROCESS_TERMINATE

        def end():
            try:
                _winapi.TerminateProcess(handle, 1)
            except OSError:  # it has ended
                pass
            _winapi.CloseHandle(handle)

        self.addCleanup(end)
        return handle

    def ends(self, handle, within=10.0):
        """Whether the process ends within ``within`` seconds."""
        import _winapi
        return _winapi.WaitForSingleObject(handle, int(within * 1000)) == _winapi.WAIT_OBJECT_0

    def launch(self, how):
        """The launcher, started by ``_spawn``, and a handle on the Python it started."""
        proc = m._spawn(python_program(self.LAUNCHER, how), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE)
        self.addCleanup(proc.stdout.close)
        self.process(proc.pid)
        grandchild = self.process(int(proc.stdout.readline()))
        self.assertFalse(self.ends(grandchild, 0))
        return proc, grandchild

    def test_kill_ends_the_whole_tree(self):
        proc, grandchild = self.launch("wait")
        m._kill(proc)
        self.assertIsNotNone(proc.wait(10))
        self.assertTrue(self.ends(grandchild))

    def test_the_folder_of_a_child_is_free_once_kill_returns(self):
        # Windows removes no folder that is the current one of a process, and a process ended by
        # its job lets go of it a moment later: the job's folder was left behind.
        folder = tempfile.mkdtemp(prefix="mfe-test-")
        self.addCleanup(shutil.rmtree, folder, ignore_errors=True)
        proc = m._spawn(python_program("import time; print(1, flush=True); time.sleep(60)"), cwd=folder,
                        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE)
        self.addCleanup(proc.stdout.close)
        self.assertEqual(proc.stdout.readline().strip(), b"1")
        m._kill(proc)
        os.rmdir(folder)

    def test_kill_ends_the_tree_of_a_child_that_has_died(self):
        # What the job is for: ``taskkill /T`` looks for the tree by the parents' ids, and finds
        # nothing under a launcher that has died.
        for death in ("it leaves", "it is ended alone"):
            with self.subTest(death):
                proc, grandchild = self.launch("leave" if death == "it leaves" else "wait")
                if death != "it leaves":
                    proc.kill()  # TerminateProcess: that one process
                proc.wait(10)
                self.assertFalse(self.ends(grandchild, 0.5))  # what it started lives on
                m._kill(proc)
                self.assertTrue(self.ends(grandchild))

    def test_a_job_that_is_cancelled_ends_what_its_dead_child_left(self):
        # The same through a job's own way of ending its process, which a cancel, a failure and
        # the clean-up take: the launcher has gone by itself, and what it started lives on.
        proc, grandchild = self.launch("leave")
        proc.wait(10)
        self.assertFalse(self.ends(grandchild, 0.5))
        m._Job._kill_process(mock.Mock(proc=proc))
        self.assertTrue(self.ends(grandchild))

    def test_the_tree_ends_with_the_companion_however_it_ends(self):
        # A companion ended at once (TerminateProcess, a console window closed) runs no code of
        # its own: the jobs of its children end with their handles, which Windows closes then.
        owner = subprocess.Popen(python_program("\n".join((
            "import subprocess, sys, time",
            f"sys.path.insert(0, {COMPANION_DIR!r})",
            "import mfe_companion as m",
            f"proc = m._spawn([sys.executable, '-c', {self.LAUNCHER!r}, 'wait'], stdin=subprocess.DEVNULL,",
            "                 stdout=subprocess.PIPE)",
            "print(proc.pid, proc.stdout.readline().decode().strip(), flush=True)",
            "time.sleep(60)",
        ))), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE)
        self.addCleanup(owner.stdout.close)
        self.addCleanup(owner.kill)
        child, grandchild = (self.process(int(pid)) for pid in owner.stdout.readline().split())
        self.assertFalse(self.ends(grandchild, 0))
        owner.kill()  # TerminateProcess
        owner.wait(10)
        self.assertTrue(self.ends(child))
        self.assertTrue(self.ends(grandchild))

    def test_a_child_runs_however_it_is_resumed(self):
        # NtResumeProcess, which Windows does not document, and each thread of the process
        api = m._JobObjectAPI()
        api._nt_resume = None
        for jobs in (m._JobObjectAPI.get(), api):
            with self.subTest(nt_resume=jobs._nt_resume is not None):
                proc = m._spawn(python_program("print('ran')"), api=jobs, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE)
                self.assertIsNotNone(getattr(proc, "_mfe_job", None))
                out, _ = proc.communicate(timeout=20)
                self.assertEqual((proc.returncode, out.strip()), (0, b"ran"))


class Sandbox(unittest.TestCase):
    def test_wrap_keeps_readable_directories_below_hidden_roots(self):
        sandbox = m._Sandbox(True)
        if not sandbox.active():
            self.skipTest("bubblewrap is not usable here")
        with tempfile.TemporaryDirectory(prefix="mfe-venv-") as keep, tempfile.TemporaryDirectory() as work:
            wrapped = sandbox.wrap(["true"], work, readable=[keep, "/usr", "/nonexistent-dir"])
            pairs = [(wrapped[i], wrapped[i + 1]) for i in range(len(wrapped) - 1)]
            self.assertIn(("--ro-bind", os.path.realpath(keep)), pairs)  # /tmp is hidden: bound back
            self.assertNotIn(("--ro-bind", "/usr"), pairs)  # already visible: not repeated
            self.assertNotIn(("--ro-bind", "/nonexistent-dir"), pairs)
            self.assertEqual(wrapped[-1], "true")


@requires_ffmpeg
class VideoJobs(test_http.ServerCase):
    def post_frames(self, job, first, body, extra=""):
        path = f"/video/{job}/frames?first={first}{extra}"
        return self.request("POST", path, raw_body=body, headers={"Content-Type": "application/octet-stream"})

    def create(self, **changes):
        body = {"format": "mp4", "quality": "low", "width": 64, "height": 48, "fps": 10, "frames": 6, **changes}
        status, _, data = self.request("POST", "/video", body)
        return status, data

    def jobs_dir(self):
        return self.companion.jobs.root()

    def tearDown(self):
        for kind in ("video",):
            for job in list(self.companion.jobs._jobs.values()):
                self.companion.jobs.remove(job.kind, job.id)

    def test_health_reports_ffmpeg(self):
        self.assertTrue(self.request("GET", "/health")[2]["capabilities"]["ffmpeg"])

    # ----- the limit of a video, and the room of the disk (companion 1.7) -------------------------

    def limited(self, limit):
        """The companion with another limit for its videos, until the test ends."""
        jobs = self.companion.jobs
        self.addCleanup(setattr, jobs, "max_video_bytes", jobs.max_video_bytes)
        jobs.max_video_bytes = limit

    def stand_in(self, code):
        """``code`` as the first pass of the jobs created from here on: a Python program given the
        file to write as its argument, in the place of ffmpeg."""
        patch = mock.patch.object(m, "build_ffmpeg_command",
                                  lambda ffmpeg, spec, out, limit: python_program(code, out))
        patch.start()
        self.addCleanup(patch.stop)

    def wait_for(self, condition, what):
        deadline = time.monotonic() + 15
        while not condition():
            self.assertLess(time.monotonic(), deadline, what)
            time.sleep(0.02)

    def test_health_and_a_new_job_say_the_limit(self):
        self.assertEqual(self.request("GET", "/health")[2]["limits"], {"videoBytes": 4 * 1024 ** 3})
        self.assertEqual(self.create()[1]["maxVideoBytes"], 4 * 1024 ** 3)
        self.limited(8 * m.GIB)
        self.assertEqual(self.request("GET", "/health")[2]["limits"], {"videoBytes": 8 * 1024 ** 3})
        self.assertEqual(self.create()[1]["maxVideoBytes"], 8 * 1024 ** 3)

    def test_a_video_over_the_limit_fails_and_nothing_is_delivered(self):
        # the real ffmpeg, and a limit any video is over
        self.limited(300)
        _, data = self.create()
        job_id = data["id"]
        status, _, body = self.post_frames(job_id, 0, png(64, 48) * 6)
        if status == 200:  # ffmpeg had written nothing yet: it does as it ends
            status, _, body = self.request("POST", f"/video/{job_id}/finish", {})
            self.assertEqual(status, 200)
        else:
            self.assertEqual(status, 507, body)
        data = self.request("GET", f"/video/{job_id}")[2]
        self.assertEqual(data["state"], "failed", data)
        self.assertEqual(data["error"]["message"], m.video_too_large(300))
        self.assertIn("larger than 300 bytes", data["error"]["message"])
        self.assertIn("serve --max-video-gib N", data["error"]["message"])
        self.assertEqual(self.request("GET", f"/video/{job_id}/result")[0], 409)

    def test_a_video_is_stopped_at_the_limit_while_its_frames_arrive(self):
        # an encoder that writes 60 kB ten times a second, under a limit of 100 kB
        self.limited(100_000)
        self.stand_in("import sys, time\nwith open(sys.argv[1], 'wb') as out:\n    for _ in range(600):\n"
                      "        out.write(bytes(60000))\n        out.flush()\n        time.sleep(0.1)\n")
        _, data = self.create(frames=10)
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        self.wait_for(lambda: m._plain_file_size(job._out_path) > 100_000, "the stand-in did not write")
        self.assertEqual(self.request("GET", f"/video/{job_id}")[2]["state"], "receiving")
        # the file is looked at as frames arrive
        status, _, body = self.post_frames(job_id, 0, png(64, 48))
        self.assertEqual(status, 507, body)
        self.assertEqual(body["error"]["message"], m.video_too_large(100_000))
        data = self.request("GET", f"/video/{job_id}")[2]
        self.assertEqual((data["state"], data["error"]["message"]), ("failed", m.video_too_large(100_000)))
        self.assertIsNotNone(job.proc.poll())  # the encoder was ended, not left to fill the disk
        self.assertEqual(self.post_frames(job_id, 3, png(64, 48))[0], 410)
        self.assertEqual(self.request("GET", f"/video/{job_id}/result")[0], 409)

    def test_a_file_cut_short_by_the_encoders_own_stop_is_not_a_video(self):
        # What ffmpeg does at its -fs: it stops writing and ends with status 0, as if all were
        # well. Here it does so as it ends, past a limit of 100 kB (a GIF is written whole then).
        self.limited(100_000)
        self.stand_in("import sys\nsys.stdin.buffer.read()\n"
                      "with open(sys.argv[1], 'wb') as out:\n    out.write(bytes(300000))\n")
        _, data = self.create(frames=2)
        job_id = data["id"]
        self.assertEqual(self.post_frames(job_id, 0, png(64, 48) * 2)[0], 200)
        status, _, data = self.request("POST", f"/video/{job_id}/finish", {})
        self.assertEqual((status, data["state"]), (200, "failed"), data)
        self.assertEqual(data["error"]["message"], m.video_too_large(100_000))
        self.assertNotIn("bytes", {k for k in data if k != "error"})  # no size of a result: there is none
        self.assertEqual(self.request("GET", f"/video/{job_id}/result")[0], 409)

    def test_an_encoder_that_stopped_past_the_limit_while_frames_arrive_says_so(self):
        # the same stop while frames are still being sent: the pipe breaks, and the file says why
        self.limited(100_000)
        self.stand_in("import sys\nwith open(sys.argv[1], 'wb') as out:\n    out.write(bytes(300000))\n")
        _, data = self.create(frames=400)
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        self.wait_for(lambda: job.proc.poll() is not None, "the stand-in did not end")
        status, _, body = self.post_frames(job_id, 0, png(64, 48) * 400)  # more than a pipe holds
        self.assertIn(status, (500, 507), body)
        self.assertEqual(body["error"]["message"], m.video_too_large(100_000))
        self.assertEqual(self.request("GET", f"/video/{job_id}")[2]["state"], "failed")

    def test_a_video_just_under_the_limit_is_delivered_whole(self):
        _, data = self.create()
        job_id = data["id"]
        self.post_frames(job_id, 0, png(64, 48) * 6)
        done = self.request("POST", f"/video/{job_id}/finish", {})[2]
        self.assertEqual(done["state"], "done", done)
        # the same video again, with its very size as the limit: it is at the limit, not over it
        self.limited(done["bytes"])
        _, data = self.create()
        self.post_frames(data["id"], 0, png(64, 48) * 6)
        again = self.request("POST", f"/video/{data['id']}/finish", {})[2]
        self.assertEqual((again["state"], again["bytes"]), ("done", done["bytes"]), again)
        self.limited(done["bytes"] - 1)
        _, data = self.create()
        self.post_frames(data["id"], 0, png(64, 48) * 6)
        self.assertEqual(self.request("POST", f"/video/{data['id']}/finish", {})[2]["state"], "failed")

    def test_no_job_is_begun_on_a_disk_that_is_nearly_full(self):
        asked = []
        root = self.companion.jobs.root()

        def free(folder):
            asked.append(folder)
            return 300 * 1024 * 1024

        with mock.patch.object(m, "_free_bytes", free):
            status, data = self.create()
        self.assertEqual(status, 507, data)
        # the folder as it is, but by its long name where Windows gave a short one
        # (`folder_as_said`): there a name with a `~` in it, and none in what is said
        folder = said = os.path.dirname(root)
        if os.name == "nt" and "~" in folder:
            said = os.path.realpath(folder)
            self.assertNotIn("~", said)
        self.assertEqual(data["error"]["message"], m.disk_nearly_full(said, m.MIN_FREE_BYTES))
        self.assertEqual(self.companion.jobs.active("video"), [])
        self.assertEqual(asked, [root])  # the disk of the folder the jobs write in
        # on any system: the message names the folder as `folder_as_said` says it
        with mock.patch.object(m, "_free_bytes", free), \
                mock.patch.object(m, "folder_as_said", lambda given: f"<{given}>"):
            status, data = self.create()
        self.assertEqual(data["error"]["message"], m.disk_nearly_full(f"<{folder}>", m.MIN_FREE_BYTES))
        # with the reserve free, to the byte, a job begins
        with mock.patch.object(m, "_free_bytes", lambda folder: m.MIN_FREE_BYTES):
            self.assertEqual(self.create()[0], 201)
        # a disk that cannot be asked is no reason to refuse
        with mock.patch.object(m, "_free_bytes", lambda folder: None):
            self.assertEqual(self.create()[0], 201)

    def test_a_job_is_stopped_when_the_disk_gets_nearly_full(self):
        _, data = self.create()
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        self.assertEqual(self.post_frames(job_id, 0, png(64, 48))[0], 200)
        time.sleep(m.ROOM_CHECK_S + 0.05)
        with mock.patch.object(m, "_free_bytes", lambda folder: 300 * 1024 * 1024):
            status, _, body = self.post_frames(job_id, 1, png(64, 48))
        self.assertEqual(status, 507, body)
        self.assertIn("is nearly full: less than 1 GiB is free", body["error"]["message"])
        self.assertEqual(self.request("GET", f"/video/{job_id}")[2]["state"], "failed")
        self.assertIsNotNone(job.proc.poll())

    def test_a_job_stopped_in_the_middle_of_a_request_still_gets_its_answer_read(self):
        # The job is stopped at the first piece of a body of 24 MB. The client is still sending
        # the rest: answered there and then, with the body half read, it would find its connection
        # broken and never read why. The companion takes the rest of the body first.
        self.stand_in("import sys\nwhile sys.stdin.buffer.read(65536):\n    pass\n")
        _, data = self.create(frames=4)
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        body = large_png(64, 48, 24 * 1024 * 1024)
        with mock.patch.object(m, "_free_bytes", lambda folder: 300 * 1024 * 1024):
            status, _, answer = self.post_frames(job_id, 0, body)
        self.assertEqual(status, 507, answer)
        self.assertIn("is nearly full: less than 1 GiB is free", answer["error"]["message"])
        self.assertEqual(job.state, "failed")
        self.assertEqual(job.png.frames, 0)  # stopped long before the end of the file it was sent

    def test_an_encoder_still_writing_at_the_end_is_stopped_when_the_disk_gets_nearly_full(self):
        self.stand_in("import sys, time\nsys.stdin.buffer.read()\ntime.sleep(60)\n")
        _, data = self.create(frames=2)
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        self.assertEqual(self.post_frames(job_id, 0, png(64, 48) * 2)[0], 200)
        started = time.monotonic()
        with mock.patch.object(m, "_free_bytes", lambda folder: 300 * 1024 * 1024):
            status, _, data = self.request("POST", f"/video/{job_id}/finish", {})
        self.assertEqual((status, data["state"]), (200, "failed"), data)
        self.assertIn("is nearly full", data["error"]["message"])
        self.assertLess(time.monotonic() - started, 20)
        self.assertIsNotNone(job.proc.poll())

    def test_a_video_that_was_finished_is_delivered_whatever_the_disk_has_left(self):
        # nothing more is written: the room the disk has left is no reason to throw the video away
        self.stand_in("import sys\nsys.stdin.buffer.read()\n"
                      "with open(sys.argv[1], 'wb') as out:\n    out.write(bytes(5000))\n")
        _, data = self.create(frames=2)
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        self.assertEqual(self.post_frames(job_id, 0, png(64, 48) * 2)[0], 200)
        job.proc.stdin.close()
        job.proc.wait(15)
        with mock.patch.object(m, "_free_bytes", lambda folder: 300 * 1024 * 1024):
            status, _, data = self.request("POST", f"/video/{job_id}/finish", {})
        self.assertEqual((status, data["state"], data["bytes"]), (200, "done", 5000), data)

    def test_full_lifecycle_for_every_format(self):
        frame = png(64, 48)
        for fmt, codec in (("mp4", "h264"), ("webm", "vp9"), ("mov", "prores"), ("gif", "gif")):
            with self.subTest(format=fmt):
                status, data = self.create(format=fmt, frames=6)
                self.assertEqual(status, 201, data)
                self.assertEqual((data["state"], data["frames"], data["received"]), ("receiving", 6, 0))
                job = data["id"]
                status, _, data = self.post_frames(job, 0, frame * 3)
                self.assertEqual((status, data["received"], data["accepted"]), (200, 3, 3))
                status, _, data = self.post_frames(job, 3, frame * 3)
                self.assertEqual((status, data["received"]), (200, 6))
                status, _, data = self.request("POST", f"/video/{job}/finish", {})
                self.assertEqual((status, data["state"]), (200, "done"), data)
                self.assertGreater(data["bytes"], 0)
                status, _, status_data = self.request("GET", f"/video/{job}")
                self.assertEqual(status_data["state"], "done")
                conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
                conn.request("GET", f"/video/{job}/result")
                resp = conn.getresponse()
                body = resp.read()
                conn.close()
                self.assertEqual(resp.status, 200)
                self.assertEqual(resp.getheader("Content-Type"), m.VIDEO_FORMATS[fmt][1])
                self.assertIn(f'filename="video.{m.VIDEO_FORMATS[fmt][0]}"', resp.getheader("Content-Disposition"))
                self.assertEqual(len(body), data["bytes"])
                info = probe(temporary_file(self, body, "." + fmt))
                self.assertEqual(info["codec_name"], codec)
                self.assertEqual((info["width"], info["height"]), (64, 48))
                self.assertAlmostEqual(info["duration"], 0.6, places=3)  # frames / fps exactly
                self.assertEqual(int(info["nb_read_packets"]), 6)
                self.assertEqual(self.request("DELETE", f"/video/{job}")[0], 200)
                self.assertEqual(self.request("GET", f"/video/{job}")[0], 404)

    def test_frames_in_one_request_per_frame(self):
        _, data = self.create(frames=3)
        job = data["id"]
        for k in range(3):
            self.assertEqual(self.post_frames(job, k, png(64, 48, (k * 50, 0, 0)))[0], 200)
        self.assertEqual(self.request("POST", f"/video/{job}/finish", {})[2]["state"], "done")

    def test_out_of_order_and_missing_first(self):
        _, data = self.create()
        job = data["id"]
        frame = png(64, 48)
        self.assertEqual(self.post_frames(job, 2, frame)[0], 409)
        self.assertEqual(self.request("POST", f"/video/{job}/frames", raw_body=frame)[0], 400)
        self.assertEqual(self.post_frames(job, 0, frame)[0], 200)
        self.assertEqual(self.post_frames(job, 0, frame)[0], 409)  # a retry of an accepted frame

    def test_finish_before_all_frames(self):
        _, data = self.create()
        job = data["id"]
        self.post_frames(job, 0, png(64, 48))
        status, _, body = self.request("POST", f"/video/{job}/finish", {})
        self.assertEqual(status, 409)
        self.assertFalse(body["ok"])
        # the job is still usable
        self.assertEqual(self.post_frames(job, 1, png(64, 48) * 5)[0], 200)
        self.assertEqual(self.request("POST", f"/video/{job}/finish", {})[2]["state"], "done")

    def test_wrong_frame_size_fails_the_job(self):
        _, data = self.create()
        job = data["id"]
        status, _, body = self.post_frames(job, 0, png(32, 48))
        self.assertEqual(status, 400)
        self.assertIn("expects 64x48", body["error"]["message"])
        self.assertEqual(self.request("GET", f"/video/{job}")[2]["state"], "failed")
        self.assertEqual(self.post_frames(job, 0, png(64, 48))[0], 410)

    def test_not_png_data_and_truncated_files(self):
        for payload in (b"not a png" * 10, png(64, 48)[:-5]):
            _, data = self.create()
            job = data["id"]
            self.assertEqual(self.post_frames(job, 0, payload)[0], 400)
            self.assertEqual(self.request("GET", f"/video/{job}")[2]["state"], "failed")

    def test_a_large_body_for_a_finished_job_still_gets_an_answer(self):
        _, data = self.create()
        job = data["id"]
        self.assertEqual(self.post_frames(job, 0, b"nope")[0], 400)  # fails the job
        status, _, body = self.post_frames(job, 0, b"\0" * 300_000)
        self.assertEqual(status, 410)
        self.assertFalse(body["ok"])

    def test_too_many_frames(self):
        _, data = self.create(frames=2)
        job = data["id"]
        self.assertEqual(self.post_frames(job, 0, png(64, 48) * 3)[0], 400)
        self.assertEqual(self.request("GET", f"/video/{job}")[2]["state"], "failed")

    def test_corrupt_image_reported_by_ffmpeg(self):
        _, data = self.create(frames=1)
        job = data["id"]
        frame = bytearray(png(64, 48))
        frame[60:90] = b"\xff" * 30  # damage the compressed data, keep the chunk layout
        status = self.post_frames(job, 0, bytes(frame))[0]
        if status == 200:
            _, _, body = self.request("POST", f"/video/{job}/finish", {})
            self.assertEqual(body["state"], "failed", body)
            self.assertTrue(body["error"]["message"])
        else:
            self.assertIn(status, (400, 500))

    def test_create_validation_statuses(self):
        for changes in ({"format": "exe"}, {"width": 63}, {"fps": 0}, {"frames": 0}):
            status, data = self.create(**changes)
            self.assertEqual(status, 400, changes)
            self.assertFalse(data["ok"])
        status, _, _ = self.request("POST", "/video", raw_body=b"{nope")
        self.assertEqual(status, 400)
        status, _, _ = self.request("POST", "/video", raw_body=b"x" * (m.MAX_BODY_BYTES + 1))
        self.assertEqual(status, 413)

    def test_frames_request_limit(self):
        _, data = self.create()
        job = data["id"]
        with unittest.mock.patch.object(m, "MAX_FRAMES_REQUEST_BYTES", 2000):
            status, _, body = self.post_frames(job, 0, png(64, 48) + b"\0" * 4000)
        self.assertEqual(status, 413)
        self.assertEqual(self.request("GET", f"/video/{job}")[2]["received"], 0)

    def test_too_many_active_jobs(self):
        ids = []
        for _ in range(m.MAX_VIDEO_JOBS):
            status, data = self.create()
            self.assertEqual(status, 201)
            ids.append(data["id"])
        status, data = self.create()
        self.assertEqual(status, 429)
        self.request("DELETE", f"/video/{ids[0]}")
        self.assertEqual(self.create()[0], 201)

    def test_cancel_kills_ffmpeg_and_removes_files(self):
        _, data = self.create()
        job = self.companion.jobs.get("video", data["id"])
        self.post_frames(data["id"], 0, png(64, 48))
        proc, directory = job.proc, job.dir
        self.assertTrue(os.path.isdir(directory))
        self.assertEqual(self.request("DELETE", f"/video/{data['id']}")[0], 200)
        self.assertIsNotNone(proc.poll())
        self.assertFalse(os.path.exists(directory))
        self.assertEqual(self.post_frames(data["id"], 1, png(64, 48))[0], 404)

    def test_a_job_deleted_while_its_result_is_sent_loses_the_result_too(self):
        # Windows removes no file that is open: the result a request was still sending stayed when
        # its job was deleted, until the companion ended. A removal that leaves the job's folder
        # alone while the file is being sent plays that system here, on any.
        _, data = self.create(frames=2)
        job_id = data["id"]
        self.post_frames(job_id, 0, png(64, 48) * 2)
        self.assertEqual(self.request("POST", f"/video/{job_id}/finish", {})[2]["state"], "done")
        job = self.companion.jobs.get("video", job_id)
        copy, remove = shutil.copyfileobj, shutil.rmtree
        sending = threading.Event()
        stayed = []

        def send_then_delete(source, target, *args):
            sending.set()
            try:
                copy(source, target, *args)
                # The client has its file and deletes the job; the companion still holds the file.
                self.companion.jobs.remove("video", job_id)
                stayed.append(os.path.exists(job.result_path))
            finally:
                sending.clear()

        def as_windows(path, *args, **kwargs):
            if path == job.dir and sending.is_set():
                return  # "the file is being used by another process", with errors ignored
            remove(path, *args, **kwargs)

        with mock.patch.object(m.shutil, "copyfileobj", send_then_delete), \
                mock.patch.object(m.shutil, "rmtree", as_windows):
            conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
            conn.request("GET", f"/video/{job_id}/result")
            resp = conn.getresponse()
            body = resp.read()
            conn.close()
            self.assertEqual((resp.status, len(body) > 0), (200, True))
            deadline = time.monotonic() + 10  # the request ends a moment after its last byte
            while os.path.exists(job.dir) and time.monotonic() < deadline:
                time.sleep(0.02)
        self.assertEqual(stayed, [True])
        self.assertFalse(os.path.exists(job.dir))

    def test_cancel_while_receiving_a_request(self):
        _, data = self.create(frames=2)
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        conn = socket.create_connection(("127.0.0.1", self.port), timeout=30)
        frame = png(64, 48)
        head = (f"POST /video/{job_id}/frames?first=0 HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\n"
                f"Content-Length: {len(frame) * 2}\r\n\r\n").encode()
        conn.sendall(head + frame)  # half of the body, then stall
        deadline = time.monotonic() + 10
        while not job.feeding and time.monotonic() < deadline:
            time.sleep(0.02)
        self.assertTrue(job.feeding)
        self.assertEqual(self.request("DELETE", f"/video/{job_id}")[0], 200)
        conn.sendall(frame)
        reply = conn.recv(4096)
        conn.close()
        self.assertIn(b" 410 ", reply.split(b"\r\n")[0] + b" ")
        self.assertFalse(os.path.exists(job.dir))

    def test_idle_job_is_cancelled_by_the_reaper(self):
        _, data = self.create()
        job = self.companion.jobs.get("video", data["id"])
        reap = self.companion.jobs.reap
        # The manager's own thread reaps too, every 2 s. When it took the job a moment before the
        # call below, the job said "failed" while that thread's kill was still under way (ending a
        # process with what it started takes 50 ms on Windows), and the call found nothing to do.
        # It stands aside here: the job is given up on by this call, which ends its ffmpeg itself.
        with mock.patch.object(self.companion.jobs, "reap", lambda: None):
            self.companion.jobs.idle_timeout_s = 0.2
            try:
                time.sleep(0.4)
                reap()
            finally:
                self.companion.jobs.idle_timeout_s = m.VIDEO_IDLE_TIMEOUT_S
        self.assertEqual(job.state, "failed")
        self.assertIsNotNone(job.proc.poll())
        self.assertIn("stopped sending", job.error["message"])

    def test_finished_jobs_expire(self):
        _, data = self.create(frames=1)
        job = self.companion.jobs.get("video", data["id"])
        self.post_frames(data["id"], 0, png(64, 48))
        self.request("POST", f"/video/{data['id']}/finish", {})
        directory = job.dir
        self.companion.jobs.retention_s = 0.1
        try:
            time.sleep(0.3)
            self.companion.jobs.reap()
        finally:
            self.companion.jobs.retention_s = m.JOB_RETENTION_S
        self.assertEqual(self.request("GET", f"/video/{data['id']}")[0], 404)
        self.assertFalse(os.path.exists(directory))

    def test_result_before_done_and_unknown_ids(self):
        _, data = self.create()
        self.assertEqual(self.request("GET", f"/video/{data['id']}/result")[0], 409)
        unknown = "0" * 32
        for method, path in (("GET", f"/video/{unknown}"), ("DELETE", f"/video/{unknown}"),
                             ("POST", f"/video/{unknown}/finish"), ("GET", f"/video/{unknown}/result")):
            self.assertEqual(self.request(method, path)[0], 404, path)
        self.assertEqual(self.request("GET", "/video/not-an-id")[0], 404)
        self.assertEqual(self.request("GET", f"/manim-render/{data['id']}")[0], 404)  # wrong kind
        self.assertEqual(self.request("GET", f"/video/{data['id']}/../health")[0], 404)

    def test_methods(self):
        _, data = self.create()
        job = data["id"]
        self.assertEqual(self.request("GET", "/video")[0], 405)
        self.assertEqual(self.request("PUT", f"/video/{job}")[0], 405)
        self.assertEqual(self.request("GET", f"/video/{job}/frames")[0], 405)
        self.assertEqual(self.request("POST", f"/video/{job}/result")[0], 405)
        self.assertEqual(self.request("POST", f"/manim-render/{job}/frames")[0], 404)

    def test_host_and_origin_checks_apply_to_job_routes(self):
        _, data = self.create()
        job = data["id"]
        for path, method in (("/video", "POST"), (f"/video/{job}", "GET"), (f"/video/{job}", "DELETE"),
                             (f"/video/{job}/result", "GET"), ("/manim-render", "POST")):
            body = {"format": "mp4"} if method == "POST" else None
            self.assertEqual(self.request(method, path, body, host="evil.example")[0], 403, path)
            self.assertEqual(self.request(method, path, body, headers={"Origin": "https://evil.example"})[0], 403, path)
            self.assertEqual(self.request(method, path, body, headers={"Origin": "null"})[0], 403, path)
        # a rejected request must not have touched the job
        self.assertEqual(self.request("GET", f"/video/{job}")[2]["state"], "receiving")

    def test_cors_headers_on_job_routes(self):
        origin = {"Origin": "http://localhost:5173"}
        status, headers, _ = self.request("OPTIONS", "/video/" + "a" * 32 + "/frames",
                                          headers={**origin, "Access-Control-Request-Method": "POST",
                                                   "Access-Control-Request-Headers": "content-type"})
        self.assertEqual(status, 204)
        self.assertIn("DELETE", headers["access-control-allow-methods"])
        self.assertEqual(headers["access-control-allow-origin"], origin["Origin"])
        status, headers, _ = self.request("POST", "/video",
                                          {"format": "mp4", "width": 64, "height": 48, "fps": 1, "frames": 1},
                                          headers=origin)
        self.assertEqual(headers["access-control-allow-origin"], origin["Origin"])

    def test_tex_limit_is_unchanged(self):
        status, _, _ = self.request("POST", "/tex", raw_body=b" " * (m.MAX_BODY_BYTES + 1))
        self.assertEqual(status, 413)


class VideoJobsWithoutFfmpeg(test_http.ServerCase):
    def test_503_when_ffmpeg_is_missing(self):
        with unittest.mock.patch.object(m.Companion, "_tool", staticmethod(lambda name: None)):
            status, _, data = self.request("POST", "/video", {"format": "mp4", "width": 64, "height": 48,
                                                              "fps": 10, "frames": 1})
            self.assertEqual(self.request("GET", "/health")[2]["capabilities"]["ffmpeg"], False)
        self.assertEqual(status, 503)
        self.assertIn("ffmpeg", data["error"]["message"])


class Cleanup(unittest.TestCase):
    @requires_ffmpeg
    def test_shutdown_removes_every_temporary_file(self):
        companion = make_companion()
        spec = m.VideoSpec("mp4", "low", 64, 48, 10, 2)
        job = m.VideoJob(companion.jobs, shutil.which("ffmpeg"), spec)
        companion.jobs.add(job)
        root, proc = companion.jobs.root(), job.proc
        self.assertTrue(os.path.isdir(root))
        companion.shutdown()
        self.assertFalse(os.path.exists(root))
        self.assertIsNotNone(proc.poll())
        companion.shutdown()  # idempotent

    @requires_ffmpeg
    @posix_only
    def test_sigterm_cleans_up_a_serving_companion(self):
        before = {n for n in os.listdir(tempfile.gettempdir()) if n.startswith("mfe-jobs-")}
        script = os.path.join(mfe_companion.__file__)
        proc = subprocess.Popen([sys.executable, script, "serve", "--port", "0", "--no-disk-cache", "--no-sandbox"],
                                stderr=subprocess.PIPE, text=True)
        try:
            line = proc.stderr.readline()
            self.assertIn("listening", line)
            port = int(line.split("127.0.0.1:")[1].split()[0])
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
            body = json.dumps({"format": "mp4", "width": 64, "height": 48, "fps": 10, "frames": 2}).encode()
            conn.request("POST", "/video", body, {"Content-Length": str(len(body))})
            self.assertEqual(conn.getresponse().status, 201)
            conn.close()
            during = {n for n in os.listdir(tempfile.gettempdir()) if n.startswith("mfe-jobs-")} - before
            self.assertEqual(len(during), 1)
            proc.terminate()
            proc.wait(15)
        finally:
            if proc.poll() is None:
                proc.kill()
            proc.stderr.close()
        after = {n for n in os.listdir(tempfile.gettempdir()) if n.startswith("mfe-jobs-")} - before
        self.assertEqual(after, set())


class ManimDisabled(test_http.ServerCase):
    def test_off_by_default(self):
        self.assertIs(self.request("GET", "/health")[2]["capabilities"]["manimRender"], False)
        status, _, data = self.request("POST", "/manim-render", {"target": "ce", "code": "x", "scene": "A"})
        self.assertEqual(status, 403)
        self.assertIn("--allow-manim-render", data["error"]["message"])
        self.assertEqual(self.request("GET", "/manim-render/" + "0" * 32)[0], 404)


class ManimBase(test_http.ServerCase):
    """A companion with --allow-manim-render and the real virtualenvs (when present)."""

    manim_timeout = 120.0
    sandbox = True

    @classmethod
    def setUpClass(cls):
        cls.companion = make_companion(
            ce_python=venv_python("ce"), gl_python=venv_python("gl"), sandbox=cls.sandbox,
            allow_manim_render=True, manim_timeout_s=cls.manim_timeout)
        cls.companion.start_probes()
        cls.companion.wait_for_probes()
        cls.server = m.make_server(cls.companion, port=0)
        cls.port = cls.server.port
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    def tearDown(self):
        for job in list(self.companion.jobs._jobs.values()):
            self.companion.jobs.remove(job.kind, job.id)

    def start(self, target, code, **extra):
        body = {"target": target, "code": code, "scene": "Demo", "width": 320, "height": 180, "fps": 10,
                "frames": 15, **extra}
        return self.request("POST", "/manim-render", body)

    def wait(self, job_id, timeout=180):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            status = self.request("GET", f"/manim-render/{job_id}")[2]
            if status["state"] in ("done", "failed", "cancelled"):
                return status
            time.sleep(0.3)
        self.fail("the render did not finish")

    def wait_done(self, job_id):
        status = self.wait(job_id)
        self.assertEqual(status["state"], "done", status)
        return status


SCENES = {
    "ce": "from manim import *\nclass Demo(Scene):\n    def construct(self):\n"
          "        t = MathTex('x^2+y^2=r^2')\n        self.play(Write(t), run_time=1)\n        self.wait(0.5)\n",
    "gl": "from manimlib import *\nclass Demo(Scene):\n    def construct(self):\n"
          "        t = Tex('x^2+y^2=r^2')\n        self.play(Write(t), run_time=1)\n        self.wait(0.5)\n",
}


class ManimRequests(ManimBase):
    def test_health_reports_render_capability(self):
        caps = self.request("GET", "/health")[2]["capabilities"]
        self.assertIs(caps["manimRender"], True)
        self.assertIs(caps["manimSandbox"], self.companion.sandbox.active())

    def test_validation_and_missing_interpreter(self):
        status, _, data = self.request("POST", "/manim-render", {"target": "x", "code": "a", "scene": "A"})
        self.assertEqual((status, data["ok"]), (400, False))
        self.assertEqual(self.request("POST", "/manim-render", {"target": "ce", "code": "a", "scene": "a-b"})[0], 400)
        self.assertEqual(self.request("POST", "/manim-render", raw_body=b"[")[0], 400)
        status, _, data = self.request("POST", "/manim-render", raw_body=b"null")
        self.assertEqual((status, data["ok"]), (400, False))
        big = {"target": "ce", "code": "x" * (m.MAX_CODE_BYTES + 100), "scene": "A"}
        self.assertEqual(self.request("POST", "/manim-render", big)[0], 413)
        with unittest.mock.patch.object(m.Companion, "manim_interpreter", lambda self, target: None):
            status, _, data = self.request("POST", "/manim-render", {"target": "ce", "code": "a", "scene": "A"})
        self.assertEqual(status, 503)

    def test_host_and_origin_checks(self):
        body = {"target": "ce", "code": "a", "scene": "A"}
        self.assertEqual(self.request("POST", "/manim-render", body, host="evil.example")[0], 403)
        self.assertEqual(self.request("POST", "/manim-render", body, headers={"Origin": "http://evil.example"})[0], 403)


def _venv_case(target):
    return unittest.skipUnless(venv_python(target), f"no Manim virtualenv for {target}")


class ManimRender(ManimBase):
    def render(self, target, code=None, **extra):
        status, _, data = self.start(target, code or SCENES[target], **extra)
        self.assertEqual(status, 201, data)
        return data["id"], data

    def check_video(self, job_id, frames=15):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        conn.request("GET", f"/manim-render/{job_id}/result")
        resp = conn.getresponse()
        body = resp.read()
        conn.close()
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.getheader("Content-Type"), "video/mp4")
        if HAVE_FFMPEG:
            info = probe(temporary_file(self, body, ".mp4"))
            self.assertEqual((info["width"], info["height"]), (320, 180))
            self.assertEqual(int(info["nb_read_packets"]), frames)
            self.assertAlmostEqual(info["duration"], frames / 10, places=3)

    @_venv_case("ce")
    def test_render_with_manimce(self):
        job_id, started = self.render("ce")
        self.assertEqual(started["state"], "running")
        status = self.wait(job_id)
        self.assertEqual(status["state"], "done", status)
        self.assertEqual(status["frame"], 15)  # the progress reaches the expected frame count
        self.assertGreater(status["bytes"], 0)
        self.assertIs(status["sandboxed"], self.companion.sandbox.active())
        self.check_video(job_id)
        job = self.companion.jobs.get("manim", job_id)
        directory = job.dir
        self.assertEqual(self.request("DELETE", f"/manim-render/{job_id}")[0], 200)
        self.assertFalse(os.path.exists(directory))

    @_venv_case("gl")
    def test_render_with_manimgl(self):
        job_id, _ = self.render("gl")
        status = self.wait(job_id)
        self.assertEqual(status["state"], "done", status)
        self.check_video(job_id)

    @_venv_case("ce")
    def test_quality_preset_instead_of_size(self):
        status, _, data = self.request("POST", "/manim-render", {
            "target": "ce", "scene": "Demo", "quality": "low",
            "code": SCENES["ce"].replace("run_time=1", "run_time=0.2").replace("wait(0.5)", "wait(0.1)")})
        self.assertEqual(status, 201)
        done = self.wait(data["id"])
        self.assertEqual(done["state"], "done", done)

    @_venv_case("ce")
    def test_failure_reports_the_end_of_the_log(self):
        code = "from manim import *\nclass Demo(Scene):\n    def construct(self):\n        undefined_name_xyz\n"
        job_id, _ = self.render("ce", code)
        status = self.wait(job_id)
        self.assertEqual(status["state"], "failed")
        self.assertIn("undefined_name_xyz", status["error"]["log"])
        self.assertIn("NameError", status["error"]["log"])
        self.assertTrue(status["error"]["message"])
        self.assertEqual(self.request("GET", f"/manim-render/{job_id}/result")[0], 409)

    @_venv_case("ce")
    def test_syntax_error_and_missing_scene(self):
        job_id, _ = self.render("ce", "def broken(:\n")
        self.assertEqual(self.wait(job_id)["state"], "failed")
        job_id, _ = self.render("ce", "from manim import *\nclass Other(Scene):\n    def construct(self):\n        pass\n")
        status = self.wait(job_id)
        self.assertEqual(status["state"], "failed")

    @_venv_case("ce")
    def test_only_one_render_at_a_time_and_cancel(self):
        slow = "import time\nfrom manim import *\nclass Demo(Scene):\n    def construct(self):\n        time.sleep(120)\n"
        job_id, _ = self.render("ce", slow)
        status, _, data = self.start("ce", SCENES["ce"])
        self.assertEqual(status, 429, data)
        job = self.companion.jobs.get("manim", job_id)
        proc, directory = job.proc, job.dir
        time.sleep(1.0)
        self.assertEqual(self.request("GET", f"/manim-render/{job_id}")[2]["state"], "running")
        self.assertEqual(self.request("DELETE", f"/manim-render/{job_id}")[0], 200)
        self.assertIsNotNone(proc.poll())
        self.assertFalse(os.path.exists(directory))
        # the slot is free again
        status, _, data = self.start("ce", SCENES["ce"])
        self.assertEqual(status, 201)

    @_venv_case("ce")
    def test_simultaneous_requests_cannot_exceed_the_limit(self):
        slow = "import time\nfrom manim import *\nclass Demo(Scene):\n    def construct(self):\n        time.sleep(60)\n"
        statuses = []

        def post():
            statuses.append(self.start("ce", slow)[0])

        threads = [threading.Thread(target=post) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(60)
        self.assertEqual(sorted(statuses), [201, 429, 429, 429])

    @_venv_case("ce")
    def test_time_limit(self):
        slow = "import time\nfrom manim import *\nclass Demo(Scene):\n    def construct(self):\n        time.sleep(120)\n"
        old = self.companion.manim_timeout_s
        self.companion.manim_timeout_s = 4.0
        try:
            job_id, _ = self.render("ce", slow)
            started = time.monotonic()
            status = self.wait(job_id, 60)
        finally:
            self.companion.manim_timeout_s = old
        self.assertEqual(status["state"], "failed")
        self.assertIn("did not finish within 4 s", status["error"]["message"])
        self.assertLess(time.monotonic() - started, 30)
        self.assertIsNotNone(self.companion.jobs.get("manim", job_id).proc.poll())

    @_venv_case("ce")
    def test_a_render_is_stopped_when_the_disk_gets_nearly_full(self):
        # Manim's video has no limit of its own: the room of the disk it writes on is its guard
        slow = "import time\nfrom manim import *\nclass Demo(Scene):\n    def construct(self):\n        time.sleep(120)\n"
        job_id, _ = self.render("ce", slow)
        proc = self.companion.jobs.get("manim", job_id).proc
        started = time.monotonic()
        with mock.patch.object(m, "_free_bytes", lambda folder: 300 * 1024 * 1024):
            status = self.wait(job_id, 60)
            # and no render is begun on such a disk
            refused, _, data = self.start("ce", SCENES["ce"])
        self.assertEqual(status["state"], "failed", status)
        self.assertIn("is nearly full: less than 1 GiB is free", status["error"]["message"])
        self.assertLess(time.monotonic() - started, 30)
        self.assertIsNotNone(proc.poll())
        self.assertEqual(refused, 507, data)
        self.assertIn("is nearly full", data["error"]["message"])

    @_venv_case("ce")
    def test_environment_is_minimal_and_the_job_directory_is_the_cwd(self):
        os.environ["MFE_TEST_SECRET"] = "hunter2"
        try:
            probe_code = (
                "import json, os\nfrom manim import *\nclass Demo(Scene):\n    def construct(self):\n"
                "        json.dump({'env': dict(os.environ), 'cwd': os.getcwd()}, open('probe.json', 'w'))\n"
                "        self.add(Square())\n        self.wait(0.1)\n")
            job_id, _ = self.render("ce", probe_code)
            self.wait_done(job_id)
        finally:
            del os.environ["MFE_TEST_SECRET"]
        job = self.companion.jobs.get("manim", job_id)
        with open(os.path.join(job.dir, "probe.json"), encoding="utf-8") as fh:
            seen = json.load(fh)
        self.assertNotIn("MFE_TEST_SECRET", seen["env"])
        self.assertEqual(seen["env"]["HOME"], job.dir)
        self.assertEqual(os.path.realpath(seen["cwd"]), os.path.realpath(job.dir))

    @_venv_case("ce")
    def test_sandbox_confines_reads_writes_and_network(self):
        if not self.companion.sandbox.active():
            self.skipTest("bubblewrap is not usable here")
        secret_dir = tempfile.mkdtemp(prefix="mfe-secret-", dir="/var/tmp")
        secret = os.path.join(secret_dir, "secret.txt")
        with open(secret, "w") as fh:
            fh.write("top secret")
        home = os.path.realpath(os.path.expanduser("~"))
        outside = os.path.join(home, ".mfe-sandbox-write-test")
        try:
            # `mounts`: what of the host shows below a directory the sandbox emptied. The empty file
            # system is one device; whatever sits on another was bound into it from outside.
            code = (
                "import json, os, socket\nfrom manim import *\n"
                "def attempt(fn):\n    try:\n        fn(); return True\n    except Exception:\n        return False\n"
                "def mounts(top, device):\n    found = []\n    for name in sorted(os.listdir(top)):\n"
                "        path = os.path.join(top, name)\n"
                "        if os.lstat(path).st_dev != device:\n            found.append(path)\n"
                "        elif os.path.isdir(path) and not os.path.islink(path):\n"
                "            found += mounts(path, device)\n    return found\n"
                "class Demo(Scene):\n    def construct(self):\n"
                f"        r = {{'read_secret': attempt(lambda: open({secret!r}).read()),\n"
                f"             'mounts': mounts({home!r}, os.stat({home!r}).st_dev),\n"
                f"             'write_home': attempt(lambda: open({outside!r}, 'w').write('x')),\n"
                "             'write_etc': attempt(lambda: open('/etc/mfe-sandbox-test', 'w').write('x')),\n"
                "             'write_cwd': attempt(lambda: open('ok.txt', 'w').write('x')),\n"
                f"             'net': attempt(lambda: socket.create_connection(('127.0.0.1', {self.port}), timeout=3))}}\n"
                "        json.dump(r, open('probe.json', 'w'))\n"
                "        self.add(Square())\n        self.wait(0.1)\n")
            job_id, _ = self.render("ce", code)
            self.wait_done(job_id)
            job = self.companion.jobs.get("manim", job_id)
            with open(os.path.join(job.dir, "probe.json"), encoding="utf-8") as fh:
                seen = json.load(fh)
            # What the render needs below the home directory, and so all of the host it may find
            # there: the virtualenv and the Manim it imports, the user's fonts and fontconfig
            # settings (Pango text), the TeX trees kept there, the job's own directory. A directory
            # inside another of them is not a mount of its own.
            data = os.environ.get("XDG_DATA_HOME") or os.path.join(home, ".local", "share")
            config = os.environ.get("XDG_CONFIG_HOME") or os.path.join(home, ".config")
            needed = [*self.companion.manim_interpreter("ce")["paths"], os.path.join(home, ".fonts"),
                      os.path.join(data, "fonts"), os.path.join(config, "fontconfig"),
                      *m._Sandbox._tex_trees_below([home]), job.dir]
            kept = {os.path.realpath(path) for path in needed}
            kept = {path for path in kept if os.path.isdir(path) and path.startswith(home + os.sep)}
            kept = sorted(path for path in kept if not any(path.startswith(k + os.sep) for k in kept))
        finally:
            shutil.rmtree(secret_dir, ignore_errors=True)
            if os.path.exists(outside):
                os.unlink(outside)
        self.assertFalse(seen["read_secret"])
        # (writing below ~ succeeds inside the sandbox, but into a throw-away tmpfs: asserted below)
        self.assertFalse(seen["write_etc"])
        self.assertFalse(seen["net"])
        self.assertTrue(seen["write_cwd"])
        # below the home directory there is that of the host, and nothing else of it
        self.assertEqual(sorted(seen["mounts"]), kept)
        self.assertFalse(os.path.exists(outside))


class ManimUnsandboxed(ManimBase):
    sandbox = False

    @_venv_case("ce")
    def test_reports_and_runs_without_sandbox(self):
        self.assertIs(self.request("GET", "/health")[2]["capabilities"]["manimSandbox"], False)
        status, _, data = self.start("ce", SCENES["ce"])
        self.assertEqual(status, 201)
        self.assertIs(data["sandboxed"], False)
        self.assertEqual(self.wait(data["id"])["state"], "done")


if __name__ == "__main__":
    unittest.main()
