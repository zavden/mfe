"""HTTP behaviour: statuses, CORS, host/origin checks, limits, errors, caching, security."""
import http.client
import json
import os
import shutil
import tempfile
import threading
import time
import unittest
from unittest import mock

from support import CAN_SYMLINK, make_companion, mfe_companion, posix_only, requires_tex, venv_python

m = mfe_companion


class ServerCase(unittest.TestCase):
    """Starts the real HTTP server on an ephemeral port for the whole class."""

    cache_dir = None
    sandbox = True
    allow_file_origin = False
    app_dir = None

    @classmethod
    def setUpClass(cls):
        kwargs = {"disk_cache": bool(cls.cache_dir), "cache_dir": cls.cache_dir, "sandbox": cls.sandbox}
        cls.companion = make_companion(**kwargs)
        cls.server = m.make_server(cls.companion, port=0, allow_file_origin=cls.allow_file_origin,
                                   app_dir=cls.app_dir)
        cls.port = cls.server.port
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(5)
        cls.companion.shutdown()  # the jobs' temporary files

    def request(self, method, path, body=None, headers=None, host="default", raw_body=None):
        """Returns (status, headers dict (lower-case keys), parsed JSON or None)."""
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        try:
            hdrs = dict(headers or {})
            if host != "default":
                conn.putrequest(method, path, skip_host=True)
                conn.putheader("Host", host)
            else:
                conn.putrequest(method, path)
            data = raw_body if raw_body is not None else (json.dumps(body).encode() if body is not None else None)
            if data is not None:
                hdrs.setdefault("Content-Type", "application/json")
                hdrs["Content-Length"] = str(len(data))
            for k, v in hdrs.items():
                conn.putheader(k, v)
            conn.endheaders(data)
            resp = conn.getresponse()
            payload = resp.read()
            parsed = json.loads(payload) if payload else None
            return resp.status, {k.lower(): v for k, v in resp.getheaders()}, parsed
        finally:
            conn.close()

    def tex(self, latex="mx+y=0", target="ce", **extra):
        body = {"latex": latex, "packages": [], "preamble": "", "target": target, **extra}
        return self.request("POST", "/tex", body)


