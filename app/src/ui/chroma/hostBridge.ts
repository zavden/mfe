/* The editor's side of Chroma Lab's host bridge. The other side is `src/host-bridge.js` in
 * Chroma Lab, and "Host bridge" in its docs/ARCHITECTURE.md is the contract: messages between
 * the two windows and nothing else.
 *
 *   Chroma Lab → editor   { type: 'hello' }                       it started in a frame
 *   editor → Chroma Lab   { type: 'host', name }                  the answer; also sent on load
 *   Chroma Lab → editor   { type: 'ready' }                       its Send button is on the page
 *   Chroma Lab → editor   { type: 'theme', theme }                the user pressed Send
 *   editor → Chroma Lab   { type: 'theme-result', ok, message? }  what the editor did with it
 *
 * Every message carries `channel: 'chroma-lab'` and `version: 1`. */
export const CHROMA_CHANNEL = 'chroma-lab';
export const CHROMA_PROTOCOL = 1;
/** The name Chroma Lab writes on its button: "Send to Manim Formula Editor". */
export const HOST_NAME = 'Manim Formula Editor';

export interface ThemeResult {
  ok: boolean;
  /** Shown by Chroma Lab as a notice. */
  message?: string;
}

export interface ChromaHostOptions {
  /** The editor's window. */
  host: Window;
  /** The window of the frame Chroma Lab runs in, or null while there is none. */
  frame(): Window | null;
  /** The user sent a theme. It is data from another document: validate it like a file. */
  onTheme(theme: unknown): Promise<ThemeResult>;
  /** Chroma Lab knows its host: its Send button is on the page. */
  onReady?(): void;
}

export interface ChromaHost {
  /** Tell the frame who hosts it. Call it when the frame has loaded. A greeting is answered the
   * same way: Chroma Lab takes whichever reaches it first, and a repeat changes nothing. */
  present(): void;
  stop(): void;
}

/** Listen to the frame and answer it. Only the frame's own window is heard, and only from the
 * editor's origin: the frame is a page of the editor's build. Chroma Lab, for its part, takes a
 * host only from its parent at its own origin. */
export function startChromaHost(options: ChromaHostOptions): ChromaHost {
  const { host } = options;
  // A build opened from disk has an opaque origin: a message from it says "null" whatever
  // `location.origin` says (Chrome says "file://"), and it cannot be named as a target.
  const opaque = host.location.protocol === 'file:' || host.location.origin === 'null';
  const origin = opaque ? 'null' : host.location.origin;
  const post = (message: Record<string, unknown>) =>
    options
      .frame()
      ?.postMessage(
        { channel: CHROMA_CHANNEL, version: CHROMA_PROTOCOL, ...message },
        opaque ? '*' : origin,
      );
  const present = () => post({ type: 'host', name: HOST_NAME });
  let stopped = false;
  const onMessage = (event: MessageEvent) => {
    const frame = options.frame();
    if (!frame || event.source !== frame || event.origin !== origin) return;
    const data: unknown = event.data;
    if (data === null || typeof data !== 'object') return;
    const message = data as Record<string, unknown>;
    if (message.channel !== CHROMA_CHANNEL || message.version !== CHROMA_PROTOCOL) return;
    if (message.type === 'hello') present();
    else if (message.type === 'ready') options.onReady?.();
    else if (message.type === 'theme') {
      void options
        .onTheme(message.theme)
        .catch((reason: unknown): ThemeResult => ({
          ok: false,
          message: reason instanceof Error ? reason.message : String(reason),
        }))
        .then((result) => {
          if (!stopped) post({ type: 'theme-result', ...result });
        });
    }
  };
  host.addEventListener('message', onMessage);
  return {
    present,
    stop: () => {
      stopped = true;
      host.removeEventListener('message', onMessage);
    },
  };
}
