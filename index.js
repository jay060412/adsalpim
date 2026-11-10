/* eslint-disable @typescript-eslint/no-require-imports -- The hosting panel runs this entry as CommonJS. */
const { spawn } = require("node:child_process");

// Use the standard Next.js CLI, including when the panel wraps index.js in ts-node.
// No custom Next.js server or global npm executable is required.
const [major, minor, patch] = process.versions.node.split(".").map(Number);
if (major < 21 || (major === 21 && (minor < 7 || (minor === 7 && patch < 3)))) {
  console.error(`[adsalpim] Node.js 21.7.3 or newer is required. Current: ${process.version}`);
  process.exit(1);
}

const port = process.env.PORT || process.env.SERVER_PORT || "25860";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error("[adsalpim] PORT or SERVER_PORT must be a number between 1 and 65535.");
  process.exit(1);
}

let nextCli;
try {
  nextCli = require.resolve("next/dist/bin/next");
} catch {
  console.error("[adsalpim] Dependencies are missing. Run npm ci --include=dev first.");
  process.exit(1);
}

let child = null;
let stopping = false;
let stopCode = 0;
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.on(signal, () => {
    stopping = true;
    stopCode = code;
    if (child) child.kill(signal);
    else process.exit(code);
  });
}

function runNext(args) {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [nextCli, ...args], {
      cwd: __dirname,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production", PORT: port },
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("close", (code) => {
      child = null;
      resolve(stopping ? stopCode : (code ?? 1));
    });
  });
}

async function main() {
  console.log(`[adsalpim] ${process.version}; building for port ${port}...`);
  // Rebuild on startup so an uploaded source update never serves a stale build.
  const buildCode = await runNext(["build"]);
  if (buildCode !== 0 || stopping) {
    console.error("[adsalpim] Build did not finish successfully; server was not started.");
    process.exitCode = stopping ? stopCode : buildCode;
    return;
  }
  const captureRuntime = require("./scripts/capture-runtime.cjs");
  try {
    await captureRuntime.checkCaptureRuntime();
  } catch (error) {
    console.error(`[adsalpim] Capture unavailable: ${captureRuntime.captureFailureCode(error)}. Image highlighting will be unavailable; check disk space and capture runtime.`);
  }
  if (stopping) { process.exitCode = stopCode; return; }
  console.log(`[adsalpim] Starting HTTP server on 0.0.0.0:${port}`);
  process.exitCode = await runNext(["start", "--hostname", "0.0.0.0", "--port", port]);
}

main().catch((error) => {
  console.error("[adsalpim] Startup failed:", error.code || error.name);
  process.exitCode = 1;
});
