/* The last resort when rendering throws: instead of a blank page, say what happened, how to get
 * back (the autosave restores the work on reload) and offer the project as a file, in case the
 * project itself is what makes the editor fail. */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { serializeProject } from '../model';
import { useProjectStore } from '../store';
import { autosaveStatus } from './project/autosave';
import { downloadBlob, suggestedFileName } from './project/files';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  private download = () => {
    const project = useProjectStore.getState().project;
    let text: string;
    try {
      text = serializeProject(project);
    } catch {
      text = JSON.stringify(project, null, 2);
    }
    const name = suggestedFileName(String(project?.meta?.name ?? 'project'));
    downloadBlob(name, new Blob([text], { type: 'application/json' }));
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash" role="alert" data-testid="crash">
        <h1>Something went wrong</h1>
        <p>
          {autosaveStatus() === 'blocked'
            ? 'The editor hit an error it cannot recover from. This browser keeps no autosave (its storage is blocked or full): download the project before reloading the page.'
            : 'The editor hit an error it cannot recover from. Your project is in this browser’s autosave: reload the page to continue where you were.'}
        </p>
        <div className="crash-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
            data-testid="crash-reload"
          >
            Reload
          </button>
          <button
            type="button"
            className="btn"
            onClick={this.download}
            data-testid="crash-download"
          >
            Download the project
          </button>
        </div>
        <details>
          <summary>Details</summary>
          <pre>{error.stack ?? String(error)}</pre>
        </details>
      </div>
    );
  }
}
