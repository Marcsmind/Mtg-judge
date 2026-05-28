import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface RoomQRCodeProps {
  roomCode: string;
  /** px size of the QR image square */
  size?: number;
}

/**
 * Renders a QR code that encodes the deep-link URL for joining a room.
 * Guests can scan it instead of typing the room code manually.
 */
export function RoomQRCode({ roomCode, size = 120 }: RoomQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !roomCode) return;
    // Encode a URL so scanning with any camera app works (not just our scanner)
    const url = `${window.location.origin}/?join=${roomCode}`;
    QRCode.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 1,
      color: { dark: "#f3f1f6", light: "#00000000" }, // white dots, transparent bg
    }).catch(() => setError(true));
  }, [roomCode, size]);

  if (error) return null;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "12px",
        padding: "8px",
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
      }}
    >
      <canvas ref={canvasRef} style={{ borderRadius: "6px", display: "block" }} />
      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Scan to join</span>
    </div>
  );
}
