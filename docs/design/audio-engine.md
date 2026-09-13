# 音频引擎

本文覆盖 `src/audio/` 的全部机制：信号图、并发防护、时钟积分、保调变速、分析与降级。所有参数值均经过源码核对。

## 总览

```text
DeckEngine(A) ──┐
                ├──→ crossA ──┐
DeckEngine(B) ──┘             ├──→ master(0.8) → limiter → analyser → destination
                ├──→ crossB ──┘
```

`MixerEngine` 持有两个 `DeckEngine` 与总线；`DeckEngine` 负责单个 Deck 的全部音频处理。两者都在 `AudioContext` 之上构建，不使用任何音频文件作为素材——示例曲目与混响脉冲都是**程序化生成**的，这是许可证故事的基础。

## MixerEngine 信号图

```text
Deck A ─→ crossA ─┐
                  ├─→ master ─→ limiter ─→ analyser ─→ destination
Deck B ─→ crossB ─┘
```

| 节点 | 参数 | 说明 |
|---|---|---|
| `crossA` / `crossB` | 等功率增益 | 由 `equalPowerGains(position)` 计算 |
| `master` | `gain = 0.8` | 留出限幅余量 |
| `limiter` | `threshold -6` `knee 3` `ratio 20` `attack 0.003` `release 0.12` | `DynamicsCompressorNode` 当作限幅器用 |
| `analyser` | `fftSize 1024` `smoothingTimeConstant 0.8` | |

**分析节点接在限幅器之后**，这是刻意的：可视化反映的是你**实际听到**的信号，而不是限幅前的信号。如果放在限幅前，遇到大动态段落时视觉会比听感先爆。

`AudioContext` 用 `latencyHint: 'interactive'` 构造。

所有增益变更用 `setTargetAtTime(value, now, 0.01)` 而非直接赋值——直接赋值会产生阶跃，听感上是"啪"声（zipper noise）。

### 横推子

`equalPowerGains(position)` 产生等功率曲线，使中间的响度感知与两端一致。直接用线性增益会让中间位置听起来明显更小。

### Sync

`MixerEngine.sync(source, target)` 依次检查：

1. 两个 Deck 都有曲目，否则返回"请先载入两个 Deck"
2. 都不在倒放，否则返回"请关闭倒放后再同步"
3. 两个拍点网格置信度都 ≥ 0.5，否则提示用 Tap Tempo 手动校准
4. 目标速度落在 60–200 BPM 内，否则提示先调 Harmony

通过后用 `tempoForAudible()` 把**听觉拍速**换算成标称速度，再 `seek` 到 `syncPosition()` 算出的对齐点。

注意这里用的是 `tempoForAudible` 而不是直接赋值——详见下文"保调变速"。

### 程序化素材

`createDemo()` 合成一段 32 秒、124 BPM 的双声道示例曲目：底鼓是带指数音高包络的正弦（48 Hz 起，快速下坠）、踩镲是白噪声乘指数衰减、贝斯是四个音的循环、外加一层弱的八度 pad，最后整体过 `tanh` 软削波。**没有音频文件**，所以分发它不涉及任何采样授权。

`createImpulse(1.8, 2.5)` 用同样的思路生成混响脉冲响应：白噪声乘 `(1 - i/N)^decay`。

## DeckEngine 信号图

```text
input(volume)
  → low(lowshelf 220Hz)
  → mid(peaking 1200Hz, Q 0.8)
  → high(highshelf 5000Hz)
  → filter(lowpass)
      ├─→ dry ─────────────────────────────────→ analyser → output
      ├─→ delay(0.28s) → delayWet ─────────────→ analyser
      │     └─→ feedback(0.28) ─→ delay         (反馈环)
      ├─→ convolver(1.8s) → reverbWet ─────────→ analyser
      └─→ flanger(0.006s) → flangerWet ────────→ analyser
              ↑ lfo(0.22Hz) → lfoDepth(0.003)
```

汇入 analyser 的是四条**并联**支路——一条干声（`dry`）加三条湿声（`delayWet` / `reverbWet` / `flangerWet`）。所以 Deck 自己的分析节点看到的是干湿叠加之后的信号，而不只是干声：开着混响时，可视化的拍点会先于听感出现。

