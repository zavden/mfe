/** The interpreter was not found, was found but failed to dump, or dumped. */
export type DumpStatus = 'absent' | 'failed' | 'ok';

export function verdict(run: {
  dumps: Record<string, DumpStatus>;
  unexpected: number;
  engineOk: boolean;
  engineSkipped: string[];
  strict?: boolean;
}): { label: string; exit: number };

export function engineSkips(report: Record<string, unknown>): string[];
