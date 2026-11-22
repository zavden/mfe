/* style-compare: the styles of a relation side by side. The same relation — or one pair of it —
 * played with each style the app offers for a pair (Transform, Copy, Fade transform, Fade copy),
 * on one clock, so that the difference is seen at once: a Transform turns the source's glyphs into
 * the target's, a Copy leaves them where they are and sends a copy, a Fade transform fades them
 * into the target while they move, a Fade copy leaves them and fades a copy into the target. For a
 * pair of several glyphs onto one, `extras` compares the three ways its sources can arrive
 * instead. Each panel is the example's scene with that one change, the two clips alone, from a
 * little before the window to a little after it, as the relation editor's Preview shows it.
 *
 * Options: { "example": slug, "relation": id | "from:to" | number, "styles": ["transform",
 * "copy", "fade", "fade_copy"] (the default: all four), "pair": its number (1 for the first;
 * default: the whole relation), "extras": ["separate", "merge", "copies"] (instead of styles, for
 * a pair of several sources onto one target) }. */

/** What Manim plays for each style, in either library (README, "Relations"). */
const MANIM_CALLS = {
  transform: { ce: 'ReplacementTransform', gl: 'ReplacementTransform' },
  copy: { ce: 'ReplacementTransform of a copy', gl: 'TransformFromCopy' },
  fade: { ce: 'FadeTransform', gl: 'FadeTransform' },
  fade_copy: { ce: 'FadeTransform of a copy', gl: 'FadeTransform of a copy' },
};

