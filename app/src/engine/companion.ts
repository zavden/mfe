/* Client for the local companion, protocol v1 (docs/COMPANION.md).
 *
 * State machine (CompanionState): 'checking' until the first health check finishes, then
 * 'online' or 'offline'; 'unsupported' when this environment has no fetch. Health is polled
 * every ~5 s while offline and ~15 s while online (twice a second while the companion says
 * something is still coming: its interpreters being probed, a text worker starting), and
 * re-checked immediately when the window regains focus. Concurrent checks share one request. A failed /tex request (network error or
 * timeout) triggers a health check, so a companion that went away is noticed quickly.
 *
 * Listeners are notified only when the state actually changes (status or health payload). */
import type {
  CompanionFontCatalog,
  CompanionTextRequest,
  CompanionTextResponse,
  CompanionHealth,
  CompanionJobKind,
  CompanionJobStatus,
  CompanionManimRequest,
  CompanionState,
  CompanionTexRequest,
  CompanionTexResponse,
  CompanionVideoRequest,
} from './types';
import type { Target } from '../model';

const DEFAULT_COMPANION_URL = 'http://127.0.0.1:7799';
const COMPANION_PROTOCOL = 1;

/** Where the companion is: the page's own origin when the companion serves the app itself
 * (`serve --app`: the build at `/app/` on a local http origin, whatever its port), else the fixed
 * address every other page (the dev server, the build opened from a file) looks at. */
export function companionBaseUrl(
  location:
    | Pick<Location, 'protocol' | 'hostname' | 'origin' | 'pathname'>
    | undefined = globalThis.location,
): string {
  if (
    location?.protocol === 'http:' &&
    (location.hostname === '127.0.0.1' || location.hostname === 'localhost') &&
    location.pathname.startsWith('/app/')
  ) {
    return location.origin;
  }
  return DEFAULT_COMPANION_URL;
}

export interface CompanionClientOptions {
  baseUrl?: string;
  /** Defaults to the global fetch; null = no network access ('unsupported'). */
  fetch?: typeof fetch | null;
  /** Poll interval while offline (ms). */
  pollOfflineMs?: number;
  /** Poll interval while online (ms). */
  pollOnlineMs?: number;
  healthTimeoutMs?: number;
  texTimeoutMs?: number;
  /** Timeout of job control requests (create, status, cancel) and of downloading a result. */
  jobTimeoutMs?: number;
  /** Timeout of one frames request (a batch of PNGs). */
  framesTimeoutMs?: number;
  /** How long `finishVideoJob` waits for ffmpeg (its two passes, when the job has sound). */
  finishTimeoutMs?: number;
  /** Start polling immediately (default true). */
  autoStart?: boolean;
  /** Re-check on window focus (default true when `window` exists). */
  watchFocus?: boolean;
}

