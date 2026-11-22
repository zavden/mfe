/* The layer the capture tool draws into the app while it captures it: a visible pointer (the
 * real one is never in a screenshot nor in a recording) with a ripple where it clicks and a ring
 * while a button is held, the keys held or pressed, and highlight rings with numbered markers.
 *
 * It is drawn with the app's own design tokens (`app/src/ui/styles.css`, which applies the
 * owner's Mint style guide, `../guia_estilos/`), so it follows the theme the app is in and looks
 * like part of the app:
 *   - a highlight ring is the guide's focus ring — 2 px of the mint accent, 3 px away from what it
 *     rings, its corners following that element's — with the accent's glow (`--primary-glow`);
 *   - a numbered marker, a held key and a key just pressed are the mint of a primary button
 *     (`--primary-gradient`, `--primary-text`, `--primary-edge`, `--primary-glow`);
 *   - a key cap is the app's own (Help ▸ Keyboard shortcuts…), on a menu's glass;
 *   - the click ripple and the held-button ring are the accent, the pointer the app's text colour
 *     edged with its panel colour (light on dark, dark on light).
 * Every size is multiplied by `--k`, the ratio by which a page will shrink the image (an image
 * wider than the page's column is shown narrower), so that a ring stays 2 px on the page.
 *
 * `installOverlay` runs in the page (`page.evaluate(installOverlay, OVERLAY_ASSETS)`): it takes
 * all it needs as its argument and leaves `window.__mfeCapture`, which the kit calls. Everything
 * lives in a shadow root on a fixed host that the pointer goes through (`pointer-events: none`),
 * above the app; the app's custom properties reach it by inheritance. */

const k = (px) => `calc(${px}px * var(--k))`;

const CSS = `
:host { all: initial; }
.root {
  --cursor-fill: var(--text);
  --cursor-edge: var(--panel);
  position: fixed; inset: 0; pointer-events: none;
  font-family: var(--font-ui);
}
.ring {
  position: fixed; box-sizing: border-box;
  border: ${k(2)} solid var(--accent-bright);
  box-shadow: var(--primary-glow);
}
.marker {
  position: fixed; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  width: ${k(24)}; height: ${k(24)}; border-radius: 999px;
  border: ${k(1)} solid var(--primary-edge);
  background: var(--primary-gradient);
  box-shadow: var(--primary-glow);
  color: var(--primary-text);
  font: 700 ${k(13)}/1 var(--font-ui);
  font-variant-numeric: tabular-nums;
}
.cursor { position: fixed; left: 0; top: 0; display: none; transform-origin: 0 0; }
.cursor.is-shown { display: block; }
.cursor svg { display: block; width: ${k(24)}; height: ${k(24)}; overflow: visible;
  transition: transform var(--motion-fast, 140ms); }
.cursor.is-pressed svg { transform: scale(0.9); }
.cursor svg path { fill: var(--cursor-fill); stroke: var(--cursor-edge); stroke-width: 1.5;
  stroke-linejoin: round; paint-order: stroke; }
.cursor svg .line { fill: none; stroke: var(--cursor-fill); stroke-width: 2;
  stroke-linecap: round; }
.cursor svg .line-edge { fill: none; stroke: var(--cursor-edge); stroke-width: 4.5;
  stroke-linecap: round; }
.press {
  position: fixed; left: 0; top: 0; box-sizing: border-box;
  width: ${k(28)}; height: ${k(28)}; margin: ${k(-14)} 0 0 ${k(-14)}; border-radius: 50%;
  border: ${k(2)} solid var(--accent-bright);
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  box-shadow: var(--primary-glow);
  opacity: 0; transition: opacity var(--motion-fast, 140ms);
}
.press.is-on { opacity: 1; }
.ripple {
  position: fixed; box-sizing: border-box;
  width: ${k(46)}; height: ${k(46)}; margin: ${k(-23)} 0 0 ${k(-23)}; border-radius: 50%;
  border: ${k(2)} solid var(--accent-bright);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  animation: mfe-ripple 520ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
.ripple.is-secondary { border-style: dashed; }
@keyframes mfe-ripple {
  from { transform: scale(0.25); opacity: 0.95; }
  to { transform: scale(1); opacity: 0; }
}
.keys {
  position: fixed; box-sizing: border-box;
  display: flex; align-items: center; gap: ${k(6)};
  padding: ${k(6)} ${k(8)};
  border: ${k(1)} solid var(--border-strong); border-radius: ${k(10)};
  background: var(--popup-bg);
  box-shadow: var(--shadow-popup), inset 0 1px 0 var(--edge-light);
  backdrop-filter: blur(14px) saturate(1.2);
  opacity: 0; transition: opacity var(--motion-fast, 140ms);
}
.keys.is-shown { opacity: 1; }
.cap {
  display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;
  min-width: ${k(30)}; height: ${k(30)}; padding: 0 ${k(9)};
  border: ${k(1)} solid var(--border-strong); border-radius: ${k(6)};
  background: var(--raised);
  box-shadow: inset 0 1px 0 var(--edge-light),
    0 ${k(2)} 0 color-mix(in srgb, var(--border-strong) 45%, transparent);
  color: var(--text);
  font: 600 ${k(15)}/1 var(--font-mono);
  white-space: nowrap;
  transition: background var(--motion-fast, 140ms), color var(--motion-fast, 140ms),
    opacity 260ms;
}
.cap.is-down {
  border-color: var(--primary-edge);
  background: var(--primary-gradient);
  box-shadow: var(--primary-glow),
    0 ${k(2)} 0 color-mix(in srgb, var(--primary-edge) 55%, transparent);
  color: var(--primary-text);
}
.cap.is-gone { opacity: 0; }
.plus { color: var(--text-dim); font: 600 ${k(14)}/1 var(--font-ui); }
`;

