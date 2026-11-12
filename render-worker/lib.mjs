// Fungsi render bersama (dipakai worker.mjs dan sample.mjs).
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";
import { MOOD_OF, writeBed, writeSfx } from "./sfx.mjs";
import fs from "node:fs";
import crypto from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_IDS = ["promo", "showcase", "story", "catalog", "announce", "motion", "steps"];
const browserExecutable = process.env.BROWSER_EXECUTABLE || undefined;

let serveUrl;
/** Bundel proyek Remotion sekali saat mulai (±10–30 detik), dipakai ulang untuk semua render. */
export async function prepare() {
  if (!browserExecutable) await ensureBrowser({ logLevel: "warn" });
  if (!serveUrl) {
    // Efek suara disintesis ke folder publik sementara, lalu ikut dibundel.
    const publicDir = path.join(os.tmpdir(), "qalling-render-public");
    writeSfx(publicDir);
    serveUrl = await bundle({ entryPoint: path.join(here, "src/index.ts"), publicDir });
  }
  return serveUrl;
}

/** Folder berkas statis di dalam bundel (tempat narasi sementara diletakkan). */
export async function publicDir() {
  return path.join(await prepare(), "public");
}

/** Render satu video Template ke berkas MP4 (H.264, 1080p, 30 fps). */
export async function renderTemplate({ template, props, output, onProgress }) {
  if (!TEMPLATE_IDS.includes(template)) throw new Error(`Template tidak dikenal: ${template}`);
  const url = await prepare();
  const composition = await selectComposition({ serveUrl: url, id: template, inputProps: props, browserExecutable });
  // Hasil calculateMetadata (rasio, warna dari foto) dipakai sebagai props render.
  let inputProps = { ...props, ...(composition.props || {}) };
  // Suara latar bertema, disintesis sepanjang durasi video (kecuali efek suara dimatikan).
  let bedFile;
  if (props.sound !== false && !props.bed) {
    const rel = `bed/${crypto.randomUUID()}.wav`;
    bedFile = path.join(await publicDir(), rel);
    writeBed(bedFile, composition.durationInFrames / composition.fps, MOOD_OF[template]);
    inputProps = { ...inputProps, bed: rel };
  }
  try {
  await renderMedia({
    // Props hasil calculateMetadata + suara latar; komponen menerima `composition.props`.
    composition: { ...composition, props: inputProps },
    serveUrl: url,
    codec: "h264",
    crf: 20,
    pixelFormat: "yuv420p",
    outputLocation: output,
    inputProps,
    browserExecutable,
    concurrency: Number(process.env.RENDER_CONCURRENCY) || null,
    chromiumOptions: { gl: process.env.RENDER_GL || "swangle" },
    onProgress: onProgress ? ({ progress }) => onProgress(progress) : undefined,
    logLevel: "warn",
  });
  } finally {
    if (bedFile) fs.rmSync(bedFile, { force: true });
  }
  return output;
}
