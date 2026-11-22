import { useCallback, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  type PanelImperativeHandle,
  type PanelSize,
} from 'react-resizable-panels';
import { ExportHost } from './export/ExportHost';
import { HelpHost } from './help/HelpHost';
import { EngineInspector } from './inspector/EngineInspector';
import { MenuBar } from './MenuBar';
import { AnimationsPanel } from './animations/AnimationsPanel';
import { CreatorPanel } from './creator/CreatorPanel';
import { CreatorEditorHost } from './creator/CreatorEditorHost';
import { FormulaSearchPanel } from './creator/search/FormulaSearchPanel';
import { RelationChoiceHost } from './relations/RelationChoiceMenu';
import { RelationEditorHost } from './relations/RelationEditorHost';
import { MorphEditorHost } from './morph/MorphEditorHost';
import { PreviewPanel } from './preview/PreviewPanel';
import { TimelinePanel } from './timeline/TimelinePanel';
import { DialogHost } from './project/DialogHost';
import { closeProjectsDialog, useLibraryStore } from './project/libraryStore';
import { Announcer } from './Announcer.tsx';
import { NoticeHost } from './project/NoticeHost';
import { ProgressHost } from './project/ProgressHost';
import { FOLDED_PX, usePanels, type FoldablePanel } from './panelsStore';
import { ProjectsDialog } from './project/ProjectsDialog';
import { SettingsDialog } from './project/SettingsDialog';
import { useAppServices } from './project/useAppServices';
import { safeStorage } from './storage';
import { usePreferences } from './preferences';
import { useTheme } from './theme';
import { useTimelineStore } from './timeline/timelineStore';
import { ZenStage } from './ZenStage';
import { NARROW_LAYOUT, useMediaQuery } from './useMediaQuery';

// Group/panel ids double as `data-testid` on the library's own elements.
const ROOT_GROUP_ID = 'mfe-layout-root';
const TOP_GROUP_ID = 'mfe-layout-top';
// Zen mode keeps sizes of its own: its panels are other panels.
const ZEN_GROUP_ID = 'mfe-layout-zen';

/** The props that make a panel foldable to its title bar (`panelsStore.ts`): the library folds
 * it to `collapsedSize` (its own button, View ▸ Panels, or a separator dragged past its
 * minimum) and reports every size, so the store knows which panels are folded. */
function foldable(id: FoldablePanel) {
  return {
    collapsible: true,
    collapsedSize: `${FOLDED_PX}px`,
    panelRef: (handle: PanelImperativeHandle | null) => usePanels.getState().register(id, handle),
    onResize: (size: PanelSize) => usePanels.getState().report(id, size.inPixels <= FOLDED_PX + 1),
  };
}

/** A node of its own for a panel's content. Each of the four panels is rendered once, into its
 * node (a portal), and the layout in use puts the node in its place (`Home`): changing the layout
 * — the stacked one of a narrow window, Zen mode — moves the nodes and mounts nothing again, so
 * the Preview keeps its view and its modes, and the other panels what they had open. */
function useHome(name: string): HTMLDivElement {
  const [node] = useState(() => {
    const node = document.createElement('div');
    node.className = 'panel-home';
    node.dataset.home = name;
    return node;
  });
  return node;
}

/** The place of a panel's node in a layout. */
function Home({ node }: { node: HTMLDivElement }) {
  const place = useCallback(
    (slot: HTMLDivElement | null) => {
      if (slot) slot.appendChild(node);
    },
    [node],
  );
  return <div className="panel-home-slot" ref={place} />;
}

