"""Command line: compile, health and serve."""
import argparse
import contextlib
import http.client
import io
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import types
import unittest
from unittest import mock

from support import COMPANION_DIR, posix_only, remove_folder, requires_tex, serve_environment

import mfe_companion as mfe  # noqa: E402  (support puts the companion on the path)

SCRIPT = os.path.join(COMPANION_DIR, "mfe_companion.py")


def run_cli(*args, timeout=120, env=None):
    full_env = dict(os.environ)
    full_env.pop("MFE_CE_PYTHON", None)
    full_env.pop("MFE_GL_PYTHON", None)
    full_env.update(env or {})
    # What the companion prints is UTF-8 on any system: read as such, not in the code page of this one.
    return subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, encoding="utf-8",
                          timeout=timeout, env=full_env)


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@requires_tex
class Compile(unittest.TestCase):
    def test_compile_prints_tex_json(self):
        proc = run_cli("compile", "--target", "ce", "--latex", "mx+y=0", "--no-disk-cache")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = json.loads(proc.stdout)
        self.assertTrue(data["ok"])
        self.assertEqual([g["label"] for g in data["glyphs"]], "m x + y = 0".split())
        self.assertFalse(data["cached"])
        self.assertIn("<svg", data["svg"])

    def test_compile_prints_utf8_whatever_the_code_page_of_its_output(self):
        # On Windows what Python prints into a pipe or a file goes in the ANSI code page, in which
        # a label such as "α" has no place: `compile … > formula.json` ended in an encoding error.
        # PYTHONIOENCODING gives this run the output of such a machine.
        proc = run_cli("compile", "--target", "ce", "--latex", r"\alpha\to\infty", "--no-disk-cache",
                       env={"PYTHONIOENCODING": "cp1252"})
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual([g["label"] for g in json.loads(proc.stdout)["glyphs"]], ["α", "→", "∞"])

    def test_compile_gl_with_packages_and_preamble(self):
        proc = run_cli("compile", "--target", "gl", "--latex", r"\mycmd + \bm{x}", "--packages", "bm, mathtools",
                       "--preamble", r"\newcommand{\mycmd}{y}", "--no-disk-cache")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = json.loads(proc.stdout)
        self.assertEqual([g["label"] for g in data["glyphs"]], ["y", "+", "x"])

    def test_compile_latex_error_exits_1_with_json(self):
        proc = run_cli("compile", "--target", "ce", "--latex", r"\nonsense", "--no-disk-cache")
        self.assertEqual(proc.returncode, 1)
        data = json.loads(proc.stdout)
        self.assertFalse(data["ok"])
        self.assertEqual(data["error"]["message"], "Undefined control sequence.")
        self.assertEqual(data["error"]["line"], 1)

    def test_compile_invalid_package_exits_2(self):
        proc = run_cli("compile", "--target", "ce", "--latex", "x", "--packages", "a b/c", "--no-disk-cache")
        self.assertEqual(proc.returncode, 2)
        self.assertFalse(json.loads(proc.stdout)["ok"])

    def test_compile_uses_the_disk_cache(self):
        import tempfile

        with tempfile.TemporaryDirectory() as cache:
            env = {"XDG_CACHE_HOME": cache}
            first = json.loads(run_cli("compile", "--target", "ce", "--latex", "cli + cache", env=env).stdout)
            second = json.loads(run_cli("compile", "--target", "ce", "--latex", "cli + cache", env=env).stdout)
            self.assertFalse(first["cached"])
            self.assertTrue(second["cached"])
            self.assertEqual(second["ms"], 0)
            self.assertTrue(os.path.isdir(os.path.join(cache, "mfe-companion")))

    def test_target_is_required_and_validated(self):
        self.assertNotEqual(run_cli("compile", "--latex", "x").returncode, 0)
        self.assertNotEqual(run_cli("compile", "--target", "manim", "--latex", "x").returncode, 0)


class Utf8Output(unittest.TestCase):
    def test_the_streams_become_utf8_and_keep_how_they_treat_what_they_cannot_write(self):
        # Python gives stderr `backslashreplace`, and stdout `surrogateescape` under the C locale,
        # so that a name that is not text (a path of bytes given as an argument) is still printed.
        # A stream reconfigured with an encoding alone would go back to `strict` and raise on it.
        import io
        # newline="\n": the bytes below are then those of any system. Left to itself a stream
        # ends its lines the way of the system, with CR LF on Windows.
        out = io.TextIOWrapper(io.BytesIO(), encoding="cp1252", errors="surrogateescape", newline="\n")
        err = io.TextIOWrapper(io.BytesIO(), encoding="cp1252", errors="backslashreplace", newline="\n")
        with mock.patch.object(mfe.sys, "stdout", out), mock.patch.object(mfe.sys, "stderr", err):
            mfe._utf8_output()
        self.assertEqual((out.encoding, out.errors), ("utf-8", "surrogateescape"))
        self.assertEqual((err.encoding, err.errors), ("utf-8", "backslashreplace"))
        print("α /tmp/caf\udce9", file=err, flush=True)  # a name with a byte that is no UTF-8
        self.assertEqual(err.buffer.getvalue(), "α /tmp/caf\\udce9\n".encode("utf-8"))


class Health(unittest.TestCase):
    def test_health_json_prints_the_health_json(self):
        proc = run_cli("health", "--json")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = json.loads(proc.stdout)
        self.assertEqual(data["name"], "mfe-companion")
        self.assertEqual(data["protocol"], 1)
        self.assertIn("latex", data["capabilities"])
        self.assertIsNone(data["capabilities"]["manimCE"])
        self.assertEqual(data["limits"], {"videoBytes": 4 * 1024 ** 3})

    def test_health_probes_interpreters_from_env(self):
        proc = run_cli("health", "--json", env={"MFE_CE_PYTHON": sys.executable})  # no manim in this interpreter
        self.assertEqual(proc.returncode, 0)
        self.assertIsNone(json.loads(proc.stdout)["capabilities"]["manimCE"])

    def test_health_prints_a_report_of_this_machine(self):
        # Whatever the machine has: a section per thing the companion does, a mark on every
        # line of findings, and plain ASCII, which any terminal prints.
        proc = run_cli("health", env={"MFE_CE_PYTHON": sys.executable})  # no manim in this interpreter
        self.assertEqual(proc.returncode, 0, proc.stderr)
        report = proc.stdout
        self.assertTrue(report.isascii(), report)
        self.assertTrue(report.startswith(f"Manim Formula Editor companion {mfe.VERSION}\nPython "), report)
        for section in ("LaTeX:", "ffmpeg:", "Manim:", "Font text:"):
            self.assertIn(f"\n{section}", report)
        found = shutil.which("latex")
        self.assertIn(f"[ok] latex: " if found else "[--] latex: not found on PATH", report)
        if found:
            self.assertIn(f"({found})", report)
        # The interpreter that was given and has no Manim is told apart from one never given.
        self.assertIn(f"[!!] ManimCE: {sys.executable} did not answer as a Python with ManimCE", report)
        self.assertIn(f'To see why: {sys.executable} -c "import manim"', report)
        # The other one was not asked for: a reminder, not a finding.
        self.assertIn("[  ] ManimGL: not checked. Add --gl-python PATH (or set MFE_GL_PYTHON) to check it too.",
                      report)
        self.assertIn("[--] no Manim interpreter answered", report)
        self.assertRegex(report, r"\n\d+ things? marked \[--\] or \[!!\] above")
        self.assertTrue(report.rstrip().endswith("health --json"))

    def test_health_without_interpreters_checks_latex_and_ffmpeg_and_recalls_the_options(self):
        proc = run_cli("health")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        report = proc.stdout
        self.assertTrue(report.isascii(), report)
        for section in ("LaTeX:", "ffmpeg:"):
            self.assertIn(f"\n{section}", report)
        self.assertNotIn("\nManim:", report)
        self.assertNotIn("\nFont text:", report)
        self.assertNotIn("ManimCE:", report)
        self.assertIn("\nManim and font text: not checked (no interpreter was given)\n", report)
        for line in ("    health --ce-python PATH                    ManimCE",
                     "    health --gl-python PATH                    ManimGL",
                     "    health --ce-python PATH --gl-python PATH   both"):
            self.assertIn(f"\n{line}\n", report)
        self.assertIn("MFE_CE_PYTHON and MFE_GL_PYTHON", report)
        if all(shutil.which(tool) for tool in ("latex", "dvisvgm", "ffmpeg")) and "[--]" not in report \
                and "[!!]" not in report:
            self.assertIn("\nLaTeX and ffmpeg are ready here.\n", report)

    def test_the_report_names_the_temporary_folder_as_a_message_says_a_folder(self):
        # By its long name where Windows gives a short one (`folder_as_said`).
        with mock.patch.dict(os.environ):
            for name in ("MFE_CE_PYTHON", "MFE_GL_PYTHON"):
                os.environ.pop(name, None)
            companion = mfe.Companion(disk_cache=False)
            self.addCleanup(companion.shutdown)
            with mock.patch.object(mfe, "folder_as_said", lambda folder: f"<{folder}>"):
                video = mfe.health_facts(companion)["video"]
        self.assertEqual(video["folder"], f"<{tempfile.gettempdir()}>")
        self.assertEqual(video["limitBytes"], 4 * 1024 ** 3)


