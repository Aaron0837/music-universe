# CLAUDE.md

本文件给在本仓库工作的 Claude Code。人类贡献者看 [CONTRIBUTING.md](CONTRIBUTING.md)。

**先读 [AGENTS.md](AGENTS.md)。** 那里的推送纪律（未经仓库所有者明确说"可以推送"不得 commit / push）
与项目约束（不引入服务端、不改动 `src/types/` 的类型归属划分、`src/state/AppState.ts` 是故意的可变单例、
文件与目录不得同名）同样适用于你，本文件不重复。

## 跑端到端测试必须开浏览器窗口

`playwright.config.ts` 的 `use` 只有 `baseURL`，没有设 `headless: false`，所以 Playwright 的默认行为是
无窗口。**本仓库不要这个默认值——跑 e2e 一律带 `--headed`：**

```bash
npm run test:e2e -- --headed
```

只跑一个 spec 时同样要带：

```bash
npm run test:e2e -- --headed app.spec.ts
```

理由是这套 e2e 断言的东西：**真实音频输出与布局尺寸**（见 [docs/design/testing.md](docs/design/testing.md)）。
headless 下失败只会给你一行红色断言，看不到界面当时长什么样；开窗后人能全程看着测试点击、切页、
拖文件导入，失败时一眼就能分清是布局塌了、音频没起来，还是用例自己写错了。

### 两点代价，出问题先怀疑这里

1. **更慢**。`workers: 1` 本来就是串行（`playwright.config.ts` 里写了原因：并行会抢 CPU，让实时音频
   掉帧、布局测量偏差，产生假失败），再叠加三个引擎（Chromium / Firefox / WebKit）依次开窗。
2. **时序会变**。开窗引入真实的合成与 vsync 开销。若某条用例只在 headed 下红、headless 下绿，
   先用 `npm run test:e2e -- <spec>` 复核一次，再判断这是产品代码的问题还是窗口本身造成的——
   不要把窗口带来的抖动当成 bug 去改代码。

### 不要用 `MU_BROWSER`

**全仓库没有任何代码读取这个环境变量**，设了它仍然启动 Playwright 自带的浏览器，和你想
"用系统 Chrome / Edge 跑"的意图不符。README 与 `docs/design/testing.md` 里曾有的
`MU_BROWSER=chrome` 说明已因不实而移除。

要看窗口就用上面的 `--headed`；要固定用系统浏览器，得在 `playwright.config.ts` 的对应 project 上加
`channel: 'chrome'`（Edge 则为 `channel: 'msedge'`）——仅设置环境变量无效。

### 单元测试不加这个参数

`npm test`（Vitest + jsdom）里不存在窗口这个概念，`--headed` 无意义。CI 也只跑 `npm test` 与
`npm run build`，不跑 e2e，所以这条规则不会和 CI 冲突。