/* The pointers, in a 24-unit box, and the point of each that is the pointer's position. */
const CURSORS = {
  arrow: {
    hot: [5, 3],
    svg: '<path d="M5 3 L5 19.6 L9.3 15.7 L12.1 21.8 L14.9 20.5 L12.1 14.5 L17.9 14.5 Z"/>',
  },
  ew: {
    hot: [12, 12],
    svg: '<path d="M1.8 12 L6.6 7.4 L6.6 10.3 L17.4 10.3 L17.4 7.4 L22.2 12 L17.4 16.6 L17.4 13.7 L6.6 13.7 L6.6 16.6 Z"/>',
  },
  ns: {
    hot: [12, 12],
    svg: '<path d="M12 1.8 L16.6 6.6 L13.7 6.6 L13.7 17.4 L16.6 17.4 L12 22.2 L7.4 17.4 L10.3 17.4 L10.3 6.6 L7.4 6.6 Z"/>',
  },
  move: {
    hot: [12, 12],
    svg:
      '<path d="M12 1.5 L15.6 5.3 L13.3 5.3 L13.3 10.7 L18.7 10.7 L18.7 8.4 L22.5 12 L18.7 15.6 ' +
      'L18.7 13.3 L13.3 13.3 L13.3 18.7 L15.6 18.7 L12 22.5 L8.4 18.7 L10.7 18.7 L10.7 13.3 ' +
      'L5.3 13.3 L5.3 15.6 L1.5 12 L5.3 8.4 L5.3 10.7 L10.7 10.7 L10.7 5.3 L8.4 5.3 Z"/>',
  },
  text: {
    hot: [12, 12],
    svg:
      '<g><path class="line-edge" d="M9 4 H15 M12 4 V20 M9 20 H15"/>' +
      '<path class="line" d="M9 4 H15 M12 4 V20 M9 20 H15"/></g>',
  },
  crosshair: {
    hot: [12, 12],
    svg:
      '<g><path class="line-edge" d="M12 3 V21 M3 12 H21"/>' +
      '<path class="line" d="M12 3 V21 M3 12 H21"/></g>',
  },
};

/** What `installOverlay` takes: its style sheet and its pointers. */
export const OVERLAY_ASSETS = { css: CSS, cursors: CURSORS };

