// Otorisasi OAuth 2.1 (kode + PKCE S256) untuk klien AI (ChatGPT, Claude, dll.). Halaman persetujuan dirender server;
// pengguna harus sudah login (cookie sesi aplikasi). Redirect URI harus terdaftar persis; galat tidak pernah dialihkan ke URI tak dikenal.
import { createFileRoute } from "@tanstack/react-router";

const ENT: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENT[c] ?? c);
const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f5f7;margin:0;display:grid;min-height:100vh;place-items:center}main{background:#fff;max-width:26rem;width:calc(100% - 2rem);padding:2rem;border-radius:.75rem;box-shadow:0 1px 8px #0002}
h1{font-size:1.15rem;margin:0 0 .75rem}p,li{font-size:.9rem;color:#444;line-height:1.5}ul{padding-left:1.1rem}.row{display:flex;gap:.5rem;margin-top:1.25rem}button{flex:1;padding:.6rem;border-radius:.5rem;border:1px solid #bbb;background:#fff;font-size:.9rem;cursor:pointer}button.p{background:#0f2a4a;color:#fff;border-color:#0f2a4a}</style></head><body><main>${body}</main></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "frame-ancestors 'none'",
      },
    },
  );

async function sessionUser(request: Request) {
  const g = await import("@/lib/google-oauth.server");
  const j = await import("@/lib/auth-jwt.server");
  const token = g.readCookie(request.headers.get("cookie"), j.APP_JWT_COOKIE);
  const claims = token ? await j.verifyAppJwt(token) : null;
  if (!claims?.sub) return null;
  const u = await j.findAppUserById(claims.sub);
  return u ? { id: u.id as string, email: u.email as string } : null;
}

type Params = { clientId: string; redirectUri: string; challenge: string; state: string };

async function validate(p: Params) {
  const a = await import("@/lib/mcp/auth.server");
  const client = await a.getClient(p.clientId);
  if (!client || !client.redirectUris.includes(p.redirectUri))
    return { error: "Aplikasi atau alamat pengalihan tidak dikenal." } as const;
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(p.challenge))
    return { error: "Permintaan tidak valid (PKCE S256 wajib)." } as const;
  return { client } as const;
}

const redirectBack = (uri: string, params: Record<string, string>) => {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return new Response(null, {
    status: 302,
    headers: { Location: u.href, "Cache-Control": "no-store" },
  });
};

export const Route = createFileRoute("/oauth/authorize")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams;
        const p: Params = {
          clientId: q.get("client_id") ?? "",
          redirectUri: q.get("redirect_uri") ?? "",
          challenge: q.get("code_challenge") ?? "",
          state: q.get("state") ?? "",
        };
        if (q.get("response_type") !== "code" || q.get("code_challenge_method") !== "S256")
          return page(
            "Permintaan tidak valid",
            "<h1>Permintaan tidak valid</h1><p>Hanya alur kode dengan PKCE S256 yang didukung.</p>",
            400,
          );
        const v = await validate(p);
        if ("error" in v)
          return page(
            "Permintaan tidak valid",
            `<h1>Permintaan tidak valid</h1><p>${esc(String(v.error))}</p>`,
            400,
          );
        const user = await sessionUser(request);
        if (!user) {
          const next = encodeURIComponent(`/oauth/authorize${url.search}`);
          return page(
            "Masuk dulu",
            `<h1>Masuk untuk menyambungkan <b>${esc(v.client.name)}</b></h1><p>Pilih cara masuk akun Anda, lalu Anda akan kembali ke halaman persetujuan ini.</p>
<div class="row" style="flex-direction:column"><a href="/qalling/login?next=${next}"><button class="p" type="button">Masuk dengan akun Qalling (Google / kode email)</button></a><a href="/auth?next=${next}"><button type="button">Masuk dengan email &amp; kata sandi XPERD</button></a></div>`,
            401,
          );
        }
        const hidden = Object.entries({
          client_id: p.clientId,
          redirect_uri: p.redirectUri,
          code_challenge: p.challenge,
          state: p.state,
        })
          .map(([k, val]) => `<input type="hidden" name="${k}" value="${esc(val)}">`)
          .join("");
        return page(
          "Izinkan akses",
          `<h1>Izinkan <b>${esc(v.client.name)}</b> mengakses akun Anda?</h1>
<p>Anda masuk sebagai <b>${esc(user.email)}</b>. Aplikasi ini akan dapat, atas nama Anda dan sebatas izin workspace Anda:</p>
<ul><li>melihat workspace, prospek, postingan, dan ringkasan keuangan;</li><li>membuat draf postingan, prospek, dan ide konten (tidak pernah menerbitkan langsung).</li></ul>
<p>Anda dapat mencabut akses kapan saja di Qalling → Integrasi AI.</p>
<form method="post" action="/oauth/authorize">${hidden}<div class="row"><button name="decision" value="deny" type="submit">Tolak</button><button class="p" name="decision" value="allow" type="submit">Izinkan</button></div></form>`,
        );
      },
      POST: async ({ request }) => {
        const f = new URLSearchParams(await request.text());
        const p: Params = {
          clientId: f.get("client_id") ?? "",
          redirectUri: f.get("redirect_uri") ?? "",
          challenge: f.get("code_challenge") ?? "",
          state: f.get("state") ?? "",
        };
        const v = await validate(p);
        if ("error" in v)
          return page(
            "Permintaan tidak valid",
            `<h1>Permintaan tidak valid</h1><p>${esc(String(v.error))}</p>`,
            400,
          );
        const user = await sessionUser(request);
        if (!user)
          return page(
            "Sesi berakhir",
            "<h1>Sesi berakhir</h1><p>Masuk kembali lalu ulangi sambungan dari aplikasi AI Anda.</p>",
            401,
          );
        if (f.get("decision") !== "allow")
          return redirectBack(p.redirectUri, { error: "access_denied", state: p.state });
        const a = await import("@/lib/mcp/auth.server");
        const code = await a.createAuthCode({
          clientId: p.clientId,
          userId: user.id,
          redirectUri: p.redirectUri,
          codeChallenge: p.challenge,
        });
        return redirectBack(p.redirectUri, { code, state: p.state });
      },
    },
  },
});
