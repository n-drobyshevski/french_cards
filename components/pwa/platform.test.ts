import { describe, expect, it } from "vitest";
import { isIos, isIosSafari, isStandalone } from "./platform";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1";
const IPHONE_TELEGRAM_WEBVIEW =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";

describe("platform", () => {
  it("detects iOS Safari only", () => {
    expect(isIosSafari(IPHONE_SAFARI, "iPhone", 5)).toBe(true);
    expect(isIosSafari(IPAD_DESKTOP_MODE, "MacIntel", 5)).toBe(true);
    expect(isIosSafari(IPHONE_CHROME, "iPhone", 5)).toBe(false);
    expect(isIosSafari(IPHONE_TELEGRAM_WEBVIEW, "iPhone", 5)).toBe(false);
    expect(isIosSafari(ANDROID_CHROME, "Linux armv8l", 5)).toBe(false);
  });

  it("does not mistake a desktop Mac for an iPad", () => {
    expect(isIos(IPAD_DESKTOP_MODE, "MacIntel", 0)).toBe(false);
    expect(isIos(IPAD_DESKTOP_MODE, "MacIntel", 5)).toBe(true);
  });

  it("is false on the server", () => {
    expect(isStandalone()).toBe(false);
  });
});
