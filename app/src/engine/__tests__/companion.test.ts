import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CompanionError,
  companionBaseUrl,
  companionCommand,
  createCompanionClient,
} from '../companion';
import type { CompanionState } from '../types';
import { fakeCompanion, HEALTH } from './fakeCompanion';

const okTex = () => ({
  ok: true as const,
  svg: '<svg/>',
  glyphs: [],
  cached: false,
  ms: 1,
  warnings: [],
});

afterEach(() => {
  vi.useRealTimers();
});

describe('companionCommand', () => {
  it('adds --allow-file-origin for a page opened from a file', () => {
    expect(companionCommand('http:')).toBe('python3 companion/mfe_companion.py serve');
    expect(companionCommand(undefined)).toBe('python3 companion/mfe_companion.py serve');
    expect(companionCommand('file:')).toBe(
      'python3 companion/mfe_companion.py serve --allow-file-origin',
    );
  });

  it('names the Python of the system the browser runs on', () => {
    // Windows has no `python3`: the installer of python.org gives `python`.
    expect(companionCommand('http:', 'Win32')).toBe('python companion/mfe_companion.py serve');
    expect(companionCommand('file:', 'Win32')).toBe(
      'python companion/mfe_companion.py serve --allow-file-origin',
    );
    for (const platform of ['Linux x86_64', 'MacIntel', '', undefined]) {
      expect(companionCommand('http:', platform)).toBe('python3 companion/mfe_companion.py serve');
    }
  });
});

