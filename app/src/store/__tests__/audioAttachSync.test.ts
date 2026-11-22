// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createAttach, createAudioClip, createAudioTrack, type Project } from '../../model';
import { smallProject } from '../../model/__tests__/fixtures';
import { loadProject, useProjectStore } from '../projectStore';

const { derive } = vi.hoisted(() => ({ derive: vi.fn(() => []) }));
vi.mock('../../scene', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../scene')>()),
  deriveAttachments: derive,
}));
import { startAttachSync } from '../attachSync';

describe('audio edits and attachment sync', () => {
  it('leaves corrupt clip data to the render error boundary instead of throwing from a subscription', () => {
    const project = smallProject();
    const broken = { ...project, clips: null } as unknown as Project;
    loadProject(project);
    const stop = startAttachSync();
    try {
      expect(() => useProjectStore.setState({ project: broken })).not.toThrow();
      expect(useProjectStore.getState().project).toBe(broken);
    } finally {
      stop();
      loadProject(project);
    }
    useProjectStore.setState({ project: broken });
    let stopBroken: (() => void) | undefined;
    try {
      expect(() => {
        stopBroken = startAttachSync();
      }).not.toThrow();
    } finally {
      stopBroken?.();
      loadProject(project);
    }
  });

  it('does not derive visual attachments again when only a volume curve changes', () => {
    const project = smallProject();
    project.clips[1]!.attach = createAttach(project.clips[0]!.id, 'all');
    const row = createAudioTrack('Voice');
    project.tracks.push(row);
    project.audioClips.push(createAudioClip('asset', row.id, 0, 20));
    loadProject(project);
    derive.mockClear();
    const stop = startAttachSync();
    try {
      expect(derive).toHaveBeenCalledTimes(1);
      useProjectStore.getState().update((draft) => {
        draft.audioClips[0]!.volume = [{ id: 'point', time: 0, gain: 0.2 }];
      });
      expect(derive).toHaveBeenCalledTimes(1);
      useProjectStore.getState().update((draft) => {
        draft.clips[0]!.initial.scale = 2;
      });
      expect(derive).toHaveBeenCalledTimes(2);
    } finally {
      stop();
    }
  });
});
