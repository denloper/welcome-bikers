import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const mapsKey = env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyAldqEbYQZJSOeNYP1pDzg3Zx499U4NVAU";
  return {
    plugins: [react()],
    base: "./",
    server: { port: 5173, host: true },
    define: {
      "import.meta.env.VITE_GOOGLE_MAPS_API_KEY": JSON.stringify(mapsKey),
    },
  };
});