describe('companion client', () => {
  it('goes from checking to online and notifies once per change', async () => {
    const fake = fakeCompanion(okTex);
    const client = createCompanionClient({ fetch: fake.fetch, autoStart: false });
    expect(client.state()).toEqual({ status: 'checking' });
    const seen: CompanionState['status'][] = [];
    client.subscribe((s) => seen.push(s.status));
    const state = await client.settled();
    expect(state.status).toBe('online');
    await client.check();
    expect(seen).toEqual(['online']);
    expect(fake.calls[0]!.path).toBe('/health');
  });

  it('treats unreachable companions and other protocols as offline', async () => {
    const fake = fakeCompanion(okTex);
    fake.online = false;
    const client = createCompanionClient({ fetch: fake.fetch, autoStart: false });
    expect((await client.check()).status).toBe('offline');
    fake.online = true;
    fake.health = { name: 'mfe-companion', version: '2', protocol: 2, capabilities: {} };
    expect((await client.check()).status).toBe('offline');
  });

  it('is unsupported without fetch', async () => {
    const client = createCompanionClient({ fetch: null });
    expect(client.state()).toEqual({ status: 'unsupported' });
    expect(await client.settled()).toEqual({ status: 'unsupported' });
  });

  it('times out a hanging health check', async () => {
    vi.useFakeTimers();
    const fake = fakeCompanion(okTex);
    fake.hang = true;
    const client = createCompanionClient({ fetch: fake.fetch, autoStart: false });
    const pending = client.check();
    await vi.advanceTimersByTimeAsync(1_600);
    expect((await pending).status).toBe('offline');
  });

  it('times out a health check whose body never arrives', async () => {
    vi.useFakeTimers();
    const fake = fakeCompanion(okTex);
    fake.hangBody = true;
    const client = createCompanionClient({ fetch: fake.fetch, autoStart: false });
    const pending = client.check();
    await vi.advanceTimersByTimeAsync(1_600);
    expect((await pending).status).toBe('offline');
  });

  it('polls every 5 s while offline and every 15 s while online, and on focus', async () => {
    vi.useFakeTimers();
    const fake = fakeCompanion(okTex);
    fake.online = false;
    const client = createCompanionClient({ fetch: fake.fetch });
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fake.calls).toHaveLength(2);
    fake.online = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(client.state().status).toBe('online');
    expect(fake.calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(fake.calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fake.calls).toHaveLength(4);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.calls).toHaveLength(5);
    client.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.calls).toHaveLength(5);
  });

  it('looks twice a second while the companion says something is still coming', async () => {
    vi.useFakeTimers();
    const fake = fakeCompanion(okTex);
    const capabilities = (extra: object) => ({
      ...HEALTH,
      capabilities: { ...HEALTH.capabilities, ...extra },
    });
    // A text worker is starting.
    fake.health = capabilities({ pango: { ce: { state: 'preparing' }, gl: { state: 'unused' } } });
    const client = createCompanionClient({ fetch: fake.fetch });
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(fake.calls).toHaveLength(2);
    // Ready: back to the slow poll. A worker nothing asked for is nothing to wait for.
    fake.health = capabilities({
      pango: {
        ce: { state: 'ready', adapterVersion: 'a', environmentKey: 'e' },
        gl: { state: 'unused' },
      },
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(fake.calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(fake.calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fake.calls).toHaveLength(4);
    // The interpreters being probed: soon again.
    fake.health = capabilities({ manimProbing: true });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fake.calls).toHaveLength(5);
    await vi.advanceTimersByTimeAsync(500);
    expect(fake.calls).toHaveLength(6);
    client.stop();
  });

  it('posts /tex and reports transport failures as unavailable', async () => {
    const fake = fakeCompanion(okTex);
    const client = createCompanionClient({ fetch: fake.fetch, autoStart: false });
    const request = { latex: 'x', packages: [], preamble: '', target: 'ce' as const };
    expect((await client.tex(request)).ok).toBe(true);
    expect(fake.calls.at(-1)).toEqual({ path: '/tex', body: request });
    fake.online = false;
    const error = await client.tex(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CompanionError);
    expect((error as CompanionError).unavailable).toBe(true);
    await client.settled();
    expect(client.state().status).toBe('offline');
  });

  it("reports an HTTP error of /tex with the companion's own message", async () => {
    const body = { ok: false, error: { message: 'Unknown package: foo', line: null, log: '' } };
    const fetchFn = (async () =>
      ({
        ok: false,
        status: 400,
        json: async () => body,
        text: async () => JSON.stringify(body),
      }) as Response) as typeof fetch;
    const client = createCompanionClient({ fetch: fetchFn, autoStart: false });
    const request = { latex: 'x', packages: ['foo'], preamble: '', target: 'ce' as const };
    const error = await client.tex(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CompanionError);
    expect(error).toMatchObject({
      message: 'Unknown package: foo',
      status: 400,
      unavailable: false,
    });
  });

  it('strips trailing slashes from the base URL', () => {
    const client = createCompanionClient({ baseUrl: 'http://127.0.0.1:7800/', autoStart: false });
    expect(client.baseUrl).toBe('http://127.0.0.1:7800');
  });
});

describe('companionBaseUrl', () => {
  const at = (href: string) => {
    const u = new URL(href);
    return { protocol: u.protocol, hostname: u.hostname, origin: u.origin, pathname: u.pathname };
  };

  it('is the page itself when the companion serves the app, else the fixed address', () => {
    expect(companionBaseUrl(at('http://127.0.0.1:7800/app/'))).toBe('http://127.0.0.1:7800');
    expect(companionBaseUrl(at('http://localhost:7799/app/index.html'))).toBe(
      'http://localhost:7799',
    );
    expect(companionBaseUrl(at('http://localhost:5173/'))).toBe('http://127.0.0.1:7799');
    expect(companionBaseUrl(at('http://127.0.0.1:5199/app'))).toBe('http://127.0.0.1:7799');
    expect(companionBaseUrl(at('https://example.com/app/'))).toBe('http://127.0.0.1:7799');
    expect(companionBaseUrl(at('file:///home/me/dist/index.html'))).toBe('http://127.0.0.1:7799');
    expect(companionBaseUrl(undefined)).toBe('http://127.0.0.1:7799');
  });
});
