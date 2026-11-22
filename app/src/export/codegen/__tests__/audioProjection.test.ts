// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createAudioClip, createAudioTrack, createEmphasis, sceneDuration } from '../../../model';
import { smallProject } from '../../../model/__tests__/fixtures';
import { trackDepths } from '../../../scene';
import { generatePython } from '../index';

describe('Manim visual projection', () => {
  it.each(['ce', 'gl'] as const)(
    'keeps the %s scene and its visual depth unchanged by audio rows; the header owns up to a longer editor video',
    (target) => {
      const project = smallProject();
      project.meta.target = target;
      project.clips[0]!.actions.push(createEmphasis(1, 'focus_on', 'all', { duration: 1 }));
      const options = {
        target,
        sceneName: 'VisualOnly',
        indexing: 'auto' as const,
        comments: true,
      };
      const before = generatePython(project, new Map(), options);
      const depths = trackDepths(project);
      const top = createAudioTrack('Voice');
      const middle = createAudioTrack('Music');
      project.tracks.unshift(top);
      project.tracks.splice(2, 0, middle);
      // Sound that ends with the pictures (or before) changes nothing at all.
      const within = createAudioClip('unavailable-source', top.id, 0, sceneDuration(project));
      project.audioClips.push(within);
      expect(generatePython(project, new Map(), options)).toEqual(before);
      // A missing original and long audio tail must not affect the Manim validation or timeline.
      within.end = 120;
      const after = generatePython(project, new Map(), options);
      expect(after.issues).toEqual(before.issues);
      expect(after.usedPositionalHelper).toBe(before.usedPositionalHelper);
      // The scene is the same, line for line. Only the header stops saying that the editor's video
      // has as many frames: that one goes on until the sound ends.
      const claim = /^# exactly (\d+) frames, like the editor's video export\.$/m.exec(
        before.code,
      )!;
      expect(Number(claim[1])).toBe(
        Math.round(sceneDuration(project, 'visual') * project.meta.fps),
      );
      expect(after.code).toBe(
        before.code.replace(
          claim[0],
          `# exactly ${claim[1]} frames. The editor's video export is longer ` +
            `(${120 * project.meta.fps} frames): it lasts\n` +
            "# until the project's audio ends, and this scene has no audio.",
        ),
      );
      expect(
        generatePython(project, new Map(), { ...options, comments: false }).code,
      ).not.toContain("editor's video export");
      expect(trackDepths(project)).toEqual(depths);
      project.tracks.reverse();
      const reversed = trackDepths(project);
      expect(reversed.size).toBe(2);
      expect(reversed.has(top.id)).toBe(false);
    },
  );
});
