/** Tautan unggah berumur pendek untuk klien yang punya terminal: `curl --data-binary @foto.jpg "<url>"`. */
import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => {
  const s = process.env.APP_JWT_SECRET;
  if (!s) throw new Error("APP_JWT_SECRET is not configured");
  return s;
};
const mac = (body: string) =>
  createHmac("sha256", secret()).update(`mcp-upload.${body}`).digest("base64url");

export function signUploadToken(workspaceId: string, userId: string, ttlSeconds = 1800) {
  const body = Buffer.from(
    JSON.stringify({ w: workspaceId, u: userId, e: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function verifyUploadToken(token: string | null) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = mac(body);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want)))
    return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      w: string;
      u: string;
      e: number;
    };
    if (!v.w || !v.u || !(v.e > Date.now() / 1000)) return null;
    return { workspaceId: v.w, userId: v.u };
  } catch {
    return null;
  }
}

export const uploadOrigin = () =>
  (process.env.APP_PUBLIC_URL ?? "https://qalling.id").replace(/\/$/, "");
