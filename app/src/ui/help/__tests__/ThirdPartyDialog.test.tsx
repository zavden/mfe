import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { components, projectLicense } from 'virtual:third-party';
import { afterEach, expect, it, vi } from 'vitest';
import { APP_VERSION } from '../../../version';
import { HelpHost } from '../HelpHost';
import { closeHelpDialog, openHelpDialog } from '../helpStore';
import { ThirdPartyDialog } from '../ThirdPartyDialog';

afterEach(() => closeHelpDialog());

const rows = () =>
  within(screen.getByTestId('licenses-list'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent);

// The list is the build's own (build/thirdParty.ts, from the lockfile), not one kept by hand here.
it('lists every component the build declares, with its version and licence', () => {
  render(<ThirdPartyDialog onClose={vi.fn()} />);
  expect(rows()).toHaveLength(components.length);
  const version = (name: string) => components.find((item) => item.name === name)!.version;
  expect(rows()).toContain(`mediabunny${version('mediabunny')}MPL-2.0`);
  expect(rows()).toContain(`mathjax-full${version('mathjax-full')}Apache-2.0`);
  // What comes inside something else says where, and a part without a version shows a dash.
  expect(rows()).toContain(`KaTeX fonts · in mathlive ${version('mathlive')}–OFL-1.1`);
  expect(rows()).toContain('Colour · in Chroma Lab0.4.6BSD-3-Clause');
});

it('links the notices and the project licence by relative address, in a new tab', () => {
  render(<ThirdPartyDialog onClose={vi.fn()} />);
  // The words on the project's own licence are the build's (`build/projectLicense.ts`), and its
  // name is the link to its text.
  const { title, dialog } = projectLicense;
  expect(title.length).toBeGreaterThan(0);
  expect(screen.getByTestId('licenses-dialog')).toHaveTextContent(
    `${dialog.before} ${title}${dialog.after}`,
  );
  expect(screen.getByTestId('licenses-project')).toHaveTextContent(title);
  // Relative: the build is opened from disk, where an absolute path would point elsewhere.
  for (const [testId, href] of [
    ['licenses-notices', './licenses/THIRD-PARTY-NOTICES.txt'],
    ['licenses-project', './licenses/LICENSE.txt'],
  ] as const) {
    const link = screen.getByTestId(testId);
    expect(link.getAttribute('href')).toBe(href);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  }
});

it('is reached from About, which names the project licence', async () => {
  const user = userEvent.setup();
  render(<HelpHost />);
  openHelpDialog('about');
  // About gives the app's own version first.
  expect(await screen.findByTestId('about-version')).toHaveTextContent(APP_VERSION);
  const license = await screen.findByTestId('about-license');
  expect(license.getAttribute('href')).toBe('./licenses/LICENSE.txt');
  expect(license).toHaveTextContent(projectLicense.name);
  expect(projectLicense.name.length).toBeGreaterThan(0);
  await user.click(screen.getByTestId('about-licenses'));
  expect(screen.queryByTestId('about-dialog')).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Third-party licenses' })).toBeInTheDocument();
});
