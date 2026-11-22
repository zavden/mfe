"""Pango request validation, isolation/lifecycle, mapping and actual native contour parity."""
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

from support import make_companion, mfe_companion as m, venv_python
import test_http


def request(source="AV office", target="ce", **changes):
    return {"source": source, "target": target,
            "font": {"family": "Noto Serif", "weight": "normal", "slant": "normal"},
            "fontSize": 48, **changes}


def setUpModule():
    # Where its worker cannot shape font text (off Linux, for now) the companion refuses by itself,
    # without starting one. The tests below replace the worker's process: what they say of starts,
    # queues and failures holds on any system, so the refusal is lifted for them (one test puts it
    # back). ``NativeText``, which starts the real worker, is skipped off Linux. Set by hand, not
    # with ``mock.patch``: some tests call ``mock.patch.stopall()``, which would undo it.
    shapes_here = m.TEXT_SHAPING_HERE
    m.TEXT_SHAPING_HERE = True
    unittest.addModuleCleanup(setattr, m, "TEXT_SHAPING_HERE", shapes_here)


class Validation(unittest.TestCase):
    def test_preserves_literal_unicode_and_distinct_clusters(self):
        source = '<b>{{office}}</b> e\u0301 👩\u200d💻\n\t'
        result = m.validate_text_request(request(source, requestId="a-request_1"))
        self.assertEqual(result["source"], source)
        self.assertEqual(result["requestId"], "a-request_1")

    def test_rejects_invalid_or_unbounded_requests(self):
        cases = [None, [], request(source=3), request("a\0b"), request("a\rb"), request("\ud800"),
                 request(target="unknown"), request(fontSize=True), request(fontSize=math.nan),
                 request(fontSize=0), request(fontSize=513), request(font={}),
                 request(font={"family": "", "weight": "normal", "slant": "normal"}),
                 request(font={"family": "a", "weight": "700", "slant": "normal"}),
                 request(requestId="../other"), request("a" * (m.MAX_TEXT_BYTES + 1)),
                 request("\n" * m.MAX_TEXT_LINES)]
        for case in cases:
            with self.subTest(case=str(case)[:100]), self.assertRaises(m.RequestError):
                m.validate_text_request(case)

    def test_signature_includes_glyph_order_and_subpath_topology(self):
        one = [[[0.0, -0.000001, 2.0, 3.0]]]
        self.assertEqual(m._pango_geometry_signature(one), m._pango_geometry_signature(one))
        self.assertNotEqual(m._pango_geometry_signature(one),
                            m._pango_geometry_signature([[[0.0, -0.000001]], [[2.0, 3.0]]]))

    def test_cancellation_is_owned_by_request_id_and_queue_is_bounded(self):
        comp = make_companion(sandbox=False)
        first, second = threading.Event(), threading.Event()
        errors = []
        def waiting(operation, payload, cancelled, timeout):
            (first if payload["requestId"] == "first" else second).set()
            if not cancelled.wait(2):
                return {"ok": True}
            raise m.JobError(409, "cancelled")
        def render(identifier):
            try:
                comp.pango.render(request(requestId=identifier))
            except m.JobError as exc:
                errors.append((identifier, exc.status))
        try:
            with mock.patch.object(comp.pango.workers["ce"], "call", side_effect=waiting):
                a = threading.Thread(target=render, args=("first",)); a.start()
                b = threading.Thread(target=render, args=("second",)); b.start()
                self.assertTrue(first.wait(1) and second.wait(1))
                self.assertTrue(comp.pango.cancel("first"))
                a.join(1)
                self.assertTrue(b.is_alive())
                comp.pango.cancel("second"); b.join(1)
                self.assertCountEqual(errors, [("first", 409), ("second", 409)])
                self.assertEqual(comp.pango.requests, {})
            comp.pango.cancel("not-submitted-yet")
            with self.assertRaises(m.JobError) as caught:
                comp.pango.render(request(requestId="not-submitted-yet"))
            self.assertEqual(caught.exception.status, 409)
            for _ in range(m.MAX_TEXT_PENDING):
                self.assertTrue(comp.pango.slots.acquire(blocking=False))
            with self.assertRaises(m.JobError) as caught:
                comp.pango.render(request())
            self.assertEqual(caught.exception.status, 429)
            with self.assertRaises(m.JobError):
                comp.pango.fonts("ce")
            for _ in range(m.MAX_TEXT_PENDING):
                comp.pango.slots.release()
        finally:
            comp.shutdown()

    def test_font_environment_does_not_mount_all_home(self):
        with tempfile.TemporaryDirectory() as directory:
            paths, env = m._native_font_environment(directory)
            self.assertNotIn(os.path.expanduser("~"), paths)
            self.assertIn("FONTCONFIG_FILE", env)
            self.assertNotIn("HOME", env)
            self.assertTrue(all(path.endswith(("fonts", "fontconfig")) for path in paths))


class _FakeProcess:
    """A worker process that is running until ``done`` is set."""
    def __init__(self):
        self.done = False

    def poll(self):
        return 0 if self.done else None


CATALOG = {"ok": True, "target": "ce", "adapterVersion": m.PANGO_ADAPTER_VERSION,
           "environmentKey": "e" * 64, "fonts": []}


