import React from "react";
import { AbsoluteFill } from "remotion";
import { FONT, fit, onAccent, Photo, useFonts, useKenBurns, useOutro, usePop, useRise, type TemplateProps } from "../shared";

/** Promo Harga: foto penuh dengan zoom pelan, judul naik dari bawah, lencana harga membal, ajakan di akhir. */
export const Promo: React.FC<TemplateProps> = ({ image, headline, subline, badge, cta, accent, ratio }) => {
  useFonts();
  const zoom = useKenBurns();
  const out = useOutro();
  const head = useRise(14);
  const sub = useRise(26);
  const pop = usePop(48);
  const call = useRise(96, 40);
  const square = ratio === "1:1";
  const pad = square ? 64 : 80;
  const ink = onAccent(accent);
  return (
    <AbsoluteFill style={{ background: "#0b1020", fontFamily: FONT, opacity: out }}>
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
      <div style={{ position: "absolute", left: pad, right: pad, bottom: pad + (square ? 0 : 60) }}>
        <div
          style={{
            ...head,
            color: "#fff",
            fontWeight: 700,
            fontSize: fit(headline, square ? 84 : 104, 18),
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
              fontSize: fit(subline, square ? 38 : 44, 38),
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
