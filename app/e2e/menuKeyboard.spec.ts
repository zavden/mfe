import { expect, test, type Page } from './test';

/* The menu bar from the keyboard (MenuBar, MenuPopup): ↓, ↑ and Enter open a menu on its first
 * or last item, ←/→ change menu from inside one, Home and End jump, a letter goes to the next
 * menu or entry with that initial, Tab leaves, Escape closes one level at a time (the submenu
 * levels are in app.spec.ts). */

const menu = (page: Page, name: string) => page.getByRole('menu', { name, exact: true });

/** Which enabled entry of the open menu `name` has the focus: 'first', 'last', its index, or
 * null when the focus is elsewhere. */
const focusedEntry = (page: Page, name: string) =>
  page.evaluate((label) => {
    const popup = document.querySelector(`[role="menu"][aria-label="${label}"]`);
    if (!popup) return null;
    const entries = [
      ...popup.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)'),
    ].filter((entry) => entry.closest('[role="menu"]') === popup);
    const at = entries.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return null;
    return at === 0 ? 'first' : at === entries.length - 1 ? 'last' : at;
  }, name);

test('↓, ↑ and Enter open a menu on its first or last item; ←/→ change menu; Tab leaves', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('menu-file').focus();
  await page.keyboard.press('ArrowDown');
  await expect(menu(page, 'File')).toBeVisible();
  expect(await focusedEntry(page, 'File')).toBe('first');
  await page.keyboard.press('ArrowRight');
  await expect(menu(page, 'File')).toHaveCount(0);
  await expect(menu(page, 'Edit')).toBeVisible();
  expect(await focusedEntry(page, 'Edit')).toBe('first');
  await page.keyboard.press('ArrowLeft');
  await expect(menu(page, 'File')).toBeVisible();
  expect(await focusedEntry(page, 'File')).toBe('first');
  await page.keyboard.press('End');
  expect(await focusedEntry(page, 'File')).toBe('last');
  await page.keyboard.press('Home');
  expect(await focusedEntry(page, 'File')).toBe('first');
  // ← from the first menu wraps to the last one, and → back.
  await page.keyboard.press('ArrowLeft');
  await expect(menu(page, 'Help')).toBeVisible();
  expect(await focusedEntry(page, 'Help')).toBe('first');
  await page.keyboard.press('ArrowRight');
  await expect(menu(page, 'File')).toBeVisible();
  // Tab leaves the menu and goes on from its button.
  await page.keyboard.press('Tab');
  await expect(menu(page, 'File')).toHaveCount(0);
  await expect(page.getByTestId('menu-edit')).toBeFocused();

  // ↑ opens on the last item; Escape closes and keeps the button; Enter opens on the first.
  await page.getByTestId('menu-view').focus();
  await page.keyboard.press('ArrowUp');
  await expect(menu(page, 'View')).toBeVisible();
  expect(await focusedEntry(page, 'View')).toBe('last');
  await page.keyboard.press('Escape');
  await expect(menu(page, 'View')).toHaveCount(0);
  await expect(page.getByTestId('menu-view')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu(page, 'View')).toBeVisible();
  expect(await focusedEntry(page, 'View')).toBe('first');
  await page.keyboard.press('Escape');
  await expect(menu(page, 'View')).toHaveCount(0);
  // A click still opens without moving the focus into the menu.
  await page.getByTestId('menu-view').click();
  await expect(menu(page, 'View')).toBeVisible();
  expect(await focusedEntry(page, 'View')).toBeNull();
  await page.keyboard.press('Escape');
});

test('a letter goes to the next menu, or entry, with that initial', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('menu-view').focus();
  await page.keyboard.press('e'); // after View, wrapping: Edit
  await expect(page.getByTestId('menu-edit')).toBeFocused();
  await page.keyboard.press('p'); // Preferences
  await expect(page.getByTestId('menu-preferences')).toBeFocused();
  await page.keyboard.press('x'); // Export is a button beside the menus, not a menu: stays
  await expect(page.getByTestId('menu-preferences')).toBeFocused();
  await page.keyboard.press('h');
  await expect(page.getByTestId('menu-help')).toBeFocused();
  await page.keyboard.press('e'); // wraps to Edit
  await expect(page.getByTestId('menu-edit')).toBeFocused();
  await page.keyboard.press('z'); // no such menu: stays
  await expect(page.getByTestId('menu-edit')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu(page, 'Edit')).toBeVisible();
  // Inside a menu, among its enabled entries (nothing to undo, no selection: Align is first).
  await expect(page.getByTestId('menu-item-edit-align')).toBeFocused();
  await page.keyboard.press('d');
  await expect(page.getByTestId('menu-item-edit-distribute')).toBeFocused();
  await page.keyboard.press('a');
  await expect(page.getByTestId('menu-item-edit-auto-intro')).toBeFocused();
  await page.keyboard.press('a');
  await expect(page.getByTestId('menu-item-edit-auto-outro')).toBeFocused();
  await page.keyboard.press('a'); // wraps
  await expect(page.getByTestId('menu-item-edit-align')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page, 'Edit')).toHaveCount(0);
  await expect(page.getByTestId('menu-edit')).toBeFocused();
});
