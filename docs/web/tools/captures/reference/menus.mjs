/* Data of reference/menus: every menu of the menu bar, opened in turn the way the pointer opens
 * it, with its submenus.
 *
 * `MFE_DATA['reference/menus/menu-bar']`:
 *   state   what the app showed: the project, the selection, the theme, the preferences, the
 *           system — an entry that acts on a selection is disabled with nothing selected, the
 *           ticks follow the theme and the preferences, and some labels and submenus follow the
 *           project (Recover autosave, the lists of Match colors)
 *   menus   [{ id, label, entries }] in the order of the bar; an entry is
 *           { type: 'item' | 'submenu', testId, label, hint, note, title, shortcut, keys,
 *             disabled, role, checked, swatch, icon, items }, or { type: 'separator' }:
 *             shortcut  as shown on Windows and Linux ("Ctrl+Shift+S"), or null
 *             keys      the same for <kbd data-keys> ("Mod+Shift+S": ⌘ on a Mac)
 *             role      menuitem; menuitemradio (one of a choice) or menuitemcheckbox (a toggle),
 *                       with `checked`
 *             swatch    the colour square before the label ('#rrggbb'), or null
 *             items     a submenu's entries; for a disabled submenu, the entries it has once it
 *                       is enabled, read from the app's code (`itemsFrom` says where)
 *   exportButton  the arrow of the Export… button: the exports, which the bar has no menu of
 *                 (`menus` holds the menus of the bar alone)
 * Both menus files leave out the fields an entry does not have (null, and false for `icon` and
 * `disabled`): an entry has `hint`, `note` and `title` only when the app gives them.
 *
 * `MFE_DATA['reference/menus/context-menus']`: the right-click menus, each opened in the state its
 * scenario brings the app to (`CONTEXT_SCENARIOS` below: a project, then a right click on a clip
 * of each kind, on a block, a relation, a card of the Creator, a glyph…), read with its submenus
 * by `kit.readMenu`:
 *   menus   [{ id, label, testId, entries }]; an entry is { type: 'item' | 'submenu', testId, label,
 *           hint, note, title, shortcut, disabled, role, checked, swatch, icon, items },
 *           { type: 'separator' } or { type: 'header', label }:
 *             hint   the grey text after a label ("and Morph blocks", the times of a copy)
 *             note   the line under an entry that says more about it, when it has one
 *             title  its tooltip: what it does, or why it is off
 *           The colour squares of a Colour menu are items, one per colour (label "Colour WHITE").
 *           The headers carry the clip and the time that were clicked, which the page does not
 *           use; `tools/reference-tables.mjs` makes the page's tables from the rest. */

/** A shortcut as the menus show it on Windows and Linux, written for <kbd data-keys>. */
function dataKeys(shortcut) {
  if (!shortcut) return null;
  if (shortcut === 'Del') return 'Delete';
  return shortcut.replace(/^Ctrl\+/, 'Mod+');
}

/** The kit gives every field of every entry, nulls included; the data keeps the ones that say
 * something (a field that is absent is null, `icon` and `disabled` false). */
function slim(entries) {
  return entries.map((entry) => {
    const out = {};
    for (const [key, value] of Object.entries(entry)) {
      if (value === null || (value === false && (key === 'icon' || key === 'disabled'))) continue;
      out[key] = key === 'items' && Array.isArray(value) ? slim(value) : value;
    }
    return out;
  });
}

function withKeys(entries) {
  return entries.map((entry) => {
    if (entry.type === 'separator' || entry.type === 'header') return entry;
    const { shortcut, items, ...rest } = entry;
    return {
      ...rest,
      shortcut,
      keys: dataKeys(shortcut),
      ...(entry.type === 'submenu' ? { items: items && withKeys(items) } : {}),
    };
  });
}


/** Brings a target into view (a card scrolled out of the Creator, a row below the timeline's
 * visible ones) and right-clicks it. */
async function rightClickAt(kit, target) {
  await kit.reveal(target);
  return kit.contextMenu(target);
}

/** A track of the project, found by the name of a clip's formula: unlocked, so that its clips'
 * menus open (a clip on a locked track has no menu). */
async function unlockAllTracks(kit) {
  await kit.mfe((mfe) => {
    mfe.useProjectStore.getState().update((draft) => {
      for (const track of draft.tracks) track.locked = false;
    });
  });
}

