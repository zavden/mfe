/* Export → Python with font text: what the editor cannot vouch for is listed, and Copy and
 * Download stay on (D82). */
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  producerOf,
  renderRequestFor,
  resolveFormula,
  textArtifactRender,
  textBoxesKey,
  toSnapshot,
  type CompanionState,
  type TextRenderRequest,
} from '../../../engine';
import {
  createClip,
  createEmptyProject,
  createTextFormula,
  type Target,
  type TextFormula,
} from '../../../model';
import { loadProject, useProjectStore, useRenderStore } from '../../../store';
import { textGeometry } from '../../../test/textGeometry';
import { PythonExportDialog } from '../PythonExportDialog';

const hoisted = vi.hoisted(() => ({
  companion: { status: 'offline' } as CompanionState,
  prepareText: vi.fn(),
}));
vi.mock('../../useCompanion', () => ({ useCompanionState: () => hoisted.companion }));
vi.mock('../../../engine/instance', () => ({
  getEngine: () => ({ prepareText: hoisted.prepareText }),
}));

function online(target: Target, environmentKey = 'test-environment'): CompanionState {
  return {
    status: 'online',
    health: {
      name: 'mfe-companion',
      version: 'test',
      protocol: 1,
      capabilities: {
        latex: false,
        dvisvgm: false,
        ffmpeg: false,
        manimCE: null,
        manimGL: null,
        pango: { [target]: { state: 'ready', adapterVersion: 'test-adapter', environmentKey } },
      },
    },
  };
}

/** Load a project for `projectTarget` with one text on the timeline, shaped by `shapedBy`, and
 * its render in the store as `status`. */
function open(
  shapedBy: Target,
  options: { projectTarget?: Target; status?: 'ok' | 'error'; fields?: Partial<TextFormula> } = {},
) {
  const project = createEmptyProject();
  project.meta.target = options.projectTarget ?? shapedBy;
  const artifact = textGeometry('AV office', undefined, shapedBy);
  const shape = textArtifactRender(artifact);
  const formula = createTextFormula({
    name: 'title',
    source: 'AV office',
    snapshot: toSnapshot(shape),
    geometry: {
      contentHash: 'a'.repeat(64),
      byteLength: 1,
      key: artifact.key,
      basisKey: artifact.basisKey,
    },
    ...options.fields,
  });
  project.formulas.push(formula);
  project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, 2));
  loadProject(project);
  const loaded = useProjectStore.getState().project.formulas[0]!;
  useRenderStore.getState().setEntry(loaded.id, {
    status: options.status ?? 'ok',
    resolved: resolveFormula(loaded, shape),
    error:
      options.status === 'error'
        ? { message: 'Font text needs a companion with Pango enabled.', backend: 'pango' }
        : null,
  });
}

const issues = () => screen.getByTestId('export-python-issues');
const code = () => screen.getByTestId('export-python-code').textContent ?? '';
function expectExportable() {
  expect(screen.getByTestId('export-python-copy')).toBeEnabled();
  expect(screen.getByTestId('export-python-download')).toBeEnabled();
  expect(screen.queryByTestId('export-python-stale')).not.toBeInTheDocument();
}

beforeEach(() => {
  hoisted.companion = { status: 'offline' };
  hoisted.prepareText.mockClear();
  useRenderStore.getState().retain([]);
});

describe('PythonExportDialog with a font text nothing has shaped', () => {
  it('exports it by its boxes, and says how its glyphs are counted', () => {
    const project = createEmptyProject();
    const draft = createTextFormula({ name: 'title', source: 'AV office' });
    const request = renderRequestFor(draft, project.meta, 'auto') as TextRenderRequest;
    const boxes = producerOf('text').free(request, textBoxesKey(request));
    if (!boxes.ok) throw new Error(boxes.error.message);
    const formula = { ...draft, snapshot: toSnapshot(boxes.render) };
    project.formulas.push(formula);
    project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, 2));
    loadProject(project);
    const loaded = useProjectStore.getState().project.formulas[0]!;
    useRenderStore.getState().setEntry(loaded.id, {
      status: 'ok',
      resolved: resolveFormula(loaded, boxes.render),
      error: null,
    });
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    expectExportable();
    expect(code()).toContain('title = Text(r"AV office"');
    expect(code()).toContain('_mfe_verify_text(title, r"title", "ce", 8)');
    expect(issues()).toHaveTextContent(
      'warning Font text "title": nothing has shaped it as it stands (no companion drew it).',
    );
    expect(issues()).toHaveTextContent('its glyphs counted one per character');
    // Nothing to compare with the fonts of this machine: there is no shape.
    expect(issues()).not.toHaveTextContent('not compared with the fonts');
  });
});

describe('PythonExportDialog with a font text whose glyphs nothing counts', () => {
  it('holds it back and says what brings it back: there is no error to look up', () => {
    // Boxes of the text as it stands over a snapshot nothing could carry over to them: the
    // geometry the references count by is not at hand, and the text changed since.
    const project = createEmptyProject();
    const draft = createTextFormula({ name: 'title', source: 'AV office' });
    const request = renderRequestFor(draft, project.meta, 'auto') as TextRenderRequest;
    const boxes = producerOf('text').free(request, textBoxesKey(request));
    if (!boxes.ok) throw new Error(boxes.error.message);
    const formula = {
      ...draft,
      snapshot: { ...toSnapshot(boxes.render), key: 'pango-of-an-earlier-text' },
    };
    project.formulas.push(formula);
    project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, 2));
    loadProject(project);
    const loaded = useProjectStore.getState().project.formulas[0]!;
    useRenderStore.getState().setEntry(loaded.id, {
      status: 'ok',
      resolved: { ...resolveFormula(loaded, boxes.render), confidence: 0 },
      error: null,
    });
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    expect(screen.getByTestId('export-python-uncounted')).toHaveTextContent(
      'title: font text whose glyphs nothing counts as it stands (the saved appearance is not ' +
        'at hand, and the text changed since). Refresh appearance, in its editor, shapes it ' +
        'again, which needs the companion. Copy and Download are off until then.',
    );
    // Not the line of a formula whose source fails: the Creator shows no error for this one.
    expect(screen.queryByTestId('export-python-stale')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-python-copy')).toBeDisabled();
    expect(screen.getByTestId('export-python-download')).toBeDisabled();
  });
});

