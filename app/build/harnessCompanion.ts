/* A companion started by a harness (the e2e helpers, the export check, the parity run): where it
 * keeps its temporary files, and how it is ended.
 *
 * A companion stopped in order removes its own files. A harness ends it with `kill()`, which on
 * Windows ends that one process at once: nothing is cleaned up, and what it had started (an
 * interpreter asked for its Manim, an ffmpeg) lives on, holding its folder. After a day of suites
 * there, 128 folders were left in TEMP. So a harness gives its companion a temporary folder of its
 * own (the companion makes every temporary file with Python's `tempfile`, which reads TMPDIR, TEMP
 * and TMP), ends it with everything it started, and removes the folder itself. */
import { spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface CompanionTemp {
  /** The folder: whatever the companion and what it starts write as temporary files. */
  directory: string;
  /** The environment to start the companion with. */
  env: NodeJS.ProcessEnv;
  /** Remove the folder with what is left in it. It never throws: a folder left behind is what
   * there was before, not a failure of the suite. */
  remove(): void;
}

/** A new temporary folder for one companion, in `base` (the temporary folder of the system). */
export function companionTemp(
  env: NodeJS.ProcessEnv = process.env,
  base: string = tmpdir(),
): CompanionTemp {
  const directory = mkdtempSync(path.join(base, 'mfe-harness-'));
  return {
    directory,
    env: { ...env, TMPDIR: directory, TEMP: directory, TMP: directory },
    remove() {
      try {
        // Tried again for a moment: on Windows a process that is ending still holds its files.
        rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        // left behind
      }
    },
  };
}

/** The command that ends a process of Windows with everything it started, where `kill()` ends
 * that process alone and leaves its children; null where a signal does it: the companion takes
 * SIGTERM, ends its children and removes its files itself. */
export function treeKillCommand(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): [string, string[]] | null {
  return platform === 'win32' ? ['taskkill', ['/PID', String(pid), '/T', '/F']] : null;
}

/** End `child`, a companion started with the environment of `temp`, and remove its temporary
 * folder once it has gone. */
export async function stopCompanion(
  child: ChildProcess,
  temp: CompanionTemp,
  platform: NodeJS.Platform = process.platform,
  run: (command: string, args: string[]) => unknown = (command, args) =>
    spawnSync(command, args, { stdio: 'ignore' }),
): Promise<void> {
  // A child that never started has no process to wait for.
  const running = child.pid !== undefined && child.exitCode === null && child.signalCode === null;
  const gone = new Promise<void>((resolve) => {
    if (!running) return resolve();
    const timer = setTimeout(resolve, 10_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (running) {
    const command = treeKillCommand(child.pid!, platform);
    if (command) run(...command);
    child.kill();
  }
  await gone;
  temp.remove();
}
