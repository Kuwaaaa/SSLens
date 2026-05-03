// Backend endpoints. Set VITE_LUMEN_API_BASE for production builds, e.g.
// VITE_LUMEN_API_BASE=https://lumen.example.com bun run build:extension
const rawApiBase = import.meta.env.VITE_LUMEN_API_BASE ?? "http://localhost:3000";

export const API_BASE = rawApiBase.replace(/\/+$/, "");
export const WS_BASE = API_BASE.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
