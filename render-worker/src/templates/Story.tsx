import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { FONT, fit, onAccent, Photo, useFonts, useKenBurns, useOutro, useRise, type TemplateProps } from "../shared";

/** Cerita Bertahap: foto bergeser pelan, lalu teks muncul satu per satu dengan garis aksen. Cocok untuk pengumuman. */
export const Story: React.FC<TemplateProps> = ({ image, headline, subline, badge, cta, accent, ratio }) => {
  useFonts();
  const frame = useCurrentFrame();
  const out = useOutro();
  const zoom = useKenBurns(1.12, 1.04);
  const pan = interpolate(frame, [0, 180], [-18, 18]);
  const bar = interpolate(frame, [10, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tag = useRise(16, 30);
  const head = useRise(34);
  const sub = useRise(70);
  const call = useRise(108, 40);
  const square = ratio === "1:1";
  const pad = square ? 64 : 84;
  const ink = onAccent(accent);
  return (
    <AbsoluteFill style={{ background: "#0b1020", fontFamily: FONT, opacity: out }}>
      <AbsoluteFill style={{ transform: `scale(${zoom}) translateX(${pan}px)` }}>
        <Photo src={image} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(8,12,28,0.82) 0%, rgba(8,12,28,0.45) 55%, rgba(8,12,28,0.15) 100%)" }} />
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
        }}
      >
        <div style={{ width: 140 * bar, height: 12, borderRadius: 6, background: accent, marginBottom: 34 }} />
        {badge ? (
          <div
            style={{
              ...tag,
              alignSelf: "flex-start",
              background: accent,
              color: ink,
              fontWeight: 700,
              fontSize: fit(badge, square ? 38 : 46, 12),
              padding: square ? "12px 26px" : "14px 30px",
              borderRadius: 14,
              marginBottom: 30,
            }}
          >
            {badge}
          </div>
        ) : null}
        <div
          style={{
            ...head,
            color: "#fff",
            fontWeight: 700,
            fontSize: fit(headline, square ? 88 : 112, 16),
            lineHeight: 1.06,
            letterSpacing: -2,
            maxWidth: square ? 820 : 900,
          }}
        >
          {headline}
        </div>
        {subline ? (
          <div
            style={{
              ...sub,
              marginTop: 30,
              color: "rgba(255,255,255,0.9)",
              fontWeight: 500,
              fontSize: fit(subline, square ? 40 : 48, 36),
              lineHeight: 1.32,
              maxWidth: square ? 760 : 840,
            }}
          >
            {subline}
          </div>
        ) : null}
        {cta ? (
          <div
            style={{
              ...call,
              alignSelf: "flex-start",
              marginTop: 54,
              color: "#fff",
              fontWeight: 600,
              fontSize: square ? 36 : 44,
              paddingBottom: 10,
              borderBottom: `6px solid ${accent}`,
            }}
          >
            {cta}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
