<div align="center">

<img src="https://upload.wikimedia.org/wikipedia/zh/thumb/0/0a/Nanchang_University_logo.svg/240px-Nanchang_University_logo.svg.png" alt="南昌大学校徽" width="120" />

# 南昌大学 · 跨学科编程基础 课程作品集

**Nanchang University · Introduction to Interdisciplinary Programming**

个人实验作品集主仓库

</div>

---

## 一、个人信息

| 项目 | 内容 |
| :--- | :--- |
| **姓名** | 李钰涵 |
| **学号** | 7902126166 |
| **专业** | 食品科学与工程 |
| **课程** | 跨学科编程基础 |
| **学期** | 全学期（共 16 周实验） |

> 本仓库用于记录并沉淀我在本课程全部 16 周实验中的代码、数据与实验报告，
> 既是作业提交载体，也是长期可回看的个人技术档案。

---

## 二、仓库导航

| 目录 | 说明 |
| :--- | :--- |
| [`week01/`](./week01) ~ [`week16/`](./week16) | 每周实验的独立工作区，互不干扰 |
| [`data/`](./data) | 实验数据集（原始大文件仅本地保留，见 `.gitignore`） |
| [`docs/`](./docs) | 实验报告、笔记、参考资料 |
| [`assets/`](./assets) | 截图、图表、演示素材 |
| [`.gitignore`](./.gitignore) | 声明哪些文件不纳入版本管理 |

---

## 三、全学期 16 周实验目录树

```text
oo/                                  # 仓库根目录
├── .gitignore                       # Git 忽略规则（不上传的文件清单）
├── README.md                        # 本文件：仓库说明书
├── LICENSE                          # 开源许可证
│
├── week01/                          # 【第 1 周】开发环境搭建与第一个程序
│   ├── README.md                    #   本周实验说明与结论
│   ├── src/                         #   源代码
│   │   └── main.py
│   ├── data/                        #   本实验用到的数据
│   ├── results/                     #   运行结果、输出文件
│   └── report.md                    #   实验报告
│
├── week02/                          # 【第 2 周】变量、数据类型与基本运算
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/
│   └── report.md
│
├── week03/                          # 【第 3 周】条件判断与循环控制
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/
│   └── report.md
│
├── week04/                          # 【第 4 周】函数与模块化编程
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/
│   └── report.md
│
├── week05/                          # 【第 5 周】列表、元组与字符串处理
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/
│   └── report.md
│
├── week06/                          # 【第 6 周】字典、集合与数据组织
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/
│   └── report.md
│
├── week07/                          # 【第 7 周】文件读写与异常处理
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/
│   └── report.md
│
├── week08/                          # 【第 8 周】期中项目：数据处理小工具
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/
│   └── report.md
│
├── week09/                          # 【第 9 周】NumPy 与科学计算基础
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/
│   └── report.md
│
├── week10/                          # 【第 10 周】Pandas 与表格数据分析
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/
│   └── report.md
│
├── week11/                          # 【第 11 周】Matplotlib 数据可视化
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/                     #   导出的图表 PNG / SVG
│   └── report.md
│
├── week12/                          # 【第 12 周】网络请求与公开数据获取
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/
│   └── report.md
│
├── week13/                          # 【第 13 周】食品科学专题①：营养成分计算
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/
│   └── report.md
│
├── week14/                          # 【第 14 周】食品科学专题②：实验数据拟合
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/
│   └── report.md
│
├── week15/                          # 【第 15 周】期末项目开发与调试
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/
│   └── report.md
│
├── week16/                          # 【第 16 周】期末项目答辩与作品集整理
│   ├── README.md
│   ├── src/
│   ├── data/
│   ├── results/
│   └── report.md
│
├── data/                            # 跨周共享数据集
│   ├── raw/                         #   原始数据（大文件不传 GitHub）
│   └── processed/                   #   清洗后的干净数据
│
├── docs/                            # 课程笔记与参考资料
│   └── notes.md
│
└── assets/                          # 图片、图表、演示素材
    └── .gitkeep
```

---

## 四、学习进度追踪

| 周次 | 主题 | 状态 |
| :---: | :--- | :---: |
| 01 | 开发环境搭建与第一个程序 | 未开始 |
| 02 | 变量、数据类型与基本运算 | 未开始 |
| 03 | 条件判断与循环控制 | 未开始 |
| 04 | 函数与模块化编程 | 未开始 |
| 05 | 列表、元组与字符串处理 | 未开始 |
| 06 | 字典、集合与数据组织 | 未开始 |
| 07 | 文件读写与异常处理 | 未开始 |
| 08 | 期中项目：数据处理小工具 | 未开始 |
| 09 | NumPy 与科学计算基础 | 未开始 |
| 10 | Pandas 与表格数据分析 | 未开始 |
| 11 | Matplotlib 数据可视化 | 未开始 |
| 12 | 网络请求与公开数据获取 | 未开始 |
| 13 | 食品科学专题①：营养成分计算 | 未开始 |
| 14 | 食品科学专题②：实验数据拟合 | 未开始 |
| 15 | 期末项目开发与调试 | 未开始 |
| 16 | 期末项目答辩与作品集整理 | 未开始 |

> 完成一周后，把「未开始」改成「✅ 已完成」，并附上对应 `weekXX/` 目录链接。

---

## 五、快速开始

```bash
# 1. 克隆仓库到本地
git clone https://github.com/<你的用户名>/oo.git
cd oo

# 2. 查看当前状态
git status

# 3. 完成一次实验后，提交你的成果
git add week01/
git commit -m "week01: 完成开发环境搭建实验"
git push
```

---

## 六、常用 Git 命令速查

| 目的 | 命令 |
| :--- | :--- |
| 查看当前改动状态 | `git status` |
| 把改动加入待提交区 | `git add <文件>` 或 `git add .` |
| 提交并写说明 | `git commit -m "说明"` |
| 推送到 GitHub | `git push` |
| 拉取最新代码 | `git pull` |
| 查看提交历史 | `git log --oneline` |

---

<div align="center">

**南昌大学 · 食品科学与工程 · 李钰涵 · 7902126166**

*保持好奇，持续记录。*

</div>
