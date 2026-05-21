/**
 * Haptic feedback utility — wraps the Web Vibration API.
 * Silent no-op on browsers/devices that don't support it.
 */
const canVibrate = typeof navigator !== "undefined" && "vibrate" in navigator;

const v = (pattern: number | number[]) => {
  if (canVibrate) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
};

/** Short tap — life ±1, token ±1 */
export const hapticLight = () => v(12);

/** Standard tap — coin flip land, roll result, major action */
export const hapticMedium = () => v(25);

/** Double-pulse — critical hit (nat 20), critical fail (nat 1), player defeated */
export const hapticHeavy  = () => v([35, 12, 35]);
