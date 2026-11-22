// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROGRESS_DELAY_MS, useProgressStore, withProgress } from '../progressStore';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const tasks = () => useProgressStore.getState().tasks;
const task = () => tasks()[0] ?? null;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  useProgressStore.setState({ tasks: [] });
});

describe('a task the user waits for', () => {
  it('is not shown when the work ends before the delay: no dialog flashes by', async () => {
    const work = deferred<string>();
    const running = withProgress({ title: 'Opening a.mfe' }, (report) => {
      report(1, 2);
      return work.promise;
    });
    expect(task()).toMatchObject({ title: 'Opening a.mfe', shown: false, done: 1, total: 2 });
    await vi.advanceTimersByTimeAsync(PROGRESS_DELAY_MS - 1);
    expect(task()!.shown).toBe(false);
    work.resolve('opened');
    expect(await running).toBe('opened');
    expect(task()).toBeNull();
    await vi.advanceTimersByTimeAsync(PROGRESS_DELAY_MS);
    expect(task()).toBeNull();
  });

  it('is shown once it has lasted, and follows what the work reports', async () => {
    const work = deferred<string>();
    let report!: (done: number, total: number) => void;
    const running = withProgress({ title: 'Opening a.mfe', message: 'Copying' }, (r) => {
      report = r;
      return work.promise;
    });
    report(10, 100);
    await vi.advanceTimersByTimeAsync(PROGRESS_DELAY_MS);
    expect(task()).toMatchObject({
      title: 'Opening a.mfe',
      message: 'Copying',
      shown: true,
      done: 10,
      total: 100,
      cancelling: false,
    });
    report(60, 100);
    expect(task()).toMatchObject({ done: 60, total: 100 });
    work.resolve('opened');
    expect(await running).toBe('opened');
    expect(task()).toBeNull();
  });

  it('Cancel aborts the signal of the work, and the task stays until the work has stopped', async () => {
    const work = deferred<never>();
    let signal!: AbortSignal;
    const running = withProgress({ title: 'Opening a.mfe' }, (_report, s) => {
      signal = s;
      return work.promise;
    });
    const stopped = expect(running).rejects.toThrow('stopped');
    await vi.advanceTimersByTimeAsync(PROGRESS_DELAY_MS);
    expect(signal.aborted).toBe(false);
    task()!.cancel();
    expect(signal.aborted).toBe(true);
    expect(task()).toMatchObject({ shown: true, cancelling: true });
    work.reject(new Error('stopped'));
    await stopped;
    expect(task()).toBeNull();
  });

  it('keeps two tasks apart: each has its own Cancel, and one ending leaves the other', async () => {
    const works = [deferred<string>(), deferred<string>()];
    const signals: AbortSignal[] = [];
    const [first, second] = works.map((work, index) =>
      withProgress({ title: `Opening ${index}.mfe` }, (report, signal) => {
        signals.push(signal);
        report(index + 1, 10);
        return work.promise;
      }),
    );
    expect(tasks().map(({ title, done }) => [title, done])).toEqual([
      ['Opening 0.mfe', 1],
      ['Opening 1.mfe', 2],
    ]);
    await vi.advanceTimersByTimeAsync(PROGRESS_DELAY_MS);
    expect(tasks().map((item) => item.shown)).toEqual([true, true]);
    // The second task did not take the first one's place: its Cancel still reaches its work.
    tasks()[0]!.cancel();
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
    works[0]!.reject(new Error('stopped'));
    await expect(first).rejects.toThrow('stopped');
    expect(tasks().map((item) => item.title)).toEqual(['Opening 1.mfe']);
    works[1]!.resolve('opened');
    expect(await second).toBe('opened');
    expect(tasks()).toEqual([]);
  });

  it('a failure takes the task away and reaches the caller', async () => {
    const running = withProgress({ title: 'Opening a.mfe' }, async () => {
      throw new Error('damaged');
    });
    await expect(running).rejects.toThrow('damaged');
    expect(task()).toBeNull();
  });
});
