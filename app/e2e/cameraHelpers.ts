/* Helpers for the specs of the scene's camera: a camera for a project file, and the camera the
 * app holds. */
import type { Page } from '@playwright/test';
import type { MfeWindow } from './helpers';

export interface CameraFrameJson {
  center: [number, number];
  height: number;
}

export type CameraDestinationJson =
  | { kind: 'frame'; frame: CameraFrameJson }
  | { kind: 'target'; target: string }
  | { kind: 'start' };

export interface CameraMoveJson {
  id: string;
  start: number;
  duration: number;
  easing: string;
  to: CameraDestinationJson;
}

export interface CameraJson {
  initial: CameraFrameJson;
  targets: ({ id: string; name: string } & CameraFrameJson)[];
  moves: CameraMoveJson[];
  locked?: boolean;
}

/** A camera for a project file (`projectFile`'s `extra.camera`): Manim's own frame at 0 s, no
 * target cameras and no moves unless told otherwise; a move without an easing gets Manim's. */
export function cameraProject(
  camera: {
    initial?: CameraFrameJson;
    targets?: CameraJson['targets'];
    moves?: (Omit<CameraMoveJson, 'easing'> & { easing?: string })[];
    locked?: boolean;
  } = {},
): CameraJson {
  return {
    initial: camera.initial ?? { center: [0, 0], height: 8 },
    targets: camera.targets ?? [],
    moves: (camera.moves ?? []).map((move) => ({ easing: 'smooth', ...move })),
    ...(camera.locked === undefined ? {} : { locked: camera.locked }),
  };
}

/** The camera of the project the app holds; null while the multicamera is off. */
export async function cameraOf(page: Page): Promise<CameraJson | null> {
  return page.evaluate(() => {
    const { project } = (window as MfeWindow).__mfe!.useProjectStore.getState();
    const camera = (project as unknown as { camera?: unknown }).camera;
    return camera === undefined ? null : (JSON.parse(JSON.stringify(camera)) as unknown);
  }) as Promise<CameraJson | null>;
}

/** One move of that camera. */
export async function moveOf(page: Page, id: string): Promise<CameraMoveJson> {
  const move = (await cameraOf(page))?.moves.find((m) => m.id === id);
  if (!move) throw new Error(`no camera move ${id}`);
  return move;
}
