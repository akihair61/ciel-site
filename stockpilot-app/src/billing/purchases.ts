import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

import type { PlanId } from '@/lib/plans';

const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_RC_IOS_KEY,
  android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY,
});

let configured = false;

/** True once RevenueCat keys are set for this platform. */
export const billingAvailable = () => !!API_KEY && Platform.OS !== 'web';

/**
 * Configure RevenueCat with the same device id the AI server uses, so the
 * webhook can unlock the server-side quota for this device.
 */
export function initBilling(deviceId: string, onPlan: (plan: PlanId) => void): void {
  if (configured || !billingAvailable() || !API_KEY) return;
  Purchases.configure({ apiKey: API_KEY, appUserID: deviceId });
  configured = true;
  Purchases.addCustomerInfoUpdateListener((info) => onPlan(planFrom(info)));
  Purchases.getCustomerInfo()
    .then((info) => onPlan(planFrom(info)))
    .catch(() => {});
}

export function planFrom(info: CustomerInfo): PlanId {
  const active = info.entitlements.active;
  if (active.business) return 'business';
  if (active.pro) return 'pro';
  return 'free';
}

export interface Offer {
  plan: PlanId;
  pkg: PurchasesPackage;
}

/** Packages in the current offering, matched to plans by product id ("pro…", "business…"). */
export async function loadOffers(): Promise<Offer[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  const pkgs = offerings.current?.availablePackages ?? [];
  return pkgs.flatMap((pkg): Offer[] => {
    const id = pkg.product.identifier.toLowerCase();
    if (id.includes('business')) return [{ plan: 'business', pkg }];
    if (id.includes('pro')) return [{ plan: 'pro', pkg }];
    return [];
  });
}

/** Returns the new plan, or null if the user cancelled. */
export async function buy(pkg: PurchasesPackage): Promise<PlanId | null> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return planFrom(customerInfo);
  } catch (err) {
    if ((err as { userCancelled?: boolean }).userCancelled) return null;
    throw err;
  }
}

export async function restore(): Promise<PlanId> {
  return planFrom(await Purchases.restorePurchases());
}
