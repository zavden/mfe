// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormulaRender, RenderRequest, RenderResult } from '../../../engine';
import { createTextPreview, type TextPreviewState } from '../textPreview';

const request = (source: string): RenderRequest => ({
  kind: 'text',
  source,
  font: { family: 'Noto Sans', weight: 'normal', slant: 'normal' },
  fontSize: 48,
  target: 'ce',
  preamble: '',
  prefer: 'auto',
});
const result = (key: string): RenderResult => ({
  ok: true,
  render: {
    key,
    backend: 'pango',
    exact: true,
    target: 'ce',
    fontSize: 48,
    glyphs: [],
    bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    warnings: [],
  },
});
afterEach(() => vi.useRealTimers());

describe('composition shape queue', () => {
  it('retries temporary admission pressure without another keystroke', async () => {
    vi.useFakeTimers();
    const render = vi
      .fn<(request: RenderRequest, signal?: AbortSignal) => Promise<RenderResult>>()
      .mockResolvedValueOnce({
        ok: false,
        error: { backend: 'pango', message: 'Busy', retryAfterMs: 250 },
      })
      .mockResolvedValueOnce(result('A'));
    const publish = vi.fn();
    const worker = createTextPreview(render, publish);
    worker.request(request('A'), 'A');
    await vi.advanceTimersByTimeAsync(150);
    expect(render).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(249);
    expect(render).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(render).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'A', pending: false, error: null }),
    );
    worker.dispose();
  });

  it('replaces and cancels scheduled retries with the same ownership as ordinary requests', async () => {
    vi.useFakeTimers();
    const render = vi
      .fn<(request: RenderRequest, signal?: AbortSignal) => Promise<RenderResult>>()
      .mockResolvedValue({
        ok: false,
        error: { backend: 'pango', message: 'Busy', retryAfterMs: 250 },
      });
    const worker = createTextPreview(render, () => {});
    worker.request(request('A'), 'A');
    await vi.advanceTimersByTimeAsync(150);
    worker.request(request('B'), 'B');
    await vi.advanceTimersByTimeAsync(150);
    expect(
      render.mock.calls.map(([request]) => (request.kind === 'text' ? request.source : '')),
    ).toEqual(['A', 'B']);
    worker.suspend();
    await vi.advanceTimersByTimeAsync(1000);
    expect(render).toHaveBeenCalledTimes(2);
    worker.request(request('C'), 'C');
    await vi.advanceTimersByTimeAsync(150);
    worker.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(render).toHaveBeenCalledTimes(3);
  });
  it('publishes a call that changes something, and nothing for one that changes nothing', async () => {
    vi.useFakeTimers();
    const render = vi
      .fn<(request: RenderRequest, signal?: AbortSignal) => Promise<RenderResult>>()
      .mockResolvedValue(result('C'));
    const states: TextPreviewState[] = [];
    const worker = createTextPreview(render, (state) => states.push(state));
    // The first call publishes, even one that changes nothing: the state is then this queue's.
    worker.suspend();
    expect(states).toHaveLength(1);
    worker.suspend();
    expect(states).toHaveLength(1);
    // Keys typed before the render is asked for: the first one says it is pending, no other.
    worker.request(request('A'), 'A');
    worker.request(request('B'), 'B');
    worker.request(request('C'), 'C');
    expect(states).toHaveLength(2);
    expect(states.at(-1)).toMatchObject({ pending: true, key: null });
    await vi.advanceTimersByTimeAsync(150);
    expect(render).toHaveBeenCalledTimes(1);
    expect(states).toHaveLength(3);
    expect(states.at(-1)).toMatchObject({ key: 'C', pending: false, render: { key: 'C' } });
    worker.dispose();
  });

  it('keeps one active job, replaces pending input, and rejects an obsolete successful response', async () => {
    vi.useFakeTimers();
    const finish: ((result: RenderResult) => void)[] = [];
    const render = vi.fn<(request: RenderRequest, signal?: AbortSignal) => Promise<RenderResult>>(
      () => new Promise<RenderResult>((resolve) => finish.push(resolve)),
    );
    const states: TextPreviewState[] = [];
    const worker = createTextPreview(render, (state) => states.push(state));
    worker.request(request('A'), 'A');
    await vi.advanceTimersByTimeAsync(150);
    worker.request(request('B'), 'B');
    worker.request(request('C'), 'C');
    expect(render.mock.calls[0]![1]!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    expect(render).toHaveBeenCalledTimes(1);
    finish[0]!(result('A'));
    await vi.advanceTimersByTimeAsync(0);
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[1]![0]).toMatchObject({ source: 'C' });
    expect(states.at(-1)!.render).toBeNull();
    finish[1]!(result('C'));
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toMatchObject({ key: 'C', pending: false, render: { key: 'C' } });
    worker.request(request('D'), 'D');
    await vi.advanceTimersByTimeAsync(150);
    const active = render.mock.calls[2]![1]!;
    worker.dispose();
    expect(active.aborted).toBe(true);
    finish[2]!(result('D'));
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)!.render?.key).toBe('C');
  });

  it('does not publish a late result after disposal or composition suspension', async () => {
    vi.useFakeTimers();
    let resolve!: (value: RenderResult) => void;
    const publish = vi.fn();
    const worker = createTextPreview(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
      publish,
    );
    worker.request(request('draft'), 'draft');
    await vi.advanceTimersByTimeAsync(150);
    worker.suspend();
    const count = publish.mock.calls.length;
    resolve(result('draft'));
    await vi.advanceTimersByTimeAsync(0);
    expect(publish).toHaveBeenCalledTimes(count);
    worker.dispose();
  });

  it('retains an authoritative saved render without a native request', () => {
    const render = vi.fn();
    const publish = vi.fn();
    const worker = createTextPreview(render, publish);
    const saved = (result('saved') as { ok: true; render: FormulaRender }).render;
    worker.retain(saved, 'basis');
    expect(render).not.toHaveBeenCalled();
    expect(publish).toHaveBeenLastCalledWith({
      key: 'basis',
      render: saved,
      pending: false,
      error: null,
      failure: null,
    });
    worker.dispose();
  });

  it('keeps what the renderer said of a refused request, until the next one is asked', async () => {
    vi.useFakeTimers();
    const refused = {
      backend: 'latex' as const,
      message: 'Undefined control sequence',
      log: '! \\foo',
    };
    const render = vi
      .fn<(request: RenderRequest, signal?: AbortSignal) => Promise<RenderResult>>()
      .mockResolvedValueOnce({ ok: false, error: refused })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(result('C'));
    const states: TextPreviewState[] = [];
    const worker = createTextPreview(render, (state) => states.push(state), null, 10);
    worker.request(request('\\foo'), 'a');
    await vi.advanceTimersByTimeAsync(10);
    expect(states.at(-1)).toMatchObject({
      pending: false,
      error: refused.message,
      failure: refused,
    });
    // A call that failed is an error without an answer of the renderer.
    worker.request(request('b'), 'b');
    expect(states.at(-1)).toMatchObject({ pending: true, error: null, failure: null });
    await vi.advanceTimersByTimeAsync(10);
    expect(states.at(-1)).toMatchObject({ pending: false, error: 'offline', failure: null });
    worker.request(request('c'), 'c');
    await vi.advanceTimersByTimeAsync(10);
    expect(states.at(-1)).toMatchObject({ key: 'c', error: null, failure: null });
    worker.dispose();
  });
});
