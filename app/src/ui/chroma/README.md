# Chroma Lab distribution adapter

`../../data/chroma-lab/` is a verbatim functional snapshot of Chroma Lab 1.3.0 at commit
`7ca3a2fddac8b7bb2b41152479d96171d641632a`. It is separate from the formula-template data source.
The adjacent `snapshot.json` records the source, exact selection, sizes, SHA-256 hashes and
license findings. Keep all MFE-owned wrappers and metadata outside the copied tree.

The `mfe:chroma-distribution` plugin in `app/vite.config.ts` checks those hashes, serves the
snapshot at `/chroma-lab/` in development, and emits identical files at `dist/chroma-lab/`.
`ChromaLabDialog` loads its ordinary `index.html` in a stable iframe. Relative styles, media,
help, fragments and the deferred classic script retain their original meaning. MFE still has
one parent IIFE; the child loads Chroma's existing classic IIFE and its bundled Blob worker.

The snapshot includes both Color.js MIT and Colour BSD-3-Clause notices, the original vendor
attribution README, three videos/posters, and two linked help files. Upstream had no top-level
LICENSE, COPYING or NOTICE when the first snapshot was taken, and a dependency's license says
nothing about the application's. Its author, who is also the author of this project, decided on
2026-11-09 that Chroma Lab is distributed with Manim Formula Editor under the same MIT License; the
build's third-party notices say so (`app/build/projectLicense.ts`), and since 2026-11-12 the
repository has that `LICENSE` file, which is not part of the selection. Development modules,
duplicate runtime vendor files and source maps are intentionally excluded. Source-map comments in
the unchanged bundle are not runtime imports.

Chroma Lab is the editor's own color studio, an extension of Manim Formula Editor kept in a
repository of its own (`../colors` beside this one in the author's workspace,
github.com/zavden/chromalab). The two documents meet at one boundary, the host bridge: messages
between the two windows, specified in "Host bridge" of Chroma Lab's `docs/ARCHITECTURE.md` and
implemented there in `src/host-bridge.js` and here in `hostBridge.ts`. The dialog presents the
editor to the frame, Chroma Lab then draws its **Send to Manim Formula Editor** button, and the
theme it posts on that click goes through the editor's importer like a file
(`usePaletteImport.importTheme`). The host hears only its frame's window, from the editor's own
origin, and treats what arrives as data to validate; Chroma Lab takes a host only from its parent at
its own origin. Apart from those messages the host never reads Chroma storage, scrapes its controls,
intercepts downloads or forwards keyboard events. The native JSON download followed by the editor
importer remains, for a theme kept as a file.

The iframe has an explicit tab stop, followed by the host footer; native Tab traversal reaches host
controls in HTTP and file mode. Chroma owns its internal Escape and undo behavior. Host controls use
the ordinary Modal rules with project history disabled.

Closing removes the iframe. Browser destruction of that document disposes its workers and
document-owned resources; the host allocates no object URLs, the drag listeners it puts on the
frame's document go with that document, and it stops its one `message` listener. Resize and maximize
preserve the frame node. The visible send-or-export-before-close reminder is intentional: the parent
cannot certify successful persistence in the child.

Local help links and Chroma's user-activated external reference links retain their original
new-tab behavior and `noopener` relationship. Markdown help may be displayed or downloaded
according to browser/server MIME handling; its bytes are always included locally. External
references require a connection when the user chooses to open them.

A change to Chroma Lab is made in its repository, never in the copy: there `npm run build` writes
the bundle, which is committed with its sources (the build is reproducible: the same commit gives
the same bytes). To refresh the copy, select an explicit commit of Chroma Lab and inspect its
distribution, its theme contract and the bridge's protocol version first. Copy each intended file
literally from that commit (`git show <commit>:<path>`, not from a working tree) into the snapshot,
update every manifest size/hash and the recorded source/version/license findings, then run snapshot
and host tests, a production build, and HTTP/file browser checks: `npm run dist-check` sends a theme
from the frame of a build opened from disk. Do not hand-edit a copied file or silently expand the
distribution selection. A new protocol version changes `hostBridge.ts` in the same refresh.

The ordinary iframe was chosen in an embedding trial on 2026-11-08, in HTTP and file mode. A
derived `srcdoc` document also booted, but its first route link navigated away from
`about:srcdoc` to the copied index file, so keeping it would have needed navigation rewrites.
The full-editor gate remains necessary after integrating changes to menus, palette storage and
other UI surfaces.
