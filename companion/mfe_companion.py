#!/usr/bin/env python3
"""Manim Formula Editor companion (protocol v1, see docs/COMPANION.md).

A small local HTTP server that compiles LaTeX formulas exactly the way ManimCE and ManimGL do
(same TeX document, ``latex`` + ``dvisvgm --no-fonts``) and returns the SVG together with one
label per glyph, recovered from the DVI file.

Python >= 3.10, standard library only. Run ``python3 mfe_companion.py --help``.

Layout of this file
    1. constants
    2. TeX documents (ports of ManimCE ``MathTex`` / ``Tex`` and ManimGL ``Tex`` / ``TexText``)
    3. glyph label tables (TeX font encodings -> Unicode)
    4. DVI reader and SVG shape scanner, label alignment
    5. LaTeX error extraction
    6. the ``Companion`` engine (tools, caches, compile pipeline, health)
    6b. jobs: video encoding with ffmpeg and rendering with Manim (companion 1.1), with a
        soundtrack added by a second pass of ffmpeg (1.5)
    7. HTTP server
    8. command line
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
import ntpath
import os
import queue
import re
import secrets
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
import weakref
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, NamedTuple
from urllib.parse import parse_qs, unquote, urlsplit

# ---------------------------------------------------------------------------------------------
# 1. Constants
# ---------------------------------------------------------------------------------------------

NAME = "mfe-companion"
VERSION = "1.7.0"
PROTOCOL = 1
DEFAULT_PORT = 7799

MAX_BODY_BYTES = 64 * 1024  # whole request body
MAX_LATEX_BYTES = 8 * 1024  # "latex" field (UTF-8 bytes)
MAX_PREAMBLE_BYTES = 8 * 1024  # "preamble" field (UTF-8 bytes)
MAX_PACKAGES = 32
MAX_PACKAGE_NAME = 64
MAX_SVG_BYTES = 32 * 1024 * 1024  # sanity cap on the SVG artifact dvisvgm may produce

COMPILE_TIMEOUT_S = 15.0  # latex + dvisvgm share this budget
MAX_CONCURRENT_COMPILES = 2
MEMORY_CACHE_ENTRIES = 256
DISK_CACHE_MAX_FILES = 4000
# Bump when the shape of cached results (svg / glyph labels) changes, so stale disk entries are
# ignored. It is hashed into the cache key next to the target, the TeX document and tool versions.
CACHE_SCHEMA = 3

PACKAGE_RE = re.compile(r"^[A-Za-z0-9_-]+$")
# Browsers always send Origin on cross-origin requests. Only local http origins are accepted by
# default; the opaque origin "null" (the app opened from file://, but also any sandboxed iframe on
# any web page) is accepted only with `serve --allow-file-origin` / MFE_ALLOW_FILE_ORIGIN=1.
ORIGIN_RE = re.compile(r"^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$")
TARGETS = ("ce", "gl")
# /tex "mode": a formula (ManimCE MathTex / ManimGL Tex) or text (ManimCE Tex / ManimGL TexText)
MODES = ("math", "text")

PANGO_ADAPTER_VERSION = "native-text-1"
MAX_TEXT_BYTES = 32 * 1024
MAX_TEXT_LINES = 512
MAX_TEXT_GLYPHS = 8192
MAX_TEXT_POINTS = 500_000
MAX_TEXT_OUTPUT_BYTES = 16 * 1024 * 1024
MAX_TEXT_PENDING = 4
# One request to a text worker: the wait for a worker that is busy with others, and then, apart,
# the shaping itself once the worker takes it.
TEXT_TIMEOUT_S = 5.0
# A text whose shaping passed that limit, or took its worker down, is not shaped again for this
# long: whoever asks hears why at once, and the worker stays for the other texts. Without it the
# worker that /health brings back would meet the same text again, and again.
TEXT_REFUSED_S = 600.0
MAX_TEXT_REFUSED = 64
# Starting a text worker: Manim's import, the font catalog and the digest of every font file. It
# is nobody's request time: a request that finds its worker starting waits for it on top of its
# own limit.
TEXT_START_TIMEOUT_S = 30.0
FONT_HASHES_FILE = "font-hashes.v1"  # in the cache directory; not a /tex entry (no .json suffix)
MAX_FONT_HASHES_BYTES = 8 * 1024 * 1024
MAX_FONT_HASHES = 40_000  # font files in one table (Fontconfig's two sets, 20000 each at most)
TEXT_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")

# --- jobs (companion 1.1): POST /video and POST /manim-render ---
MAX_VIDEO_SIDE = 8192
MIN_VIDEO_SIDE = 16
MAX_VIDEO_PIXELS = 8192 * 4608
MAX_VIDEO_FPS = 240
MAX_GIF_FPS = 50  # GIF delays are whole centiseconds
# ffmpeg's split + palettegen keeps every frame in memory, so GIF gets tighter limits
MAX_GIF_SIDE = 1920
MAX_GIF_RAW_BYTES = 2 * 1024 * 1024 * 1024  # frames x width x height x 3
MAX_VIDEO_FRAMES = 1_000_000
MAX_FRAME_BYTES = 64 * 1024 * 1024  # one PNG file
MAX_FRAMES_REQUEST_BYTES = 128 * 1024 * 1024  # body of one POST /video/<id>/frames
FEED_CHUNK = 256 * 1024
GIB = 1024 * 1024 * 1024
# The largest video one job writes (companion 1.7): `serve --max-video-gib` gives another limit, a
# whole number of GiB. The video is written in the companion's temporary folder while it is
# encoded, so the limit is room on that disk, not memory.
DEFAULT_VIDEO_GIB = 4
MAX_VIDEO_GIB = 64
MAX_OUTPUT_BYTES = DEFAULT_VIDEO_GIB * GIB
# ffmpeg's own stop (-fs) is this far past the limit. It is no judge: ffmpeg stops there as if all
# were well, and the file it leaves is a video cut short. The companion looks at the file itself
# and fails the job at the limit; ffmpeg's stop only bounds what is written between two looks.
OUTPUT_STOP_MARGIN_BYTES = 64 * 1024 * 1024
# What a job leaves free on the disk of the temporary folder: it is stopped when less is left,
# before the disk is full for every other program of the machine.
MIN_FREE_BYTES = GIB
ROOM_CHECK_S = 0.25  # how often a pass that writes is looked at
MAX_CODE_BYTES = 512 * 1024  # "code" of POST /manim-render
MAX_VIDEO_JOBS = 2  # unfinished video jobs at once
MAX_MANIM_JOBS = 1
MAX_RETAINED_JOBS = 8  # finished jobs kept for download
VIDEO_IDLE_TIMEOUT_S = 120.0  # a job that receives no frames for this long is cancelled
ENCODE_TIMEOUT_S = 1800.0  # ffmpeg's time to finish after the last frame
JOB_RETENTION_S = 600.0  # a finished job is forgotten after this long without access
MANIM_TIMEOUT_S = 600.0
MANIM_RECEIVING_TIMEOUT_S = 1800.0  # a render waits this long, at most, for its whole soundtrack
VIDEO_FORMATS = {  # format -> (file extension, MIME type)
    "mp4": ("mp4", "video/mp4"),
    "webm": ("webm", "video/webm"),
    "mov": ("mov", "video/quicktime"),
    "gif": ("gif", "image/gif"),
}
QUALITIES = ("low", "medium", "high")
# The soundtrack of a job (companion 1.5): one WAV file, 16-bit PCM, stereo, at this rate, that
# lasts what the video lasts. ffmpeg encodes it in a second pass and copies the video.
AUDIO_RATE = 48_000
AUDIO_FRAME_BYTES = 4  # two channels of 16 bits
WAV_HEADER_BYTES = 44
MAX_AUDIO_SECONDS = 3600  # 691 MB of WAV
MAX_AUDIO_REQUEST_BYTES = 16 * 1024 * 1024  # body of one POST .../audio
MUX_TIMEOUT_S = 600.0  # the second pass: the video is copied, only the sound is encoded
# The room the second pass has over the video it copies: an hour of the densest sound it encodes
# is 86 MB. It is stopped when its file grows past the video's limit and this (ffmpeg's own -fs is
# loose, and ends as if all were well).
SOUND_ROOM_BYTES = 128 * 1024 * 1024


def sound_output_cap(video_bytes: int, limit: int = MAX_OUTPUT_BYTES) -> int:
    """How large the file of the second pass may get for a video of ``video_bytes``, where the
    first pass writes ``limit`` at most: that limit with the room for an hour of sound, and, for a
    larger video (the one Manim wrote has no limit of its own), what it has over that as well."""
    return limit + SOUND_ROOM_BYTES + max(0, video_bytes - limit)


def _size_text(count: int) -> str:
    """A number of bytes as a message says it: "4 GiB", "1.5 GiB", "128 MiB", "2000 bytes"."""
    for unit, size in (("GiB", GIB), ("MiB", 1024 * 1024)):
        if count >= size:
            value = count / size
            return f"{value:.0f} {unit}" if value == int(value) else f"{value:.1f} {unit}"
    return f"{count} bytes"


def video_too_large(limit: int) -> str:
    """What a job says when its video passed ``limit``: what happened, and what can be done."""
    raise_it = ("" if limit >= MAX_VIDEO_GIB * GIB else
                f", or start the companion with a higher limit: serve --max-video-gib N (up to {MAX_VIDEO_GIB})")
    return (f"The video is larger than {_size_text(limit)}, the most this companion writes for one video, so it "
            f"was stopped. Export a shorter range, a smaller size or a lower quality{raise_it}.")


def disk_nearly_full(folder: str, reserve: int) -> str:
    """What a job says when the disk of the temporary folder has less than ``reserve`` free."""
    return (f"The disk of the companion's temporary folder ({folder}) is nearly full: less than "
            f"{_size_text(reserve)} is free there, so the job was stopped. Free some room, or start the "
            "companion with the environment variable TMPDIR naming a folder on a disk with more room.")


def _free_bytes(folder: str) -> int | None:
    """The room left on the disk of ``folder``; None when it cannot be asked (the folder is gone)."""
    try:
        return shutil.disk_usage(folder).free
    except OSError:
        return None


def folder_as_said(folder: str, windows: bool = os.name == "nt", long_name: Any = os.path.realpath) -> str:
    """``folder`` as a message names it. Windows gives the temporary folder by its short name to a
    user whose own name is not a short one, with a space in it or more than eight characters
    (``C:\\Users\\LONGNA~1\\AppData\\Local\\Temp``), which nobody typed and few would recognise:
    there a folder with a ``~`` in its name is said by the name the system resolves it to, the
    long one. Any other folder, and every folder on the other systems, is said as it was given
    (resolved, a Mac's ``/var/folders`` would read ``/private/var/folders``)."""
    if not (windows and "~" in folder):
        return folder
    try:
        return long_name(folder)
    except OSError:
        return folder


AUDIO_ENCODERS = {  # video format -> (ffmpeg encoder, bit rate, what the error messages call it)
    "mp4": ("aac", "192k", "AAC"),
    "mov": ("aac", "192k", "AAC"),
    "webm": ("libopus", "128k", "Opus"),
}
VIDEO_ENCODERS = {  # video format -> (the ffmpeg encoder /video uses for it, what the report calls it)
    "mp4": ("libx264", "MP4 (H.264)"),
    "webm": ("libvpx-vp9", "WebM (VP9)"),
    "mov": ("prores_ks", "MOV (ProRes)"),
    "gif": ("gif", "GIF"),
}
SCENE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")
JOB_ID_RE = re.compile(r"^[0-9a-f]{32}$")


# ---------------------------------------------------------------------------------------------
# 2. TeX documents
# ---------------------------------------------------------------------------------------------
#
# The documents and the functions of this section are ports of the two libraries' own, so that
# LaTeX is handed the very text Manim hands it. Both libraries are under the MIT License:
#
#   ManimCE   Copyright (c) 2018 3Blue1Brown LLC
#             Copyright (c) 2024, the Manim Community Developers
#   ManimGL   Copyright (c) 2020-2023 3Blue1Brown LLC
#
# The text of each licence is in the repository, app/build/licenses/ManimCE-LICENSE.txt and
# app/build/licenses/ManimGL-LICENSE.txt, and in the notices of every build of the app.


class TexBuildError(ValueError):
    """The formula is rejected before LaTeX runs (ManimGL raises ValueError on stray braces)."""


class TexDocument(NamedTuple):
    text: str  # complete .tex source handed to latex
    first_line: int  # 1-based line of ``text`` where the user's LaTeX starts
    lead_newlines: int  # newlines Manim strips from the start of the user's LaTeX
    expr_start: int  # text[expr_start:expr_end] is the formula as Manim hands it to LaTeX
    expr_end: int


# ----- ManimCE 0.22.1: MathTex(latex) with the default TexTemplate ---------------------------

_CE_DOCUMENTCLASS = r"\documentclass[preview]{standalone}"
_CE_PREAMBLE = "\n".join(
    [r"\usepackage[english]{babel}", r"\usepackage{amsmath}", r"\usepackage{amssymb}"]
)
_CE_PLACEHOLDER = "YourTextHere"  # TexTemplate.placeholder_text
_CE_ENVIRONMENT = "align*"  # MathTex.tex_environment
_CE_TEXT_ENVIRONMENT = "center"  # Tex.tex_environment


def _ce_split_double_braces(tex_string: str) -> list[str]:
    """Port of ``MathTex._split_double_braces``: split on Manim's ``{{ ... }}`` notation."""
    segments: list[str] = []
    current = ""
    i = 0
    inside_manim = False
    inner_depth = 0
    while i < len(tex_string):
        # consume escape sequences as atomic units
        if tex_string[i] == "\\" and i + 1 < len(tex_string):
            next_ch = tex_string[i + 1]
            if next_ch == "\\" or next_ch in "{}":
                current += tex_string[i : i + 2]
                i += 2
                continue
        if not inside_manim:
            # "{{" opens a group only at the start of the string or after whitespace
            if tex_string[i : i + 2] == "{{" and (i == 0 or tex_string[i - 1].isspace()):
                segments.append(current)
                current = ""
                inside_manim = True
                inner_depth = 0
                i += 2
            else:
                current += tex_string[i]
                i += 1
        else:
            if tex_string[i] == "{":
                inner_depth += 1
                current += tex_string[i]
                i += 1
            elif tex_string[i] == "}" and inner_depth == 0 and tex_string[i : i + 2] == "}}":
                segments.append(current)
                current = ""
                inside_manim = False
                i += 2
            elif tex_string[i] == "}":
                inner_depth -= 1
                current += tex_string[i]
                i += 1
            else:
                current += tex_string[i]
                i += 1
    segments.append(current)
    return segments


def _ce_join_tex_strings(tex_strings: list[str], arg_separator: str = " ") -> str:
    """Port of ``MathTex._join_tex_strings_with_unique_deliminters`` (no substrings to isolate)."""
    joined = ""
    for idx, tex_string in enumerate(tex_strings):
        part = rf"\special{{dvisvgm:raw <g id='unique{idx:03d}'>}}"
        part += tex_string
        if idx < len(tex_strings) - 1:
            part += arg_separator
        part += r"\special{dvisvgm:raw </g>}"
        joined += part
    return joined


def _ce_remove_stray_braces(tex: str) -> str:
    """Port of ``SingleStringMathTex._remove_stray_braces``."""
    # "\{" does not count (brace literal), but "\\{" counts (new line, then a brace)
    num_lefts = tex.count("{") - tex.count("\\{") + tex.count("\\\\{")
    num_rights = tex.count("}") - tex.count("\\}") + tex.count("\\\\}")
    while num_rights > num_lefts:
        tex = "{" + tex
        num_lefts += 1
    while num_lefts > num_rights:
        tex = tex + "}"
        num_rights += 1
    return tex


def _ce_modify_special_strings(tex: str) -> str:
    """Port of ``SingleStringMathTex._modify_special_strings``."""
    tex = tex.strip()
    should_add_filler = (
        tex == "\\over"
        or tex == "\\overline"
        or tex == "\\sqrt"
        or tex == "\\sqrt{"
        or tex.endswith("_")
        or tex.endswith("^")
        or tex.endswith("dot")
    )
    if should_add_filler:
        tex += "{\\quad}"
    if tex == "\\substack":
        tex = "\\quad"
    if tex == "":
        tex = "\\quad"
    # to keep files from starting with a line break
    if tex.startswith("\\\\"):
        tex = tex.replace("\\\\", "\\quad\\\\")
    # handle imbalanced \left and \right
    num_lefts, num_rights = (
        len([s for s in tex.split(substr)[1:] if s and s[0] in "(){}[]|.\\"])
        for substr in ("\\left", "\\right")
    )
    if num_lefts != num_rights:
        tex = tex.replace("\\left", "\\big")
        tex = tex.replace("\\right", "\\big")
    tex = _ce_remove_stray_braces(tex)
    for context in ["array"]:
        begin_in = ("\\begin{%s}" % context) in tex
        end_in = ("\\end{%s}" % context) in tex
        if begin_in ^ end_in:
            # a stray \begin{array} or \end{array}: Manim turns the whole thing into a blank string
            tex = ""
    return tex


def ce_expression(latex: str, arg_separator: str = " ") -> str:
    """What ``MathTex(latex)`` puts between ``\\begin{align*}`` and ``\\end{align*}`` (``Tex``, text
    mode, joins the pieces with an empty ``arg_separator`` inside ``center``).

    MathTex first splits ``{{ }}`` groups (empty pieces are dropped) and wraps every piece in a
    dvisvgm ``<g id='uniqueNNN'>`` special, the pieces joined with ``arg_separator``; the *joined*
    string then goes through ``_get_modified_expression``. (So, for instance, the ``_`` / ``\\over``
    fillers never fire on the user's text: the string always ends with the closing ``\\special``.)
    """
    pieces = [s for s in _ce_split_double_braces(latex) if len(s) > 0]
    joined = _ce_join_tex_strings(pieces, arg_separator)
    return _ce_modify_special_strings(joined.strip())


def build_ce_document(latex: str, packages: list[str], preamble: str, mode: str = "math") -> TexDocument:
    """The document ``tex_to_svg_file`` writes for ``MathTex(latex, tex_template=...)`` or, in text
    mode, for ``Tex(latex, tex_template=...)``: the same with ``arg_separator=""`` and
    ``tex_environment="center"``."""
    text_mode = mode == "text"
    expression = ce_expression(latex, "" if text_mode else " ")
    # TexTemplate.add_to_preamble appends "\n" + text at the end of the preamble
    tpl_preamble = _CE_PREAMBLE
    for package in packages:
        tpl_preamble += "\n" + r"\usepackage{%s}" % package
    if preamble:
        tpl_preamble += "\n" + preamble
    body = "\n".join(
        filter(
            None,
            [_CE_DOCUMENTCLASS, tpl_preamble, r"\begin{document}", "", _CE_PLACEHOLDER, r"\end{document}"],
        )
    )
    environment = _CE_TEXT_ENVIRONMENT if text_mode else _CE_ENVIRONMENT
    env_begin, env_end = r"\begin{%s}" % environment, r"\end{%s}" % environment
    replacement = "\n".join([env_begin, expression, env_end])
    # str.replace swaps every occurrence of the placeholder, exactly like TexTemplate does
    text = body.replace(_CE_PLACEHOLDER, replacement)
    head = body[: body.index(_CE_PLACEHOLDER)].replace(_CE_PLACEHOLDER, replacement)
    start = len(head) + len(env_begin) + 1
    return TexDocument(text, head.count("\n") + 2, 0, start, start + len(expression))


# ----- ManimGL 1.7.2: Tex(latex) with the "default" template ---------------------------------

_GL_PREAMBLE = r"""\usepackage[english]{babel}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{dsfont}
\usepackage{setspace}
\usepackage{tipa}
\usepackage{relsize}
\usepackage{textcomp}
\usepackage{mathrsfs}
\usepackage{calligra}
\usepackage{wasysym}
\usepackage{ragged2e}
\usepackage{physics}
\usepackage{xcolor}
\usepackage{microtype}
\usepackage{pifont}
\DisableLigatures{encoding = *, family = * }
\linespread{1}
%% Borrowed from https://tex.stackexchange.com/questions/6058/making-a-shorter-minus
\DeclareMathSymbol{\minus}{\mathbin}{AMSa}{"39}"""

# Tex.get_command_matches: a run of braces is one token; commands are \name or \<char>
_GL_TOKEN_RE = re.compile(
    r"""
    (?P<command>\\(?:[a-zA-Z]+|.))
    |(?P<open>{+)
    |(?P<close>}+)
""",
    flags=re.X | re.S,
)


def _gl_command_matches(string: str) -> list[re.Match]:
    """Port of ``Tex.get_command_matches`` (raises ValueError on unbalanced braces)."""
    pattern = _GL_TOKEN_RE
    result: list[re.Match] = []
    open_stack: list[tuple[tuple[int, int], int]] = []
    for match_obj in pattern.finditer(string):
        if match_obj.group("open"):
            open_stack.append((match_obj.span(), len(result)))
        elif match_obj.group("close"):
            close_start, close_end = match_obj.span()
            while True:
                if not open_stack:
                    raise TexBuildError("Missing '{' inserted")
                (open_start, open_end), index = open_stack.pop()
                n = min(open_end - open_start, close_end - close_start)
                result.insert(index, pattern.fullmatch(string, pos=open_end - n, endpos=open_end))
                result.append(pattern.fullmatch(string, pos=close_start, endpos=close_start + n))
                close_start += n
                if close_start < close_end:
                    continue
                open_end -= n
                if open_start < open_end:
                    open_stack.append(((open_start, open_end), index))
                break
        else:
            result.append(match_obj)
    if open_stack:
        raise TexBuildError("Missing '}' inserted")
    return result


def gl_labelled_body(tex_string: str) -> str:
    """The text ``Tex(...).get_content(True)`` places between ``\\begin{align*}`` and ``\\end``.

    ManimGL colour-labels every ``{{ ... }}`` group (a brace run of two or more) so it can tell
    which glyphs belong to it: after the opening run it inserts ``{{\\color[RGB]{r, g, b}`` and
    before the closing run ``}}``. This is ``StringMobject.parse`` restricted to what ``Tex``
    does when no ``isolate`` / ``tex_to_color_map`` is given: only the command pairs are
    labelled, labels count up in the order the pairs close.
    """
    matches = _gl_command_matches(tex_string)
    # every item is (start, end, text): the source span it replaces and what to write instead
    inserted: list[tuple[int, int, str]] = []
    stack: list[tuple[int, int]] = []  # (index into `inserted` after the open command, match index)
    label = 1
    for i, m in enumerate(matches):
        inserted.append((m.start(), m.end(), m.group()))
        if m.group("open"):
            stack.append((len(inserted), i))
        elif m.group("close"):
            pos, open_i = stack.pop()
            open_m = matches[open_i]
            if len(open_m.group()) >= 2:  # Tex.get_attr_dict_from_command_pair
                rg, b = divmod(label, 256)
                r, g = divmod(rg, 256)
                # the label starts right after the opening braces and ends right before the closing ones
                inserted.insert(pos, (open_m.end(), open_m.end(), "{{" + f"\\color[RGB]{{{r}, {g}, {b}}}"))
                inserted.insert(len(inserted) - 1, (m.start(), m.start(), "}}"))
                label += 1
    out: list[str] = []
    cursor = 0
    for start, end, text in inserted:
        out.append(tex_string[cursor:start])
        out.append(text)
        cursor = end
    out.append(tex_string[cursor:])
    return "".join(out)


def build_gl_document(latex: str, packages: list[str], preamble: str, mode: str = "math") -> TexDocument:
    """The document ``latex_to_svg(Tex(latex, additional_preamble=...).get_content(True))`` compiles —
    in text mode ``TexText``'s: the same without the ``align*`` environment (``\\centering`` stays)."""
    stripped = (" ".join([latex])).strip()
    lead_newlines = latex[: len(latex) - len(latex.lstrip())].count("\n")
    if not stripped.strip():
        stripped = r"\\"  # "Prevent from passing an empty string."
    additional = "\n".join([*(r"\usepackage{%s}" % p for p in packages), *([preamble] if preamble else [])])
    full_preamble = "\n".join([_GL_PREAMBLE, additional])
    body = gl_labelled_body(stripped)
    # Tex.get_content_prefix_and_suffix: the alignment, then the environment when there is one
    if mode == "text":
        prefix, suffix = "\\centering\n", ""
    else:
        prefix, suffix = "\\centering\n\\begin{align*}\n", "\n\\end{align*}"
    content = prefix + body + suffix
    head = "\n\n".join([r"\documentclass[preview]{standalone}", full_preamble, r"\begin{document}"]) + "\n\n"
    text = head + content + "\n\n" + r"\end{document}" + "\n"
    start = len(head) + len(prefix)
    first_line = head.count("\n") + prefix.count("\n") + 1
    return TexDocument(text, first_line, lead_newlines, start, start + len(body))


def build_document(target: str, latex: str, packages: list[str], preamble: str, mode: str = "math") -> TexDocument:
    if target == "ce":
        return build_ce_document(latex, packages, preamble, mode)
    if target == "gl":
        return build_gl_document(latex, packages, preamble, mode)
    raise ValueError(f"unknown target {target!r}")


# ---------------------------------------------------------------------------------------------
# 3. Glyph label tables: (TeX font, character code) -> Unicode text
# ---------------------------------------------------------------------------------------------
#
# Tables are written as rows of 16 characters (one row per 0x10 codes) plus a dict for the few
# slots whose label is more than one character (ligatures). They were generated from the
# glyph names in the fonts' AFM files / encoding files shipped with TeX Live and reviewed by
# hand. Conventions: labels follow what MathJax uses for the same symbol where there is one
# (``\epsilon`` -> U+03F5, ``\varepsilon`` -> U+03B5, ``\vec`` -> U+2192 ...); ligatures are
# spelled out ("ffi"); accents are the spacing characters.


def _table(rows: tuple[str, ...], multi: dict[int, str] | None = None) -> list[str]:
    labels = list("".join(rows))
    for code, text in (multi or {}).items():
        labels[code] = text
    return labels


# Text fonts, OT1 encoding (cmr, cmbx, cmsl, cmti, cmss, ...).
_OT1 = _table((
    'ΓΔΘΛΞΠΣΥΦΨΩ·····',  # 00
    'ıȷ`´ˇ˘¯˚¸ßæœøÆŒØ',  # 10
    '␣!”#$%&’()*+,-./',  # 20
    '0123456789:;¡=¿?',  # 30
    '@ABCDEFGHIJKLMNO',  # 40
    'PQRSTUVWXYZ[“]^˙',  # 50
    '‘abcdefghijklmno',  # 60
    'pqrstuvwxyz–—˝~¨',  # 70
), {11: 'ff', 12: 'fi', 13: 'fl', 14: 'ffi', 15: 'ffl'})

# Typewriter fonts, OT1 encoding variant (cmtt, cmitt, ...).
_OT1TT = _table((
    "ΓΔΘΛΞΠΣΥΦΨΩ↑↓'¡¿",  # 00
    'ıȷ`´ˇ˘¯˚¸ßæœøÆŒØ',  # 10
    '␣!"#$%&’()*+,-./',  # 20
    '0123456789:;<=>?',  # 30
    '@ABCDEFGHIJKLMNO',  # 40
    'PQRSTUVWXYZ[\\]^_',  # 50
    '‘abcdefghijklmno',  # 60
    'pqrstuvwxyz{|}~¨',  # 70
))

# Math italic, OML encoding (cmmi, cmmib).
_OML = _table((
    'ΓΔΘΛΞΠΣΥΦΨΩαβγδϵ',  # 00
    'ζηθικλμνξπρστυϕχ',  # 10
    'ψωεϑϖϱςφ↼↽⇀⇁↩↪▷◁',  # 20
    '0123456789.,</>⋆',  # 30
    '∂ABCDEFGHIJKLMNO',  # 40
    'PQRSTUVWXYZ♭♮♯⌣⌢',  # 50
    'ℓabcdefghijklmno',  # 60
    'pqrstuvwxyzıȷ℘→⁀',  # 70
))

# Math symbols, OMS encoding (cmsy, cmbsy); capitals are the calligraphic letters.
_OMS = _table((
    '−⋅×∗÷⋄±∓⊕⊖⊗⊘⊙◯∘∙',  # 00
    '≍≡⊆⊇≤≥⪯⪰∼≈⊂⊃≪≫≺≻',  # 10
    '←→↑↓↔↗↘≃⇐⇒⇑⇓⇔↖↙∝',  # 20
    '′∞∈∋△▽/↦∀∃¬∅ℜℑ⊤⊥',  # 30
    'ℵ𝒜ℬ𝒞𝒟ℰℱ𝒢ℋℐ𝒥𝒦ℒℳ𝒩𝒪',  # 40
    '𝒫𝒬ℛ𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵∪∩⊎∧∨',  # 50
    '⊢⊣⌊⌋⌈⌉{}⟨⟩|∥↕⇕∖≀',  # 60
    '√∐∇∫⊔⊓⊑⊒§†‡¶♣♢♡♠',  # 70
))

# Math extension, OMX encoding (cmex): delimiter pieces report the delimiter they build.
_OMX = _table((
    '()[]⌊⌋⌈⌉{}⟨⟩|∥/\\',  # 00
    '()()[]⌊⌋⌈⌉{}⟨⟩/\\',  # 10
    '()[]⌊⌋⌈⌉{}⟨⟩/\\/\\',  # 20
    '()[][][]{}{}{}⎪⏐',  # 30
    '()()⟨⟩⨆⨆∮∮⨀⨀⨁⨁⨂⨂',  # 40
    '∑∏∫⋃⋂⨄⋀⋁∑∏∫⋃⋂⨄⋀⋁',  # 50
    '∐∐^^^~~~[]⌊⌋⌈⌉{}',  # 60
    '√√√√√√√‖↑↓⏟⏟⏞⏞⇑⇓',  # 70
))

# AMS symbols A (msam).
_MSAM = _table((
    '⊡⊞⊠□■⬝◊⧫↻↺⇌⇋⊟⊩⊪⊨',  # 00
    '↠↞⇇⇉⇈⇊↾⇂↿⇃↣↢⇆⇄↰↱',  # 10
    '⇝↭↫↬≗≿≳⪆⊸∴∵≑≜≾≲⪅',  # 20
    '⪕⪖⋞⋟≼≦⩽≶‵-≒≓≽≧⩾≷',  # 30
    '⊏⊐⊳⊲⊵⊴★≬▼▶◀→←△▲▽',  # 40
    '≖⋚⋛⪋⪌¥⇛⇚✓⊻⊼⩞∠∡∢∝',  # 50
    '⌣⌢⋐⋑⋓⋒⋏⋎⋋⋌⫅⫆≏≎⋘⋙',  # 60
    '⌜⌝®Ⓢ⋔∔∽⋍⌞⌟✠∁⊺⊚⊛⊝',  # 70
))

# AMS symbols B (msbm); capitals are the blackboard-bold letters.
_MSBM = _table((
    '≨≩≰≱≮≯⊀⊁≨≩≰≱⪇⪈⋠⋡',  # 00
    '⋨⋩⋦⋧≰≱⪵⪶⪹⪺⪉⪊≁≇╱╲',  # 10
    '⊊⊋⊈⊉⫋⫌⫋⫌⊊⊋⊈⊉∦∤∤∦',  # 20
    '⊬⊮⊭⊯⋭⋬⋪⋫↚↛⇍⇏⇎↮⋇∅',  # 30
    '∄𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆',  # 40
    'ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ^^~~?',  # 50
    'Ⅎ⅁????℧ð≂ℶℷℸ⋖⋗⋉⋊',  # 60
    '∣∥∖∼≈≊⪸⪷↶↷ϝϰ𝕜ℏℏ϶',  # 70
))

# T1 / EC text fonts (ecrm, ecbx, ...), as used by \usepackage[T1]{fontenc}.
_T1 = _table((
    '`´^~¨˝˚ˇ˘¯˙¸˛‚‹›',  # 00
    '“”„«»–—?0ıȷ·····',  # 10
    '␣!"#$%&’()*+,-./',  # 20
    '0123456789:;<=>?',  # 30
    '@ABCDEFGHIJKLMNO',  # 40
    'PQRSTUVWXYZ[\\]^_',  # 50
    '‘abcdefghijklmno',  # 60
    'pqrstuvwxyz{|}~-',  # 70
    'ĂĄĆČĎĚĘĞĹĽŁŃŇŊŐŔ',  # 80
    'ŘŚŠŞŤȚŰŮŸŹŽŻ·İđ§',  # 90
    'ăąćčďěęğĺľłńňŋőŕ',  # A0
    'řśšşťțűůÿźžż·¡¿£',  # B0
    'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏ',  # C0
    'ÐÑÒÓÔÕÖŒØÙÚÛÜÝÞ·',  # D0
    'àáâãäåæçèéêëìíîï',  # E0
    'ðñòóôõöœøùúûüýþß',  # F0
), {27: 'ff', 28: 'fi', 29: 'fl', 30: 'ffi', 31: 'ffl', 156: 'IJ', 188: 'ij', 223: 'SS'})

# TS1 text companion fonts (tcrm, ...), used by textcomp.
_TS1 = _table((
    '`´^~¨˝˚ˇ˘¯˙¸˛‚??',  # 00
    '??„??–—?←→⁀⁀⁀⁀??',  # 10
    "␢???$??'??∗?,‐.⁄",  # 20
    '0123456789??⟨−⟩?',  # 30
    '?????????????℧?○',  # 40
    '???????Ω???⟦?⟧↑↓',  # 50
    '`?*⚮†???????❧⚭♪?',  # 60
    '??????????????˷‐',  # 70
    '˘ˇ˝̏†‡‖‰•℃$¢ƒ₡₩₦',  # 80
    '₲₱₤℞‽⸘₫™‱¶฿№⁒℮◦℠',  # 90
    '⁅⁆¢£¤¥¦§¨©ª🄯¬℗®¯',  # A0
    '°±²³´µ¶·※¹º√¼½¾€',  # B0
    '????????????????',  # C0
    '??????×?????????',  # D0
    '????????????????',  # E0
    '??????÷?????????',  # F0
))



def _ascii_table() -> list[str]:
    return [chr(c) if 0x20 < c < 0x7F else "?" for c in range(128)]


def _styled_table(
    upper: int | None = None,
    upper_exceptions: dict[str, str] | None = None,
    lower: int | None = None,
    lower_exceptions: dict[str, str] | None = None,
    digits: int | None = None,
    one: str | None = None,
) -> list[str]:
    """ASCII positions, with letters (and digits) replaced by a Unicode math alphabet."""
    table = _ascii_table()
    for i in range(26):
        if upper is not None:
            ch = chr(65 + i)
            table[65 + i] = (upper_exceptions or {}).get(ch) or chr(upper + i)
        if lower is not None:
            ch = chr(97 + i)
            table[97 + i] = (lower_exceptions or {}).get(ch) or chr(lower + i)
    if digits is not None:
        for i in range(10):
            table[48 + i] = chr(digits + i)
    if one:
        table[49] = one
    return table


_SCRIPT_EXC = {"B": "\u212c", "E": "\u2130", "F": "\u2131", "H": "\u210b", "I": "\u2110",
               "L": "\u2112", "M": "\u2133", "R": "\u211b"}
_FRAKTUR_EXC = {"C": "\u212d", "H": "\u210c", "I": "\u2111", "R": "\u211c", "Z": "\u2128"}
_DOUBLE_EXC = {"C": "\u2102", "H": "\u210d", "N": "\u2115", "P": "\u2119", "Q": "\u211a",
               "R": "\u211d", "Z": "\u2124"}

_RSFS = _styled_table(upper=0x1D49C, upper_exceptions=_SCRIPT_EXC)  # \mathscr
_EUFM = _styled_table(upper=0x1D504, upper_exceptions=_FRAKTUR_EXC, lower=0x1D51E)  # \mathfrak
_DSROM = _styled_table(upper=0x1D538, upper_exceptions=_DOUBLE_EXC, lower=0x1D552, digits=0x1D7D8)  # \mathds
_LINE = ["\u2571"] * 128  # LaTeX picture-mode line segments (cancel.sty ...): a slanted line
_CIRCLE = ["\u25cb"] * 128
# latexsym's lasy10: \lhd \unlhd \rhd \unrhd \mho \Join \Box \Diamond \leadsto \sqsubset \sqsupset
_LASY = ["?"] * 128
for _code, _label in {1: "\u25c1", 2: "\u22b4", 3: "\u25b7", 4: "\u22b5", 0x30: "\u2127", 0x31: "\u22c8",
                      0x32: "\u25a1", 0x33: "\u25c7", 0x3B: "\u21dd", 0x3C: "\u228f", 0x3D: "\u2290"}.items():
    _LASY[_code] = _label
# wasysym's wasy10 (only the symbols that have a Unicode counterpart; the rest stays "?")
_WASY = ["?"] * 128
for _code, _label in {
    0x01: "\u25c1", 0x02: "\u22b4", 0x03: "\u25b7", 0x04: "\u22b5", 0x05: "\u2234", 0x06: "\u2315",
    0x07: "\u260e", 0x08: "\u2713", 0x09: "\u261e", 0x0A: "\U0001f514", 0x0B: "\u266a", 0x0C: "\u2669",
    0x0D: "\U0001d15e", 0x0E: "\U0001d15d", 0x0F: "\u266b", 0x10: "\u25c0", 0x11: "\u25b6", 0x12: "\u21af",
    0x13: "\u260a", 0x14: "\u260b", 0x17: "\u2648", 0x18: "\u2310", 0x19: "\u2640", 0x1A: "\u2642",
    0x1B: "\u00a4", 0x1C: "\U0001f550", 0x1D: "\u221d", 0x1E: "\u2222", 0x1F: "\u2300", 0x20: "\u25cf",
    0x21: "\u21bb", 0x22: "\u21ba", 0x23: "\u25cb", 0x24: "\u263e", 0x25: "\u263d", 0x26: "\u2641",
    0x27: "\u263f", 0x2C: "\u263a", 0x2D: "\u263b", 0x2E: "\u263c", 0x2F: "\u2639", 0x30: "\u2127",
    0x31: "\u22c8", 0x32: "\u25a1", 0x33: "\u25c7", 0x34: "\u2612", 0x35: "\u25ca", 0x36: "\u2720",
    0x37: "\u2b21", 0x39: "\u2b21", 0x3A: "\u223f", 0x3B: "\u21dd", 0x3C: "\u228f", 0x3D: "\u2290",
    0x3E: "\u2272", 0x3F: "\u2273", 0x41: "\u2736", 0x42: "\u2721", 0x43: "\u2721", 0x44: "\u2b20",
    0x45: "\u2605", 0x47: "\u25d6", 0x48: "\u25d7", 0x49: "\u25d0", 0x4A: "\u25d1", 0x4D: "\u00b6",
    0x4E: "\u20ac", 0x4F: "\u0292", 0x53: "\u2318", 0x54: "\u017f", 0x55: "\u01dd", 0x56: "\u260c",
    0x57: "\u260d", 0x58: "\u2643", 0x59: "\u2644", 0x5A: "\u2645", 0x5B: "\u2646", 0x5C: "\u2647",
    0x5D: "\u2649", 0x5E: "\u264a", 0x5F: "\u264b", 0x60: "\u264d", 0x61: "\u264e", 0x62: "\u264f",
    0x63: "\u2650", 0x64: "\u2651", 0x65: "\u2652", 0x66: "\u2653", 0x67: "\u00a2", 0x68: "\u2030",
    0x69: "\u00fe", 0x6A: "\u00de", 0x6B: "\u00f0", 0x6C: "\u0254", 0x72: "\u222b", 0x73: "\u222c",
    0x74: "\u222d", 0x75: "\u222e", 0x76: "\u222f", 0x77: "\u222b", 0x78: "\u222c", 0x79: "\u222d",
    0x7A: "\u222e", 0x7B: "\u222f", 0x7C: "\u00a6",
}.items():
    _WASY[_code] = _label
_OT1_ITALIC = list(_OT1)  # italic text fonts have a pound sign where roman ones have a dollar
_OT1_ITALIC[0x24] = "\u00a3"
_OT1TT_ITALIC = list(_OT1TT)
_OT1TT_ITALIC[0x24] = "\u00a3"

# design-size-less font family name -> table
_FAMILY_TABLES: dict[str, list[str]] = {}


def _register(table: list[str], *families: str) -> None:
    for family in families:
        _FAMILY_TABLES[family] = table


_register(_OT1, "cmr", "cmbx", "cmsl", "cmss", "cmssbx", "cmssi", "cmssdc", "cmbxsl", "cmbxti", "cmdunh",
          "cmcsc", "cmtcsc", "cmb", "lmr", "lmbx", "lmsl", "lmss", "lmssbx", "lmssi", "lmcsc", "lmdh", "lmb")
_register(_OT1_ITALIC, "cmti", "cmu", "cmff", "cmfi", "cmfib", "lmti", "lmu")
_register(_OT1TT, "cmtt", "cmvtt", "cmsltt", "lmtt", "lmvtt", "lmtl", "lmtlc", "lmtk")
_register(_OT1TT_ITALIC, "cmitt", "lmtti")
_register(_OML, "cmmi", "cmmib", "lmmi", "lmmib")
_register(_OMS, "cmsy", "cmbsy", "lmsy", "lmbsy")
_register(_OMX, "cmex", "lmex")
_register(_MSAM, "msam")
_register(_MSBM, "msbm")
_register(_LASY, "lasy")
_register(_WASY, "wasy")
_register(_RSFS, "rsfs")
_register(_EUFM, "eufm", "eufb")
_register(_DSROM, "dsrom", "dsss")
_register(_LINE, "line", "linew")
_register(_CIRCLE, "circle", "circlew")
_register(_ascii_table(), "callig")

_T1_FONT_RE = re.compile(r"^(ec|dc)[a-z]{2}$")  # ecrm1000, ecbx1200, ectt1000, dcr10 ...
_TS1_FONT_RE = re.compile(r"^tc[a-z]{2}$")  # tcrm1000 ...


def _font_family(font: str) -> str:
    """cmmi10 -> cmmi, ecrm1000 -> ecrm (TFM names end in the design size)."""
    return re.sub(r"\d+$", "", font)


def _table_for_font(font: str) -> list[str] | None:
    family = _font_family(font)
    table = _FAMILY_TABLES.get(family)
    if table is not None:
        return table
    if _T1_FONT_RE.match(family):
        return _T1
    if _TS1_FONT_RE.match(family):
        return _TS1
    return None


def glyph_label(font: str | None, code: int | None) -> str:
    """Unicode label of character ``code`` in the TeX font ``font``; ``?`` when unknown."""
    if font is None or code is None:
        return "?"
    table = _table_for_font(font)
    if table is None or not (0 <= code < len(table)):
        return "?"
    return table[code] or "?"


# ---------------------------------------------------------------------------------------------
# 4. DVI reader, SVG shape scanner and label alignment
# ---------------------------------------------------------------------------------------------


class DviItem(NamedTuple):
    kind: str  # "char" | "rule"
    font: str | None
    code: int | None


class DviError(ValueError):
    pass


def parse_dvi(data: bytes) -> list[DviItem]:
    """The characters and rules dvisvgm paints on page 1, in DVI order.

    Only what is needed to know *what* is drawn is tracked (no positions). A rule counts only
    when both of its dimensions are positive, like in dvisvgm (zero-sized struts paint nothing).
    """
    if len(data) < 15 or data[0] != 247:
        raise DviError("not a DVI file")
    n = len(data)
    pos = 0
    fonts: dict[int, str] = {}
    current: int | None = None
    items: list[DviItem] = []

    def uint(at: int, size: int) -> int:
        if at + size > n:
            raise DviError("truncated DVI file")
        return int.from_bytes(data[at : at + size], "big")

    def sint(at: int, size: int) -> int:
        return int.from_bytes(data[at : at + size], "big", signed=True) if at + size <= n else uint(at, size)

    def font_name() -> str | None:
        return fonts.get(current) if current is not None else None

    while pos < n:
        op = data[pos]
        pos += 1
        if op <= 127:  # set_char_0 .. set_char_127
            items.append(DviItem("char", font_name(), op))
        elif 128 <= op <= 131:  # set1..set4
            size = op - 127
            items.append(DviItem("char", font_name(), uint(pos, size)))
            pos += size
        elif op in (132, 137):  # set_rule, put_rule
            if sint(pos, 4) > 0 and sint(pos + 4, 4) > 0:
                items.append(DviItem("rule", None, None))
            pos += 8
        elif 133 <= op <= 136:  # put1..put4
            size = op - 132
            items.append(DviItem("char", font_name(), uint(pos, size)))
            pos += size
        elif op == 138:  # nop
            pass
        elif op == 139:  # bop: c0..c9 and a pointer to the previous page
            pos += 44
        elif op == 140:  # eop: dvisvgm converts page 1 only
            break
        elif op in (141, 142):  # push, pop
            pass
        elif 143 <= op <= 146:  # right1..4
            pos += op - 142
        elif op in (147, 152, 161, 166):  # w0, x0, y0, z0
            pass
        elif 148 <= op <= 151:  # w1..4
            pos += op - 147
        elif 153 <= op <= 156:  # x1..4
            pos += op - 152
        elif 157 <= op <= 160:  # down1..4
            pos += op - 156
        elif 162 <= op <= 165:  # y1..4
            pos += op - 161
        elif 167 <= op <= 170:  # z1..4
            pos += op - 166
        elif 171 <= op <= 234:  # fnt_num_0 .. fnt_num_63
            current = op - 171
        elif 235 <= op <= 238:  # fnt1..4
            size = op - 234
            current = uint(pos, size)
            pos += size
        elif 239 <= op <= 242:  # xxx1..4 (specials)
            size = op - 238
            pos += size + uint(pos, size)
        elif 243 <= op <= 246:  # fnt_def1..4: k, checksum, scale, design size, a, l, name
            size = op - 242
            number = uint(pos, size)
            pos += size + 12
            a, length = uint(pos, 1), uint(pos + 1, 1)
            raw = data[pos + 2 : pos + 2 + a + length]
            fonts[number] = raw.decode("latin-1").rsplit("/", 1)[-1]
            pos += 2 + a + length
        elif op == 247:  # pre: i, num, den, mag, k, comment
            pos += 1 + 12
            pos += 1 + uint(pos, 1)
        elif op in (248, 249):  # post, post_post: no page found
            break
        else:
            raise DviError(f"unexpected DVI opcode {op}")
    return items


_SVG_SHAPE_TAGS = frozenset({"path", "rect", "circle", "ellipse", "line", "polygon", "polyline"})
# containers whose children are definitions, not drawn shapes
_SVG_NON_RENDERED = frozenset(
    {"defs", "clipPath", "mask", "pattern", "symbol", "marker", "linearGradient", "radialGradient",
     "style", "script", "title", "desc", "metadata", "filter"}
)
_PATH_DRAWING_RE = re.compile(r"[LlHhVvCcSsQqTtAa]")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def _path_is_empty(d: str | None) -> bool:
    """True when path data draws nothing (empty, or only moves / closes): Manim drops those."""
    return d is None or _PATH_DRAWING_RE.search(d) is None


def svg_shapes(svg: str) -> list[str]:
    """Shape elements of an SVG in document order, outside ``<defs>``.

    Returns ``"rule"`` for ``<rect>`` and ``"glyph"`` for everything else. These are the elements
    ManimCE / ManimGL turn into submobjects: paths whose data is empty are skipped, rects are
    always kept. A ``<use>`` stands for what it names, wherever that is: a path, or another
    ``<use>`` — dvisvgm writes a glyph it has already drawn at another size as
    ``<use id='g1-80' xlink:href='#g0-80' transform='scale(1.4)'/>`` and refers to that.
    """
    if "<!ENTITY" in svg or "<!DOCTYPE" in svg:  # never feed entity tricks to the XML parser
        return _svg_shapes_regex(svg)
    try:
        root = ET.fromstring(svg)
    except ET.ParseError:
        return _svg_shapes_regex(svg)

    by_id: dict[str, ET.Element] = {}
    for el in root.iter():
        ident = el.get("id")
        if ident and ident not in by_id:
            by_id[ident] = el

    shapes: list[str] = []
    following: set[int] = set()  # the <use> targets being drawn: one that names itself draws nothing

    def visit(el: ET.Element) -> None:
        tag = _local(el.tag)
        if tag in _SVG_NON_RENDERED:
            return
        if tag == "rect":
            shapes.append("rule")
        elif tag == "path":
            if not _path_is_empty(el.get("d")):
                shapes.append("glyph")
        elif tag == "use":
            href = el.get("{http://www.w3.org/1999/xlink}href") or el.get("href") or ""
            target = by_id.get(href[1:]) if href.startswith("#") else None
            if target is None or id(target) in following:
                return
            following.add(id(target))
            if _local(target.tag) == "symbol":  # not drawn where it is, drawn where it is used
                for child in target:
                    visit(child)
            else:
                visit(target)  # also when it lives inside <defs>
            following.discard(id(target))
        elif tag in _SVG_SHAPE_TAGS:
            shapes.append("glyph")
        else:
            for child in el:  # <g>, <a>, ...
                visit(child)

    for child in root:
        visit(child)
    return shapes


def _svg_shapes_regex(svg: str) -> list[str]:
    """Fallback when the SVG cannot be parsed as XML (e.g. raw specials broke it)."""
    body = re.sub(r"<defs\b.*?</defs>", "", svg, flags=re.S)
    shapes = []
    for m in re.finditer(r"<(path|rect|circle|ellipse|line|polygon|polyline|use)\b", body):
        shapes.append("rule" if m.group(1) == "rect" else "glyph")
    return shapes


def make_glyphs(dvi: bytes | None, svg: str) -> tuple[list[dict[str, Any]], list[str]]:
    """One glyph entry per SVG shape, labelled from the DVI; plus warnings.

    The DVI sequence of characters/rules maps 1:1 onto the SVG shapes when dvisvgm drew every
    one of them. If the counts or the kinds disagree (virtual fonts, PostScript specials,
    missing glyphs ...) every character gets the label "?" and a warning is added; rules stay
    "—" because a ``<rect>`` is always a rule. The list length always equals the shape count.
    """
    shapes = svg_shapes(svg)
    warnings: list[str] = []
    items: list[DviItem] | None = None
    if dvi is not None:
        try:
            items = parse_dvi(dvi)
        except DviError as exc:
            warnings.append(f"Glyph labels unavailable: {exc}.")
    if items is not None and (
        len(items) != len(shapes) or any((i.kind == "rule") != (s == "rule") for i, s in zip(items, shapes))
    ):
        warnings.append(
            f"Could not align glyph labels: the DVI has {len(items)} characters/rules but the SVG "
            f"has {len(shapes)} shapes."
        )
        items = None

    glyphs: list[dict[str, Any]] = []
    unknown_fonts: dict[str, int] = {}
    for index, shape in enumerate(shapes):
        if shape == "rule":
            glyphs.append({"label": "\u2014", "kind": "rule", "font": None, "code": None})
        elif items is None:
            glyphs.append({"label": "?", "kind": "char", "font": None, "code": None})
        else:
            item = items[index]
            label = glyph_label(item.font, item.code)
            if label == "?":
                key = item.font or "(none)"
                unknown_fonts[key] = unknown_fonts.get(key, 0) + 1
            glyphs.append({"label": label, "kind": "char", "font": item.font, "code": item.code})
    for font, count in unknown_fonts.items():
        warnings.append(f"No label for {count} glyph(s) of font {font}.")
    return glyphs, warnings


# ---------------------------------------------------------------------------------------------
# 5. LaTeX errors
# ---------------------------------------------------------------------------------------------


def _compact(text: str) -> tuple[str, list[int]]:
    """``text`` without whitespace, plus for every kept character its index in ``text``."""
    chars: list[str] = []
    index: list[int] = []
    for i, ch in enumerate(text):
        if not ch.isspace():
            chars.append(ch)
            index.append(i)
    return "".join(chars), index


_CONTEXT_ARGUMENT_RE = re.compile(r"^<argument>\s?(?:\.\.\.)?(.*)$")


def locate_error_line(lines: list[str], start: int, doc: TexDocument, user_latex: str) -> int | None:
    """1-based line in the user's LaTeX where the error ``lines[start]`` happened, or None.

    1. If the log's ``l.<n>`` points into the user's text, that is the line.
    2. Otherwise, the usual case: the formula sits in the ``align*`` body, which LaTeX reads as one
       macro argument, so every error is reported at ``\\end{align*}``. The "show context" lines
       still print the text read so far (``<argument> ...text before the error``). That text is
       searched for in the formula (ignoring whitespace; TeX prints newlines as spaces) and the line
       of its end is used. The longest such context is the best one; the first match wins because
       LaTeX halts at the first error.
    """
    n_user_lines = user_latex.count("\n") + 1

    def user_line_of(offset: int) -> int | None:
        doc_line = doc.text.count("\n", 0, offset) + 1
        line = doc_line - doc.first_line + 1 + doc.lead_newlines
        return line if 1 <= line <= n_user_lines else None

    l_index = None
    for j in range(start + 1, len(lines)):
        m = re.match(r"^l\.(\d+)\b", lines[j])
        if m:
            l_index = j
            doc_line = int(m.group(1))
            line = doc_line - doc.first_line + 1 + doc.lead_newlines
            if 1 <= line <= n_user_lines:
                return line
            break

    region, region_index = _compact(doc.text[doc.expr_start : doc.expr_end])
    best = ""
    for j in range(start + 1, l_index if l_index is not None else min(start + 40, len(lines))):
        m = _CONTEXT_ARGUMENT_RE.match(lines[j])
        if m:
            tail, _ = _compact(m.group(1))
            if len(tail) > len(best):
                best = tail
    if len(best) < 3:
        return None
    at = region.find(best)
    if at < 0:
        return None
    end_in_region = region_index[at + len(best) - 1] + 1
    return user_line_of(doc.expr_start + end_in_region - 1)


def parse_latex_log(log: str, doc: TexDocument, user_latex: str) -> dict[str, Any]:
    """First ``! ...`` message of a LaTeX log, its line in the user's LaTeX, and a log excerpt."""
    lines = log.splitlines()
    start = next((i for i, line in enumerate(lines) if line.startswith("!")), None)
    if start is None:
        return {"message": "LaTeX failed.", "line": None, "log": "\n".join(lines[-30:])[-2000:]}
    message = lines[start][1:].strip() or "LaTeX error."
    end = min(start + 12, len(lines))
    for j in range(start + 1, len(lines)):
        if re.match(r"^l\.\d+\b", lines[j]):
            end = min(j + 3, len(lines))  # the l.<n> line, its continuation and the first help line
            break
    begin = start - 2 if start >= 2 and lines[start - 2].startswith("Runaway") else start
    return {
        "message": message,
        "line": locate_error_line(lines, start, doc, user_latex),
        "log": "\n".join(lines[begin:end])[:2000],
    }


def error_response(message: str, line: int | None = None, log: str = "") -> dict[str, Any]:
    return {"ok": False, "error": {"message": message, "line": line, "log": log}}


# ---------------------------------------------------------------------------------------------
# 6. The engine
# ---------------------------------------------------------------------------------------------


class RequestError(Exception):
    """A malformed /tex request: ``status`` is the HTTP status to answer with."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class TexRequest(NamedTuple):
    latex: str
    packages: list[str]
    preamble: str
    target: str
    mode: str = "math"  # MODES: a formula (MathTex / Tex) or text (Tex / TexText)


def validate_request(obj: Any) -> TexRequest:
    """Check a decoded /tex JSON body; raises RequestError (400 / 413)."""
    if not isinstance(obj, dict):
        raise RequestError(400, "Request body must be a JSON object.")
    target = obj.get("target")
    if target not in TARGETS:
        raise RequestError(400, "Unknown target: expected \"ce\" or \"gl\".")
    mode = obj.get("mode", "math")
    if mode is None:
        mode = "math"
    if mode not in MODES:
        raise RequestError(400, "Unknown mode: expected \"math\" or \"text\".")
    latex = obj.get("latex")
    if not isinstance(latex, str):
        raise RequestError(400, "\"latex\" must be a string.")
    preamble = obj.get("preamble", "")
    if preamble is None:
        preamble = ""
    if not isinstance(preamble, str):
        raise RequestError(400, "\"preamble\" must be a string.")
    packages = obj.get("packages", [])
    if packages is None:
        packages = []
    if not isinstance(packages, list) or len(packages) > MAX_PACKAGES:
        raise RequestError(400, f"\"packages\" must be a list of at most {MAX_PACKAGES} names.")
    for name in packages:
        if not isinstance(name, str) or len(name) > MAX_PACKAGE_NAME or not PACKAGE_RE.match(name):
            raise RequestError(400, "Invalid package name: only letters, digits, '-' and '_' are allowed.")
    if len(latex.encode("utf-8")) > MAX_LATEX_BYTES:
        raise RequestError(413, f"\"latex\" is larger than {MAX_LATEX_BYTES} bytes.")
    if len(preamble.encode("utf-8")) > MAX_PREAMBLE_BYTES:
        raise RequestError(413, f"\"preamble\" is larger than {MAX_PREAMBLE_BYTES} bytes.")
    return TexRequest(latex, list(packages), preamble, target, mode)


class _RunResult(NamedTuple):
    returncode: int
    stdout: bytes
    stderr: bytes


class _Timeout(Exception):
    pass


class _SvgOutputError(Exception):
    pass


def _read_svg_output(path: str) -> str:
    """Read only a bounded SVG artifact; converter stdout can contain Ghostscript diagnostics."""
    try:
        with open(path, "rb") as fh:
            data = fh.read(MAX_SVG_BYTES + 1)
    except OSError as exc:
        raise _SvgOutputError("dvisvgm did not produce a readable SVG file.") from exc
    if len(data) > MAX_SVG_BYTES:
        raise _SvgOutputError("The SVG produced is too large.")
    try:
        svg = data.decode("utf-8")
        if "<!ENTITY" in svg or "<!DOCTYPE" in svg:
            raise ValueError("Unexpected XML document declaration")
        root = ET.fromstring(svg)
        if root.tag.rsplit("}", 1)[-1] != "svg":
            raise ValueError("The output root is not SVG")
    except (UnicodeDecodeError, ET.ParseError, ValueError) as exc:
        raise _SvgOutputError("dvisvgm produced an invalid SVG file.") from exc
    return svg


def _run(cmd: list[str], cwd: str, env: dict[str, str], timeout: float, started: Any = None) -> _RunResult:
    """Run a command with a hard timeout (the whole process group is killed on expiry).
    ``started`` is told the process as soon as it runs, for a caller that may have to end it."""
    if timeout <= 0:
        raise _Timeout()
    proc = _spawn(
        cmd,
        cwd=cwd,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if started is not None:
        started(proc)
    try:
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        _kill(proc)
        proc.communicate()
        raise _Timeout() from None
    return _RunResult(proc.returncode, out, err)


def _own_group(windows: bool = os.name == "nt") -> dict[str, Any]:
    """The ``Popen`` arguments that start a child in a process group of its own, so that it can be
    ended with everything it started, and so that what is typed at the companion's terminal
    (Ctrl+C) reaches the companion alone, which then ends its children itself."""
    if windows:
        return {"creationflags": getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)}
    return {"start_new_session": True}


# Windows' flag of a process created suspended, and the limit of a Job Object that ends what it
# holds when its last handle is closed (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE).
_CREATE_SUSPENDED = 0x00000004
_KILL_ON_JOB_CLOSE = 0x00002000


def _spawn(cmd: list[str], windows: bool = os.name == "nt", api: Any = None, popen: Any = subprocess.Popen,
           **options: Any) -> subprocess.Popen:
    """Start ``cmd`` with ``subprocess.Popen`` and ``options``, in a process group of its own
    (``_own_group``). Every process the companion starts is started here, but the ``taskkill`` that
    ends one with no job.

    On Windows the child is also put in a Job Object of its own, which takes every process it
    starts, and theirs: ``_kill`` ends the job, the whole tree at once, where ``taskkill /T``
    looks for the tree by the parents' ids and finds nothing under a child that has died (a
    virtualenv's ``python.exe`` is a launcher with the real interpreter under it). The child is
    created suspended and resumed once it is in the job, so that nothing it starts is left out.
    The job's handle belongs to the ``Popen`` object and is closed when that object goes: Windows
    then ends whatever the child left running, as it does when the companion itself ends, however
    it ends. A job that cannot be made or joined is no failure: the child runs in its group alone,
    as before there were jobs, and ``taskkill`` ends it. A child that cannot be resumed is ended,
    and its start fails as one that Windows refused (``OSError``)."""
    group = _own_group(windows)
    if not windows:
        return popen(cmd, **options, **group)
    api = _JobObjectAPI.get() if api is None else api
    job = api.create(_KILL_ON_JOB_CLOSE) if api is not None else 0
    if not job:
        return popen(cmd, **options, **group)
    try:
        proc = popen(cmd, **options, creationflags=group["creationflags"] | _CREATE_SUSPENDED)
    except BaseException:
        api.close(job)
        raise
    close = weakref.finalize(proc, api.close, job)
    close.atexit = False  # at the companion's exit Windows closes it, and ends what is left
    process = int(proc._handle)  # Popen keeps the handle of the process, and closes its thread's
    try:
        if api.assign(job, process):
            proc._mfe_job = _JobObject(api, job)
        else:
            close()
        resumed = api.resume(process, proc.pid)
    except BaseException:  # cut short (Ctrl+C in `health` or `compile`): it must not stay suspended
        proc.kill()
        close()
        raise
    if not resumed:
        proc.kill()
        close()
        for stream in (proc.stdin, proc.stdout, proc.stderr):
            try:
                if stream is not None:
                    stream.close()
            except (OSError, ValueError):
                pass
        try:
            proc.wait(5)
        except subprocess.TimeoutExpired:
            pass
        raise OSError("Windows did not let the new process run: it could not be resumed.")
    return proc


def _kill(proc: subprocess.Popen) -> None:
    """End a child and everything it started: its process group; on Windows its Job Object
    (``_kill_job_windows``), or the tree ``taskkill`` finds when it has none."""
    try:
        if os.name == "posix":
            os.killpg(proc.pid, signal.SIGKILL)
        elif getattr(proc, "_mfe_job", None) is not None:
            _kill_job_windows(proc)
        else:
            _kill_tree_windows(proc)
    except (ProcessLookupError, PermissionError, OSError):
        pass


def _has_to_end(proc: Any) -> bool:
    """Whether ``_kill`` has anything to end for ``proc``: a child that still runs, and on Windows
    also one that has gone, since its Job Object may hold what it started (a virtualenv's launcher
    that died with the interpreter under it alive, the job's folder held by it). Elsewhere a child
    that has gone is left alone: its id names its group, and may be another process's by now."""
    return proc.poll() is None or getattr(proc, "_mfe_job", None) is not None


def _kill_job_windows(proc: Any) -> None:
    """End the Job Object of a child (``_spawn``): the child and every process started under it,
    those whose parent has died with the others. Windows ends them at once, and a process lets go
    of its files and of its current folder a moment later: the child is waited for, as the time
    ``taskkill`` took let it be. ``Popen.kill`` alone would read its status of exit and wait no
    more, and the job's folder could not be removed yet."""
    try:
        job = proc._mfe_job
        if job.api.terminate(job.handle):
            proc.wait(5)
    except subprocess.TimeoutExpired:
        pass
    finally:
        proc.kill()  # whatever the job did, the child itself does not outlive this call


def _kill_tree_windows(proc: Any, run: Any = subprocess.run, environ: Any = None) -> None:
    """Windows has no group to signal, and ``proc.kill()`` ends one process: what it started
    lives on. A virtualenv's ``python.exe`` is a launcher with the real interpreter under it, and
    Manim's ``latex``, ``dvisvgm`` and ``ffmpeg`` run under that one; left alive they hold the
    pipes the companion reads and the files of the job's folder. ``taskkill /T`` ends the tree,
    for a child that could not be put in a Job Object (``_spawn``): it finds the tree by the
    parents' ids, and finds nothing under a child that has died."""
    environ = os.environ if environ is None else environ
    taskkill = ntpath.join(environ.get("SYSTEMROOT", "C:\\Windows"), "System32", "taskkill.exe")
    try:
        run([taskkill, "/F", "/T", "/PID", str(proc.pid)], stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
    except (OSError, subprocess.SubprocessError):
        pass
    finally:
        proc.kill()  # whatever taskkill did, the child itself does not outlive this call


class _JobObject(NamedTuple):
    """The Job Object of a child, as its ``Popen`` object keeps it (``_spawn``): the calls of
    Windows, and the job's handle, open for as long as that object is."""
    api: Any
    handle: int


class _JobObjectAPI:
    """The calls of Windows behind ``_spawn`` and ``_kill``: a Job Object, and the resume of a
    process created suspended. One object, made at the first child and on Windows alone (``get``):
    those functions take it as a parameter, and a test gives them another, on any system."""

    _made: list[Any] = []  # the one instance, once ``get`` has made it; None if it could not
    _making = threading.Lock()

    @classmethod
    def get(cls) -> "_JobObjectAPI | None":
        """The one instance; None where it cannot be made (a Python without ``ctypes``): children
        then start and end as they did before there were jobs."""
        with cls._making:
            if not cls._made:
                try:
                    cls._made.append(cls())
                except (ImportError, OSError, AttributeError):
                    cls._made.append(None)
            return cls._made[0]

    def __init__(self) -> None:
        import ctypes
        from ctypes import wintypes as w
        self._c = ctypes
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)  # its own: no other code's argtypes
        handle, dword, ok = w.HANDLE, w.DWORD, w.BOOL  # a HANDLE is as wide as a pointer

        def bind(library: Any, name: str, result: Any, *args: Any) -> Any:
            fn = getattr(library, name)
            fn.restype, fn.argtypes = result, args
            return fn

        self._create = bind(kernel32, "CreateJobObjectW", handle, ctypes.c_void_p, w.LPCWSTR)
        self._set = bind(kernel32, "SetInformationJobObject", ok, handle, ctypes.c_int, ctypes.c_void_p, dword)
        self._assign = bind(kernel32, "AssignProcessToJobObject", ok, handle, handle)
        self._terminate = bind(kernel32, "TerminateJobObject", ok, handle, w.UINT)
        self._close = bind(kernel32, "CloseHandle", ok, handle)
        self._snapshot = bind(kernel32, "CreateToolhelp32Snapshot", handle, dword, dword)
        self._first = bind(kernel32, "Thread32First", ok, handle, ctypes.c_void_p)
        self._next = bind(kernel32, "Thread32Next", ok, handle, ctypes.c_void_p)
        self._open_thread = bind(kernel32, "OpenThread", handle, dword, ok, dword)
        self._resume_thread = bind(kernel32, "ResumeThread", dword, handle)
        try:
            self._nt_resume = bind(ctypes.WinDLL("ntdll"), "NtResumeProcess", ctypes.c_long, handle)
        except (OSError, AttributeError):  # Windows does not document it: it may be gone one day
            self._nt_resume = None
        self._invalid = ctypes.c_void_p(-1).value  # INVALID_HANDLE_VALUE, as a HANDLE comes back

        class Basic(ctypes.Structure):  # JOBOBJECT_BASIC_LIMIT_INFORMATION
            _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                        ("LimitFlags", dword), ("MinimumWorkingSetSize", ctypes.c_size_t),
                        ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", dword),
                        ("Affinity", ctypes.c_size_t), ("PriorityClass", dword), ("SchedulingClass", dword)]

        class Extended(ctypes.Structure):  # JOBOBJECT_EXTENDED_LIMIT_INFORMATION
            _fields_ = [("BasicLimitInformation", Basic), ("IoInfo", ctypes.c_uint64 * 6),
                        ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                        ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]

        class ThreadEntry(ctypes.Structure):  # THREADENTRY32
            _fields_ = [("dwSize", dword), ("cntUsage", dword), ("th32ThreadID", dword),
                        ("th32OwnerProcessID", dword), ("tpBasePri", w.LONG), ("tpDeltaPri", w.LONG),
                        ("dwFlags", dword)]

        self._Extended, self._ThreadEntry = Extended, ThreadEntry

    def create(self, limits: int) -> int:
        """A new Job Object with ``limits`` (LimitFlags); 0 when none could be made."""
        job = self._create(None, None)
        if not job:
            return 0
        info = self._Extended()
        info.BasicLimitInformation.LimitFlags = limits
        # 9: JobObjectExtendedLimitInformation, which the limit of the job's close needs
        if not self._set(job, 9, self._c.byref(info), self._c.sizeof(info)):
            self._close(job)
            return 0
        return job

    def assign(self, job: int, process: int) -> bool:
        return bool(self._assign(job, process))

    def resume(self, process: int, pid: int) -> bool:
        """Let a process created suspended run. ``NtResumeProcess`` does it in one call; Windows
        does not document it, and psutil has relied on it for years. Without it, or should it
        fail, each thread of the process is resumed, found in a snapshot of every thread of the
        system: documented, and tens of milliseconds longer, where a compile starts two children."""
        if self._nt_resume is not None and self._nt_resume(process) >= 0:  # NT_SUCCESS
            return True
        return self._resume_threads(pid)

    def _resume_threads(self, pid: int) -> bool:
        snapshot = self._snapshot(0x00000004, 0)  # TH32CS_SNAPTHREAD
        if not snapshot or snapshot == self._invalid:
            return False
        resumed = False
        try:
            entry = self._ThreadEntry()
            entry.dwSize = self._c.sizeof(entry)
            more = self._first(snapshot, self._c.byref(entry))
            while more:
                if entry.th32OwnerProcessID == pid:
                    thread = self._open_thread(0x0002, False, entry.th32ThreadID)  # THREAD_SUSPEND_RESUME
                    if thread:
                        resumed = self._resume_thread(thread) != 0xFFFFFFFF or resumed
                        self._close(thread)
                more = self._next(snapshot, self._c.byref(entry))
        finally:
            self._close(snapshot)
        return resumed

    def terminate(self, job: int) -> bool:
        return bool(self._terminate(job, 1))

    def close(self, handle: int) -> None:
        self._close(handle)


def _plain_file_size(path: str) -> int:
    """The size of ``path`` when it is a plain file with one name; -1 for anything else: a missing
    file, a symbolic link (it is not followed), another name of a file that exists elsewhere, a
    directory, a pipe. What a process wrote for the companion to serve must be nothing but that."""
    try:
        found = os.lstat(path)
    except OSError:
        return -1
    return found.st_size if stat.S_ISREG(found.st_mode) and found.st_nlink == 1 else -1


def _open_unfollowed(path: str) -> int:
    """Open ``path`` for reading, as the file it is: a link put in its place is not followed.
    Raises ``OSError`` for one, as for a file that is not there.

    Where the system refuses a link at the open itself (``O_NOFOLLOW``), it does. Windows has no
    such flag: there the path is looked at first, and a link, or any other reparse point, is
    refused. The moment between that look and the open is not closed there, and need not be: the
    flag matters where a sandbox keeps the code that wrote the file from the user's other files,
    and Windows has none."""
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0)
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    if not nofollow:
        seen = os.lstat(path)
        reparse = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
        if not stat.S_ISREG(seen.st_mode) or getattr(seen, "st_file_attributes", 0) & reparse:
            raise OSError(f"not a plain file: {path}")
    return os.open(path, flags | nofollow)


