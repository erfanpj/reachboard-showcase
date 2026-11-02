#!/usr/bin/env node
/** Capture showcase evidence at 127.0.0.1:8788 — loopback only. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ORIGIN = "http://127.0.0.1:8788";
const PASS = process.env.SHOWCASE_DEMO_PASSWORD || "reachboard-showcase-demo";
const outDir = process.argv[2] || "docs/evidence";
const port = 9800 + Math.floor(Math.random() * 200);
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "rb-showcase-"));

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
  const proc = spawn(
    browser(),
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userData}`,
      "--window-size=1280,720",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  try {
    await new Promise((r) => setTimeout(r, 800));
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
    const evalOk = async (expression) => {
      const res = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
      return res.result.value;
    };
    const shot = async (name) => {
      await send("Emulation.setDeviceMetricsOverride", {
        width: name.includes("mobile") ? 390 : 1280,
        height: name.includes("mobile") ? 844 : 720,
        deviceScaleFactor: 1,
        mobile: name.includes("mobile"),
      });
      const data = (
        await send("Page.captureScreenshot", { format: "png", fromSurface: true })
      ).data;
      const p = path.join(outDir, name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, Buffer.from(data, "base64"));
    };
    const go = async (url) => {
      await send("Page.navigate", { url: ORIGIN + url });
      await new Promise((r) => setTimeout(r, 900));
      const origin = await evalOk("location.origin");
      if (origin !== ORIGIN) throw new Error("off-target " + origin);
    };
    await go("/en/catalog/");
    await shot("catalog-desktop-en.png");
    await go("/fa/catalog/");
    await shot("catalog-mobile-fa.png");
    await go("/demo/login/");
    await evalOk(`(() => {
      document.querySelector('input[name=username]').value='demo_advertiser';
      document.querySelector('input[name=password]').value=${JSON.stringify(PASS)};
      document.querySelector('form').requestSubmit();
    })()`);
    await new Promise((r) => setTimeout(r, 1500));
    const loggedIn = await evalOk(
      '!!document.querySelector(\'form[action="/demo/reset/"]\')',
    );
    if (!loggedIn) throw new Error("login failed");
    await go("/en/catalog/?q=Echo");
    await evalOk(`(() => {
      document.querySelector('[data-testid=add-echo-weekly]').closest('form').requestSubmit();
    })()`);
    await new Promise((r) => setTimeout(r, 700));
    await go("/en/catalog/?q=Northline");
    await evalOk(`(() => {
      document.querySelector('[data-testid=add-northline-sound]').closest('form').requestSubmit();
    })()`);
    await new Promise((r) => setTimeout(r, 700));
    await go("/en/catalog/");
    await evalOk(`(() => {
      const total=document.querySelector('[data-testid=cart-total-header]');
      if(!total||!total.textContent.includes('75')) throw new Error('cart total not 75: '+(total&&total.textContent));
    })()`);
    await evalOk(`(() => {
      const btn=document.querySelector('[data-testid=journey-review-cart]');
      if(!btn) throw new Error('checkout form missing');
      btn.closest('form').requestSubmit();
    })()`);
    await new Promise((r) => setTimeout(r, 900));
    await evalOk(`(() => {
      const chip=document.querySelector('[data-testid=campaign-status-chip]');
      if(!chip||chip.getAttribute('data-campaign-status')!=='draft') throw new Error('not draft');
    })()`);
    await shot("campaign-detail-draft-en.png");
    await evalOk(`(() => {
      document.querySelector('[data-testid=campaign-submit-for-payment]').closest('form').requestSubmit();
    })()`);
    await new Promise((r) => setTimeout(r, 900));
    await evalOk(`(() => {
      const chip=document.querySelector('[data-testid=campaign-status-chip]');
      if(!chip||chip.getAttribute('data-campaign-status')!=='awaiting_payment') throw new Error('not awaiting');
      const scopes=[...document.querySelectorAll('[data-history-scope]')].map(el=>el.getAttribute('data-history-scope'));
      if(!scopes.includes('campaign')||!scopes.includes('item')) throw new Error('history scopes');
    })()`);
    await shot("campaign-detail-awaiting-payment-en.png");
    ws.close();
    console.log("CAPTURE_OK " + outDir);
  } finally {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(userData, { recursive: true, force: true });
    } catch {
      /* Windows may still hold the profile lock briefly */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