class Health(ServerCase):
    def test_health(self):
        status, headers, data = self.request("GET", "/health")
        self.assertEqual(status, 200)
        self.assertTrue(headers["content-type"].startswith("application/json"))
        self.assertEqual(data["name"], "mfe-companion")
        self.assertEqual(data["protocol"], 1)
        self.assertEqual(data["version"], m.VERSION)
        caps = data["capabilities"]
        self.assertEqual(set(caps), {"latex", "dvisvgm", "ffmpeg", "videoAudio", "manimCE", "manimGL",
                                     "manimProbing", "manimRender", "manimSandbox", "textMode", "pango"})
        # No interpreter of either library: no font text for either.
        self.assertEqual(caps["pango"], {"ce": None, "gl": None})
        self.assertLessEqual(set(caps["videoAudio"]), {"mp4", "mov", "webm"})  # what this ffmpeg can add sound to
        self.assertIs(caps["manimProbing"], False)  # no interpreter to probe
        self.assertIs(caps["textMode"], True)  # /tex takes "mode": "text" (1.3)
        self.assertIs(caps["manimRender"], False)  # off unless started with --allow-manim-render
        for key in ("latex", "dvisvgm", "ffmpeg"):
            self.assertIsInstance(caps[key], bool)
        self.assertIsNone(caps["manimCE"])
        self.assertIsNone(caps["manimGL"])

    def test_health_reports_manim_interpreters(self):
        import sys

        companion = make_companion()
        self.addCleanup(companion.shutdown)
        companion._manim["ce"] = {"python": sys.executable, "version": "0.22.1"}
        self.assertEqual(companion.health()["capabilities"]["manimCE"], {"python": sys.executable, "version": "0.22.1"})

    def test_probe_of_a_python_without_manim(self):
        import sys

        companion = make_companion(ce_python=sys.executable)  # the test interpreter has no manim
        self.addCleanup(companion.shutdown)
        companion.start_probes()
        companion.wait_for_probes()
        self.assertIsNone(companion.health()["capabilities"]["manimCE"])

    def test_a_probe_still_running_ends_with_the_companion(self):
        # A companion stopped in its first seconds: an interpreter is still importing its Manim.
        # It lived on, in the probe's folder. On Windows, where the current folder of a process
        # cannot be removed, that folder stayed in TEMP and its removal raised at the exit.
        import signal
        import sys

        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as aside:
            # The stand-in of an interpreter that imports for a minute. It says who it is, then
            # that it is alive, twenty times a second, in a file outside the probe's folder.
            beat = os.path.join(aside, "beat")
            code = "\n".join((
                "import os, time",
                f"with open({beat!r}, 'a') as fh:",
                "    fh.write(str(os.getpid()) + chr(10))",
                "    for _ in range(1200):",
                "        fh.write('.')",
                "        fh.flush()",
                "        time.sleep(0.05)",
            ))

            def beats():
                return os.path.getsize(beat) if os.path.exists(beat) else 0

            def alive():
                seen = beats()
                time.sleep(0.4)
                return beats() > seen

            def wait_for_beats():
                deadline = time.monotonic() + 20
                while beats() < 12 and time.monotonic() < deadline:
                    time.sleep(0.02)
                with open(beat) as fh:
                    return int(fh.readline())

            companion = make_companion(sandbox=False)
            probe = threading.Thread(target=companion._probe_manim, daemon=True, args=("ce", sys.executable, code))
            companion._probe_threads.append(probe)
            interpreter = None
            try:
                with mock.patch.object(tempfile, "tempdir", tmp):
                    probe.start()
                    interpreter = wait_for_beats()
                    self.assertEqual([name[:10] for name in os.listdir(tmp)], ["mfe-probe-"])
                    companion.shutdown()
                    self.assertFalse(probe.is_alive())
                    self.assertFalse(alive())
                    self.assertEqual(os.listdir(tmp), [])
                    self.assertIsNone(companion.health()["capabilities"]["manimCE"])
                    # One that starts once the companion is closing is ended as soon as it runs.
                    started = time.monotonic()
                    companion._probe_manim("ce", sys.executable, code)
                    self.assertLess(time.monotonic() - started, 20)
                    self.assertFalse(alive())
                    self.assertEqual(os.listdir(tmp), [])
            finally:  # a companion that left its probe running: the test does not
                if interpreter is not None and alive():
                    os.kill(interpreter, signal.SIGTERM)
                probe.join(20)

    @posix_only
    def test_probe_accepts_relative_interpreter_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            fake = os.path.join(tmp, "fakepython")
            with open(fake, "w") as fh:
                fh.write("#!/bin/sh\necho 1.2.3\n")
            os.chmod(fake, 0o755)
            old = os.getcwd()
            os.chdir(tmp)
            # The folder as the system names the working directory, which is what a relative
            # path is completed with: it need not be the name the folder was made under (on
            # macOS the temporary folder is behind a link, /var is /private/var).
            here = os.getcwd()
            try:
                companion = make_companion(ce_python="./fakepython")
                self.addCleanup(companion.shutdown)
                companion.start_probes()
                companion.wait_for_probes()
            finally:
                os.chdir(old)
            self.assertEqual(companion.health()["capabilities"]["manimCE"],
                             {"python": os.path.join(here, "fakepython"),
                              "version": "1.2.3"})

    @posix_only
    def test_health_says_while_interpreters_are_being_probed(self):
        with tempfile.TemporaryDirectory() as tmp:
            fake = os.path.join(tmp, "slowpython")
            release = os.path.join(tmp, "release")
            with open(fake, "w") as fh:
                fh.write(f"#!/bin/sh\nwhile [ ! -e {release} ]; do sleep 0.05; done\necho 1.2.3\n")
            os.chmod(fake, 0o755)
            companion = make_companion(ce_python=fake)
            self.addCleanup(companion.shutdown)
            companion.start_probes()
            caps = companion.health()["capabilities"]
            self.assertIs(caps["manimProbing"], True)
            self.assertIsNone(caps["manimCE"])
            open(release, "w").close()
            companion.wait_for_probes()
            caps = companion.health()["capabilities"]
            self.assertIs(caps["manimProbing"], False)
            self.assertEqual(caps["manimCE"]["version"], "1.2.3")

    def test_probe_of_the_real_manim_virtualenvs(self):
        ce, gl = venv_python("ce"), venv_python("gl")
        if not (ce or gl):
            self.skipTest("no Manim virtualenv found")
        companion = make_companion(ce_python=ce, gl_python=gl)
        self.addCleanup(companion.shutdown)
        companion.start_probes()
        companion.wait_for_probes()
        caps = companion.health()["capabilities"]
        if ce:
            self.assertEqual(caps["manimCE"]["python"], os.path.abspath(ce))
            self.assertRegex(caps["manimCE"]["version"], r"^\d+\.\d+")
        if gl:
            self.assertRegex(caps["manimGL"]["version"], r"^\d+\.\d+")

    @posix_only
    def test_probe_reads_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            fake = os.path.join(tmp, "fakepython")
            with open(fake, "w") as fh:
                fh.write("#!/bin/sh\necho 'some log noise'\necho 0.99.1\n")
            os.chmod(fake, 0o755)
            companion = make_companion(ce_python=fake, gl_python=fake)
            self.addCleanup(companion.shutdown)
            companion.start_probes()
            companion.wait_for_probes()
            caps = companion.health()["capabilities"]
            self.assertEqual(caps["manimCE"], {"python": fake, "version": "0.99.1"})
            self.assertEqual(caps["manimGL"], {"python": fake, "version": "0.99.1"})


