import { useEffect, useRef, useState } from "react";

const isNative =
  typeof (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    ?.isNativePlatform === "function" &&
  (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor!.isNativePlatform!();

export function useWakeLock(isActive: boolean = true) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [isSupported] = useState<boolean>(isNative || "wakeLock" in navigator);

  useEffect(() => {
    if (!isActive || !isSupported) return;

    if (isNative) {
      // Native: @capacitor-community/keep-awake prevents the device from sleeping
      // inside a WKWebView where navigator.wakeLock is unreliable.
      import("@capacitor-community/keep-awake").then(({ KeepAwake }) => {
        KeepAwake.keepAwake().catch(console.warn);
      });
      return () => {
        import("@capacitor-community/keep-awake").then(({ KeepAwake }) => {
          KeepAwake.allowSleep().catch(console.warn);
        });
      };
    }

    // Web: standard Screen Wake Lock API
    const requestWakeLock = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch (err) {
        console.warn("Wake Lock error:", err);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (wakeLockRef.current !== null && document.visibilityState === "visible") {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(console.error);
        wakeLockRef.current = null;
      }
    };
  }, [isActive, isSupported]);
}
