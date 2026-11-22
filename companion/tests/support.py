"""Shared helpers for the companion tests (standard library only)."""
from __future__ import annotations

import contextlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
COMPANION_DIR = os.path.dirname(TESTS_DIR)
REPO_DIR = os.path.dirname(COMPANION_DIR)
# the Manim checkouts (and their virtualenvs) live next to the repository
WORKSPACE_DIR = os.path.dirname(REPO_DIR)
CORPUS_PATH = os.path.join(REPO_DIR, "tests", "parity", "corpus.json")

sys.path.insert(0, COMPANION_DIR)
import mfe_companion  # noqa: E402  (path set up just above)

HAVE_TEX = bool(shutil.which("latex") and shutil.which("dvisvgm"))
requires_tex = unittest.skipUnless(HAVE_TEX, "latex and dvisvgm are required")

# For a test that needs a thing of POSIX alone: a shell script as the stand-in of an interpreter,
# the mode of a directory, a signal that asks a process to end (on Windows `terminate` ends it at
# once, and it cleans nothing up).
posix_only = unittest.skipUnless(os.name == "posix", "needs a POSIX system (a shell script, file modes, signals)")


def _can_symlink() -> bool:
    with tempfile.TemporaryDirectory() as tmp:
        try:
            os.symlink(os.path.join(tmp, "a"), os.path.join(tmp, "b"))
        except (OSError, NotImplementedError):
            return False
    return True


# Always on Linux and macOS; on Windows only in Developer Mode or as an administrator.
CAN_SYMLINK = _can_symlink()
requires_symlinks = unittest.skipUnless(CAN_SYMLINK, "this user may not make symbolic links")


def python_program(code: str, *args: str) -> list[str]:
    """A command that runs ``code`` with the tests' own Python: the stand-in of a program (an
    ffmpeg that fails, one that never ends) that says the same on any system, where ``sh -c``,
    ``true`` or ``sleep`` are POSIX's."""
    return [sys.executable, "-c", code, *args]


@contextlib.contextmanager
def serve_environment(base: dict[str, str] | None = None, manim: bool = False):
    """The environment for a ``serve`` that a test starts and ends itself: a temporary folder of
    its own (``tempfile`` reads TMPDIR, TEMP and TMP, in that order, on every system), removed
    when the block ends. A server ended with ``terminate()`` cleans nothing up on Windows, where
    that ends the process at once: the folders of its jobs stayed in TEMP, and so did the folder
    of the interpreter it was asking for its Manim, still running. Unless the test is about Manim
    (``manim``), no interpreter is named either: nothing is asked."""
    env = dict(os.environ if base is None else base)
    if not manim:
        env.pop("MFE_CE_PYTHON", None)
        env.pop("MFE_GL_PYTHON", None)
    directory = tempfile.mkdtemp(prefix="mfe-test-")
    try:
        env.update(TMPDIR=directory, TEMP=directory, TMP=directory)
        yield env
    finally:
        remove_folder(directory)


def remove_folder(directory: str, tries: int = 50, pause: float = 0.1, rmtree=shutil.rmtree,
                  sleep=time.sleep) -> bool:
    """Remove ``directory`` with what it holds, and say whether it is gone. Windows removes no file
    that a process holds, and a process that was ended holds its files for a moment more: the
    ffmpeg of a job outlived its server by 0.2 s there, with the job's folder as its own. So the
    removal is tried again, for a few seconds; what is still held then is left, not raised."""
    for attempt in range(tries):
        try:
            rmtree(directory)
            return True
        except FileNotFoundError:
            return True
        except OSError:
            if attempt + 1 < tries:
                sleep(pause)
    return False


def temporary_file(test: unittest.TestCase, content: bytes, suffix: str = "") -> str:
    """The name of a temporary file holding ``content``, closed, and removed when ``test`` ends.
    Closed: Windows does not let another program (ffprobe) open a file Python still holds open,
    which is what a ``NamedTemporaryFile`` is."""
    handle, name = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(handle, "wb") as fh:
        fh.write(content)
    test.addCleanup(lambda: os.path.exists(name) and os.unlink(name))
    return name


def venv_python(target: str) -> str | None:
    """Interpreter of the Manim virtualenv for ``ce`` / ``gl`` (env override, else sibling dir)."""
    env = os.environ.get("MFE_CE_PYTHON" if target == "ce" else "MFE_GL_PYTHON")
    candidates = [env] if env else []
    # A virtualenv keeps its interpreter in bin/python, on Windows in Scripts\python.exe.
    inside = ("Scripts", "python.exe") if os.name == "nt" else ("bin", "python")
    for name in (("manim_ce",) if target == "ce" else ("manim_gl", "manim_3b1b")):
        candidates.append(os.path.join(WORKSPACE_DIR, name, "venv", *inside))
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return candidate
    return None


def normalise_entry(item) -> dict:
    """``"x"`` or ``{"latex": "x", "packages": [...], "preamble": "...", "mode": "text"}`` -> full entry dict."""
    if isinstance(item, str):
        item = {"latex": item}
    return {
        "latex": item["latex"],
        "packages": list(item.get("packages", [])),
        "preamble": item.get("preamble", ""),
        "mode": item.get("mode", "math"),
    }


def load_corpus() -> list[dict]:
    """Corpus entries as ``{"latex", "packages", "preamble"}`` (entries may be plain strings)."""
    with open(CORPUS_PATH, encoding="utf-8") as fh:
        return [normalise_entry(item) for item in json.load(fh)]


