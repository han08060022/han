#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
第 05 周实验 · 单摆运动仿真
=============================

姓名：李钰涵
学号：7902126166
专业：食品科学与工程

功能说明
--------
对单摆运动方程做数值积分（四阶龙格-库塔法），不采用小角度近似，
从而可以观察大摆角下"周期变长"的真实物理现象。

输出
----
results/pendulum_data.csv  —— 时间序列数据
results/summary.txt         —— 周期对比摘要

运行
----
    python src/pendulum.py
"""

from __future__ import annotations

import csv
import math
import os

# ---------------------------------------------------------------- 物理常量
G = 9.81          # 重力加速度 (m/s^2)


# ================================================================ 核心算法
def derivatives(theta: float, omega: float, length: float) -> tuple[float, float]:
    """返回状态量 (theta, omega) 的导数。

    参数
    ----
    theta : 当前摆角 (弧度)
    omega : 当前角速度 (rad/s)
    length: 摆长 (m)

    返回
    ----
    (dtheta/dt, domega/dt)
    """
    dtheta = omega
    domega = -(G / length) * math.sin(theta)   # 完整非线性方程
    return dtheta, domega


def simulate(length: float, theta0_deg: float,
             duration: float = 10.0, dt: float = 0.001) -> list[tuple[float, float, float]]:
    """用四阶龙格-库塔法（RK4）仿真单摆运动。

    参数
    ----
    length    : 摆长 (m)
    theta0_deg: 初始摆角 (度)
    duration  : 仿真总时长 (s)
    dt        : 时间步长 (s)

    返回
    ----
    [(t, theta_deg, omega), ...]
    """
    theta = math.radians(theta0_deg)   # 转成弧度
    omega = 0.0                        # 初始静止释放
    t = 0.0

    steps = int(duration / dt)
    history: list[tuple[float, float, float]] = [(t, theta0_deg, omega)]

    for _ in range(steps):
        # RK4 四步加权平均，精度远高于简单欧拉法
        k1t, k1o = derivatives(theta, omega, length)

        k2t, k2o = derivatives(theta + 0.5 * dt * k1t,
                               omega + 0.5 * dt * k1o, length)
        k3t, k3o = derivatives(theta + 0.5 * dt * k2t,
                               omega + 0.5 * dt * k2o, length)
        k4t, k4o = derivatives(theta + dt * k3t,
                               omega + dt * k3o, length)

        theta += (dt / 6.0) * (k1t + 2 * k2t + 2 * k3t + k4t)
        omega += (dt / 6.0) * (k1o + 2 * k2o + 2 * k3o + k4o)
        t += dt

        history.append((t, math.degrees(theta), omega))

    return history


# ================================================================ 测量周期
def measure_period(history: list[tuple[float, float, float]]) -> float:
    """测量完整周期。

    只统计「由正变负」的过零点（即每次摆球都从同一侧穿过平衡位置），
    这样相邻两次同类过零之间恰好是一个完整周期。

    注意：不能把「正→负」和「负→正」混在一起取平均，那样算出来的是
    半周期，会得到 2 倍偏大的错误结果。
    """
    same_direction_crossings: list[float] = []
    for i in range(1, len(history)):
        prev_t, prev_theta, _ = history[i - 1]
        curr_t, curr_theta, _ = history[i]
        if prev_theta > 0 >= curr_theta:
            # 线性插值，得到更精确的过零时刻
            frac = prev_theta / (prev_theta - curr_theta)
            same_direction_crossings.append(prev_t + frac * (curr_t - prev_t))

    if len(same_direction_crossings) < 2:
        return float("nan")

    periods = [
        same_direction_crossings[i + 1] - same_direction_crossings[i]
        for i in range(len(same_direction_crossings) - 1)
    ]
    return sum(periods) / len(periods)


def theoretical_period_small_angle(length: float) -> float:
    """小角度近似下的理论周期 T = 2π√(L/g)。"""
    return 2.0 * math.pi * math.sqrt(length / G)


# ================================================================ 主流程
def main() -> None:
    # 让脚本无论从哪里运行，输出都能落到本实验自己的 results/ 下
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, os.pardir, "results")
    os.makedirs(out_dir, exist_ok=True)

    length = 1.0            # 摆长 1 米
    duration = 10.0         # 仿真 10 秒

    cases = [5.0, 15.0, 45.0, 90.0]   # 对比不同初始摆角

    summary_lines: list[str] = []
    summary_lines.append("单摆仿真摘要 —— 李钰涵 / 7902126166")
    summary_lines.append("=" * 52)
    summary_lines.append(f"摆长 L = {length} m，重力加速度 g = {G} m/s^2")
    summary_lines.append("")
    summary_lines.append(f"{'初始摆角':>8} | {'仿真周期(s)':>12} | {'理论周期(s)':>12} | 相对偏差")
    summary_lines.append("-" * 60)

    print(summary_lines[0])
    print("=" * 52)

    for theta0 in cases:
        hist = simulate(length, theta0, duration=duration)
        t_sim = measure_period(hist)
        t_theory = theoretical_period_small_angle(length)

        if math.isnan(t_sim):
            dev_str = "N/A"
            t_sim_str = "N/A"
        else:
            dev = (t_sim - t_theory) / t_theory * 100.0
            dev_str = f"{dev:+.2f}%"
            t_sim_str = f"{t_sim:.4f}"

        line = f"{theta0:>7.1f}° | {t_sim_str:>12} | {t_theory:>12.4f} | {dev_str}"
        summary_lines.append(line)
        print(line)

        # 每个摆角单独导出时间序列（只取前 2 秒，避免文件过大）
        csv_name = f"pendulum_{int(theta0)}deg.csv"
        csv_path = os.path.join(out_dir, csv_name)
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["time_s", "theta_deg", "omega_rad_s"])
            for t, th, om in hist:
                if t <= 2.0:
                    writer.writerow([f"{t:.4f}", f"{th:.6f}", f"{om:.6f}"])

    # 结论
    summary_lines.append("")
    summary_lines.append("结论：")
    summary_lines.append("  初始摆角越大，实际周期越长，与理论公式的偏差也越大。")
    summary_lines.append("  这是因为理论周期 T=2π√(L/g) 建立在 sin(θ)≈θ 的小角度近似之上，")
    summary_lines.append("  摆角增大后该近似失效，单摆不再是严格的简谐运动。")

    summary_path = os.path.join(out_dir, "summary.txt")
    with open(summary_path, "w", encoding="utf-8") as f:
        f.write("\n".join(summary_lines) + "\n")

    print()
    print(f"✅ 结果已写入：{os.path.normpath(out_dir)}")
    print("   - summary.txt            周期对比摘要")
    print("   - pendulum_*deg.csv      各初始摆角的时间序列")


if __name__ == "__main__":
    main()
