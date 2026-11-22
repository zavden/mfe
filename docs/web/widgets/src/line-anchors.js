/* line-anchors: the compass of a line's end. Each end of a line (an arrow) that is on glyphs can be
 * put at one of the nine points of their box — the four corners, the middles of the four edges,
 * the centre: what Manim's `get_corner(UL)`, `get_left()` … `get_center()` read — or left to Auto,
 * the edge Manim finds towards the line's other end. The scene shows the dots of every point on
 * both formulas; a click on one (or the compass under the scene, as the Preview's) puts that end
 * there, and the line is placed and built again at once, as the app's attach sync does
 * (MFEPlayer.engine.lines, Example.placeLines).
 *
 * Options: { "example": slug, "formula": the line's id or name (default: the first line whose
 * ends are on glyphs), "time": seconds (default: once the line is drawn) }. */

function mountLineAnchors(element, options, context) {
  const { engine } = playerOf();
  const L = engine.lines;
  const example = exampleOf(options.example);
  const project = example.cloneProject();
  const line = options.formula
    ? project.formulas.find(
        (f) => f.kind === 'line' && (f.id === options.formula || f.name === options.formula),
      )
    : project.formulas.find(
        (f) =>
          f.kind === 'line' &&
          project.clips.some((c) => c.formulaId === f.id && c.attach?.rule === 'ends'),
      );
  if (!line) {
    throw new WidgetProblem(
      options.formula
        ? `The example “${example.slug}” has no line “${options.formula}”.`
        : `The example “${example.slug}” has no line with its ends on glyphs.`,
    );
  }
  const clip = project.clips.find((c) => c.formulaId === line.id && c.attach?.rule === 'ends');
  if (!clip) throw new WidgetProblem(`The line “${line.name}” has no end on glyphs.`);
  const attach = clip.attach;
  const ends = ['start', 'end'].filter((side) => 'clipId' in attach[side]);
  if (ends.length === 0) throw new WidgetProblem(`The line “${line.name}” has no end on glyphs.`);
  const first = { start: attach.start.anchor, end: attach.end.anchor };
  const nameOfClip = (clipId) => clipAndFormula(project, clipId).formula?.name ?? '?';

  let scene = example.scene(project);
  const time = Number.isFinite(options.time)
    ? clamp(options.time, 0, scene.duration)
    : clamp(clip.start + clip.intro.duration + 0.3, 0, scene.duration);
  let placed = project;

  // What the scene shows: the line and the formulas its ends are on, framed once.
  let region = scene.contentBox(time);
  region = region ? engine.padBox(region, 0.7) : scene.frame;

  const root = card(element, 'line-anchors', `Where the ends of ${line.name} are`);
  const readout = el('p', { class: 'mfe-w-summary', 'aria-live': 'polite' });
  const resetButton = el('button', {
    type: 'button',
    class: 'btn btn-small btn-ghost',
    text: 'Reset',
    'data-action': 'reset',
    title: 'Back to the example’s anchors',
    onclick: () => {
      for (const side of ends) attach[side].anchor = first[side];
      update();
    },
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
  const overlay = svg('svg', { class: 'mfe-w-overlay', 'aria-hidden': 'true' });
  let view = null;
  /** The points of the compass of each end, and where the line runs (`lines.ends`). */
  let points = {};
  let found = null;
  const canvas = sceneCanvas(
    stage,
    (node) => {
      const aspect = node.clientWidth / node.clientHeight;
      view = scene.draw(node, time, { region: boxToAspect(region, aspect) });
      drawOverlay(node);
    },
    `The line ${line.name} between ${ends.map((side) => nameOfClip(attach[side].clipId)).join(' and ')}`,
  );
  stage.append(overlay);
  const tip = el('div', { class: 'mfe-w-tip', hidden: true, role: 'tooltip' });
  stage.append(tip);

  // ---- The compasses: one per end on glyphs, as the Preview's ----
  const compasses = el('div', { class: 'mfe-w-compasses' });
  root.append(compasses);
  const cells = { start: new Map(), end: new Map() };
  for (const side of ends) {
    const on = nameOfClip(attach[side].clipId);
    const grid = el('div', {
      class: 'mfe-w-compass',
      role: 'group',
      'aria-label': `${side === 'start' ? 'Start' : 'End'} of the line, on ${on}`,
    });
    for (const anchor of L.compass) {
      const cell = el('button', {
        type: 'button',
        class: 'mfe-w-compass-cell',
        text: L.arrows[anchor],
        title: L.labels[anchor],
        'aria-label': L.labels[anchor],
        'data-side': side,
        'data-anchor': anchor,
        onclick: () => choose(side, anchor),
      });
      cells[side].set(anchor, cell);
      grid.append(cell);
    }
    const auto = el('button', {
      type: 'button',
      class: 'mfe-w-compass-auto',
      text: L.labels.auto,
      title: L.autoHint,
      'data-side': side,
      'data-anchor': 'auto',
      onclick: () => choose(side, 'auto'),
    });
    cells[side].set('auto', auto);
    grid.append(auto);
    // Arrows move between the cells, as the Preview's compass.
    grid.addEventListener('keydown', (event) => {
      const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const step = steps[event.key];
      if (!step) return;
      event.preventDefault();
      event.stopPropagation();
      const focused = event.target.dataset.anchor;
      const to = (anchor) => cells[side].get(anchor)?.focus();
      if (focused === 'auto') {
        if (step[1] < 0) to('down');
        return;
      }
      const index = L.compass.indexOf(focused);
      if (step[1] > 0 && index >= 6) {
        to('auto');
        return;
      }
      const column = clamp((index % 3) + step[0], 0, 2);
      const row = clamp(Math.floor(index / 3) + step[1], 0, 2);
      to(L.compass[row * 3 + column]);
    });
    compasses.append(
      el(
        'div',
        { class: 'mfe-w-compass-box' },
        el('p', {
          class: 'mfe-w-compass-title',
          text: `${side === 'start' ? 'Start' : 'End'} on ${on}`,
        }),
        grid,
      ),
    );
  }

  function choose(side, anchor) {
    attach[side].anchor = anchor;
    update();
  }

  // ---- The dots over the scene ----
  function measure() {
    const measured = example.scene(placed, { includeHidden: true });
    points = {};
    for (const side of ends) {
      points[side] = L.anchorPoints(placed, measured.evaluator, attach[side], clip.start);
    }
    found = L.ends(
      placed,
      measured.evaluator,
      placed.clips.find((c) => c.id === clip.id),
    );
  }

  function drawOverlay(node) {
    if (!view) return;
    const width = node.clientWidth;
    const height = node.clientHeight;
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    overlay.setAttribute('width', String(width));
    overlay.setAttribute('height', String(height));
    const nodes = [];
    for (const side of ends) {
      const set = points[side];
      if (!set) continue;
      const current = attach[side].anchor;
      // The dots of a small formula are close: their size and their reach shrink to stay apart.
      const at = L.compass.map((anchor) => view.toCss(set[anchor]));
      let gap = Infinity;
      at.forEach(([x1, y1], i) =>
        at.slice(i + 1).forEach(([x2, y2]) => {
          gap = Math.min(gap, Math.hypot(x2 - x1, y2 - y1));
        }),
      );
      const reach = clamp(gap / 2, 5, 13);
      const size = clamp(gap * 0.3, 3, 5.5);
      L.compass.forEach((anchor, i) => {
        const [cx, cy] = at[i];
        const on = anchor === current;
        const dot = svg('circle', {
          class: `mfe-w-anchor is-${side}${on ? ' is-current' : ''}`,
          cx: cx.toFixed(2),
          cy: cy.toFixed(2),
          r: (on ? size + 1.5 : size).toFixed(2),
          'data-side': side,
          'data-anchor': anchor,
        });
        const hit = svg('circle', {
          class: 'mfe-w-anchor-hit',
          cx: cx.toFixed(2),
          cy: cy.toFixed(2),
          r: reach.toFixed(2),
          'data-side': side,
          'data-anchor': anchor,
        });
        hit.addEventListener('click', () => choose(side, anchor));
        hit.addEventListener('pointerenter', () =>
          showTip(cx, cy, `${L.labels[anchor]} of ${nameOfClip(attach[side].clipId)}`),
        );
        hit.addEventListener('pointerleave', (event) => {
          if (event.pointerType !== 'touch') hideTip();
        });
        nodes.push(dot, hit);
      });
      // Where an Auto end lands: the edge the library found.
      if (current === 'auto' && found) {
        const [ax, ay] = view.toCss(found.raw[side]);
        nodes.push(
          svg('rect', {
            class: 'mfe-w-auto-mark',
            x: (ax - 5).toFixed(2),
            y: (ay - 5).toFixed(2),
            width: 10,
            height: 10,
            transform: `rotate(45 ${ax.toFixed(2)} ${ay.toFixed(2)})`,
          }),
        );
      }
    }
    overlay.replaceChildren(...nodes);
  }

  function showTip(x, y, text) {
    tip.textContent = text;
    tip.hidden = false;
    // Over the dot, inside the scene.
    const width = canvas.canvas.clientWidth;
    const half = tip.offsetWidth / 2 + 4;
    tip.style.left = `${clamp(x, half, Math.max(half, width - half))}px`;
    tip.style.top = `${y - 36 >= 4 ? y - 36 : y + 16}px`;
  }
  function hideTip() {
    tip.hidden = true;
  }

  function describe(side) {
    const anchor = attach[side].anchor;
    const on = nameOfClip(attach[side].clipId);
    return anchor === 'auto' ? `Auto on ${on}` : `${L.labels[anchor]} of ${on}`;
  }

  function update() {
    placed = example.placeLines(project);
    scene = example.scene(placed);
    measure();
    for (const side of ends) {
      for (const [anchor, cell] of cells[side]) {
        cell.setAttribute('aria-pressed', String(anchor === attach[side].anchor));
      }
    }
    readout.textContent = ends
      .map((side) => `${side === 'start' ? 'Start' : 'End'}: ${describe(side)}`)
      .join(' · ');
    root.dataset.start = attach.start.anchor ?? 'point';
    root.dataset.end = attach.end.anchor ?? 'point';
    const vector = placed.formulas.find((f) => f.id === line.id).vector;
    root.dataset.vector = vector.map((v) => v.toFixed(3)).join(',');
    canvas.redraw();
  }

  update();
}

(window.MFE_WIDGETS ||= {})['line-anchors'] = {
  mount(element, options, context) {
    const given = options || {};
    return start(element, context, [given.example], () =>
      mountLineAnchors(element, given, context),
    );
  },
};
