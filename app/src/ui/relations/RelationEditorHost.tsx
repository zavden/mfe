/* Mounts the relation editor when something asks for it (`openRelationEditor`). It renders into
 * document.body so that no panel's layout can clip the dialog. */
import { createPortal } from 'react-dom';
import { RelationEditor } from './RelationEditor';
import { useRelationEditor } from './relationEditorStore';

export function RelationEditorHost() {
  const request = useRelationEditor((s) => s.request);
  const close = useRelationEditor((s) => s.close);
  if (!request) return null;
  return createPortal(
    <RelationEditor key={JSON.stringify(request)} request={request} onClose={close} />,
    document.body,
  );
}
