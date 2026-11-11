import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT, fit, onAccent, Photo, useFonts, useOutro, usePace, usePop, useRise, type TemplateProps } from "../shared";

/** Sorotan Produk: latar warna merek, foto dalam kartu yang melayang pelan, judul di atas, harga & ajakan di bawah. */
export const Showcase: React.FC<TemplateProps> = ({ image, headline, subline, badge, cta, accent, ratio }) => {
  useFonts();
  const frame = useCurrentFrame();
  const out = useOutro();
  const { durationInFrames } = useVideoConfig();
  const at = usePace();
  const head = useRise(at(8), 50);
  const sub = useRise(at(18), 50);
  const card = usePop(4);
  const price = usePop(at(60));
  const call = useRise(at(90), 40);
  const float = Math.sin(frame / 22) * 14;
  const tilt = Math.sin(frame / 34) * 1.2;
  const wide = ratio === "16:9";
  // 1:1 dan 16:9: foto di kiri, teks di kanan.
  const square = ratio !== "9:16";
  const ink = onAccent(accent);
  const soft = ink === "#FFFFFF" ? "rgba(255,255,255,0.82)" : "rgba(17,24,39,0.75)";
  const glow = interpolate(frame, [0, durationInFrames], [0.9, 1.15]);
  return (
    <AbsoluteFill style={{ background: accent, fontFamily: FONT, opacity: out, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: wide ? 1700 : 1300,
          height: wide ? 1700 : 1300,
          left: wide ? 110 : -110,
          top: wide ? -310 : square ? -200 : 260,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 62%)",
          transform: `scale(${glow})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: square ? "row" : "column",
          alignItems: "center",
          justifyContent: "center",
          gap: wide ? 110 : square ? 56 : 64,
          padding: wide ? "64px 130px" : square ? 64 : "110px 80px",
        }}
      >
        {!square ? (
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                ...head,
                color: ink,
                fontWeight: 700,
                fontSize: fit(headline, 96, 18),
                lineHeight: 1.08,
                letterSpacing: -1.5,
              }}
            >
              {headline}
            </div>
            {subline ? (
              <div style={{ ...sub, marginTop: 20, color: soft, fontWeight: 500, fontSize: fit(subline, 42, 38), lineHeight: 1.3 }}>
                {subline}
              </div>
            ) : null}
          </div>
        ) : null}
        <div
          style={{
            ...card,
            transform: `${card.transform} translateY(${float}px) rotate(${tilt}deg)`,
            width: wide ? 700 : square ? 520 : 760,
            height: wide ? 860 : square ? 680 : 900,
            flexShrink: 0,
            borderRadius: 48,
            overflow: "hidden",
            background: "#fff",
            boxShadow: "0 50px 90px rgba(0,0,0,0.35)",
            border: "10px solid rgba(255,255,255,0.9)",
          }}
        >
          <Photo src={image} />
        </div>
        <div style={{ textAlign: square ? "left" : "center", minWidth: 0, maxWidth: wide ? 820 : undefined }}>
          {square ? (
            <>
              <div style={{ ...head, color: ink, fontWeight: 700, fontSize: wide ? fit(headline, 96, 24) : fit(headline, 70, 16), lineHeight: 1.1, letterSpacing: -1 }}>
                {headline}
              </div>
              {subline ? (
                <div style={{ ...sub, marginTop: 16, color: soft, fontWeight: 500, fontSize: wide ? fit(subline, 42, 48) : fit(subline, 32, 36), lineHeight: 1.3 }}>
                  {subline}
                </div>
              ) : null}
            </>
          ) : null}
          {badge ? (
            <div
              style={{
                ...price,
                display: "inline-block",
                marginTop: square ? 30 : 0,
                background: ink === "#FFFFFF" ? "#fff" : "#111827",
                color: ink === "#FFFFFF" ? "#111827" : "#fff",
                fontWeight: 700,
                fontSize: fit(badge, wide ? 64 : square ? 52 : 72, 10),
                padding: square ? "16px 30px" : "22px 44px",
                borderRadius: 999,
              }}
            >
              {badge}
            </div>
          ) : null}
          {cta ? (
            <div style={{ ...call, marginTop: 26, color: ink, fontWeight: 600, fontSize: wide ? 40 : square ? 32 : 42 }}>
              {cta}
            </div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};
