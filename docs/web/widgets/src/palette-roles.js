/* palette-roles: an example's scene coloured by the roles of a palette. A palette names its colours
 * by role — the background, a formula, its variables, constants, operators and result, a text,
 * secondary text, rectangles, circles, arrows —, and the editor gives each new object the colour
 * of its kind's role (a formula `formula`, a text `text`, a brace `muted`, a box `rectangle`, a
 * circle `circle`, a line `arrow`) and offers every role wherever a colour is chosen. The reader
 * switches between the palettes the app comes with — the editor's own colours and Chroma Lab's
 * themes — and sees the same scene made with each one active; hovering a glyph (or focusing the
 * scene and moving with the arrows) says its role, and hovering a role in the legend lights its
 * glyphs. The roles, the palettes and the role of each kind are the app's
 * (MFEPlayer.engine.palettes).
 *
 * The role of each glyph: the role of its object's kind, unless the glyph has a colour of its own.
 * A glyph coloured with a role's colour of the editor's own palette has that role (#58C4DD a
 * variable, #F0AC5F a constant, #83C167 a result, #FFFFFF an operator — written as the glyph's own
 * colour, since it is the formula's colour too); any other colour of its own is kept in every
 * palette, as a project keeps literal colours.
 *
 * Options: { "example": slug, "palettes": [ids] (default: all; "editor" and the slugs of Chroma
 * Lab's themes: "midnight-chalkboard", "ink-and-paper", "orbital-violet", "light-laboratory"),
 * "roles": { "<formula id or name>": { "<role>": [glyph indices] } } (glyph roles by hand),
 * "time": seconds (default: the end of the scene) }. */

