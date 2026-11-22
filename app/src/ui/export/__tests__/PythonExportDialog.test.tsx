import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKEND_VERSIONS, renderKey, type ResolvedFormula } from '../../../engine';
import {
  animationSpans,
  createAudioClip,
  createAudioTrack,
  packagesOf,
  parseProject,
  pauseZones,
  sceneDuration,
  type Project,
} from '../../../model';
import { loadProject, useProjectStore, useRenderStore } from '../../../store';
import { PythonExportDialog } from '../PythonExportDialog';

function hello(): Project {
  // Vitest runs from app/ (a `new URL(…, import.meta.url)` would be turned into an asset by
  // Vite under jsdom).
  const parsed = parseProject(
    readFileSync(path.resolve(process.cwd(), '../examples/hello.mfe.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.project;
}

/** Mark every formula as rendered for its current LaTeX (the exporter only needs the snapshots;
 * the render is a stub with the right key). */
function renderAll(project: Project) {
  for (const formula of project.formulas) {
    const key = renderKey(
      {
        kind: 'math',
        latex: formula.source,
        packages: packagesOf(formula),
        preamble: project.meta.preamble,
        target: project.meta.target,
        fontSize: formula.fontSize,
        prefer: 'auto',
      },
      'latex',
      BACKEND_VERSIONS.latex,
    );
    const resolved = {
      formula,
      render: {
        key,
        backend: 'latex',
        exact: true,
        target: project.meta.target,
        fontSize: formula.fontSize,
        glyphs: [],
        bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        warnings: [],
      },
      canonToRender: formula.snapshot!.glyphs.map((_, i) => i),
      confidence: 1,
    } as unknown as ResolvedFormula;
    useRenderStore.getState().setEntry(formula.id, { status: 'ok', resolved, error: null });
  }
}

beforeEach(() => {
  useRenderStore.getState().retain([]);
  loadProject(hello());
});

describe('PythonExportDialog', () => {
  it('keeps the generated visual scene available with an unavailable audio source and audio tail', () => {
    renderAll(useProjectStore.getState().project);
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    const before = screen.getByTestId('export-python-code').textContent!;
    act(() => {
      useProjectStore.getState().update((draft) => {
        const track = createAudioTrack('Voice');
        draft.tracks.unshift(track);
        draft.audioClips.push(createAudioClip('unavailable-source', track.id, 0, 120));
      });
    });
    // The scene is the same, line for line; its header says that the editor's own video, which
    // lasts until the sound ends, is longer.
    const { fps } = useProjectStore.getState().project.meta;
    const claim = /^# exactly (\d+) frames, like the editor's video export\.$/m.exec(before)!;
    expect(screen.getByTestId('export-python-code').textContent).toBe(
      before.replace(
        claim[0],
        `# exactly ${claim[1]} frames. The editor's video export is longer (${120 * fps} ` +
          "frames): it lasts\n# until the project's audio ends, and this scene has no audio.",
      ),
    );
    expect(screen.getByTestId('export-python-download')).toBeEnabled();
    expect(screen.getByTestId('export-python-issues')).not.toHaveTextContent('audio source');
  });

  it('writes a mark of the Slides mode in the tail where only sound plays, at the end', () => {
    const end = sceneDuration(useProjectStore.getState().project);
    act(() => {
      useProjectStore.getState().update((draft) => {
        const track = createAudioTrack('Voice');
        draft.tracks.unshift(track);
        draft.audioClips.push(createAudioClip('unavailable-source', track.id, 0, end + 3));
        draft.slides = { marks: [{ id: 'p_1', time: end + 2, kind: 'pause', text: 'Questions' }] };
      });
    });
    renderAll(useProjectStore.getState().project);
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    const code = screen.getByTestId('export-python-code').textContent ?? '';
    expect(code.trimEnd().endsWith(`# PAUSE 1 of 1 (${(end + 2).toFixed(2)} s): Questions`)).toBe(
      true,
    );
    expect(screen.getByTestId('export-python-issues')).not.toHaveTextContent('past the end');
  });

  it('waits for the formula renders', () => {
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    expect(screen.getByTestId('export-python-waiting')).toHaveTextContent('Waiting for 2 formulas');
    expect(screen.getByTestId('export-python-copy')).toBeDisabled();
    expect(screen.getByTestId('export-python-download')).toBeDisabled();
    act(() => renderAll(useProjectStore.getState().project));
    expect(screen.queryByTestId('export-python-waiting')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-python-code')).toHaveTextContent('MathTex(r"mx+y=0")');
  });

  it('does not wait for an empty formula: its clips are left out', () => {
    renderAll(useProjectStore.getState().project);
    // An empty formula never renders (the render store keeps it idle).
    act(() => {
      useProjectStore.getState().update((p) => {
        p.formulas[0]!.source = '';
      });
      const id = useProjectStore.getState().project.formulas[0]!.id;
      useRenderStore.getState().setEntry(id, { status: 'idle', resolved: null, error: null });
    });
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    expect(screen.queryByTestId('export-python-waiting')).not.toBeInTheDocument();
    expect(screen.queryByTestId('export-python-stale')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-python-issues')).toHaveTextContent(
      'Formula "a1" is empty; its clips are left out.',
    );
    expect(screen.getByTestId('export-python-download')).toBeEnabled();
  });

  it('waits while a formula re-renders and blocks renders of an older LaTeX', () => {
    const project = useProjectStore.getState().project;
    renderAll(project);
    const first = project.formulas[0]!;
    const entry = useRenderStore.getState().entries[first.id]!;
    act(() => useRenderStore.getState().setEntry(first.id, { ...entry, status: 'loading' }));
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    expect(screen.getByTestId('export-python-waiting')).toHaveTextContent('Waiting for a formula');

    // The LaTeX was edited and the new render failed: the old render no longer fits.
    act(() => {
      useRenderStore.getState().setEntry(first.id, {
        ...entry,
        status: 'error',
        error: { message: 'Undefined control sequence', backend: 'latex' },
      });
    });
    expect(screen.getByTestId('export-python-stale')).toHaveTextContent('a1 has no render');
    expect(screen.getByTestId('export-python-download')).toBeDisabled();
    expect(screen.getByTestId('export-python-copy')).toBeDisabled();

    // A render that is ok but of an earlier version of the LaTeX is as stale.
    act(() => {
      useRenderStore.getState().setEntry(first.id, entry);
      useProjectStore.getState().update((p) => {
        p.formulas[0]!.source = 'mx+y=1';
      });
    });
    expect(screen.getByTestId('export-python-stale')).toBeInTheDocument();
    act(() => renderAll(useProjectStore.getState().project));
    expect(screen.queryByTestId('export-python-stale')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-python-download')).toBeEnabled();
  });

  it('shows the code for the chosen library and follows the options', async () => {
    const user = userEvent.setup();
    renderAll(useProjectStore.getState().project);
    render(<PythonExportDialog target="gl" onClose={() => {}} />);
    const code = () => screen.getByTestId('export-python-code').textContent ?? '';
    expect(screen.getByTestId('export-python-scene-name')).toHaveValue('HelloOneToOne');
    expect(code()).toContain('from manimlib import *');
    expect(code()).toContain('class HelloOneToOne(Scene):');
    // The project targets CE: exporting to GL says so.
    expect(screen.getByTestId('export-python-issues')).toHaveTextContent('exporting to ManimGL');

    expect(code()).toContain('# a1: mx+y=0');
    await user.click(screen.getByTestId('export-python-comments'));
    expect(code()).not.toContain('# a1: mx+y=0');

    fireEvent.change(screen.getByTestId('export-python-scene-name'), {
      target: { value: 'Intro' },
    });
    expect(code()).toContain('class Intro(Scene):');
    expect(screen.getByTestId('export-python-download')).toHaveTextContent('Intro.py');

    fireEvent.change(screen.getByTestId('export-python-scene-name'), {
      target: { value: '9 lives' },
    });
    expect(screen.getByTestId('export-python-download')).toBeDisabled();
    expect(screen.getByText(/Use a Python class name/)).toBeInTheDocument();
  });

  it('uses the positional helper when asked to', async () => {
    const user = userEvent.setup();
    renderAll(useProjectStore.getState().project);
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    const code = () => screen.getByTestId('export-python-code').textContent ?? '';
    expect(code()).not.toContain('_glyphs');
    expect(screen.getByTestId('export-python-issues')).toHaveTextContent('reproduces the preview');
    expect(screen.getByTestId('export-python-issues')).toHaveTextContent('exact glyph indices');
    await user.click(screen.getByTestId('export-python-indexing'));
    expect(code()).toContain('a1_g = _glyphs(a1, [');
    // Every formula is matched by position now: the line says so instead of exact indices.
    expect(screen.getByTestId('export-python-issues')).toHaveTextContent(
      'The scene reproduces the preview: glyphs matched by position when it runs, whole frames.',
    );
  });

  it('writes the marks of the Slides mode and lists the ones it leaves out', () => {
    const project = useProjectStore.getState().project;
    const span = animationSpans(project)[0]!;
    const rest = pauseZones(project).find((zone) => zone.end > zone.start)!;
    const end = sceneDuration(project);
    act(() =>
      useProjectStore.getState().update((p) => {
        p.slides = {
          marks: [
            { id: 'p_1', time: (span.start + span.end) / 2, kind: 'pause' },
            { id: 'p_2', time: rest.start, kind: 'comment', text: 'Ask why' },
            { id: 'p_3', time: end + 1, kind: 'pause' },
          ],
        };
      }),
    );
    renderAll(useProjectStore.getState().project);
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    const code = screen.getByTestId('export-python-code').textContent ?? '';
    expect(code).toContain(`# NOTE (${rest.start.toFixed(2)} s): Ask why`);
    expect(code).not.toContain('# PAUSE');
    const issues = screen.getByTestId('export-python-issues');
    expect(issues).toHaveTextContent(
      `The pause at ${+((span.start + span.end) / 2).toFixed(3)} s is where`,
    );
    expect(issues).toHaveTextContent('the exports leave this one out');
    expect(issues).toHaveTextContent(
      `The pause at ${+(end + 1).toFixed(3)} s is past the end of the scene`,
    );
  });

  it('regenerates when the project changes', () => {
    renderAll(useProjectStore.getState().project);
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    act(() =>
      useProjectStore.getState().update((p) => {
        p.meta.background = '#102030';
      }),
    );
    expect(screen.getByTestId('export-python-code')).toHaveTextContent('"#102030"');
  });

  it('copies and downloads the code', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const createObjectURL = vi.fn(() => 'blob:x');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderAll(useProjectStore.getState().project);
    render(<PythonExportDialog target="ce" onClose={() => {}} />);

    await user.click(screen.getByTestId('export-python-copy'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('class HelloOneToOne(Scene):'));
    expect(await screen.findByText('Copied to the clipboard.')).toBeInTheDocument();

    await user.click(screen.getByTestId('export-python-download'));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe('HelloOneToOne.py');
    click.mockRestore();
  });

  // With a camera, a few names more are the scene's own, and a class called as one of them gets
  // `Scene` after it. The field, the button, the file and the header's command all name the class
  // there is: the dialog downloaded `Restore.py`, whose header said to run `RestoreScene.py`
  // (B-10 of the final audit).
  it('names the field, the button and the file as the class, when the camera takes the project’s name', async () => {
    const user = userEvent.setup();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const project = hello();
    project.meta.name = 'Restore';
    project.camera = { initial: { center: [1, 0], height: 8 }, targets: [], moves: [] };
    loadProject(project);
    renderAll(useProjectStore.getState().project);
    render(<PythonExportDialog target="ce" onClose={() => {}} />);

    const field = screen.getByTestId('export-python-scene-name');
    expect(field).toHaveValue('RestoreScene');
    expect(field).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByTestId('export-python-scene-renamed')).toHaveTextContent(
      'The project’s name would make it Restore, a name the scene’s camera uses: the class, and the file, are RestoreScene.',
    );
    const code = screen.getByTestId('export-python-code');
    expect(code).toHaveTextContent('class RestoreScene(MovingCameraScene):');
    expect(code).toHaveTextContent('RestoreScene.py RestoreScene');
    const download = screen.getByTestId('export-python-download');
    expect(download).toHaveTextContent('Download RestoreScene.py');
    await user.click(download);
    expect((click.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe(
      'RestoreScene.py',
    );

    // Written by hand, the camera's name is one the scene cannot take: said, with what it can.
    fireEvent.change(field, { target: { value: 'Restore' } });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/not reserved by the generated code/)).toHaveTextContent(
      '(e.g. RestoreScene)',
    );
    expect(download).toBeDisabled();
    expect(screen.queryByTestId('export-python-scene-renamed')).toBeNull();
    // Another name is the class as it is written, with no note.
    fireEvent.change(field, { target: { value: 'Lesson' } });
    expect(field).toHaveAttribute('aria-invalid', 'false');
    expect(code).toHaveTextContent('class Lesson(MovingCameraScene):');
    expect(download).toHaveTextContent('Download Lesson.py');
    expect(screen.queryByTestId('export-python-scene-renamed')).toBeNull();
    click.mockRestore();
  });

  it('takes the project’s name as it is where no camera takes it', () => {
    const project = hello();
    project.meta.name = 'Restore';
    loadProject(project);
    renderAll(useProjectStore.getState().project);
    render(<PythonExportDialog target="ce" onClose={() => {}} />);
    expect(screen.getByTestId('export-python-scene-name')).toHaveValue('Restore');
    expect(screen.getByTestId('export-python-code')).toHaveTextContent('class Restore(Scene):');
    expect(screen.getByTestId('export-python-download')).toHaveTextContent('Download Restore.py');
    expect(screen.queryByTestId('export-python-scene-renamed')).toBeNull();
  });

  it('clears the copy message after two seconds, across re-renders', async () => {
    vi.useFakeTimers();
    try {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      renderAll(useProjectStore.getState().project);
      render(<PythonExportDialog target="ce" onClose={() => {}} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('export-python-copy'));
      });
      expect(screen.getByText('Copied to the clipboard.')).toBeInTheDocument();
      // A re-render (here an option change) must not cancel the timer.
      fireEvent.click(screen.getByTestId('export-python-comments'));
      act(() => vi.advanceTimersByTime(2100));
      expect(screen.queryByText('Copied to the clipboard.')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
