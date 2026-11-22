// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  CHROMA_CHANNEL,
  CHROMA_PROTOCOL,
  HOST_NAME,
  startChromaHost,
  type ThemeResult,
} from '../hostBridge';

const envelope = (message: Record<string, unknown>) => ({
  channel: CHROMA_CHANNEL,
  version: CHROMA_PROTOCOL,
  ...message,
});

/** The editor's window and the frame's, as far as the bridge uses them. */
function windows(origin = 'http://127.0.0.1:5173', protocol = 'http:') {
  const listeners = new Set<(event: MessageEvent) => void>();
  const posted: { message: unknown; target: string }[] = [];
  const frame = {
    postMessage: (message: unknown, target: string) => posted.push({ message, target }),
  } as unknown as Window;
  const host = {
    location: { origin, protocol },
    addEventListener: (_type: string, listener: (event: MessageEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MessageEvent) => void) =>
      listeners.delete(listener),
  } as unknown as Window;
  const deliver = (data: unknown, from: { source?: unknown; origin?: string } = {}) => {
    const event = { data, source: from.source ?? frame, origin: from.origin ?? origin };
    for (const listener of [...listeners]) listener(event as MessageEvent);
  };
  return { host, frame, posted, listeners, deliver };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('the editor as Chroma Lab’s host', () => {
  it('presents itself on load and in answer to a greeting, to its own origin', () => {
    const { host, frame, posted, deliver } = windows();
    const bridge = startChromaHost({ host, frame: () => frame, onTheme: vi.fn() });
    expect(posted).toEqual([]);
    bridge.present();
    deliver(envelope({ type: 'hello' }));
    const presented = {
      message: envelope({ type: 'host', name: 'Manim Formula Editor' }),
      target: 'http://127.0.0.1:5173',
    };
    expect(posted).toEqual([presented, presented]);
    expect(HOST_NAME).toBe('Manim Formula Editor');
    bridge.stop();
  });

  it('has nobody to present itself to while there is no frame', () => {
    const { host, deliver, posted } = windows();
    const bridge = startChromaHost({ host, frame: () => null, onTheme: vi.fn() });
    expect(() => bridge.present()).not.toThrow();
    deliver(envelope({ type: 'hello' }), { source: {} });
    expect(posted).toEqual([]);
    bridge.stop();
  });

  it('hears only its frame, from its own origin, on this channel and version', async () => {
    const { host, frame, posted, deliver } = windows();
    const onTheme = vi.fn(async (): Promise<ThemeResult> => ({ ok: true }));
    const onReady = vi.fn();
    const bridge = startChromaHost({ host, frame: () => frame, onTheme, onReady });
    const theme = envelope({ type: 'theme', theme: { format: 'manim-palette' } });
    deliver(theme, { source: {} });
    deliver(theme, { origin: 'http://elsewhere.test' });
    deliver({ ...theme, channel: 'other' });
    deliver({ ...theme, version: 2 });
    deliver(envelope({ type: 'ready' }), { source: {} });
    deliver(null);
    deliver('theme');
    deliver(envelope({ type: 'unknown' }));
    await settle();
    expect(onTheme).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
    deliver(envelope({ type: 'ready' }));
    expect(onReady).toHaveBeenCalledOnce();
    bridge.stop();
  });

  it('hands a theme to the editor and tells Chroma Lab what came of it', async () => {
    const { host, frame, posted, deliver } = windows();
    const results: (ThemeResult | Error)[] = [
      { ok: true, message: 'Added.' },
      new Error('The palette library is full.'),
    ];
    const onTheme = vi.fn(async (): Promise<ThemeResult> => {
      const next = results.shift()!;
      if (next instanceof Error) throw next;
      return next;
    });
    const bridge = startChromaHost({ host, frame: () => frame, onTheme });
    const theme = { format: 'manim-palette', version: 1 };
    deliver(envelope({ type: 'theme', theme }));
    deliver(envelope({ type: 'theme', theme: 7 }));
    await settle();
    expect(onTheme.mock.calls).toEqual([[theme], [7]]);
    expect(posted.map((entry) => entry.message)).toEqual([
      envelope({ type: 'theme-result', ok: true, message: 'Added.' }),
      envelope({ type: 'theme-result', ok: false, message: 'The palette library is full.' }),
    ]);
    bridge.stop();
  });

  // Chrome calls the origin of a page opened from disk "file://", Firefox "null"; a message from
  // such a page says "null" in both.
  it.each([
    ['file://', 'file:'],
    ['null', 'file:'],
    ['null', 'about:'],
  ])(
    'opened from disk (%s, %s), hears the frame at "null" and posts to any',
    (origin, protocol) => {
      const { host, frame, posted, deliver } = windows(origin, protocol);
      const onReady = vi.fn();
      const bridge = startChromaHost({ host, frame: () => frame, onTheme: vi.fn(), onReady });
      deliver(envelope({ type: 'hello' }), { origin: 'null' });
      expect(posted).toEqual([
        { message: envelope({ type: 'host', name: HOST_NAME }), target: '*' },
      ]);
      deliver(envelope({ type: 'ready' }), { origin: 'null' });
      expect(onReady).toHaveBeenCalledOnce();
      // What does not say "null" is not that frame.
      deliver(envelope({ type: 'ready' }), { origin: 'http://elsewhere.test' });
      expect(onReady).toHaveBeenCalledOnce();
      bridge.stop();
    },
  );

  it('stops listening, and answers no theme that was still being imported', async () => {
    const { host, frame, posted, listeners, deliver } = windows();
    let finish!: (result: ThemeResult) => void;
    const onTheme = () => new Promise<ThemeResult>((resolve) => (finish = resolve));
    const bridge = startChromaHost({ host, frame: () => frame, onTheme });
    deliver(envelope({ type: 'theme', theme: {} }));
    bridge.stop();
    expect(listeners.size).toBe(0);
    finish({ ok: true });
    await settle();
    expect(posted).toEqual([]);
  });
});
