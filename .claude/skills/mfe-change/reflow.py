#!/usr/bin/env python3
"""Replace text inside a hard-wrapped Markdown paragraph or list item and re-wrap it at 100 columns,
keeping the original line breaks wherever they still fit, so that the diff stays small.

    python3 .claude/skills/mfe-change/reflow.py <file> <old> <new>

`old` must occur exactly once in the paragraph it is found in (it may span a line break). Re-wrapping
starts at the edited line and stops as soon as the remaining words fall on the original breaks
again. Check the result with `git diff`: tables, code blocks and nested lists are not understood."""
import sys

WIDTH = 100


def minreflow(path, old, new):
    # UTF-8 and LF on any system: Windows would read the docs in its code page, where a
    # character counts as several, and write them back with CRLF.
    lines = open(path, encoding='utf-8').read().split('\n')
    # locate the edit: search windows of up to 4 joined lines
    flat_index = None
    for i in range(len(lines)):
        for n in range(1, 5):
            window = ' '.join(l.strip() for l in lines[i:i + n])
            if old in window and (n == 1 or old not in ' '.join(l.strip() for l in lines[i + 1:i + n])):
                flat_index = (i, n)
                break
        if flat_index:
            break
    assert flat_index, old
    i, n = flat_index
    indent = lines[i + 1][:len(lines[i + 1]) - len(lines[i + 1].lstrip())] if n > 1 else lines[i][:len(lines[i]) - len(lines[i].lstrip())]
    first_indent = lines[i][:len(lines[i]) - len(lines[i].lstrip())]
    # words from line i to the end of the paragraph, with the edit applied
    j = i
    while j < len(lines) and lines[j].strip() != '' and (j == i or not lines[j].lstrip().startswith('- ') or lines[j].startswith(indent + '- ') is False):
        if j > i and lines[j].lstrip().startswith('- ') and len(lines[j]) - len(lines[j].lstrip()) <= len(first_indent):
            break
        if j > i and lines[j].startswith('#'):
            break
        j += 1
    original = lines[i:j]
    words_text = ' '.join(l.strip() for l in original)
    assert words_text.count(old) == 1
    words = words_text.replace(old, new).split(' ')
    # original line-end word counts (cumulative), measured from the END of the paragraph
    orig_words = [l.strip().split(' ') for l in original]
    suffixes = {}
    count = 0
    for k in range(len(orig_words) - 1, -1, -1):
        count += len(orig_words[k])
        suffixes[count] = k  # the last `count` words start original line k
    out = []
    cur = first_indent
    pos = 0
    while pos < len(words):
        remaining = len(words) - pos
        edited = pos >= len(words) - (len(words_text.split(' ')) - words_text[:words_text.index(old)].count(' ')) + len(new.split(' ')) - len(old.split(' '))
        if edited and remaining in suffixes and suffixes[remaining] > 0 and len(cur) >= 80:
            # line breaks are back in step with the original: keep the rest as it was
            if cur.strip():
                out.append(cur)
            out.extend(original[suffixes[remaining]:])
            pos = len(words)
            cur = None
            break
        w = words[pos]
        trial = cur + (w if cur.strip() == '' else ' ' + w)
        if len(trial) > WIDTH and cur.strip() != '':
            out.append(cur)
            cur = indent
            continue
        cur = trial
        pos += 1
    if cur is not None and cur.strip():
        out.append(cur)
    lines[i:j] = out
    open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    minreflow(sys.argv[1], sys.argv[2], sys.argv[3])
