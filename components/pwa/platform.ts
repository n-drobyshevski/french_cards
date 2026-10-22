// Browser/platform checks for install and storage UX. Safe to import on the server (they return false there).

interface NavigatorWithStandalone extends Navigator {
  /** iOS Safari: true when launched from the home screen. */
  standalone?: boolean;
}

/** Running as an installed app (home-screen icon / standalone window). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if ((navigator as NavigatorWithStandalone).standalone === true) return true;
  return ["standalone", "fullscreen", "minimal-ui"].some(
    (mode) => typeof window.matchMedia === "function" && window.matchMedia(`(display-mode: ${mode})`).matches,
  );
}

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with touch). */
export function isIos(userAgent?: string, platform?: string, maxTouchPoints?: number): boolean {
  if (userAgent === undefined && typeof navigator === "undefined") return false;
  const ua = userAgent ?? navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  const plat = platform ?? navigator.platform;
  const touch = maxTouchPoints ?? navigator.maxTouchPoints ?? 0;
  return plat === "MacIntel" && touch > 1;
}

/**
 * iOS Safari itself, where «Поделиться → На экран «Домой»» is how the app is installed.
 * Excludes other iOS browsers and in-app web views (their share sheets differ or lack the item).
 */
export function isIosSafari(userAgent?: string, platform?: string, maxTouchPoints?: number): boolean {
  if (!isIos(userAgent, platform, maxTouchPoints)) return false;
  const ua = userAgent ?? navigator.userAgent;
  if (!/Safari\//.test(ua) || !/Version\//.test(ua)) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|GSA\/|FBAN|FBAV|Instagram|Line\/|Telegram|VKClient/i.test(ua);
}
