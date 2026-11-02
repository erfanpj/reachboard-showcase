#!/usr/bin/env node
/** Static demo regression: submit keeps reset/status visible; full journey at /reachboard-showcase/ base. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const demoDir = path.resolve(here, "..", "static-demo");
const reviewRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rb-static-demo-"));
const mount = path.join(reviewRoot, "reachboard-showcase", "static-demo");
fs.mkdirSync(path.dirname(mount), { recursive: true });
fs.cpSync(demoDir, mount, { recursive: true });

const BASE = "http://127.0.0.1:8793/reachboard-showcase/static-demo/";
const server = spawn("python", ["-m", "http.server", "8793", "--bind", "127.0.0.1", "--directory", reviewRoot], {
  stdio: "ignore",
});

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
  const port = 9950 + Math.floor(Math.random() * 40);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "rb-static-verify-"));
  const proc = spawn(
    browser(),
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userData}`,
      "--disable-extensions",
      "--no-first-run",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
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
    const pageTab =
      tabs.find((t) => t.type === "page" && !String(t.url).startsWith("chrome-extension:")) ||
      tabs[0];
    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
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
        pending.set(mid, (msg) =>
          msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result),
        );
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const evalOk = async (expression) => {
      const res = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
      return res.result.value;
    };
    await send("Page.navigate", { url: BASE });
    await new Promise((r) => setTimeout(r, 900));

    const firstAddY = await evalOk(`(() => {
      const b = document.querySelector('[data-add="echo-weekly"]');
      if (!b) return -1;
      return Math.round(b.getBoundingClientRect().top);
    })()`);
    if (firstAddY < 0 || firstAddY > 680) {
      throw new Error("first Add control not visible in 720px viewport (y=" + firstAddY + ")");
    }
    const cartY = await evalOk(`(() => {
      const el = document.getElementById('cartTotal');
      return el ? Math.round(el.getBoundingClientRect().top) : -1;
    })()`);
    if (cartY < 0 || cartY > 680) {
      throw new Error("cart summary not visible in 720px viewport (y=" + cartY + ")");
    }

    await evalOk(`(() => {
      document.getElementById('filter').value='Echo';
      document.getElementById('filter').dispatchEvent(new Event('input'));
    })()`);
    await evalOk(`(() => {
      document.querySelector('[data-add="echo-weekly"]').click();
    })()`);
    const afterEcho = await evalOk(`(() => ({
      status: document.getElementById('status').textContent,
      cartTotal: document.getElementById('cartTotal').textContent,
    }))()`);
    if (String(afterEcho.status).includes("empty cart")) {
      throw new Error("pre-draft status must not say empty cart: " + JSON.stringify(afterEcho));
    }
    if (!String(afterEcho.cartTotal).includes("35")) {
      throw new Error("echo cart total missing: " + JSON.stringify(afterEcho));
    }
    await evalOk(`(() => {
      document.getElementById('filter').value='Podcast';
      document.getElementById('filter').dispatchEvent(new Event('input'));
    })()`);
    await evalOk(`(() => {
      document.querySelector('[data-add="northline-sound"]').click();
    })()`);
    await evalOk(`(() => { document.getElementById('toDraft').click(); })()`);
    await evalOk(`(() => { document.getElementById('submit').click(); })()`);

    const afterSubmit = await evalOk(`(() => ({
      snapshot: document.getElementById('snapshotTotal').textContent,
      status: document.getElementById('status').textContent,
      resetHidden: document.getElementById('reset').hidden,
      resetDisabled: document.getElementById('reset').disabled,
      panelHidden: document.getElementById('simulationPanel').hidden,
    }))()`);
    if (!String(afterSubmit.snapshot).includes("75")) {
      throw new Error("snapshot not 75: " + JSON.stringify(afterSubmit));
    }
    if (!String(afterSubmit.status).includes("awaiting payment")) {
      throw new Error("status not awaiting: " + JSON.stringify(afterSubmit));
    }
    if (afterSubmit.resetHidden || afterSubmit.resetDisabled || afterSubmit.panelHidden) {
      throw new Error("reset/status not reachable: " + JSON.stringify(afterSubmit));
    }

    await evalOk(`(() => { document.getElementById('reset').click(); })()`);
    await evalOk(`(() => {
      document.getElementById('filter').value='';
      document.getElementById('filter').dispatchEvent(new Event('input'));
    })()`);
    const afterReset = await evalOk(`(() => {
      return {
        snapshotHidden: document.getElementById('campaignSnapshot').hidden,
        status: document.getElementById('status').textContent,
        cart: document.getElementById('cartTotal').textContent,
        addEnabled: !!document.querySelector('[data-add]:not([disabled])'),
      };
    })()`);
    if (!afterReset.snapshotHidden) throw new Error("snapshot still visible");
    if (!String(afterReset.status).includes("empty cart")) throw new Error("not empty");
    if (!String(afterReset.cart).includes("0")) throw new Error("cart not zero");
    if (!afterReset.addEnabled) throw new Error("shopping still locked: " + JSON.stringify(afterReset));

    async function assertNoCartOverlap(width, height, mobile) {
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: !!mobile,
      });
      await send("Page.navigate", { url: BASE });
      await new Promise((r) => setTimeout(r, 900));
      await evalOk(`(() => {
        document.getElementById('filter').value='';
        document.getElementById('filter').dispatchEvent(new Event('input'));
        document.querySelector('[data-add="echo-weekly"]').click();
        document.querySelector('[data-add="northline-sound"]').click();
      })()`);
      const overlap = await evalOk(`(() => {
        const btn = document.querySelector('[data-add="northline-sound"]');
        const cart = document.getElementById('cart');
        if (!btn || !cart) return true;
        const br = btn.getBoundingClientRect();
        const cr = cart.getBoundingClientRect();
        const hit = br.bottom > cr.top && br.top < cr.bottom && br.right > cr.left && br.left < cr.right;
        return hit;
      })()`);
      if (overlap) throw new Error(`cart overlaps add control at ${width}x${height}`);
      const focusOk = await evalOk(`(() => {
        const a = document.activeElement;
        return a && a.matches && a.matches('[data-add]');
      })()`);
      if (!focusOk) throw new Error(`focus not on add control after click at ${width}x${height}`);
    }

    for (const [w, h, m] of [
      [320, 640, true],
      [375, 667, true],
      [768, 900, false],
      [1280, 720, false],
    ]) {
      await assertNoCartOverlap(w, h, m);
    }

    ws.close();
    console.log("STATIC_DEMO_OK");
  } finally {
    proc.kill();
    try {
      fs.rmSync(userData, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    server.kill();
    try {
      fs.rmSync(reviewRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
