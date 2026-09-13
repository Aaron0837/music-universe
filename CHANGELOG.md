# Changelog

本项目的所有值得记录的改动。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.0.0] - 2026-09-12

首个公开发布。项目建于 2026-08-27，以下汇总自建立以来的全部改动。

### Added

**播放与曲库**

- 播放模式：循环顺序 / 列表循环 / 单曲循环 / 随机播放（快捷键 `M`）。随机采用洗牌排列而非每次随机抽取，走完一轮才重新洗牌，保证每首都播到且不重复。
- 喜欢与最近播放：曲库每行的心形按钮、"只看喜欢"筛选，以及集中展示两者的「我的音乐」页。最近播放按真实播放记录排序，**重听会提到最前而不是新增一条**；删除曲目时两处自动清理。
- 睡眠定时：15 / 30 / 45 / 60 分钟，到点自动暂停两个 Deck，卡片上带倒计时。
- 播放列表：增删曲目、上移下移排序、重命名与删除；按顺序连放，一首自然播完自动接下一首（暂停、跳转、循环不触发续播）。
- 底部播放器：控制跟随当前 Deck。

**播放体验**

- 沉浸式播放大屏（点封面或按 `V` 打开，`Esc` 关闭）：封面模糊成背景光并随播放缓慢旋转，逐行歌词跟随位置居中滚动、当前行带卡拉 OK 扫光、点击任意一句跳转到该时间点。无内嵌歌词时可直接粘贴 LRC 或纯文本保存。
- 封面取色主题：正在播放的封面决定全局 `--accent` / `--accent-2`，并额外提供 `--glow` / `--tint`。切换明暗主题会**重算**配色，而不是沿用为另一种背景选的颜色。所有强调色经对比度校正（≥ 4.5:1）。
- 歌词读取：ID3v2 `USLT` / `SYLT`、Vorbis `LYRICS`、MP4 `©lyr`，**不联网抓取**。

**DJ 台**

- 双 Deck：独立波形与拍线、四个 Hot Cue、1/2/4/8 拍量化循环、倒放、EQ、滤波与效果器发送量。
- 保调变速（Key Lock）：开启后 BPM 只改变速度、不带动音高。基于 SoundTouch 的 AudioWorklet（MPL-2.0）实时处理。
- Beat Garden 音游：BPM Match、Drum Grid、Harmony 三种模式。Perfect ±80 ms / Great ±150 ms；程序化节奏练习，不修改原曲。
- Sync：置信度足够时匹配速度与拍点。

**分析**

- 后台 Worker 分析 BPM、首拍与置信度，结果缓存；支持手动修正原曲 BPM、Tap Tempo、以当前位置设为首拍。

**可视化**

- 真实 HDR 后处理管线：`EffectComposer` + `UnrealBloomPass` 泛光 + ACES 色调映射，再加一道色差 / 暗角 / 颗粒的调色 pass。泛光强度跟随响度与拍点呼吸。
- 五个原创预设：Nebula、Gravity、Bloom、Hyper Tunnel（顶点着色器生成星流）、Aurora Veil（片元着色器程序化极光）。新增预设实现 `UniversePreset`，在 `src/presets/index.ts` 注册一次。
- 低质量档位跳过整条后处理管线，保留裸渲染路径兜底。

**平台**

- 可安装的 PWA：自带 manifest、192 / 512 图标与 maskable 图标；Service Worker 预缓存应用外壳，断网也能冷启动。
- 主题：暖白 / 鼠尾草绿 / 浅蓝三套，保留深色与跟随系统。
- 大尺寸 BPM / 音量旋钮：上下拖动，`Shift` 精调，也支持键盘方向键与数字输入。
- 390px 下使用 Deck A / 音游 / Mixer / Deck B 分页。
- 全屏与焦点约束；`F` 只击打第四轨。

### Changed

- 包体瘦身：构建不再发布 sourcemap（原先 5.7 MB，占部署总量 78%），部署总量 7.34 MB → 1.62 MB；`VisualsPage` 513 KB → 23 KB。three.js 单独拆 chunk，编辑可视化不再使引擎 chunk 失效。需要调试时用 `MU_SOURCEMAPS=1 npm run build`。
- 统一换行符为 LF（`.gitattributes`），此前 `core.autocrlf=true` 会让 git 反复改写每个碰过的文件。
- 曲库数据层升级到 Dexie v3（新增歌词表），迁移保留旧曲库数据。

### Fixed

- 修复 GitHub Pages 构建环境。

### 早期里程碑

- **2026-09-03** 以 React DJ 工作站的形式重建 Music Universe。
- **2026-08-30** 音游成为 DJ 台的核心。
- **2026-08-27** 项目启动。

[Unreleased]: https://github.com/Aaron0837/music-universe/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Aaron0837/music-universe/releases/tag/v1.0.0