export interface CompanionClient {
  readonly baseUrl: string;
  state(): CompanionState;
  subscribe(listener: (state: CompanionState) => void): () => void;
  /** Run a health check now (shared with any check in flight); resolves with the new state. */
  check(): Promise<CompanionState>;
  /** Resolves with the current state once it is no longer 'checking'. */
  settled(): Promise<CompanionState>;
  /** POST /tex. Rejects with CompanionError on transport failures and non-200 statuses. */
  tex(request: CompanionTexRequest): Promise<CompanionTexResponse>;
  /** Pango endpoints are optional on legacy/custom clients. */
  fonts?(target: Target, signal?: AbortSignal): Promise<CompanionFontCatalog>;
  text?(request: CompanionTextRequest, signal?: AbortSignal): Promise<CompanionTextResponse>;
  // Jobs (companion >= 1.1). Transport/protocol errors reject with CompanionError; cancellation
  // keeps the signal's reason, and result destination writes keep their original error.
  /** POST /video: start an ffmpeg encoding job that will receive `request.frames` PNG frames. */
  createVideoJob(request: CompanionVideoRequest, signal?: AbortSignal): Promise<CompanionJobStatus>;
  /** POST /video/<id>/frames: one or more concatenated PNG files, the first being frame `first`. */
  sendVideoFrames(
    id: string,
    first: number,
    frames: Blob,
    signal?: AbortSignal,
  ): Promise<CompanionJobStatus>;
  /** POST /video/<id>/finish: all frames sent; resolves when ffmpeg is done (state 'done' or
   * 'failed' with `error`). */
  finishVideoJob(id: string, signal?: AbortSignal): Promise<CompanionJobStatus>;
  /** POST …/audio: a piece of the job's soundtrack (a WAV file: 16-bit PCM, stereo, 48 kHz, as
   * long as the video), `offset` being its position in the file. Companion >= 1.5, for a job
   * created with `audio`. */
  sendJobAudio(
    kind: CompanionJobKind,
    id: string,
    offset: number,
    bytes: Blob,
    signal?: AbortSignal,
  ): Promise<CompanionJobStatus>;
  /** POST /manim-render: run `request.code` with Manim (needs `capabilities.manimRender`). */
  startManimRender(
    request: CompanionManimRequest,
    signal?: AbortSignal,
  ): Promise<CompanionJobStatus>;
  /** GET /video/<id> or /manim-render/<id>. */
  jobStatus(kind: CompanionJobKind, id: string, signal?: AbortSignal): Promise<CompanionJobStatus>;
  /** GET …/result: the video file of a finished job — as a Blob, or written to `sink` as it
   * arrives (then null), so that a long video never sits whole in memory. */
  jobResult(
    kind: CompanionJobKind,
    id: string,
    signal?: AbortSignal,
    sink?: ByteSink | null,
  ): Promise<Blob | null>;
  /** DELETE: cancel the job and have its temporary files removed. Never rejects (best effort);
   * resolves true when the companion confirmed. */
  cancelJob(kind: CompanionJobKind, id: string): Promise<boolean>;
  start(): void;
  stop(): void;
}

/** Where bytes go as they arrive, at byte positions (a FileSystemWritableFileStream, say). */
export interface ByteSink {
  write(data: Uint8Array, position: number): Promise<void>;
}

/** Internal boundary: destination I/O must never be classified as companion transport I/O. */
class DestinationWriteError {
  constructor(readonly cause: unknown) {}
}

/** A /tex request that did not produce a protocol response. `unavailable` = network error or
 * timeout (the companion is probably gone); otherwise an HTTP error status. */
export class CompanionError extends Error {
  constructor(
    message: string,
    readonly unavailable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CompanionError';
  }
}

function isHealth(value: unknown): value is CompanionHealth {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<CompanionHealth>;
  return (
    v.name === 'mfe-companion' &&
    v.protocol === COMPANION_PROTOCOL &&
    typeof v.version === 'string' &&
    !!v.capabilities &&
    typeof v.capabilities === 'object'
  );
}

/** The companion says something is still coming: its Manim interpreters are being probed, or a
 * text worker is starting. */
function settling(health: CompanionHealth): boolean {
  const { manimProbing, pango } = health.capabilities;
  return !!manimProbing || Object.values(pango ?? {}).some((text) => text?.state === 'preparing');
}

/** The command that starts the companion so that this page can reach it: a page opened from a
 * file (file://) is refused unless the companion allows it with --allow-file-origin. The Python of
 * the system the browser runs on: Windows has no `python3` (the installer of python.org gives
 * `python`), and the companion is started on the machine of the page. */
export function companionCommand(
  protocol: string | undefined = globalThis.location?.protocol,
  platform: string | undefined = globalThis.navigator?.platform,
): string {
  const python = /^win/i.test(platform ?? '') ? 'python' : 'python3';
  const command = `${python} companion/mfe_companion.py serve`;
  return protocol === 'file:' ? `${command} --allow-file-origin` : command;
}

