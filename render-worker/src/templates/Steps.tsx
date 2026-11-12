import React from "react";
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { DARK, FONT, fit, onAccent, Photo, Sfx, STEPS, useFonts, useOutro, type TemplateProps } from "../shared";

type Item = { image: string; title: string; price: string };

const useIn = (delay: number, damping = 200, mass = 0.7) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass } });
};

/** Judul dua warna: separuh awal putih, separuh akhir warna aksen (seperti "Stok bahan baku / selalu terkendali"). */
const TwoTone: React.FC<{ text: string; accent: string; size: number; delay: number }> = ({ text, accent, size, delay }) => {
  const words = text.split(/\s+/).filter(Boolean);
  const cut = Math.max(1, Math.ceil(words.length / 2));
  const a = useIn(delay);
  const b = useIn(delay + 7);
  const line = (part: string[], s: number, color: string) => (
    <div style={{ opacity: s, transform: `translateY(${(1 - s) * 40}px)`, color }}>{part.join(" ")}</div>
  );
  return (
    <div style={{ fontWeight: 700, fontSize: size, lineHeight: 1.08, letterSpacing: -1.5 }}>
      {line(words.slice(0, cut), a, "#fff")}
      {words.length > 1 ? line(words.slice(cut), b, accent) : null}
    </div>
  );
};

/** Sudut bingkai berwarna aksen di keempat pojok foto. */
const Corners: React.FC<{ color: string; size: number; s: number }> = ({ color, size, s }) => {
  const w = Math.max(5, Math.round(size / 9));
  const base: React.CSSProperties = { position: "absolute", width: size, height: size, opacity: s };
  const off = -w * 1.6 - (1 - s) * 30;
  return (
    <>
      <div style={{ ...base, left: off, top: off, borderLeft: `${w}px solid ${color}`, borderTop: `${w}px solid ${color}` }} />
      <div style={{ ...base, right: off, top: off, borderRight: `${w}px solid ${color}`, borderTop: `${w}px solid ${color}` }} />
      <div style={{ ...base, left: off, bottom: off, borderLeft: `${w}px solid ${color}`, borderBottom: `${w}px solid ${color}` }} />
      <div style={{ ...base, right: off, bottom: off, borderRight: `${w}px solid ${color}`, borderBottom: `${w}px solid ${color}` }} />
    </>
  );
};

/** Garis kemajuan di bawah: titik per langkah, titik aktif menyala. */
const Progress: React.FC<{ n: number; active: number; t: number; accent: string; width: number }> = ({ n, active, t, accent, width }) => {
  const step = n > 1 ? width / (n - 1) : 0;
  return (
    <div style={{ position: "relative", width, height: 30 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 13, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.16)" }} />
      <div style={{ position: "absolute", left: 0, top: 13, height: 4, borderRadius: 2, width: step * (active + t), background: accent }} />
      {Array.from({ length: n }, (_, i) => {
        const on = i <= active;
        const big = i === active;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: step * i - (big ? 15 : 9),
              top: big ? 0 : 6,
              width: big ? 30 : 18,
              height: big ? 30 : 18,
              borderRadius: "50%",
              background: on ? accent : "rgba(255,255,255,0.28)",
              boxShadow: big ? `0 0 0 8px ${accent}33` : undefined,
            }}
          />
        );
      })}
    </div>
  );
};

