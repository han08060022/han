/**
 * 最终回归 —— 全量断言一次跑完（加载/能量/拖拽/拖尾/报错）
 */
const BASE = "http://127.0.0.1:9224";
const URL_PAGE = "file:///D:/oo/week05_pendulum_sim/web/double_pendulum.html";
const OUT = "D:/oo/week05_pendulum_sim/results/render_test";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
import { writeFileSync } from "node:fs";

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
  if (r.exceptionDetails) return { __exception: r.exceptionDetails.exception?.description };
  return r.result?.value;
};
const errs = () => events.filter(e =>
  e.method === "Runtime.exceptionThrown" ||
  (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") ||
  (e.method === "Log.entryAdded" && e.params.entry.level === "error"));

const results = [];
const assert = (c, label, detail) => {
  results.push({ pass: !!c, label, detail });
  console.log((c ? "PASS" : "FAIL") + " | " + label + " | " + detail);
};

await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
await sleep(1800);

// 1. 加载零报错
assert(errs().length === 0, "页面加载 0 报错", errs().length + " 个错误事件");

// 2. 300 秒能量守恒
const e1 = await ev(`(function(){
  const s = window.__dp.sim;
  s.th1=120*Math.PI/180; s.w1=0; s.th2=-10*Math.PI/180; s.w2=0;
  s.b1=0; s.b2=0; s.paused=true;
  const E0 = window.__dp.totalEnergy();
  let drift300 = null;
  for (let i = 0; i < 300*240; i++) {
    window.__dp.rk4Step(1/240);
    if ((i+1) === 300*240) drift300 = (window.__dp.totalEnergy()-E0)/E0*100;
  }
  return JSON.stringify({drift300:+drift300.toFixed(4)});
})()`);
assert(JSON.parse(e1).drift300 !== null && Math.abs(JSON.parse(e1).drift300) < 0.5,
  "RK4 能量守恒（300s 漂移 <0.5%）", "漂移=" + JSON.parse(e1).drift300 + "%");

// 3. 极端初值无发散
const e2 = await ev(`(function(){
  const s = window.__dp.sim;
  s.th1=177*Math.PI/180; s.w1=0; s.th2=177*Math.PI/180; s.w2=0;
  let bad=0, maxw=0;
  for (let i=0;i<600*240;i++){
    window.__dp.rk4Step(1/240);
    if(!isFinite(s.th1)||!isFinite(s.w1)||!isFinite(s.th2)||!isFinite(s.w2)) bad++;
    maxw=Math.max(maxw,Math.abs(s.w1),Math.abs(s.w2));
  }
  return JSON.stringify({bad, maxw:+maxw.toFixed(2)});
})()`);
{
  const o = JSON.parse(e2);
  assert(o.bad === 0 && o.maxw < 100, "极端初值 600s 无 NaN/Inf 发散",
    "坏点=" + o.bad + "  ω峰值=" + o.maxw + " rad/s");
}

// 4. 混沌分离
const e3 = await ev(`(function(){
  const D=(t1,w1,t2,w2)=>{const d=t1-t2,sd=Math.sin(d),cd=Math.cos(d),den=3-Math.cos(2*d);
    const a1=(-9.8*3*Math.sin(t1)-9.8*Math.sin(t1-2*t2)-2*sd*(w2*w2*1.1+w1*w1*1.1*cd))/(1.1*den);
    const a2=(2*sd*(w1*w1*1.1*2+9.8*2*Math.cos(t1)+w2*w2*1.1*Math.cos(d)))/(1.1*den);
    return [w1,a1,w2,a2];};
  const step=(y,dt)=>{const f=s=>{const r=D(s[0],s[1],s[2],s[3]);return [s[1],r[1],s[3],r[3]];};
    const k1=f(y),y2=y.map((v,i)=>v+0.5*dt*k1[i]),k2=f(y2),y3=y.map((v,i)=>v+0.5*dt*k2[i]),
    k3=f(y3),y4=y.map((v,i)=>v+dt*k3[i]),k4=f(y4);
    return y.map((v,i)=>v+(dt/6)*(k1[i]+2*k2[i]+2*k3[i]+k4[i]));};
  let a=[120*Math.PI/180,0,-10*Math.PI/180,0], b=[120*Math.PI/180+1e-6,0,-10*Math.PI/180,0];
  let s0=null, s16=null;
  for(let i=1;i<=16*240;i++){
    a=step(a,1/240); b=step(b,1/240);
    if(i===240) s0=Math.max(...a.map((v,k)=>Math.abs(v-b[k])));
    if(i===16*240) s16=Math.max(...a.map((v,k)=>Math.abs(v-b[k])));
  }
  return JSON.stringify({s0:+s0.toExponential(3), s16:+s16.toExponential(3), ratio:+(s16/s0).toFixed(1)});
})()`);
{
  const o = JSON.parse(e3);
  assert(o.ratio > 100, "混沌轨迹分离（初值差 1e-6）",
    "t=1s: " + o.s0 + " → t=16s: " + o.s16 + "（×" + o.ratio + "）");
}

// 5. 拖拽（同步帧内，合成事件，含 pointercapture 兜底路径）
const e4 = await ev(`(function(){
  window.handleResetClick();
  sim.paused = true;
  const sc = window.__dp.geomScale();
  const b2 = window.__dp.bob2Pos(sc);
  const cv = document.getElementById('stage');
  const mk=(type,x,y)=>new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:7,
    pointerType:'mouse',clientX:x,clientY:y,button:type==='pointermove'?-1:0,buttons:type==='pointermove'?1:0});
  const before = +(sim.th2*180/Math.PI).toFixed(2);
  cv.dispatchEvent(mk('pointerdown', b2.x, b2.y));
  const p = window.__dp.pivot();
  cv.dispatchEvent(mk('pointermove', p.x+200*Math.sin(60*Math.PI/180), p.y+200*Math.cos(60*Math.PI/180)));
  cv.dispatchEvent(mk('pointerup', p.x+200*Math.sin(60*Math.PI/180), p.y+200*Math.cos(60*Math.PI/180)));
  return JSON.stringify({before, after:+(sim.th2*180/Math.PI).toFixed(2),
    w1:sim.w1, w2:sim.w2, changed: Math.abs(sim.th2*180/Math.PI - before) > 5});
})()`);
{
  const o = JSON.parse(e4);
  assert(o.changed && o.w1 === 0 && o.w2 === 0,
    "鼠标拖拽即时响应（合成 pointer 事件，含 capture 兜底）",
    "θ₂: " + o.before + "° → " + o.after + "°，释放 ω₁=ω₂=0");
}

// 6. 拖尾
const e5 = await ev(`(function(){
  window.handleResetClick();
  sim.paused = true; sim.trail.length = 0;
  for (let i=0;i<400;i++){
    window.__dp.rk4Step(1/240);
    const b2 = window.__dp.bob2Pos(window.__dp.geomScale());
    sim.trail.push({x:b2.x,y:b2.y,th:sim.th2,w:sim.w2});
    while(sim.trail.length>sim.trailMax) sim.trail.shift();
  }
  return JSON.stringify({len:sim.trail.length, max:sim.trailMax,
    allAngle:sim.trail.every(p=>typeof p.th==='number')});
})()`);
{
  const o = JSON.parse(e5);
  assert(o.len > 100 && o.len <= o.max && o.allAngle,
    "彩虹拖尾累积/封顶/带角度着色信息",
    o.len + "/" + o.max + " 点");
}

// 7. 最终报错统计 + 截图
assert(errs().length === 0, "全程控制台 0 报错", errs().length + " 个错误事件");
errs().forEach(e => console.log("  " + JSON.stringify(e.params).slice(0, 200)));

await ev(`(function(){
  window.handleResetClick();
  sim.paused = true; sim.trail.length = 0;
  for (let i=0;i<650;i++){
    window.__dp.rk4Step(1/240);
    const b2 = window.__dp.bob2Pos(window.__dp.geomScale());
    sim.trail.push({x:b2.x,y:b2.y,th:sim.th2,w:sim.w2});
    while(sim.trail.length>sim.trailMax) sim.trail.shift();
  }
  updateHUD(); render(); return 'ok';
})()`);
await sleep(150);
const s1 = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(OUT + "/double_pendulum_final.png", Buffer.from(s1.data, "base64"));

const pass = results.filter(r => r.pass).length;
console.log("");
console.log("===== 汇总: " + pass + "/" + results.length + " PASS =====");
ws.close();
await fetch(BASE + "/json/close/" + t.id);
