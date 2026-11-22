/* Public API of the data model. Other modules import from '../model', but for the few files
 * docs/ARCHITECTURE.md §2 names (the zod schemas the player reads, the types of `types.ts`). */
export type * from './types';
export * from './defaults';
export * from './kinds';
export * from './placementRefs';
export * from './shapePaint';
export * from './startPosition';
export * from './ids';
export * from './remap';
export * from './transfers';
export * from './texPattern';
export * from './io';
export * from './time';
export * from './camera';
export * from './slides';
export * from './audio';
export * from './text';
export * from './lifetime';
export * from './validate';
export * from './diagnostics';
export * from './conflicts';
export * from './groups';
export * from './formulaGroups';