describe('PythonExportDialog and the companion’s text worker', () => {
  /** A companion with the interpreter of `target` whose text worker stands at `state`. */
  const worker = (target: Target, state: 'unused' | 'preparing' | 'failed'): CompanionState => {
    const made = online(target);
    if (made.status === 'online') made.health.capabilities.pango = { [target]: { state } };
    return made;
  };

  it('asks for the worker of the export’s library when a text waits to be compared', () => {
    // The project is ManimGL's now; its text was shaped by ManimCE, which the export is for.
    hoisted.companion = worker('ce', 'unused');
    open('ce', { projectTarget: 'gl' });
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    expect(hoisted.prepareText).toHaveBeenCalledWith('ce');
    expectExportable();
    expect(issues()).toHaveTextContent(
      'Font text "title": not compared with the fonts of this machine yet: the companion is starting its text worker for ManimCE.',
    );
  });

  it('asks nothing while the worker starts, nor of one that failed, nor without a companion', () => {
    for (const companion of [
      worker('ce', 'preparing'),
      worker('ce', 'failed'),
      { status: 'offline' } as const,
    ]) {
      hoisted.companion = companion;
      open('ce');
      const view = render(<PythonExportDialog target="ce" onClose={() => {}} />);
      expectExportable();
      view.unmount();
    }
    expect(hoisted.prepareText).not.toHaveBeenCalled();
  });

  it('asks nothing when there is no text to compare', () => {
    // Shaped by ManimGL and exported to ManimCE: the generator's own warning, no comparison.
    hoisted.companion = worker('ce', 'unused');
    open('gl');
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    expect(hoisted.prepareText).not.toHaveBeenCalled();
  });
});

describe('PythonExportDialog with font text', () => {
  it('exports without the companion, and lists the text it could not compare', () => {
    open('ce');
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    expectExportable();
    expect(code()).toContain('_mfe_verify_text(title, r"title", "ce"');
    expect(issues()).toHaveTextContent(
      'warning Font text "title": not compared with the fonts of this machine',
    );
    expect(issues()).toHaveTextContent('The scene checks it when it runs');
    expect(issues()).not.toHaveTextContent('reproduces the preview');
  });

  it('has nothing to add when the companion still shapes the text the same way', () => {
    hoisted.companion = online('ce');
    open('ce');
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    expectExportable();
    expect(issues()).toHaveTextContent('The scene reproduces the preview');
    expect(issues()).not.toHaveTextContent('Font text');
  });

  it('exports a text whose fonts changed on this machine, and says so', () => {
    hoisted.companion = online('ce', 'fonts of another day');
    open('ce');
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    expectExportable();
    expect(issues()).toHaveTextContent(
      'Font text "title": shaped with other fonts, or other versions of Manim or Pango, than this machine has now',
    );
    expect(issues()).toHaveTextContent('Refresh appearance');
  });

  it('exports for the library that did not shape the text', () => {
    open('ce');
    render(<PythonExportDialog target="gl" onClose={() => {}} />);
    expectExportable();
    expect(code()).toContain('font_size=70.4544');
    // No fingerprint of ManimGL's outlines to compare: the scene counts the glyphs.
    expect(code()).toContain('_mfe_verify_text(title, r"title", "gl", 8)\n');
    expect(issues()).toHaveTextContent('Font text "title" was shaped by ManimCE.');
    // The generator's issue says it all: the companion has no fingerprint to compare.
    expect(issues()).not.toHaveTextContent('not compared with the fonts');
  });

  it('exports a text the project’s new library has not shaped yet', () => {
    // Project settings were switched to ManimGL with the companion off: shaping the text for
    // ManimGL fails, and the Creator shows that; its ManimCE shape is still what the preview draws.
    open('ce', { projectTarget: 'gl', status: 'error' });
    render(<PythonExportDialog target="gl" onClose={() => {}} />);
    expectExportable();
    expect(issues()).toHaveTextContent('Font text "title" was shaped by ManimCE.');
  });

  it('follows the companion as it comes and goes while the dialog is open', () => {
    open('ce');
    const view = render(<PythonExportDialog target="ce" onClose={() => {}} />);
    expect(issues()).toHaveTextContent('not compared with the fonts');
    hoisted.companion = online('ce');
    act(() => view.rerender(<PythonExportDialog target="ce" onClose={() => {}} />));
    expect(issues()).not.toHaveTextContent('Font text');
    expectExportable();
  });

  it('still holds back a text with no shape of its current source', () => {
    open('ce', { status: 'error', fields: { source: 'AV offices' } });
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    expect(screen.getByTestId('export-python-stale')).toHaveTextContent('title has no render');
    expect(screen.getByTestId('export-python-copy')).toBeDisabled();
    expect(screen.getByTestId('export-python-download')).toBeDisabled();
  });
});
