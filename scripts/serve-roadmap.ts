import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.ROADMAP_PORT ?? 4177);
const DOCS_ROOT = normalize(join(process.cwd(), "docs"));

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function docsPath(pathname: string): string | null {
  const decoded = decodeURIComponent(pathname === "/" ? "/roadmap.html" : pathname);
  const target = normalize(join(DOCS_ROOT, decoded.replace(/^\/+/, "")));
  return target.startsWith(DOCS_ROOT) ? target : null;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/roadmap") {
      return new Response(Bun.file(join(DOCS_ROOT, "roadmap.json")), {
        headers: { "Content-Type": contentTypes[".json"] },
      });
    }

    const path = docsPath(url.pathname);
    if (!path) return new Response("Forbidden", { status: 403 });

    const file = Bun.file(path);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });

    return new Response(file, {
      headers: { "Content-Type": contentTypes[extname(path)] ?? "application/octet-stream" },
    });
  },
});

console.log(`Roadmap local server listening on http://localhost:${server.port}`);
