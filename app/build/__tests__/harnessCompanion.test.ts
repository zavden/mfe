// @vitest-environment node
/* The temporary folder of a companion a harness starts, and how the harness ends it: on Windows
 * `kill()` ends the companion at once, nothing cleaned up and its children alive, so the harness
 * owns the folder and removes it. And that every harness that starts a companion does so. */
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { companionTemp, stopCompanion, treeKillCommand } from '../harnessCompanion';

const made: string[] = [];
function base(): string {
  const directory = mkdtempSync(join(tmpdir(), 'mfe-harness-test-'));
  made.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('the temporary folder of a harness companion', () => {
  it('is a new folder that the companion is told through its environment', () => {
    const inside = base();
    const temp = companionTemp({ PATH: '/usr/bin', TMPDIR: '/elsewhere' }, inside);
    expect(temp.directory.startsWith(join(inside, 'mfe-harness-'))).toBe(true);
    expect(existsSync(temp.directory)).toBe(true);
    // Python's tempfile reads the three, in this order, on every system.
    expect(temp.env).toEqual({
      PATH: '/usr/bin',
      TMPDIR: temp.directory,
      TEMP: temp.directory,
      TMP: temp.directory,
    });
    expect(companionTemp({}, inside).directory).not.toBe(temp.directory);
  });

  it('goes with what was left in it', () => {
    const temp = companionTemp({}, base());
    mkdirSync(join(temp.directory, 'mfe-jobs-abc', 'video-1'), { recursive: true });
    writeFileSync(join(temp.directory, 'mfe-jobs-abc', 'video-1', 'out.mp4'), 'x');
    temp.remove();
    expect(existsSync(temp.directory)).toBe(false);
    expect(() => temp.remove()).not.toThrow(); // already gone
  });
});

describe('ending a harness companion', () => {
  it('is taskkill with the tree on Windows, a signal elsewhere', () => {
    expect(treeKillCommand(4242, 'win32')).toEqual(['taskkill', ['/PID', '4242', '/T', '/F']]);
    expect(treeKillCommand(4242, 'linux')).toBeNull();
    expect(treeKillCommand(4242, 'darwin')).toBeNull();
  });

  it('ends a real process and removes its folder once it has gone', async () => {
    const temp = companionTemp(process.env, base());
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      env: temp.env,
    });
    await new Promise((resolve) => child.once('spawn', resolve));
    await stopCompanion(child, temp);
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    expect(existsSync(temp.directory)).toBe(false);
  });

  it('on Windows ends the tree first, then the process, then removes the folder', async () => {
    const temp = companionTemp({}, base());
    const done: string[] = [];
    const child = Object.assign(new EventEmitter(), {
      pid: 4242,
      exitCode: null,
      signalCode: null,
      kill() {
        done.push('kill');
        // the process ends a moment later, as a real one does
        setTimeout(() => child.emit('exit', 1, null), 5);
        return true;
      },
    });
    const run = (command: string, args: string[]) => {
      done.push([command, ...args].join(' '));
      expect(existsSync(temp.directory)).toBe(true); // not before the process has gone
    };
    await stopCompanion(child as unknown as ChildProcess, temp, 'win32', run);
    expect(done).toEqual(['taskkill /PID 4242 /T /F', 'kill']);
    expect(existsSync(temp.directory)).toBe(false);
  });

  it('removes the folder of a companion that never started, or has ended', async () => {
    for (const state of [
      { pid: undefined },
      { pid: 7, exitCode: 0 },
      { pid: 7, signalCode: 'SIGTERM' },
    ]) {
      const temp = companionTemp({}, base());
      const child = Object.assign(new EventEmitter(), {
        exitCode: null,
        signalCode: null,
        kill: () => {
          throw new Error('nothing to end');
        },
        ...state,
      });
      await stopCompanion(child as unknown as ChildProcess, temp, 'win32', () => {
        throw new Error('nothing to end');
      });
      expect(existsSync(temp.directory)).toBe(false);
    }
  });
});

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const ROOTS = ['app/e2e', 'app/src', 'tests'];
/** `serve` given as an argument of a program that is started: the companion's server. */
const STARTS_A_COMPANION = /\bspawn\([^;]*?['"]serve['"]/s;

function sources(): string[] {
  return ROOTS.flatMap((root) =>
    (readdirSync(join(REPO, root), { recursive: true }) as string[])
      .map((name) => `${root}/${name.replaceAll('\\', '/')}`)
      .filter((path) => /\.(?:ts|tsx|mts|mjs|js)$/.test(path) && !path.includes('/node_modules/')),
  );
}

describe('what starts a companion', () => {
  it('the rule reads a start written on one line or on several', () => {
    expect(
      STARTS_A_COMPANION.test("spawn(pythonCommand(), [script, 'serve', '--port', '0'])"),
    ).toBe(true);
    expect(
      STARTS_A_COMPANION.test(
        'spawn(\n  pythonCommand(),\n  [script, "serve", "--port", port],\n)',
      ),
    ).toBe(true);
    expect(STARTS_A_COMPANION.test("spawn(process.execPath, [vite]);\nconst mode = 'serve';")).toBe(
      false,
    );
  });

  it('gives it a temporary folder of its own and ends it through stopCompanion', () => {
    const starting = sources().filter((path) =>
      STARTS_A_COMPANION.test(readFileSync(join(REPO, path), 'utf8')),
    );
    expect(starting.sort()).toEqual([
      'app/e2e/companionHelpers.ts',
      'tests/export/export.check.ts',
      'tests/parity/engine.parity.ts',
    ]);
    const without = starting.filter((path) => {
      const source = readFileSync(join(REPO, path), 'utf8');
      return !/\bcompanionTemp\(/.test(source) || !/\bstopCompanion\(/.test(source);
    });
    expect(without, 'see app/build/harnessCompanion.ts').toEqual([]);
  });
});
