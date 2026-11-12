import React, { createContext, useContext, useEffect, useState } from "react";
import {
  Audio,
  continueRender,
  getInputProps,
  delayRender,
  Easing,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const FPS = 30;
export const DURATION = 180; // 6 detik (bawaan)
export const SECONDS = [8, 10, 15, 20, 30, 45, 60];
/** Gelap bawaan bila foto tidak memberi warna. */
export const DARK = "#0b1020";
/** Langkah demi Langkah: frame pembuka, minimum per foto, penutup. */
export const STEPS = { intro: 60, scene: 75, outro: 75 };
/** Template satu-foto yang diulang per foto: minimum frame per foto. */
export const PER_PHOTO = 75;
/** Slideshow Katalog: frame per foto dan frame penutup. */
export const SLIDE = 75;
export const SLIDE_OUTRO = 60;
/** Motion Grafis: frame pembuka, per foto, dan penutup. */
export const MG = { intro: 45, scene: 60, outro: 60 };

export interface TemplateProps {
  /** Foto produk (data URL atau URL). */
  image: string;
  headline: string;
  subline: string;
  /** Harga / label promo, mis. "Rp18.000" atau "Diskon 20%". */
  badge: string;
  cta: string;
  accent: string;
  /** "auto" ditentukan dari bentuk foto pertama. */
  ratio: "9:16" | "1:1" | "16:9" | "auto";
  /** Warna latar gelap (otomatis dari foto). */
  dark?: string;
  /** Trek suara latar yang disintesis mesin render (folder publik bundel). */
  bed?: string;
  /** Durasi video yang diminta (detik); bisa dipanjangkan oleh jumlah foto atau narasi. */
  seconds?: number;
  /** Slideshow Katalog: foto + nama + harga per slide. */
  items?: { image: string; title: string; price: string }[];
  /** Efek suara (whoosh, pop, denting) mengikuti animasi. */
  sound?: boolean;
  /** Berkas narasi di folder publik bundel (mis. `narr/<id>.mp3`). */
  narration?: string;
}

export type SfxName = "whoosh" | "pop" | "tick" | "rise" | "thud" | "ding";

/** Putar satu efek suara mulai frame `at` (berkas disintesis oleh `sfx.mjs`). */
export const Sfx: React.FC<{ on?: boolean; name: SfxName; at: number; volume?: number }> = ({
  on,
  name,
  at,
  volume = 0.9,
}) =>
  on ? (
    <Sequence from={Math.max(0, Math.round(at))} layout="none">
      {/* Saat ada narasi, efek suara dikecilkan supaya suara orangnya jelas. */}
      <Audio
        src={staticFile(`sfx/${name}.wav`)}
        volume={volume * ((getInputProps() as { narration?: string }).narration ? 0.3 : 1)}
      />
    </Sequence>
  ) : null;

export const sizeOf = (ratio: string) =>
  ratio === "1:1"
    ? { width: 1080, height: 1080 }
    : ratio === "16:9"
      ? { width: 1920, height: 1080 }
      : { width: 1080, height: 1920 };

/**
 * Panjang adegan saat ini. Template satu-foto yang diulang per foto dibungkus `SceneLength`, sehingga
 * animasinya mengikuti panjang adegan, bukan panjang seluruh video.
 */
export const SceneLength = createContext<number | null>(null);
export function useLength() {
  const own = useContext(SceneLength);
  const { durationInFrames } = useVideoConfig();
  return own ?? durationInFrames;
}

/** Durasi dalam frame; 3–61 detik (narasi bisa memanjangkan video di luar pilihan yang ada). */
export const framesOf = (seconds?: number) => {
  const s = Number(seconds);
  return Math.round((Number.isFinite(s) && s >= 3 ? Math.min(61, s) : 6) * FPS);
};

/**
 * Pengali waktu muncul: video lebih panjang memunculkan teks sedikit lebih lambat (maks 1,5×),
 * sisanya dipakai untuk menahan tampilan akhir supaya terbaca.
 */
export function usePace() {
  const durationInFrames = useLength();
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
  const durationInFrames = useLength();
  return interpolate(frame, [0, durationInFrames], [from, to], { easing: Easing.inOut(Easing.quad) });
}

/** Pudar keluar di akhir supaya enak diputar berulang. */
export function useOutro(frames = 12) {
  const frame = useCurrentFrame();
  const durationInFrames = useLength();
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
