import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nexusjudge.app',
  appName: 'Nexus Judge',
  webDir: 'dist',
  plugins: {
    // Use Capacitor's browser plugin for OAuth redirects (Google, Apple sign-in)
    Browser: {
      presentationStyle: 'popover',
    },
    // Respect the app's own safe-area management; StatusBar overlay lets us
    // extend content edge-to-edge on iOS (we draw our own inset padding).
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#08070b',
    },
  },
  ios: {
    // Scroll bounce feels out of place for an app-style layout
    scrollEnabled: false,
    // Content inset handled in CSS via env(safe-area-inset-*)
    contentInset: 'never',
    // Keep the WebView from resizing when the keyboard appears; the app manages
    // its own layout (bottom nav hides via CSS :has(input:focus) selector)
    keyboardResize: 'none',
  },
};

export default config;
