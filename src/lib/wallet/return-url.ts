// Only billing destinations are accepted; provider redirects never settle funds.
export function walletReturnPath(pathname: string): string {
  if (pathname === "/qalling/app" || pathname.startsWith("/qalling/app/"))
    return "/qalling/app/billing";
  const workspace = pathname.match(/^\/app\/w\/([0-9a-f-]{36})(?:\/|$)/i);
  if (workspace) return `/app/w/${workspace[1]}/billing`;
  throw new Error("Halaman asal pembayaran tidak valid.");
}

/** `origin` = alamat publik aplikasi (APP_PUBLIC_URL atau asal permintaan); provider hanya menerima HTTPS. */
export function walletReturnUrl(origin: string, returnPath: string): string {
  if (walletReturnPath(returnPath) !== returnPath)
    throw new Error("Tujuan kembali pembayaran tidak valid.");
  const base = new URL(origin);
  if (
    base.protocol !== "https:" &&
    !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))
  ) {
    throw new Error("Pembayaran membutuhkan alamat HTTPS.");
  }
  return new URL(returnPath, base.origin).href;
}
