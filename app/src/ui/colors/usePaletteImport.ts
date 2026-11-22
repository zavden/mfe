/* A palette file chosen in a dialog: read, validated and stored in the editor's library. The
 * dialog draws the button and says what went wrong; `pick` opens the file picker from the click
 * itself, because a browser opens it only on the user's own gesture. */
import { useEffect, useRef, type ChangeEvent } from 'react';
import { MAX_PALETTE_BYTES, parsePalette } from './palette';
import { usePaletteStore } from './paletteStore';

/** A palette that has just entered the library. */
export interface ImportedPalette {
  id: string;
  /** Its stored source as JSON: it finds the entry again when a later save gives it the id
   * another tab stored first. */
  sourceSignature: string;
  warnings: string[];
}

interface PaletteImportOptions {
  onImported(palette: ImportedPalette): void;
  /** The reason a file was refused; `null` when the next import starts. */
  onError(message: string | null): void;
}

export function usePaletteImport(options: PaletteImportOptions) {
  const importPalette = usePaletteStore((state) => state.importPalette);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  // A newer file, or the dialog closing, drops a read that has not finished.
  const turn = useRef({ value: 0 });
  useEffect(() => {
    const current = turn.current;
    return () => {
      current.value++;
    };
  }, []);

  /** Read, validate and store one theme; `read` gives its JSON text. The dialog hears of it as
   * long as no newer import has started and it is still open. */
  const run = (read: () => Promise<string> | string): Promise<ImportedPalette> => {
    const mine = ++turn.current.value;
    const current = () => mine === turn.current.value;
    latest.current.onError(null);
    return (async () => {
      const text = await read();
      if (!current()) throw new Error('This import was replaced by a newer one.');
      const result = parsePalette(text);
      const imported: ImportedPalette = {
        id: await importPalette(result.palette),
        sourceSignature: JSON.stringify(result.palette),
        warnings: result.warnings.map((warning) => warning.message),
      };
      if (current()) latest.current.onImported(imported);
      return imported;
    })().catch((reason: unknown) => {
      if (current())
        latest.current.onError(reason instanceof Error ? reason.message : String(reason));
      throw reason;
    });
  };

  const importFiles = (files: readonly File[]) => {
    void run(() => {
      if (files.length !== 1) throw new Error('Import one palette file at a time.');
      const file = files[0]!;
      if (file.size > MAX_PALETTE_BYTES)
        throw new Error('Palette files must be no larger than 1 MiB.');
      return file.text();
    }).catch(() => {
      // The dialog has been told.
    });
  };

  /** A theme handed over as data (Chroma Lab's Send button): the checks and the library of a
   * file. Resolves to what entered the library; rejects with the reason, which the dialog has
   * been told as well. */
  const importTheme = (theme: unknown): Promise<ImportedPalette> =>
    run(() => {
      const text: unknown = JSON.stringify(theme);
      if (typeof text !== 'string') throw new TypeError('The theme carries no data.');
      return text;
    });

  return {
    importFiles,
    importTheme,
    /** Open the file picker (call it from the click handler itself). */
    pick: () => input.current?.click(),
    /** The hidden file input behind `pick`: spread it on an `<input>`. */
    input: {
      ref: input,
      type: 'file',
      accept: '.json,application/json',
      hidden: true,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const files = [...(event.currentTarget.files ?? [])];
        event.currentTarget.value = '';
        if (files.length > 0) importFiles(files);
      },
    },
  } as const;
}
