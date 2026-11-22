/* The names of a project's recordings, as the Audio tab keeps them apart on import: a recording
 * that comes in under a name another one has is given a name of its own first. */
import type { AudioAsset } from '../../model';

type Named = Pick<AudioAsset, 'name'>;

/** Whether a recording of `assets` is called `name`. The spaces around a name are no part of
 * it. */
export function audioNameTaken(assets: readonly Named[], name: string): boolean {
  const wanted = name.trim();
  return assets.some((asset) => asset.name.trim() === wanted);
}

/** `name 2`, `name 3`…: the first that no recording of `assets` has. */
export function freeAudioName(assets: readonly Named[], name: string): string {
  const base = name.trim();
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!audioNameTaken(assets, candidate)) return candidate;
  }
}

/** What the dialog asks (`promptDialog`) when the file `fileName` comes in as `name`, which a
 * recording of `assets` has: another name, starting from the first free one. */
export function audioNamePrompt(assets: readonly Named[], name: string, fileName: string) {
  return {
    title: 'Name already in use',
    message: `This project already has a recording named “${name.trim()}”. Choose another name for the one from ${fileName}.`,
    label: 'Name',
    value: freeAudioName(assets, name),
    validate: (text: string) =>
      !text
        ? 'A recording needs a name.'
        : audioNameTaken(assets, text)
          ? 'Another recording has this name.'
          : null,
    confirmLabel: 'Import',
    cancelLabel: 'Don’t import',
  };
}
