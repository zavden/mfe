/* The dialog of an animation block (R2, D75): a double-click on a block of the timeline opens
 * it, maximizable and resizable (its size is remembered), beside the Animations panel, which
 * keeps showing the block. Its left column is the panel's own editor of the block, with more
 * room; the right column is the formula in large, to pick the block's glyphs: it has most of a
 * dialog that is wide by default (a long formula is picked on at a readable size without
 * maximizing), the fields keeping the width of a panel. A block that names
 * no glyphs (a keyframe, a morph), or that takes all of its object (an arrow's), has the fields
 * alone, in a narrower dialog that keeps a size of its own. The block's preview is not in the
 * dialog: **Preview**, in its title bar, opens it in
 * a dialog over this one (the block alone, looping, and its easing curve), which closes alone.
 * Every edit goes through the same actions as the panel's, one undo step each. The dialog goes
 * when its block does, and its preview with it; and when a mode of the Preview turns on — from
 * one of its own buttons, nothing else being in reach under it: Edit path… of a Morph's pair,
 * Pick again… of a shape's Transform —, since such a mode takes the clicks of the Preview, which
 * the dialog covers. The Animations panel goes on showing the block. */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { animatedWhole, clipLifetimes } from '../../model';
import { useProjectStore } from '../../store';
import { onPreviewMode } from '../preview/previewModes';
import { Modal } from '../project/Modal';
import { Icon } from '../timeline/icons';
import { useBlockDialogStore, type BlockDialogRequest } from './blockDialogStore';
import { blockCategory, blockLabel, blockSubject } from './blockKinds';
import { BlockPreview } from './BlockPreview.tsx';
import { BlockProperties } from './BlockProperties';
import { GlyphPicker } from './GlyphPicker';
import { Section } from './Section';
import { isGlyphBlock } from './splitBlock';

function BlockDialog({ request, onClose }: { request: BlockDialogRequest; onClose: () => void }) {
  // Selected one by one: a stable reference each while the block is unchanged.
  const clip = useProjectStore((s) => s.project.clips.find((c) => c.id === request.clipId));
  const action = clip?.actions.find((a) => a.id === request.actionId);
  const formula = useProjectStore((s) => s.project.formulas.find((f) => f.id === clip?.formulaId));
  const formulaName = formula?.name ?? '';
  const subject = blockSubject(formula?.kind);
  const project = useProjectStore((s) => s.project);
  const life = useMemo(() => clipLifetimes(project).get(request.clipId), [project, request.clipId]);
  const [previewing, setPreviewing] = useState(false);
  // The block was deleted (or undone away): nothing to edit.
  const found = clip !== undefined && action !== undefined;
  useEffect(() => {
    if (!found) onClose();
  }, [found, onClose]);
  if (!action) return null;
  const label = `${blockLabel(action)} · ${formulaName}`;
  /** The formula is beside the fields, to pick the block's glyphs on — not an arrow, which a
   * block takes whole (`animatedWhole`, audit A5-07). */
  const whole = formula !== undefined && animatedWhole(formula);
  const picking = isGlyphBlock(action) && formula !== undefined && !whole;
  return (
    <>
      <Modal
        title={label}
        onClose={onClose}
        testId="block-dialog"
        sizeKey={picking ? 'block-dialog' : 'block-dialog-fields'}
        width={picking ? '1400px' : '520px'}
        resizable
        allowHistory
        headerTools={
          <button
            type="button"
            className="btn btn-small block-preview-open"
            data-testid="block-preview-open"
            title="Play this block alone, in a loop, with its easing curve"
            onClick={() => setPreviewing(true)}
          >
            <Icon name="play" />
            Preview
          </button>
        }
      >
        <div
          className={picking ? 'block-dialog' : 'block-dialog is-fields-only'}
          data-shape={picking ? 'glyphs' : 'fields'}
        >
          <div className="block-dialog-fields">
            <BlockProperties
              clipId={request.clipId}
              actionId={request.actionId}
              glyphsAside={picking}
            />
          </div>
          {/* The formula in large: the block's glyphs, picked with a click, Shift, Ctrl/⌘ or a
              box, under the glyph picker's rules. A tween moves the whole formula; a morph has
              its pair editor; the Glyphs section of the fields says that a block of an arrow
              takes all of it. */}
          {picking && formula && clip ? (
            <div className="block-dialog-side">
              <Section title="Glyphs" testId="block-dialog-glyphs" tone={blockCategory(action)}>
                <GlyphPicker
                  clip={clip}
                  action={action}
                  formula={formula}
                  life={life}
                  size="large"
                />
              </Section>
            </div>
          ) : whole && isGlyphBlock(action) ? null : (
            <p className="an-hint block-dialog-whole" data-testid="block-dialog-whole">
              {action.kind === 'tween'
                ? subject === 'formula'
                  ? 'A keyframe: this block moves the whole formula.'
                  : `A keyframe: this block moves the ${subject}.`
                : action.kind === 'morph'
                  ? 'A morph: its pairs are edited in the pair editor (Edit pairs…).'
                  : 'This clip has no formula.'}
            </p>
          )}
        </div>
      </Modal>
      {/* The block alone, looping, with a playhead of its own: over the dialog, in the body like
          it, so that the dialog's own box cannot clip it. */}
      {previewing &&
        createPortal(
          <Modal
            title={`Preview · ${label}`}
            onClose={() => setPreviewing(false)}
            testId="block-preview-dialog"
            width="clamp(420px, calc((100vh - 330px) * 16 / 9), 960px)"
            level="top"
            resizable
          >
            <BlockPreview clipId={request.clipId} actionId={request.actionId} />
          </Modal>,
          document.body,
        )}
    </>
  );
}

/** Mounts the block dialog when something asks for it (`openBlockDialog`). It renders into
 * document.body, like the morph and relation editors, so that no panel's layout can clip it. */
export function BlockDialogHost() {
  const request = useBlockDialogStore((s) => s.request);
  const close = useBlockDialogStore((s) => s.close);
  useEffect(() => onPreviewMode(close), [close]);
  if (!request) return null;
  return createPortal(
    <BlockDialog key={`${request.clipId}:${request.actionId}`} request={request} onClose={close} />,
    document.body,
  );
}
