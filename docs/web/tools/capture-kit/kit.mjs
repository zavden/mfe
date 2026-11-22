/* The kit that the steps of a capture file receive, `(page, kit) => …`: the app's own handles
 * (`window.__mfe`, its modules), targets named the way the app's e2e specs name them, a mouse
 * that a viewer can follow, keys shown on screen, menus by their labels, highlights, and the
 * settling that comes before every image. CAPTURES.md lists every function with an example.
 *
 * A target is one of:
 *   'panel-timeline'                  a data-testid (letters, digits, `-` and `_` only)
 *   '.tl-toolbar', '[role="menu"]'    any other string: a CSS selector
 *   { testId }, { css }, { text }, { role, name }
 *   { clip: 'divide_by_a', index?, at? }   the timeline clip of a formula, by the formula's name
 *   { track: 'Notes' }                the lane of a track, by its name
 *   { union: [target, …] }            the box around several targets
 *   { x, y, width, height }           a rectangle of the viewport (CSS px)
 *   { x, y }                          a point; { dx, dy }: that far from the pointer
 *   a Playwright Locator, or (page, kit) => one of the above
 *
 * While a clip records (`kit.recording`), the pointer glides at a pace a viewer can follow and
 * keys stay down long enough to be read; otherwise the same calls run at once. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject, waitForRenders, waitForTransitions } from '../lib/browser.mjs';
import { REPO } from '../lib/paths.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

const TEST_ID = /^[\w-]+$/;

/** A key as the keyboard of this system presses it. */
const resolveKey = (key) =>
  key === 'ControlOrMeta' ? (process.platform === 'darwin' ? 'Meta' : 'Control') : key;

/** Splits a menu path written as the docs write it: 'Edit ▸ Align ▸ Left' (or with '>'). */
export function menuPath(path) {
  return (Array.isArray(path) ? path : path.split(/\s*[▸>]\s*/)).map((part) => part.trim());
}

