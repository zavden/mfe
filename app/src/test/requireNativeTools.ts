import { spawnSync } from 'node:child_process';
import { pythonCommand } from '../../build/python';

/** The native project is a required part of npm test; unavailable tools must fail the gate.
 * `MFE_SKIP_NATIVE=1` leaves the project out on purpose (`build/nativeGate.ts`), and then this
 * setup does not run at all. */
export default function requireNativeTools(): void {
  const failures: string[] = [];
  for (const command of [pythonCommand(), 'latex', 'dvisvgm']) {
    const result = spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 10_000 });
    if (result.status !== 0) {
      failures.push(
        `${command}: ${result.error?.message ?? `exit ${result.status}, signal ${result.signal}`}`,
      );
    }
  }
  if (failures.length) {
    const message =
      `Native integration prerequisites failed:\n${failures.join('\n')}\n` +
      'The native cases are required by npm test and have not been skipped. ' +
      'Use npm run test:unit only for the separate developer unit selection, or set ' +
      'MFE_SKIP_NATIVE=1 to leave them out of npm test on purpose: the run says so, ' +
      'and is not the full gate.';
    // Keep the actionable diagnostic visible even if the runner cannot format a setup stack.
    console.error(message);
    throw new Error(message);
  }
}
