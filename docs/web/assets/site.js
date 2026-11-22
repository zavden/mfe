/* The behaviour of the web documentation of the Manim Formula Editor. One classic script with no
 * dependencies, loaded with `defer` by every page (AUTHORING.md §2). The documentation is read
 * from disk (file://): nothing here fetches a file; data arrives as scripts that set globals.
 *
 * At once (before the page is shown): the theme on <html data-theme>, and `window.MFEDocs`.
 * On DOMContentLoaded (every deferred script, data files included, has run by then): the header,
 * the sidebar (from assets/nav.js), the breadcrumbs, the table of contents, previous/next and the
 * footer around <main>; then the components of the page:
 *
 *   img/video[data-themed]           swaps .dark. ↔ .light. in src and poster with the theme
 *   video.mfe-clip                   plays while visible, pauses otherwise; pause and replay
 *   .mfe-tour[data-mfe-tour]         steps over the app from window.MFE_TOURS
 *   .mfe-code[data-mfe-python]       ManimCE / ManimGL tabs from MFE_EXAMPLES[slug].python
 *   .mfe-example[data-mfe-example]   a card from MFE_EXAMPLES[slug].meta, with its downloads
 *   [data-mfe-player]                window.MFEPlayer.mountAll(document), when it exists
 *   .mfe-widget[data-mfe-widget]     window.MFE_WIDGETS[name].mount(element, options, context)
 *   kbd[data-keys]                   Mod/Alt/Shift written for the reader's system
 *   pre > code.language-*            highlighting (python, latex, json, bash, html, js), copy
 *   aside.callout, aside.try         their labels; table (scrolls), figure img (enlarges)
 *
 * A page outside the documentation that borrows its components (the project's page,
 * docs/index.html) writes <body data-docs-bare>: it gets the theme and the components alone, with
 * no header, sidebar, contents, previous/next nor footer, and no keys of the search.
 *
 * A component that mounted carries `data-mfe-mounted`; one whose data is missing shows a small
 * notice in its place and carries `data-mfe-error` (tools/check.mjs reads both). Nothing a page
 * lacks breaks the rest of it: every part runs on its own.
 *
 * Every access to localStorage is in try/catch (it can be blocked, or shared by every file:// page).
 * Keys: mfe-docs:theme, mfe-docs:visited, mfe-docs:nav-open, mfe-docs:python-tab.
 * Two query parameters help checking a page: ?theme=dark|light and ?platform=mac|windows|linux
 * (neither is stored). AUTHORING.md documents all of it. */
