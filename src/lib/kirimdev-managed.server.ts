/** Kirimdev dikelola platform: workspace = customer Kirimdev; pengguna memasang nomornya lewat setup link. */
import { execute, executeOne } from "@/integrations/mysql/pool";
import { KIRIMDEV_BASE, kirimdev, platformKirimdevKey, recordWaStatus } from "./wa-send.server";

type Api = { api_token: string; endpoint_url: null };
const asApi = async (): Promise<Api> => {
  const key = await platformKirimdevKey();
  if (!key) throw new Error("WhatsApp belum disiapkan oleh platform. Hubungi admin.");
  return { api_token: key, endpoint_url: null };
};
const flat = (r: unknown) =>
  ((r as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>;

type Acc = {
  phone_number_id: string | null;
  phone_number: string | null;
  name: string | null;
  status: string;
  onboarded_at: string | null;
};

async function wsRow(ws: string) {
  return executeOne<{ managed: number; kirimdev_customer_id: string | null; provider: string }>(
    "SELECT managed, kirimdev_customer_id, provider FROM crm_wa_settings WHERE workspace_id = ?",
    [ws],
  );
}

/** Buat customer Kirimdev untuk workspace bila belum ada, dan tandai workspace memakai mode dikelola. */
export async function ensureCustomer(ws: string) {
  const api = await asApi();
  const row = await wsRow(ws);
  if (row?.managed && row.kirimdev_customer_id) return row.kirimdev_customer_id;
  const w = await executeOne<{ name: string }>("SELECT name FROM workspaces WHERE id = ?", [ws]);
  const created = flat(
    await kirimdev(api, "POST", "/customers", {
      name: (w?.name ?? "Workspace").slice(0, 200),
      metadata: { workspace_id: ws, source: "qalling" },
    }),
  );
  const id = String(created.id ?? "");
  if (!id) throw new Error("Kirimdev tidak mengembalikan id customer.");
  await execute(
    `INSERT INTO crm_wa_settings (id, workspace_id, provider, is_active, managed, kirimdev_customer_id, phone_number_id, api_token, endpoint_url)
     VALUES (UUID(), ?, 'kirimdev', 1, 1, ?, NULL, NULL, NULL)
     ON DUPLICATE KEY UPDATE provider = 'kirimdev', managed = 1, kirimdev_customer_id = VALUES(kirimdev_customer_id),
       phone_number_id = NULL, api_token = NULL, endpoint_url = NULL, is_active = 1`,
    [ws, id],
  );
  return id;
}

/** Tautan sekali pakai agar pengguna menghubungkan nomor WhatsApp-nya sendiri (Embedded Signup Meta). */
/** Alamat kembali setelah pairing hanya boleh ke domain aplikasi sendiri. */
export function safeReturnUrl(raw?: string | null) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const app = process.env.APP_PUBLIC_URL ? new URL(process.env.APP_PUBLIC_URL).hostname : null;
    const ok =
      u.protocol === "https:" &&
      (u.hostname === app ||
        ["qalling.id", "xperd.id"].some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`)));
    return ok ? u.toString().slice(0, 1800) : null;
  } catch {
    return null;
  }
}

export async function createSetupLink(ws: string, returnUrl?: string | null) {
  const api = await asApi();
  const customer = await ensureCustomer(ws);
  const back = safeReturnUrl(returnUrl);
  const body: Record<string, string> = {};
  if (back) {
    const ok = new URL(back);
    ok.searchParams.set("wa", "connected");
    const fail = new URL(back);
    fail.searchParams.set("wa", "failed");
    body.success_redirect_url = ok.toString();
    body.failure_redirect_url = fail.toString();
  }
  const r = flat(
    await kirimdev(api, "POST", `/customers/${encodeURIComponent(customer)}/setup_links`, body),
  );
  const url = String(r.url ?? r.setup_url ?? r.link ?? "");
  if (!/^https:\/\//.test(url)) throw new Error("Kirimdev tidak mengembalikan tautan setup.");
  return { url, expiresAt: (r.expires_at as string | undefined) ?? null };
}

/** Baca status customer; simpan nomor pertama yang sudah terhubung sebagai nomor pengirim workspace. */
export async function syncManaged(ws: string) {
  const row = await wsRow(ws);
  if (!row?.managed || !row.kirimdev_customer_id)
    return { connected: false as const, accounts: [] as Acc[] };
  const api = await asApi();
  const c = flat(
    await kirimdev(api, "GET", `/customers/${encodeURIComponent(row.kirimdev_customer_id)}`),
  );
  const accounts = ((c.whatsapp_accounts as Acc[] | undefined) ?? []).filter(
    (a) => a.phone_number_id,
  );
  const ready = accounts.find((a) => a.onboarded_at) ?? accounts[0];
  if (ready?.phone_number_id) {
    await execute(
      "UPDATE crm_wa_settings SET phone_number_id = ?, number_display = ?, last_checked_at = NOW(), last_status = ? WHERE workspace_id = ?",
      [
        ready.phone_number_id,
        (ready.phone_number ?? ready.name ?? "").slice(0, 60) || null,
        `ok: terhubung (${ready.status})`,
        ws,
      ],
    );
  }
  return {
    connected: Boolean(ready?.phone_number_id),
    status: String(c.status ?? ""),
    accounts: accounts.map((a) => ({ ...a, phone_number_id: a.phone_number_id })),
  };
}

export async function disconnectManaged(ws: string) {
  const row = await wsRow(ws);
  if (!row?.managed || !row.kirimdev_customer_id) return;
  const api = await asApi();
  const cur = await executeOne<{ phone_number_id: string | null }>(
    "SELECT phone_number_id FROM crm_wa_settings WHERE workspace_id = ?",
    [ws],
  );
  if (cur?.phone_number_id) {
    await fetch(
      `${KIRIMDEV_BASE}/customers/${encodeURIComponent(row.kirimdev_customer_id)}/whatsapp_accounts/${encodeURIComponent(cur.phone_number_id)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${api.api_token}` },
        signal: AbortSignal.timeout(20_000),
      },
    );
  }
  await execute(
    "UPDATE crm_wa_settings SET phone_number_id = NULL, number_display = NULL WHERE workspace_id = ?",
    [ws],
  );
  await recordWaStatus(ws, "ok: nomor diputus");
}

export const INVOICE_TEMPLATE_NAME = "qalling_invoice";
export const INVOICE_TEMPLATE_TEXT =
  "Halo {{1}}, invoice {{2}} sebesar {{3}} sudah tersedia. Lihat dan unduh di sini: {{4}}";

/** Buat template invoice di akun WhatsApp workspace (menunggu persetujuan Meta). Aman dipanggil ulang. */
export async function ensureInvoiceTemplate(ws: string) {
  const row = await executeOne<{ managed: number; phone_number_id: string | null }>(
    "SELECT managed, phone_number_id FROM crm_wa_settings WHERE workspace_id = ?",
    [ws],
  );
  if (!row?.managed || !row.phone_number_id)
    throw new Error("Hubungkan nomor WhatsApp terlebih dahulu.");
  const api = await asApi();
  const phone = encodeURIComponent(row.phone_number_id);
  try {
    await kirimdev(api, "POST", `/${phone}/templates`, {
      name: INVOICE_TEMPLATE_NAME,
      category: "UTILITY",
      language: "id",
      components: [
        {
          type: "BODY",
          text: INVOICE_TEMPLATE_TEXT,
          example: {
            body_text: [
              ["Budi", "INV-202611-0001", "Rp1.500.000", "https://qalling.id/qalling/invoice/abc"],
            ],
          },
        },
      ],
    });
  } catch (e) {
    if (!/409|already/i.test((e as Error).message)) throw e;
  }
  await execute(
    "UPDATE crm_wa_settings SET invoice_template = ?, template_lang = 'id' WHERE workspace_id = ?",
    [INVOICE_TEMPLATE_NAME, ws],
  );
  const t = flat(await kirimdev(api, "GET", `/${phone}/templates/${INVOICE_TEMPLATE_NAME}`));
  return { status: String(t.status ?? "pending") };
}

export async function templateStatus(ws: string) {
  const row = await executeOne<{
    managed: number;
    phone_number_id: string | null;
    invoice_template: string | null;
  }>(
    "SELECT managed, phone_number_id, invoice_template FROM crm_wa_settings WHERE workspace_id = ?",
    [ws],
  );
  if (!row?.managed || !row.phone_number_id || !row.invoice_template) return null;
  const api = await asApi();
  try {
    const t = flat(
      await kirimdev(
        api,
        "GET",
        `/${encodeURIComponent(row.phone_number_id)}/templates/${encodeURIComponent(row.invoice_template)}`,
      ),
    );
    return String(t.status ?? "pending");
  } catch {
    return null;
  }
}
