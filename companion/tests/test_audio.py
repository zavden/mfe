"""Companion 1.5: the soundtrack of a job. POST /video/<id>/audio (and /manim-render/<id>/audio)
take a WAV file in pieces; when the video is ready, a second pass of ffmpeg copies it and encodes
the sound next to it."""
import array
import http.client
import json
import math
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import types
import unittest
from unittest import mock

import test_http
import test_jobs
from support import (CAN_SYMLINK, make_companion, mfe_companion, python_program, requires_symlinks,
                     temporary_file)
from test_jobs import png, requires_ffmpeg

m = mfe_companion
# The stand-in of a second pass that never ends.
SLEEPS = python_program("import time; time.sleep(60)")
RATE = m.AUDIO_RATE


def soundtrack(frames: int, pulses=(0.3,)) -> bytes:
    """The WAV file of a job: silence with a 50 ms tone starting at each of ``pulses`` (seconds)."""
    data = bytearray(frames * 4)
    for at in pulses:
        first = round(at * RATE)
        for i in range(first, min(frames, first + RATE // 20)):
            value = int(0.6 * 32767 * math.sin(2 * math.pi * 1000 * (i - first) / RATE))
            struct.pack_into("<hh", data, i * 4, value, value)
    return m.wav_header(frames) + bytes(data)


def streams(path: str) -> dict:
    """ffprobe's view of a file: {"video": {...}, "audio": {...}, "duration": seconds}."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-count_packets", "-show_entries",
         "stream=codec_type,codec_name,width,height,nb_read_packets,sample_rate,channels,duration,"
         "color_space,color_range:format=duration", "-of", "json", path],
        capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    found = {s["codec_type"]: s for s in data["streams"]}
    found["duration"] = float(data["format"]["duration"])
    return found


def first_frame_colour(path: str) -> tuple:
    """(colour space, colour range) of a file's first video frame, as its decoder reads them."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-read_intervals", "%+#1",
         "-show_entries", "frame=color_space,color_range", "-of", "json", path],
        capture_output=True, text=True, check=True).stdout
    frame = (json.loads(out).get("frames") or [{}])[0]
    return frame.get("color_space"), frame.get("color_range")


def decoded(path: str) -> tuple[int, list[int]]:
    """The sound of a file as ffmpeg decodes it: (sample frames, the frame where each tone begins)."""
    pcm = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "2", "-ar", str(RATE), "-f", "s16le", "pipe:1"],
        capture_output=True, check=True).stdout
    samples = array.array("h")
    samples.frombytes(pcm)
    left = samples[0::2]
    peak = max(abs(v) for v in left)
    onsets, loud = [], -10 ** 9
    for i, value in enumerate(left):
        if abs(value) <= peak / 2:
            continue
        if i - loud > RATE // 10:
            onsets.append(i)
        loud = i
    return len(left), onsets


class Lengths(unittest.TestCase):
    def test_the_soundtrack_lasts_frames_over_fps(self):
        self.assertEqual(m.audio_frames(20, 10), 96000)
        self.assertEqual(m.audio_frames(1, 3), 16000)
        self.assertEqual(m.audio_frames(1, 7), 6857)  # 6857.14
        self.assertEqual(m.audio_frames(5, 7), 34286)  # 34285.71
        self.assertEqual(m.audio_frames(1, 240), 200)
        for fps in range(1, m.MAX_VIDEO_FPS + 1):  # the nearest whole number, as the app rounds it
            for frames in (1, 7, 123):
                self.assertEqual(m.audio_frames(frames, fps), round(frames * RATE / fps), (frames, fps))

    def test_requests(self):
        ok = {"format": "mp4", "width": 64, "height": 48, "fps": 10, "frames": 20}
        self.assertIs(m.validate_video_request(ok).audio, False)
        self.assertIs(m.validate_video_request({**ok, "audio": True}).audio, True)
        for bad in ({"audio": 1}, {"audio": "yes"}, {"audio": None},
                    {"audio": True, "format": "gif"},  # a GIF has no sound
                    {"audio": True, "fps": 1, "frames": m.MAX_AUDIO_SECONDS + 1}):  # over an hour
            with self.assertRaises(m.JobError, msg=bad) as ctx:
                m.validate_video_request({**ok, **bad})
            self.assertEqual(ctx.exception.status, 400)
        # an hour exactly is accepted, and a silent video of any length
        self.assertTrue(m.validate_video_request({**ok, "audio": True, "fps": 1, "frames": 3600}).audio)
        self.assertFalse(m.validate_video_request({**ok, "fps": 1, "frames": 3601}).audio)


class WavHeader(unittest.TestCase):
    def test_the_canonical_header(self):
        head = m.wav_header(96000)
        self.assertEqual(len(head), m.WAV_HEADER_BYTES)
        riff, size, wave, fmt, fmt_size, kind, channels, rate, byte_rate, align, bits, data, data_size = \
            struct.unpack("<4sI4s4sIHHIIHH4sI", head)
        self.assertEqual((riff, wave, fmt, data), (b"RIFF", b"WAVE", b"fmt ", b"data"))
        self.assertEqual((fmt_size, kind, channels, rate, byte_rate, align, bits), (16, 1, 2, 48000, 192000, 4, 16))
        self.assertEqual((data_size, size), (384000, 384036))
        self.assertIsNone(m.wav_header_problem(head, 96000))

    def test_anything_else_is_refused(self):
        good = m.wav_header(1000)

        def changed(at: int, value: bytes) -> bytes:
            return good[:at] + value + good[at + len(value):]

        cases = {
            "not a WAV": (b"OggS" + good[4:], "not a WAV file"),
            "RIFF of another kind": (changed(8, b"AVI "), "not a WAV file"),
            "short": (good[:40], "not a WAV file"),
            "mono": (changed(22, (1).to_bytes(2, "little")), "16-bit PCM, stereo, 48000 Hz"),
            "44.1 kHz": (changed(24, (44100).to_bytes(4, "little")), "16-bit PCM, stereo, 48000 Hz"),
            "float samples": (changed(20, (3).to_bytes(2, "little")), "16-bit PCM, stereo, 48000 Hz"),
            "a longer fmt chunk": (changed(16, (18).to_bytes(4, "little")), "16-bit PCM, stereo, 48000 Hz"),
            "another chunk before the samples": (changed(36, b"LIST"), "16-bit PCM, stereo, 48000 Hz"),
            "another length": (m.wav_header(1001), "1000 sample frames"),
            "sizes that disagree": (changed(4, (5).to_bytes(4, "little")), "do not agree"),
        }
        for name, (head, expected) in cases.items():
            with self.subTest(name):
                self.assertIn(expected, m.wav_header_problem(head, 1000))