(function () {
  'use strict';

  const doc = document;
  const html = doc.documentElement;

  // ---- Small helpers ------------------------------------------------------------------------

  const $ = (selector, scope) => (scope || doc).querySelector(selector);
  const $$ = (selector, scope) => Array.from((scope || doc).querySelectorAll(selector));

  /** An element: `el('a', { class: 'x', href: '…', text: '…', html: '…', on: { click } }, …kids)`. */
  function el(tag, props, ...children) {
    const node = doc.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'on') {
          for (const [type, fn] of Object.entries(value)) node.addEventListener(type, fn);
        } else if (key === 'style') node.setAttribute('style', value);
        else node.setAttribute(key, value === true ? '' : String(value));
      }
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child.nodeType ? child : doc.createTextNode(String(child)));
    }
    return node;
  }

  const escapeHtml = (text) =>
    String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const store = {
    get(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // storage blocked or full: the choice lasts for this page only
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // nothing to do
      }
    },
  };

  const media = (query) => (window.matchMedia ? window.matchMedia(query) : { matches: false });
  const reducedMotion = () => media('(prefers-reduced-motion: reduce)').matches;
  const params = (() => {
    try {
      return new URLSearchParams(window.location.search);
    } catch {
      return new URLSearchParams();
    }
  })();

  /** Runs one part of the page on its own: a failure is logged and the rest goes on. */
  function safely(label, fn) {
    try {
      return fn();
    } catch (error) {
      console.error(`[docs] ${label} failed:`, error);
      return undefined;
    }
  }

  // ---- Where the documentation is, and which page this is -----------------------------------

  const script =
    doc.currentScript ||
    $$('script[src]').find((s) => /(^|\/)assets\/site\.js(\?|#|$)/.test(s.getAttribute('src')));
  const root = (() => {
    try {
      return new URL('../', script.src).href;
    } catch {
      return new URL('./', window.location.href).href;
    }
  })();
  const url = (path) => root + String(path || '').replace(/^\.?\//, '');

  const metaContent = (name) => {
    const node = doc.querySelector(`meta[name="${name}"]`);
    return node ? (node.getAttribute('content') || '').trim() : '';
  };
  const page = {
    id:
      metaContent('mfe:id') ||
      decodeURIComponent(window.location.href.split(/[?#]/)[0])
        .slice(root.length)
        .replace(/\.html$/, ''),
    level: metaContent('mfe:level'),
    difficulty: metaContent('mfe:difficulty'),
    status: metaContent('mfe:status'),
  };
  const isHome = page.id === 'index';
  const isAuthoring = page.id.startsWith('authoring/');

  // ---- The reader's system: ⌘ on a Mac, Ctrl elsewhere --------------------------------------

  const platform = (() => {
    const asked = params.get('platform');
    if (asked === 'mac' || asked === 'windows' || asked === 'linux') return asked;
    const nav = window.navigator || {};
    const hint = (nav.userAgentData && nav.userAgentData.platform) || nav.platform || '';
    const agent = nav.userAgent || '';
    if (/mac|iphone|ipad|ipod/i.test(hint) || /Mac OS X|iPhone|iPad/.test(agent)) return 'mac';
    if (/win/i.test(hint) || /Windows/.test(agent)) return 'windows';
    if (/linux|x11|cros|android/i.test(hint) || /Linux|X11|CrOS/.test(agent)) return 'linux';
    return 'other';
  })();
  const isMac = platform === 'mac';
  // For the stylesheet: what a page writes for one system alone (`.only-mac`, `.not-mac`).
  doc.documentElement.setAttribute('data-platform', platform);

  const KEY_NAMES = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Left: '←',
    Right: '→',
    Up: '↑',
    Down: '↓',
    Plus: '+',
    Escape: 'Esc',
    PageUp: 'Page Up',
    PageDown: 'Page Down',
  };

  /** A Mac's modifier keys in the order its menus write them — Control, Option, Shift, Command —,
   * each with its symbol. `Ctrl` is the Control key itself, which is not the command key there. */
  const MAC_MODIFIERS = [
    ['Ctrl', '⌃'],
    ['Alt', '⌥'],
    ['Option', '⌥'],
    ['Shift', '⇧'],
    ['Mod', '⌘'],
  ];
  const macSymbol = (key) => (MAC_MODIFIERS.find(([name]) => name === key) || [])[1];

  /** The label of one key on this system ("Mod" is Ctrl, or ⌘ on a Mac). A Mac's menus write its
   * modifiers and Return with symbols, and so do the app and these pages there. */
  function keyLabel(key) {
    if (isMac && macSymbol(key)) return macSymbol(key);
    if (isMac && key === 'Enter') return '↩';
    if (key === 'Mod') return 'Ctrl';
    if (key === 'Option') return 'Alt';
    return KEY_NAMES[key] || key;
  }

  const splitKeys = (keys) =>
    String(keys || '')
      .split('+')
      .map((part) => part.trim())
      .filter(Boolean);

  /** The keys of a combination in the order this system writes them: on a Mac the modifiers first
   * and in the order of its menus (⌥⌘N, ⇧⌘Z), whatever the order they are given in. */
  function orderKeys(keys) {
    if (!isMac) return keys;
    const modifiers = MAC_MODIFIERS.flatMap(([name]) => keys.filter((key) => key === name));
    return [...modifiers, ...keys.filter((key) => !macSymbol(key))];
  }

  /** The combination a `kbd` names on this system: on a Mac its `data-keys-mac`, when the app has
   * other keys there (Save As is Ctrl+Alt+S, and ⇧⌘S on a Mac); else its `data-keys`. */
  const keysOf = (node) => (isMac && node.dataset.keysMac) || node.dataset.keys;

  /** A key combination as text on this system: "Mod+Shift+Z" → "Ctrl+Shift+Z" or "⇧⌘Z". */
  function formatKeys(keys) {
    const labels = orderKeys(splitKeys(keys)).map(keyLabel);
    if (!isMac) return labels.join('+');
    return labels.reduce((text, label, i) => {
      const previous = labels[i - 1];
      const glue = i === 0 || /^[⌘⌥⇧⌃]$/.test(previous) ? '' : '+';
      return text + glue + label;
    }, '');
  }

  // ---- Theme --------------------------------------------------------------------------------

  const THEME_KEY = 'mfe-docs:theme';
  const systemDark = media('(prefers-color-scheme: dark)');
  const systemTheme = () => (systemDark.matches ? 'dark' : 'light');
  const storedChoice = () => {
    const choice = store.get(THEME_KEY, null);
    return choice === 'dark' || choice === 'light' ? choice : null;
  };
  const askedTheme = params.get('theme') === 'dark' || params.get('theme') === 'light';
  let theme = askedTheme ? params.get('theme') : storedChoice() || systemTheme();
  const themeListeners = new Set();
  html.setAttribute('data-theme', theme);

  function applyTheme(next) {
    if (next === theme) return;
    theme = next;
    html.setAttribute('data-theme', theme);
    for (const fn of Array.from(themeListeners)) safely('a theme listener', () => fn(theme));
    doc.dispatchEvent(new CustomEvent('mfe-docs:theme', { detail: { theme } }));
  }

  /** 'dark', 'light' (stored) or 'system' (the stored choice forgotten). */
  function setTheme(choice) {
    if (choice === 'system') {
      store.remove(THEME_KEY);
      applyTheme(systemTheme());
    } else if (choice === 'dark' || choice === 'light') {
      store.set(THEME_KEY, choice);
      applyTheme(choice);
    }
  }

  const themeChoice = () => storedChoice() || 'system';

  const onSystemChange = () => {
    if (!storedChoice() && !askedTheme) applyTheme(systemTheme());
  };
  if (systemDark.addEventListener) systemDark.addEventListener('change', onSystemChange);
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_KEY && !askedTheme) applyTheme(storedChoice() || systemTheme());
  });

  function onTheme(fn) {
    themeListeners.add(fn);
    return () => themeListeners.delete(fn);
  }

  // ---- Icons: the app's drawings (app/src/ui/timeline/icons.tsx), 16×16 ---------------------

  const S =
    'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  const S2 =
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const F = 'fill="currentColor"';
  const ICONS = {
    search: `<circle ${S} cx="7" cy="7" r="4.2"/><path ${S} d="M10.2 10.2l3.3 3.3"/>`,
    close: `<path ${S} d="M4 4l8 8M12 4l-8 8"/>`,
    'chevron-down': `<path ${S2} d="M3.5 6l4.5 4.5L12.5 6"/>`,
    menu: `<path ${S} d="M2.5 4h11M2.5 8h11M2.5 12h11"/>`,
    layers: `<path ${S} d="M8 2.2L2.2 5.2 8 8.2l5.8-3zM2.6 8.2L8 11l5.4-2.8M2.6 11L8 13.8l5.4-2.8"/>`,
    theme: `<circle ${S} cx="8" cy="8" r="5.6"/><path ${F} d="M8 2.4a5.6 5.6 0 0 1 0 11.2z"/>`,
    link: `<path ${S} d="M6.6 9.4l2.8-2.8M7.4 4.4l.9-.9a2.7 2.7 0 0 1 3.8 3.8l-.9.9M8.6 11.6l-.9.9a2.7 2.7 0 0 1-3.8-3.8l.9-.9"/>`,
    copy: `<rect ${S} x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path ${S} d="M3.8 10.5h-.3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v.3"/>`,
    check: `<path ${S} d="M3 8.5l3.2 3L13 4.5"/>`,
    download: `<path ${S} d="M8 2.5v7.5M4.8 7l3.2 3.2L11.2 7M3 13.5h10"/>`,
    play: `<path ${F} d="M5 3l8 5-8 5z"/>`,
    pause: `<rect ${F} x="4" y="3" width="3" height="10"/><rect ${F} x="9" y="3" width="3" height="10"/>`,
    replay: `<path ${S} d="M3.4 8.6A4.7 4.7 0 1 0 4.8 4.6"/><path ${S} d="M4.6 2.2v2.6h2.6"/>`,
    'step-back': `<path ${F} d="M11 3L5 8l6 5z"/>`,
    'step-forward': `<path ${F} d="M5 3l6 5-6 5z"/>`,
    'arrow-up': `<path ${S} d="M8 13V3.5M4.5 7L8 3.5 11.5 7"/>`,
    info: `<circle ${S} cx="8" cy="8" r="6"/><path ${S} d="M8 7.3v3.9"/><circle ${F} cx="8" cy="5" r=".9"/>`,
    bulb: `<path ${S} d="M6 12.4h4M6.6 14.1h2.8M5.7 10.4C4.5 9.5 3.7 8.1 3.7 6.6a4.3 4.3 0 0 1 8.6 0c0 1.5-.8 2.9-2 3.8v.3H5.7z"/>`,
    warning: `<path ${S} d="M8 2.4l6.1 10.8H1.9z"/><path ${S} d="M8 6.6v3"/><circle ${F} cx="8" cy="11.3" r=".85"/>`,
    laptop: `<rect ${S} x="3" y="3.5" width="10" height="7" rx="1"/><path ${S} d="M1.5 12.6h13"/>`,
    book: `<path ${S} d="M2.5 3.5h3.8A1.7 1.7 0 0 1 8 5.2v8.3a1.3 1.3 0 0 0-1.3-1.3H2.5zM13.5 3.5H9.7A1.7 1.7 0 0 0 8 5.2v8.3a1.3 1.3 0 0 1 1.3-1.3h4.2z"/>`,
    sigma: `<path ${S} d="M11.5 4.4V3h-7l4 5-4 5h7v-1.4"/>`,
    tracks: `<path ${S2} d="M2.5 4h6M6.5 8h7M3.5 12h5"/>`,
    film: `<rect ${S} x="2" y="3" width="12" height="10" rx="1.5"/><path ${S} d="M5 3v10M11 3v10M2 6.3h3M2 9.7h3M11 6.3h3M11 9.7h3"/>`,
    'play-outline': `<path ${S} d="M4.5 2.8v10.4l8.3-5.2z"/>`,
    waveform: `<path ${S} d="M2.5 7v2M5.2 5v6M8 2.8v10.4M10.8 5v6M13.5 7v2"/>`,
    folder: `<path ${S} d="M2 4.5a1 1 0 0 1 1-1h3L7.5 5H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/>`,
    'align-left': `<path ${S} d="M2.5 2.5v11"/><rect ${F} x="5" y="4" width="9" height="3" rx="1"/><rect ${F} x="5" y="9" width="5" height="3" rx="1"/>`,
    relate: `<circle ${S} cx="3.6" cy="11.6" r="1.6"/><circle ${S} cx="12.4" cy="4.4" r="1.6"/><path ${S} d="M5.1 11C8 10.6 8 5.2 10.9 4.9"/>`,
    shapes: `<rect ${S} x="2.5" y="7.8" width="5.6" height="5.6" rx="1"/><circle ${S} cx="11" cy="5.2" r="2.8"/>`,
    palette: `<path ${S} d="M8 2.5a5.5 5.5 0 1 0 0 11c.9 0 1.3-.7.9-1.4-.5-.8-.1-1.8 1-1.8h1.4a2.2 2.2 0 0 0 2.2-2.2C13.5 4.9 11.1 2.5 8 2.5z"/><circle ${F} cx="5.2" cy="7.4" r="1"/><circle ${F} cx="7.6" cy="5.1" r="1"/><circle ${F} cx="10.5" cy="6.1" r="1"/>`,
    code: `<path ${S} d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5"/>`,
    route: `<circle ${S} cx="3.8" cy="12.2" r="1.5"/><circle ${S} cx="12.2" cy="3.8" r="1.5"/><path ${S} d="M5.3 12.2H10a2 2 0 0 0 0-4H6a2 2 0 0 1 0-4h4.7"/>`,
    keyboard: `<rect ${S} x="1.5" y="4" width="13" height="8.5" rx="1.5"/><path ${S} d="M4.2 7h.4M6.6 7H7M9 7h.4M11.4 7h.4M5 9.8h6"/>`,
    file: `<path ${S} d="M4 1.8h5l3 3v9.4H4zM9 1.8v3h3"/>`,
    video: `<rect ${S} x="1.8" y="3.5" width="9" height="9" rx="1.3"/><path ${S} d="M10.8 6.5l3.4-2v7l-3.4-2"/>`,
    terminal: `<rect ${S} x="1.8" y="2.8" width="12.4" height="10.4" rx="1.5"/><path ${S} d="M4.5 6.2L6.8 8l-2.3 1.8M8.2 10.2h3"/>`,
    question: `<circle ${S} cx="8" cy="8" r="6"/><path ${S} d="M6.3 6.3a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1v.4"/><circle ${F} cx="8" cy="11.4" r=".85"/>`,
    sliders: `<path ${S} d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6"/><circle ${S} cx="10" cy="4.5" r="1.5"/><circle ${S} cx="6" cy="11.5" r="1.5"/>`,
  };

  /** An icon as an SVG element (decorative: hidden from assistive technology). */
  function icon(name, extraClass) {
    const span = doc.createElement('span');
    span.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"${
      extraClass ? ` class="${extraClass}"` : ''
    }>${ICONS[name] || ''}</svg>`;
    return span.firstChild;
  }

  /** The app's symbol (app/src/ui/BrandMark.tsx): an M from a square node to a diamond node. */
  function brandMark() {
    const span = doc.createElement('span');
    const line = 'fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"';
    span.innerHTML =
      '<svg class="brand-mark" viewBox="12 18 76 68" aria-hidden="true" focusable="false">' +
      `<path class="mark-text" ${line} d="M24 72 V32 Q24 24 30 30 L48 50"/>` +
      `<path class="mark-accent" ${line} d="M48 50 L66 30 Q72 24 72 32 V71"/>` +
      '<rect class="mark-text-fill" x="18" y="66" width="12" height="12" rx="2"/>' +
      '<path class="mark-accent-fill" d="M72 61 L82 71 L72 81 L62 71 Z"/></svg>';
    return span.firstChild;
  }

  // ---- Levels --------------------------------------------------------------------------------

  const LEVEL_LABELS = {
    basic: 'Basic',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
    reference: 'Reference',
    tutorial: 'Tutorial',
  };

  function levelSvg(level) {
    if (level === 'reference') return icon('book');
    if (level === 'tutorial') return icon('play-outline');
    const filled = { basic: 1, intermediate: 2, advanced: 3 }[level] || 0;
    const bars = [
      [2, 9.5, 3, 4],
      [6.5, 6.5, 3, 7],
      [11, 3.5, 3, 10],
    ]
      .map(
        ([x, y, w, hgt], i) =>
          `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="0.8" fill="currentColor"${
            i < filled ? '' : ' opacity="0.28"'
          }/>`,
      )
      .join('');
    const span = doc.createElement('span');
    span.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">${bars}</svg>`;
    return span.firstChild;
  }

  /** The mark of a page's level: the difficulty for a tutorial that has one. */
  function levelMark(level, difficulty) {
    const shown = level === 'tutorial' && difficulty ? difficulty : level;
    if (!LEVEL_LABELS[shown]) return null;
    const label =
      level === 'tutorial' && difficulty
        ? `Tutorial, ${LEVEL_LABELS[difficulty].toLowerCase()}`
        : LEVEL_LABELS[level];
    return el(
      'span',
      { class: `level-mark level-${shown}`, title: label },
      levelSvg(shown),
      el('span', { class: 'sr-only', text: label }),
    );
  }

  function levelBadge(level) {
    if (!LEVEL_LABELS[level]) return null;
    return el(
      'span',
      { class: `level-badge level-${level}`, title: 'Level of this page' },
      levelSvg(level),
      LEVEL_LABELS[level],
    );
  }

  // ---- Notices, toast, clipboard ---------------------------------------------------------------

  /** Shows `message` in place of a component whose data is missing, and marks the component. */
  function notice(element, message) {
    element.setAttribute('data-mfe-error', message);
    element.removeAttribute('data-mfe-mounted');
    const existing = $(':scope > .mfe-notice', element);
    const text = el('span', { text: message });
    if (existing) {
      existing.replaceChildren(icon('warning'), text);
      return existing;
    }
    const box = el('p', { class: 'mfe-notice', role: 'note' }, icon('warning'), text);
    element.prepend(box);
    console.warn(`[docs] ${message}`);
    return box;
  }

  let toastNode = null;
  let toastTimer = 0;
  function toast(message) {
    if (!toastNode) {
      toastNode = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
      doc.body.append(toastNode);
    }
    toastNode.textContent = message;
    toastNode.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastNode.classList.remove('is-shown'), 1800);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall back below
    }
    const area = el('textarea', {
      style: 'position:fixed;top:0;left:0;opacity:0;pointer-events:none',
      'aria-hidden': 'true',
    });
    area.value = text;
    doc.body.append(area);
    area.select();
    let done = false;
    try {
      done = doc.execCommand('copy');
    } catch {
      done = false;
    }
    area.remove();
    return done;
  }

  function copyButton(getText, label) {
    const button = el(
      'button',
      { type: 'button', class: 'copy-btn', 'aria-label': label || 'Copy' },
      icon('copy'),
      el('span', { text: 'Copy' }),
    );
    let timer = 0;
    button.addEventListener('click', async () => {
      const done = await copyText(getText());
      button.classList.toggle('is-done', done);
      button.replaceChildren(
        icon(done ? 'check' : 'copy'),
        el('span', { text: done ? 'Copied' : 'Copy failed' }),
      );
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.classList.remove('is-done');
        button.replaceChildren(icon('copy'), el('span', { text: 'Copy' }));
      }, 1600);
    });
    return button;
  }

  /** Saves `text` as a file through a Blob (a link to a local file may only open it). */
  function downloadText(text, filename, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = el('a', { href, download: filename, style: 'display:none' });
    doc.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
  }

  // ---- Navigation data -------------------------------------------------------------------------

  // Read at start (DOMContentLoaded), so that the order of the deferred scripts does not matter.
  let NAV = null;
  let sections = [];
  const flatPages = [];
  let current = null;
  const sectionNumber = (index) => String(index + 1).padStart(2, '0');

  const VISITED_KEY = 'mfe-docs:visited';
  const visited = new Set();

  function readNav() {
    NAV = window.MFE_NAV && Array.isArray(window.MFE_NAV.sections) ? window.MFE_NAV : null;
    sections = NAV ? NAV.sections : [];
    flatPages.length = 0;
    sections.forEach((section, sectionIndex) => {
      (section.pages || []).forEach((entry) => flatPages.push({ ...entry, section, sectionIndex }));
    });
    current = flatPages.find((entry) => entry.id === page.id) || null;
    const list = store.get(VISITED_KEY, []);
    if (Array.isArray(list))
      list.filter((id) => typeof id === 'string').forEach((id) => visited.add(id));
    if (current && !visited.has(current.id)) {
      visited.add(current.id);
      store.set(VISITED_KEY, Array.from(visited));
    }
  }

  // ---- The page's chrome -----------------------------------------------------------------------

  let main = null;
  let article = null;
  let navToggle = null;
  let sidebar = null;
  let searchTrigger = null;

  function buildHeader() {
    navToggle = el(
      'button',
      {
        type: 'button',
        class: 'icon-btn nav-toggle',
        'aria-label': 'Open the contents',
        'aria-controls': 'site-sidebar',
        'aria-expanded': 'false',
      },
      icon('menu'),
    );
    navToggle.addEventListener('click', () =>
      doc.body.classList.contains('nav-open') ? closeDrawer() : openDrawer(),
    );
    const brand = el(
      'a',
      {
        class: 'brand',
        href: url('index.html'),
        'aria-label': 'Manim Formula Editor documentation: home',
      },
      brandMark(),
      el('span', { class: 'brand-name', text: 'Manim Formula Editor' }),
      el('span', { class: 'brand-kicker', text: '/ Docs' }),
    );
    const links = el('nav', { class: 'header-links', 'aria-label': 'Main sections' });
    // The project's own page (docs/index.html), outside the documentation: the site's home.
    links.append(el('a', { href: url('../index.html'), text: 'Home' }));
    const quick = [
      ['start', 'Get started'],
      ['tutorials', 'Tutorials'],
      ['reference', 'Reference'],
    ];
    for (const [id, label] of quick) {
      const section = sections.find((s) => s.id === id);
      const first = section && section.pages && section.pages[0];
      if (!first) continue;
      links.append(
        el('a', {
          href: url(first.url),
          text: label,
          'aria-current': current && current.section.id === id ? 'true' : null,
        }),
      );
    }
    searchTrigger = el(
      'button',
      {
        type: 'button',
        class: 'search-trigger',
        'aria-haspopup': 'dialog',
        'aria-label': 'Search the documentation',
        'aria-keyshortcuts': '/ Control+K Meta+K',
      },
      icon('search'),
      el('span', { class: 'search-trigger-label', text: 'Search the docs' }),
      el('kbd', { text: '/' }),
    );
    searchTrigger.addEventListener('click', () => openSearch());
    const toggle = el(
      'button',
      { type: 'button', class: 'icon-btn theme-toggle', 'data-testid': 'docs-theme-toggle' },
      icon('theme'),
    );
    const label = () => `Switch to the ${theme === 'dark' ? 'light' : 'dark'} theme`;
    toggle.setAttribute('aria-label', label());
    toggle.title = label();
    toggle.addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark'));
    onTheme(() => {
      toggle.setAttribute('aria-label', label());
      toggle.title = label();
    });
    const header = el(
      'header',
      { class: 'site-header' },
      navToggle,
      brand,
      links,
      el('span', { class: 'header-spacer' }),
      searchTrigger,
      toggle,
    );
    doc.body.prepend(header);
    doc.body.prepend(
      el('a', { class: 'skip-link', href: '#content', text: 'Skip to the content' }),
    );
  }

  const NAV_OPEN_KEY = 'mfe-docs:nav-open';

  function buildSidebar() {
    const body = el('div', { class: 'sidebar-body' });
    const closeButton = el(
      'button',
      {
        type: 'button',
        class: 'icon-btn is-small sidebar-close',
        'aria-label': 'Close the contents',
      },
      icon('close'),
    );
    closeButton.addEventListener('click', () => closeDrawer());
    const panel = el(
      'div',
      { class: 'panel sidebar-panel' },
      el(
        'div',
        { class: 'panel-header' },
        el('span', { class: 'panel-icon' }, icon('layers')),
        el('p', { class: 'panel-title', text: 'Contents' }),
        closeButton,
      ),
      body,
    );
    sidebar = el(
      'nav',
      { class: 'site-sidebar', id: 'site-sidebar', 'aria-label': 'Documentation' },
      panel,
    );
    if (!NAV) {
      body.append(
        el(
          'p',
          { class: 'mfe-notice nav-notice', role: 'note' },
          icon('warning'),
          el('span', {
            html: 'The contents are missing (<code>assets/nav.js</code>): run <code>node docs/web/tools/build.mjs</code>.',
          }),
        ),
      );
      main.before(sidebar);
      return;
    }
    const openState = store.get(NAV_OPEN_KEY, {});
    const list = el('ol', { class: 'nav-sections' });
    sections.forEach((section, index) => {
      const pages = section.pages || [];
      const isCurrent = current && current.section === section;
      const stored =
        openState && typeof openState[section.id] === 'boolean' ? openState[section.id] : null;
      const open = isCurrent || (stored === null ? false : stored);
      const read = pages.filter((p) => visited.has(p.id)).length;
      const listId = `nav-section-${section.id}`;
      const toggle = el(
        'button',
        {
          type: 'button',
          class: 'nav-section-toggle',
          'aria-expanded': String(open),
          'aria-controls': listId,
        },
        el('span', { class: 'nav-section-index', text: sectionNumber(index) }),
        el('span', { class: 'nav-section-title', text: section.title }),
        el('span', {
          class: `nav-section-progress${read === pages.length && pages.length ? ' is-done' : ''}`,
          title: `${read} of ${pages.length} pages read`,
          text: `${read}/${pages.length}`,
        }),
        icon('chevron-down', 'nav-chevron'),
      );
      const items = el('ol', { class: 'nav-pages', id: listId, hidden: !open });
      for (const entry of pages) {
        const classes = ['nav-link'];
        if (visited.has(entry.id)) classes.push('is-visited');
        if (entry.stub) classes.push('is-stub');
        const link = el(
          'a',
          {
            class: classes.join(' '),
            href: url(entry.url),
            'aria-current': current && current.id === entry.id ? 'page' : null,
            title: entry.description || null,
          },
          el('span', { class: 'nav-link-title', text: entry.short || entry.title }),
          levelMark(entry.level, entry.difficulty),
        );
        if (visited.has(entry.id)) link.append(el('span', { class: 'sr-only', text: ' (read)' }));
        items.append(el('li', null, link));
      }
      toggle.addEventListener('click', () => {
        const nowOpen = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(nowOpen));
        items.hidden = !nowOpen;
        const state = store.get(NAV_OPEN_KEY, {});
        const next = state && typeof state === 'object' ? state : {};
        next[section.id] = nowOpen;
        store.set(NAV_OPEN_KEY, next);
      });
      list.append(
        el('li', { class: `nav-section${isCurrent ? ' is-current' : ''}` }, toggle, items),
      );
    });
    body.append(list);
    main.before(sidebar);
    // The current page in view inside the sidebar, without moving the page itself.
    const here = $('.nav-link[aria-current="page"]', body);
    if (here) {
      requestAnimationFrame(() => {
        const top = here.offsetTop - body.clientHeight / 2 + here.offsetHeight / 2;
        if (top > 0) body.scrollTop = top;
      });
    }
  }

  // The drawer (phones, and the home page at every width).
  const scrim = el('div', { class: 'drawer-scrim', 'aria-hidden': 'true' });
  const drawerQuery = media('(max-width: 880px)');
  const isDrawer = () => doc.body.classList.contains('page-home') || drawerQuery.matches;

  function setInertBehindDrawer(on) {
    for (const node of [main, $('.site-footer'), $('.site-toc')]) {
      if (!node) continue;
      if (on) node.setAttribute('inert', '');
      else node.removeAttribute('inert');
    }
  }

  function openDrawer() {
    if (!sidebar || !isDrawer()) return;
    doc.body.classList.add('nav-open');
    navToggle.setAttribute('aria-expanded', 'true');
    setInertBehindDrawer(true);
    const target = $('.nav-link[aria-current="page"]', sidebar) || $('.sidebar-close', sidebar);
    setTimeout(() => target && target.focus(), 30);
  }

  function closeDrawer(silent) {
    if (!doc.body.classList.contains('nav-open')) return;
    doc.body.classList.remove('nav-open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    setInertBehindDrawer(false);
    if (!silent && navToggle) navToggle.focus();
  }

  scrim.addEventListener('click', () => closeDrawer());
  const onDrawerQuery = () => {
    if (!isDrawer()) closeDrawer(true);
  };
  if (drawerQuery.addEventListener) drawerQuery.addEventListener('change', onDrawerQuery);

  function buildBreadcrumbs() {
    if (isHome) return;
    const items = [el('li', null, el('a', { href: url('index.html'), text: 'Docs' }))];
    if (current) {
      items.push(
        el(
          'li',
          null,
          el('a', {
            href: url(`index.html#path-${current.section.id}`),
            text: current.section.title,
          }),
        ),
      );
    } else if (isAuthoring) {
      items.push(el('li', null, el('span', { text: 'Authoring' })));
    }
    const h1 = article && $('h1', article);
    items.push(
      el(
        'li',
        null,
        el('span', {
          'aria-current': 'page',
          text: current ? current.short || current.title : h1 ? h1.textContent : '',
        }),
      ),
    );
    main.prepend(
      el('nav', { class: 'breadcrumbs', 'aria-label': 'Breadcrumbs' }, el('ol', null, items)),
    );
  }

  function buildPageHead() {
    if (isHome || !article) return;
    const h1 = $('h1', article);
    if (!h1) return;
    let kicker = null;
    if (current) kicker = `${sectionNumber(current.sectionIndex)} / ${current.section.title}`;
    else if (isAuthoring) kicker = 'Authoring';
    if (kicker) h1.before(el('p', { class: 'page-kicker', text: kicker }));
    const metaRow = el('div', { class: 'page-meta' });
    const badge = levelBadge(page.level);
    if (badge) metaRow.append(badge);
    if (page.level === 'tutorial' && LEVEL_LABELS[page.difficulty]) {
      metaRow.append(levelBadge(page.difficulty));
    }
    if (page.status !== 'stub') {
      const words = (article.textContent || '').trim().split(/\s+/).length;
      const minutes = Math.max(1, Math.round(words / 220));
      metaRow.append(el('span', { class: 'page-meta-time', text: `${minutes} min read` }));
    } else {
      metaRow.append(el('span', { text: 'Being written' }));
    }
    h1.after(metaRow);
  }

  /** The headings of the page that belong to it (not those inside components or demos). */
  function pageHeadings() {
    if (!article) return [];
    return $$('h2[id], h3[id]', article).filter(
      (node) =>
        !node.closest('.demo, .mfe-widget, .mfe-player, .mfe-tour, .example-card, aside, details'),
    );
  }

  function buildToc() {
    const headings = pageHeadings();
    if (isHome || headings.length < 2) return;
    const makeList = () => {
      const list = el('ol', { class: 'toc-list' });
      for (const heading of headings) {
        list.append(
          el(
            'li',
            { class: heading.tagName === 'H3' ? 'toc-h3' : 'toc-h2' },
            el('a', {
              href: `#${heading.id}`,
              'data-target': heading.id,
              text: headingText(heading),
            }),
          ),
        );
      }
      return list;
    };
    const side = el(
      'aside',
      { class: 'site-toc', 'aria-label': 'On this page' },
      el('p', { class: 'toc-title', text: 'On this page' }),
      makeList(),
      el('a', { class: 'toc-top', href: '#content' }, icon('arrow-up'), 'Back to the top'),
    );
    doc.body.append(side);
    const firstH2 = headings[0];
    const inline = el(
      'details',
      { class: 'toc-inline' },
      el('summary', null, icon('chevron-down'), 'On this page'),
      makeList(),
    );
    firstH2.before(inline);
    // Scroll-spy: the last heading whose top passed under the header.
    const links = $$('.toc-list a', doc);
    let ticking = false;
    const update = () => {
      ticking = false;
      // A heading counts once it is in the top quarter of the window, under the header.
      const limit =
        (parseFloat(getComputedStyle(html).scrollPaddingTop) || 72) + window.innerHeight * 0.25;
      let active = headings[0];
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top - limit <= 8) active = heading;
        else break;
      }
      const atBottom = window.innerHeight + window.scrollY >= doc.documentElement.scrollHeight - 4;
      if (atBottom) active = headings[headings.length - 1];
      for (const link of links)
        link.classList.toggle('is-current', link.dataset.target === active.id);
    };
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true },
    );
    update();
  }

  /** The text of a heading without its anchor. */
  function headingText(heading) {
    const copy = heading.cloneNode(true);
    $$('.heading-anchor', copy).forEach((node) => node.remove());
    return copy.textContent.trim();
  }

  function buildAnchors() {
    if (!article) return;
    for (const heading of $$('h2[id], h3[id], h4[id]', article)) {
      if (heading.closest('.demo, .mfe-widget, .mfe-player') || $('.heading-anchor', heading))
        continue;
      const link = el(
        'a',
        {
          class: 'heading-anchor',
          href: `#${heading.id}`,
          'aria-label': `Copy the link to “${heading.textContent.trim()}”`,
          title: 'Copy the link to this section',
        },
        icon('link'),
      );
      link.addEventListener('click', async (event) => {
        event.preventDefault();
        try {
          history.replaceState(null, '', `#${heading.id}`);
        } catch {
          window.location.hash = heading.id;
        }
        heading.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
        const done = await copyText(window.location.href);
        toast(done ? 'Link copied' : 'The link is in the address bar');
      });
      heading.append(link);
    }
  }

  function buildPager() {
    if (!NAV || isAuthoring || isHome) return;
    const order = [
      { id: 'index', url: 'index.html', title: 'Home', short: 'Home', section: null },
    ].concat(flatPages);
    const index = order.findIndex((entry) => entry.id === page.id);
    if (index < 0) return;
    const prev = order[index - 1];
    const next = order[index + 1];
    if (!prev && !next) return;
    const card = (entry, kind) =>
      el(
        'a',
        { class: `pager-link is-${kind}`, href: url(entry.url), rel: kind },
        el('span', { class: 'pager-label', text: kind === 'prev' ? '← Previous' : 'Next →' }),
        entry.section ? el('span', { class: 'pager-section', text: entry.section.title }) : null,
        el('span', { class: 'pager-title', text: entry.short || entry.title }),
      );
    const nav = el('nav', { class: 'pager', 'aria-label': 'Previous and next pages' });
    if (prev) nav.append(card(prev, 'prev'));
    if (next) nav.append(card(next, 'next'));
    main.append(nav);
  }

  function buildFooter() {
    const choice = el('div', {
      class: 'segmented',
      role: 'radiogroup',
      'aria-label': 'Theme',
      style: '--segments: 3',
    });
    const thumb = el('span', { class: 'segmented-thumb', 'aria-hidden': 'true' });
    choice.append(thumb);
    const options = ['system', 'dark', 'light'].map((value) =>
      el('button', {
        type: 'button',
        role: 'radio',
        class: 'segmented-option',
        'data-value': value,
        text: value[0].toUpperCase() + value.slice(1),
      }),
    );
    const sync = () => {
      const chosen = askedTheme ? theme : themeChoice();
      options.forEach((option, i) => {
        const on = option.dataset.value === chosen;
        option.setAttribute('aria-checked', String(on));
        option.tabIndex = on ? 0 : -1;
        if (on) choice.style.setProperty('--index', String(i));
      });
    };
    options.forEach((option, i) => {
      option.addEventListener('click', () => {
        setTheme(option.dataset.value);
        sync();
      });
      option.addEventListener('keydown', (event) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        const next = options[(i + step + options.length) % options.length];
        next.focus();
        next.click();
      });
      choice.append(option);
    });
    onTheme(sync);
    sync();
    const linkTo = (id, label) => {
      const entry = flatPages.find((p) => p.id === id);
      return entry ? el('li', null, el('a', { href: url(entry.url), text: label })) : null;
    };
    const footer = el(
      'footer',
      { class: 'site-footer' },
      el('span', { class: 'footer-brand' }, brandMark(), 'Manim Formula Editor · documentation'),
      el(
        'ul',
        { class: 'footer-links' },
        el('li', null, el('a', { href: url('../index.html'), text: 'Home' })),
        el('li', null, el('a', { href: url('index.html'), text: 'Documentation' })),
        linkTo('reference/shortcuts', 'Shortcuts'),
        linkTo('reference/glossary', 'Glossary'),
        linkTo('reference/troubleshooting', 'Troubleshooting'),
      ),
      el('span', { class: 'footer-theme' }, el('span', { text: 'Theme' }), choice),
      el('span', { text: 'MIT licence' }),
    );
    doc.body.append(footer);
  }

  // ---- Themed images and videos ----------------------------------------------------------------

  const THEMED = /\.(dark|light)\.(?=[^/.?#]+(?:[?#].*)?$)/;

  /** The address of the variant of a themed file for `which` theme. */
  const themedPath = (path, which) =>
    path && THEMED.test(path) ? path.replace(THEMED, `.${which}.`) : path;

  function applyThemedMedia(node) {
    const isVideo = node.tagName === 'VIDEO';
    if (!node.dataset.srcDark) {
      node.dataset.srcDark = themedPath(node.getAttribute('src') || '', 'dark');
      if (isVideo && node.getAttribute('poster')) {
        node.dataset.posterDark = themedPath(node.getAttribute('poster'), 'dark');
      }
    }
    const wanted = node.dataset.themedFailed === theme ? 'dark' : theme;
    const src = themedPath(node.dataset.srcDark, wanted);
    if (node.getAttribute('src') !== src) {
      if (isVideo) {
        const time = node.currentTime;
        const playing = !node.paused;
        node.setAttribute('src', src);
        if (node.dataset.posterDark)
          node.setAttribute('poster', themedPath(node.dataset.posterDark, wanted));
        if (time > 0 || playing) {
          node.addEventListener(
            'loadedmetadata',
            () => {
              try {
                node.currentTime = time;
              } catch {
                // a time the new file does not have
              }
              if (playing) node.play().catch(() => {});
            },
            { once: true },
          );
        }
      } else {
        node.setAttribute('src', src);
      }
    } else if (isVideo && node.dataset.posterDark) {
      node.setAttribute('poster', themedPath(node.dataset.posterDark, wanted));
    }
  }

  function mountThemedMedia(scope) {
    for (const node of $$('img[data-themed], video[data-themed]', scope)) {
      if (node.dataset.themedBound) {
        applyThemedMedia(node);
        continue;
      }
      node.dataset.themedBound = '1';
      // A light variant that does not load falls back to the dark one, once.
      node.addEventListener('error', () => {
        if (theme !== 'dark' && node.dataset.themedFailed !== theme) {
          node.dataset.themedFailed = theme;
          console.warn(
            `[docs] no ${theme} variant of ${node.dataset.srcDark}: showing the dark one`,
          );
          applyThemedMedia(node);
        }
      });
      applyThemedMedia(node);
    }
  }

  onTheme(() => {
    for (const node of $$('img[data-themed], video[data-themed]')) {
      if (node.dataset.themedBound) applyThemedMedia(node);
    }
  });

  // ---- Clips -----------------------------------------------------------------------------------

  function mountClip(video) {
    if (video.dataset.mfeMounted !== undefined) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', video.getAttribute('aria-label') ? 'false' : 'true');
    const frame = el('div', { class: 'clip-frame' });
    video.before(frame);
    frame.append(video);
    let pausedByReader = false;
    const toggle = el('button', { type: 'button', class: 'icon-btn is-small' });
    const replay = el(
      'button',
      {
        type: 'button',
        class: 'icon-btn is-small',
        'aria-label': 'Play the clip again',
        title: 'Play again',
      },
      icon('replay'),
    );
    // How far the loop is: a line along the bar, not a control (the buttons are the controls).
    const progress = el('span', { class: 'clip-progress', 'aria-hidden': 'true' });
    let frameRequest = 0;
    const showProgress = () => {
      const share = video.duration > 0 ? Math.min(video.currentTime / video.duration, 1) : 0;
      progress.style.setProperty('--clip-progress', share.toFixed(4));
    };
    const followProgress = () => {
      showProgress();
      frameRequest = !video.paused && !video.ended ? requestAnimationFrame(followProgress) : 0;
    };
    const showState = () => {
      const playing = !video.paused && !video.ended;
      toggle.replaceChildren(icon(playing ? 'pause' : 'play'));
      toggle.setAttribute('aria-label', playing ? 'Pause the clip' : 'Play the clip');
      toggle.title = playing ? 'Pause' : 'Play';
      frame.classList.toggle('is-playing', playing);
      if (playing && !frameRequest) frameRequest = requestAnimationFrame(followProgress);
      if (!playing) showProgress();
    };
    const play = () => {
      video.preload = 'auto';
      const promise = video.play();
      if (promise && promise.catch) promise.catch(() => showState());
    };
    toggle.addEventListener('click', () => {
      if (video.paused || video.ended) {
        pausedByReader = false;
        play();
      } else {
        pausedByReader = true;
        video.pause();
      }
    });
    replay.addEventListener('click', () => {
      pausedByReader = false;
      try {
        video.currentTime = 0;
      } catch {
        // not loaded yet
      }
      play();
    });
    video.addEventListener('play', showState);
    video.addEventListener('pause', showState);
    video.addEventListener('ended', showState);
    video.addEventListener('seeked', showProgress);
    // The buttons sit in a bar under the picture, never over it: the corners of a clip are where
    // the app has controls of its own.
    frame.append(el('div', { class: 'clip-controls' }, toggle, progress, replay));
    showState();
    if (reducedMotion()) {
      // No motion unless asked: a button starts the clip, once. It covers the picture only until
      // the clip plays, whichever button started it.
      video.loop = false;
      const start = el(
        'button',
        { type: 'button', class: 'clip-start', 'aria-label': 'Play the clip' },
        icon('play'),
      );
      start.addEventListener('click', () => play());
      video.addEventListener(
        'play',
        () => {
          const focused = doc.activeElement === start;
          start.remove();
          if (focused) toggle.focus();
        },
        { once: true },
      );
      frame.append(start);
    } else if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              if (!pausedByReader) play();
            } else if (!video.paused) {
              video.pause();
            }
          }
        },
        { threshold: [0, 0.5] },
      );
      observer.observe(frame);
    }
    video.setAttribute('data-mfe-mounted', '');
  }

  // ---- Captions: the HTML a tour caption may hold ----------------------------------------------

  const CAPTION_TAGS = new Set(['B', 'I', 'EM', 'STRONG', 'CODE', 'KBD', 'SPAN', 'BR']);

  /** Keeps b, i, em, strong, code, kbd[data-keys], span.ui (AUTHORING.md §3, "Tours"); unwraps
   * the rest. */
  function sanitizeCaption(source) {
    const template = doc.createElement('template');
    template.innerHTML = String(source || '');
    const clean = (node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) continue;
        if (child.nodeType !== Node.ELEMENT_NODE) {
          child.remove();
          continue;
        }
        const tag = child.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE') {
          child.remove();
          continue;
        }
        const allowed = CAPTION_TAGS.has(tag) && (tag !== 'SPAN' || child.classList.contains('ui'));
        clean(child);
        if (!allowed) {
          child.replaceWith(...Array.from(child.childNodes));
          continue;
        }
        for (const attribute of Array.from(child.attributes)) {
          const keep =
            (tag === 'KBD' && attribute.name === 'data-keys') ||
            (tag === 'SPAN' && attribute.name === 'class');
          if (!keep) child.removeAttribute(attribute.name);
        }
        if (tag === 'SPAN') child.className = 'ui';
      }
    };
    clean(template.content);
    return template.content;
  }

  // ---- Tours -----------------------------------------------------------------------------------

  function mountTour(element) {
    if (element.dataset.mfeMounted !== undefined) return;
    const id = element.getAttribute('data-mfe-tour') || '';
    const data = (window.MFE_TOURS || {})[id];
    if (!data || !Array.isArray(data.steps) || data.steps.length === 0) {
      notice(
        element,
        `The tour “${id}” has no data: the page needs the script media/${id}.tour.js.`,
      );
      return;
    }
    const width = Number(data.width) || 1440;
    const height = Number(data.height) || 900;
    const pageId = id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : id;
    const base = typeof data.base === 'string' ? data.base.replace(/^\/+/, '') : `media/${pageId}/`;
    const ext = typeof data.ext === 'string' ? data.ext : 'webp';
    const steps = data.steps;
    const total = steps.length;
    const imagePath = (step, which) => url(`${base}${step.image}.${which}.${ext}`);
    let index = Math.min(Math.max((Number(element.dataset.start) || 1) - 1, 0), total - 1);
    const seen = new Set([index]);
    let timer = 0;
    let autoplay = !reducedMotion() && element.dataset.autoplay !== 'off' && total > 1;
    let visible = false;

    element.replaceChildren();
    element.tabIndex = 0;
    element.setAttribute('role', 'group');
    element.setAttribute('aria-roledescription', 'tour');
    element.setAttribute('aria-label', element.dataset.title || 'A tour of the app, step by step');

    const image = el('img', { width, height, alt: '', decoding: 'async', draggable: 'false' });
    const ns = 'http://www.w3.org/2000/svg';
    const overlay = doc.createElementNS(ns, 'svg');
    overlay.setAttribute('class', 'tour-overlay');
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    overlay.setAttribute('preserveAspectRatio', 'none');
    overlay.setAttribute('aria-hidden', 'true');
    const maskId = `tour-mask-${Math.random().toString(36).slice(2, 9)}`;
    const stage = el(
      'div',
      { class: 'tour-stage', style: `aspect-ratio: ${width} / ${height}` },
      image,
      overlay,
    );
    const stepLabel = el('p', { class: 'tour-step-label' });
    const caption = el('p', { class: 'tour-caption', 'aria-live': 'polite' });
    const prev = el(
      'button',
      {
        type: 'button',
        class: 'icon-btn is-small',
        'aria-label': 'Previous step',
        title: 'Previous step',
      },
      icon('step-back'),
    );
    const next = el(
      'button',
      { type: 'button', class: 'icon-btn is-small', 'aria-label': 'Next step', title: 'Next step' },
      icon('step-forward'),
    );
    const playButton = el('button', { type: 'button', class: 'icon-btn is-small' });
    const count = el('span', { class: 'tour-count', 'aria-hidden': 'true' });
    const dots = el('div', { class: 'tour-dots' });
    const dotButtons = steps.map((step, i) => {
      const dot = el('button', {
        type: 'button',
        class: 'tour-dot',
        'aria-label': `Step ${i + 1} of ${total}`,
      });
      dot.addEventListener('click', () => {
        stopAutoplay();
        show(i);
      });
      dots.append(dot);
      return dot;
    });
    element.append(
      stage,
      el('div', { class: 'tour-text' }, stepLabel, caption),
      el('div', { class: 'tour-controls' }, prev, dots, count, playButton, next),
    );

    function drawBoxes(boxes) {
      const valid = (Array.isArray(boxes) ? boxes : []).filter(
        (box) => box && [box.x, box.y, box.w, box.h].every((v) => Number.isFinite(Number(v))),
      );
      if (!valid.length) {
        overlay.innerHTML = '';
        return;
      }
      const rect = (box, extra) =>
        `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="6"${extra || ''}/>`;
      overlay.innerHTML =
        `<defs><mask id="${maskId}"><rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/>` +
        valid.map((box) => rect(box, ' fill="#000"')).join('') +
        `</mask></defs><rect class="tour-dim" x="0" y="0" width="${width}" height="${height}" mask="url(#${maskId})"/>` +
        valid.map((box) => rect(box, ' class="tour-box"')).join('');
    }

    function show(i) {
      index = Math.min(Math.max(i, 0), total - 1);
      seen.add(index);
      const step = steps[index] || {};
      stage.classList.add('is-loading');
      image.onload = () => stage.classList.remove('is-loading');
      image.onerror = () => {
        stage.classList.remove('is-loading');
        if (theme !== 'dark' && image.getAttribute('src') !== imagePath(step, 'dark')) {
          image.setAttribute('src', imagePath(step, 'dark'));
        }
      };
      image.setAttribute('src', imagePath(step, theme));
      const content = sanitizeCaption(step.caption);
      caption.replaceChildren(content);
      mountKeys(caption);
      image.alt = `Step ${index + 1} of ${total}: ${caption.textContent.trim()}`;
      stepLabel.textContent = `Step ${index + 1} / ${total}`;
      count.textContent = `${index + 1} / ${total}`;
      drawBoxes(step.boxes);
      dotButtons.forEach((dot, n) => {
        if (n === index) dot.setAttribute('aria-current', 'step');
        else dot.removeAttribute('aria-current');
        dot.classList.toggle('is-seen', seen.has(n));
      });
      prev.disabled = index === 0;
      next.disabled = index === total - 1;
      // The next image is fetched ahead, so that the step after this one comes at once.
      const ahead = steps[index + 1];
      if (ahead) new Image().src = imagePath(ahead, theme);
      schedule();
    }

    function showPlayState() {
      playButton.classList.toggle('is-playing', autoplay);
      playButton.replaceChildren(icon(autoplay ? 'pause' : 'play'));
      playButton.setAttribute('aria-label', autoplay ? 'Stop the tour' : 'Play the tour');
      playButton.title = autoplay ? 'Stop' : 'Play the steps one after another';
    }

    function schedule() {
      clearTimeout(timer);
      if (!autoplay || !visible) return;
      if (index >= total - 1) {
        autoplay = false;
        showPlayState();
        return;
      }
      const words = caption.textContent.trim().split(/\s+/).length;
      const delay = Math.min(Math.max(2600 + words * 260, 4200), 9500);
      timer = setTimeout(() => show(index + 1), delay);
    }

    function stopAutoplay() {
      if (!autoplay) return;
      autoplay = false;
      clearTimeout(timer);
      showPlayState();
    }

    prev.addEventListener('click', () => {
      stopAutoplay();
      show(index - 1);
    });
    next.addEventListener('click', () => {
      stopAutoplay();
      show(index + 1);
    });
    playButton.addEventListener('click', () => {
      if (autoplay) {
        stopAutoplay();
        return;
      }
      autoplay = true;
      showPlayState();
      if (index >= total - 1) show(0);
      else schedule();
    });
    element.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: total - 1 }[
        event.key
      ];
      if (target === undefined) return;
      event.preventDefault();
      stopAutoplay();
      show(target);
    });
    // Any press inside the tour is the reader taking over (the buttons stop it themselves).
    stage.addEventListener('pointerdown', stopAutoplay);
    caption.addEventListener('pointerdown', stopAutoplay);
    onTheme(() => {
      image.setAttribute('src', imagePath(steps[index] || {}, theme));
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            visible = entry.isIntersecting && entry.intersectionRatio >= 0.55;
            if (visible) schedule();
            else clearTimeout(timer);
          }
        },
        { threshold: [0, 0.55] },
      ).observe(element);
    } else {
      autoplay = false;
    }
    showPlayState();
    show(index);
    element.setAttribute('data-mfe-mounted', '');
  }

  // ---- Examples: the Python, the card ----------------------------------------------------------

  const examples = () => window.MFE_EXAMPLES || {};

  /** The address of a file of an example's `meta.files`: a path from docs/web/ ("examples/x.py")
   * or the bare name of a file in examples/ ("x.py"); an address with a scheme stays as it is. */
  function exampleFile(value) {
    if (typeof value !== 'string' || !value) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
    const path = value.replace(/^\.\//, '').replace(/^\/+/, '');
    return path.includes('/') ? url(path) : url(`examples/${path}`);
  }

  const baseName = (value) =>
    String(value || '')
      .split(/[\\/]/)
      .pop();

  const PYTHON_TAB_KEY = 'mfe-docs:python-tab';
  const PYTHON_VARIANTS = [
    { key: 'ce', label: 'ManimCE' },
    { key: 'gl', label: 'ManimGL' },
  ];

  function mountPython(element) {
    if (element.dataset.mfeMounted !== undefined) return;
    const slug = element.getAttribute('data-mfe-python') || '';
    const example = examples()[slug];
    const python = example && example.python;
    const variants = python ? PYTHON_VARIANTS.filter((v) => typeof python[v.key] === 'string') : [];
    if (!variants.length) {
      notice(
        element,
        `The example “${slug}” has no Python: the page needs the script examples/${slug}.data.js.`,
      );
      return;
    }
    const files = (example.meta && example.meta.files) || {};
    const fileName = (key) => baseName(files[key]) || `${slug}.${key}.py`;
    const uid = `code-${slug}-${Math.random().toString(36).slice(2, 7)}`;
    const tablist = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Python for' });
    const fileLabel = el('span', { class: 'mfe-code-file' });
    const panels = {};
    const tabs = {};
    let selected = null;
    for (const variant of variants) {
      const code = el('code', { class: 'language-python', text: python[variant.key] });
      const panel = el(
        'div',
        {
          role: 'tabpanel',
          id: `${uid}-${variant.key}`,
          'aria-labelledby': `${uid}-${variant.key}-tab`,
          tabindex: '0',
        },
        el('pre', null, code),
      );
      highlightElement(code, 'python');
      panels[variant.key] = panel;
      const tab = el('button', {
        type: 'button',
        role: 'tab',
        class: 'tab',
        id: `${uid}-${variant.key}-tab`,
        'aria-controls': panel.id,
        text: variant.label,
      });
      tab.addEventListener('click', () => {
        select(variant.key);
        store.set(PYTHON_TAB_KEY, variant.key);
        doc.dispatchEvent(new CustomEvent('mfe-docs:python-tab', { detail: { key: variant.key } }));
      });
      tabs[variant.key] = tab;
      tablist.append(tab);
    }
    tablist.addEventListener('keydown', (event) => {
      const keys = variants.map((v) => v.key);
      const at = keys.indexOf(selected);
      const target = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: keys.length - 1 }[
        event.key
      ];
      if (target === undefined) return;
      event.preventDefault();
      const key = keys[(target + keys.length) % keys.length];
      tabs[key].click();
      tabs[key].focus();
    });
    function select(key) {
      if (!panels[key]) key = variants[0].key;
      selected = key;
      for (const variant of variants) {
        const on = variant.key === key;
        tabs[variant.key].setAttribute('aria-selected', String(on));
        tabs[variant.key].tabIndex = on ? 0 : -1;
        panels[variant.key].hidden = !on;
      }
      fileLabel.textContent = fileName(key);
    }
    const download = el(
      'button',
      { type: 'button', class: 'copy-btn', 'aria-label': 'Download this Python file' },
      icon('download'),
      el('span', { text: 'Download' }),
    );
    download.addEventListener('click', () =>
      downloadText(python[selected], fileName(selected), 'text/x-python;charset=utf-8'),
    );
    const bar = el(
      'div',
      { class: 'mfe-code-bar' },
      tablist,
      fileLabel,
      copyButton(() => python[selected], 'Copy this Python'),
      download,
    );
    element.replaceChildren(bar, ...variants.map((v) => panels[v.key]));
    const wanted = element.dataset.tab || store.get(PYTHON_TAB_KEY, 'ce');
    select(wanted);
    doc.addEventListener('mfe-docs:python-tab', (event) => {
      if (!element.dataset.tab && panels[event.detail.key]) select(event.detail.key);
    });
    element.setAttribute('data-mfe-mounted', '');
  }

  function formatDuration(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) return null;
    if (value < 60) return `${value.toFixed(value < 10 ? 1 : 0)} s`;
    const minutes = Math.floor(value / 60);
    const rest = Math.round(value - minutes * 60);
    return `${minutes} min ${String(rest).padStart(2, '0')} s`;
  }

  /** A menu button: Enter, Space or ↓ open it; ↑ ↓ move; Esc and Tab close it. */
  function menuButton(button, menu) {
    const items = () => $$('[role="menuitem"]', menu);
    const open = (focusFirst) => {
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      if (focusFirst) items()[0]?.focus();
      setTimeout(() => doc.addEventListener('pointerdown', outside), 0);
    };
    const close = (refocus) => {
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      doc.removeEventListener('pointerdown', outside);
      if (refocus) button.focus();
    };
    const outside = (event) => {
      if (!menu.contains(event.target) && !button.contains(event.target)) close(false);
    };
    button.addEventListener('click', () => (menu.hidden ? open(false) : close(false)));
    button.addEventListener('keydown', (event) => {
      if (
        event.key === 'ArrowDown' ||
        ((event.key === 'Enter' || event.key === ' ') && menu.hidden)
      ) {
        event.preventDefault();
        open(true);
      }
    });
    menu.addEventListener('keydown', (event) => {
      const list = items();
      const at = list.indexOf(doc.activeElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        list[(at + step + list.length) % list.length].focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        list[event.key === 'Home' ? 0 : list.length - 1].focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'Tab') {
        close(false);
      }
    });
    menu.addEventListener('click', (event) => {
      if (event.target.closest('[role="menuitem"]')) close(false);
    });
  }

  function mountExample(element) {
    if (element.dataset.mfeMounted !== undefined) return;
    const slug = element.getAttribute('data-mfe-example') || '';
    const example = examples()[slug];
    const meta = example && example.meta;
    if (!meta) {
      notice(
        element,
        `The example “${slug}” has no data: the page needs the script examples/${slug}.data.js.`,
      );
      return;
    }
    const files = meta.files || {};
    const python = example.python || {};
    const actions = [];
    const projectUrl = exampleFile(files.project);
    if (projectUrl) {
      actions.push({
        kind: 'link',
        label: 'Download the project',
        hint: '.mfe.json',
        icon: 'file',
        href: projectUrl,
        name: baseName(files.project),
      });
    }
    for (const variant of PYTHON_VARIANTS) {
      const name = baseName(files[variant.key]) || `${slug}.${variant.key}.py`;
      if (typeof python[variant.key] === 'string') {
        actions.push({
          kind: 'text',
          label: `${variant.label} Python`,
          hint: '.py',
          icon: 'code',
          text: python[variant.key],
          name,
        });
      } else if (exampleFile(files[variant.key])) {
        actions.push({
          kind: 'link',
          label: `${variant.label} Python`,
          hint: '.py',
          icon: 'code',
          href: exampleFile(files[variant.key]),
          name,
        });
      }
    }
    if (exampleFile(files.video)) {
      actions.push({
        kind: 'link',
        label: 'Video rendered by Manim',
        hint: '.mp4',
        icon: 'video',
        href: exampleFile(files.video),
        name: baseName(files.video),
      });
    }
    const run = (action) => {
      if (action.kind === 'text')
        downloadText(action.text, action.name, 'text/x-python;charset=utf-8');
    };
    const actionNode = (action, cls, role) => {
      const props = { class: cls, role: role || null };
      const node =
        action.kind === 'link'
          ? el('a', { ...props, href: action.href, download: action.name || true })
          : el('button', { ...props, type: 'button' });
      if (action.kind === 'text') node.addEventListener('click', () => run(action));
      return node;
    };
    const facts = el('p', { class: 'example-facts' });
    const duration = formatDuration(meta.duration);
    if (duration)
      facts.append(el('span', null, 'Length ', el('span', { class: 'time', text: duration })));
    if (Number(meta.fps) > 0) facts.append(el('span', { text: `${Number(meta.fps)} fps` }));
    const actionsRow = el('div', { class: 'example-actions' });
    if (actions.length) {
      const [first, ...rest] = actions;
      const mainButton = actionNode(first, 'btn btn-primary');
      mainButton.append(icon('download'), first.label);
      const split = el('div', { class: 'split' }, mainButton);
      if (rest.length) {
        const arrow = el(
          'button',
          {
            type: 'button',
            class: 'btn btn-primary split-arrow',
            'aria-haspopup': 'menu',
            'aria-expanded': 'false',
            'aria-label': 'More files of this example',
          },
          icon('chevron-down'),
        );
        const menu = el('div', { class: 'menu-popup', role: 'menu', hidden: true });
        for (const action of rest) {
          const item = actionNode(action, 'menu-item', 'menuitem');
          item.tabIndex = -1;
          item.append(
            icon(action.icon),
            action.label,
            el('span', { class: 'menu-item-hint', text: action.hint }),
          );
          menu.append(item);
        }
        split.append(arrow, menu);
        menuButton(arrow, menu);
      }
      actionsRow.append(split);
    }
    if (projectUrl) {
      // File ▸ Open… is the Projects dialog; a file from the disk is opened with its button.
      const hint = el('span', { class: 'example-hint' }, 'Open the project in the app with ');
      hint.append(
        el('span', { class: 'ui', text: 'File ▸ Open…' }),
        ', then ',
        el('span', { class: 'ui', text: 'Other file…' }),
        '.',
      );
      actionsRow.append(hint);
      mountUiLabels(hint);
    }
    const card = el(
      'div',
      { class: 'example-card' },
      el('span', { class: 'example-icon', 'aria-hidden': 'true' }, icon('sigma')),
      el(
        'div',
        { class: 'example-body' },
        el('p', { class: 'example-title', text: meta.title || slug }),
        meta.description ? el('p', { class: 'example-desc', text: meta.description }) : null,
        facts.childNodes.length ? facts : null,
        actionsRow,
      ),
    );
    element.replaceChildren(card);
    element.setAttribute('data-mfe-mounted', '');
  }

  // ---- Players and widgets ---------------------------------------------------------------------

  function mountPlayers(scope) {
    const figures = $$('[data-mfe-player]', scope);
    if (!figures.length) return;
    const player = window.MFEPlayer;
    if (!player || typeof player.mountAll !== 'function') {
      for (const figure of figures) {
        if (figure.dataset.mfeError === undefined) {
          notice(
            figure,
            'The animation player is not loaded: the page needs the script assets/player.js.',
          );
        }
      }
      return;
    }
    try {
      player.mountAll(scope === doc ? doc : scope);
    } catch (error) {
      console.error('[docs] the player failed:', error);
      for (const figure of figures) notice(figure, `The animation player failed: ${error.message}`);
    }
  }

  function widgetContext(element) {
    return {
      root,
      url,
      theme: () => theme,
      onTheme,
      platform,
      reducedMotion,
      formatKeys,
      examples: examples(),
      data: window.MFE_DATA || {},
      notice: (message) => notice(element, message),
      mount: (scope) => mount(scope),
    };
  }

  function mountWidget(element) {
    if (element.dataset.mfeMounted !== undefined) return;
    const name = element.getAttribute('data-mfe-widget') || '';
    const widget = (window.MFE_WIDGETS || {})[name];
    if (!widget || typeof widget.mount !== 'function') {
      notice(
        element,
        `The widget “${name}” is not loaded: the page needs the script widgets/${name}.js.`,
      );
      return;
    }
    let options = {};
    try {
      options = element.dataset.options ? JSON.parse(element.dataset.options) : {};
    } catch (error) {
      notice(element, `The options of the widget “${name}” are not valid JSON: ${error.message}`);
      return;
    }
    try {
      widget.mount(element, options, widgetContext(element));
      element.setAttribute('data-mfe-mounted', '');
    } catch (error) {
      console.error(`[docs] the widget “${name}” failed:`, error);
      notice(element, `The widget “${name}” failed: ${error.message}`);
    }
  }

  // ---- Icons, keys, interface labels, callouts, "Try it" ---------------------------------------

  /** `<span data-icon="sigma"></span>`: one of the icons above, decorative. */
  function mountIcons(scope) {
    for (const node of $$('[data-icon]', scope)) {
      if (node.querySelector('svg') || !ICONS[node.dataset.icon]) continue;
      node.append(icon(node.dataset.icon));
      node.setAttribute('aria-hidden', 'true');
    }
  }

  function mountKeys(scope) {
    for (const node of $$('kbd[data-keys]', scope)) {
      if (node.dataset.keysDone === platform) continue;
      const keys = orderKeys(splitKeys(keysOf(node)));
      if (!keys.length) continue;
      const parts = [];
      keys.forEach((key, i) => {
        const label = keyLabel(key);
        if (i > 0 && !(isMac && /^[⌘⌥⇧⌃]$/.test(keyLabel(keys[i - 1])))) {
          parts.push(el('span', { class: 'keys-plus', 'aria-hidden': 'true', text: '+' }));
        }
        parts.push(el('kbd', { class: /^[^\w]+$/.test(label) ? 'is-symbol' : null, text: label }));
      });
      node.classList.add('keys');
      node.replaceChildren(...parts);
      node.title = formatKeys(keysOf(node));
      node.dataset.keysDone = platform;
    }
  }

  function mountUiLabels(scope) {
    for (const node of $$('.ui', scope)) {
      if (node.dataset.uiDone || !node.textContent.includes('▸')) continue;
      node.dataset.uiDone = '1';
      const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const texts = [];
      while (walker.nextNode()) texts.push(walker.currentNode);
      for (const text of texts) {
        if (!text.nodeValue.includes('▸')) continue;
        const pieces = text.nodeValue.split('▸');
        const fragment = doc.createDocumentFragment();
        pieces.forEach((piece, i) => {
          if (i > 0) {
            fragment.append(el('span', { class: 'ui-sep', 'aria-hidden': 'true', text: '▸' }));
            fragment.append(el('span', { class: 'sr-only', text: ', ' }));
          }
          fragment.append(piece);
        });
        text.replaceWith(fragment);
      }
    }
  }

  const CALLOUTS = {
    tip: ['bulb', 'Tip'],
    note: ['info', 'Note'],
    warning: ['warning', 'Warning'],
  };
  const PLATFORM_LABELS = { mac: 'On a Mac', windows: 'On Windows', linux: 'On Linux' };

  function mountCallouts(scope) {
    for (const node of $$('aside.callout', scope)) {
      if ($(':scope > .callout-label', node)) continue;
      let label = null;
      if (node.classList.contains('platform')) {
        const which = node.dataset.platform;
        label = el(
          'p',
          { class: 'callout-label' },
          icon('laptop'),
          PLATFORM_LABELS[which] || 'On some systems',
        );
        if (which === platform) {
          node.classList.add('is-reader-platform');
          label.append(el('span', { class: 'callout-badge', text: 'Your system' }));
        }
      } else {
        const kind = Object.keys(CALLOUTS).find((k) => node.classList.contains(k)) || 'note';
        label = el('p', { class: 'callout-label' }, icon(CALLOUTS[kind][0]), CALLOUTS[kind][1]);
      }
      node.prepend(label);
    }
    for (const node of $$('aside.try', scope)) {
      if ($(':scope > .try-label', node)) continue;
      node.prepend(el('p', { class: 'try-label' }, icon('play-outline'), 'Try it'));
    }
  }

  // ---- Code: highlighting and copy -------------------------------------------------------------

  /** A highlighter from rules [class, pattern]: the first pattern that matches at a place wins.
   * Patterns hold no capturing groups of their own. */
  function makeHighlighter(rules) {
    const pattern = new RegExp(rules.map(([, source]) => `(${source})`).join('|'), 'gm');
    return (text) => {
      let out = '';
      let last = 0;
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text))) {
        if (match[0] === '') {
          pattern.lastIndex += 1;
          continue;
        }
        let group = 1;
        while (group < match.length && match[group] === undefined) group += 1;
        const kind = rules[group - 1][0];
        out += escapeHtml(text.slice(last, match.index));
        out += kind
          ? `<span class="tok-${kind}">${escapeHtml(match[0])}</span>`
          : escapeHtml(match[0]);
        last = pattern.lastIndex;
      }
      return out + escapeHtml(text.slice(last));
    };
  }

  const PY_KEYWORDS =
    'and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|match|case';
  const PY_BUILTINS =
    'self|cls|print|len|range|super|isinstance|enumerate|zip|list|dict|tuple|set|str|int|float|bool|abs|min|max|round|sum|sorted|reversed|map|filter|open|any|all|type|getattr|setattr|hasattr';

  const HIGHLIGHTERS = {
    python: makeHighlighter([
      ['comment', '#[^\\n]*'],
      ['string', `(?<![\\w])[rRbBuUfF]{0,2}(?:"""[\\s\\S]*?"""|'''[\\s\\S]*?''')`],
      ['string', `(?<![\\w])[rRbBuUfF]{0,2}(?:"(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*')`],
      ['decorator', '@[A-Za-z_][\\w.]*'],
      ['function', '(?<=\\bdef\\s+)[A-Za-z_]\\w*'],
      ['class', '(?<=\\bclass\\s+)[A-Za-z_]\\w*'],
      ['keyword', `\\b(?:${PY_KEYWORDS})\\b`],
      ['constant', '\\b(?:True|False|None)\\b'],
      ['builtin', `\\b(?:${PY_BUILTINS})\\b`],
      ['constant', '\\b[A-Z][A-Z0-9_]+\\b'],
      ['class', '\\b[A-Z][A-Za-z0-9_]*\\b'],
      ['function', '\\b[a-z_][\\w]*(?=\\()'],
      [
        'number',
        '\\b(?:0[xX][\\da-fA-F_]+|0[bB][01_]+|\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?j?)\\b|\\.\\d+\\b',
      ],
    ]),
    latex: makeHighlighter([
      ['comment', '(?<!\\\\)%[^\\n]*'],
      ['keyword', '\\\\(?:[A-Za-z@]+\\*?|.)'],
      ['string', '\\$\\$?'],
      ['punct', '[{}\\[\\]]'],
      ['attr', '[&^_]'],
      ['number', '\\b\\d+(?:\\.\\d+)?\\b'],
    ]),
    json: makeHighlighter([
      ['key', '"(?:[^"\\\\\\n]|\\\\.)*"(?=\\s*:)'],
      ['string', '"(?:[^"\\\\\\n]|\\\\.)*"'],
      ['number', '-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b'],
      ['constant', '\\b(?:true|false|null)\\b'],
      ['punct', '[{}\\[\\],:]'],
    ]),
    bash: makeHighlighter([
      ['comment', '(?<=^|\\s)#[^\\n]*'],
      ['string', `"(?:[^"\\\\]|\\\\.)*"|'[^']*'`],
      ['variable', '\\$(?:\\{[^}\\n]*\\}|[A-Za-z_]\\w*|[0-9@#?$!*-])'],
      [
        'keyword',
        '\\b(?:if|then|else|elif|fi|for|in|do|done|while|until|case|esac|function|export|return)\\b',
      ],
      ['command', '(?<=^[ \\t]*|[|;&][ \\t]*|\\$ )[A-Za-z_./~][\\w./~-]*'],
      ['attr', '(?<=\\s)--?[A-Za-z][\\w-]*'],
    ]),
    js: makeHighlighter([
      ['comment', '//[^\\n]*|/\\*[\\s\\S]*?\\*/'],
      ['string', '`(?:[^`\\\\]|\\\\.)*`|"(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\''],
      [
        'keyword',
        '\\b(?:const|let|var|function|return|if|else|for|while|do|of|in|new|class|extends|this|typeof|instanceof|await|async|import|export|default|from|try|catch|finally|throw|switch|case|break|continue|delete|void|yield)\\b',
      ],
      ['constant', '\\b(?:true|false|null|undefined|NaN|Infinity)\\b'],
      ['class', '\\b[A-Z][A-Za-z0-9_]*\\b'],
      ['function', '\\b[a-z_$][\\w$]*(?=\\()'],
      ['number', '\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b'],
    ]),
  };

  function highlightHtml(text) {
    let out = '';
    const parts = text.split(/(<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>)/);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith('<!--')) {
        out += `<span class="tok-comment">${escapeHtml(part)}</span>`;
      } else if (/^<\/?[A-Za-z]/.test(part)) {
        const head = /^(<\/?)([\w:-]+)/.exec(part);
        const end = /(\/?>)$/.exec(part);
        const middle = part.slice(head[0].length, end ? part.length - end[0].length : part.length);
        out += `<span class="tok-tag">${escapeHtml(head[0])}</span>`;
        out += middle.replace(
          /([^\s=]+)(\s*=\s*)?("[^"]*"|'[^']*'|[^\s"'>]+)?|(\s+)/g,
          (whole, name, eq, value, space) => {
            if (space) return space;
            let piece = `<span class="tok-attr">${escapeHtml(name)}</span>`;
            if (eq) piece += escapeHtml(eq);
            if (value) piece += `<span class="tok-string">${escapeHtml(value)}</span>`;
            return piece;
          },
        );
        if (end) out += `<span class="tok-tag">${escapeHtml(end[0])}</span>`;
      } else {
        out += escapeHtml(part).replace(
          /&amp;([a-zA-Z]+|#\d+);/g,
          '<span class="tok-constant">&amp;$1;</span>',
        );
      }
    }
    return out;
  }
  HIGHLIGHTERS.html = highlightHtml;

  const LANGUAGE_ALIASES = {
    py: 'python',
    python: 'python',
    tex: 'latex',
    latex: 'latex',
    json: 'json',
    bash: 'bash',
    sh: 'bash',
    shell: 'bash',
    console: 'bash',
    zsh: 'bash',
    html: 'html',
    xml: 'html',
    js: 'js',
    javascript: 'js',
    mjs: 'js',
  };
  const LANGUAGE_LABELS = {
    python: 'Python',
    latex: 'LaTeX',
    json: 'JSON',
    bash: 'Shell',
    html: 'HTML',
    js: 'JavaScript',
  };

  const languageOf = (code) => {
    const match = /(?:^|\s)language-([\w-]+)/.exec(code.className || '');
    return match ? LANGUAGE_ALIASES[match[1].toLowerCase()] || match[1].toLowerCase() : null;
  };

  function highlightElement(code, language) {
    if (code.dataset.highlighted !== undefined) return;
    const fn = HIGHLIGHTERS[language];
    if (fn) code.innerHTML = fn(code.textContent);
    code.dataset.highlighted = '';
  }

  function mountCode(scope) {
    for (const pre of $$('pre', scope)) {
      if (pre.closest('.mfe-code, .mfe-widget, .mfe-player') || pre.dataset.codeDone) continue;
      pre.dataset.codeDone = '1';
      const code = $(':scope > code', pre);
      const language = code ? languageOf(code) : null;
      if (code && language) highlightElement(code, language);
      if (!pre.closest('.doc') || pre.parentElement.classList.contains('code-block')) continue;
      const block = el('div', { class: 'code-block' });
      pre.before(block);
      block.append(
        el(
          'div',
          { class: 'code-block-bar' },
          el('span', { class: 'code-lang', text: LANGUAGE_LABELS[language] || language || 'Code' }),
          copyButton(() => (code || pre).textContent, 'Copy this code'),
        ),
        pre,
      );
    }
  }

  // ---- Tables and images -----------------------------------------------------------------------

  function mountTables(scope) {
    for (const table of $$('.doc table', scope)) {
      if (table.parentElement.classList.contains('table-wrap')) continue;
      if (table.closest('.mfe-widget, .mfe-player, .demo-markup')) continue;
      const wrap = el('div', { class: 'table-wrap', tabindex: '0', role: 'region' });
      const caption = $('caption', table);
      wrap.setAttribute('aria-label', caption ? caption.textContent.trim() : 'Table');
      table.before(wrap);
      wrap.append(table);
    }
  }

  let lightbox = null;
  let lightboxReturn = null;

  function openLightbox(image) {
    if (!lightbox) {
      const close = el(
        'button',
        { type: 'button', class: 'icon-btn lightbox-close', 'aria-label': 'Close the image' },
        icon('close'),
      );
      lightbox = el(
        'dialog',
        { class: 'lightbox', 'aria-label': 'Image' },
        close,
        el('img', { alt: '' }),
        el('p', { class: 'lightbox-caption' }),
      );
      close.addEventListener('click', () => lightbox.close());
      lightbox.addEventListener('click', (event) => {
        if (event.target === lightbox || event.target.tagName === 'IMG') lightbox.close();
      });
      lightbox.addEventListener('close', () => {
        if (lightboxReturn) lightboxReturn.focus();
      });
      doc.body.append(lightbox);
    }
    const big = $('img', lightbox);
    big.src = image.currentSrc || image.src;
    big.alt = image.alt;
    const figure = image.closest('figure');
    const caption = figure && $('figcaption', figure);
    const captionNode = $('.lightbox-caption', lightbox);
    captionNode.textContent = caption ? caption.textContent.trim() : '';
    captionNode.hidden = !caption;
    lightboxReturn = image;
    if (typeof lightbox.showModal === 'function') lightbox.showModal();
  }

  function mountZoom(scope) {
    for (const image of $$('.doc figure img', scope)) {
      if (image.dataset.zoomDone || image.hasAttribute('data-no-zoom')) continue;
      if (image.closest('a, .mfe-tour, .mfe-player, .mfe-widget, .example-card')) continue;
      image.dataset.zoomDone = '1';
      image.classList.add('is-zoomable');
      image.tabIndex = 0;
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', `Enlarge the image: ${image.alt || 'image'}`);
      image.addEventListener('click', () => openLightbox(image));
      image.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openLightbox(image);
        }
      });
    }
  }

  // ---- Showcase: a demo shows its own markup ---------------------------------------------------

  function dedent(text) {
    const lines = text
      .replace(/^\s*\n/, '')
      .replace(/\s+$/, '')
      .split('\n');
    const indents = lines.filter((line) => line.trim()).map((line) => /^\s*/.exec(line)[0].length);
    const cut = indents.length ? Math.min(...indents) : 0;
    return lines.map((line) => line.slice(cut)).join('\n');
  }

  /** `<div class="demo">`: its markup, as written, in a code block under it. Runs before any
   * component mounts, so that the markup is the author's and not what site.js made of it. */
  function captureDemos() {
    for (const demo of $$('.demo')) {
      if (demo.dataset.markupDone || demo.hasAttribute('data-no-markup')) continue;
      demo.dataset.markupDone = '1';
      // The browser writes every attribute back in double quotes: JSON in an attribute was in
      // single quotes, as an author writes it.
      const source = dedent(demo.innerHTML)
        .replace(/=""/g, '')
        .replace(
          /="([^"']*&quot;[^"']*)"/g,
          (whole, value) => `='${value.replace(/&quot;/g, '"')}'`,
        );
      const code = el('code', { class: 'language-html', text: source });
      const block = el(
        'div',
        { class: 'demo-markup' },
        el(
          'div',
          { class: 'code-block' },
          el(
            'div',
            { class: 'code-block-bar' },
            el('span', { class: 'code-lang', text: 'Markup' }),
            copyButton(() => source, 'Copy this markup'),
          ),
          el('pre', { 'data-code-done': '1' }, code),
        ),
      );
      highlightElement(code, 'html');
      demo.after(block);
    }
  }

  // ---- Search ----------------------------------------------------------------------------------

  let searchDialog = null;
  let searchInput = null;
  let searchList = null;
  let searchEmpty = null;
  let searchIndex = null;
  let searchActive = -1;
  let searchReturn = null;

  const fold = (text) =>
    String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();

  function prepareIndex() {
    if (searchIndex) return searchIndex;
    const data =
      window.MFE_SEARCH && Array.isArray(window.MFE_SEARCH.pages) ? window.MFE_SEARCH.pages : null;
    if (!data) return null;
    searchIndex = data.map((entry) => ({
      entry,
      title: fold(entry.title),
      short: fold(entry.short),
      description: fold(entry.description),
      section: fold(entry.section),
      headings: (entry.headings || []).map(([, text]) => fold(text)),
      chunks: (entry.chunks || []).map(([, text]) => fold(text)),
    }));
    return searchIndex;
  }

  function fieldScore(text, term, weight) {
    const at = text.indexOf(term);
    if (at < 0) return 0;
    const startsWord = at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1]);
    const endsWord = !/[\p{L}\p{N}]/u.test(text[at + term.length] || ' ');
    return weight * (startsWord && endsWord ? 1.6 : startsWord ? 1 : 0.35);
  }

  function countOf(text, term, cap) {
    let n = 0;
    let at = text.indexOf(term);
    while (at >= 0 && n < cap) {
      n += 1;
      at = text.indexOf(term, at + term.length);
    }
    return n;
  }

  function runSearch(query) {
    const index = prepareIndex();
    if (!index) return null;
    const terms = fold(query)
      .split(/[^\p{L}\p{N}_.+#-]+/u)
      .map((t) => t.replace(/^[.+#-]+|[.+#-]+$/g, ''))
      .filter(Boolean);
    if (!terms.length) return [];
    const results = [];
    for (const item of index) {
      let total = 0;
      const headingHits = new Map();
      const chunkHits = new Map();
      let all = true;
      for (const term of terms) {
        let score =
          fieldScore(item.title, term, 14) +
          fieldScore(item.short, term, 8) +
          fieldScore(item.description, term, 4) +
          fieldScore(item.section, term, 2);
        item.headings.forEach((text, i) => {
          const s = fieldScore(text, term, 6);
          if (s) {
            score += s;
            headingHits.set(i, (headingHits.get(i) || 0) + s);
          }
        });
        item.chunks.forEach((text, i) => {
          const n = countOf(text, term, 6);
          if (n) {
            score += n * 0.8;
            chunkHits.set(i, (chunkHits.get(i) || 0) + n);
          }
        });
        if (!score) {
          all = false;
          break;
        }
        total += score;
      }
      if (all) results.push({ item, total, headingHits, chunkHits, terms });
    }
    results.sort((a, b) => b.total - a.total);
    return results.slice(0, 30);
  }

  /** Text with the terms marked, escaped. */
  function markTerms(text, terms) {
    const lower = String(text).toLowerCase();
    const ranges = [];
    for (const term of terms) {
      let at = lower.indexOf(term);
      while (at >= 0) {
        ranges.push([at, at + term.length]);
        at = lower.indexOf(term, at + term.length);
      }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let out = '';
    let last = 0;
    for (const [start, end] of ranges) {
      if (start < last) continue;
      out +=
        escapeHtml(text.slice(last, start)) +
        '<mark>' +
        escapeHtml(text.slice(start, end)) +
        '</mark>';
      last = end;
    }
    return out + escapeHtml(text.slice(last));
  }

  function snippetOf(text, terms) {
    const lower = String(text).toLowerCase();
    let at = -1;
    for (const term of terms) {
      const found = lower.indexOf(term);
      if (found >= 0 && (at < 0 || found < at)) at = found;
    }
    if (at < 0) return text.length > 150 ? `${text.slice(0, 150)}…` : text;
    const start = Math.max(0, at - 60);
    const end = Math.min(text.length, at + 110);
    return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
  }

  function renderSearch() {
    const query = searchInput.value;
    const results = runSearch(query);
    searchList.replaceChildren();
    searchActive = -1;
    if (results === null) {
      searchEmpty.hidden = false;
      searchEmpty.replaceChildren(
        el('span', {
          html: 'The search index is missing (<code>assets/search-index.js</code>): run <code>node docs/web/tools/build.mjs</code>.',
        }),
      );
      searchInput.setAttribute('aria-expanded', 'false');
      return;
    }
    if (!query.trim()) {
      const count = (window.MFE_SEARCH.pages || []).length;
      searchEmpty.hidden = false;
      searchEmpty.textContent = `Type to search the ${count} pages of the documentation: titles, headings and text.`;
      searchInput.setAttribute('aria-expanded', 'false');
      return;
    }
    if (!results.length) {
      searchEmpty.hidden = false;
      searchEmpty.textContent = `Nothing found for “${query.trim()}”.`;
      searchInput.setAttribute('aria-expanded', 'false');
      return;
    }
    searchEmpty.hidden = true;
    searchInput.setAttribute('aria-expanded', 'true');
    results.forEach((result, i) => {
      const { entry } = result.item;
      let heading = null;
      let chunk = null;
      if (result.headingHits.size) {
        const best = Array.from(result.headingHits).sort((a, b) => b[1] - a[1])[0][0];
        heading = entry.headings[best];
      }
      if (result.chunkHits.size) {
        const best = Array.from(result.chunkHits).sort((a, b) => b[1] - a[1])[0][0];
        chunk = entry.chunks[best];
      }
      const targetId = heading ? heading[0] : chunk && chunk[0] ? chunk[0] : null;
      const href = url(entry.url) + (targetId ? `#${targetId}` : '');
      const titleNode = el('span', { class: 'search-result-title' });
      titleNode.innerHTML = markTerms(entry.title, result.terms);
      if (heading) {
        const sub = el('span', { class: 'search-result-heading' });
        sub.innerHTML = ` › ${markTerms(heading[1], result.terms)}`;
        titleNode.append(sub);
      }
      const meta = el(
        'span',
        { class: 'search-result-meta' },
        el('span', { text: entry.section || '' }),
      );
      const mark = levelMark(entry.level, entry.difficulty);
      if (mark)
        meta.append(
          el(
            'span',
            { style: 'display:inline-flex;align-items:center;gap:4px' },
            mark,
            LEVEL_LABELS[entry.level] || '',
          ),
        );
      const snippetSource = chunk ? chunk[1] : entry.description || '';
      const snippet = el('span', { class: 'search-result-snippet' });
      snippet.innerHTML = markTerms(snippetOf(snippetSource, result.terms), result.terms);
      const link = el('a', { href, tabindex: '-1' }, titleNode, meta, snippet);
      link.addEventListener('click', (event) => {
        // A result on this same page: close the dialog, then go there.
        if (entry.id === page.id && targetId) {
          event.preventDefault();
          searchDialog.close();
          const target = doc.getElementById(targetId);
          if (target) target.scrollIntoView({ block: 'start' });
          try {
            history.replaceState(null, '', `#${targetId}`);
          } catch {
            // not important
          }
        }
      });
      searchList.append(
        el(
          'li',
          {
            class: 'search-result',
            role: 'option',
            id: `search-result-${i}`,
            'aria-selected': 'false',
          },
          link,
        ),
      );
    });
    moveSearch(0);
  }

  function moveSearch(to) {
    const items = $$('.search-result', searchList);
    if (!items.length) return;
    searchActive = (to + items.length) % items.length;
    items.forEach((item, i) => {
      const on = i === searchActive;
      item.classList.toggle('is-active', on);
      item.setAttribute('aria-selected', String(on));
    });
    const active = items[searchActive];
    searchInput.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView({ block: 'nearest' });
  }

  function buildSearch() {
    searchInput = el('input', {
      class: 'search-input',
      type: 'search',
      role: 'combobox',
      'aria-expanded': 'false',
      'aria-controls': 'search-results',
      'aria-autocomplete': 'list',
      'aria-label': 'Search the documentation',
      placeholder: 'Search the documentation',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const close = el(
      'button',
      { type: 'button', class: 'icon-btn is-small', 'aria-label': 'Close the search' },
      icon('close'),
    );
    searchList = el('ul', {
      class: 'search-results',
      id: 'search-results',
      role: 'listbox',
      'aria-label': 'Results',
    });
    searchEmpty = el('p', { class: 'search-empty' });
    const hints = el('div', { class: 'search-hints', 'aria-hidden': 'true' });
    hints.innerHTML =
      '<span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span>';
    searchDialog = el(
      'dialog',
      { class: 'search-dialog', 'aria-label': 'Search the documentation' },
      el('div', { class: 'search-field' }, icon('search'), searchInput, close),
      el('div', { class: 'search-body' }, searchList, searchEmpty),
      hints,
    );
    close.addEventListener('click', () => searchDialog.close());
    searchDialog.addEventListener('click', (event) => {
      if (event.target === searchDialog) searchDialog.close();
    });
    searchDialog.addEventListener('close', () => {
      if (searchReturn && searchReturn.isConnected) searchReturn.focus();
    });
    searchInput.addEventListener('input', renderSearch);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        moveSearch(searchActive + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Enter') {
        const items = $$('.search-result a', searchList);
        const target = items[Math.max(searchActive, 0)];
        if (target) {
          event.preventDefault();
          target.click();
          if (!target.defaultPrevented) window.location.href = target.href;
        }
      }
    });
    doc.body.append(searchDialog);
  }

  function openSearch(initial) {
    if (!searchDialog) buildSearch();
    if (searchDialog.open) {
      searchInput.focus();
      return;
    }
    closeDrawer(true);
    searchReturn = doc.activeElement;
    if (typeof searchDialog.showModal === 'function') searchDialog.showModal();
    else searchDialog.setAttribute('open', '');
    if (typeof initial === 'string') searchInput.value = initial;
    renderSearch();
    searchInput.focus();
    searchInput.select();
  }

  function bindKeys() {
    doc.addEventListener('keydown', (event) => {
      const target = event.target;
      const typing =
        target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ''));
      if (
        (event.key === 'k' || event.key === 'K') &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey
      ) {
        event.preventDefault();
        openSearch();
      } else if (
        event.key === '/' &&
        !typing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        openSearch();
      } else if (event.key === 'Escape' && doc.body.classList.contains('nav-open')) {
        closeDrawer();
      }
    });
  }

  // ---- Home page: progress on the learning path ------------------------------------------------

  function homeProgress() {
    for (const card of $$('[data-path-section]')) {
      const section = sections.find((s) => s.id === card.dataset.pathSection);
      if (!section) continue;
      const pages = section.pages || [];
      const read = pages.filter((p) => visited.has(p.id)).length;
      const bar = $('.path-progress', card);
      const text = $('.path-progress-text', card);
      if (bar)
        bar.style.setProperty('--progress', `${pages.length ? (100 * read) / pages.length : 0}%`);
      if (text) text.textContent = `${read}/${pages.length} read`;
    }
  }

  // ---- Short inline code ------------------------------------------------------------------------

  /** A short piece of inline code stays on one line: a browser may break after a hyphen, and a
   * flag such as `-o` or `--fps` was left with its hyphen at the end of a line and its letter on
   * the next. Longer code keeps wrapping, or a narrow page would scroll sideways. */
  const SHORT_CODE = 24;
  function mountShortCode(scope) {
    $$('.doc :not(pre) > code', scope).forEach((node) => {
      if (node.textContent.length <= SHORT_CODE) node.classList.add('is-short');
    });
  }

  // ---- Mounting --------------------------------------------------------------------------------

  /** Mounts every component inside `scope` (the document, or markup a widget added). Each one
   * runs on its own, and an element already mounted is left as it is. */
  function mount(scope) {
    const where = scope || doc;
    safely('themed media', () => mountThemedMedia(where));
    $$('video.mfe-clip', where).forEach((node) => safely('a clip', () => mountClip(node)));
    $$('.mfe-tour[data-mfe-tour]', where).forEach((node) =>
      safely('a tour', () => mountTour(node)),
    );
    $$('[data-mfe-python]', where).forEach((node) =>
      safely('a code block', () => mountPython(node)),
    );
    $$('[data-mfe-example]', where).forEach((node) =>
      safely('an example card', () => mountExample(node)),
    );
    safely('icons', () => mountIcons(where));
    safely('keys', () => mountKeys(where));
    safely('interface labels', () => mountUiLabels(where));
    safely('callouts', () => mountCallouts(where));
    safely('code', () => mountCode(where));
    safely('short code', () => mountShortCode(where));
    safely('tables', () => mountTables(where));
    safely('images', () => mountZoom(where));
    safely('players', () => mountPlayers(where));
    $$('.mfe-widget[data-mfe-widget]', where).forEach((node) =>
      safely('a widget', () => mountWidget(node)),
    );
  }

  window.MFEDocs = {
    /** The address of docs/web/, ending in "/": `MFEDocs.root + 'examples/x.mfe.json'`. */
    root,
    /** `url('media/basics/timeline/x.dark.webp')`: an address from docs/web/. */
    url,
    /** This page: { id, level, difficulty, status }. */
    page,
    /** 'mac', 'windows', 'linux' or 'other'. */
    platform,
    /** The theme the reader sees: 'dark' or 'light'. */
    theme: () => theme,
    /** 'dark' or 'light' (remembered), or 'system'. */
    setTheme,
    /** Calls `fn(theme)` after every change of theme; returns the function that stops it. */
    onTheme,
    reducedMotion,
    /** "Mod+Shift+Z" as this system writes it. */
    formatKeys,
    /** Mounts the components inside an element added after the page loaded. */
    mount,
    /** Shows a small notice in an element (its data is missing) and marks it data-mfe-error. */
    notice,
    version: 1,
  };

  // ---- Start -----------------------------------------------------------------------------------

  let started = false;

  function start() {
    if (started) return;
    started = true;
    main = $('main') || null;
    article = $('article.doc') || null;
    if (!main) {
      console.error('[docs] the page has no <main>');
      return;
    }
    if (!main.id) main.id = 'content';
    // A page of its own that borrows the documentation's components (the project's page,
    // docs/index.html, with <body data-docs-bare>): the theme and the components alone, none of
    // the documentation around them.
    const bare = doc.body.hasAttribute('data-docs-bare');
    if (!bare) {
      safely('the navigation', readNav);
      safely('demos', captureDemos);
      safely('the header', buildHeader);
      safely('the sidebar', buildSidebar);
      doc.body.append(scrim);
      safely('the breadcrumbs', buildBreadcrumbs);
      safely('the page head', buildPageHead);
      safely('the anchors', buildAnchors);
      safely('the contents of the page', buildToc);
      safely('previous and next', buildPager);
      safely('the footer', buildFooter);
    }
    mount(doc);
    if (!bare) {
      safely('the learning path', homeProgress);
      safely('the keys', bindKeys);
    }
    // The browser scrolled to the #anchor before the header existed: once more, now.
    if (window.location.hash.length > 1) {
      const target = doc.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (target) {
        const details = target.closest('details');
        if (details) details.open = true;
        requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
      }
    }
    doc.documentElement.setAttribute('data-docs-ready', '');
  }

  if (doc.readyState === 'complete') start();
  else {
    doc.addEventListener('DOMContentLoaded', start, { once: true });
    window.addEventListener('load', start, { once: true });
  }
})();
