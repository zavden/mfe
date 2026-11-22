import { describe, expect, it, vi } from 'vitest';
import type { MenuEntry, MenuItemDef, SubmenuDef } from '../MenuPopup';
import { GUIDE_COLORS, GUIDE_WIDTHS, LOCKED_OPACITIES, defaultPreferences } from '../preferences';
import { preferencesMenuItems } from '../preferencesMenu';

const items = (patch = {}, set = vi.fn()) => ({
  entries: preferencesMenuItems({ ...defaultPreferences(), ...patch }, set),
  set,
});
const submenu = (entries: MenuEntry[], id: string) =>
  entries.find((e): e is SubmenuDef => e.type === 'submenu' && e.id === id)!;
const choices = (menu: SubmenuDef) => menu.items as MenuItemDef[];
const checked = (menu: SubmenuDef) =>
  choices(menu)
    .filter((i) => i.checked)
    .map((i) => i.id);

describe('the Preferences menu', () => {
  it('lists snapping, the guide colour and width, then the grid', () => {
    const { entries } = items();
    expect(entries.map((e) => `${e.type}:${e.id}`)).toEqual([
      'item:snap-objects',
      'separator:sep-guides',
      'submenu:guide-color',
      'submenu:guide-width',
      'submenu:pick-color',
      'separator:sep-handles',
      'item:keep-handles',
      'submenu:scale-step',
      'submenu:locked-opacity',
      'separator:sep-grid',
      'item:show-grid',
      'submenu:grid-step',
      'submenu:grid-anchor',
      'separator:sep-camera',
      'item:camera-route',
      'item:camera-veil',
      'separator:sep-new',
      'item:standard-scale',
      'item:split-suffix',
      'separator:sep-layout',
      'item:zen-mode',
    ]);
    expect(submenu(entries, 'guide-color').label).toBe('Guide colour');
    expect(submenu(entries, 'guide-width').label).toBe('Guide width');
    expect(submenu(entries, 'pick-color').label).toBe('Glyph selection colour');
    expect(submenu(entries, 'scale-step').label).toBe('Scale step');
    expect(submenu(entries, 'locked-opacity').label).toBe('Locked formulas');
    expect(submenu(entries, 'grid-step').label).toBe('Grid spacing');
    expect(submenu(entries, 'grid-anchor').label).toBe('Grid snaps');
  });

  it('shows the grid, its spacing and what it snaps, and checks the current choices', () => {
    const { entries, set } = items({ grid: true, gridStep: 0.5, gridAnchor: 'edges' });
    const show = entries.find((e) => e.id === 'show-grid') as MenuItemDef;
    expect(show).toMatchObject({ label: 'Show grid', checked: true, checkbox: true });
    show.onSelect?.({} as never);
    expect(set).toHaveBeenCalledWith({ grid: false });
    const steps = submenu(entries, 'grid-step');
    expect(choices(steps).map((i) => i.id)).toEqual(['2', '1', '0.5', '0.25', '0.1']);
    expect(choices(steps).map((i) => i.label)).toEqual([
      '2 units',
      '1 unit',
      '0.5 units',
      '0.25 units',
      '0.1 units',
    ]);
    expect(checked(steps)).toEqual(['0.5']);
    choices(steps)[4]!.onSelect?.({} as never);
    expect(set).toHaveBeenCalledWith({ gridStep: 0.1 });
    const anchors = submenu(entries, 'grid-anchor');
    expect(choices(anchors).map((i) => i.id)).toEqual(['center', 'edges']);
    expect(checked(anchors)).toEqual(['edges']);
    choices(anchors)[0]!.onSelect?.({} as never);
    expect(set).toHaveBeenCalledWith({ gridAnchor: 'center' });
  });

  it('offers four scale steps and a custom one, which opens the dialog and shows the chosen text', () => {
    const { entries, set } = items({ scaleStep: '0.1' });
    const steps = submenu(entries, 'scale-step');
    expect(choices(steps).map((i) => i.id)).toEqual(['0.05', '0.1', '0.15', '0.2', 'custom']);
    expect(choices(steps).map((i) => i.label)).toEqual(['0.05', '0.1', '0.15', '0.2', 'Custom…']);
    expect(checked(steps)).toEqual(['0.1']);
    choices(steps)[3]!.onSelect?.({} as never);
    expect(set).toHaveBeenCalledWith({ scaleStep: '0.2' });
    const onCustom = vi.fn();
    const custom = preferencesMenuItems(
      { ...defaultPreferences(), scaleStep: '1/3' },
      set,
      onCustom,
    );
    const customSteps = submenu(custom, 'scale-step');
    expect(checked(customSteps)).toEqual(['custom']);
    expect(choices(customSteps)[4]!.label).toBe('Custom (1/3 = 0.3333)…');
    choices(customSteps)[4]!.onSelect?.({} as never);
    expect(onCustom).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1); // the dialog saves, not the menu
  });

  it('offers Split suffix…, with the current suffix in its label; it opens the dialog', () => {
    const item = (entries: MenuEntry[]) =>
      entries.find((e): e is MenuItemDef => e.type === 'item' && e.id === 'split-suffix')!;
    expect(item(items().entries).label).toBe('Split suffix (_s)…');
    const { entries, set } = items({ splitSuffix: '_part2' });
    expect(item(entries)).toMatchObject({ label: 'Split suffix (_part2)…' });
    expect(item(entries).checked).toBeUndefined();
    // Selecting it does nothing but call the callback: the dialog saves, not the menu.
    expect(() => item(entries).onSelect?.({} as never)).not.toThrow();
    const onSplitSuffix = vi.fn();
    const onCustomScaleStep = vi.fn();
    const onStandardScale = vi.fn();
    const wired = preferencesMenuItems(
      defaultPreferences(),
      set,
      onCustomScaleStep,
      onStandardScale,
      onSplitSuffix,
    );
    item(wired).onSelect?.({} as never);
    expect(onSplitSuffix).toHaveBeenCalledTimes(1);
    expect(onCustomScaleStep).not.toHaveBeenCalled();
    expect(onStandardScale).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    // The callbacks before it keep their places.
    (wired.find((e) => e.id === 'standard-scale') as MenuItemDef).onSelect?.({} as never);
    expect(onStandardScale).toHaveBeenCalledTimes(1);
    expect(onSplitSuffix).toHaveBeenCalledTimes(1);
  });

  it('toggles Keep the transform handles shown, a checkbox that shows the preference', () => {
    const { entries, set } = items({ keepHandles: true });
    const item = entries.find((e) => e.id === 'keep-handles') as MenuItemDef;
    expect(item).toMatchObject({ checkbox: true, checked: true });
    item.onSelect?.({} as never);
    expect(set).toHaveBeenCalledWith({ keepHandles: false });
  });

  it('toggles Snap to objects, a checkbox that shows the preference', () => {
    const { entries, set } = items({ snapObjects: true });
    const snap = entries[0] as MenuItemDef;
    expect(snap).toMatchObject({ label: 'Snap to objects', checked: true, checkbox: true });
    snap.onSelect?.({} as never);
    expect(set).toHaveBeenCalledWith({ snapObjects: false });
    const off = items({ snapObjects: false });
    expect((off.entries[0] as MenuItemDef).checked).toBe(false);
    (off.entries[0] as MenuItemDef).onSelect?.({} as never);
    expect(off.set).toHaveBeenCalledWith({ snapObjects: true });
  });

  it('offers every guide colour, with its swatch, and checks the current one', () => {
    const { entries, set } = items({ guideColor: '#ff5c8d' });
    const colours = submenu(entries, 'guide-color');
    expect(choices(colours).map((i) => [i.id, i.label, i.swatch])).toEqual(
      GUIDE_COLORS.map((c) => [c.id, c.label, c.value]),
    );
    expect(checked(colours)).toEqual(['magenta']);
    choices(colours)
      .find((i) => i.id === 'cyan')!
      .onSelect?.({} as never);
    expect(set).toHaveBeenCalledWith({ guideColor: '#4cc9f0' });
  });

  it('offers the same colours for the glyphs picked with Alt, a preference of its own', () => {
    const { entries, set } = items({ pickColor: '#6ee76e', guideColor: '#ff5c8d' });
    const colours = submenu(entries, 'pick-color');
    expect(choices(colours).map((i) => [i.id, i.label, i.swatch])).toEqual(
      GUIDE_COLORS.map((c) => [c.id, c.label, c.value]),
    );
    expect(checked(colours)).toEqual(['green']);
    expect(checked(submenu(entries, 'guide-color'))).toEqual(['magenta']);
    choices(colours)
      .find((i) => i.id === 'white')!
      .onSelect?.({} as never);
    expect(set).toHaveBeenCalledWith({ pickColor: '#ffffff' });
    // Yellow, the guides' own default, until another is chosen.
    expect(checked(submenu(items().entries, 'pick-color'))).toEqual(['yellow']);
    expect(checked(submenu(items({ pickColor: '#FFE74C' }).entries, 'pick-color'))).toEqual([
      'yellow',
    ]);
  });

  it('checks the colour whatever the case of the stored one, and none for a colour not listed', () => {
    expect(checked(submenu(items({ guideColor: '#FFE74C' }).entries, 'guide-color'))).toEqual([
      'yellow',
    ]);
    expect(checked(submenu(items({ guideColor: '#123456' }).entries, 'guide-color'))).toEqual([]);
  });

  it('offers how faded the preview draws the locked formulas, and checks the current one', () => {
    const { entries, set } = items();
    const locked = submenu(entries, 'locked-opacity');
    expect(choices(locked).map((i) => [i.id, i.label])).toEqual([
      ['20', '20 %'],
      ['30', '30 %'],
      ['40', '40 %'],
      ['50', '50 %'],
      ['60', '60 %'],
      ['80', '80 %'],
      ['100', '100 % (not faded)'],
    ]);
    expect(choices(locked).map((i) => Number(i.id) / 100)).toEqual(LOCKED_OPACITIES);
    // 40 % until another is chosen.
    expect(checked(locked)).toEqual(['40']);
    choices(locked)[6]!.onSelect?.({} as never);
    expect(set).toHaveBeenCalledWith({ lockedOpacity: 1 });
    expect(checked(submenu(items({ lockedOpacity: 0.8 }).entries, 'locked-opacity'))).toEqual([
      '80',
    ]);
    // An opacity of the user's own (a stored one the menu does not list): none is checked.
    expect(checked(submenu(items({ lockedOpacity: 0.45 }).entries, 'locked-opacity'))).toEqual([]);
  });

  it('offers the three widths and checks the current one', () => {
    const { entries, set } = items({ guideWidth: 'thick' });
    const widths = submenu(entries, 'guide-width');
    expect(choices(widths).map((i) => [i.id, i.label])).toEqual([
      ['thin', 'Thin'],
      ['regular', 'Regular'],
      ['thick', 'Thick'],
    ]);
    expect(choices(widths).map((i) => i.id)).toEqual(Object.keys(GUIDE_WIDTHS));
    expect(checked(widths)).toEqual(['thick']);
    choices(widths)[1]!.onSelect?.({} as never);
    expect(set).toHaveBeenCalledWith({ guideWidth: 'regular' });
  });

  it('shows or hides the route of the camera and the veil over what it leaves out', () => {
    const entry = (entries: MenuEntry[], id: string) =>
      entries.find((e): e is MenuItemDef => e.type === 'item' && e.id === id)!;
    const on = items();
    expect(entry(on.entries, 'camera-route')).toMatchObject({
      label: 'Show the camera’s route',
      checkbox: true,
      checked: true,
    });
    expect(entry(on.entries, 'camera-veil')).toMatchObject({
      label: 'Dim what the camera leaves out',
      checkbox: true,
      checked: true,
    });
    entry(on.entries, 'camera-route').onSelect?.({} as never);
    expect(on.set).toHaveBeenCalledWith({ cameraRoute: false });
    entry(on.entries, 'camera-veil').onSelect?.({} as never);
    expect(on.set).toHaveBeenCalledWith({ cameraVeil: false });
    const off = items({ cameraRoute: false, cameraVeil: false });
    expect(entry(off.entries, 'camera-route').checked).toBe(false);
    entry(off.entries, 'camera-veil').onSelect?.({} as never);
    expect(off.set).toHaveBeenCalledWith({ cameraVeil: true });
  });

  it('turns Zen mode on and off, a checkbox at its end', () => {
    const off = items();
    const entry = (entries: MenuEntry[]) =>
      entries.find((e): e is MenuItemDef => e.type === 'item' && e.id === 'zen-mode')!;
    expect(entry(off.entries)).toMatchObject({ label: 'Zen mode', checkbox: true, checked: false });
    entry(off.entries).onSelect?.({} as never);
    expect(off.set).toHaveBeenCalledWith({ zenMode: true });
    const on = items({ zenMode: true });
    expect(entry(on.entries).checked).toBe(true);
    entry(on.entries).onSelect?.({} as never);
    expect(on.set).toHaveBeenCalledWith({ zenMode: false });
  });
});