/** Runs in the page; see the header. Idempotent. */
export function installOverlay({ css, cursors }) {
  if (window.__mfeCapture) return;
  const host = document.createElement('div');
  host.id = 'mfe-capture-overlay';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:2147483647;--k:1;display:block;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML =
    `<style>${css}</style><div class="root"><div class="highlights"></div>` +
    '<div class="ripples"></div><div class="keys"></div><div class="press"></div>' +
    '<div class="cursor"><svg viewBox="0 0 24 24"></svg></div></div>';
  document.body.append(host);
  const $ = (selector) => shadow.querySelector(selector);
  const highlights = $('.highlights');
  const ripples = $('.ripples');
  const keysBox = $('.keys');
  const press = $('.press');
  const cursor = $('.cursor');
  const svg = $('.cursor svg');

  const state = {
    scale: 1,
    cursorOn: false,
    keysOn: false,
    x: -100,
    y: -100,
    kind: 'arrow',
    pressed: 0,
    caps: [], // { id, label, mod, down, expires }
    nextId: 1,
  };

  const KINDS = {
    'ew-resize': 'ew',
    'col-resize': 'ew',
    'e-resize': 'ew',
    'w-resize': 'ew',
    'ns-resize': 'ns',
    'row-resize': 'ns',
    'n-resize': 'ns',
    's-resize': 'ns',
    move: 'move',
    'all-scroll': 'move',
    text: 'text',
    'vertical-text': 'text',
    crosshair: 'crosshair',
  };

  function kindAt(x, y) {
    const element = document.elementFromPoint(x, y);
    if (!element) return 'arrow';
    const value = getComputedStyle(element).cursor.split(',').pop().trim();
    // `auto` over a text field is the browser's I-beam.
    const field =
      'input:not([type]), input[type="text"], input[type="search"], input[type="number"], ' +
      'textarea, [contenteditable=""], [contenteditable="true"]';
    if (value === 'auto' && element.closest(field)) return 'text';
    return KINDS[value] ?? 'arrow';
  }

  function drawCursor() {
    const shape = cursors[state.kind] ?? cursors.arrow;
    if (svg.dataset.kind !== state.kind) {
      svg.innerHTML = shape.svg;
      svg.dataset.kind = state.kind;
    }
    const [hx, hy] = shape.hot;
    const s = state.scale;
    cursor.style.transform = `translate(${state.x - hx * s}px, ${state.y - hy * s}px)`;
    // Pressed, the pointer shrinks a little about its own point.
    svg.style.transformOrigin = `${(hx / 24) * 100}% ${(hy / 24) * 100}%`;
    press.style.transform = `translate(${state.x}px, ${state.y}px)`;
    cursor.classList.toggle('is-shown', state.cursorOn);
    cursor.classList.toggle('is-pressed', state.pressed > 0);
    press.classList.toggle('is-on', state.cursorOn && state.pressed > 0);
  }

  function ripple(x, y, secondary) {
    if (!state.cursorOn) return;
    const dot = document.createElement('div');
    dot.className = `ripple${secondary ? ' is-secondary' : ''}`;
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    ripples.append(dot);
    setTimeout(() => dot.remove(), 600);
  }

  // ---- keys ----
  const MOD_LABELS = { Control: 'Ctrl/⌘', Meta: 'Ctrl/⌘', Alt: 'Alt', Shift: 'Shift' };
  const NAMES = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Escape: 'Esc',
    ' ': 'Space',
    PageUp: 'Page Up',
    PageDown: 'Page Down',
    ContextMenu: 'Menu',
  };

  function keyLabel(event) {
    if (MOD_LABELS[event.key]) return MOD_LABELS[event.key];
    if (NAMES[event.key]) return NAMES[event.key];
    if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
    if (/^Digit\d$/.test(event.code)) return event.code.slice(5);
    if (event.key.length === 1) return event.key.toUpperCase();
    return event.key;
  }

  // A cap keeps its element while it lives, so that it fades instead of vanishing; the row is
  // rebuilt only when caps come or go, and emptied once the box has faded.
  const capElements = new Map();
  let shownIds = '';
  let emptyTimer = 0;

  function renderKeys() {
    const now = performance.now();
    const ids = state.caps.map((cap) => cap.id).join(',');
    if (ids !== shownIds) {
      shownIds = ids;
      const children = [];
      const alive = new Set();
      state.caps.forEach((cap, index) => {
        if (index > 0) {
          const plus = document.createElement('span');
          plus.className = 'plus';
          plus.textContent = '+';
          children.push(plus);
        }
        let element = capElements.get(cap.id);
        if (!element) {
          element = document.createElement('span');
          element.className = 'cap';
          element.textContent = cap.label;
          capElements.set(cap.id, element);
        }
        alive.add(cap.id);
        children.push(element);
      });
      for (const id of [...capElements.keys()]) if (!alive.has(id)) capElements.delete(id);
      clearTimeout(emptyTimer);
      if (children.length > 0) keysBox.replaceChildren(...children);
      else emptyTimer = setTimeout(() => state.caps.length === 0 && keysBox.replaceChildren(), 200);
    }
    let visible = false;
    for (const cap of state.caps) {
      const element = capElements.get(cap.id);
      const gone = !cap.down && cap.expires - now < 260;
      element.classList.toggle('is-down', cap.down);
      element.classList.toggle('is-gone', gone);
      visible ||= !gone;
    }
    // The box fades with its last caps, never shown empty.
    keysBox.classList.toggle('is-shown', state.keysOn && visible);
  }

  function prune() {
    const now = performance.now();
    const before = state.caps.length;
    state.caps = state.caps.filter((cap) => cap.down || cap.expires > now);
    if (state.caps.length !== before || state.caps.some((cap) => !cap.down)) renderKeys();
  }
  setInterval(prune, 50);

  // What is under a still pointer changes too (a panel opens or closes): its shape follows.
  setInterval(() => {
    if (!state.cursorOn || state.pressed > 0) return;
    const kind = kindAt(state.x, state.y);
    if (kind !== state.kind) {
      state.kind = kind;
      drawCursor();
    }
  }, 150);

  /** A cap pressed: modifiers stay while held; any other key replaces the keys let go before it
   * (a new combination starts). */
  function capDown(label, mod) {
    if (!state.keysOn) return; // keys typed while the box is off (`kit.type`) are not kept
    const found = state.caps.find((cap) => cap.label === label);
    if (found) {
      found.down = true;
    } else {
      if (!mod) state.caps = state.caps.filter((cap) => cap.down);
      state.caps.push({ id: state.nextId++, label, mod, down: true, expires: Infinity });
    }
    renderKeys();
  }

  function capUp(label, linger) {
    const now = performance.now();
    for (const cap of state.caps) {
      if (cap.label === label && cap.down) {
        cap.down = false;
        cap.expires = now + linger;
      }
    }
    renderKeys();
  }

  /** A cap shown for a moment (a wheel turn, a right click). */
  function tap(label, linger = 900) {
    if (!state.keysOn) return;
    const now = performance.now();
    const last = state.caps[state.caps.length - 1];
    if (last && last.label === label && !last.down) {
      last.expires = now + linger;
    } else {
      state.caps = state.caps.filter((cap) => cap.down);
      state.caps.push({
        id: state.nextId++,
        label,
        mod: false,
        down: false,
        expires: now + linger,
      });
    }
    renderKeys();
  }

  // ---- listeners: they only watch (capture phase on the window, nothing prevented) ----
  // Pointer events, not mouse events: an element that calls preventDefault on `pointerdown` (the
  // handles of a line, of an arc, of a spline) stops the mouse events until the button is up,
  // but never the pointer events, so the drawn pointer follows the drag.
  const onMove = (event) => {
    state.x = event.clientX;
    state.y = event.clientY;
    if (state.pressed === 0) state.kind = kindAt(state.x, state.y);
    drawCursor();
  };
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener(
    'pointerdown',
    (event) => {
      state.x = event.clientX;
      state.y = event.clientY;
      state.kind = kindAt(state.x, state.y);
      state.pressed += 1;
      ripple(state.x, state.y, event.button !== 0);
      if (event.button === 2) tap('Right-click');
      if (event.button === 1) capDown('Middle button', false);
      drawCursor();
    },
    true,
  );
  window.addEventListener(
    'pointerup',
    (event) => {
      state.pressed = Math.max(0, state.pressed - 1);
      if (event.button === 1) capUp('Middle button', 700);
      drawCursor();
    },
    true,
  );
  // A native drag (HTML5 drag and drop: a card of the Creator, Add to the timeline) sends no
  // pointer events while it lasts, only drag events, which say where the pointer is; it ends
  // with a drop or a dragend instead of a pointerup.
  const onDrag = (event) => {
    if (event.clientX === 0 && event.clientY === 0) return; // some `drag` events carry no point
    state.x = event.clientX;
    state.y = event.clientY;
    drawCursor();
  };
  window.addEventListener('dragover', onDrag, true);
  window.addEventListener('drag', onDrag, true);
  const onDragEnd = () => {
    if (state.pressed === 0) return;
    state.pressed = 0;
    drawCursor();
  };
  window.addEventListener('drop', onDragEnd, true);
  window.addEventListener('dragend', onDragEnd, true);
  window.addEventListener('dblclick', () => tap('Double-click'), true);
  window.addEventListener(
    'wheel',
    (event) => {
      const vertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
      const arrow = vertical ? (event.deltaY < 0 ? '↑' : '↓') : event.deltaX < 0 ? '←' : '→';
      tap(`Wheel ${arrow}`, 700);
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.repeat) return;
      capDown(keyLabel(event), Boolean(MOD_LABELS[event.key]));
    },
    true,
  );
  window.addEventListener(
    'keyup',
    (event) => {
      // A modifier lingers as long as the key pressed with it: the combination fades together.
      capUp(keyLabel(event), 900);
    },
    true,
  );
  window.addEventListener('blur', () => {
    state.caps = [];
    renderKeys();
  });

  let caretStyle = null;

  window.__mfeCapture = {
    /** The ratio of every size (see the header). */
    setScale(scale) {
      state.scale = scale;
      host.style.setProperty('--k', String(scale));
      drawCursor();
    },
    showCursor(on) {
      state.cursorOn = on;
      drawCursor();
    },
    /** Puts the pointer somewhere without an event (before the first move of a recording). */
    placeCursor(x, y) {
      state.x = x;
      state.y = y;
      if (state.pressed === 0) state.kind = kindAt(x, y);
      drawCursor();
    },
    showKeys(on) {
      state.keysOn = on;
      if (!on) state.caps = [];
      renderKeys();
    },
    /** Where the keys float: inside `bounds` (the captured area, viewport CSS px), at one of its
     * corners or the middle of an edge (`bottom-left`, `top`, …), or with their top-left corner
     * at `{ x, y }` from the area's top-left corner (CSS px). */
    placeKeys(bounds, where = 'bottom-left') {
      const margin = 12 * state.scale;
      const style = keysBox.style;
      style.left = style.right = style.top = style.bottom = 'auto';
      style.transform = '';
      if (typeof where === 'object' && where !== null) {
        style.left = `${bounds.x + where.x}px`;
        style.top = `${bounds.y + where.y}px`;
        return;
      }
      const [vertical, horizontal = 'center'] = where.includes('-')
        ? where.split('-')
        : where === 'left' || where === 'right'
          ? ['middle', where]
          : [where, 'center'];
      if (vertical === 'top') style.top = `${bounds.y + margin}px`;
      else if (vertical === 'bottom')
        style.bottom = `${innerHeight - bounds.y - bounds.height + margin}px`;
      else {
        style.top = `${bounds.y + bounds.height / 2}px`;
        style.transform = 'translateY(-50%)';
      }
      if (horizontal === 'left') style.left = `${bounds.x + margin}px`;
      else if (horizontal === 'right')
        style.right = `${innerWidth - bounds.x - bounds.width + margin}px`;
      else {
        style.left = `${bounds.x + bounds.width / 2}px`;
        style.transform = `${style.transform} translateX(-50%)`.trim();
      }
    },
    /** A cap shown for a moment, for what no key event says (`kit.tap`). */
    tap(label, linger) {
      tap(label, linger);
    },
    /** Rings (and markers) around boxes of the viewport, kept inside `bounds`. Each item:
     * `{ x, y, width, height, radius, label, markerAt }`. */
    highlight(items, bounds) {
      const s = state.scale;
      const border = 2 * s;
      const offset = 3 * s;
      const markerSize = 24 * s;
      for (const item of items) {
        let left = item.x - offset - border;
        let top = item.y - offset - border;
        let right = item.x + item.width + offset + border;
        let bottom = item.y + item.height + offset + border;
        // Kept inside what is captured: a ring cut by the edge of the image would read as a line.
        left = Math.max(left, bounds.x);
        top = Math.max(top, bounds.y);
        right = Math.min(right, bounds.x + bounds.width);
        bottom = Math.min(bottom, bounds.y + bounds.height);
        const ring = document.createElement('div');
        ring.className = 'ring';
        Object.assign(ring.style, {
          left: `${left}px`,
          top: `${top}px`,
          width: `${right - left}px`,
          height: `${bottom - top}px`,
          borderRadius: `${item.radius + offset + border}px`,
        });
        highlights.append(ring);
        if (item.label === undefined || item.label === null || item.label === '') continue;
        const marker = document.createElement('div');
        marker.className = 'marker';
        marker.textContent = String(item.label);
        const at = item.markerAt ?? 'top-left';
        const cx = at.endsWith('left') ? left : at.endsWith('right') ? right : (left + right) / 2;
        const cy = at.startsWith('top')
          ? top
          : at.startsWith('bottom')
            ? bottom
            : (top + bottom) / 2;
        const pad = 2 * s;
        const x = Math.min(
          Math.max(cx - markerSize / 2, bounds.x + pad),
          bounds.x + bounds.width - markerSize - pad,
        );
        const y = Math.min(
          Math.max(cy - markerSize / 2, bounds.y + pad),
          bounds.y + bounds.height - markerSize - pad,
        );
        marker.style.left = `${x}px`;
        marker.style.top = `${y}px`;
        highlights.append(marker);
      }
    },
    clearHighlights() {
      highlights.replaceChildren();
    },
    /** Hides the text caret of the app's fields (for still images). */
    hideCaret(hide) {
      if (hide && !caretStyle) {
        caretStyle = document.createElement('style');
        caretStyle.textContent = '*, *::before, *::after { caret-color: transparent !important; }';
        document.head.append(caretStyle);
      } else if (!hide && caretStyle) {
        caretStyle.remove();
        caretStyle = null;
      }
    },
  };
}
