/* Pixel comparison of one frame: the web preview renderer (Chrome through Playwright, against a
 * Vite dev server of app/) versus a frame of the Manim video (decoded with ffmpeg). */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ResolvedFormulas } from "../../app/src/engine";
import type { Project } from "../../app/src/model";

interface PageLike {
  goto(url: string): Promise<unknown>;
  evaluate(expression: string): Promise<string>;
}

/** Runs in the page (as source text: Vitest would rewrite a dynamic import in a function). Draws
 * the evaluator's drawables at `t` with the preview renderer on a canvas of the output size, as
 * the editor's own video export films them: through the scene camera's frame of that instant when
 * the project has a camera that moves, through Manim's still frame otherwise. */
const BROWSER_FRAME = `async (arg) => {
  const scene = await import('/src/scene/index.ts');
  const render = await import('/src/render/index.ts');
  const { width, height, background } = arg.project.meta;
  const evaluator = scene.exportEvaluator(arg.project, new Map(arg.formulas));
  const framing = scene.sceneFraming(arg.project);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  render.createCanvasRenderer().draw(
    canvas.getContext('2d'),
    evaluator.evaluate(arg.t),
    framing
      ? render.cameraThrough(framing(arg.t), width / height)
      : { frameWidth: (8 * width) / height, frameHeight: 8, center: [0, 0], zoom: 1 },
    { width, height },
    { background, outside: null },
  );
  return canvas.toDataURL('image/png');
}`;
interface BrowserLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}
interface ServerLike {
  listen(port: number): Promise<unknown>;
  close(): Promise<void>;
}

export interface WebRenderer {
  frame(
    project: Project,
    formulas: ResolvedFormulas,
    t: number,
  ): Promise<Buffer>;
  close(): Promise<void>;
}

/** Starts Vite (app/) on `port` and Chrome; null when either is unavailable. */
export async function startWebRenderer(
  appDir: string,
  port: number,
): Promise<WebRenderer | null> {
  const require = createRequire(path.join(appDir, "package.json"));
  let server: ServerLike | null = null;
  let browser: BrowserLike | null = null;
  try {
    const vite = (await import(
      pathToFileURL(require.resolve("vite")).href
    )) as {
      createServer(config: object): Promise<ServerLike>;
    };
    server = await vite.createServer({
      root: appDir,
      configFile: path.join(appDir, "vite.config.ts"),
      server: { port, strictPort: true, host: "127.0.0.1" },
      logLevel: "error",
    });
    await server.listen(port);
    const playwright = require("@playwright/test") as {
      chromium: { launch(options: object): Promise<BrowserLike> };
    };
    browser = await playwright.chromium.launch({
      channel: "chrome",
      headless: true,
      // The frame is read from a 2D canvas. Where Chrome draws a canvas on the GPU (a Mac,
      // headless too) it anti-aliases the edges another way than in software, which is what a
      // headless Chrome draws with on Linux and what the thresholds of the check were measured
      // with: the same flag as the e2e suite (app/playwright.config.ts).
      args: ["--disable-accelerated-2d-canvas"],
    });
  } catch (error) {
    console.log(
      `Pixel comparison unavailable: ${String(error).split("\n")[0]}`,
    );
    await browser?.close();
    await server?.close();
    return null;
  }
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  const b = browser;
  const s = server;
  return {
    async frame(project, formulas, t) {
      const arg = JSON.stringify({
        project,
        formulas: [...formulas.entries()],
        t,
      });
      const dataUrl = await page.evaluate(`(${BROWSER_FRAME})(${arg})`);
      return Buffer.from(dataUrl.split(",")[1]!, "base64");
    },
    async close() {
      await b.close();
      await s.close();
    },
  };
}

/** RGB24 pixels of an image or of frame `index` of a video. */
export function decodeRgb(
  file: string,
  width: number,
  height: number,
  index?: number,
): Buffer {
  const args = ["-v", "error", "-i", file];
  if (index !== undefined)
    args.push("-vf", `select=eq(n\\,${index})`, "-vframes", "1");
  args.push(
    "-s",
    `${width}x${height}`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-",
  );
  const res = spawnSync("ffmpeg", args, { maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`ffmpeg: ${res.stderr.toString()}`);
  return res.stdout;
}

export interface PixelResult {
  /** Intersection over union of the foreground masks. */
  iou: number;
  /** Share of each mask's pixels within 1 px of the other mask (antialiasing slack). */
  coverage: number;
  foreground: [number, number];
}

/** Foreground: any channel more than `threshold` away from the background colour. */
export function comparePixels(
  a: Buffer,
  b: Buffer,
  width: number,
  height: number,
  background: [number, number, number],
  threshold = 64,
): PixelResult {
  const mask = (buf: Buffer) => {
    const m = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const d = Math.max(
        Math.abs(buf[3 * i]! - background[0]),
        Math.abs(buf[3 * i + 1]! - background[1]),
        Math.abs(buf[3 * i + 2]! - background[2]),
      );
      m[i] = d > threshold ? 1 : 0;
    }
    return m;
  };
  const ma = mask(a);
  const mb = mask(b);
  let inter = 0;
  let union = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < ma.length; i++) {
    if (ma[i] && mb[i]) inter++;
    if (ma[i] || mb[i]) union++;
    na += ma[i]!;
    nb += mb[i]!;
  }
  const near = (m: Uint8Array, x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (
          xx >= 0 &&
          yy >= 0 &&
          xx < width &&
          yy < height &&
          m[yy * width + xx]
        )
          return true;
      }
    }
    return false;
  };
  let covered = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (ma[i] && near(mb, x, y)) covered++;
      if (mb[i] && near(ma, x, y)) covered++;
    }
  }
  return {
    iou: union === 0 ? 1 : inter / union,
    coverage: na + nb === 0 ? 1 : covered / (na + nb),
    foreground: [na, nb],
  };
}
