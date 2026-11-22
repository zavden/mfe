/* A scriptable stand-in for the companion's HTTP API (fetch level), for unit tests. */
import type { CompanionHealth, CompanionTexRequest, CompanionTexResponse } from '../types';

export const HEALTH: CompanionHealth = {
  name: 'mfe-companion',
  version: '1.0.0',
  protocol: 1,
  capabilities: { latex: true, dvisvgm: true, ffmpeg: false, manimCE: null, manimGL: null },
};

export interface FakeCompanion {
  fetch: typeof fetch;
  online: boolean;
  health: unknown;
  /** Never answer (to test timeouts). */
  hang: boolean;
  /** Answer the headers, never the body (a timeout must cover the body too). */
  hangBody: boolean;
  calls: { path: string; body?: CompanionTexRequest }[];
  tex: (request: CompanionTexRequest) => CompanionTexResponse;
}

export function fakeCompanion(tex: FakeCompanion['tex']): FakeCompanion {
  const fake: FakeCompanion = {
    online: true,
    health: HEALTH,
    hang: false,
    hangBody: false,
    calls: [],
    tex,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const path = new URL(url).pathname;
      const body = init?.body ? (JSON.parse(String(init.body)) as CompanionTexRequest) : undefined;
      fake.calls.push({ path, body });
      if (fake.hang) {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        });
      }
      if (!fake.online) throw new TypeError('Failed to fetch');
      const payload = path === '/health' ? fake.health : path === '/tex' ? fake.tex(body!) : null;
      const status = payload === null ? 404 : 200;
      const never = () =>
        new Promise<never>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        });
      return {
        ok: status === 200,
        status,
        json: async () => (fake.hangBody ? never() : payload),
        text: async () => (fake.hangBody ? never() : JSON.stringify(payload)),
      } as Response;
    }) as typeof fetch,
  };
  return fake;
}
