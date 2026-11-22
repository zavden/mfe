import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { createAudioClip, createAudioTrack, createEmptyProject } from '../../../model';
import { loadProject } from '../../../store';

const hoisted = vi.hoisted(() => ({ aac: true }));
vi.mock('../../../export/audio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../export/audio')>()),
  canEncodeAac: async () => hoisted.aac,
}));

import { AudioExportDialog } from '../AudioExportDialog';

beforeEach(() => {
  const project = createEmptyProject();
  const track = createAudioTrack('Voice');
  project.tracks.unshift(track);
  project.audioClips.push(createAudioClip('narration', track.id, 0, 2));
  loadProject(project);
});

const formats = () =>
  [...(screen.getByTestId('audio-export-format') as HTMLSelectElement).options].map(
    (option) => option.value,
  );

// The app carries no AAC encoder of its own (it would be FFmpeg's, under the LGPL): M4A exists
// where the browser brings one.
it('offers M4A where the browser encodes AAC', async () => {
  hoisted.aac = true;
  render(<AudioExportDialog onClose={vi.fn()} />);
  await waitFor(() => expect(formats()).toEqual(['wav', 'webm', 'm4a']));
  expect(screen.queryByTestId('audio-export-no-aac')).toBeNull();
});

it('leaves M4A out where it does not, and says why', async () => {
  hoisted.aac = false;
  render(<AudioExportDialog onClose={vi.fn()} />);
  expect(await screen.findByTestId('audio-export-no-aac')).toHaveTextContent(
    'M4A is not offered: it needs an AAC encoder, and this browser has none.',
  );
  expect(formats()).toEqual(['wav', 'webm']);
});

// A project written by another tool can end at 4.4 + 2.2 = 6.6000000000000005.
it('starts its range at the whole scene, its end without float noise', async () => {
  const project = createEmptyProject();
  const track = createAudioTrack('Voice');
  project.tracks.unshift(track);
  project.audioClips.push(createAudioClip('narration', track.id, 4.4, 4.4 + 2.2));
  loadProject(project);
  render(<AudioExportDialog onClose={vi.fn()} />);
  expect(screen.getByTestId('audio-export-from')).toHaveValue(0);
  expect(screen.getByTestId('audio-export-to')).toHaveValue(6.6);
  await waitFor(() => expect(screen.getByTestId('audio-export-start')).toBeEnabled());
});