def _first_line(text: str) -> str:
    return text.strip().splitlines()[0].strip() if text.strip() else ""


def _version_tuple(text: str) -> tuple[int, ...] | None:
    m = re.search(r"(\d+(?:\.\d+)+)", text)
    return tuple(int(p) for p in m.group(1).split(".")) if m else None


class _LRU:
    """A tiny thread-safe LRU map."""

    def __init__(self, size: int):
        self._size = size
        self._data: collections.OrderedDict[str, dict[str, Any]] = collections.OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> dict[str, Any] | None:
        with self._lock:
            value = self._data.get(key)
            if value is not None:
                self._data.move_to_end(key)
            return value

    def put(self, key: str, value: dict[str, Any]) -> None:
        with self._lock:
            self._data[key] = value
            self._data.move_to_end(key)
            while len(self._data) > self._size:
                self._data.popitem(last=False)


def default_cache_dir() -> str:
    base = os.environ.get("XDG_CACHE_HOME") or os.path.join(os.path.expanduser("~"), ".cache")
    return os.path.join(base, "mfe-companion")


class _Sandbox:
    """Optional confinement of ``latex`` and ``dvisvgm`` with bubblewrap (``bwrap``), Linux only.

    Why: TeX Live 2026 turned ``openin_any`` into a no-op, so ``\\input{/etc/passwd}`` or
    ``\\openin`` can read any file the user can read, whatever ``openin_any=p`` says (only
    ``openout_any=p`` still restricts writing). The sandbox mounts the whole file system read-only,
    replaces the directories that normally hold private data (``/home``, ``/root``, ``/tmp``, ...)
    by empty ones, hides other processes and the network, and leaves only the compile's working
    directory writable. TeX trees that live below a hidden directory (e.g. ``~/texmf``) are mounted
    back read-only. It is used automatically when ``bwrap`` is installed and a smoke compile
    works inside it; otherwise the companion runs unconfined (see ``status``).
    """

    # directories replaced by an empty tmpfs inside the sandbox
    HIDDEN = ("/home", "/root", "/mnt", "/media", "/srv", "/run", "/tmp", "/var/tmp", "/var/home")

    def __init__(self, enabled: bool = True):
        linux = sys.platform.startswith("linux")
        self._enabled = enabled and linux and not os.environ.get("MFE_NO_SANDBOX")
        self._lock = threading.Lock()
        self._base: list[str] | None = None  # bwrap arguments up to the per-compile mounts
        self._hidden: list[str] = []  # directories replaced by an empty tmpfs
        self._probed = False
        # Why there is none, as `serve` prints it: turned off by its user, or not of this system.
        self.reason = "" if self._enabled else ("disabled" if linux else "bubblewrap is Linux's")

    def status(self) -> str:
        return "bubblewrap" if self._probe() else f"none ({self.reason})"

    def active(self) -> bool:
        return self._probe() is not None

    def wrap(self, cmd: list[str], workdir: str, readable: tuple[str, ...] | list[str] = (),
             gpu: bool = False, hide: tuple[str, ...] | list[str] = (),
             files: tuple[str, ...] | list[str] = ()) -> list[str]:
        """``cmd`` prefixed with the bwrap invocation, or unchanged when no sandbox is available.

        ``readable`` lists extra directories (a Python virtualenv, a Manim checkout) that must stay
        visible read-only although they live below a hidden directory such as ``/home``. ``gpu``
        also exposes ``/dev/dri`` (hardware OpenGL / Vulkan; without it Mesa renders in software).
        ``hide`` lists more directories to empty (the directory of all the jobs, wherever the
        system keeps temporary files: a job sees its own, bound back as ``workdir`` or through
        ``readable``, and no other). ``files`` lists single files to keep visible read-only below
        a hidden directory (a program: the file alone, not what is next to it).
        """
        base = self._probe()
        if not base:
            return cmd
        extra: list[str] = []
        hidden = list(self._hidden)
        for path in hide:
            real = os.path.realpath(path)
            if os.path.isdir(real) and not any(real == h or real.startswith(h + "/") for h in hidden):
                hidden.append(real)
                extra += ["--tmpfs", real]
        kept: list[str] = []
        for path in readable:
            real = os.path.realpath(path)
            if (os.path.isdir(real) and real not in kept
                    and any(real == h or real.startswith(h + "/") for h in hidden)
                    and not any(real.startswith(k + "/") for k in kept)):
                kept.append(real)
                extra += ["--ro-bind", real, real]
        for path in files:
            real = os.path.realpath(path)
            if (os.path.isfile(real) and any(real.startswith(h + "/") for h in hidden)
                    and not any(real.startswith(k + "/") for k in kept)):
                extra += ["--ro-bind", real, real]
        if gpu and os.path.isdir("/dev/dri"):
            extra += ["--dev-bind", "/dev/dri", "/dev/dri"]
        return [*base, *extra, "--bind", workdir, workdir, "--chdir", workdir, "--", *cmd]

    # ----- internals --------------------------------------------------------------------------

    def _probe(self) -> list[str] | None:
        with self._lock:
            if self._probed:
                return self._base
            self._probed = True
            if not self._enabled:
                return None
            bwrap = shutil.which("bwrap")
            if not bwrap:
                self.reason = "bwrap not installed"
                return None
            base = [bwrap, "--unshare-all", "--die-with-parent", "--new-session", "--ro-bind", "/", "/",
                    "--dev", "/dev", "--proc", "/proc"]
            hidden = []
            for root in self.HIDDEN:
                real = os.path.realpath(root)
                if os.path.isdir(real) and real not in hidden:
                    hidden.append(real)
                    base += ["--tmpfs", real]
            self._hidden = hidden
            for keep in self._tex_trees_below(hidden):
                base += ["--ro-bind", keep, keep]
            if self._smoke_test(base):
                self._base = base
            else:
                self.reason = "bwrap is unusable here (smoke compile failed)"
            return self._base

    @staticmethod
    def _tex_trees_below(hidden: list[str]) -> list[str]:
        """TeX Live trees located inside a hidden directory: they must stay visible."""
        kpsewhich = shutil.which("kpsewhich")
        if not kpsewhich:
            return []
        keep: list[str] = []
        for var in ("SELFAUTOPARENT", "TEXMFDIST", "TEXMFLOCAL", "TEXMFSYSVAR", "TEXMFSYSCONFIG", "TEXMFHOME",
                    "TEXMFVAR", "TEXMFCONFIG"):
            try:
                r = _run([kpsewhich, f"-var-value={var}"], cwd=tempfile.gettempdir(), env=dict(os.environ), timeout=10)
            except (_Timeout, OSError):
                continue
            for part in re.split(r"[:;,{}]", r.stdout.decode("utf-8", "replace").strip()):
                path = os.path.realpath(part.strip().lstrip("!").rstrip("/")) if part.strip() else ""
                if path and os.path.isdir(path) and any(path == h or path.startswith(h + "/") for h in hidden):
                    if path not in keep:
                        keep.append(path)
        return keep

    @staticmethod
    def _smoke_test(base: list[str]) -> bool:
        """Compile a tiny document inside the sandbox: proves TeX and dvisvgm still work in it."""
        latex, dvisvgm = shutil.which("latex"), shutil.which("dvisvgm")
        if not latex or not dvisvgm:
            return False
        workdir = tempfile.mkdtemp(prefix="mfe-sandbox-")
        try:
            doc = "\\documentclass[preview]{standalone}\n" + _CE_PREAMBLE + "\n\\begin{document}\n$x$\n\\end{document}\n"
            with open(os.path.join(workdir, "doc.tex"), "w", encoding="utf-8") as fh:
                fh.write(doc)
            prefix = [*base, "--bind", workdir, workdir, "--chdir", workdir, "--"]
            env = dict(os.environ, openin_any="p", openout_any="p")
            r = _run([*prefix, latex, "-interaction=batchmode", "-halt-on-error", "-no-shell-escape", "doc.tex"],
                     cwd=workdir, env=env, timeout=30)
            if r.returncode != 0 or not os.path.exists(os.path.join(workdir, "doc.dvi")):
                return False
            svg_path = os.path.join(workdir, "doc.svg")
            try:
                os.unlink(svg_path)
            except FileNotFoundError:
                pass
            s = _run([*prefix, dvisvgm, "--no-fonts", "--verbosity=0", "--output=doc.svg", "doc.dvi"],
                     cwd=workdir, env=dict(os.environ), timeout=30)
            return s.returncode == 0 and "<use" in _read_svg_output(svg_path)
        except (_Timeout, OSError, _SvgOutputError):
            return False
        finally:
            shutil.rmtree(workdir, ignore_errors=True)


