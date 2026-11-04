// Token baca dokumen kepatuhan privat (JWT HS256, 5 menit, terikat pengguna + dokumen).
import { SignJWT, jwtVerify } from "jose";

function key() {
  const s = process.env["APP_JWT_SECRET"];
  if (!s) throw new Error("APP_JWT_SECRET is not configured");
  return new TextEncoder().encode(`mfg-doc:${s}`);
}
export async function signDocumentToken(userId: string, workspaceId: string, docId: string) {
  return new SignJWT({ sub: userId, ws: workspaceId, doc: docId, typ: "mfg-doc" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(key());
}
export async function verifyDocumentToken(token: string) {
  const { payload } = await jwtVerify(token, key());
  if (payload["typ"] !== "mfg-doc") throw new Error("bad token");
  return { userId: String(payload.sub), workspaceId: String(payload["ws"]), docId: String(payload["doc"]) };
}
