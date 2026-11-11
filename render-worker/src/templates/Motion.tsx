import React from "react";
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT, fit, MG, onAccent, Photo, Sfx, useFonts, useOutro, type TemplateProps } from "../shared";

type Item = { image: string; title: string; price: string };
type Scene = { item: Item; n: number; accent: string; ink: string; tall: boolean; wide: boolean };

const DARK = "#0b1020";
const useIn = (delay = 0, config = { damping: 16, mass: 0.7 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config });
};

/** Teks keterangan + harga dengan garis aksen; dipakai di semua adegan foto. */
const Caption: React.FC<{ item: Item; color: string; pill: string; pillInk: string; size: number; delay: number }> = ({
  item,
  color,
  pill,
  pillInk,
  size,
  delay,
}) => {
  const a = useIn(delay, { damping: 200, mass: 0.7 });
  const b = useIn(delay + 10, { damping: 11, mass: 0.6 });
  return (
    <div>
      {item.title ? (
        <div
          style={{
            opacity: a,
            transform: `translateY(${(1 - a) * 50}px)`,
            color,
            fontWeight: 700,
            fontSize: fit(item.title, size, 18),
            lineHeight: 1.06,
            letterSpacing: -2,
          }}
        >
          {item.title}
        </div>
      ) : null}
      {item.price ? (
        <div
          style={{
            display: "inline-block",
            marginTop: 26,
            opacity: Math.min(1, b * 2),
            transform: `scale(${b})`,
            transformOrigin: "0% 50%",
            background: pill,
            color: pillInk,
            fontWeight: 700,
            fontSize: fit(item.price, size * 0.58, 12),
            padding: "14px 32px",
            borderRadius: 999,
          }}
        >
          {item.price}
        </div>
      ) : null}
    </div>
  );
};

/** Nomor urut besar bergaris (01, 02, …). */
const Big: React.FC<{ n: number; color: string; size: number }> = ({ n, color, size }) => {
  const s = useIn(4, { damping: 200, mass: 0.8 });
  return (
    <div
      style={{
        opacity: s * 0.9,
        transform: `translateX(${(1 - s) * -60}px)`,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: -6,
        color: "transparent",
        WebkitTextStroke: `${Math.max(3, Math.round(size / 48))}px ${color}`,
      }}
    >
      {String(n).padStart(2, "0")}
    </div>
  );
};

/** Adegan A: kartu foto terbang masuk sambil berputar di atas warna merek bergaris. */
const CardScene: React.FC<Scene> = ({ item, n, accent, ink, tall, wide }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const s = useIn(2, { damping: 14, mass: 0.9 });
  const cw = tall ? width * 0.78 : wide ? width * 0.38 : width * 0.52;
  const ch = tall ? height * 0.5 : wide ? height * 0.74 : height * 0.6;
  const float = Math.sin(frame / 18) * 10;
  const stripe = ink === "#FFFFFF" ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.07)";
  const pad = tall ? 80 : wide ? 120 : 64;
  return (
    <AbsoluteFill style={{ background: accent, overflow: "hidden" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: width * 1.6,
            height: height * 0.16,
            left: -width * 0.3 + (1 - s) * (i % 2 ? 400 : -400),
            top: height * (0.12 + i * 0.3),
            background: stripe,
            transform: "rotate(-14deg)",
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          width: cw,
          height: ch,
          right: tall ? (width - cw) / 2 : pad,
          top: tall ? height * 0.1 : (height - ch) / 2,
          transform: `translateX(${(1 - s) * width}px) translateY(${float}px) rotate(${(1 - s) * 22 + 3}deg)`,
          borderRadius: 44,
          overflow: "hidden",
          border: "12px solid #fff",
          boxShadow: "0 50px 90px rgba(0,0,0,0.38)",
          background: "#fff",
        }}
      >
        <Photo src={item.image} />
      </div>
      <div
        style={{
          position: "absolute",
          left: pad,
          right: tall ? pad : cw + pad * 2,
          top: tall ? height * 0.66 : 0,
          bottom: tall ? undefined : 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 18,
        }}
      >
        <Big n={n} color={ink} size={tall ? 150 : 170} />
        <Caption item={item} color={ink} pill={ink === "#FFFFFF" ? "#fff" : "#111827"} pillInk={ink === "#FFFFFF" ? "#111827" : "#fff"} size={tall ? 92 : 84} delay={14} />
      </div>
    </AbsoluteFill>
  );
};

