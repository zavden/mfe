/* React binding for the app-wide engine's companion state. */
import { useSyncExternalStore } from 'react';
import { canRenderLatex, companionCommand, getEngine, type CompanionState } from '../engine';

export function useCompanionState(): CompanionState {
  const engine = getEngine();
  return useSyncExternalStore(
    (onChange) => engine.onCompanionChange(onChange),
    () => engine.companion(),
  );
}

export function companionTooltip(state: CompanionState, baseUrl: string): string {
  if (state.status !== 'online') {
    return state.status === 'checking'
      ? `Looking for the companion at ${baseUrl}…`
      : `No companion at ${baseUrl}. Start it for exact LaTeX rendering: ${companionCommand()}`;
  }
  const { version, capabilities: c } = state.health;
  const tools = (['latex', 'dvisvgm', 'ffmpeg'] as const).filter((k) => c[k]);
  const manim = [
    c.manimCE ? `ManimCE ${c.manimCE.version}` : null,
    c.manimGL ? `ManimGL ${c.manimGL.version}` : null,
  ].filter(Boolean);
  return [
    `Companion ${version} at ${baseUrl}`,
    `Tools: ${tools.length ? tools.join(', ') : 'none'}`,
    `Manim: ${manim.length ? manim.join(', ') : 'none'}`,
    ...(canRenderLatex(state)
      ? []
      : ['LaTeX is not installed where the companion runs: formulas use MathJax.']),
  ].join('\n');
}