class Companion:
    """Tool detection, caches and the compile pipeline. One instance serves all requests."""

    def __init__(
        self,
        ce_python: str | None = None,
        gl_python: str | None = None,
        disk_cache: bool = True,
        cache_dir: str | None = None,
        sandbox: bool = True,
        allow_manim_render: bool = False,
        manim_timeout_s: float = MANIM_TIMEOUT_S,
        sandbox_gpu: bool = False,
        disk_cache_max_files: int = DISK_CACHE_MAX_FILES,
        max_video_bytes: int = MAX_OUTPUT_BYTES,
    ):
        self.sandbox = _Sandbox(sandbox)
        self.allow_manim_render = allow_manim_render
        self.manim_timeout_s = manim_timeout_s
        self.sandbox_gpu = sandbox_gpu  # expose /dev/dri to sandboxed Manim (hardware rendering)
        self.jobs = JobManager(max_video_bytes)
        self.ce_python = ce_python or os.environ.get("MFE_CE_PYTHON") or None
        self.gl_python = gl_python or os.environ.get("MFE_GL_PYTHON") or None
        self.cache_dir = (cache_dir or default_cache_dir()) if disk_cache else None
        self.disk_cache_max_files = max(1, disk_cache_max_files)
        self._disk_lock = threading.Lock()  # guards the write counter below
        self._disk_writes = 0  # results written to disk since the last prune
        self._memory = _LRU(MEMORY_CACHE_ENTRIES)
        self._slots = threading.BoundedSemaphore(MAX_CONCURRENT_COMPILES)
        self._key_locks: weakref.WeakValueDictionary[str, threading.Lock] = weakref.WeakValueDictionary()
        self._key_locks_guard = threading.Lock()
        self._versions: tuple[str, str] | None = None
        self._versions_lock = threading.Lock()
        self._audio_encoders: tuple[str, frozenset[str]] | None = None  # (ffmpeg path, its encoders)
        self._manim: dict[str, dict[str, str] | None] = {"ce": None, "gl": None}
        self._manim_paths: dict[str, list[str]] = {"ce": [], "gl": []}  # what the sandbox must keep readable
        self._probe_threads: list[threading.Thread] = []
        self._probes: list[subprocess.Popen] = []  # the interpreters being asked for their Manim
        self._probes_lock = threading.Lock()
        self._closing = False  # `shutdown` has begun: a probe that starts now is ended at once
        # library -> the digests of the font files its text worker met (`font_hashes`)
        self._font_hashes: dict[str, dict[str, list[Any]]] | None = None
        self._font_hashes_lock = threading.Lock()
        self.pango = _PangoService(self)
        if self.cache_dir:
            self._prepare_disk_cache()

    # ----- tools ------------------------------------------------------------------------------

    @staticmethod
    def _tool(name: str) -> str | None:
        return shutil.which(name)

    def tool_versions(self) -> tuple[str, str]:
        """First lines of ``latex --version`` and ``dvisvgm --version`` (probed once)."""
        with self._versions_lock:
            if self._versions is None:
                self._versions = (self._probe_version("latex"), self._probe_version("dvisvgm"))
            return self._versions

    def _probe_version(self, tool: str) -> str:
        path = self._tool(tool)
        if not path:
            return ""
        try:
            r = _run([path, "--version"], cwd=tempfile.gettempdir(), env=dict(os.environ), timeout=10)
            return _first_line(r.stdout.decode("utf-8", "replace"))
        except (_Timeout, OSError):
            return ""

    def _dvisvgm_ok(self) -> bool:
        """dvisvgm >= 2.4 is required for Manim's SVG conversion."""
        if not self._tool("dvisvgm"):
            return False
        version = _version_tuple(self.tool_versions()[1])
        return version is None or version >= (2, 4)

    def video_audio_formats(self) -> list[str]:
        """The video formats whose file can carry a soundtrack: the ones whose audio encoder the
        installed ffmpeg has (asked once per ffmpeg found)."""
        ffmpeg = self._tool("ffmpeg")
        if not ffmpeg:
            return []
        with self._versions_lock:
            if self._audio_encoders is None or self._audio_encoders[0] != ffmpeg:
                self._audio_encoders = (ffmpeg, self._probe_audio_encoders(ffmpeg))
            found = self._audio_encoders[1]
        return [fmt for fmt, (encoder, _, _) in AUDIO_ENCODERS.items() if encoder in found]

    @staticmethod
    def _probe_audio_encoders(ffmpeg: str) -> frozenset[str]:
        """Names of the audio encoders in ``ffmpeg -encoders`` (lines like `` A....D aac  AAC``)."""
        try:
            r = _run([ffmpeg, "-hide_banner", "-encoders"], cwd=tempfile.gettempdir(), env=dict(os.environ),
                     timeout=10)
        except (_Timeout, OSError):
            return frozenset()
        names = set()
        for line in r.stdout.decode("utf-8", "replace").splitlines():
            m = re.match(r"\s*A[A-Z.]{5}\s+(\S+)", line)
            if m:
                names.add(m.group(1))
        return frozenset(names)

    # ----- Manim interpreters (probed in the background) ---------------------------------------

    def start_probes(self) -> None:
        """Probe the configured Manim interpreters once, in background threads."""
        # Prints the directories the interpreter reads from (the sandbox keeps them visible), then the
        # version on the last line.
        paths = ("import sys, os, json, importlib.util as u; "
                 "spec = u.find_spec({name!r}); "
                 "root = os.path.dirname(os.path.dirname(spec.origin)) if spec and spec.origin else ''; "
                 "print('MFE-PATHS ' + json.dumps([sys.prefix, sys.base_prefix, root, *sys.path])); ")
        probes = {
            "ce": (self.ce_python, paths.format(name="manim") + "import manim; print(manim.__version__)"),
            "gl": (self.gl_python, paths.format(name="manimlib")
                   + "import importlib.metadata as m; print(m.version('manimgl'))"),
        }
        for key, (python, code) in probes.items():
            if not python:
                continue
            thread = threading.Thread(target=self._probe_manim, args=(key, python, code), daemon=True)
            thread.start()
            self._probe_threads.append(thread)

    def wait_for_probes(self, timeout: float = 90.0) -> None:
        deadline = time.monotonic() + timeout
        for thread in self._probe_threads:
            thread.join(max(0.0, deadline - time.monotonic()))

    def _probe_manim(self, key: str, python: str, code: str) -> None:
        found = shutil.which(python) or (python if os.path.isfile(python) else None)
        if not found:
            return
        resolved = os.path.abspath(found)  # the probe runs in another directory
        try:
            # a throw-away working directory: ManimCE creates a media/ folder in its cwd
            with tempfile.TemporaryDirectory(prefix="mfe-probe-") as cwd:
                r = _run([resolved, "-c", code], cwd=cwd, env=dict(os.environ), timeout=60,
                         started=self._probe_started)
        except (_Timeout, OSError):
            return
        lines = r.stdout.decode("utf-8", "replace").strip().splitlines()
        version = lines[-1].strip() if lines else ""
        if r.returncode == 0 and re.fullmatch(r"[0-9A-Za-z.+_-]+", version):
            self._manim_paths[key] = [os.path.dirname(resolved)]
            for line in lines[:-1]:
                if line.startswith("MFE-PATHS "):
                    try:
                        listed = json.loads(line[len("MFE-PATHS "):])
                        self._manim_paths[key] += [p for p in listed if isinstance(p, str) and p]
                    except ValueError:
                        pass
            # Nothing of text starts here: its worker for this library starts with the first
            # GET /fonts or POST /text that names it (`_PangoService`).
            self._manim[key] = {"python": resolved, "version": version}

    def manim_interpreter(self, target: str) -> dict[str, Any] | None:
        """{python, version, paths} of the probed Manim interpreter for ``target``, or None."""
        found = self._manim.get(target)
        return None if found is None else {**found, "paths": self._manim_paths[target]}

    def _probe_started(self, proc: subprocess.Popen) -> None:
        with self._probes_lock:
            self._probes.append(proc)
            closing = self._closing
        if closing:
            _kill(proc)

    def shutdown(self) -> None:
        """End what the companion started: its jobs and its text workers, with their temporary
        files, then the probes of the interpreters that still run."""
        # The jobs first: a render, or a soundtrack of hundreds of megabytes, is what must not be
        # left if a second Ctrl+C cuts this short.
        self.jobs.shutdown()
        self.pango.shutdown()
        # A companion stopped in its first seconds is still asking an interpreter for its Manim,
        # which takes that long to import. Left alone the interpreter lived on, in the probe's
        # folder: on Windows, where the current folder of a process cannot be removed, the folder
        # stayed in TEMP and its removal raised at the exit. It ends here, and its probe with it.
        with self._probes_lock:
            self._closing = True
            probes = list(self._probes)
        for proc in probes:
            if _has_to_end(proc):
                _kill(proc)
        for thread in self._probe_threads:
            thread.join(5)

    # ----- health -----------------------------------------------------------------------------

    def health(self) -> dict[str, Any]:
        return {
            "name": NAME,
            "version": VERSION,
            "protocol": PROTOCOL,
            "capabilities": {
                "latex": self._tool("latex") is not None,
                "dvisvgm": self._dvisvgm_ok(),
                "ffmpeg": self._tool("ffmpeg") is not None,
                # the /video formats that can take a soundtrack (1.5): mp4 also means Render with Manim
                "videoAudio": self.video_audio_formats(),
                "manimCE": self._manim["ce"],
                "manimGL": self._manim["gl"],
                # true while the interpreters are still being probed (manimCE/GL may still change)
                "manimProbing": any(t.is_alive() for t in self._probe_threads),
                "manimRender": self.allow_manim_render,
                # whether "Render with Manim" runs inside the bubblewrap sandbox (meaningless when
                # manimRender is false)
                "manimSandbox": self.sandbox.active() if self.allow_manim_render else False,
                # POST /tex takes "mode": "text" (companion 1.3); older companions typeset math only
                "textMode": True,
                # font text, by library (1.6): null without its interpreter, else its state, with
                # the font environment once the worker is ready
                "pango": self.pango.capabilities(),
            },
            # the largest video a /video job writes (1.7): `serve --max-video-gib`
            "limits": {"videoBytes": self.jobs.max_video_bytes},
        }

    # ----- digests of the font files (kept for the text workers) ---------------------------------

    def _load_font_hashes(self) -> dict[str, dict[str, list[Any]]]:
        """Called with the lock: the tables kept so far, read from the cache directory once."""
        if self._font_hashes is None:
            self._font_hashes = {}
            if self.cache_dir:
                kept = _read_json_file(os.path.join(self.cache_dir, FONT_HASHES_FILE), MAX_FONT_HASHES_BYTES * 2)
                if isinstance(kept, dict):
                    self._font_hashes = {target: table for target in TARGETS
                                         if (table := _font_hash_table(kept.get(target)))}
        return self._font_hashes

    def font_hashes(self, target: str) -> dict[str, list[Any]]:
        """The digests of the font files ``target``'s text worker hashed so far: path -> [size,
        mtime_ns, inode, ctime_ns, sha256]. A worker hashes every font of the machine to name its
        environment; with these it reads only the files that are new or changed. Kept across runs
        in the cache directory, when there is one. Each library has its own table: what one
        worker reports is never handed to the other."""
        with self._font_hashes_lock:
            return dict(self._load_font_hashes().get(target, {}))

    def remember_font_hashes(self, target: str, table: dict[str, list[Any]]) -> None:
        """Take the table ``target``'s worker used for the fonts it found: it replaces the one
        kept for that library (a font that went away leaves it)."""
        with self._font_hashes_lock:
            tables = self._load_font_hashes()
            if not table or table == tables.get(target):
                return
            tables[target] = dict(table)
            if not self.cache_dir:
                return
            path = os.path.join(self.cache_dir, FONT_HASHES_FILE)
            tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
            try:
                with open(tmp, "w", encoding="utf-8") as fh:
                    json.dump(tables, fh, ensure_ascii=False, separators=(",", ":"))
                os.replace(tmp, path)
            except (OSError, ValueError):
                try:
                    os.unlink(tmp)
                except OSError:
                    pass

    # ----- caches -----------------------------------------------------------------------------

    def _prepare_disk_cache(self) -> None:
        try:
            os.makedirs(self.cache_dir, mode=0o700, exist_ok=True)
            self._prune_disk_cache()
        except OSError:
            self.cache_dir = None  # unusable: run without a disk cache

    def _prune_disk_cache(self) -> None:
        """Keep the directory within ``disk_cache_max_files``: past the limit, the oldest entries
        go until three quarters of it are left, so that the next prune is a quarter of the limit
        away. Run at start-up and, by ``_cache_put``, every quarter-limit of results written.
        Raises OSError when the directory cannot be listed."""
        files = [e for e in os.scandir(self.cache_dir) if e.name.endswith(".json")]
        limit = self.disk_cache_max_files
        if len(files) <= limit:
            return
        files.sort(key=lambda e: e.stat().st_mtime)
        keep = limit - limit // 4
        for entry in files[: len(files) - keep]:
            try:
                os.unlink(entry.path)
            except OSError:
                pass

    def _cache_key(self, target: str, doc: TexDocument) -> str:
        latex_v, dvisvgm_v = self.tool_versions()
        h = hashlib.sha256()
        for part in (str(CACHE_SCHEMA), target, doc.text, latex_v, dvisvgm_v):
            h.update(part.encode("utf-8"))
            h.update(b"\0")
        return h.hexdigest()

    def _cache_get(self, key: str) -> dict[str, Any] | None:
        value = self._memory.get(key)
        if value is not None:
            return value
        if self.cache_dir:
            path = os.path.join(self.cache_dir, key + ".json")
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    value = json.load(fh)
                if isinstance(value, dict) and "svg" in value and "glyphs" in value:
                    self._memory.put(key, value)
                    return value
            except (OSError, ValueError):
                pass
        return None

    def _cache_put(self, key: str, value: dict[str, Any]) -> None:
        self._memory.put(key, value)
        if self.cache_dir:
            path = os.path.join(self.cache_dir, key + ".json")
            tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
            try:
                with open(tmp, "w", encoding="utf-8") as fh:
                    json.dump(value, fh, ensure_ascii=False)
                os.replace(tmp, path)
            except OSError:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
                return
            # Amortised pruning: one directory scan per quarter-limit of writes (one thread at a
            # time gets to do it; the others carry on writing meanwhile).
            with self._disk_lock:
                self._disk_writes += 1
                due = self._disk_writes >= max(1, self.disk_cache_max_files // 4)
                if due:
                    self._disk_writes = 0
            if due:
                try:
                    self._prune_disk_cache()
                except OSError:
                    pass

    def _key_lock(self, key: str) -> threading.Lock:
        with self._key_locks_guard:
            lock = self._key_locks.get(key)
            if lock is None:
                lock = threading.Lock()
                self._key_locks[key] = lock
            return lock

    # ----- /tex -------------------------------------------------------------------------------

    def compile(self, req: TexRequest) -> dict[str, Any]:
        """Compile one formula; returns the /tex JSON object (success or LaTeX error)."""
        try:
            doc = build_document(req.target, req.latex, req.packages, req.preamble, req.mode)
        except TexBuildError as exc:
            return error_response(str(exc))
        key = self._cache_key(req.target, doc)
        hit = self._cache_get(key)
        if hit is not None:
            return self._success(hit, cached=True, ms=0)
        # one compile per distinct document at a time: concurrent duplicates wait, then hit the cache
        with self._key_lock(key):
            hit = self._cache_get(key)
            if hit is not None:
                return self._success(hit, cached=True, ms=0)
            with self._slots:
                started = time.monotonic()
                result = self._compile_uncached(doc, req)
                ms = max(1, int((time.monotonic() - started) * 1000))
            if not result.get("ok"):
                return result
            entry = {"svg": result["svg"], "glyphs": result["glyphs"], "warnings": result["warnings"]}
            self._cache_put(key, entry)
            return self._success(entry, cached=False, ms=ms)

    @staticmethod
    def _success(entry: dict[str, Any], cached: bool, ms: int) -> dict[str, Any]:
        return {
            "ok": True,
            "svg": entry["svg"],
            "glyphs": entry["glyphs"],
            "cached": cached,
            "ms": ms,
            "warnings": list(entry["warnings"]),
        }

    def _compile_uncached(self, doc: TexDocument, req: TexRequest) -> dict[str, Any]:
        latex_bin, dvisvgm_bin = self._tool("latex"), self._tool("dvisvgm")
        if not latex_bin:
            return error_response("latex was not found on PATH; install TeX Live.")
        if not dvisvgm_bin or not self._dvisvgm_ok():
            return error_response("dvisvgm (version 2.4 or newer) was not found on PATH.")
        deadline = time.monotonic() + COMPILE_TIMEOUT_S
        workdir = tempfile.mkdtemp(prefix="mfe-tex-")
        try:
            with open(os.path.join(workdir, "doc.tex"), "w", encoding="utf-8", newline="\n") as fh:
                fh.write(doc.text)
            # paranoid file access for TeX: no reading/writing outside the working directory
            latex_env = dict(os.environ, openin_any="p", openout_any="p")
            try:
                r = _run(
                    self.sandbox.wrap(
                        [latex_bin, "-interaction=batchmode", "-halt-on-error", "-no-shell-escape", "doc.tex"],
                        workdir,
                    ),
                    cwd=workdir, env=latex_env, timeout=deadline - time.monotonic(),
                )
            except _Timeout:
                return error_response(f"LaTeX timed out after {int(COMPILE_TIMEOUT_S)} s.")
            dvi_path = os.path.join(workdir, "doc.dvi")
            if r.returncode != 0 or not os.path.exists(dvi_path):
                return self._latex_failure(workdir, doc, req, r)
            svg_path = os.path.join(workdir, "doc.svg")
            try:
                # TeX can write files in its workdir; only this converter run may supply the SVG.
                try:
                    os.unlink(svg_path)
                except FileNotFoundError:
                    pass
                s = _run(
                    self.sandbox.wrap(
                        [dvisvgm_bin, "--no-fonts", "--verbosity=0", "--output=doc.svg", "doc.dvi"], workdir
                    ),
                    cwd=workdir, env=dict(os.environ), timeout=deadline - time.monotonic(),
                )
            except _Timeout:
                return error_response(f"dvisvgm timed out (limit {int(COMPILE_TIMEOUT_S)} s for the whole compile).")
            except OSError as exc:
                return error_response(f"dvisvgm could not create the SVG file: {exc}")
            if s.returncode != 0:
                detail = s.stderr.decode("utf-8", "replace").strip()
                return error_response("dvisvgm failed to convert the DVI file." + (f" {detail}" if detail else ""),
                                      None, detail[:2000])
            try:
                svg = _read_svg_output(svg_path)
            except _SvgOutputError as exc:
                return error_response(str(exc))
            try:
                with open(dvi_path, "rb") as fh:
                    dvi = fh.read()
            except OSError:
                dvi = None
            try:
                glyphs, warnings = make_glyphs(dvi, svg)
            except Exception as exc:  # labels are a bonus: never fail the compile because of them
                glyphs = [
                    {"label": "\u2014", "kind": "rule", "font": None, "code": None} if kind == "rule"
                    else {"label": "?", "kind": "char", "font": None, "code": None}
                    for kind in svg_shapes(svg)
                ]
                warnings = [f"Glyph labels unavailable: {exc}."]
            return {"ok": True, "svg": svg, "glyphs": glyphs, "warnings": warnings}
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    @staticmethod
    def _latex_failure(workdir: str, doc: TexDocument, req: TexRequest, r: _RunResult) -> dict[str, Any]:
        log_path = os.path.join(workdir, "doc.log")
        try:
            with open(log_path, "r", encoding="utf-8", errors="replace") as fh:
                log = fh.read()
        except OSError:
            log = ""
        if not log:
            detail = (r.stdout + r.stderr).decode("utf-8", "replace").strip()
            return error_response("LaTeX failed.", None, detail[-2000:])
        err = parse_latex_log(log, doc, req.latex)
        return error_response(err["message"], err["line"], err["log"])


# ---------------------------------------------------------------------------------------------
# 6b. Jobs: video encoding (ffmpeg) and rendering with Manim
# ---------------------------------------------------------------------------------------------


class JobError(Exception):
    """A job request that cannot be honoured: ``status`` is the HTTP status to answer with."""

    def __init__(self, status: int, message: str, log: str = ""):
        super().__init__(message)
        self.status = status
        self.message = message
        self.log = log


class VideoSpec(NamedTuple):
    format: str
    quality: str
    width: int
    height: int
    fps: int
    frames: int
    audio: bool = False


class ManimSpec(NamedTuple):
    target: str
    code: str
    scene: str
    quality: str
    width: int | None
    height: int | None
    fps: int | None
    frames: int | None
    audio: bool = False


def _int_field(obj: dict, name: str, low: int, high: int, required: bool = True) -> int | None:
    value = obj.get(name)
    if value is None:
        if required:
            raise JobError(400, f"\"{name}\" is required.")
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise JobError(400, f"\"{name}\" must be a whole number.")
    if not low <= value <= high:
        raise JobError(400, f"\"{name}\" must be between {low} and {high}.")
    return value


def audio_frames(frames: int, fps: int) -> int:
    """Sample frames of the soundtrack of a video of ``frames`` frames: ``frames / fps`` seconds at
    48 kHz, rounded to the nearest (a half never happens: fps is at most 240 and 96000 = 2^8 x 375)."""
    return (2 * frames * AUDIO_RATE + fps) // (2 * fps)


def _audio_field(obj: dict, frames: int | None, fps: int | None) -> bool:
    """The "audio" field of a job request: whether a soundtrack will be sent."""
    audio = obj.get("audio", False)
    if not isinstance(audio, bool):
        raise JobError(400, "\"audio\" must be true or false.")
    if audio and frames is not None and fps is not None and frames > MAX_AUDIO_SECONDS * fps:
        raise JobError(400, f"A video with sound can last at most {MAX_AUDIO_SECONDS // 60} minutes.")
    return audio


def validate_video_request(obj: Any) -> VideoSpec:
    """Check a decoded ``POST /video`` body; raises JobError (400)."""
    if not isinstance(obj, dict):
        raise JobError(400, "Request body must be a JSON object.")
    fmt = obj.get("format")
    if fmt not in VIDEO_FORMATS:
        raise JobError(400, "Unknown format: expected one of " + ", ".join(f"\"{f}\"" for f in VIDEO_FORMATS) + ".")
    quality = obj.get("quality", "medium")
    if quality not in QUALITIES:
        raise JobError(400, "Unknown quality: expected \"low\", \"medium\" or \"high\".")
    width = _int_field(obj, "width", MIN_VIDEO_SIDE, MAX_VIDEO_SIDE)
    height = _int_field(obj, "height", MIN_VIDEO_SIDE, MAX_VIDEO_SIDE)
    fps = _int_field(obj, "fps", 1, MAX_VIDEO_FPS)
    frames = _int_field(obj, "frames", 1, MAX_VIDEO_FRAMES)
    assert width is not None and height is not None and fps is not None and frames is not None
    if width * height > MAX_VIDEO_PIXELS:
        raise JobError(400, f"The frame is larger than {MAX_VIDEO_PIXELS} pixels.")
    if fmt != "gif" and (width % 2 or height % 2):
        raise JobError(400, "Width and height must be even for this format.")
    if fmt == "gif":
        if fps > MAX_GIF_FPS:
            raise JobError(400, f"GIF supports at most {MAX_GIF_FPS} frames per second.")
        if width > MAX_GIF_SIDE or height > MAX_GIF_SIDE:
            raise JobError(400, f"A GIF can be at most {MAX_GIF_SIDE} pixels wide or tall.")
        if frames * width * height * 3 > MAX_GIF_RAW_BYTES:
            raise JobError(400, "This GIF is too large to build in memory (frames x width x height x 3 must be "
                                "at most 2 GiB). Use fewer frames or a smaller size, or pick another format.")
    audio = _audio_field(obj, frames, fps)
    if audio and fmt not in AUDIO_ENCODERS:
        raise JobError(400, f"A {fmt.upper()} has no sound.")
    return VideoSpec(fmt, quality, width, height, fps, frames, audio)


def validate_manim_request(obj: Any) -> ManimSpec:
    """Check a decoded ``POST /manim-render`` body; raises JobError (400 / 413)."""
    if not isinstance(obj, dict):
        raise JobError(400, "Request body must be a JSON object.")
    target = obj.get("target")
    if target not in TARGETS:
        raise JobError(400, "Unknown target: expected \"ce\" or \"gl\".")
    code = obj.get("code")
    if not isinstance(code, str) or not code.strip():
        raise JobError(400, "\"code\" must be a non-empty string.")
    if "\0" in code:
        raise JobError(400, "\"code\" must not contain NUL characters.")
    if len(code.encode("utf-8")) > MAX_CODE_BYTES:
        raise JobError(413, f"\"code\" is larger than {MAX_CODE_BYTES} bytes.")
    scene = obj.get("scene")
    if not isinstance(scene, str) or not SCENE_RE.fullmatch(scene):
        raise JobError(400, "\"scene\" must be a Python class name (letters, digits and '_').")
    quality = obj.get("quality", "low")
    if quality not in QUALITIES:
        raise JobError(400, "Unknown quality: expected \"low\", \"medium\" or \"high\".")
    width = _int_field(obj, "width", MIN_VIDEO_SIDE, MAX_VIDEO_SIDE, required=False)
    height = _int_field(obj, "height", MIN_VIDEO_SIDE, MAX_VIDEO_SIDE, required=False)
    fps = _int_field(obj, "fps", 1, MAX_VIDEO_FPS, required=False)
    if (width is None) != (height is None) or (width is None and fps is not None) or (
            width is not None and fps is None):
        raise JobError(400, "\"width\", \"height\" and \"fps\" must be given together (or none of them).")
    if width is not None and height is not None and width * height > MAX_VIDEO_PIXELS:
        raise JobError(400, f"The frame is larger than {MAX_VIDEO_PIXELS} pixels.")
    frames = _int_field(obj, "frames", 1, MAX_VIDEO_FRAMES, required=False)
    audio = _audio_field(obj, frames, fps)
    if audio and (frames is None or fps is None):
        raise JobError(400, "\"audio\" needs \"width\", \"height\", \"fps\" and \"frames\": the soundtrack "
                            "lasts frames / fps.")
    return ManimSpec(target, code, scene, quality, width, height, fps, frames, audio)


# ----- PNG stream ---------------------------------------------------------------------------

_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class PngStreamError(ValueError):
    pass


class PngStream:
    """Incremental checker for a byte stream of concatenated PNG files.

    It never keeps more than an 8-byte chunk header or the 17-byte IHDR chunk, so a frame is
    never buffered. It counts complete files (up to ``IEND``) and checks the signature, the chunk
    layout, that ``IHDR`` comes first with the expected size, and a per-file size cap. (CRCs and
    pixel data are ffmpeg's business.)
    """

    def __init__(self, width: int, height: int, max_frame_bytes: int = MAX_FRAME_BYTES):
        self.width = width
        self.height = height
        self.max_frame_bytes = max_frame_bytes
        self.frames = 0
        self._phase = "signature"  # signature | head | ihdr (collected) | body (skipped)
        self._buf = bytearray()
        self._need = len(_PNG_SIGNATURE)
        self._first_chunk = True
        self._remaining = 0  # bytes left in a skipped chunk (data + CRC)
        self._type = b""
        self._frame_bytes = 0

    @property
    def at_boundary(self) -> bool:
        """True between two files (nothing of a next file has been seen)."""
        return self._phase == "signature" and not self._buf

    def feed(self, data: bytes) -> None:
        pos, end = 0, len(data)
        while pos < end:
            if self._phase == "body":
                take = min(self._remaining, end - pos)
                self._count(take)
                self._remaining -= take
                pos += take
                if self._remaining == 0:
                    self._chunk_done()
                continue
            take = min(self._need - len(self._buf), end - pos)
            self._buf += data[pos:pos + take]
            self._count(take)
            pos += take
            if len(self._buf) < self._need:
                continue
            block = bytes(self._buf)
            self._buf.clear()
            if self._phase == "signature":
                if block != _PNG_SIGNATURE:
                    raise PngStreamError("The data is not a sequence of PNG images.")
                self._phase, self._need, self._first_chunk, self._frame_bytes = "head", 8, True, len(block)
            elif self._phase == "head":
                length = int.from_bytes(block[:4], "big")
                self._type = block[4:8]
                if length > 0x7FFFFFFF or not re.fullmatch(rb"[A-Za-z]{4}", self._type):
                    raise PngStreamError("Corrupt PNG chunk header.")
                if self._first_chunk and (self._type != b"IHDR" or length != 13):
                    raise PngStreamError("A PNG image must start with an IHDR chunk.")
                if self._type == b"IHDR":
                    self._phase, self._need = "ihdr", length + 4
                else:
                    self._phase, self._remaining = "body", length + 4
            else:  # ihdr
                size = (int.from_bytes(block[0:4], "big"), int.from_bytes(block[4:8], "big"))
                if size != (self.width, self.height):
                    raise PngStreamError(
                        f"A frame is {size[0]}x{size[1]} but the job expects {self.width}x{self.height}.")
                self._chunk_done()

    def _count(self, n: int) -> None:
        self._frame_bytes += n
        if self._frame_bytes > self.max_frame_bytes:
            raise PngStreamError(f"A frame is larger than {self.max_frame_bytes} bytes.")

    def _chunk_done(self) -> None:
        self._first_chunk = False
        if self._type == b"IEND":
            self.frames += 1
            self._phase, self._need = "signature", len(_PNG_SIGNATURE)
        else:
            self._phase, self._need = "head", 8


# ----- command lines -------------------------------------------------------------------------

_X264_CRF = {"low": "28", "medium": "23", "high": "18"}
_VP9_CRF = {"low": "40", "medium": "32", "high": "24"}


def build_ffmpeg_command(ffmpeg: str, spec: VideoSpec, out_path: str,
                         max_bytes: int = MAX_OUTPUT_BYTES) -> list[str]:
    """The ffmpeg invocation for a job. Only validated enums and integers are interpolated.
    ``max_bytes`` is the job's limit: ffmpeg's own stop is set past it (OUTPUT_STOP_MARGIN_BYTES)."""
    fps = str(spec.fps)
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-nostats", "-progress", "pipe:1", "-y",
           "-f", "image2pipe", "-c:v", "png", "-framerate", fps, "-i", "pipe:0",
           "-frames:v", str(spec.frames), "-r", fps]
    # RGB frames -> BT.709 limited-range YUV, tagged as such (players assume BT.709 for HD)
    yuv = "scale=out_color_matrix=bt709:out_range=tv"
    tags = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
    if spec.format == "mp4":
        cmd += ["-vf", yuv, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "fast",
                "-crf", _X264_CRF[spec.quality], *tags, "-movflags", "+faststart", "-f", "mp4"]
    elif spec.format == "webm":
        cmd += ["-vf", yuv, "-pix_fmt", "yuv420p", "-c:v", "libvpx-vp9", "-b:v", "0",
                "-crf", _VP9_CRF[spec.quality], "-deadline", "good", "-cpu-used", "4", "-row-mt", "1",
                *tags, "-f", "webm"]
    elif spec.format == "mov":
        cmd += ["-vf", yuv, "-pix_fmt", "yuv422p10le", "-c:v", "prores_ks", "-profile:v", "3",
                "-vendor", "apl0", *tags, "-f", "mov"]
    else:  # gif
        cmd += ["-vf", "split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5",
                "-loop", "0", "-f", "gif"]
    cmd += ["-fs", str(max_bytes + OUTPUT_STOP_MARGIN_BYTES), out_path]
    return cmd


