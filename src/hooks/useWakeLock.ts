import { useEffect, useRef, useState } from "react";

export function useWakeLock(isActive: boolean = true) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [isSupported] = useState<boolean>("wakeLock" in navigator);

  useEffect(() => {
    if (!isActive || !isSupported) return;

    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
          wakeLockRef.current.addEventListener("release", () => {
            // Wake lock released
          });
        }
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
