/* Editor lifetimes belong to the document, outside the panels replaced at the responsive
 * breakpoint. Local source drafts and native input undo therefore survive layout changes. */
import { FormulaEditor } from './FormulaEditor';
import { useFormulaEditor } from './formulaEditorStore';
import { MultiEditor } from './MultiEditor';
import { useMultiEdit } from './multiEditStore';
import { TextCompositionEditorHost } from '../text/TextCompositionEditor';

export function CreatorEditorHost() {
  const { editing, revision: formulaRevision } = useFormulaEditor();
  const { ids, revision: multiRevision } = useMultiEdit();
  return (
    <>
      <TextCompositionEditorHost />
      {ids && (
        <MultiEditor
          key={`multi-${multiRevision}`}
          ids={ids}
          onClose={() => {
            const state = useMultiEdit.getState();
            if (state.revision === multiRevision) state.close();
          }}
        />
      )}
      {editing && (
        <FormulaEditor
          key={`formula-${formulaRevision}`}
          formulaId={editing.id}
          isNew={editing.isNew}
          onClose={() => {
            // A discard confirmation from an old editor cannot close a newer request.
            const state = useFormulaEditor.getState();
            if (state.revision === formulaRevision) state.close();
          }}
        />
      )}
    </>
  );
}
