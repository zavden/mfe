/* Choosing the glyphs of an animation block (ARCHITECTURE §5): the formula's glyph view, with the
 * glyphs that are not on screen when the block starts drawn faint, so that it shows what will
 * appear. Click, Shift (range), Ctrl/⌘ (toggle) and a marquee select; quick buttons pick All,
 * the glyphs off or on screen, or those hidden at the start. A block that names `'all'` shows
 * every glyph selected; any manual edit turns it into an explicit, ascending list. */
import { useRef, useState, type MouseEvent } from 'react';
import {
  clipLifetimes,
  startHiddenGlyphs,
  type Clip,
  type ClipLifetime,
  type Formula,
} from '../../model';
import { history, useProjectStore, useRenderStore, type ProjectGesture } from '../../store';
import { GlyphChips } from '../creator/GlyphChips';
import { GlyphView } from '../creator/GlyphView';
import {
  clickGlyph,
  marqueeSelection,
  NO_SELECTION,
  type GlyphSelection,
} from '../creator/glyphSelection';
import {
  glyphsOnScreenBefore,
  namedGlyphs,
  quickActive,
  quickTarget,
  sortedGlyphs,
  type PickerContext,
  type QuickChoice,
} from './blockGlyphs';
import { setBlockGlyphs } from './blockActions';
import { findBlock } from './blockRange';
import { isGlyphBlock, type GlyphBlock } from './splitBlock';
import { glyphsUnavailable } from '../creator/glyphsUnavailable';
import { keysText } from '../platform';

const QUICK: readonly { id: QuickChoice; label: string; title: string }[] = [
  { id: 'all', label: 'All', title: 'Every glyph of the formula' },
  {
    id: 'off-screen',
    label: 'Not on screen',
    title: 'The glyphs that are not on screen when the block starts',
  },
  {
    id: 'on-screen',
    label: 'On screen',
    title: 'The glyphs that are on screen when the block starts',
  },
  {
    id: 'hidden',
    label: 'Hidden at start',
    title:
      'The glyphs left out of the intro: those the formula hides and those this clip leaves out itself, or all of a clip that starts empty',
  },
];

interface GlyphPickerProps {
  clip: Clip;
  action: GlyphBlock;
  formula: Formula;
  life: ClipLifetime | undefined;
  /** `large`: the formula fills the room it is given (the block dialog, R2); else the panel's
   * small view. */
  size?: 'panel' | 'large';
}

