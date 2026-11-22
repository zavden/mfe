/* How the e2e suite is run: in what order, and with what pauses. Pure, so that the unit suite
 * checks it; `playwright.config.ts`, `e2e/test.ts` and the two reporters of `e2e/` apply it.
 *
 * The order. Playwright runs the files of a project in alphabetical order and the projects in the
 * order the config lists them, so the order comes from the projects: the specs are sorted from
 * the one that takes longest to the one that takes least (the times recorded in
 * `e2e/durations.json`) and cut into bands, one project each. A band and not a spec, because a
 * worker serves one project: each project costs every worker a new process and a new browser
 * (measured: 0.44 s a spec with two workers, 4 % of the suite with a project per spec). A band is
 * filled until it holds a minute of tests: the slow specs get one each, in their exact order, and
 * the quick ones of the end share theirs, in alphabetical order.
 *
 * The pauses. A machine without a fan (a MacBook Air) heats up over the suite: every so many
 * tests the run waits for it to cool. */

/** What the tests of each spec took, in seconds, by the path of the spec inside `e2e/`. */
export type SpecSeconds = Readonly<Record<string, number>>;

/** A band is closed once the tests of its specs take this long together, in seconds. */
export const BAND_SECONDS = 60;

/** The specs from the slowest to the fastest. One without a recorded time goes first: it is new,
 * and what its author wants to see. Equal times keep the alphabetical order. */
export function specOrder(specs: readonly string[], seconds: SpecSeconds): string[] {
  const time = (spec: string) => seconds[spec] ?? Infinity;
  return [...specs].sort((a, b) => {
    const [ta, tb] = [time(a), time(b)];
    return ta === tb ? (a < b ? -1 : a > b ? 1 : 0) : tb - ta;
  });
}

export interface Band {
  /** The project's name: `order-01` runs first. */
  name: string;
  specs: string[];
}

/** The specs in the bands the suite runs one after another: those without a recorded time
 * together, first, then the others from the slowest on, each band closed when it holds
 * `BAND_SECONDS` of tests. With no times at all there is one band: the alphabetical order. */
export function specBands(specs: readonly string[], seconds: SpecSeconds): Band[] {
  const groups: string[][] = [];
  const ordered = specOrder(specs, seconds);
  const unknown = ordered.filter((spec) => seconds[spec] === undefined);
  if (unknown.length > 0) groups.push(unknown);
  let open: string[] = [];
  let held = 0;
  for (const spec of ordered.slice(unknown.length)) {
    open.push(spec);
    held += seconds[spec]!;
    if (held >= BAND_SECONDS) {
      groups.push(open);
      open = [];
      held = 0;
    }
  }
  if (open.length > 0) groups.push(open);
  return groups.map((group, index) => ({
    name: `order-${String(index + 1).padStart(2, '0')}`,
    specs: group,
  }));
}

/** A pattern that matches the file of one of `specs` (paths inside `e2e/`) and no other: the
 * whole name, after a separator of either kind. */
export function specPattern(specs: readonly string[]): RegExp {
  const escaped = specs.map((spec) =>
    spec
      .split('/')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\\\/]'),
  );
  return new RegExp(`[\\\\/]e2e[\\\\/](?:${escaped.join('|')})$`);
}

export interface Cooldown {
  /** A pause begins when this many tests have run since the last one. */
  every: number;
  /** How long it lasts. */
  seconds: number;
}

export const MAC_COOLDOWN: Cooldown = { every: 200, seconds: 120 };

/** The environment variable that names the file a pause is declared in: the run's reporter writes
 * there the time, in milliseconds since the epoch, until which no test should start, and the
 * workers read it before each test (`e2e/test.ts`). The config sets it; the workers inherit it. */
export const COOLDOWN_FILE_ENV = 'MFE_E2E_COOLDOWN_FILE';

/** The pauses of a run. A Mac gets them by itself (the suite was heating a MacBook Air, which has
 * no fan); `MFE_E2E_COOL_EVERY` asks for them anywhere, or with 0 for none, and
 * `MFE_E2E_COOL_SECONDS` sets how long they last. */
export function cooldownFor(
  platform: string,
  env: Readonly<Record<string, string | undefined>>,
): Cooldown | null {
  const number = (text: string | undefined): number | null => {
    if (text === undefined || text.trim() === '') return null;
    const value = Number(text);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  const asked = number(env.MFE_E2E_COOL_EVERY);
  const every =
    asked === null ? (platform === 'darwin' ? MAC_COOLDOWN.every : 0) : Math.floor(asked);
  const seconds = number(env.MFE_E2E_COOL_SECONDS) ?? MAC_COOLDOWN.seconds;
  return every > 0 && seconds > 0 ? { every, seconds } : null;
}

/** Whether a pause begins now that `ran` tests have run, with `left` still to start or to end.
 * None after the last test: there is nothing left to cool the machine for. */
export function pauseAfter(ran: number, left: number, every: number): boolean {
  return every > 0 && ran > 0 && ran % every === 0 && left > 0;
}

export interface SpecRun {
  spec: string;
  /** What its tests took in this run, in seconds. */
  seconds: number;
  /** Every test of the spec ran and none failed: a failure bends the time (it waits for a timeout). */
  clean: boolean;
}

/** The recorded times after a run: the specs that ran clean get their new time, the others keep
 * the one they had, and a spec that no longer exists loses its entry. Sorted by name, to one
 * decimal: the file is kept in the repository. */
export function recordedSeconds(
  before: SpecSeconds,
  runs: readonly SpecRun[],
  existing: readonly string[],
): Record<string, number> {
  const next = new Map<string, number>(Object.entries(before));
  for (const run of runs) if (run.clean) next.set(run.spec, Math.round(run.seconds * 10) / 10);
  const present = new Set(existing);
  return Object.fromEntries(
    [...next]
      .filter(([spec]) => present.has(spec))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}
