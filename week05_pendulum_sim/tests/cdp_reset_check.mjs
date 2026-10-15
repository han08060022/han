/**
 * 复位瞬间精确测量 + 视觉截图（同一帧内完成，排除 rAF 干扰）
 */
import { writeFileSync } from "node:fs";

const BASE = "http://127.0.0.1:9222";
const OUT = "D:/oo/week05_pendulum_sim/results/render_test";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await (await fetch(BASE + "/json/new?" + encodeURIComponent(
  "file:///D:/oo/week05_pendulum_sim/web/_verify.html"), { method: "PUT" })).json();

const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res) => ws.addEventListener("open", res));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id; pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  return r.result?.value;
};

await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
await sleep(800);

// 先把状态弄乱，再在同一帧内点重置并立刻读取 —— 排除任何 rAF 推进
const r1 = await ev(`
  (function(){
    // 弄乱：强阻尼 + 推进 5 秒
    const d=document.getElementById('in-damp'); d.value='0.008'; d.dispatchEvent(new Event('input'));
    const a=document.getElementById('in-ang'); a.value=45; a.dispatchEvent(new Event('input')); a.dispatchEvent(new Event('change'));
    sim.paused=true;
    for(var i=0;i<5*240;i++){integrate(1/240);countSwing();}
    var before = {theta:+(sim.theta*180/Math.PI).toFixed(3), omega:+sim.omega.toFixed(4), swings:sim.swings,
                  dampRead:sim.dampRead, mode:document.getElementById('o-mode').textContent};
    // 点重置
    document.getElementById('btn-reset').click();
    // 立刻冻结，读取"复位瞬间"的精确状态
    sim.paused=true;
    var after = {theta:+(sim.theta*180/Math.PI).toFixed(9), omega:sim.omega, swings:sim.swings,
                 dampRead:sim.dampRead, mode:document.getElementById('o-mode').textContent,
                 angSlider:Number(document.getElementById('in-ang').value)};
    updateHUD(); render();
    return JSON.stringify({before, after});
  })()
`);
console.log("复位前后（同一帧内测量）：");
console.log(r1);

const s1 = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(OUT + "/cdp_reset_exact.png", Buffer.from(s1.data, "base64"));

// 另外补一张：默认无阻尼、自然摆动中的画面
const r2 = await ev(`
  (function(){
    const d=document.getElementById('in-damp'); d.value='0'; d.dispatchEvent(new Event('input'));
    document.getElementById('btn-reset').click();
    sim.paused=true;
    for(var i=0;i<240*0.62;i++){integrate(1/240);countSwing();}
    updateHUD(); render();
    return JSON.stringify({theta:+(sim.theta*180/Math.PI).toFixed(2), mode:document.getElementById('o-mode').textContent});
  })()
`);
console.log("默认画面状态: " + r2);
const s2 = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(OUT + "/cdp_default_swing.png", Buffer.from(s2.data, "base64"));

ws.close();
await fetch(BASE + "/json/close/" + t.id);
console.log("截图已保存");
