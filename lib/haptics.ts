// Haptic feedback (MOTION-SPEC §5.13). Android/Chrome: navigator.vibrate. iOS Safari has no
// Vibration API, but since iOS 17.4 toggling a native `<input type="checkbox" switch>` plays the
// system haptic, so a hidden switch is clicked instead. That trick is unofficial and may stop
// working in a later iOS release: every haptic has a visual twin, nothing is felt-only.
//
// Rules: fire only on commit, inside a user gesture (click / pointerup); never on keystrokes,
// scroll, streamed rows, sheet drags or desktop. The one exception, the swipe-threshold tick
// during a drag, is Android-only (thresholdNotifier). Everything honours the «Вибрация» setting.
//
// Known limits (browser rules, not bugs): iOS also needs «Системные тактильные сигналы» on, and
// Android ignores vibration in some battery-saver and Do Not Disturb modes.
import { getSettingsMirrorSnapshot, parseSettingsMirror } from "./settings-mirror";

/** The whole vocabulary; pick by meaning, not by feel. */
export type HapticKind =
  /** Something light locked in: swipe threshold (Android), long-press fire, toggle, row full-swipe lock, undo, «Сложно». */
  | "tick"
  /** «Знаю» (swipe or button). */
  | "good"
  /** «Не знаю» (swipe or button); also what «Проверить» in Settings plays. */
  | "again"
  /** «Готово на сегодня», once a day. */
  | "done";

export const HAPTIC_KINDS: readonly HapticKind[] = ["tick", "good", "again", "done"];

/**
 * Milliseconds (vibrate, pause, vibrate…). Many Android vibration motors cannot produce pulses
 * shorter than ~20 ms and silently drop them, so even the light tick stays above that.
 */
export const VIBRATION_PATTERNS: Record<HapticKind, number | number[]> = {
  tick: 20,
  good: 40,
  again: [35, 80, 35],
  done: [30, 60, 30, 60, 50],
};

/** iOS: how many switch haptics each kind plays (the system haptic has one strength). */
export const IOS_TAPS: Record<HapticKind, number> = { tick: 1, good: 1, again: 2, done: 1 };
/** Gap between two iOS taps, ms. */
export const IOS_TAP_GAP_MS = 120;

/** How this device can give feedback: the Vibration API, the iOS switch haptic, or not at all. */
export type HapticSupport = "vibrate" | "ios" | "none";

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/** A computer without a touch screen: no haptics there (desktop Chrome has a no-op navigator.vibrate). */
const isDesktop = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && !window.matchMedia("(any-pointer: coarse)").matches;

export function hapticSupport(): HapticSupport {
  if (typeof navigator === "undefined" || isDesktop()) return "none";
  if (typeof navigator.vibrate === "function") return "vibrate";
  if (isIOS() && typeof document !== "undefined") return "ios";
  return "none";
}

/** The «Вибрация» setting (on by default), read from the settings mirror so any caller can check it synchronously. */
export function hapticsEnabled(): boolean {
  return parseSettingsMirror(getSettingsMirrorSnapshot())?.haptics ?? true;
}

/**
 * One system haptic on iOS 17.4+: a fresh, undisplayed switch is toggled through its label and
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

/**
 * Plays `kind` if the device supports haptics and «Вибрация» is on; silently does nothing
 * otherwise (and never throws). Call it from the click / pointerup that commits the action.
 */
export function haptic(kind: HapticKind): void {
  try {
    if (!hapticsEnabled()) return;
    const support = hapticSupport();
    if (support === "vibrate") {
      navigator.vibrate(VIBRATION_PATTERNS[kind]);
    } else if (support === "ios") {
      iosHaptic();
      // Two taps for «Не знаю», so it feels different from «Знаю» on iPhone too.
      for (let i = 1; i < IOS_TAPS[kind]; i++) setTimeout(() => iosHaptic(), IOS_TAP_GAP_MS * i);
    }
  } catch {
    // Haptics are a nicety; never let them break a gesture.
  }
}

/**
 * Fires `tick` once each time a drag enters the commit zone (and re-arms when it leaves), so the
 * finger feels the point where releasing will act. Android only: iOS plays nothing outside a
 * user gesture, and there the stamp lock is the twin.
 */
export function thresholdNotifier() {
  let inside = false;
  return {
    update(past: boolean, enabled: boolean) {
      if (past && !inside && enabled && hapticSupport() === "vibrate") haptic("tick");
      inside = past;
    },
    reset() {
      inside = false;
    },
  };
}
