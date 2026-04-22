<p align="center">
  <img src="public/logo.svg" width="180" alt="SomeHUE" />
</p>

<p align="center">
  感知均匀的 Figma 调色器 · 基于 OKLCH 的批量色彩调整
</p>

---

## 它是什么

SomeHUE 是一个 Figma 插件，用来一次性调整选区内所有颜色的色相 / 饱和度 / 明度。底层统一用 OKLCH 感知均匀色彩模型，避免了传统 HSL 跨色相时明度漂移的问题；UI 仍以 H/S/L 呈现，学习成本为 0。

对标工具多数仍停留在 HSL，在跨色相改品牌色时会产生明度不一致；SomeHUE 默认输出感知均匀。

## 核心功能

- **色轮直拖**：选区内每个颜色以一个圆点投射在色轮上，直接拖动即可调整
  - **全部** 模式：拖任一圆点 → 整组颜色按相同 Δh/Δs 偏移
  - **单色** 模式：拖单个圆点 → 只替换这一个颜色
  - **锁定饱和**：开启后拖拽只改色相，饱和度沿原色弧保持
- **H / S / L 滑块**：精细数值调整，支持键盘方向键微调，圆点随滑块实时移动
- **填充 / 描边 / 阴影 / 渐变** 四个作用范围独立开关（包括渐变逐 stop 调整）
- **嵌套穿透**：递归整个 Frame / Group / Component / Instance 子树
- **灰阶保护**：OKLCH chroma < 0.02 的近灰色默认跳过，防止把中性色染色
- **Variables / Styles 三态策略**：跳过 / 解绑后改 / 改变量本身，企业设计系统场景可用
- **历史记录**：最近 10 次非零调整自动保存到 `clientStorage`，一键重放
- **实时预览 + 原生 Undo**：拖动期间节流预览，应用后落入 Figma 历史栈，Esc 撤销
- **OKLCH ↔ 严格 HSL** 切换：给旧工作流留出逃生舱

## 开发

```bash
npm install
npm run build          # 完整构建 (tsc + UI + plugin) — Figma 加载前必须先构建
npm run build:ui       # 仅 UI → dist/index.html (单文件内联)
npm run build:plugin   # 仅插件主线程 → dist/code.js
npm run dev            # Vite 开发服务器（浏览器预览，不走 Figma）
npm run lint           # ESLint
```

在 Figma 里 **Plugins → Development → Import plugin from manifest…**，选本仓库的 `manifest.json` 即可。

## 架构

Figma 插件必须走双线程架构，UI 和 Figma API 隔离：

```
src/
  plugin/          ← 主线程（Figma sandbox / QuickJS）
    code.ts        ← 入口：Figma API、预览 snapshot/restore
    traversal.ts   ← 遍历 SceneNode 树，应用颜色调整 / 单色替换
    color.ts       ← 纯数学 OKLCH ↔ sRGB（无外部依赖）
    messaging.ts   ← 消息 / Payload 类型
  ui/              ← iframe 线程（React + Vite）
    App.tsx        ← 主界面、postMessage 桥、节流预览（50ms）
    store/         ← Zustand：滑块 / 开关 / 派生 payload
    components/    ← Slider, ColorWheel, SelectionBar, HistoryStrip, Logo…
```

两份 Vite 配置分别产出：
- `vite.config.ts` → UI (`dist/index.html`，React + Tailwind + 单文件内联)
- `vite.plugin.config.ts` → 插件代码 (`dist/code.js`，IIFE，`target: es2017`)

## QuickJS 沙箱约束

Figma 插件主线程跑在 QuickJS，ES2019 严格限制。**在 `src/plugin/` 中不可使用**：

- `??` / `?.` — 不支持
- `{...obj}` / `[...arr]` — 用 `Object.assign({}, obj, patch)` / `arr.slice()` 代替
- `for (const [k, v] of ...)` 解构 — 用索引循环 + `Object.keys()`
- 任何依赖以上语法的 npm 包（如 culori 内部用到 spread）

`src/ui/` 是 iframe，无此限制。

## 颜色引擎

`src/plugin/color.ts` 全是内联数学：

- sRGB ↔ OKLab ↔ OKLCH 双向转换
- `shiftColor()` — 在 OKLCH 空间做相对偏移（或 `strictHSL: true` 走 HSL 旧算法）
- `clampChromaToGamut()` — 20 步二分查找把越界色压回 sRGB，保持 L/H，只压 C
- `isGray()` — chroma < 0.02 判灰

## 通信协议

UI → Plugin：`preview`（节流）, `adjust`（提交）, `preview-reset`, `replace-color-preview`, `replace-color-apply`, `get-selection`, `get-history`, `save-history`

Plugin → UI：`selection-change`, `apply-result`, `preview-blocked`, `history`, `error`

预览采用 snapshot / restore 双相机制：第一次 `preview` 消息抓快照；`preview-reset` 或 `adjust` 清快照。提交走 `figma.commitUndo()` 写入 Figma 原生历史栈。

## 路线图

当前 P0 核心闭环已完成。后续计划：

- P1：智能筛选（按节点类型 / 颜色相似度）、色域警告、选区 diff 预览、键盘微调
- P2：配色方案库、批量对比副本、色相映射表、图片色调叠加

详见 [SomeHUE 插件开发计划](../../../Desktop/SomeHUE%20插件开发计划.md)（如可访问）。

## License

MIT