def wav_header(frames: int) -> bytes:
    """The 44 bytes that start the soundtrack of ``frames`` sample frames: the canonical header of
    a 16-bit PCM, stereo, 48 kHz WAV file."""
    data = frames * AUDIO_FRAME_BYTES
    return (b"RIFF" + (data + 36).to_bytes(4, "little") + b"WAVEfmt "
            + (16).to_bytes(4, "little") + (1).to_bytes(2, "little") + (2).to_bytes(2, "little")
            + AUDIO_RATE.to_bytes(4, "little") + (AUDIO_RATE * AUDIO_FRAME_BYTES).to_bytes(4, "little")
            + AUDIO_FRAME_BYTES.to_bytes(2, "little") + (16).to_bytes(2, "little")
            + b"data" + data.to_bytes(4, "little"))


def wav_header_problem(head: bytes, frames: int) -> str | None:
    """Why ``head`` cannot start the soundtrack of ``frames`` sample frames, or None when it is
    exactly the header ``wav_header`` writes. Nothing else is accepted: what reaches ffmpeg is a
    header the companion could have written itself, followed by samples."""
    expected = wav_header(frames)
    if head == expected:
        return None
    if len(head) != WAV_HEADER_BYTES or head[:4] != b"RIFF" or head[8:16] != b"WAVEfmt ":
        return "The soundtrack is not a WAV file."
    if head[16:36] != expected[16:36] or head[36:40] != b"data":
        return "The soundtrack must be 16-bit PCM, stereo, 48000 Hz, with a 44-byte header."
    announced = int.from_bytes(head[40:44], "little")
    if announced != frames * AUDIO_FRAME_BYTES:
        return (f"The soundtrack must last what the video lasts: {frames} sample frames "
                f"({frames * AUDIO_FRAME_BYTES} bytes of samples); the header announces {announced} bytes.")
    return "The sizes in the WAV header do not agree."


def build_mux_command(ffmpeg: str, fmt: str, video_path: str, audio_path: str, out_path: str) -> list[str]:
    """The second pass of a job with sound: the video stream is copied as it is and the soundtrack
    encoded next to it. Both inputs are read with a fixed demuxer (ffmpeg does not guess what they
    are), and only the job's own paths and a format's fixed options are interpolated."""
    encoder, bitrate, _ = AUDIO_ENCODERS[fmt]
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-nostats", "-nostdin", "-y",
           "-f", "matroska" if fmt == "webm" else "mov", "-i", video_path,
           "-f", "wav", "-i", audio_path,
           "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", encoder, "-b:a", bitrate]
    if fmt == "mp4":
        cmd += ["-movflags", "+faststart"]
    return [*cmd, "-f", fmt, out_path]


_MANIM_QUALITY_CE = {"low": "-ql", "medium": "-qm", "high": "-qh"}
_MANIM_QUALITY_GL = {"low": "-l", "medium": "-m", "high": "--hd"}
MANIM_OUTPUT_NAME = "result"


def build_manim_command(python: str, spec: ManimSpec) -> list[str]:
    """The Manim invocation for a job, run with the job directory as working directory."""
    if spec.target == "ce":
        # --silent: once the video is written ManimCE asks PyPI whether a newer release exists, and
        # ends only with the answer. The sandbox has no network and the question fails at once;
        # without one (macOS, Windows) it went out at every render, and the job waited for it.
        cmd = [python, "-m", "manim", "render", "-v", "WARNING", "--silent"]
        if spec.width is not None:
            cmd += ["-r", f"{spec.width},{spec.height}", "--fps", str(spec.fps)]
        else:
            cmd.append(_MANIM_QUALITY_CE[spec.quality])
        return [*cmd, "--media_dir", "media", "-o", MANIM_OUTPUT_NAME, "--disable_caching", "scene.py", spec.scene]
    cmd = [python, "-m", "manimlib", "scene.py", spec.scene, "-w"]
    if spec.width is not None:
        cmd += ["-r", f"{spec.width}x{spec.height}", "--fps", str(spec.fps)]
    else:
        cmd.append(_MANIM_QUALITY_GL[spec.quality])
    return [*cmd, "--video_dir", "out", "--file_name", MANIM_OUTPUT_NAME]


# Progress lines written to stderr by tqdm:
#   CE  "Animation 3: Write(MathTex('x')):  40%|████      | 12/30 [00:00<00:01, 25.3it/s]"
#       "Waiting 4: 100%|██████████| 15/15 [...]"
#   GL  "result.mp4 3 WriteTex                     : : 12it [00:00, 25.3it/s]"
_CE_PROGRESS_RE = re.compile(r"^(?:Animation|Waiting)\s+(\d+)\s*:.*?(\d+)/(\d+)\s*\[")
_GL_PROGRESS_RE = re.compile(r"^\S+\.\w+\s+(\d+)\s+.*?:\s*:\s*(\d+)it\b")


def parse_manim_progress(line: str) -> tuple[int, int] | None:
    """(animation index, frames rendered so far in it) when ``line`` is a Manim progress line."""
    m = _CE_PROGRESS_RE.match(line)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = _GL_PROGRESS_RE.match(line)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None


# ----- jobs ----------------------------------------------------------------------------------

_TERMINAL = ("done", "failed", "cancelled")


class _Tail:
    """The last ``limit`` lines of a stream (the end of a log), thread-safe."""

    def __init__(self, limit: int = 120, line_chars: int = 1000):
        self._lines: collections.deque[str] = collections.deque(maxlen=limit)
        self._line_chars = line_chars
        self._lock = threading.Lock()

    def add(self, line: str) -> None:
        line = line.rstrip()
        if line:
            with self._lock:
                self._lines.append(line[: self._line_chars])

    def text(self, max_chars: int = 6000) -> str:
        with self._lock:
            text = "\n".join(self._lines)
        return text[-max_chars:]

    def last(self) -> str:
        with self._lock:
            return self._lines[-1] if self._lines else ""


def _pump_lines(stream: Any, handle: Any) -> None:
    """Call ``handle(line)`` for every line (``\\n`` or ``\\r`` terminated) read from a pipe."""
    buf = b""
    try:
        while True:
            chunk = stream.read1(4096) if hasattr(stream, "read1") else stream.read(4096)
            if not chunk:
                break
            buf += chunk
            parts = re.split(rb"[\r\n]+", buf)
            buf = parts.pop()
            for part in parts:
                handle(part.decode("utf-8", "replace").strip())
            if len(buf) > 65536:  # a "line" without terminator: keep memory bounded
                buf = buf[-4096:]
        if buf.strip():
            handle(buf.decode("utf-8", "replace").strip())
    except (OSError, ValueError):
        pass


class _Soundtrack:
    """The soundtrack of a job while it arrives and until ffmpeg has used it: one WAV file of a
    length known beforehand, in a directory of its own. The second pass writes its result there
    too, so neither is ever inside the directory where a Manim job runs the code it was sent."""

    def __init__(self, root: str, frames: int):
        self.frames = frames
        self.total = WAV_HEADER_BYTES + frames * AUDIO_FRAME_BYTES  # bytes of the whole file
        self.received = 0
        self.feeding = False
        self.dir = tempfile.mkdtemp(prefix="sound-", dir=root)
        self.path = os.path.join(self.dir, "audio.wav")

    @property
    def complete(self) -> bool:
        return self.received == self.total


