import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };

function requireProductionApiBase(mode: string, apiBase: string | undefined) {
  const normalized = apiBase?.trim();
  if (mode === "production") {
    const allowHttpBeta = /^(1|true|yes)$/i.test(process.env.LUMEN_ALLOW_HTTP_BETA ?? "");
    if (!normalized || /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\/?$/i.test(normalized)) {
      throw new Error(
        "Production extension builds require VITE_LUMEN_API_BASE to point at the public Lumen server. Set it in apps/extension/.env.production or pass it in the build environment.",
      );
    }
    if (!normalized.startsWith("https://") && !allowHttpBeta) {
      throw new Error(
        "Production extension builds require VITE_LUMEN_API_BASE to use https://. Set LUMEN_ALLOW_HTTP_BETA=1 only for temporary HTTP beta builds.",
      );
    }
  }
  return normalized;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  requireProductionApiBase(mode, env.VITE_LUMEN_API_BASE ?? process.env.VITE_LUMEN_API_BASE);

  return {
    plugins: [react(), crx({ manifest })],
    build: {
      rollupOptions: {
        // crxjs picks up entries from manifest.json itself
      },
    },
    server: {
      // crxjs requires a strict port for HMR
      port: 5173,
      strictPort: true,
      hmr: {
        port: 5173,
      },
    },
  };
});