/** Makes a block run with the blocks of a group (`animation-blocks`: the Appear that writes starts
 * with, and lasts as long as, the two Transform blocks of the group), so that the menus of a
 * block and of a group offer to group them. */
async function runWithTheGroup(kit) {
  await kit.mfe((mfe) => {
    mfe.useProjectStore.getState().update((draft) => {
      for (const clip of draft.clips) {
        const write = clip.actions.find((a) => a.kind === 'appear' && a.anim === 'write');
        const member = clip.actions.find((a) => a.kind === 'transform' && a.group);
        if (write && member) {
          write.start = member.start;
          write.duration = member.duration;
          return;
        }
      }
      throw new Error('no Appear (write) block beside a group');
    });
  });
}

/** The id of the Appear (write) block of `runWithTheGroup`. */
function writeBlockId(kit) {
  return kit.mfe((mfe) => {
    for (const clip of mfe.useProjectStore.getState().project.clips) {
      const write = clip.actions.find((a) => a.kind === 'appear' && a.anim === 'write');
      if (write) return write.id;
    }
    return null;
  });
}

/** A right click on an object that lies over or under others in the Preview (a brace, a shape):
 * tried at several points of its box until the menu has the entry that only its kind's menu has. */
async function rightClickObject(page, kit, name, entry) {
  const clipId = await kit.clipId(name);
  const box = await kit.app(
    '/src/ui/preview/geometry.ts',
    (m, id) => m.geometryNow().get(id)?.box ?? null,
    clipId,
  );
  if (!box) throw new Error(`${name} is not drawn in the Preview at the playhead`);
  for (const fy of [0.5, 0.1, 0.9, 0.3, 0.7, 0.02, 0.98]) {
    for (const fx of [0.5, 0.1, 0.9, 0.3, 0.7, 0.02, 0.98]) {
      const point = await kit.scenePoint([
        box.minX + (box.maxX - box.minX) * fx,
        box.minY + (box.maxY - box.minY) * fy,
      ]);
      await kit.contextMenu(point);
      if ((await page.getByTestId(entry).count()) > 0) return kit.menu;
      await kit.closeMenus();
    }
  }
  throw new Error(`no right click on ${name} opened a menu with ${entry}`);
}

/** The project with the Slides mode on: two pauses with notes (`p_pause1` at 1 s, `p_pause2` at
 * 3.2 s) and a comment (`p_glow` at 5.4 s). */
const SLIDES = 'docs/web/examples/slides-talk.mfe.json';

/** A point of the ruler at `t` seconds, in its lower part (the marks stand in the upper part), the
 * timeline fitted to the scene. */
async function slidesRulerAt(kit, t) {
  await kit.click('timeline-fit');
  const ruler = await kit.box('timeline-ruler');
  return { x: await kit.timeToX(t), y: ruler.y + ruler.height * 0.78 };
}

/** The project with a camera: its moves `n_close`, `n_result`, `n_wide` and `n_start`, its target
 * cameras `k_result` and `k_wide`. */
const CAMERA = 'docs/web/examples/camera-moves.mfe.json';

/** The middle of the lower edge of a rectangle of the camera's scene, which the Preview says where
 * it is (`data-camera-scene`: left, top, width, height in CSS px from the canvas corner). */
async function cameraPoint(page, kit, pick) {
  const frame = await kit.box('preview-frame');
  const scene = JSON.parse(await page.getByTestId('preview-frame').getAttribute('data-camera-scene'));
  const [left, top, width, height] = pick(scene);
  return { x: frame.x + left + width / 2, y: frame.y + top + height };
}

/** The scenarios of the `context-menus` data: each opens a project, brings the app to a state and
 * right-clicks a target; the menu that opens is read (submenus too). A scenario that fails is
 * recorded with its error and the rest go on. */
