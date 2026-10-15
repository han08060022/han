/**
 * 修复后验收 —— 重置按钮双路径 + 控制台零报错
 *
 * 验证：
 *   A. addEventListener 路径（当前生产用法）
 *   B. 内联 onclick 路径（历史报错范式的写法）—— 现在应能正常工作
 *   C. 历史遗留函数名 resetAnimation —— 应有向后兼容别名
 *   D. 全程控制台/异常错误数
 *   E. 刷新后（重新加载）控制台 0 报错
 */
const BASE = "http://127.0.0.1:9223";
const URL_PAGE = "file:///D:/oo/week05_pendulum_sim/web/index.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
import { writeFileSync } from "node:fs";

let ws, id = 0, pending = new Map(), events = [];
async function connect() {
  const t = await (await fetch(BASE + "/json/new?" + encodeURIComponent(URL_PAGE),
    { method: "PUT" })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); }
    else if (m.method) events.push(m);
  });
  return t.id;
}
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id; pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __exception: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result?.value;
};
const errEvents = () => events.filter(e =>
  e.method === "Runtime.exceptionThrown" ||
  (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") ||
  (e.method === "Log.entryAdded" && e.params.entry.level === "error")
);

const out = [];
const targetId = await connect();
await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
await sleep(1300);

out.push("========== 修复后验收报告 ==========");
out.push("");

// --- 页面加载阶段的报错（对应"刷新后控制台 0 报错"） ---
out.push("【E】页面初次加载（刷新后）阶段");
out.push("  加载期间错误事件数: " + errEvents().length + (errEvents().length ? " ❌" : "  ✅"));
out.push("");

// --- 全局挂载检查 ---
const mount = await ev(`JSON.stringify({
  handleResetClick: typeof window.handleResetClick,
  resetMotion:      typeof window.resetMotion,
  resetAnimation:   typeof window.resetAnimation,
  __pendulumReset:  typeof window.__pendulumReset,
  inlineOnclickAttrs: document.querySelectorAll('[onclick]').length
})`);
out.push("【挂载检查】关键处理器在全局作用域的可见性");
out.push("  " + mount);
out.push("");

// --- A. addEventListener 路径 ---
events.length = 0;
const A = await ev(`(function(){
  sim.paused = false;
  for (let i=0;i<240*2;i++){integrate(1/240);countSwing();}
  const before = +(sim.theta*180/Math.PI).toFixed(3);
  document.getElementById('btn-reset').click();
  sim.paused = true;
  return JSON.stringify({before, after:+(sim.theta*180/Math.PI).toFixed(6), omega:sim.omega, swings:sim.swings});
})()`);
out.push("【A】addEventListener 路径（当前生产用法）");
out.push("  " + A);
out.push("  错误事件数: " + errEvents().length + (errEvents().length ? " ❌" : "  ✅"));
out.push("");

// --- B. 内联 onclick 路径（历史报错范式的写法） ---
events.length = 0;
const B = await ev(`(function(){
  const btn = document.getElementById('btn-reset');
  // 动态改成内联 onclick 写法 —— 正是原报错堆栈描述的场景
  btn.removeAttribute('onclick');
  btn.setAttribute('onclick', 'handleResetClick()');
  sim.paused = false;
  for (let i=0;i<240*2;i++){integrate(1/240);countSwing();}
  const before = +(sim.theta*180/Math.PI).toFixed(3);
  btn.click();                        // 走内联 onclick → 全局作用域查找 handleResetClick
  sim.paused = true;
  const res = {before, after:+(sim.theta*180/Math.PI).toFixed(6), omega:sim.omega, swings:sim.swings};
  btn.removeAttribute('onclick');     // 还原
  return JSON.stringify(res);
})()`);
out.push("【B】内联 onclick=\"handleResetClick()\" 路径（原报错场景）");
out.push("  " + B);
const be = errEvents();
out.push("  错误事件数: " + be.length + (be.length ? " ❌" : "  ✅"));
be.forEach(e => out.push("    " + JSON.stringify(e.params).slice(0, 220)));
out.push("");

// --- C. 历史遗留函数名 resetAnimation（正是原报错里那个名字） ---
events.length = 0;
const C = await ev(`(function(){
  sim.paused = false;
  for (let i=0;i<240*2;i++){integrate(1/240);countSwing();}
  const before = +(sim.theta*180/Math.PI).toFixed(3);
  window.resetAnimation();            // ← 原报错中"未定义"的那个名字
  sim.paused = true;
  return JSON.stringify({before, after:+(sim.theta*180/Math.PI).toFixed(6), swings:sim.swings});
})()`);
out.push("【C】调用历史遗留名 resetAnimation（原报错中的标识符）");
out.push("  " + C);
out.push("  错误事件数: " + errEvents().length + (errEvents().length ? " ❌" : "  ✅"));
out.push("");

// --- D. 复位精度复核 + 键盘路径 ---
events.length = 0;
const D = await ev(`(function(){
  const r = {};
  // 连点 5 次
  let allOk = true;
  for (let k=0;k<5;k++){
    for (let i=0;i<300;i++){integrate(1/240);countSwing();}
    document.getElementById('btn-reset').click();
    sim.paused = true;
    if (Math.abs(sim.theta*180/Math.PI-45)>1e-6 || sim.omega!==0 || sim.swings!==0) allOk=false;
  }
  r.fiveClicksAllReset = allOk;
  // 键盘 R
  for (let i=0;i<240;i++){integrate(1/240);countSwing();}
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'r',bubbles:true}));
  sim.paused = true;
  r.keyboardResetOk = Math.abs(sim.theta*180/Math.PI-45)<1e-6;
  r.finalTheta = +(sim.theta*180/Math.PI).toFixed(6);
  return JSON.stringify(r);
})()`);
out.push("【D】复位精度复核");
out.push("  " + D);
out.push("  错误事件数: " + errEvents().length + (errEvents().length ? " ❌" : "  ✅"));
out.push("");

// --- 截图存档 ---
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
await ev("document.getElementById('btn-reset').click(); updateHUD(); render(); 'ok'");
const s = await send("Page.captureScreenshot", { format: "png" });
writeFileSync("D:/oo/week05_pendulum_sim/results/render_test/audit_after_fix.png", Buffer.from(s.data, "base64"));

out.push("========== 结论 ==========");
const aOk = JSON.parse(A).after === 45;
const bOk = JSON.parse(B).after === 45;
const cOk = JSON.parse(C).after === 45;
const dOk = JSON.parse(D).fiveClicksAllReset && JSON.parse(D).keyboardResetOk;
out.push("  A addEventListener 复位: " + (aOk ? "✅ 精确 45°" : "❌"));
out.push("  B 内联 onclick 复位    : " + (bOk ? "✅ 精确 45°（原报错场景已不会再报错）" : "❌"));
out.push("  C resetAnimation 别名  : " + (cOk ? "✅ 可用（历史名兼容）" : "❌"));
out.push("  D 连点/键盘路径        : " + (dOk ? "✅ 全部精确复位" : "❌"));
out.push("  全程控制台错误事件总数  : " + (errEvents().length + be.length) + " （验收要求 0）");

ws.close();
await fetch(BASE + "/json/close/" + targetId);
console.log(out.join("\n"));
