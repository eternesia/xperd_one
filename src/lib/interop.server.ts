/**
 * ============================================================================
 * BOILERPLATE INTEGRASI PIHAK KETIGA — OPSIONAL, TIDAK WAJIB.
 * ============================================================================
 * Modul ini berisi kerangka (bukan fitur wajib) untuk dua integrasi yang di
 * Business Suite New bergantung pada layanan luar:
 *
 *   #21  Public web-to-lead API  -> endpoint `POST /api/public/leads`
 *   #22  Pengingat WhatsApp      -> endpoint `POST /api/cron/reminders`
 *
 * Prinsip desain:
 *   1. **Aman secara default**: selama env flag tidak diisi, kedua endpoint
 *      mengembalikan 404 dan tidak melakukan apa pun. Aplikasi tetap normal.
 *   2. **Tanpa dependensi baru**: tidak menambah paket npm, tabel, atau migrasi.
 *   3. **Transport-agnostic**: handler menerima `Request` dan mengembalikan
 *      `Response`, jadi bisa dipasang di `src/server.ts` (sekarang), atau
 *      dipindah ke route Nitro/TanStack server route tanpa mengubah isi modul.
 *
 * Cara mengaktifkan (semua opsional, lihat docs/INTEROP-BOILERPLATE.md):
 *
 *   PUBLIC_LEAD_API_ENABLED=true
 *   PUBLIC_LEAD_API_KEYS=<workspaceId>:<apiKey>[,<workspaceId>:<apiKey>...]
 *   CRON_API_ENABLED=true
 *   CRON_SECRET=<secret-panjang-acak>
 *
 * CATATAN PENTING (jangan dilewat):
 *   - `PUBLIC_LEAD_API_KEYS` berisi rahasia. Simpan di secret manager / .env
 *     server, JANGAN commit. Kolom key sengaja tidak pernah ditulis ke log.
 *   - Rate limit di sini in-memory per-proses (best effort). Untuk deployment
 *     multi-instance, ganti dengan Redis / rate limiter di reverse proxy.
 *   - Endpoint cron tidak punya scheduler sendiri; panggil dari cron eksternal
 *     (crontab, systemd timer, GitHub Actions, uptime pinger). Old tidak
 *     memasang scheduler in-process supaya tidak ada proses background wajib.
 * ============================================================================
 */

type Json = Record<string, unknown>;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" } as const;

function json(body: Json, status: number) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/* --------------------------------- config --------------------------------- */

function envFlag(name: string) {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function readEnv(name: string) {
  const value = (process.env[name] ?? "").trim();
  return value || null;
}

export function publicLeadApiEnabled() {
  return envFlag("PUBLIC_LEAD_API_ENABLED") && Boolean(readEnv("PUBLIC_LEAD_API_KEYS"));
}

export function reminderCronEnabled() {
  return envFlag("CRON_API_ENABLED") && Boolean(readEnv("CRON_SECRET"));
}

/** `workspaceId:apiKey` dipisah koma. Key dibandingkan konstan-waktu. */
function resolveApiKey(rawKey: string): string | null {
  const table = readEnv("PUBLIC_LEAD_API_KEYS");
  if (!table) return null;
  for (const pair of table.split(",")) {
    const idx = pair.indexOf(":");
    if (idx <= 0) continue;
    const workspaceId = pair.slice(0, idx).trim();
    const key = pair.slice(idx + 1).trim();
    if (!key) continue;
    if (constantTimeEqual(key, rawKey)) return workspaceId;
  }
  return null;
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------- rate limit ------------------------------- */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimit(bucket: string) {
  const now = Date.now();
  const entry = hits.get(bucket);
  if (!entry || entry.resetAt <= now) {
    hits.set(bucket, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true as const, remaining: MAX_PER_WINDOW - 1 };
  }
  entry.count += 1;
  if (entry.count > MAX_PER_WINDOW) {
    return { ok: false as const, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true as const, remaining: MAX_PER_WINDOW - entry.count };
}

/* --------------------------- #21 public lead API -------------------------- */

interface LeadPayload {
  name?: unknown;
  company_name?: unknown;
  email?: unknown;
  phone?: unknown;
  source?: unknown;
  notes?: unknown;
  estimated_value?: unknown;
}

function str(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * `POST /api/public/leads`
 * Header: `x-api-key: <key>`  Body JSON: { name, email?, phone?, company_name?, source?, notes? }
 * Balasan: 201 { ok: true, id, code } | 400 | 401 | 404 (nonaktif) | 405 | 429
 */
export async function handlePublicLeadRequest(request: Request): Promise<Response> {
  if (!publicLeadApiEnabled()) {
    return json({ error: "not_found" }, 404);
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const rawKey = (request.headers.get("x-api-key") ?? "").trim();
  if (!rawKey) return json({ error: "missing_api_key" }, 401);
  const workspaceId = resolveApiKey(rawKey);
  if (!workspaceId) return json({ error: "invalid_api_key" }, 401);

  const limit = rateLimit(`lead:${workspaceId}`);
  if (!limit.ok) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { ...JSON_HEADERS, "retry-after": String(limit.retryAfter) },
    });
  }

  let payload: LeadPayload;
  try {
    payload = (await request.json()) as LeadPayload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const name = str(payload.name, 160);
  const email = str(payload.email, 160);
  const phone = str(payload.phone, 40);
  if (!name) return json({ error: "name_required" }, 400);
  if (!email && !phone) return json({ error: "email_or_phone_required" }, 400);

  // TODO(opsional): samakan penomoran dengan CRM (`LD/…`) bila perlu.
  const code = `WEB-${Date.now().toString(36).toUpperCase()}`;
  const { execute, uuid } = await import("@/integrations/mysql/pool");
  const id = uuid();

  await execute(
    `INSERT INTO crm_leads
       (id, workspace_id, code, name, company_name, email, phone, source, stage, status, estimated_value, currency, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', 'open', ?, 'IDR', ?, NOW(), NOW())`,
    [
      id,
      workspaceId,
      code,
      name,
      str(payload.company_name, 160),
      email,
      phone,
      str(payload.source, 60) ?? "Website",
      Number(payload.estimated_value) || 0,
      str(payload.notes, 2000),
    ],
  );

  return json({ ok: true, id, code }, 201);
}

/* ------------------------- #22 reminder cron entry ------------------------ */

/**
 * `POST /api/cron/reminders`
 * Header: `x-cron-secret: <CRON_SECRET>`
 * Balasan: 200 { ok, ...stats } | 401 | 404 (nonaktif) | 405
 */
export async function handleReminderCronRequest(request: Request): Promise<Response> {
  if (!reminderCronEnabled()) {
    return json({ error: "not_found" }, 404);
  }
  if (request.method !== "POST" && request.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const expected = readEnv("CRON_SECRET");
  const provided = (request.headers.get("x-cron-secret") ?? "").trim();
  if (!expected || !provided || !constantTimeEqual(expected, provided)) {
    return json({ error: "invalid_cron_secret" }, 401);
  }

  const { runDueReminders } = await import("@/lib/reminders.server");
  const stats = await runDueReminders();
  return json({ ok: true, ...stats }, 200);
}