def facts(**changes):
    """What a machine with everything gives the report, with ``changes`` on top."""
    base = {
        "version": "9.9.9",
        "python": {"version": "3.13.0", "path": "/usr/bin/python3"},
        "latex": {"path": "/usr/bin/latex", "version": "pdfTeX 3.14 (TeX Live 2026)"},
        "dvisvgm": {"path": "/usr/bin/dvisvgm", "version": "dvisvgm 3.6", "ok": True},
        "sandbox": "bubblewrap",
        "ffmpeg": {"path": "/usr/bin/ffmpeg", "version": "8.1",
                   "encoders": ["aac", "gif", "libopus", "libvpx-vp9", "libx264", "prores_ks"]},
        "video": {"limitBytes": 4 * 1024 ** 3, "folder": "/tmp", "freeBytes": 15 * 1024 ** 3 + 512 * 1024 ** 2},
        "manim": {"ce": {"given": "/venv/ce/bin/python", "python": "/venv/ce/bin/python", "version": "0.22.1"},
                  "gl": {"given": "/venv/gl/bin/python", "python": "/venv/gl/bin/python", "version": "1.7.2"}},
        "text": {"ce": {"ok": True, "families": 312}, "gl": {"ok": True, "families": 312}},
    }
    base.update(changes)
    return base


