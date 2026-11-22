// @vitest-environment node
/* `embed-example.html`: a page of its own with the scene in it both ways, that runs no script of
 * its own, and in which the scene mounts and plays as in its own page. */
import { beforeAll, describe, expect, it } from 'vitest';
import { renderedExample, type Rendered } from '../../../embed/__tests__/fixtures';
import { folderPage } from '../../../test/folderPage';
import { embedExampleFile } from '../embedExample';
import { packDeck, sceneName, type DeckFile } from '../packDeck';
import { RUNTIME_ASSETS } from '../runtimeAssets';

let rendered: Rendered;
let files: DeckFile[];
beforeAll(async () => {
  rendered = await renderedExample('hello.mfe.json');
  files = packDeck(rendered.project, rendered.resolved, RUNTIME_ASSETS);
}, 120_000);
const textOf = (path: string) => files.find((file) => file.path === path)!.text;

describe('embed-example.html', () => {
  it('takes the scene with its tags and in a frame, and runs no script of its own', () => {
    const html = textOf('embed-example.html');
    const name = sceneName(rendered.project);
    expect(html).toContain('<link rel="stylesheet" href="player.css" />');
    expect(
      [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((match) => match[1]),
    ).toEqual(['mfe-runtime.js', 'glyphs.js', 'scene.js', 'custom.js']);
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/);
    expect(html).not.toMatch(/\son[a-z]+=/);
    // A page for readers: the notes, which show the author's comments, are off both ways.
    expect(html).toContain(`<div class="mfe-deck" data-scene="${name}" data-notes="off"></div>`);
    expect(html).toMatch(/<iframe\s+src="index\.html\?controls=minimal&amp;notes=off"/);
    // The files it needs, named.
    for (const file of ['mfe-runtime.js', 'glyphs.js', 'scene.js', 'player.css', 'LICENSES.txt'])
      expect(html.slice(0, html.indexOf('<html')), file).toContain(file);
    expect(html).toContain('aspect-ratio: 1920 / 1080;');
    // Its own page is not the scene's: no data-page, so the address and the keys are its own.
    expect(html).not.toContain('data-page');
    for (const line of html.split('\n')) expect(line.length).toBeLessThanOrEqual(100);
  });

  it('says what it holds of a name as text', () => {
    const odd = embedExampleFile('x', { meta: { ...rendered.project.meta, name: '<b> & "c"' } });
    expect(odd).toContain('<title>A page with “&lt;b&gt; &amp; &quot;c&quot;” in it</title>');
    expect(odd).not.toContain('<b>');
  });

  it('mounts the scene in the article, where its keys are its own', async () => {
    const page = await folderPage(textOf('embed-example.html'), [
      textOf('mfe-runtime.js'),
      textOf('glyphs.js'),
      textOf('scene.js'),
      textOf('custom.js'),
    ]);
    expect(page.errors).toEqual([]);
    const element = page.document.querySelector('article .mfe-deck')!;
    expect(element.hasAttribute('data-mfe-mounted')).toBe(true);
    expect(element.querySelector('svg.mfe-stage [data-clip="a1"]')).not.toBeNull();
    const [deck] = page.mfe.decks;
    expect(deck!.options.keys).toBe('focus');
    expect(deck!.options.notes).toBe(false);
    expect(element.querySelector('.mfe-notes')).toBeNull();
    deck!.seek(2.5);
    expect(deck!.box('f2')).not.toBeNull();
  });
});
