import { useEffect, useRef, useState, useCallback } from "react";
import { X, Camera } from "lucide-react";

interface QRScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

/**
 * Full-screen QR scanner overlay using html5-qrcode.
 * Parses either a bare 4-letter room code or the deep-link URL format
 * (e.g. https://…/?join=ABCD) produced by RoomQRCode.
 */
export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const divId = "qr-scanner-region";
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firedRef = useRef(false);

  const handleError = useCallback((err: unknown) => {
    console.error("[QRScanner]", err);
    const msg = err instanceof Error ? err.message : String(err);
    const isPermission = /permission|denied|notallowed|notfound/i.test(msg);
    setError(
      isPermission
        ? "Camera access denied. Please allow camera access in Settings and try again."
        : "Camera could not be loaded. Please close and try again.",
    );
  }, []);

  useEffect(() => {
    let stopped = false;

    async function startScanner() {
      try {
        // Verify camera is accessible before handing off to html5-qrcode
        await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
          .then(s => s.getTracks().forEach(t => t.stop()));

        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode(divId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            if (firedRef.current || stopped) return;
            firedRef.current = true;

            // Accept bare 4-letter code or deep-link URL
            let code = decodedText.trim().toUpperCase();
            try {
              const url = new URL(decodedText);
              const join = url.searchParams.get("join");
              if (join) code = join.toUpperCase();
            } catch {
              // not a URL — use raw value
            }

            if (/^[A-Z]{4}$/.test(code)) {
              scanner.stop().catch(() => undefined);
              onScan(code);
            }
          },
          undefined,
        );
      } catch (err) {
        if (!stopped) handleError(err);
      }
    }

    startScanner();

    return () => {
      stopped = true;
      scannerRef.current?.stop().catch(() => undefined);
    };
  }, [onScan, handleError]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(8,7,11,0.95)", backdropFilter: "blur(8px)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "24px",
        paddingTop: "calc(24px + env(safe-area-inset-top))",
        paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
        gap: "20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: "320px" }}>
        <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>Scan Room Code</span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "8px" }}
        >
          <X size={20} />
        </button>
      </div>

      {error ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", textAlign: "center", maxWidth: "280px" }}>
          <Camera size={40} color="var(--accent-rose)" style={{ opacity: 0.7 }} />
          <p style={{ color: "var(--accent-rose)", fontSize: "0.9rem", margin: 0 }}>{error}</p>
          <button
            onClick={onClose}
            style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "10px", color: "var(--text-primary)", padding: "12px 28px", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }}
          >
            Close
          </button>
        </div>
      ) : (
        <>
          <div
            id={divId}
            style={{
              width: "280px", height: "280px",
              borderRadius: "16px", overflow: "hidden",
              border: "2px solid rgba(139,92,246,0.4)",
              boxShadow: "0 0 40px rgba(139,92,246,0.2)",
            }}
          />
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", textAlign: "center" }}>
            Point at the host's QR code
          </p>
        </>
      )}
    </div>
  );
}
