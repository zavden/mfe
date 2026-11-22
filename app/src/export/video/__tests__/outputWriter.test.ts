import { describe, expect, it, vi } from 'vitest';
import {
  createOutputWriter,
  MAX_PENDING_OUTPUT_BYTES,
  OUTPUT_HIGH_WATER_BYTES,
} from '../outputWriter';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('output byte ownership', () => {
  it('accounts for the active write, applies backpressure and preserves write order', async () => {
    const release = deferred();
    const writes: number[] = [];
    const writer = createOutputWriter({
      write: async (_data, position) => {
        writes.push(position);
        if (position === 0) await release.promise;
      },
    });
    const data = new Uint8Array(OUTPUT_HIGH_WATER_BYTES / 2);
    writer.onData(data, 0);
    writer.onData(data, data.length);
    expect(writer.pendingBytes).toBe(OUTPUT_HIGH_WATER_BYTES);
    let ready = false;
    const capacity = writer.waitForCapacity().then(() => {
      ready = true;
    });
    await Promise.resolve();
    expect(ready).toBe(false);
    expect(writes).toEqual([0]);
    release.resolve();
    await capacity;
    await writer.drain();
    expect(writes).toEqual([0, data.length]);
    expect(writer.pendingBytes).toBe(0);
  });

  it('never copies beyond its byte cap, even when synchronous output ignores backpressure', async () => {
    const release = deferred();
    const onError = vi.fn();
    const sink = { write: vi.fn(async () => release.promise) };
    const writer = createOutputWriter(sink, onError);
    writer.onData(new Uint8Array(MAX_PENDING_OUTPUT_BYTES), 0);
    expect(writer.pendingBytes).toBe(MAX_PENDING_OUTPUT_BYTES);
    expect(() => writer.onData(new Uint8Array(1), MAX_PENDING_OUTPUT_BYTES)).toThrow(
      'output buffer',
    );
    expect(writer.pendingBytes).toBe(MAX_PENDING_OUTPUT_BYTES);
    expect(onError).toHaveBeenCalledOnce();
    const drained = writer.drain().catch((error) => error);
    release.resolve();
    expect(await drained).toBe(onError.mock.calls[0]![0]);
    expect(writer.pendingBytes).toBe(0);
    expect(sink.write).toHaveBeenCalledOnce();
  });

  it('drops queued copies on cancellation but waits for the one active write to settle', async () => {
    const release = deferred();
    const sink = { write: vi.fn(async () => release.promise) };
    const writer = createOutputWriter(sink);
    writer.onData(new Uint8Array(3), 0);
    writer.onData(new Uint8Array(5), 3);
    const reason = new DOMException('Cancelled', 'AbortError');
    writer.abort(reason);
    expect(writer.pendingBytes).toBe(3);
    expect(() => writer.onData(new Uint8Array(1), 8)).toThrow(reason);
    let done = false;
    const drain = writer.drain().catch((error) => {
      done = true;
      return error;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    release.resolve();
    expect(await drain).toBe(reason);
    expect(writer.pendingBytes).toBe(0);
    expect(sink.write).toHaveBeenCalledOnce();
  });

  it('exposes the first disk error immediately and never writes the remaining queue', async () => {
    const release = deferred();
    const reason = new Error('Disk full');
    const onError = vi.fn();
    const sink = {
      write: vi.fn(async () => {
        await release.promise;
        throw reason;
      }),
    };
    const writer = createOutputWriter(sink, onError);
    writer.onData(new Uint8Array(1), 0);
    writer.onData(new Uint8Array(2), 1);
    release.resolve();
    await expect(writer.drain()).rejects.toBe(reason);
    await expect(writer.waitForCapacity()).rejects.toBe(reason);
    expect(onError).toHaveBeenCalledExactlyOnceWith(reason);
    expect(sink.write).toHaveBeenCalledOnce();
    expect(writer.pendingBytes).toBe(0);
  });
});
