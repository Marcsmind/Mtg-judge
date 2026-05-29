import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nexusjudge.app',
  appName: 'Arbiter',
  webDir: 'dist',
  // Live reload — remove this block before building for App Store submission
  server: {
    url: 'http://192.168.0.5:5173',
    cleartext: true,
  },
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
    // 'none' keeps the WebView frame fixed when keyboard appears.
    // Layout is handled entirely via --app-height (see App.tsx), which the
    // keyboardWillShow/Hide listeners update using exact keyboard heights.
    // The ios.keyboardResize key is ignored in Capacitor 8; this plugin-level
    // key is what @capacitor/keyboard actually reads.
    Keyboard: {
      resize: 'none',
      resizeOnFullScreen: true,
    },
  },
  ios: {
    // Scroll bounce feels out of place for an app-style layout
    scrollEnabled: false,
    // Content inset handled in CSS via env(safe-area-inset-*)
    contentInset: 'never',
  },
};

export default config;
