import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.github.denloper.welcomebikers",
  appName: "Welcome Bikers",
  webDir: "dist",
  backgroundColor: "#111111",
  server: {
    androidScheme: "https",
    hostname: "denloper.github.io",
  },
  android: {
    allowMixedContent: true,
    backgroundColor: "#111111",
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#111111",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#000000",
    },
  },
};

export default config;
