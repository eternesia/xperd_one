import { scaledDimensions, type MediaUploadPolicy } from "./media-upload-policy";

/** Semua piksel tidak transparan? (sampel maks ±250 ribu piksel agar cepat). */
function isOpaque(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const data = ctx.getImageData(0, 0, width, height).data;
  const step = Math.max(1, Math.floor((width * height) / 250_000)) * 4;
  for (let i = 3; i < data.length; i += step) if (data[i] < 255) return false;
  return true;
}

/** Called only after upload submission. Never replaces a file with a larger result. */
export async function compressCrmMedia(file: File, policy: MediaUploadPolicy): Promise<File> {
  if (
    file.type.startsWith("image/") &&
    policy.compress_images &&
    ["image/jpeg", "image/png", "image/webp"].includes(file.type)
  ) {
    let bitmap: ImageBitmap | undefined;
    try {
      // Keep animated images intact rather than flattening them into one frame.
      if (file.type === "image/webp" || file.type === "image/png") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const text = new TextDecoder("latin1").decode(bytes);
        if (text.includes("ANIM") || text.includes("acTL")) return file;
      }
      bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const dimensions = scaledDimensions(bitmap.width, bitmap.height, policy.image_max_edge);
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      // PNG tanpa transparansi (mis. tangkapan layar) jauh lebih kecil sebagai JPG; PNG transparan tetap PNG.
      let type = file.type;
      if (type === "image/png" && isOpaque(context, canvas.width, canvas.height)) {
        type = "image/jpeg";
      }
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, type, policy.image_quality / 100),
      );
      if (!blob || blob.size >= file.size) return file;
      const name = type !== file.type ? file.name.replace(/\.[^.]+$/, "") + ".jpg" : file.name;
      return new File([blob], name, { type: blob.type, lastModified: file.lastModified });
    } catch {
      return file;
    } finally {
      bitmap?.close();
    }
  }
  if (file.type.startsWith("video/") && policy.compress_videos) {
    let dispose: (() => void) | undefined;
    try {
      const m = await import("mediabunny");
      const input = new m.Input({ source: new m.BlobSource(file), formats: m.ALL_FORMATS });
      dispose = () => input.dispose();
      const track = await input.getPrimaryVideoTrack();
      if (!track) return file;
      const { width, height } = scaledDimensions(track.displayWidth, track.displayHeight, 1920);
      const bitrate = policy.video_mbps * 1_000_000;
      if (!(await m.canEncodeVideo("avc", { width, height, bitrate }))) return file;
      const target = new m.BufferTarget();
      const output = new m.Output({ format: new m.Mp4OutputFormat(), target });
      const conversion = await m.Conversion.init({
        input,
        output,
        tracks: "primary",
        video: { codec: "avc", width, height, fit: "contain", bitrate, forceTranscode: true },
        audio: { codec: "aac", bitrate: 192_000, forceTranscode: true },
      });
      if (!conversion.isValid || conversion.discardedTracks.length) return file;
      await conversion.execute();
      const buffer = target.buffer;
      if (!buffer || buffer.byteLength >= file.size) return file;
      return new File([buffer], file.name.replace(/\.[^.]+$/, "") + ".mp4", {
        type: "video/mp4",
        lastModified: file.lastModified,
      });
    } catch {
      return file;
    } finally {
      dispose?.();
    }
  }
  return file;
}
