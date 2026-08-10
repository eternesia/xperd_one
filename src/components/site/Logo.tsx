import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

import logoUrl from "@/assets/xperd.png";

export function Logo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <Link to="/" className={cn("inline-flex items-center", className)} aria-label="XPERD">
      <img
        src={logoUrl}
        alt="XPERD — Smart ERP. Simplify Business. Drive Growth."
        className={cn(
          "h-9 w-auto transition-all duration-200",
          onDark && "invert brightness-200",
          className
        )}
        loading="eager"
        decoding="async"
      />
    </Link>
  );
}
