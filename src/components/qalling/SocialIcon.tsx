import {
  SiInstagram,
  SiFacebook,
  SiTiktok,
  SiYoutube,
  SiX,
  SiThreads,
  SiTelegram,
  SiDiscord,
  SiPinterest,
  SiBluesky,
  SiGoogle,
} from "@icons-pack/react-simple-icons";
import { Share2 } from "lucide-react";
function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="LinkedIn" fill="currentColor">
      <path d="M20.45 2H3.55C2.69 2 2 2.68 2 3.52v16.96C2 21.32 2.69 22 3.55 22h16.9c.86 0 1.55-.68 1.55-1.52V3.52C22 2.68 21.31 2 20.45 2ZM7.93 18.75H4.98V9.2h2.95v9.55ZM6.46 7.9a1.71 1.71 0 1 1 0-3.42 1.71 1.71 0 0 1 0 3.42Zm12.3 10.85h-2.95V14.1c0-1.11-.02-2.54-1.55-2.54-1.56 0-1.8 1.21-1.8 2.46v4.73H9.51V9.2h2.83v1.3h.04c.39-.75 1.36-1.55 2.8-1.55 2.99 0 3.54 1.97 3.54 4.53v5.27Z" />
    </svg>
  );
}
const icons = {
  instagram: SiInstagram,
  facebook: SiFacebook,
  tiktok: SiTiktok,
  youtube: SiYoutube,
  linkedin: LinkedInIcon,
  x: SiX,
  twitter: SiX,
  threads: SiThreads,
  telegram: SiTelegram,
  discord: SiDiscord,
  pinterest: SiPinterest,
  bluesky: SiBluesky,
  google_business: SiGoogle,
};
export function SocialIcon({
  platform,
  className = "h-4 w-4",
}: {
  platform: string;
  className?: string;
}) {
  const Icon = icons[platform as keyof typeof icons] ?? Share2;
  return (
    <Icon
      aria-label={platform}
      className={`social-icon social-${platform} shrink-0 ${className}`}
    />
  );
}
