/* The app's services in a unit test (ui/project/useAppServices.ts): nothing listens to the stores
 * until a service is started, so a test of what a service does starts it, as the layout does. */
import { afterEach, beforeEach } from 'vitest';

/** Run the services around every test of the file, or of the `describe` this is called in. Call
 * it before the file's own hooks: the services then start first and stop last, still running
 * while the file's `afterEach` puts the stores back. */
export function withServices(...services: (() => () => void)[]): void {
  let stops: (() => void)[] = [];
  beforeEach(() => {
    stops = services.map((start) => start());
  });
  afterEach(() => {
    for (const stop of stops) stop();
    stops = [];
  });
}