class HealthReport(unittest.TestCase):
    """The report by what a machine has, whatever this one has."""

    def report(self, platform="linux", manager="dnf", **changes):
        return mfe.format_health(facts(**changes), platform=platform, manager=manager)

    def test_a_machine_with_everything_has_nothing_to_fix(self):
        report = self.report()
        self.assertNotIn("[--]", report)
        self.assertNotIn("[!!]", report)
        self.assertNotIn("To get it", report)
        self.assertIn("Everything that was checked is ready here.", report)
        self.assertIn("  [ok] latex: pdfTeX 3.14 (TeX Live 2026) (/usr/bin/latex)", report)
        self.assertIn("  [ok] sandbox: bubblewrap", report)
        self.assertIn("  [ok] MP4 (H.264): libx264, sound aac", report)
        self.assertIn("  [ok] WebM (VP9): libvpx-vp9, sound libopus", report)
        self.assertIn("  [ok] MOV (ProRes): prores_ks, sound aac", report)
        self.assertIn("  [ok] GIF: gif", report)
        self.assertIn("  [ok] ManimCE 0.22.1: /venv/ce/bin/python", report)
        self.assertIn("  [ok] with ManimGL: 312 font families", report)
        self.assertIn("--allow-manim-render; it would run inside the bubblewrap sandbox", report)
        self.assertTrue(report.isascii())

    def test_it_says_where_a_video_is_written_its_limit_and_what_changes_them(self):
        note = ("  note: a video is written in /tmp (15.5 GiB free) while it is encoded, 4 GiB at most;\n"
                "        `serve --max-video-gib N` gives another limit (1 to 64), and TMPDIR another folder.\n")
        report = self.report()
        self.assertIn(note, report)
        self.assertLess(report.index("  [ok] GIF: gif"), report.index(note))
        self.assertLess(report.index(note), report.index("\nManim:"))
        # a disk that cannot be asked: the folder and the limit alone
        unknown = self.report(video={"limitBytes": 4 * 1024 ** 3, "folder": "/tmp", "freeBytes": None})
        self.assertIn("  note: a video is written in /tmp while it is encoded, 4 GiB at most;", unknown)
        # no ffmpeg, no video to write
        without = self.report(ffmpeg={"path": None, "version": "", "encoders": []})
        self.assertNotIn("a video is written", without)

    def test_missing_tools_say_what_they_cost_and_how_to_get_them_here(self):
        missing = {"latex": {"path": None, "version": ""},
                   "dvisvgm": {"path": None, "version": "", "ok": False},
                   "ffmpeg": {"path": None, "version": "", "encoders": []}}
        for manager, platform, latex, ffmpeg in (
            ("apt", "linux", "sudo apt install texlive texlive-latex-extra dvisvgm", "sudo apt install ffmpeg"),
            ("dnf", "linux", "sudo dnf install texlive-scheme-full", "sudo dnf install ffmpeg"),
            ("pacman", "linux", "sudo pacman -S texlive", "sudo pacman -S ffmpeg"),
            ("brew", "darwin", "brew install --cask mactex-no-gui", "brew install ffmpeg"),
            ("windows", "win32", "install MiKTeX (https://miktex.org/download)", "winget install Gyan.FFmpeg"),
            ("", "linux", "install TeX Live (https://tug.org/texlive/)", "install ffmpeg (https://ffmpeg.org/"),
        ):
            with self.subTest(manager=manager):
                report = self.report(platform=platform, manager=manager, **missing)
                self.assertIn("  [--] latex: not found on PATH\n"
                              "       Without it the app draws formulas with MathJax: close, not exact.\n"
                              f"       To get it: {latex}", report)
                self.assertIn("  [--] dvisvgm: not found on PATH", report)
                self.assertIn("  [--] ffmpeg: not found on PATH\n"
                              "       Without it the companion encodes no video; the app still exports with the "
                              "browser's encoder.\n"
                              f"       To get it: {ffmpeg}", report)
                self.assertIn("open a new terminal", report)
                # No sandbox line for a LaTeX that is not there, and no format of an absent ffmpeg.
                self.assertNotIn("sandbox", report.split("ffmpeg:")[0])
                self.assertNotIn("MP4", report)
                self.assertIn("3 things marked [--] or [!!] above", report)

    def test_an_old_dvisvgm_is_a_problem_not_an_absence(self):
        report = self.report(dvisvgm={"path": "/usr/bin/dvisvgm", "version": "dvisvgm 2.3.1", "ok": False})
        self.assertIn("  [!!] dvisvgm: dvisvgm 2.3.1 is older than 2.4, which Manim's glyphs need (/usr/bin/dvisvgm)",
                      report)
        self.assertIn("1 thing marked [--] or [!!] above", report)

    def test_an_ffmpeg_without_an_encoder_names_the_format_it_costs(self):
        # Fedora's own ffmpeg: no x264 and no native AAC encoder checked here.
        report = self.report(ffmpeg={"path": "/usr/bin/ffmpeg", "version": "7.1",
                                     "encoders": ["gif", "libopus", "libvpx-vp9", "prores_ks", "libopenh264"]})
        self.assertIn("  [ok] ffmpeg: 7.1 (/usr/bin/ffmpeg)", report)
        self.assertIn("  [!!] MP4 (H.264): this ffmpeg has no libx264 encoder, so that format fails\n"
                      "       To fix it: install an ffmpeg built with that encoder. sudo dnf install ffmpeg   "
                      "(the one of RPM Fusion", report)
        self.assertIn("  [!!] MOV (ProRes): video yes (prores_ks); no aac encoder, so no sound in that format", report)
        self.assertIn("  [ok] WebM (VP9): libvpx-vp9, sound libopus", report)
        self.assertIn("  [ok] GIF: gif", report)
        self.assertIn("2 things marked", report)

    def test_no_sandbox_is_a_fix_on_linux_and_a_note_elsewhere(self):
        linux = self.report(sandbox="none (bwrap not installed)")
        self.assertIn("  [--] sandbox: none (bwrap not installed)\n"
                      "       LaTeX runs unconfined: a page that reaches the companion could make it read your files.\n"
                      "       To get it: sudo dnf install bubblewrap", linux)
        self.assertIn("it would run WITHOUT a sandbox, with all your permissions", linux)
        # What the companion itself says of its sandbox: turned off by its user, or not of this system.
        with mock.patch.object(mfe.sys, "platform", "linux"):
            self.assertEqual(mfe._Sandbox(enabled=False).status(), "none (disabled)")
        for system in ("darwin", "win32"):
            with mock.patch.object(mfe.sys, "platform", system):
                self.assertEqual(mfe._Sandbox().status(), "none (bubblewrap is Linux's)")
        mac = self.report(platform="darwin", manager="brew", sandbox="none (bubblewrap is Linux's)")
        self.assertNotIn("[--] sandbox", mac)
        self.assertIn("note: no sandbox on this system (bubblewrap is Linux's)", mac)
        self.assertNotIn("install bubblewrap", mac)
        self.assertIn("Everything that was checked is ready here.", mac)

    def test_manim_and_font_text_by_what_was_given_and_what_answered(self):
        absent = {"given": None, "python": None, "version": None}
        # Nothing given: LaTeX and ffmpeg are the whole check, and the options are recalled.
        none = self.report(manim={"ce": absent, "gl": absent}, text={})
        self.assertIn("Manim and font text: not checked (no interpreter was given)\n"
                      "  To check them too, run this command again with the Python of each Manim you use,\n"
                      "  both or either:\n"
                      "    health --ce-python PATH                    ManimCE\n"
                      "    health --gl-python PATH                    ManimGL\n"
                      "    health --ce-python PATH --gl-python PATH   both\n", none)
        self.assertIn("`serve` takes; MFE_CE_PYTHON and MFE_GL_PYTHON set them too.", none)
        # Where a virtualenv keeps its Python: said as the system has it.
        self.assertIn("(its virtualenv's\n  bin/python). They are", none)
        there = self.report(platform="win32", manager="windows", manim={"ce": absent, "gl": absent}, text={})
        self.assertIn("(its virtualenv's\n  Scripts\\python.exe). They are", there)
        self.assertNotIn("  bin/python)", there)
        for absent_text in ("\nManim:", "\nFont text:", "[--]", "[!!]", "--allow-manim-render", "ManimCE:"):
            self.assertNotIn(absent_text, none)
        self.assertIn("\nLaTeX and ffmpeg are ready here.\n", none)
        # A problem of LaTeX or ffmpeg is still counted there.
        self.assertIn("1 thing marked", self.report(manim={"ce": absent, "gl": absent}, text={},
                                                    ffmpeg={"path": None, "version": "", "encoders": []}))

        # One given: it is checked, and the other is one option away, which is no finding.
        one = self.report(manim={"ce": absent,
                                 "gl": {"given": "/venv/gl/bin/python", "python": "/venv/gl/bin/python",
                                        "version": "1.7.2"}},
                          text={"gl": {"ok": True, "families": 312}})
        self.assertIn("\nManim: Render with Manim, and the shapes of font text\n"
                      "  [  ] ManimCE: not checked. Add --ce-python PATH (or set MFE_CE_PYTHON) to check it too.\n"
                      "  [ok] ManimGL 1.7.2: /venv/gl/bin/python\n", one)
        self.assertIn("  [ok] with ManimGL: 312 font families", one)
        self.assertNotIn("with ManimCE", one)
        self.assertIn("\nEverything that was checked is ready here.\n", one)

        broken = self.report(
            manim={"ce": {"given": "/venv/ce/bin/python", "python": "/venv/ce/bin/python", "version": "0.22.1"},
                   "gl": {"given": "python3.9", "python": None, "version": None}},
            text={"ce": {"ok": False, "message": "Pango 1.50 or newer is required."}})
        self.assertIn("  [!!] ManimGL: python3.9 did not answer as a Python with ManimGL\n"
                      '       To see why: python3.9 -c "import manimlib"\n'
                      "       To install it there: python3.9 -m pip install manimgl", broken)
        self.assertIn("  [!!] with ManimCE: Pango 1.50 or newer is required.\n"
                      "       Font text needs Linux, with Pango 1.50 or newer, Cairo and Fontconfig.", broken)
        windows = self.report(platform="win32", manager="windows", sandbox="none (disabled)",
                              text={"ce": {"ok": False, "message": "Native text mapping currently requires the "
                                                                   "Linux Pango/Fontconfig backend."}})
        self.assertIn("       Font text works on Linux only for now; here it shows as placeholder boxes.", windows)

    def test_the_way_software_is_installed_is_read_off_the_system(self):
        with tempfile.TemporaryDirectory() as tmp:
            def manager(text, platform="linux"):
                path = os.path.join(tmp, "os-release")
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(text)
                return mfe._package_manager(platform, path)
            self.assertEqual(manager('NAME="Fedora Linux"\nID=fedora\nVERSION_ID=44\n'), "dnf")
            self.assertEqual(manager('ID=ubuntu\nID_LIKE=debian\n'), "apt")
            self.assertEqual(manager('ID=linuxmint\nID_LIKE="ubuntu debian"\n'), "apt")
            self.assertEqual(manager('ID=rocky\nID_LIKE="rhel centos fedora"\n'), "dnf")
            self.assertEqual(manager('ID=manjaro\nID_LIKE=arch\n'), "pacman")
            self.assertEqual(manager('ID=void\n'), "")
            self.assertEqual(manager('ID=fedora\n', "darwin"), "brew")
            self.assertEqual(manager('ID=fedora\n', "win32"), "windows")
            self.assertEqual(mfe._package_manager("linux", os.path.join(tmp, "absent")), "")


def _origin_status(port, origin):
    """HTTP status of GET /health with the given Origin, once the server is up (polls for it)."""
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            conn.request("GET", "/health", headers={"Origin": origin})
            resp = conn.getresponse()
            resp.read()
            return resp.status, resp.getheader("Access-Control-Allow-Origin")
        except OSError:
            time.sleep(0.2)
    raise AssertionError("server did not come up")


