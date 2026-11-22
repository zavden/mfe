/* The app-wide engine, created on first use (so tests and tools that never render do not
 * start polling the companion). */
import type { CompanionClient } from './companion';
import { createEngine, type Engine } from './engine';

let instance: Engine | null = null;

export function getEngine(): Engine {
  if (!instance) instance = createEngine();
  return instance;
}

/** The app-wide companion client (what `getEngine()` polls); the video export dialog uses it for
 * jobs. */
export function companionClient(): CompanionClient {
  return getEngine().client;
}
