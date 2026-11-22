/* The Pythons the tests and the harnesses start, on any system: the one of the PATH (the
 * companion and the native tests run with it) and those of the two Manim virtualenvs kept next
 * to the repository. Windows names both otherwise, and has no `nice`: what starts a Python asks
 * here for its name instead of writing `python3` or `venv/bin/python` itself
 * (`__tests__/python.test.ts` reads the sources for that). */
import { existsSync } from 'node:fs';
import path from 'node:path';

type Env = Record<string, string | undefined>;

/** The Python of the PATH: `python3` on Linux and macOS. On Windows the installer of python.org
 * gives `python` and no `python3`; that name is there at best the alias of the Microsoft Store,
 * which runs nothing and exits 9009. `MFE_PYTHON` names another one (`py`, a full path). */
export function pythonCommand(env: Env = process.env, platform: string = process.platform): string {
  return env.MFE_PYTHON || (platform === 'win32' ? 'python' : 'python3');
}

/** The interpreter of the virtualenv `venv`: `bin/python`, on Windows `Scripts\python.exe`. */
export function venvPython(venv: string, platform: string = process.platform): string {
  return platform === 'win32'
    ? path.win32.join(venv, 'Scripts', 'python.exe')
    : path.posix.join(venv, 'bin', 'python');
}

/** The interpreter of `<dir>/<name>/venv` in the first ancestor of the repository that has one
 * (the workspace keeps the venvs next to the repository; git worktrees sit one level deeper).
 * Where none has it, the one next to the repository: the path a message then gives as missing. */
export function findManimPython(
  repoRoot: string,
  name: 'manim_ce' | 'manim_gl',
  exists: (file: string) => boolean = existsSync,
  platform: string = process.platform,
): string {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const beside = paths.dirname(paths.resolve(repoRoot));
  let dir = beside;
  for (let i = 0; i < 4; i++) {
    const candidate = venvPython(paths.join(dir, name, 'venv'), platform);
    if (exists(candidate)) return candidate;
    dir = paths.dirname(dir);
  }
  return venvPython(paths.join(beside, name, 'venv'), platform);
}

/** `command` at a low priority, so that a long run leaves the machine to its owner: under
 * `nice -n 10` where the system has it. Windows has none: there the command runs as it is. */
export function niced(
  command: string,
  args: readonly string[],
  platform: string = process.platform,
): [command: string, args: string[]] {
  return platform === 'win32' ? [command, [...args]] : ['nice', ['-n', '10', command, ...args]];
}
