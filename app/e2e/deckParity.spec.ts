/* The exported page draws what the Preview draws. Its stage is SVG, the Preview's a canvas: the
 * same scene is mounted twice in a page — on the SVG stage and on the canvas the runtime keeps as
 * its other renderer, which is the app's own canvas renderer — and the two pictures are compared
 * instant by instant, pixel by pixel, up to what two rasterisers smooth differently at an edge. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { deckAddress, packOpenProject, writeDeck } from './deckHelpers';
import { openWithProject, readExample } from './helpers';

const WIDTH = 960;
const HEIGHT = 540;

/** How far two pictures of an instant are: the mean difference of a colour channel, of 255, and
 * the share of pixels with a channel more than a quarter of the range apart. */
interface Distance {
  time: number;
  mean: number;
  far: number;
  /** The share of pixels that are not the background, in the canvas's picture. */
  ink: number;
}

for (const example of ['completing-the-square', 'camera', 'shapes', 'lines', 'emphasis']) {
  test(`the SVG stage draws ${example} as the canvas does, instant by instant`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1100, height: 1300 });
    await openWithProject(page, readExample(`${example}.mfe.json`));
    const root = writeDeck(testInfo, await packOpenProject(page));
    const name = /data-scene="([^"]+)"/.exec(
      (await packOpenProject(page)).find((file) => file.path === 'index.html')!.text,
    )![1]!;
    writeFileSync(
      join(root, 'parity.html'),
      '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="player.css">' +
        '<body style="margin:0;background:#000">' +
        `<div class="mfe-deck" data-scene="${name}" data-controls="none" style="width:${WIDTH}px"></div>` +
        `<div class="mfe-deck" data-scene="${name}" data-controls="none" data-renderer="canvas" style="width:${WIDTH}px"></div>` +
        '<script src="mfe-runtime.js"></script><script src="glyphs.js"></script><script src="scene.js"></script>',
    );
    await page.goto(deckAddress(root, 'parity.html'));
    await expect(page.locator('.mfe-deck[data-mfe-mounted]')).toHaveCount(2);

    const distances = await page.evaluate(
      async ([width, height]) => {
        interface PageDeck {
          duration: number;
          stage: Element;
          project: { meta: { background: string } };
          seek(time: number): void;
        }
        const [svgDeck, canvasDeck] = (window as unknown as { MFE: { decks: PageDeck[] } }).MFE
          .decks as [PageDeck, PageDeck];
        const scratch = document.createElement('canvas');
        scratch.width = width!;
        scratch.height = height!;
        const context = scratch.getContext('2d', { willReadFrequently: true })!;
        const out: { time: number; mean: number; far: number; ink: number }[] = [];
        const steps = 16;
        for (let k = 0; k <= steps; k++) {
          // Off the round instants too: half way through whatever plays.
          const time = (svgDeck.duration * (k + (k % 2 ? 0.37 : 0))) / (steps + 0.37);
          svgDeck.seek(time);
          canvasDeck.seek(time);
          const stage = svgDeck.stage.cloneNode(true) as SVGSVGElement;
          stage.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          stage.setAttribute('width', String(width));
          stage.setAttribute('height', String(height));
          const image = new Image();
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
            new XMLSerializer().serializeToString(stage),
          )}`;
          await image.decode();
          context.fillStyle = svgDeck.project.meta.background;
          context.fillRect(0, 0, width!, height!);
          context.drawImage(image, 0, 0, width!, height!);
          const drawn = context.getImageData(0, 0, width!, height!).data;
          const canvas = canvasDeck.stage as HTMLCanvasElement;
          if (canvas.width !== width || canvas.height !== height) {
            throw new Error(`the canvas is ${canvas.width}×${canvas.height}`);
          }
          const wanted = canvas.getContext('2d')!.getImageData(0, 0, width!, height!).data;
          const background = [wanted[0]!, wanted[1]!, wanted[2]!];
          let sum = 0;
          let far = 0;
          let ink = 0;
          for (let i = 0; i < wanted.length; i += 4) {
            let worst = 0;
            let inked = false;
            for (let c = 0; c < 3; c++) {
              const difference = Math.abs(drawn[i + c]! - wanted[i + c]!);
              sum += difference;
              if (difference > worst) worst = difference;
              if (Math.abs(wanted[i + c]! - background[c]!) > 24) inked = true;
            }
            if (worst > 64) far++;
            if (inked) ink++;
          }
          const pixels = wanted.length / 4;
          out.push({ time, mean: sum / (pixels * 3), far: far / pixels, ink: ink / pixels });
        }
        return out;
      },
      [WIDTH, HEIGHT],
    );
    const said = distances
      .map(
        (d: Distance) =>
          `${d.time.toFixed(2)} s: mean ${d.mean.toFixed(3)}, far ${(d.far * 100).toFixed(3)} %, ink ${(d.ink * 100).toFixed(2)} %`,
      )
      .join('\n');
    testInfo.annotations.push({ type: 'parity', description: said });
    // `MFE_PARITY_SAY=1` prints the distances: what to read before changing the bounds below.
    if (process.env.MFE_PARITY_SAY) console.log(`${example}\n${said}`);
    // Something is on screen at most instants: the comparison is of pictures, not of two blanks.
    expect(distances.filter((d: Distance) => d.ink > 0.001).length, said).toBeGreaterThan(8);
    // Measured on these five scenes: a mean of 0.007 at most, and five pixels in half a million
    // more than a quarter of the range apart. The bounds leave room for another version of Chrome,
    // not for a glyph out of place: one letter missing is a mean of several units.
    for (const distance of distances as Distance[]) {
      expect(distance.mean, said).toBeLessThan(0.1);
      expect(distance.far, said).toBeLessThan(0.0005);
    }
  });
}
