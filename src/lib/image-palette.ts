/**
 * Warna tema dari foto pengguna: aksen (warna paling hidup) dan latar gelap (rona dominan, digelapkan).
 * Salinan dari `render-worker/src/palette.ts` untuk pratinjau Studio (browser); jaga agar tetap sama.
 */
export interface Palette {
  accent: string;
  dark: string;
}

const hex = (r: number, g: number, b: number) =>
  "#" +
  [r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();

function hsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s: max ? d / max : 0, v: max / 255 };
}

function fromHsv(h: number, s: number, v: number) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][((i % 6) + 6) % 6];
  return hex(r * 255, g * 255, b * 255);
}

export async function loadImage(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

export async function paletteOf(srcs: string[]): Promise<Palette> {
  const bins = Array.from({ length: 24 }, () => ({ w: 0, n: 0, h: 0, s: 0, v: 0 }));
  for (const src of srcs.filter(Boolean).slice(0, 4)) {
    try {
      const img = await loadImage(src);
      const c = document.createElement("canvas");
      c.width = 48;
      c.height = 48;
      const ctx = c.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0, 48, 48);
      const d = ctx.getImageData(0, 0, 48, 48).data;
      for (let i = 0; i < d.length; i += 4) {
        const { h, s, v } = hsv(d[i], d[i + 1], d[i + 2]);
        if (s < 0.12 || v < 0.12) continue;
        const b = bins[Math.floor(h * 24) % 24];
        b.n += 1;
        // Bobot aksen: warna jenuh dan terang lebih diutamakan daripada yang luas tapi kusam.
        const w = s > 0.35 && v > 0.35 ? s * s * v : 0;
        b.w += w;
        b.h += h;
        b.s += s;
        b.v += v;
      }
    } catch {
      /* foto tidak terbaca: abaikan */
    }
  }
  const byCount = [...bins].sort((a, b) => b.n - a.n)[0];
  const domBin = bins.indexOf(byCount);
  // Aksen sebaiknya kontras dengan rona dominan (mis. kuning helm di foto pabrik yang kebiruan),
  // jadi bin di dekat rona dominan diberi bobot kecil kecuali tidak ada pilihan lain.
  const far = (i: number) => Math.min(Math.abs(i - domBin), 24 - Math.abs(i - domBin)) >= 3;
  const score = (b: (typeof bins)[number], i: number) => b.w * (far(i) ? 1 : 0.15);
  const byAccent = bins.map((b, i) => ({ b, s: score(b, i) })).sort((x, y) => y.s - x.s)[0].b;
  const accent =
    byAccent.w > 3
      ? fromHsv(
          byAccent.h / byAccent.n,
          Math.max(0.62, Math.min(0.95, byAccent.s / byAccent.n + 0.1)),
          Math.max(0.88, byAccent.v / byAccent.n),
        )
      : "#F5B301";
  const dark =
    byCount.n > 40
      ? fromHsv(byCount.h / byCount.n, Math.max(0.45, Math.min(0.75, byCount.s / byCount.n)), 0.17)
      : "#0B1020";
  return { accent, dark };
}

/** Rasio otomatis dari bentuk foto: mendatar lebar → 16:9, hampir persegi → 1:1, tegak → 9:16. */
export async function ratioOf(src: string | undefined): Promise<"9:16" | "1:1" | "16:9"> {
  if (!src) return "9:16";
  try {
    const img = await loadImage(src);
    const r = img.naturalWidth / Math.max(1, img.naturalHeight);
    return r >= 1.3 ? "16:9" : r >= 0.9 ? "1:1" : "9:16";
  } catch {
    return "9:16";
  }
}
