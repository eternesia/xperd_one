import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT, fit, onAccent, Photo, Sfx, useFonts, useOutro, usePace, usePop, useRise, type TemplateProps } from "../shared";

/** Pengumuman Teks: tanpa foto. Judul muncul kata demi kata di atas warna merek dengan bentuk yang bergerak pelan. */
export const Announce: React.FC<TemplateProps> = ({ headline, subline, badge, cta, accent, ratio, sound, items = [] }) => {
  useFonts();
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const out = useOutro();
  const at = usePace();
  const tag = usePop(at(6));
  const tall = ratio === "9:16";
  const wide = ratio === "16:9";
  const pad = tall ? 90 : wide ? 130 : 80;
  const ink = onAccent(accent);
  const soft = ink === "#FFFFFF" ? "rgba(255,255,255,0.85)" : "rgba(17,24,39,0.78)";
  const shape = ink === "#FFFFFF" ? "rgba(255,255,255,0.13)" : "rgba(17,24,39,0.08)";
  const words = headline.split(/\s+/).filter(Boolean);
  const step = at(5);
  const start = at(16);
  const after = start + words.length * step;
  const sub = useRise(after + at(8), 40);
  const call = useRise(after + at(26), 40);
  const bar = interpolate(frame, [after, after + at(18)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const drift = interpolate(frame, [0, durationInFrames], [0, 1]);
  const size = wide ? fit(headline, 150, 22) : tall ? fit(headline, 150, 20) : fit(headline, 128, 24);
  return (
    <AbsoluteFill style={{ background: accent, fontFamily: FONT, opacity: out, overflow: "hidden" }}>
      {/* Foto (opsional) bergantian pelan di belakang lapisan warna merek. */}
      {items.map((it, i) => {
        const span = durationInFrames / items.length;
        const o = interpolate(frame, [i * span - 15, i * span + 15, (i + 1) * span - 15, (i + 1) * span + 15], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const z = interpolate(frame, [i * span, (i + 1) * span], [1.04, 1.14]);
        return (
          <AbsoluteFill key={i} style={{ opacity: i === 0 ? Math.max(o, frame < 15 ? 1 : 0) : o, transform: `scale(${z})` }}>
            <Photo src={it.image} />
          </AbsoluteFill>
        );
      })}
      {items.length ? <AbsoluteFill style={{ background: accent, opacity: 0.8 }} /> : null}
      {badge ? <Sfx on={sound} name="pop" at={at(6)} /> : null}
      {words.map((_, i) => (
        <Sfx key={i} on={sound} name="tick" at={start + i * step} volume={0.45} />
      ))}
      <Sfx on={sound} name="whoosh" at={after} />
      {cta ? <Sfx on={sound} name="ding" at={after + at(26)} volume={0.5} /> : null}
      <div
        style={{
          position: "absolute",
          width: height * 0.9,
          height: height * 0.9,
          borderRadius: "50%",
          background: shape,
          right: -height * 0.28 + drift * 60,
          top: -height * 0.3 + drift * 40,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: height * 0.55,
          height: height * 0.55,
          borderRadius: "50%",
          background: shape,
          left: -height * 0.16 - drift * 40,
          bottom: -height * 0.2 + drift * 70,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: width * 0.16,
          height: width * 0.16,
          borderRadius: width * 0.03,
          border: `${Math.round(width * 0.008)}px solid ${shape}`,
          right: pad,
          bottom: pad + drift * 50,
          transform: `rotate(${12 + drift * 28}deg)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: pad,
          right: pad,
          top: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
        }}
      >
        {badge ? (
          <div
            style={{
              ...tag,
              transformOrigin: "0% 50%",
              background: ink === "#FFFFFF" ? "#fff" : "#111827",
              color: ink === "#FFFFFF" ? "#111827" : "#fff",
              fontWeight: 700,
              fontSize: fit(badge, tall ? 50 : 46, 12),
              padding: "14px 34px",
              borderRadius: 999,
              marginBottom: 40,
            }}
          >
            {badge}
          </div>
        ) : null}
        <div
          style={{
            color: ink,
            fontWeight: 700,
            fontSize: size,
            lineHeight: 1.05,
            letterSpacing: -3,
            maxWidth: wide ? 1500 : undefined,
            display: "flex",
            flexWrap: "wrap",
            columnGap: size * 0.26,
          }}
        >
          {words.map((w, i) => {
            const s = spring({ frame: frame - start - i * step, fps, config: { damping: 16, mass: 0.6 } });
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  opacity: Math.min(1, s * 1.6),
                  transform: `translateY(${(1 - s) * size * 0.5}px)`,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
        <div
          style={{
            width: (wide ? 260 : 200) * bar,
            height: 14,
            borderRadius: 7,
            background: ink,
            opacity: 0.9,
            marginTop: 40,
          }}
        />
        {subline ? (
          <div
            style={{
              ...sub,
              marginTop: 36,
              color: soft,
              fontWeight: 500,
              fontSize: wide ? fit(subline, 50, 56) : fit(subline, tall ? 54 : 44, 44),
              lineHeight: 1.3,
              maxWidth: wide ? 1300 : undefined,
            }}
          >
            {subline}
          </div>
        ) : null}
        {cta ? (
          <div
            style={{
              ...call,
              marginTop: 54,
              color: ink,
              fontWeight: 600,
              fontSize: tall ? 46 : 42,
              padding: "20px 44px",
              borderRadius: 999,
              border: `5px solid ${ink}`,
            }}
          >
            {cta}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