const CONTEXT_SCENARIOS = [
  {
    id: 'timeline-clip-formula',
    project: 'examples/completing-the-square.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.click('timeline-fit');
      return rightClickAt(kit, { clip: 'steps' });
    },
  },
  {
    id: 'timeline-clip-latex-text',
    project: 'examples/text-title.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.click('timeline-fit');
      return rightClickAt(kit, { clip: 'title' });
    },
  },
  {
    id: 'timeline-clip-font-text',
    project: 'examples/text-pango.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.click('timeline-fit');
      return rightClickAt(kit, { clip: 'title' });
    },
  },
  {
    id: 'timeline-clip-brace',
    project: 'examples/braces.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.click('timeline-fit');
      return rightClickAt(kit, { clip: 'first' });
    },
  },
  {
    id: 'timeline-clip-shape',
    project: 'examples/shapes.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.click('timeline-fit');
      return rightClickAt(kit, { clip: 'frame' });
    },
  },
  ...['line', 'arrow'].map((line) => ({
    id: `timeline-clip-${line}`,
    project: 'examples/shapes.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.seek(3);
      await kit.app(
        '/src/ui/preview/lineDraw.ts',
        (m, kind) => m.createLine(kind, { point: [-3, -2.5] }, { point: [3, -2.5] }),
        line,
      );
      await kit.click('timeline-fit');
      return rightClickAt(kit, { clip: 'l1' });
    },
  })),
  {
    id: 'timeline-clips',
    project: 'examples/completing-the-square.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.click('timeline-fit');
      await kit.selectClip(['equation', 'steps']);
      return rightClickAt(kit, { clip: 'steps' });
    },
  },
  {
    // Two clips of one formula: the first entry opens that formula.
    id: 'timeline-clips-one-formula',
    project: 'examples/completing-the-square.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      const first = await kit.clipId('divide_by_a');
      await kit.app('/src/ui/timeline/clipActions.ts', (m, id) => m.duplicateClipsById([id]), first);
      await kit.click('timeline-fit');
      await kit.mfe((mfe) => {
        const { project } = mfe.useProjectStore.getState();
        const formula = project.formulas.find((f) => f.name === 'divide_by_a');
        const ids = project.clips.filter((c) => c.formulaId === formula.id).map((c) => c.id);
        mfe.useUiStore.getState().select({ kind: 'clips', ids });
      });
      return rightClickAt(kit, { clip: 'divide_by_a' });
    },
  },
  {
    // A line among the clips: Paste path shape.
    id: 'timeline-clips-line',
    project: 'examples/shapes.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.seek(3);
      await kit.app(
        '/src/ui/preview/lineDraw.ts',
        (m, kind) => m.createLine(kind, { point: [-3, -2.5] }, { point: [3, -2.5] }),
        'line',
      );
      await kit.click('timeline-fit');
      await kit.selectClip(['sum', 'l1']);
      return rightClickAt(kit, { clip: 'l1' });
    },
  },
  ...[
    ['appear', 'steps', 'Write'],
    ['emphasis', 'square', 'Indicate'],
    ['morph', 'steps', 'Morph'],
    ['transform', 'steps', 'Transform'],
  ].map(([kind, clip, _label]) => ({
    id: `timeline-block-${kind}`,
    project: kind === 'emphasis' ? 'examples/emphasis.mfe.json' : 'examples/completing-the-square.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.click('timeline-fit');
      // The first block of that kind on the clip: found in the project, then by its test id.
      const id = await kit.mfe(
        (mfe, arg) => {
          const { project } = mfe.useProjectStore.getState();
          const formula = project.formulas.find((f) => f.name === arg.clip);
          const clips = project.clips.filter((c) => c.formulaId === formula.id);
          for (const c of clips) {
            const action = c.actions.find((a) => a.kind === arg.kind);
            if (action) return action.id;
          }
          return null;
        },
        { clip, kind },
      );
      if (!id) throw new Error(`no ${kind} block on ${clip}`);
      return rightClickAt(kit, `action-block-${id}`);
    },
  })),
  {
    // An Appear block that starts with a group and lasts as long: Group with the blocks that run with it.
    id: 'timeline-block-peers',
    project: 'examples/animation-blocks.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await runWithTheGroup(kit);
      await kit.click('timeline-fit');
      return rightClickAt(kit, `action-block-${await writeBlockId(kit)}`);
    },
  },
  {
    id: 'timeline-group',
    project: 'examples/animation-blocks.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await runWithTheGroup(kit);
      await kit.click('timeline-fit');
      return rightClickAt(kit, {
        css: '[data-testid^="group-block-"]:not([data-testid$="-start"]):not([data-testid$="-end"])',
      });
    },
  },
  {
    id: 'timeline-block-in-group',
    project: 'examples/animation-blocks.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await runWithTheGroup(kit);
      await kit.click('timeline-fit');
      await (await kit.locate({ css: '[data-testid^="group-unfold-"]' })).first().click();
      const id = await kit.mfe((mfe) => {
        const { project } = mfe.useProjectStore.getState();
        for (const clip of project.clips) {
          const action = clip.actions.find((a) => a.group);
          if (action) return action.id;
        }
        return null;
      });
      return rightClickAt(kit, `action-block-${id}`);
    },
  },
  {
    id: 'timeline-relation',
    project: 'examples/completing-the-square.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.click('timeline-fit');
      return rightClickAt(kit, {
        css: '[data-testid^="relation-window-r_"]:not([data-testid$="-start"]):not([data-testid$="-end"]):not([data-testid^="relation-window-readout"])',
      });
    },
  },
  {
    id: 'preview-clip',
    project: 'examples/completing-the-square.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.seek(18.8);
      const box = await kit.box('preview-canvas');
      for (const fy of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65]) {
        for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
          await kit.contextMenu({ x: box.x + box.width * fx, y: box.y + box.height * fy });
          const id = await page.locator('.ctx-menu').first().getAttribute('data-testid');
          if (id === 'preview-menu') return kit.menu;
          await kit.closeMenus();
        }
      }
      throw new Error('no clip under the pointer in the preview');
    },
  },
  {
    // A brace in the Preview: Add label takes the place of the brace, shape and line entries.
    id: 'preview-brace',
    project: 'examples/shapes.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.seek(8);
      return rightClickObject(page, kit, 'under', 'preview-menu-label');
    },
  },
  {
    // A shape in the Preview: Transform to another formula or glyphs….
    id: 'preview-shape',
    project: 'examples/shapes.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.seek(8);
      return rightClickObject(page, kit, 'frame', 'preview-menu-retarget');
    },
  },
  {
    id: 'preview-space',
    project: 'examples/completing-the-square.mfe.json',
    open: async (page, kit) => {
      await kit.seek(0.2);
      const box = await kit.box('preview-canvas');
      return kit.contextMenu({ x: box.x + 12, y: box.y + 12 });
    },
  },
  {
    id: 'creator-formula',
    project: 'examples/completing-the-square.mfe.json',
    open: async (page, kit) => {
      await kit.clearSelection();
      return rightClickAt(kit, { css: '[data-testid="formula-item"]' });
    },
  },
  {
    // With the multicamera on, the menu of the empty scene also adds to the camera.
    id: 'preview-space-camera',
    project: CAMERA,
    open: async (page, kit) => {
      await kit.seek(1.2);
      const box = await kit.box('preview-canvas');
      return kit.contextMenu({ x: box.x + 12, y: box.y + 12 });
    },
  },
  {
    // A target camera in the Preview's world view, by its lower edge.
    id: 'preview-camera-target',
    project: CAMERA,
    open: async (page, kit) => {
      await kit.seek(1.2);
      return kit.contextMenu(await cameraPoint(page, kit, (r) => r.targets.k_result));
    },
  },
  {
    // The camera itself, by its lower edge.
    id: 'preview-camera',
    project: CAMERA,
    open: async (page, kit) => {
      await kit.seek(3.7);
      return kit.contextMenu(await cameraPoint(page, kit, (r) => r.camera));
    },
  },
  {
    id: 'timeline-camera-move',
    project: CAMERA,
    open: async (page, kit) => rightClickAt(kit, 'camera-move-n_result'),
  },
  {
    // The Camera row where it has no move.
    id: 'timeline-camera-lane',
    project: CAMERA,
    open: async (page, kit) => {
      const lane = await kit.box('camera-lane');
      return kit.contextMenu({ x: await kit.timeToX(0.6), y: lane.y + lane.height / 2 });
    },
  },
  {
    // The ruler with the Slides mode on (slides-talk: it rests over 1–2.2 s, the first relation
    // runs over 2.2–3.2 s), right-clicked where the scene rests and where it animates.
    id: 'slides-ruler-rest',
    project: SLIDES,
    open: async (page, kit) => kit.contextMenu(await slidesRulerAt(kit, 1.8)),
  },
  {
    id: 'slides-ruler-busy',
    project: SLIDES,
    open: async (page, kit) => kit.contextMenu(await slidesRulerAt(kit, 2.7)),
  },
  {
    // A pause (with a note) and a comment of slides-talk.
    id: 'slides-mark-pause',
    project: SLIDES,
    open: async (page, kit) => {
      await kit.click('timeline-fit');
      return rightClickAt(kit, 'slide-mark-p_pause1');
    },
  },
  {
    id: 'slides-mark-comment',
    project: SLIDES,
    open: async (page, kit) => {
      await kit.click('timeline-fit');
      return rightClickAt(kit, 'slide-mark-p_glow');
    },
  },
  {
    id: 'creator-new',
    project: 'examples/completing-the-square.mfe.json',
    open: async (page, kit) => {
      await kit.click('creator-new-menu');
      kit.menu = page.locator('.ctx-menu').first();
      await kit.menu.waitFor({ state: 'visible' });
      return kit.menu;
    },
  },
  {
    id: 'timeline-clip-audio',
    project: 'examples/completing-the-square.mfe.json',
    open: async (page, kit) => {
      await kit.mfe((mfe) => {
        mfe.useProjectStore.getState().update((draft) => {
          draft.tracks.push({ id: 't_voice', kind: 'audio', name: 'Voice', hidden: false, muted: false, locked: false });
          draft.audioAssets.push({
            id: 'as_voice', name: 'Voice', originalName: 'voice.wav', mimeType: 'audio/wav',
            byteLength: 1000, contentHash: '0'.repeat(64), duration: 6, sampleRate: 48000, channels: 1,
          });
          draft.audioClips.push({
            id: 'ac_voice', assetId: 'as_voice', trackId: 't_voice', start: 2, end: 8, sourceStart: 0, volume: [],
          });
        });
      });
      await kit.click('timeline-fit');
      return rightClickAt(kit, 'audio-clip-ac_voice');
    },
  },
  {
    id: 'creator-formulas',
    project: 'examples/completing-the-square.mfe.json',
    open: async (page, kit) => {
      const ids = await kit.mfe((mfe) => {
        const { formulas } = mfe.useProjectStore.getState().project;
        return formulas.slice(0, 2).map((f) => f.id);
      });
      await kit.mfe((mfe, arg) => mfe.useUiStore.getState().select({ kind: 'formulas', ids: arg }), ids);
      return rightClickAt(kit, { css: '[data-testid="formula-item"]' });
    },
  },
  {
    id: 'creator-group',
    project: 'examples/completing-the-square.mfe.json',
    open: async (page, kit) => {
      const ids = await kit.mfe((mfe) => {
        const { formulas } = mfe.useProjectStore.getState().project;
        return formulas.slice(0, 2).map((f) => f.id);
      });
      await kit.mfe((mfe, arg) => mfe.useUiStore.getState().select({ kind: 'formulas', ids: arg }), ids);
      await kit.app('/src/ui/creator/groups/groupActions.ts', (m) => m.groupSelectedFormulas());
      return rightClickAt(kit, { css: '[data-testid="formula-list"] [data-group-id]' });
    },
  },
  {
    id: 'line-end',
    project: 'examples/shapes.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.seek(3);
      await kit.app(
        '/src/ui/preview/lineDraw.ts',
        (m) => m.createLine('arrow', { point: [-3, -2.5] }, { point: [3, -2.5] }),
      );
      return rightClickAt(kit, 'line-end-start');
    },
  },
  {
    id: 'preview-glyph-picked',
    project: 'examples/completing-the-square.mfe.json',
    open: async (page, kit) => {
      await unlockAllTracks(kit);
      await kit.seek(18.8);
      const box = await kit.box('preview-canvas');
      const picked = () =>
        kit.app('/src/ui/preview/glyphPickStore.ts', (m) => {
          const { pick } = m.useGlyphPick.getState();
          return JSON.stringify(pick ?? null).length > 40;
        });
      for (const fy of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65]) {
        for (const fx of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7]) {
          const point = { x: box.x + box.width * fx, y: box.y + box.height * fy };
          await kit.click(point, { hold: ['Alt'] });
          if (await picked()) {
            await kit.contextMenu(point);
            const id = await page.locator('.ctx-menu').first().getAttribute('data-testid');
            if (id === 'preview-menu') return kit.menu;
            await kit.closeMenus();
          }
        }
      }
      throw new Error('no glyph picked in the preview');
    },
  },
  {
    id: 'formula-editor-glyph',
    project: 'examples/completing-the-square.mfe.json',
    close: 'Escape',
    open: async (page, kit) => {
      const id = await kit.mfe((mfe) => {
        const { formulas } = mfe.useProjectStore.getState().project;
        return formulas.find((f) => f.name === 'equation').id;
      });
      await kit.app('/src/ui/creator/formulaEditorStore.ts', (m, arg) => m.openFormulaEditor(arg), id);
      await page.getByTestId('glyph-view').waitFor({ state: 'visible' });
      return rightClickAt(kit, { css: '[data-testid="glyph-view"] [data-testid^="glyph-"][data-testid$="0"]' });
    },
  },
  {
    id: 'relation-editor-glyph',
    project: 'examples/completing-the-square.mfe.json',
    close: 'Escape',
    open: async (page, kit) => {
      await kit.app(
        '/src/ui/relations/relationEditorStore.ts',
        (m) => m.openRelationEditor({ kind: 'edit', relationId: 'r_eq_steps' }),
      );
      await page.getByTestId('rel-canvas').waitFor({ state: 'visible' });
      const from = await kit.mfe((mfe) => {
        const { relations } = mfe.useProjectStore.getState().project;
        return relations.find((r) => r.id === 'r_eq_steps').pairs[0].from[0];
      });
      return rightClickAt(kit, `rel-from-glyph-${from}`);
    },
  },
];

