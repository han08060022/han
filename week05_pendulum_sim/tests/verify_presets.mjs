/* ============================================================================
   双摆模拟器 —— 天体预设 + localStorage 持久化 验证脚本
   通过 CDP 驱动真实 Edge 浏览器，逐项断言用户的验收标准：
     【验收标准】场景切换自然，刷新网页后参数完美恢复，控制台 0 报错。

   覆盖：
     A. 页面加载 → 控制台 0 报错，无未捕获异常
     B. 4 个胶囊按钮存在且可点击，点击后 activePreset / gTarget 正确
     C. 重力"平滑过渡"：切场景后 sim.g 不会瞬间跳到目标值，而是逐帧逼近
     D. 重力滑块与胶囊联动：sim.g 变化时滑块 value 同步更新
     E. localStorage 写入：改参数后（防抖 220ms）缓存出现，字段齐全
     F. 刷新恢复：reload 后所有参数 + 预设高亮从缓存恢复
     G. 刷新后控制台仍 0 报错

   用法：node verify_presets.mjs
   ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 9224;
const PAGE_URL = "file:///" + path.resolve(__dirname, "../web/double_pendulum.html").replace(/\\/g, "/");
const SHOT_DIR = path.resolve(__dirname, "../results/render_test");
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

/* ---------------- 结果统计 ---------------- */
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✅ PASS  ${name}${detail ? "  → " + detail : ""}`); }
  else { fail++; failures.push(name); console.log(`  ❌ FAIL  ${name}${detail ? "  → " + detail : ""}`); }
}
function section(t) { console.log(`\n${"─".repeat(72)}\n${t}\n${"─".repeat(72)}`); }

/* ---------------- CDP 极简客户端 ---------------- */
class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.handlers = []; }
  ready() {
    return new Promise((res, rej) => {
      this.ws.addEventListener("open", () => res());
      this.ws.addEventListener("error", (e) => rej(new Error("WS 连接失败: " + e.message)));
    });
  }
  on(fn) { this.handlers.push(fn); }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); rej(new Error("超时: " + method)); }
      }, 20000);
    });
  }
  _wire() {
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.method + ": " + JSON.stringify(msg.error)));
        else res(msg.result);
      } else if (msg.method) {
        this.handlers.forEach((h) => h(msg));
      }
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

/* 在页面里跑一段表达式并取值（by value） */
async function evalJS(cdp, expr) {
  const r = await cdp.send("Runtime.evaluate", {
    expression: `(function(){ try { return JSON.stringify((${expr})); } catch(e) { return JSON.stringify({__err: String(e)}); } })()`,
    returnByValue: true,
    awaitPromise: false
  });
  if (r.exceptionDetails) throw new Error("页面求值异常: " + JSON.stringify(r.exceptionDetails));
  const v = r.result && r.result.value;
  return v === undefined ? undefined : JSON.parse(v);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 主流程 ---------------- */
(async () => {
  /* 1. 开新标签页 */
  console.log("目标页面:", PAGE_URL);
  let target;
  try {
    const resp = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE_URL)}`, { method: "PUT" });
    target = await resp.json();
  } catch (e) {
    console.error("无法创建调试标签页，请确认 Edge 已在 9224 端口启动调试模式。");
    console.error(e.message);
    process.exit(2);
  }
  if (!target.webSocketDebuggerUrl) {
    console.error("返回体缺少 webSocketDebuggerUrl:", JSON.stringify(target));
    process.exit(2);
  }

  const cdp = new CDP(target.webSocketDebuggerUrl);
  cdp._wire();
  await cdp.ready();

  /* 2. 收集控制台错误 / 未捕获异常 / Log 错误 */
  const consoleErrors = [];
  cdp.on((msg) => {
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      consoleErrors.push("exceptionThrown: " + (d.exception && d.exception.description || d.text));
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      consoleErrors.push("console.error: " + msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
    } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      consoleErrors.push("log.error: " + msg.params.entry.text);
    }
  });

  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 950, deviceScaleFactor: 1, mobile: false
  });

  /* 3. 等页面就绪 + 首帧渲染 */
  await sleep(2500);

  /* ================================================================
     A. 冷启动基线
     ================================================================ */
  section("A. 冷启动基线（清空缓存后首次加载）");

  // 先清缓存再 reload，保证从"无缓存"起步
  await evalJS(cdp, `(function(){ try{ localStorage.clear(); }catch(e){} return 1; })()`);
  await cdp.send("Page.reload", { ignoreCache: true });
  await sleep(2500);

  const base = await evalJS(cdp, `(function(){
    const s = window.__dp && window.__dp.sim;
    return {
      hasApi: !!(window.__dpPresets && s),
      pillCount: document.querySelectorAll(".pill").length,
      pillKeys: Array.from(document.querySelectorAll(".pill")).map(function(e){return e.dataset.preset;}),
      activePill: (document.querySelector(".pill.active")||{dataset:{}}).dataset.preset || null,
      g: s ? s.g : null,
      gTarget: window.__dpPresets ? window.__dpPresets.gTarget : null,
      active: window.__dpPresets ? window.__dpPresets.active : null,
      cache: (function(){ try { return localStorage.getItem(window.__dpPresets.STORAGE_KEY); } catch(e){ return "ERR"; } })(),
      sliderG: (function(){ const i=document.getElementById("in-g"); return i? i.value : null; })(),
      outG: (function(){ const o=document.getElementById("o-g"); return o? o.textContent : null; })()
    };
  })()`);

  check("测试 API 挂载 (window.__dpPresets / __dp.sim)", base.hasApi, `hasApi=${base.hasApi}`);
  check("存在 4 个天体胶囊按钮", base.pillCount === 4, `count=${base.pillCount}`);
  check("胶囊按键名齐全", JSON.stringify(base.pillKeys) === JSON.stringify(["earth", "moon", "jupiter", "space"]),
        base.pillKeys && base.pillKeys.join(","));
  check("无缓存时默认高亮「地球」", base.activePill === "earth" && base.active === "earth",
        `activePill=${base.activePill}, active=${base.active}`);
  check("默认重力 g≈9.8", Math.abs(base.g - 9.8) < 0.05, `g=${base.g}`);
  check("冷启动无缓存（localStorage 为空）", base.cache === null || base.cache === undefined, `cache=${base.cache}`);
  check("重力滑块与状态同步", Math.abs(Number(base.sliderG) - base.g) < 0.2,
        `sliderG=${base.sliderG}, g=${base.g}`);
  check("重力数值标签显示", base.outG !== null && base.outG !== "", `oG="${base.outG}"`);

  /* ================================================================
     B. 场景切换：目标值 + 平滑过渡
     ================================================================ */
  section("B. 场景切换 —— gTarget 正确性 与 平滑过渡（非跳变）");

  const expectG = { earth: 9.8, moon: 1.62, jupiter: 24.79, space: 0.5 };

  for (const key of ["moon", "jupiter", "space", "earth"]) {
    // 点击胶囊前先记录当前 g
    const before = await evalJS(cdp, `window.__dp.sim.g`);

    // 用真实鼠标事件点击对应胶囊（走合成点击，验证事件绑定而非直接调函数）
    const clicked = await evalJS(cdp, `(function(){
      const el = document.querySelector('.pill[data-preset="${key}"]');
      if (!el) return {ok:false};
      const r = el.getBoundingClientRect();
      return {ok:true, x: r.left + r.width/2, y: r.top + r.height/2};
    })()`);

    if (!clicked || !clicked.ok) { check(`点击胶囊 ${key}`, false, "未找到元素"); continue; }

    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: clicked.x, y: clicked.y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: clicked.x, y: clicked.y, button: "left", clickCount: 1 });

    // 立刻（约 1 帧内）采样，看 sim.g 是否已经跳到目标值 —— 若已跳变说明没有平滑
    await sleep(60);
    const justAfter = await evalJS(cdp, `({g: window.__dp.sim.g, gTarget: window.__dpPresets.gTarget, active: window.__dpPresets.active})`);

    // 再等过渡完成
    await sleep(1400);
    const settled = await evalJS(cdp, `({
      g: window.__dp.sim.g,
      gTarget: window.__dpPresets.gTarget,
      active: window.__dpPresets.active,
      activePill: (document.querySelector(".pill.active")||{dataset:{}}).dataset.preset || null,
      sliderG: Number(document.getElementById("in-g").value),
      outG: document.getElementById("o-g").textContent
    })`);

    const tgt = expectG[key];
    check(`[${key}] gTarget 已切到 ${tgt}`, Math.abs(justAfter.gTarget - tgt) < 0.01,
          `gTarget=${justAfter.gTarget}`);
    check(`[${key}] 预设状态 activePreset=${key}`, settled.active === key, `active=${settled.active}`);
    check(`[${key}] 胶囊高亮切换到 ${key}`, settled.activePill === key, `activePill=${settled.activePill}`);
    check(`[${key}] 过渡完成后 sim.g 收敛到 ${tgt}`, Math.abs(settled.g - tgt) < 0.05,
          `g=${settled.g.toFixed(3)}, 目标=${tgt}`);
    check(`[${key}] 重力滑块联动到 ${tgt}`, Math.abs(settled.sliderG - tgt) < 0.15,
          `sliderG=${settled.sliderG}`);
    check(`[${key}] 重力数值标签联动`, Math.abs(Number(settled.outG) - tgt) < 0.15,
          `oG="${settled.outG}"`);

    // 平滑性判定：把 g 从 before 拉到目标，若是一步跳变则 justAfter.g == tgt
    const jumped = Math.abs(justAfter.g - tgt) < 0.01 && Math.abs(before - tgt) > 0.5;
    check(`[${key}] 重力为平滑过渡（非瞬间跳变）`, !jumped,
          `before=${before.toFixed(3)}, 60ms后 g=${justAfter.g.toFixed(3)}, 目标=${tgt}`);
  }

  /* ================================================================
     C. localStorage 持久化写入
     ================================================================ */
  section("C. localStorage 自动保存（防抖 220ms）");

  // 改成一组"自定义参数"：故意让重力脱离任何预设
  await evalJS(cdp, `(function(){
    function set(id, val){ const el=document.getElementById(id); el.value=val;
      el.dispatchEvent(new Event("input", {bubbles:true})); }
    set("in-l1", 137);
    set("in-l2", 88);
    set("in-mass", 2.4);
    set("in-g", 15.7);
    set("in-damp", 0.0045);
    set("in-trail", 740);
    return 1;
  })()`);

  await sleep(500);   // 超过防抖窗口

  const cacheRaw = await evalJS(cdp, `(function(){ try { return localStorage.getItem(window.__dpPresets.STORAGE_KEY); } catch(e){ return null; } })()`);
  check("localStorage 已写入缓存记录", !!cacheRaw, cacheRaw ? `len=${cacheRaw.length}` : "空");

  let cacheObj = null;
  try { cacheObj = JSON.parse(cacheRaw); } catch (e) { /* ignore */ }
  check("缓存为合法 JSON", cacheObj !== null && typeof cacheObj === "object", cacheObj ? "OK" : "解析失败");

  if (cacheObj) {
    const fieldsOk =
      Math.abs(cacheObj.L1 - 137) < 0.001 &&
      Math.abs(cacheObj.L2 - 88) < 0.001 &&
      Math.abs(cacheObj.massRatio - 2.4) < 0.01 &&
      Math.abs(cacheObj.g - 15.7) < 0.2 &&
      Math.abs(cacheObj.damp - 0.0045) < 1e-6 &&
      cacheObj.trail === 740;
    check("缓存字段完整且数值正确", fieldsOk,
          `L1=${cacheObj.L1}, L2=${cacheObj.L2}, mass=${cacheObj.massRatio}, g=${cacheObj.g}, damp=${cacheObj.damp}, trail=${cacheObj.trail}`);
    check("缓存记录了预设标识", "preset" in cacheObj, `preset=${cacheObj.preset}`);
    check("缓存记录了时间戳 savedAt", typeof cacheObj.savedAt === "number" && cacheObj.savedAt > 0,
          `savedAt=${cacheObj.savedAt}`);
  }

  // 截图：自定义参数 + 无胶囊高亮（custom 状态）
  const shotA = await cdp.send("Page.captureScreenshot", { format: "png" });
  const pA = path.join(SHOT_DIR, "presets_custom.png");
  fs.writeFileSync(pA, Buffer.from(shotA.data, "base64"));
  console.log("  📸 截图:", pA);

  /* ================================================================
     D. 刷新恢复
     ================================================================ */
  section("D. 刷新网页 → 参数完美恢复");

  const errBeforeReload = consoleErrors.length;
  await cdp.send("Page.reload", { ignoreCache: false });
  await sleep(2600);   // 等 boot 完成 + 首帧

  const restored = await evalJS(cdp, `(function(){
    const s = window.__dp.sim;
    function v(id){ return document.getElementById(id).value; }
    function t(id){ return document.getElementById(id).textContent; }
    return {
      L1: s.L1, L2: s.L2, massRatio: +(s.m2/s.m1).toFixed(2),
      g: s.g, damp: s.dampRead, trail: s.trailMax,
      slidL1: Number(v("in-l1")), slidL2: Number(v("in-l2")),
      slidMass: Number(v("in-mass")), slidG: Number(v("in-g")),
      slidDamp: Number(v("in-damp")), slidTrail: Number(v("in-trail")),
      outL1: t("o-l1"), outMass: t("o-mass"), outG: t("o-g"),
      outTrail: t("o-trail-len"),
      activePill: (document.querySelector(".pill.active")||{dataset:{}}).dataset.preset || null,
      cacheAlive: !!localStorage.getItem(window.__dpPresets.STORAGE_KEY)
    };
  })()`);

  check("刷新后缓存仍在", restored.cacheAlive, `cacheAlive=${restored.cacheAlive}`);
  check("摆长 L1 恢复 (137)", Math.abs(restored.L1 - 137) < 0.01 && Math.abs(restored.slidL1 - 137) < 0.01,
        `L1=${restored.L1}, 滑块=${restored.slidL1}`);
  check("摆长 L2 恢复 (88)", Math.abs(restored.L2 - 88) < 0.01 && Math.abs(restored.slidL2 - 88) < 0.01,
        `L2=${restored.L2}, 滑块=${restored.slidL2}`);
  check("质量比恢复 (2.4)", Math.abs(restored.massRatio - 2.4) < 0.01 && Math.abs(restored.slidMass - 2.4) < 0.01,
        `massRatio=${restored.massRatio}, 滑块=${restored.slidMass}`);
  check("重力恢复 (15.7)", Math.abs(restored.g - 15.7) < 0.2 && Math.abs(restored.slidG - 15.7) < 0.2,
        `g=${restored.g}, 滑块=${restored.slidG}`);
  check("阻尼恢复 (0.0045)", Math.abs(restored.damp - 0.0045) < 1e-6 && Math.abs(restored.slidDamp - 0.0045) < 1e-6,
        `damp=${restored.damp}, 滑块=${restored.slidDamp}`);
  check("拖尾长度恢复 (740)", restored.trail === 740 && restored.slidTrail === 740,
        `trail=${restored.trail}, 滑块=${restored.slidTrail}`);
  check("数值标签同步刷新", restored.outL1 === "137" && restored.outTrail === "740",
        `o-l1="${restored.outL1}", o-trail-len="${restored.outTrail}"`);

  // 15.7 不属于任何预设 → 应有 0 个 active 胶囊
  check("自定义重力 (15.7) 无胶囊高亮", restored.activePill === null,
        `activePill=${restored.activePill}`);

  /* ================================================================
     E. 预设切换后刷新 → 高亮也恢复
     ================================================================ */
  section("E. 切到「木星」→ 刷新 → 预设高亮恢复");

  await evalJS(cdp, `(function(){
    const el = document.querySelector('.pill[data-preset="jupiter"]');
    el.click();
    return 1;
  })()`);
  await sleep(1600);   // 等过渡 + 保存

  const afterJup = await evalJS(cdp, `({active: window.__dpPresets.active, g: window.__dp.sim.g})`);
  check("切到木星后 activePreset=jupiter", afterJup.active === "jupiter", `active=${afterJup.active}`);
  check("木星重力收敛到 24.79", Math.abs(afterJup.g - 24.79) < 0.06, `g=${afterJup.g.toFixed(3)}`);

  await cdp.send("Page.reload", { ignoreCache: false });
  await sleep(2600);

  const restoredJup = await evalJS(cdp, `({
    active: window.__dpPresets.active,
    activePill: (document.querySelector(".pill.active")||{dataset:{}}).dataset.preset || null,
    g: window.__dp.sim.g,
    gTarget: window.__dpPresets.gTarget,
    sliderG: Number(document.getElementById("in-g").value),
    sliderMin: Number(document.getElementById("in-g").min)
  })`);

  check("刷新后预设仍为「木星」", restoredJup.active === "jupiter", `active=${restoredJup.active}`);
  check("刷新后木星胶囊保持高亮", restoredJup.activePill === "jupiter", `activePill=${restoredJup.activePill}`);
  check("刷新后重力恢复为 24.79", Math.abs(restoredJup.g - 24.79) < 0.06, `g=${restoredJup.g.toFixed(3)}`);
  check("刷新后 gTarget 恢复", Math.abs(restoredJup.gTarget - 24.79) < 0.06, `gTarget=${restoredJup.gTarget}`);
  check("重力滑块联动到 24.79", Math.abs(restoredJup.sliderG - 24.79) < 0.15, `sliderG=${restoredJup.sliderG}`);

  /* ================================================================
     F. 极端预设：太空 g=0.5 → 滑块下限自动放宽
     ================================================================ */
  section("F. 「太空」预设 g=0.5 → 滑块下限自适应 + 阻尼联动");

  await evalJS(cdp, `(function(){ document.querySelector('.pill[data-preset="space"]').click(); return 1; })()`);
  await sleep(1600);

  const spc = await evalJS(cdp, `({
    g: window.__dp.sim.g,
    gTarget: window.__dpPresets.gTarget,
    active: window.__dpPresets.active,
    damp: window.__dp.sim.dampRead,
    slidDamp: Number(document.getElementById("in-damp").value),
    slidMin: Number(document.getElementById("in-g").min),
    outDamp: document.getElementById("o-damp").textContent
  })`);

  check("太空预设 gTarget=0.5", Math.abs(spc.gTarget - 0.5) < 0.001, `gTarget=${spc.gTarget}`);
  check("太空重力平滑收敛到 0.5", Math.abs(spc.g - 0.5) < 0.02, `g=${spc.g.toFixed(4)}`);
  check("太空预设激活", spc.active === "space", `active=${spc.active}`);
  check("太空预设联动微阻尼 0.0006", Math.abs(spc.damp - 0.0006) < 1e-6 && Math.abs(spc.slidDamp - 0.0006) < 1e-6,
        `damp=${spc.damp}, 滑块=${spc.slidDamp}, 标签="${spc.outDamp}"`);
  check("重力滑块下限自适应放宽到 ≤0.5", spc.slidMin <= 0.5, `min=${spc.slidMin}`);

  // 截图：太空场景
  const shotB = await cdp.send("Page.captureScreenshot", { format: "png" });
  const pB = path.join(SHOT_DIR, "presets_space.png");
  fs.writeFileSync(pB, Buffer.from(shotB.data, "base64"));
  console.log("  📸 截图:", pB);

  /* ================================================================
     G. 控制台零报错
     ================================================================ */
  section("G. 控制台零报错（含加载 / 切场景 / 两次刷新）");

  const errAfterReload = consoleErrors.slice(errBeforeReload);
  if (consoleErrors.length === 0) {
    check("全程控制台 0 报错", true, "无 exceptionThrown / console.error / log.error");
  } else {
    check("全程控制台 0 报错", false, `${consoleErrors.length} 条错误：`);
    consoleErrors.slice(0, 10).forEach((e) => console.log("       · " + e));
  }

  /* ================================================================
     汇总
     ================================================================ */
  section("汇总");
  console.log(`  PASS: ${pass}    FAIL: ${fail}    总断言: ${pass + fail}`);
  if (fail === 0) {
    console.log("\n  🎉 全部通过 —— 「场景切换自然，刷新后参数完美恢复，控制台 0 报错」达成。\n");
  } else {
    console.log("\n  失败项：");
    failures.forEach((f) => console.log("   - " + f));
    console.log("");
  }

  cdp.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("\n脚本异常终止:", e);
  process.exit(3);
});
