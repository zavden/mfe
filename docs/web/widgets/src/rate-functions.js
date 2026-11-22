/* rate-functions: what each rate function means. For each one the app offers (its easings, by
 * Manim's names), its curve — the progress of an animation over its time —, a dot running along
 * it, and a glyph moving across a lane with that progress, every card on one clock, so that the
 * reader sees the same two seconds play out differently. ManimCE and ManimGL mean other curves by
 * `smooth` and the functions made of it: the switch shows either library's. The curves are the
 * scene engine's own (MFEPlayer.engine.rates).
 *
 * Options: { "functions": [names] (default: every one the app offers), "target": "ce" | "gl",
 * "duration": seconds of a run (default 2), "example": slug and "formula": id or name (the glyph
 * that moves: the first glyph of that formula; default: an italic x of the app's MathJax). */

/** An italic x as the app's MathJax draws it (examples/first-transform), one unit tall, centred:
 * the glyph that moves when the options name no example. */
const DEFAULT_GLYPH = {
  label: 'x',
  width: 1.0749,
  contours: [
    [
      -0.5, 0.1622, -0.4896, 0.2241, -0.4498, 0.2954, -0.3806, 0.3762, -0.3115, 0.4573, -0.2263,
      0.4985, -0.1248, 0.5, -0.0732, 0.5, -0.0261, 0.4866, 0.0166, 0.4601, 0.0591, 0.4337, 0.0908,
      0.4007, 0.1115, 0.3608, 0.1732, 0.4535, 0.2476, 0.5, 0.3344, 0.5, 0.3888, 0.5, 0.4359, 0.4837,
      0.4756, 0.4513, 0.5154, 0.419, 0.5359, 0.3756, 0.5374, 0.3212, 0.5374, 0.2785, 0.5271, 0.2439,
      0.5066, 0.2175, 0.4859, 0.1908, 0.4661, 0.1747, 0.4469, 0.1688, 0.4278, 0.1628, 0.4108, 0.16,
      0.3961, 0.16, 0.3683, 0.16, 0.3454, 0.1681, 0.3278, 0.1842, 0.3102, 0.2005, 0.3014, 0.2219,
      0.3014, 0.2483, 0.3014, 0.3159, 0.3381, 0.3624, 0.4117, 0.3872, 0.3954, 0.4064, 0.3661,
      0.4161, 0.3234, 0.4161, 0.3042, 0.4161, 0.2901, 0.4146, 0.2813, 0.4117, 0.2254, 0.3881,
      0.1842, 0.3395, 0.1578, 0.2659, 0.0695, -0.0591, 0.0254, -0.249, 0.0254, -0.3036, 0.0254,
      -0.3447, 0.0371, -0.374, 0.0607, -0.3917, 0.0842, -0.4095, 0.11, -0.4183, 0.138, -0.4183,
      0.1924, -0.4183, 0.2461, -0.3941, 0.2992, -0.3454, 0.352, -0.297, 0.3881, -0.2373, 0.4073,
      -0.1666, 0.4117, -0.1518, 0.4161, -0.1439, 0.4205, -0.1424, 0.4249, -0.1408, 0.4366, -0.1395,
      0.4557, -0.138, 0.4586, -0.138, 0.4617, -0.138, 0.4645, -0.138, 0.4866, -0.138, 0.4978,
      -0.1439, 0.4978, -0.1556, 0.4978, -0.1571, 0.4963, -0.1653, 0.4932, -0.1798, 0.4698, -0.2637,
      0.424, -0.3381, 0.3564, -0.4029, 0.2888, -0.4676, 0.21, -0.5, 0.1203, -0.5, 0.0173, -0.5,
      -0.0607, -0.4535, -0.1137, -0.3608, -0.1741, -0.452, -0.2432, -0.4978, -0.3212, -0.4978,
      -0.3256, -0.4978, -0.33, -0.4978, -0.3344, -0.4978, -0.4064, -0.4978, -0.4579, -0.4786,
      -0.4888, -0.4403, -0.5198, -0.402, -0.5359, -0.3617, -0.5374, -0.319, -0.5374, -0.2719,
      -0.5236, -0.2335, -0.4956, -0.2043, -0.4676, -0.1747, -0.4344, -0.16, -0.3963, -0.16, -0.3329,
      -0.16, -0.3014, -0.1908, -0.3014, -0.2527, -0.3014, -0.2822, -0.3102, -0.308, -0.3278, -0.33,
      -0.3454, -0.352, -0.3624, -0.3668, -0.3784, -0.374, -0.3947, -0.3815, -0.4042, -0.385,
      -0.4073, -0.385, -0.4095, -0.3859, -0.4117, -0.3866, -0.4139, -0.3872, -0.4139, -0.3888,
      -0.4095, -0.3917, -0.4007, -0.3963, -0.3919, -0.4007, -0.38, -0.4057, -0.3652, -0.4117,
      -0.3505, -0.4174, -0.3366, -0.4196, -0.3234, -0.4183, -0.2703, -0.4183, -0.2247, -0.385,
      -0.1864, -0.319, -0.1732, -0.2954, -0.1562, -0.2454, -0.1358, -0.1688, -0.1151, -0.0924,
      -0.0946, -0.0129, -0.0739, 0.0695, -0.0534, 0.1518, -0.0415, 0.2005, -0.0386, 0.2153, -0.0314,
      0.2549, -0.0276, 0.2835, -0.0276, 0.3014, -0.0276, 0.3425, -0.0386, 0.3718, -0.0607, 0.3895,
      -0.0827, 0.4073, -0.1078, 0.4161, -0.1358, 0.4161, -0.1946, 0.4161, -0.2498, 0.3925, -0.3014,
      0.3454, -0.3527, 0.2983, -0.3888, 0.2379, -0.4095, 0.1644, -0.4124, 0.1512, -0.4161, 0.1439,
      -0.4205, 0.1424, -0.4249, 0.1408, -0.4366, 0.1395, -0.4557, 0.138, -0.4661, 0.138, -0.4764,
      0.138, -0.4866, 0.138, -0.4956, 0.1468, -0.5, 0.1549, -0.5, 0.1622,
    ],
  ],
};

