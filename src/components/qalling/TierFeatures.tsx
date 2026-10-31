import { Check, Minus } from "lucide-react";
import { QALLING_FEATURE_LABELS } from "@/lib/qalling-catalog";
import { useI18n } from "@/lib/i18n";

export function TierFeatures({
  features,
  compare = false,
}: {
  features: Record<string, boolean>;
  compare?: boolean;
}) {
  const { lang } = useI18n();
  return (
    <ul className="space-y-2 text-sm">
      {Object.entries(QALLING_FEATURE_LABELS)
        .filter(([key]) => compare || features[key])
        .map(([key, label]) => (
          <li
            key={key}
            className={`flex gap-2 ${features[key] ? "text-foreground" : "text-muted-foreground"}`}
          >
            {features[key] ? (
              <Check className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <Minus className="h-4 w-4 shrink-0" />
            )}
            <span>{label[lang]}</span>
          </li>
        ))}
    </ul>
  );
}
