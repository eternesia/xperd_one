import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function QallingPreferences() {
  const { lang, setLang } = useI18n();
  const [mode, setMode] = useState<"light" | "dark" | "system">("light");
  useEffect(() => {
    const stored = localStorage.getItem("qalling-theme");
    if (stored === "dark" || stored === "light" || stored === "system") setMode(stored);
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle(
        "dark",
        mode === "dark" || (mode === "system" && media.matches),
      );
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode]);
  const labels = {
    light: lang === "id" ? "Terang" : "Light",
    dark: lang === "id" ? "Malam" : "Dark",
    system: lang === "id" ? "Sistem" : "System",
  };
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        aria-label={lang === "id" ? "Switch to English" : "Ganti ke Bahasa Indonesia"}
        onClick={() => setLang(lang === "id" ? "en" : "id")}
      >
        <Languages className="h-4 w-4" />
        {lang.toUpperCase()}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        title={labels[mode]}
        aria-label={labels[mode]}
        onClick={() => {
          const next = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
          localStorage.setItem("qalling-theme", next);
          setMode(next);
        }}
      >
        <Icon className="h-4 w-4" />
      </Button>
    </div>
  );
}
