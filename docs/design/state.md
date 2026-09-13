# 状态管理

本项目有**三套并存的状态机制**，各司其职。混用它们是最容易犯的错，所以先讲清分工。

## 三套机制

| 机制 | 位置 | 更新频率 | 触发 React 重渲染 | 持久化 |
|---|---|---|---|---|
| `useAppStore` | `src/stores/useAppStore.ts` | 用户操作 + 180ms 轮询 | 是 | Dexie `settings` 表（部分字段） |
| `usePreferences` | `src/stores/usePreferences.ts` | 用户改设置 | 是 | `localStorage`（zustand/persist） |
| `AppState` | `src/state/AppState.ts` | **每帧** | **否** | 无 |

### 为什么 `AppState` 不是 Zustand

`src/state/AppState.ts` 只有 13 行：

```ts
export class AppState {
  sensitivity = 1;
  hue = 282;
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  uiHidden = false;
  activePreset = 'nebula';
  language: 'en' | 'zh' = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  private listeners = new Set<StateListener>();
  subscribe(listener: StateListener): () => void { ... }
  notify(): void { ... }
}
```

它承载的是**渲染循环每帧要读**的数据：色相、灵敏度、减少动态效果、当前预设。

如果这些进 Zustand，那么每帧都在变的指针数据（`InteractionController.frame` 的 `worldX` / `worldY`）就会走订阅通知——鼠标一动就触发订阅了该字段的组件重渲染。而真正的消费者是 `requestAnimationFrame` 循环——它压根不需要 React 通知，它下一帧自己就会读。

**订阅机制仍然存在**（`subscribe` / `notify`），但只服务于需要感知"预设换了"这类低频事件的地方，不是每帧数据的主通道。

> 这不是遗留代码。缺少文档时它看起来像，所以 [architecture.md](architecture.md) 与根 README 都专门说明了它存在的理由。

### 为什么偏好单独一个 store

`usePreferences` 存 `pointerEffects` / `reducedMotion` / `latencyMs` / `feedbackVolume`，用 zustand 的 `persist` 中间件自动同步到 `localStorage`（键名 `mu-preferences-v2`）。

它和 `useAppStore` 分开的理由是**持久化方式根本不同**：偏好是纯本地的界面设置，`localStorage` 的同步读写完全够用；而收藏/历史/播放模式要和其他曲库数据留在一起、走同一条异步写路径。混在一个 store 里就意味着一个 store 要同时管两种持久化策略。

键名里的 `-v2` 是版本后缀——结构变了就换键名，旧数据自然废弃，不需要写迁移逻辑。

## 三条持久化路径

存储位置不统一，这是**有意为之**，但确实需要一张表才看得清：

| 数据 | 存哪 | 谁写 | 为什么 |
|---|---|---|---|
| 主题 | `localStorage` 键 `mu-theme` | `useAppStore.setTheme` | 要在首帧渲染前同步读到，避免闪烁 |
| 界面偏好 | `localStorage` 键 `mu-preferences-v2` | zustand/persist | 同上，且与曲库无关 |
| 收藏 / 最近播放 / 播放模式 | Dexie `settings` 表 | `collectionSink` | 属于曲库数据，与其他表同生命周期 |
| Deck 状态、队列、当前视图 | 不持久化 | — | 会话内状态，刷新即重置 |

主题为什么不用 Dexie：它是一个异步数据库。等 IndexedDB 打开再决定用浅色还是深色，用户会看到一次明显的闪烁。`localStorage` 是同步的，能在首次绘制前读到。

## `collectionSink`：依赖注入保住可测试性

这是 `useAppStore` 里最值得说明的一处设计。

store 需要保存收藏与历史，但**不能直接 import 数据层**——那样 store 就无法在不启动 IndexedDB 的情况下被单独测试。

解法是留一个可注入的槽位：

```ts
export const collectionSink: { save?: (favorites: string[], recent: string[], playMode: PlayMode) => void } = {};

function persist(state: Pick<AppStore, 'favorites' | 'recent' | 'playMode'>): void {
  collectionSink.save?.(state.favorites, state.recent, state.playMode);
}
```

真正的实现在 `App.tsx` 里挂上：

```ts
collectionSink.save = (favorites, recent, playMode) => {
  void Promise.all([
    libraryRepository.saveSetting('favorites', favorites),
    libraryRepository.saveSetting('recent', recent),
    libraryRepository.saveSetting('playMode', playMode),
  ]).catch(() => { /* losing a bookmark must not break playback */ });
};
```

卸载时置回 `undefined`。store 全程不知道 Dexie 的存在。

