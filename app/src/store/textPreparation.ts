/* Text preparation: the companion starts nothing of font text by itself (a session without text
 * imports no Manim there and hashes no font), so the app asks for it. A project with a font text
 * needs the companion's text worker for its library: to shape a text nothing has shaped, and to
 * know whether the fonts a saved one was shaped with are still the ones of this machine (what an
 * export says of it). This service asks whenever such a project meets a companion that has not
 * started the worker yet. The text editor asks for a new text by itself: its font list is the
 * same request. */
import { getEngine, type Engine } from '../engine';
import { useProjectStore } from './projectStore';

export function startTextPreparation(
  engine: Pick<Engine, 'prepareText' | 'onCompanionChange'> = getEngine(),
): () => void {
  const look = () => {
    const { project } = useProjectStore.getState();
    if (project.formulas.some((formula) => formula.kind === 'text')) {
      engine.prepareText(project.meta.target);
    }
  };
  const stops = [
    useProjectStore.subscribe((state, previous) => {
      if (state.project !== previous.project) look();
    }),
    engine.onCompanionChange(look),
  ];
  look();
  return () => stops.forEach((stop) => stop());
}
