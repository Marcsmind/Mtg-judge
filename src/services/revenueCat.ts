/**
 * RevenueCat — in-app purchase layer for iOS/Android.
 *
 * Only active inside a Capacitor native build. On web, Stripe handles
 * all purchases and this module is a no-op.
 *
 * Setup (one-time, in RevenueCat dashboard):
 *   1. Create an App for iOS (bundle ID: com.nexusjudge.app)
 *   2. Create Entitlement: "pro"
 *   3. Create Products matching your App Store Connect product IDs:
 *        com.nexusjudge.pro_monthly  ($4.99/mo)
 *        com.nexusjudge.pro_annual   ($34.99/yr)
 *        com.nexusjudge.lifetime     ($79.99 one-time)
 *   4. Create an Offering "default" containing all three packages
 *   5. Paste the iOS Public SDK key into VITE_REVENUECAT_IOS_KEY in .env
 */

import type { SubscriptionTier } from "../types/subscription";

const RC_IOS_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined;

// True when running inside a Capacitor native app
const isNative =
  typeof (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    ?.isNativePlatform === "function" &&
  (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor!
    .isNativePlatform!();

// ── Public API ────────────────────────────────────────────────────────────────

export { isNative };

/**
 * Call once on app mount (after auth) when running natively.
 * Safe to call on web — returns immediately.
 */
export async function initRevenueCat(userId: string): Promise<void> {
  if (!isNative || !RC_IOS_KEY) return;
  try {
    const { Purchases, LOG_LEVEL } = await import("@revenuecat/purchases-capacitor");
    await Purchases.setLogLevel({ level: LOG_LEVEL.ERROR });
    await Purchases.configure({ apiKey: RC_IOS_KEY, appUserID: userId });
  } catch (err) {
    console.error("[RevenueCat] init failed:", err);
  }
}

export interface RCOffering {
  monthly: RCPackage | null;
  annual: RCPackage | null;
  lifetime: RCPackage | null;
}

export interface RCPackage {
  identifier: string;
  productIdentifier: string;
  priceString: string;
  /** raw package object passed back to Purchases.purchasePackage */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
}

/** Fetch the current offering. Returns null on web or if RC is not configured. */
export async function getOffering(): Promise<RCOffering | null> {
  if (!isNative || !RC_IOS_KEY) return null;
  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { current } = await Purchases.getOfferings();
    if (!current) return null;

    const find = (id: string): RCPackage | null => {
      const pkg = current.availablePackages.find((p: { identifier: string }) =>
        p.identifier === id || p.identifier.includes(id)
      );
      if (!pkg) return null;
      return {
        identifier: pkg.identifier,
        productIdentifier: pkg.product.identifier,
        priceString: pkg.product.priceString,
        raw: pkg,
      };
    };

    return {
      monthly: find("monthly") ?? find("$rc_monthly"),
      annual: find("annual") ?? find("$rc_annual"),
      lifetime: find("lifetime") ?? find("$rc_lifetime"),
    };
  } catch (err) {
    console.error("[RevenueCat] getOffering failed:", err);
    return null;
  }
}

/**
 * Initiate a purchase. Returns the resulting tier on success, null on cancel/error.
 * The RevenueCat webhook will also update Supabase asynchronously — the returned
 * tier is used for an immediate optimistic UI update.
 */
export async function purchasePackage(rcPackage: RCPackage): Promise<SubscriptionTier | null> {
  if (!isNative) return null;
  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: rcPackage.raw });
    return entitlementToTier(customerInfo);
  } catch (err: unknown) {
    // User cancelled — not a real error
    const e = err as { userCancelled?: boolean; message?: string };
    if (e?.userCancelled) return null;
    console.error("[RevenueCat] purchasePackage failed:", e?.message ?? err);
    return null;
  }
}

/**
 * Restore previous purchases (Apple requires this button in IAP apps).
 * Returns the restored tier, or null if nothing was restored.
 */
export async function restorePurchases(): Promise<SubscriptionTier | null> {
  if (!isNative) return null;
  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.restorePurchases();
    return entitlementToTier(customerInfo);
  } catch (err) {
    console.error("[RevenueCat] restorePurchases failed:", err);
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function entitlementToTier(customerInfo: any): SubscriptionTier {
  const active = customerInfo?.entitlements?.active ?? {};
  if (active["lifetime"]) return "lifetime";
  if (active["pro"]) return "pro";
  return "free";
}