function escapeAttr(text) {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export class Kit {
  /** `options`: { page, theme, recording, readProject(path) → text, warn(message) } */
  constructor({ page, theme, recording = false, readProject, warn = console.warn }) {
    /** The Playwright page of the app. */
    this.page = page;
    /** 'dark' or 'light': the theme this pass captures. */
    this.theme = theme;
    /** Whether a clip is recording now (the pace of the pointer and the keys). */
    this.recording = recording;
    /** The area being captured (viewport CSS px), once the tool knows it: highlights stay in it. */
    this.crop = null;
    /** The ratio by which a page shrinks the image (overlay sizes are multiplied by it). */
    this.displayScale = 1;
    /** Where the pointer is (CSS px of the viewport). */
    this.mouse = { x: 0, y: 0 };
    this.readProject = readProject;
    this.warn = warn;
    this.menu = null;
    this.held = [];
  }

  // ---- the app ----

  /** Runs `fn(mfe, arg)` in the page with the app's dev handle (`window.__mfe`, see
   * app/src/devtools.ts); returns what it returns (serialisable). */
  async mfe(fn, arg) {
    const handle = await this.page.evaluateHandle(() => window.__mfe);
    try {
      return await handle.evaluate(fn, arg);
    } finally {
      await handle.dispose();
    }
  }

  /** `page.evaluate(fn, arg)`. */
  evaluate(fn, arg) {
    return this.page.evaluate(fn, arg);
  }

  /** Runs `fn(module, arg)` on a module of the app (`'/src/ui/help/shortcutSheet.ts'`), the very
   * instance the app uses; returns what it returns (serialisable). */
  async app(path, fn = (module) => module, arg) {
    const handle = await this.page.evaluateHandle((source) => import(source), path);
    try {
      return await handle.evaluate(fn, arg);
    } finally {
      await handle.dispose();
    }
  }

  /** Opens a project (a path of the repository, as in the item's `project`). */
  async loadProject(path) {
    await loadProject(this.page, this.readProject(path));
    await this.waitForRenders();
  }

  /** Waits until every formula has rendered; warns about those that failed. */
  async waitForRenders() {
    const failed = await waitForRenders(this.page);
    for (const formula of failed) {
      this.warn(`formula ${formula.name} did not render: ${formula.error}`);
    }
    return failed;
  }

  /** What comes before every image: renders done, fonts loaded, CSS transitions and finite
   * animations over, two frames painted. */
  async settle({ renders = true } = {}) {
    if (renders) await this.waitForRenders();
    await this.page.evaluate(() => document.fonts.ready.then(() => undefined));
    await waitForTransitions(this.page).catch(() => this.warn('a CSS transition did not end'));
    await this.page
      .waitForFunction(
        () =>
          document
            .getAnimations()
            .every(
              (animation) =>
                !(animation instanceof CSSAnimation) ||
                animation.playState !== 'running' ||
                animation.effect?.getComputedTiming().iterations === Infinity,
            ),
        null,
        { timeout: 3_000 },
      )
      .catch(() => this.warn('a CSS animation did not end'));
    await this.page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  }

  /** Puts the playhead at `t` seconds (as the ruler would) and waits for the preview. */
  async seek(t) {
    await this.mfe((mfe, time) => mfe.useUiStore.getState().setTime(time), t);
    await this.settle({ renders: false });
  }

  /** Sets editor preferences (`window.__mfe.usePreferences`; app/src/ui/preferences.ts). They
   * live in this capture's browser only. */
  async setPreference(patch) {
    await this.mfe((mfe, value) => mfe.usePreferences.getState().set(value), patch);
  }

  /** The formula named `name`: `{ id, name, kind, source }`. */
  async formula(name) {
    const found = await this.mfe((mfe, wanted) => {
      const formula = mfe.useProjectStore
        .getState()
        .project.formulas.find((f) => f.name === wanted);
      return formula
        ? { id: formula.id, name: formula.name, kind: formula.kind, source: formula.source }
        : null;
    }, name);
    if (!found) throw new Error(`no formula named ${name} in the project`);
    return found;
  }

  /** The id of a clip of the formula named `name`: the `index`-th by start time, or the one under
   * the time `at`. */
  async clipId(name, { index = 0, at } = {}) {
    const formula = await this.formula(name);
    const clips = await this.mfe(
      (mfe, id) =>
        mfe.useProjectStore
          .getState()
          .project.clips.filter((clip) => clip.formulaId === id)
          .map((clip) => ({ id: clip.id, start: clip.start, end: clip.end }))
          .sort((a, b) => a.start - b.start),
      formula.id,
    );
    const clip = at === undefined ? clips[index] : clips.find((c) => c.start <= at && at < c.end);
    if (!clip)
      throw new Error(`no clip of ${name}${at === undefined ? ` (#${index})` : ` at ${at} s`}`);
    return clip.id;
  }

  /** The id of the track named `name`. */
  async trackId(name) {
    const id = await this.mfe(
      (mfe, wanted) =>
        mfe.useProjectStore.getState().project.tracks.find((t) => t.name === wanted)?.id,
      name,
    );
    if (!id) throw new Error(`no track named ${name}`);
    return id;
  }

  /** Selects clips of formulas by name (as a click on the timeline would select them), without
   * moving the pointer. `names`: a name, or names; `options` as `clipId`'s. */
  async selectClip(names, options = {}) {
    const ids = [];
    for (const name of [names].flat()) ids.push(await this.clipId(name, options));
    await this.mfe(
      (mfe, value) => mfe.useUiStore.getState().select({ kind: 'clips', ids: value }),
      ids,
    );
    await this.settle({ renders: false });
    return ids;
  }

  /** Selects a formula of the Creator by name, without moving the pointer. */
  async selectFormula(name) {
    const { id } = await this.formula(name);
    await this.mfe(
      (mfe, value) => mfe.useUiStore.getState().select({ kind: 'formula', id: value }),
      id,
    );
    await this.settle({ renders: false });
  }

  async clearSelection() {
    await this.mfe((mfe) => mfe.useUiStore.getState().select({ kind: 'none' }));
    await this.settle({ renders: false });
  }

  /** The timeline's zoom: CSS px per second (80 by default). */
  pxPerSecond() {
    return this.app(
      '/src/ui/timeline/timelineStore.ts',
      (m) => m.useTimelineStore.getState().pxPerSecond,
    );
  }

  /** The x of time `t` on the timeline (CSS px of the viewport), at its zoom and scroll. */
  async timeToX(t) {
    const ruler = await this.box('timeline-ruler');
    return ruler.x + t * (await this.pxPerSecond());
  }

  // ---- targets ----

  /** A Locator for a target that is an element. */
  async locate(target) {
    if (typeof target === 'function') return this.locate(await target(this.page, this));
    if (target && typeof target.boundingBox === 'function') return target;
    if (typeof target === 'string') {
      return TEST_ID.test(target) ? this.page.getByTestId(target) : this.page.locator(target);
    }
    if (target?.testId) return this.page.getByTestId(target.testId);
    if (target?.css) return this.page.locator(target.css);
    if (target?.text) return this.page.getByText(target.text, { exact: target.exact ?? true });
    if (target?.role)
      return this.page.getByRole(target.role, { name: target.name, exact: target.exact ?? true });
    if (target?.clip)
      return this.page.getByTestId(`clip-${await this.clipId(target.clip, target)}`);
    if (target?.track)
      return this.page.getByTestId(`track-lane-${await this.trackId(target.track)}`);
    throw new Error(`not an element target: ${JSON.stringify(target)}`);
  }

  /** The box of a target (viewport CSS px), grown by `pad` (a number, or { top, right, bottom,
   * left }); `radius` is the element's own corner radius (0 for a rectangle). */
  async box(target, { pad = 0, timeout = 10_000 } = {}) {
    let box;
    if (typeof target === 'function')
      return this.box(await target(this.page, this), { pad, timeout });
    if (target?.union) {
      const boxes = [];
      for (const part of target.union) boxes.push(await this.box(part, { timeout }));
      const left = Math.min(...boxes.map((b) => b.x));
      const top = Math.min(...boxes.map((b) => b.y));
      const right = Math.max(...boxes.map((b) => b.x + b.width));
      const bottom = Math.max(...boxes.map((b) => b.y + b.height));
      box = { x: left, y: top, width: right - left, height: bottom - top, radius: 0 };
    } else if (
      target &&
      typeof target === 'object' &&
      'x' in target &&
      'y' in target &&
      typeof target.boundingBox !== 'function'
    ) {
      box = {
        x: target.x,
        y: target.y,
        width: target.width ?? 0,
        height: target.height ?? 0,
        radius: 0,
      };
    } else if (target && typeof target === 'object' && ('dx' in target || 'dy' in target)) {
      box = {
        x: this.mouse.x + (target.dx ?? 0),
        y: this.mouse.y + (target.dy ?? 0),
        width: 0,
        height: 0,
        radius: 0,
      };
    } else {
      const locator = (await this.locate(target)).first();
      await locator.waitFor({ state: 'visible', timeout });
      const found = await locator.boundingBox();
      if (!found) throw new Error(`no box for ${JSON.stringify(target)}`);
      const radius = await locator.evaluate(
        (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
      );
      box = { ...found, radius };
    }
    const p =
      typeof pad === 'number'
        ? { top: pad, right: pad, bottom: pad, left: pad }
        : { top: 0, right: 0, bottom: 0, left: 0, ...pad };
    return {
      x: box.x - p.left,
      y: box.y - p.top,
      width: box.width + p.left + p.right,
      height: box.height + p.top + p.bottom,
      radius: box.radius,
    };
  }

  /** A point of a target: its centre, or `position` ({ x, y } from its top-left corner), moved by
   * `offset` ({ x, y }). */
  async point(target, { position, offset } = {}) {
    // A clip later than the timeline shows, or under its track headers, is brought into view
    // first: a point out of sight would press something else.
    if (target && typeof target === 'object' && 'clip' in target) await this.reveal(target);
    const box = await this.box(target);
    const x = position ? box.x + position.x : box.x + box.width / 2;
    const y = position ? box.y + position.y : box.y + box.height / 2;
    return { x: x + (offset?.x ?? 0), y: y + (offset?.y ?? 0) };
  }

  // ---- waiting and scrolling ----

  /** Waits until a target is `state` — 'visible' (by default), 'hidden', 'attached' or
   * 'detached' (a dialog closed) — and, with `has`, until it has those attributes
   * (`{ 'data-state': 'ok' }`; `true` for an attribute that only has to be there). The first
   * element that matches is waited for. Returns its Locator. */
  async waitFor(target, { state = 'visible', has, timeout = 10_000 } = {}) {
    const locator = (await this.locate(target)).first();
    await locator.waitFor({ state, timeout });
    if (has && state !== 'detached' && state !== 'hidden') {
      await locator
        .evaluate(
          (element, { wanted, timeout }) =>
            new Promise((resolve, reject) => {
              const ok = () =>
                Object.entries(wanted).every(([name, value]) =>
                  value === true
                    ? element.hasAttribute(name)
                    : element.getAttribute(name) === String(value),
                );
              if (ok()) return resolve();
              const observer = new MutationObserver(() => {
                if (!ok()) return;
                observer.disconnect();
                clearTimeout(timer);
                resolve();
              });
              observer.observe(element, { attributes: true });
              const timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error('timeout'));
              }, timeout);
            }),
          { wanted: has, timeout },
        )
        .catch(() => {
          throw new Error(
            `kit.waitFor: ${JSON.stringify(target)} did not get ${JSON.stringify(has)} in ` +
              `${timeout / 1000} s`,
          );
        });
    }
    return locator;
  }

  /** Waits until `fn(mfe, arg)` — run in the page with the app's dev handle, as `kit.mfe` — is
   * true: a condition on the app's stores (`(mfe) => mfe.useProjectStore.getState().project
   * .audioClips.length === 1`) or on the page (`() => document.querySelector(…)?.disabled`).
   * Returns its last value. */
  async until(fn, arg, { timeout = 10_000, every = 100 } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const value = await this.mfe(fn, arg);
      if (value) return value;
      if (Date.now() > deadline) {
        const source = String(fn).replace(/\s+/g, ' ').slice(0, 120);
        throw new Error(`kit.until: still false after ${timeout / 1000} s: ${source}`);
      }
      await sleep(every);
    }
  }

  /** Scrolls the panel that holds a target until the target's top is at the panel's top, below
   * what sticks there (the header of the Animations panel): `kit.scrollTo('initial-section')`.
   * `block`: 'start' (by default), 'center', 'end' or 'nearest'; `margin`: CSS px left above it. */
  async scrollTo(target, { block = 'start', margin = 6 } = {}) {
    const locator = (await this.locate(target)).first();
    await locator.waitFor({ state: 'attached' });
    await locator.evaluate(
      (element, { block, margin }) => {
        element.scrollIntoView({ block, inline: 'nearest' });
        if (block !== 'start') return;
        let scroller = element.parentElement;
        while (
          scroller &&
          !(
            scroller.scrollHeight > scroller.clientHeight &&
            /(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
          )
        ) {
          scroller = scroller.parentElement;
        }
        if (!scroller) return;
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + Math.min(box.width / 2, 40), box.top + 1);
        let cover = null;
        for (let node = hit; node && node !== scroller; node = node.parentElement) {
          if (element.contains(node) || node.contains(element)) break;
          if (getComputedStyle(node).position === 'sticky') cover = node;
        }
        const covered = cover ? cover.getBoundingClientRect().bottom - box.top : 0;
        scroller.scrollTop -= covered + margin;
      },
      { block, margin },
    );
    await this.settle({ renders: false });
  }

  /** Brings a target into view, only if it is not: when its centre lies outside a panel that
   * scrolls it (a clip later than the timeline shows) or under something stuck to that panel's
   * edge (the track headers), its panels scroll to centre it. A `{ clip }` target is revealed
   * this way by every pointer call. Returns whether anything scrolled. */
  async reveal(target) {
    const locator = (await this.locate(target)).first();
    await locator.waitFor({ state: 'attached' });
    const moved = await locator.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      // Whether the centre is within each panel that scrolls the target, axis by axis: a panel
      // scrolls only along the axis where the target is out of sight.
      let inX = x >= 0 && x <= innerWidth;
      let inY = y >= 0 && y <= innerHeight;
      for (let node = element.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const r = node.getBoundingClientRect();
        if (/(auto|scroll|hidden)/.test(style.overflowX) && node.scrollWidth > node.clientWidth) {
          const left = r.left + node.clientLeft;
          inX &&= x >= left && x <= left + node.clientWidth;
        }
        if (/(auto|scroll|hidden)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
          const top = r.top + node.clientTop;
          inY &&= y >= top && y <= top + node.clientHeight;
        }
      }
      if (inX && inY) {
        // Something stuck to a panel's edge (a header that stays while the rest scrolls) may
        // lie over it: then it goes to the middle along both axes.
        const hit = document.elementFromPoint(x, y);
        let covered = false;
        for (let node = hit; node && node !== document.body; node = node.parentElement) {
          if (element.contains(node) || node.contains(element)) break;
          if (getComputedStyle(node).position === 'sticky') covered = true;
        }
        if (!covered) return false;
        inX = false;
        inY = false;
      }
      element.scrollIntoView({
        block: inY ? 'nearest' : 'center',
        inline: inX ? 'nearest' : 'center',
      });
      return true;
    });
    if (moved) await this.settle({ renders: false });
    return moved;
  }

  // ---- the preview ----

  /** The page point of a point of the scene (Manim units, y up), in the Preview as it shows it
   * now (Fit, or zoomed and moved). */
  async scenePoint([x, y]) {
    const canvas = await this.box('preview-canvas');
    const view = await this.page
      .getByTestId('preview-frame')
      .first()
      .evaluate((element) => ({
        zoom: Number(element.dataset.zoom) || 1,
        center: (element.dataset.center ?? '0,0').split(',').map(Number),
      }));
    const aspect = await this.mfe((mfe) => {
      const { meta } = mfe.useProjectStore.getState().project;
      return meta.width / meta.height;
    });
    const ux = (canvas.width / (8 * aspect)) * view.zoom;
    const uy = (canvas.height / 8) * view.zoom;
    return {
      x: canvas.x + canvas.width / 2 + (x - view.center[0]) * ux,
      y: canvas.y + canvas.height / 2 - (y - view.center[1]) * uy,
    };
  }

  /** Where the formula `name` is drawn in the Preview at the playhead: `{ x, y }` of the centre
   * of its whole box, or of its glyph `glyph` (the glyph's canonical index, as the Alt pick and
   * the relation editor count). `index`/`at` choose the clip, as in `clipId`; it has to be on
   * screen at the playhead (seek first). A press there hits the formula or that glyph — unless
   * a relation has handed the glyph to another formula by then (it is not drawn there). */
  async glyphPoint(name, glyph = null, { index, at } = {}) {
    const clipId = await this.clipId(name, { index, at });
    const box = await this.app(
      '/src/ui/preview/geometry.ts',
      (m, { id, glyph }) => {
        const geometry = m.geometryNow().get(id);
        if (!geometry) return { error: 'not on screen at the playhead' };
        const found = glyph === null ? geometry.box : geometry.glyphs.get(glyph);
        return found ?? { error: `has no glyph ${glyph}` };
      },
      { id: clipId, glyph },
    );
    if (box.error) throw new Error(`the clip of ${name}: ${box.error}`);
    return this.scenePoint([(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2]);
  }

  /** The centre of the formula `name` in the Preview at the playhead (`glyphPoint` without a
   * glyph). */
  formulaPoint(name, options = {}) {
    return this.glyphPoint(name, null, options);
  }

  // ---- the pointer ----

  async #glide(to, { duration, easing = easeInOutCubic } = {}) {
    const from = this.mouse;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    if (!this.recording) {
      // At once, with a few moves between: drags need them to start and to snap.
      const steps = Math.max(1, Math.min(25, Math.round(distance / 24)));
      await this.page.mouse.move(to.x, to.y, { steps });
    } else if (distance > 0) {
      const ms = duration ?? Math.min(1100, 260 + distance * 0.6);
      const frames = Math.max(1, Math.round(ms / 16));
      const start = Date.now();
      for (let i = 1; i <= frames; i += 1) {
        const t = easing(i / frames);
        await this.page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
        const wait = start + (i * ms) / frames - Date.now();
        if (wait > 0) await sleep(wait);
      }
    }
    this.mouse = { x: to.x, y: to.y };
  }

  /** Moves the pointer to a target (its centre, or `position`/`offset` as in `point`), in
   * `duration` ms when recording (by default, by the distance). */
  async move(target, { duration, position, offset } = {}) {
    await this.#glide(await this.point(target, { position, offset }), { duration });
  }

  /** Moves to a target and rests there (`pause` ms): what shows a hover. */
  async hover(target, { pause = this.recording ? 450 : 200, ...options } = {}) {
    await this.move(target, options);
    await sleep(pause);
  }

  async mouseDown({ button = 'left' } = {}) {
    await this.page.mouse.down({ button });
    if (this.recording) await sleep(120);
  }

  async mouseUp({ button = 'left' } = {}) {
    await this.page.mouse.up({ button });
    if (this.recording) await sleep(90);
  }

  /** Clicks a target. `button`: 'left' | 'right' | 'middle'; `hold`: keys held through the click
   * ('Shift', 'Alt', 'ControlOrMeta'); `after`: the pause that follows, when recording. */
  async click(target, { button = 'left', hold = [], after, ...options } = {}) {
    await this.move(target, options);
    for (const key of hold) await this.down(key);
    await this.page.mouse.down({ button });
    if (this.recording) await sleep(110);
    await this.page.mouse.up({ button });
    for (const key of [...hold].reverse()) await this.up(key);
    await sleep(this.recording ? (after ?? 280) : 30);
  }

  rightClick(target, options = {}) {
    return this.click(target, { ...options, button: 'right' });
  }

  async doubleClick(target, { after, ...options } = {}) {
    await this.move(target, options);
    await this.page.mouse.dblclick(this.mouse.x, this.mouse.y);
    await sleep(this.recording ? (after ?? 320) : 30);
  }

  /** Presses on `from`, glides through `via` to `to`, releases (unless `release: false`).
   * `hold`: keys pressed before the button (Alt on the timeline frees the edges);
   * `holdAfterPress`: keys pressed once the button is down (Shift suspends snapping). A native
   * drag (HTML5 drag and drop: a card of the Creator onto a track) is performed the same way;
   * the drawn pointer follows it (overlay.mjs listens to the drag events). */
  async drag(
    from,
    to,
    { via = [], hold = [], holdAfterPress = [], duration, release = true } = {},
  ) {
    await this.move(from);
    for (const key of hold) await this.down(key);
    await this.page.mouse.down();
    if (this.recording) await sleep(180);
    for (const key of holdAfterPress) await this.down(key);
    for (const point of [...via, to]) {
      await this.#glide(await this.point(point), { duration, easing: easeInOutSine });
    }
    if (release) {
      if (this.recording) await sleep(200);
      await this.page.mouse.up();
      for (const key of [...holdAfterPress, ...hold].reverse()) await this.up(key);
      if (this.recording) await sleep(250);
    }
  }

  /** Turns the wheel by `deltaY` (and `deltaX`) over `at` (where the pointer is, by default),
   * with `hold` keys held ('ControlOrMeta' zooms). */
  async wheel(deltaY, { deltaX = 0, at, hold = [], times = 1 } = {}) {
    if (at) await this.move(at);
    for (const key of hold) await this.down(key);
    for (let i = 0; i < times; i += 1) {
      await this.page.mouse.wheel(deltaX, deltaY);
      await sleep(this.recording ? 140 : 40);
    }
    for (const key of [...hold].reverse()) await this.up(key);
    await this.settle({ renders: false });
  }

  // ---- keys ----

  /** Presses keys as Playwright writes them: 'ControlOrMeta+Z', 'Alt+G', 'Escape', 'Shift+C'.
   * While recording they stay down a moment and the overlay shows them. */
  async press(keys, { after } = {}) {
    await this.page.keyboard.press(keys, { delay: this.recording ? 180 : 0 });
    await sleep(this.recording ? (after ?? 420) : 30);
  }

  /** Holds a key down ('Shift', 'Alt', 'ControlOrMeta', …) until `up`. 'ControlOrMeta' is ⌘ on a
   * Mac and Ctrl elsewhere, as the app takes it (and as the e2e specs press it). */
  async down(key) {
    await this.page.keyboard.down(resolveKey(key));
    this.held.push(key);
    if (this.recording) await sleep(160);
  }

  async up(key) {
    await this.page.keyboard.up(resolveKey(key));
    this.held = this.held.filter((held) => held !== key);
    if (this.recording) await sleep(90);
  }

  /** Types text into the focused field. The keys overlay stays quiet (the text shows itself)
   * unless `showKeys`. */
  async type(text, { delay = 55, showKeys = false } = {}) {
    const overlay = await this.page.evaluate(() => Boolean(window.__mfeCapture));
    if (overlay && !showKeys) await this.page.evaluate(() => window.__mfeCapture.showKeys(false));
    await this.page.keyboard.type(text, { delay: this.recording ? delay : 0 });
    if (overlay && !showKeys && this.recording) {
      await this.page.evaluate(() => window.__mfeCapture.showKeys(true));
    }
  }

  /** Shows `label` as a key cap for a moment, for what no key says by itself. */
  async tap(label, { linger = 1200 } = {}) {
    await this.page.evaluate(({ label, linger }) => window.__mfeCapture?.tap(label, linger), {
      label,
      linger,
    });
  }

  /** Waits `ms` milliseconds. */
  async pause(ms) {
    await sleep(ms);
  }

  // ---- menus ----

  /** A Locator that keeps naming the menu `menu` names now. A context menu's submenus are
   * `.ctx-menu` panels too, so `.ctx-menu` last means the menu until a submenu opens, then the
   * submenu: a menu is pinned by its role, its name (`aria-label`) and, for a context menu, the
   * id its panels share (`data-ctx-root`). */
  async #pin(menu) {
    const id = await menu
      .evaluate((element) => ({
        label: element.getAttribute('aria-label'),
        root: element.getAttribute('data-ctx-root'),
      }))
      .catch(() => null);
    if (!id?.label) return menu;
    const root = id.root ? `[data-ctx-root="${escapeAttr(id.root)}"]` : '';
    return this.page.locator(`[role="menu"][aria-label="${escapeAttr(id.label)}"]${root}`).last();
  }

  /** The labels of the entries of an open menu (its own, not its submenus'). */
  async #entries(menu) {
    return menu.evaluate((element) =>
      [...element.querySelectorAll('[role^="menuitem"]')]
        .filter((entry) => entry.closest('[role="menu"]') === element)
        .map((entry) => {
          const box = entry.getBoundingClientRect();
          // The label alone: not the chevron of a submenu (▸ in the menu bar, › in a context
          // menu), nor the shortcut, nor the hint after it (`.ctx-hint`), nor what leads it (an
          // icon, the ✓ of a ticked box); a swatch has its name only in its aria-label.
          const copy = entry.cloneNode(true);
          copy
            .querySelectorAll(
              '.menu-shortcut, .menu-chevron, .ctx-chevron, .ctx-hint, .menu-icon, .ctx-icon',
            )
            .forEach((n) => n.remove());
          const text = copy.querySelector('.menu-label')?.textContent ?? copy.textContent;
          const label = text.replace(/[▸›]\s*$/, '').trim() || entry.getAttribute('aria-label');
          return {
            label: label ?? '',
            full: entry.textContent.replace(/[▸›]\s*$/, '').trim(),
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
            disabled: entry.disabled === true,
            submenu: entry.getAttribute('aria-haspopup') === 'menu',
          };
        }),
    );
  }

  /** Brings the pointer into an open menu the way a hand does — straight across from the entry
   * that opened it — so that it crosses no other entry of the menu before (one with a submenu
   * would open it and close the one wanted). */
  async #intoMenu(menu) {
    const panel = await menu.boundingBox();
    if (!panel) return;
    const { x, y } = this.mouse;
    const inset = 10;
    const inside =
      x > panel.x && x < panel.x + panel.width && y > panel.y && y < panel.y + panel.height;
    if (inside) return;
    await this.#glide({
      x: Math.min(Math.max(x, panel.x + inset), panel.x + panel.width - inset),
      y: Math.min(Math.max(y, panel.y + inset), panel.y + panel.height - inset),
    });
  }

  /** The entry of the open menu whose label is `label` (or starts with it). */
  async menuEntry(label, menu = this.menu) {
    if (!menu) throw new Error('no menu is open');
    const entries = await this.#entries(menu);
    const entry =
      entries.find((e) => e.label === label) ??
      entries.find((e) => e.label.startsWith(label)) ??
      entries.find((e) => e.full === label);
    if (!entry) {
      throw new Error(
        `no entry "${label}" in the menu: ${entries.map((e) => e.label).join(' | ')}`,
      );
    }
    return entry;
  }

  /** The button of the menu bar that opens the menu named `top`: its button, and for 'Export' the
   * arrow of the Export… button (the bar has no Export menu of its own: that arrow lists every
   * export, in a menu called Export). */
  #barButton(top) {
    const bar = this.page.getByTestId('menu-bar');
    if (top === 'Export') return bar.getByTestId('export-button-menu');
    return bar.getByRole('menuitem', { name: top, exact: true });
  }

  /** Opens a menu of the menu bar, and the submenus of a path: 'Edit', 'Edit ▸ Align'; 'Export'
   * is the arrow of the Export… button. Returns the menu last opened (a Locator). */
  async openMenu(path) {
    const [top, ...rest] = menuPath(path);
    const button = this.#barButton(top);
    const already = (await button.getAttribute('aria-expanded')) === 'true';
    if (!already) await this.click(button);
    this.menu = this.page.locator(`.menu-popup[aria-label="${escapeAttr(top)}"]`).first();
    await this.menu.waitFor({ state: 'visible' });
    for (const label of rest) await this.openSubmenu(label);
    return this.menu;
  }

  /** Opens the submenu behind an entry of the open menu (a menu bar's or a context menu's), as
   * the pointer does: it rests on the entry. */
  async openSubmenu(label) {
    const entry = await this.menuEntry(label);
    await this.#intoMenu(this.menu);
    await this.hover(entry.box, { pause: this.recording ? 300 : 80 });
    const parent = await this.#pin(this.menu);
    const root = await parent.getAttribute('data-ctx-root').catch(() => null);
    const sameRoot = root ? `[data-ctx-root="${escapeAttr(root)}"]` : '';
    this.menu = this.page
      .locator(`[role="menu"][aria-label="${escapeAttr(entry.label)}"]${sameRoot}`)
      .last();
    await this.menu.waitFor({ state: 'visible' });
    return this.menu;
  }

  /** Clicks the entry `label` of the open menu; with a path ('View ▸ Theme ▸ Light'), opens
   * the menus before it first. */
  async choose(path) {
    const parts = menuPath(path);
    if (parts.length > 1) {
      const isBar = await this.#barButton(parts[0]).count();
      if (isBar) await this.openMenu(parts.slice(0, -1));
      else for (const label of parts.slice(0, -1)) await this.openSubmenu(label);
    }
    const entry = await this.menuEntry(parts[parts.length - 1]);
    await this.#intoMenu(this.menu);
    await this.click(entry.box);
    this.menu = null;
  }

  /** Opens the context menu of a target (a right click on it). Returns the menu. */
  async contextMenu(target, options = {}) {
    await this.rightClick(target, options);
    const menu = this.page.locator('.ctx-menu').last();
    await menu.waitFor({ state: 'visible' });
    await this.page.waitForFunction(() => {
      const menus = document.querySelectorAll('.ctx-menu');
      const menu = menus[menus.length - 1];
      return menu && getComputedStyle(menu).visibility === 'visible';
    });
    this.menu = await this.#pin(menu);
    return this.menu;
  }

  /** Reads an open menu (of the menu bar, or a context menu) as data: its entries in order —
   * `{ type: 'item' | 'submenu', testId, label, hint, note, title, shortcut, disabled, role,
   * checked, swatch, icon, items }`, `{ type: 'separator' }` and `{ type: 'header', label }` —
   * opening each submenu that is not disabled, as the pointer does, to read it too (`deep: false`
   * does not). `hint` is the grey text after a label (`.ctx-hint`), `note` the line under an
   * entry that says more about it (`ctx-note`), `title` its tooltip. */
  async readMenu(menu = this.menu, { deep = true } = {}) {
    if (!menu) throw new Error('no menu is open');
    menu = await this.#pin(menu);
    const entries = await menu.evaluate((element) => {
      const hex = (color) => {
        const parts = color.match(/[\d.]+/g);
        if (!parts || parts.length < 3) return null;
        return `#${parts
          .slice(0, 3)
          .map((v) => Math.round(Number(v)).toString(16).padStart(2, '0'))
          .join('')}`;
      };
      const out = [];
      const nodes = element.querySelectorAll(
        '[role^="menuitem"], [role="separator"], hr, .ctx-header',
      );
      for (const node of nodes) {
        if (node.closest('[role="menu"]') !== element) continue;
        if (node.matches('[role="separator"], hr')) {
          out.push({ type: 'separator' });
          continue;
        }
        if (node.matches('.ctx-header')) {
          out.push({ type: 'header', label: node.textContent.trim() });
          continue;
        }
        const submenu = node.getAttribute('aria-haspopup') === 'menu';
        const shortcut = node.querySelector('.menu-shortcut:not(.menu-chevron)');
        const swatch = node.querySelector('.menu-swatch');
        const box = node.getBoundingClientRect();
        // The label alone: not the chevron of a submenu (▸, ›), nor the shortcut, nor the hint
        // after it, nor what leads it (an icon, or the ✓ of a ticked box: `checked` says that);
        // a swatch has its name only in its aria-label.
        const copy = node.cloneNode(true);
        copy
          .querySelectorAll(
            '.menu-shortcut, .menu-chevron, .ctx-chevron, .ctx-hint, .menu-icon, .ctx-icon',
          )
          .forEach((n) => n.remove());
        const text = copy.querySelector('.menu-label')?.textContent ?? copy.textContent;
        const hint = node.querySelector('.ctx-hint')?.textContent.trim() || null;
        const noteId = node.getAttribute('aria-describedby');
        const note = noteId ? document.getElementById(noteId)?.textContent.trim() || null : null;
        out.push({
          type: submenu ? 'submenu' : 'item',
          testId: node.dataset.testid ?? null,
          label: text.replace(/[▸›]\s*$/, '').trim() || node.getAttribute('aria-label') || '',
          hint,
          note,
          title: node.getAttribute('title'),
          shortcut: shortcut?.textContent.trim() || null,
          disabled: node.disabled === true,
          role: node.getAttribute('role'),
          checked: node.hasAttribute('aria-checked')
            ? node.getAttribute('aria-checked') === 'true'
            : null,
          swatch: swatch ? hex(getComputedStyle(swatch).backgroundColor) : null,
          icon: Boolean(node.querySelector('.menu-icon, .ctx-icon')),
          box: { x: box.x, y: box.y, width: box.width, height: box.height },
        });
      }
      return out;
    });
    for (const entry of entries) {
      if (entry.type === 'submenu') {
        entry.items = null;
        if (deep && !entry.disabled) {
          this.menu = menu;
          entry.items = await this.readMenu(await this.openSubmenu(entry.label), { deep });
        }
      }
      delete entry.box;
    }
    this.menu = menu;
    return entries;
  }

  /** Closes every open menu (Escape, as often as needed). */
  async closeMenus() {
    for (let i = 0; i < 5; i += 1) {
      const open = await this.page.locator('[role="menu"]').count();
      if (open === 0) break;
      await this.page.keyboard.press('Escape');
      await sleep(60);
    }
    this.menu = null;
  }

  // ---- highlights ----

  /** Draws rings round targets, kept inside the captured area. `targets`: targets, or
   * `{ target, label, markerAt, pad }` — `label` puts a numbered marker on the ring (at its
   * `markerAt` corner: 'top-left' by default, 'top-right', 'bottom-left', 'bottom-right',
   * 'top', 'bottom', 'left', 'right'). */
  async highlight(targets, { bounds } = {}) {
    const items = [];
    for (const entry of [targets].flat()) {
      const spec =
        entry && typeof entry === 'object' && 'target' in entry ? entry : { target: entry };
      const box = await this.box(spec.target, { pad: spec.pad ?? 0 });
      items.push({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        radius: spec.radius ?? (box.radius || 8),
        label: spec.label ?? null,
        markerAt: spec.markerAt ?? 'top-left',
      });
    }
    const viewport = this.page.viewportSize();
    const area = bounds ??
      this.crop ?? { x: 0, y: 0, width: viewport.width, height: viewport.height };
    await this.page.evaluate(
      ({ items, area, scale }) => {
        window.__mfeCapture.setScale(scale);
        window.__mfeCapture.highlight(items, area);
      },
      { items, area, scale: this.displayScale },
    );
  }

  async clearHighlight() {
    await this.page.evaluate(() => window.__mfeCapture?.clearHighlights());
  }
}

/** Reads a project for an item: a path of the repository, either an example git tracks in
 * `examples/` (the owner keeps untracked files of their own there) or one of
 * `docs/web/examples/`. */
export function projectReader(trackedExamples) {
  return (path) => {
    const normal = path.split('\\').join('/').replace(/^\.\//, '');
    const tracked = trackedExamples === null || trackedExamples.has(normal);
    if (!(normal.startsWith('docs/web/examples/') || (normal.startsWith('examples/') && tracked))) {
      throw new Error(
        `project ${path}: use an example git tracks in examples/ or one of docs/web/examples/`,
      );
    }
    return readFileSync(join(REPO, normal), 'utf8');
  };
}