/** Opens each scenario's menu and reads it (submenus too); a scenario that fails fails the item,
 * and the tool leaves a screenshot and the state of the app where it says. */
async function readContextMenus(page, kit) {
  const out = [];
  for (const scenario of CONTEXT_SCENARIOS) {
    await kit.loadProject(scenario.project);
    await kit.closeMenus();
    await scenario.open(page, kit);
    const menu = page.locator('.ctx-menu').first();
    const label = await menu.getAttribute('aria-label');
    const testId = await menu.getAttribute('data-testid');
    const entries = await kit.readMenu(menu);
    await kit.closeMenus();
    if (scenario.close) await kit.press(scenario.close);
    out.push({ id: scenario.id, label, testId, entries: slim(entries) });
  }
  return out;
}

/** The box round a menu button and every popup open under it (a menu and its submenus). */
const popupsBox = (button) => async (page) => {
  const boxes = await page.evaluate((id) => {
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const nodes = [document.querySelector(`[data-testid="${id}"]`), ...document.querySelectorAll('.menu-popup')];
    return nodes.filter(Boolean).map(rect);
  }, button);
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/** Two clips of the derivation selected and the playhead where both are on screen, so that the
 * Edit menu shows its entries as they are when there is something to act on. */
async function selectSomething(page, kit) {
  await kit.seek(13.1);
  await kit.selectClip(['steps', 'half_b_squared', 'title']);
}

export default {
  page: 'reference/menus',
  project: 'examples/completing-the-square.mfe.json',
  items: [
    {
      kind: 'data',
      name: 'menu-bar',
      extract: async (page, kit) => {
        const bar = await page
          .getByTestId('menu-bar')
          .locator('.menu-button')
          .evaluateAll((buttons) =>
            buttons.map((button) => ({
              id: button.dataset.testid.replace(/^menu-/, ''),
              label: button.textContent.trim(),
            })),
          );
        const menus = [];
        for (const { id, label } of bar) {
          const entries = await kit.readMenu(await kit.openMenu(label));
          await kit.closeMenus();
          menus.push({ id, label, entries: withKeys(entries) });
        }
        // Paste properties is disabled until a clip's properties are copied: its entries are
        // the app's PASTE_GROUPS, each shown with the copied value in brackets.
        const groups = await kit.app('/src/ui/preview/propertyClipboard.ts', (m) => m.PASTE_GROUPS);
        const edit = menus.find((menu) => menu.id === 'edit');
        const paste = edit?.entries.find(
          (entry) => entry.testId === 'menu-item-edit-paste-properties',
        );
        if (paste && paste.items === null) {
          paste.items = groups.map((group) => ({
            type: 'item',
            testId: `menu-item-edit-paste-properties-${group.id}`,
            label: group.label,
            shortcut: null,
            keys: null,
            disabled: false,
            role: 'menuitem',
            checked: null,
            swatch: null,
            icon: false,
          }));
          paste.itemsFrom =
            'PASTE_GROUPS, app/src/ui/preview/propertyClipboard.ts (the menu adds the copied ' +
            'value in brackets after each label)';
        }
        // The arrow of the Export… button lists every export (the bar has no Export menu).
        await kit.click('export-button-menu');
        kit.menu = page.locator('.menu-popup[aria-label="Export"]').first();
        await kit.menu.waitFor({ state: 'visible' });
        const quick = withKeys(await kit.readMenu());
        await kit.closeMenus();
        return {
          state: {
            project: 'examples/completing-the-square.mfe.json',
            selection: 'nothing selected',
            theme: 'dark, the default choice (View ▸ Theme ticks it)',
            preferences: 'the defaults (Edit, View and Preferences tick them)',
            system: 'Linux (the shortcuts as Windows and Linux show them)',
          },
          menus: menus.map((menu) => ({ ...menu, entries: slim(menu.entries) })),
          exportButton: {
            testId: 'export-button-menu',
            entries: slim(quick),
          },
        };
      },
    },
    {
      // The menu bar with the File menu open.
      kind: 'shot',
      name: 'menu-file',
      setup: async (page, kit) => {
        await kit.openMenu('File');
      },
      target: popupsBox('menu-file'),
      padding: 10,
    },
    {
      // Edit with three clips selected: Align and Distribute can act.
      kind: 'shot',
      name: 'menu-edit',
      setup: async (page, kit) => {
        await selectSomething(page, kit);
        await kit.openMenu('Edit ▸ Align');
      },
      target: popupsBox('menu-edit'),
      padding: 10,
    },
    {
      kind: 'shot',
      name: 'menu-view',
      setup: async (page, kit) => {
        await kit.openMenu('View ▸ Theme');
      },
      target: popupsBox('menu-view'),
      padding: 10,
    },
    {
      kind: 'shot',
      name: 'menu-preferences',
      setup: async (page, kit) => {
        await kit.openMenu('Preferences ▸ Guide colour');
      },
      target: popupsBox('menu-preferences'),
      padding: 10,
    },
    {
      // The arrow of the Export… button, open: the six exports.
      kind: 'shot',
      name: 'export-button',
      setup: async (page, kit) => {
        await kit.click('export-button-menu');
      },
      target: async (page) => {
        const popup = await page.locator('.menu-popup').first().boundingBox();
        const button = await page.getByTestId('export-button').boundingBox();
        const arrow = await page.getByTestId('export-button-menu').boundingBox();
        const left = Math.min(button.x, popup.x);
        const right = Math.max(arrow.x + arrow.width, popup.x + popup.width);
        return { x: left, y: button.y, width: right - left, height: popup.y + popup.height - button.y };
      },
      padding: 10,
    },
    {
      // Help with its Examples open: the example projects the app carries.
      kind: 'shot',
      name: 'menu-help',
      setup: async (page, kit) => {
        await kit.openMenu('Help ▸ Examples');
      },
      target: popupsBox('menu-help'),
      padding: 10,
    },
    {
      // The right-click menu of a clip: Add animation, with Add brace's entries beside it.
      kind: 'shot',
      name: 'clip-menu',
      setup: async (page, kit) => {
        await kit.click('timeline-fit');
        await kit.contextMenu({ clip: 'steps' });
        await kit.openSubmenu('Add shape');
      },
      target: async (page) => {
        const boxes = await page.locator('.ctx-menu').evaluateAll((nodes) =>
          nodes.map((n) => {
            const r = n.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          }),
        );
        const left = Math.min(...boxes.map((b) => b.x));
        const top = Math.min(...boxes.map((b) => b.y));
        const right = Math.max(...boxes.map((b) => b.x + b.width));
        const bottom = Math.max(...boxes.map((b) => b.y + b.height));
        return { x: left, y: top, width: right - left, height: bottom - top };
      },
      padding: 10,
    },
    {
      kind: 'data',
      name: 'context-menus',
      extract: async (page, kit) => ({ menus: await readContextMenus(page, kit) }),
    },
  ],
};
