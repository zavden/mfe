/* Only new editor documents consume preferences. Open/recovery/model factories keep saved data. */
import { createEmptyProject } from '../../model';
import { getActivePalette } from '../colors/paletteStore';

export function createNewEditorProject() {
  const project = createEmptyProject();
  const palette = getActivePalette();
  if (palette) project.meta.background = palette.source.colors.background;
  return project;
}
