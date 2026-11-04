import { Clock, Globe, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { BRAND } from "@/lib/xperd";
import { getXperdContact } from "@/lib/xperd-contact.functions";

/** Kontak efektif: nilai dari Admin → Konten Website bila diisi, selain itu bawaan `BRAND`. */
export function useXperdContact() {
  const { data } = useQuery({
    queryKey: ["site-content", "xperd.kontak"],
    queryFn: () => getXperdContact(),
    staleTime: 60_000,
  });
  return {
    email: data?.email ?? BRAND.email,
    phone: data?.phone ?? BRAND.phone,
    whatsapp: data?.whatsapp ?? BRAND.whatsapp,
    address: data?.address ?? BRAND.address,
    hours: data?.hours ?? "",
    website: data?.website ?? "",
  };
}

/** Daftar kontak berikon: email, telepon, WhatsApp, alamat (+ jam layanan & website bila diisi). */
export function ContactItems({
  className,
  itemClassName = "flex gap-3",
  iconClassName = "mt-0.5 h-4 w-4 shrink-0 text-gold",
}: {
  className: string;
  itemClassName?: string;
  iconClassName?: string;
}) {
  const c = useXperdContact();
  const items = [
    { Icon: Mail, text: c.email },
    { Icon: Phone, text: c.phone },
    { Icon: MessageCircle, text: c.whatsapp },
    { Icon: MapPin, text: c.address },
    ...(c.hours ? [{ Icon: Clock, text: c.hours }] : []),
    ...(c.website ? [{ Icon: Globe, text: c.website }] : []),
  ];
  return (
    <ul className={className}>
      {items.map(({ Icon, text }) => (
        <li key={text} className={itemClassName}>
          <Icon className={iconClassName} />
          {/* span agar teks mengikuti flex di semua tata letak */}
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}
