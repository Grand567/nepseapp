// src/utils/externalLinks.js
import { Capacitor } from '@capacitor/core';

/**
 * Safely opens external URLs.
 * - On Native Android/iOS: uses '_system' target to guarantee external handover
 *   to the device's system browser (Chrome/Safari) without hijacking the app WebView.
 * - On Web Browsers and Desktop Electron: uses standard window.open with 'noopener,noreferrer'.
 */
export function openExternalUrl(url, target = '_blank') {
  if (!url || typeof window === 'undefined') return;

  const isNative = (typeof Capacitor !== 'undefined' && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform()) ||
                   (typeof window !== 'undefined' && typeof window.Capacitor?.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());

  if (isNative) {
    try {
      window.open(url, '_system');
      return;
    } catch (_) {}
  }

  try {
    window.open(url, target, 'noopener,noreferrer');
  } catch (_) {
    window.open(url, target);
  }
}
