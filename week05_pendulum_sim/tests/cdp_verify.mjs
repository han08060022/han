/**
 * CDP 验证脚本 —— 直连 Edge 内核，做三件事：
 *   1) 打开真实 index.html，运行 2 秒，收集控制台报错（验收"控制台 0 报错"）
 *   2) 读取 _verify.html 里写入 DOM 的断言结果
 *   3) 用 CDP 精确截图（推进物理后），验证阻尼视觉效果
 *
 * 用法：node cdp_verify.mjs <edge路径> <端口>
 */
import { writeFileSync } from "node:fs";

const EDGE = process.argv[2];
const PORT = Number(process.argv[3] || 9222);
const BASE = "http://127.0.0.1:" + PORT;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listTargets() {
  const r = await fetch(BASE + "/json/list");
  return r.json();
}

async function newTarget(url) {
  const r = await fetch(BASE + "/json/new?" + encodeURIComponent(url), { method: "PUT" });
  return r.json();
}

async function closeTarget(id) {
  try { await fetch(BASE + "/json/close/" + id); } catch {}
}

/** 极简 CDP 客户端：一条连接、自增 id、Promise 化调用 + 事件回调 */
class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener("open", () => res());
      this.ws.addEventListener("error", (e) => rej(new Error("WS error")));
    });
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        const hs = this.handlers.get(msg.method) || [];
        hs.forEach((h) => h(msg.params));
      }
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (r.exceptionDetails) throw new Error("页面执行异常: " + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function openPage(url) {
  const t = await newTarget(url);
  const cdp = new CDP(t.webSocketDebuggerUrl);
  await cdp.ready;
  const errors = [];
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Page.enable");
  cdp.on("Runtime.exceptionThrown", (p) => {
    const d = p.exceptionDetails;
    errors.push("[exception] " + (d.exception?.description || d.text) +
                " @" + (d.lineNumber + 1) + ":" + (d.columnNumber + 1));
  });
  cdp.on("Runtime.consoleAPICalled", (p) => {
    if (p.type === "error") {
      errors.push("[console.error] " + p.args.map((a) => a.value ?? a.description).join(" "));
    }
  });
  cdp.on("Log.entryAdded", (p) => {
    if (p.entry.level === "error") errors.push("[log] " + p.entry.text);
  });
  return { cdp, errors, targetId: t.id };
}

async function shot(cdp, path) {
  const r = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path, Buffer.from(r.data, "base64"));
}

/* ============ 主流程 ============ */
const OUT = "D:/oo/week05_pendulum_sim/results/render_test";
const report = [];

// --- A. 真实 index.html：跑 2.5 秒，收集报错 + 截图 ---
{
  const { cdp, errors, targetId } = await openPage(
    "file:///D:/oo/week05_pendulum_sim/web/index.html"
  );
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 820, deviceScaleFactor: 1, mobile: false
  });
  await sleep(2500);                       // 让 rAF 真实跑一段
  const live = await cdp.eval(
    "JSON.stringify({L:sim.Lpx,g:sim.g,damp:sim.dampRead,theta:+(sim.theta*180/Math.PI).toFixed(2),swings:sim.swings,mode:document.getElementById('o-mode').textContent})"
  );
  await shot(cdp, OUT + "/cdp_live_2s.png");
  report.push("=== A. index.html 真实运行 2.5s ===");
  report.push("运行时状态: " + live);
  report.push("控制台报错: " + (errors.length ? errors.join(" ;; ") : "0 （无任何报错）"));
  cdp.close();
  await closeTarget(targetId);
}

// --- B. 强阻尼视觉验证：推进 12s 后截图 ---
{
  const { cdp, errors, targetId } = await openPage(
    "file:///D:/oo/week05_pendulum_sim/web/_verify.html"
  );
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 820, deviceScaleFactor: 1, mobile: false
  });
  await sleep(1200);

  // 读取断言结果
  const raw = await cdp.eval("document.getElementById('testout').textContent");
  report.push("");
  report.push("=== B. 断言测试结果 ===");
  if (raw && raw.includes("@@BEGIN@@")) {
    const body = raw.split("@@BEGIN@@")[1].split("@@END@@")[0].trim();
    report.push(body);
  } else {
    report.push("(未取到断言输出) raw=" + JSON.stringify(raw));
  }
  report.push("");
  report.push("_verify.html 控制台报错: " + (errors.length ? errors.join(" ;; ") : "0 （无任何报错）"));

  // 在同一页面上做强阻尼视觉截图
  await cdp.eval(`
    (function(){
      const d=document.getElementById('in-damp'); d.value='0.010'; d.dispatchEvent(new Event('input'));
      const a=document.getElementById('in-ang'); a.value=45; a.dispatchEvent(new Event('input')); a.dispatchEvent(new Event('change'));
      sim.paused=true;
      for(let i=0;i<12*240;i++){integrate(1/240);countSwing();}
      updateHUD(); render();
      return 'ok';
    })()
  `);
  await shot(cdp, OUT + "/cdp_damp_12s.png");
  const st = await cdp.eval(
    "JSON.stringify({theta:+(sim.theta*180/Math.PI).toFixed(2),swings:sim.swings,mode:document.getElementById('o-mode').textContent})"
  );
  report.push("强阻尼推进 12s 后: " + st);

  // 复位后截图
  await cdp.eval("document.getElementById('btn-reset').click(); updateHUD(); render(); 'ok'");
  await shot(cdp, OUT + "/cdp_after_reset.png");
  const st2 = await cdp.eval(
    "JSON.stringify({theta:+(sim.theta*180/Math.PI).toFixed(6),omega:sim.omega,swings:sim.swings,paused:sim.paused})"
  );
  report.push("点击重置后: " + st2);

  cdp.close();
  await closeTarget(targetId);
}

console.log(report.join("\n"));
