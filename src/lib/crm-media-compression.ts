import { scaledDimensions, type MediaUploadPolicy } from "./media-upload-policy";

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
      // Retain PNG transparency and JPG/PNG compatibility for custom covers.
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, file.type, policy.image_quality / 100),
      );
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name, { type: blob.type, lastModified: file.lastModified });
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
