/* The example projects the app carries, to open from where a project would start: the button of
 * the empty Creator and Help ▸ Examples. They are example files of the repo (`examples/`),
 * imported as data — the build is one script, and they are part of it — and opened as a file is
 * (`openExample`, `actions.ts`): the text of the file, read by the same reader. */
import braces from '../../../../examples/braces.mfe.json';
import camera from '../../../../examples/camera.mfe.json';
import completingTheSquare from '../../../../examples/completing-the-square.mfe.json';
import hello from '../../../../examples/hello.mfe.json';

export interface StarterExample {
  /** Its file in `examples/`, without `.mfe.json`. */
  id: string;
  /** The project's own name: what a menu calls it. */
  name: string;
  /** The project file's text. */
  text(): string;
}

const example = (id: string, file: { meta: { name: string } }): StarterExample => ({
  id,
  name: file.meta.name,
  text: () => JSON.stringify(file),
});

/** In the order of Help ▸ Examples: a whole derivation first, then a scene for one thing each. */
export const STARTER_EXAMPLES: readonly StarterExample[] = [
  example('completing-the-square', completingTheSquare),
  example('hello', hello),
  example('camera', camera),
  example('braces', braces),
];

/** The one the empty Creator offers. */
export const FIRST_EXAMPLE = STARTER_EXAMPLES[0]!;
