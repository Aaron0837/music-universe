# 测试策略

## 两层，各管一段

| 层 | 工具 | 规模 | 跑什么 |
|---|---|---|---|
| 单元 | Vitest（jsdom） | 12 个文件 / **135 个用例** | 纯函数与状态规则 |
| 端到端 | Playwright | 7 个 spec / **39 个用例** | 真实浏览器里的音频、布局、离线 |

职责划分很清楚：**单元测试断言"算得对不对"，端到端断言"整体跑不跑得起来"。**

## 单元层：纯函数优先

仓库里有大量 `*Math.ts`，这不是巧合：

```text
src/audio/audioMath.ts           频段均值、RMS、瞬态、BPM 归一
src/audio/engine/mixerMath.ts    等功率横推子曲线
src/audio/engine/syncMath.ts     拍点对齐位置
src/audio/keylock/keyLockMath.ts 速率三元组解析
src/playlists/playlistMath.ts    排序、去重、播放模式、洗牌排列
```

它们都是**无副作用、不碰 AudioContext、不碰 DOM** 的函数。同一个原则也用在 `src/library/collection.ts`（收藏/历史/睡眠定时规则）、`src/lyrics/lrc.ts`（歌词解析）、`src/theme/palette.ts`（取色与对比度校正）。

**把规则从副作用里剥出来，是这些函数存在的主要理由之一。** 例如 `keyLockMath.ts` 的 `resolveRates()` 只做算术，所以"开锁时时钟速率只含 tempo"这条断言不需要构造 `AudioContext` 就能验证——而 `AudioContext` 在 jsdom 里根本不存在。

Vitest 配置（`vite.config.ts`）：

```ts
test: {
  environment: 'jsdom',
  include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  setupFiles: ['./src/test/setup.ts'],
}
```

测试与被测代码同目录，文件名叫 `<模块>.test.ts`。`src/test/setup.ts` 目前只有一行。

## 端到端层：三个引擎，但 WebKit 被裁剪

```ts
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
  {
    name: 'webkit',
    use: { ...devices['Desktop Safari'] },
    testMatch: /(offline|degradation)\.spec\.ts/,
  },
]
```

**Playwright 在 Windows 上打包的 WebKit 不含 Web Audio。** `AudioContext`、`OfflineAudioContext`、`AudioWorkletNode` 在这个构建里全是 `undefined`。

所以 WebKit 只跑两个 spec（离线与降级，共 4 个用例，其中离线的冷启动用例在 WebKit 上被 `test.skip` 跳过，实际执行 3 个），其余 35 个在 Chromium 与 Firefox 上跑。

| spec | 用例 | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| `app.spec.ts` | 16 | ✓ | ✓ | — |
| `collection.spec.ts` | 10 | ✓ | ✓ | — |
| `lyrics.spec.ts` | 5 | ✓ | ✓ | — |
| `offline.spec.ts` | 2 | ✓ | ✓ | ✓ |
| `degradation.spec.ts` | 2 | ✓ | ✓ | ✓ |
| `keylock.spec.ts` | 2 | ✓ | ✓ | — |
| `playlists.spec.ts` | 2 | ✓ | ✓ | — |

用例数请以 `npx playwright test --list` 为准，不要数 `test(` 字面量——`app.spec.ts` 里有一处 `for (const width of [390, 768, 1440, 1920])` 循环会把一条语句展开成 4 个用例。

### 为什么 `workers: 1`

```ts
// These suites assert on real-time audio and layout; running them in parallel
// starves the CPU and produces timing flakes rather than useful failures.
workers: 1,
```

套件断言的是**实时音频输出**与**布局尺寸**。并行跑多个 worker 会互相抢 CPU，导致音频掉帧、布局测量偏差——失败是环境造成的，不是代码造成的。这类"看起来像 bug 的噪音"比慢更糟：它会训练人忽略红色。

代价是 e2e 是串行的，慢。这是明确的取舍。

### 测试服务器

```ts
webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173', port: 4173, reuseExistingServer: true },
```

复用已存在的服务，所以本地开着 dev server 时跑 e2e 不需要重启。`tests/staticServer.ts` 是一个独立的小服务，给离线 spec 用（Service Worker 需要可控的响应）。

