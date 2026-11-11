// Only billing destinations are accepted; provider redirects never settle funds.
export function walletReturnPath(pathname: string): string {
  // Studio AI: kembali ke halaman Studio supaya kredit yang baru masuk langsung terlihat.
  if (pathname === "/qalling/app/studio") return pathname;
  if (pathname === "/qalling/app" || pathname.startsWith("/qalling/app/"))
    return "/qalling/app/billing";
  const workspace = pathname.match(/^\/app\/w\/([0-9a-f-]{36})(?:\/|$)/i);
  if (workspace) return `/app/w/${workspace[1]}/billing`;
  throw new Error("Halaman asal pembayaran tidak valid.");
}

/** `origin` = alamat publik aplikasi (domain yang dipakai pengguna); provider hanya menerima HTTPS. */
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
