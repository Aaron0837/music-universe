# 数据模型

本文描述本地数据库的结构、演进历史与设计取舍。**它同时是下一阶段扩展（Dexie v4）的起点**，末尾一节列出了当前 schema 的已知问题。

## 位置与边界

数据层只有两个文件，加起来 202 行：

| 文件 | 行数 | 角色 |
|---|---|---|
| `src/data/LibraryRepository.ts` | 24 | **端口**：纯 TypeScript 接口，无实现 |
| `src/data/WebLibraryRepository.ts` | 178 | **适配器**：Dexie / IndexedDB 实现 |

接口与实现分离的理由很实际：`src/library/collection.ts` 的规则、store 的逻辑、UI 的行为都只依赖 `LibraryRepository` 这个接口。测试里注入一个内存实现即可，不需要真的开 IndexedDB。同时它给未来的第二个后端（比如 Tauri 的文件系统实现，见 `PlatformAdapter` 的 `'web' | 'tauri'`）留好了位置。

**数据层不 import React 或任何 store。** 它不认识 UI。

## 表结构

八个表，`MusicDatabase extends Dexie`：

| 表 | 主键 | 索引 | 存什么 |
|---|---|---|---|
| `tracks` | `id` | `title, artist, album, addedAt, bpm` | 曲目元数据 + 封面 `Blob`（**不含**音频） |
| `audioBlobs` | `trackId` | — | 原始音频 `Blob` |
| `artworks` | `trackId` | — | 封面图 `Blob` |
| `playlists` | `id` | `name, createdAt` | 歌单与曲目 id 数组 |
| `waveforms` | `trackId` | — | 768 点波形峰值 `Float32Array` |
| `analyses` | `trackId` | `version` | 拍点网格 |
| `settings` | `key` | — | 小而杂的持久化偏好 |
| `lyrics` | `trackId` | — | 歌词纯文本 |

### 为什么把数据切得这么碎

**音频不在 `tracks` 表里，但封面在。** `Track` 类型（`src/types/models.ts`）不含音频字段，却带着 `artwork?: Blob`。`importFiles` 构造的 `track` 对象连同封面一起被 `tracks.add(track)` 写入，所以每条 `tracks` 记录里都挂着一个封面 `Blob`；同一张封面又被单独存进 `artworks` 表。

只有音频真正分开了：需要完整对象时由 `getTrack()` 把 `audioBlobs` 拼上去，得到 `StoredTrack`。

**这个例外有实际代价**：`listTracks()` 读的是完整的 `tracks` 行，因此每次启动与每次导入都会把所有封面 `Blob` 读进内存——封面本可以是"只在需要时读"的数据，现在不是；而且它同时被存了两份。详见下文「当前 schema 的已知问题」。

**歌词单独一张表则是有意为之且成立**：歌词文本可能很长（整首 LRC），而只有极少数曲目有歌词。`Track.hasLyrics` 是一个布尔摘要，`importFiles` 与 `saveLyrics` 都会同步写入——但它目前**没有任何读取者**（见下文「尚未处理的问题」第 5 条——它被有意保留，判断依据是"有没有写入者"而非"有没有读取者"）。

**`waveforms` 与 `analyses` 也分开了。** 两者由同一次分析产生，但消费方式不同：波形每个渲染帧都要读（画在 Deck 上），拍点网格只在播放与 Sync 时读。分开存让热点路径只碰小数据。

## 版本演进

```ts
this.version(1).stores({
  tracks: 'id, title, artist, album, addedAt, bpm',
  audioBlobs: 'trackId',
  artworks: 'trackId',
  playlists: 'id, name, createdAt',
  waveforms: 'trackId',
  analyses: 'trackId, version',
  settings: 'key',
});
this.version(2).stores({ analyses: 'trackId, version' }).upgrade(async (transaction) => {
  await transaction.table('analyses').toCollection().modify((record) => { record.version = 0; });
});
this.version(3).stores({ lyrics: 'trackId' });
this.version(4).stores({
  tracks: 'id, addedAt',
  playlists: 'id, createdAt',
  analyses: 'trackId',
});
```

### v1 → v2：标记失效，而不是删除

v2 引入拍点格式版本号。已有的分析记录没有这个字段，直接读取会得到 `undefined`。

