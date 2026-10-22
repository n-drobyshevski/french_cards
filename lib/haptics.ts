// Haptic feedback for card gestures. Android/Chrome: navigator.vibrate. iOS Safari has no
// Vibration API, but since iOS 18 toggling a native `<input type="checkbox" switch>` plays the
// system haptic, so a hidden switch is clicked instead (one tap of feedback per call).

export type HapticKind =
  /** A swipe crossed its threshold: releasing now will act. */
  | "threshold"
  /** A card was graded «Знаю» by swipe. */
  | "good"
  /** A card was graded «Не знаю» by swipe. */
  | "again"
  /** A card was flipped by swipe. */
  | "flip";

export const VIBRATION_PATTERNS: Record<HapticKind, number | number[]> = {
  threshold: 8,
  good: 14,
  again: [12, 60, 12],
  flip: 10,
};

let iosSwitch: HTMLLabelElement | null = null;

function iosHaptic(): void {
  if (!iosSwitch) {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/** Plays a short haptic if the device supports one; silently does nothing otherwise. */
export function haptic(kind: HapticKind): void {
  if (typeof navigator === "undefined") return;
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(VIBRATION_PATTERNS[kind]);
    } else if (isIOS()) {
      iosHaptic();
      // Two clicks read as two taps; keep «Не знаю» distinct from «Знаю» on iPhone too.
      if (kind === "again") setTimeout(iosHaptic, 70);
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
