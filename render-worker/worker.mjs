// Mesin render Template Studio AI Qalling.
// Mengambil pekerjaan dari Qalling (koneksi keluar saja), merender dengan Remotion, mengunggah MP4.
//   QALLING_URL   mis. https://qalling.id        (wajib)
//   WORKER_TOKEN  token dari Super Admin → Studio AI → Template   (wajib)
//   POLL_SECONDS  jeda saat antrean kosong (bawaan 5)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepare, renderTemplate } from "./lib.mjs";

const BASE = (process.env.QALLING_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.WORKER_TOKEN || "";
const POLL = Math.max(2, Number(process.env.POLL_SECONDS) || 5) * 1000;
const VERSION = "1.0.0";
if (!/^https?:\/\//.test(BASE) || TOKEN.length < 20) {
  console.error("QALLING_URL dan WORKER_TOKEN wajib diisi.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);
let stopping = false;
for (const s of ["SIGTERM", "SIGINT"]) process.on(s, () => ((stopping = true), log("berhenti setelah pekerjaan ini…")));

async function api(pathname, init = {}) {
  const res = await fetch(`${BASE}/api/public/render-worker/${pathname}`, {
    method: "POST",
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(init.timeout ?? 30_000),
  });
  if (!res.ok) throw new Error(`${pathname} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function imageDataUrl(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`unduh foto HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > 20 * 1024 * 1024) throw new Error("ukuran foto tidak valid");
  const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
  return `data:${type};base64,${buf.toString("base64")}`;
}

async function run(job) {
  const t0 = Date.now();
  const output = path.join(os.tmpdir(), `qalling-${job.id}.mp4`);
  try {
    const image = await imageDataUrl(job.image_url);
    await renderTemplate({ template: job.template, props: { ...job.props, image }, output });
    const bytes = fs.readFileSync(output);
    await api(`complete?job=${encodeURIComponent(job.id)}`, {
      body: bytes,
      headers: { "Content-Type": "video/mp4" },
      timeout: 120_000,
    });
    log(`selesai ${job.id} ${job.template} ${((Date.now() - t0) / 1000).toFixed(1)}s ${(bytes.length / 1e6).toFixed(2)}MB`);
  } catch (e) {
    log(`gagal ${job.id}: ${e.message}`);
    await api("fail", {
      body: JSON.stringify({ job: job.id, error: String(e.message).slice(0, 500) }),
      headers: { "Content-Type": "application/json" },
    }).catch((x) => log("lapor gagal tidak terkirim:", x.message));
  } finally {
    fs.rmSync(output, { force: true });
  }
}

log(`menyiapkan Remotion (v${VERSION})…`);
await prepare();
log(`siap. Menunggu pekerjaan dari ${BASE}`);
let errors = 0;
while (!stopping) {
  try {
    const { job } = await api("claim", {
      body: JSON.stringify({ version: VERSION, host: os.hostname(), cpus: os.cpus().length }),
      headers: { "Content-Type": "application/json" },
    });
    errors = 0;
    if (job) await run(job);
    else await sleep(POLL);
  } catch (e) {
    errors++;
    log("tidak bisa menghubungi Qalling:", e.message);
    await sleep(Math.min(60_000, POLL * 2 ** Math.min(errors, 4)));
  }
}
log("berhenti.");
