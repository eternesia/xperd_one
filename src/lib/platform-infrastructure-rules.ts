export function validateStorageEndpoint(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Endpoint harus HTTPS tanpa path atau kredensial");
  const host = url.hostname.toLowerCase();
  const approved = /(^|\.)amazonaws\.com$|(^|\.)r2\.cloudflarestorage\.com$|(^|\.)wasabisys\.com$|(^|\.)digitaloceanspaces\.com$|(^|\.)backblazeb2\.com$/.test(host);
  if (!approved) throw new Error("Pengujian hanya tersedia untuk endpoint resmi S3, R2, Wasabi, Spaces atau B2");
  return url.origin;
}