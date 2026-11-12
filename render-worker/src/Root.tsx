import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import React from "react";
import { AbsoluteFill, Audio, Composition, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Promo } from "./templates/Promo";
import { Showcase } from "./templates/Showcase";
import { Story } from "./templates/Story";
import { Catalog } from "./templates/Catalog";
import { Announce } from "./templates/Announce";
import { Motion } from "./templates/Motion";
import { Steps } from "./templates/Steps";
import { DARK, DURATION, FPS, framesOf, MG, PER_PHOTO, SceneLength, sizeOf, SLIDE, SLIDE_OUTRO, STEPS, type TemplateProps } from "./shared";
import { paletteOf, ratioOf } from "./palette";

const defaults: TemplateProps = {
  image: "",
  headline: "Kopi Susu Gula Aren",
  subline: "Segar setiap hari, dibuat saat dipesan",
  badge: "Rp18.000",
  cta: "Pesan sekarang",
  accent: "auto",
  ratio: "auto",
};

const OVERLAP = 12;

/**
 * Template satu-foto (Promo, Sorotan, Cerita) untuk banyak foto: tiap foto jadi satu adegan dengan animasinya
 * sendiri, berganti dengan pudar silang. Teks per foto menggantikan judul/label; ajakan hanya di adegan terakhir.
 */
const perPhoto = (Comp: React.FC<TemplateProps>): React.FC<TemplateProps> => {
  const Wrapped: React.FC<TemplateProps> = (props) => {
    const { durationInFrames } = useVideoConfig();
    const list = props.items?.length ? props.items : [{ image: props.image, title: "", price: "" }];
    const n = list.length;
    const len = Math.floor((durationInFrames + (n - 1) * OVERLAP) / n);
    return (
      <AbsoluteFill style={{ background: props.dark ?? DARK }}>
        {list.map((it, i) => {
          const from = i * (len - OVERLAP);
          const own = i === n - 1 ? durationInFrames - from : len;
          return (
            <Sequence key={i} from={from} durationInFrames={own} layout="none">
              <SceneLength.Provider value={own}>
                <FadeIn skip={i === 0}>
                  <Comp
                    {...props}
                    image={it.image}
                    headline={it.title || props.headline}
                    badge={it.price || (it.title ? "" : props.badge)}
                    subline={i === 0 || !it.title ? props.subline : ""}
                    cta={i === n - 1 ? props.cta : ""}
                  />
                </FadeIn>
              </SceneLength.Provider>
            </Sequence>
          );
        })}
      </AbsoluteFill>
    );
  };
  return Wrapped;
};

const FadeIn: React.FC<{ skip: boolean; children: React.ReactNode }> = ({ skip, children }) => {
  const frame = useCurrentFrame();
  const o = skip ? 1 : interpolate(frame, [0, OVERLAP], [0, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

const TEMPLATES: Record<string, React.FC<TemplateProps>> = {
  promo: perPhoto(Promo),
  showcase: perPhoto(Showcase),
  story: perPhoto(Story),
  catalog: Catalog,
  motion: Motion,
  steps: Steps,
  announce: Announce,
};

/** Frame minimum supaya tiap foto sempat terbaca. */
function minimumFrames(id: string, n: number) {
  if (id === "catalog") return Math.max(1, n) * SLIDE + SLIDE_OUTRO;
  if (id === "motion") return MG.intro + Math.max(1, n) * MG.scene + MG.outro;
  if (id === "steps") return STEPS.intro + Math.max(1, n) * STEPS.scene + STEPS.outro;
  if (id === "announce") return 0;
  return Math.max(1, n) * PER_PHOTO;
}

/** Trek narasi dan suara latar (bila ada) di atas template. */
const withAudio = (Comp: React.FC<TemplateProps>): React.FC<TemplateProps> => {
  const Wrapped: React.FC<TemplateProps> = (props) => {
    const { durationInFrames } = useVideoConfig();
    const base = props.narration ? 0.3 : 1;
    return (
      <>
        <Comp {...props} />
        {props.bed ? (
          <Audio
            src={staticFile(props.bed)}
            volume={(f) =>
              base *
              interpolate(f, [0, 12, durationInFrames - 45, durationInFrames], [0, 1, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            }
          />
        ) : null}
        {props.narration ? (
          <Sequence from={9} layout="none">
            <Audio src={staticFile(props.narration)} />
          </Sequence>
        ) : null}
      </>
    );
  };
  return Wrapped;
};

export const Root: React.FC = () => (
  <>
    {Object.entries(TEMPLATES).map(([id, Comp]) => (
      <Composition
        key={id}
        id={id}
        component={withAudio(Comp) as unknown as React.FC<Record<string, unknown>>}
        fps={FPS}
        durationInFrames={DURATION}
        width={1080}
        height={1920}
        defaultProps={defaults as unknown as Record<string, unknown>}
        calculateMetadata={async ({ props }) => {
          const p = props as unknown as TemplateProps;
          const photos = (p.items?.length ? p.items.map((i) => i.image) : [p.image]).filter(Boolean);
          // Rasio dan warna otomatis dari foto, kecuali diisi tegas.
          const ratio = !p.ratio || p.ratio === "auto" ? await ratioOf(photos[0]) : p.ratio;
          const auto = !p.accent || p.accent === "auto";
          const pal = auto || !p.dark ? await paletteOf(photos) : null;
          const accent = auto ? (pal?.accent ?? "#F5B301") : p.accent;
          const dark = p.dark ?? pal?.dark ?? DARK;
          const n = p.items?.length ?? (p.image ? 1 : 0);
          const durationInFrames = Math.max(framesOf(p.seconds), minimumFrames(id, n));
          return {
            ...sizeOf(ratio),
            durationInFrames,
            props: { ...p, ratio, accent, dark } as unknown as Record<string, unknown>,
          };
        }}
      />
    ))}
  </>
);