@requires_tex
class Tex(ServerCase):
    def test_ok_response_shape(self):
        status, _, data = self.tex("mx+y=0")
        self.assertEqual(status, 200)
        self.assertTrue(data["ok"])
        self.assertTrue(data["svg"].startswith("<?xml"))
        self.assertIn("<svg", data["svg"])
        self.assertEqual([g["label"] for g in data["glyphs"]], "m x + y = 0".split())
        self.assertEqual(set(data["glyphs"][0]), {"label", "kind", "font", "code"})
        self.assertFalse(data["cached"])
        self.assertGreater(data["ms"], 0)
        self.assertEqual(data["warnings"], [])

    def test_second_call_is_cached(self):
        self.tex("a+b+c+d")
        status, _, data = self.tex("a+b+c+d")
        self.assertTrue(data["cached"])
        self.assertEqual(data["ms"], 0)
        self.assertEqual(len(data["glyphs"]), 7)

    def test_target_gl(self):
        status, _, data = self.tex(r"\text{office}", target="gl")
        self.assertTrue(data["ok"])
        self.assertEqual(len(data["glyphs"]), 6)

    def test_text_mode(self):
        for target in ("ce", "gl"):
            with self.subTest(target=target):
                status, _, data = self.tex("Hello $x$", target=target, mode="text")
                self.assertEqual(status, 200)
                self.assertTrue(data["ok"], data)
                self.assertEqual([g["label"] for g in data["glyphs"]], list("Hellox"))
                # an error inside the text is located on its line
                _, _, failed = self.tex("one\n\\undefinedthing two", target=target, mode="text")
                self.assertFalse(failed["ok"])
                self.assertEqual(failed["error"]["line"], 2, failed["error"])
        # math mode draws the letters of "Hello" as five math italics: a different document
        _, _, math = self.tex("Hello $x$", target="ce")
        self.assertFalse(math["ok"])  # "$x$" inside align* is an error ("Bad math environment delimiter")

    def test_packages_and_preamble(self):
        status, _, data = self.tex(r"\bm{x} + \foo", packages=["bm"], preamble=r"\newcommand{\foo}{y}")
        self.assertTrue(data["ok"], data)
        self.assertEqual([g["label"] for g in data["glyphs"]], ["x", "+", "y"])

    def test_latex_error_reports_message_and_line(self):
        for target in ("ce", "gl"):
            with self.subTest(target=target):
                status, _, data = self.tex("a + \\foo b", target)
                self.assertEqual(status, 200)
                self.assertFalse(data["ok"])
                self.assertEqual(data["error"]["message"], "Undefined control sequence.")
                self.assertEqual(data["error"]["line"], 1)
                self.assertIn("Undefined control sequence", data["error"]["log"])
                self.assertIn("l.", data["error"]["log"])

    def test_latex_error_line_in_multiline_input(self):
        for target in ("ce", "gl"):
            with self.subTest(target=target):
                _, _, data = self.tex("a + b \\\\\nc + d \\\\\ne + \\bogus", target)
                self.assertFalse(data["ok"])
                self.assertEqual(data["error"]["line"], 3)
        # a leading newline counts as a line of the user's text for both targets
        for target in ("ce", "gl"):
            with self.subTest(target=target, leading_newline=True):
                _, _, data = self.tex("\n\\bogus", target)
                self.assertEqual(data["error"]["line"], 2)
        # nested arguments, repeated text: the first occurrence is the error (LaTeX halts there)
        _, _, data = self.tex("\\frac{a}{b} \\\\\n\\frac{a}{\\oops}", "ce")
        self.assertEqual(data["error"]["line"], 2)

    def test_error_outside_user_latex_has_null_line(self):
        _, _, data = self.tex("x", packages=["nosuchpackagexyz"])
        self.assertFalse(data["ok"])
        self.assertIsNone(data["error"]["line"])
        self.assertIn("nosuchpackagexyz", data["error"]["message"])
        # an unclosed group is only noticed at \end{align*}
        _, _, data = self.tex("\\frac{a", "gl")
        self.assertFalse(data["ok"])

    def test_gl_unbalanced_braces_rejected_like_manimgl(self):
        _, _, data = self.tex("a}{b", "gl")
        self.assertFalse(data["ok"])
        self.assertEqual(data["error"]["message"], "Missing '{' inserted")

    def test_ce_repairs_unbalanced_braces_like_manimce(self):
        _, _, data = self.tex(r"\frac{a}{b", "ce")
        self.assertTrue(data["ok"], data)

    def test_empty_latex(self):
        for target in ("ce", "gl"):
            _, _, data = self.tex("", target)
            self.assertEqual(data["ok"], target == "ce" or data["ok"])
            self.assertEqual(self.request("POST", "/tex", {"latex": "", "target": target})[0], 200)

    def test_unicode_in_latex_and_labels(self):
        status, _, data = self.tex(r"\alpha \to \infty")
        self.assertEqual(status, 200)
        self.assertEqual([g["label"] for g in data["glyphs"]], ["α", "→", "∞"])

    def test_timeout_kills_latex(self):
        with mock.patch.object(m, "COMPILE_TIMEOUT_S", 1.5):
            started = time.monotonic()
            _, _, data = self.tex(r"\def\a{\a}\a")
            elapsed = time.monotonic() - started
        self.assertFalse(data["ok"])
        self.assertIn("timed out", data["error"]["message"])
        self.assertLess(elapsed, 10)

    def test_concurrent_requests(self):
        results = []

        def work(i):
            results.append(self.tex(f"x_{{{i}}} + y")[2])

        threads = [threading.Thread(target=work, args=(i,)) for i in range(6)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(120)
        self.assertEqual(len(results), 6)
        self.assertTrue(all(r["ok"] for r in results))
        # A browser opens six connections to a host at once, and the app is not the only page: the
        # queue of those not yet accepted holds more than socketserver's five (past its queue
        # Windows refuses a connection, where Linux lets it wait).
        self.assertGreaterEqual(m.CompanionServer.request_queue_size, 32)

    def test_at_most_two_compiles_run_at_once(self):
        state = {"now": 0, "max": 0}
        guard = threading.Lock()
        original = self.companion._compile_uncached

        def tracking(doc, req):
            with guard:
                state["now"] += 1
                state["max"] = max(state["max"], state["now"])
            try:
                time.sleep(0.3)
                return original(doc, req)
            finally:
                with guard:
                    state["now"] -= 1

        results = []
        with mock.patch.object(self.companion, "_compile_uncached", tracking):
            threads = [threading.Thread(target=lambda i=i: results.append(self.tex(f"limit_{i}")[2])) for i in range(6)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(120)
        self.assertEqual(len(results), 6)
        self.assertEqual(state["max"], m.MAX_CONCURRENT_COMPILES)
        self.assertEqual(m.MAX_CONCURRENT_COMPILES, 2)

    def test_identical_concurrent_requests_compile_once(self):
        calls = []
        original = self.companion._compile_uncached

        def counting(doc, req):
            calls.append(1)
            time.sleep(0.3)
            return original(doc, req)

        results = []
        with mock.patch.object(self.companion, "_compile_uncached", counting):
            threads = [threading.Thread(target=lambda: results.append(self.tex("dedupe + me")[2])) for _ in range(4)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(120)
        self.assertEqual(len(calls), 1)
        self.assertEqual(sum(1 for r in results if r["cached"]), 3)


class Validation(ServerCase):
    def test_400_cases(self):
        cases = {
            "bad json": dict(raw_body=b"{nope"),
            "not an object": dict(body=[1, 2]),
            "no target": dict(body={"latex": "x"}),
            "unknown target": dict(body={"latex": "x", "target": "manim"}),
            "latex not a string": dict(body={"latex": 5, "target": "ce"}),
            "packages not a list": dict(body={"latex": "x", "target": "ce", "packages": "bm"}),
            "preamble not a string": dict(body={"latex": "x", "target": "ce", "preamble": 1}),
            "unknown mode": dict(body={"latex": "x", "target": "ce", "mode": "bold"}),
            "invalid utf-8": dict(raw_body=b"\xff\xfe"),
        }
        for name, kw in cases.items():
            with self.subTest(name):
                status, _, data = self.request("POST", "/tex", **kw)
                self.assertEqual(status, 400, data)
                self.assertFalse(data["ok"])
                self.assertTrue(data["error"]["message"])

    def test_a_body_that_is_no_object_is_a_400_on_every_route(self):
        # `null` among them: it is JSON, and the body of no request. A route that took it for
        # «the error is answered already» closed the connection without a word.
        for route in ("/tex", "/text", "/video"):
            for raw in (b"null", b"[]", b"1", b'"x"', b"true"):
                with self.subTest(route=route, body=raw):
                    status, _, data = self.request("POST", route, raw_body=raw)
                    self.assertEqual(status, 400, data)
                    self.assertFalse(data["ok"])
                    self.assertTrue(data["error"]["message"])

    def test_400_invalid_package_names(self):
        for bad in ["foo bar", "../x", "a/b", "x;y", "bm}\\input{/etc/passwd", "", "pké", "a" * 65, "x\ny"]:
            with self.subTest(package=bad):
                status, _, data = self.request("POST", "/tex", {"latex": "x", "target": "ce", "packages": [bad]})
                self.assertEqual(status, 400, data)
                self.assertIn("package", data["error"]["message"].lower())
        status, _, _ = self.request("POST", "/tex", {"latex": "x", "target": "ce", "packages": [7]})
        self.assertEqual(status, 400)

    def test_413_body_too_large(self):
        status, _, data = self.request("POST", "/tex", raw_body=b'{"latex": "' + b"a" * 70_000 + b'"}')
        self.assertEqual(status, 413)
        self.assertFalse(data["ok"])

    def test_413_latex_or_preamble_too_large(self):
        status, _, _ = self.request("POST", "/tex", {"latex": "a" * 9000, "target": "ce"})
        self.assertEqual(status, 413)
        status, _, _ = self.request("POST", "/tex", {"latex": "a", "target": "ce", "preamble": "%" * 9000})
        self.assertEqual(status, 413)

    def test_limit_is_in_bytes(self):
        status, _, _ = self.request("POST", "/tex", {"latex": "é" * 5000, "target": "ce"})  # 10 000 bytes
        self.assertEqual(status, 413)

    def test_app_paths_are_unknown_without_app_dir(self):
        self.assertEqual(self.request("GET", "/app/")[0], 404)
        self.assertEqual(self.request("GET", "/")[0], 404)

    def test_404_and_405(self):
        self.assertEqual(self.request("GET", "/nope")[0], 404)
        self.assertEqual(self.request("POST", "/nope", {})[0], 404)
        self.assertEqual(self.request("GET", "/tex")[0], 405)
        self.assertEqual(self.request("POST", "/health", {})[0], 405)
        self.assertEqual(self.request("DELETE", "/tex")[0], 405)

    def test_missing_or_bad_content_length(self):
        status, _, _ = self.request("POST", "/tex", headers={"Content-Length": "abc"}, raw_body=b"")
        self.assertEqual(status, 400)


class App(ServerCase):
    """serve --app DIR: the built app under /app/, nothing outside DIR."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="mfe-app-")
        cls.app_dir = os.path.join(cls.tmp, "dist")
        os.makedirs(os.path.join(cls.app_dir, "assets"))
        with open(os.path.join(cls.app_dir, "index.html"), "w", encoding="utf-8") as fh:
            fh.write("<!doctype html><title>mfe</title>")
        with open(os.path.join(cls.app_dir, "assets", "app.js"), "w", encoding="utf-8") as fh:
            fh.write("console.log('hi')")
        with open(os.path.join(cls.tmp, "secret.txt"), "w", encoding="utf-8") as fh:
            fh.write("outside")
        if CAN_SYMLINK:  # on Windows only in Developer Mode: the other tests need no link
            os.symlink(os.path.join(cls.tmp, "secret.txt"), os.path.join(cls.app_dir, "link.txt"))
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def get(self, path, method="GET"):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        try:
            conn.request(method, path)
            resp = conn.getresponse()
            return resp.status, {k.lower(): v for k, v in resp.getheaders()}, resp.read()
        finally:
            conn.close()

    def test_index_and_assets(self):
        status, headers, body = self.get("/app/")
        self.assertEqual(status, 200)
        self.assertTrue(headers["content-type"].startswith("text/html"), headers["content-type"])
        self.assertIn(b"<title>mfe</title>", body)
        self.assertEqual(headers["cache-control"], "no-cache")
        self.assertEqual(headers["x-content-type-options"], "nosniff")
        self.assertEqual(self.get("/app/index.html")[0], 200)
        status, headers, body = self.get("/app/assets/app.js")
        self.assertEqual(status, 200)
        self.assertIn("javascript", headers["content-type"])
        self.assertEqual(body, b"console.log('hi')")

    def test_a_file_has_the_type_of_its_extension_whatever_the_system_says(self):
        # Windows keeps a type for each extension in its registry, and Python's mimetypes asks it
        # first: where some program registered .js as text/plain the app's script would be served
        # so, and under nosniff the browser refuses it. The page stays empty.
        import mimetypes
        with mock.patch.object(mimetypes, "guess_type", return_value=("text/plain", None)):
            self.assertEqual(self.get("/app/assets/app.js")[1]["content-type"],
                             "text/javascript; charset=utf-8")
            self.assertEqual(self.get("/app/")[1]["content-type"], "text/html; charset=utf-8")

    def test_the_types_of_what_a_build_holds(self):
        types = {"index.html": "text/html; charset=utf-8", "assets/index-abc.js": "text/javascript; charset=utf-8",
                 "assets/index-abc.css": "text/css; charset=utf-8", "assets/font.woff2": "font/woff2",
                 "chroma-lab/examples/previews/mathtex.png": "image/png",
                 "chroma-lab/examples/previews/mathtex.mp4": "video/mp4",
                 "chroma-lab/docs/README.md": "text/markdown; charset=utf-8",
                 "licenses/NOTICES.txt": "text/plain; charset=utf-8", "icon.svg": "image/svg+xml; charset=utf-8",
                 "data.json": "application/json; charset=utf-8", "codec.wasm": "application/wasm"}
        for name, expected in types.items():
            self.assertEqual(m._app_type(os.path.join("C:\\dist", name)), expected, name)
        # The extension counts, not its case; a name without one, or with one unknown, is bytes.
        self.assertEqual(m._app_type("INDEX.HTML"), "text/html; charset=utf-8")
        self.assertEqual(m._app_type("vendor/COLORJS-LICENSE"), "application/octet-stream")
        self.assertEqual(m._app_type("archive.xyz"), "application/octet-stream")

    def test_root_and_directories_redirect(self):
        for path in ("/", "/app"):
            status, headers, _ = self.get(path)
            self.assertEqual(status, 302, path)
            self.assertEqual(headers["location"], "/app/")
        status, headers, _ = self.get("/app/assets")
        self.assertEqual(status, 302)
        self.assertEqual(headers["location"], "/app/assets/")
        self.assertEqual(self.get("/app/assets/")[0], 404)  # no index there, and no listing

    def test_head(self):
        status, headers, body = self.get("/app/", "HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        self.assertGreater(int(headers["content-length"]), 0)

    def test_nothing_outside_the_directory(self):
        for path in ("/app/../secret.txt", "/app/%2e%2e/secret.txt", "/app/assets/../../secret.txt",
                     "/app/link.txt", "/app/.hidden", "/app/missing.js", "/app//index.html",
                     "/app/./index.html"):
            self.assertEqual(self.get(path)[0], 404, path)

    def test_api_still_there_and_other_methods_refused(self):
        self.assertEqual(self.get("/health")[0], 200)
        self.assertEqual(self.get("/app/", "POST")[0], 405)
        self.assertEqual(self.request("DELETE", "/app/index.html")[0], 405)


class HostAndOrigin(ServerCase):
    def test_bad_host_is_403(self):
        for host in ["evil.example", f"evil.example:{'{port}'}", "127.0.0.1:1", "localhost", "", "attacker.com:80"]:
            host = host.replace("{port}", str(self.port))
            with self.subTest(host=host):
                status, _, data = self.request("GET", "/health", host=host)
                self.assertEqual(status, 403, data)
                status, _, _ = self.request("POST", "/tex", {"latex": "x", "target": "ce"}, host=host)
                self.assertEqual(status, 403)
                status, _, _ = self.request("OPTIONS", "/tex", host=host, headers={"Origin": "http://localhost:5173"})
                self.assertEqual(status, 403)

    def test_good_hosts(self):
        for host in [f"127.0.0.1:{self.port}", f"localhost:{self.port}", f"LOCALHOST:{self.port}"]:
            with self.subTest(host=host):
                self.assertEqual(self.request("GET", "/health", host=host)[0], 200)

    def test_bad_origin_is_403(self):
        bad = ["http://evil.example", "https://localhost:5173", "http://localhost.evil.com", "http://127.0.0.1.evil.com",
               "http://localhost:99999999", "http://evil.com:5173", "file://", "http://localhost:5173/x", "HTTP://localhost",
               "null"]  # the opaque origin is refused unless --allow-file-origin is given
        for origin in bad:
            with self.subTest(origin=origin):
                status, headers, _ = self.request("GET", "/health", headers={"Origin": origin})
                self.assertEqual(status, 403)
                self.assertNotIn("access-control-allow-origin", headers)
                status, _, _ = self.request("POST", "/tex", {"latex": "x", "target": "ce"}, headers={"Origin": origin})
                self.assertEqual(status, 403)

    def test_allowed_origins_are_echoed(self):
        for origin in ["http://localhost:5173", "http://127.0.0.1:3000", "http://localhost"]:
            with self.subTest(origin=origin):
                status, headers, _ = self.request("GET", "/health", headers={"Origin": origin})
                self.assertEqual(status, 200)
                self.assertEqual(headers["access-control-allow-origin"], origin)
                self.assertIn("origin", headers["vary"].lower())

    def test_no_origin_means_no_cors_headers(self):
        _, headers, _ = self.request("GET", "/health")
        self.assertNotIn("access-control-allow-origin", headers)

    def test_preflight(self):
        status, headers, body = self.request(
            "OPTIONS", "/tex",
            headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST",
                     "Access-Control-Request-Headers": "content-type"},
        )
        self.assertEqual(status, 204)
        self.assertIsNone(body)
        self.assertEqual(headers["access-control-allow-origin"], "http://localhost:5173")
        self.assertIn("POST", headers["access-control-allow-methods"])
        self.assertIn("GET", headers["access-control-allow-methods"])
        self.assertIn("content-type", headers["access-control-allow-headers"].lower())
        self.assertIn("access-control-max-age", headers)
        status, _, _ = self.request("OPTIONS", "/health", headers={"Origin": "http://127.0.0.1:3000"})
        self.assertEqual(status, 204)

    def test_null_origin_is_refused_by_default(self):
        self.assertFalse(self.server.allow_file_origin)
        headers = {"Origin": "null"}
        status, hdrs, data = self.request("GET", "/health", headers=headers)
        self.assertEqual(status, 403, data)
        self.assertNotIn("access-control-allow-origin", hdrs)
        status, hdrs, _ = self.request("POST", "/tex", {"latex": "x", "target": "ce"}, headers=headers)
        self.assertEqual(status, 403)
        self.assertNotIn("access-control-allow-origin", hdrs)
        status, hdrs, _ = self.request(
            "OPTIONS", "/tex", headers={**headers, "Access-Control-Request-Method": "POST"})
        self.assertEqual(status, 403)
        self.assertNotIn("access-control-allow-origin", hdrs)

    def test_preflight_bad_origin_is_403(self):
        status, headers, _ = self.request("OPTIONS", "/tex", headers={"Origin": "http://evil.example"})
        self.assertEqual(status, 403)
        self.assertNotIn("access-control-allow-origin", headers)

    def test_error_responses_carry_cors_for_allowed_origin(self):
        status, headers, _ = self.request("POST", "/tex", {"target": "x"}, headers={"Origin": "http://localhost:5173"})
        self.assertEqual(status, 400)
        self.assertEqual(headers["access-control-allow-origin"], "http://localhost:5173")


class FileOriginAllowed(ServerCase):
    """With --allow-file-origin the opaque "null" origin (app opened from file://) is accepted."""

    allow_file_origin = True

    def test_null_origin_is_accepted_and_echoed(self):
        status, headers, _ = self.request("GET", "/health", headers={"Origin": "null"})
        self.assertEqual(status, 200)
        self.assertEqual(headers["access-control-allow-origin"], "null")
        self.assertIn("origin", headers["vary"].lower())

    def test_null_origin_preflight(self):
        status, headers, body = self.request(
            "OPTIONS", "/tex",
            headers={"Origin": "null", "Access-Control-Request-Method": "POST",
                     "Access-Control-Request-Headers": "content-type"},
        )
        self.assertEqual(status, 204)
        self.assertIsNone(body)
        self.assertEqual(headers["access-control-allow-origin"], "null")
        self.assertIn("POST", headers["access-control-allow-methods"])

    def test_null_origin_post(self):
        status, headers, data = self.request("POST", "/tex", {"target": "x"}, headers={"Origin": "null"})
        self.assertEqual(status, 400)  # reaches validation, i.e. the origin check passed
        self.assertEqual(headers["access-control-allow-origin"], "null")

    def test_other_origins_are_still_checked(self):
        for origin in ["http://evil.example", "https://localhost:5173", "file://"]:
            with self.subTest(origin=origin):
                self.assertEqual(self.request("GET", "/health", headers={"Origin": origin})[0], 403)
        self.assertEqual(self.request("GET", "/health", headers={"Origin": "http://localhost:5173"})[0], 200)

    def test_host_check_still_applies(self):
        status, _, _ = self.request("GET", "/health", headers={"Origin": "null"}, host="evil.example")
        self.assertEqual(status, 403)


@requires_tex
class Security(ServerCase):
    """LaTeX runs with -no-shell-escape and openout_any=p; reading is confined by the sandbox."""

    def test_shell_escape_is_off(self):
        marker = os.path.join(tempfile.gettempdir(), f"mfe-pwned-{os.getpid()}")
        self.addCleanup(lambda: os.path.exists(marker) and os.unlink(marker))
        self.tex(r"\immediate\write18{touch %s} x" % marker.replace("\\", "/"))
        self.assertFalse(os.path.exists(marker))

    def test_cannot_write_outside_the_working_directory(self):
        marker = os.path.join(tempfile.gettempdir(), f"mfe-pwned-out-{os.getpid()}.txt")
        self.addCleanup(lambda: os.path.exists(marker) and os.unlink(marker))
        # A path pasted into TeX is written with "/": a backslash would start a control sequence.
        _, _, data = self.tex(r"\immediate\openout3=%s \immediate\write3{pwned}\immediate\closeout3 x"
                              % marker.replace("\\", "/"))
        self.assertFalse(data["ok"])
        self.assertFalse(os.path.exists(marker))
        _, _, data = self.tex(r"\immediate\openout3=.dotfile \immediate\write3{pwned}\immediate\closeout3 x")
        self.assertFalse(data["ok"])

    def test_cannot_read_parent_directories(self):
        _, _, data = self.tex(r"\input{../doc.tex}")
        self.assertFalse(data["ok"])

    def test_private_files_are_not_readable_when_sandboxed(self):
        if not self.companion.sandbox._probe():
            self.skipTest("bubblewrap sandbox not available: " + self.companion.sandbox.reason)
        # canaries in the directories the sandbox hides: $HOME-like (the repo) and /tmp
        canaries = []
        for base in (os.path.dirname(os.path.abspath(__file__)), tempfile.gettempdir()):
            if not any(os.path.realpath(base).startswith(h) for h in self.companion.sandbox.HIDDEN):
                continue
            path = os.path.join(base, f"mfe-canary-{os.getpid()}.txt")
            with open(path, "w") as fh:
                fh.write("SECRET\n")
            self.addCleanup(os.unlink, path)
            canaries.append(path)
        self.assertTrue(canaries)
        for path in canaries:
            tex = r"\openin5=%s \ifeof5 NOFILE\else \read5 to\x \x\fi" % path
            _, _, data = self.tex(tex)
            self.assertTrue(data["ok"], data)
            self.assertEqual("".join(g["label"] for g in data["glyphs"]), "NOFILE")

    def test_packages_still_load_under_openin_any_p(self):
        # the standard preamble (babel, amsmath, amssymb) and optional packages need to be found
        _, _, data = self.tex(r"\bm{x}\ \operatorname{foo} \ \xrightarrow{a}", packages=["bm", "mathtools"])
        self.assertTrue(data["ok"], data)


@requires_tex
class SecurityWithoutSandbox(Security):
    """Same checks with the bubblewrap sandbox off: openout_any=p and -no-shell-escape alone."""

    sandbox = False

    def test_openin_any_p_is_not_relied_upon(self):
        # TeX Live 2026 made openin_any a no-op: without the sandbox TeX can read absolute paths.
        # (This documents why the sandbox exists; it is not a feature.)
        self.assertFalse(self.companion.sandbox._probe())


class MissingTools(unittest.TestCase):
    def test_no_latex_on_path(self):
        companion = make_companion()
        req = m.validate_request({"latex": "x", "target": "ce"})
        with mock.patch.dict(os.environ, {"PATH": "/nonexistent"}):
            self.assertFalse(companion.health()["capabilities"]["latex"])
            self.assertFalse(companion.health()["capabilities"]["dvisvgm"])
            result = companion.compile(req)
        self.assertFalse(result["ok"])
        self.assertIn("latex", result["error"]["message"])


@requires_tex
class DiskCache(unittest.TestCase):
    def test_second_instance_hits_the_disk_cache(self):
        with tempfile.TemporaryDirectory() as cache:
            req = m.validate_request({"latex": "persist + me", "target": "ce"})
            first = make_companion(disk_cache=True, cache_dir=cache).compile(req)
            self.assertFalse(first["cached"])
            files = [f for f in os.listdir(cache) if f.endswith(".json")]
            self.assertEqual(len(files), 1)
            second = make_companion(disk_cache=True, cache_dir=cache).compile(req)
            self.assertTrue(second["cached"])
            self.assertEqual(second["ms"], 0)
            self.assertEqual(second["svg"], first["svg"])
            self.assertEqual(second["glyphs"], first["glyphs"])

    def test_key_depends_on_target_document_and_versions(self):
        c = make_companion()
        doc = m.build_document("ce", "x", [], "")
        other = m.build_document("ce", "y", [], "")
        keys = {c._cache_key("ce", doc), c._cache_key("gl", doc), c._cache_key("ce", other)}
        self.assertEqual(len(keys), 3)
        c._versions = ("other latex", "other dvisvgm")
        self.assertNotIn(c._cache_key("ce", doc), keys)

    def test_corrupt_cache_entry_is_ignored(self):
        with tempfile.TemporaryDirectory() as cache:
            c = make_companion(disk_cache=True, cache_dir=cache)
            req = m.validate_request({"latex": "corrupt", "target": "ce"})
            doc = m.build_document("ce", "corrupt", [], "")
            with open(os.path.join(cache, c._cache_key("ce", doc) + ".json"), "w") as fh:
                fh.write("{not json")
            result = c.compile(req)
            self.assertTrue(result["ok"])
            self.assertFalse(result["cached"])

    def test_no_disk_cache_writes_nothing(self):
        with tempfile.TemporaryDirectory() as cache:
            c = make_companion(disk_cache=False, cache_dir=cache)
            c.compile(m.validate_request({"latex": "nodisk", "target": "ce"}))
            self.assertEqual(os.listdir(cache), [])

    def test_memory_lru_is_bounded(self):
        lru = m._LRU(3)
        for i in range(5):
            lru.put(str(i), {"i": i})
        self.assertIsNone(lru.get("0"))
        self.assertIsNone(lru.get("1"))
        self.assertEqual(lru.get("4"), {"i": 4})
        lru.get("2")
        lru.put("5", {"i": 5})
        self.assertIsNotNone(lru.get("2"))  # recently used survives
        self.assertIsNone(lru.get("3"))

    def test_default_cache_dir_follows_xdg(self):
        with mock.patch.dict(os.environ, {"XDG_CACHE_HOME": "/xdg"}):
            self.assertEqual(m.default_cache_dir(), os.path.join("/xdg", "mfe-companion"))


if __name__ == "__main__":
    unittest.main()
