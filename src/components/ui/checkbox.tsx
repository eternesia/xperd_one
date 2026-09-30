import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Nilai `checked` dari basis data bisa berupa TINYINT (1/0) alih-alih boolean.
 * Radix meneruskan nilai apa adanya ke `aria-checked`, sehingga 1/0 menjadi
 * ARIA tidak valid ("1"/"0") yang dibaca sebagai unchecked. Normalisasi hanya
 * menyentuh nilai non-boolean; `undefined` (uncontrolled) dan "indeterminate"
 * diteruskan apa adanya.
 */
function normalizeChecked(value: boolean | "indeterminate" | unknown) {
  if (value === undefined || typeof value === "boolean" || value === "indeterminate") {
    return value as boolean | "indeterminate" | undefined;
  }
  return Boolean(Number(value));
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, checked, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    // Nilai dari MySQL (TINYINT 1/0) harus dinormalisasi: Radix menyalin nilai
    // apa adanya ke `aria-checked`, sehingga 1/0 menghasilkan ARIA tidak valid
    // ("1"/"0") — pembaca layar dan pengujian membacanya sebagai unchecked.
    // `undefined` (uncontrolled) & "indeterminate" diteruskan apa adanya.
    checked={normalizeChecked(checked)}
    className={cn(
      "grid place-content-center peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("grid place-content-center text-current")}>
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
