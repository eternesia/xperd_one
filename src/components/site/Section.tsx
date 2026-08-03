import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  children,
  className,
  dark = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  dark?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn("py-20 md:py-28", dark && "surface-navy relative overflow-hidden", className)}
    >
      {dark && <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />}
      <div className="container-x relative">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  onDark = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  onDark?: boolean;
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && (
        <p
          className={cn(
            "mb-3 text-xs font-semibold uppercase tracking-[0.22em]",
            onDark ? "text-gold" : "text-gold-foreground/70",
          )}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className={cn(
          "text-3xl leading-tight md:text-[2.6rem]",
          onDark ? "text-primary-foreground" : "text-navy",
        )}
      >
        {title}
      </h2>
      {description && (
        <p className={cn("mt-4 text-base leading-relaxed", onDark ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {description}
        </p>
      )}
    </div>
  );
}