/** Satu langkah: label kecil, judul dua warna, foto berbingkai dengan sudut aksen, kartu label melayang. */
const StepScene: React.FC<{
  item: Item;
  i: number;
  n: number;
  len: number;
  headline: string;
  badge: string;
  accent: string;
  dark: string;
  tall: boolean;
  wide: boolean;
}> = ({ item, i, n, len, headline, badge, accent, dark, tall, wide }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const enter = useIn(0, 18, 0.8);
  const frameIn = useIn(8, 16, 0.9);
  const chip = useIn(22, 12, 0.6);
  const zoom = interpolate(frame, [0, len], [1.12, 1.02]);
  const pad = wide ? 110 : tall ? 70 : 60;
  const title = item.title || headline;
  const eyebrow = (item.price || `Langkah ${i + 1}`).toUpperCase();
  const photoW = wide ? width * 0.46 : width - pad * 2;
  const photoH = wide ? height * 0.62 : tall ? height * 0.4 : height * 0.42;
  const photoTop = wide ? (height - photoH) / 2 + 20 : tall ? height * 0.29 : height * 0.42;
  // Pudar keluar di ujung adegan, tumpang tindih dengan adegan berikutnya yang masuk.
  const leave = interpolate(frame, [len - 2, len + 10], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ink = onAccent(accent);
  return (
    <AbsoluteFill style={{ opacity: Math.min(1, enter * 1.4) * leave }}>
      {/* Kepala: lencana merek dan nomor langkah. */}
      <div style={{ position: "absolute", left: pad, right: pad, top: tall ? 70 : 50, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {badge ? (
          <div style={{ background: "#fff", color: dark, fontWeight: 700, fontSize: 30, padding: "10px 22px", borderRadius: 12 }}>{badge}</div>
        ) : (
          <div />
        )}
        <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 600, fontSize: 30, letterSpacing: 4 }}>
          LANGKAH <span style={{ color: accent, fontSize: 52, fontWeight: 700 }}>{String(i + 1).padStart(2, "0")}</span> / {String(n).padStart(2, "0")}
        </div>
      </div>
      {/* Teks */}
      <div
        style={{
          position: "absolute",
          left: pad,
          top: wide ? 0 : tall ? 190 : 140,
          bottom: wide ? 0 : undefined,
          width: wide ? width * 0.42 - pad : width - pad * 2,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: enter }}>
          <div style={{ width: 54 * enter, height: 5, background: accent, borderRadius: 3 }} />
          <div style={{ color: accent, fontWeight: 600, fontSize: tall ? 30 : 26, letterSpacing: 5 }}>{eyebrow}</div>
        </div>
        <TwoTone text={title} accent={accent} size={wide ? fit(title, 96, 26) : fit(title, tall ? 104 : 78, 22)} delay={4} />
      </div>
      {/* Foto berbingkai */}
      <div
        style={{
          position: "absolute",
          width: photoW,
          height: photoH,
          right: pad,
          top: photoTop,
          transform: `translateY(${(1 - frameIn) * 120}px)`,
          opacity: frameIn,
        }}
      >
        <div style={{ position: "absolute", inset: 0, borderRadius: 28, overflow: "hidden", boxShadow: "0 40px 80px rgba(0,0,0,0.45)" }}>
          <div style={{ width: "100%", height: "100%", transform: `scale(${zoom})` }}>
            <Photo src={item.image} />
          </div>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35))" }} />
        </div>
        <Corners color={accent} size={58} s={frameIn} />
        {item.price ? (
          <div
            style={{
              position: "absolute",
              right: 28,
              bottom: -34,
              transform: `scale(${chip})`,
              transformOrigin: "100% 100%",
              opacity: Math.min(1, chip * 2),
              display: "flex",
              alignItems: "center",
              gap: 14,
              background: "rgba(10,14,30,0.88)",
              border: "2px solid rgba(255,255,255,0.14)",
              color: "#fff",
              padding: "16px 26px",
              borderRadius: 18,
              fontWeight: 600,
              fontSize: 30,
            }}
          >
            <span style={{ width: 16, height: 16, borderRadius: "50%", background: accent }} />
            {item.price}
          </div>
        ) : null}
      </div>
      {/* Tombol kecil warna aksen di bawah foto, mengulang judul singkat. */}
      {tall ? (
        <div
          style={{
            position: "absolute",
            left: pad,
            top: photoTop + photoH + 70,
            opacity: chip,
            transform: `translateY(${(1 - chip) * 30}px)`,
            background: `${accent}22`,
            border: `2px solid ${accent}66`,
            color: "#fff",
            borderRadius: 18,
            padding: "18px 26px",
            fontSize: 30,
            fontWeight: 500,
            maxWidth: width - pad * 2,
          }}
        >
          <span style={{ color: accent, fontWeight: 700 }}>✓</span>&nbsp;&nbsp;{headline}
        </div>
      ) : null}
      <span style={{ display: "none", color: ink }} />
    </AbsoluteFill>
  );
};

