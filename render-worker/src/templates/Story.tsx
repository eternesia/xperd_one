import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { FONT, fit, onAccent, Photo, Sfx, useFonts, useKenBurns, useOutro, usePace, useRise, type TemplateProps, useLength, DARK } from "../shared";

/** Cerita Bertahap: foto bergeser pelan, lalu teks muncul satu per satu dengan garis aksen. Cocok untuk pengumuman. */
export const Story: React.FC<TemplateProps> = ({ image, headline, subline, badge, cta, accent, ratio, sound, dark }) => {
  useFonts();
  const frame = useCurrentFrame();
  const out = useOutro();
  const zoom = useKenBurns(1.12, 1.04);
  const durationInFrames = useLength();
  const at = usePace();
  const pan = interpolate(frame, [0, durationInFrames], [-18, 18]);
  const bar = interpolate(frame, [at(10), at(34)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tag = useRise(at(16), 30);
  const head = useRise(at(34));
  const sub = useRise(at(70));
  const call = useRise(at(108), 40);
  const wide = ratio === "16:9";
  const square = ratio !== "9:16";
  const pad = square ? 64 : 84;
  const ink = onAccent(accent);
  return (
    <AbsoluteFill style={{ background: dark ?? DARK, fontFamily: FONT, opacity: out }}>
      <Sfx on={sound} name="rise" at={at(8)} volume={0.4} />
      <Sfx on={sound} name="whoosh" at={at(30)} />
      {subline ? <Sfx on={sound} name="tick" at={at(70)} /> : null}
      {cta ? <Sfx on={sound} name="pop" at={at(108)} /> : null}
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
            fontSize: wide ? fit(headline, 108, 28) : fit(headline, square ? 88 : 112, 16),
            lineHeight: 1.06,
            letterSpacing: -2,
            maxWidth: wide ? 1100 : square ? 820 : 900,
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
              fontSize: wide ? fit(subline, 46, 56) : fit(subline, square ? 40 : 48, 36),
              lineHeight: 1.32,
              maxWidth: wide ? 980 : square ? 760 : 840,
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
