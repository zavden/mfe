/* link-glyphs: the heart of the app, the relation editor's drawing. The source formula on top,
 * the target below, drawn from the example's real glyphs; the reader clicks a glyph of the source
 * and one of the target to link them — Shift, Ctrl or ⌘ adds glyphs to a side's selection, Link
 * makes one pair of them (several onto one, one onto several) —, deletes links, suggests links
 * by label or goes back to the start. Preview plays the transformation with the reader's pairs: the
 * example's scene with the relation's pairs replaced, the two clips alone, looping from a little
 * before the window to a little after it, with a time bar on which the window is marked — what
 * the editor's own Preview shows. The rules are the editor's (MFEPlayer.engine.relations); the
 * glyphs nobody pairs leave with the source's outro and arrive with the target's intro, as the
 * scene engine plays them.
 *
 * Options: { "example": slug, "relation": id | "from:to" | number, "start": "app" | "empty" }. */

function mountLinkGlyphs(element, options, context) {
  const { engine } = playerOf();
  const R = engine.relations;
  const example = exampleOf(options.example);
  const project = example.project;
  const original = relationOf(project, options.relation, example.slug);
  const source = clipAndFormula(project, original.fromClipId);
  const target = clipAndFormula(project, original.toClipId);
  if (!source.formula?.snapshot || !target.formula?.snapshot) {
    throw new WidgetProblem(`The relation “${original.id}” of “${example.slug}” has no glyphs.`);
  }
  if (options.start !== undefined && options.start !== 'app' && options.start !== 'empty') {
    throw new WidgetProblem('The option “start” is "app" (the example’s pairs) or "empty".');
  }
  const fromSnap = source.formula.snapshot;
  const toSnap = target.formula.snapshot;
  const startPairs = () => (options.start === 'empty' ? [] : structuredClone(original.pairs));
  const labels = {
    from: (g) => R.glyphLabel(fromSnap, g),
    to: (g) => R.glyphLabel(toSnap, g),
  };

  // ---- State ----
  let pairs = startPairs();
  let selection = { from: new Set(), to: new Set() };
  let suggestion = null;
  let message = null; // { text, error }
  let hover = null; // { side, index }
  let view = 'link';
  const holder = () => ({ ...original, pairs });

  // ---- The drawing ----
  const sides = {
    from: { formula: source.formula, glyphs: example.glyphs(source.formula.id) },
    to: { formula: target.formula, glyphs: example.glyphs(target.formula.id) },
  };
  const boxOfRender = (side) =>
    example.render(sides[side].formula.id)?.bbox ??
    sides[side].glyphs.reduce((box, g) => unionBox(box, g.box), null);
  // The drawing is spaced by the size of its text, as the editor's: the median glyph of the two.
  const text = R.textSize(
    [...sides.from.glyphs, ...sides.to.glyphs].filter((g) => g.contours).map((g) => g.box),
  );
  const frame = R.linkFrame(boxOfRender('from'), boxOfRender('to'), text);
  sides.from.offset = frame.from;
  sides.to.offset = frame.to;
  const viewBox = [frame.left, -frame.top, frame.right - frame.left, frame.top - frame.bottom];
  const aspect = viewBox[2] / viewBox[3];

  const root = card(
    element,
    'link-glyphs',
    `Link the glyphs of ${source.formula.name} and ${target.formula.name}`,
  );
  root.dataset.view = view;

  const summary = el('p', { class: 'mfe-w-summary', 'aria-live': 'polite' });
  // The relation editor's own switch (its words).
  const viewSwitch = segmented({
    label: 'Show',
    options: [
      { value: 'link', label: 'Link', title: 'Link the glyphs of the two formulas' },
      { value: 'preview', label: 'Preview', title: 'See the transformation with these pairs' },
    ],
    value: 'link',
    onChange: (next) => setView(next),
  });
  root.append(el('div', { class: 'mfe-w-head' }, viewSwitch.element, summary));

  const stage = el('div', {
    class: 'mfe-w-stage mfe-w-link-stage',
    style: { background: project.meta.background, 'aspect-ratio': `${aspect}` },
    'data-scene': toneOf(project.meta.background),
  });
  root.append(stage);

  const drawing = svg('svg', {
    class: 'mfe-w-link-svg',
    viewBox: viewBox.map((n) => +n.toFixed(4)).join(' '),
    role: 'group',
    'aria-label': `${source.formula.name}: ${source.formula.source}, above; ${target.formula.name}: ${target.formula.source}, below`,
  });
  stage.append(drawing);
  const links = svg('g', { class: 'mfe-w-links' });
  const glyphLayer = svg('g');
  const indexLayer = svg('g');
  drawing.append(links, glyphLayer, indexLayer);

  const unit = frame.unit;
  const f = (n) => +n.toFixed(4);
  const glyphNodes = { from: new Map(), to: new Map() };
  const hitOf = (glyph) => ({
    cx: (glyph.box.minX + glyph.box.maxX) / 2,
    cy: (glyph.box.minY + glyph.box.maxY) / 2,
    w: Math.max(glyph.box.maxX - glyph.box.minX, unit * 0.9),
    h: Math.max(glyph.box.maxY - glyph.box.minY, unit * 1.4),
  });
  const colorOf = (formula, index) => formula.glyphColors?.[String(index)] ?? formula.color;
  /** The glyphs of a side in reading order: the order of the keys. */
  const order = {
    from: R.readingOrder(fromSnap).filter((i) => sides.from.glyphs[i]?.contours),
    to: R.readingOrder(toSnap).filter((i) => sides.to.glyphs[i]?.contours),
  };
  const focusable = { from: order.from[0], to: order.to[0] };

  for (const side of ['from', 'to']) {
    const { formula, glyphs, offset } = sides[side];
    const group = svg('g', {
      transform: `translate(${f(offset.dx)} ${f(-offset.dy)})`,
      'data-formula': side,
    });
    for (const glyph of glyphs) {
      if (!glyph.contours) continue;
      const hit = hitOf(glyph);
      const name = `${glyph.index}: ${glyph.label}`;
      const node = svg(
        'g',
        {
          class: 'rg-glyph',
          'data-side': side,
          'data-index': glyph.index,
          'data-label': glyph.label,
          role: 'button',
          tabindex: '-1',
          'aria-label': `${side === 'from' ? 'Source' : 'Target'} glyph ${name}`,
        },
        svg('title', { text: name }),
        svg('rect', {
          class: 'rg-hit',
          x: f(hit.cx - hit.w / 2),
          y: f(-(hit.cy + hit.h / 2)),
          width: f(hit.w),
          height: f(hit.h),
          rx: f(unit * 0.2),
          'vector-effect': 'non-scaling-stroke',
        }),
        svg('path', { d: contoursPath(glyph.contours), fill: colorOf(formula, glyph.index) }),
      );
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        onGlyph(side, glyph.index, event.shiftKey || event.ctrlKey || event.metaKey);
      });
      node.addEventListener('pointerenter', () => setHover({ side, index: glyph.index }));
      node.addEventListener('pointerleave', () => setHover(null));
      node.addEventListener('focus', () => {
        focusable[side] = glyph.index;
        setHover({ side, index: glyph.index });
      });
      node.addEventListener('blur', () => setHover(null));
      glyphNodes[side].set(glyph.index, node);
      group.append(node);
    }
    glyphLayer.append(group);
  }
  // A press with Shift, Ctrl or ⌘ adds a glyph to a side: it must not select the page's text.
  drawing.addEventListener('mousedown', (event) => {
    if (event.shiftKey || event.ctrlKey || event.metaKey) event.preventDefault();
  });
  drawing.addEventListener('click', () => {
    if (selection.from.size + selection.to.size === 0) return;
    selection = { from: new Set(), to: new Set() };
    message = null;
    render();
  });

  // Keys on the glyphs: ← → along a formula, ↑ ↓ to the other, Enter or Space clicks (with
  // Shift: adds to the selection), Delete deletes the links, Escape clears the selection.
  drawing.addEventListener('keydown', (event) => {
    const node = event.target.closest?.('.rg-glyph');
    if (!node) return;
    const side = node.dataset.side;
    const index = Number(node.dataset.index);
    const list = order[side];
    const at = list.indexOf(index);
    const go = (nextSide, nextIndex) => {
      event.preventDefault();
      glyphNodes[nextSide].get(nextIndex)?.focus();
    };
    switch (event.key) {
      case 'ArrowRight':
        return go(side, list[Math.min(at + 1, list.length - 1)]);
      case 'ArrowLeft':
        return go(side, list[Math.max(at - 1, 0)]);
      case 'ArrowDown':
      case 'ArrowUp': {
        const other = side === 'from' ? 'to' : 'from';
        if ((event.key === 'ArrowDown') !== (side === 'from')) return;
        const near = Math.min(
          Math.round((at / Math.max(list.length - 1, 1)) * (order[other].length - 1)),
          order[other].length - 1,
        );
        return go(other, order[other][Math.max(near, 0)]);
      }
      case 'Enter':
      case ' ':
        event.preventDefault();
        event.stopPropagation();
        onGlyph(side, index, event.shiftKey || event.ctrlKey || event.metaKey);
        return;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        unlink();
        return;
      case 'Escape':
        if (selection.from.size + selection.to.size === 0) return;
        event.preventDefault();
        selection = { from: new Set(), to: new Set() };
        message = null;
        render();
        return;
    }
  });

  // ---- The tools ----
  const status = el('span', { class: 'mfe-w-selection', 'aria-live': 'polite' });
  const linkButton = el('button', {
    type: 'button',
    class: 'btn btn-small btn-primary',
    text: 'Link',
    'data-action': 'link',
    onclick: () => link([...selection.from], [...selection.to]),
  });
  const unlinkButton = el('button', {
    type: 'button',
    class: 'btn btn-small',
    text: 'Delete link',
    'data-action': 'unlink',
    title: 'Delete the links of the selected glyphs (Delete)',
    onclick: () => unlink(),
  });
  const suggestButton = el('button', {
    type: 'button',
    class: 'btn btn-small',
    text: 'Suggest links by label',
    'data-action': 'suggest',
    title: 'Suggest one-to-one links between glyphs with the same label (in reading order)',
    onclick: () => {
      suggestion = R.suggest(fromSnap, toSnap, pairs);
      message = suggestion.length === 0 ? { text: 'No more glyphs with the same label.' } : null;
      if (suggestion.length === 0) suggestion = null;
      render();
    },
  });
  const resetButton = el('button', {
    type: 'button',
    class: 'btn btn-small btn-ghost',
    text: options.start === 'empty' ? 'Clear' : 'Reset',
    'data-action': 'reset',
    title: options.start === 'empty' ? 'Remove every pair' : 'Back to the example’s own pairs',
    onclick: () => {
      pairs = startPairs();
      selection = { from: new Set(), to: new Set() };
      suggestion = null;
      message = null;
      render();
    },
  });
  const toolbar = el(
    'div',
    { class: 'mfe-w-toolbar' },
    status,
    el('span', { class: 'mfe-w-tools' }, linkButton, unlinkButton, suggestButton, resetButton),
  );
  const suggestionRow = el('div', { class: 'mfe-w-suggestion', hidden: true });
  const messageLine = el('p', { class: 'mfe-w-message', role: 'status' });
  const pairList = el('ul', { class: 'mfe-w-pairs', 'aria-label': 'Pairs' });
  const unpairedLine = el('p', { class: 'mfe-w-note' });
  const linkTools = el(
    'div',
    { class: 'mfe-w-link-tools' },
    toolbar,
    suggestionRow,
    messageLine,
    pairList,
    unpairedLine,
  );
  root.append(linkTools);

  // ---- Preview ----
  const previewBox = el('div', { class: 'mfe-w-preview', hidden: true });
  stage.append(previewBox);
  const problems = el('div', { class: 'mfe-w-problems', hidden: true, role: 'status' });
  root.append(problems);
  let scene = null;
  let region = null;
  /** The transport's clock, made once the canvas is there. */
  let clock = null;
  let window_ = R.windowSpan(target.clip, original);
  let span = R.span(source.clip, target.clip, original);
  const twoClips = (drawables) =>
    drawables.filter((d) => d.clipId === source.clip.id || d.clipId === target.clip.id);
  const canvas = sceneCanvas(
    previewBox,
    (node) => {
      if (scene && region && clock) {
        const aspect = node.clientWidth / node.clientHeight;
        scene.draw(node, clock.time, { region: boxToAspect(region, aspect), adjust: twoClips });
      }
    },
    `The transformation of ${source.formula.name} into ${target.formula.name} with the pairs above`,
  );
  clock = transport({
    root,
    context,
    range: span,
    fps: project.meta.fps,
    loop: true,
    label: 'Playback of the transformation',
    onTime: () => canvas.redraw(),
  });
  clock.element.hidden = true;
  root.append(clock.element);

  const buildScene = () => {
    const copy = example.cloneProject();
    const relation = copy.relations.find((r) => r.id === original.id);
    relation.pairs = structuredClone(pairs);
    const errors = example.validate(copy).filter((issue) => issue.severity === 'error');
    if (errors.length > 0) {
      scene = null;
      problems.hidden = false;
      problems.replaceChildren(
        el('p', { text: 'These pairs cannot play: the app reports' }),
        el(
          'ul',
          {},
          errors.slice(0, 4).map((issue) => el('li', { text: issue.message })),
        ),
      );
      return false;
    }
    problems.hidden = true;
    scene = example.scene(copy, { includeHidden: true });
    window_ = R.windowSpan(target.clip, relation);
    span = R.span(source.clip, target.clip, relation);
    region = null;
    for (const t of R.framedTimes(span, window_)) {
      region = unionBox(region, drawablesBox(twoClips(scene.evaluate(t))));
    }
    region = region ? engine.padBox(region, unit * 1.2) : scene.frame;
    clock.setRange(span);
    clock.setBand({
      from: window_.start,
      to: window_.end,
      title: `The transformation: ${seconds(window_.start)} → ${seconds(window_.end)} s`,
    });
    return true;
  };

  function setView(next) {
    view = next;
    root.dataset.view = view;
    const preview = view === 'preview';
    drawing.style.visibility = preview ? 'hidden' : '';
    linkTools.hidden = preview;
    previewBox.hidden = !preview;
    if (!preview) {
      clock.pause();
      clock.element.hidden = true;
      problems.hidden = true;
      return;
    }
    if (buildScene()) {
      clock.element.hidden = false;
      clock.seek(span.start);
      canvas.redraw();
      clock.allowAutoplay();
    } else clock.element.hidden = true;
  }

  // ---- Actions ----
  function onGlyph(side, index, additive) {
    message = null;
    const click = R.click(selection, side, index, additive);
    if (click.kind === 'link') link(click.from, click.to);
    else {
      selection = click.selection;
      render();
    }
  }

  function link(from, to) {
    const result = R.link(holder(), from, to, null, labels);
    if (!result.ok) {
      message = { text: result.message, error: true };
      render();
      return;
    }
    pairs = result.relation.pairs;
    message = result.message ? { text: result.message } : null;
    selection = { from: new Set(), to: new Set() };
    suggestion = null;
    render();
  }

  function unlink() {
    const doomed = R.holding(pairs, selection);
    if (doomed.length === 0) return;
    const named = doomed.map((i) => R.describe(pairs[i], fromSnap, toSnap)).join(' · ');
    pairs = R.remove(holder(), doomed).pairs;
    message = { text: `Deleted: ${named}.` };
    selection = { from: new Set(), to: new Set() };
    suggestion = null;
    render();
  }

  function setHover(next) {
    hover = next;
    renderLinks();
    renderIndex();
  }

  // ---- Drawing the state ----
  const pairsOf = (side, index) =>
    pairs.flatMap((p, i) => ((side === 'from' ? p.from : p.to).includes(index) ? [i] : []));

  function focusPairs() {
    const focus = new Set(R.holding(pairs, selection));
    if (hover) pairsOf(hover.side, hover.index).forEach((i) => focus.add(i));
    return focus;
  }

  function linkPaths(pair, row, rows) {
    const boxOf = (side, i) => sides[side].glyphs[i]?.box;
    const sources = pair.from.map((g) => boxOf('from', g)).filter(Boolean);
    const targets = pair.to.map((g) => boxOf('to', g)).filter(Boolean);
    if (sources.length === 0 || targets.length === 0) return null;
    const margin = unit * 0.7;
    const spanY = frame.gapTop - frame.gapBottom - 2 * margin;
    const slots = Math.max(1, Math.min(rows, 8));
    const jy = frame.gapTop - margin - spanY * (((row % slots) + 0.5) / slots);
    const cx = (b, dx) => (b.minX + b.maxX) / 2 + dx;
    const sx = sources.map((b) => cx(b, frame.from.dx));
    const tx = targets.map((b) => cx(b, frame.to.dx));
    const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const jx = (mean(sx) + mean(tx)) / 2;
    const paths = [];
    sources.forEach((b, i) => {
      const y = b.minY + frame.from.dy - unit * 0.15;
      paths.push(`M${f(sx[i])} ${f(-y)} Q${f(sx[i])} ${f(-jy)} ${f(jx)} ${f(-jy)}`);
    });
    const ends = targets.map((b, i) => [tx[i], b.maxY + frame.to.dy + unit * 0.2]);
    for (const [x, y] of ends) {
      paths.push(`M${f(jx)} ${f(-jy)} Q${f(x)} ${f(-jy)} ${f(x)} ${f(-y)}`);
      paths.push(
        `M${f(x - unit * 0.14)} ${f(-(y + unit * 0.22))} L${f(x)} ${f(-y)} L${f(x + unit * 0.14)} ${f(-(y + unit * 0.22))}`,
      );
    }
    return { paths, junction: [jx, jy] };
  }

  function renderLinks() {
    const focus = focusPairs();
    const groups = [];
    const draw = (list, dashed) =>
      list.forEach((pair, i) => {
        const drawn = linkPaths(pair, i, list.length);
        if (!drawn) return;
        const on = !dashed && focus.has(i);
        const dim = !dashed && focus.size > 0 && !on;
        const color = dashed ? 'var(--doc-text-muted)' : R.color(i);
        groups.push(
          svg(
            'g',
            {
              class: `rg-link${dashed ? ' is-suggestion' : ''}${on ? ' is-focus' : ''}${dim ? ' is-dim' : ''}`,
              style: { stroke: color, fill: 'none' },
              'data-pair': dashed ? null : i,
            },
            drawn.paths.map((d) =>
              svg('path', {
                d,
                'vector-effect': 'non-scaling-stroke',
                'stroke-dasharray': dashed ? '5 4' : null,
              }),
            ),
            dashed &&
              svg('circle', {
                cx: f(drawn.junction[0]),
                cy: f(-drawn.junction[1]),
                r: f(unit * 0.12),
                style: { fill: color, stroke: 'none' },
              }),
          ),
        );
      });
    draw(pairs, false);
    if (suggestion) draw(suggestion, true);
    links.replaceChildren(...groups);
    // The glyphs: their pair's tint, the selection, the focus.
    for (const side of ['from', 'to']) {
      const selected = selection[side];
      for (const [index, node] of glyphNodes[side]) {
        const linked = pairsOf(side, index);
        const tint = linked.length > 0 ? R.color(linked[0]) : null;
        const suggested = suggestion?.some((p) =>
          (side === 'from' ? p.from : p.to).includes(index),
        );
        node.classList.toggle('is-linked', Boolean(tint));
        node.classList.toggle('is-selected', selected.has(index));
        node.classList.toggle(
          'is-focus',
          linked.some((i) => focus.has(i)),
        );
        node.classList.toggle('is-suggested', Boolean(suggested));
        node.setAttribute('aria-pressed', String(selected.has(index)));
        node.dataset.linked = String(linked.length > 0);
        const rect = node.querySelector('rect');
        rect.style.fill = tint || '';
        rect.style.stroke = tint || '';
        node.tabIndex = focusable[side] === index ? 0 : -1;
      }
    }
  }

  function renderIndex() {
    indexLayer.replaceChildren();
    if (!hover) return;
    const side = sides[hover.side];
    const glyph = side.glyphs[hover.index];
    if (!glyph?.contours) return;
    const hit = hitOf(glyph);
    const size = unit * 0.7;
    const text = String(hover.index);
    const width = size * (0.62 * text.length + 0.6);
    const height = size * 1.35;
    const x = hit.cx - hit.w / 2 + side.offset.dx;
    const y = -(hit.cy - hit.h / 2 + side.offset.dy) + size * 0.12;
    indexLayer.append(
      svg(
        'g',
        { class: 'rg-index' },
        svg('rect', { x: f(x), y: f(y), width: f(width), height: f(height), rx: f(size * 0.3) }),
        svg('text', {
          x: f(x + width / 2),
          y: f(y + height * 0.74),
          'font-size': f(size),
          'text-anchor': 'middle',
          text,
        }),
      ),
    );
  }

  const names = (glyphs, snap) =>
    [...glyphs]
      .sort((a, b) => a - b)
      .map((g) => R.glyphLabel(snap, g))
      .join(' ');

  function render() {
    renderLinks();
    renderIndex();
    const canLink = selection.from.size > 0 && selection.to.size > 0;
    const any = selection.from.size + selection.to.size > 0;
    status.textContent = canLink
      ? `${names(selection.from, fromSnap)} → ${names(selection.to, toSnap)}`
      : any
        ? 'Now select glyphs on the other side'
        : 'Nothing selected';
    linkButton.disabled = !canLink;
    // The editor's words for it (its pair menu's “Delete link…”, without the held confirmation).
    const held = R.holding(pairs, selection).length;
    unlinkButton.disabled = held === 0;
    unlinkButton.textContent = held > 1 ? `Delete ${held} links` : 'Delete link';
    // The suggestion, to accept or dismiss.
    suggestionRow.hidden = !suggestion;
    if (suggestion) {
      suggestionRow.replaceChildren(
        el('span', {
          text: `${suggestion.length} suggested link${suggestion.length === 1 ? '' : 's'}: ${suggestion
            .map((p) => R.describe(p, fromSnap, toSnap))
            .join(' · ')}`,
        }),
        el('button', {
          type: 'button',
          class: 'btn btn-small btn-primary',
          text: 'Accept all',
          'data-action': 'accept',
          onclick: () => {
            pairs = [...pairs, ...suggestion];
            suggestion = null;
            message = null;
            render();
          },
        }),
        el('button', {
          type: 'button',
          class: 'btn btn-small',
          text: 'Dismiss',
          'data-action': 'dismiss',
          onclick: () => {
            suggestion = null;
            render();
          },
        }),
      );
    }
    messageLine.textContent = message?.text ?? '';
    messageLine.classList.toggle('is-error', Boolean(message?.error));
    // The pairs, as chips: a click selects the glyphs of one.
    pairList.replaceChildren(
      ...pairs.map((pair, i) =>
        el(
          'li',
          {},
          el(
            'button',
            {
              type: 'button',
              class: 'mfe-w-chip',
              style: { '--chip': R.color(i) },
              title: 'Select the glyphs of this pair',
              onclick: () => {
                selection = { from: new Set(pair.from), to: new Set(pair.to) };
                message = null;
                render();
              },
            },
            el('span', { class: 'mfe-w-chip-dot', 'aria-hidden': 'true' }),
            R.describe(pair, fromSnap, toSnap),
          ),
        ),
      ),
    );
    // The glyphs nobody pairs, and what takes them.
    const { leaving, entering } = R.unpaired(
      project,
      holder(),
      fromSnap.glyphs.length,
      toSnap.glyphs.length,
    );
    summary.textContent = R.summary(pairs.length, leaving.length, entering.length);
    const outro = source.clip.outro.kind;
    const intro = target.clip.intro.kind;
    const parts = [];
    if (leaving.length > 0) {
      parts.push(
        `${names(leaving, fromSnap)} ${leaving.length === 1 ? 'leaves' : 'leave'} with the source’s outro (${engine.animationLabel(outro)})`,
      );
    }
    if (entering.length > 0) {
      parts.push(
        `${names(entering, toSnap)} ${entering.length === 1 ? 'arrives' : 'arrive'} with the target’s intro (${engine.animationLabel(intro)})`,
      );
    }
    unpairedLine.textContent =
      parts.length > 0 ? `${parts.join('; ')}.` : 'Every glyph has a partner.';
    root.dataset.pairs = String(pairs.length);
  }

  render();
}

(window.MFE_WIDGETS ||= {})['link-glyphs'] = {
  mount(element, options, context) {
    const given = options || {};
    return start(element, context, [given.example], () => mountLinkGlyphs(element, given, context));
  },
};
