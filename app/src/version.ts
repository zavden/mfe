/* The version of the app: the one of `app/package.json`, which a build is cut from. Help ▸ About
 * shows it. Only that field of the file reaches the bundle. */
import { version } from '../package.json';

export const APP_VERSION: string = version;
