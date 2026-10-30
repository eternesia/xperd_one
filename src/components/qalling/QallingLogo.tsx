import logo from "@/assets/qalling-logo.png";
import { cn } from "@/lib/utils";

/** Original supplied artwork, shared by all Qalling brand placements. */
export function QallingLogo({ className }: { className?: string }) {
  return (
    <img
      src={logo}
      alt="Qalling — Precision in relationships"
      width={761}
      height={247}
      className={cn("qalling-logo h-auto w-36 shrink-0 object-contain", className)}
    />
  );
}