const CURVE_W = 240;
const CURVE_H = 132;
const CURVE_PAD = 10;

function mountRateFunctions(element, options, context) {
  const { engine } = playerOf();
  const all = [...engine.rates.names];
  const wanted = options.functions === undefined ? all : options.functions;
  if (!Array.isArray(wanted) || wanted.length === 0) {
    throw new WidgetProblem(
      'The option “functions” is a list of rate functions, such as ["smooth", "linear"].',
    );
  }
  const unknown = wanted.filter((name) => !all.includes(name));
  if (unknown.length > 0) {
    throw new WidgetProblem(
      `The app has no rate function ${unknown.map((n) => `“${n}”`).join(', ')}: it offers ${all.join(', ')}.`,
    );
  }
  if (options.target !== undefined && options.target !== 'ce' && options.target !== 'gl') {
    throw new WidgetProblem('The option “target” is "ce" (ManimCE) or "gl" (ManimGL).');
  }
  const run = Number.isFinite(options.duration) && options.duration > 0 ? options.duration : 2;
  let target = options.target || 'ce';

  // The glyph that moves: one of an example's, or the default x.
  let glyph = DEFAULT_GLYPH;
  if (options.example !== undefined) {
    const example = exampleOf(options.example);
    const ref = options.formula ?? example.formulas()[0]?.id;
    const glyphs = ref ? example.glyphs(ref) : [];
    const first = glyphs.find((g) => g.contours);
    if (!first) throw new WidgetProblem(`“${options.example}” has no glyph to move.`);
    const h = first.size[1] || 1;
    glyph = {
      label: first.label,
      width: first.size[0] / h,
      contours: first.contours.map((c) =>
        c.map((v, i) => (i % 2 === 0 ? (v - first.center[0]) / h : (v - first.center[1]) / h)),
      ),
    };
  }
  const glyphPath = contoursPath(glyph.contours);

  const root = card(element, 'rate-functions', 'Rate functions: progress over time');
  const libraries = segmented({
    label: 'Library',
    options: [
      { value: 'ce', label: 'ManimCE', title: 'The curves of ManimCE' },
      { value: 'gl', label: 'ManimGL', title: 'The curves of ManimGL' },
    ],
    value: target,
    small: true,
    onChange: (next) => {
      target = next;
      root.dataset.target = target;
      for (const item of cards) item.shape();
      show();
    },
  });
  root.dataset.target = target;
  const caption = el('p', {
    class: 'mfe-w-summary',
    text: `Each card runs the same ${seconds(run)} s: the curve is the progress at each moment; the glyph moves that far.`,
  });
  root.append(el('div', { class: 'mfe-w-head' }, caption, libraries.element));

  const grid = el('div', { class: 'mfe-w-rates' });
  root.append(grid);
  const pulses = new Set(engine.rates.pulses);
  /** The transport's clock, made once the cards are there. */
  let clock = null;
  const f = (n) => +n.toFixed(2);
  const px = (t) => CURVE_PAD + t * (CURVE_W - 2 * CURVE_PAD);
  const py = (v) => CURVE_H - CURVE_PAD - v * (CURVE_H - 2 * CURVE_PAD);

  const cards = wanted.map((name) => {
    const path = svg('path', { class: 'mfe-w-curve-line' });
    const cursor = svg('line', {
      class: 'mfe-w-curve-cursor',
      y1: CURVE_PAD,
      y2: CURVE_H - CURVE_PAD,
    });
    const dot = svg('circle', { class: 'mfe-w-curve-dot', r: 5 });
    const chart = svg(
      'svg',
      {
        class: 'mfe-w-curve',
        viewBox: `0 0 ${CURVE_W} ${CURVE_H}`,
        role: 'img',
        'aria-label': `The curve of ${name}`,
      },
      svg('rect', {
        class: 'mfe-w-curve-box',
        x: CURVE_PAD,
        y: CURVE_PAD,
        width: CURVE_W - 2 * CURVE_PAD,
        height: CURVE_H - 2 * CURVE_PAD,
      }),
      svg('line', {
        class: 'mfe-w-curve-diagonal',
        x1: CURVE_PAD,
        y1: CURVE_H - CURVE_PAD,
        x2: CURVE_W - CURVE_PAD,
        y2: CURVE_PAD,
      }),
      path,
      cursor,
      dot,
    );
    // A click on the curve shows that moment.
    chart.addEventListener('pointerdown', (event) => {
      const rect = chart.getBoundingClientRect();
      const t = clamp(
        ((event.clientX - rect.left) / rect.width) * CURVE_W,
        CURVE_PAD,
        CURVE_W - CURVE_PAD,
      );
      clock.pause();
      clock.seek(((t - CURVE_PAD) / (CURVE_W - 2 * CURVE_PAD)) * run);
    });
    const mover = svg('path', { class: 'mfe-w-mover', d: glyphPath });
    const ghost = svg('path', { class: 'mfe-w-mover-ghost', d: glyphPath });
    const lane = svg(
      'svg',
      {
        class: 'mfe-w-lane',
        viewBox: '0 0 10 1.6',
        preserveAspectRatio: 'xMidYMid meet',
        'aria-hidden': 'true',
      },
      svg('line', { class: 'mfe-w-lane-track', x1: 0.6, y1: 0.8, x2: 9.4, y2: 0.8 }),
      svg('g', { transform: 'translate(9.4 0.8)' }, ghost),
      mover,
    );
    const readout = el('span', { class: 'mfe-w-rate-value' });
    const node = el(
      'figure',
      { class: 'mfe-w-rate', 'data-rate': name },
      el(
        'figcaption',
        { class: 'mfe-w-rate-head' },
        el('code', { text: name }),
        pulses.has(name)
          ? el('span', {
              class: 'mfe-w-tag',
              text: 'comes back',
              title: 'It ends where it started: an Indicate takes only these.',
            })
          : null,
        readout,
      ),
      chart,
      lane,
    );
    grid.append(node);
    let curve = engine.rates.curve(name, target);
    return {
      name,
      shape() {
        curve = engine.rates.curve(name, target);
        const points = [];
        for (let i = 0; i <= 96; i++) {
          const t = i / 96;
          points.push(`${i === 0 ? 'M' : 'L'}${f(px(t))} ${f(py(curve(t)))}`);
        }
        path.setAttribute('d', points.join(' '));
      },
      at(t) {
        const value = curve(t);
        cursor.setAttribute('x1', f(px(t)));
        cursor.setAttribute('x2', f(px(t)));
        dot.setAttribute('cx', f(px(t)));
        dot.setAttribute('cy', f(py(value)));
        mover.setAttribute('transform', `translate(${(0.6 + value * 8.8).toFixed(4)} 0.8)`);
        readout.textContent = `${Math.round(value * 100)} %`;
        node.dataset.value = value.toFixed(3);
      },
    };
  });
  for (const item of cards) item.shape();

  const show = () => {
    const t = clamp(clock ? clock.time / run : 0, 0, 1);
    for (const item of cards) item.at(t);
    root.dataset.progress = t.toFixed(3);
  };
  clock = transport({
    root,
    context,
    range: { start: 0, end: run },
    fps: 60,
    loop: true,
    autoplay: true,
    label: 'Playback of the rate functions',
    onTime: show,
  });
  root.append(clock.element);
  show();
}

(window.MFE_WIDGETS ||= {})['rate-functions'] = {
  mount(element, options, context) {
    const given = options || {};
    return start(element, context, [given.example], () =>
      mountRateFunctions(element, given, context),
    );
  },
};