export function AppLayout() {
  const { theme, choice: themeChoice, setTheme, toggleTheme } = useTheme();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const projectsOpen = useLibraryStore((state) => state.dialogOpen);
  useAppServices();

  const rootLayout = useDefaultLayout({ id: ROOT_GROUP_ID, storage: safeStorage });
  const topLayout = useDefaultLayout({ id: TOP_GROUP_ID, storage: safeStorage });
  // A narrow window (a phone, the desktop at 400 % zoom): the four panels stack, each as tall
  // as most of the window, and the page scrolls; the resizable layout comes back with the room.
  const stacked = useMediaQuery(NARROW_LAYOUT);
  // Zen mode (D182), a preference, for small windows: the timeline is a column on the left, drawn
  // vertical, and the Preview takes the rest, with the Creator and the Animations panel in a
  // drawer over it that their tabs open (`ZenStage`). Not in the stacked layout, which has no
  // columns. Told before the stage's own effects run: its drawer is the store's shared place.
  const zen = usePreferences((state) => state.zenMode) && !stacked;
  const strip = usePreferences((state) => state.zenStrip);
  const zenLayout = useDefaultLayout({ id: ZEN_GROUP_ID, storage: safeStorage });
  useLayoutEffect(() => {
    usePanels.getState().setStrip(zen ? strip : null);
    useTimelineStore.getState().setVertical(zen);
  }, [zen, strip]);

  const creatorHome = useHome('creator');
  const previewHome = useHome('preview');
  const animationsHome = useHome('animations');
  const timelineHome = useHome('timeline');
  const creator = <Home node={creatorHome} />;
  const preview = <Home node={previewHome} />;
  const animations = <Home node={animationsHome} />;
  const timeline = <Home node={timelineHome} />;
  const homes: ReactNode = (
    <>
      {createPortal(<CreatorPanel />, creatorHome)}
      {/* The search of formulas comes up over the Preview, in its place (creator/search/). */}
      {createPortal(
        <>
          <PreviewPanel />
          <FormulaSearchPanel />
        </>,
        previewHome,
      )}
      {createPortal(<AnimationsPanel />, animationsHome)}
      {createPortal(<TimelinePanel />, timelineHome)}
    </>
  );

  const panels = stacked ? (
    <>
      <div className="panel-inner stacked-panel">{creator}</div>
      <div className="panel-inner stacked-panel preview-slot">{preview}</div>
      <div className="panel-inner stacked-panel">{animations}</div>
      <div className="panel-inner stacked-panel">{timeline}</div>
    </>
  ) : zen ? (
    <Group
      key="zen"
      id={ZEN_GROUP_ID}
      orientation="horizontal"
      defaultLayout={zenLayout.defaultLayout}
      onLayoutChanged={zenLayout.onLayoutChanged}
    >
      <Panel
        id="timeline"
        defaultSize="21%"
        minSize="12%"
        className="panel-inner"
        {...foldable('timeline')}
      >
        {timeline}
      </Panel>
      <Separator className="separator separator-vertical" />
      <Panel id="stage" defaultSize="79%" minSize="30%" className="panel-inner">
        <ZenStage preview={preview} creator={creator} animations={animations} />
      </Panel>
    </Group>
  ) : (
    <Group
      key="panels"
      id={ROOT_GROUP_ID}
      orientation="vertical"
      defaultLayout={rootLayout.defaultLayout}
      onLayoutChanged={rootLayout.onLayoutChanged}
    >
      <Panel id="top" defaultSize="70%" minSize="20%" className="panel-inner">
        <Group
          id={TOP_GROUP_ID}
          orientation="horizontal"
          defaultLayout={topLayout.defaultLayout}
          onLayoutChanged={topLayout.onLayoutChanged}
        >
          <Panel
            id="creator"
            defaultSize="20%"
            minSize="10%"
            className="panel-inner"
            {...foldable('creator')}
          >
            {creator}
          </Panel>
          <Separator className="separator separator-vertical" />
          <Panel id="preview" defaultSize="58%" minSize="20%" className="panel-inner preview-slot">
            {preview}
          </Panel>
          <Separator className="separator separator-vertical" />
          <Panel
            id="animations"
            defaultSize="22%"
            minSize="10%"
            className="panel-inner"
            {...foldable('animations')}
          >
            {animations}
          </Panel>
        </Group>
      </Panel>
      <Separator className="separator separator-horizontal" />
      <Panel
        id="timeline"
        defaultSize="30%"
        minSize="10%"
        className="panel-inner"
        {...foldable('timeline')}
      >
        {timeline}
      </Panel>
    </Group>
  );

  return (
    <div className="app">
      <MenuBar
        theme={theme}
        themeChoice={themeChoice}
        onToggleTheme={toggleTheme}
        onChooseTheme={setTheme}
        onOpenInspector={() => setInspectorOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main
        className={stacked ? 'app-main is-stacked' : 'app-main'}
        data-layout={stacked ? 'stacked' : zen ? 'zen' : 'panels'}
      >
        {panels}
      </main>
      {homes}
      <CreatorEditorHost />
      <RelationEditorHost />
      <RelationChoiceHost />
      <MorphEditorHost />
      {inspectorOpen && <EngineInspector onClose={() => setInspectorOpen(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {projectsOpen && <ProjectsDialog onClose={closeProjectsDialog} />}
      <ExportHost />
      <HelpHost />
      <ProgressHost />
      <DialogHost />
      <NoticeHost />
      <Announcer />
    </div>
  );
}