/** Adegan B: layar terbelah. Foto terbuka seperti tirai, panel gelap berisi nomor dan teks. */
const SplitScene: React.FC<Scene> = ({ item, n, accent, tall, wide }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const s = useIn(0, { damping: 200, mass: 0.9 });
  const zoom = interpolate(frame, [0, MG.scene], [1.18, 1.05]);
  const pad = tall ? 80 : wide ? 110 : 60;
  const photo: React.CSSProperties = tall
    ? { left: 0, right: 0, top: 0, height: height * 0.58, clipPath: `inset(0 0 ${(1 - s) * 100}% 0)` }
    : { left: 0, top: 0, bottom: 0, width: width * 0.56, clipPath: `inset(0 ${(1 - s) * 100}% 0 0)` };
  const panel: React.CSSProperties = tall
    ? { left: pad, right: pad, top: height * 0.58, bottom: 0 }
    : { left: width * 0.56 + pad, right: pad, top: 0, bottom: 0 };
  return (
    <AbsoluteFill style={{ background: DARK, overflow: "hidden" }}>
      <div style={{ position: "absolute", overflow: "hidden", ...photo }}>
        <div style={{ width: "100%", height: "100%", transform: `scale(${zoom})` }}>
          <Photo src={item.image} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          background: accent,
          ...(tall
            ? { left: 0, top: height * 0.58 - 9, height: 18, width: width * s }
            : { left: width * 0.56 - 9, top: 0, width: 18, height: height * s }),
        }}
      />
      <div style={{ position: "absolute", display: "flex", flexDirection: "column", justifyContent: "center", gap: 20, ...panel }}>
        <Big n={n} color="rgba(255,255,255,0.6)" size={tall ? 170 : 190} />
        <Caption item={item} color="#fff" pill={accent} pillInk={onAccent(accent)} size={tall ? 92 : wide ? 88 : 66} delay={12} />
      </div>
    </AbsoluteFill>
  );
};