处理方式不是删表重建，而是**把旧记录标成 `version = 0`**：

```ts
await transaction.table('analyses').toCollection().modify((record) => { record.version = 0; });
```

而读取端只认 `version === 1`：

```ts
return analysis?.version === 1 && waveform ? { grid: analysis.grid, peaks: waveform.peaks } : undefined;
```

于是旧记录被**忽略而不是销毁**——下次播放这首歌会自动重新分析并写回 v1。用户的曲库、音频、封面、歌单全都没动。

这个模式值得沿用：**迁移只标记，不批量重算**。批量重算要遍历全部记录并在迁移事务里做重活，慢且危险；标记失效把成本摊到每首歌第一次被播放时。

### v2 → v3：纯新增

v3 只加了一张 `lyrics` 表，不需要 `upgrade` 回调——Dexie 会直接建表，已有数据不受影响。

### v3 → v4：去掉从未被查询的索引

v4 删掉了六个从未被查询的索引：`tracks` 的 `title` / `artist` / `album` / `bpm`，`playlists` 的 `name`，以及 `analyses` 的 `version`。

它们是按"将来要做字段搜索"的设想声明的，但那个搜索从未实现——曲库页的搜索、排序与筛选全部在内存里对已加载的数组做（`src/pages/LibraryPage.tsx` 的 `useMemo`）。而 IndexedDB 在每次 `add` / `put` 时都要维护每一个索引，所以这几个索引从第一天起就是纯粹的写入开销。

`analyses.version` 尤其容易误判：它确实存在，但只作为**字段**被读取（`getAnalysis` 检查 `version === 1`），从不作为查询键。**字段保留，只去掉索引。**

不加 `upgrade()` 回调——移除索引不涉及任何数据变换，曲目、音频、封面、歌单、设置一律不动。

这次改动由 `src/data/WebLibraryRepository.test.ts` 的 v3→v4 迁移测试守着：它用**历史 schema** 建库并写入数据，再用当前 schema 打开，断言数据完整且 `verno` 已到 4。该测试经过反向验证——把 v4 的 `tracks` 改成会删表的声明时它确实失败，不是空转的。

## 写入路径的边界条件

### 单文件 100 MB 上限

`importFiles()` 逐个文件检查，超限的文件被记入 `failures` 而**不会中断整批**（见下节）。这是**防浏览器解码崩掉**，不是磁盘限制：`decodeAudioData` 对超大文件会耗掉大量内存且可能直接失败。

### 配额 90% 预检

```ts
const estimate = await this.storage();
if (estimate.quota > 0 && estimate.usage + file.size > estimate.quota * 0.9) {
  throw new Error(`存储空间不足，无法导入 ${file.name}`);
}
```

留 10% 余量而不是贴边走。`quota > 0` 的判断是因为部分浏览器（尤其是隐私模式）返回 0 或干脆不实现 `navigator.storage.estimate`——那种情况下检查会被跳过，而不是永远失败。

### 每首歌一个事务

`importFiles` 对每个文件开一个 `readwrite` 事务，写入 `tracks` + `audioBlobs` + 条件写入 `artworks`、`lyrics`。

逐文件而非整批一个事务，是为了让导入 50 首歌时前 30 首已落盘可见——中途关掉页面不至于全部丢失。

### 单文件失败不中断整批

`importFiles` 返回 `ImportOutcome` 而不是抛错：

```ts
interface ImportOutcome {
  imported: Track[];
  failures: Array<{ name: string; reason: string }>;
}
```

逐文件的失败被**收集**——5 首里有 1 首是坏文件，另外 4 首不该陪葬。只有基础设施故障（数据库被关闭）才会穿过这个方法抛出去。

调用方拿到结果后**无论如何都要刷新曲库列表**，再根据 `failures` 给出聚合提示。这一条是刻意的：早先的实现里任何一首失败都直接抛错，调用方跳进 catch 分支、跳过刷新，于是**已经落盘的曲目在 UI 上完全不可见**，直到用户切个页面回来才突然出现。

### 删除是级联的

`removeTrack()` 在单个事务里清掉该曲目在**六张表**上的全部痕迹：`tracks`、`audioBlobs`、`artworks`、`waveforms`、`analyses`、`lyrics`。