export function createCompanionClient(options: CompanionClientOptions = {}): CompanionClient {
  const baseUrl = (options.baseUrl ?? companionBaseUrl()).replace(/\/+$/, '');
  const fetchFn =
    options.fetch === null
      ? undefined
      : (options.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined));
  const pollOfflineMs = options.pollOfflineMs ?? 5_000;
  const pollOnlineMs = options.pollOnlineMs ?? 15_000;
  const healthTimeoutMs = options.healthTimeoutMs ?? 1_500;
  const texTimeoutMs = options.texTimeoutMs ?? 20_000;
  const jobTimeoutMs = options.jobTimeoutMs ?? 30_000;
  const framesTimeoutMs = options.framesTimeoutMs ?? 300_000;
  const finishTimeoutMs = options.finishTimeoutMs ?? 45 * 60_000;
  const watchFocus = options.watchFocus ?? typeof window !== 'undefined';

  let current: CompanionState = fetchFn ? { status: 'checking' } : { status: 'unsupported' };
  const listeners = new Set<(state: CompanionState) => void>();
  let inFlight: Promise<CompanionState> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  const waiters: ((state: CompanionState) => void)[] = [];

  const setState = (next: CompanionState) => {
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    current = next;
    for (const listener of [...listeners]) listener(next);
  };

  const schedule = () => {
    if (!running) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(
      () => {
        timer = null;
        void check();
      },
      // Something is on its way (the interpreters being probed, a text worker starting): look
      // again soon.
      current.status === 'online'
        ? settling(current.health)
          ? Math.min(pollOnlineMs, 500)
          : pollOnlineMs
        : pollOfflineMs,
    );
  };

  const runCheck = async (): Promise<CompanionState> => {
    if (!fetchFn) return current;
    let next: CompanionState = { status: 'offline' };
    // The timeout covers the body as well as the headers: a companion that answers the headers
    // and then stalls must not leave the client "checking" for good.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), healthTimeoutMs);
    try {
      const response = await fetchFn(`${baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      if (response.ok) {
        const body: unknown = await response.json();
        if (isHealth(body)) next = { status: 'online', health: body };
      }
    } catch {
      // Network error, timeout or invalid JSON: offline.
    } finally {
      clearTimeout(timer);
    }
    setState(next);
    waiters.splice(0).forEach((resolve) => resolve(next));
    return next;
  };

  const check = (): Promise<CompanionState> => {
    if (!fetchFn) return Promise.resolve(current);
    if (!inFlight) {
      inFlight = runCheck().finally(() => {
        inFlight = null;
        schedule();
      });
    }
    return inFlight;
  };

  const onFocus = () => void check();

  /** One request (a /tex render or a job call): sends it, checks the status and reads the body
   * with `read`. The caller's abort and the timeout stay in force until `read` has finished, so
   * a download can be cancelled or time out too. Aborting `signal` rejects with its own reason; a
   * transport failure or a timeout is a CompanionError (`unavailable`); an HTTP error carries the
   * companion's message. */
  const jobRequest = async <T>(
    path: string,
    init: RequestInit,
    timeoutMs: number,
    signal: AbortSignal | undefined,
    read: (response: Response, controller: AbortController) => Promise<T>,
  ): Promise<T> => {
    if (!fetchFn) throw new CompanionError('fetch is not available', true);
    signal?.throwIfAborted();
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    /** What a failed fetch or body read means for the caller. */
    const transportFailure = (error: unknown): never => {
      if (error instanceof DestinationWriteError) throw error.cause;
      if (signal?.aborted) throw signal.reason ?? error;
      if (error instanceof CompanionError) throw error;
      void check();
      throw new CompanionError(
        timedOut ? 'The companion did not answer in time.' : 'The companion is not reachable.',
        true,
      );
    };
    try {
      let response: Response;
      try {
        response = await fetchFn(`${baseUrl}${path}`, { ...init, signal: controller.signal });
      } catch (error) {
        return transportFailure(error);
      }
      if (!response.ok) {
        let message = `The companion answered with an error (HTTP ${response.status}). Check its terminal for details.`;
        try {
          const body = (await (path.startsWith('/text') || path.startsWith('/fonts')
            ? readTextJson(response)
            : response.json())) as { error?: { message?: unknown } };
          if (typeof body.error?.message === 'string' && body.error.message) {
            message = body.error.message;
          }
        } catch (error) {
          if (signal?.aborted) throw signal.reason ?? error;
          if (timedOut) throw new CompanionError('The companion did not answer in time.', true);
          if (error instanceof CompanionError) throw error;
          // keep the generic message
        }
        throw new CompanionError(message, false, response.status);
      }
      try {
        const result = await read(response, controller);
        controller.signal.throwIfAborted();
        return result;
      } catch (error) {
        return transportFailure(error);
      }
    } catch (error) {
      controller.abort(); // stop a failed result transfer as well as its owned body reader
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  };

  const readJson = async <T = CompanionJobStatus>(response: Response): Promise<T> => {
    try {
      return (await response.json()) as T;
    } catch {
      throw new CompanionError(
        'The companion sent an answer the app cannot read. Restart it, or update ' +
          'companion/mfe_companion.py if it is older than the app.',
        false,
        response.status,
      );
    }
  };
  const readBlob = (response: Response): Promise<Blob> => response.blob();
  /** Native vectors are untrusted transport data; bound allocation before parsing JSON. */
  const readTextJson = async <T>(response: Response): Promise<T> => {
    const limit = 16 * 1024 * 1024;
    const declared = Number(response.headers.get('content-length'));
    if (declared > limit) {
      void response.body?.cancel().catch(() => undefined);
      throw new CompanionError('Pango response exceeds the size limit.', false);
    }
    if (!response.body) throw new CompanionError('Pango response has no body.', false);
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let length = 0;
    let reading = false;
    const parts: string[] = [];
    try {
      for (;;) {
        reading = true;
        const item = await reader.read();
        reading = false;
        if (item.done) break;
        length += item.value.byteLength;
        if (length > limit)
          throw new CompanionError('Pango response exceeds the size limit.', false);
        parts.push(decoder.decode(item.value, { stream: true }));
      }
      parts.push(decoder.decode());
      return JSON.parse(parts.join('')) as T;
    } catch (error) {
      if (reading || error instanceof CompanionError) throw error;
      throw new CompanionError(
        'The companion sent invalid Pango JSON or UTF-8.',
        false,
        response.status,
      );
    } finally {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  };
  /** The body written to `sink` as it arrives. */
  const readInto =
    (sink: ByteSink) =>
    async (response: Response, controller: AbortController): Promise<null> => {
      const signal = controller.signal;
      const write = async (data: Uint8Array, position: number) => {
        signal.throwIfAborted();
        try {
          await sink.write(data, position);
        } catch (error) {
          throw new DestinationWriteError(error);
        }
        signal.throwIfAborted();
      };
      if (!response.body) {
        await write(new Uint8Array(await response.arrayBuffer()), 0);
        return null;
      }
      const reader = response.body.getReader();
      let position = 0;
      let complete = false;
      let cancellation: Promise<void> | undefined;
      const cancel = () => {
        cancellation ??= reader.cancel(signal.reason).catch(() => undefined);
      };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        for (;;) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          signal.throwIfAborted();
          if (done) {
            complete = true;
            return null;
          }
          await write(value, position);
          position += value.length;
        }
      } catch (error) {
        controller.abort();
        throw error;
      } finally {
        if (!complete) cancel();
        await cancellation;
        reader.releaseLock();
        signal.removeEventListener('abort', cancel);
      }
    };
  const readNothing = async (): Promise<void> => undefined;
  const jsonRequest = (
    path: string,
    init: RequestInit,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ) => jobRequest(path, init, timeoutMs, signal, readJson);

  const jsonInit = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const routeOf = (kind: CompanionJobKind) => (kind === 'video' ? '/video' : '/manim-render');

  const client: CompanionClient = {
    baseUrl,
    state: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    check,
    settled() {
      if (current.status !== 'checking') return Promise.resolve(current);
      return new Promise((resolve) => {
        waiters.push(resolve);
        if (!inFlight) void check();
      });
    },
    tex(request) {
      return jobRequest('/tex', jsonInit(request), texTimeoutMs, undefined, (response) =>
        readJson<CompanionTexResponse>(response),
      );
    },
    fonts(target, signal) {
      return jobRequest(
        `/fonts?target=${target}`,
        { method: 'GET' },
        12_000,
        signal,
        async (response) => {
          const catalog = await readTextJson<CompanionFontCatalog>(response);
          if (
            !catalog ||
            catalog.ok !== true ||
            catalog.target !== target ||
            typeof catalog.environmentKey !== 'string' ||
            typeof catalog.adapterVersion !== 'string' ||
            !Array.isArray(catalog.fonts) ||
            catalog.fonts.length > 20_000 ||
            catalog.fonts.some(
              (font) =>
                !font ||
                typeof font.family !== 'string' ||
                font.family.length > 256 ||
                !Array.isArray(font.faces) ||
                font.faces.length > 256 ||
                font.faces.some(
                  (face) =>
                    !face ||
                    typeof face.name !== 'string' ||
                    typeof face.weight !== 'string' ||
                    typeof face.slant !== 'string' ||
                    typeof face.synthetic !== 'boolean',
                ),
            )
          ) {
            throw new CompanionError(
              'The companion sent an invalid font catalog. Refresh it or restart the companion.',
              false,
            );
          }
          return catalog;
        },
      );
    },
    async text(request, signal) {
      const requestId = request.requestId ?? globalThis.crypto.randomUUID();
      const cancel = () => {
        void jobRequest(
          `/text/${encodeURIComponent(requestId)}`,
          { method: 'DELETE' },
          2_000,
          undefined,
          readNothing,
        ).catch(() => undefined);
      };
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        return await jobRequest(
          '/text',
          jsonInit({ ...request, requestId }),
          12_000,
          signal,
          (response) => readTextJson<CompanionTextResponse>(response),
        );
      } catch (error) {
        cancel();
        throw error;
      } finally {
        signal?.removeEventListener('abort', cancel);
      }
    },
    async createVideoJob(request, signal) {
      return jsonRequest('/video', jsonInit(request), jobTimeoutMs, signal);
    },
    async sendVideoFrames(id, first, frames, signal) {
      return jsonRequest(
        `/video/${encodeURIComponent(id)}/frames?first=${first}`,
        { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: frames },
        framesTimeoutMs,
        signal,
      );
    },
    async finishVideoJob(id, signal) {
      return jsonRequest(
        `/video/${encodeURIComponent(id)}/finish`,
        jsonInit({}),
        finishTimeoutMs,
        signal,
      );
    },
    async sendJobAudio(kind, id, offset, bytes, signal) {
      return jsonRequest(
        `${routeOf(kind)}/${encodeURIComponent(id)}/audio?offset=${offset}`,
        { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes },
        framesTimeoutMs,
        signal,
      );
    },
    async startManimRender(request, signal) {
      return jsonRequest('/manim-render', jsonInit(request), jobTimeoutMs, signal);
    },
    async jobStatus(kind, id, signal) {
      return jsonRequest(
        `${routeOf(kind)}/${encodeURIComponent(id)}`,
        { method: 'GET' },
        jobTimeoutMs,
        signal,
      );
    },
    async jobResult(kind, id, signal, sink = null) {
      // the long timeout covers the whole download, not only the headers
      return jobRequest(
        `${routeOf(kind)}/${encodeURIComponent(id)}/result`,
        { method: 'GET' },
        finishTimeoutMs,
        signal,
        sink ? readInto(sink) : readBlob,
      );
    },
    async cancelJob(kind, id) {
      try {
        await jobRequest(
          `${routeOf(kind)}/${encodeURIComponent(id)}`,
          { method: 'DELETE' },
          jobTimeoutMs,
          undefined,
          readNothing,
        );
        return true;
      } catch {
        return false;
      }
    },
    start() {
      if (running || !fetchFn) return;
      running = true;
      if (watchFocus && typeof window !== 'undefined') window.addEventListener('focus', onFocus);
      void check();
    },
    stop() {
      running = false;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
    },
  };
  if (options.autoStart ?? true) client.start();
  return client;
}
