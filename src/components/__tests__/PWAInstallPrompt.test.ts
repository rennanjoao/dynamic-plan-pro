import { describe, expect, it } from "vitest";
import { shouldShowIosInstallHelp } from "@/lib/pwaInstall";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

describe("ajuda de instalação no iPhone", () => {
  it("iPhone no Safari → mostra", () => {
    expect(shouldShowIosInstallHelp({ userAgent: IPHONE, standalone: false })).toBe(true);
  });
  it("já instalado → não mostra", () => {
    expect(shouldShowIosInstallHelp({ userAgent: IPHONE, standalone: true })).toBe(false);
  });
  it("iPad (se apresenta como Mac com toque) → mostra", () => {
    expect(shouldShowIosInstallHelp({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 5, standalone: false })).toBe(true);
  });
  it("Android e Mac de mesa → não (Android já tem o botão Instalar)", () => {
    expect(shouldShowIosInstallHelp({ userAgent: ANDROID, standalone: false })).toBe(false);
    expect(shouldShowIosInstallHelp({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 0, standalone: false })).toBe(false);
  });
});