class LazyStart(unittest.TestCase):
    """The text workers start with their first request, and ``/health`` says where each stands."""

    def companion(self, **interpreters):
        comp = make_companion(sandbox=False)
        self.addCleanup(comp.shutdown)
        for target, version in interpreters.items():
            comp._manim[target] = {"python": "/nowhere/python", "version": version}
        return comp

    def fake(self, worker, start_s=0.0, answer=None, text_s=0.0):
        """Replace the process of ``worker``: a start that takes ``start_s`` and then answers the
        catalog (or ``answer``), and a text request that takes ``text_s``. Returns the calls."""
        calls = []

        def start():
            calls.append("start")
            worker.catalog = None
            worker.proc = _FakeProcess()

        def exchange(operation, payload, cancelled, deadline):
            calls.append(operation)
            wait = start_s if operation == "fonts" and "started" not in calls else text_s
            if operation == "fonts":
                calls.append("started")
            if cancelled.wait(wait):
                raise m.JobError(409, "Text request cancelled.")
            if time.monotonic() > deadline:
                raise m.JobError(504, "Native text request timed out.")
            if operation != "fonts":
                return {"ok": True, "operation": operation}
            response = CATALOG if answer is None else answer
            if response.get("ok"):
                worker.catalog, worker.known_supported = response, True
            return response

        def stop():
            worker.proc = worker.catalog = None

        for name, fn in (("_start", start), ("_exchange", exchange), ("stop", stop)):
            patch = mock.patch.object(worker, name, side_effect=fn)
            patch.start()
            self.addCleanup(patch.stop)
        # First of the cleanups to run: the companion's shutdown must find no process to kill.
        self.addCleanup(stop)
        return calls

    def test_nothing_of_text_starts_with_the_companion(self):
        comp = self.companion(ce="0.20")
        self.assertEqual(comp.health()["capabilities"]["pango"], {"ce": {"state": "unused"}, "gl": None})
        self.assertNotIn("pangoProbing", comp.health()["capabilities"])
        self.assertIsNone(comp.pango.workers["ce"].proc)
        self.assertFalse(comp.pango.probing())
        # Asked again and again, /health starts nothing either.
        for _ in range(3):
            comp.health()
        self.assertIsNone(comp.pango.workers["ce"].proc)

    def test_the_probe_of_an_interpreter_starts_no_text_worker(self):
        comp = make_companion(sandbox=False)
        self.addCleanup(comp.shutdown)
        comp.ce_python = os.path.realpath(sys.executable)
        with mock.patch.object(comp.pango.workers["ce"], "_start") as start:
            # The probe runs "import manim" in that interpreter; whether it finds Manim or not,
            # the text worker is none of its business.
            comp.start_probes()
            comp.wait_for_probes(60)
            comp.health()
        start.assert_not_called()

    def test_the_first_request_starts_the_worker_and_health_follows(self):
        comp = self.companion(ce="0.20", gl="1.7")
        worker = comp.pango.workers["ce"]
        calls = self.fake(worker, start_s=0.3)
        # The first answer of /health looks for latex, dvisvgm and ffmpeg and asks each for its
        # version. On Windows, where starting a program is slow, that took 0.6 s: longer than
        # the start below, which /health must find under way. It is asked for here, beforehand.
        comp.health()
        seen = []
        asking = threading.Thread(target=lambda: seen.append(comp.pango.fonts("ce")))
        asking.start()
        deadline = time.monotonic() + 2
        while not worker.starting and time.monotonic() < deadline:
            time.sleep(0.005)
        self.assertEqual(comp.health()["capabilities"]["pango"],
                         {"ce": {"state": "preparing"}, "gl": {"state": "unused"}})
        self.assertTrue(comp.pango.probing())
        asking.join(3)
        self.assertEqual(seen, [CATALOG])
        self.assertEqual(comp.health()["capabilities"]["pango"]["ce"],
                         {"state": "ready", "adapterVersion": m.PANGO_ADAPTER_VERSION,
                          "environmentKey": "e" * 64})
        self.assertFalse(comp.pango.probing())
        # The catalog was the worker's first answer: it is not asked for twice.
        self.assertEqual(calls, ["start", "fonts", "started"])
        # The other library was never named: it is still not started.
        self.assertIsNone(comp.pango.workers["gl"].proc)

    def test_a_start_is_not_the_time_of_the_request_that_needed_it(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        # A start that lasts longer than the whole limit of a request.
        calls = self.fake(worker, start_s=0.4, text_s=0.1)
        response = worker.call("text", {}, threading.Event(), 0.25)
        self.assertEqual(response, {"ok": True, "operation": "text"})
        self.assertEqual(calls, ["start", "fonts", "started", "text"])

    def test_a_request_that_waits_for_a_start_keeps_its_own_time(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        self.fake(worker, start_s=0.5, text_s=0.05)
        results = []

        def ask(operation, timeout):
            try:
                results.append((operation, worker.call(operation, {}, threading.Event(), timeout)["ok"]))
            except m.JobError as exc:
                results.append((operation, exc.status))

        first = threading.Thread(target=ask, args=("fonts", 0.2))
        first.start()
        time.sleep(0.1)  # the start is under way, and holds the worker
        second = threading.Thread(target=ask, args=("text", 0.2))
        second.start()
        first.join(3)
        second.join(3)
        self.assertCountEqual(results, [("fonts", True), ("text", True)])

    def test_a_request_behind_a_busy_worker_still_gives_up_in_its_own_time(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        self.fake(worker, text_s=0.5)
        worker.call("fonts", {}, threading.Event(), 1)  # ready
        slow = threading.Thread(target=lambda: worker.call("text", {}, threading.Event(), 2))
        slow.start()
        time.sleep(0.1)
        with self.assertRaises(m.JobError) as caught:
            worker.call("text", {}, threading.Event(), 0.1)
        self.assertEqual(caught.exception.status, 429)
        slow.join(3)

    def test_a_request_has_its_own_time_once_the_worker_takes_it(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        self.fake(worker, text_s=0.4)
        worker.call("fonts", {}, threading.Event(), 1)  # ready
        results = []

        def ask(source):
            try:
                results.append(worker.call("text", {"source": source}, threading.Event(), 0.6)["ok"])
            except m.JobError as exc:
                results.append(exc.status)

        first = threading.Thread(target=ask, args=("one",))
        first.start()
        time.sleep(0.1)  # the worker is busy with the first
        second = threading.Thread(target=ask, args=("two",))
        second.start()
        first.join(3)
        second.join(3)
        # The second waited 0.3 s and then worked 0.4 s: more than 0.6 s in all, and within its
        # own time for each. Queued behind another text, it is not the one that takes too long.
        self.assertEqual(results, [True, True])
        self.assertEqual(worker.refused, {})

    SLOW = {"target": "ce", "source": "a long text", "font": {"family": "Any"}, "fontSize": 48}

    def test_a_text_that_passes_its_time_is_not_shaped_again_for_a_while(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        calls = self.fake(worker, text_s=0.2)
        worker.call("fonts", {}, threading.Event(), 1)
        with self.assertRaises(m.JobError) as caught:
            worker.call("text", dict(self.SLOW, requestId="one"), threading.Event(), 0.05)
        self.assertEqual(caught.exception.status, 504)
        self.assertEqual(caught.exception.message,
                         "This text took more than 0.05 s to shape and was stopped. It is not tried again "
                         "for 10 minutes: a shorter text, or the same text split into several objects, "
                         "takes less.")
        # Asked again, by whoever: the same answer at once, and the worker is not asked.
        started = time.monotonic()
        with self.assertRaises(m.JobError) as again:
            worker.call("text", dict(self.SLOW, requestId="two"), threading.Event(), 5)
        self.assertEqual((again.exception.status, again.exception.message), (504, caught.exception.message))
        self.assertLess(time.monotonic() - started, 0.15)
        self.assertEqual(calls.count("text"), 1)
        # Another text is shaped as ever.
        self.assertTrue(worker.call("text", dict(self.SLOW, source="short"), threading.Event(), 1)["ok"])
        self.assertEqual(calls.count("text"), 2)

    def test_the_worker_health_brings_back_does_not_meet_that_text_again(self):
        # The cycle this prevents: the text stops the worker, /health starts it again, the app asks
        # for every text once more, and the same text stops it again, for as long as the project is
        # open.
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        calls = self.fake(worker, text_s=0.2)
        comp.pango.fonts("ce")
        with self.assertRaises(m.JobError):
            worker.call("text", dict(self.SLOW), threading.Event(), 0.05)
        worker.proc.done = True  # the real worker is stopped with the request it could not finish
        self.assertEqual(comp.health()["capabilities"]["pango"]["ce"], {"state": "preparing"})
        deadline = time.monotonic() + 2
        while comp.pango.probing() and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertEqual(comp.health()["capabilities"]["pango"]["ce"]["state"], "ready")
        for _ in range(3):  # the app, at every change of /health
            with self.assertRaises(m.JobError) as caught:
                worker.call("text", dict(self.SLOW), threading.Event(), 5)
            self.assertEqual(caught.exception.status, 504)
        self.assertEqual((calls.count("start"), calls.count("text")), (2, 1))
        self.assertEqual(comp.health()["capabilities"]["pango"]["ce"]["state"], "ready")

    def test_a_refused_text_starts_no_worker_either(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        calls = self.fake(worker, text_s=0.2)
        comp.pango.fonts("ce")
        with self.assertRaises(m.JobError):
            worker.call("text", dict(self.SLOW), threading.Event(), 0.05)
        worker.stop()
        with self.assertRaises(m.JobError) as caught:
            worker.call("text", dict(self.SLOW), threading.Event(), 5)
        self.assertEqual(caught.exception.status, 504)
        self.assertEqual(calls.count("start"), 1)

    def test_a_refused_text_is_shaped_again_once_the_while_has_passed(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        calls = self.fake(worker, text_s=0.2)
        comp.pango.fonts("ce")
        with mock.patch.object(m, "TEXT_REFUSED_S", 0.3):
            with self.assertRaises(m.JobError):
                worker.call("text", dict(self.SLOW), threading.Event(), 0.05)
        with self.assertRaises(m.JobError):
            worker.call("text", dict(self.SLOW), threading.Event(), 5)
        time.sleep(0.35)
        self.assertTrue(worker.call("text", dict(self.SLOW), threading.Event(), 5)["ok"])
        self.assertEqual(calls.count("text"), 2)
        self.assertEqual(worker.refused, {})

    def test_a_text_that_takes_the_worker_down_is_not_shaped_again_either(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        calls = self.fake(worker)
        comp.pango.fonts("ce")

        def crash(operation, payload, cancelled, deadline):
            calls.append("crash")
            raise m.JobError(503, "Native text worker stopped unexpectedly.", "Pango: assertion failed")

        with mock.patch.object(worker, "_exchange", side_effect=crash):
            with self.assertRaises(m.JobError) as caught:
                worker.call("text", dict(self.SLOW), threading.Event(), 1)
        self.assertEqual((caught.exception.status, caught.exception.log), (503, "Pango: assertion failed"))
        self.assertEqual(caught.exception.message,
                         "Shaping this text stopped the text worker. It is not tried again for 10 minutes.")
        with self.assertRaises(m.JobError) as again:
            worker.call("text", dict(self.SLOW), threading.Event(), 1)
        self.assertEqual((again.exception.status, again.exception.message), (503, caught.exception.message))
        self.assertEqual((calls.count("crash"), calls.count("text")), (1, 0))

    def test_what_is_not_the_text_s_doing_refuses_nothing(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        self.fake(worker, text_s=0.3)
        comp.pango.fonts("ce")
        # cancelled by its client
        cancelled = threading.Event()
        threading.Timer(0.05, cancelled.set).start()
        with self.assertRaises(m.JobError) as caught:
            worker.call("text", dict(self.SLOW), cancelled, 5)
        self.assertEqual(caught.exception.status, 409)
        # a worker that cannot be reached at all
        with mock.patch.object(worker, "_exchange", side_effect=BrokenPipeError("gone")):
            with self.assertRaises(m.JobError) as caught:
                worker.call("text", dict(self.SLOW), threading.Event(), 5)
        self.assertEqual(caught.exception.status, 503)
        self.assertEqual(worker.refused, {})
        self.assertTrue(worker.call("text", dict(self.SLOW), threading.Event(), 5)["ok"])

    def test_a_start_that_fails_says_why_until_one_works(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        failure = m._text_failure("native-text-error", "Native text mapping currently requires Linux.")
        calls = self.fake(worker, answer=failure)
        with self.assertRaises(m.JobError) as caught:
            comp.pango.fonts("ce")
        self.assertEqual(caught.exception.status, 503)
        self.assertEqual(comp.health()["capabilities"]["pango"]["ce"],
                         {"state": "failed", "message": "Native text mapping currently requires Linux."})
        # /health does not try again by itself: nothing here ever worked.
        comp.health()
        self.assertEqual(calls.count("start"), 1)
        # The next request does, and a start that works clears the failure.
        mock.patch.stopall()
        self.fake(worker)
        self.assertEqual(comp.pango.fonts("ce"), CATALOG)
        self.assertEqual(comp.health()["capabilities"]["pango"]["ce"]["state"], "ready")

    def test_cancelling_the_request_that_needed_a_start_leaves_the_start_alone(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        calls = self.fake(worker, start_s=0.4)
        cancelled = threading.Event()
        threading.Timer(0.1, cancelled.set).start()
        with self.assertRaises(m.JobError) as caught:
            worker.call("text", {}, cancelled, 1)
        # The request is gone; the worker it started is there for the next one.
        self.assertEqual(caught.exception.status, 409)
        self.assertIsNone(worker.failure)
        self.assertTrue(worker._ready())
        self.assertEqual(calls, ["start", "fonts", "started"])
        self.assertEqual(comp.health()["capabilities"]["pango"]["ce"]["state"], "ready")

    def test_a_shutdown_during_a_start_is_no_failure(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        self.fake(worker, start_s=2)
        threading.Timer(0.1, comp.pango.stopping.set).start()
        with self.assertRaises(m.JobError) as caught:
            worker.call("fonts", {}, threading.Event(), 1)
        self.assertEqual(caught.exception.status, 409)
        self.assertIsNone(worker.failure)

    def test_health_does_not_bring_back_a_worker_whose_restart_failed(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        calls = self.fake(worker)
        comp.pango.fonts("ce")
        mock.patch.stopall()
        failing = self.fake(worker, answer=m._text_failure("native-text-error", "Manim is gone."))
        worker.proc = None  # it died; its venv went with it
        self.assertEqual(comp.health()["capabilities"]["pango"]["ce"], {"state": "preparing"})
        deadline = time.monotonic() + 2
        while comp.pango.probing() and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertEqual(comp.health()["capabilities"]["pango"]["ce"],
                         {"state": "failed", "message": "Manim is gone."})
        # However often /health is asked, and however long after, it does not try again.
        comp.pango._probe_after["ce"] = 0
        for _ in range(5):
            comp.health()
            time.sleep(0.02)
        self.assertEqual(failing.count("start"), 1)
        self.assertEqual(calls.count("start"), 1)
        # A request does.
        with self.assertRaises(m.JobError):
            comp.pango.fonts("ce")
        self.assertEqual(failing.count("start"), 2)

    def test_requests_that_wait_for_a_start_that_fails_do_not_each_start_again(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        calls = self.fake(worker, start_s=0.3, answer=m._text_failure("native-text-error", "No Pango here."))
        outcomes = []

        def ask(operation):
            try:
                worker.call(operation, {}, threading.Event(), 1)
                outcomes.append((operation, "ok"))
            except m.JobError as exc:
                outcomes.append((operation, exc.status, exc.message))

        threads = [threading.Thread(target=ask, args=(operation,)) for operation in ("fonts", "text", "text")]
        threads[0].start()
        time.sleep(0.1)  # the start is under way
        for thread in threads[1:]:
            thread.start()
        for thread in threads:
            thread.join(3)
        # One start for the three of them; they all hear why it failed.
        self.assertEqual(calls.count("start"), 1)
        self.assertCountEqual(outcomes, [("fonts", 503, "No Pango here."), ("text", 503, "No Pango here."),
                                         ("text", 503, "No Pango here.")])
        # A request that comes afterwards is another matter: it tries.
        with self.assertRaises(m.JobError):
            worker.call("fonts", {}, threading.Event(), 1)
        self.assertEqual(calls.count("start"), 2)

    def test_a_start_that_cannot_even_begin_is_a_failure_health_tells(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        with mock.patch.object(worker, "_start", side_effect=OSError("No space left on device")):
            with self.assertRaises(m.JobError) as caught:
                comp.pango.fonts("ce")
        self.assertEqual(caught.exception.status, 503)
        self.assertEqual(comp.health()["capabilities"]["pango"]["ce"],
                         {"state": "failed", "message": "The native text worker could not be started."})
        self.assertFalse(worker.starting)

    def test_where_text_is_not_shaped_the_companion_refuses_without_a_worker(self):
        """Off Linux the worker would import Manim, which takes seconds, only to refuse: every
        ``/fonts`` and ``/text`` paid that start. The companion says it for the worker."""
        comp = self.companion(ce="0.22.1")
        worker = comp.pango.workers["ce"]
        calls = self.fake(worker)
        with mock.patch.object(m, "TEXT_SHAPING_HERE", False):
            for _ in range(2):
                with self.assertRaises(m.JobError) as caught:
                    comp.pango.fonts("ce")
                self.assertEqual(caught.exception.status, 503)
                self.assertEqual(caught.exception.message, m.TEXT_SHAPING_REFUSAL)
            self.assertEqual(calls, [])  # nothing was started to say it
            self.assertEqual(comp.health()["capabilities"]["pango"]["ce"],
                             {"state": "failed", "message": m.TEXT_SHAPING_REFUSAL})
            self.assertFalse(worker.starting)
        # The worker says the same words where it is asked.
        self.assertIn("Linux Pango/Fontconfig", m.TEXT_SHAPING_REFUSAL)

    def test_a_request_before_the_interpreter_is_known_leaves_no_failure(self):
        comp = self.companion()
        worker = comp.pango.workers["ce"]
        with mock.patch.object(worker, "_start") as start:
            with self.assertRaises(m.JobError) as caught:
                comp.pango.fonts("ce")
            start.assert_not_called()
        self.assertEqual(caught.exception.status, 503)
        self.assertIsNone(worker.failure)
        # The probe finds the interpreter a moment later: nothing was started, nothing failed.
        comp._manim["ce"] = {"python": "/nowhere/python", "version": "0.20"}
        self.assertEqual(comp.health()["capabilities"]["pango"]["ce"], {"state": "unused"})

    def test_a_wait_for_starts_is_bounded_whatever_the_starts_do(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        worker.lock.acquire()  # someone holds the worker, and says it is starting, for ever
        worker.starting = True
        self.addCleanup(lambda: worker.lock.locked() and worker.lock.release())
        with mock.patch.object(m, "TEXT_START_TIMEOUT_S", -9.9):  # limit: 0.1 s + the request's own
            started = time.monotonic()
            with self.assertRaises(m.JobError) as caught:
                worker.call("text", {}, threading.Event(), 0.1)
        self.assertEqual(caught.exception.status, 429)
        self.assertLess(time.monotonic() - started, 2)
        worker.starting = False

    def test_health_brings_back_a_worker_that_was_ready_and_went_away(self):
        comp = self.companion(ce="0.20")
        worker = comp.pango.workers["ce"]
        calls = self.fake(worker)
        comp.pango.fonts("ce")
        worker.proc.done = True  # it died (a cancelled request, a changed font, a time-out)
        self.assertEqual(comp.health()["capabilities"]["pango"]["ce"], {"state": "preparing"})
        deadline = time.monotonic() + 2
        while comp.pango.probing() and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertEqual(comp.health()["capabilities"]["pango"]["ce"]["state"], "ready")
        self.assertEqual(calls.count("start"), 2)

    def test_no_interpreter_is_no_text_whatever_the_worker_says(self):
        comp = self.companion()
        self.assertEqual(comp.health()["capabilities"]["pango"], {"ce": None, "gl": None})
        with self.assertRaises(m.JobError) as caught:
            comp.pango.fonts("ce")
        self.assertEqual(caught.exception.status, 503)
        # Still nothing to prepare: there is no library to shape text with.
        self.assertEqual(comp.health()["capabilities"]["pango"], {"ce": None, "gl": None})


class FontHashes(unittest.TestCase):
    """The digests of the font files, kept between starts."""

    DIGEST = "ab" * 32
    ENTRY = [1024, 1700000000000000000, 77, 1700000000000000001, DIGEST]

    def test_takes_only_a_table_of_the_expected_shape(self):
        good = {"/usr/share/fonts/a.ttf": self.ENTRY}
        self.assertEqual(m._font_hash_table(good), good)
        for bad in (None, [1, 2], "x", {"relative/a.ttf": self.ENTRY}, {"/a": [1, 2, 3, self.DIGEST]},
                    {"/a": [1, 2, 3, 4, "short"]}, {"/a": ["1", 2, 3, 4, self.DIGEST]},
                    {"/a": [True, 2, 3, 4, self.DIGEST]}, {"/a": [-1, 2, 3, 4, self.DIGEST]},
                    {"/a\udc80": self.ENTRY}, {"/a\0b": self.ENTRY}, {"/" + "a" * 5000: self.ENTRY},
                    {1: self.ENTRY}):
            self.assertEqual(m._font_hash_table(bad), {}, bad)
        with mock.patch.object(m, "MAX_FONT_HASHES", 1):
            self.assertEqual(m._font_hash_table({"/a": self.ENTRY, "/b": self.ENTRY}), {})

    def test_reads_a_json_file_within_its_limit_and_nothing_else(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "value")
            Path(path).write_text(json.dumps({"a": 1}), encoding="utf-8")
            self.assertEqual(m._read_json_file(path, 100), {"a": 1})
            self.assertIsNone(m._read_json_file(path, 3))
            Path(path).write_text("not json", encoding="utf-8")
            self.assertIsNone(m._read_json_file(path, 100))
            self.assertIsNone(m._read_json_file(os.path.join(directory, "missing"), 100))

    def test_the_companion_keeps_a_table_per_library_in_its_cache_directory(self):
        table = {"/fonts/a.ttf": self.ENTRY}
        with tempfile.TemporaryDirectory() as directory:
            first = m.Companion(cache_dir=directory, sandbox=False)
            self.addCleanup(first.shutdown)
            self.assertEqual(first.font_hashes("ce"), {})
            first.remember_font_hashes("ce", table)
            self.assertEqual(first.font_hashes("ce"), table)
            # What one library's worker reported is never handed to the other's.
            self.assertEqual(first.font_hashes("gl"), {})
            self.assertEqual(json.loads(Path(directory, m.FONT_HASHES_FILE).read_text()), {"ce": table})
            # Not one of the /tex results the cache prunes by their .json name.
            self.assertFalse(m.FONT_HASHES_FILE.endswith(".json"))
            # The next run starts from it.
            second = m.Companion(cache_dir=directory, sandbox=False)
            self.addCleanup(second.shutdown)
            self.assertEqual(second.font_hashes("ce"), table)
            # An empty table (a worker that reported none) does not wipe it.
            second.remember_font_hashes("ce", {})
            self.assertEqual(second.font_hashes("ce"), table)
            # A newer table replaces it: fonts that went away go from it too.
            newer = {"/fonts/b.ttf": self.ENTRY}
            second.remember_font_hashes("ce", newer)
            second.remember_font_hashes("gl", table)
            self.assertEqual(json.loads(Path(directory, m.FONT_HASHES_FILE).read_text()),
                             {"ce": newer, "gl": table})

    def test_a_kept_file_that_is_not_such_tables_is_no_table(self):
        with tempfile.TemporaryDirectory() as directory:
            for content in ("not json", json.dumps([1]), json.dumps({"ce": {"relative": self.ENTRY}}),
                            json.dumps({"ce": 3, "xx": {"/a": self.ENTRY}})):
                Path(directory, m.FONT_HASHES_FILE).write_text(content, encoding="utf-8")
                comp = m.Companion(cache_dir=directory, sandbox=False)
                self.addCleanup(comp.shutdown)
                self.assertEqual(comp.font_hashes("ce"), {}, content)
                self.assertEqual(comp.font_hashes("gl"), {}, content)

    def test_without_a_disk_cache_the_table_lives_for_the_run(self):
        comp = make_companion(sandbox=False)
        self.addCleanup(comp.shutdown)
        self.assertIsNone(comp.cache_dir)
        table = {"/fonts/a.ttf": self.ENTRY}
        comp.remember_font_hashes("gl", table)
        self.assertEqual(comp.font_hashes("gl"), table)

    def test_a_handed_copy_is_not_the_table_itself(self):
        comp = make_companion(sandbox=False)
        self.addCleanup(comp.shutdown)
        comp.remember_font_hashes("ce", {"/fonts/a.ttf": self.ENTRY})
        comp.font_hashes("ce").clear()
        self.assertEqual(len(comp.font_hashes("ce")), 1)

    def test_the_first_catalog_brings_the_table_and_the_client_never_sees_it(self):
        comp = make_companion(sandbox=False)
        self.addCleanup(comp.shutdown)
        worker = comp.pango.workers["ce"]

        class Process:
            stdin = mock.Mock()

            @staticmethod
            def poll():
                return None

        table = {"/fonts/a.ttf": self.ENTRY}
        for reported, kept in ((table, table), ({"relative": self.ENTRY}, table), (None, table)):
            worker.proc = Process()
            worker.responses.put({**CATALOG, "fontHashes": reported} if reported is not None else dict(CATALOG))
            answer = worker._exchange("fonts", {}, threading.Event(), time.monotonic() + 1)
            self.assertEqual(answer, CATALOG)
            self.assertNotIn("fontHashes", worker.catalog)
            # Only a table of the expected shape is kept; anything else leaves the kept one alone.
            self.assertEqual(comp.font_hashes("ce"), kept)
        worker.proc = None

    def test_an_answer_that_is_no_catalog_is_not_kept(self):
        # /health reads the environment key off the kept catalog, for every client: an answer
        # without one, or with something else in its place, must not get there.
        comp = make_companion(sandbox=False)
        self.addCleanup(comp.shutdown)
        comp._manim["ce"] = {"python": "/nowhere/python", "version": "0.20"}
        worker = comp.pango.workers["ce"]

        class Process:
            stdin = mock.Mock()

            @staticmethod
            def poll():
                return None

        for answer in ({"ok": True}, {**CATALOG, "environmentKey": 7}, {**CATALOG, "environmentKey": "e" * 4096},
                       {**CATALOG, "fonts": None}):
            worker.proc = Process()
            worker.responses.put(dict(answer))
            with mock.patch.object(worker, "stop") as stop:
                with self.assertRaises(m.JobError) as caught:
                    worker._exchange("fonts", {}, threading.Event(), time.monotonic() + 1)
            self.assertEqual((caught.exception.status, caught.exception.message),
                             (503, "The native text worker sent no font catalog."))
            stop.assert_called_once()
            self.assertIsNone(worker.catalog)
            self.assertFalse(worker.known_supported)
            self.assertEqual(comp.health()["capabilities"]["pango"]["ce"], {"state": "unused"})
        worker.proc = None

    def test_diagnostics_that_are_no_list_of_objects_break_nothing(self):
        comp = make_companion(sandbox=False)
        self.addCleanup(comp.shutdown)
        worker = comp.pango.workers["ce"]
        worker.proc = mock.Mock()
        for diagnostics in ("none", [7, None, "font-environment-changed"], {"code": "font-environment-changed"}):
            answer = {"ok": False, "diagnostics": diagnostics}
            worker.responses.put(dict(answer))
            with mock.patch.object(worker, "stop") as stop:
                self.assertEqual(worker._exchange("text", {}, threading.Event(), time.monotonic() + 1), answer)
            stop.assert_not_called()
        # the real word still stops the worker
        worker.responses.put({"ok": False, "diagnostics": [{"code": "font-environment-changed"}]})
        with mock.patch.object(worker, "stop") as stop:
            worker._exchange("text", {}, threading.Event(), time.monotonic() + 1)
        stop.assert_called_once()
        worker.proc = None

    def test_a_font_that_cannot_be_read_is_no_reason_not_to_start(self):
        api = m._PangoAPI.__new__(m._PangoAPI)
        api.hashes, api.hashed = {}, {}
        # gone since Fontconfig listed it, or a name that is not UTF-8 and came out with U+FFFD
        self.assertEqual(api.font_digest("/nowhere/caf\ufffd.ttf"), "unreadable")
        self.assertEqual(api.hashed, {})
        with tempfile.TemporaryDirectory() as directory:
            font = os.path.join(directory, "font.ttf")
            Path(font).write_bytes(b"a font")
            self.assertEqual(api.font_digest(font), hashlib.sha256(b"a font").hexdigest())
        # the text that needs such a font still fails by itself
        with self.assertRaises(OSError):
            api.file_hash("/nowhere/caf\ufffd.ttf")

    @unittest.skipUnless(os.name == "posix", "the table takes the names of fonts that start with /")
    def test_a_font_whose_digest_is_known_is_not_read_again(self):
        api = m._PangoAPI.__new__(m._PangoAPI)  # no native library: only the bookkeeping
        api.hashes, api.hashed = {}, {}
        with tempfile.TemporaryDirectory() as directory:
            font = os.path.join(directory, "font.ttf")
            Path(font).write_bytes(b"first font")
            digest = api.file_hash(font)
            self.assertEqual(digest, hashlib.sha256(b"first font").hexdigest())
            stat = os.stat(font)
            self.assertEqual(api.hashed[font],
                             [stat.st_size, stat.st_mtime_ns, stat.st_ino, stat.st_ctime_ns, digest])
            # Handed to another worker, the table spares it the reading.
            table = os.path.join(directory, "table")
            Path(table).write_text(json.dumps(api.hashed), encoding="utf-8")
            other = m._PangoAPI.__new__(m._PangoAPI)
            other.hashes, other.hashed = {}, {}
            other.load_hashes(table)
            with mock.patch("builtins.open", side_effect=AssertionError("the font was read")):
                self.assertEqual(other.file_hash(font), digest)
            self.assertEqual(other.hashed, api.hashed)
            # Another font put in its place with the same size and the same date is read again:
            # its change time cannot be put back.
            Path(font).write_bytes(b"other font")
            os.utime(font, ns=(stat.st_atime_ns, stat.st_mtime_ns))
            self.assertEqual(os.stat(font).st_size, stat.st_size)
            self.assertEqual(os.stat(font).st_mtime_ns, stat.st_mtime_ns)
            self.assertEqual(other.file_hash(font), hashlib.sha256(b"other font").hexdigest())
            # A table that is anything else is no table.
            Path(table).write_text(json.dumps({"relative": [1, 2, 3, 4, "x"]}), encoding="utf-8")
            third = m._PangoAPI.__new__(m._PangoAPI)
            third.hashes, third.hashed = {}, {}
            third.load_hashes(table)
            self.assertEqual(third.hashes, {})


class TextHTTP(test_http.ServerCase):
    def test_validation_and_method_errors_are_http_errors(self):
        self.assertEqual(self.request("GET", "/text")[0], 405)
        self.assertEqual(self.request("POST", "/fonts", {})[0], 405)
        self.assertEqual(self.request("POST", "/text", request(fontSize=0))[0], 400)
        self.assertEqual(self.request("POST", "/text", request("x" * 33000))[0], 413)
        self.assertEqual(self.request("GET", "/fonts?target=bad")[0], 400)
        self.assertEqual(self.request("DELETE", "/text/known-request")[0], 200)
        self.assertEqual(self.request("DELETE", "/text/../invalid")[0], 404)

    def test_native_routes_keep_origin_and_host_checks(self):
        self.assertEqual(self.request("GET", "/fonts?target=ce", host="evil.invalid")[0], 403)
        self.assertEqual(self.request("POST", "/text", request(), headers={"Origin": "https://evil.invalid"})[0], 403)
        self.assertEqual(self.request("DELETE", "/text/a", headers={"Origin": "null"})[0], 403)


@unittest.skipUnless(venv_python("ce") and venv_python("gl"), "Both existing Manim interpreters are required")
@unittest.skipUnless(sys.platform.startswith("linux"), "Native text mapping needs the Linux Pango/Fontconfig backend")
class NativeText(unittest.TestCase):
    def test_sandbox_mapping_and_contours_match_independent_native_constructors(self):
        for target in ("ce", "gl"):
            with self.subTest(target=target):
                self.check_target(target)

    def check_target(self, target):
        python = venv_python(target)
        comp = make_companion(sandbox=True)
        comp.ce_python = python if target == "ce" else None
        comp.gl_python = python if target == "gl" else None
        try:
            comp.start_probes(); comp.wait_for_probes(40)
            # The interpreter is found, and nothing of text has started.
            self.assertEqual(comp.health()["capabilities"]["pango"][target], {"state": "unused"})
            self.assertIsNone(comp.pango.workers[target].proc)
            self.assertEqual(comp.font_hashes(target), {})
            catalog = comp.pango.fonts(target)
            self.assertTrue(catalog["ok"], catalog)
            self.assertEqual(comp.health()["capabilities"]["pango"][target],
                             {"state": "ready", "adapterVersion": m.PANGO_ADAPTER_VERSION,
                              "environmentKey": catalog["environmentKey"]})
            # The catalog a client gets is the catalog alone.
            self.assertNotIn("fontHashes", catalog)
            # The worker reported the digests of the fonts it hashed: every one a real font file,
            # named as the companion sees it too. Its library's table alone has them.
            hashes = comp.font_hashes(target)
            self.assertGreater(len(hashes), 0)
            self.assertEqual(comp.font_hashes("gl" if target == "ce" else "ce"), {})
            for path, (size, mtime, inode, ctime, digest) in list(hashes.items())[:20]:
                stat = os.stat(path)
                self.assertEqual((size, mtime, inode, ctime),
                                 (stat.st_size, stat.st_mtime_ns, stat.st_ino, stat.st_ctime_ns))
                self.assertRegex(digest, r"^[0-9a-f]{64}$")
            family = next((f["family"] for f in catalog["fonts"] if f["family"] == "Noto Serif"), None)
            if family is None:
                self.skipTest("The parity corpus requires Noto Serif (no font is installed by the tests)")
            worker = comp.pango.workers[target]
            pid = worker.proc.pid
            sources = ["AVATAR office", "café e\u0301 A\u030a", "abc אבג سلام xyz", "A\n\nV",
                       "A\tV", "", " \t\n ", "  <b>{{literal}}</b>  "]
            requests = [request(source, target) for source in sources]
            requests += [request("AV office\nsecond", target, font={"family": family, "weight": weight,
                          "slant": slant}) for weight, slant in (("bold", "normal"), ("normal", "italic"),
                                                                 ("bold", "italic"))]
            results = [comp.pango.render(m.validate_text_request(req)) for req in requests]
            for result in results:
                self.assertTrue(result["ok"], result)
                self.assertEqual(result["environmentKey"], catalog["environmentKey"])
                self.assertRegex(result["provenance"]["geometrySignature"], r"^[0-9a-f]{64}$")
                self.assertTrue(all(f["fontHash"] and f["ranges"] for f in result["provenance"]["resolvedFonts"]))
            # The initiating probe thread has finished; bubblewrap must keep the worker alive.
            self.assertEqual(worker.proc.pid, pid)
            cached = comp.pango.render(m.validate_text_request(requests[0]))
            self.assertTrue(cached["cached"])
            self.assertEqual(cached["requestKey"], results[0]["requestKey"])
            ffi = next(g for g in results[0]["glyphs"] if g["label"] == "ffi")
            self.assertEqual(ffi["sourceRanges"], [{"start": 8, "end": 11}])
            accent = next(g for g in results[1]["glyphs"] if g["label"] == "e\u0301")
            self.assertEqual(accent["sourceRanges"], [{"start": 5, "end": 7}])
            rtl_ranges = [g["sourceRanges"][0]["start"] for g in results[2]["glyphs"]]
            self.assertNotEqual(rtl_ranges, sorted(rtl_ranges))
            self.assertEqual(len(results[3]["lines"]), 3)
            self.assertEqual(results[5]["glyphs"], [])
            self.assertEqual(results[6]["glyphs"], [])
            emoji = comp.pango.render(m.validate_text_request(request("hello 👩\u200d💻", target)))
            self.assertFalse(emoji["ok"])
            self.assertEqual(emoji["diagnostics"][0]["ranges"], [{"start": 6, "end": 11}])
            missing = comp.pango.render(m.validate_text_request(request("x", target, font={
                "family": "MFE nonexistent font family", "weight": "normal", "slant": "normal"})))
            self.assertEqual(missing["diagnostics"][0]["code"], "missing-font")
            # A local file/config change retires the stale worker; health starts a bounded
            # background reprobe and republishes readiness without requiring an editor reopen.
            config_path = Path(worker.directory) / "fonts.conf"
            config_path.write_text(config_path.read_text() + "\n")
            changed = comp.pango.render(m.validate_text_request(request("changed", target)))
            self.assertEqual(changed["diagnostics"][0]["code"], "font-environment-changed")
            health = comp.health()
            self.assertEqual(health["capabilities"]["pango"][target], {"state": "preparing"})
            deadline = time.monotonic() + 20
            while comp.pango.probing() and time.monotonic() < deadline:
                time.sleep(0.05)
            self.assertEqual(comp.health()["capabilities"]["pango"][target]["state"], "ready")
            restarted = comp.pango.fonts(target)
            # Identical font bytes/rules at a new worker path have the same portable identity:
            # the second start took the digests from the table and names the same environment.
            self.assertEqual(restarted["environmentKey"], catalog["environmentKey"])
            self.assertEqual(comp.font_hashes(target), hashes)
            with tempfile.TemporaryDirectory() as directory:
                input_file, output_file = Path(directory) / "requests.json", Path(directory) / "output.json"
                input_file.write_text(json.dumps(requests), encoding="utf-8")
                script = str(Path(__file__).with_name("pango_reference.py"))
                process = subprocess.run([python, script, target, str(input_file), str(output_file)],
                                         cwd=directory, capture_output=True, timeout=90)
                self.assertEqual(process.returncode, 0, process.stderr.decode(errors="replace")[-3000:])
                reference = json.loads(output_file.read_text())
            for result, expected in zip(results, reference):
                self.assertEqual(result["provenance"]["calibration"], expected["calibration"])
                self.assertEqual(len(result["glyphs"]), len(expected["children"]))
                if result["glyphs"]:
                    # A centered native line's logical vertical extent straddles its ink
                    # center. A double-subtracted SVG y origin incorrectly shifts it away.
                    self.assertLessEqual(result["logicalBBox"]["minY"], 0)
                    self.assertGreaterEqual(result["logicalBBox"]["maxY"], 0)
                for line in result["lines"]:
                    visible = any(r["start"] < line["end"] and r["end"] > line["start"]
                                  for glyph in result["glyphs"] for r in glyph["sourceRanges"])
                    if visible:
                        self.assertTrue(any(abs(line["baseline"] - y) < 2e-6
                                            for y in expected["svgBaselines"]), (line, expected["svgBaselines"]))
                for glyph, child in zip(result["glyphs"], expected["children"]):
                    paths = []
                    for subpath in child["subpaths"]:
                        contour = subpath[0][:2]
                        stride = 4 if target == "ce" else 2
                        for j in range(0, len(subpath) - (0 if target == "ce" else 2), stride):
                            if target == "ce":
                                contour += [v for p in subpath[j + 1:j + 4] for v in p[:2]]
                            else:
                                a, h, b = subpath[j:j + 3]
                                contour += [(a[k] + 2 * h[k]) / 3 for k in (0, 1)]
                                contour += [(2 * h[k] + b[k]) / 3 for k in (0, 1)] + b[:2]
                        if len(contour) > 2:
                            paths.append(contour)
                    self.assertEqual([len(p) for p in glyph["contours"]], [len(p) for p in paths])
                    for a, b in zip(glyph["contours"], paths):
                        self.assertLess(max(abs(x - y) for x, y in zip(a, b)), 1e-6)
        finally:
            directories = [w.directory for w in comp.pango.workers.values() if w.directory]
            comp.shutdown()
            self.assertTrue(all(not os.path.exists(path) for path in directories))
