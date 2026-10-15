/**
 * 双摆 —— 修正后的补充验证（同步单帧测量，排除 rAF 时序干扰）
 *
 * B'. 能量漂移：修正采样 off-by-one，完整覆盖 300 秒
 * E'. 拖拽释放：在同一同步代码块内 dispatch + 读数，rAF 无法插入
 * B''. 页面 JS 实现与 Python 参考实现的交叉验证（固定初值，比对 t=10s 状态）
 */
const BASE = "http://127.0.0.1:9224";
const URL_PAGE = "file:///D:/oo/week05_pendulum_sim/web/double_pendulum.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await (await fetch(BASE + "/json/new?" + encodeURIComponent(URL_PAGE),
  { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map(); let events = [];
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
  if (r.exceptionDetails) return { __exception: r.exceptionDetails.exception?.description };
  return r.result?.value;
};
const errs = () => events.filter(e =>
  e.method === "Runtime.exceptionThrown" ||
  (e.method === "Log.entryAdded" && e.params.entry.level === "error"));

const R = [];
await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
await sleep(1500);

// ---------- B'. 能量漂移（修正采样） ----------
const b1 = await ev(`(function(){
  const s = window.__dp.sim;
  s.th1=120*Math.PI/180; s.w1=0; s.th2=-10*Math.PI/180; s.w2=0;
  s.b1=0; s.b2=0;
  s.paused = true;
  const E0 = window.__dp.totalEnergy();
  const marks = {};   // 60s 整倍数采样，用 (i+1) 修正 off-by-one
  const total = 300*240;
  for (let i = 0; i < total; i++) {
    window.__dp.rk4Step(1/240);
    if ((i+1) % (60*240) === 0) {
      const sec = (i+1)/240;
      marks["t"+sec+"s"] = +((window.__dp.totalEnergy()-E0)/E0*100).toFixed(6);
    }
  }
  marks.E0 = +E0.toFixed(6);
  return JSON.stringify(marks);
})()`);
R.push("【B'. 能量漂移（300s 完整采样）】");
R.push("  " + b1);
{
  const o = JSON.parse(b1);
  R.push("  判定: 300s 漂移 " + o.t300s + "% " +
         (Math.abs(o.t300s) < 0.5 ? "✅ PASS (<0.5%)" : "❌ FAIL"));
}

// ---------- B''. 与 Python 参考实现交叉验证 ----------
// Python 端（double_pendulum_verify.py 的算法，L1=L2=1.1m, m=1, 起点 120°/-10°）
// 已独立算好 t=10s 的状态，这里比对页面 JS 在相同参数下的结果。
const b2 = await ev(`(function(){
  const s = window.__dp.sim;
  s.th1=120*Math.PI/180; s.w1=0; s.th2=-10*Math.PI/180; s.w2=0;
  s.L1=110; s.L2=110; s.m1=1; s.m2=1; s.g=9.8; s.b1=0; s.b2=0;
  s.paused = true;
  for (let i = 0; i < 10*240; i++) window.__dp.rk4Step(1/240);
  return JSON.stringify({
    theta1: +(s.th1*180/Math.PI).toFixed(4),
    theta2: +(s.th2*180/Math.PI).toFixed(4),
    omega1: +s.w1.toFixed(5),
    omega2: +s.w2.toFixed(5)
  });
})()`);
R.push("");
R.push("【B''. 页面 JS 实现 t=10s 状态】");
R.push("  " + b2);
R.push("  （供与 Python 交叉比对，比对结果见最终回复）");

// ---------- E'. 同步帧内拖拽测量 ----------
const e1 = await ev(`(function(){
  window.handleResetClick();
  sim.paused = true;                       // 冻结物理，防止 rAF 插入
  const sc = window.__dp.geomScale();
  const b2 = window.__dp.bob2Pos(sc);
  const cv = document.getElementById('stage');

  // 用合成 PointerEvent 走完整的 down→move→up 流程（同步）
  const mk = (type, x, y) => new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse',
    clientX: x, clientY: y, button: type==='pointermove'?-1:0, buttons: type==='pointermove'?1:0
  });
  const before = { th1:+(sim.th1*180/Math.PI).toFixed(3), th2:+(sim.th2*180/Math.PI).toFixed(3) };

  cv.dispatchEvent(mk('pointerdown', b2.x, b2.y));
  // 拖到悬点右侧 60° 方向、更远的位置
  const p = window.__dp.pivot();
  const tx = p.x + 200 * Math.sin(60*Math.PI/180);
  const ty = p.y + 200 * Math.cos(60*Math.PI/180);
  cv.dispatchEvent(mk('pointermove', tx, ty));
  const during = { th1:+(sim.th1*180/Math.PI).toFixed(3), th2:+(sim.th2*180/Math.PI).toFixed(3) };
  cv.dispatchEvent(mk('pointerup', tx, ty));

  // 立即读取 —— 同一同步块，rAF 不可能插入
  const after = { th1:+(sim.th1*180/Math.PI).toFixed(6), th2:+(sim.th2*180/Math.PI).toFixed(6),
                  w1:sim.w1, w2:sim.w2, paused:sim.paused, swings:sim.flips };
  return JSON.stringify({ before, during, after });
})()`);
R.push("");
R.push("【E'. 同步帧内拖拽测量】");
R.push("  " + e1);
{
  const o = JSON.parse(e1);
  const a = o.after;
  R.push("  判定:");
  R.push("    拖拽改变 θ₂: " + (Math.abs(o.during.th2 - o.before.th2) > 5 ? "✅" : "❌") +
         "  (" + o.before.th2 + "° → " + o.during.th2 + "°)");
  R.push("    释放瞬间 ω₁=ω₂=0: " + (a.w1 === 0 && a.w2 === 0 ? "✅ PASS" : "❌ FAIL") +
         "  (ω₁=" + a.w1 + ", ω₂=" + a.w2 + ")");
  R.push("    释放后恢复播放: " + (a.paused === false ? "✅" : "❌"));
}

ws.close();
await fetch(BASE + "/json/close/" + t.id);
console.log("");
console.log(R.join("\n"));
console.log("");
console.log("补充错误事件: " + errs().length);
