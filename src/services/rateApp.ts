import { RateApp } from "capacitor-rate-app";
import { isNative } from "./revenueCat";

const INTERACTIONS_KEY = "nexus_rate_interactions";
const PROMPTED_KEY = "nexus_rate_prompted";
const THRESHOLD = 3;

export async function recordPositiveInteraction(): Promise<void> {
  if (!isNative) return;
  if (localStorage.getItem(PROMPTED_KEY)) return;

  const count = parseInt(localStorage.getItem(INTERACTIONS_KEY) ?? "0", 10) + 1;
  localStorage.setItem(INTERACTIONS_KEY, String(count));

  if (count >= THRESHOLD) {
    localStorage.setItem(PROMPTED_KEY, "1");
    await RateApp.requestReview();
  }
}
