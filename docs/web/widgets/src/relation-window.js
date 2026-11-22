/* relation-window: the timing of a relation. The two clips on a small version of the app's
 * timeline, the relation's window on both (it runs from the target clip's start plus its offset,
 * for its duration), the room the clips leave it, and handles to move it and to change its length
 * — through the app's own clamp (MFEPlayer.engine.relations.clampWindow): after the source's intro
 * and the target's start, before the source's end and the target's outro, never shorter than
 * 0.05 s, and never where it would give the project an error. The scene plays above with that
 * timing, the playhead on the timeline in step with it.
 *
 * Options: { "example": slug, "relation": id | "from:to" | number }. */

/** The steps of the ruler's labelled ticks, in seconds, and the least gap between two labels. */
const RULER_STEPS = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
const RULER_GAP = 56;
/** How far a finger moves on the timeline (CSS pixels) before it is a drag, sideways the widget's
 * and up or down the page's: less is a tap (the player's strip, `TOUCH_SLOP` of stripView.ts). */
const TOUCH_SLOP = 10;

function mountRelationWindow(element, options, context) {
  const { engine } = playerOf();
  const R = engine.relations;
  const example = exampleOf(options.example);
  const relationRef = relationOf(example.project, options.relation, example.slug);
  const project = example.cloneProject();
  const relation = project.relations.find((r) => r.id === relationRef.id);
  const source = clipAndFormula(project, relation.fromClipId);
  const target = clipAndFormula(project, relation.toClipId);
  if (!source.clip || !target.clip) {
    throw new WidgetProblem(`The relation “${relation.id}” of “${example.slug}” has no clips.`);
  }
  const range = R.windowRange(source.clip, target.clip);
  if (!range) {
    throw new WidgetProblem(
      `The clips of the relation “${relation.id}” leave no room for a window.`,
    );
  }
  const start = { offset: relation.offset, duration: relation.duration };

  let scene = example.scene(project);
  /** The transport's clock, made once the timeline is there. */
  let clock = null;
  const duration = scene.duration;
  const fps = project.meta.fps;

  // What the scene shows: everything that is on screen at some time, framed once.
  let region = null;
  for (let i = 0; i <= 24; i++) region = unionBox(region, scene.contentBox((duration * i) / 24));
  region = region ? engine.padBox(region, 0.45) : scene.frame;

  const root = card(
    element,
    'relation-window',
    `The window of the relation from ${source.formula.name} to ${target.formula.name}`,
  );
  const readout = el('p', { class: 'mfe-w-summary', 'aria-live': 'polite' });
  const resetButton = el('button', {
    type: 'button',
    class: 'btn btn-small btn-ghost',
    text: 'Reset',
    'data-action': 'reset',
    title: 'Back to the example’s window',
    onclick: () => setWindow(start),
  });
  root.append(el('div', { class: 'mfe-w-head' }, readout, resetButton));

  const stage = el('div', {
    class: 'mfe-w-stage mfe-w-scene',
    style: {
      background: project.meta.background,
      'aspect-ratio': `${project.meta.width} / ${project.meta.height}`,
    },
    'data-scene': toneOf(project.meta.background),
  });
  root.append(stage);
  const canvas = sceneCanvas(
    stage,
    (node) => {
      const aspect = node.clientWidth / node.clientHeight;
      scene.draw(node, clock ? clock.time : 0, { region: boxToAspect(region, aspect) });
    },
    `The scene of ${example.meta.title}, at the time of the playhead`,
  );

  // ---- The timeline: the two clips, the room, the window, the playhead ----
  const strip = el('div', {
    class: 'mfe-player-strip mfe-w-strip',
    role: 'group',
    'aria-label': 'The two clips and the window of the relation',
  });
  root.append(strip);
  const ruler = el('div', { class: 'mfe-strip-ruler' });
  const rows = el('div', { class: 'mfe-w-strip-rows' });
  const playhead = el('div', { class: 'mfe-strip-playhead' });
  strip.append(ruler, rows, playhead);

  const ROW = 40;
  const INSET = 4;
  const FOOT = 16;
  let header = 0;
  let pps = 1;
  const x = (t) => header + t * pps;
  const px = (n) => `${Math.round(n * 100) / 100}px`;

  const clipRow = (which, info) => {
    const { clip, formula } = info;
    const row = el('div', { class: 'mfe-strip-row mfe-w-strip-row', style: { height: px(ROW) } });
    const name = el('div', {
      class: 'mfe-strip-name',
      text: which === 'source' ? 'Source' : 'Target',
    });
    const box = el('div', {
      class: 'mfe-strip-clip',
      title: `${formula.name}: ${formula.source} · ${seconds(clip.start)} → ${seconds(clip.end)} s`,
    });
    const intro =
      clip.intro.kind !== 'none' && clip.intro.duration > 0
        ? el('div', { class: 'mfe-strip-band is-intro' }, el('span'))
        : null;
    const outro =
      clip.outro.kind !== 'none' && clip.outro.duration > 0
        ? el('div', { class: 'mfe-strip-band is-outro' }, el('span'))
        : null;
    const label = el('div', { class: 'mfe-strip-clip-name', text: formula.name });
    box.append(...[intro, outro, label].filter(Boolean));
    row.append(name, box);
    return { row, name, box, intro, outro, label, clip, formula };
  };
  const sourceRow = clipRow('source', source);
  const targetRow = clipRow('target', target);
  const room = el('div', {
    class: 'mfe-w-room',
    title:
      'Where the window may lie: after the source’s intro and the target’s start, before the source’s end and the target’s outro',
  });
  const sourceWindow = el('div', { class: 'mfe-strip-window mfe-w-window' });
  const targetWindow = el('div', { class: 'mfe-strip-window mfe-w-window' });
  const handle = (edge, label) =>
    el('div', {
      class: `mfe-w-handle is-${edge}`,
      role: 'slider',
      tabindex: '0',
      'aria-label': label,
      'data-edge': edge,
    });
  const body = handle('move', 'The window: drag it to move it in time');
  const startHandle = handle('start', 'Start of the window');
  const endHandle = handle('end', 'End of the window');
  targetWindow.append(body, startHandle, endHandle);
  const link = svg('svg', { class: 'mfe-w-link-line', 'aria-hidden': 'true' });
  rows.append(sourceRow.row, targetRow.row, room, link, sourceWindow, targetWindow);

  const ticks = (width) => {
    const out = [];
    if (duration <= 0 || width <= 0) return out;
    const step = RULER_STEPS.find((s) => s * pps >= RULER_GAP) ?? RULER_STEPS.at(-1);
    const minor = step / (step >= 1 && step % 5 === 0 ? 5 : 2);
    for (let i = 0; i * minor <= duration + 1e-9; i++) {
      const t = Math.round(i * minor * 1e6) / 1e6;
      const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
      const text = `${Number(t.toFixed(3))}s`;
      const at = x(t);
      out.push({ at, major, label: major && at + 4 + text.length * 6 <= width ? text : '' });
    }
    return out;
  };

  const layout = () => {
    const width = strip.clientWidth;
    if (width <= 0) return;
    header = width >= 420 ? 76 : 0;
    pps = (width - header) / Math.max(duration, 1e-6);
    ruler.replaceChildren(
      ...(header > 0
        ? [el('div', { class: 'mfe-strip-corner', style: { width: px(header) } })]
        : []),
      ...ticks(width).map((tick) =>
        el(
          'div',
          { class: `mfe-strip-tick${tick.major ? ' is-major' : ''}`, style: { left: px(tick.at) } },
          tick.label ? el('span', { text: tick.label }) : null,
        ),
      ),
    );
    for (const row of [sourceRow, targetRow]) {
      row.name.style.width = px(header);
      row.name.hidden = header === 0;
      const { clip } = row;
      row.box.style.left = px(x(clip.start));
      row.box.style.width = px(Math.max(2, (clip.end - clip.start) * pps));
      row.box.style.top = px(INSET);
      row.box.style.bottom = px(INSET);
      row.box.style.setProperty('--clip-color', row.formula.tag?.color || '#58C4DD');
      // A band's name where it has room for it, as the player's strip does.
      const named = (band, kind, width) => {
        const label = engine.animationLabel(kind);
        band.firstChild.textContent = width >= label.length * 6 + 8 ? label : '';
        band.title = label;
      };
      if (row.intro) {
        row.intro.style.left = '0px';
        row.intro.style.width = px(clip.intro.duration * pps);
        named(row.intro, clip.intro.kind, clip.intro.duration * pps);
      }
      if (row.outro) {
        row.outro.style.left = px((clip.end - clip.start - clip.outro.duration) * pps);
        row.outro.style.width = px(clip.outro.duration * pps);
        named(row.outro, clip.outro.kind, clip.outro.duration * pps);
      }
    }
    room.style.left = px(x(range.start));
    room.style.width = px((range.end - range.start) * pps);
    room.style.top = px(ROW + INSET);
    room.style.height = px(ROW - 2 * INSET);
    placeWindow();
    placePlayhead();
  };

  const placeWindow = () => {
    const from = target.clip.start + relation.offset;
    const left = x(from);
    const width = Math.max(4, relation.duration * pps);
    for (const [band, top] of [
      [sourceWindow, ROW - INSET - FOOT],
      [targetWindow, 2 * ROW - INSET - FOOT],
    ]) {
      band.style.left = px(left);
      band.style.width = px(width);
      band.style.top = px(top);
      band.style.height = px(FOOT);
    }
    link.style.left = px(left);
    link.style.width = px(Math.max(width, 2));
    link.style.top = px(ROW - INSET);
    link.style.height = px(ROW - FOOT);
    link.replaceChildren(
      svg('path', { d: `M${Math.min(10, width / 2)} 0 V${ROW - FOOT}`, class: 'mfe-strip-arrow' }),
    );
    const end = from + relation.duration;
    readout.textContent = `Window ${seconds(from)} → ${seconds(end)} s · offset ${seconds(relation.offset)} s · duration ${seconds(relation.duration)} s`;
    for (const [node, value, text] of [
      [startHandle, from, `starts at ${seconds(from)} s`],
      [endHandle, end, `ends at ${seconds(end)} s`],
      [body, from, `from ${seconds(from)} to ${seconds(end)} s`],
    ]) {
      node.setAttribute('aria-valuemin', seconds(range.start));
      node.setAttribute('aria-valuemax', seconds(range.end));
      node.setAttribute('aria-valuenow', seconds(value));
      node.setAttribute('aria-valuetext', `The window ${text}`);
    }
    root.dataset.offset = relation.offset.toFixed(3);
    root.dataset.duration = relation.duration.toFixed(3);
    clock?.setBand({
      from,
      to: end,
      title: `The relation’s window: ${seconds(from)} → ${seconds(end)} s`,
    });
  };

  const placePlayhead = () => {
    playhead.style.left = px(x(clock ? clock.time : 0));
  };

  // ---- Changing the window ----
  const note = el('p', { class: 'mfe-w-note' });
  root.append(note);
  const say = () => {
    note.textContent =
      `The window may lie from ${seconds(range.start)} to ${seconds(range.end)} s: after the ` +
      `source’s intro and the target’s start, before the source’s end and the target’s outro. ` +
      'Drag the window to move it, an edge to change its length.';
  };
  say();

  /** Puts the window where `spec` says (offset, duration), and plays the scene with it. */
  function setWindow(spec) {
    relation.offset = spec.offset;
    relation.duration = spec.duration;
    scene = example.scene(project);
    placeWindow();
    canvas.redraw();
  }

  /** The edges an edit asks for, on the time grid (0.05 s) unless `free`. */
  const edgesOf = (base, edit, dt, free) => {
    const snap = (t) => (free ? t : Math.round(t / 0.05) * 0.05);
    const from = target.clip.start + base.offset;
    const to = from + base.duration;
    if (edit === 'move') {
      const moved = snap(from + dt);
      return { start: moved, end: moved + base.duration };
    }
    if (edit === 'start') return { start: snap(from + dt), end: to };
    return { start: from, end: snap(to + dt) };
  };

  const edit = (edit, base, dt, free, against) => {
    const wanted = edgesOf(base, edit, dt, free);
    const spec = R.clampWindow(against, relation.id, wanted, edit);
    if (spec) setWindow(spec);
  };

  for (const node of [body, startHandle, endHandle]) {
    const kind = node.dataset.edge;
    node.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      node.setPointerCapture?.(event.pointerId);
      node.focus({ preventScroll: true });
      // Everything the drag depends on is fixed when it starts, as on the app's timeline.
      const base = { offset: relation.offset, duration: relation.duration };
      const against = structuredClone(project);
      const startX = event.clientX;
      root.classList.add('is-dragging');
      const move = (e) => edit(kind, base, (e.clientX - startX) / pps, e.shiftKey, against);
      const up = () => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', up);
        root.classList.remove('is-dragging');
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
    });
    node.addEventListener('keydown', (event) => {
      const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
      if (step === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      const base = { offset: relation.offset, duration: relation.duration };
      edit(kind, base, step * (event.shiftKey ? 0.25 : 0.05), false, structuredClone(project));
    });
  }

  // A press on the timeline (not on the window) seeks there; a drag scrubs. A finger may be
  // scrolling the page (the strip's `touch-action: pan-y`, the player's stylesheet): as on the
  // player's strip (app/src/embed/stripView.ts), it seeks when it lifts where it landed or scrubs
  // once it moves sideways; up or down it is the page's, which takes it back (`pointercancel`).
  const seekAt = (e) => {
    const rect = strip.getBoundingClientRect();
    clock.seek(clamp((e.clientX - rect.left - header) / pps, 0, duration));
  };
  /** A drag that seeks from `event` on; playback holds while it lasts. */
  const scrub = (event) => {
    const id = event.pointerId;
    strip.setPointerCapture?.(id);
    const was = clock.playing;
    clock.pause();
    root.classList.add('is-seeking');
    seekAt(event);
    const move = (e) => {
      if (e.pointerId === id) seekAt(e);
    };
    const up = (e) => {
      if (e.pointerId !== id) return;
      strip.removeEventListener('pointermove', move);
      strip.removeEventListener('pointerup', up);
      strip.removeEventListener('pointercancel', up);
      root.classList.remove('is-seeking');
      if (was) clock.play();
    };
    strip.addEventListener('pointermove', move);
    strip.addEventListener('pointerup', up);
    strip.addEventListener('pointercancel', up);
  };
  strip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('.mfe-w-handle')) return;
    if (event.pointerType !== 'touch') {
      event.preventDefault();
      scrub(event);
      return;
    }
    const id = event.pointerId;
    const landed = { x: event.clientX, y: event.clientY };
    const forget = () => {
      strip.removeEventListener('pointermove', move);
      strip.removeEventListener('pointerup', lift);
      strip.removeEventListener('pointercancel', cancel);
    };
    const move = (e) => {
      if (e.pointerId !== id) return;
      const dx = Math.abs(e.clientX - landed.x);
      const dy = Math.abs(e.clientY - landed.y);
      if (Math.max(dx, dy) < TOUCH_SLOP) return;
      forget();
      if (dx > dy) scrub(e);
    };
    const lift = (e) => {
      if (e.pointerId !== id) return;
      forget();
      // A tap: the time goes there, and playback on from there.
      const was = clock.playing;
      clock.pause();
      seekAt(e);
      if (was) clock.play();
    };
    const cancel = (e) => {
      if (e.pointerId === id) forget();
    };
    strip.addEventListener('pointermove', move);
    strip.addEventListener('pointerup', lift);
    strip.addEventListener('pointercancel', cancel);
  });

  clock = transport({
    root,
    context,
    range: { start: 0, end: duration },
    fps,
    loop: true,
    // It plays while it is on screen (never with reduced motion): a window moved shows at once.
    autoplay: true,
    label: `Playback of ${example.meta.title}`,
    onTime: () => {
      canvas.redraw();
      placePlayhead();
    },
  });
  root.append(clock.element);
  onResize(strip, layout);
  placeWindow();
  clock.seek(clamp(target.clip.start + relation.offset + relation.duration / 2, 0, duration));
}

(window.MFE_WIDGETS ||= {})['relation-window'] = {
  mount(element, options, context) {
    const given = options || {};
    return start(element, context, [given.example], () =>
      mountRelationWindow(element, given, context),
    );
  },
};
