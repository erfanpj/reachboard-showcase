#!/usr/bin/env node
/** Capture static-demo evidence at Pages-like base path (loopback). */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const demoDir = path.resolve(here, "..", "static-demo");
const reviewRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rb-static-cap-"));
const mount = path.join(reviewRoot, "reachboard-showcase", "static-demo");
fs.mkdirSync(path.dirname(mount), { recursive: true });
fs.cpSync(demoDir, mount, { recursive: true });
const BASE = "http://127.0.0.1:8794/reachboard-showcase/static-demo/";
const outDir = process.argv[2] || path.join(here, "..", "docs", "evidence-ux-static");
const server = spawn("python", ["-m", "http.server", "8794", "--directory", reviewRoot], { stdio: "ignore" });

function browser() {
  for (const p of [
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return "msedge";
}

async function main() {
  await new Promise((r) => setTimeout(r, 700));
  const port = 9960 + Math.floor(Math.random() * 40);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "rb-static-cap-br-"));
  const proc = spawn(browser(), ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, "about:blank"], {
    stdio: "ignore",
  });
  try {
    await new Promise((r) => setTimeout(r, 700));
    const tabs = await new Promise((res, rej) => {
      http
        .get(`http://127.0.0.1:${port}/json/list`, (r) => {
          let d = "";
          r.on("data", (c) => (d += c));
          r.on("end", () => res(JSON.parse(d)));
        })
        .on("error", rej);
    });
    const ws = new WebSocket((tabs.find((t) => t.type === "page") || tabs[0]).webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res);
      ws.addEventListener("error", rej);
    });
    let id = 0;
    const pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
    });
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    await send("Page.enable");
    const shot = async (name, mobile, after) => {
      await send("Emulation.setDeviceMetricsOverride", {
        width: mobile ? 390 : 1280,
        height: mobile ? 844 : 720,
        deviceScaleFactor: 1,
        mobile,
      });
      await send("Page.navigate", { url: BASE });
      await new Promise((r) => setTimeout(r, 900));
      if (after) {
        await send("Runtime.evaluate", { expression: after, awaitPromise: true });
        await new Promise((r) => setTimeout(r, 400));
      }
      const data = (await send("Page.captureScreenshot", { format: "png", fromSurface: true })).data;
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, name), Buffer.from(data, "base64"));
    };
    await shot("static-catalog-desktop-1280.png", false);
    await shot("static-catalog-mobile-390.png", true);
    await shot(
      "static-draft-75-desktop.png",
      false,
      `(() => {
        document.querySelector('[data-add="echo-weekly"]').click();
        document.querySelector('[data-add="northline-sound"]').click();
        document.getElementById('toDraft').click();
      })()`,
    );
    ws.close();
    console.log("CAPTURE_OK " + outDir);
  } finally {
    proc.kill();
    server.kill();
    try {
      fs.rmSync(reviewRoot, { recursive: true, force: true });
      fs.rmSync(userData, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
