"""The constants of the placeholder boxes, measured on real Manim.

A font text nothing has shaped is drawn as one box per character (app/src/engine/textBoxes.ts).
Three constants take that layout to scene units: how large an em is, how far apart the lines are,
and how wide a tab is, in ManimCE and in ManimGL. This probe measures them: it starts a companion,
has each library shape a few texts in fonts whose metrics it reads from the font files, and prints
what Manim did next to what the app assumes.

    cd <an empty scratch directory>
    python3 <repo>/tests/parity/text_boxes.py

Standard library only. It needs the two Manim interpreters (MFE_CE_PYTHON and MFE_GL_PYTHON, or
the venvs next to the repository, as tests/parity/README.md says), `fc-match`, and the fonts of
FONTS installed as plain TrueType files. Exit status 1 when a constant is off by more than 0.5 %.
"""
import json
import os
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONTS = ["DejaVu Sans", "Noto Sans", "Liberation Serif", "Liberation Mono"]
SIZES = [48, 96]
TOLERANCE = 0.005

# What app/src/engine/textBoxes.ts assumes.
CE_EM_PER_SIZE = 1 / 72
CE_GL_SIZE_RATIO = 1.4678
CE_LINE_PITCH_EM = 0.975
GL_LINE_PITCH_OF_HEIGHT = 0.96
CE_TAB_SPACES = 4
GL_TAB_STOP_SPACES = 8


def interpreter(variable: str, folder: str) -> str:
    found = os.environ.get(variable) or os.path.join(os.path.dirname(REPO), folder, "venv", "bin", "python")
    if not os.path.isfile(found):
        sys.exit(f"No interpreter for {variable}: {found}")
    return found


class Font:
    """The few numbers of a TrueType file the layout needs, in em."""

    def __init__(self, family: str):
        path = subprocess.run(["fc-match", "-f", "%{file}", family], capture_output=True, text=True).stdout
        with open(path, "rb") as fh:
            data = fh.read()
        count = struct.unpack(">H", data[4:6])[0]
        tables = {}
        for i in range(count):
            tag, _, offset, length = struct.unpack(">4sIII", data[12 + 16 * i:28 + 16 * i])
            tables[tag.decode("latin-1")] = data[offset:offset + length]
        self.path = path
        self.units = struct.unpack(">H", tables["head"][18:20])[0]
        ascent, descent, gap = struct.unpack(">hhh", tables["hhea"][4:10])
        self.height = (ascent - descent) / self.units
        self.gap = gap / self.units
        self._long = struct.unpack(">H", tables["hhea"][34:36])[0]
        self._hmtx, self._cmap = tables["hmtx"], tables["cmap"]

    def _glyph(self, char: str) -> int:
        """The glyph of a character of the Basic Multilingual Plane (cmap format 4)."""
        code, cmap = ord(char), self._cmap
        for i in range(struct.unpack(">H", cmap[2:4])[0]):
            platform, encoding, offset = struct.unpack(">HHI", cmap[4 + 8 * i:12 + 8 * i])
            if (platform, encoding) not in ((3, 1), (0, 3)) or struct.unpack(">H", cmap[offset:offset + 2])[0] != 4:
                continue
            segments = struct.unpack(">H", cmap[offset + 6:offset + 8])[0] // 2
            ends, starts = offset + 14, offset + 16 + 2 * segments
            deltas, ranges = starts + 2 * segments, starts + 4 * segments
            for s in range(segments):
                end = struct.unpack(">H", cmap[ends + 2 * s:ends + 2 * s + 2])[0]
                if code > end:
                    continue
                start = struct.unpack(">H", cmap[starts + 2 * s:starts + 2 * s + 2])[0]
                if code < start:
                    return 0
                delta = struct.unpack(">h", cmap[deltas + 2 * s:deltas + 2 * s + 2])[0]
                at = ranges + 2 * s
                rng = struct.unpack(">H", cmap[at:at + 2])[0]
                if rng == 0:
                    return (code + delta) & 0xFFFF
                glyph = struct.unpack(">H", cmap[at + rng + 2 * (code - start):at + rng + 2 * (code - start) + 2])[0]
                return (glyph + delta) & 0xFFFF if glyph else 0
        raise ValueError(f"{self.path}: no Unicode cmap of format 4")

    def advance(self, char: str) -> float:
        glyph = min(self._glyph(char), self._long - 1)
        return struct.unpack(">H", self._hmtx[4 * glyph:4 * glyph + 2])[0] / self.units


