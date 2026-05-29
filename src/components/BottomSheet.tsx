/**
 * BottomSheet — shared modal wrapper.
 *
 * On desktop: centred fixed modal (the standard pattern).
 * On mobile (≤ 768 px): slides up from the bottom edge as a sheet.
 *
 * Usage:
 *   <BottomSheet onClose={onClose} zIndex={200}>
 *     inner content here — no need for a wrapping panel div
 *   </BottomSheet>
 *
 * The inner panel already has `glass-panel` styling, padding, and
 * overflow-y: auto applied — do NOT nest another panel inside.
 */

import React from "react";
import { useMobile } from "../hooks/useMobile";

interface BottomSheetProps {
  children:   React.ReactNode;
  onClose:    () => void;
  zIndex?:    number;
  /** Maximum width of the desktop centred modal (default: "520px") */
  maxWidth?:  string;
  /** Force the modal to stay centered in the middle of the screen even on mobile */
  alwaysCentered?: boolean;
  /** Inner padding (default: "24px") */
  padding?:   string;
  /** Forwarded to the panel div for accessibility (e.g. role="dialog") */
  role?:      string;
  "aria-modal"?: boolean;
  "aria-label"?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  children,
  onClose,
  zIndex    = 200,
  maxWidth  = "520px",
  padding   = "24px",
  alwaysCentered = true,
  ...panelAriaProps
}) => {
  const isMobile = useMobile(768);

  const panelStyle: React.CSSProperties = (isMobile && !alwaysCentered)
    ? {
        position:     "fixed",
        bottom:       0,
        left:         0,
        right:        0,
        borderRadius: "16px 16px 0 0",
        maxHeight:    "90dvh",
        overflowY:    "auto",
        zIndex:       zIndex + 1,
        padding,
        animation:    "sheet-enter-bottom 0.22s cubic-bezier(0.4,0,0.2,1)",
      }
    : {
        position:  "fixed",
        top:       "calc(var(--app-height, 100dvh) / 2)",
        left:      "50%",
        transform: "translate(-50%, -50%)",
        width:     `min(${maxWidth}, 92vw)`,
        maxHeight: "calc(var(--app-height, 100dvh) * 0.85)",
        overflowY: "auto",
        zIndex:    zIndex + 1,
        padding,
        animation: "sheet-enter-center 0.22s cubic-bezier(0.4,0,0.2,1)",
      };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:          "fixed",
          inset:             0,
          background:        "rgba(0,0,0,0.72)",
          backdropFilter:    "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          zIndex,
        }}
      />

      {/* Panel */}
      <div
        className="glass-panel"
        style={panelStyle}
        onClick={e => e.stopPropagation()}
        {...panelAriaProps}
      >
        {children}
      </div>
    </>
  );
};
