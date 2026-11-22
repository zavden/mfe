/* Help → Third-party licenses…: what the build contains that is not this project's own work, and
 * where its notices are. The list is the one the build writes the notices from
 * (`build/thirdParty.ts`), so the dialog and the notices name the same components; the words on
 * the project's own licence are the build's too (`build/projectLicense.ts`). */
import { components, projectLicense } from 'virtual:third-party';
import { Modal } from '../project/Modal';
import './help.css';

// Relative, like every address of the build: they work when `dist/index.html` is opened from
// disk, and on the development server, which serves the same two files.
export const PROJECT_LICENSE_HREF = './licenses/LICENSE.txt';
export const THIRD_PARTY_NOTICES_HREF = './licenses/THIRD-PARTY-NOTICES.txt';

export function ThirdPartyDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Third-party licenses"
      onClose={onClose}
      testId="licenses-dialog"
      width="560px"
      footer={
        <button type="button" className="btn" onClick={onClose} data-testid="licenses-close">
          Close
        </button>
      }
    >
      <div className="help-licenses">
        <p>
          {projectLicense.dialog.before}{' '}
          <a
            href={PROJECT_LICENSE_HREF}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="licenses-project"
          >
            {projectLicense.title}
          </a>
          {projectLicense.dialog.after}
        </p>
        <p>
          Their notices and the full license texts are in{' '}
          <a
            href={THIRD_PARTY_NOTICES_HREF}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="licenses-notices"
          >
            Third-party notices
          </a>
          , a file that travels with the app.
        </p>
        <div className="help-licenses-card">
          <table className="help-licenses-list" data-testid="licenses-list">
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col">Version</th>
                <th scope="col">License</th>
              </tr>
            </thead>
            <tbody>
              {components.map((component) => (
                <tr key={`${component.name} ${component.within ?? ''}`}>
                  <th scope="row">
                    {component.name}
                    {component.within && (
                      <span className="help-licenses-within"> · in {component.within}</span>
                    )}
                  </th>
                  <td>{component.version ?? '–'}</td>
                  <td>{component.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
