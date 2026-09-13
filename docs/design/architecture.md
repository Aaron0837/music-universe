# 架构

本文说明 Music Universe 的分层、数据流向与模块边界。想快速了解"有什么功能"请看根目录 [README](../../README.md)；本文回答"为什么这样组织"。

## 一句话概括

一个**纯客户端**的音乐应用：没有服务端、没有账号、没有网络请求。所有音乐、封面与分析结果都存在浏览器的 IndexedDB 里。整个应用是一组静态文件，可以离线冷启动。

## 四层结构

```text
┌─────────────────────────────────────────────────────────┐
│  UI 层          src/pages/  src/components/             │
│                 只读状态、发命令，少数直连引擎            │
├─────────────────────────────────────────────────────────┤
│  命令层         src/hooks/useMusicActions.ts            │
│                 src/playlists/queue.ts                  │
│                 把用户意图翻译成引擎调用                  │
├─────────────────────────────────────────────────────────┤
│  引擎层         src/audio/engine/   src/rendering/      │
│                 src/audio/analysis/                     │
│                 无 React 依赖，可独立测试                 │
├─────────────────────────────────────────────────────────┤
│  持久化层       src/data/                               │
│                 LibraryRepository（端口）+ Dexie（适配器）│
└─────────────────────────────────────────────────────────┘
```

`src/theme/` **横跨引擎层与 UI 层**，不属于任何一层：`palette.ts` 与 `artworkTheme.ts` 是无 React 依赖的纯逻辑，而 `useArtworkPalette.ts` 是该目录唯一的 React 适配器（它本身是个 hook）。把整个目录划进引擎层是不准确的。

依赖方向**严格向下**：UI 依赖命令层与状态，命令层依赖引擎与持久化。引擎层（`src/audio/engine/`、`src/audio/analysis/`、`src/rendering/`）不依赖 React。`src/data/` 不反向依赖 UI。

## 数据流

```text
React pages / components → serializable Zustand snapshots
           ↓ commands
MixerEngine → Deck A / B → Gain / EQ / Filter / FX
           → equal-power crossfader → Master / limiter → output
           ↓ audio frames
Canvas / Three.js       RhythmSession ← TransportClock / BeatGrid
           ↑
LibraryRepository → Dexie v3 ← beat analysis Worker
```

## 三条"每帧"通道

这是本项目最容易被误读的设计。**不是所有高频数据都走 React**——恰恰相反，只有一条走 React，另外两条刻意绕开了它。

### 通道 1：音频帧 → 可视化（完全绕过 React）

`MixerEngine.frame()` 每个渲染帧被 `UniverseRenderer.onFrame` 调用一次，直接喂给预设的 `update()`：

```text
MixerEngine.frame() → UniverseRenderer.loop → PresetInstance.update()
```

这条路径上**没有 React**。可视化每秒重绘 60 次，如果每次都触发组件重渲染，主线程会被 React 的 diff 拖垮。

代价是实现者必须自己管内存：`MixerEngine` 里的 `VisualizerFrame` 是一个**复用对象**，每帧用 `Object.assign` 原地更新，而不是新建。两个 `Uint8Array`（频谱与时域）在构造时分配一次，之后复用。所以这条通道**零逐帧分配**，不产生 GC 压力。同样的模式也用在 `InteractionController.frame` 上。

### 通道 2：Deck 快照 → Zustand（事件 + 轮询）

Deck 的状态（播放中、音量、BPM、位置……）需要驱动 UI，所以走 React。但它用了**两种机制叠加**：

| 机制 | 位置 | 用途 |
|---|---|---|
| 事件推送 | `DeckEngine.onSnapshot` → `updateDeck()` | 音量、EQ、播放/暂停等**离散**变更，立即反映 |
| 180ms 轮询 | [App.tsx](../../src/app/App.tsx) 的 `setInterval` | **连续**变化的播放位置 |

为什么需要轮询？因为 `DeckEngine.emit()` 只在状态变更时触发，而 `position` 是**每帧都在变**的——它不是一次"变更"，是一个连续的积分值。如果没有轮询，进度条会僵在按下播放的那一刻。

180ms（约 5.5 Hz）是刻意的低频率：它只驱动一个进度显示，人眼对更高频率没有感知，而每 16ms 推一次快照会让整个组件树每秒重渲染 60 次。

订阅是**惰性建立**的：轮询回调先检查 `peekMixer()` 是否已有实例，没有就等到下次——因为音频引擎要等用户手势才会被创建（见下文"音频引擎的诞生时机"）。

### 通道 3：指针坐标与逐帧设置 → 复用对象与可变单例

鼠标位置、捏合缩放、按下能量这类数据每帧都变，放进 Zustand 会让整棵树重渲染。它们进 `InteractionController.frame` 这个**复用对象**（`src/interaction/`），每帧原地更新，由渲染循环直接读字段，不触发任何订阅。

色相、灵敏度、减少动态效果、当前预设这类**每帧要读的设置**则进 `AppState` 这个 13 行的可变单例，同样由渲染循环直接读，不走订阅。

详见 [state.md](state.md) 与 [rendering.md](rendering.md)。

## 音频引擎的诞生时机

