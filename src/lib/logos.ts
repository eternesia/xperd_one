import oneAsset from "@/assets/xperd-one.png";
import businessAsset from "@/assets/xperd-business.png";
import enterpriseAsset from "@/assets/xperd-enterprise.png";

import type { ProductLine } from "./xperd";

export const PRODUCT_LOGOS: Record<ProductLine, string> = {
  one: oneAsset,
  business: businessAsset,
  enterprise: enterpriseAsset,
};
