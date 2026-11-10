/**
 * Lapisan penyedia Studio AI yang bisa diganti (fal.ai / Atlas Cloud). Keduanya asinkron:
 * `submit` mengantre pekerjaan, `check` menanyakan status dan mengembalikan URL video bila selesai.
 * Hanya boleh diimpor dari kode server (memakai API key).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- respons JSON penyedia tidak bertipe */
import type { AiProvider } from "./ai-studio";

export interface SubmitInput {
  model: string;
  imageParam: string;
  imageUrl: string;
  prompt: string;
  duration: number;
  aspectRatio: string;
  extra?: Record<string, string | number | boolean>;
}
export interface Submitted {
  externalId: string;
  statusUrl: string | null;
  responseUrl: string | null;
}
export interface JobRef {
  model: string;
  external_id: string;
  status_url: string | null;
  response_url: string | null;
}
export type CheckResult =
  { state: "pending" } | { state: "done"; videoUrl: string } | { state: "failed"; error: string };

const TIMEOUT_MS = 30_000;

async function call(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, body };
}

const errText = (status: number, body: any) => {
  const d = body?.detail ?? body?.message ?? body?.msg ?? body?.error ?? body?.raw ?? "";
  const s = typeof d === "string" ? d : JSON.stringify(d);
  return `HTTP ${status}${s ? `: ${s.slice(0, 300)}` : ""}`;
};

/* --------------------------------- fal.ai --------------------------------- */
// Queue API: POST https://queue.fal.run/{model} → { request_id, status_url, response_url }.
const fal = {
  async submit(key: string, i: SubmitInput): Promise<Submitted> {
    const r = await call(`https://queue.fal.run/${i.model}`, {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: i.prompt,
        [i.imageParam]: i.imageUrl,
        duration: String(i.duration),
        aspect_ratio: i.aspectRatio,
        ...i.extra,
      }),
    });
    if (!r.ok || !r.body?.request_id) throw new Error(`fal: ${errText(r.status, r.body)}`);
    return {
      externalId: String(r.body.request_id),
      statusUrl: r.body.status_url ?? null,
      responseUrl: r.body.response_url ?? null,
    };
  },
  async check(key: string, j: JobRef): Promise<CheckResult> {
    const base = `https://queue.fal.run/${j.model}/requests/${j.external_id}`;
    const headers = { Authorization: `Key ${key}` };
    const s = await call(j.status_url ?? `${base}/status`, { headers });
    if (!s.ok) {
      if (s.status >= 500) return { state: "pending" };
      return { state: "failed", error: `fal: ${errText(s.status, s.body)}` };
    }
    const status = String(s.body?.status ?? "");
    if (status === "IN_QUEUE" || status === "IN_PROGRESS") return { state: "pending" };
    if (status !== "COMPLETED") return { state: "failed", error: `fal: status ${status || "?"}` };
    const out = await call(j.response_url ?? base, { headers });
    if (!out.ok) return { state: "failed", error: `fal: ${errText(out.status, out.body)}` };
    const url = out.body?.video?.url ?? out.body?.videos?.[0]?.url;
    return url
      ? { state: "done", videoUrl: String(url) }
      : { state: "failed", error: "fal: tanpa video" };
  },
};

/* ------------------------------- Atlas Cloud ------------------------------- */
// POST https://api.atlascloud.ai/api/v1/model/generateVideo → { data: { id } };
// GET  https://api.atlascloud.ai/api/v1/model/prediction/{id} → { data: { status, outputs } }.
const ATLAS = "https://api.atlascloud.ai/api/v1/model";
const atlas = {
  async submit(key: string, i: SubmitInput): Promise<Submitted> {
    const r = await call(`${ATLAS}/generateVideo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: i.model,
        prompt: i.prompt,
        [i.imageParam]: i.imageUrl,
        duration: i.duration,
        aspect_ratio: i.aspectRatio,
        ...i.extra,
      }),
    });
    const id = r.body?.data?.id;
    if (!r.ok || !id) throw new Error(`atlas: ${errText(r.status, r.body)}`);
    return { externalId: String(id), statusUrl: null, responseUrl: null };
  },
  async check(key: string, j: JobRef): Promise<CheckResult> {
    const r = await call(`${ATLAS}/prediction/${encodeURIComponent(j.external_id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) {
      if (r.status >= 500) return { state: "pending" };
      return { state: "failed", error: `atlas: ${errText(r.status, r.body)}` };
    }
    const d = r.body?.data ?? {};
    const status = String(d.status ?? "").toLowerCase();
    if (["failed", "error", "canceled", "cancelled"].includes(status))
      return { state: "failed", error: `atlas: ${d.error ?? status}` };
    if (!["completed", "succeeded", "success"].includes(status)) return { state: "pending" };
    const o = Array.isArray(d.outputs) ? d.outputs[0] : d.output;
    const url = typeof o === "string" ? o : (o?.url ?? o?.video_url);
    return url
      ? { state: "done", videoUrl: String(url) }
      : { state: "failed", error: "atlas: tanpa video" };
  },
};

export const PROVIDERS: Record<AiProvider, typeof fal> = { fal, atlas };