function mountPaletteRoles(element, options, context) {
  const { engine } = playerOf();
  const P = engine.palettes;
  const example = exampleOf(options.example);
  const all = P.builtIn;
  const ids = options.palettes === undefined ? all.map((p) => p.id) : options.palettes;
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => !all.some((p) => p.id === id))) {
    throw new WidgetProblem(
      `The option “palettes” lists some of ${all.map((p) => p.id).join(', ')}.`,
    );
  }
  const palettes = ids.map((id) => all.find((p) => p.id === id));
  const roleNames = [...P.roles];
  const glyphRoles = ['variable', 'constant', 'result', 'operator'];

  // ---- The role of every glyph of every object ----
  const editor = P.editor;
  const byColor = new Map(glyphRoles.map((role) => [editor[role].toUpperCase(), role]));
  const roleOfGlyph = new Map(); // formula id → Map(glyph → role)
  const kindRole = new Map(); // formula id → role
  for (const formula of example.project.formulas) {
    kindRole.set(
      formula.id,
      P.roleOfKind(formula.kind, formula.kind === 'shape' ? formula.shape : undefined),
    );
    const roles = new Map();
    if (formula.kind === 'math' || formula.kind === 'tex' || formula.kind === 'text') {
      for (const [index, color] of Object.entries(formula.glyphColors || {})) {
        const role = byColor.get(String(color).toUpperCase());
        if (role) roles.set(Number(index), role);
      }
    }
    roleOfGlyph.set(formula.id, roles);
  }
  for (const [ref, given] of Object.entries(options.roles || {})) {
    const formula = example.formula(ref);
    if (!formula) throw new WidgetProblem(`The example “${example.slug}” has no formula “${ref}”.`);
    for (const [role, indices] of Object.entries(given || {})) {
      if (!roleNames.includes(role) || role === 'background') {
        throw new WidgetProblem(
          `“${role}” is not a role a glyph can have: ${roleNames.slice(1).join(', ')}.`,
        );
      }
      for (const index of indices) roleOfGlyph.get(formula.id).set(Number(index), role);
    }
  }
  const roleOf = (formulaId, glyph) =>
    roleOfGlyph.get(formulaId)?.get(glyph) ?? kindRole.get(formulaId) ?? 'formula';

  /** The example's project made with `palette` active: every object in its kind's colour, every
   * glyph with a role in that role's colour, the background the palette's. */
  const recolor = (palette) => {
    const project = example.cloneProject();
    project.meta.background = palette.colors.background;
    for (const formula of project.formulas) {
      formula.color = palette.colors[kindRole.get(formula.id)];
      const roles = roleOfGlyph.get(formula.id);
      if (roles.size === 0) continue;
      const colors = { ...formula.glyphColors };
      for (const [glyph, role] of roles) colors[String(glyph)] = palette.colors[role];
      formula.glyphColors = colors;
    }
    return project;
  };

  // ---- The card ----
  const root = card(
    element,
    'palette-roles',
    `${example.meta.title} coloured by the roles of a palette`,
  );
  let current = palettes[0];
  let scene = example.scene(recolor(current));
  const duration = scene.duration;
  const time = Number.isFinite(options.time) ? clamp(options.time, 0, duration) : duration;
  let region = null;
  for (let i = 0; i <= 12; i++) region = unionBox(region, scene.contentBox((duration * i) / 12));
  region = region ? engine.padBox(region, 0.4) : scene.frame;

  const chooser = el('div', {
    class: 'mfe-w-palettes',
    role: 'radiogroup',
    'aria-label': 'Palette',
  });
  const choices = palettes.map((palette, i) => {
    const button = el(
      'button',
      {
        type: 'button',
        class: 'mfe-w-palette',
        role: 'radio',
        'data-palette': palette.id,
        title:
          palette.origin === 'editor'
            ? 'The colours the editor uses without a palette'
            : 'A theme of Chroma Lab',
        onclick: () => choose(palette),
        onkeydown: (event) => {
          const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
          if (step === undefined) return;
          event.preventDefault();
          const next = palettes[clamp(i + step, 0, palettes.length - 1)];
          choose(next);
          choices[palettes.indexOf(next)].focus();
        },
      },
      el('span', { class: 'mfe-w-palette-name', text: palette.name }),
      el(
        'span',
        { class: 'mfe-w-palette-strip', 'aria-hidden': 'true' },
        roleNames.map((role) => el('span', { style: { background: palette.colors[role] } })),
      ),
      el('span', {
        class: 'mfe-w-palette-origin',
        text: palette.origin === 'editor' ? 'Editor' : `Chroma Lab · ${palette.mode}`,
      }),
    );
    return button;
  });
  chooser.append(...choices);
  root.append(chooser);

  const stage = el('div', {
    class: 'mfe-w-stage mfe-w-scene',
    tabindex: '0',
    role: 'img',
    style: {
      'aspect-ratio': `${clamp((region.maxX - region.minX) / (region.maxY - region.minY), 1.2, 2.4)}`,
    },
  });
  root.append(stage);
  const tip = el('div', { class: 'mfe-w-tip', hidden: true, role: 'tooltip' });
  const ring = el('div', { class: 'mfe-w-pick', hidden: true });
  /** The transport's clock, made once the scene is there. */
  let clock = null;
  let view = null;
  let lit = null; // a role of the legend: its glyphs are lit
  let picked = null; // { clipId, glyph } under the pointer or the keys
  const dim = (drawables) => {
    if (!lit) return drawables;
    return drawables.map((d) => {
      const formulaId = formulaOfClip.get(d.clipId);
      const on = d.glyph >= 0 && formulaId && roleOf(formulaId, d.glyph) === lit;
      if (on) return d;
      return {
        ...d,
        fill: d.fill && { ...d.fill, opacity: d.fill.opacity * 0.18 },
        stroke: d.stroke && { ...d.stroke, opacity: d.stroke.opacity * 0.18 },
      };
    });
  };
  const formulaOfClip = new Map(example.project.clips.map((c) => [c.id, c.formulaId]));
  const canvas = sceneCanvas(
    stage,
    (node) => {
      const fit = boxToAspect(region, node.clientWidth / node.clientHeight);
      view = scene.draw(node, clock ? clock.time : time, { region: fit, adjust: dim });
      drawPick();
    },
    `${example.meta.title}, coloured by the palette`,
  );
  stage.append(ring, tip);

  // ---- The legend: every role, its colour, what the editor does with it ----
  const legend = el('ul', { class: 'mfe-w-legend', 'aria-label': 'Roles' });
  const legendItems = roleNames.map((role) => {
    const swatch = el('span', { class: 'mfe-w-swatch', 'aria-hidden': 'true' });
    const hex = el('span', { class: 'mfe-w-hex' });
    const item = el(
      'li',
      {
        class: 'mfe-w-role',
        tabindex: '0',
        'data-role': role,
        title: P.uses[role],
        onpointerenter: () => light(role),
        onpointerleave: () => light(null),
        onfocus: () => light(role),
        onblur: () => light(null),
      },
      swatch,
      el('span', { class: 'mfe-w-role-name', text: role }),
      hex,
    );
    return { role, item, swatch, hex };
  });
  legend.append(...legendItems.map((entry) => entry.item));
  root.append(legend);
  const note = el('p', { class: 'mfe-w-note' });
  root.append(note);

  function light(role) {
    lit = role === 'background' ? null : role;
    for (const entry of legendItems) entry.item.classList.toggle('is-lit', entry.role === role);
    canvas.redraw();
  }

  // ---- Picking a glyph: the pointer, or the arrow keys with the scene focused ----
  const glyphBoxes = () => {
    const out = [];
    for (const clip of scene.geometry(clock ? clock.time : time)) {
      const formulaId = formulaOfClip.get(clip.clipId);
      for (const [glyph, box] of clip.glyphs)
        out.push({ clipId: clip.clipId, formulaId, glyph, box });
    }
    return out;
  };
  const describeGlyph = (hit) => {
    const formula = example.project.formulas.find((f) => f.id === hit.formulaId);
    const role = roleOf(hit.formulaId, hit.glyph);
    const label = example.glyphs(hit.formulaId)[hit.glyph]?.label ?? '';
    return `${role} · ${current.colors[role]} — ${label && formula.kind !== 'shape' && formula.kind !== 'line' && formula.kind !== 'brace' ? `“${label}” of ` : ''}${formula.name}`;
  };
  function drawPick() {
    if (!picked || !view) {
      ring.hidden = true;
      tip.hidden = true;
      return;
    }
    const hit = glyphBoxes().find((h) => h.clipId === picked.clipId && h.glyph === picked.glyph);
    if (!hit) {
      ring.hidden = true;
      tip.hidden = true;
      return;
    }
    const { left, top, width, height } = view.boxToCss(hit.box);
    ring.hidden = false;
    ring.style.left = `${left - 3}px`;
    ring.style.top = `${top - 3}px`;
    ring.style.width = `${width + 6}px`;
    ring.style.height = `${height + 6}px`;
    tip.hidden = false;
    tip.textContent = describeGlyph(hit);
    // Over the glyph, inside the scene.
    const half = tip.offsetWidth / 2 + 4;
    tip.style.left = `${clamp(left + width / 2, half, Math.max(half, stage.clientWidth - half))}px`;
    tip.style.top = `${top - 34 >= 4 ? top - 34 : top + height + 8}px`;
    root.dataset.picked = roleOf(hit.formulaId, hit.glyph);
  }
  // The pointer over a glyph picks it; so does a tap (a touch moves no pointer before it).
  const pickAt = (event) => {
    if (!view) return;
    const rect = stage.getBoundingClientRect();
    const [sx, sy] = view.fromCss([event.clientX - rect.left, event.clientY - rect.top]);
    let best = null;
    for (const hit of glyphBoxes()) {
      const { minX, minY, maxX, maxY } = hit.box;
      const pad = 0.04;
      if (sx < minX - pad || sx > maxX + pad || sy < minY - pad || sy > maxY + pad) continue;
      const area = (maxX - minX) * (maxY - minY);
      if (!best || area < best.area) best = { ...hit, area };
    }
    const next = best && { clipId: best.clipId, glyph: best.glyph };
    if (next?.clipId === picked?.clipId && next?.glyph === picked?.glyph) return;
    picked = next;
    drawPick();
  };
  stage.addEventListener('pointermove', pickAt);
  stage.addEventListener('pointerdown', pickAt);
  stage.addEventListener('pointerleave', (event) => {
    // A finger leaves the screen when it lifts: what it tapped stays picked.
    if (event.pointerType === 'touch') return;
    picked = null;
    drawPick();
  });
  stage.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      picked = null;
      drawPick();
      return;
    }
    // Every glyph on screen, left to right, then top to bottom.
    const order = glyphBoxes().sort(
      (a, b) =>
        (a.box.minX + a.box.maxX) / 2 - (b.box.minX + b.box.maxX) / 2 ||
        (b.box.minY + b.box.maxY) / 2 - (a.box.minY + a.box.maxY) / 2,
    );
    if (order.length === 0) return;
    const at = picked
      ? order.findIndex((h) => h.clipId === picked.clipId && h.glyph === picked.glyph)
      : -1;
    const next = order[(at + step + order.length) % order.length];
    picked = { clipId: next.clipId, glyph: next.glyph };
    drawPick();
  });

  // ---- The palette ----
  function choose(palette) {
    current = palette;
    scene = example.scene(recolor(palette));
    stage.style.background = palette.colors.background;
    stage.dataset.scene = toneOf(palette.colors.background);
    stage.setAttribute(
      'aria-label',
      `${example.meta.title} with the palette ${palette.name}. Focus it and use the arrow keys to read the role of each glyph.`,
    );
    choices.forEach((button, i) => {
      const on = palettes[i] === palette;
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on ? 0 : -1;
    });
    for (const entry of legendItems) {
      entry.swatch.style.background = palette.colors[entry.role];
      entry.hex.textContent = palette.colors[entry.role];
      entry.item.title = `${palette.colors[entry.role]} — ${P.uses[entry.role]}`;
    }
    note.textContent =
      palette.origin === 'editor'
        ? 'Without a palette, the editor colours each new object by its kind with these colours. Hover a glyph to read its role; hover a role to light its glyphs.'
        : `${palette.name}: a theme of Chroma Lab, the app’s colour studio, for a ${palette.mode} background. Hover a glyph to read its role; hover a role to light its glyphs.`;
    root.dataset.palette = palette.id;
    canvas.redraw();
  }

  clock = transport({
    root,
    context,
    range: { start: 0, end: duration },
    fps: example.project.meta.fps,
    loop: false,
    label: `Playback of ${example.meta.title}`,
    onTime: () => canvas.redraw(),
  });
  root.append(clock.element);
  clock.seek(time);
  choose(current);
}

(window.MFE_WIDGETS ||= {})['palette-roles'] = {
  mount(element, options, context) {
    const given = options || {};
    return start(element, context, [given.example], () =>
      mountPaletteRoles(element, given, context),
    );
  },
};