| 参数 | 值 | 备注 |
|---|---|---|
| 低架滤波 | 220 Hz | 三段 EQ 范围 -24 ～ +12 dB |
| 峰值滤波 | 1200 Hz，Q 0.8 | |
| 高架滤波 | 5000 Hz | |
| 滤波扫频 | `80 × 250^v` Hz | v ∈ [0,1]，指数映射 |
| 延迟 | 0.28 s，反馈 0.28 | 湿声上限 0.8 |
| 混响 | 1.8 s 脉冲，衰减指数 2.5 | 湿声上限 0.8 |
| 镶边 | 0.006 s，LFO 0.22 Hz，深度 0.003 s | 湿声上限 0.8 |

滤波频率用 `80 × 250^v` 而不是线性插值：0 时是 80 Hz，1 时是 20000 Hz。线性映射会让整个可听频段的可用变化挤在旋钮的最后 20% 里，指数映射才符合听感。

## 并发防护：三套 generation 计数器

这是 `DeckEngine` 里最重要也最容易改错的部分。音频操作大量涉及 `await`（解码、注册 worklet、恢复上下文），而用户可以在任意两次 `await` 之间做别的操作。

解法是**每次异步操作开始时领一个号，await 回来后比对号码**——号码变了说明有更新的操作插队，这次的结果必须丢弃。

| 计数器 | 递增时机 | 防的是什么 |
|---|---|---|
| `generation` | `beginLoad()`、`dispose()` | 解码完成时用户已经载入了另一首；分析结果回来时曲目已经换了 |
| `playGeneration` | `play()`、`stopSource()` | `await context.resume()` 期间用户按了暂停；起播与「暂停后立刻播放」的竞态 |
| `keyLockGeneration` | `setKeyLock(true)`、`dispose()` | 异步创建 worklet 期间用户再次开启（作废先前那次重复创建）、或组件已卸载。**注意 `setKeyLock(false)` 在自增之前就 return，关闭方向不经过这个计数器** |

典型写法（`play()`）：

```ts
const generation = ++this.playGeneration;
await this.context.resume();
if (generation !== this.playGeneration || !this.buffer || this.disposed) return;
```

**`await` 前后都要检查**。只查前面不够——await 期间状态可能已经变了。

`beginLoad()` 还会 `abort()` 上一个分析的 `AbortController`，让 Worker 侧也停下来，而不是算完再丢。

## TransportClock：为什么需要一个积分时钟

`AudioBufferSourceNode.playbackRate` 是一个 `AudioParam`。变速时我们让它**线性斜坡**过去（`linearRampToValueAtTime(rate, now + 0.025)`），这样听感平滑。

但 JS 这边立刻面临一个问题：**播放头现在到底在哪？** `AudioBufferSourceNode` 不提供当前播放位置。而 UI 需要它（进度条），Sync 需要它（对齐拍点），循环需要它（判断回绕）。

斜坡期间速度是随时间变化的，位置是速度的**积分**。`TransportClock` 就是把这个积分闭式解出来：

```ts
const during = Math.min(elapsed, this.ramp);
const integral = this.ramp > 0
  ? this.from * during
    + (this.to - this.from) * during * during / (2 * this.ramp)
    + Math.max(0, elapsed - this.ramp) * this.to
  : elapsed * this.to;
```

三项分别是：斜坡期间的起始速度贡献、线性加速的二次项、斜坡结束后按终速的匀速贡献。单位是**源秒**（source seconds），不是墙上时间。

关键在于 `DeckEngine.updateRate()` 里这两行必须**用同一个值**：

```ts
const from = this.clock.setSpeed(clockRate, now);
this.source.playbackRate.setValueAtTime(from, now);
this.source.playbackRate.linearRampToValueAtTime(clockRate, now + 0.025);
```

时钟和 AudioParam 走的是同一条斜坡、同样的 0.025 秒、同样的起止速度。任何一边改了参数而另一边没改，画面上的播放头就会和声音分离——而且分离量会随每次变速累积。

`setSpeed()` 返回的是**斜坡开始前的瞬时速度**，正是为了让 `setValueAtTime` 从这个值起步，避免中途变速时出现跳变。

