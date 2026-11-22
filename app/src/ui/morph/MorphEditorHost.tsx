/* Mounts the pair editor of a morph block when something asks for it (`openMorphEditor`). It
 * renders into document.body, like the relation editor, so that no panel's layout can clip the
 * dialog. */
import { createPortal } from 'react-dom';
import { MorphEditor } from './MorphEditor';
import { useMorphEditorStore } from './morphEditorStore';

export function MorphEditorHost() {
  const request = useMorphEditorStore((s) => s.request);
  const close = useMorphEditorStore((s) => s.close);
  if (!request) return null;
  return createPortal(
    <MorphEditor key={JSON.stringify(request)} request={request} onClose={close} />,
    document.body,
  );
}
