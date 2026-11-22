/* Captures of reference/troubleshooting: what the app shows when something does not work, made by
 * putting the app in that state — through its own modules, never by drawing the messages here.
 *
 *   formula-error      a formula whose source uses a command of a package it does not load: the
 *                      card of the Creator shows the app's own message and the package to add
 *   file-access        the notice a browser without file access gets (Firefox, Safari), made with
 *                      the app's own `fileAccessNotice` for a browser that has neither the file nor
 *                      the folder pickers
 *   font-text          the Creator's cards of font texts that nothing has shaped (the example's
 *                      saved geometry taken off, no companion in these runs): boxes, and a badge
 *                      that says "needs the companion"
 *
 * `MFE_DATA['reference/troubleshooting/messages']`: the app's own words for the cases the page
 * explains, read from its code so that the page quotes them as they are:
 *   fileAccess     the notice's title, message and details for a browser with no file access
 *   offline        the message of a formula forced to LaTeX while the companion is not running
 *   noLatex        the message for a companion that cannot run LaTeX
 *   command        what the Renderer badge's tooltip tells to type to start the companion, from the
 *                  app opened from disk and from a server */

export default {
  page: 'reference/troubleshooting',
  project: 'examples/hello.mfe.json',
  items: [
    {
      kind: 'data',
      name: 'messages',
      extract: (page, kit) =>
        kit.evaluate(async () => {
          const access = await import('/src/ui/project/fileAccess.ts');
          const engine = await import('/src/engine/engine.ts');
          const companion = await import('/src/engine/companion.ts');
          return {
            source: 'app/src/ui/project/fileAccess.ts, app/src/engine/engine.ts, app/src/engine/companion.ts',
            fileAccess: access.fileAccessNotice({ files: false, folders: false }),
            fileAccessFolderOnly: access.fileAccessNotice({ files: true, folders: false }),
            offline: engine.offlineMessage(),
            noLatex: engine.NO_LATEX_MESSAGE,
            command: {
              server: companion.companionCommand('http:', 'Linux x86_64'),
              disk: companion.companionCommand('file:', 'Linux x86_64'),
              windows: companion.companionCommand('file:', 'Win32'),
            },
          };
        }),
    },
    {
      // \qty is a command of the physics package, which the formula does not load.
      kind: 'shot',
      name: 'formula-error',
      setup: async (page, kit) => {
        await kit.mfe((mfe) => {
          mfe.useProjectStore.getState().update((draft) => {
            draft.formulas[0].source = '\\qty(x+1)';
          });
        });
        await kit.waitForRenders();
        await page.getByTestId('formula-error').first().waitFor({ state: 'visible' });
      },
      target: { css: '[data-testid="formula-list"] [data-testid="formula-item"]' },
      padding: 6,
    },
    {
      kind: 'shot',
      name: 'file-access',
      setup: async (page, kit) => {
        const notice = await kit.app('/src/ui/project/fileAccess.ts', (m) =>
          m.fileAccessNotice({ files: false, folders: false }),
        );
        await kit.app(
          '/src/ui/project/noticeStore.ts',
          (m, shown) => m.notify({ kind: 'info', sticky: true, ...shown }),
          notice,
        );
        await page.getByTestId('notice').first().waitFor({ state: 'visible' });
      },
      target: 'notice-host',
      padding: 8,
    },
    {
      // The font texts of the example, as if nothing had ever shaped them: no saved geometry, and
      // no companion in these runs, so the app draws placeholder boxes and says what is missing.
      kind: 'shot',
      name: 'font-text',
      project: 'examples/text-pango.mfe.json',
      setup: async (page, kit) => {
        await kit.mfe((mfe) => {
          mfe.useProjectStore.getState().update((draft) => {
            for (const formula of draft.formulas) {
              if (formula.kind === 'text') formula.geometry = null;
            }
          });
        });
        await kit.waitForRenders();
      },
      target: { css: '[data-testid="formula-list"]' },
      padding: 6,
    },
  ],
};