# Formulas that exercise more fonts / paths of the document builders than the shared corpus
# does (the corpus is owned by another agent). Same entry shape as the corpus.
_EXTRA_RAW: list[dict] = [
    {"latex": r"\mathbb{R}^n \to \mathbb{C}"},
    {"latex": r"\mathcal{L}(f) = \mathfrak{g} \oplus \mathbf{x}"},
    {"latex": r"\boldsymbol{\alpha} + \mathrm{d}x \cdot \operatorname{sin} y"},
    {"latex": r"\alpha\beta\gamma\delta\epsilon\varepsilon\zeta\eta\theta\vartheta\phi\varphi\psi\omega\Gamma\Omega"},
    {"latex": r"\forall x \in A,\ \exists y \subset B: x \le y \ne \infty \approx \hbar \ell \partial \nabla"},
    {"latex": r"\underbrace{a+b+c}_{n} \overbrace{x}^{m} \widehat{xyz} \widetilde{abc}"},
    {"latex": r"\dot{x} \ddot{y} \bar{z} \tilde{w} \check{u} \acute{a} \grave{e} \breve{i}"},
    {"latex": r"\prod_{k=1}^{n} \oint_C \bigcup_i A_i \bigoplus_j V_j \int\,\int f"},
    {"latex": r"\left\{ \begin{array}{ll} x & x > 0 \\ -x & x \le 0 \end{array} \right."},
    {"latex": r"\Bigg( \frac{\frac{a}{b}}{c} \Bigg) \big| \bigg\Vert x \bigg\Vert"},
    {"latex": r"\text{naive } \textbf{bold} \textit{italic} \texttt{mono} \textsc{caps}"},
    {"latex": r"\text{The quick brown fox -- ``jumps'' over --- the lazy dog; ffl fi fl}"},
    {"latex": r"x \mapsto f(x) \Rightarrow y \Leftrightarrow z \leftarrow w \nearrow \searrow"},
    {"latex": r"{{a}} + {{b}} = {{c}}"},
    {"latex": r"\frac{{{n}}}{k} + a^{{2}}"},
    {"latex": r"x_"},
    {"latex": r"e^"},
    {"latex": r"\over"},
    {"latex": r"\sqrt"},
    {"latex": r"\left( x"},
    {"latex": r"a}{b"},
    {"latex": r"\\ x \\ y"},
    {"latex": r"\begin{array}{c} x"},
    {"latex": ""},
    {"latex": "   a  +  b   "},
    {"latex": "\n\na +\nb\n"},
    {"latex": r"\mathstrut x \rule{0pt}{10pt} y \vphantom{Q}"},
    {"latex": r"\bra{a}\ket{b} + \dd{x} + \qty(\frac{1}{2})", "packages": ["physics"]},
    {"latex": r"\cancel{x} + \bcancel{y} + \xcancel{z}", "packages": ["cancel"]},
    {"latex": r"\mathscr{F} \to \mathcal{G}", "packages": ["mathrsfs"]},
    {"latex": r"\mathds{1}_A + \bm{v}", "packages": ["dsfont", "bm"]},
    {"latex": r"\mycmd + \mycmd", "preamble": r"\newcommand{\mycmd}{\alpha^2}"},
    {"latex": r"\SI{5}{m}", "packages": ["siunitx"]},
    # tipa (loaded by ManimGL's template) redefines \| and \!, so ManimGL fails on these
    {"latex": r"\|x\|"},
    {"latex": r"a\!b"},
    # text mode (companion 1.3): ManimCE Tex / ManimGL TexText
    {"latex": r"Hello world", "mode": "text"},
    {"latex": r"A formula $x^2 + 1$ inside a sentence.", "mode": "text"},
    {"latex": r"Two lines \\ of text", "mode": "text"},
    {"latex": r"caf\'e, na\"ive, \textbf{bold} and \emph{italic}", "mode": "text"},
    {"latex": r"{{Hello}} world", "mode": "text"},
    {"latex": "é", "mode": "text"},  # non-ASCII: two glyphs with CE's OT1 fonts, one with GL's T1
    {"latex": "", "mode": "text"},
    {"latex": "  spaced  ", "mode": "text"},
    {"latex": r"x_", "mode": "text"},  # a math-only character: fails in both, as in Manim
]


EXTRA_FORMULAS: list[dict] = [normalise_entry(e) for e in _EXTRA_RAW]


def request_dict(entry: dict, target: str) -> dict:
    return {"latex": entry["latex"], "packages": entry["packages"], "preamble": entry["preamble"], "target": target,
            "mode": entry.get("mode", "math")}


def run_reference(target: str, entries: list[dict]) -> dict | None:
    """Run ce_reference.py / gl_reference.py in the Manim venv; None when the venv is missing."""
    python = venv_python(target)
    if python is None:
        return None
    script = os.path.join(TESTS_DIR, "ce_reference.py" if target == "ce" else "gl_reference.py")
    with tempfile.TemporaryDirectory(prefix="mfe-ref-") as tmp:
        req_path, out_path = os.path.join(tmp, "requests.json"), os.path.join(tmp, "out.json")
        with open(req_path, "w", encoding="utf-8") as fh:
            json.dump(entries, fh)
        proc = subprocess.run([python, script, req_path, out_path], cwd=tmp, capture_output=True, text=True, timeout=900)
        if not os.path.exists(out_path):
            raise RuntimeError(f"reference run failed for {target}:\n{proc.stdout[-1500:]}\n{proc.stderr[-1500:]}")
        with open(out_path, encoding="utf-8") as fh:
            return json.load(fh)


def make_companion(**kwargs) -> mfe_companion.Companion:
    kwargs.setdefault("disk_cache", False)
    return mfe_companion.Companion(**kwargs)


def compile_entry(companion: mfe_companion.Companion, entry: dict, target: str) -> dict:
    req = mfe_companion.validate_request(request_dict(entry, target))
    return companion.compile(req)


def labels(result: dict) -> list[str]:
    return [g["label"] for g in result["glyphs"]]
