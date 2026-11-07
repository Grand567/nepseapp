// src/utils/haptics.js
/**
 * Safe, universal haptic touch feedback for mobile devices & PWAs.
 * Triggers a crisp physical vibration on supported hardware (Capacitor Android, Chrome Mobile, etc.).
 * Gracefully degrades to a no-op on desktop or unsupported browsers.
 * 
 * @param {number|number[]} pattern - Vibration duration in milliseconds (default: 25ms for crisp touch feedback)
 */
export function triggerHaptic(pattern = 25) {
  try {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch (_) {
    // Ignore any security or sandbox policy restrictions on vibration
  }
}

export default triggerHaptic;
