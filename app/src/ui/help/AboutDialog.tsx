/* Help → About: what the app is, its version, and the versions of the file format and the
 * renderers it uses. */
import { projectLicense } from 'virtual:third-party';
import { getEngine, MATHJAX_VERSION } from '../../engine';
import { FORMAT_VERSION } from '../../model';
import { APP_VERSION } from '../../version';
import { BrandMark } from '../BrandMark';
import { companionSummary } from '../engineStatus';
import { Modal } from '../project/Modal';
import { useCompanionState } from '../useCompanion';
import { openHelpDialog } from './helpStore';
import { PROJECT_LICENSE_HREF } from './ThirdPartyDialog';
import './help.css';

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const companion = useCompanionState();
  return (
    <Modal
      title="About"
      onClose={onClose}
      testId="about-dialog"
      width="500px"
      footer={
        <button type="button" className="btn" onClick={onClose} data-testid="about-close">
          Close
        </button>
      }
    >
      <div className="help-about-head">
        <BrandMark size={48} />
        <div>
          <p className="help-about-name">Manim Formula Editor</p>
          <p className="help-about-what">
            Write LaTeX formulas, animate them on a timeline and export the result as a ManimCE or
            ManimGL scene or as a video.
          </p>
        </div>
      </div>
      <dl className="help-about-versions">
        <dt>Version</dt>
        <dd className="help-mono" data-testid="about-version">
          {APP_VERSION}
        </dd>
        <dt>Project format</dt>
        <dd className="help-mono" data-testid="about-format">
          {FORMAT_VERSION}
        </dd>
        <dt>MathJax</dt>
        <dd className="help-mono" data-testid="about-mathjax">
          {MATHJAX_VERSION}
        </dd>
        <dt>Companion</dt>
        <dd data-testid="about-companion" title={getEngine().client.baseUrl}>
          {companionSummary(companion)}
        </dd>
        <dt>License</dt>
        <dd>
          <a
            href={PROJECT_LICENSE_HREF}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="about-license"
          >
            {projectLicense.name}
          </a>
        </dd>
      </dl>
      <div className="help-about-more">
        <button
          type="button"
          className="btn"
          onClick={() => openHelpDialog('shortcuts')}
          data-testid="about-shortcuts"
        >
          Keyboard shortcuts…
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => openHelpDialog('licenses')}
          data-testid="about-licenses"
        >
          Third-party licenses…
        </button>
      </div>
    </Modal>
  );
}
