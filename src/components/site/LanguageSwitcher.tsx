import { Globe } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n, type Lang } from "@/lib/i18n";

const OPTIONS: { value: Lang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "id", label: "ID" },
];

export function LanguageSwitcher({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  const { lang, setLang } = useI18n();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border p-0.5",
        onDark ? "border-white/20" : "border-border",
        className,
      )}
    >
      <Globe className={cn("ml-1.5 h-3.5 w-3.5", onDark ? "text-primary-foreground/60" : "text-muted-foreground")} />
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setLang(opt.value)}
          aria-pressed={lang === opt.value}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide transition-colors",
            lang === opt.value
              ? "bg-[image:var(--gradient-gold)] text-navy"
              : onDark
                ? "text-primary-foreground/60 hover:text-primary-foreground"
                : "text-muted-foreground hover:text-navy",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
