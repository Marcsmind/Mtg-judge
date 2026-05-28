import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

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

  useEffect(() => {
    let stopped = false;

    async function startScanner() {
      try {
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
        if (!stopped) setError("Camera access denied or unavailable.");
        console.error("[QRScanner]", err);
      }
    }

    startScanner();

    return () => {
      stopped = true;
      scannerRef.current?.stop().catch(() => undefined);
    };
  }, [onScan]);

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
        <div style={{ color: "var(--accent-rose)", fontSize: "0.9rem", textAlign: "center" }}>
          {error}
          <br />
          <button onClick={onClose} style={{ marginTop: "12px", background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", color: "var(--text-secondary)", padding: "8px 16px", cursor: "pointer", fontSize: "0.85rem" }}>
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
