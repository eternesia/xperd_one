import { uploadWorkspaceFileChunk } from "@/lib/files.functions";

/** Ukuran potongan mentah: ±384 KB → ±512 KB setelah base64, aman di bawah batas body proxy 1 MB. */
export const UPLOAD_CHUNK_BYTES = 384 * 1024;

function bytesToBase64(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Unggah berkas ke penyimpanan workspace dalam potongan kecil. Mengembalikan path berkas tersimpan. */
export async function uploadFileChunked(p: {
  workspaceId: string;
  folder: string;
  file: File;
}): Promise<{ path: string; size: number }> {
  const uploadId = crypto.randomUUID();
  const total = Math.max(1, Math.ceil(p.file.size / UPLOAD_CHUNK_BYTES));
  for (let index = 0; index < total; index++) {
    const slice = p.file.slice(index * UPLOAD_CHUNK_BYTES, (index + 1) * UPLOAD_CHUNK_BYTES);
    const chunk = bytesToBase64(new Uint8Array(await slice.arrayBuffer()));
    let lastError: unknown;
    // Percobaan ulang ringan untuk gangguan jaringan sesaat; potongan bersifat idempoten (tulis ulang file indeks yang sama).
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await uploadWorkspaceFileChunk({
          data: {
            workspaceId: p.workspaceId,
            folder: p.folder,
            fileName: p.file.name,
            uploadId,
            index,
            total,
            chunk,
          },
        });
        if (r.done) return { path: r.path, size: r.size };
        lastError = undefined;
        break;
      } catch (e) {
        lastError = e;
        if (/Forbidden|tidak diizinkan|melebihi|kosong/i.test((e as Error).message)) throw e;
      }
    }
    if (lastError) throw lastError;
  }
  throw new Error("Unggahan tidak selesai");
}