export function GlyphPicker({ clip, action, formula, life, size = 'panel' }: GlyphPickerProps) {
  const resolved = useRenderStore((s) => s.resolved.get(formula.id));
  const entry = useRenderStore((s) => s.entries[formula.id]);
  const background = useProjectStore((s) => s.project.meta.background);
  const [hovered, setHovered] = useState<number | null>(null);
  /** The glyph a Shift+click range starts from; and the selection a marquee drag adds to. */
  const anchor = useRef<number | null>(null);
  const marqueeBase = useRef<GlyphSelection>(NO_SELECTION);
  const owner = useRef<ProjectGesture | null>(null);

  const count = formula.snapshot?.glyphs.length ?? 0;
  const universe = Array.from({ length: count }, (_, i) => i);
  /** What the quick choices are made of: the glyphs of the formula, those on screen when `block`
   * starts and those hidden at the start. */
  const contextOf = (of: Clip, block: GlyphBlock, lifetime: ClipLifetime | undefined) => ({
    universe,
    onScreen: lifetime
      ? glyphsOnScreenBefore(lifetime, block, of.start + block.start)
      : new Set<number>(),
    hidden: startHiddenGlyphs(of, formula),
  });
  const context: PickerContext = contextOf(clip, action, life);
  const { onScreen } = context;
  const selected = namedGlyphs(action, universe);
  const dimmed = new Set(universe.filter((g) => !onScreen.has(g)));

  const commit = (glyphs: Iterable<number>) =>
    setBlockGlyphs(clip.id, action.id, sortedGlyphs(glyphs));

  /** The block to pick from, and its quick choices. A chip and a quick button take a key, so
   * either can be pressed while the button is still held on a drag — the marquee of this picker,
   * or the block's own on the timeline — and what is drawn here is then what that drag shows: the
   * pick gives it up (`history.cancelForeignGesture`) and starts from the block it leaves. */
  const settled = () => {
    history.cancelForeignGesture();
    const { project } = useProjectStore.getState();
    const found = findBlock(project, clip.id, action.id);
    if (!found || !isGlyphBlock(found.action)) return null;
    const lifetime = clipLifetimes(project).get(clip.id);
    return { block: found.action, context: contextOf(found.clip, found.action, lifetime) };
  };

  const onGlyphClick = (index: number, event: MouseEvent) => {
    const now = settled();
    if (!now) return;
    const next = clickGlyph(
      { selected: namedGlyphs(now.block, universe), anchor: anchor.current },
      index,
      { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey },
    );
    anchor.current = next.anchor;
    commit(next.selected);
  };

  const named = action.glyphs === 'all' ? null : sortedGlyphs(action.glyphs);
  const summary =
    named === null
      ? 'All glyphs'
      : named.length === 0
        ? 'No glyphs selected'
        : `${named.length} glyph${named.length === 1 ? '' : 's'}: ${named.join(', ')}`;

  return (
    <div
      className={size === 'large' ? 'an-glyphs an-glyphs-large' : 'an-glyphs'}
      data-testid="block-glyph-picker"
    >
      <div className="an-quick" role="group" aria-label="Quick glyph choices">
        {QUICK.map((q) => {
          const active = quickActive(q.id, action, context);
          return (
            <button
              key={q.id}
              type="button"
              className={`an-small-button${active ? ' is-on' : ''}`}
              aria-pressed={active}
              title={q.title}
              data-testid={`block-glyphs-${q.id}`}
              onClick={() => {
                const now = settled();
                anchor.current = null;
                if (now)
                  setBlockGlyphs(clip.id, action.id, quickTarget(q.id, now.block, now.context));
              }}
            >
              {q.label}
            </button>
          );
        })}
      </div>
      {resolved && count > 0 ? (
        <>
          <GlyphView
            formula={formula}
            resolved={resolved}
            background={background}
            selected={selected}
            dimmed={dimmed}
            hovered={hovered}
            onHover={setHovered}
            onGlyphClick={onGlyphClick}
            onBackgroundClick={() => {}}
            onContextMenu={(_, event) => event.preventDefault()}
            marquee={{
              onStart: (cancel) => {
                marqueeBase.current = { selected, anchor: anchor.current };
                setHovered(null);
                // The whole drag is one undo step.
                owner.current = history.beginGesture(cancel);
              },
              onChange: (keys, additive) => {
                const next = marqueeSelection(marqueeBase.current, keys.map(Number), additive);
                anchor.current = next.anchor;
                owner.current?.run(() => commit(next.selected));
              },
              onEnd: (cancelled) => {
                if (cancelled) {
                  owner.current?.cancel();
                  anchor.current = marqueeBase.current.anchor;
                } else owner.current?.end();
                owner.current = null;
              },
            }}
            testIdPrefix="block-glyph"
            className={
              size === 'large' ? 'glyph-svg an-glyph-svg is-large' : 'glyph-svg an-glyph-svg'
            }
          />
          {/* The keyboard's way to pick glyphs: a press toggles one (Shift: a range). */}
          <GlyphChips
            glyphs={formula.snapshot!.glyphs}
            selected={new Set(selected)}
            label={`Glyphs of ${formula.name}`}
            testIdPrefix="block-glyph"
            onPick={(index, event) =>
              onGlyphClick(index, {
                shiftKey: event.shiftKey,
                ctrlKey: true,
                metaKey: false,
              } as MouseEvent)
            }
          />
        </>
      ) : (
        <p className="an-hint" data-testid="block-glyphs-empty">
          {glyphsUnavailable(formula, entry)}
        </p>
      )}
      <p className="an-hint" data-testid="block-glyphs-summary">
        {summary}
      </p>
      <p className="an-hint">
        Faint glyphs are not on screen when this block starts.{' '}
        {keysText('Click, Shift for a range, Ctrl/⌘ to toggle, or drag a box.')}
      </p>
    </div>
  );
}