### 循环回绕

`wrapPosition(position, start, end)` 用 `((x % n) + n) % n` 处理负数。JS 的 `%` 对负数返回负值，直接取模在倒放时会得到负的位置。

## 保调变速（Key Lock）

关闭时，速度和音高绑死；开启时，速度独立，Harmony 变成纯移调。

`resolveRates()` 是全部逻辑所在，返回三个数：

| 字段 | 关锁 | 开锁 |
|---|---|---|
| `clockRate` | `tempo × harmony` | `tempo` |
| `workletRate` | `tempo × harmony` | `tempo` |
| `workletPitch` | `1`（旁路） | `harmony` |

其中 `tempo = bpm / sourceBpm`，`harmony = 2^(keyShift/12)`。

时钟积分的永远是 `clockRate`——**它追踪的是音频源的实际播放速率**，所以开锁时它只含 tempo。开锁时源以 `workletRate`（同样只含 tempo）播放，产生音高偏移，再由 SoundTouch worklet 以 `workletPitch` 把它拉回来。

### audibleBpm 与 tempoForAudible 为什么是一对互逆函数

关锁时 Harmony 会改变**听到的拍速**（升八度 → 拍速翻倍）。所以有两个不同的"BPM"：

- `bpm` —— 标称值，UI 旋钮上的数
- `audibleBpm()` —— 实际听到的拍速

`MixerEngine.sync()` 要让目标 Deck 的**听觉**拍速匹配源 Deck，所以必须走反向换算：

```ts
const tempo = tempoForAudible(a.currentBpm, b.snapshot().keyLock, b.snapshot().keyShift);
b.setTempo(tempo);
```

直接把 `a.currentBpm` 赋给 `b` 是错的——当 `b` 关着锁且带移调时，两者的听觉拍速并不相等。这个函数存在的唯一理由就是这个。

### 为什么必须动态 import

`worklet.ts` 必须用动态 `import()` 加载 SoundTouch。原因：该包在**模块顶层**就 `extends AudioWorkletNode`。在不支持 AudioWorklet 的浏览器里，这个顶层求值会直接抛错，而静态 import 会在 React 挂载之前就求值——结果是**白屏**，连错误提示都来不及显示。

动态 import 让这个失败推迟到用户真正点击保调变速开关时（`setKeyLock`），此时可以捕获并显示"当前浏览器不支持保调变速（需要 AudioWorklet）"。

### 开关是异步的

`setKeyLock(true)` 需要先向 `AudioContext` 注册 worklet 处理器，再创建节点——两步都是异步的。期间用 `keyLockGeneration` 防止用户连点造成重复创建。若创建失败，`keyLockAvailable` 置 false 并给出文案，Deck 上的开关会被禁用。

切换时会**重建音频源**（`applyKeyLock` → `stopSource` → `play`），因为 worklet 在信号链上的位置变了。位置和播放状态通过 `clock.anchor` 保留，听感上是无缝的。

## 倒放

不是用负的 `playbackRate`（浏览器不支持），而是**预翻转缓冲区**：

`getReverseBuffer()` 首次调用时按声道把样本数组整个反转，结果缓存到 `this.reverseBuffer`。同一首曲子反复开关倒放不会重复计算。

三处必须同步镜像，少一处就会错位：

| 位置 | 正放 | 倒放 |
|---|---|---|
| 起播偏移 | `start(0, position)` | `start(0, duration - position)` |
| 循环起点 | `loopStart = start` | `loopStart = duration - loop.end` |
| 循环终点 | `loopEnd = end` | `loopEnd = duration - loop.start` |

注意循环区间是**整体翻转**（起点取自终点、终点取自起点），不是各自加个负号。

## 自然结束检测

播放列表要"一首自然播完自动接下一首"，但**暂停、跳转、循环回绕都不能触发**。区分方法在 `stopSource()`：

```ts
this.source.onended = null;   // 先摘掉回调
this.source.stop();
```

主动停止前先清空 `onended`，所以**能进到 `onended` 就一定是自然播完**。回调里再检查 `if (!this.clock.loop)` 排除循环曲目。

