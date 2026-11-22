/* Full screen for a deck's element: the standard API, Safari's prefixed one where the standard is
 * missing, and nothing where neither is (an iPhone has none for an element), nor in a frame that
 * was not allowed it (`fullscreenEnabled` is false there). */

interface PrefixedDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => void;
}

interface PrefixedElement extends HTMLElement {
  webkitRequestFullscreen?: () => void;
}

export interface Fullscreen {
  /** Whether the element can go full screen in this browser and this page. */
  readonly supported: boolean;
  /** Whether it is full screen now. */
  active(): boolean;
  /** Takes it full screen, or out. Called from a key or a click: the browser asks for one. */
  toggle(): void;
  /** Calls `listener` when the page goes in or out of full screen; the result stops it. */
  watch(listener: () => void): () => void;
}

/** A promise a call may give, whose refusal (no gesture, a frame not allowed it) says nothing. */
function quietly(result: unknown): void {
  if (result && typeof (result as Promise<void>).catch === 'function') {
    (result as Promise<void>).catch(() => {});
  }
}

export function fullscreenOf(element: HTMLElement): Fullscreen {
  const doc = element.ownerDocument as PrefixedDocument;
  const target = element as PrefixedElement;
  const standard = typeof target.requestFullscreen === 'function';
  const prefixed = !standard && typeof target.webkitRequestFullscreen === 'function';
  const enabled = standard
    ? doc.fullscreenEnabled !== false
    : prefixed && doc.webkitFullscreenEnabled !== false;
  const current = () => (standard ? doc.fullscreenElement : doc.webkitFullscreenElement) ?? null;
  const events = standard ? ['fullscreenchange'] : prefixed ? ['webkitfullscreenchange'] : [];
  return {
    supported: enabled,
    active: () => current() === element,
    toggle() {
      if (!enabled) return;
      if (current() === element) {
        quietly(standard ? doc.exitFullscreen() : doc.webkitExitFullscreen?.());
      } else if (standard) quietly(target.requestFullscreen());
      else quietly(target.webkitRequestFullscreen!());
    },
    watch(listener) {
      for (const type of events) doc.addEventListener(type, listener);
      return () => {
        for (const type of events) doc.removeEventListener(type, listener);
      };
    },
  };
}
