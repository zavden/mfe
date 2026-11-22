/* Order physical saves from command invocation, including time spent in a picker or permission
 * question. Different native files can write together once their destinations are known. */
import type { FileHandleLike } from './files';

interface PendingSave {
  destination: Promise<FileHandleLike | null>;
  finished: Promise<void>;
}

const pending = new Set<PendingSave>();

/** Whether two handles may name one file: true as well when they cannot be compared. */
export async function mayBeSameFile(a: FileHandleLike, b: FileHandleLike): Promise<boolean> {
  if (a === b) return true;
  try {
    if (a.isSameEntry) return await a.isSameEntry(b);
    if (b.isSameEntry) return await b.isSameEntry(a);
  } catch {
    // A wrapper or an unavailable handle may not support comparing entries. Serialize safely.
  }
  return true;
}

/** Reserve before the first await. Release in the command's finally, including cancellation and
 * failure, so a cancelled picker or failed writer never strands the commands behind it. */
export function reserveSave(): {
  waitForTurn(handle: FileHandleLike): Promise<void>;
  release(): void;
} {
  const earlier = [...pending];
  let choose!: (handle: FileHandleLike | null) => void;
  let finish!: () => void;
  const entry: PendingSave = {
    destination: new Promise((resolve) => {
      choose = resolve;
    }),
    finished: new Promise((resolve) => {
      finish = resolve;
    }),
  };
  pending.add(entry);
  return {
    async waitForTurn(handle) {
      choose(handle);
      for (const previous of earlier) {
        const destination = await previous.destination;
        if (destination && (await mayBeSameFile(destination, handle))) await previous.finished;
      }
    },
    release() {
      // A command that downloads, is refused, or is cancelled has no native destination.
      choose(null);
      finish();
      pending.delete(entry);
    },
  };
}
