/* `embed-example.html` of an exported folder: a page that is not the scene's own — a short article
 * with a look of its own — with the scene in it both ways a page can take it: with its tags (the
 * stylesheet, an element that names the scene, the engine and the scene's two files, and
 * `custom.js` when the scene has code of its own), and as the scene's own page in an `<iframe>`,
 * its options in the address. Every part is commented with what to copy, and the files it needs
 * are named. The notes are off in both: an article is for readers, and the notes show the
 * author's comments. It runs no script of its own, so it lives under a strict content security
 * policy as the folder's own page does. Pure. */
import type { Project } from '../../model';

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `embed-example.html` for the scene registered as `name`. */
export function embedExampleFile(name: string, project: Pick<Project, 'meta'>): string {
  const title = escapeHtml(project.meta.name);
  const scene = escapeHtml(name);
  const aspect = `${project.meta.width} / ${project.meta.height}`;
  return `<!doctype html>
<!-- An example of a page of yours with the scene in it, two ways:
       ${title}
     Open it from disk like index.html. What to copy into your own page is marked 1 to 3;
     everything else is this page's own (an article), and has nothing to do with the scene.
     Your page needs these files beside it: mfe-runtime.js, glyphs.js, scene.js, player.css,
     custom.js when the scene has code of its own, its sound file when it has one (audio.m4a
     or audio.wav, beside scene.js), and LICENSES.txt for the engine's notice. -->
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>A page with “${title}” in it</title>

    <!-- 1. The scene's look. Every rule of player.css is under .mfe-deck, so nothing in it
         reaches the rest of your page. -->
    <link rel="stylesheet" href="player.css" />

    <!-- This page's own look. A site under a strict content security policy keeps it in a
         stylesheet file of its own, as it does player.css. -->
    <style>
      body {
        margin: 0;
        background: #f7f5f0;
        color: #26231f;
        font: 18px/1.6 Georgia, 'Times New Roman', serif;
      }
      article {
        max-width: 40rem;
        margin: 3rem auto;
        padding: 0 1rem;
      }
      h1 {
        font-size: 2rem;
        line-height: 1.2;
      }
      figure {
        margin: 2rem 0;
      }
      figcaption {
        margin-top: 0.5rem;
        color: #6b655c;
        font-size: 0.85rem;
      }
      /* The scene, styled from the page that holds it: its custom properties and its box (the
         list is in AGENTS.md and at the head of player.css). */
      article .mfe-deck {
        border-radius: 6px;
        overflow: hidden;
      }
      /* The scene's own page in a frame: as wide as the text, the scene's shape. */
      article iframe {
        display: block;
        width: 100%;
        aspect-ratio: ${aspect};
        border: 0;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <article>
      <h1>${title}</h1>
      <p>
        This is a page of its own, with the scene in it: the scene takes the width of what holds
        it and keeps its shape, and its keys are heard only while the focus is inside it, so that
        it takes nothing from the page around it.
      </p>

      <figure>
        <!-- 2. Where the scene goes: an element of class mfe-deck that names it, as many as you
             want, of this scene or of others loaded in the page. Its options are data-
             attributes: data-controls="minimal", data-autoplay, data-loop, data-start="2.5",
             data-pauses="off", data-background="transparent"… (AGENTS.md lists them).
             data-notes="off": no notes (S), which show the author's comments to anyone. -->
        <div class="mfe-deck" data-scene="${scene}" data-notes="off"></div>
        <figcaption>The scene with its tags: it plays here, in this page.</figcaption>
      </figure>

      <p>
        The other way, for a site that takes no scripts of yours: the scene's own page in a
        frame, its options in its address.
      </p>

      <figure>
        <!-- The other way: index.html in a frame, its options in the address (the same names as
             the data- attributes). Copy the folder beside your page and this one tag. -->
        <iframe
          src="index.html?controls=minimal&amp;notes=off"
          title="${title}"
          loading="lazy"
        ></iframe>
        <figcaption>The scene's own page in a frame, with its minimal controls.</figcaption>
      </figure>
    </article>

    <!-- 3. The engine, then the scene's outlines and the scene, in this order, after the
         elements that name it (or anywhere: the engine mounts the scenes once the page has
         loaded). Then custom.js, when the scene has code of its own: what it adds is here too. -->
    <script src="mfe-runtime.js"></script>
    <script src="glyphs.js"></script>
    <script src="scene.js"></script>
    <script src="custom.js"></script>
  </body>
</html>
`;
}
