// @vitest-environment node
/* The names of the Pythons on each system, and that nothing starts one under a name of its own:
 * `python3` is not a command on Windows (at best the alias of the Microsoft Store, which runs
 * nothing), a virtualenv keeps its interpreter in `Scripts\python.exe` there, and `nice` does not
 * exist. A harness that wrote any of them itself would skip or fail on Windows alone. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findManimPython, niced, pythonCommand, venvPython } from '../python';

describe('the Python of the PATH', () => {
  it('is python3 on Linux and macOS, python on Windows', () => {
    expect(pythonCommand({}, 'linux')).toBe('python3');
    expect(pythonCommand({}, 'darwin')).toBe('python3');
    expect(pythonCommand({}, 'win32')).toBe('python');
  });

  it('is the one MFE_PYTHON names, on any system', () => {
    expect(pythonCommand({ MFE_PYTHON: 'py' }, 'win32')).toBe('py');
    expect(pythonCommand({ MFE_PYTHON: '/opt/py/bin/python3.14' }, 'linux')).toBe(
      '/opt/py/bin/python3.14',
    );
    // A variable left empty names nothing.
    expect(pythonCommand({ MFE_PYTHON: '' }, 'win32')).toBe('python');
  });
});

describe('the interpreter of a virtualenv', () => {
  it('is bin/python, and Scripts\\python.exe on Windows', () => {
    expect(venvPython('/ws/manim_ce/venv', 'linux')).toBe('/ws/manim_ce/venv/bin/python');
    expect(venvPython('/ws/manim_ce/venv', 'darwin')).toBe('/ws/manim_ce/venv/bin/python');
    expect(venvPython('C:\\ws\\manim_ce\\venv', 'win32')).toBe(
      'C:\\ws\\manim_ce\\venv\\Scripts\\python.exe',
    );
  });

  it('is looked for next to the repository first', () => {
    const there = new Set(['/ws/manim_ce/venv/bin/python', '/manim_ce/venv/bin/python']);
    const exists = (file: string): boolean => there.has(file);
    expect(findManimPython('/ws/repo', 'manim_ce', exists, 'linux')).toBe(
      '/ws/manim_ce/venv/bin/python',
    );
    // The folder of the repository may be given with its last slash.
    expect(findManimPython('/ws/repo/', 'manim_ce', exists, 'linux')).toBe(
      '/ws/manim_ce/venv/bin/python',
    );
  });

  it('is found from a git worktree, which sits deeper than the repository', () => {
    const exists = (file: string): boolean => file === '/ws/manim_gl/venv/bin/python';
    expect(findManimPython('/ws/worktrees/a/repo', 'manim_gl', exists, 'linux')).toBe(
      '/ws/manim_gl/venv/bin/python',
    );
  });

  it('is the one next to the repository where none exists: what a message names', () => {
    expect(findManimPython('/ws/repo', 'manim_gl', () => false, 'linux')).toBe(
      '/ws/manim_gl/venv/bin/python',
    );
  });

  it('is found on Windows, by the names of Windows', () => {
    const exists = (file: string): boolean =>
      file === 'C:\\ws\\manim_ce\\venv\\Scripts\\python.exe';
    expect(findManimPython('C:\\ws\\repo', 'manim_ce', exists, 'win32')).toBe(
      'C:\\ws\\manim_ce\\venv\\Scripts\\python.exe',
    );
    expect(findManimPython('C:\\ws\\repo', 'manim_gl', exists, 'win32')).toBe(
      'C:\\ws\\manim_gl\\venv\\Scripts\\python.exe',
    );
  });
});

describe('a command at a low priority', () => {
  it('runs under nice where there is one, and as it is on Windows', () => {
    expect(niced('/venv/bin/python', ['probe.py', 'ce'], 'linux')).toEqual([
      'nice',
      ['-n', '10', '/venv/bin/python', 'probe.py', 'ce'],
    ]);
    expect(niced('/venv/bin/python', ['probe.py'], 'darwin')[0]).toBe('nice');
    expect(niced('C:\\venv\\Scripts\\python.exe', ['probe.py', 'ce'], 'win32')).toEqual([
      'C:\\venv\\Scripts\\python.exe',
      ['probe.py', 'ce'],
    ]);
  });
});

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
/** Where the code that starts programs is. */
const ROOTS = ['app/src', 'app/e2e', 'app/build', 'tests', '.claude/skills/mfe-change'];
/** A program started under one of the names only some systems have. */
const BY_NAME = /\b(?:spawn|spawnSync|execFile|execFileSync)\(\s*(['"`])(python3?|py|nice)\1/;

function sources(): string[] {
  return ROOTS.flatMap((root) =>
    (readdirSync(join(REPO, root), { recursive: true }) as string[])
      .map((name) => `${root}/${name.replaceAll('\\', '/')}`)
      .filter((path) => /\.(?:ts|tsx|mts|mjs|js)$/.test(path) && !path.includes('/node_modules/')),
  );
}

describe('what starts a Python', () => {
  it('the rule reads a call written on one line or on several', () => {
    expect(BY_NAME.test("spawn('python3', [script])")).toBe(true);
    expect(BY_NAME.test('spawnSync(\n  "nice",\n  ["-n", "10"])')).toBe(true);
    expect(BY_NAME.test("execFileSync('python', ['-c', code])")).toBe(true);
    expect(BY_NAME.test('spawn(pythonCommand(), [script])')).toBe(false);
    expect(BY_NAME.test('spawnSync(...niced(python, args))')).toBe(false);
  });

  it('asks build/python.ts for its name', () => {
    // This file writes such calls itself, as the examples of the rule above.
    const files = sources().filter((path) => path !== 'app/build/__tests__/python.test.ts');
    expect(files.length).toBeGreaterThan(500);
    const named = files.filter((path) => BY_NAME.test(readFileSync(join(REPO, path), 'utf8')));
    expect(named).toEqual([]);
  });
});
