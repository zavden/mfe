/* The video export as the dialog drives it: one export at a time, where it stands (`VideoRun`)
 * for the progress panel, Export → `start`, Cancel → `cancel`; closing the dialog (unmounting)
 * aborts an export until irreversible publication begins. The export itself is `videoExportRun.ts`. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDocumentStore } from '../project/documentStore';
import { runVideoExport, type VideoRun, type VideoRunInput } from './videoExportRun';

export interface VideoExport {
  run: VideoRun;
  running: boolean;
  /** Runs the export; nothing while one runs. */
  start(input: VideoRunInput): Promise<void>;
  cancel(): void;
}

export function useVideoExport(): VideoExport {
  const [run, setRun] = useState<VideoRun>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const committing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!committing.current) controller.current?.abort();
    };
  }, []);
  const start = useCallback(async (input: VideoRunInput) => {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    committing.current = false;
    const session = useDocumentStore.getState().session;
    const ownsRun = () =>
      mounted.current &&
      controller.current === abort &&
      useDocumentStore.getState().session === session;
    const unsubscribe = useDocumentStore.subscribe(() => {
      if (!ownsRun() && !committing.current) abort.abort();
    });
    try {
      await runVideoExport(
        input,
        (next) => {
          committing.current = next.status === 'committing';
          if (mounted.current && controller.current === abort) setRun(next);
        },
        abort.signal,
        undefined,
        ownsRun,
      );
    } finally {
      unsubscribe();
      if (controller.current === abort) controller.current = null;
    }
  }, []);
  const cancel = useCallback(() => {
    if (!committing.current) controller.current?.abort();
  }, []);
  return { run, running: run.status === 'running' || run.status === 'committing', start, cancel };
}