class _Job:
    """State shared by all jobs: a private directory, a lifecycle and a process."""

    kind = ""

    def __init__(self, manager: "JobManager"):
        self.manager = manager
        self.id = secrets.token_hex(16)
        self.dir = tempfile.mkdtemp(prefix=f"{self.kind}-", dir=manager.root())
        self.audio: _Soundtrack | None = None  # set by a job created with "audio"
        self.feeding = False  # a frames request is being read (video jobs)
        self.lock = threading.RLock()
        self.state = "receiving"
        self.error: dict[str, str] | None = None
        self.proc: subprocess.Popen | None = None
        self.result_path: str | None = None
        self.result_mime = "application/octet-stream"
        self.result_name = "result"
        self.started = time.monotonic()
        self.touched = self.started  # the last request about the job: a finished one is kept from here
        self.fed = self.started  # the last data (frames, sound): a job that waits for more is idle from here
        self.finished: float | None = None
        self.freed = False  # failed, and its files already removed (the reaper does it)
        self.discarded = False  # its files were removed, but for one a request held open (`_released`)
        self.log = _Tail()
        self.max_bytes = manager.max_video_bytes  # the limit of its video, as the job found it
        self._looked = 0.0  # when the room was last looked at (`_room_problem`)

    # ----- lifecycle --------------------------------------------------------------------------

    def touch(self) -> None:
        self.touched = time.monotonic()

    def got_data(self) -> None:
        """Frames or a piece of the soundtrack arrived. Asking about a job is not sending to it:
        only this keeps a job that waits for data from being given up on."""
        self.fed = self.touched = time.monotonic()

    @property
    def is_terminal(self) -> bool:
        return self.state in _TERMINAL

    def _finish(self, state: str, error: dict[str, str] | None = None) -> bool:
        """Enter a terminal state once; returns False when the job was already finished."""
        with self.lock:
            if self.is_terminal:
                return False
            self.state = state
            self.error = error
            self.finished = time.monotonic()
            return True

    def _fail(self, message: str, log: str = "") -> None:
        if self._finish("failed", {"message": message, "log": log}):
            self._kill_process()

    def _room_problem(self, path: str | None = None, cap: int = 0, too_large: str = "",
                      every: float = 0.0) -> str | None:
        """Why the job may not go on writing, or None: the file a pass writes (``path``) is past
        ``cap``, which ``too_large`` says, or the disk of the temporary folder is nearly full. With
        ``every``, nothing is looked at (and None is the answer) until that many seconds have passed
        since the last look: what is asked once per piece of data need not be asked that often."""
        if every:
            now = time.monotonic()
            if now - self._looked < every:
                return None
            self._looked = now
        if path is not None:
            try:
                written = os.lstat(path).st_size
            except OSError:
                written = 0
            if written > cap:
                return too_large
        return self.manager.room_problem()

    def _kill_process(self) -> None:
        proc = self.proc
        if proc is None:
            return
        if _has_to_end(proc):
            _kill(proc)
            try:
                proc.wait(5)  # reap it
            except subprocess.TimeoutExpired:
                pass
        try:
            if proc.stdin is not None:
                proc.stdin.close()
        except (OSError, ValueError):
            pass

    def cancel(self) -> None:
        """Stop the job (idempotent). The temporary files are removed by ``cleanup``."""
        self._finish("cancelled")
        self._kill_process()

    def _close_pipes(self) -> None:
        """Close the pipes of a process that has exited (their reader threads have seen EOF)."""
        proc = self.proc
        if proc is None or proc.poll() is None:
            return
        for thread in getattr(self, "_threads", []):
            if thread.ident is not None:  # started (joining one that was not is an error)
                thread.join(2)
        for stream in (proc.stdin, proc.stdout, proc.stderr):
            try:
                if stream is not None:
                    stream.close()
            except (OSError, ValueError):
                pass

    def _discard(self) -> None:
        """Remove the job's files."""
        self.discarded = True
        shutil.rmtree(self.dir, ignore_errors=True)
        if self.audio is not None:
            shutil.rmtree(self.audio.dir, ignore_errors=True)

    def _released(self) -> None:
        """A request has closed a file of the job: the soundtrack it was writing, the result it was
        sending. Windows removes no file that is open: when the job's files were removed
        meanwhile (it was deleted, or it failed), that one stayed with its folder, a soundtrack of
        up to 691 MB, until the companion ended. It goes now. Elsewhere an open file is removed
        like any other, and there is nothing left to remove here."""
        if self.discarded:
            self._discard()

    def cleanup(self) -> None:
        try:
            self.cancel()
            self._close_pipes()
        finally:  # whatever happened to the process and its pipes, the files go
            self._discard()

    # ----- soundtrack --------------------------------------------------------------------------

    def begin_audio(self, offset: int, length: int) -> None:
        """Claim the job for one audio request of ``length`` bytes (``feed_audio`` must follow).
        ``offset`` is the position of the body in the WAV file and must equal the bytes received
        so far. Nothing is read or written here: a refused request leaves the job as it was."""
        with self.lock:
            if self.is_terminal:
                raise JobError(410, f"The job is {self.state}.")
            audio = self.audio
            if audio is None:
                raise JobError(409, "The job was created without \"audio\".")
            if self.state != "receiving":
                raise JobError(409, "The job is not receiving its soundtrack.")
            if audio.feeding:
                raise JobError(409, "Another request is already sending audio to this job.")
            if offset != audio.received:
                raise JobError(409, f"Out-of-order audio: expected offset {audio.received}, got {offset}.")
            if offset + length > audio.total:
                raise JobError(400, f"The soundtrack of this job is {audio.total} bytes long: "
                                    "the request goes past its end.")
            if offset == 0 and length < WAV_HEADER_BYTES:
                raise JobError(400, f"The first audio request must hold the whole WAV header "
                                    f"({WAV_HEADER_BYTES} bytes).")
            audio.feeding = True
        self.got_data()

    def feed_audio(self, rfile: Any, length: int) -> None:
        """Append ``length`` bytes from ``rfile`` to the soundtrack. The header (the start of the
        first request) is checked before anything is written; the rest is samples, stored as they
        come. A body that ends early or stalls keeps what arrived: the next request continues there.
        A disk that is nearly full stops the job before the piece in hand is written, as it stops
        the frames of a video job (``VideoJob.feed``)."""
        audio = self.audio
        assert audio is not None

        def read(count: int, whole: bool = False) -> bytes:
            """Up to ``count`` bytes of the body, as they come (``whole``: all of them, or the end)."""
            try:
                return rfile.read(count) if whole else rfile.read1(count)
            except TimeoutError:  # the client stalled for longer than a request may (`_Handler.timeout`)
                raise JobError(408, "The request body stopped arriving.") from None

        def storage(exc: OSError) -> JobError:
            if self.is_terminal:  # deleted meanwhile: its directory is gone
                return JobError(410, f"The job is {self.state}.")
            self._fail(f"Cannot store the soundtrack: {exc}")
            return JobError(500, f"Cannot store the soundtrack: {exc}")

        def need_room(unread: int) -> None:
            """Fail the job when the disk is nearly full, ``unread`` bytes of the body still to come."""
            problem = self._room_problem(every=ROOM_CHECK_S)
            if problem:
                self._fail(problem)
                _swallow(rfile, unread)  # the reason is in the answer: the client must get to read it
                raise JobError(507, problem)

        try:
            remaining = length
            chunk = b""
            if audio.received == 0:
                chunk = read(WAV_HEADER_BYTES, whole=True)
                if len(chunk) < WAV_HEADER_BYTES:
                    raise JobError(400, "Incomplete request body.")
                problem = wav_header_problem(chunk, audio.frames)
                if problem:
                    remaining -= len(chunk)
                    while remaining > 0:  # swallow the rest (one request at most): the client reads the answer
                        skipped = read(min(FEED_CHUNK, remaining))
                        if not skipped:
                            break
                        remaining -= len(skipped)
                    raise JobError(400, problem)
            # `remaining` counts what is not written yet: the piece in hand is read already.
            need_room(remaining - len(chunk))
            try:
                fh = open(audio.path, "ab", buffering=0)  # unbuffered: what is counted is on disk
            except OSError as exc:
                raise storage(exc) from None
            with fh:
                while True:
                    view = memoryview(chunk)
                    while view:
                        try:
                            written = fh.write(view)
                        except OSError as exc:
                            raise storage(exc) from None
                        view = view[written:]
                        remaining -= written
                        with self.lock:
                            audio.received += written
                    self.got_data()
                    if self.is_terminal:
                        raise JobError(410, f"The job is {self.state}.")
                    if remaining <= 0:
                        break
                    chunk = read(min(FEED_CHUNK, remaining))
                    if not chunk:
                        raise JobError(400, "Incomplete request body.")
                    need_room(remaining - len(chunk))
        finally:
            with self.lock:
                audio.feeding = False
            self._released()
        if audio.complete:
            self._audio_complete()

    def _audio_complete(self) -> None:
        """The whole soundtrack has arrived."""

    def _add_sound(self, ffmpeg: str, video_path: str, fmt: str, timeout: float = MUX_TIMEOUT_S,
                   sandbox: "_Sandbox | None" = None) -> str | None:
        """The second pass: ffmpeg writes a copy of ``video_path`` with the soundtrack, next to the
        soundtrack. Returns the new file, or None when the job ended meanwhile or the pass failed
        (the job is then failed). The inputs are deleted once the new file exists.

        With ``sandbox`` (a Manim job: the video was written by the code the job ran), ffmpeg runs
        confined like that code was: the job directory read-only, the soundtrack's directory as the
        only writable place, no other job's files, no network."""
        audio = self.audio
        assert audio is not None
        out_path = os.path.join(audio.dir, f"out.{VIDEO_FORMATS[fmt][0]}")
        if sandbox is not None and sandbox.active():
            # the program itself: a link to it may live where the sandbox shows nothing
            ffmpeg = os.path.realpath(ffmpeg)
        cmd = build_mux_command(ffmpeg, fmt, video_path, audio.path, out_path)
        if sandbox is not None:
            cmd = sandbox.wrap(cmd, audio.dir, readable=[self.dir], hide=[self.manager.root()], files=[ffmpeg])
        with self.lock:  # a cancel either finds the job finished here, or finds this process
            if self.is_terminal:
                return None
            try:
                proc = _spawn(cmd, cwd=audio.dir, env=_clean_env(audio.dir), stdin=subprocess.DEVNULL,
                              stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            except OSError as exc:
                self._fail(f"Cannot start ffmpeg: {exc}")
                return None
            self.proc = proc
            reader = threading.Thread(target=_pump_lines, args=(proc.stderr, self.log.add), daemon=True)
            reader.start()
            self._threads = [reader]
        try:
            cap = sound_output_cap(os.lstat(video_path).st_size, self.max_bytes)
        except OSError:
            cap = sound_output_cap(0, self.max_bytes)
        too_large = f"The video with sound is larger than {_size_text(cap)}."
        deadline = time.monotonic() + timeout
        while True:  # wait for it, watching the size of what it writes
            try:
                proc.wait(min(ROOM_CHECK_S, max(0.0, deadline - time.monotonic())))
                break
            except subprocess.TimeoutExpired:
                if time.monotonic() >= deadline:
                    self._fail("ffmpeg did not finish adding the sound in time.", self.log.text())
                    return None
                problem = self._room_problem(out_path, cap, too_large)
                if problem:
                    self._fail(problem, self.log.text())
                    return None
        self._close_pipes()
        if self.is_terminal:
            return None
        if proc.returncode != 0:
            # a disk that filled up is said in the companion's words, with what can be done
            reason = self.manager.room_problem() or self.log.last() or f"ffmpeg exited with status {proc.returncode}."
            self._finish("failed", {"message": reason, "log": self.log.text()})
            return None
        size = _plain_file_size(out_path)
        if size <= 0:  # nothing, or something that is not a file of its own
            self._finish("failed", {"message": "ffmpeg did not write the video with sound.", "log": self.log.text()})
            return None
        if size > cap:
            self._finish("failed", {"message": too_large, "log": self.log.text()})
            return None
        for used in (video_path, audio.path):
            try:
                os.unlink(used)
            except OSError:
                pass
        return out_path

    def status(self) -> dict[str, Any]:
        with self.lock:
            out: dict[str, Any] = {
                "ok": True, "id": self.id, "kind": self.kind, "state": self.state,
                "elapsedS": round((self.finished or time.monotonic()) - self.started, 2),
            }
            if self.audio is not None:
                out.update(audioBytes=self.audio.total, audioReceived=self.audio.received)
            if self.error:
                out["error"] = {"message": self.error["message"], "line": None, "log": self.error["log"]}
            if self.result_path and self.state == "done":
                size = _plain_file_size(self.result_path)
                if size >= 0:
                    out["bytes"] = size
                out["mime"] = self.result_mime
            return out


def _swallow(rfile: Any, remaining: int) -> None:
    """Read and drop what is left of a request body (one request at most). The client is still
    sending it: an answer sent with the body half read finds that client with a connection that
    broke, and the reason the answer gives is lost. A client that stalls is left to itself."""
    try:
        while remaining > 0:
            chunk = rfile.read(min(FEED_CHUNK, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
    except (OSError, ValueError):  # a time-out is an OSError
        pass


class VideoJob(_Job):
    kind = "video"

    def __init__(self, manager: "JobManager", ffmpeg: str, spec: VideoSpec):
        super().__init__(manager)
        self.spec = spec
        self.received = 0
        self.encoded = 0
        self.png = PngStream(spec.width, spec.height)
        ext, self.result_mime = VIDEO_FORMATS[spec.format]
        self.result_name = f"video.{ext}"
        out_path = os.path.join(self.dir, f"out.{ext}")
        self._ffmpeg = ffmpeg
        try:
            if spec.audio:
                self.audio = _Soundtrack(manager.root(), audio_frames(spec.frames, spec.fps))
            self.proc = _spawn(
                build_ffmpeg_command(ffmpeg, spec, out_path, self.max_bytes), cwd=self.dir,
                env=_clean_env(self.dir),
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except OSError as exc:
            self._discard()
            raise JobError(503, f"Cannot start ffmpeg: {exc}") from exc
        self._out_path = out_path
        self._threads = [
            threading.Thread(target=_pump_lines, args=(self.proc.stdout, self._on_progress_line), daemon=True),
            threading.Thread(target=_pump_lines, args=(self.proc.stderr, self.log.add), daemon=True),
        ]
        for thread in self._threads:
            thread.start()

    def _on_progress_line(self, line: str) -> None:
        if line.startswith("frame="):
            try:
                self.encoded = int(line[6:])
            except ValueError:
                pass

    def status(self) -> dict[str, Any]:
        out = super().status()
        out.update(frames=self.spec.frames, received=self.received, encoded=min(self.encoded, self.spec.frames))
        return out

    def begin(self, first: int) -> None:
        """Claim the job for one frames request (``feed`` must follow). ``first`` is the index of the
        first frame in the body and must equal the number of frames received so far."""
        with self.lock:
            if self.is_terminal:
                raise JobError(410, f"The job is {self.state}.")
            if self.state != "receiving":
                raise JobError(409, "The job is not receiving frames.")
            if self.feeding:
                raise JobError(409, "Another request is already sending frames to this job.")
            if first != self.received:
                raise JobError(409, f"Out-of-order frames: expected index {self.received}, got {first}.")
            self.feeding = True
        self.got_data()

    def feed(self, rfile: Any, length: int) -> int:
        """Stream ``length`` bytes (concatenated PNG files) from ``rfile`` into ffmpeg; returns the
        number of frames in them. A damaged stream fails the job: some of it has already reached
        ffmpeg."""
        stdin = self.proc.stdin  # type: ignore[union-attr]
        before = self.png.frames
        try:
            remaining = length
            while remaining > 0:
                chunk = rfile.read(min(FEED_CHUNK, remaining))
                if not chunk:
                    self._fail("The request body ended early.")
                    raise JobError(400, "Incomplete request body.")
                remaining -= len(chunk)
                self.png.feed(chunk)
                if self.png.frames > self.spec.frames:
                    raise PngStreamError(f"More than {self.spec.frames} frames were sent.")
                try:
                    stdin.write(chunk)
                except (BrokenPipeError, OSError, ValueError):
                    if self.state == "cancelled":
                        raise JobError(410, "The job was cancelled.") from None
                    self._wait_encoder_exit()
                    _swallow(rfile, remaining)  # the reason is in the answer: the client must get to read it
                    raise JobError(500, self.error["message"] if self.error else "ffmpeg stopped unexpectedly.",
                                   self.error["log"] if self.error else "") from None
                self.got_data()
                problem = self._writing_problem(every=ROOM_CHECK_S)
                if problem:  # nothing cut short is ever delivered: the job fails, and says why
                    self._fail(problem, self.log.text())
                    _swallow(rfile, remaining)
                    raise JobError(507, problem)
            if not self.png.at_boundary:
                raise PngStreamError("The body ends in the middle of an image.")
            count = self.png.frames - before
            if count == 0:
                raise JobError(400, "The body contains no frames.")
            with self.lock:
                self.received = self.png.frames
            return count
        except PngStreamError as exc:
            self._fail(str(exc))
            raise JobError(400, str(exc)) from exc
        finally:
            with self.lock:
                self.feeding = False

    def _writing_problem(self, every: float = 0.0) -> str | None:
        """Why the first pass may not go on writing its video, or None (``_room_problem``)."""
        return self._room_problem(self._out_path, self.max_bytes, video_too_large(self.max_bytes), every)

    def _wait_encoder_exit(self) -> None:
        """ffmpeg stopped while we were writing: record why as the failure. Its own stop past the
        limit (-fs) ends it like this, between two looks at the file: the file then says so."""
        proc = self.proc
        assert proc is not None
        try:
            proc.wait(5)
        except subprocess.TimeoutExpired:
            _kill(proc)
        for thread in self._threads:
            thread.join(2)
        if not self.is_terminal:
            reason = self._writing_problem() or self.log.last() or "ffmpeg stopped unexpectedly."
            self._finish("failed", {"message": reason, "log": self.log.text()})

    def finish(self, timeout: float = ENCODE_TIMEOUT_S) -> dict[str, Any]:
        """No more frames: wait for ffmpeg to write the file. Returns the final status."""
        with self.lock:
            if self.is_terminal:
                return self.status()
            if self.state != "receiving":
                raise JobError(409, "The job is already being finished.")
            if self.feeding:
                raise JobError(409, "Frames are still being sent.")
            if self.received != self.spec.frames:
                raise JobError(409, f"{self.received} of {self.spec.frames} frames were received.")
            audio = self.audio
            if audio is not None and (audio.feeding or not audio.complete):
                raise JobError(409, f"{audio.received} of {audio.total} bytes of the soundtrack were received.")
            self.state = "encoding"
        proc = self.proc
        assert proc is not None
        try:
            proc.stdin.close()  # type: ignore[union-attr]
        except (OSError, ValueError):
            pass
        deadline = time.monotonic() + timeout
        while True:  # wait for it, watching what it writes: a GIF is written whole here
            try:
                proc.wait(min(ROOM_CHECK_S, max(0.0, deadline - time.monotonic())))
                break
            except subprocess.TimeoutExpired:
                if time.monotonic() >= deadline:
                    self._fail("ffmpeg did not finish in time.", self.log.text())
                    return self.status()
                problem = self._writing_problem()
                if problem:
                    self._fail(problem, self.log.text())
                    return self.status()
        self._close_pipes()
        if not self.is_terminal:
            written = os.path.getsize(self._out_path) if os.path.isfile(self._out_path) else 0
            # A file past the limit is no video to deliver, whatever ffmpeg said of it: its own
            # stop (-fs) ends it with status 0 and a file cut short.
            problem = video_too_large(self.max_bytes) if written > self.max_bytes else None
            if proc.returncode != 0 and problem is None:
                problem = self.manager.room_problem()  # a disk that filled up, in the companion's words
            if proc.returncode == 0 and written > 0 and problem is None:
                result: str | None = self._out_path
                if self.audio is not None:
                    result = self._add_sound(self._ffmpeg, self._out_path, self.spec.format)
                if result is not None:
                    self.result_path = result
                    self.encoded = self.spec.frames
                    self._finish("done")
            else:
                reason = problem or self.log.last() or f"ffmpeg exited with status {proc.returncode}."
                self._finish("failed", {"message": reason, "log": self.log.text()})
        return self.status()


class ManimJob(_Job):
    kind = "manim"

    def __init__(self, manager: "JobManager", companion: "Companion", spec: ManimSpec,
                 ffmpeg: str | None = None):
        """``ffmpeg`` is needed by a job with ``spec.audio``: it adds the sound when Manim is done."""
        super().__init__(manager)
        self.spec = spec
        self.animation: int | None = None
        self._per_animation: dict[int, int] = {}
        self.sandboxed = False
        self._sandbox = companion.sandbox
        self._ffmpeg = ffmpeg
        interpreter = companion.manim_interpreter(spec.target)
        assert interpreter is not None
        try:
            with open(os.path.join(self.dir, "scene.py"), "w", encoding="utf-8") as fh:
                fh.write(spec.code)
            tmp = os.path.join(self.dir, "tmp")
            os.mkdir(tmp)
            cmd = build_manim_command(interpreter["python"], spec)
            sandbox = companion.sandbox
            self.sandboxed = sandbox.active()
            font_paths, font_env = _native_font_environment(self.dir)
            cmd = sandbox.wrap(cmd, self.dir, readable=[*interpreter["paths"], *font_paths],
                               gpu=companion.sandbox_gpu, hide=[manager.root()])
            env = _clean_env(self.dir, extra={"TMPDIR": tmp, "COLUMNS": "200", "PYTHONUNBUFFERED": "1",
                                              "PYTHONDONTWRITEBYTECODE": "1", "NO_COLOR": "1", **font_env})
            if spec.audio:
                assert spec.frames is not None and spec.fps is not None and ffmpeg is not None
                self.audio = _Soundtrack(manager.root(), audio_frames(spec.frames, spec.fps))
        except OSError as exc:
            self._discard()
            raise JobError(503, f"Cannot start Manim: {exc}") from exc
        self.timeout = companion.manim_timeout_s
        self._cmd, self._env = cmd, env
        if self.audio is not None:
            return  # "receiving": Manim starts when the whole soundtrack has arrived
        self.state = "running"
        failure = self._start()
        if failure:
            self._discard()
            raise JobError(503, f"Cannot start Manim: {failure}")

    def _start(self) -> OSError | None:
        """Start Manim; returns why it could not be started."""
        # The process is started by the supervising thread, not by the request's: bubblewrap's
        # --die-with-parent is tied to the *thread* that spawned it, and a request thread ends as
        # soon as it has answered.
        started = threading.Event()
        failure: list[OSError] = []
        threading.Thread(target=self._supervise, args=(self._cmd, self._env, started, failure), daemon=True).start()
        started.wait(30)
        return failure[0] if failure else None

    def _audio_complete(self) -> None:
        with self.lock:
            if self.is_terminal:
                return
            self.state = "running"
        failure = self._start()
        if failure:
            self._fail(f"Cannot start Manim: {failure}")

    def _supervise(self, cmd: list[str], env: dict[str, str], started: threading.Event,
                   failure: list[OSError]) -> None:
        try:
            with self.lock:  # a cancel either finds the job finished here, or finds this process
                if self.is_terminal:
                    return
                self.proc = proc = _spawn(
                    cmd, cwd=self.dir, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE)
        except OSError as exc:
            failure.append(exc)
            return
        finally:
            started.set()
        readers = [
            threading.Thread(target=_pump_lines, args=(proc.stdout, self._on_line), daemon=True),
            threading.Thread(target=_pump_lines, args=(proc.stderr, self._on_line), daemon=True),
        ]
        for thread in readers:
            thread.start()
        self._threads = readers
        self._watch(proc)

    def _on_line(self, line: str) -> None:
        progress = parse_manim_progress(line)
        if progress is None:
            self.log.add(line)
            return
        index, count = progress
        with self.lock:
            self.animation = index
            self._per_animation[index] = max(self._per_animation.get(index, 0), count)

    def status(self) -> dict[str, Any]:
        out = super().status()
        with self.lock:
            frame = sum(self._per_animation.values())
            total = self.spec.frames
            if self.state == "done" and total:
                frame = total  # tqdm prints only now and then: the last update may be missing
            out.update(frame=min(frame, total) if total else frame, frames=total, animation=self.animation,
                       sandboxed=self.sandboxed)
        return out

    def _watch(self, proc: subprocess.Popen) -> None:
        deadline = time.monotonic() + self.timeout
        while True:  # wait for it, watching the disk it writes on: its video has no limit of its own
            try:
                proc.wait(min(1.0, max(0.0, deadline - time.monotonic())))
                break
            except subprocess.TimeoutExpired:
                if time.monotonic() >= deadline:
                    self._fail(f"Manim did not finish within {self.timeout:g} s.", self.log.text())
                    return
                problem = self._room_problem()
                if problem:
                    self._fail(problem, self.log.text())
                    return
        self._close_pipes()
        if self.is_terminal:
            return
        result = self._find_result()
        if proc.returncode == 0 and result:
            if self.audio is not None:
                assert self._ffmpeg is not None
                with self.lock:
                    if self.is_terminal:
                        return
                    self.state = "encoding"
                # this thread started Manim's sandbox and now starts ffmpeg's: see `_start`
                result = self._add_sound(self._ffmpeg, result, "mp4", sandbox=self._sandbox)
                if result is None:
                    return
            self.result_path = result
            self.result_mime, self.result_name = "video/mp4", "video.mp4"
            self._finish("done")
        else:
            reason = self.log.last() or f"Manim exited with status {proc.returncode}."
            if proc.returncode == 0:
                reason = "Manim finished without writing a video. " + reason
            self._finish("failed", {"message": reason, "log": self.log.text()})

    def _find_result(self) -> str | None:
        wanted = MANIM_OUTPUT_NAME + ".mp4"
        for root, dirs, files in os.walk(self.dir):
            dirs[:] = [d for d in dirs if d != "partial_movie_files" and d != "tmp"]
            if wanted in files:
                path = os.path.join(root, wanted)
                # a file of the job, not a link the scene left pointing somewhere else
                if _plain_file_size(path) > 0:
                    return path
        return None


class JobManager:
    """Registry of jobs, a private temporary directory for all of them, and the reaper."""

    def __init__(self, max_video_bytes: int = MAX_OUTPUT_BYTES) -> None:
        self.max_video_bytes = max_video_bytes  # the largest video one job writes
        self.min_free_bytes = MIN_FREE_BYTES  # what the jobs leave free on the disk of the folder
        self._lock = threading.Lock()
        self._jobs: dict[str, _Job] = {}
        self._root: str | None = None
        self._reaper: threading.Thread | None = None
        self._stop = threading.Event()
        self.creation_lock = threading.Lock()  # makes "count the active jobs, then add one" atomic
        self.idle_timeout_s = VIDEO_IDLE_TIMEOUT_S
        self.receiving_limit_s = MANIM_RECEIVING_TIMEOUT_S
        self.retention_s = JOB_RETENTION_S

    def root(self) -> str:
        with self._lock:
            if self._root is None:
                self._root = tempfile.mkdtemp(prefix="mfe-jobs-")
            return self._root

    def room_problem(self) -> str | None:
        """Why no job may write now, or None: the disk of the temporary folder, where every job
        has its files, has less than the reserve free. Asked before a job starts and while one
        writes: a job never fills the disk, and says so when it is stopped for it."""
        with self._lock:
            root = self._root
        folder = os.path.dirname(root) if root else tempfile.gettempdir()
        free = _free_bytes(root or folder)
        if free is not None and free < self.min_free_bytes:
            return disk_nearly_full(folder_as_said(folder), self.min_free_bytes)
        return None

    def add(self, job: _Job) -> None:
        evicted: list[_Job] = []
        with self._lock:
            self._jobs[job.id] = job
            finished = sorted((j for j in self._jobs.values() if j.is_terminal), key=lambda j: j.finished or 0)
            while len(finished) > MAX_RETAINED_JOBS:
                old = finished.pop(0)
                del self._jobs[old.id]
                evicted.append(old)
            if self._reaper is None and not self._stop.is_set():
                self._reaper = threading.Thread(target=self._reap_loop, daemon=True)
                self._reaper.start()
        for old in evicted:
            old.cleanup()

    def get(self, kind: str, job_id: str) -> _Job | None:
        with self._lock:
            job = self._jobs.get(job_id)
        if job is None or job.kind != kind:
            return None
        job.touch()
        return job

    def active(self, kind: str) -> list[_Job]:
        with self._lock:
            return [j for j in self._jobs.values() if j.kind == kind and not j.is_terminal]

    def remove(self, kind: str, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.kind != kind:
                return False
            del self._jobs[job_id]
        job.cleanup()
        return True

    def reap(self) -> None:
        """Give up on jobs whose client went silent while they waited for frames or for a soundtrack
        (they fail); remove the files of every job that failed, at once: the job stays to say what
        happened, and nothing reads its frames, its soundtrack or what it had written; forget
        finished jobs nobody collected."""
        now = time.monotonic()
        with self._lock:
            jobs = list(self._jobs.values())
        for job in jobs:
            if job.state == "receiving":
                waiting = not job.feeding and not (job.audio is not None and job.audio.feeding)
                if isinstance(job, ManimJob) and now - job.started > self.receiving_limit_s:
                    job._fail("The soundtrack did not arrive in time.")
                elif waiting and now - job.fed > self.idle_timeout_s:
                    job._fail("The client stopped sending frames." if isinstance(job, VideoJob)
                              else "The client stopped sending the soundtrack.")
            proc = job.proc
            if job.state == "failed" and not job.freed and (proc is None or proc.poll() is not None):
                # However it failed (given up on here, a bad frame, ffmpeg, Manim, the second
                # pass): a soundtrack can be 691 MB, and asking about the job would keep it.
                # Once its process is gone, so that nothing writes into what is being removed.
                job.freed = True
                job._discard()
            if job.is_terminal:
                if now - (job.finished or now) > self.retention_s and now - job.touched > self.retention_s:
                    with self._lock:
                        self._jobs.pop(job.id, None)
                    job.cleanup()

    def _reap_loop(self) -> None:
        while not self._stop.wait(2.0):
            try:
                self.reap()
            except Exception:  # never let the reaper die
                pass

    def shutdown(self) -> None:
        """Cancel everything and remove every temporary file (idempotent)."""
        self._stop.set()
        with self._lock:
            jobs = list(self._jobs.values())
            self._jobs.clear()
            root, self._root = self._root, None
        for job in jobs:
            job.cancel()
        for job in jobs:
            job.cleanup()
        if root:
            shutil.rmtree(root, ignore_errors=True)


# What a child process keeps of the companion's own environment: where the programs are and the
# language, and what Windows, its programs and a TeX distribution cannot start without (no socket
# opens without SYSTEMROOT; the folders of the system and of the applications' data are places,
# not secrets). Nothing else: no variable of the user's shell.
_ENV_KEPT = ("PATH", "LANG", "LC_ALL",
             "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PATHEXT", "OS",
             "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "ALLUSERSPROFILE",
             "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432",
             "COMMONPROGRAMFILES", "COMMONPROGRAMFILES(X86)", "COMMONPROGRAMW6432",
             "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "PROCESSOR_ARCHITEW6432",
             "PROCESSOR_IDENTIFIER")


def _clean_env(home: str, extra: dict[str, str] | None = None, *, windows: bool = os.name == "nt",
               environ: Any = None) -> dict[str, str]:
    """A minimal environment for child processes: no secrets from the user's shell.

    ``home`` is their home folder (a job's own directory), so that nothing of the user's
    configuration reaches them. Python children read and write UTF-8, whatever the system's code
    page: the companion reads their output as UTF-8, and the scenes and the ``.tex`` files they
    write are UTF-8 too (on Windows the default is the ANSI code page).

    Windows asks for the same things under other names: Python takes ``~`` from USERPROFILE and not
    from HOME (ManimCE asks for it as soon as it is imported), and a program that is not Python
    asks the system for the temporary folder, which reads TMP and TEMP and never TMPDIR.
    """
    environ = os.environ if environ is None else environ
    env = {"HOME": home, "PYTHONUTF8": "1"}
    for name in _ENV_KEPT:
        if name in environ:
            env[name] = environ[name]
    env.update(extra or {})
    if windows:
        drive, path = ntpath.splitdrive(home)
        env.update({"USERPROFILE": home, "HOMEDRIVE": drive, "HOMEPATH": path or "\\"})
        temporary = env.get("TMPDIR", home)
        env.setdefault("TEMP", temporary)
        env.setdefault("TMP", temporary)
    return env


# ---------------------------------------------------------------------------------------------
# 6c. Fixed Pango workers. Only this file is executed; requests are bounded JSON data.
# ---------------------------------------------------------------------------------------------


def validate_text_request(obj: Any) -> dict[str, Any]:
    if not isinstance(obj, dict):
        raise RequestError(400, "The text request must be an object.")
    source, target, font, size = (obj.get(k) for k in ("source", "target", "font", "fontSize"))
    if not isinstance(source, str) or "\0" in source or "\r" in source:
        raise RequestError(400, "Text source must be a string with LF line endings and no NUL.")
    try:
        source_bytes = source.encode("utf-8")
    except UnicodeEncodeError:
        raise RequestError(400, "Text source contains an unpaired surrogate.") from None
    if len(source_bytes) > MAX_TEXT_BYTES or source.count("\n") + 1 > MAX_TEXT_LINES:
        raise RequestError(413, "Text source exceeds the byte or line limit.")
    if target not in TARGETS or not isinstance(font, dict):
        raise RequestError(400, "A text target and font object are required.")
    family = font.get("family")
    if (not isinstance(family, str) or not family.strip() or len(family) > 256
            or any(ord(c) < 32 or 0xD800 <= ord(c) <= 0xDFFF for c in family)):
        raise RequestError(400, "Font family must be a nonempty name of at most 256 characters.")
    if font.get("weight") not in ("normal", "bold") or font.get("slant") not in ("normal", "italic"):
        raise RequestError(400, "Font weight/slant must be normal/bold and normal/italic.")
    if isinstance(size, bool) or not isinstance(size, (int, float)) or not math.isfinite(size) or not 1 <= size <= 512:
        raise RequestError(400, "fontSize must be finite and between 1 and 512.")
    request_id = obj.get("requestId")
    if request_id is not None and (not isinstance(request_id, str) or not TEXT_REQUEST_ID_RE.fullmatch(request_id)):
        raise RequestError(400, "Invalid text requestId.")
    return {"source": source, "target": target, "font": {k: font[k] for k in ("family", "weight", "slant")},
            "fontSize": size, **({"requestId": request_id} if request_id else {})}


def _text_digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def _text_failure(code: str, message: str, ranges: list[dict[str, int]] | None = None) -> dict[str, Any]:
    return {"ok": False, "error": {"message": message, "log": ""},
            "diagnostics": [{"code": code, "message": message, "ranges": ranges or []}]}


def _read_json_file(path: str, limit: int) -> Any:
    """The JSON value of a file of at most ``limit`` bytes; None when it is missing, larger or
    not JSON."""
    try:
        with open(path, "rb") as fh:
            data = fh.read(limit + 1)
        return json.loads(data.decode("utf-8")) if len(data) <= limit else None
    except (OSError, ValueError):
        return None


def _font_hash_table(value: Any) -> dict[str, list[Any]]:
    """``value`` when it is a table of font digests, else an empty one: absolute path -> [size,
    mtime_ns, inode, ctime_ns, sha256]. What a worker reports comes through here before the
    companion keeps it: the worker is sandboxed, and the companion is not."""
    if not isinstance(value, dict) or len(value) > MAX_FONT_HASHES:
        return {}
    for name, entry in value.items():
        if not isinstance(name, str) or not name.startswith("/") or len(name) > 4096 or "\0" in name:
            return {}
        try:
            name.encode("utf-8")
        except UnicodeEncodeError:
            return {}
        if (not isinstance(entry, list) or len(entry) != 5
                or not all(isinstance(v, int) and not isinstance(v, bool) and v >= 0 for v in entry[:4])
                or not isinstance(entry[4], str) or not re.fullmatch(r"[0-9a-f]{64}", entry[4])):
            return {}
    return value


def _is_font_catalog(value: Any) -> bool:
    """Whether a worker's answer to ``fonts`` has what the companion itself reads of it and puts
    in every ``/health``: a worker is sandboxed, and the companion is not."""
    return (isinstance(value, dict)
            and isinstance(value.get("environmentKey"), str)
            and re.fullmatch(r"[0-9a-f]{64}", value["environmentKey"]) is not None
            and isinstance(value.get("fonts"), list))


def _native_font_environment(directory: str) -> tuple[list[str], dict[str, str]]:
    """One explicit font view for catalog, shaping and native video, without exposing all HOME."""
    from xml.sax.saxutils import escape
    home = os.path.expanduser("~")
    data_home = os.environ.get("XDG_DATA_HOME") or os.path.join(home, ".local", "share")
    config_home = os.environ.get("XDG_CONFIG_HOME") or os.path.join(home, ".config")
    font_dirs = [os.path.join(home, ".fonts"), os.path.join(data_home, "fonts")]
    config_path = os.path.join(directory, "fonts.conf")
    config = '<fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include>'
    config += ''.join('<dir>' + escape(p) + '</dir>' for p in font_dirs if os.path.isdir(p))
    config += '<cachedir>' + escape(os.path.join(directory, "font-cache")) + '</cachedir></fontconfig>'
    with open(config_path, "w", encoding="utf-8") as fh:
        fh.write(config)
    return [*font_dirs, os.path.join(config_home, "fontconfig")], {
        "XDG_CONFIG_HOME": config_home, "FONTCONFIG_FILE": config_path}


# Font text is shaped through the system's Pango with Fontconfig (``_PangoAPI``), which is Linux's.
# Elsewhere a worker would import Manim, which takes seconds, only to refuse: the companion says
# it for the worker, with the worker's words, and starts none.
TEXT_SHAPING_HERE = sys.platform.startswith("linux")
TEXT_SHAPING_REFUSAL = "Native text mapping currently requires the Linux Pango/Fontconfig backend."


class _PangoWorker:
    """One persistent process per library that shapes text with that library's Manim. It starts
    with the first request that needs it, never with the companion: a session without font text
    imports no Manim and hashes no font."""

    def __init__(self, companion: Companion, target: str):
        self.companion, self.target = companion, target
        self.lock = threading.Lock()
        self.proc: subprocess.Popen | None = None
        self.directory: str | None = None
        self.responses: queue.Queue = queue.Queue(maxsize=1)
        self.log = _Tail(limit=32, line_chars=256)
        self.catalog: dict[str, Any] | None = None
        self.known_supported = False
        self.starting = False  # between the spawn and its first answer: nobody's request time
        self.failure: str | None = None  # why the last start did not work, until one does
        self.starts = 0  # starts begun so far
        self.failed_start = 0  # the number of the last one that did not work
        # Texts not shaped again for a while (see TEXT_REFUSED_S), by the digest of what was
        # asked: until when, and the error to give. Read and written with the lock.
        self.refused: collections.OrderedDict[str, tuple[float, int, str]] = collections.OrderedDict()
        self.font_locations: list[str] = []
        self.font_visibility: list[tuple[str, bool]] = []

    def alive(self) -> bool:
        proc = self.proc
        return proc is not None and proc.poll() is None

    def stop(self) -> None:
        proc, self.proc = self.proc, None
        if proc is not None:
            _kill(proc)
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                pass
            for stream in (proc.stdin, proc.stdout, proc.stderr):
                if stream:
                    stream.close()
        if self.directory:
            shutil.rmtree(self.directory, ignore_errors=True)
            self.directory = None
        self.catalog = None

    def _start(self) -> None:
        self.stop()
        interpreter = self.companion.manim_interpreter(self.target)
        if interpreter is None:
            raise JobError(503, "No configured native interpreter is available for this text target.")
        self.directory = tempfile.mkdtemp(prefix="mfe-pango-")
        helper = os.path.join(self.directory, "helper.py")
        shutil.copyfile(os.path.abspath(__file__), helper)
        # The digests of the font files this library's worker took before: it reads only the
        # files they miss.
        with open(os.path.join(self.directory, FONT_HASHES_FILE), "w", encoding="utf-8") as fh:
            json.dump(self.companion.font_hashes(self.target), fh, ensure_ascii=False, separators=(",", ":"))
        font_paths, font_env = _native_font_environment(self.directory)
        self.font_locations = font_paths
        self.font_visibility = [(os.path.realpath(p), os.path.isdir(p)) for p in font_paths]
        readable = [*interpreter["paths"], *font_paths]
        env = _clean_env(self.directory, {"XDG_CACHE_HOME": os.path.join(self.directory, "cache"),
                   "MPLCONFIGDIR": os.path.join(self.directory, "mpl"), "PYTHONDONTWRITEBYTECODE": "1",
                   "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1", **font_env})
        cmd = self.companion.sandbox.wrap([interpreter["python"], helper, "--pango-worker", self.target],
                                          self.directory, readable=readable)
        responses = self.responses = queue.Queue(maxsize=1)
        started = threading.Event()
        directory = self.directory

        def read_responses():
            try:
                # bubblewrap --die-with-parent belongs to the spawning THREAD. Keep that
                # thread alive across HTTP requests for the entire persistent worker lifetime.
                proc = _spawn(cmd, cwd=directory, env=env, stdin=subprocess.PIPE,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                self.proc = proc
                threading.Thread(target=_pump_lines, args=(proc.stderr, self.log.add), daemon=True).start()
                started.set()
                while True:
                    line = proc.stdout.readline(MAX_TEXT_OUTPUT_BYTES + 1)
                    if not line or len(line) > MAX_TEXT_OUTPUT_BYTES:
                        responses.put_nowait(None)
                        return
                    responses.put(json.loads(line))
            except (OSError, ValueError, queue.Full, RecursionError):  # the last: JSON nested without end
                try:
                    responses.put_nowait(None)
                except queue.Full:
                    pass
            finally:
                started.set()

        threading.Thread(target=read_responses, daemon=True).start()
        if not started.wait(5) or self.proc is None:
            self.stop()
            raise JobError(503, "Could not start the native text worker.")

    def _ready(self) -> bool:
        return self.alive() and self.catalog is not None

    def _prepare(self) -> dict[str, Any]:
        """Start the worker and take its font catalog, its first answer: the import of Manim, the
        catalog and the digests of the fonts all happen before it. Under its own time limit, and
        nobody's request: only the companion's shutdown stops it. Returns the catalog; raises when
        the worker does not come up, and remembers why (``failure``)."""
        self.starting = True
        self.starts += 1
        number = self.starts
        try:
            try:
                if not TEXT_SHAPING_HERE:
                    raise JobError(503, TEXT_SHAPING_REFUSAL)
                self._start()
                response = self._exchange("fonts", {}, self.companion.pango.stopping,
                                          time.monotonic() + TEXT_START_TIMEOUT_S)
            except OSError as exc:  # no temporary directory, a full disk, a sandbox that died at once
                self.stop()
                raise JobError(503, "The native text worker could not be started.", str(exc)) from None
            if not response.get("ok") or self.catalog is None:
                message = (response.get("error") or {}).get("message") or "The native text worker did not start."
                self.stop()
                raise JobError(503, message, self.log.text(2000))
            self.failure = None
            return response
        except JobError as exc:
            if exc.status != 409:  # a shutdown in the middle says nothing about the worker
                self.failure, self.failed_start = exc.message, number
            raise
        finally:
            self.starting = False

    def _exchange(self, operation: str, payload: dict, cancelled: threading.Event,
                  deadline: float) -> dict[str, Any]:
        """One request to the running worker and its answer, by ``deadline``. Called with the lock."""
        self.proc.stdin.write((json.dumps({"operation": operation, "payload": payload},
                                          ensure_ascii=False) + "\n").encode())
        self.proc.stdin.flush()
        while True:
            if cancelled.is_set():
                self.stop()
                raise JobError(409, "Text request cancelled.")
            if time.monotonic() >= deadline:
                self.stop()
                raise JobError(504, "Native text request timed out.")
            try:
                response = self.responses.get(timeout=0.05)
            except queue.Empty:
                continue
            if not isinstance(response, dict):
                log = self.log.text(2000)
                self.stop()
                raise JobError(503, "Native text worker stopped unexpectedly.", log)
            diagnostics = response.get("diagnostics")
            if isinstance(diagnostics, list) and any(
                    isinstance(d, dict) and d.get("code") == "font-environment-changed" for d in diagnostics):
                self.stop()
            if operation == "fonts":
                # The first catalog of a worker comes with the digests of the fonts it met, over
                # the same bounded channel as every answer; they are the companion's, not the
                # client's.
                hashes = response.pop("fontHashes", None)
                if response.get("ok") and not _is_font_catalog(response):
                    # What /health and the clients are told comes from here: not from an answer
                    # that is not a catalog.
                    log = self.log.text(2000)
                    self.stop()
                    raise JobError(503, "The native text worker sent no font catalog.", log)
                if response.get("ok"):
                    self.catalog = response
                    self.known_supported = True
                    self.companion.remember_font_hashes(self.target, _font_hash_table(hashes))
            return response

    @staticmethod
    def _text_digest(payload: dict) -> str:
        """What a text request asks to be shaped, whoever asks (no request id)."""
        asked = [payload.get(key) for key in ("target", "source", "font", "fontSize")]
        return hashlib.sha256(json.dumps(asked, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

    def _refuse(self, digest: str, status: int, message: str) -> None:
        """Do not shape this text again for a while. Called with the lock."""
        self.refused.pop(digest, None)
        self.refused[digest] = (time.monotonic() + TEXT_REFUSED_S, status, message)
        while len(self.refused) > MAX_TEXT_REFUSED:
            self.refused.popitem(last=False)

    def call(self, operation: str, payload: dict, cancelled: threading.Event,
             timeout: float) -> dict[str, Any]:
        """``operation`` on the worker, started first when it is not running. ``timeout`` is the
        request's own, twice: for the wait while the worker is busy with other requests (then
        429, and the client asks again), and, counted anew, for its own work once the worker
        takes it. Neither the wait for a worker that is starting nor that start count against it
        (a start has its own limit, ``TEXT_START_TIMEOUT_S``). A start is tried once for the
        requests that wait for it: when it fails they all hear why, and none starts another.

        A text whose own work passes ``timeout``, or takes the worker down, did it by itself (its
        time was its own, on a worker that answered): it is refused for ``TEXT_REFUSED_S``,
        without a worker being started or asked."""
        deadline = time.monotonic() + timeout
        # However the starts fall, nothing here outlasts one of them and the request after it.
        limit = time.monotonic() + TEXT_START_TIMEOUT_S + 10 + timeout
        waited = 0  # the start this request waited for, if any
        while not self.lock.acquire(timeout=0.05):
            if cancelled.is_set():
                raise JobError(409, "Text request cancelled.")
            now = time.monotonic()
            if self.starting and now < limit:
                waited, deadline = self.starts, now + timeout
            elif now >= deadline:
                raise JobError(429, "Text queue is busy; try again.")
        digest = self._text_digest(payload) if operation == "text" else None
        try:
            if cancelled.is_set():
                raise JobError(409, "Text request cancelled.")
            if digest is not None:
                until, status, message = self.refused.get(digest, (0.0, 0, ""))
                if time.monotonic() < until:
                    raise JobError(status, message)
                self.refused.pop(digest, None)
            if self.proc and self.font_visibility != [(os.path.realpath(p), os.path.isdir(p))
                                                       for p in self.font_locations]:
                # A previously absent user-font directory needs a new sandbox bind mount.
                self.stop()
            if not self._ready():
                if self.companion.manim_interpreter(self.target) is None:
                    # Nothing to start, and nothing to remember: the interpreter may still be
                    # found (the probe of the first seconds).
                    raise JobError(503, "No configured native interpreter is available for this text target.")
                if waited and waited == self.failed_start:
                    raise JobError(503, self.failure or "The native text worker did not start.")
                catalog = self._prepare()
                if cancelled.is_set():  # cancelled meanwhile: the worker stays, the request goes
                    raise JobError(409, "Text request cancelled.")
                if operation == "fonts":
                    return catalog
            # The worker is this request's now: its work has its own time, whatever it waited.
            deadline = time.monotonic() + timeout
            try:
                return self._exchange(operation, payload, cancelled, deadline)
            except JobError as exc:
                if digest is None or exc.status not in (503, 504):
                    raise
                minutes = f"{TEXT_REFUSED_S / 60:g} minutes"
                message = (f"This text took more than {timeout:g} s to shape and was stopped. It is not "
                           f"tried again for {minutes}: a shorter text, or the same text split into "
                           "several objects, takes less."
                           if exc.status == 504 else
                           "Shaping this text stopped the text worker. It is not tried again for "
                           f"{minutes}.")
                self._refuse(digest, exc.status, message)
                raise JobError(exc.status, message, exc.log) from None
        except (OSError, BrokenPipeError) as exc:
            self.stop()
            raise JobError(503, "Native text worker is unavailable.", str(exc)) from None
        finally:
            self.lock.release()


class _PangoService:
    """Font text for both libraries. Nothing runs until a request names a library; a worker that
    was ready and went away (a cancelled request, a changed font, a time-out) is brought back by
    the next ``/health``, so that a session that uses text finds it ready again. One whose start
    failed is not: ``/health`` says why, and the next request that names the library tries."""

    def __init__(self, companion: Companion):
        self.companion = companion
        self.workers = {target: _PangoWorker(companion, target) for target in TARGETS}
        self.slots = threading.BoundedSemaphore(MAX_TEXT_PENDING)
        self.guard = threading.Lock()
        self.requests: dict[str, threading.Event] = {}
        self.closed = False
        self.stopping = threading.Event()
        self.cancelled: collections.OrderedDict[str, float] = collections.OrderedDict()
        self._probing: set[str] = set()
        self._probe_after = {target: 0.0 for target in TARGETS}

    def _run_probe(self, target: str) -> None:
        try:
            self.fonts(target)
        except JobError:
            pass
        finally:
            with self.guard:
                self._probing.discard(target)
                self._probe_after[target] = 0 if self.workers[target].catalog else time.monotonic() + 1

    def probing(self) -> bool:
        """A worker is being started (by a request, or brought back by ``/health``)."""
        with self.guard:
            return bool(self._probing) or any(worker.starting for worker in self.workers.values())

    def capabilities(self) -> dict[str, Any]:
        """What ``/health`` says of font text, by library: null without its interpreter; else
        ``state``: ``unused`` (nothing started: the first ``/fonts`` or ``/text`` starts it),
        ``preparing``, ``ready`` (with ``adapterVersion`` and ``environmentKey``) or ``failed``
        (with ``message``: the last start did not work; a new request tries again, ``/health``
        does not)."""
        result: dict[str, Any] = {}
        for target, worker in self.workers.items():
            with self.guard:
                # Brought back only while nothing says it cannot start: a worker whose last
                # start failed waits for a request, which is the author's word.
                restart = (not self.closed and worker.known_supported and worker.failure is None
                           and target not in self._probing and not worker.starting
                           and time.monotonic() >= self._probe_after[target] and not worker._ready())
                if restart:
                    self._probe_after[target] = time.monotonic() + 1
                    self._probing.add(target)
                preparing = target in self._probing
            if restart:
                threading.Thread(target=self._run_probe, args=(target,), daemon=True).start()
            catalog = worker.catalog
            if self.companion.manim_interpreter(target) is None:
                result[target] = None
            elif preparing or worker.starting:
                result[target] = {"state": "preparing"}
            elif catalog and worker.alive():
                result[target] = {"state": "ready", "adapterVersion": PANGO_ADAPTER_VERSION,
                                  "environmentKey": catalog["environmentKey"]}
            elif worker.failure:
                result[target] = {"state": "failed", "message": worker.failure}
            else:
                result[target] = {"state": "unused"}
        return result

    def fonts(self, target: str) -> dict[str, Any]:
        if target not in TARGETS:
            raise JobError(400, "A ce or gl target is required.")
        if self.closed:
            raise JobError(503, "The companion is shutting down.")
        if not self.slots.acquire(blocking=False):
            raise JobError(429, "The native text queue is full.")
        try:
            worker = self.workers[target]
            return worker.call("fonts", {}, self.stopping, TEXT_TIMEOUT_S)
        finally:
            self.slots.release()

    def render(self, request: dict[str, Any]) -> dict[str, Any]:
        if not self.slots.acquire(blocking=False):
            raise JobError(429, "The native text queue is full.")
        request_id = request.get("requestId") or secrets.token_hex(16)
        event = threading.Event()
        registered = False
        try:
            with self.guard:
                if self.closed:
                    raise JobError(503, "The companion is shutting down.")
                if request_id in self.requests:
                    raise JobError(409, "A text request with this requestId already exists.")
                now = time.monotonic()
                while self.cancelled and next(iter(self.cancelled.values())) < now:
                    self.cancelled.popitem(last=False)
                if request_id in self.cancelled:
                    raise JobError(409, "Text request cancelled before it was submitted.")
                self.requests[request_id] = event
                registered = True
            return self.workers[request["target"]].call("text", request, event, TEXT_TIMEOUT_S)
        finally:
            if registered:
                with self.guard:
                    self.requests.pop(request_id, None)
            self.slots.release()

    def cancel(self, request_id: str) -> bool:
        with self.guard:
            event = self.requests.get(request_id)
            if event:
                event.set()
            self.cancelled.pop(request_id, None)
            self.cancelled[request_id] = time.monotonic() + 30
            while len(self.cancelled) > 128:
                self.cancelled.popitem(last=False)
            return event is not None

    def shutdown(self) -> None:
        with self.guard:
            self.closed = True
            self.stopping.set()
            for event in self.requests.values():
                event.set()
        for worker in self.workers.values():
            with worker.lock:
                worker.stop()


def _pango_contours(mob: Any, target: str) -> list[list[float]]:
    """Native subpaths in the app's cubic representation; quadratic elevation is exact."""
    contours = []
    for path in mob.get_subpaths():
        if len(path) < 3:
            continue
        contour = [float(path[0][0]), float(path[0][1])]
        if target == "ce":
            for i in range(0, len(path), 4):
                curve = path[i:i + 4]
                if len(curve) != 4:
                    raise ValueError("Unexpected CE contour topology.")
                contour.extend(float(v) for point in curve[1:] for v in point[:2])
        else:
            for i in range(0, len(path) - 2, 2):
                a, h, b = path[i:i + 3]
                contour.extend(float(v) for point in ((a + 2 * h) / 3, (2 * h + b) / 3, b)
                               for v in point[:2])
        if len(contour) > 2:
            contours.append(contour)
    return contours


def _pango_geometry_signature(contours_by_glyph: list[list[list[float]]]) -> str:
    """Portable runtime fingerprint; includes glyph/subpath order and cubic topology."""
    quantized = [[[math.floor(value * 1_000_000 + 0.5) for value in contour]
                  for contour in glyph] for glyph in contours_by_glyph]
    return hashlib.sha256(json.dumps(quantized, separators=(",", ":")).encode()).hexdigest()


def _text_box(points: list[list[float]]) -> dict[str, float]:
    if not points:
        return {"minX": 0.0, "minY": 0.0, "maxX": 0.0, "maxY": 0.0}
    return {"minX": min(p[0] for p in points), "minY": min(p[1] for p in points),
            "maxX": max(p[0] for p in points), "maxY": max(p[1] for p in points)}


class _PangoAPI:
    """Checked public Linux Pango ABI, confined to the fixed native worker process."""
    def __init__(self):
        import ctypes as c
        import ctypes.util
        if not sys.platform.startswith("linux"):
            raise RuntimeError(TEXT_SHAPING_REFUSAL)
        self.c = c
        v, i, s, ptr = c.c_void_p, c.c_int, c.c_char_p, c.POINTER
        class Rect(c.Structure):
            _fields_ = [(n, i) for n in ("x", "y", "width", "height")]
        class Analysis(c.Structure):
            _fields_ = [("shape", v), ("lang", v), ("font", v), ("level", c.c_uint8),
                        ("gravity", c.c_uint8), ("flags", c.c_uint8), ("script", c.c_uint8),
                        ("language", v), ("attrs", v)]
        class Item(c.Structure):
            _fields_ = [("offset", i), ("length", i), ("chars", i), ("analysis", Analysis)]
        class Glyph(c.Structure):
            _fields_ = [("glyph", c.c_uint), ("width", i), ("x", i), ("y", i), ("flags", c.c_uint)]
        class GlyphString(c.Structure):
            _fields_ = [("count", i), ("glyphs", ptr(Glyph)), ("clusters", ptr(i)), ("space", i)]
        class Run(c.Structure):
            _fields_ = [("item", ptr(Item)), ("glyphs", ptr(GlyphString)),
                        ("y", i), ("start_x", i), ("end_x", i)]
        class FontSet(c.Structure):
            _fields_ = [("count", i), ("size", i), ("fonts", ptr(v))]
        self.Rect = Rect
        self.libs = {}
        def lib(name):
            path = ctypes.util.find_library(name)
            if not path:
                raise RuntimeError("Missing native text library: " + name)
            self.libs[name] = c.CDLL(path)
            return self.libs[name]
        p, pc, ca, go, gl, fc, pf = [lib(n) for n in
            ("pango-1.0", "pangocairo-1.0", "cairo", "gobject-2.0", "glib-2.0", "fontconfig", "pangoft2-1.0")]
        def bind(name, library, result, *args):
            fn = getattr(library, name)
            fn.restype, fn.argtypes = result, args
            setattr(self, name, fn)
        for name, result, args in [
            ("pango_layout_get_context", v, (v,)), ("pango_context_set_round_glyph_positions", None, (v, i)),
            ("pango_layout_set_width", None, (v, i)), ("pango_layout_set_alignment", None, (v, i)),
            ("pango_layout_set_markup", None, (v, s, i)), ("pango_layout_get_text", s, (v,)),
            ("pango_layout_get_line_count", i, (v,)), ("pango_layout_get_iter", v, (v,)),
            ("pango_layout_iter_free", None, (v,)), ("pango_layout_iter_next_run", i, (v,)),
            ("pango_layout_iter_get_run_readonly", ptr(Run), (v,)),
            ("pango_layout_iter_get_line_readonly", v, (v,)),
            ("pango_layout_iter_get_line_extents", None, (v, ptr(Rect), ptr(Rect))),
            ("pango_layout_iter_get_baseline", i, (v,)),
            ("pango_layout_line_get_start_index", i, (v,)), ("pango_layout_line_get_length", i, (v,)),
            ("pango_layout_get_extents", None, (v, ptr(Rect), ptr(Rect))),
            ("pango_font_get_glyph_extents", None, (v, c.c_uint, ptr(Rect), ptr(Rect))),
            ("pango_font_describe", v, (v,)), ("pango_font_description_new", v, ()),
            ("pango_font_description_to_string", v, (v,)), ("pango_font_description_free", None, (v,)),
            ("pango_font_description_set_size", None, (v, i)),
            ("pango_font_description_set_family", None, (v, s)),
            ("pango_font_description_set_weight", None, (v, i)),
            ("pango_font_description_set_style", None, (v, i)),
            ("pango_font_description_get_family", s, (v,)),
            ("pango_font_description_get_weight", i, (v,)),
            ("pango_font_description_get_style", i, (v,)),
            ("pango_layout_set_font_description", None, (v, v)),
            ("pango_font_map_list_families", None, (v, ptr(ptr(v)), ptr(i))),
            ("pango_font_family_get_name", s, (v,)), ("pango_font_family_is_variable", i, (v,)),
            ("pango_font_family_list_faces", None, (v, ptr(ptr(v)), ptr(i))),
            ("pango_font_face_get_face_name", s, (v,)), ("pango_font_face_describe", v, (v,)),
            ("pango_font_face_is_synthesized", i, (v,))]:
            bind(name, p, result, *args)
        for name, library, result, args in [
            ("pango_cairo_create_layout", pc, v, (v,)), ("pango_cairo_show_layout", pc, None, (v, v)),
            ("pango_cairo_update_layout", pc, None, (v, v)), ("pango_cairo_font_map_get_default", pc, v, ()),
            ("cairo_svg_surface_create", ca, v, (s, c.c_double, c.c_double)),
            ("cairo_create", ca, v, (v,)), ("cairo_destroy", ca, None, (v,)),
            ("cairo_move_to", ca, None, (v, c.c_double, c.c_double)),
            ("cairo_surface_destroy", ca, None, (v,)), ("g_object_unref", go, None, (v,)),
            ("g_free", gl, None, (v,)), ("g_type_check_instance_is_a", go, i, (v, c.c_size_t)),
            ("pango_fc_font_get_type", pf, c.c_size_t, ()), ("pango_fc_font_get_pattern", pf, v, (v,)),
            ("FcPatternGetString", fc, i, (v, s, i, ptr(s))),
            ("FcPatternGetInteger", fc, i, (v, s, i, ptr(i))),
            ("FcConfigGetCurrent", fc, v, ()), ("FcConfigGetFonts", fc, ptr(FontSet), (v, i)),
            ("FcConfigGetFontDirs", fc, v, (v,)), ("FcStrListNext", fc, s, (v,)),
            ("FcStrListDone", fc, None, (v,)),
            ("FcConfigGetConfigFiles", fc, v, (v,)), ("FcConfigGetConfigDirs", fc, v, (v,)),
            ("pango_cairo_font_map_get_resolution", pc, c.c_double, (v,)),
            ("FcGetVersion", fc, i, ())]:
            bind(name, library, result, *args)
        self.hashes = {}  # (path, size, mtime_ns, inode, ctime_ns) -> sha256
        # path -> [size, mtime_ns, inode, ctime_ns, sha256] of the files met in this process:
        # what the companion keeps for the next start (fonts that went away are not in it)
        self.hashed = {}
        hb = lib("harfbuzz")
        bind("hb_version_string", hb, s)
        ft = lib("freetype")
        bind("FT_Init_FreeType", ft, i, ptr(v))
        bind("FT_Library_Version", ft, None, v, ptr(i), ptr(i), ptr(i))
        bind("FT_Done_FreeType", ft, i, v)
        ft_library, major, minor, patch = v(), i(), i(), i()
        if self.FT_Init_FreeType(c.byref(ft_library)):
            raise RuntimeError("FreeType version probe failed.")
        try:
            self.FT_Library_Version(ft_library, c.byref(major), c.byref(minor), c.byref(patch))
            self.freetype_version = f"{major.value}.{minor.value}.{patch.value}"
        finally:
            self.FT_Done_FreeType(ft_library)

    def _strings(self, values):
        result = []
        try:
            while True:
                value = self.FcStrListNext(values)
                if not value:
                    return result
                result.append(value.decode())
        finally:
            self.FcStrListDone(values)

    def file_hash(self, path):
        """The digest of a font file. A file that is the one a digest was already taken of (in
        this process, or handed down by the companion) is not read: the same path, size,
        modification time, inode and change time. The change time cannot be set by hand, so a
        font put in the place of another with its size and date is read again."""
        stat = os.stat(path)
        identity = (path, stat.st_size, stat.st_mtime_ns, stat.st_ino, stat.st_ctime_ns)
        if identity not in self.hashes:
            if stat.st_size > 256 * 1024 * 1024:
                raise ValueError("Resolved font exceeds the supported file-size limit.")
            digest = hashlib.sha256()
            with open(path, "rb") as fh:
                for chunk in iter(lambda: fh.read(65536), b""):
                    digest.update(chunk)
            self.hashes[identity] = digest.hexdigest()
        self.hashed[path] = [*identity[1:], self.hashes[identity]]
        return self.hashes[identity]

    def font_digest(self, path):
        """``file_hash`` for the font environment. A font that cannot be read (it went away since
        Fontconfig listed it, or its name is not UTF-8 and cannot be spelled here) is a font of
        unknown content, and no reason for the worker not to start: a text that resolves to it
        fails by itself."""
        try:
            return self.file_hash(path)
        except OSError:
            return "unreadable"

    def load_hashes(self, path):
        """Take the digests the companion kept from earlier starts of this library's worker."""
        table = _font_hash_table(_read_json_file(path, MAX_FONT_HASHES_BYTES))
        for name, (size, mtime, inode, ctime, digest) in table.items():
            self.hashes[(name, size, mtime, inode, ctime)] = digest

    def portable_font_state(self):
        fonts = []
        for kind in (0, 1):
            fontset = self.FcConfigGetFonts(self.FcConfigGetCurrent(), kind)
            if not fontset:
                continue
            for j in range(min(fontset.contents.count, 20000)):
                pattern = fontset.contents.fonts[j]
                path, index = self._pattern_string(pattern, "file"), self.c.c_int()
                self.FcPatternGetInteger(pattern, b"index", 0, self.c.byref(index))
                fonts.append((self.font_digest(path), index.value, self._pattern_string(pattern, "fontvariations")))
        configs = []
        for path in self._strings(self.FcConfigGetConfigFiles(self.FcConfigGetCurrent())):
            if os.path.isdir(path):
                continue
            with open(path, "rb") as fh:
                data = fh.read(1024 * 1024 + 1)
            if len(data) > 1024 * 1024:
                raise ValueError("Font configuration file exceeds the supported size limit.")
            root = ET.fromstring(data)
            # Included files are enumerated individually by Fontconfig. Directory/include/cache
            # path spellings are local discovery data, not portable font identities.
            for parent in root.iter():
                parent.text = (parent.text or "").strip() or None
                parent.tail = None
                for child in list(parent):
                    if child.tag in ("dir", "cachedir", "include", "reset-dirs"):
                        parent.remove(child)
            configs.append(hashlib.sha256(ET.tostring(root)).hexdigest())
        return {"fonts": sorted(set(fonts)), "configuration": configs}

    def _pattern_string(self, pattern, key):
        out = self.c.c_char_p()
        return (out.value.decode("utf-8", "replace") if self.FcPatternGetString(
            pattern, key.encode(), 0, self.c.byref(out)) == 0 and out.value else "")

    def font_state(self):
        state = []
        for kind in (0, 1):
            fontset = self.FcConfigGetFonts(self.FcConfigGetCurrent(), kind)
            if not fontset:
                continue
            for j in range(min(fontset.contents.count, 20000)):
                path = self._pattern_string(fontset.contents.fonts[j], "file")
                try:
                    stat = os.stat(path)
                    state.append((path, stat.st_size, stat.st_mtime_ns))
                except OSError:
                    state.append((path, None, None))
        roots = self._strings(self.FcConfigGetFontDirs(self.FcConfigGetCurrent()))
        roots += self._strings(self.FcConfigGetConfigDirs(self.FcConfigGetCurrent()))
        for path in self._strings(self.FcConfigGetConfigFiles(self.FcConfigGetCurrent())):
            stat = os.stat(path)
            state.append((path, stat.st_size, stat.st_mtime_ns))
        seen = set()
        for root in roots:
            for directory, _, _ in os.walk(root):
                if directory in seen:
                    continue
                seen.add(directory)
                if len(seen) > 4096:
                    raise ValueError("Font directory count exceeds the supported limit.")
                try:
                    stat = os.stat(directory)
                    state.append((directory, -1, stat.st_mtime_ns))
                except OSError:
                    state.append((directory, None, None))
        return sorted(set(state))

    def catalog(self):
        c = self.c
        families, count = c.POINTER(c.c_void_p)(), c.c_int()
        self.pango_font_map_list_families(self.pango_cairo_font_map_get_default(), c.byref(families), c.byref(count))
        result = []
        try:
            if count.value > 4096:
                raise ValueError("Font catalog exceeds the family limit.")
            for j in range(count.value):
                family = families[j]
                faces, nf = c.POINTER(c.c_void_p)(), c.c_int()
                self.pango_font_family_list_faces(family, c.byref(faces), c.byref(nf))
                entries = []
                try:
                    for k in range(min(nf.value, 128)):
                        desc = self.pango_font_face_describe(faces[k])
                        entries.append({"name": self.pango_font_face_get_face_name(faces[k]).decode(),
                            "weight": str(self.pango_font_description_get_weight(desc)),
                            "slant": {0: "normal", 1: "oblique", 2: "italic"}.get(
                                self.pango_font_description_get_style(desc), "normal"),
                            "synthetic": bool(self.pango_font_face_is_synthesized(faces[k]))})
                        self.pango_font_description_free(desc)
                finally:
                    self.g_free(faces)
                result.append({"family": self.pango_font_family_get_name(family).decode(),
                               "variable": bool(self.pango_font_family_is_variable(family)),
                               "faces": sorted(entries, key=lambda face: (face["name"], face["weight"], face["slant"]))})
        finally:
            self.g_free(families)
        return sorted(result, key=lambda f: f["family"].casefold())

    def resolved_font(self, font):
        c = self.c
        if not self.g_type_check_instance_is_a(font, self.pango_fc_font_get_type()):
            raise ValueError("The resolved font does not use the supported Fontconfig backend.")
        pattern = self.pango_fc_font_get_pattern(font)
        path, index = self._pattern_string(pattern, "file"), c.c_int()
        face_index = index.value if self.FcPatternGetInteger(pattern, b"index", 0, c.byref(index)) == 0 else 0
        font_hash = self.file_hash(path)
        desc = self.pango_font_describe(font)
        desc_text = self.pango_font_description_to_string(desc)
        try:
            return {"family": self.pango_font_description_get_family(desc).decode(),
                    "face": c.string_at(desc_text).decode(),
                    "weight": str(self.pango_font_description_get_weight(desc)),
                    "slant": {0: "normal", 1: "oblique", 2: "italic"}.get(
                        self.pango_font_description_get_style(desc), "normal"),
                    "fontHash": font_hash, "faceIndex": face_index, "ranges": []}
        finally:
            self.g_free(desc_text)
            self.pango_font_description_free(desc)

    def layouts(self, specifications, filename):
        """Render the same settings/markup as Text and retain unmodified shaping clusters."""
        c, R = self.c, self.Rect
        surface = self.cairo_svg_surface_create(filename.encode(), 16384, 16384)
        cr = self.cairo_create(surface)
        layout = self.pango_cairo_create_layout(cr)
        result = {"glyphs": [], "fonts": [], "lines": [], "logical": [], "unsupported": []}
        try:
            self.pango_context_set_round_glyph_positions(self.pango_layout_get_context(layout), 0)
            for spec in specifications:
                desc = self.pango_font_description_new()
                self.pango_font_description_set_size(desc, round(spec["size"] * 1024))
                if spec["font"]:
                    self.pango_font_description_set_family(desc, spec["font"].encode())
                self.pango_font_description_set_weight(desc, spec["weight"])
                self.pango_font_description_set_style(desc, spec["slant"])
                self.pango_layout_set_font_description(layout, desc)
                self.pango_font_description_free(desc)
                self.pango_layout_set_width(layout, spec["width"] * 1024)
                self.pango_layout_set_alignment(layout, 0)
                self.cairo_move_to(cr, *spec["origin"])
                self.pango_cairo_update_layout(cr, layout)
                self.pango_layout_set_markup(layout, spec["markup"].encode(), -1)
                text = self.pango_layout_get_text(layout).decode()
                if text != spec["text"]:
                    raise ValueError("Pango markup source differs from the requested plain text.")
                if self.pango_layout_get_line_count(layout) > MAX_TEXT_LINES:
                    raise ValueError("Native text layout exceeds the line limit.")
                if spec["single"] and self.pango_layout_get_line_count(layout) > 1:
                    raise ValueError("A source line exceeds the CE native line width; insert a line break.")
                byte_to_cp, offset = {0: 0}, 0
                for j, char in enumerate(text):
                    offset += len(char.encode())
                    byte_to_cp[offset] = j + 1
                def span(start, end):
                    a, b = byte_to_cp[start], byte_to_cp[end]
                    mapping = spec["mapping"]
                    return {"start": mapping[a][0] if a < len(mapping) else spec["end"],
                            "end": mapping[b - 1][1] if b > a else (
                                mapping[a][0] if a < len(mapping) else spec["end"])}
                def rect(r):
                    x, y = spec["origin"]
                    return [x + r.x / 1024, y + r.y / 1024,
                            x + (r.x + r.width) / 1024, y + (r.y + r.height) / 1024]
                ink, logical = R(), R()
                self.pango_layout_get_extents(layout, c.byref(ink), c.byref(logical))
                result["logical"].append(rect(logical))
                iterator = self.pango_layout_get_iter(layout)
                seen_lines = set()
                try:
                    while True:
                        line = self.pango_layout_iter_get_line_readonly(iterator)
                        if line and line not in seen_lines:
                            seen_lines.add(line)
                            start = self.pango_layout_line_get_start_index(line)
                            end = start + self.pango_layout_line_get_length(line)
                            ri, rl = R(), R()
                            self.pango_layout_iter_get_line_extents(iterator, c.byref(ri), c.byref(rl))
                            result["lines"].append({**span(start, end), "rect": rect(rl),
                                "baseline": spec["origin"][1] + self.pango_layout_iter_get_baseline(iterator) / 1024})
                        runptr = self.pango_layout_iter_get_run_readonly(iterator)
                        if runptr:
                            item, glyphs = runptr.contents.item.contents, runptr.contents.glyphs.contents
                            font = self.resolved_font(item.analysis.font)
                            font["ranges"].append(span(item.offset, item.offset + item.length))
                            result["fonts"].append(font)
                            starts = sorted(set(glyphs.clusters[j] for j in range(glyphs.count)))
                            ends = dict(zip(starts, starts[1:] + [item.length]))
                            for j in range(glyphs.count):
                                glyph = glyphs.glyphs[j]
                                cluster = glyphs.clusters[j]
                                source_range = span(item.offset + cluster, item.offset + ends[cluster])
                                if glyph.glyph & 0x10000000 or glyph.flags & 2:
                                    result["unsupported"].append(source_range)
                                gi, gl = R(), R()
                                self.pango_font_get_glyph_extents(item.analysis.font, glyph.glyph,
                                                                 c.byref(gi), c.byref(gl))
                                if gi.width or gi.height:
                                    result["glyphs"].append(source_range)
                        if not self.pango_layout_iter_next_run(iterator):
                            break
                finally:
                    self.pango_layout_iter_free(iterator)
                self.pango_cairo_show_layout(cr, layout)
            return result
        finally:
            self.g_object_unref(layout)
            self.cairo_destroy(cr)
            self.cairo_surface_destroy(surface)


def _pango_svg_signature(svg: str):
    root = ET.fromstring(svg)
    if any(node.tag.rsplit("}", 1)[-1] == "image" for node in root.iter()):
        raise ValueError("Color or bitmap glyphs are not supported by the native text outline adapter.")
    ids = {node.get("id"): node for node in root.iter() if node.get("id")}
    result = []
    for node in root.iter():
        if node.tag.rsplit("}", 1)[-1] != "use":
            continue
        ref = node.get("{http://www.w3.org/1999/xlink}href", node.get("href", ""))
        target = ids.get(ref.lstrip("#"))
        paths = []
        if target is not None:
            for path in target.iter():
                if path.tag.rsplit("}", 1)[-1] == "path":
                    d = re.sub(r"Z\s+M\s+[^A-Za-z]*$", "Z", path.get("d", "")).strip()
                    paths.append(" ".join(d.split()))
        result.append((paths, node.get("x"), node.get("y"), node.get("transform")))
    return result


class _NativeText:
    def __init__(self, target):
        import manimpango
        self.target, self.mp = target, manimpango
        sys.argv = [sys.argv[0]]  # ManimGL parses process arguments at import.
        with open("custom_config.yml", "w", encoding="utf-8") as fh:
            fh.write('directories:\n  cache: "gl-cache"\n')
        if target == "ce":
            import manim as engine
            from manim.mobject.text import text_mobject as tm
            engine.config.media_dir = "media"
            engine.config.text_dir = "text"
            engine.config.pixel_width, engine.config.pixel_height = 1920, 1080
            self.scale = tm.TEXT_MOB_SCALE_FACTOR
        else:
            import manimlib as engine
            from manimlib.mobject.svg import text_mobject as tm
            self.scale = tm.get_text_mob_scale_factor()
        self.engine, self.tm, self.api = engine, tm, _PangoAPI()
        class TextWithLayoutOrigin(tm.Text):
            def center(self):
                self._mfe_layout_center = self.get_center().copy()
                return super().center()
        self.Text = TextWithLayoutOrigin
        self.fonts = self.api.catalog()
        self.versions = {"manimpango": manimpango.__version__, "pango": manimpango.pango_version(),
                         "cairo": manimpango.cairo_version(), "manim": getattr(engine, "__version__", "unknown"),
                         "adapter": PANGO_ADAPTER_VERSION, "ceViewport": "1920x1080"}
        self.versions.update({"locale": os.environ.get("LC_ALL") or os.environ.get("LANG") or "C",
            "direction": "auto-left", "roundGlyphPositions": "false", "fontconfig": str(self.api.FcGetVersion()),
            "dpi": str(self.api.pango_cairo_font_map_get_resolution(self.api.pango_cairo_font_map_get_default())),
            "fontOptions": "cairo-svg-default"})
        import importlib
        import importlib.metadata
        self.versions.update({"harfbuzz": self.api.hb_version_string().decode(),
                              "freetype": self.api.freetype_version,
                              "python": sys.version.split()[0],
                              "numpy": importlib.metadata.version("numpy"),
                              "svgelements": importlib.metadata.version("svgelements")})
        implementation = {}
        prefix = "manim" if target == "ce" else "manimlib"
        for module_name in (prefix + ".mobject.svg.svg_mobject", prefix + ".mobject.types.vectorized_mobject",
                            prefix + ".mobject.mobject", prefix + ".utils.bezier", "manimpango.cmanimpango"):
            with open(importlib.import_module(module_name).__file__, "rb") as fh:
                implementation[module_name] = hashlib.sha256(fh.read()).hexdigest()
        self.versions["geometryImplementation"] = _text_digest(implementation)
        with open(tm.__file__, "rb") as fh:
            self.versions["textImplementation"] = hashlib.sha256(fh.read()).hexdigest()
        self.font_state = self.api.font_state()
        # Every font file of the machine is part of the environment. The companion hands down
        # the digests this library's worker took before (FONT_HASHES_FILE, in this working
        # directory) and gets the table of this start with the first catalog: only new or changed
        # files are read.
        self.api.load_hashes(FONT_HASHES_FILE)
        self.environment = _text_digest([target, self.versions, self.scale,
                                         self.api.portable_font_state(), self.fonts])
        self.report_hashes = True  # with the first catalog, once
        self.cache = collections.OrderedDict()
        self.cache_bytes = 0
        self.count = 0

    def maintain(self):
        self.count += 1
        if self.count % 8:
            return
        if self.target == "gl":
            from manimlib.mobject.svg import svg_mobject
            from manimlib.utils import cache
            svg_mobject.SVG_HASH_TO_MOB_MAP.clear()
            svg_mobject.PATH_TO_POINTS.clear()
            self.tm.markup_to_svg.cache_clear()
            cache.clear_cache()
        else:
            shutil.rmtree("text", ignore_errors=True)

    def catalog(self):
        if self.api.font_state() != self.font_state:
            return _text_failure("font-environment-changed", "The native font environment changed; restart the text worker.")
        return {"ok": True, "target": self.target, "adapterVersion": PANGO_ADAPTER_VERSION,
                "environmentKey": self.environment, "fonts": self.fonts,
                "limits": {"sourceBytes": MAX_TEXT_BYTES, "lines": MAX_TEXT_LINES,
                           "glyphs": MAX_TEXT_GLYPHS, "points": MAX_TEXT_POINTS}}

    def shape(self, request):
        from xml.sax.saxutils import escape
        self.maintain()
        source, font, size = request["source"], request["font"], request["fontSize"]
        if self.api.font_state() != self.font_state:
            return _text_failure("font-environment-changed", "The native font environment changed; refresh the font catalog.")
        if font["family"] not in {f["family"] for f in self.fonts}:
            return _text_failure("missing-font", "The requested font family is not available in this native environment.")
        basis = {k: request[k] for k in ("source", "target", "font", "fontSize")}
        key = "pango-" + _text_digest([self.environment, basis])
        if key in self.cache:
            result = self.cache.pop(key)
            self.cache[key] = result
            return {**result, "cached": True, "ms": 0}
        started = time.monotonic()
        kwargs = dict(font=font["family"], font_size=size, weight=font["weight"].upper(),
                      slant=font["slant"].upper(), disable_ligatures=False)
        if self.target == "gl":
            kwargs["alignment"] = "LEFT"
        mob = self.Text(source, **kwargs)
        center = mob._mfe_layout_center
        offsets, offset = [], 0
        for char in source:
            length = len(char.encode("utf-16-le")) // 2
            offsets.append((offset, offset + length))
            offset += length
        specs = []
        if self.target == "ce":
            text, mapping = "", []
            for char, source_range in zip(source, offsets):
                expanded = "    " if char == "\t" else char
                text += expanded
                mapping.extend([source_range] * len(expanded))
            old_text, mob.text = mob.text, text
            settings = mob._text2settings("#FFFFFF")
            mob.text = old_text
            for setting in settings:
                part = text[setting.start:setting.end].replace("\n", " ")
                specs.append({"text": part, "markup": escape(part), "size": size / self.tm.TEXT2SVG_ADJUSTMENT_FACTOR,
                    "font": font["family"], "weight": 700 if font["weight"] == "bold" else 400,
                    "slant": 2 if font["slant"] == "italic" else 0, "width": 1920,
                    "origin": [self.tm.START_X, self.tm.START_Y + mob.line_spacing /
                               self.tm.TEXT2SVG_ADJUSTMENT_FACTOR * setting.line_num],
                    "mapping": mapping[setting.start:setting.end], "end": offset, "single": True})
            with open(mob.file_name, encoding="utf-8") as fh:
                actual_svg = fh.read()
        else:
            specs.append({"text": source, "markup": mob.content, "size": 1, "font": "",
                          "weight": 400, "slant": 0, "width": -1, "origin": [0, 0],
                          "mapping": offsets, "end": offset, "single": False})
            actual_svg = mob.svg_string
        metadata = self.api.layouts(specs, "mapping.svg")
        if metadata["unsupported"]:
            return _text_failure("unsupported-glyph", "Missing, bitmap or color glyphs cannot be exported as native contours.",
                                 metadata["unsupported"])
        with open("mapping.svg", encoding="utf-8") as fh:
            mapping_svg = fh.read()
        if _pango_svg_signature(actual_svg) != _pango_svg_signature(mapping_svg):
            return _text_failure("mapping-mismatch", "The native source mapping did not match the exported Text layout.")
        children = [part for part in mob.submobjects if len(part.get_points() if self.target == "gl" else part.points)]
        if len(children) != len(metadata["glyphs"]):
            return _text_failure("mapping-mismatch", "Native drawable membership did not match the shaped glyph mapping.")
        if len(children) > MAX_TEXT_GLYPHS:
            return _text_failure("too-large", "Text exceeds the drawable glyph limit.")
        glyphs, all_points, point_count = [], [], 0
        encoded = source.encode("utf-16-le")
        for index, (child, source_range) in enumerate(zip(children, metadata["glyphs"])):
            points = child.get_points() if self.target == "gl" else child.points
            point_count += len(points)
            if point_count > MAX_TEXT_POINTS:
                return _text_failure("too-large", "Text exceeds the contour point limit.")
            xy = [[float(p[0]), float(p[1])] for p in points]
            all_points.extend(xy)
            glyphs.append({"index": index, "label": encoded[2 * source_range["start"]:2 * source_range["end"]].decode("utf-16-le"),
                           "kind": "char", "contours": _pango_contours(child, self.target),
                           "bbox": _text_box(xy), "sourceRanges": [source_range]})
        def scene_rect(rect):
            x0, y0, x1, y1 = rect
            return {"minX": (x0 - float(center[0])) * self.scale,
                    "maxX": (x1 - float(center[0])) * self.scale,
                    # Both native SVG importers flip about the content center, keeping its
                    # positive SVG y coordinate until center() subsequently translates it.
                    "minY": (float(center[1]) - y1) * self.scale,
                    "maxY": (float(center[1]) - y0) * self.scale}
        logical = [scene_rect(r) for r in metadata["logical"]]
        logical_box = _text_box([[b[x], b[y]] for b in logical for x, y in
                                 (("minX", "minY"), ("maxX", "maxY"))])
        lines = [{"start": line["start"], "end": line["end"], "bbox": scene_rect(line["rect"]),
                  "baseline": (float(center[1]) - line["baseline"]) * self.scale} for line in metadata["lines"]]
        resolved = {}
        for entry in metadata["fonts"]:
            font_key = (entry["family"], entry["face"], entry["fontHash"], entry["faceIndex"])
            if font_key in resolved:
                resolved[font_key]["ranges"].extend(entry["ranges"])
            else:
                resolved[font_key] = entry
        result = {"ok": True, "target": self.target, "adapterVersion": PANGO_ADAPTER_VERSION,
                  "environmentKey": self.environment, "requestKey": key,
                  "glyphs": glyphs, "bbox": _text_box(all_points), "logicalBBox": logical_box,
                  "lines": lines, "provenance": {"environmentKey": self.environment,
                      "adapterVersion": PANGO_ADAPTER_VERSION, "versions": self.versions,
                      "calibration": self.scale, "resolvedFonts": list(resolved.values()),
                      "geometrySignature": _pango_geometry_signature([g["contours"] for g in glyphs])},
                  "diagnostics": [], "warnings": [], "cached": False,
                  "ms": max(1, round((time.monotonic() - started) * 1000))}
        result["requestKey"] = "pango-" + _text_digest([self.environment, basis,
            result["provenance"]["geometrySignature"], result["provenance"]["resolvedFonts"]])
        data = json.dumps(result, ensure_ascii=False, allow_nan=False).encode()
        if len(data) > MAX_TEXT_OUTPUT_BYTES - 1024:
            return _text_failure("too-large", "Text output exceeds the response byte limit.")
        self.cache[key] = result
        self.cache_bytes += len(data)
        while len(self.cache) > 16 or self.cache_bytes > 32 * 1024 * 1024:
            _, old = self.cache.popitem(last=False)
            self.cache_bytes -= len(json.dumps(old, ensure_ascii=False).encode())
        return result


def _pango_worker_main(target: str) -> int:
    # Keep the protocol separate from native libraries that print to stdout during import.
    protocol = os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8", buffering=1)
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    worker = None
    while True:
        line = sys.stdin.buffer.readline(MAX_BODY_BYTES + 1)
        if not line or len(line) > MAX_BODY_BYTES:
            return 0
        try:
            request = json.loads(line)
            if worker is None:
                worker = _NativeText(target)
                # Limit additional address space after native imports; each request also has
                # a supervising wall-clock deadline and bounded input/output/point budgets.
                import resource
                with open("/proc/self/statm", encoding="ascii") as fh:
                    virtual_bytes = int(fh.read().split()[0]) * os.sysconf("SC_PAGE_SIZE")
                memory_limit = virtual_bytes + 512 * 1024 * 1024
                resource.setrlimit(resource.RLIMIT_AS, (memory_limit, memory_limit))
                resource.setrlimit(resource.RLIMIT_FSIZE, (64 * 1024 * 1024, 64 * 1024 * 1024))
            if request["operation"] == "fonts":
                result = worker.catalog()
                if result.get("ok") and worker.report_hashes:
                    worker.report_hashes = False
                    result = {**result, "fontHashes": worker.api.hashed}
            elif request["operation"] == "text":
                result = worker.shape(validate_text_request(request["payload"]))
            else:
                result = _text_failure("invalid-operation", "Unknown native text operation.")
        except Exception as exc:
            result = _text_failure("native-text-error", str(exc)[:1000])
        protocol.write(json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n")
        protocol.flush()


# ---------------------------------------------------------------------------------------------
# 7. HTTP server
# ---------------------------------------------------------------------------------------------


class CompanionServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name == "posix"
    # Connections not yet accepted wait in a queue: socketserver's is 5, a browser opens 6 to one
    # host, and past the queue Windows refuses a connection outright (Linux lets it wait).
    request_queue_size = 64

    def __init__(self, companion: Companion, port: int = DEFAULT_PORT, verbose: bool = False,
                 allow_file_origin: bool = False, app_dir: str | None = None):
        self.companion = companion
        self.verbose = verbose
        self.allow_file_origin = allow_file_origin  # accept the "null" origin (file://)
        # The built app to serve under /app/ (`serve --app DIR`), resolved; None = API only.
        self.app_dir = os.path.realpath(app_dir) if app_dir else None
        super().__init__(("127.0.0.1", port), _Handler)

    @property
    def port(self) -> int:
        return self.server_address[1]


# The types of what a build of the app holds, by extension. Not ``mimetypes``: on Windows it asks
# the registry first, where any program may have registered another type for an extension (.js as
# text/plain is a known one), and a script served so is refused by the browser under ``nosniff``.
_APP_TYPES = {
    ".html": "text/html", ".htm": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
    ".css": "text/css", ".json": "application/json", ".map": "application/json",
    ".svg": "image/svg+xml", ".txt": "text/plain", ".md": "text/markdown", ".xml": "application/xml",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon",
    ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
    ".wav": "audio/wav", ".ogg": "audio/ogg", ".wasm": "application/wasm", ".pdf": "application/pdf",
}
_APP_TEXT = ("application/json", "application/xml", "image/svg+xml")


def _app_type(path: str) -> str:
    """The Content-Type of a file of the built app: by its extension, text as UTF-8."""
    mime = _APP_TYPES.get(os.path.splitext(path)[1].lower(), "application/octet-stream")
    return mime + "; charset=utf-8" if mime.startswith("text/") or mime in _APP_TEXT else mime


# What `_Handler._read_json` gives when it has answered the request itself (a body too large, or
# that is not JSON): the route has nothing left to do. None could not say it: `null` is JSON.
_ANSWERED: Any = object()


class _Handler(BaseHTTPRequestHandler):
    server: CompanionServer
    server_version = f"{NAME}/{VERSION}"
    sys_version = ""
    timeout = 30  # seconds a client may stall while sending a request
    _cors_blocked = False  # True once the Host check failed: such answers get no CORS headers

    # ----- plumbing -----------------------------------------------------------------------------

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - signature of the base class
        if self.server.verbose:
            sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))

    def _allowed_hosts(self) -> set[str]:
        port = self.server.port
        hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        if port == 80:
            hosts |= {"127.0.0.1", "localhost"}
        return hosts

    def _cors_headers(self) -> list[tuple[str, str]]:
        if self._cors_blocked:
            return []
        origin = self.headers.get("Origin")
        if origin is not None and self._origin_allowed(origin):
            return [("Access-Control-Allow-Origin", origin), ("Vary", "Origin")]
        return []

    def _origin_allowed(self, origin: str) -> bool:
        if origin == "null":
            return self.server.allow_file_origin
        return ORIGIN_RE.fullmatch(origin) is not None

    def _send(self, status: int, payload: Any = None, headers: list[tuple[str, str]] | None = None) -> None:
        body = b"" if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        if payload is not None:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        if status != 204:  # a 204 response must not carry Content-Length
            self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Connection", "close")
        for name, value in [*self._cors_headers(), *(headers or [])]:
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)
        self.close_connection = True

    def _fail(self, status: int, message: str, headers: list[tuple[str, str]] | None = None) -> None:
        self._send(status, error_response(message), headers)

    # ----- routing ------------------------------------------------------------------------------

    def _dispatch(self) -> None:
        # DNS-rebinding protection: only our own address may be used as Host
        host = (self.headers.get("Host") or "").strip().lower()
        if host not in self._allowed_hosts():
            self._cors_blocked = True
            return self._fail(403, "Host not allowed.")
        origin = self.headers.get("Origin")
        if origin is not None and not self._origin_allowed(origin):
            return self._fail(403, "Origin not allowed.")

        split = urlsplit(self.path)
        path, method = split.path, self.command
        route = self._route(path)
        if route is None:
            return self._fail(404, "Unknown path.")
        name, job_id, allowed = route
        if method == "OPTIONS":
            return self._preflight(path)
        if method not in allowed:
            return self._fail(405, "Method not allowed.", [("Allow", ", ".join([*allowed, "OPTIONS"]))])
        try:
            if name == "app":
                self._serve_app(path)
            else:
                self._handle(name, method, job_id, split.query)
        except JobError as exc:
            self._send(exc.status, error_response(exc.message, None, exc.log))
        except (BrokenPipeError, ConnectionError):
            self.close_connection = True
        except Exception as exc:  # defensive: never leave the client hanging
            self._fail(500, f"Internal error: {exc}")

    _JOB_ROUTES: dict[str, tuple[str, tuple[str, ...]]] = {
        "": ("{}", ("GET", "DELETE")),
        "/frames": ("{}-frames", ("POST",)),
        "/audio": ("{}-audio", ("POST",)),
        "/finish": ("{}-finish", ("POST",)),
        "/result": ("{}-result", ("GET",)),
    }

    def _route(self, path: str) -> tuple[str, str | None, tuple[str, ...]] | None:
        """(route name, job id, allowed methods) of a path, or None for an unknown one."""
        if path == "/health":
            return "health", None, ("GET",)
        if path == "/tex":
            return "tex", None, ("POST",)
        if path == "/fonts":
            return "fonts", None, ("GET",)
        if path == "/text":
            return "text", None, ("POST",)
        if path.startswith("/text/") and TEXT_REQUEST_ID_RE.fullmatch(path[len("/text/"):]):
            return "text-cancel", path[len("/text/"):], ("DELETE",)
        if path == "/video":
            return "video-create", None, ("POST",)
        if path == "/manim-render":
            return "manim-create", None, ("POST",)
        m = re.fullmatch(r"/(video|manim-render)/([0-9a-f]{32})(/frames|/audio|/finish|/result)?", path)
        if m:
            kind = "video" if m.group(1) == "video" else "manim"
            template, methods = self._JOB_ROUTES[m.group(3) or ""]
            if kind == "manim" and m.group(3) in ("/frames", "/finish"):
                return None
            return template.format(kind), m.group(2), methods
        if self.server.app_dir is not None and (path in ("/", "/app") or path.startswith("/app/")):
            return "app", None, ("GET", "HEAD")
        return None

    # ----- the built app (serve --app DIR) ------------------------------------------------------

    def _serve_app(self, path: str) -> None:
        """A file of the built app, under /app/ (a directory gives its index.html); / sends there."""
        base = self.server.app_dir
        assert base is not None
        if path in ("/", "/app"):
            return self._send(302, None, [("Location", "/app/")])
        parts = unquote(path[len("/app/"):]).split("/")
        if parts[-1] == "":
            parts[-1] = "index.html"
        if any(part in ("", ".", "..") or part.startswith(".") for part in parts):
            return self._fail(404, "No such file.")
        # Symbolic links are resolved first: nothing outside DIR is served, however it is reached.
        full = os.path.realpath(os.path.join(base, *parts))
        if full != base and not full.startswith(base + os.sep):
            return self._fail(404, "No such file.")
        if os.path.isdir(full):
            return self._send(302, None, [("Location", path + "/")])
        try:
            size = os.path.getsize(full)
            fh = open(full, "rb")
        except OSError:
            return self._fail(404, "No such file.")
        with fh:
            self.send_response(200)
            self.send_header("Content-Type", _app_type(full))
            self.send_header("Content-Length", str(size))
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Connection", "close")
            self.end_headers()
            if self.command != "HEAD":
                shutil.copyfileobj(fh, self.wfile, 256 * 1024)
        self.close_connection = True

    def _handle(self, name: str, method: str, job_id: str | None, query: str) -> None:
        companion = self.server.companion
        if name == "health":
            return self._send(200, companion.health())
        if name == "tex":
            return self._tex()
        if name == "fonts":
            params = parse_qs(query)
            target = params.get("target", [""])[0]
            return self._send(200, companion.pango.fonts(target))
        if name == "text":
            obj = self._read_json()
            if obj is _ANSWERED:
                return
            try:
                request = validate_text_request(obj)
            except RequestError as exc:
                return self._fail(exc.status, exc.message)
            return self._send(200, companion.pango.render(request))
        if name == "text-cancel":
            companion.pango.cancel(job_id)
            return self._send(200, {"ok": True, "requestId": job_id, "state": "cancelled"})
        if name == "video-create":
            return self._create_video()
        if name == "manim-create":
            return self._create_manim()
        assert job_id is not None
        kind = "video" if name.startswith("video") else "manim"
        job = companion.jobs.get(kind, job_id)
        if job is None:
            if name.endswith(("-frames", "-audio")):
                self._drain_request()
            return self._fail(404, "No such job (it may have expired or been cancelled).")
        if method == "DELETE":
            companion.jobs.remove(kind, job_id)
            return self._send(200, {"ok": True, "id": job_id, "state": "cancelled"})
        if name.endswith("-frames"):
            return self._video_frames(job, query)
        if name.endswith("-audio"):
            return self._job_audio(job, query)
        if name.endswith("-finish"):
            self._drain_request()
            return self._send(200, job.finish())  # type: ignore[attr-defined]
        if name.endswith("-result"):
            return self._send_result(job)
        return self._send(200, job.status())

    def _preflight(self, path: str) -> None:
        allowed = ["Content-Type"]
        requested = self.headers.get("Access-Control-Request-Headers", "")
        if re.fullmatch(r"[A-Za-z0-9\-, ]{1,200}", requested):  # echo plain header names only
            allowed += [h.strip() for h in requested.split(",") if h.strip() and h.strip().lower() != "content-type"]
        headers = [
            ("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS"),
            ("Access-Control-Allow-Headers", ", ".join(allowed)),
            ("Access-Control-Max-Age", "600"),
        ]
        if self.headers.get("Access-Control-Request-Private-Network", "").lower() == "true":
            headers.append(("Access-Control-Allow-Private-Network", "true"))
        self._send(204, None, headers)

    def _read_body(self, limit: int = MAX_BODY_BYTES) -> bytes | None:
        """Read the request body (<= ``limit``, 64 KB by default); answers the error itself and
        returns None on failure."""
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            self._fail(400, "Chunked request bodies are not supported.")
            return None
        raw = self.headers.get("Content-Length")
        if raw is None:
            self._fail(400, "Content-Length is required.")
            return None
        try:
            length = int(raw)
            if length < 0:
                raise ValueError
        except ValueError:
            self._fail(400, "Invalid Content-Length.")
            return None
        if length > limit:
            self._drain(length)
            self._fail(413, f"Request body larger than {limit} bytes.")
            return None
        body = self.rfile.read(length)
        if len(body) != length:
            self._fail(400, "Incomplete request body.")
            return None
        return body

    def _drain(self, length: int, limit: int = 1024 * 1024) -> None:
        """Swallow (a bounded part of) an oversized body so the client can read our answer."""
        remaining = min(length, limit)
        while remaining > 0:
            chunk = self.rfile.read(min(65536, remaining))
            if not chunk:
                break
            remaining -= len(chunk)

    def _tex(self) -> None:
        obj = self._read_json()
        if obj is _ANSWERED:
            return
        try:
            req = validate_request(obj)
        except RequestError as exc:
            return self._fail(exc.status, exc.message)
        try:
            result = self.server.companion.compile(req)
        except Exception as exc:  # defensive: never leave the client hanging
            return self._fail(500, f"Internal error: {exc}")
        self._send(200, result)

    # ----- jobs ---------------------------------------------------------------------------------

    def _read_json(self, limit: int = MAX_BODY_BYTES) -> Any:
        """The decoded JSON body, or `_ANSWERED` after answering the error here. A body may decode to
        None (the JSON `null`): it is given as any other, and the route's validator refuses it."""
        body = self._read_body(limit)
        if body is None:
            return _ANSWERED
        try:
            return json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            self._fail(400, "Request body is not valid JSON.")
            return _ANSWERED

    def _drain_request(self) -> None:
        """Swallow a small request body that a route does not use (keeps the client's send happy)."""
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return
        if length > 0:
            self._drain(length)

    def _create_video(self) -> None:
        companion = self.server.companion
        obj = self._read_json()
        if obj is _ANSWERED:
            return
        spec = validate_video_request(obj)
        ffmpeg = companion._tool("ffmpeg")
        if not ffmpeg:
            raise JobError(503, "ffmpeg is not installed (or not on PATH).")
        if spec.audio:
            self._require_audio_encoder(spec.format)
        self._require_room()
        with companion.jobs.creation_lock:
            if len(companion.jobs.active("video")) >= MAX_VIDEO_JOBS:
                raise JobError(429, f"At most {MAX_VIDEO_JOBS} video jobs can run at once.")
            job = VideoJob(companion.jobs, ffmpeg, spec)
            companion.jobs.add(job)
        self._send(201, {**job.status(), "maxRequestBytes": MAX_FRAMES_REQUEST_BYTES,
                         "maxFrameBytes": MAX_FRAME_BYTES, "maxVideoBytes": job.max_bytes,
                         **self._audio_limits(job)})

    def _require_room(self) -> None:
        """A job is not begun on a disk that is nearly full: it would be stopped at its first look."""
        problem = self.server.companion.jobs.room_problem()
        if problem:
            raise JobError(507, problem)

    def _require_audio_encoder(self, fmt: str) -> None:
        """A job with sound needs the audio encoder of its format in the installed ffmpeg."""
        if fmt not in self.server.companion.video_audio_formats():
            encoder, _, name = AUDIO_ENCODERS[fmt]
            raise JobError(503, f"The installed ffmpeg cannot encode {name} sound (it has no \"{encoder}\" "
                                "encoder).")

    @staticmethod
    def _audio_limits(job: Any) -> dict[str, int]:
        return {} if job.audio is None else {"maxAudioRequestBytes": MAX_AUDIO_REQUEST_BYTES}

    def _job_audio(self, job: Any, query: str) -> None:
        params = parse_qs(query, keep_blank_values=True)
        try:
            offset = int(params.get("offset", [""])[0])
            if offset < 0:
                raise ValueError
        except ValueError:
            self._drain_request()
            raise JobError(400, "Query parameter \"offset\" (position of the body in the WAV file) is required.")
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            raise JobError(400, "Chunked request bodies are not supported.")
        try:
            length = int(self.headers.get("Content-Length") or "")
            if length <= 0:
                raise ValueError
        except ValueError:
            raise JobError(400, "A positive Content-Length is required.") from None
        if length > MAX_AUDIO_REQUEST_BYTES:
            self._drain(length)
            raise JobError(413, f"Request body larger than {MAX_AUDIO_REQUEST_BYTES} bytes.")
        try:
            job.begin_audio(offset, length)
        except JobError:
            self._drain(length)
            raise
        job.feed_audio(self.rfile, length)
        self._send(200, job.status())

    def _video_frames(self, job: Any, query: str) -> None:
        params = parse_qs(query, keep_blank_values=True)
        try:
            first = int(params.get("first", [""])[0])
            if first < 0:
                raise ValueError
        except ValueError:
            self._drain_request()
            raise JobError(400, "Query parameter \"first\" (index of the first frame in the body) is required.")
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            raise JobError(400, "Chunked request bodies are not supported.")
        try:
            length = int(self.headers.get("Content-Length") or "")
            if length <= 0:
                raise ValueError
        except ValueError:
            raise JobError(400, "A positive Content-Length is required.") from None
        if length > MAX_FRAMES_REQUEST_BYTES:
            self._drain(length)
            raise JobError(413, f"Request body larger than {MAX_FRAMES_REQUEST_BYTES} bytes.")
        try:
            job.begin(first)
        except JobError:
            self._drain(length)
            raise
        count = job.feed(self.rfile, length)
        self._send(200, {**job.status(), "accepted": count})

    def _create_manim(self) -> None:
        companion = self.server.companion
        if not companion.allow_manim_render:
            self._drain_request()
            raise JobError(403, "Rendering with Manim is disabled. Start the companion with --allow-manim-render "
                                "to enable it (it runs the Python code it receives).")
        obj = self._read_json(MAX_CODE_BYTES + 4096)
        if obj is _ANSWERED:
            return
        spec = validate_manim_request(obj)
        if companion.manim_interpreter(spec.target) is None:
            name = "ManimCE (--ce-python)" if spec.target == "ce" else "ManimGL (--gl-python)"
            raise JobError(503, f"No usable interpreter for {name} is configured.")
        ffmpeg = None
        if spec.audio:
            ffmpeg = companion._tool("ffmpeg")
            if not ffmpeg:
                raise JobError(503, "ffmpeg is not installed (or not on PATH): it adds the sound to the video.")
            self._require_audio_encoder("mp4")
        self._require_room()
        with companion.jobs.creation_lock:
            if len(companion.jobs.active("manim")) >= MAX_MANIM_JOBS:
                raise JobError(429, "Another Manim render is still running.")
            job = ManimJob(companion.jobs, companion, spec, ffmpeg)
            companion.jobs.add(job)
        self._send(201, {**job.status(), **self._audio_limits(job)})

    def _send_result(self, job: Any) -> None:
        if job.state != "done" or not job.result_path:
            raise JobError(409, f"The job has no result (state: {job.state}).")
        try:  # the file itself: a link put in its place is not followed
            fd = _open_unfollowed(job.result_path)
        except OSError:
            raise JobError(410, "The result is gone.") from None
        fh = os.fdopen(fd, "rb")
        found = os.fstat(fd)
        if not stat.S_ISREG(found.st_mode):
            fh.close()
            raise JobError(410, "The result is gone.")
        size = found.st_size
        try:
            with fh:
                self.send_response(200)
                self.send_header("Content-Type", job.result_mime)
                self.send_header("Content-Length", str(size))
                self.send_header("Content-Disposition", f'attachment; filename="{job.result_name}"')
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Connection", "close")
                for name, value in self._cors_headers():
                    self.send_header(name, value)
                self.end_headers()
                shutil.copyfileobj(fh, self.wfile, 256 * 1024)
        finally:
            job._released()  # deleted while its result was being sent: see there
        self.close_connection = True

    do_GET = do_POST = do_OPTIONS = do_HEAD = do_PUT = do_DELETE = do_PATCH = _dispatch


def make_server(companion: Companion, port: int = DEFAULT_PORT, verbose: bool = False,
                allow_file_origin: bool = False, app_dir: str | None = None) -> CompanionServer:
    return CompanionServer(companion, port, verbose, allow_file_origin, app_dir)


# ---------------------------------------------------------------------------------------------
# 8. Command line
# ---------------------------------------------------------------------------------------------


# ----- the health report (the `health` command) ----------------------------------------------------
#
# What `GET /health` tells the app in JSON, told to a person: what this machine gives the
# companion, what is missing, and what to do about it. Plain ASCII, for any terminal.

_INSTALL = {  # what gives a tool, by the way software is installed on the machine
    "latex": {
        "apt": "sudo apt install texlive texlive-latex-extra dvisvgm",
        "dnf": "sudo dnf install texlive-scheme-full",
        "pacman": "sudo pacman -S texlive",
        "brew": "brew install --cask mactex-no-gui",
        "windows": "install MiKTeX (https://miktex.org/download) or TeX Live (https://tug.org/texlive/)",
        "": "install TeX Live (https://tug.org/texlive/) with your system's package manager",
    },
    "ffmpeg": {
        "apt": "sudo apt install ffmpeg",
        "dnf": "sudo dnf install ffmpeg   (the one of RPM Fusion: Fedora's own ffmpeg-free has no H.264 encoder)",
        "pacman": "sudo pacman -S ffmpeg",
        "brew": "brew install ffmpeg",
        "windows": "winget install Gyan.FFmpeg   (or https://ffmpeg.org/download.html)",
        "": "install ffmpeg (https://ffmpeg.org/download.html) with your system's package manager",
    },
    "bubblewrap": {
        "apt": "sudo apt install bubblewrap",
        "dnf": "sudo dnf install bubblewrap",
        "pacman": "sudo pacman -S bubblewrap",
        "": "install bubblewrap (the `bwrap` command) with your system's package manager",
    },
}


def _package_manager(platform: str = sys.platform, os_release: str = "/etc/os-release") -> str:
    """How software is installed here, as a key of ``_INSTALL``: ``apt``, ``dnf``, ``pacman``
    (from the distribution's name), ``brew`` on macOS, ``windows``, or ``""`` when unknown."""
    if platform == "darwin":
        return "brew"
    if platform.startswith("win"):
        return "windows"
    try:
        with open(os_release, encoding="utf-8") as fh:
            names = " ".join(line.split("=", 1)[1].strip().strip('"').lower() for line in fh
                             if line.startswith(("ID=", "ID_LIKE=")))
    except OSError:
        return ""
    for manager, distributions in (("apt", ("debian", "ubuntu")), ("dnf", ("fedora", "rhel", "centos")),
                                   ("pacman", ("arch",))):
        if any(name in names.split() for name in distributions):
            return manager
    return ""


def _ffmpeg_encoders(ffmpeg: str) -> frozenset[str]:
    """Names of the encoders in ``ffmpeg -encoders`` (lines like `` V....D libx264  ...``)."""
    try:
        r = _run([ffmpeg, "-hide_banner", "-encoders"], cwd=tempfile.gettempdir(), env=dict(os.environ),
                 timeout=10)
    except (_Timeout, OSError):
        return frozenset()
    found = (re.match(r"\s*[VAS][A-Z.]{5}\s+(\S+)", line)
             for line in r.stdout.decode("utf-8", "replace").splitlines())
    return frozenset(m.group(1) for m in found if m)


def health_facts(companion: "Companion") -> dict[str, Any]:
    """What the health report says, as data: the tools found and their versions, the encoders of
    the ffmpeg found, the Manim interpreters given and which answered, and whether each library's
    font text starts (it is started to see). Call it once the interpreters are probed."""
    def version(tool: str, flag: str = "--version") -> str:
        path = companion._tool(tool)
        if not path:
            return ""
        try:
            r = _run([path, flag], cwd=tempfile.gettempdir(), env=dict(os.environ), timeout=10)
        except (_Timeout, OSError):
            return ""
        return _first_line(r.stdout.decode("utf-8", "replace"))

    ffmpeg = companion._tool("ffmpeg")
    facts: dict[str, Any] = {
        "version": VERSION,
        "python": {"version": sys.version.split()[0], "path": sys.executable},
        "latex": {"path": companion._tool("latex"), "version": version("latex")},
        "dvisvgm": {"path": companion._tool("dvisvgm"), "version": version("dvisvgm"),
                    "ok": companion._dvisvgm_ok()},
        "sandbox": companion.sandbox.status(),
        "ffmpeg": {"path": ffmpeg,
                   "version": (re.match(r"ffmpeg version (\S+)", version("ffmpeg", "-version")) or ["", ""])[1],
                   "encoders": sorted(_ffmpeg_encoders(ffmpeg)) if ffmpeg else []},
        "video": {"limitBytes": companion.jobs.max_video_bytes, "folder": folder_as_said(tempfile.gettempdir()),
                  "freeBytes": _free_bytes(tempfile.gettempdir())},
        "manim": {}, "text": {},
    }
    for target, given in (("ce", companion.ce_python), ("gl", companion.gl_python)):
        found = companion.manim_interpreter(target)
        facts["manim"][target] = {"given": given, "python": found and found["python"],
                                  "version": found and found["version"]}
        if not found:
            continue
        try:
            fonts = companion.pango.fonts(target).get("fonts")
            families = {font.get("family") for font in fonts if isinstance(font, dict)} \
                if isinstance(fonts, list) else set()
            facts["text"][target] = {"ok": True, "families": len(families)}
        except JobError as exc:
            facts["text"][target] = {"ok": False, "message": exc.message}
    return facts


def format_health(facts: dict[str, Any], platform: str = sys.platform, manager: str | None = None) -> str:
    """The health report as text: a section per thing the companion does, a line per piece
    (``[ok]`` there, ``[--]`` not there, ``[!!]`` there and not usable), and under each one that
    is not ``[ok]`` what it costs and how to get it. Manim and font text are checked for the
    interpreters that were given; with none, the report is LaTeX and ffmpeg and says how to ask
    for the rest."""
    manager = _package_manager(platform) if manager is None else manager
    lines: list[str] = []
    attention = 0

    def item(mark: str, text: str, *notes: str) -> None:
        nonlocal attention
        attention += mark != "ok"
        lines.append(f"  [{mark}] {text}")
        lines.extend(f"       {note}" for note in notes)

    def install(tool: str) -> str:
        table = _INSTALL[tool]
        return "To get it: " + table.get(manager, table[""])

    again = "Then open a new terminal, so that it is on PATH, and run this command again."
    lines += [f"Manim Formula Editor companion {facts['version']}",
              f"Python {facts['python']['version']} at {facts['python']['path']} ({platform})", ""]

    lines.append("LaTeX: the exact glyphs of formulas and LaTeX texts")
    latex, dvisvgm = facts["latex"], facts["dvisvgm"]
    without = "Without it the app draws formulas with MathJax: close, not exact."
    if latex["path"]:
        item("ok", f"latex: {latex['version'] or 'found'} ({latex['path']})")
    else:
        item("--", "latex: not found on PATH", without, install("latex"), again)
    if not dvisvgm["path"]:
        item("--", "dvisvgm: not found on PATH", without,
             "It comes with TeX Live and MiKTeX; some systems package it apart.", install("latex"), again)
    elif not dvisvgm["ok"]:
        item("!!", f"dvisvgm: {dvisvgm['version']} is older than 2.4, which Manim's glyphs need ({dvisvgm['path']})",
             without, "To fix it: update TeX Live, or install a newer dvisvgm.")
    else:
        item("ok", f"dvisvgm: {dvisvgm['version'] or 'found'} ({dvisvgm['path']})")
    if latex["path"]:
        if facts["sandbox"] == "bubblewrap":
            item("ok", "sandbox: bubblewrap (LaTeX reads nothing of yours but its own files)")
        elif platform.startswith("linux"):
            item("--", f"sandbox: {facts['sandbox']}",
                 "LaTeX runs unconfined: a page that reaches the companion could make it read your files.",
                 install("bubblewrap"))
        else:
            lines.append("  note: no sandbox on this system (bubblewrap is Linux's): LaTeX runs unconfined, "
                         "so use the companion with pages you trust.")
    lines.append("")

    lines.append("ffmpeg: Export > Video > Companion (ffmpeg), and the sound of Render with Manim")
    ffmpeg = facts["ffmpeg"]
    if not ffmpeg["path"]:
        item("--", "ffmpeg: not found on PATH",
             "Without it the companion encodes no video; the app still exports with the browser's encoder.",
             install("ffmpeg"), again)
    else:
        item("ok", f"ffmpeg: {ffmpeg['version'] or 'found'} ({ffmpeg['path']})")
        encoders = set(ffmpeg["encoders"])
        other = ("To fix it: install an ffmpeg built with that encoder. " + _INSTALL["ffmpeg"].get(manager, "")).strip()
        for fmt, (encoder, label) in VIDEO_ENCODERS.items():
            sound = AUDIO_ENCODERS.get(fmt)
            if encoder not in encoders:
                item("!!", f"{label}: this ffmpeg has no {encoder} encoder, so that format fails", other)
            elif sound and sound[0] not in encoders:
                item("!!", f"{label}: video yes ({encoder}); no {sound[0]} encoder, so no sound in that format",
                     other)
            else:
                item("ok", f"{label}: {encoder}" + (f", sound {sound[0]}" if sound else ""))
        video = facts.get("video")
        if video:
            free = video["freeBytes"]
            room = "" if free is None else f" ({_size_text(free)} free)"
            lines.append(f"  note: a video is written in {video['folder']}{room} while it is encoded, "
                         f"{_size_text(video['limitBytes'])} at most;")
            lines.append(f"        `serve --max-video-gib N` gives another limit (1 to {MAX_VIDEO_GIB}), and "
                         "TMPDIR another folder.")
    lines.append("")

    names = {"ce": ("ManimCE", "manim", "manim", "--ce-python", "MFE_CE_PYTHON"),
             "gl": ("ManimGL", "manimlib", "manimgl", "--gl-python", "MFE_GL_PYTHON")}
    given = [target for target in names if facts["manim"][target]["given"]]
    venv_python = "Scripts\\python.exe" if platform == "win32" else "bin/python"
    if not given:
        # Nothing was asked of Manim: LaTeX and ffmpeg are the whole check, and the rest is one
        # reminder away.
        lines += ["Manim and font text: not checked (no interpreter was given)",
                  "  To check them too, run this command again with the Python of each Manim you use,",
                  "  both or either:",
                  "    health --ce-python PATH                    ManimCE",
                  "    health --gl-python PATH                    ManimGL",
                  "    health --ce-python PATH --gl-python PATH   both",
                  "  PATH is the python of the environment where that Manim is installed (its virtualenv's",
                  f"  {venv_python}). They are the options `serve` takes; MFE_CE_PYTHON and MFE_GL_PYTHON set "
                  "them too.",
                  ""]
    else:
        lines.append("Manim: Render with Manim, and the shapes of font text")
        for target, (name, module, package, flag, variable) in names.items():
            manim = facts["manim"][target]
            if manim["python"]:
                item("ok", f"{name} {manim['version']}: {manim['python']}")
            elif manim["given"]:
                item("!!", f"{name}: {manim['given']} did not answer as a Python with {name}",
                     f"To see why: {manim['given']} -c \"import {module}\"",
                     f"To install it there: {manim['given']} -m pip install {package}")
            else:
                lines.append(f"  [  ] {name}: not checked. Add {flag} PATH (or set {variable}) to check it too.")
        if any(facts["manim"][target]["python"] for target in names):
            where = ("inside the bubblewrap sandbox" if facts["sandbox"] == "bubblewrap"
                     else "WITHOUT a sandbox, with all your permissions")
            lines.append(f"  note: Render with Manim is off unless `serve` gets --allow-manim-render; "
                         f"it would run {where}.")
        lines.append("")

        lines.append("Font text: Text (font), shaped with the Pango of each Manim")
        if not facts["text"]:
            item("--", "no Manim interpreter answered, and font text is shaped with Manim's own libraries",
                 "Without it a font text shows as placeholder boxes; it still exports to Python.")
        for target, text in facts["text"].items():
            name = names[target][0]
            if text["ok"]:
                item("ok", f"with {name}: {text['families']} font families")
            else:
                item("!!", f"with {name}: {text['message']}",
                     "Font text needs Linux, with Pango 1.50 or newer, Cairo and Fontconfig."
                     if platform.startswith("linux") else
                     "Font text works on Linux only for now; here it shows as placeholder boxes.")
        lines.append("")

    checked = "LaTeX and ffmpeg are" if not given else "Everything that was checked is"
    lines.append(f"{checked} ready here." if not attention else
                 f"{attention} thing{'' if attention == 1 else 's'} marked [--] or [!!] above: "
                 "each says what it costs and how to get it.")
    lines.append("The same as the app reads it, in JSON: health --json")
    return "\n".join(lines)


def _add_interpreter_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--ce-python", metavar="PATH", help="Python with ManimCE installed (env: MFE_CE_PYTHON)")
    p.add_argument("--gl-python", metavar="PATH", help="Python with ManimGL installed (env: MFE_GL_PYTHON)")


def _video_gib(text: str) -> int:
    """The value of ``--max-video-gib``: a whole number of GiB within the bounds."""
    try:
        value = int(text)
    except ValueError:
        value = 0
    if not 1 <= value <= MAX_VIDEO_GIB:
        raise argparse.ArgumentTypeError(f"a whole number from 1 to {MAX_VIDEO_GIB} is required, not {text!r}")
    return value


def video_limit_notices(limit: int, folder: str, free: int | None, reserve: int = MIN_FREE_BYTES) -> list[str]:
    """What ``serve`` says at its start of a limit that is not the default one (``--max-video-gib``):
    the limit and where the videos are written, and, when that disk cannot hold a video of that
    size with the reserve the jobs leave, that it cannot and what gives it the room."""
    if limit == MAX_OUTPUT_BYTES:
        return []
    notices = [f"Videos: up to {_size_text(limit)} each (--max-video-gib), written in {folder} while they are "
               "encoded."]
    if free is not None and free - reserve < limit:
        notices.append(
            f"warning: {folder} has {_size_text(free)} free: a video is stopped when less than "
            f"{_size_text(reserve)} is left there, before it reaches {_size_text(limit)}. Set TMPDIR to a folder "
            "on a disk with more room to use the whole limit.")
    return notices


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mfe_companion.py", description="Manim Formula Editor companion.")
    sub = parser.add_subparsers(dest="command", required=True)

    serve = sub.add_parser("serve", help="run the HTTP server on 127.0.0.1")
    serve.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"default {DEFAULT_PORT}")
    serve.add_argument("--no-disk-cache", action="store_true", help="keep the cache in memory only")
    serve.add_argument("--no-sandbox", action="store_true",
                       help="do not confine anything with bubblewrap: LaTeX, Render with Manim and the sound of "
                            "its video, and the font-text worker then run with all your permissions "
                            "(env: MFE_NO_SANDBOX=1)")
    serve.add_argument("--allow-file-origin", action="store_true",
                       help="also accept the 'null' origin (app opened from file://); any web page can then "
                            "reach the companion (env: MFE_ALLOW_FILE_ORIGIN=1)")
    serve.add_argument("--allow-manim-render", action="store_true",
                       help="enable POST /manim-render, which RUNS THE PYTHON CODE it receives with the "
                            "configured Manim interpreters (env: MFE_ALLOW_MANIM_RENDER=1); inside the bubblewrap "
                            "sandbox when available")
    serve.add_argument("--manim-timeout", type=float, default=MANIM_TIMEOUT_S, metavar="SECONDS",
                       help=f"time limit of one Manim render (default {MANIM_TIMEOUT_S:g})")
    serve.add_argument("--max-video-gib", type=_video_gib, default=DEFAULT_VIDEO_GIB, metavar="N",
                       help=f"the largest video one job may write, in GiB: a whole number from 1 to "
                            f"{MAX_VIDEO_GIB} (default {DEFAULT_VIDEO_GIB}). A larger one fails and says so. "
                            "The video is written in the temporary folder while it is encoded (TMPDIR names "
                            "another), and a job stops when less than 1 GiB is left free there")
    serve.add_argument("--sandbox-gpu", action="store_true",
                       help="expose /dev/dri to sandboxed Manim for hardware OpenGL/Vulkan rendering "
                            "(env: MFE_SANDBOX_GPU=1); without it Mesa renders in software")
    serve.add_argument("--app", metavar="DIR",
                       help="also serve the built app in DIR (app/dist) at http://127.0.0.1:<port>/app/; "
                            "the app then reaches the companion on its own origin")
    serve.add_argument("-v", "--verbose", action="store_true", help="log requests to stderr")
    _add_interpreter_args(serve)

    health = sub.add_parser("health", help="say what this machine gives the companion, what is missing and "
                                           "how to get it (--json: the /health JSON)")
    health.add_argument("--json", action="store_true", help="print the /health JSON instead of the report")
    _add_interpreter_args(health)

    comp = sub.add_parser("compile", help="compile one formula and print the /tex JSON")
    comp.add_argument("--target", required=True, choices=TARGETS)
    comp.add_argument("--latex", required=True, help="the formula (LaTeX, without $...$)")
    comp.add_argument("--packages", default="", help="comma-separated LaTeX package names")
    comp.add_argument("--preamble", default="", help="extra preamble lines")
    comp.add_argument("--mode", default="math", choices=MODES,
                      help="math: a formula (MathTex / Tex); text: text (Tex / TexText)")
    comp.add_argument("--no-disk-cache", action="store_true")
    comp.add_argument("--no-sandbox", action="store_true", help="do not confine latex with bubblewrap")
    return parser


def _utf8_output() -> None:
    """What the commands print is UTF-8, on any system. On Windows Python writes into a pipe or a
    file in the ANSI code page, where a glyph's label such as "α" or "→" has no place: ``compile``
    and ``health --json`` ended in an encoding error as soon as their output was not a terminal."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)  # a stream put in its place may have none
        if reconfigure is not None:
            # With its own way of writing what is no text (stderr escapes it): an encoding given
            # alone would turn that back to "strict", and a path of odd bytes would raise.
            reconfigure(encoding="utf-8", errors=stream.errors)


def confinement_notices(*, sandbox: str, manim_render: bool, manim_sandboxed: bool, file_origin: bool,
                        platform: str = sys.platform) -> list[str]:
    """What ``serve`` says at its start of what runs confined and what does not: Render with Manim
    when it is allowed, then LaTeX when no sandbox is active (``sandbox`` is ``_Sandbox.status()``).
    On Linux the advice is bubblewrap. macOS and Windows have no sandbox to install, and their
    LaTeX (MacTeX, MiKTeX) reads what the user can as well, whatever its name and its settings:
    there the notices say what is not confined and leave the advice at the pages to trust."""
    linux = platform.startswith("linux")
    notices = []
    if manim_render:
        if manim_sandboxed:
            notices.append(
                "Render with Manim: enabled. It runs the Python code the app sends, inside the bubblewrap "
                "sandbox (read-only file system, no network, only its job directory writable).")
        elif linux:
            notices.append(
                "WARNING: Render with Manim is enabled and NO sandbox is active: the Python code the app "
                "sends runs with all your permissions. Only use this companion with pages you trust "
                "(install bubblewrap on Linux for confinement).")
        else:
            notices.append(
                "WARNING: Render with Manim is enabled and this system has no sandbox for it: the Python "
                "code the app sends runs with all your permissions. Only use this companion with pages "
                "you trust.")
    if sandbox.startswith("none"):
        if file_origin and linux:
            notices.append(
                "WARNING: no LaTeX sandbox is active and the 'null' origin is accepted: any web page can make "
                "LaTeX read local files (TeX Live 2026 no longer restricts reading, openin_any is a no-op) "
                "and get their content back. Install bubblewrap (bwrap) on Linux, or drop "
                "--allow-file-origin.")
        elif file_origin:
            notices.append(
                "WARNING: no LaTeX sandbox is active and the 'null' origin is accepted: any web page can make "
                "LaTeX read local files and get their content back. This system has no sandbox for LaTeX: "
                "serve the built app with --app instead of opening it from a file, or drop "
                "--allow-file-origin.")
        elif linux:
            notices.append(
                "warning: LaTeX runs unconfined; TeX Live 2026 can no longer forbid reading files outside the "
                "working directory (openin_any is a no-op). Install bubblewrap (bwrap) on Linux, or only "
                "use this companion with pages you trust.")
        else:
            notices.append(
                "warning: LaTeX runs unconfined: this system has no sandbox for it, and LaTeX can read the "
                "files you can read. Only use this companion with pages you trust.")
    return notices


# ----- the console window closed (Windows) ------------------------------------------------------
#
# Windows tells the processes of a console that its window is being closed, that the user logs off
# or that the system shuts down by calling the handlers they set with SetConsoleCtrlHandler, on a
# thread of its own, and ends the process as soon as one returns, or 5 s after it was called.
# Python's `signal` has no name for these: the C runtime hands them to the handler of SIGBREAK,
# which only marks the signal for the main thread, and the companion ended at once, the folder of
# its jobs left in TEMP.

_CONSOLE_STOPS = (2, 5, 6)  # CTRL_CLOSE_EVENT, CTRL_LOGOFF_EVENT, CTRL_SHUTDOWN_EVENT
CONSOLE_STOP_WAIT_S = 4.5  # what the handler takes of the 5 s Windows gives after a close, at most
_console_handlers: list[Any] = []  # every handler given to Windows, kept: see `_ConsoleClose`


class _ConsoleAPI(NamedTuple):
    """What a console handler needs of Windows: kernel32's ``SetConsoleCtrlHandler``, and the
    type that makes of a Python function one the system can call (``HandlerRoutine``)."""
    SetConsoleCtrlHandler: Any
    HandlerRoutine: Any


def _console_api() -> _ConsoleAPI:
    """Windows' own, made when it is asked for: ``ctypes`` has no ``WinDLL`` on other systems."""
    import ctypes
    from ctypes import wintypes
    routine = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)
    register = ctypes.WinDLL("kernel32").SetConsoleCtrlHandler
    register.argtypes, register.restype = (routine, wintypes.BOOL), wintypes.BOOL
    return _ConsoleAPI(register, routine)


class _ConsoleClose:
    """The block in which ``serve`` serves and then cleans up, stopped in order when its console
    window is closed (or the user logs off, or the system shuts down), as Ctrl+C stops it.

    On Windows a handler is set for the three events. It asks the server to stop, and returns once
    the block has ended, its jobs and their folders gone, or after ``wait_s``: Windows then ends
    the process. It runs on the system's thread, for which ctypes takes the GIL, and asks for the
    stop on a thread of its own, since ``server.shutdown()`` waits for the loop to end: before the
    loop has begun, it would wait for it to begin (and end at once), and for ever if it never did.
    Ctrl+C and Ctrl+Break are not taken: they go on to Python, as before. What Windows calls is
    never released, for a call already under way would find it gone and crash the process. A log-off
    and a shutdown come this way only to a process that has not loaded user32.dll, Microsoft says,
    and OpenSSL (``hashlib``) loads it: of those the handler may hear nothing. Elsewhere nothing is
    set and nothing imported. ``console`` is Windows' API (``_console_api()``), given by a test that
    plays it on any system."""

    def __init__(self, server: Any, *, windows: bool = os.name == "nt", console: Any = None,
                 wait_s: float = CONSOLE_STOP_WAIT_S) -> None:
        self.server = server
        self.windows = windows
        self.console = console
        self.wait_s = wait_s
        self.ended = threading.Event()
        self.registered: tuple[Any, Any] | None = None

    def __enter__(self) -> _ConsoleClose:
        if self.windows:
            try:
                console = self.console or _console_api()
            except (ImportError, OSError):  # no ctypes: a close ends the process at once, as before
                return self
            routine = console.HandlerRoutine(self._on_event)
            _console_handlers.append(routine)
            if console.SetConsoleCtrlHandler(routine, True):
                self.registered = (console, routine)
        return self

    def __exit__(self, *exc_info: Any) -> None:
        # Said before the handler is taken back: the system may hold its list of handlers while
        # one runs, and the one that waits for this would then wait out its time.
        self.ended.set()
        if self.registered:
            console, routine = self.registered
            console.SetConsoleCtrlHandler(routine, False)  # the interpreter ends next: none to call

    def _on_event(self, event: int) -> int:
        if event not in _CONSOLE_STOPS:
            return 0
        if not self.ended.is_set():  # a second event asks again, which changes nothing
            threading.Thread(target=self.server.shutdown, daemon=True).start()
        self.ended.wait(self.wait_s)
        return 1


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _utf8_output()

    if args.command == "serve":
        def env_flag(name: str) -> bool:
            return os.environ.get(name, "").lower() in ("1", "true", "yes")

        companion = Companion(args.ce_python, args.gl_python, disk_cache=not args.no_disk_cache,
                              sandbox=not args.no_sandbox,
                              allow_manim_render=args.allow_manim_render or env_flag("MFE_ALLOW_MANIM_RENDER"),
                              manim_timeout_s=args.manim_timeout,
                              sandbox_gpu=args.sandbox_gpu or env_flag("MFE_SANDBOX_GPU"),
                              max_video_bytes=args.max_video_gib * GIB)
        allow_file_origin = args.allow_file_origin or env_flag("MFE_ALLOW_FILE_ORIGIN")
        app_dir = None
        if args.app:
            app_dir = os.path.realpath(args.app)
            if not os.path.isfile(os.path.join(app_dir, "index.html")):
                print(f"--app: {args.app} has no index.html (build the app first: npm run build in app/).",
                      file=sys.stderr)
                return 2
        try:
            server = make_server(companion, args.port, args.verbose, allow_file_origin, app_dir)
        except OSError as exc:
            print(f"Cannot listen on 127.0.0.1:{args.port}: {exc}", file=sys.stderr)
            return 1
        companion.start_probes()
        sandbox = companion.sandbox.status()
        print(f"{NAME} {VERSION} listening on http://127.0.0.1:{server.port} (LaTeX sandbox: {sandbox})",
              file=sys.stderr, flush=True)
        if app_dir:
            print(f"Serving the app from {app_dir} at http://127.0.0.1:{server.port}/app/", file=sys.stderr,
                  flush=True)
        if allow_file_origin:
            print("warning: the 'null' origin is accepted (--allow-file-origin / MFE_ALLOW_FILE_ORIGIN): any web "
                  "page, e.g. in a sandboxed iframe, can now send requests to this companion.",
                  file=sys.stderr, flush=True)
        for notice in confinement_notices(sandbox=sandbox, manim_render=companion.allow_manim_render,
                                          manim_sandboxed=companion.sandbox.active(),
                                          file_origin=allow_file_origin):
            print(notice, file=sys.stderr, flush=True)
        for notice in video_limit_notices(companion.jobs.max_video_bytes, folder_as_said(tempfile.gettempdir()),
                                          _free_bytes(tempfile.gettempdir())):
            print(notice, file=sys.stderr, flush=True)
        taken: list[int] = []

        def on_stop(signum: int, frame: Any) -> None:
            # The stop this begins is not cut short by its signal coming again. A terminal that
            # closes hangs up more than once (the system tells the processes of the terminal, the
            # shell its jobs): the second one came in the middle of the clean-up, which ended there
            # with the directory of the jobs left, or after it, at the exit, which then was a
            # traceback (seen on macOS with zsh). Ctrl+C still interrupts a clean-up that hangs.
            for number in taken:
                signal.signal(number, signal.SIG_IGN)
            raise KeyboardInterrupt()

        # A console window closed on Windows: the system waits for this block to end, up to its 5 s.
        # It begins before the signals are taken, so that nothing stands between a signal's handler
        # and the loop that did not before there was a block.
        with _ConsoleClose(server):
            # `kill`, and the terminal closing, stop the server in order as Ctrl+C does: the jobs'
            # and the text workers' temporary files go, and no render is left running. A hang-up
            # the caller chose to ignore (nohup) stays ignored. On Windows Ctrl+Break comes as
            # SIGBREAK, which left to itself ends the process at once, with the files of its jobs
            # left in TEMP.
            for name in ("SIGTERM", "SIGHUP", "SIGBREAK"):
                number = getattr(signal, name, None)
                if number is not None and signal.getsignal(number) is not signal.SIG_IGN:
                    signal.signal(number, on_stop)
                    taken.append(number)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                server.server_close()
                companion.shutdown()
        return 0

    if args.command == "health":
        companion = Companion(args.ce_python, args.gl_python, disk_cache=False)
        try:
            companion.start_probes()
            companion.wait_for_probes()
            if args.json:
                print(json.dumps(companion.health(), ensure_ascii=False, indent=2))
            else:
                print(format_health(health_facts(companion)))
        finally:
            companion.shutdown()
        return 0

    if args.command == "compile":
        companion = Companion(disk_cache=not args.no_disk_cache, sandbox=not args.no_sandbox)
        packages = [p.strip() for p in args.packages.split(",") if p.strip()]
        try:
            req = validate_request(
                {"latex": args.latex, "packages": packages, "preamble": args.preamble, "target": args.target,
                 "mode": args.mode}
            )
        except RequestError as exc:
            print(json.dumps(error_response(exc.message), ensure_ascii=False, indent=2))
            return 2
        result = companion.compile(req)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result.get("ok") else 1

    return 2


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--pango-worker" and sys.argv[2] in TARGETS:
        sys.exit(_pango_worker_main(sys.argv[2]))
    sys.exit(main())
