/* eslint-disable @typescript-eslint/no-require-imports -- Also used directly by the Node.js hosting launcher. */
const fs = require("node:fs");
const { copyFile, mkdir, writeFile } = require("node:fs/promises");
const { join, dirname, resolve } = require("node:path");
const { createRequire } = require("node:module");

const projectRoot = resolve(__dirname, "..");
const requireProject = createRequire(join(projectRoot, "package.json"));

function captureFailureCode(error) {
  const message = error instanceof Error ? error.message : "";
  if (error?.code === "ENOSPC" || /ENOSPC|No space left on device/i.test(message)) return "CAPTURE_STORAGE";
  if (/GLIBC_|shared librar|lib[^ ]+\.so.*not found/i.test(message)) return "CAPTURE_LIBRARIES";
  if (error?.code === "EACCES" || /EACCES|Permission denied/i.test(message)) return "CAPTURE_PERMISSION";
  if (/CAPTURE_BROWSER_UNAVAILABLE|ENOENT/.test(message)) return "CAPTURE_BROWSER_MISSING";
  if (/timeout|timed out/i.test(message)) return "CAPTURE_TIMEOUT";
  return "CAPTURE_UNAVAILABLE";
}

function xml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

async function prepareCaptureLaunch() {
  let executablePath = process.env.CAPTURE_CHROME_PATH;
  let args = [];
  if (process.platform === "linux") {
    // Pterodactyl mounts /tmp as a small tmpfs (100 MiB by default). Chromium
    // expands beyond that limit. Keep the runtime on the application's disk.
    const runtimeDir = resolve(process.env.ADSALPIM_CAPTURE_DIR || join(projectRoot, ".adsalpim-runtime"));
    const captureTempDir = join(runtimeDir, "tmp");
    await mkdir(captureTempDir, { recursive: true, mode: 0o700 });
    process.env.TMPDIR = captureTempDir;
    if (!executablePath) {
      const chromium = requireProject("@sparticuz/chromium");
      executablePath = await chromium.executablePath();
      const packageEntry = requireProject.resolve("@sparticuz/chromium");
      const { inflate } = requireProject(join(dirname(packageEntry), "lambdafs.cjs"));
      await inflate(join(dirname(packageEntry), "../../bin/al2023.tar.br"));
      await copyFile(requireProject.resolve("pretendard/dist/public/static/Pretendard-Regular.otf"), join(captureTempDir, "fonts/Pretendard-Regular.otf"));
      // The vendor fonts.conf contains absolute /tmp paths. Point fontconfig
      // at the relocated fonts as well, including Korean fallback glyphs.
      const fontConfig = join(captureTempDir, "fonts/adsalpim-fonts.conf");
      await writeFile(fontConfig, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><dir>${xml(join(captureTempDir, "fonts"))}</dir><cachedir>${xml(join(captureTempDir, "font-cache"))}</cachedir></fontconfig>`);
      process.env.FONTCONFIG_FILE = fontConfig;
      process.env.FONTCONFIG_PATH = join(captureTempDir, "fonts");
      args = chromium.args.filter((arg) => !["--disable-web-security", "--allow-running-insecure-content", "--disable-site-isolation-trials"].includes(arg));
    }
  }
  if (!executablePath && process.platform === "win32") {
    executablePath = [
      join(process.env.PROGRAMFILES || "C:/Program Files", "Google/Chrome/Application/chrome.exe"),
      join(process.env["PROGRAMFILES(X86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
    ].find(fs.existsSync);
  }
  if (!executablePath) throw new Error("CAPTURE_BROWSER_UNAVAILABLE");
  const env = { ...process.env };
  delete env.GEMINI_API_KEY;
  if (process.platform === "linux" && !process.env.CAPTURE_CHROME_PATH) {
    env.LD_LIBRARY_PATH = [join(env.TMPDIR, "al2023/lib"), env.TMPDIR, env.LD_LIBRARY_PATH].filter(Boolean).join(":");
  }
  return { executablePath, headless: true, env, args: [...args, "--disable-background-networking", "--disable-dev-shm-usage"], timeout: 15_000 };
}

async function checkCaptureRuntime() {
  const { chromium } = requireProject("playwright-core");
  const browser = await chromium.launch(await prepareCaptureLaunch());
  try {
    const page = await browser.newPage();
    await page.setContent("<p>광고살핌 화면 캡처 준비 확인</p>");
    await page.screenshot({ type: "jpeg" });
    console.log(`[adsalpim] Capture ready: Chromium ${browser.version()}`);
  } finally {
    await browser.close();
  }
}

module.exports = { prepareCaptureLaunch, checkCaptureRuntime, captureFailureCode };
if (require.main === module) {
  checkCaptureRuntime().catch((error) => {
    console.error(`[adsalpim] Capture unavailable: ${captureFailureCode(error)}`);
    process.exitCode = 1;
  });
}
