import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import React from "react";
import { Audio, Composition, Sequence, staticFile } from "remotion";
import { Promo } from "./templates/Promo";
import { Showcase } from "./templates/Showcase";
import { Story } from "./templates/Story";
import { Catalog } from "./templates/Catalog";
import { Announce } from "./templates/Announce";
import { Motion } from "./templates/Motion";
import { FPS, DURATION, framesOf, sizeOf, MG, SLIDE, SLIDE_OUTRO, type TemplateProps } from "./shared";

const defaults: TemplateProps = {
  image: "",
  headline: "Kopi Susu Gula Aren",
  subline: "Segar setiap hari, dibuat saat dipesan",
  badge: "Rp18.000",
  cta: "Pesan sekarang",
  accent: "#6D28D9",
  ratio: "9:16",
};

const TEMPLATES = { promo: Promo, showcase: Showcase, story: Story, catalog: Catalog, announce: Announce, motion: Motion } as const;

/** Bungkus template dengan trek narasi (bila ada), mulai sedikit setelah video dibuka. */
const withNarration = (Comp: React.FC<TemplateProps>): React.FC<TemplateProps> => {
  const Wrapped: React.FC<TemplateProps> = (props) => (
    <>
      <Comp {...props} />
      {props.narration ? (
        <Sequence from={9} layout="none">
          <Audio src={staticFile(props.narration)} />
        </Sequence>
      ) : null}
    </>
  );
  return Wrapped;
};

export const Root: React.FC = () => (
  <>
    {Object.entries(TEMPLATES).map(([id, Comp]) => (
      <Composition
        key={id}
        id={id}
        component={withNarration(Comp as React.FC<TemplateProps>) as unknown as React.FC<Record<string, unknown>>}
        fps={FPS}
        durationInFrames={DURATION}
        width={1080}
        height={1920}
        defaultProps={defaults as unknown as Record<string, unknown>}
        calculateMetadata={({ props }) => {
          const p = props as unknown as TemplateProps;
          const n = p.items?.length ?? 0;
          const natural =
            id === "catalog" && n
              ? n * SLIDE + SLIDE_OUTRO
              : id === "motion" && n
                ? MG.intro + n * MG.scene + MG.outro
                : 0;
          // Template banyak foto: durasi alami, dipanjangkan bila narasinya lebih lama.
          const durationInFrames = natural
            ? p.narration
              ? Math.max(natural, framesOf(p.seconds))
              : natural
            : framesOf(p.seconds);
          return { ...sizeOf(p.ratio), durationInFrames };
        }}
      />
    ))}
  </>
);