这个技巧比维护"是不是主动停的"布尔标志更可靠——标志需要在每个停止路径上正确设置，漏一处就是 bug；而清回调只有一处。

## 手动修正的优先级

用户手动改了 BPM 或首拍后，异步分析结果回来**不能覆盖**它。判断依据是 `grid.source`：

```ts
if (this.grid?.source !== 'manual') { /* 才允许用分析结果回填 */ }
```

`setSourceBpm()` 还会**保留速度比**：

```ts
const ratio = this.bpm / this.sourceBpm;
this.sourceBpm = bpm;
this.bpm = clamp(bpm * ratio, 60, 200);
```

所以用户正在以 1.2 倍速播放时修正源 BPM，播放不会突然变速——修正的是"原曲本来多快"，不是"现在放多快"。

首拍修正（`setFirstBeat`）把当前位置存为 `firstBeat`，置信度直接记 1、来源记为 `manual`。

## 拍点分析

`beatAnalysis.ts` 是纯函数（`analyzeSamples`），由 `analyzeBuffer` 装进 Worker 里跑，避免阻塞主线程。

算法是**起音包络自相关**：

| 步骤 | 做法 |
|---|---|
| 波形摘要 | 768 个桶，每桶取绝对值最大 |
| 降采样 | hop = `sampleRate / 200`，即 200 Hz 包络 |
| 时长限制 | 只取前 120 秒 |
| 样本下限 | 少于 800 帧（约 4 秒）直接放弃 |
| 起音函数 | `max(0, rms - previous × 0.85)` —— 半波整流差分 |
| 静音闸门 | 峰值能量 < 0.003 直接放弃 |
| 自相关范围 | lag 从 `hz×60/200` 到 `hz`，即 60–200 BPM |

**置信度公式**：

```ts
confidence = min(0.95, best × 0.9 + (best - runnerUp) × 0.1)
```

它融合两个信号：`best` 是相关强度（节奏是否明显），`(best - runnerUp)` 是与亚军的差距（速度是否**明确**）。只有强度没有差距意味着多个 lag 得分接近——典型的倍速/半速歧义，此时置信度应该低。上限 0.95 是因为自相关终究是启发式，留一点余地。

**首拍的选法**也值得一提：不是取全局能量最大点，而是先在获胜相位内找**最早的强起音**（能量 > 全局最大 × 0.35）。全局最大点往往是副歌，取它会让拍线从副歌开始而不是从第一拍开始。

因为固定网格不跟踪变速曲，这个网格对节奏漂移的音乐会逐渐失准——这是已知边界，写在 [README 的使用边界](../../README.md#使用边界)里。

## Deck 状态机

```text
             load()              解码成功
empty ────→ loading ───────────→ ready
（初值）      │                     │
             │ 解码失败             │ load() 新曲
             ↓                     │
           error ←─────────────────┘
             │
             └── load() 新曲 ──→ loading
```

**`empty` 只是构造时的初值，一旦离开就不再进入**——源码里除了字段初始化，没有任何路径把 `status` 置回 `'empty'`。从 `ready` 或 `error` 重新 `load()` 都会回到 `loading`。

| 状态 | 含义 | UI 表现 |
|---|---|---|
| `empty` | 未载入 | Deck 显示为空 |
| `loading` | 正在解码 | 载入指示 |
| `ready` | 可播放 | 波形与控件可用 |
| `error` | 解码失败 | 显示 `error` 字段中的文案 |

`install()` 在解码成功后把状态置为 `ready` 并立刻 `emit()`——**不等分析完成**。分析是后台跑的，完成后通过 `onAnalysis` 回调把拍点与波形补上，期间 `analysisPending` 为 true。这样用户不用等分析就能开始播放。

## 日志与错误

引擎不吞错误，也不向用户抛原始异常。两类处理方式：

- **可预期的失败** → 翻译成中文文案，通过 `error` 字段或返回值送达
- **不可恢复的状态** → 抛异常，由命令层（`useMusicActions`）捕获并转成 toast

`DeckEngine.dispose()` 会断开全部节点、停止 LFO、取消在途分析、递增所有 generation 让在途异步操作作废。