`tests/keylock-harness.html` 是保调变速的专用页面：在页面里直接渲染一段测试音并测量基频，绕开 UI 交互。

## 降级路径是被专门测试的

`degradation.spec.ts` 的两个用例守着两条真实的降级路径：

1. **没有 AudioWorklet** —— 保调变速开关应被自动禁用并在 Deck 上说明原因，其余功能不受影响
2. **完全没有 Web Audio** —— 应用仍能加载外壳

这两条路径容易在重构中被无声破坏：在支持 AudioWorklet 的开发机上，它们永远不会被走到。WebKit 恰好天然具备"没有 Web Audio"这个条件，所以它反而成了这条路径的测试平台。

对应地，`src/audio/keylock/worklet.ts` 必须**动态 import** SoundTouch（见 [audio-engine.md](audio-engine.md)），否则静态求值会在这些环境里造成白屏，而白屏意味着连降级提示都显示不出来。

## 测试抓到过的真实 bug

以下都记录在提交信息里，是这套测试的实际产出：

| bug | 被哪一层抓到 |
|---|---|
| 「单曲循环」对从曲库直接播放的单曲无效（没有队列时走不到那条分支） | 单元 + e2e |
| 对比度修正器让纯灰封面**凭空造出一个色相** | 单元 |
| 歌词编辑器在存量文本加载完成前就显示，导致早期输入被吞 | e2e |
| e2e 自身的两处竞态：断言只读一次列表而非轮询；页面重载抢在异步写入之前 | e2e |

最后一条值得注意——**测试也会写出竞态**。用户点完收藏立刻 reload，写入可能还没落盘；断言如果不轮询就会随机失败。这类问题在测试里和在产品代码里一样需要认真对待。

## 已知盲区

诚实地列出这套测试**覆盖不到**的东西：

1. **听感**。自动化只能检查输出电平与基频，不能判断"好不好听"。混响、限幅、EQ 的实际听感必须用真实扬声器试听。
2. **真实 Safari / iOS / Android**。WebKit 的测试跑在 Playwright 的构建上，它没有 Web Audio；真实 Safari 的音频实现完全没被覆盖。移动端的触控、省电策略、后台行为同样没有覆盖。
3. **真实设备性能**。自动降级逻辑（180 帧 / 35fps）只在代码层被验证，没有在真实低端设备上跑过完整的降级链路。
4. **长时间运行**。没有内存泄漏与显存增长的持续测试。预设反复切换的资源释放由 `src/presets/disposal.test.ts` 在单元层守着，但真实 WebGL 上下文的行为更复杂。

[README 的使用边界](../../README.md#使用边界) 与 [README 的测试章节](../../README.md#测试) 都强调了同一条：**自动测试通过不等于全平台验收**。

## CI 如何跑

两个工作流，职责分开：

| 工作流 | 触发 | 跑什么 |
|---|---|---|
| `ci.yml` | 所有 `pull_request` | `npm ci` → `npm test` → `npm run build` |
| `deploy.yml` | `push` 到 main、手动触发 | `npm ci` → `npm test` → `npm run build` → 部署 Pages |

`ci.yml` 是专门为 fork 的 PR 加的——`deploy.yml` 只看 main，外部贡献者的 PR 拿不到任何检查。

**两者都只跑单元测试，不跑 e2e。** 原因是 e2e 需要下载三个浏览器引擎（数百 MB）且串行执行，在每次 PR 上都跑代价过高。这意味着**当前 CI 不会捕获端到端的回归**——它保证的是纯函数正确、类型正确、构建成功。

如果要把 e2e 接进 CI，建议单独的 job 并只跑 Chromium，用缓存保留浏览器下载。

## 本地怎么跑

```bash
npm test
```

```bash
npm run test:e2e
```

多引擎需要先装浏览器：

```bash
npx playwright install firefox webkit
```

套件固定跑 Playwright 自带的三个 project（Chromium / Firefox / WebKit），**不读取任何环境变量来切换浏览器**。要用系统已装的 Chrome，需要在 `playwright.config.ts` 的对应 project 上加 `channel: 'chrome'`（Edge 则为 `channel: 'msedge'`）——仅设置环境变量没有效果。
