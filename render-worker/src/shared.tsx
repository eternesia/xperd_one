import React, { useEffect, useState } from "react";
import {
  continueRender,
  delayRender,
  Easing,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const FPS = 30;
export const DURATION = 180; // 6 detik (bawaan)
export const SECONDS = [6, 10, 15];
/** Slideshow Katalog: frame per foto dan frame penutup. */
export const SLIDE = 75;
export const SLIDE_OUTRO = 60;

export interface TemplateProps {
  /** Foto produk (data URL atau URL). */
  image: string;
  headline: string;
  subline: string;
  /** Harga / label promo, mis. "Rp18.000" atau "Diskon 20%". */
  badge: string;
  cta: string;
  accent: string;
  ratio: "9:16" | "1:1" | "16:9";
  /** Durasi video: 6, 10, atau 15 detik (bawaan 6). */
  seconds?: number;
  /** Slideshow Katalog: foto + nama + harga per slide. */
  items?: { image: string; title: string; price: string }[];
}

export const sizeOf = (ratio: string) =>
  ratio === "1:1"
    ? { width: 1080, height: 1080 }
    : ratio === "16:9"
      ? { width: 1920, height: 1080 }
      : { width: 1080, height: 1920 };

export const framesOf = (seconds?: number) =>
  (SECONDS.includes(Number(seconds)) ? Number(seconds) : 6) * FPS;

/**
 * Pengali waktu muncul: video lebih panjang memunculkan teks sedikit lebih lambat (maks 1,5×),
 * sisanya dipakai untuk menahan tampilan akhir supaya terbaca.
 */
export function usePace() {
  const { durationInFrames } = useVideoConfig();
  const k = Math.min(1.5, Math.max(1, durationInFrames / DURATION));
  return (frame: number) => Math.round(frame * k);
}

export const FONT = "Poppins, system-ui, sans-serif";

/** Tunda render sampai font Poppins siap, supaya frame pertama tidak memakai font cadangan. */
export function useFonts() {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    Promise.all(["500", "600", "700"].map((w) => document.fonts.load(`${w} 40px Poppins`)))
      .catch(() => undefined)
      .then(() => continueRender(handle));
  }, [handle]);
}

/** Warna teks (gelap/terang) yang terbaca di atas warna aksen. */
export function onAccent(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#111827" : "#FFFFFF";
}

/** Muncul: geser dari bawah + pudar masuk, mulai di frame `at`. */
export function useRise(at: number, distance = 60) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 200, mass: 0.7 } });
  return { opacity: s, transform: `translateY(${(1 - s) * distance}px)` };
}

/** Membal (untuk lencana harga). */
export function usePop(at: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 11, mass: 0.6 } });
  return { opacity: Math.min(1, s * 2), transform: `scale(${s})` };
}

/** Zoom pelan sepanjang video (efek Ken Burns). */
export function useKenBurns(from = 1.04, to = 1.16) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return interpolate(frame, [0, durationInFrames], [from, to], { easing: Easing.inOut(Easing.quad) });
}

/** Pudar keluar di akhir supaya enak diputar berulang. */
export function useOutro(frames = 12) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return interpolate(frame, [durationInFrames - frames, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Ukuran huruf mengecil untuk teks panjang supaya tidak meluber. */
export const fit = (text: string, base: number, comfy: number) =>
  Math.round(base * Math.min(1, Math.max(0.55, comfy / Math.max(1, text.length))));

export const Photo: React.FC<{ src: string; style?: React.CSSProperties }> = ({ src, style }) =>
  src ? (
    <Img
      src={src}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }}
    />
  ) : (
    <div style={{ width: "100%", height: "100%", background: "linear-gradient(160deg,#d9c7b4,#b89a7c)", ...style }} />
  );
