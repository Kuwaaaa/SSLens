import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };

export default defineConfig({
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
});
