import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import React from "react";
import { Composition } from "remotion";
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

export const Root: React.FC = () => (
  <>
    {Object.entries(TEMPLATES).map(([id, Comp]) => (
      <Composition
        key={id}
        id={id}
        component={Comp as React.FC<Record<string, unknown>>}
        fps={FPS}
        durationInFrames={DURATION}
        width={1080}
        height={1920}
        defaultProps={defaults as unknown as Record<string, unknown>}
        calculateMetadata={({ props }) => {
          const p = props as unknown as TemplateProps;
          const n = p.items?.length ?? 0;
          const durationInFrames =
            id === "catalog" && n
              ? n * SLIDE + SLIDE_OUTRO
              : id === "motion" && n
                ? MG.intro + n * MG.scene + MG.outro
                : framesOf(p.seconds);
          return { ...sizeOf(p.ratio), durationInFrames };
        }}
      />
    ))}
  </>
);
