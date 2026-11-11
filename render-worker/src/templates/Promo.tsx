import React from "react";
import { AbsoluteFill } from "remotion";
import { FONT, fit, onAccent, Photo, Sfx, useFonts, useKenBurns, useOutro, usePace, usePop, useRise, type TemplateProps } from "../shared";

/** Promo Harga: foto penuh dengan zoom pelan, judul naik dari bawah, lencana harga membal, ajakan di akhir. */
export const Promo: React.FC<TemplateProps> = ({ image, headline, subline, badge, cta, accent, ratio, sound }) => {
  useFonts();
  const zoom = useKenBurns();
  const out = useOutro();
  const at = usePace();
  const head = useRise(at(14));
  const sub = useRise(at(26));
  const pop = usePop(at(48));
  const call = useRise(at(96), 40);
  const wide = ratio === "16:9";
  // Kanvas setinggi 1080 (1:1 dan 16:9) memakai ukuran huruf yang sama.
  const square = ratio !== "9:16";
  const pad = square ? 64 : 80;
  const ink = onAccent(accent);
  return (
    <AbsoluteFill style={{ background: "#0b1020", fontFamily: FONT, opacity: out }}>
      <Sfx on={sound} name="whoosh" at={at(10)} />
      {badge ? <Sfx on={sound} name="pop" at={at(48)} /> : null}
      {cta ? <Sfx on={sound} name="tick" at={at(96)} /> : null}
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Photo src={image} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(8,12,28,0.30) 0%, rgba(8,12,28,0) 30%, rgba(8,12,28,0) 48%, rgba(8,12,28,0.88) 100%)",
        }}
      />
      {badge ? (
        <div
          style={{
            position: "absolute",
            top: pad,
            right: pad,
            ...pop,
            transformOrigin: "100% 0%",
            background: accent,
            color: ink,
            fontWeight: 700,
            fontSize: fit(badge, square ? 60 : 68, 10),
            padding: square ? "20px 34px" : "24px 40px",
            borderRadius: 999,
            boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
          }}
        >
          {badge}
        </div>
      ) : null}
      <div style={{ position: "absolute", left: pad, right: pad, bottom: pad + (square ? 0 : 60), maxWidth: wide ? 1180 : undefined }}>
        <div
          style={{
            ...head,
            color: "#fff",
            fontWeight: 700,
            fontSize: wide ? fit(headline, 100, 30) : fit(headline, square ? 84 : 104, 18),
            lineHeight: 1.08,
            letterSpacing: -1.5,
            textShadow: "0 4px 24px rgba(0,0,0,0.45)",
          }}
        >
          {headline}
        </div>
        {subline ? (
          <div
            style={{
              ...sub,
              marginTop: 22,
              color: "rgba(255,255,255,0.9)",
              fontWeight: 500,
              fontSize: wide ? fit(subline, 44, 60) : fit(subline, square ? 38 : 44, 38),
              lineHeight: 1.3,
            }}
          >
            {subline}
          </div>
        ) : null}
        {cta ? (
          <div
            style={{
              ...call,
              display: "inline-block",
              marginTop: 40,
              background: "#fff",
              color: "#0b1020",
              fontWeight: 600,
              fontSize: square ? 36 : 42,
              padding: square ? "20px 38px" : "24px 46px",
              borderRadius: 999,
            }}
          >
            {cta}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
