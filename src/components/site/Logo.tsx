import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import darkLogo from "@/assets/xperd.png";
import lightLogo from "@/assets/xperd.png";

export function Logo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <Link to="/" className={cn("inline-flex items-center", className)} aria-label="XPERD">
      <img
        src={onDark ? lightLogo : darkLogo}
        alt="XPERD — Smart ERP. Simplify Business. Drive Growth."
        className={cn("w-auto", onDark ? "h-11" : "h-9")}
        loading="eager"
        decoding="async"
      />
    </Link>
  );
}