class SecondPass(unittest.TestCase):
    def test_the_command_copies_the_video_and_encodes_the_sound(self):
        for fmt, demuxer, encoder, rate in (("mp4", "mov", "aac", "192k"), ("mov", "mov", "aac", "192k"),
                                            ("webm", "matroska", "libopus", "128k")):
            cmd = m.build_mux_command("/usr/bin/ffmpeg", fmt, "/job/out.x", "/sound/audio.wav", "/sound/out.x")
            self.assertEqual(cmd[0], "/usr/bin/ffmpeg")
            self.assertEqual(cmd[-3:], ["-f", fmt, "/sound/out.x"])
            # each input is read with a fixed demuxer: ffmpeg does not guess what the files are
            first, second = cmd.index("-i"), len(cmd) - 1 - cmd[::-1].index("-i")
            self.assertEqual(cmd[first - 2:first + 2], ["-f", demuxer, "-i", "/job/out.x"])
            self.assertEqual(cmd[second - 2:second + 2], ["-f", "wav", "-i", "/sound/audio.wav"])
            self.assertEqual(cmd[cmd.index("-c:v") + 1], "copy")
            self.assertEqual(cmd[cmd.index("-c:a") + 1], encoder)
            self.assertEqual(cmd[cmd.index("-b:a") + 1], rate)
            self.assertEqual(cmd[cmd.index("-map") + 1], "0:v:0")
            self.assertIn("-nostdin", cmd)
            self.assertEqual("+faststart" in cmd, fmt == "mp4")

    def test_the_cap_leaves_room_for_the_sound_of_the_longest_video(self):
        # what the first pass may write, plus an hour of the densest sound the second pass encodes
        an_hour_of_sound = m.MAX_AUDIO_SECONDS * 192_000 // 8
        self.assertGreater(m.SOUND_ROOM_BYTES, an_hour_of_sound)
        self.assertGreater(m.sound_output_cap(m.MAX_OUTPUT_BYTES), m.MAX_OUTPUT_BYTES + an_hour_of_sound)

    def test_the_cap_follows_a_video_larger_than_the_first_pass_writes(self):
        # the first pass stops ffmpeg at its cap; the video Manim writes has none, and the copy
        # with sound is at least as large as the video
        with_sound = m.MAX_OUTPUT_BYTES + m.SOUND_ROOM_BYTES
        self.assertEqual(m.sound_output_cap(0), with_sound)
        self.assertEqual(m.sound_output_cap(m.MAX_OUTPUT_BYTES), with_sound)
        larger = m.MAX_OUTPUT_BYTES + 5 * 1024 ** 3
        self.assertEqual(m.sound_output_cap(larger), with_sound + 5 * 1024 ** 3)
        self.assertGreater(m.sound_output_cap(larger), larger + m.MAX_AUDIO_SECONDS * 192_000 // 8)

    def test_the_cap_follows_the_limit_the_companion_was_given(self):
        # `serve --max-video-gib 8`: the first pass writes 8 GiB at most, and the second has the
        # room for the sound over that
        limit = 8 * m.GIB
        self.assertEqual(m.sound_output_cap(0, limit), limit + m.SOUND_ROOM_BYTES)
        self.assertEqual(m.sound_output_cap(limit, limit), limit + m.SOUND_ROOM_BYTES)
        self.assertEqual(m.sound_output_cap(limit + 1000, limit), limit + m.SOUND_ROOM_BYTES + 1000)

    def test_gif_has_no_second_pass(self):
        self.assertNotIn("gif", m.AUDIO_ENCODERS)
        self.assertLessEqual(set(m.AUDIO_ENCODERS), set(m.VIDEO_FORMATS))


class Encoders(unittest.TestCase):
    LISTING = b"""Encoders:
 V..... = Video
 A..... = Audio
 ------
 V....D libx264              libx264 H.264 / AVC
 A....D aac                  AAC (Advanced Audio Coding)
 A..X.D opus                 Opus
 A....D pcm_s16le            PCM signed 16-bit little-endian
 S..... ass                  ASS (Advanced SubStation Alpha) subtitle
"""

    def formats(self, listing: bytes, found="/usr/bin/ffmpeg"):
        companion = make_companion()
        self.addCleanup(companion.shutdown)
        with mock.patch.object(m.Companion, "_tool", staticmethod(lambda name: found)), \
                mock.patch.object(m, "_run", return_value=m._RunResult(0, listing, b"")) as run:
            first = companion.video_audio_formats()
            self.assertEqual(companion.video_audio_formats(), first)  # asked once per ffmpeg
            return first, run.call_count

    def test_formats_follow_the_encoders_ffmpeg_has(self):
        # the native "opus" encoder is experimental: only libopus counts
        self.assertEqual(self.formats(self.LISTING), (["mp4", "mov"], 1))
        both = self.LISTING + b" A....D libopus              libopus Opus\n"
        self.assertEqual(self.formats(both)[0], ["mp4", "mov", "webm"])
        self.assertEqual(self.formats(b" V....D libx264 x\n A....D libopus Opus\n")[0], ["webm"])
        self.assertEqual(self.formats(b"")[0], [])

    def test_no_ffmpeg_no_sound(self):
        self.assertEqual(self.formats(self.LISTING, found=None), ([], 0))

    def test_a_probe_that_fails_means_no_sound(self):
        companion = make_companion()
        self.addCleanup(companion.shutdown)
        with mock.patch.object(m.Companion, "_tool", staticmethod(lambda name: "/usr/bin/ffmpeg")), \
                mock.patch.object(m, "_run", side_effect=OSError("gone")):
            self.assertEqual(companion.video_audio_formats(), [])

    def test_another_ffmpeg_is_asked_again(self):
        companion = make_companion()
        self.addCleanup(companion.shutdown)
        with mock.patch.object(m, "_run", return_value=m._RunResult(0, self.LISTING, b"")) as run:
            for path in ("/a/ffmpeg", "/a/ffmpeg", "/b/ffmpeg"):
                with mock.patch.object(m.Companion, "_tool", staticmethod(lambda name, path=path: path)):
                    companion.video_audio_formats()
            self.assertEqual(run.call_count, 2)


@requires_ffmpeg
class VideoSound(test_http.ServerCase):
    """A video job with a soundtrack, against the real ffmpeg."""

    FRAMES, FPS = 20, 10  # two seconds
    SAMPLES = 96000

    def create(self, **changes):
        body = {"format": "mp4", "quality": "low", "width": 64, "height": 48, "fps": self.FPS,
                "frames": self.FRAMES, "audio": True, **changes}
        status, _, data = self.request("POST", "/video", body)
        return status, data

    def post_audio(self, job, offset, body, route="video"):
        return self.request("POST", f"/{route}/{job}/audio?offset={offset}", raw_body=body,
                            headers={"Content-Type": "application/octet-stream"})

    def post_frames(self, job, count=None):
        count = self.FRAMES if count is None else count
        return self.request("POST", f"/video/{job}/frames?first=0", raw_body=png(64, 48) * count,
                            headers={"Content-Type": "application/octet-stream"})

    def finish(self, job):
        return self.request("POST", f"/video/{job}/finish", {})

    def download(self, job, suffix):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        conn.request("GET", f"/video/{job}/result")
        resp = conn.getresponse()
        body = resp.read()
        conn.close()
        self.assertEqual(resp.status, 200)
        return temporary_file(self, body, suffix), resp

    def tearDown(self):
        for job in list(self.companion.jobs._jobs.values()):
            self.companion.jobs.remove(job.kind, job.id)

    def test_health_says_which_formats_take_sound(self):
        formats = self.request("GET", "/health")[2]["capabilities"]["videoAudio"]
        self.assertEqual(formats, self.companion.video_audio_formats())
        self.assertIn("mp4", formats)  # ffmpeg's own AAC encoder is in every build we know

    def test_the_file_has_the_video_and_the_sound_in_time(self):
        wav = soundtrack(self.SAMPLES, pulses=(0.3, 1.2))
        for fmt, video, audio in (("mp4", "h264", "aac"), ("webm", "vp9", "opus"), ("mov", "prores", "aac")):
            if fmt not in self.companion.video_audio_formats():
                continue
            with self.subTest(format=fmt):
                status, data = self.create(format=fmt)
                self.assertEqual(status, 201, data)
                self.assertEqual((data["audioBytes"], data["audioReceived"]), (len(wav), 0))
                self.assertEqual(data["maxAudioRequestBytes"], m.MAX_AUDIO_REQUEST_BYTES)
                job_id = data["id"]
                job = self.companion.jobs.get("video", job_id)
                # in pieces, the first one holding the header
                status, _, data = self.post_audio(job_id, 0, wav[:100_000])
                self.assertEqual((status, data["audioReceived"], data["state"]), (200, 100_000, "receiving"))
                self.assertEqual(self.post_audio(job_id, 100_000, wav[100_000:])[2]["audioReceived"], len(wav))
                self.assertEqual(self.post_frames(job_id)[0], 200)
                status, _, data = self.finish(job_id)
                self.assertEqual((status, data["state"]), (200, "done"), data)
                path, resp = self.download(job_id, "." + fmt)
                self.assertEqual(resp.getheader("Content-Type"), m.VIDEO_FORMATS[fmt][1])
                self.assertEqual(os.path.getsize(path), data["bytes"])
                found = streams(path)
                self.assertEqual(found["video"]["codec_name"], video)
                self.assertEqual(int(found["video"]["nb_read_packets"]), self.FRAMES)  # copied, not re-encoded
                # BT.709, limited range: in the frames, which is what a decoder goes by, and in
                # ffprobe's view of the stream where its version has one (for ProRes in MOV,
                # ffprobe 7.1 has none of the very file ffprobe 8 has one of)
                self.assertEqual(first_frame_colour(path), ("bt709", "tv"))
                for key, value in (("color_space", "bt709"), ("color_range", "tv")):
                    if key in found["video"]:
                        self.assertEqual(found["video"][key], value)
                self.assertEqual((found["audio"]["codec_name"], found["audio"]["sample_rate"],
                                  found["audio"]["channels"]), (audio, "48000", 2))
                # the file lasts what the video lasts (ffmpeg's WebM header adds the 6.5 ms that Opus
                # starts early, rounded up to whole milliseconds)
                self.assertAlmostEqual(found["duration"], 2.0, delta=0.009 if fmt == "webm" else 0.0005)
                # and every tone begins on the sample it begins on in the WAV file
                samples, onsets = decoded(path)
                self.assertEqual(len(onsets), 2)
                for onset, at in zip(onsets, (0.3, 1.2)):
                    self.assertLessEqual(abs(onset - decoded_onset(at)), 2, (fmt, onsets))
                self.assertGreaterEqual(samples, self.SAMPLES)
                self.assertLess(samples, self.SAMPLES + 1024)  # a decoder may give the last codec frame whole
                # the first pass's file and the WAV are gone: only the result is kept
                self.assertEqual(os.listdir(job.dir), [])
                self.assertEqual(os.listdir(job.audio.dir), [f"out.{m.VIDEO_FORMATS[fmt][0]}"])
                sound_dir = job.audio.dir
                self.assertEqual(self.request("DELETE", f"/video/{job_id}")[0], 200)
                self.assertFalse(os.path.exists(job.dir))
                self.assertFalse(os.path.exists(sound_dir))

    def test_a_job_without_audio_refuses_a_soundtrack_and_is_as_before(self):
        status, data = self.create(audio=False)
        self.assertEqual(status, 201)
        self.assertNotIn("audioBytes", data)
        self.assertNotIn("maxAudioRequestBytes", data)
        job = self.companion.jobs.get("video", data["id"])
        self.assertIsNone(job.audio)
        status, _, body = self.post_audio(data["id"], 0, soundtrack(self.SAMPLES))
        self.assertEqual(status, 409)
        self.assertIn("without \"audio\"", body["error"]["message"])
        self.post_frames(data["id"])
        self.assertEqual(self.finish(data["id"])[2]["state"], "done")
        path, _ = self.download(data["id"], ".mp4")
        self.assertNotIn("audio", streams(path))

    def test_the_first_request_must_start_with_the_header_of_this_job(self):
        _, data = self.create()
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        wav = soundtrack(self.SAMPLES)
        for body, expected in (
                (wav[:20], "whole WAV header"),
                (b"RIFX" + wav[4:2000], "not a WAV file"),
                (soundtrack(self.SAMPLES - 1)[:2000], f"{self.SAMPLES} sample frames"),
                (m.wav_header(self.SAMPLES)[:22] + (1).to_bytes(2, "little") + wav[24:2000], "stereo")):
            status, _, answer = self.post_audio(job_id, 0, body)
            self.assertEqual(status, 400, answer)
            self.assertIn(expected, answer["error"]["message"])
            # refused whole: nothing was stored and the job goes on
            self.assertEqual((job.state, job.audio.received), ("receiving", 0))
            self.assertFalse(os.path.exists(job.audio.path))
        self.assertEqual(self.post_audio(job_id, 0, wav)[0], 200)

    def test_order_and_limits(self):
        _, data = self.create()
        job_id = data["id"]
        wav = soundtrack(self.SAMPLES)
        route = f"/video/{job_id}/audio"
        self.assertEqual(self.request("POST", route, raw_body=wav[:1000])[0], 400)  # no offset
        self.assertEqual(self.request("POST", route + "?offset=-1", raw_body=wav[:1000])[0], 400)
        self.assertEqual(self.request("POST", route + "?offset=x", raw_body=wav[:1000])[0], 400)
        self.assertEqual(self.request("POST", route + "?offset=0", raw_body=b"")[0], 400)  # no body
        status, _, body = self.post_audio(job_id, 500, wav[500:1000])  # not from the start
        self.assertEqual(status, 409)
        self.assertIn("expected offset 0", body["error"]["message"])
        self.assertEqual(self.post_audio(job_id, 0, wav[:1000])[0], 200)
        self.assertEqual(self.post_audio(job_id, 0, wav[:1000])[0], 409)  # a retry of what arrived
        status, _, body = self.post_audio(job_id, 1000, wav[1000:] + b"\0\0\0\0")  # past the end
        self.assertEqual(status, 400)
        self.assertIn("past its end", body["error"]["message"])
        self.assertEqual(self.request("GET", f"/video/{job_id}")[2]["audioReceived"], 1000)
        with mock.patch.object(m, "MAX_AUDIO_REQUEST_BYTES", 2000):
            status, _, body = self.post_audio(job_id, 1000, wav[1000:4000])
        self.assertEqual(status, 413)
        self.assertEqual(self.request("GET", f"/video/{job_id}")[2]["audioReceived"], 1000)
        self.assertEqual(self.post_audio(job_id, 1000, wav[1000:])[2]["audioReceived"], len(wav))
        status, _, body = self.post_audio(job_id, len(wav), b"more")  # nothing fits after the end
        self.assertEqual(status, 400)

    def test_finish_waits_for_the_whole_soundtrack(self):
        _, data = self.create()
        job_id = data["id"]
        wav = soundtrack(self.SAMPLES)
        self.post_frames(job_id)
        status, _, body = self.finish(job_id)
        self.assertEqual(status, 409)
        self.assertIn(f"0 of {len(wav)} bytes of the soundtrack", body["error"]["message"])
        self.post_audio(job_id, 0, wav[:5000])
        self.assertEqual(self.finish(job_id)[0], 409)
        # the job is still usable; and the sound may come after the frames
        self.assertEqual(self.post_audio(job_id, 5000, wav[5000:])[0], 200)
        self.assertEqual(self.finish(job_id)[2]["state"], "done")
        status, _, body = self.post_audio(job_id, 0, wav)  # too late
        self.assertEqual(status, 410)

    def test_a_body_that_ends_early_keeps_what_arrived(self):
        _, data = self.create()
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        wav = soundtrack(self.SAMPLES)
        conn = socket.create_connection(("127.0.0.1", self.port), timeout=30)
        conn.sendall((f"POST /video/{job_id}/audio?offset=0 HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\n"
                      f"Content-Length: 50000\r\n\r\n").encode() + wav[:30000])
        conn.shutdown(socket.SHUT_WR)  # the client goes away in the middle of the body
        reply = conn.recv(4096)
        conn.close()
        self.assertIn(b" 400 ", reply.split(b"\r\n")[0] + b" ")
        self.assertEqual((job.state, job.audio.received, job.audio.feeding), ("receiving", 30000, False))
        self.assertEqual(os.path.getsize(job.audio.path), 30000)
        self.assertEqual(self.post_audio(job_id, 30000, wav[30000:])[2]["audioReceived"], len(wav))
        with open(job.audio.path, "rb") as fh:
            self.assertEqual(fh.read(), wav)

    def test_a_body_that_stalls_is_answered_and_keeps_what_arrived(self):
        _, data = self.create()
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        wav = soundtrack(self.SAMPLES)
        with mock.patch.object(m._Handler, "timeout", 0.5):  # the time a client may stall (30 s)
            conn = socket.create_connection(("127.0.0.1", self.port), timeout=30)
            conn.sendall((f"POST /video/{job_id}/audio?offset=0 HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\n"
                          f"Content-Length: {len(wav)}\r\n\r\n").encode() + wav[:30000])  # and no more
            reply = b""
            while piece := conn.recv(4096):  # the whole answer: the companion closes after it
                reply += piece
            conn.close()
        self.assertIn(b" 408 ", reply.split(b"\r\n")[0] + b" ")  # not "500 Internal error"
        self.assertIn(b"stopped arriving", reply)
        self.assertEqual((job.state, job.audio.received, job.audio.feeding), ("receiving", 30000, False))
        self.assertEqual(self.post_audio(job_id, 30000, wav[30000:])[2]["audioReceived"], len(wav))

    def test_one_audio_request_at_a_time_and_cancel_in_the_middle(self):
        _, data = self.create()
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        wav = soundtrack(self.SAMPLES)
        conn = socket.create_connection(("127.0.0.1", self.port), timeout=30)
        conn.sendall((f"POST /video/{job_id}/audio?offset=0 HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\n"
                      f"Content-Length: {len(wav)}\r\n\r\n").encode() + wav[:30000])  # then stall
        deadline = time.monotonic() + 10
        while job.audio.received < 44 and time.monotonic() < deadline:
            time.sleep(0.02)
        self.assertTrue(job.audio.feeding)
        self.assertEqual(self.post_audio(job_id, job.audio.received, wav[30000:31000])[0], 409)
        self.assertEqual(self.finish(job_id)[0], 409)
        directories = (job.dir, job.audio.dir)
        self.assertEqual(self.request("DELETE", f"/video/{job_id}")[0], 200)
        conn.sendall(wav[30000:])
        reply = conn.recv(4096)
        conn.close()
        self.assertIn(b" 410 ", reply.split(b"\r\n")[0] + b" ")
        for directory in directories:
            self.assertFalse(os.path.exists(directory))

    def test_a_job_deleted_while_its_soundtrack_is_written_loses_the_soundtrack_too(self):
        # Windows removes no file that is open. The soundtrack a request was still writing stayed
        # when its job was deleted, with its folder, until the companion ended. Here a removal
        # that leaves the folder alone while a request writes into it plays that system, so that
        # the test says the same on any.
        _, data = self.create()
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        wav = soundtrack(self.SAMPLES)
        remove = shutil.rmtree

        def as_windows(path, *args, **kwargs):
            if path == job.audio.dir and job.audio.feeding:
                return  # "the file is being used by another process", with errors ignored
            remove(path, *args, **kwargs)

        with mock.patch.object(m.shutil, "rmtree", as_windows):
            conn = socket.create_connection(("127.0.0.1", self.port), timeout=30)
            conn.sendall((f"POST /video/{job_id}/audio?offset=0 HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\n"
                          f"Content-Length: {len(wav)}\r\n\r\n").encode() + wav[:30000])  # then stall
            deadline = time.monotonic() + 10
            while job.audio.received < 44 and time.monotonic() < deadline:
                time.sleep(0.02)
            self.assertTrue(job.audio.feeding)
            self.assertEqual(self.request("DELETE", f"/video/{job_id}")[0], 200)
            self.assertTrue(os.path.exists(job.audio.path))  # held open: it could not go
            conn.sendall(wav[30000:])
            reply = conn.recv(4096)
            conn.close()
        self.assertIn(b" 410 ", reply.split(b"\r\n")[0] + b" ")
        # The request has closed the file by the time it answers: the folder went with it.
        self.assertFalse(os.path.exists(job.audio.dir))

    def test_unknown_jobs_methods_and_origins(self):
        wav = soundtrack(self.SAMPLES)
        self.assertEqual(self.post_audio("0" * 32, 0, wav)[0], 404)
        _, data = self.create()
        route = f"/video/{data['id']}/audio?offset=0"
        status, headers, _ = self.request("GET", route)
        self.assertEqual(status, 405)
        self.assertIn("POST", headers["allow"])
        # A foreign Host or Origin is answered before anything of the body is read, and the
        # connection closed: the whole sound would still be on its way where the system's socket
        # buffers are smaller than it (macOS), and the client would get a broken pipe for an answer.
        start = wav[:1024]
        self.assertEqual(self.request("POST", route, raw_body=start, host="evil.example")[0], 403)
        self.assertEqual(self.request("POST", route, raw_body=start, headers={"Origin": "http://evil.example"})[0], 403)
        status, headers, _ = self.request("OPTIONS", route, headers={
            "Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
        self.assertEqual(status, 204)
        self.assertEqual(headers["access-control-allow-origin"], "http://localhost:5173")
        self.assertEqual(self.request("GET", f"/video/{data['id']}")[2]["audioReceived"], 0)

    def test_an_ffmpeg_without_the_encoder_refuses_the_job(self):
        with mock.patch.object(m.Companion, "video_audio_formats", lambda self: ["webm"]):
            status, data = self.create(format="mp4")
            self.assertEqual(status, 503)
            self.assertIn("cannot encode AAC sound", data["error"]["message"])
            self.assertEqual(self.request("GET", "/health")[2]["capabilities"]["videoAudio"], ["webm"])
            self.assertEqual(self.create(format="mp4", audio=False)[0], 201)  # the silent video still works
        self.assertEqual(self.create(format="gif", width=64)[0], 400)

    def test_an_idle_job_with_sound_is_cancelled_by_the_reaper(self):
        _, data = self.create()
        job = self.companion.jobs.get("video", data["id"])
        self.post_audio(data["id"], 0, soundtrack(self.SAMPLES)[:1000])
        self.companion.jobs.idle_timeout_s = 0.2
        try:
            time.sleep(0.4)
            self.companion.jobs.reap()
        finally:
            self.companion.jobs.idle_timeout_s = m.VIDEO_IDLE_TIMEOUT_S
        self.assertEqual(job.state, "failed")
        self.assertEqual(self.post_audio(data["id"], 1000, b"\0" * 4)[0], 410)

    def test_asking_about_a_job_does_not_keep_it_alive(self):
        # only data does: a client that stopped sending cannot hold the job by polling its status
        _, data = self.create()
        job = self.companion.jobs.get("video", data["id"])
        self.post_audio(data["id"], 0, soundtrack(self.SAMPLES)[:1000])
        self.companion.jobs.idle_timeout_s = 0.3
        try:
            for _ in range(6):
                time.sleep(0.1)
                self.assertEqual(self.request("GET", f"/video/{data['id']}")[0], 200)
            self.companion.jobs.reap()
        finally:
            self.companion.jobs.idle_timeout_s = m.VIDEO_IDLE_TIMEOUT_S
        self.assertEqual(job.state, "failed")
        self.assertIn("stopped sending", job.error["message"])

    def test_the_files_of_a_job_given_up_on_are_freed_at_once(self):
        _, data = self.create()
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        self.post_audio(job_id, 0, soundtrack(self.SAMPLES)[:100_000])
        self.assertEqual(os.path.getsize(job.audio.path), 100_000)
        self.companion.jobs.idle_timeout_s = 0.2
        try:
            time.sleep(0.4)
            self.companion.jobs.reap()
        finally:
            self.companion.jobs.idle_timeout_s = m.VIDEO_IDLE_TIMEOUT_S
        # the job is still there to say what happened; its files are not
        status, _, data = self.request("GET", f"/video/{job_id}")
        self.assertEqual((status, data["state"]), (200, "failed"))
        self.assertFalse(os.path.exists(job.dir))
        self.assertFalse(os.path.exists(job.audio.dir))
        self.assertEqual(self.post_audio(job_id, 100_000, b"\0" * 4)[0], 410)
        self.assertEqual(self.request("DELETE", f"/video/{job_id}")[0], 200)

    def test_the_files_of_a_job_that_failed_are_freed_though_someone_keeps_asking(self):
        _, data = self.create()
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        self.post_audio(job_id, 0, soundtrack(self.SAMPLES)[:100_000])
        # a frame that is no PNG fails the job, which keeps its soundtrack and what ffmpeg wrote
        self.request("POST", f"/video/{job_id}/frames?first=0", raw_body=b"no PNG at all, " * 16,
                     headers={"Content-Type": "application/octet-stream"})
        self.assertEqual(self.request("GET", f"/video/{job_id}")[2]["state"], "failed")
        self.companion.jobs.reap()
        # asking about the job keeps the job, to say what happened, and no longer its files
        status, _, data = self.request("GET", f"/video/{job_id}")
        self.assertEqual((status, data["state"]), (200, "failed"))
        self.assertTrue(data["error"]["message"])
        self.assertFalse(os.path.exists(job.dir))
        self.assertFalse(os.path.exists(job.audio.dir))
        self.assertEqual(self.request("DELETE", f"/video/{job_id}")[0], 200)

    def test_a_job_that_finished_keeps_its_file_for_whoever_collects_it(self):
        job_id, job = self.ready_to_finish()
        self.assertEqual(self.finish(job_id)[2]["state"], "done")
        self.companion.jobs.reap()
        self.assertTrue(os.path.isfile(job.result_path))

    def ready_to_finish(self):
        _, data = self.create()
        self.post_audio(data["id"], 0, soundtrack(self.SAMPLES))
        self.post_frames(data["id"])
        return data["id"], self.companion.jobs.get("video", data["id"])

    def test_a_second_pass_that_fails_fails_the_job(self):
        job_id, job = self.ready_to_finish()
        fails = python_program("import sys; sys.stderr.write('no such codec\\n'); sys.exit(3)")
        with mock.patch.object(m, "build_mux_command", lambda *a: fails):
            status, _, data = self.finish(job_id)
        self.assertEqual((status, data["state"]), (200, "failed"))
        self.assertEqual(data["error"]["message"], "no such codec")
        self.assertEqual(self.request("GET", f"/video/{job_id}/result")[0], 409)

    def test_a_second_pass_that_writes_nothing_fails_the_job(self):
        job_id, job = self.ready_to_finish()
        with mock.patch.object(m, "build_mux_command", lambda *a: python_program("pass")):
            self.assertEqual(self.finish(job_id)[2]["state"], "failed")

    def test_a_file_with_sound_over_the_size_cap_fails_the_job(self):
        job_id, job = self.ready_to_finish()  # the file comes out at some 6 kB
        with mock.patch.object(m, "sound_output_cap", lambda video, limit: 2_000):
            status, _, data = self.finish(job_id)
        self.assertEqual((status, data["state"]), (200, "failed"), data)
        self.assertIn("larger than 2000 bytes", data["error"]["message"])
        self.assertEqual(self.request("GET", f"/video/{job_id}/result")[0], 409)

    def test_the_cap_makes_room_for_a_video_larger_than_the_first_pass_writes(self):
        # A video over the cap of the first pass (Manim's has none): its copy with sound is
        # larger still, and is no runaway.
        job_id, job = self.ready_to_finish()

        def copy_and_add(ffmpeg, fmt, video, audio, out):
            self.assertGreater(os.path.getsize(video), 1500)
            return python_program("import sys\nwith open(sys.argv[1], 'rb') as video:\n"
                                  "    data = video.read()\n"
                                  "with open(sys.argv[2], 'wb') as out:\n    out.write(data + bytes(500))\n",
                                  video, out)

        real = m.sound_output_cap  # as if the first pass wrote 1000 bytes at most, and the sound took 1000
        with mock.patch.object(m, "SOUND_ROOM_BYTES", 1_000), \
                mock.patch.object(m, "sound_output_cap", lambda video, limit: real(video, 1_000)), \
                mock.patch.object(m, "build_mux_command", copy_and_add):
            status, _, data = self.finish(job_id)
        self.assertEqual((status, data["state"]), (200, "done"), data)
        self.assertGreater(os.path.getsize(job.result_path), 2_000)

    def test_a_second_pass_that_writes_without_end_is_stopped_at_the_cap(self):
        # a video whose tables make "copy" write far more than the file holds (a Manim job's video
        # comes from the scene's code): the pass is killed when its file passes the cap
        job_id, job = self.ready_to_finish()
        endless = python_program("import time\nwith open('out.mp4', 'wb') as out:\n"
                                 "    out.write(bytes(300000))\ntime.sleep(60)\n")
        started = time.monotonic()
        with mock.patch.object(m, "sound_output_cap", lambda video, limit: 100_000), \
                mock.patch.object(m, "build_mux_command", lambda *a: endless):
            status, _, data = self.finish(job_id)
        self.assertEqual((status, data["state"]), (200, "failed"), data)
        self.assertIn("larger than 100000 bytes", data["error"]["message"])
        self.assertLess(time.monotonic() - started, 20)
        self.assertIsNotNone(job.proc.poll())

    def test_a_second_pass_is_stopped_when_the_disk_gets_nearly_full(self):
        # the pass never ends here; as it begins, the disk of the temporary folder is down to 300 MiB
        job_id, job = self.ready_to_finish()
        started = time.monotonic()
        adding = []

        def never_ends(*args):
            adding.append(True)
            return SLEEPS

        with mock.patch.object(m, "build_mux_command", never_ends), \
                mock.patch.object(m, "_free_bytes", lambda folder: (300 if adding else 50_000) * 1024 * 1024):
            status, _, data = self.finish(job_id)
        self.assertEqual(adding, [True])
        self.assertEqual((status, data["state"]), (200, "failed"), data)
        self.assertIn("is nearly full: less than 1 GiB is free", data["error"]["message"])
        self.assertIn("TMPDIR", data["error"]["message"])
        self.assertLess(time.monotonic() - started, 20)
        self.assertIsNotNone(job.proc.poll())
        self.assertEqual(self.request("GET", f"/video/{job_id}/result")[0], 409)

    def test_a_soundtrack_that_arrives_on_a_nearly_full_disk_fails_the_job(self):
        wav = soundtrack(self.SAMPLES)
        _, data = self.create()
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        with mock.patch.object(m, "_free_bytes", lambda folder: 300 * 1024 * 1024):
            status, _, body = self.post_audio(job_id, 0, wav)
        self.assertEqual(status, 507, body)
        self.assertIn("is nearly full: less than 1 GiB is free", body["error"]["message"])
        # stopped before its first byte: nothing was written, nothing is counted
        self.assertEqual(job.audio.received, 0)
        self.assertFalse(os.path.exists(job.audio.path))
        state = self.request("GET", f"/video/{job_id}")[2]
        self.assertEqual((state["state"], state["audioReceived"]), ("failed", 0))
        self.assertIn("is nearly full", state["error"]["message"])
        self.assertIsNotNone(job.proc.poll())  # the encoder that waited for the frames is stopped

    def test_a_disk_that_gets_nearly_full_stops_a_soundtrack_half_sent(self):
        wav = soundtrack(self.SAMPLES)
        _, data = self.create()
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        self.assertEqual(self.post_audio(job_id, 0, wav[:100_000])[0], 200)
        time.sleep(m.ROOM_CHECK_S + 0.05)
        with mock.patch.object(m, "_free_bytes", lambda folder: 300 * 1024 * 1024):
            status, _, body = self.post_audio(job_id, 100_000, wav[100_000:])
        self.assertEqual(status, 507, body)
        self.assertEqual((job.state, job.audio.received), ("failed", 100_000))
        # a job that failed takes no more of its soundtrack
        self.assertEqual(self.post_audio(job_id, 100_000, wav[100_000:])[0], 410)

    def test_a_soundtrack_stopped_in_the_middle_of_a_request_still_gets_its_answer_read(self):
        # A request as large as one may be, 16 MiB, of a soundtrack of 90 s. The job is stopped at
        # its first piece while the client is still sending the rest: answered there and then, the
        # client would find its connection broken and never read why. The companion takes the
        # rest of the body first — the rest, not the piece it holds already, which would have it
        # wait for bytes that do not come until the request times out.
        frames = 90 * self.FPS
        _, data = self.create(frames=frames)
        job_id = data["id"]
        job = self.companion.jobs.get("video", job_id)
        samples = frames * m.AUDIO_RATE // self.FPS
        body = (m.wav_header(samples) + bytes(samples * 4))[:m.MAX_AUDIO_REQUEST_BYTES]
        self.assertEqual(len(body), m.MAX_AUDIO_REQUEST_BYTES)
        started = time.monotonic()
        with mock.patch.object(m, "_free_bytes", lambda folder: 300 * 1024 * 1024):
            status, _, answer = self.post_audio(job_id, 0, body)
        self.assertEqual(status, 507, answer)
        self.assertIn("is nearly full: less than 1 GiB is free", answer["error"]["message"])
        self.assertLess(time.monotonic() - started, m._Handler.timeout / 2)
        self.assertEqual((job.state, job.audio.received), ("failed", 0))

    def test_the_file_with_sound_must_be_a_plain_file_of_its_own(self):
        # A second pass that leaves a link where its output should be (ffmpeg reads a video that,
        # in a Manim job, the scene's code wrote): the link is not followed, the job fails.
        mine = os.path.abspath(__file__)
        scripts = ["import os, shutil; shutil.copyfile('audio.wav', 'kept'); os.link('kept', 'out.mp4')",
                   "import os; os.mkdir('out.mp4')"]  # a second name of another file; a directory
        if CAN_SYMLINK:  # a link to a file of the user's
            scripts.append(f"import os; os.symlink({mine!r}, 'out.mp4')")
        if hasattr(os, "mkfifo"):
            scripts.append("import os; os.mkfifo('out.mp4')")
        for script in scripts:
            with self.subTest(script):
                job_id, job = self.ready_to_finish()
                with mock.patch.object(m, "build_mux_command",
                                       lambda *a, script=script: python_program(script)):
                    status, _, data = self.finish(job_id)
                self.assertEqual((status, data["state"]), (200, "failed"), data)
                self.assertNotIn("bytes", data)
                self.assertEqual(self.request("GET", f"/video/{job_id}/result")[0], 409)
                self.request("DELETE", f"/video/{job_id}")

    @requires_symlinks
    def test_a_result_replaced_by_a_link_is_not_served(self):
        job_id, job = self.ready_to_finish()
        self.assertEqual(self.finish(job_id)[2]["state"], "done")
        os.unlink(job.result_path)
        os.symlink(os.path.abspath(__file__), job.result_path)
        status, _, data = self.request("GET", f"/video/{job_id}/result")
        self.assertEqual(status, 410)
        self.assertNotIn("bytes", self.request("GET", f"/video/{job_id}")[2])
        # Windows cannot refuse a link at the open (it has no O_NOFOLLOW): the companion looks at
        # the path first. The same request, as on a system without the flag.
        with mock.patch.object(m.os, "O_NOFOLLOW", 0, create=True):
            self.assertEqual(self.request("GET", f"/video/{job_id}/result")[0], 410)

    def test_a_result_is_served_where_a_link_cannot_be_refused_at_the_open(self):
        job_id, job = self.ready_to_finish()
        self.assertEqual(self.finish(job_id)[2]["state"], "done")
        with mock.patch.object(m.os, "O_NOFOLLOW", 0, create=True):
            name, _ = self.download(job_id, ".mp4")
        self.assertEqual(os.path.getsize(name), os.path.getsize(job.result_path))

    def test_cancel_during_the_second_pass_kills_it(self):
        job_id, job = self.ready_to_finish()
        first = job.proc
        answer = {}
        with mock.patch.object(m, "build_mux_command", lambda *a: SLEEPS):
            thread = threading.Thread(target=lambda: answer.update(result=self.finish(job_id)))
            thread.start()
            deadline = time.monotonic() + 20
            while job.proc is first and time.monotonic() < deadline:
                time.sleep(0.02)
            second = job.proc
            self.assertIsNot(second, first)
            self.assertEqual(job.state, "encoding")
            self.assertEqual(self.request("DELETE", f"/video/{job_id}")[0], 200)
            thread.join(20)
        self.assertFalse(thread.is_alive())
        self.assertIsNotNone(second.poll())
        self.assertEqual(answer["result"][2]["state"], "cancelled")
        self.assertFalse(os.path.exists(job.audio.dir))

    def test_a_second_pass_has_a_time_limit(self):
        job_id, job = self.ready_to_finish()
        job._kill_process()  # the first pass, which `finish` would have waited for
        job._close_pipes()
        job.state = "encoding"
        with mock.patch.object(m, "build_mux_command", lambda *a: SLEEPS):
            self.assertIsNone(job._add_sound("ffmpeg", "/nowhere/out.mp4", "mp4", timeout=0.3))
        self.assertEqual(job.state, "failed")
        self.assertIn("did not finish adding the sound", job.error["message"])
        self.assertIsNotNone(job.proc.poll())


def decoded_onset(seconds: float) -> int:
    """Where `decoded` finds a tone of `soundtrack` that starts at ``seconds``: the first sample
    over half the peak, a few samples into the sine."""
    first = round(seconds * RATE)
    for i in range(RATE // 20):
        if abs(0.6 * math.sin(2 * math.pi * 1000 * i / RATE)) > 0.3:
            return first + i
    raise AssertionError("no onset")


class Cleanup(unittest.TestCase):
    @requires_ffmpeg
    def test_shutdown_removes_the_soundtrack_too(self):
        companion = make_companion()
        job = m.VideoJob(companion.jobs, shutil.which("ffmpeg"), m.VideoSpec("mp4", "low", 64, 48, 10, 2, True))
        companion.jobs.add(job)
        self.assertTrue(os.path.isdir(job.audio.dir))
        self.assertEqual(os.path.dirname(job.audio.dir), companion.jobs.root())  # under the private root
        if os.name == "posix":  # Windows has no such mode: a directory there reads 0o777
            self.assertEqual(os.stat(job.audio.dir).st_mode & 0o777, 0o700)
        root = companion.jobs.root()
        companion.shutdown()
        self.assertFalse(os.path.exists(root))

    @requires_ffmpeg
    def test_deleting_a_job_removes_its_files_whatever_state_its_threads_are_in(self):
        # a delete can arrive between the moment a job gets a process and the moment the thread that
        # reads its output starts: the files must go all the same
        companion = make_companion()
        self.addCleanup(companion.shutdown)
        job = m.VideoJob(companion.jobs, shutil.which("ffmpeg"), m.VideoSpec("mp4", "low", 64, 48, 10, 2, True))
        companion.jobs.add(job)
        job._threads.append(threading.Thread(target=lambda: None))  # known to the job, not started yet
        directories = (job.dir, job.audio.dir)
        self.assertTrue(companion.jobs.remove("video", job.id))
        for directory in directories:
            self.assertFalse(os.path.exists(directory))
        self.assertIsNotNone(job.proc.poll())

    def test_a_job_that_cannot_start_leaves_nothing(self):
        companion = make_companion()
        self.addCleanup(companion.shutdown)
        with self.assertRaises(m.JobError):
            m.VideoJob(companion.jobs, "/nonexistent/ffmpeg", m.VideoSpec("mp4", "low", 64, 48, 10, 2, True))
        self.assertEqual(os.listdir(companion.jobs.root()), [])


class SandboxPaths(unittest.TestCase):
    """What the sandbox of a job shows and hides (the arguments given to bubblewrap)."""

    def setUp(self):
        self.sandbox = m._Sandbox(True)
        if not self.sandbox.active():
            self.skipTest("bubblewrap is not usable here")

    @staticmethod
    def pairs(args, option):
        return [args[i + 1] for i in range(len(args) - 1) if args[i] == option]

    def test_the_jobs_directory_is_hidden_wherever_it_is(self):
        # A temporary directory that the sandbox does not hide by itself (TMPDIR=/var/cache/..., say):
        # without more, every job would see the files of the others, soundtracks included.
        with tempfile.TemporaryDirectory() as root:
            job, sound = os.path.join(root, "manim-1"), os.path.join(root, "sound-1")
            os.mkdir(job)
            os.mkdir(sound)
            with mock.patch.object(self.sandbox, "_hidden", []):
                scene = self.sandbox.wrap(["true"], job, hide=[root])
                second = self.sandbox.wrap(["true"], sound, readable=[job], hide=[root])
                plain = self.sandbox.wrap(["true"], job)
            real = os.path.realpath
            self.assertNotIn(real(root), self.pairs(plain, "--tmpfs"))
            for wrapped, writable in ((scene, job), (second, sound)):
                self.assertIn(real(root), self.pairs(wrapped, "--tmpfs"))
                # the job's own directory is bound back after its parent was emptied
                self.assertLess(wrapped.index(real(root)), len(wrapped) - 1 - wrapped[::-1].index(writable))
                self.assertEqual(self.pairs(wrapped, "--bind"), [writable])
            self.assertIn(real(job), self.pairs(second, "--ro-bind"))  # the second pass reads the video
            self.assertNotIn(real(sound), self.pairs(scene, "--ro-bind"))
            # under a directory that is hidden anyway there is nothing to add
            self.assertEqual(self.sandbox.wrap(["true"], job, hide=[root]).count("--tmpfs"),
                             self.sandbox.wrap(["true"], job).count("--tmpfs"))

    def test_a_program_below_a_hidden_directory_is_shown_alone(self):
        with tempfile.TemporaryDirectory() as home, tempfile.TemporaryDirectory() as work:
            program = os.path.join(home, "ffmpeg")
            with open(program, "w") as fh:
                fh.write("#!/bin/sh\n")
            with open(os.path.join(home, "private.txt"), "w") as fh:
                fh.write("not for the sandbox")
            wrapped = self.sandbox.wrap([program], work, files=[program, "/usr/bin/env", home, "/nonexistent"])
            shown = self.pairs(wrapped, "--ro-bind")
            self.assertIn(os.path.realpath(program), shown)  # the file, not the directory it is in
            self.assertNotIn(os.path.realpath(home), shown)
            self.assertNotIn("/usr/bin/env", shown)  # visible already
            self.assertNotIn("/nonexistent", shown)


class ManimRequests(unittest.TestCase):
    def test_a_soundtrack_needs_the_length_of_the_video(self):
        ok = {"target": "ce", "code": "from manim import *", "scene": "Demo"}
        sized = {**ok, "width": 320, "height": 180, "fps": 10, "frames": 15}
        self.assertIs(m.validate_manim_request(ok).audio, False)
        self.assertIs(m.validate_manim_request({**sized, "audio": True}).audio, True)
        for bad in ({**ok, "audio": True},  # a quality preset: the length is not known
                    {**ok, "audio": True, "width": 320, "height": 180, "fps": 10},  # no frames
                    {**sized, "audio": "yes"},
                    {**sized, "audio": True, "fps": 1, "frames": m.MAX_AUDIO_SECONDS + 1}):
            with self.assertRaises(m.JobError, msg=bad) as ctx:
                m.validate_manim_request(bad)
            self.assertEqual(ctx.exception.status, 400)


class ManimResult(unittest.TestCase):
    @requires_symlinks
    def test_the_result_is_a_file_of_the_job_not_a_link(self):
        with tempfile.TemporaryDirectory() as job_dir, tempfile.NamedTemporaryFile() as outside:
            outside.write(b"not yours")
            outside.flush()
            job = types.SimpleNamespace(dir=job_dir)
            videos = os.path.join(job_dir, "media", "videos")
            os.makedirs(videos)
            os.symlink(outside.name, os.path.join(videos, "result.mp4"))
            self.assertIsNone(m.ManimJob._find_result(job))
            real = os.path.join(job_dir, "out")
            os.mkdir(real)
            with open(os.path.join(real, "result.mp4"), "wb") as fh:
                fh.write(b"video")
            self.assertEqual(m.ManimJob._find_result(job), os.path.join(real, "result.mp4"))


@requires_ffmpeg
class ManimSound(test_jobs.ManimBase):
    """Render with Manim with a soundtrack: Manim starts when the sound has arrived, and ffmpeg
    adds it to the video Manim wrote, confined like the scene was."""

    SAMPLES = 72000  # 15 frames at 10 fps

    def start_with_sound(self, target="ce", code=None, **extra):
        status, _, data = self.start(target, code or test_jobs.SCENES[target], audio=True, **extra)
        self.assertEqual(status, 201, data)
        return data["id"], data

    def post_audio(self, job_id, offset, body):
        return self.request("POST", f"/manim-render/{job_id}/audio?offset={offset}", raw_body=body,
                            headers={"Content-Type": "application/octet-stream"})

    def result(self, job_id):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        conn.request("GET", f"/manim-render/{job_id}/result")
        resp = conn.getresponse()
        body = resp.read()
        conn.close()
        self.assertEqual((resp.status, resp.getheader("Content-Type")), (200, "video/mp4"))
        return temporary_file(self, body, ".mp4")

    def check_sound(self, job_id):
        found = streams(self.result(job_id))
        self.assertEqual((found["video"]["codec_name"], int(found["video"]["nb_read_packets"])), ("h264", 15))
        self.assertEqual((found["video"]["width"], found["video"]["height"]), (320, 180))
        self.assertEqual((found["audio"]["codec_name"], found["audio"]["sample_rate"], found["audio"]["channels"]),
                         ("aac", "48000", 2))
        self.assertAlmostEqual(found["duration"], 1.5, places=3)
        samples, onsets = decoded(self.result(job_id))
        self.assertEqual(len(onsets), 1)
        self.assertLessEqual(abs(onsets[0] - decoded_onset(0.3)), 2)
        self.assertGreaterEqual(samples, self.SAMPLES)

    @test_jobs._venv_case("ce")
    def test_manimce_with_sound(self):
        wav = soundtrack(self.SAMPLES)
        job_id, created = self.start_with_sound()
        job = self.companion.jobs.get("manim", job_id)
        # Manim has not started: the job waits for its soundtrack
        self.assertEqual((created["state"], created["audioBytes"], created["audioReceived"]),
                         ("receiving", len(wav), 0))
        self.assertEqual(created["maxAudioRequestBytes"], m.MAX_AUDIO_REQUEST_BYTES)
        self.assertIsNone(job.proc)
        status, _, data = self.post_audio(job_id, 0, wav[:50_000])
        self.assertEqual((status, data["state"], data["audioReceived"]), (200, "receiving", 50_000))
        self.assertIsNone(job.proc)
        status, _, data = self.post_audio(job_id, 50_000, wav[50_000:])
        self.assertEqual((status, data["state"], data["audioReceived"]), (200, "running", len(wav)))
        self.assertIsNotNone(job.proc)
        self.assertEqual(self.post_audio(job_id, len(wav), b"\0\0\0\0")[0], 409)  # no longer receiving
        done = self.wait_done(job_id)
        self.assertEqual(done["frame"], 15)
        self.assertIs(done["sandboxed"], self.companion.sandbox.active())
        self.check_sound(job_id)
        # the result is next to where the soundtrack was, outside the directory the scene could write
        self.assertEqual(os.path.dirname(job.result_path), job.audio.dir)
        self.assertEqual(os.listdir(job.audio.dir), ["out.mp4"])
        directories = (job.dir, job.audio.dir)
        self.assertEqual(self.request("DELETE", f"/manim-render/{job_id}")[0], 200)
        for directory in directories:
            self.assertFalse(os.path.exists(directory))

    @test_jobs._venv_case("gl")
    def test_manimgl_with_sound(self):
        job_id, _ = self.start_with_sound("gl")
        self.assertEqual(self.post_audio(job_id, 0, soundtrack(self.SAMPLES))[2]["state"], "running")
        self.wait_done(job_id)
        self.check_sound(job_id)

    @test_jobs._venv_case("ce")
    def test_a_waiting_render_holds_the_slot_and_can_be_cancelled(self):
        job_id, _ = self.start_with_sound()
        job = self.companion.jobs.get("manim", job_id)
        self.assertEqual(self.start("ce", test_jobs.SCENES["ce"])[0], 429)
        status, _, body = self.post_audio(job_id, 0, soundtrack(self.SAMPLES - 1))
        self.assertEqual(status, 400)
        self.assertIn("72000 sample frames", body["error"]["message"])
        self.assertEqual(self.request("GET", f"/manim-render/{job_id}")[2]["state"], "receiving")
        directories = (job.dir, job.audio.dir)
        self.assertEqual(self.request("DELETE", f"/manim-render/{job_id}")[0], 200)
        for directory in directories:
            self.assertFalse(os.path.exists(directory))
        self.assertIsNone(job.proc)  # Manim never ran
        self.assertEqual(self.start("ce", test_jobs.SCENES["ce"])[0], 201)

    @test_jobs._venv_case("ce")
    def test_a_soundtrack_that_arrives_on_a_nearly_full_disk_fails_the_render(self):
        job_id, _ = self.start_with_sound()
        job = self.companion.jobs.get("manim", job_id)
        with mock.patch.object(m, "_free_bytes", lambda folder: 300 * 1024 * 1024):
            status, _, body = self.post_audio(job_id, 0, soundtrack(self.SAMPLES))
        self.assertEqual(status, 507, body)
        self.assertIn("is nearly full: less than 1 GiB is free", body["error"]["message"])
        self.assertEqual((job.state, job.audio.received), ("failed", 0))
        self.assertFalse(os.path.exists(job.audio.path))
        self.assertIsNone(job.proc)  # Manim never ran
        self.assertEqual(self.request("GET", f"/manim-render/{job_id}")[2]["state"], "failed")
        self.assertEqual(self.start("ce", test_jobs.SCENES["ce"])[0], 201)  # the slot is free

    @test_jobs._venv_case("ce")
    def test_a_render_whose_soundtrack_never_comes_is_cancelled_by_the_reaper(self):
        job_id, _ = self.start_with_sound()
        job = self.companion.jobs.get("manim", job_id)
        self.post_audio(job_id, 0, soundtrack(self.SAMPLES)[:1000])
        self.companion.jobs.idle_timeout_s = 0.2
        try:
            time.sleep(0.4)
            self.companion.jobs.reap()
        finally:
            self.companion.jobs.idle_timeout_s = m.VIDEO_IDLE_TIMEOUT_S
        self.assertEqual(job.state, "failed")
        self.assertIn("stopped sending the soundtrack", job.error["message"])
        self.assertIsNone(job.proc)
        self.assertEqual(self.start("ce", test_jobs.SCENES["ce"])[0], 201)  # the slot is free

    @test_jobs._venv_case("ce")
    def test_a_soundtrack_that_keeps_trickling_in_has_a_time_limit(self):
        # no Manim is running yet, so Manim's own time limit does not apply: the wait has one
        job_id, _ = self.start_with_sound()
        job = self.companion.jobs.get("manim", job_id)
        wav = soundtrack(self.SAMPLES)
        self.companion.jobs.receiving_limit_s = 0.4
        try:
            for piece in range(6):  # data keeps arriving: the job is never idle
                time.sleep(0.1)
                self.post_audio(job_id, piece * 1000, wav[piece * 1000:(piece + 1) * 1000])
            self.companion.jobs.reap()
        finally:
            self.companion.jobs.receiving_limit_s = m.MANIM_RECEIVING_TIMEOUT_S
        self.assertEqual(job.state, "failed")
        self.assertIn("did not arrive in time", job.error["message"])
        self.assertIsNone(job.proc)
        self.assertFalse(os.path.exists(job.audio.dir))
        self.assertEqual(self.start("ce", test_jobs.SCENES["ce"])[0], 201)  # the slot is free

    @test_jobs._venv_case("ce")
    def test_a_running_render_is_not_idle(self):
        slow = "import time\nfrom manim import *\nclass Demo(Scene):\n    def construct(self):\n        time.sleep(60)\n"
        job_id, _ = self.start_with_sound(code=slow)
        job = self.companion.jobs.get("manim", job_id)
        self.post_audio(job_id, 0, soundtrack(self.SAMPLES))
        self.companion.jobs.idle_timeout_s = 0.2
        try:
            time.sleep(0.4)
            self.companion.jobs.reap()
        finally:
            self.companion.jobs.idle_timeout_s = m.VIDEO_IDLE_TIMEOUT_S
        self.assertEqual(job.state, "running")

    @test_jobs._venv_case("ce")
    def test_requests_that_cannot_have_sound(self):
        body = {"target": "ce", "code": test_jobs.SCENES["ce"], "scene": "Demo", "audio": True}
        self.assertEqual(self.request("POST", "/manim-render", body)[0], 400)  # no length
        with mock.patch.object(m.Companion, "video_audio_formats", lambda self: ["webm"]):
            status, _, data = self.start("ce", test_jobs.SCENES["ce"], audio=True)
            self.assertEqual(status, 503)
            self.assertIn("cannot encode AAC sound", data["error"]["message"])
        real = m.Companion._tool
        with mock.patch.object(m.Companion, "_tool",
                               staticmethod(lambda name: None if name == "ffmpeg" else real(name))):
            status, _, data = self.start("ce", test_jobs.SCENES["ce"], audio=True)
            self.assertEqual(status, 503)
            self.assertIn("ffmpeg is not installed", data["error"]["message"])
        self.assertEqual(self.companion.jobs.active("manim"), [])
        # a render without sound has no audio route to feed
        status, _, data = self.start("ce", test_jobs.SCENES["ce"])
        self.assertEqual(self.post_audio(data["id"], 0, soundtrack(self.SAMPLES))[0], 409)

    @test_jobs._venv_case("ce")
    def test_the_scene_does_not_see_the_soundtrack(self):
        if not self.companion.sandbox.active():
            self.skipTest("bubblewrap is not usable here")
        code = ("import json, os\nfrom manim import *\nclass Demo(Scene):\n    def construct(self):\n"
                "        json.dump(sorted(os.listdir('..')), open('probe.json', 'w'))\n"
                "        self.add(Square())\n        self.wait(1.5)\n")
        job_id, _ = self.start_with_sound(code=code)
        job = self.companion.jobs.get("manim", job_id)
        self.post_audio(job_id, 0, soundtrack(self.SAMPLES))
        self.wait_done(job_id)
        with open(os.path.join(job.dir, "probe.json"), encoding="utf-8") as fh:
            siblings = json.load(fh)
        self.assertEqual(siblings, [os.path.basename(job.dir)])  # its own directory, nothing next to it
        self.assertTrue(os.path.basename(job.audio.dir).startswith("sound-"))

    @test_jobs._venv_case("ce")
    def test_the_second_pass_is_confined_like_the_scene(self):
        if not self.companion.sandbox.active():
            self.skipTest("bubblewrap is not usable here")
        outside = os.path.join(os.path.expanduser("~"), ".mfe-sandbox-mux-test")
        secret_dir = tempfile.mkdtemp(prefix="mfe-secret-", dir="/var/tmp")
        self.addCleanup(shutil.rmtree, secret_dir, True)
        secret = os.path.join(secret_dir, "secret.txt")
        with open(secret, "w") as fh:
            fh.write("top secret")
        probe = (
            "import json, os, shutil, socket, sys\n"
            "video, audio, out = sys.argv[1:4]\n"
            "def attempt(fn):\n    try:\n        fn(); return True\n    except Exception:\n        return False\n"
            "seen = {\n"
            " 'read_video': attempt(lambda: open(video, 'rb').read(4)),\n"
            " 'read_audio': attempt(lambda: open(audio, 'rb').read(4)),\n"
            " 'write_job': attempt(lambda: open(os.path.join(os.path.dirname(video), 'x'), 'w').write('x')),\n"
            f" 'write_home': attempt(lambda: open({outside!r}, 'w').write('x')),\n"
            f" 'read_secret': attempt(lambda: open({secret!r}).read()),\n"
            f" 'net': attempt(lambda: socket.create_connection(('127.0.0.1', {self.port}), timeout=3)),\n"
            " 'cwd': os.getcwd()}\n"
            "json.dump(seen, open('probe.json', 'w'))\n"
            "shutil.copyfile(video, out)\n")
        job_id, _ = self.start_with_sound()
        job = self.companion.jobs.get("manim", job_id)
        try:
            with mock.patch.object(m, "build_mux_command",
                                   lambda ffmpeg, fmt, video, audio, out: [sys.executable, "-c", probe, video, audio, out]):
                self.post_audio(job_id, 0, soundtrack(self.SAMPLES))
                self.wait_done(job_id)
            with open(os.path.join(job.audio.dir, "probe.json"), encoding="utf-8") as fh:
                seen = json.load(fh)
        finally:
            if os.path.exists(outside):
                os.unlink(outside)
        self.assertTrue(seen["read_video"])
        self.assertTrue(seen["read_audio"])
        self.assertFalse(seen["write_job"])  # the directory of the scene is read-only now
        self.assertFalse(seen["net"])
        self.assertEqual(os.path.realpath(seen["cwd"]), os.path.realpath(job.audio.dir))
        self.assertFalse(seen["read_secret"])  # the user's files are not there
        self.assertFalse(os.path.exists(outside))  # written, if at all, to a throw-away file system

    @test_jobs._venv_case("ce")
    def test_an_ffmpeg_reached_through_a_link_in_a_hidden_directory_still_adds_the_sound(self):
        if not self.companion.sandbox.active():
            self.skipTest("bubblewrap is not usable here")
        # ~/.local/bin/ffmpeg -> /somewhere/ffmpeg: inside the sandbox the link is not there
        links = tempfile.mkdtemp(prefix="mfe-bin-")
        self.addCleanup(shutil.rmtree, links, True)
        link = os.path.join(links, "ffmpeg")
        os.symlink(shutil.which("ffmpeg"), link)
        real = m.Companion._tool
        with mock.patch.object(m.Companion, "_tool",
                               staticmethod(lambda name: link if name == "ffmpeg" else real(name))):
            job_id, _ = self.start_with_sound()
            self.post_audio(job_id, 0, soundtrack(self.SAMPLES))
            self.wait_done(job_id)
        self.check_sound(job_id)

    @test_jobs._venv_case("ce")
    def test_cancel_before_manim_starts_does_not_start_it(self):
        job_id, _ = self.start_with_sound()
        job = self.companion.jobs.get("manim", job_id)
        job.cancel()
        job._audio_complete()  # the last piece arrives as the job is cancelled
        self.assertEqual(job.state, "cancelled")
        self.assertIsNone(job.proc)
        started = threading.Event()
        job._supervise(job._cmd, job._env, started, [])  # and a start that lost the race does nothing
        self.assertTrue(started.is_set())
        self.assertIsNone(job.proc)


@requires_ffmpeg
class ManimSoundUnsandboxed(test_jobs.ManimBase):
    sandbox = False

    @test_jobs._venv_case("ce")
    def test_sound_without_a_sandbox(self):
        status, _, data = self.start("ce", test_jobs.SCENES["ce"], audio=True)
        self.assertEqual(status, 201)
        self.assertIs(data["sandboxed"], False)
        wav = soundtrack(72000)
        self.request("POST", f"/manim-render/{data['id']}/audio?offset=0", raw_body=wav,
                     headers={"Content-Type": "application/octet-stream"})
        self.assertEqual(self.wait(data["id"])["state"], "done")
        job = self.companion.jobs.get("manim", data["id"])
        self.assertIn("audio", streams(job.result_path))


if __name__ == "__main__":
    unittest.main()
