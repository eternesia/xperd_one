import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

// `xperd.png` here is the brand wordmark (same bytes as the Business Suite
// `xperd-logo.png` asset). BS also ships a pre-rendered light variant
// (`xperd-logo-light.png`) that is not available locally, so the light-on-dark
// version is derived with a CSS filter instead.
import brandLogo from "@/assets/xperd.png";

export function Logo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <Link to="/" className={cn("inline-flex items-center", className)} aria-label="XPERD">
      <img
        src={brandLogo}
        alt="XPERD — Smart ERP. Simplify Business. Drive Growth."
        className={cn("w-auto", onDark ? "h-11 invert brightness-200" : "h-9")}
        loading="eager"
        decoding="async"
      />
    </Link>
  );
}
