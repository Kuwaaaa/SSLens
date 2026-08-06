#!/usr/bin/env node
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { dirname, join } = require("node:path");

const repoRoot = dirname(dirname(__filename));
const bundledBun = "E:\\app\\bun-windows-x64\\bun.exe";
const bun = process.env.LUMEN_BUN || (existsSync(bundledBun) ? bundledBun : "bun");
const script = join(repoRoot, "scripts", "roadmap-mcp.ts");

const child = spawn(bun, [script], {
  cwd: repoRoot,
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error(err.message);
  process.exit(1);
});
