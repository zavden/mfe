/* One running shape request and one replaceable pending request. Input and placement never
 * wait for the renderer; a stale response cannot replace a newer source. */
import type { FormulaRender, RenderError, RenderRequest, RenderResult } from '../../engine';

export interface TextPreviewState {
  key: string | null;
  render: FormulaRender | null;
  pending: boolean;
  error: string | null;
  /** What the renderer said when it refused the request (a LaTeX error with its log); null for
   * an error that is not its answer (a failed call) and while nothing failed. */
  failure: RenderError | null;
}

export function createTextPreview(
  render: (request: RenderRequest, signal?: AbortSignal) => Promise<RenderResult>,
  publish: (state: TextPreviewState) => void,
  seed: FormulaRender | null = null,
  delay = 150,
) {
  let generation = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: AbortController | null = null;
  let pending: { request: RenderRequest; key: string; generation: number } | null = null;
  let state: TextPreviewState = {
    key: null,
    render: seed,
    pending: false,
    error: null,
    failure: null,
  };
  // A call that changes nothing publishes nothing: a request per key would otherwise set the
  // editor's state on every key, from an effect, and leave a render behind each key's own. React
  // counts a commit that leaves an update as nested, and throws "Maximum update depth exceeded"
  // on the 51st in a row (the key that comes then is lost) when the keys come faster than it
  // renders what they leave: on a page still loading. The first call always publishes, so that
  // the editor's state is this queue's once it replaces another.
  let published = false;
  const update = (patch: Partial<TextPreviewState>) => {
    const next = { ...state, ...patch };
    const same = (Object.keys(next) as (keyof TextPreviewState)[]).every(
      (field) => next[field] === state[field],
    );
    if (published && same) return;
    state = next;
    published = true;
    if (!disposed) publish(state);
  };
  const drain = async () => {
    if (disposed || active || !pending) return;
    const job = pending;
    pending = null;
    const controller = new AbortController();
    active = controller;
    try {
      const result = await render(job.request, controller.signal);
      if (!disposed && job.generation === generation) {
        if (result.ok)
          update({
            key: job.key,
            render: result.render,
            pending: false,
            error: null,
            failure: null,
          });
        else if (Number.isFinite(result.error.retryAfterMs) && result.error.retryAfterMs! > 0) {
          // Admission pressure is temporary. Retry this generation without requiring another
          // keystroke; new input, composition suspension and disposal own the same timer.
          pending = job;
          update({ pending: true, error: result.error.message });
          timer = setTimeout(
            () => {
              timer = undefined;
              void drain();
            },
            Math.max(100, Math.min(2000, result.error.retryAfterMs!)),
          );
        } else update({ pending: false, error: result.error.message, failure: result.error });
      }
    } catch (error) {
      if (!disposed && job.generation === generation)
        update({
          pending: false,
          error: error instanceof Error ? error.message : String(error),
          failure: null,
        });
    } finally {
      active = null;
      if (!disposed && pending && !timer) void drain();
    }
  };
  return {
    retain(render: FormulaRender, key: string) {
      generation++;
      pending = null;
      active?.abort();
      clearTimeout(timer);
      timer = undefined;
      update({ key, render, pending: false, error: null, failure: null });
    },
    request(request: RenderRequest, key: string) {
      if (disposed) return;
      pending = { request, key, generation: ++generation };
      // Let bounded active work finish: aborting it can retire a warm native worker. Its
      // generation rejects stale output, and only the latest pending input runs afterwards.
      clearTimeout(timer);
      update({ pending: true, error: null, failure: null });
      timer = setTimeout(() => {
        timer = undefined;
        void drain();
      }, delay);
    },
    suspend() {
      generation++;
      pending = null;
      active?.abort();
      clearTimeout(timer);
      timer = undefined;
      update({ pending: false });
    },
    dispose() {
      disposed = true;
      generation++;
      pending = null;
      clearTimeout(timer);
      active?.abort();
    },
  };
}
