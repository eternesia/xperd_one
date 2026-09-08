// Direct PNG imports so Vite bundles & hashes them. The Lovable .asset.json
// `url` fields (e.g. /src/assets/*) aren't served by a self-hosted prod build.
import oneLogo from "@/assets/xperd-one.png";
import businessLogo from "@/assets/xperd-business.png";
import enterpriseLogo from "@/assets/xperd-enterprise.png";

import type { ProductLine } from "./xperd";

export const PRODUCT_LOGOS: Record<ProductLine, string> = {
  one: oneLogo,
  business: businessLogo,
  enterprise: enterpriseLogo,
};