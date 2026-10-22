// Haptic feedback for card gestures. Android/Chrome: navigator.vibrate. iOS Safari has no
// Vibration API, but since iOS 18 toggling a native `<input type="checkbox" switch>` plays the
// system haptic, so a hidden switch is clicked instead (one tap of feedback per call).
//
// Known limits (browser rules, not bugs): iOS plays the switch haptic only while handling a user
// gesture (a tap, the end of a swipe), so the threshold tick during a drag may stay silent there;
// iOS also needs «Системные тактильные сигналы» on, and Android ignores vibration in some
// battery-saver and Do Not Disturb modes.

export type HapticKind =
  /** A swipe crossed its threshold: releasing now will act. */
  | "threshold"
  /** A card was graded «Знаю» by swipe. */
  | "good"
  /** A card was graded «Не знаю» by swipe. */
  | "again";

/**
 * Milliseconds. Many Android vibration motors cannot produce pulses shorter than ~20 ms and
 * silently drop them, so even the light tick stays above that.
 */
export const VIBRATION_PATTERNS: Record<HapticKind, number | number[]> = {
  threshold: 20,
  good: 40,
  again: [35, 80, 35],
};

/** How this device can give feedback: the Vibration API, the iOS switch haptic, or not at all. */
export type HapticSupport = "vibrate" | "ios" | "none";

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export function hapticSupport(): HapticSupport {
  if (typeof navigator === "undefined") return "none";
  if (typeof navigator.vibrate === "function") return "vibrate";
  if (isIOS() && typeof document !== "undefined") return "ios";
  return "none";
}

/**
 * One system haptic on iOS 18+: a fresh, undisplayed switch is toggled through its label and
 * removed again (the same technique as the ios-haptics package; reusing one hidden switch was
 * not reliable).
 */
function iosHaptic(): void {
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.appendChild(input);
  document.head.appendChild(label);
  try {
    label.click();
  } finally {
    label.remove();
  }
}

/** Plays a short haptic if the device supports one; silently does nothing otherwise. */
export function haptic(kind: HapticKind): void {
  try {
    const support = hapticSupport();
    if (support === "vibrate") {
      navigator.vibrate(VIBRATION_PATTERNS[kind]);
    } else if (support === "ios") {
      iosHaptic();
      // Two taps for «Не знаю», so it feels different from «Знаю» on iPhone too.
      if (kind === "again") setTimeout(() => iosHaptic(), 120);
    }
  } catch {
    // Haptics are a nicety; never let them break a gesture.
  }
}

/**
 * Fires `threshold` once each time a drag enters the commit zone (and re-arms when it leaves),
 * so the finger feels the point where releasing will act.
 */
export function thresholdNotifier() {
  let inside = false;
  return {
    update(past: boolean, enabled: boolean) {
      if (past && !inside && enabled) haptic("threshold");
      inside = past;
    },
    reset() {
      inside = false;
    },
  };
}
