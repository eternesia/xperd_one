// Fungsi render bersama (dipakai worker.mjs dan sample.mjs).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";

const here = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_IDS = ["promo", "showcase", "story", "catalog", "announce"];
const browserExecutable = process.env.BROWSER_EXECUTABLE || undefined;

let serveUrl;
/** Bundel proyek Remotion sekali saat mulai (±10–30 detik), dipakai ulang untuk semua render. */
export async function prepare() {
  if (!browserExecutable) await ensureBrowser({ logLevel: "warn" });
  if (!serveUrl) serveUrl = await bundle({ entryPoint: path.join(here, "src/index.ts") });
  return serveUrl;
}

/** Render satu video Template ke berkas MP4 (H.264, 1080p, 30 fps). */
export async function renderTemplate({ template, props, output, onProgress }) {
  if (!TEMPLATE_IDS.includes(template)) throw new Error(`Template tidak dikenal: ${template}`);
  const url = await prepare();
  const composition = await selectComposition({ serveUrl: url, id: template, inputProps: props, browserExecutable });
  await renderMedia({
    composition,
    serveUrl: url,
    codec: "h264",
    crf: 20,
    pixelFormat: "yuv420p",
    outputLocation: output,
    inputProps: props,
    browserExecutable,
    concurrency: Number(process.env.RENDER_CONCURRENCY) || null,
    chromiumOptions: { gl: process.env.RENDER_GL || "swangle" },
    onProgress: onProgress ? ({ progress }) => onProgress(progress) : undefined,
    logLevel: "warn",
  });
  return output;
}
