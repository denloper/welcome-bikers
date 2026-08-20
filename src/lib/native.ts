import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function bootNativeShell(): Promise<void> {
  if (!isNativeApp()) return;

  document.documentElement.classList.add("native-app", `native-${Capacitor.getPlatform()}`);

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#000000" });
  } catch {
    /* web or older WebView */
  }

  try {
    await SplashScreen.hide();
  } catch {
    /* splash plugin may be absent in preview */
  }

  void navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((reg) => void reg.unregister());
  });

  await CapApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack || window.history.length > 1) window.history.back();
    else void CapApp.exitApp();
  });
}
