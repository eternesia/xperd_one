import React from "react";
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT, fit, onAccent, Photo, Sfx, SLIDE, SLIDE_OUTRO, useFonts, useOutro, type TemplateProps } from "../shared";

const FADE = 10;

/** Satu foto katalog: zoom pelan, nama naik dari bawah, harga membal. Pudar silang dengan slide berikutnya. */
const Slide: React.FC<{
  item: { image: string; title: string; price: string };
  accent: string;
  tall: boolean;
  pad: number;
  first: boolean;
  flip: boolean;
}> = ({ item, accent, tall, pad, first, flip }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const opacity = first ? 1 : interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" });
  const zoom = interpolate(frame, [0, durationInFrames], flip ? [1.14, 1.03] : [1.03, 1.14]);
  const rise = spring({ frame: frame - 8, fps, config: { damping: 200, mass: 0.7 } });
  const pop = spring({ frame: frame - 20, fps, config: { damping: 11, mass: 0.6 } });
  const ink = onAccent(accent);
  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Photo src={item.image} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(8,12,28,0.45) 0%, rgba(8,12,28,0) 26%, rgba(8,12,28,0) 50%, rgba(8,12,28,0.9) 100%)",
        }}
      />
      <div style={{ position: "absolute", left: pad, right: pad, bottom: pad + (tall ? 90 : 30) }}>
        <div
          style={{
            opacity: rise,
            transform: `translateY(${(1 - rise) * 50}px)`,
            color: "#fff",
            fontWeight: 700,
            fontSize: fit(item.title, tall ? 104 : 88, tall ? 20 : 24),
            lineHeight: 1.08,
            letterSpacing: -1.5,
            textShadow: "0 4px 24px rgba(0,0,0,0.5)",
          }}
        >
          {item.title}
        </div>
        {item.price ? (
          <div
            style={{
              display: "inline-block",
              marginTop: 26,
              opacity: Math.min(1, pop * 2),
              transform: `scale(${pop})`,
              transformOrigin: "0% 50%",
              background: accent,
              color: ink,
              fontWeight: 700,
              fontSize: fit(item.price, tall ? 68 : 58, 12),
              padding: tall ? "18px 36px" : "16px 32px",
              borderRadius: 999,
              boxShadow: "0 14px 34px rgba(0,0,0,0.35)",
            }}
          >
            {item.price}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/** Slideshow Katalog: 2–6 foto bergantian dengan nama + harga, judul koleksi di atas, penutup berwarna merek. */
export const Catalog: React.FC<TemplateProps> = ({ headline, cta, accent, ratio, items = [], sound }) => {
  useFonts();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const out = useOutro();
  const tall = ratio === "9:16";
  const pad = tall ? 80 : 64;
  const ink = onAccent(accent);
  // Lama tiap foto; lebih panjang dari bawaan bila video dipanjangkan mengikuti narasi.
  const slide = Math.max(SLIDE, Math.floor((durationInFrames - SLIDE_OUTRO) / Math.max(1, items.length)));
  const end = items.length * slide;
  const active = Math.min(items.length - 1, Math.floor(frame / slide));
  const closing = interpolate(frame, [end, end + FADE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const big = spring({ frame: frame - end - 6, fps, config: { damping: 200, mass: 0.7 } });
  const call = spring({ frame: frame - end - 20, fps, config: { damping: 200, mass: 0.7 } });
  return (
    <AbsoluteFill style={{ background: "#0b1020", fontFamily: FONT, opacity: out }}>
      {items.map((item, i) => (
        <React.Fragment key={`s${i}`}>
          <Sfx on={sound} name="whoosh" at={i * slide} />
          {item.price ? <Sfx on={sound} name="pop" at={i * slide + 20} /> : null}
        </React.Fragment>
      ))}
      <Sfx on={sound} name="ding" at={end + 4} />
      {items.map((item, i) => (
        <Sequence key={i} from={i * slide} durationInFrames={slide + FADE} layout="none">
          <Slide item={item} accent={accent} tall={tall} pad={pad} first={i === 0} flip={i % 2 === 1} />
        </Sequence>
      ))}
      <div
        style={{
          position: "absolute",
          top: pad,
          left: pad,
          right: pad,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          opacity: 1 - closing,
        }}
      >
        <div
          style={{
            color: "#fff",
            fontWeight: 600,
            fontSize: fit(headline, tall ? 44 : 40, 24),
            textShadow: "0 2px 14px rgba(0,0,0,0.5)",
          }}
        >
          {headline}
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {items.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === active ? 44 : 14,
                height: 14,
                borderRadius: 7,
                background: i === active ? accent : "rgba(255,255,255,0.55)",
              }}
            />
          ))}
        </div>
      </div>
      <AbsoluteFill
        style={{
          opacity: closing,
          background: accent,
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: pad * 1.4,
        }}
      >
        <div
          style={{
            opacity: big,
            transform: `translateY(${(1 - big) * 50}px)`,
            color: ink,
            fontWeight: 700,
            fontSize: fit(headline, tall ? 120 : 104, tall ? 20 : 26),
            lineHeight: 1.08,
            letterSpacing: -2,
          }}
        >
          {headline}
        </div>
        {cta ? (
          <div
            style={{
              opacity: call,
              transform: `translateY(${(1 - call) * 40}px)`,
              marginTop: 44,
              background: ink === "#FFFFFF" ? "#fff" : "#111827",
              color: ink === "#FFFFFF" ? "#111827" : "#fff",
              fontWeight: 600,
              fontSize: tall ? 46 : 42,
              padding: "22px 48px",
              borderRadius: 999,
            }}
          >
            {cta}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
