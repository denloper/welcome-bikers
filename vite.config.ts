import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const mapsKey = env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyAldqEbYQZJSOeNYP1pDzg3Zx499U4NVAU";
  const openRouterKey = env.VITE_OPENROUTER_API_KEY || "";
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: ["icons/app-icon.svg"],
        manifest: {
          name: "Welcome Bikers",
          short_name: "Bikers",
          description: "Places, motorcycle routes and in-app navigation for bikers.",
          start_url: "./#/",
          scope: "./",
          display: "standalone",
          background_color: "#111111",
          theme_color: "#111111",
          orientation: "portrait",
          icons: [
            {
              src: "icons/app-icon.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any",
            },
            {
              src: "icons/app-icon.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallback: "index.html",
          globPatterns: ["**/*.{html,js,css,svg,png,woff,woff2}"],
          globIgnores: [
            "**/data/**",
            "**/wbmap-gmaps-*.js",
            "**/wbmap-libre-*.js",
            "**/maplibre-gl-worker-*.js",
          ],
          runtimeCaching: [
            {
              urlPattern: /\/data\/.*\.json$/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "wb-data",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 12, maxAgeSeconds: 7 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: ({ request, url }) =>
                url.origin === self.location.origin &&
                ["script", "style", "worker"].includes(request.destination),
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "wb-lazy-assets",
                expiration: { maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    base: "./",
    server: { port: 5173, host: true },
    define: {
      "import.meta.env.VITE_GOOGLE_MAPS_API_KEY": JSON.stringify(mapsKey),
      "import.meta.env.VITE_OPENROUTER_API_KEY": JSON.stringify(openRouterKey),
    },
  };
});
