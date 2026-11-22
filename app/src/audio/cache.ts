/** Disposable derived data only. Original media never enters this cache. */
export class ByteBudgetCache<T> {
  private entries = new Map<string, { value: T; bytes: number }>();
  private used = 0;
  private peak = 0;

  constructor(readonly budgetBytes: number) {
    if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 0)
      throw new Error('Invalid audio cache budget.');
  }

  get bytes(): number {
    return this.used;
  }
  get peakBytes(): number {
    return this.peak;
  }
  get size(): number {
    return this.entries.size;
  }

  get(key: string): T | undefined {
    const item = this.entries.get(key);
    if (!item) return undefined;
    this.entries.delete(key);
    this.entries.set(key, item);
    return item.value;
  }

  set(key: string, value: T, bytes: number): void {
    if (!Number.isSafeInteger(bytes) || bytes < 0)
      throw new Error('Invalid audio cache allocation.');
    this.delete(key);
    if (bytes > this.budgetBytes) return;
    while (this.used + bytes > this.budgetBytes) this.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, bytes });
    this.used += bytes;
    this.peak = Math.max(this.peak, this.used);
  }

  delete(key: string): void {
    const item = this.entries.get(key);
    if (!item) return;
    this.used -= item.bytes;
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.used = 0;
  }
}