漏掉任何一张都会留下孤儿记录。删曲目后 `App.tsx` 还会调 `pruneCollection()` 清掉收藏与历史里的 id——但那是另一层（`settings` 表），不在这个事务里。

## 保存是 fire-and-forget

收藏、历史、播放模式存在 `settings` 表，写入路径刻意**不阻塞播放**：

```ts
collectionSink.save = (favorites, recent, playMode) => {
  void Promise.all([...]).catch(() => { /* losing a bookmark must not break playback */ });
};
```

点收藏心形时不会 `await` 写入。代价写在 [README 的使用边界](../../README.md#使用边界)里：刚点完就强制刷新，极少数情况下可能抢先于写入。这是明确接受的取舍——**一个书签不该有能力卡住音乐**。

## 尚未处理的问题

以下是读代码时发现的、**还没动**的事项。已处理的列在文末。

### 1. 封面被存了两份，且列曲库时全量读入

`importFiles` 把同一张封面写进两个地方：`tracks` 行内的 `artwork` 字段，以及独立的 `artworks` 表。两者是同一个 `Blob`。

更实际的代价在读侧：`listTracks()` 读的是完整的 `tracks` 行，所以**每次应用启动、每次导入之后，所有封面都会被读进内存**——尽管大部分封面当下并不需要显示。曲库有 500 首带封面的歌、每张 200 KB，就是约 100 MB 的无谓读取。

要么把 `artwork` 从 `Track` 里去掉、只留 `artworks` 表（列表用轻量投影），要么接受重复但让 `listTracks()` 只取需要的字段。这是曲库规模化绕不开的一项。

### 2. 没有导入 / 导出

整个曲库锁在浏览器的 IndexedDB 里。清一次站点数据就全没了，换浏览器也无法迁移。README 把"导入导出"列在局限里——考虑到"数据完全属于用户"是这个项目的核心主张，**这可能是最值得补的一块**。

已定的方向：先做**仅元数据**的 JSON 导出（曲目元数据、歌单、收藏、历史、设置），不含音频；换设备后可导入重建曲库，音频重新选文件即可。

### 3. 没有批量操作的接口

`LibraryRepository` 的方法都是单曲目粒度（`getTrack` / `removeTrack` / `saveAnalysis`）。批量删除、批量重新分析、批量打标签在 UI 上没法做，因为接口层就没有。

### 4. `settings` 表没有命名空间

所有偏好平铺在一张 `key` 主键的表里：`'favorites'`、`'recent'`、`'playMode'`。键名冲突全靠约定。往库里加设置项时如果不加前缀或分区，迟早会撞——与导入导出一起做更自然。

### 5. `hasLyrics` 仍然没有消费者

`Track.hasLyrics` 被 `importFiles` 与 `saveLyrics` **正确维护**（每次保存歌词都会同步翻转它），但唯一的读取者是 `tests/lyrics.spec.ts` 的断言——没有任何 UI 消费它。

它被**有意保留**：这是一个有真实语义的字段，删除会丢信息，而它的写入与歌词写入同事务、成本可忽略。曲库列表加一个歌词角标就是它自然的消费者，只是还没做。

> 判断一个字段该不该删，依据是**有没有写入者**，而不是有没有读取者。`musicalKey` 两者都没有，所以已删除；`hasLyrics` 有写入者、只缺消费者，所以保留并在此说明——既不假装它有消费者，也不假装它是死代码。

## 已解决

| 事项 | 处置 |
|---|---|
| 六个索引声明了但从未被查询 | **v4 移除**。详见上文「v3 → v4」——它们从第一天起就是纯粹的写入开销，因为字段搜索从未实现。 |
| `Track.musicalKey` 与 `AnalysisRecord.musicalKey` | **已删除**。两处类型声明，全仓库零写入者。已存行里可能残留该字段，但多余字段无害，不需要迁移。 |
| 批量导入半途失败留下"看不见的曲目" | **已修复**。`importFiles` 改为返回 `ImportOutcome`，逐文件失败被收集而非抛出；调用方无论如何都刷新列表。详见上文「单文件失败不中断整批」。 |
| 数据层零单元测试 | **已补齐**。`src/data/WebLibraryRepository.test.ts` 覆盖设置、歌单、歌词、分析缓存、删除级联、导入失败聚合与 v3→v4 迁移。 |
