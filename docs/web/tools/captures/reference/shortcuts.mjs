/* Data of reference/shortcuts: the app's own shortcut sheet, the one Help ▸ Keyboard
 * shortcuts… shows (`app/src/ui/help/shortcutSheet.ts`; the README's table holds the same rows).
 *
 * `MFE_DATA['reference/shortcuts/sheet']`:
 *   groups  [{ title, rows: [{ keys, where, what, lines }] }]  SHORTCUT_GROUPS, each row with
 *           `lines`: its keys as the sheet draws them as key caps (`parseKeys` of
 *           `app/src/ui/help/keyCaps.ts`), one line per "; " part — `{ combos: [{ separator,
 *           parts: [{ kind: 'key' | 'gesture', text }], keys }], note }`, where `keys` is the
 *           combination written for <kbd data-keys> ("Ctrl/⌘" is Mod), or null when it holds
 *           a gesture ("wheel"). A row whose keys or words are others on a Mac has `mac`: what
 *           the sheet shows there in their place ({ keys?, where?, what? }, in the same notation:
 *           "Ctrl" is the Control key itself), with `lines` for its keys when it has them
 *   rows    SHORTCUT_ROWS: every row, in order ({ keys, where, what, mac? })
 *   clicks  CLICK_GESTURES: the mouse gestures, one paragraph */
export default {
  page: 'reference/shortcuts',
  items: [
    {
      kind: 'data',
      name: 'sheet',
      extract: (page, kit) =>
        kit.evaluate(async () => {
          const sheet = await import('/src/ui/help/shortcutSheet.ts');
          const { parseKeys } = await import('/src/ui/help/keyCaps.ts');
          const dataKey = (text) => (text === 'Ctrl/⌘' ? 'Mod' : text);
          const lines = (keys) =>
            parseKeys(keys).map(({ combos, note }) => ({
              combos: combos.map(({ separator, combo }) => ({
                separator,
                parts: combo.parts,
                keys: combo.parts.every((part) => part.kind === 'key')
                  ? combo.parts.map((part) => dataKey(part.text)).join('+')
                  : null,
              })),
              note,
            }));
          return {
            source: 'app/src/ui/help/shortcutSheet.ts',
            groups: sheet.SHORTCUT_GROUPS.map((group) => ({
              title: group.title,
              rows: group.rows.map(({ mac, ...row }) => ({
                ...row,
                lines: lines(row.keys),
                ...(mac ? { mac: { ...mac, ...(mac.keys ? { lines: lines(mac.keys) } : {}) } } : {}),
              })),
            })),
            rows: sheet.SHORTCUT_ROWS,
            clicks: sheet.CLICK_GESTURES,
          };
        }),
    },
    {
      // Help ▸ Keyboard shortcuts…: the sheet this page is built from.
      kind: 'shot',
      name: 'sheet-dialog',
      setup: async (page, kit) => {
        await kit.choose('Help ▸ Keyboard shortcuts…');
        await page.getByTestId('shortcuts-dialog').waitFor({ state: 'visible' });
      },
      target: 'shortcuts-dialog',
      padding: 8,
    },
  ],
};
