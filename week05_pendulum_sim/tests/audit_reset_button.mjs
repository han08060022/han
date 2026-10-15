/**
 * 重置按钮——审计脚本
 * 目的：以真机证据判定「点击重置报 ReferenceError」是否存在于当前代码。
 *
 * 审计项：
 *   1. 页面是否存在内联 onclick 属性（堆栈里 HTMLButtonElement.onclick 的前提）
 *   2. 全局作用域是否存在 resetAnimation 标识符
 *   3. 点击重置按钮：真实点击 + 捕捉全部异常通道
 *   4. 点击重置按钮：复位是否真正生效
 */
const BASE = "http://127.0.0.1:9223";
const URL_PAGE = "file:///D:/oo/week05_pendulum_sim/web/index.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await (await fetch(BASE + "/json/new?" + encodeURIComponent(URL_PAGE),
  { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));

let id = 0; const pending = new Map(); const events = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); }
  else if (m.method) events.push(m);
});
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id; pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __exception: r.exceptionDetails };
  return r.result?.value;
};

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await sleep(1200);

const out = [];
out.push("========== 重置按钮审计报告 ==========");
out.push("");

// --- 1. 内联 onclick 审计 ---
const inline = await ev(`
  JSON.stringify({
    inlineOnclickAttrs: document.querySelectorAll('[onclick]').length,
    resetBtnHasOnclick: !!document.getElementById('btn-reset').getAttribute('onclick'),
    resetBtnOnclickValue: document.getElementById('btn-reset').getAttribute('onclick'),
    resetBtnOuterHTML: document.getElementById('btn-reset').outerHTML.slice(0,120)
  })
`);
out.push("【审计 1】内联 onclick 属性（堆栈中 HTMLButtonElement.onclick 的前提）");
out.push("  " + inline);
out.push("");

// --- 2. 全局作用域审计 ---
const scope = await ev(`
  JSON.stringify({
    resetAnimation_typeof: typeof window.resetAnimation,
    resetAnimation_inWindow: 'resetAnimation' in window,
    resetMotion_typeof: typeof window.resetMotion,
    resetMotion_inWindow: 'resetMotion' in window,
    // 找出所有名字里带 reset 的全局符号
    resetLikeGlobals: Object.getOwnPropertyNames(window).filter(k => /reset/i.test(k))
  })
`);
out.push("【审计 2】全局作用域中的标识符");
out.push("  " + scope);
out.push("");

// --- 3. 清空事件缓冲，然后真实点击重置按钮 ---
events.length = 0;
out.push("【审计 3】真实点击 #btn-reset 并监听异常");
const clickResult = await ev(`
  (function(){
    const btn = document.getElementById('btn-reset');
    sim.paused = false;
    for (let i = 0; i < 240*2; i++) { integrate(1/240); countSwing(); }  // 先转起来
    const before = { theta:+(sim.theta*180/Math.PI).toFixed(3), swings: sim.swings };
    btn.click();                       // ← 真实点击
    sim.paused = true;                 // 冻结以观察复位后的确定状态
    const after = { theta:+(sim.theta*180/Math.PI).toFixed(6), omega: sim.omega, swings: sim.swings };
    return JSON.stringify({ before, after, resetWorked: Math.abs(after.theta-45) < 1e-6 && after.omega===0 && after.swings===0 });
  })()
`);
out.push("  " + clickResult);
await sleep(300);

// 解析异常事件
const errs = events.filter(e =>
  e.method === "Runtime.exceptionThrown" ||
  (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") ||
  (e.method === "Log.entryAdded" && e.params.entry.level === "error")
);
out.push("  点击期间捕获到的异常/错误事件数: " + errs.length);
errs.forEach(e => {
  if (e.method === "Runtime.exceptionThrown") {
    const d = e.params.exceptionDetails;
    out.push("    [exception] " + (d.exception?.description || d.text) + " @" + (d.lineNumber+1) + ":" + (d.columnNumber+1));
  } else if (e.method === "Runtime.consoleAPICalled") {
    out.push("    [console.error] " + e.params.args.map(a => a.value ?? a.description).join(" "));
  } else {
    out.push("    [log.error] " + e.params.entry.text + " @" + (e.params.entry.lineNumber+1));
  }
});
out.push("");

// --- 4. 多次点击压力测试（连点 5 次） ---
events.length = 0;
const multi = await ev(`
  (function(){
    const btn = document.getElementById('btn-reset');
    let ok = true;
    for (let k = 0; k < 5; k++) {
      for (let i = 0; i < 300; i++) { integrate(1/240); countSwing(); }
      btn.click();
      sim.paused = true;
      if (Math.abs(sim.theta*180/Math.PI - 45) > 1e-6 || sim.omega !== 0 || sim.swings !== 0) ok = false;
    }
    return JSON.stringify({ fiveClicksAllReset: ok, finalTheta:+(sim.theta*180/Math.PI).toFixed(6) });
  })()
`);
out.push("【审计 4】连续点击 5 次压力测试");
out.push("  " + multi);
const errs2 = events.filter(e =>
  e.method === "Runtime.exceptionThrown" ||
  (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") ||
  (e.method === "Log.entryAdded" && e.params.entry.level === "error")
);
out.push("  捕获到的异常/错误事件数: " + errs2.length);
out.push("");

// --- 5. 键盘 R 键路径（同样调用重置逻辑） ---
events.length = 0;
const kb = await ev(`
  (function(){
    for (let i = 0; i < 240; i++) { integrate(1/240); countSwing(); }
    window.dispatchEvent(new KeyboardEvent('keydown', { key:'r', bubbles:true }));
    sim.paused = true;
    return JSON.stringify({ theta:+(sim.theta*180/Math.PI).toFixed(6), resetViaKeyboardWorked: Math.abs(sim.theta*180/Math.PI-45)<1e-6 });
  })()
`);
out.push("【审计 5】键盘 R 键触发的重置路径");
out.push("  " + kb);
const errs3 = events.filter(e => e.method === "Runtime.exceptionThrown" ||
  (e.method === "Log.entryAdded" && e.params.entry.level === "error"));
out.push("  捕获到的异常事件数: " + errs3.length);
out.push("");

out.push("========== 审计结论 ==========");
const inlineCount = JSON.parse(inline).inlineOnclickAttrs;
const raType = JSON.parse(scope).resetAnimation_typeof;
const worked = JSON.parse(clickResult).resetWorked;
out.push("  内联 onclick 数量        : " + inlineCount + (inlineCount === 0 ? "  → 堆栈所述调用路径不存在" : ""));
out.push("  typeof window.resetAnimation: " + raType + (raType === "undefined" ? "  → 该标识符确实未定义（但从未被调用）" : ""));
out.push("  点击重置是否真正生效      : " + (worked ? "是 → 功能正常" : "否 → 功能异常"));

ws.close();
await fetch(BASE + "/json/close/" + t.id);
console.log(out.join("\n"));