/** Adegan C: foto penuh dengan bingkai yang mengecil masuk dan pita teks yang meluncur dari kiri. */
const FullScene: React.FC<Scene> = ({ item, accent, ink, tall, wide }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const s = useIn(4, { damping: 200, mass: 0.8 });
  const bar = useIn(12, { damping: 18, mass: 0.8 });
  const zoom = interpolate(frame, [0, MG.scene], [1.04, 1.16]);
  const inset = Math.min(width, height) * 0.045;
  return (
    <AbsoluteFill style={{ background: DARK, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Photo src={item.image} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(8,12,28,0.15) 0%, rgba(8,12,28,0) 40%, rgba(8,12,28,0.75) 100%)" }} />
      <div
        style={{
          position: "absolute",
          inset,
          border: "8px solid #fff",
          borderRadius: 36,
          opacity: s,
          transform: `scale(${1.12 - 0.12 * s})`,
        }}
      />
      {item.title || item.price ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: height * (tall ? 0.14 : 0.12),
            maxWidth: width * (wide ? 0.7 : 0.9),
            transform: `translateX(${(1 - bar) * -100}%)`,
            background: accent,
            padding: `${tall ? 40 : 32}px ${tall ? 64 : 56}px ${tall ? 40 : 32}px ${inset + 40}px`,
            borderRadius: "0 40px 40px 0",
            boxShadow: "0 24px 50px rgba(0,0,0,0.35)",
          }}
        >
          <Caption item={item} color={ink} pill={ink === "#FFFFFF" ? "#fff" : "#111827"} pillInk={ink === "#FFFFFF" ? "#111827" : "#fff"} size={tall ? 84 : 76} delay={18} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const SCENES = [CardScene, SplitScene, FullScene];

/** Pembuka: judul muncul kata demi kata di atas warna merek dengan bentuk yang menyapu. */
const Intro: React.FC<{ headline: string; accent: string; ink: string; tall: boolean; wide: boolean }> = ({ headline, accent, ink, tall, wide }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ring = useIn(0, { damping: 200, mass: 1 });
  const words = headline.split(/\s+/).filter(Boolean);
  const size = wide ? fit(headline, 160, 22) : tall ? fit(headline, 150, 18) : fit(headline, 130, 22);
  const shape = ink === "#FFFFFF" ? "rgba(255,255,255,0.14)" : "rgba(17,24,39,0.08)";
  return (
    <AbsoluteFill style={{ background: accent, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: height * 1.1,
          height: height * 1.1,
          borderRadius: "50%",
          border: `${Math.round(height * 0.05)}px solid ${shape}`,
          transform: `scale(${0.3 + ring * 0.9})`,
        }}
      />
      <div style={{ position: "absolute", width: width * 1.5, height: height * 0.12, background: shape, transform: `rotate(-12deg) translateX(${(1 - ring) * -width}px)`, top: height * 0.72 }} />
      <div
        style={{
          padding: tall ? 90 : 120,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: size * 0.26,
          color: ink,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.05,
          letterSpacing: -3,
          textAlign: "center",
        }}
      >
        {words.map((w, i) => {
          const s = spring({ frame: frame - 6 - i * 4, fps, config: { damping: 13, mass: 0.6 } });
          return (
            <span key={i} style={{ display: "inline-block", opacity: Math.min(1, s * 1.6), transform: `translateY(${(1 - s) * size * 0.6}px) rotate(${(1 - s) * 8}deg)` }}>
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Penutup: semua foto menyusun kolase, lalu judul dan ajakan di atasnya. */
const Outro: React.FC<{ items: Item[]; headline: string; cta: string; accent: string; ink: string; tall: boolean }> = ({ items, headline, cta, accent, ink, tall }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = items.length;
  const cols = tall ? (n <= 3 ? 1 : 2) : n <= 2 ? 2 : n === 4 ? 2 : 3;
  const head = useIn(16, { damping: 200, mass: 0.7 });
  const call = useIn(28, { damping: 12, mass: 0.6 });
  return (
    <AbsoluteFill style={{ background: DARK, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: "1fr", gap: 10, padding: 10 }}>
        {items.map((it, i) => {
          const s = spring({ frame: frame - i * 3, fps, config: { damping: 14, mass: 0.7 } });
          return (
            <div key={i} style={{ overflow: "hidden", borderRadius: 26, opacity: Math.min(1, s * 1.5), transform: `scale(${0.6 + s * 0.4})` }}>
              <Photo src={it.image} />
            </div>
          );
        })}
      </div>
      <AbsoluteFill style={{ background: "rgba(8,12,28,0.62)", alignItems: "center", justifyContent: "center", textAlign: "center", padding: tall ? 90 : 120 }}>
        <div style={{ opacity: head, transform: `translateY(${(1 - head) * 50}px)`, color: "#fff", fontWeight: 700, fontSize: fit(headline, tall ? 120 : 110, tall ? 18 : 24), lineHeight: 1.06, letterSpacing: -2 }}>
          {headline}
        </div>
        {cta ? (
          <div style={{ marginTop: 44, opacity: Math.min(1, call * 2), transform: `scale(${call})`, background: accent, color: ink, fontWeight: 600, fontSize: tall ? 48 : 44, padding: "22px 52px", borderRadius: 999, boxShadow: "0 18px 40px rgba(0,0,0,0.4)" }}>
            {cta}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * Motion Grafis: pembuka judul → tiap foto dalam adegan berbeda (kartu terbang, layar terbelah, bingkai penuh)
 * dengan sapuan warna di antaranya → penutup kolase.
 */
export const Motion: React.FC<TemplateProps> = ({ headline, cta, accent, ratio, items = [], sound }) => {
  useFonts();
  const frame = useCurrentFrame();
  const out = useOutro();
  const tall = ratio === "9:16";
  const wide = ratio === "16:9";
  const ink = onAccent(accent);
  const cuts = items.map((_, i) => MG.intro + i * MG.scene).concat(MG.intro + items.length * MG.scene);
  const wipeColor = accent === DARK || accent === "#111827" ? "#fff" : DARK;
  return (
    <AbsoluteFill style={{ background: DARK, fontFamily: FONT, opacity: out }}>
      <Sfx on={sound} name="rise" at={2} volume={0.45} />
      <Sequence durationInFrames={MG.intro} layout="none">
        <Intro headline={headline} accent={accent} ink={ink} tall={tall} wide={wide} />
      </Sequence>
      {items.map((item, i) => {
        const Comp = SCENES[i % SCENES.length];
        return (
          <Sequence key={i} from={cuts[i]} durationInFrames={MG.scene} layout="none">
            <Comp item={item} n={i + 1} accent={accent} ink={ink} tall={tall} wide={wide} />
          </Sequence>
        );
      })}
      <Sequence from={cuts[items.length]} layout="none">
        <Outro items={items} headline={headline} cta={cta} accent={accent} ink={ink} tall={tall} />
      </Sequence>
      {cuts.map((c, i) => {
        // Sapuan dua lapis menutupi pergantian adegan tepat di frame `c`.
        const p = interpolate(frame, [c - 9, c + 9], [-1.15, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const q = interpolate(frame, [c - 6, c + 12], [-1.15, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const dir = i % 2 ? -1 : 1;
        return (
          <React.Fragment key={c}>
            <Sfx on={sound} name="whoosh" at={c - 9} />
            <Sfx on={sound} name={i === items.length ? "ding" : "pop"} at={c + (i === items.length ? 18 : 14)} volume={0.5} />
            {frame >= c - 9 && frame <= c + 12 ? (
              <>
                <AbsoluteFill style={{ background: accent, transform: `translateX(${q * 100 * dir}%) skewX(-8deg) scaleX(1.2)` }} />
                <AbsoluteFill style={{ background: wipeColor, transform: `translateX(${p * 100 * dir}%) skewX(-8deg) scaleX(1.2)` }} />
              </>
            ) : null}
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