def serve_and_probe(*args, env=None):
    """Run `serve --port <free> ...`, request /health with Origin: null, stop it; returns (status, acao, stderr)."""
    port = free_port()
    full_env = dict(os.environ)
    full_env.pop("MFE_ALLOW_FILE_ORIGIN", None)
    full_env.update(env or {})
    with serve_environment(full_env) as own:
        proc = subprocess.Popen([sys.executable, SCRIPT, "serve", "--port", str(port), "--no-disk-cache", *args],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=own)
        try:
            status, acao = _origin_status(port, "null")
            ok_status, _ = _origin_status(port, "http://localhost:5173")
            assert ok_status == 200
        finally:
            proc.terminate()
            try:
                _, stderr = proc.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                _, stderr = proc.communicate()
    return status, acao, stderr


class ServeApp(unittest.TestCase):
    def test_app_dir_without_index_exits_2(self):
        with tempfile.TemporaryDirectory() as empty:
            proc = run_cli("serve", "--port", str(free_port()), "--no-disk-cache", "--app", empty, timeout=60)
        self.assertEqual(proc.returncode, 2)
        self.assertIn("index.html", proc.stderr)

    def test_serves_the_app_and_says_where(self):
        with tempfile.TemporaryDirectory() as dist, serve_environment() as own:
            with open(os.path.join(dist, "index.html"), "w", encoding="utf-8") as fh:
                fh.write("<title>mfe</title>")
            port = free_port()
            proc = subprocess.Popen([sys.executable, SCRIPT, "serve", "--port", str(port), "--no-disk-cache",
                                     "--app", dist], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                    env=own)
            try:
                status, _ = _origin_status(port, "http://localhost:5173")  # waits for the server
                self.assertEqual(status, 200)
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                conn.request("GET", "/app/")
                resp = conn.getresponse()
                body = resp.read()
                conn.close()
                self.assertEqual(resp.status, 200)
                self.assertIn(b"<title>mfe</title>", body)
            finally:
                proc.terminate()
                try:
                    _, stderr = proc.communicate(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    _, stderr = proc.communicate()
        self.assertIn(f"http://127.0.0.1:{port}/app/", stderr)


class FileOrigin(unittest.TestCase):
    def test_null_origin_is_refused_by_default(self):
        status, acao, stderr = serve_and_probe()
        self.assertEqual(status, 403)
        self.assertIsNone(acao)
        self.assertNotIn("'null' origin is accepted", stderr)

    def test_flag_accepts_null_origin_and_warns(self):
        status, acao, stderr = serve_and_probe("--allow-file-origin")
        self.assertEqual(status, 200)
        self.assertEqual(acao, "null")
        self.assertIn("'null' origin is accepted", stderr)
        self.assertIn("any web page", stderr)

    def test_env_accepts_null_origin_and_warns(self):
        status, acao, stderr = serve_and_probe(env={"MFE_ALLOW_FILE_ORIGIN": "1"})
        self.assertEqual(status, 200)
        self.assertEqual(acao, "null")
        self.assertIn("'null' origin is accepted", stderr)

    def test_env_zero_does_not_enable_it(self):
        status, _, _ = serve_and_probe(env={"MFE_ALLOW_FILE_ORIGIN": "0"})
        self.assertEqual(status, 403)

    def test_stronger_warning_without_sandbox(self):
        status, _, stderr = serve_and_probe("--allow-file-origin", "--no-sandbox")
        self.assertEqual(status, 200)
        self.assertIn("WARNING: no LaTeX sandbox is active and the 'null' origin is accepted", stderr)
        self.assertIn("read local files", stderr)

    def test_no_stronger_warning_without_the_flag(self):
        _, _, stderr = serve_and_probe("--no-sandbox")
        self.assertNotIn("WARNING: no LaTeX sandbox is active and the 'null' origin", stderr)
        self.assertIn("LaTeX runs unconfined", stderr)


class NoSandboxHelp(unittest.TestCase):
    """`--no-sandbox` turns off the one bubblewrap sandbox of the companion, which confines LaTeX,
    Render with Manim, the sound pass of its video and the font-text worker (`_Sandbox.wrap`): the
    help of `serve` names them all; `compile` runs LaTeX alone."""

    @staticmethod
    def help_of(command):
        parser = mfe.build_parser()
        commands = next(a for a in parser._actions if isinstance(a, argparse._SubParsersAction))
        return next(a.help for a in commands.choices[command]._actions if "--no-sandbox" in a.option_strings)

    def test_serve_names_everything_it_leaves_unconfined(self):
        self.assertEqual(self.help_of("serve"),
                         "do not confine anything with bubblewrap: LaTeX, Render with Manim and the sound of "
                         "its video, and the font-text worker then run with all your permissions "
                         "(env: MFE_NO_SANDBOX=1)")

    def test_compile_runs_latex_alone(self):
        self.assertEqual(self.help_of("compile"), "do not confine latex with bubblewrap")


class ServeNotices(unittest.TestCase):
    """What `serve` says at its start of what runs confined. Linux has bubblewrap and is told to
    install it; macOS and Windows have no sandbox to install, and their LaTeX is MacTeX or MiKTeX."""

    ELSEWHERE = ("darwin", "win32")

    def notices(self, platform, **options):
        given = {"sandbox": "none (disabled)" if platform == "linux" else "none (bubblewrap is Linux's)",
                 "manim_render": False, "manim_sandboxed": False, "file_origin": False, **options}
        return mfe.confinement_notices(platform=platform, **given)

    def test_linux_is_told_to_install_bubblewrap(self):
        self.assertEqual(self.notices("linux"), [
            "warning: LaTeX runs unconfined; TeX Live 2026 can no longer forbid reading files outside the "
            "working directory (openin_any is a no-op). Install bubblewrap (bwrap) on Linux, or only "
            "use this companion with pages you trust."])
        self.assertEqual(self.notices("linux", file_origin=True), [
            "WARNING: no LaTeX sandbox is active and the 'null' origin is accepted: any web page can make "
            "LaTeX read local files (TeX Live 2026 no longer restricts reading, openin_any is a no-op) "
            "and get their content back. Install bubblewrap (bwrap) on Linux, or drop "
            "--allow-file-origin."])
        self.assertEqual(self.notices("linux", manim_render=True)[0],
                         "WARNING: Render with Manim is enabled and NO sandbox is active: the Python code the app "
                         "sends runs with all your permissions. Only use this companion with pages you trust "
                         "(install bubblewrap on Linux for confinement).")

    def test_a_sandbox_warns_of_nothing(self):
        self.assertEqual(self.notices("linux", sandbox="bubblewrap", file_origin=True), [])
        self.assertEqual(self.notices("linux", sandbox="bubblewrap", manim_render=True, manim_sandboxed=True), [
            "Render with Manim: enabled. It runs the Python code the app sends, inside the bubblewrap "
            "sandbox (read-only file system, no network, only its job directory writable)."])

    def test_other_systems_are_not_told_to_install_what_they_cannot(self):
        for platform in self.ELSEWHERE:
            for options in ({}, {"manim_render": True}, {"file_origin": True},
                            {"manim_render": True, "file_origin": True}):
                with self.subTest(platform=platform, **options):
                    text = "\n".join(self.notices(platform, **options))
                    self.assertNotIn("bubblewrap", text)
                    self.assertNotIn("bwrap", text)
                    self.assertNotIn("TeX Live", text)
                    self.assertNotIn("openin_any", text)

    def test_other_systems_say_what_is_not_confined_there(self):
        for platform in self.ELSEWHERE:
            with self.subTest(platform=platform):
                self.assertEqual(self.notices(platform), [
                    "warning: LaTeX runs unconfined: this system has no sandbox for it, and LaTeX can read the "
                    "files you can read. Only use this companion with pages you trust."])
                self.assertEqual(self.notices(platform, file_origin=True), [
                    "WARNING: no LaTeX sandbox is active and the 'null' origin is accepted: any web page can make "
                    "LaTeX read local files and get their content back. This system has no sandbox for LaTeX: "
                    "serve the built app with --app instead of opening it from a file, or drop "
                    "--allow-file-origin."])
                self.assertEqual(self.notices(platform, manim_render=True), [
                    "WARNING: Render with Manim is enabled and this system has no sandbox for it: the Python "
                    "code the app sends runs with all your permissions. Only use this companion with pages "
                    "you trust.",
                    "warning: LaTeX runs unconfined: this system has no sandbox for it, and LaTeX can read the "
                    "files you can read. Only use this companion with pages you trust."])


class VideoLimit(unittest.TestCase):
    """`serve --max-video-gib`: the largest video one job writes (companion 1.7)."""

    @staticmethod
    def parse(*args):
        return mfe.build_parser().parse_args(["serve", *args])

    def test_the_default_is_four_gib(self):
        self.assertEqual(self.parse().max_video_gib, 4)
        self.assertEqual(mfe.MAX_OUTPUT_BYTES, 4 * 1024 ** 3)
        self.assertEqual(mfe.JobManager().max_video_bytes, 4 * 1024 ** 3)

    def test_it_takes_a_whole_number_of_gib_within_its_bounds(self):
        for text, value in (("1", 1), ("8", 8), ("16", 16), ("64", 64)):
            self.assertEqual(self.parse("--max-video-gib", text).max_video_gib, value)
        for bad in ("0", "65", "-4", "1.5", "8GB", ""):
            with self.subTest(bad), contextlib.redirect_stderr(io.StringIO()) as err:
                with self.assertRaises(SystemExit) as ctx:
                    self.parse(f"--max-video-gib={bad}")
                self.assertEqual(ctx.exception.code, 2)
                self.assertIn("a whole number from 1 to 64 is required", err.getvalue())

    def test_a_value_out_of_bounds_starts_no_server(self):
        proc = run_cli("serve", "--port", str(free_port()), "--no-disk-cache", "--max-video-gib", "65", timeout=60)
        self.assertEqual(proc.returncode, 2)
        self.assertIn("--max-video-gib: a whole number from 1 to 64 is required, not '65'", proc.stderr)
        self.assertNotIn("listening", proc.stderr)

    def test_the_companion_is_given_the_limit_in_bytes(self):
        companion = mfe.Companion(disk_cache=False, max_video_bytes=8 * mfe.GIB)
        try:
            self.assertEqual(companion.jobs.max_video_bytes, 8 * 1024 ** 3)
            self.assertEqual(companion.health()["limits"], {"videoBytes": 8 * 1024 ** 3})
        finally:
            companion.shutdown()

    def test_serve_says_a_limit_that_is_not_the_default_one(self):
        gib = mfe.GIB
        self.assertEqual(mfe.video_limit_notices(4 * gib, "/tmp", 2 * gib), [])
        self.assertEqual(mfe.video_limit_notices(8 * gib, "/tmp", 100 * gib), [
            "Videos: up to 8 GiB each (--max-video-gib), written in /tmp while they are encoded."])
        # a disk that cannot hold a video of that size with the reserve the jobs leave: said at once
        self.assertEqual(mfe.video_limit_notices(16 * gib, "/tmp", 8 * gib), [
            "Videos: up to 16 GiB each (--max-video-gib), written in /tmp while they are encoded.",
            "warning: /tmp has 8 GiB free: a video is stopped when less than 1 GiB is left there, before it "
            "reaches 16 GiB. Set TMPDIR to a folder on a disk with more room to use the whole limit."])
        self.assertEqual(len(mfe.video_limit_notices(8 * gib, "/tmp", 9 * gib)), 1)  # the limit and the reserve
        self.assertEqual(len(mfe.video_limit_notices(8 * gib, "/tmp", 9 * gib - 1)), 2)
        self.assertEqual(len(mfe.video_limit_notices(8 * gib, "/tmp", None)), 1)  # a disk that cannot be asked
        self.assertEqual(len(mfe.video_limit_notices(2 * gib, "/tmp", 100 * gib)), 1)  # a lower limit is said too

    def test_a_server_started_with_a_limit_says_it_and_reports_it(self):
        port = free_port()
        with serve_environment() as own:
            proc = subprocess.Popen([sys.executable, SCRIPT, "serve", "--port", str(port), "--no-disk-cache",
                                     "--max-video-gib", "2"], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    text=True, env=own)
            try:
                _origin_status(port, "http://localhost:5173")  # waits for the server
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                conn.request("GET", "/health")
                health = json.loads(conn.getresponse().read())
                conn.close()
            finally:
                proc.terminate()
                try:
                    _, stderr = proc.communicate(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    _, stderr = proc.communicate()
            self.assertEqual(health["limits"], {"videoBytes": 2 * 1024 ** 3})
            # the folder as it was given, but by its long name where Windows gave a short one
            # (`folder_as_said`): there a name with a `~` in it, and none in what is said
            folder = own["TMPDIR"]
            if os.name == "nt" and "~" in folder:
                folder = os.path.realpath(folder)
                self.assertNotIn("~", folder)
            self.assertIn(f"Videos: up to 2 GiB each (--max-video-gib), written in {folder} while", stderr)

    def test_a_server_started_without_one_says_nothing_of_it(self):
        _, _, stderr = serve_and_probe()
        self.assertNotIn("Videos:", stderr)
        self.assertNotIn("--max-video-gib", stderr)


class ServeEnvironment(unittest.TestCase):
    """A server that a test ends cannot clean up after itself on Windows: its temporary files are
    in a folder of the test's, which goes with the test."""

    def test_it_names_a_folder_of_its_own_and_no_interpreter(self):
        given = {"PATH": "/usr/bin", "TMPDIR": "/elsewhere", "MFE_CE_PYTHON": "/ce", "MFE_GL_PYTHON": "/gl"}
        with serve_environment(given) as env:
            folder = env["TMPDIR"]
            self.assertTrue(os.path.isdir(folder))
            self.assertEqual(env, {"PATH": "/usr/bin", "TMPDIR": folder, "TEMP": folder, "TMP": folder})
        self.assertFalse(os.path.exists(folder))
        self.assertEqual(given["TMPDIR"], "/elsewhere")  # the caller's own is not touched
        with serve_environment(given, manim=True) as env:
            self.assertEqual((env["MFE_CE_PYTHON"], env["MFE_GL_PYTHON"]), ("/ce", "/gl"))

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg is required")
    def test_a_server_ended_at_once_leaves_nothing_behind(self):
        # `kill()` plays what `terminate()` is on Windows: the process ends with nothing cleaned up.
        port = free_port()
        with serve_environment() as env:
            folder = env["TMPDIR"]
            proc = subprocess.Popen([sys.executable, SCRIPT, "serve", "--port", str(port), "--no-disk-cache",
                                     "--no-sandbox"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
            try:
                _origin_status(port, "http://localhost:5173")  # waits for the server
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
                conn.request("POST", "/video", json.dumps({
                    "format": "mp4", "quality": "low", "width": 64, "height": 48, "fps": 10, "frames": 20,
                }), {"Content-Type": "application/json", "Origin": "http://localhost:5173"})
                self.assertEqual(conn.getresponse().status, 201)
                conn.close()
            finally:
                proc.kill()
                proc.wait(10)
            # The folder of its jobs is still there, as it was in TEMP on Windows.
            self.assertTrue(any(name.startswith("mfe-jobs-") for name in os.listdir(folder)))
        self.assertFalse(os.path.exists(folder))

    def test_a_folder_a_process_still_holds_goes_once_it_lets_go(self):
        # What Windows does while the ffmpeg of a server that was ended is still ending.
        folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, folder, True)
        with open(os.path.join(folder, "held"), "w", encoding="utf-8"):
            pass
        refusals, pauses = [PermissionError(13, "in use"), PermissionError(13, "in use")], []

        def rmtree(path):
            if refusals:
                raise refusals.pop()
            shutil.rmtree(path)

        self.assertTrue(remove_folder(folder, rmtree=rmtree, sleep=pauses.append))
        self.assertFalse(os.path.exists(folder))
        self.assertEqual(pauses, [0.1, 0.1])
        # gone already: nothing to wait for
        self.assertTrue(remove_folder(folder, sleep=pauses.append))
        self.assertEqual(len(pauses), 2)

    def test_a_folder_that_is_never_let_go_is_left_and_nothing_is_raised(self):
        calls, pauses = [], []

        def rmtree(path):
            calls.append(path)
            raise PermissionError(13, "in use")

        self.assertFalse(remove_folder("held", tries=3, rmtree=rmtree, sleep=pauses.append))
        self.assertEqual(calls, ["held"] * 3)
        self.assertEqual(len(pauses), 2)  # no wait after the last try


@requires_tex
class Serve(unittest.TestCase):
    def test_serve_answers_and_stops(self):
        port = free_port()
        environment = serve_environment()
        own = environment.__enter__()
        self.addCleanup(environment.__exit__, None, None, None)
        proc = subprocess.Popen([sys.executable, SCRIPT, "serve", "--port", str(port), "--no-disk-cache"],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=own)
        try:
            deadline = time.monotonic() + 30
            health = None
            while time.monotonic() < deadline:
                try:
                    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                    conn.request("GET", "/health")
                    health = json.loads(conn.getresponse().read())
                    break
                except OSError:
                    time.sleep(0.2)
            self.assertIsNotNone(health, "server did not come up")
            self.assertEqual(health["name"], "mfe-companion")
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=60)
            body = json.dumps({"latex": r"\frac{a}{b}", "target": "ce", "packages": [], "preamble": ""})
            conn.request("POST", "/tex", body, {"Content-Type": "application/json"})
            data = json.loads(conn.getresponse().read())
            self.assertEqual([g["label"] for g in data["glyphs"]], ["a", "—", "b"])
        finally:
            proc.terminate()
            try:
                proc.wait(10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
            proc.stdout.close()
            proc.stderr.close()
        self.assertIsNotNone(proc.returncode)
        # nothing listens any more
        with socket.socket() as s:
            self.assertNotEqual(s.connect_ex(("127.0.0.1", port)), 0)

    def test_serve_fails_cleanly_when_port_is_taken(self):
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            s.listen(1)
            port = s.getsockname()[1]
            proc = run_cli("serve", "--port", str(port), "--no-disk-cache", timeout=30)
        self.assertEqual(proc.returncode, 1)
        self.assertIn("Cannot listen", proc.stderr)


if __name__ == "__main__":
    unittest.main()


class Signals(unittest.TestCase):
    """`kill` and the terminal closing stop the server in order, as Ctrl+C does: what it kept in
    the temporary directory goes with it."""

    def stopped_by(self, signum, ignore_hangup=False, again=False):
        port = free_port()
        with tempfile.TemporaryDirectory() as tmp:
            env = dict(os.environ, TMPDIR=tmp)
            command = [sys.executable, SCRIPT, "serve", "--port", str(port), "--no-disk-cache"]
            if ignore_hangup:  # what nohup does before it runs the program
                command = [sys.executable, "-c",
                           "import os, signal, sys; signal.signal(signal.SIGHUP, signal.SIG_IGN); "
                           "os.execv(sys.executable, [sys.executable] + sys.argv[1:])", *command[1:]]
            # Ctrl+Break goes to a group of processes of this console: the server starts as one of
            # its own, or the tests would get the key too.
            group = ({"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
                     if signum == getattr(signal, "CTRL_BREAK_EVENT", None) else {})
            proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env,
                                    **group)
            try:
                _origin_status(port, "http://localhost:5173")
                if shutil.which("ffmpeg"):  # a job: files of the companion's in the temporary directory
                    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
                    conn.request("POST", "/video", json.dumps({
                        "format": "mp4", "quality": "low", "width": 64, "height": 48, "fps": 10, "frames": 20,
                    }), {"Content-Type": "application/json", "Origin": "http://localhost:5173"})
                    self.assertEqual(conn.getresponse().status, 201)
                    conn.close()
                    self.assertTrue(any(name.startswith("mfe-jobs-") for name in os.listdir(tmp)))
                try:
                    proc.send_signal(signum)
                except OSError as exc:
                    if group:  # the tests run without a console (a service): no key can be sent
                        self.skipTest(f"Ctrl+Break could not be sent from here: {exc}")
                    raise
                while again and proc.poll() is None:  # the same signal, for as long as it is there
                    try:
                        proc.send_signal(signum)
                    except ProcessLookupError:
                        break
                    time.sleep(0.001)
                try:
                    code = proc.wait(timeout=5 if ignore_hangup else 20)
                except subprocess.TimeoutExpired:
                    code = None
                left = os.listdir(tmp)
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    try:
                        proc.wait(timeout=20)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                self.printed = proc.communicate()[1]
            return code, left

    @posix_only  # Windows has the name SIGTERM, and ends the process at once with it
    def test_kill_stops_it_in_order(self):
        self.assertEqual(self.stopped_by(signal.SIGTERM), (0, []))

    @unittest.skipUnless(hasattr(signal, "SIGHUP"), "no SIGHUP here")
    def test_closing_the_terminal_stops_it_in_order(self):
        # the default action of SIGHUP would end the process at once, its files left behind
        self.assertEqual(self.stopped_by(signal.SIGHUP), (0, []))

    @unittest.skipUnless(hasattr(signal, "SIGHUP"), "no SIGHUP here")
    def test_a_hang_up_that_comes_again_does_not_cut_the_stop_short(self):
        # A terminal that closes hangs up more than once: the system tells the processes of the
        # terminal, and the shell its jobs. Seen on macOS with zsh: the second one came in the
        # middle of the clean-up, which ended there, with a traceback and the directory left.
        self.assertEqual(self.stopped_by(signal.SIGHUP, again=True), (0, []))
        self.assertNotIn("Traceback", self.printed)

    @posix_only  # Windows has the name SIGTERM, and ends the process at once with it
    def test_a_kill_that_comes_again_does_not_cut_the_stop_short(self):
        self.assertEqual(self.stopped_by(signal.SIGTERM, again=True), (0, []))
        self.assertNotIn("Traceback", self.printed)

    @unittest.skipUnless(hasattr(signal, "SIGHUP"), "no SIGHUP here")
    def test_a_hang_up_the_caller_ignores_stays_ignored(self):
        code, _ = self.stopped_by(signal.SIGHUP, ignore_hangup=True)
        self.assertIsNone(code)  # still serving: nohup keeps it

    @unittest.skipUnless(hasattr(signal, "CTRL_BREAK_EVENT"), "Ctrl+Break is a key of Windows")
    def test_ctrl_break_stops_it_in_order(self):
        # it comes as SIGBREAK, whose default action ends the process at once, its files left behind
        self.assertEqual(self.stopped_by(signal.CTRL_BREAK_EVENT), (0, []))

    def test_it_takes_the_signals_the_system_has(self):
        # Windows has SIGBREAK and no SIGHUP, the others the reverse. Here the system is played by
        # a `signal` module with the names of Windows, so that the test says the same on any.
        taken = {}
        windows = types.SimpleNamespace(
            SIGTERM=15, SIGBREAK=21, SIG_IGN=object(), getsignal=lambda number: None,
            signal=lambda number, handler: taken.__setitem__(number, handler),
            # what the companion ends a child with where there are groups to signal, should a
            # thread of another test do so meanwhile
            SIGKILL=getattr(signal, "SIGKILL", 9))
        server = mock.Mock(port=1)
        without = {name: value for name, value in os.environ.items()
                   if name not in ("MFE_CE_PYTHON", "MFE_GL_PYTHON")}  # no interpreter to probe
        with mock.patch.object(mfe, "signal", windows), \
                mock.patch.object(mfe, "make_server", return_value=server), \
                mock.patch.object(mfe, "_utf8_output"), \
                mock.patch.dict(os.environ, without, clear=True), \
                mock.patch.object(mfe.sys, "stderr", mock.Mock()):
            self.assertEqual(mfe.main(["serve", "--no-disk-cache", "--no-sandbox"]), 0)
            self.assertEqual(sorted(taken), [15, 21])
            handlers = dict(taken)
            for number, handler in handlers.items():  # each stops the server the way Ctrl+C does
                taken.update(handlers)
                with self.assertRaises(KeyboardInterrupt):
                    handler(number, None)
                # ... once: the stop it began is not cut short by either of them coming after it
                # (asked of the played system: the handler speaks to the module it is given)
                self.assertEqual(taken, {15: windows.SIG_IGN, 21: windows.SIG_IGN})
        server.serve_forever.assert_called_once_with()
        server.server_close.assert_called_once_with()

    def test_the_signals_are_taken_once_the_consoles_block_has_begun(self):
        # `serve` serves inside the block that stops it when its console window is closed, which
        # does nothing but on Windows. The block begins first: between a signal's handler and the
        # loop there is what there was before the block, on every system.
        order = []

        class Block:
            def __init__(self, server):
                pass

            def __enter__(self):
                order.append("block")
                return self

            def __exit__(self, *exc_info):
                order.append("end")

        system = types.SimpleNamespace(
            SIGTERM=15, SIG_IGN=object(), getsignal=lambda number: None,
            signal=lambda number, handler: order.append("signal"), SIGKILL=getattr(signal, "SIGKILL", 9))
        server = mock.Mock(port=1)
        server.serve_forever.side_effect = lambda: order.append("loop")
        server.server_close.side_effect = lambda: order.append("closed")
        without = {name: value for name, value in os.environ.items()
                   if name not in ("MFE_CE_PYTHON", "MFE_GL_PYTHON")}  # no interpreter to probe
        with mock.patch.object(mfe, "signal", system), \
                mock.patch.object(mfe, "_ConsoleClose", Block), \
                mock.patch.object(mfe, "make_server", return_value=server), \
                mock.patch.object(mfe, "_utf8_output"), \
                mock.patch.dict(os.environ, without, clear=True), \
                mock.patch.object(mfe.sys, "stderr", mock.Mock()):
            self.assertEqual(mfe.main(["serve", "--no-disk-cache", "--no-sandbox"]), 0)
        self.assertEqual(order, ["block", "signal", "loop", "closed", "end"])


CLOSE, LOGOFF, SHUTDOWN = 2, 5, 6  # what Windows tells a console's processes: CTRL_CLOSE_EVENT, ...
CTRL_C, CTRL_BREAK = 0, 1


class FakeConsole:
    """Windows' console API, played on any system: ``SetConsoleCtrlHandler`` keeps the handlers it
    is given, and a handler is the Python function itself (there, a function the system calls)."""

    def __init__(self):
        self.handlers = []

    @staticmethod
    def HandlerRoutine(function):  # noqa: N802 - Windows' names
        return function

    def SetConsoleCtrlHandler(self, handler, add):  # noqa: N802
        if add:
            self.handlers.append(handler)
        else:
            self.handlers.remove(handler)
        return 1


# What closing the window does, from a helper: it attaches to the companion's console, finds its
# window and posts WM_CLOSE to it, as the window's X does. It leaves that console first, or the
# close would end it too. A console hosted as a pseudo console (Windows Terminal) has no window of
# its own (the class of the one it names is not conhost's): the helper says so, and posts nothing.
CLOSE_THE_CONSOLE = r'''
import ctypes, sys
from ctypes import wintypes
kernel32, user32 = ctypes.WinDLL("kernel32"), ctypes.WinDLL("user32")
kernel32.GetConsoleWindow.restype = wintypes.HWND
user32.GetClassNameW.argtypes = (wintypes.HWND, wintypes.LPWSTR, ctypes.c_int)
user32.PostMessageW.argtypes = (wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)
kernel32.FreeConsole()
if not kernel32.AttachConsole(int(sys.argv[1])):
    sys.exit(3)
window = kernel32.GetConsoleWindow()
kind = ctypes.create_unicode_buffer(256)
if window:
    user32.GetClassNameW(window, kind, 256)
kernel32.FreeConsole()
if kind.value != "ConsoleWindowClass":
    print(kind.value or "no window")
    sys.exit(4)
sys.exit(0 if user32.PostMessageW(window, 0x0010, 0, 0) else 5)
'''


class ConsoleClose(unittest.TestCase):
    """Closing the console window `serve` runs in stops it in order on Windows, as Ctrl+C does; the
    handler takes a log-off and a shutdown the same way. Windows is played by a console API of the
    test's, on any system: the handler it was given is called as the system calls it, from a thread
    of its own, while a real server serves a real companion, whose jobs have their folder."""

    def serving(self, now=True, loop=True, **options):
        """A companion with the folder of its jobs, and its server in a `_ConsoleClose` block as
        `main` has it, on a thread that plays the main one. It serves at once, or (``now`` false)
        once ``it.go`` is set; with ``loop`` false it never does, and the block just ends."""
        console = FakeConsole()
        companion = mfe.Companion(disk_cache=False, sandbox=False)
        server = mfe.make_server(companion, 0)
        it = types.SimpleNamespace(console=console, companion=companion, server=server, go=threading.Event(),
                                   jobs=companion.jobs.root(),
                                   block=mfe._ConsoleClose(server, windows=True, console=console, **options))
        self.assertTrue(os.path.isdir(it.jobs))

        def main():
            with it.block:
                try:
                    if it.go.wait(30) and loop:
                        server.serve_forever()
                finally:
                    server.server_close()
                    companion.shutdown()

        it.main = threading.Thread(target=main, daemon=True)

        def never_left_serving():
            it.go.set()
            if it.main.is_alive() and loop:
                server.shutdown()
            it.main.join(10)
            shutil.rmtree(it.jobs, ignore_errors=True)

        self.addCleanup(never_left_serving)
        it.main.start()
        if now:
            it.go.set()
            self.assertEqual(_origin_status(server.port, "http://localhost:5173")[0], 200)  # serving
        self.assertEqual(len(console.handlers), 1)
        it.handler = console.handlers[0]
        return it

    @staticmethod
    def timed(call, *args):
        started = time.monotonic()
        return call(*args), time.monotonic() - started

    def test_each_end_of_the_console_stops_it_and_is_answered_once_all_is_cleaned_up(self):
        for event in (CLOSE, LOGOFF, SHUTDOWN):
            with self.subTest(event=event):
                it = self.serving(wait_s=30)
                self.assertEqual(it.handler(event), 1)  # taken: no other handler sees it
                # Windows ends the process now: what the companion kept in TEMP must be gone already.
                self.assertFalse(os.path.exists(it.jobs))
                it.main.join(10)
                self.assertFalse(it.main.is_alive())
                self.assertEqual(it.console.handlers, [])  # taken back once the block ended
                self.assertIn(it.handler, mfe._console_handlers)  # and still held: never released

    def test_ctrl_c_and_ctrl_break_are_left_to_python(self):
        it = self.serving()
        for event in (CTRL_C, CTRL_BREAK, 3, 4):  # and the codes Windows does not use
            with self.subTest(event=event):
                answer, took = self.timed(it.handler, event)
                self.assertEqual(answer, 0)  # not taken: Python's own handler gets it, as before
                self.assertLess(took, 1)
                self.assertEqual(_origin_status(it.server.port, "http://localhost:5173")[0], 200)
                self.assertTrue(os.path.isdir(it.jobs))

    def test_a_second_event_does_not_hang(self):
        it = self.serving(wait_s=30)
        answers = []
        both = [threading.Thread(target=lambda event=event: answers.append(it.handler(event)))
                for event in (CLOSE, SHUTDOWN)]  # at once, each on a thread of the system's
        for thread in both:
            thread.start()
        for thread in both:
            thread.join(15)
        self.assertEqual(answers, [1, 1])
        self.assertFalse(os.path.exists(it.jobs))
        it.main.join(10)
        self.assertEqual(self.timed(it.handler, CLOSE)[0], 1)  # the block has ended: nothing to wait for
        self.assertLess(self.timed(it.handler, CLOSE)[1], 1)

    def test_an_event_before_the_loop_runs_does_not_hang(self):
        # `server.shutdown()` waits for the loop to end: called before the loop began, it waits for
        # it to begin, and for ever if it never does.
        for loop in (True, False):  # the loop begins after the event, or never
            with self.subTest(loop=loop):
                it = self.serving(now=False, loop=loop, wait_s=30)
                asked, shutdown = threading.Event(), it.server.shutdown
                it.server.shutdown = lambda: (asked.set(), shutdown())
                answer = []
                windows = threading.Thread(target=lambda: answer.append(self.timed(it.handler, CLOSE)), daemon=True)
                windows.start()
                self.assertTrue(asked.wait(10))
                it.go.set()  # and only now the loop may begin
                windows.join(15)
                self.assertEqual(len(answer), 1, "the handler did not return")
                self.assertEqual(answer[0][0], 1)
                self.assertLess(answer[0][1], 10)  # when the block ended, not after its 30 s
                self.assertFalse(os.path.exists(it.jobs))
                it.main.join(10)
                self.assertFalse(it.main.is_alive())  # the loop, begun after the stop was asked, ended at once

    def test_the_wait_is_bounded(self):
        # A clean-up that does not end: Windows would end the process at its 5 s whatever the
        # handler does, and the handler gives up before. Nothing is worse than without it.
        it = self.serving(wait_s=0.5)
        release = threading.Event()
        shutdown = it.companion.shutdown
        it.companion.shutdown = lambda: (release.wait(30), shutdown())
        self.addCleanup(release.set)
        answer, took = self.timed(it.handler, CLOSE)
        self.assertEqual(answer, 1)
        # It waited its half second, as the system's timer counts one: a wait of Windows may end
        # a tick of its clock (1/64 s) early by the clock of the test (0.4996 s was seen).
        self.assertGreaterEqual(took, 0.5 - 1 / 64)
        self.assertLess(took, 5)
        self.assertTrue(it.main.is_alive())  # still cleaning up: what is left is what was left before
        self.assertTrue(os.path.isdir(it.jobs))
        release.set()
        it.main.join(10)
        self.assertFalse(os.path.exists(it.jobs))

    def test_nothing_is_set_on_other_systems(self):
        console, server, kept = FakeConsole(), mock.Mock(), len(mfe._console_handlers)
        with mock.patch.object(mfe, "_console_api", side_effect=AssertionError("Windows' API asked for")):
            for given in (console, None):
                with mfe._ConsoleClose(server, windows=False, console=given):
                    self.assertEqual(console.handlers, [])
        self.assertEqual(server.mock_calls, [])
        self.assertEqual(len(mfe._console_handlers), kept)

    def test_serve_stops_in_order_when_its_console_is_closed(self):
        # The same through `main`: its loop and its clean-up are the block's.
        console, servers, seen = FakeConsole(), [], {}
        make_server, block = mfe.make_server, mfe._ConsoleClose
        self.addCleanup(lambda: "jobs" in seen and shutil.rmtree(seen["jobs"], ignore_errors=True))

        def making(*args):
            servers.append(make_server(*args))
            return servers[-1]

        def windows():  # the system, once the window is closed
            try:
                deadline = time.monotonic() + 30
                while not console.handlers and time.monotonic() < deadline:
                    time.sleep(0.05)
                _origin_status(servers[0].port, "http://localhost:5173")  # serving
                seen["jobs"] = servers[0].companion.jobs.root()
                seen["answer"] = console.handlers[0](CLOSE)
                seen["jobs left"] = os.path.exists(seen["jobs"])
            finally:
                if servers:  # never left serving, whatever failed
                    servers[0].shutdown()

        without = {name: value for name, value in os.environ.items()
                   if name not in ("MFE_CE_PYTHON", "MFE_GL_PYTHON")}  # no interpreter to probe
        system = threading.Thread(target=windows, daemon=True)
        with mock.patch.object(mfe, "_ConsoleClose", lambda server: block(server, windows=True, console=console)), \
                mock.patch.object(mfe, "make_server", making), \
                mock.patch.object(mfe, "signal", types.SimpleNamespace(SIGKILL=getattr(signal, "SIGKILL", 9))), \
                mock.patch.object(mfe, "_utf8_output"), \
                mock.patch.dict(os.environ, without, clear=True), \
                contextlib.redirect_stderr(io.StringIO()):
            system.start()
            code = mfe.main(["serve", "--port", "0", "--no-disk-cache", "--no-sandbox"])
        system.join(30)
        self.assertEqual(code, 0)
        self.assertEqual(seen.get("answer"), 1)
        self.assertIs(seen.get("jobs left"), False)  # the clean-up was done when the handler returned
        self.assertEqual(console.handlers, [])

    @unittest.skipUnless(os.name == "nt", "a console window and its closing are Windows'")
    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg is required: a video job makes the companion's folder")
    def test_closing_its_console_window_stops_it_in_order(self):
        port = free_port()
        # In a console of its own, as in a window of cmd or PowerShell, its window hidden.
        hidden = subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW, wShowWindow=0)  # SW_HIDE
        own = {"creationflags": subprocess.CREATE_NEW_CONSOLE, "startupinfo": hidden}
        with serve_environment() as env:
            folder = env["TMPDIR"]
            proc = subprocess.Popen([sys.executable, SCRIPT, "serve", "--port", str(port), "--no-disk-cache"],
                                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                    env=env, **own)
            try:
                _origin_status(port, "http://localhost:5173")  # serving, so its handler is set
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
                conn.request("POST", "/video", json.dumps({
                    "format": "mp4", "quality": "low", "width": 64, "height": 48, "fps": 10, "frames": 20,
                }), {"Content-Type": "application/json", "Origin": "http://localhost:5173"})
                self.assertEqual(conn.getresponse().status, 201)
                conn.close()
                self.assertTrue(any(name.startswith("mfe-jobs-") for name in os.listdir(folder)))
                helper = subprocess.run([sys.executable, "-c", CLOSE_THE_CONSOLE, str(proc.pid)],
                                        capture_output=True, text=True, timeout=60, **own)
                if helper.returncode == 3:
                    self.skipTest("the companion's console cannot be attached to from here")
                if helper.returncode == 4:
                    self.skipTest(f"its console has no window of its own to close ({helper.stdout.strip()}): "
                                  "a pseudo console, as Windows Terminal hosts one")
                self.assertEqual(helper.returncode, 0, helper.stderr)
                try:
                    proc.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    self.fail("the companion did not end when its console window was closed")
                left = os.listdir(folder)
            finally:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait(10)
        self.assertEqual(left, [])  # without its handler: the folder of its jobs, as it was in TEMP