def main() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    companion = subprocess.Popen(
        [sys.executable, os.path.join(REPO, "companion", "mfe_companion.py"), "serve", "--port", str(port),
         "--no-disk-cache", "--ce-python", interpreter("MFE_CE_PYTHON", "manim_ce"),
         "--gl-python", interpreter("MFE_GL_PYTHON", "manim_gl")],
        stderr=subprocess.DEVNULL, cwd=tempfile.gettempdir())

    def get(path: str, timeout: float = 5.0):
        with urllib.request.urlopen(base + path, timeout=timeout) as response:
            return json.load(response)

    def shape(target: str, family: str, size: float, source: str):
        body = json.dumps({"source": source, "target": target, "fontSize": size,
                           "font": {"family": family, "weight": "normal", "slant": "normal"}}).encode()
        request = urllib.request.Request(base + "/text", body, {"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
        if not result.get("ok"):
            raise RuntimeError(f"{target} {family}: {result['error']['message']}")
        return result

    worst = 0.0

    def row(label: str, measured: float, assumed: float) -> None:
        nonlocal worst
        error = measured / assumed - 1
        worst = max(worst, abs(error))
        print(f"  {label:<44}{measured:>10.5f}{assumed:>10.5f}{100 * error:>+9.3f} %")

    try:
        deadline = time.monotonic() + 90
        while True:
            try:
                capabilities = get("/health")["capabilities"]
                if capabilities["manimCE"] and capabilities["manimGL"] and not capabilities["manimProbing"]:
                    break
            except OSError:
                pass
            if time.monotonic() > deadline:
                sys.exit("The companion did not find both Manim interpreters.")
            time.sleep(0.25)
        for target in ("ce", "gl"):
            # The first request starts that library's text worker; it may take a while.
            for attempt in range(8):
                try:
                    get(f"/fonts?target={target}", timeout=60)
                    break
                except OSError:
                    time.sleep(1)
            else:
                sys.exit(f"The companion shapes no text for {target}.")
        print(f"{'':<46}{'Manim':>10}{'app':>10}{'':>11}")
        for family in FONTS:
            font = Font(family)
            m, space = font.advance("M"), font.advance(" ")
            print(f"{family} (M {m:.4f} em, space {space:.4f} em, line {font.height:.4f} em, gap {font.gap:.4f} em)")
            for size in SIZES:
                ems = {}
                for target in ("ce", "gl"):
                    name = "ManimCE" if target == "ce" else "ManimGL"
                    box = shape(target, family, size, "M" * 10)["logicalBBox"]
                    em = ems[target] = (box["maxX"] - box["minX"]) / (10 * m)
                    assumed = size * CE_EM_PER_SIZE / (1 if target == "ce" else CE_GL_SIZE_RATIO)
                    row(f"{name} {size}: units per em", em, assumed)
                    lines = shape(target, family, size, "M\nM\nM")["lines"]
                    pitch = (lines[0]["baseline"] - lines[2]["baseline"]) / 2 / em
                    row(f"{name} {size}: line pitch, em", pitch,
                        CE_LINE_PITCH_EM if target == "ce" else GL_LINE_PITCH_OF_HEIGHT * font.height)
                    glyphs = shape(target, family, size, "M\tM")["glyphs"]
                    step = (glyphs[1]["bbox"]["minX"] - glyphs[0]["bbox"]["minX"]) / em
                    row(f"{name} {size}: from M to M over a tab, em", step,
                        m + CE_TAB_SPACES * space if target == "ce" else GL_TAB_STOP_SPACES * space)
                row(f"ManimCE / ManimGL at {size}", ems["ce"] / ems["gl"], CE_GL_SIZE_RATIO)
    finally:
        companion.terminate()
        try:
            companion.wait(10)
        except subprocess.TimeoutExpired:
            companion.kill()
    print(f"Worst difference: {100 * worst:.3f} % (tolerance {100 * TOLERANCE:.1f} %)")
    return 0 if worst <= TOLERANCE else 1


if __name__ == "__main__":
    sys.exit(main())