**这个模式的代价要诚实说明**：`persist()` 用的是可选调用（`?.`），所以**忘记挂载 sink 不会报错，只会静默不保存**。这是真实的风险——单元测试里 store 行为完全正常，只有手动跑应用才会发现数据没落盘。收益是可测试性，代价是这个隐蔽的失败模式。

## 几个刻意的行为

### `recordPlay` 会跳过写入

```ts
recordPlay: (trackId) => set((state) => {
  const recent = addRecent(state.recent, trackId);
  // Replaying the newest entry changes nothing, so skip the write.
  if (recent[0] === state.recent[0] && recent.length === state.recent.length) return {};
  persist({ ...state, recent });
  return { recent };
}),
```

循环播放单曲时，每次重播都会调 `recordPlay`。因为 `addRecent` 对已在列表中的 id 是"提到最前"，重播最新一条的结果和原状态**完全相同**。这里判断一下并直接返回空对象，避免了一次无意义的异步写入。

`addRecent` 本身还有三条规则（`src/library/collection.ts`）：

- **重听提到最前，不新增条目** —— 所以历史读起来是"我听过的歌"，不是"我跳过多少次"
- **`'demo'` 永远不记录** —— 程序化示例曲目不是用户的音乐，不该出现在历史里
- 上限 50 条，超出截断

### 切进随机要立刻建排列

```ts
setPlayMode: (playMode) => set((state) => {
  // Entering shuffle mid-queue needs an order immediately, not at track end.
  const order = playMode === 'shuffle'
    ? state.queue?.order ?? (state.queue ? shuffledOrder(state.queue.trackIds.length) : undefined)
    : undefined;
  ...
}),
```

用户在一首歌播放到一半时切进随机模式。`queue.order` 目前只在 `advanceQueue`（曲目自然结束时）被读到，所以晚建排列并不会让任何界面显示出错——但排列属于队列状态，切换的那一刻就建好它，队列从此刻起便带着一套立即可走的排列（端到端测试 `entering shuffle gives the queue a real permutation to walk` 正是断言这一点）。

`setQueue` 同理：新建队列时若已是随机模式，立刻生成排列，这样**第一首随机曲目就是真的随机**，而不是永远从第一首开始。

### Deck 快照用不可变替换

```ts
updateDeck: (id, snapshot) => set((state) => ({ decks: { ...state.decks, [id]: snapshot } })),
```

整个 `decks` 对象被替换，而不是改 `state.decks[id]` 的字段。Zustand 靠引用比较决定是否通知订阅者——原地修改会让选择 `decks.A` 的组件收不到更新。

### 水合时会先剪枝

`App.tsx` 启动时并行读三份设置和曲库，然后：

```ts
const pruned = pruneCollection(favorites ?? [], recent ?? [], tracks.map((t) => t.id));
```

`pruneCollection` 丢掉所有已不在曲库中的 id。用户删了歌之后，收藏与历史里指向它的记录会变成坏行——启动时一次性清掉，比在每个删除路径上手动同步更不容易漏。

播放模式也会校验，未知值一律回落到 `'sequential'`（应对旧版本或手工改坏的存储）。

### 睡眠定时轮询而不是长定时器

```ts
const interval = window.setInterval(() => {
  const { sleepEndsAt, clearSleepTimer, notify: say } = useAppStore.getState();
  if (!sleepEndsAt || Date.now() < sleepEndsAt) return;
  ...
}, 1000);
```

存的是**截止时间戳**而不是"还剩多久"。每秒比对一次当前时间。

长 `setTimeout` 在标签页被挂起时不会按墙上时间推进——休眠 20 分钟后回来，定时器可能才走了几分钟。轮询时间戳则天然免疫：回来第一次 tick 就发现已经过期，立即暂停。

顺带的好处：倒计时显示直接读 `sleepEndsAt` 算差值，不需要另开一个状态来维护"剩余秒数"。

## 状态放哪：决策清单

新增状态时按这个顺序问：

1. **它每帧都变吗？** → `AppState`（并且考虑用复用对象，别每次新建）
2. **它只在会话内有效、刷新就该重置吗？** → `useAppStore`，且不接 `persist`
3. **它是界面偏好、和曲库无关吗？** → `usePreferences`（自动 localStorage）
4. **它属于曲库数据吗？** → `useAppStore` + 经 `collectionSink` 落 Dexie
5. **它必须在首帧同步读到吗？** → `localStorage`，并想清楚为什么不能异步

第 5 条容易被忽略：任何要参与首次渲染决策的东西都不能放 IndexedDB。
