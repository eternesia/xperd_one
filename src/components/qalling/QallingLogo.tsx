import logo from "@/assets/qalling-logo.png";
import logoWhite from "@/assets/qalling-logo-white.png";
import { cn } from "@/lib/utils";

/** Supplied artwork; the white variant swaps in automatically on the night theme. */
export function QallingLogo({ className }: { className?: string }) {
  return (
    <>
      <img
        src={logo}
        alt="Qalling — Precision in relationships"
        width={761}
        height={247}
        className={cn(
          "qalling-logo qalling-logo-light h-auto w-36 shrink-0 object-contain",
          className,
        )}
      />
      <img
        src={logoWhite}
        alt="Qalling — Precision in relationships"
        width={1024}
        height={500}
        aria-hidden="true"
        className={cn(
          "qalling-logo qalling-logo-dark h-auto w-36 shrink-0 object-contain",
          className,
        )}
      />
    </>
  );
}