/** Pembuka: judul besar dua warna di tengah dengan cincin dan garis aksen. */
const Intro: React.FC<{ headline: string; subline: string; accent: string; tall: boolean; wide: boolean }> = ({ headline, subline, accent, tall, wide }) => {
  const { width, height } = useVideoConfig();
  const ring = useIn(0, 200, 1);
  const sub = useIn(22);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: wide ? 160 : 90 }}>
      <div
        style={{
          position: "absolute",
          width: Math.min(width, height) * 0.9,
          height: Math.min(width, height) * 0.9,
          borderRadius: "50%",
          border: `3px solid ${accent}55`,
          transform: `scale(${0.4 + ring * 0.7})`,
          opacity: 1 - ring * 0.4,
        }}
      />
      <TwoTone text={headline} accent={accent} size={wide ? fit(headline, 130, 22) : fit(headline, tall ? 120 : 104, 18)} delay={6} />
      <div style={{ width: 200 * ring, height: 6, background: accent, borderRadius: 3, margin: "36px auto 0" }} />
      {subline ? (
        <div style={{ marginTop: 30, color: "rgba(255,255,255,0.8)", fontSize: tall ? 40 : 36, opacity: sub, transform: `translateY(${(1 - sub) * 30}px)` }}>
          {subline}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** Penutup: judul, keterangan, tombol ajakan. */
const Outro: React.FC<{ headline: string; subline: string; cta: string; accent: string; tall: boolean; wide: boolean }> = ({ headline, subline, cta, accent, tall, wide }) => {
  const sub = useIn(18);
  const call = useIn(30, 12, 0.6);
  const ink = onAccent(accent);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: wide ? 160 : 90 }}>
      <TwoTone text={headline} accent={accent} size={wide ? fit(headline, 120, 22) : fit(headline, tall ? 112 : 96, 18)} delay={4} />
      {subline ? (
        <div style={{ marginTop: 32, color: "rgba(255,255,255,0.82)", fontSize: tall ? 40 : 36, opacity: sub, transform: `translateY(${(1 - sub) * 30}px)` }}>
          {subline}
        </div>
      ) : null}
      {cta ? (
        <div
          style={{
            marginTop: 54,
            opacity: Math.min(1, call * 2),
            transform: `scale(${call})`,
            background: accent,
            color: ink,
            fontWeight: 700,
            fontSize: tall ? 46 : 42,
            padding: "24px 60px",
            borderRadius: 999,
            boxShadow: `0 20px 50px ${accent}55`,
          }}
        >
          {cta}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * Langkah demi Langkah: pembuka judul → tiap foto jadi satu langkah bernomor dengan judul dua warna,
 * foto berbingkai, label melayang, dan garis kemajuan → penutup ajakan. Latar gelap dari warna foto.
 */
export const Steps: React.FC<TemplateProps> = ({ headline, subline, badge, cta, accent, ratio, items = [], sound, dark = DARK }) => {
  useFonts();
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const out = useOutro();
  const tall = ratio === "9:16";
  const wide = ratio === "16:9";
  const n = Math.max(1, items.length);
  const scene = Math.max(STEPS.scene, Math.floor((durationInFrames - STEPS.intro - STEPS.outro) / n));
  const cuts = items.map((_, i) => STEPS.intro + i * scene);
  const end = STEPS.intro + n * scene;
  const active = Math.max(0, Math.min(n - 1, Math.floor((frame - STEPS.intro) / scene)));
  const t = Math.max(0, Math.min(1, (frame - STEPS.intro - active * scene) / scene));
  const showBar = frame >= STEPS.intro - 8 && frame < end + 6;
  const bar = interpolate(frame, [STEPS.intro - 8, STEPS.intro + 8, end - 6, end + 6], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glow = interpolate(frame, [0, durationInFrames], [0, 1]);
  return (
    <AbsoluteFill style={{ background: dark, fontFamily: FONT, opacity: out, overflow: "hidden" }}>
      {/* Latar: gradasi gelap dari warna foto, cahaya aksen yang bergeser, dan titik-titik halus. */}
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${30 + glow * 40}% ${20 + glow * 10}%, ${accent}26 0%, transparent 45%), linear-gradient(180deg, ${dark} 0%, #05070f 100%)` }} />
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1.5px, transparent 1.5px)", backgroundSize: "46px 46px", opacity: 0.6 }} />
      <Sfx on={sound} name="rise" at={2} volume={0.5} />
      <Sequence durationInFrames={STEPS.intro + 6} layout="none">
        <AbsoluteFill style={{ opacity: interpolate(frame, [STEPS.intro - 8, STEPS.intro + 4], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          <Intro headline={headline} subline={subline} accent={accent} tall={tall} wide={wide} />
        </AbsoluteFill>
      </Sequence>
      {items.map((item, i) => (
        <Sequence key={i} from={cuts[i]} durationInFrames={scene + 12} layout="none">
          <StepScene item={item} i={i} n={n} len={scene} headline={headline} badge={badge} accent={accent} dark={dark} tall={tall} wide={wide} />
        </Sequence>
      ))}
      {cuts.map((c, i) => (
        <React.Fragment key={c}>
          <Sfx on={sound} name="whoosh" at={c - 4} />
          <Sfx on={sound} name="tick" at={c + 22} volume={0.5} />
        </React.Fragment>
      ))}
      <Sequence from={end} layout="none">
        <Outro headline={headline} subline={subline} cta={cta} accent={accent} tall={tall} wide={wide} />
      </Sequence>
      <Sfx on={sound} name="whoosh" at={end - 4} />
      <Sfx on={sound} name="ding" at={end + 30} />
      {showBar && n > 1 ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: tall ? 80 : 46, display: "flex", justifyContent: "center", opacity: bar }}>
          <Progress n={n} active={active} t={t} accent={accent} width={Math.min(width, height * 1.2) - (wide ? 600 : 220)} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
