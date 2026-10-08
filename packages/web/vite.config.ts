import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * In development the API runs separately (`pnpm --filter @linkshort/api dev`);
 * the dev server proxies API calls to it. In containers the API serves the
 * built client itself, so there is no proxy and no CORS.
 */
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", assetsDir: "assets", sourcemap: true },
  server: {
    proxy: { "/api": "http://localhost:3000", "/readyz": "http://localhost:3000" },
  },
});