`src/audio/engine/runtime.ts` 只有 12 行，但它解决两个问题：

```ts
export function getMixer(): MixerEngine      // 首次调用时创建，之后复用
export function peekMixer(): MixerEngine | undefined  // 不触发创建，没有就返回 undefined
```

**为什么懒创建**：浏览器禁止在用户手势之前创建或恢复 `AudioContext`。如果模块加载时就 `new MixerEngine()`，会得到一个永久 `suspended` 的上下文，或者控制台一片警告。

**为什么需要 `peekMixer`**：轮询代码（180ms 间隔、睡眠定时器每秒检查）需要问"引擎起来了吗"，但不该**因为问了就把引擎创建出来**。`getMixer` 会创建，`peekMixer` 不会——这个区分让轮询可以安全地存在。

## 模块地图

| 目录 | 职责 |
|---|---|
| `src/app/` | 应用外壳：路由分发、全局副作用（拖放、快捷键、主题应用） |
| `src/pages/` | 七个页面。除发现页与曲库页外全部懒加载 |
| `src/components/` | 按功能分组：dj / player / library / rhythm-game / visualizers / ui |
| `src/hooks/` | 命令层：把用户意图翻译成引擎调用 |
| `src/stores/` | Zustand 状态（应用状态 + 用户偏好） |
| `src/state/` | 每帧可变单例，**故意不是 Zustand** |
| `src/data/` | 持久化边界：接口（端口）+ Dexie 适配器 |
| `src/library/` | 收藏 / 历史 / 睡眠定时的纯规则，不含存储 |
| `src/playlists/` | 队列连放、播放模式、洗牌排列 |
| `src/lyrics/` | 各容器歌词格式归一为 LRC 后解析 |
| `src/theme/` | 封面取色、对比度校正、CSS 变量写入 |
| `src/audio/engine/` | 音频节点、积分时钟、同步数学 |
| `src/audio/analysis/` | Worker 驱动的后台拍点与波形分析 |
| `src/audio/keylock/` | 保调变速（SoundTouch AudioWorklet） |
| `src/audio/audioMath.ts` | 逐帧信号数学（纯函数） |
| `src/rendering/` | 渲染循环、后处理管线、调色着色器 |
| `src/presets/` | 原创可视化预设，在 `index.ts` 集中注册 |
| `src/interaction/` | 指针与滚轮输入，输出每帧交互快照 |
| `src/types/` | 类型，按域分文件 |

`src/audio/audioMath.ts` 与 `src/audio/analysis/` 是**不同层次**：前者是引擎每帧调用的信号数学（频段均值、RMS、瞬态），后者是后台 Worker 里的拍点分析。二者曾经同名，已分开。

## 类型按域划分

`src/types/` 下有两个文件，切分依据是**数据域**而非技术性质：

| 文件 | 域 | 代表类型 |
|---|---|---|
| `models.ts` | 数据 | `Track`、`Playlist`、`DeckSnapshot`、`BeatGrid` |
| `visuals.ts` | 渲染 / 交互 | `AudioFrame`、`InteractionFrame`、`UniversePreset`、`Quality` |

这样划分的效果是：改动可视化预设时不会碰到数据模型，反之亦然。两个文件没有共享类型，边界干净。

## 错误如何呈现

引擎层不向用户抛异常，而是**把失败翻译成能直接读的文案**：

- `MixerEngine.sync()` 返回字符串——成功是"Deck B 已匹配 Deck A 的速度与拍点"，失败是"拍点置信度不足，请用 Tap Tempo 或手动 BPM 和首拍校准"
- `DeckEngine` 的 `error` 字段存的是完整句子，如"浏览器无法解码这首音乐，请尝试 WAV 或 MP3。"
- UI 通过 `useAppStore.notify()` 弹 toast

例外是真正不可恢复的情况（如 AudioContext 仍未 running），那里仍然抛异常，由命令层捕获并转成文案。

## 边界规则

给未来改动的约定：

1. **新代码应通过 `useMusicActions` 与 store 操作播放。** 但现状并非如此：为低延迟的实时控制，`DJPage`、`DeckPanel`、`PlayerDock`、`NowPlaying`、`RhythmGame` 都直接 import `audio/engine/runtime`，并直接调用 `MixerEngine` / `DeckEngine` 的方法（横推子、主音量、SYNC、播放/暂停、seek、搓碟、Tempo、EQ、Filter、FX、Cue、Loop、倒放）。可视化页同样直连，它需要渲染器实例驱动 canvas。这是既有实现，不是待办——加新功能时走命令层与 store，不要继续扩散。
2. **`src/data/` 不 import React 或 store**。它是纯持久化，可脱离 UI 测试。
3. **纯规则放纯函数**。收藏规则、洗牌排列、LRC 解析、取色数学都写成无副作用的函数——这既让它们可被单元测试，也是仓库里大量 `*Math.ts` 存在的原因。
4. **每帧数据不进 React**。新增可视化或高频交互时，走 `AppState` 或复用对象，不要加进 Zustand。
5. **文件与目录不得同名**。历史上 `src/audio/analysis.ts` 与 `src/audio/analysis/` 撞过名，已分别改为 `audioMath.ts` 与保留目录。