function mountStyleCompare(element, options, context) {
  const { engine } = playerOf();
  const R = engine.relations;
  const example = exampleOf(options.example);
  const base = relationOf(example.project, options.relation, example.slug);
  const source = clipAndFormula(example.project, base.fromClipId);
  const target = clipAndFormula(example.project, base.toClipId);
  const lib = example.project.meta.target;

  // What the panels compare: styles, or the extras of one pair.
  const byExtras = options.extras !== undefined;
  const allStyles = R.styles.map((s) => s.value);
  const allExtras = R.extras.map((e) => e.value);
  const values = byExtras
    ? options.extras === true
      ? allExtras
      : options.extras
    : options.styles === undefined
      ? allStyles
      : options.styles;
  const known = byExtras ? allExtras : allStyles;
  if (!Array.isArray(values) || values.length === 0 || values.some((v) => !known.includes(v))) {
    throw new WidgetProblem(
      byExtras
        ? `The option “extras” lists some of ${allExtras.join(', ')}.`
        : `The option “styles” lists some of ${allStyles.join(', ')}.`,
    );
  }
  let pairIndex = null;
  if (options.pair !== undefined) {
    pairIndex = Number(options.pair) - 1;
    if (!Number.isInteger(pairIndex) || !base.pairs[pairIndex]) {
      throw new WidgetProblem(
        `The relation has ${base.pairs.length} pair${base.pairs.length === 1 ? '' : 's'}: “pair” is a number from 1 to ${base.pairs.length}.`,
      );
    }
  }
  if (byExtras) {
    const pair = pairIndex === null ? null : base.pairs[pairIndex];
    if (!pair || new Set(pair.from).size < 2 || new Set(pair.to).size !== 1) {
      throw new WidgetProblem(
        '“extras” compares a pair of several glyphs onto one: name it with “pair”.',
      );
    }
  }
  const fromSnap = source.formula?.snapshot ?? null;
  const toSnap = target.formula?.snapshot ?? null;

  /** The example's project with one value of the comparison. */
  const variant = (value) => {
    const project = example.cloneProject();
    const relation = project.relations.find((r) => r.id === base.id);
    if (byExtras) relation.pairs = R.setExtras(relation, pairIndex, value).pairs;
    else if (pairIndex !== null) relation.pairs[pairIndex].style = value;
    else {
      relation.style = value;
      relation.pairs = relation.pairs.map((pair) => ({ ...pair, style: null }));
    }
    return project;
  };
  const twoClips = (drawables) =>
    drawables.filter((d) => d.clipId === source.clip.id || d.clipId === target.clip.id);
  const window_ = R.windowSpan(target.clip, base);
  const span = R.span(source.clip, target.clip, base);

  const panels = values.map((value) => {
    const project = variant(value);
    const errors = example.validate(project).filter((issue) => issue.severity === 'error');
    const scene = errors.length === 0 ? example.scene(project, { includeHidden: true }) : null;
    return { value, project, errors, scene };
  });
  // One framing for every panel: what any of them draws over the loop.
  let region = null;
  for (const panel of panels) {
    if (!panel.scene) continue;
    for (const t of R.framedTimes(span, window_)) {
      region = unionBox(region, drawablesBox(twoClips(panel.scene.evaluate(t))));
    }
  }
  region = region ? engine.padBox(region, 0.35) : example.scene().frame;
  const aspect = clamp((region.maxX - region.minX) / (region.maxY - region.minY), 0.6, 2.4);

  const what =
    pairIndex === null
      ? `the relation from ${source.formula.name} to ${target.formula.name}`
      : `the pair ${R.describe(base.pairs[pairIndex], fromSnap, toSnap)}`;
  const root = card(element, 'style-compare', `${byExtras ? 'Extras' : 'Styles'} of ${what}`);
  root.append(
    el(
      'div',
      { class: 'mfe-w-head' },
      el('p', {
        class: 'mfe-w-summary',
        text: `${pairIndex === null ? 'The whole relation' : `Pair ${pairIndex + 1}: ${R.describe(base.pairs[pairIndex], fromSnap, toSnap)}`}, ${byExtras ? 'with each way its sources can arrive' : 'with each style'}.`,
      }),
    ),
  );
  const grid = el('div', {
    class: 'mfe-w-compare',
    style: { '--panels': Math.min(values.length, 4) },
  });
  root.append(grid);

  /** The transport's clock, made once the panels are there. */
  let clock = null;
  const canvases = panels.map((panel) => {
    const option = byExtras
      ? R.extras.find((e) => e.value === panel.value)
      : R.styles.find((s) => s.value === panel.value);
    const stage = el('div', {
      class: 'mfe-w-stage mfe-w-scene',
      style: { background: example.project.meta.background, 'aspect-ratio': `${aspect}` },
      'data-scene': toneOf(example.project.meta.background),
    });
    const caption = el(
      'figcaption',
      { class: 'mfe-w-panel-caption' },
      el('span', { class: 'mfe-w-panel-title', text: option.label }),
      byExtras
        ? el('span', { class: 'mfe-w-panel-note', text: option.title })
        : el('code', { class: 'mfe-w-panel-note', text: MANIM_CALLS[panel.value][lib] }),
    );
    const figure = el(
      'figure',
      { class: 'mfe-w-panel', 'data-value': panel.value },
      stage,
      caption,
    );
    grid.append(figure);
    if (!panel.scene) {
      stage.append(
        el('p', {
          class: 'mfe-w-panel-problem',
          text: `It cannot play: ${panel.errors[0].message}`,
        }),
      );
      return null;
    }
    return sceneCanvas(
      stage,
      (node) => {
        if (!clock) return;
        const fit = boxToAspect(region, node.clientWidth / node.clientHeight);
        panel.scene.draw(node, clock.time, { region: fit, adjust: twoClips });
      },
      `${option.label}: ${what}`,
    );
  });

  clock = transport({
    root,
    context,
    range: span,
    fps: example.project.meta.fps,
    loop: true,
    autoplay: true,
    label: 'Playback of every panel',
    onTime: () => {
      for (const canvas of canvases) canvas?.redraw();
    },
  });
  clock.setBand({
    from: window_.start,
    to: window_.end,
    title: `The relation’s window: ${seconds(window_.start)} → ${seconds(window_.end)} s`,
  });
  root.append(clock.element);
  clock.seek(span.start);
}

(window.MFE_WIDGETS ||= {})['style-compare'] = {
  mount(element, options, context) {
    const given = options || {};
    return start(element, context, [given.example], () =>
      mountStyleCompare(element, given, context),
    );
  },
};
