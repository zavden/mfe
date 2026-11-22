// Test-only dispatch: Vitest resolves each file's environment before setup and awaits this
// module before collecting tests. Pure Node files never import the React/DOM test stack.
// Keep the decision here so watch mode also respects new or changed environment directives.
if (typeof document !== 'undefined') {
  await import('./setupDom');
}
