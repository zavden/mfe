/* The file: the header with the render command, the import line, the helpers used, and the scene
 * class with its setup and body. */
import { sceneDuration } from '../../model';
import {
  CE_UNWRITE_HELPER,
  CIRCLE_HELPER,
  CROSS_LINE_HELPER,
  ARROW_HELPER,
  DASHED_HELPERS,
  CIRCUMSCRIBE_HELPER,
  GLYPHS_HELPER,
  PART_HELPER,
  SHRINK_HELPER,
  SPLINE_LINE_HELPERS,
  ROUTE_PATHS_HELPER,
  SPLINE_PATH_HELPER,
  tweenHelper,
  UNCREATE_HELPER,
  UNWRITE_HELPER,
  UNWRITE_RESTORE,
  CARRIED_HELPER,
  TRACE_ARROW_HELPERS,
  WIGGLE_HELPER,
} from './helpers';
import { physicalLines, pyHeadComment, quoted } from './python';
import { renderCommand } from './dialect';
import { type Codegen, INDENT } from './context';
import { TEXT_GEOMETRY_HELPER } from './textHelper';
import { GL_STROKES_WITH_ZOOM } from './camera';

/** `editorFrames`: how many frames the editor's own video export of the project has (it lasts
 * until the project's sound ends, which the scene, the visual part, may not). */
export function assemble(gen: Codegen, editorFrames: number | null = null): string {
  const { project, target } = gen;
  const meta = project.meta;
  const file = `${gen.sceneName}.py`;
  const command = renderCommand(target, file, gen.sceneName, meta);
  const lib = gen.dialect.library;
  const lines: string[] = [
    pyHeadComment(`${meta.name} — exported by Manim Formula Editor for ${lib}.`),
    `# Render at ${meta.width}×${meta.height}, ${meta.fps} fps:`,
    `#     ${command}`,
  ];
  if (gen.options.comments) {
    const frames = Math.round(sceneDuration(project) * meta.fps);
    lines.push(
      `# Every play and wait lasts a whole number of frames at ${meta.fps} fps, so the video has`,
    );
    if (editorFrames !== null && editorFrames > frames)
      lines.push(
        `# exactly ${frames} frames. The editor's video export is longer (${editorFrames} frames): it lasts`,
        "# until the project's audio ends, and this scene has no audio.",
      );
    else lines.push(`# exactly ${frames} frames, like the editor's video export.`);
  }
  lines.push(gen.dialect.importLine, '');
  // Before anything is made: ManimGL keeps copies of the glyphs of every Tex it builds.
  if (gen.camera?.zooms && target === 'gl') lines.push('', GL_STROKES_WITH_ZOOM.trimEnd(), '');
  const aspect = meta.width / meta.height;
  if (target === 'ce' && Math.abs(aspect - 16 / 9) > 1e-9) {
    lines.push(
      '# The frame is 8 units tall; its width follows the pixel aspect ratio.',
      'config.frame_width = config.frame_height * config.pixel_width / config.pixel_height',
      '',
    );
  }
  const helperSources: string[] = [];
  if (gen.helpers.has('text-geometry')) helperSources.push(TEXT_GEOMETRY_HELPER);
  if (gen.helpers.has('glyphs')) helperSources.push(GLYPHS_HELPER);
  if (gen.helpers.has('part')) helperSources.push(PART_HELPER);
  if (gen.helpers.has('tween')) {
    helperSources.push(tweenHelper(gen.helpers.has('tween-paint'), gen.helpers.has('tween-style')));
  }
  if (gen.helpers.has('spline')) helperSources.push(SPLINE_PATH_HELPER);
  if (gen.helpers.has('route-paths')) helperSources.push(ROUTE_PATHS_HELPER);
  if (gen.helpers.has('circle')) helperSources.push(CIRCLE_HELPER);
  if (gen.helpers.has('cross-line')) helperSources.push(CROSS_LINE_HELPER);
  if (gen.helpers.has('spline-line')) helperSources.push(SPLINE_LINE_HELPERS[target]);
  if (gen.helpers.has('dashed')) helperSources.push(DASHED_HELPERS[target]);
  if (gen.helpers.has('arrow')) helperSources.push(ARROW_HELPER);
  if (gen.helpers.has('carried')) helperSources.push(CARRIED_HELPER);
  if (gen.helpers.has('trace-arrow')) helperSources.push(TRACE_ARROW_HELPERS[target]);
  if (gen.helpers.has('wiggle')) helperSources.push(WIGGLE_HELPER);
  if (gen.helpers.has('circumscribe')) helperSources.push(CIRCUMSCRIBE_HELPER);
  const restoreUnwrite = gen.helpers.has('restore-unwrite');
  if (gen.helpers.has('unwrite')) {
    helperSources.push(restoreUnwrite ? UNWRITE_HELPER + UNWRITE_RESTORE : UNWRITE_HELPER);
  } else if (restoreUnwrite) {
    helperSources.push(CE_UNWRITE_HELPER);
  }
  if (gen.helpers.has('restore-uncreate')) helperSources.push(UNCREATE_HELPER);
  if (gen.helpers.has('restore-shrink')) helperSources.push(SHRINK_HELPER);
  for (const source of helperSources) lines.push('', source.trimEnd(), '');
  // ManimCE moves its frame in a MovingCameraScene; ManimGL's Scene already can.
  const base = gen.camera && target === 'ce' ? 'MovingCameraScene' : 'Scene';
  lines.push('', `class ${gen.sceneName}(${base}):`);
  if (target === 'gl')
    lines.push(`    default_camera_config = dict(background_color=${quoted(meta.background)})`, '');
  lines.push('    def construct(self):');
  const construct: string[] = [];
  if (target === 'ce') construct.push(`self.camera.background_color = ${quoted(meta.background)}`);
  construct.push(...gen.setup);
  if (gen.body.length > 0) construct.push('', ...gen.body);
  // A body of comments alone (the marks of a scene that has nothing to play) is no body to Python.
  if (construct.every((line) => /^(#.*)?$/.test(line))) construct.push('pass');
  for (const line of construct) {
    // The continuation lines of a triple-quoted string (a multi-line formula) are its text.
    for (const { text, inString } of physicalLines(line)) {
      lines.push(inString || text === '' ? text : `${INDENT}${text}`);
    }
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n\n')}\n`;
}
