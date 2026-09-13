# AGENTS.md

给在本仓库工作的 AI 编码代理的说明。人类贡献者请看 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 推送纪律

**main 分支由 CI 自动构建并部署到 GitHub Pages。因此把关必须发生在推送之前：**

1. 所有改动先在本地验证，必须跑通 `npm test` 与 `npm run build`。
2. **收到仓库所有者明确说"可以推送"之后**，才允许 `git commit` 与 `git push`。
3. 不要自行判断"看起来没问题"就推送 —— 一次 main 推送就等于一次线上部署。

## 本地验证命令

```bash
npm test          # Vitest 单元测试（135 个，约 2 秒）
npm run build     # tsc -b && vite build，同时覆盖类型检查
```

改动涉及真实音频或布局时，再加：

```bash
npm run test:e2e  # Playwright，Chromium / Firefox / WebKit
```

## 这个项目的约束

- **不引入服务端。** 音乐、封面与分析结果只存在浏览器 IndexedDB 里，不上传、不接入遥测。这是产品承诺，不是待办事项。
- **不改动 `src/types/` 的类型归属划分**：`models.ts` 是数据域，`visuals.ts` 是渲染 / 交互 / 预设域。
- **`src/state/AppState.ts` 是故意的可变单例**，不是遗留代码。每帧数据走它绕过 React 重渲染，坐标不进 Zustand。
- **新增可视化预设**必须实现 `dispose`、避免逐帧分配、兼容减少动态效果，并在 `src/presets/index.ts` 注册一次。
- 文件与目录不得同名。历史上 `src/audio/analysis.ts` 和 `src/audio/analysis/` 撞过名，已分别改为 `audioMath.ts` 与保留目录，不要再制造同类冲突。
